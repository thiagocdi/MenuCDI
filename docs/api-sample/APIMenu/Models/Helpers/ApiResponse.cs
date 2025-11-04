namespace ApiMenu.Models.Helpers {
    public class ApiResponse<T> {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public T? Data { get; set; }
        public string? ErrorCode { get; set; }
        public string? Details { get; set; }

        public static ApiResponse<T> Ok(T data, string? message = null)
            => new() { Success = true, Message = message, Data = data };

        public static ApiResponse<T> Fail(string message, string? code = null, string? details = null)
            => new() { Success = false, Message = message, ErrorCode = code, Details = details };
    }
}
