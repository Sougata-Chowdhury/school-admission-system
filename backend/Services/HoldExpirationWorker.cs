using Microsoft.EntityFrameworkCore;
using SchoolAdmissionApi.Data;

namespace SchoolAdmissionApi.Services;

public class HoldExpirationWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HoldExpirationWorker> _logger;

    public HoldExpirationWorker(IServiceProvider serviceProvider, ILogger<HoldExpirationWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var now = DateTime.UtcNow;
                var expiredHolds = await dbContext.Holds
                    .Where(h => h.Status == "HELD" && h.ExpiresAt <= now)
                    .ToListAsync(stoppingToken);

                if (expiredHolds.Count > 0)
                {
                    foreach (var hold in expiredHolds)
                    {
                        hold.Status = "EXPIRED";
                    }
                    await dbContext.SaveChangesAsync(stoppingToken);
                    _logger.LogInformation("Expired {Count} admission holds.", expiredHolds.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while processing expired admission holds.");
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}