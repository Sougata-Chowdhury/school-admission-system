using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SchoolAdmissionApi.Models;

public class AdmissionHold
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ClassId { get; set; }

    [ForeignKey(nameof(ClassId))]
    public SchoolClass Class { get; set; } = null!;

    [Required]
    [MaxLength(100)]
    public string StudentId { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "HELD"; // HELD, CONFIRMED, EXPIRED, CANCELLED

    [Required]
    public DateTime ExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ConfirmedAt { get; set; }
}