using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmissionApi.Data;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Models;

namespace SchoolAdmissionApi.Services;

public class AdmissionService
{
    private const string HeldStatus = "HELD";
    private const string ConfirmedStatus = "CONFIRMED";
    private const string ExpiredStatus = "EXPIRED";
    private const string CancelledStatus = "CANCELLED";

    private readonly AppDbContext _dbContext;
    private readonly IConfiguration _configuration;

    public AdmissionService(AppDbContext dbContext, IConfiguration configuration)
    {
        _dbContext = dbContext;
        _configuration = configuration;
    }

    private int GetHoldDurationSeconds()
    {
        var envValue = Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS");
        if (!string.IsNullOrWhiteSpace(envValue) &&
            int.TryParse(envValue, out var parsed) &&
            parsed > 0)
        {
            return parsed;
        }

        var configured = _configuration.GetValue<int?>("HOLD_DURATION_SECONDS") ?? 600;
        return configured > 0 ? configured : 600;
    }

    public async Task<ClassResponse?> GetClassByIdAsync(Guid classId)
    {
        var schoolClass = await _dbContext.Classes
            .Include(c => c.Holds)
            .FirstOrDefaultAsync(c => c.Id == classId);

        return schoolClass == null ? null : MapToClassResponse(schoolClass);
    }

    public async Task<List<ClassResponse>> GetAllClassesAsync()
    {
        var classes = await _dbContext.Classes
            .Include(c => c.Holds)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

        return classes.Select(MapToClassResponse).ToList();
    }

    public async Task<ClassResponse> CreateClassAsync(CreateClassRequest request)
    {
        var schoolClass = new SchoolClass
        {
            Name = request.Name.Trim(),
            TotalSeats = request.TotalSeats
        };

        _dbContext.Classes.Add(schoolClass);
        await _dbContext.SaveChangesAsync();

        return MapToClassResponse(schoolClass);
    }

    public async Task<(HoldResponse? Hold, string? Error, int StatusCode)> CreateHoldAsync(
        Guid classId,
        string studentId)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();
        try
        {
            // Lock the class row for the whole transaction. Every process using this
            // database must acquire the same lock before checking/inserting holds, so
            // held + confirmed can never exceed totalSeats even with multiple API processes.
            //
            // ToListAsync is intentional: composing FirstOrDefaultAsync on a query that
            // already ends in "FOR UPDATE" can append LIMIT after FOR UPDATE (invalid SQL).
            var schoolClass = (await _dbContext.Classes
                    .FromSqlInterpolated($"SELECT * FROM \"Classes\" WHERE \"Id\" = {classId} FOR UPDATE")
                    .ToListAsync())
                .FirstOrDefault();

            if (schoolClass == null)
            {
                return (null, "Class not found.", 404);
            }

            var now = DateTime.UtcNow;

            // Expired holds do not reserve a seat. Also move them to EXPIRED now so the
            // partial unique index does not block this student from applying again.
            await _dbContext.Holds
                .Where(h => h.ClassId == classId &&
                            h.Status == HeldStatus &&
                            h.ExpiresAt <= now)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(h => h.Status, ExpiredStatus));

            var hasActiveApplication = await _dbContext.Holds
                .AnyAsync(h => h.ClassId == classId &&
                               h.StudentId == studentId &&
                               (h.Status == ConfirmedStatus ||
                                (h.Status == HeldStatus && h.ExpiresAt > now)));

            if (hasActiveApplication)
            {
                return (null,
                    "You already have an active application or confirmed admission for this class.",
                    409);
            }

            var heldSeats = await _dbContext.Holds
                .CountAsync(h => h.ClassId == classId &&
                                 h.Status == HeldStatus &&
                                 h.ExpiresAt > now);

            var confirmedSeats = await _dbContext.Holds
                .CountAsync(h => h.ClassId == classId &&
                                 h.Status == ConfirmedStatus);

            if (heldSeats + confirmedSeats >= schoolClass.TotalSeats)
            {
                return (null, "No seats are available for this class.", 409);
            }

            var hold = new AdmissionHold
            {
                ClassId = classId,
                StudentId = studentId,
                Status = HeldStatus,
                ExpiresAt = now.AddSeconds(GetHoldDurationSeconds()),
                CreatedAt = now
            };

            _dbContext.Holds.Add(hold);
            await _dbContext.SaveChangesAsync();
            await transaction.CommitAsync();

            hold.Class = schoolClass;
            return (MapToHoldResponse(hold), null, 201);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            await transaction.RollbackAsync();
            return (null,
                "You already have an active application or confirmed admission for this class.",
                409);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<(HoldResponse? Hold, string? Error, int StatusCode)> GetHoldByIdAsync(Guid holdId)
    {
        var hold = await _dbContext.Holds
            .Include(h => h.Class)
            .FirstOrDefaultAsync(h => h.Id == holdId);

        if (hold == null)
        {
            return (null, "Application not found.", 404);
        }

        // Do not write here. The response mapper reports an overdue HELD row as
        // EXPIRED, and the background worker persists that transition. Writing
        // from a read could overwrite a concurrent confirmation.
        return (MapToHoldResponse(hold), null, 200);
    }

