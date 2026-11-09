using Microsoft.AspNetCore.Mvc;
using SchoolAdmissionApi.DTOs;
using SchoolAdmissionApi.Services;
using SchoolAdmissionApi.Support;

namespace SchoolAdmissionApi.Controllers;

[ApiController]
public class HoldsController : ControllerBase
{
    private readonly AdmissionService _admissionService;

    public HoldsController(AdmissionService admissionService)
    {
        _admissionService = admissionService;
    }

    // GET /holds/{holdId}
    [HttpGet("holds/{holdId:guid}")]
    public async Task<ActionResult<HoldResponse>> GetHoldById(Guid holdId)
    {
        var (hold, message, statusCode) = await _admissionService.GetHoldByIdAsync(holdId);
        if (message != null)
        {
            return StatusCode(statusCode, new { message });
        }

        return Ok(hold);
    }

    // POST /holds/{holdId}/confirm
    [HttpPost("holds/{holdId:guid}/confirm")]
    public async Task<IActionResult> ConfirmHold(Guid holdId)
    {
        if (!StudentIdHeader.TryGet(Request, out var studentId, out var error))
        {
            return error!;
        }

        var (hold, message, statusCode) = await _admissionService.ConfirmHoldAsync(holdId, studentId);

        if (message != null)
        {
            return StatusCode(statusCode, new { message });
        }

        return Ok(hold);
    }

    // DELETE /holds/{holdId}
    [HttpDelete("holds/{holdId:guid}")]
    public async Task<IActionResult> CancelHold(Guid holdId)
    {
        if (!StudentIdHeader.TryGet(Request, out var studentId, out var error))
        {
            return error!;
        }

        var (_, message, statusCode) = await _admissionService.CancelHoldAsync(holdId, studentId);

        if (message != null)
        {
            return StatusCode(statusCode, new { message });
        }

        return NoContent();
    }

    // GET /me/holds
    [HttpGet("me/holds")]
    public async Task<IActionResult> GetMyHolds()
    {
        if (!StudentIdHeader.TryGet(Request, out var studentId, out var error))
        {
            return error!;
        }

        var holds = await _admissionService.GetStudentHoldsAsync(studentId);
        return Ok(holds);
    }
}
