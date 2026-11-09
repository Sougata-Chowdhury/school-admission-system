using Microsoft.EntityFrameworkCore;
using SchoolAdmissionApi.Data;

namespace SchoolAdmissionApi.Services;

/// <summary>
/// Periodically marks timed-out holds as EXPIRED so the database stays tidy.
/// Read endpoints also treat an expired HELD row as EXPIRED on the fly, so a
/// seat is never blocked while waiting for this worker.
/// </summary>
public class HoldExpirationWorker : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromSeconds(5);

    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HoldExpirationWorker> _logger;

    public HoldExpirationWorker(
        IServiceProvider serviceProvider,
        ILogger<HoldExpirationWorker> logger)
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
                var expiredCount = await dbContext.Holds
                    .Where(h => h.Status == "HELD" && h.ExpiresAt <= now)
                    .ExecuteUpdateAsync(
                        setters => setters.SetProperty(h => h.Status, "EXPIRED"),
                        stoppingToken);

                if (expiredCount > 0)
                {
                    _logger.LogInformation("Expired {Count} admission holds.", expiredCount);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while processing expired admission holds.");
            }

            try
            {
                await Task.Delay(SweepInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
