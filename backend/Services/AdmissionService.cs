using Microsoft.EntityFrameworkCore;
using SchoolAdmissionApi.Data;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Models;

namespace SchoolAdmissionApi.Services;

public class AdmissionService
{
    private readonly AppDbContext _dbContext;
    private readonly IConfiguration _configuration;

    public AdmissionService(AppDbContext dbContext, IConfiguration configuration)
    {
        _dbContext = dbContext;
        _configuration = configuration;
    }

    private int GetHoldDurationSeconds()
    {
        var envVal = Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS");
        if (!string.IsNullOrEmpty(envVal) && int.TryParse(envVal, out var parsed))
        {
            return parsed;
        }
        return _configuration.GetValue<int>("HOLD_DURATION_SECONDS", 600);
    }

    public async Task<ClassResponse?> GetClassByIdAsync(Guid classId)
    {
        var schoolClass = await _dbContext.Classes
            .Include(c => c.Holds)
            .FirstOrDefaultAsync(c => c.Id == classId);

        if (schoolClass == null) return null;

        return MapToClassResponse(schoolClass);
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
            Name = request.Name,
            TotalSeats = request.TotalSeats
        };

        _dbContext.Classes.Add(schoolClass);
        await _dbContext.SaveChangesAsync();

        return MapToClassResponse(schoolClass);
    }

    public async Task<(HoldResponse? Hold, string? Error, int StatusCode)> CreateHoldAsync(Guid classId, string studentId)
    {
        using var transaction = await _dbContext.Database.BeginTransactionAsync();
        try
        {
            var schoolClass = await _dbContext.Classes
                .FromSqlInterpolated($"SELECT * FROM \"Classes\" WHERE \"Id\" = {classId} FOR UPDATE")
                .FirstOrDefaultAsync();

            if (schoolClass == null)
            {
                return (null, "Class not found.", 404);
            }

            var now = DateTime.UtcNow;

            var existingActiveHold = await _dbContext.Holds
                .AnyAsync(h => h.ClassId == classId && 
                               h.StudentId == studentId && 
                               (h.Status == "CONFIRMED" || (h.Status == "HELD" && h.ExpiresAt > now)));

            if (existingActiveHold)
            {
                return (null, "Student already has an active reservation or confirmed seat for this class.", 409);
            }

            var activeHeldCount = await _dbContext.Holds
                .CountAsync(h => h.ClassId == classId && h.Status == "HELD" && h.ExpiresAt > now);

            var confirmedCount = await _dbContext.Holds
                .CountAsync(h => h.ClassId == classId && h.Status == "CONFIRMED");

            if (activeHeldCount + confirmedCount >= schoolClass.TotalSeats)
            {
                return (null, "No seats available for this class.", 409);
            }

            var durationSeconds = GetHoldDurationSeconds();
            var hold = new AdmissionHold
            {
                ClassId = classId,
                StudentId = studentId,
                Status = "HELD",
                ExpiresAt = now.AddSeconds(durationSeconds),
                CreatedAt = now
            };

            _dbContext.Holds.Add(hold);
            await _dbContext.SaveChangesAsync();
            await transaction.CommitAsync();

            hold.Class = schoolClass;
            return (MapToHoldResponse(hold), null, 201);
        }
        catch (Exception)
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

        if (hold == null) return (null, "Reservation not found.", 404);

        if (hold.Status == "HELD" && hold.ExpiresAt <= DateTime.UtcNow)
        {
            hold.Status = "EXPIRED";
            await _dbContext.SaveChangesAsync();
        }

        return (MapToHoldResponse(hold), null, 200);
    }

    public async Task<(HoldResponse? Hold, string? Error, int StatusCode)> ConfirmHoldAsync(Guid holdId, string studentId)
    {
        using var transaction = await _dbContext.Database.BeginTransactionAsync();
        try
        {
            var hold = await _dbContext.Holds
                .FromSqlInterpolated($"SELECT * FROM \"Holds\" WHERE \"Id\" = {holdId} FOR UPDATE")
                .Include(h => h.Class)
                .FirstOrDefaultAsync();

            if (hold == null) return (null, "Reservation not found.", 404);

            if (hold.StudentId != studentId)
            {
                return (null, "Student ID mismatch.", 403);
            }

            if (hold.Status == "CONFIRMED")
            {
                await transaction.CommitAsync();
                return (MapToHoldResponse(hold), null, 200);
            }

            var now = DateTime.UtcNow;
            if (hold.Status == "EXPIRED" || (hold.Status == "HELD" && hold.ExpiresAt <= now))
            {
                hold.Status = "EXPIRED";
                await _dbContext.SaveChangesAsync();
                await transaction.CommitAsync();
                return (null, "Reservation has expired and cannot be confirmed.", 409);
            }

            if (hold.Status == "CANCELLED")
            {
                return (null, "Reservation was cancelled.", 409);
            }

            hold.Status = "CONFIRMED";
            hold.ConfirmedAt = now;

            await _dbContext.SaveChangesAsync();
            await transaction.CommitAsync();

            return (MapToHoldResponse(hold), null, 200);
        }
        catch (Exception)
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<(HoldResponse? Hold, string? Error, int StatusCode)> CancelHoldAsync(Guid holdId, string studentId)
    {
        var hold = await _dbContext.Holds
            .Include(h => h.Class)
            .FirstOrDefaultAsync(h => h.Id == holdId);

        if (hold == null) return (null, "Reservation not found.", 404);

        if (hold.StudentId != studentId)
        {
            return (null, "Student ID mismatch.", 403);
        }

        if (hold.Status == "CONFIRMED")
        {
            return (null, "Cannot cancel a confirmed admission.", 400);
        }

        hold.Status = "CANCELLED";
        await _dbContext.SaveChangesAsync();

        return (MapToHoldResponse(hold), null, 200);
    }

    public async Task<List<HoldResponse>> GetStudentHoldsAsync(string studentId)
    {
        var now = DateTime.UtcNow;
        var holds = await _dbContext.Holds
            .Include(h => h.Class)
            .Where(h => h.StudentId == studentId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();

        var modified = false;
        foreach (var hold in holds)
        {
            if (hold.Status == "HELD" && hold.ExpiresAt <= now)
            {
                hold.Status = "EXPIRED";
                modified = true;
            }
        }

        if (modified)
        {
            await _dbContext.SaveChangesAsync();
        }

        return holds.Select(MapToHoldResponse).ToList();
    }

    private static ClassResponse MapToClassResponse(SchoolClass c)
    {
        var now = DateTime.UtcNow;
        var heldSeats = c.Holds.Count(h => h.Status == "HELD" && h.ExpiresAt > now);
        var confirmedSeats = c.Holds.Count(h => h.Status == "CONFIRMED");
        var availableSeats = Math.Max(0, c.TotalSeats - (heldSeats + confirmedSeats));

        return new ClassResponse
        {
            Id = c.Id,
            Name = c.Name,
            TotalSeats = c.TotalSeats,
            HeldSeats = heldSeats,
            ConfirmedSeats = confirmedSeats,
            AvailableSeats = availableSeats,
            CreatedAt = c.CreatedAt
        };
    }

    private static HoldResponse MapToHoldResponse(AdmissionHold h)
    {
        var status = h.Status;
        if (status == "HELD" && h.ExpiresAt <= DateTime.UtcNow)
        {
            status = "EXPIRED";
        }

        return new HoldResponse
        {
            HoldId = h.Id,
            ClassId = h.ClassId,
            ClassName = h.Class?.Name ?? string.Empty,
            StudentId = h.StudentId,
            Status = status,
            ExpiresAt = h.ExpiresAt,
            CreatedAt = h.CreatedAt,
            ConfirmedAt = h.ConfirmedAt
        };
    }
}