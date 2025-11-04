using System.Security.Claims;

namespace ApiMenu.Models.DTO {
    public record LoggedInUser (string Id, string Name, string Email, string CompanyName) {
        public Claim[] ToClaims() => [
            new Claim (ClaimTypes.NameIdentifier, Id),
            new Claim (ClaimTypes.Name, Name),
            new Claim (ClaimTypes.Email, Email),
            new Claim("CompanyName", CompanyName)
            ];

        public static LoggedInUser? FromClaimsPrincipal(ClaimsPrincipal principal) {
            if (principal.Identity?.IsAuthenticated is true) {
                var id = principal.FindFirst(ClaimTypes.NameIdentifier)!.Value;
                var name = principal.FindFirst(ClaimTypes.Name)!.Value;
                var email = principal.FindFirst(ClaimTypes.Email)!.Value;
                var companyName = principal.FindFirst("CompanyName")?.Value ?? "";

                return new (id, name, email, companyName);
            }
            return null;
        }

    }
}