    public async Task<(HoldResponse? Hold, string? Error, int StatusCode)> ConfirmHoldAsync(
        Guid holdId,
        string studentId)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();
        try
        {
            // Lock the application row so confirm/cancel/expiry cannot race each other.
            // ToListAsync keeps the exact "FOR UPDATE" query; see CreateHoldAsync.
            var hold = (await _dbContext.Holds
                    .FromSqlInterpolated($"SELECT * FROM \"Holds\" WHERE \"Id\" = {holdId} FOR UPDATE")
                    .ToListAsync())
                .FirstOrDefault();

            if (hold == null)
            {
                return (null, "Application not found.", 404);
            }

            hold.Class = await _dbContext.Classes
                .FirstOrDefaultAsync(c => c.Id == hold.ClassId) ?? hold.Class;

            if (!string.Equals(hold.StudentId, studentId, StringComparison.Ordinal))
            {
                return (null, "This application belongs to a different student.", 403);
            }

            if (hold.Status == ConfirmedStatus)
            {
                // Idempotent: repeated payment confirmation must not add another seat.
                await transaction.CommitAsync();
                return (MapToHoldResponse(hold), null, 200);
            }

            if (hold.Status == CancelledStatus)
            {
                return (null, "This application was cancelled and cannot be confirmed.", 409);
            }

            var now = DateTime.UtcNow;
            if (hold.Status == ExpiredStatus ||
                (hold.Status == HeldStatus && hold.ExpiresAt <= now))
            {
                hold.Status = ExpiredStatus;
                await _dbContext.SaveChangesAsync();
                await transaction.CommitAsync();
                return (null, "This application has expired and cannot be confirmed.", 409);
            }

            if (hold.Status != HeldStatus)
            {
                return (null, "This application cannot be confirmed in its current state.", 409);
            }

            hold.Status = ConfirmedStatus;
            hold.ConfirmedAt = now;

            await _dbContext.SaveChangesAsync();
            await transaction.CommitAsync();

            return (MapToHoldResponse(hold), null, 200);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<(HoldResponse? Hold, string? Error, int StatusCode)> CancelHoldAsync(
        Guid holdId,
        string studentId)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();
        try
        {
            var hold = (await _dbContext.Holds
                    .FromSqlInterpolated($"SELECT * FROM \"Holds\" WHERE \"Id\" = {holdId} FOR UPDATE")
                    .ToListAsync())
                .FirstOrDefault();

            if (hold == null)
            {
                return (null, "Application not found.", 404);
            }

            hold.Class = await _dbContext.Classes
                .FirstOrDefaultAsync(c => c.Id == hold.ClassId) ?? hold.Class;

            if (!string.Equals(hold.StudentId, studentId, StringComparison.Ordinal))
            {
                return (null, "This application belongs to a different student.", 403);
            }

            if (hold.Status == ConfirmedStatus)
            {
                return (null, "A confirmed admission cannot be cancelled.", 409);
            }

            if (hold.Status == CancelledStatus)
            {
                // DELETE is idempotent.
                await transaction.CommitAsync();
                return (MapToHoldResponse(hold), null, 204);
            }

            if (hold.Status == ExpiredStatus ||
                (hold.Status == HeldStatus && hold.ExpiresAt <= DateTime.UtcNow))
            {
                if (hold.Status != ExpiredStatus)
                {
                    hold.Status = ExpiredStatus;
                    await _dbContext.SaveChangesAsync();
                    await transaction.CommitAsync();
                }
                else
                {
                    await transaction.CommitAsync();
                }

                return (null, "This application has already expired.", 409);
            }

            hold.Status = CancelledStatus;
            await _dbContext.SaveChangesAsync();
            await transaction.CommitAsync();

            return (MapToHoldResponse(hold), null, 204);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<List<HoldResponse>> GetStudentHoldsAsync(string studentId)
    {
        var holds = await _dbContext.Holds
            .Include(h => h.Class)
            .Where(h => h.StudentId == studentId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();

        // MapToHoldResponse reports overdue HELD rows as EXPIRED without writing.
        // The background worker persists the transition, so a read cannot race a
        // concurrent confirmation and overwrite it.
        return holds.Select(MapToHoldResponse).ToList();
    }

    private static ClassResponse MapToClassResponse(SchoolClass schoolClass)
    {
        var now = DateTime.UtcNow;
        var heldSeats = schoolClass.Holds.Count(h => h.Status == HeldStatus && h.ExpiresAt > now);
        var confirmedSeats = schoolClass.Holds.Count(h => h.Status == ConfirmedStatus);

        return new ClassResponse
        {
            Id = schoolClass.Id,
            Name = schoolClass.Name,
            TotalSeats = schoolClass.TotalSeats,
            HeldSeats = heldSeats,
            ConfirmedSeats = confirmedSeats,
            AvailableSeats = Math.Max(0, schoolClass.TotalSeats - (heldSeats + confirmedSeats)),
            CreatedAt = schoolClass.CreatedAt
        };
    }

    private static HoldResponse MapToHoldResponse(AdmissionHold hold)
    {
        var status = hold.Status;
        if (status == HeldStatus && hold.ExpiresAt <= DateTime.UtcNow)
        {
            status = ExpiredStatus;
        }

        return new HoldResponse
        {
            HoldId = hold.Id,
            ClassId = hold.ClassId,
            ClassName = hold.Class?.Name ?? string.Empty,
            StudentId = hold.StudentId,
            Status = status,
            ExpiresAt = hold.ExpiresAt,
            CreatedAt = hold.CreatedAt,
            ConfirmedAt = hold.ConfirmedAt
        };
    }

    private static bool IsUniqueViolation(Exception? exception)
    {
        while (exception != null)
        {
            if (exception is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                return true;
            }

            exception = exception.InnerException;
        }

        return false;
    }
}
