using Microsoft.AspNetCore.Mvc;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Services;

namespace SchoolAdmissionApi.Controllers;

[ApiController]
public class HoldsController : ControllerBase
{
    private readonly AdmissionService _admissionService;

    public HoldsController(AdmissionService admissionService)
    {
        _admissionService = admissionService;
    }

    // Endpoint 5: GET /holds/{holdId} (Get reservation details)
    [HttpGet("holds/{holdId:guid}")]
    public async Task<ActionResult<HoldResponse>> GetHoldById(Guid holdId)
    {
        var (hold, error, statusCode) = await _admissionService.GetHoldByIdAsync(holdId);
        if (error != null)
        {
            return StatusCode(statusCode, new { message = error });
        }
        return Ok(hold);
    }

    // Endpoint 6: POST /holds/{holdId}/confirm (Confirm admission)
    [HttpPost("holds/{holdId:guid}/confirm")]
    public async Task<ActionResult<HoldResponse>> ConfirmHold(Guid holdId)
    {
        if (!Request.Headers.TryGetValue("X-Student-Id", out var studentIdValues) || string.IsNullOrWhiteSpace(studentIdValues.ToString()))
        {
            return BadRequest(new { message = "Missing required header: X-Student-Id" });
        }

        var studentId = studentIdValues.ToString().Trim();
        var (hold, error, statusCode) = await _admissionService.ConfirmHoldAsync(holdId, studentId);

        if (error != null)
        {
            return StatusCode(statusCode, new { message = error });
        }

        return Ok(hold);
    }

    // Endpoint 7: DELETE /holds/{holdId} (Cancel reservation - Returns 204 No Content per spec)
    [HttpDelete("holds/{holdId:guid}")]
    public async Task<IActionResult> CancelHold(Guid holdId)
    {
        if (!Request.Headers.TryGetValue("X-Student-Id", out var studentIdValues) || string.IsNullOrWhiteSpace(studentIdValues.ToString()))
        {
            return BadRequest(new { message = "Missing required header: X-Student-Id" });
        }

        var studentId = studentIdValues.ToString().Trim();
        var (hold, error, statusCode) = await _admissionService.CancelHoldAsync(holdId, studentId);

        if (error != null)
        {
            return StatusCode(statusCode, new { message = error });
        }

        return NoContent();
    }

    // Endpoint 8: GET /me/holds (Get student's applications)
    [HttpGet("me/holds")]
    public async Task<ActionResult<List<HoldResponse>>> GetMyHolds()
    {
        if (!Request.Headers.TryGetValue("X-Student-Id", out var studentIdValues) || string.IsNullOrWhiteSpace(studentIdValues.ToString()))
        {
            return BadRequest(new { message = "Missing required header: X-Student-Id" });
        }

        var studentId = studentIdValues.ToString().Trim();
        var holds = await _admissionService.GetStudentHoldsAsync(studentId);
        return Ok(holds);
    }
}