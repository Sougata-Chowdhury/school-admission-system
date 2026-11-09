using Microsoft.EntityFrameworkCore;
using SchoolAdmissionApi.Models;

namespace SchoolAdmissionApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<SchoolClass> Classes => Set<SchoolClass>();
    public DbSet<AdmissionHold> Holds => Set<AdmissionHold>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Rule 3: Enforce maximum 1 active (HELD or CONFIRMED) hold per student per class at DB level
        modelBuilder.Entity<AdmissionHold>()
            .HasIndex(h => new { h.ClassId, h.StudentId })
            .HasFilter("\"Status\" IN ('HELD', 'CONFIRMED')")
            .IsUnique();
    }
}