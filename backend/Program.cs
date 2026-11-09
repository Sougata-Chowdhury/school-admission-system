using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SchoolAdmissionApi.Data;
using SchoolAdmissionApi.Services;

var builder = WebApplication.CreateBuilder(args);

// Allow the React app (served from a different port/origin) to call the API.
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<AdmissionService>();
builder.Services.AddHostedService<HoldExpirationWorker>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // The API contract uses JSON numbers for totalSeats. Do not silently
        // accept numeric strings such as "2"; invalid input must be a 4xx.
        options.JsonSerializerOptions.NumberHandling = JsonNumberHandling.Strict;
    });
builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// A fresh database (for example after `docker compose down -v`) has no tables.
// Apply migrations before accepting traffic, retrying while PostgreSQL starts up.
await ApplyMigrationsAsync(app);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseExceptionHandler();
app.UseCors("AllowAll");

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();

app.Run();

static async Task ApplyMigrationsAsync(WebApplication app)
{
    using var scope = app.Services.CreateScope();
    var logger = scope.ServiceProvider
        .GetRequiredService<ILoggerFactory>()
        .CreateLogger("Startup");
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    const int maxAttempts = 10;
    for (var attempt = 1; attempt <= maxAttempts; attempt++)
    {
        try
        {
            await dbContext.Database.MigrateAsync();
            logger.LogInformation("Database migrations are up to date.");
            return;
        }
        catch (Exception ex) when (attempt < maxAttempts)
        {
            logger.LogWarning(
                ex,
                "Database is not ready (attempt {Attempt}/{MaxAttempts}). Retrying in 3 seconds.",
                attempt,
                maxAttempts);
            await Task.Delay(TimeSpan.FromSeconds(3));
        }
    }

    // Final attempt: let the exception surface and fail the container.
    await dbContext.Database.MigrateAsync();
}
