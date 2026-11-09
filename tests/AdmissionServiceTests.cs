using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SchoolAdmissionApi.Data;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Services;
using Xunit;

namespace SchoolAdmissionApi.Tests;

public class AdmissionServiceTests
{
    private static string ConnectionString =>
        Environment.GetEnvironmentVariable("TEST_DB_CONNECTION")
        ?? "Host=localhost;Port=5432;Database=school_admission_test;Username=myuser;Password=mysecretpassword;";

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;

        return new AppDbContext(options);
    }

    private static AppDbContext CreateFreshDatabase()
    {
        var context = CreateContext();
        context.Database.EnsureDeleted();
        context.Database.EnsureCreated();
        return context;
    }

    private static IConfiguration CreateConfiguration(int holdDurationSeconds = 600)
    {
        var values = new Dictionary<string, string?>
        {
            ["HOLD_DURATION_SECONDS"] = holdDurationSeconds.ToString()
        };

        return new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
    }

    // Test 1: Creating a class starts with zero held/confirmed seats.
    [Fact]
    public async Task CreateClass_InitializesCorrectSeatCounts()
    {
        using var dbContext = CreateFreshDatabase();
        var service = new AdmissionService(dbContext, CreateConfiguration());

        var response = await service.CreateClassAsync(new CreateClassRequest
        {
            Name = "Class 6 - Morning Shift",
            TotalSeats = 50
        });

        Assert.NotEqual(Guid.Empty, response.Id);
        Assert.Equal("Class 6 - Morning Shift", response.Name);
        Assert.Equal(50, response.TotalSeats);
        Assert.Equal(0, response.HeldSeats);
        Assert.Equal(0, response.ConfirmedSeats);
        Assert.Equal(50, response.AvailableSeats);
    }

    // Test 2: Confirmation is idempotent and only counts once.
    [Fact]
    public async Task ConfirmHold_IsIdempotent_DoesNotIncreaseCountOnMultipleCalls()
    {
        using var dbContext = CreateFreshDatabase();
        var service = new AdmissionService(dbContext, CreateConfiguration());

        var schoolClass = await service.CreateClassAsync(
            new CreateClassRequest { Name = "Class 7", TotalSeats = 10 });
        var (hold, _, createStatus) = await service.CreateHoldAsync(schoolClass.Id, "STU_1001");

        Assert.Equal(201, createStatus);
        Assert.NotNull(hold);
        Assert.Equal("HELD", hold.Status);

        var (firstConfirm, _, firstStatus) = await service.ConfirmHoldAsync(hold!.HoldId, "STU_1001");
        Assert.Equal(200, firstStatus);
        Assert.Equal("CONFIRMED", firstConfirm!.Status);

        var (secondConfirm, _, secondStatus) = await service.ConfirmHoldAsync(hold.HoldId, "STU_1001");
        Assert.Equal(200, secondStatus);
        Assert.Equal("CONFIRMED", secondConfirm!.Status);

        var updatedClass = await service.GetClassByIdAsync(schoolClass.Id);
        Assert.Equal(1, updatedClass!.ConfirmedSeats);
        Assert.Equal(0, updatedClass.HeldSeats);
        Assert.Equal(9, updatedClass.AvailableSeats);
    }

    // Test 3: Concurrency test. 20 simultaneous applications for 5 seats must
    // produce exactly 5 holds and never overbook the class.
    [Fact]
    public async Task CreateHold_ConcurrentRequests_NeverExceedsTotalSeats()
    {
        using var setupContext = CreateFreshDatabase();
        var config = CreateConfiguration();
        var setupService = new AdmissionService(setupContext, config);

        const int totalSeats = 5;
        const int concurrentUsers = 20;

        var schoolClass = await setupService.CreateClassAsync(new CreateClassRequest
        {
            Name = "Limited Class",
            TotalSeats = totalSeats
        });

        var tasks = Enumerable.Range(1, concurrentUsers).Select(async index =>
        {
            // Separate DbContext per task simulates separate HTTP requests/processes.
            using var dbContext = CreateContext();
            var service = new AdmissionService(dbContext, config);
            return await service.CreateHoldAsync(schoolClass.Id, $"STU_CONCURRENT_{index}");
        });

        var results = await Task.WhenAll(tasks);

        Assert.Equal(totalSeats, results.Count(result => result.StatusCode == 201));
        Assert.Equal(concurrentUsers - totalSeats, results.Count(result => result.StatusCode == 409));

        var finalState = await setupService.GetClassByIdAsync(schoolClass.Id);
        Assert.Equal(totalSeats, finalState!.HeldSeats);
        Assert.Equal(0, finalState.AvailableSeats);
    }

    // Test 4: An expired hold cannot be confirmed, its seat is released, and the
    // same student can apply again (the expired row must not trip the unique index).
    [Fact]
    public async Task ExpiredHold_CannotBeConfirmed_AndSeatIsReleased()
    {
        using var dbContext = CreateFreshDatabase();
        var service = new AdmissionService(dbContext, CreateConfiguration());

        var schoolClass = await service.CreateClassAsync(
            new CreateClassRequest { Name = "Class 8", TotalSeats = 2 });
        var (hold, _, createStatus) = await service.CreateHoldAsync(schoolClass.Id, "STU_EXPIRED");

        Assert.Equal(201, createStatus);
        Assert.NotNull(hold);

        var storedHold = await dbContext.Holds.SingleAsync(h => h.Id == hold!.HoldId);
        storedHold.ExpiresAt = DateTime.UtcNow.AddSeconds(-1);
        await dbContext.SaveChangesAsync();

        var (confirmed, error, confirmStatus) =
            await service.ConfirmHoldAsync(hold!.HoldId, "STU_EXPIRED");

        Assert.Null(confirmed);
        Assert.NotNull(error);
        Assert.Equal(409, confirmStatus);

        var classAfter = await service.GetClassByIdAsync(schoolClass.Id);
        Assert.Equal(0, classAfter!.HeldSeats);
        Assert.Equal(2, classAfter.AvailableSeats);

        var (newHold, _, newStatus) = await service.CreateHoldAsync(schoolClass.Id, "STU_EXPIRED");
        Assert.Equal(201, newStatus);
        Assert.NotNull(newHold);
        Assert.NotEqual(hold.HoldId, newHold!.HoldId);
    }

    // Test 5: One active/confirmed application per student per class.
    [Fact]
    public async Task Student_CannotHaveTwoActiveApplicationsForTheSameClass()
    {
        using var dbContext = CreateFreshDatabase();
        var service = new AdmissionService(dbContext, CreateConfiguration());

        var schoolClass = await service.CreateClassAsync(
            new CreateClassRequest { Name = "Class 9", TotalSeats = 5 });

        var (firstHold, _, firstStatus) = await service.CreateHoldAsync(schoolClass.Id, "STU_DUPLICATE");
        Assert.Equal(201, firstStatus);

        var (duplicateHold, duplicateError, duplicateStatus) =
            await service.CreateHoldAsync(schoolClass.Id, "STU_DUPLICATE");
        Assert.Equal(409, duplicateStatus);
        Assert.Null(duplicateHold);
        Assert.NotNull(duplicateError);

        var (_, _, confirmStatus) = await service.ConfirmHoldAsync(firstHold!.HoldId, "STU_DUPLICATE");
        Assert.Equal(200, confirmStatus);

        var (_, _, afterConfirmStatus) =
            await service.CreateHoldAsync(schoolClass.Id, "STU_DUPLICATE");
        Assert.Equal(409, afterConfirmStatus);

        var (otherHold, _, otherStatus) =
            await service.CreateHoldAsync(schoolClass.Id, "STU_OTHER");
        Assert.Equal(201, otherStatus);
        Assert.NotNull(otherHold);
    }
}
