using Microsoft.AspNetCore.Mvc;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Services;

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

    // Endpoint 1: POST /classes (Admin creates class)
    [HttpPost]
    public async Task<ActionResult<ClassResponse>> CreateClass([FromBody] CreateClassRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        var result = await _admissionService.CreateClassAsync(request);
        return CreatedAtAction(nameof(GetClassById), new { classId = result.Id }, result);
    }

    // Endpoint 2: GET /classes (Get all classes and seat counts)
    [HttpGet]
    public async Task<ActionResult<List<ClassResponse>>> GetAllClasses()
    {
        var result = await _admissionService.GetAllClassesAsync();
        return Ok(result);
    }

    // Endpoint 3: GET /classes/{classId} (Get one class)
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

    // Endpoint 4: POST /classes/{classId}/holds (Reserve a seat)
    [HttpPost("{classId:guid}/holds")]
    public async Task<ActionResult<HoldResponse>> CreateHold(Guid classId)
    {
        if (!Request.Headers.TryGetValue("X-Student-Id", out var studentIdValues) || string.IsNullOrWhiteSpace(studentIdValues.ToString()))
        {
            return BadRequest(new { message = "Missing required header: X-Student-Id" });
        }

        var studentId = studentIdValues.ToString().Trim();
        var (hold, error, statusCode) = await _admissionService.CreateHoldAsync(classId, studentId);

        if (error != null)
        {
            return StatusCode(statusCode, new { message = error });
        }

        return CreatedAtAction(nameof(HoldsController.GetHoldById), "Holds", new { holdId = hold!.HoldId }, hold);
    }
}