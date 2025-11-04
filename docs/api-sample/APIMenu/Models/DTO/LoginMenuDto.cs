using System.ComponentModel.DataAnnotations;

namespace ApiMenu.Models.DTO {
    public class LoginMenuDto {
        [Required]
        public string Username { get; set; } = string.Empty;
        [Required]
        public string Password { get; set; } = string.Empty;
        public string? NewPassword { get; set; } = string.Empty;
    }
}
