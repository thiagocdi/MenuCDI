namespace ApiMenu.Models.DTO {
    public record LoginResponseDto (LoggedInUser User, string Token);
}
