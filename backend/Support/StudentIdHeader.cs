using Microsoft.AspNetCore.Mvc;

namespace SchoolAdmissionApi.Support;

/// <summary>
/// Reads and validates the student identity header used by the public API.
/// </summary>
public static class StudentIdHeader
{
    public const string Name = "X-Student-Id";
    public const int MaxLength = 100;

    public static bool TryGet(HttpRequest request, out string studentId, out IActionResult? error)
    {
        studentId = string.Empty;
        error = null;

        if (!request.Headers.TryGetValue(Name, out var values) ||
            string.IsNullOrWhiteSpace(values.ToString()))
        {
            error = new BadRequestObjectResult(new { message = $"Missing required header: {Name}" });
            return false;
        }

        var value = values.ToString().Trim();
        if (value.Length > MaxLength)
        {
            error = new BadRequestObjectResult(
                new { message = $"{Name} must be at most {MaxLength} characters." });
            return false;
        }

        studentId = value;
        return true;
    }
}
