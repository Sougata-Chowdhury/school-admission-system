using System.ComponentModel.DataAnnotations;

namespace SchoolAdmissionApi.DTOs;

public class CreateClassRequest
{
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Range(1, int.MaxValue, ErrorMessage = "TotalSeats must be at least 1.")]
    public int TotalSeats { get; set; }
}