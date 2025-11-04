using System.Net;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using ApiMenu.Models.Helpers;

namespace ApiMenu {
    public class GlobalExceptionMiddleware {
        private readonly RequestDelegate _next;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<GlobalExceptionMiddleware> _logger;

        public GlobalExceptionMiddleware(RequestDelegate next, IWebHostEnvironment env, ILogger<GlobalExceptionMiddleware> logger) {
            _next = next;
            _env = env;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context) {
            try {
                await _next(context);
            } catch (Exception ex) {
                await HandleExceptionAsync(context, ex);
            }
        }

        private async Task HandleExceptionAsync(HttpContext context, Exception ex) {
            _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);

            // If response already started (e.g. streaming a file), we cannot write JSON
            if (context.Response.HasStarted) {
                _logger.LogWarning("Cannot write error response because response has already started.");
                return;
            }

            var statusCode = HttpStatusCode.InternalServerError;
            string errorCode = "UNEXPECTED_ERROR";
            string message = "An unexpected error occurred.";

            //Specific exception mapping (extend as needed)
            switch (ex) {
                case UnauthorizedAccessException:
                    statusCode = HttpStatusCode.Unauthorized;
                    errorCode = "UNAUTHORIZED";
                    message = "Access denied or token expired.";
                    break;

                case KeyNotFoundException:
                    statusCode = HttpStatusCode.NotFound;
                    errorCode = "NOT_FOUND";
                    message = "Resource not found.";
                    break;

                case ArgumentException:
                case InvalidOperationException:
                    statusCode = HttpStatusCode.BadRequest;
                    errorCode = "INVALID_OPERATION";
                    message = ex.Message;
                    break;

                case DbUpdateException dbEx:
                    statusCode = HttpStatusCode.Conflict;
                    errorCode = "DB_UPDATE_ERROR";
                    message = "Database update failed.";
                    if (dbEx.InnerException is SqlException sqlEx)
                        message = sqlEx.Message;
                    break;

                case SqlException:
                    statusCode = HttpStatusCode.ServiceUnavailable;
                    errorCode = "SQL_ERROR";
                    message = "Database connection error.";
                    break;
            }

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = (int)statusCode;

            var response = ApiResponse<object>.Fail(
                message: message,
                code: errorCode,
                details: _env.IsDevelopment() ? ex.ToString() : null
            );

            var options = new JsonSerializerOptions {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = _env.IsDevelopment()
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(response, options));
        }
    }
}

