namespace ApiMenu.Models {
    public class RefreshToken {
        public int Id { get; set; }
        public string Token { get; set; } = Guid.NewGuid().ToString();
        public string Username { get; set; } = string.Empty;
        public DateTime Expiration { get; set; } = DateTime.UtcNow.AddDays(7);
    }
}
