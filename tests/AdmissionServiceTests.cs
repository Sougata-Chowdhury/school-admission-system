using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SchoolAdmissionApi.Data;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Services;
using Xunit;

namespace SchoolAdmissionApi.Tests;

public class AdmissionServiceTests
{
    private AppDbContext CreateTestDbContext()
    {
        var connectionString = "Host=localhost;Port=5432;Database=school_admission_test;Username=myuser;Password=mysecretpassword;";
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        var context = new AppDbContext(options);
        context.Database.EnsureDeleted();
        context.Database.EnsureCreated();
        return context;
    }

    private IConfiguration CreateConfiguration()
    {
        var myConfig = new Dictionary<string, string?>
        {
            {"HOLD_DURATION_SECONDS", "600"}
        };
        return new ConfigurationBuilder().AddInMemoryCollection(myConfig).Build();
    }

    // Test 1: Class creation initializes zero held and zero confirmed seats
    [Fact]
    public async Task CreateClass_InitializesCorrectSeatCounts()
    {
        using var dbContext = CreateTestDbContext();
        var config = CreateConfiguration();
        var service = new AdmissionService(dbContext, config);

        var request = new CreateClassRequest
        {
            Name = "Class 6 – Morning",
            TotalSeats = 50
        };

        var response = await service.CreateClassAsync(request);

        Assert.NotEqual(Guid.Empty, response.Id);
        Assert.Equal("Class 6 – Morning", response.Name);
        Assert.Equal(50, response.TotalSeats);
        Assert.Equal(0, response.HeldSeats);
        Assert.Equal(0, response.ConfirmedSeats);
        Assert.Equal(50, response.AvailableSeats);
    }

    // Test 2: Confirmation is idempotent (Rule 4)
    [Fact]
    public async Task ConfirmHold_IsIdempotent_DoesNotIncreaseCountOnMultipleCalls()
    {
        using var dbContext = CreateTestDbContext();
        var config = CreateConfiguration();
        var service = new AdmissionService(dbContext, config);

        var schoolClass = await service.CreateClassAsync(new CreateClassRequest { Name = "Class 7", TotalSeats = 10 });
        var (hold, _, _) = await service.CreateHoldAsync(schoolClass.Id, "STU_1001");

        Assert.NotNull(hold);
        Assert.Equal("HELD", hold.Status);

        // First confirmation
        var (firstConfirm, _, status1) = await service.ConfirmHoldAsync(hold.HoldId, "STU_1001");
        Assert.Equal(200, status1);
        Assert.Equal("CONFIRMED", firstConfirm!.Status);

        // Second confirmation call (idempotency check)
        var (secondConfirm, _, status2) = await service.ConfirmHoldAsync(hold.HoldId, "STU_1001");
        Assert.Equal(200, status2);
        Assert.Equal("CONFIRMED", secondConfirm!.Status);

        // Verify database state: exactly 1 confirmed seat exists
        var updatedClass = await service.GetClassByIdAsync(schoolClass.Id);
        Assert.Equal(1, updatedClass!.ConfirmedSeats);
        Assert.Equal(0, updatedClass.HeldSeats);
        Assert.Equal(9, updatedClass.AvailableSeats);
    }

    // Test 3: Concurrency Test — 20 parallel requests for a class with only 5 seats (Rule 1)
    [Fact]
    public async Task CreateHold_ConcurrentRequests_NeverExceedsTotalSeats()
    {
        using var setupContext = CreateTestDbContext();
        var config = CreateConfiguration();
        var setupService = new AdmissionService(setupContext, config);

        int totalSeats = 5;
        int concurrentUsers = 20;

        var schoolClass = await setupService.CreateClassAsync(new CreateClassRequest
        {
            Name = "Limited Class",
            TotalSeats = totalSeats
        });

        // Launch 20 concurrent tasks simulating simultaneous parent requests
        var tasks = Enumerable.Range(1, concurrentUsers).Select(async i =>
        {
            // Each task opens its own DbContext instance to simulate independent HTTP request threads
            var connectionString = "Host=localhost;Port=5432;Database=school_admission_test;Username=myuser;Password=mysecretpassword;";
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(connectionString)
                .Options;

            using var dbContext = new AppDbContext(options);
            var service = new AdmissionService(dbContext, config);
            return await service.CreateHoldAsync(schoolClass.Id, $"STU_CONCURRENT_{i}");
        });

        var results = await Task.WhenAll(tasks);

        int successfulHolds = results.Count(r => r.StatusCode == 201);
        int rejectedRequests = results.Count(r => r.StatusCode == 409);

        Assert.Equal(totalSeats, successfulHolds);
        Assert.Equal(concurrentUsers - totalSeats, rejectedRequests);

        var finalClassState = await setupService.GetClassByIdAsync(schoolClass.Id);
        Assert.Equal(totalSeats, finalClassState!.HeldSeats);
        Assert.Equal(0, finalClassState.AvailableSeats);
    }
}