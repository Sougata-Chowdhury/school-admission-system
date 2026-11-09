using Microsoft.AspNetCore.Mvc;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Services;
using SchoolAdmissionApi.Support;

namespace SchoolAdmissionApi.Controllers;

[ApiController]
[Route("[controller]")]
public class ClassesController : ControllerBase
{
    private readonly AdmissionService _admissionService;

    public ClassesController(AdmissionService admissionService)
    {
        _admissionService = admissionService;
    }

    // POST /classes
    [HttpPost]
    public async Task<ActionResult<ClassResponse>> CreateClass([FromBody] CreateClassRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { message = "Class name is required." });
        }

        // PostgreSQL text cannot contain a NUL character. Treat it as invalid
        // input (400) rather than letting the database raise a 500.
        if (request.Name.Contains('\0'))
        {
            return BadRequest(new { message = "Class name contains an invalid character." });
        }

        if (request.TotalSeats < 1)
        {
            return BadRequest(new { message = "totalSeats must be at least 1." });
        }

        var result = await _admissionService.CreateClassAsync(request);
        return CreatedAtAction(nameof(GetClassById), new { classId = result.Id }, result);
    }

    // GET /classes
    [HttpGet]
    public async Task<ActionResult<List<ClassResponse>>> GetAllClasses()
    {
        var result = await _admissionService.GetAllClassesAsync();
        return Ok(result);
    }

    // GET /classes/{classId}
    [HttpGet("{classId:guid}")]
    public async Task<ActionResult<ClassResponse>> GetClassById(Guid classId)
    {
        var result = await _admissionService.GetClassByIdAsync(classId);
        if (result == null)
        {
            return NotFound(new { message = "Class not found." });
        }

        return Ok(result);
    }

    // POST /classes/{classId}/holds
    [HttpPost("{classId:guid}/holds")]
    public async Task<IActionResult> CreateHold(Guid classId)
    {
        if (!StudentIdHeader.TryGet(Request, out var studentId, out var error))
        {
            return error!;
        }

        var (hold, message, statusCode) = await _admissionService.CreateHoldAsync(classId, studentId);

        if (message != null)
        {
            return StatusCode(statusCode, new { message });
        }

        return Created($"/holds/{hold!.HoldId}", hold);
    }
}
