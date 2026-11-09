using System.ComponentModel.DataAnnotations;

namespace SchoolAdmissionApi.Models;

public class SchoolClass
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int TotalSeats { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public ICollection<AdmissionHold> Holds { get; set; } = new List<AdmissionHold>();
}