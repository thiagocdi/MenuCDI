using ApiMenu;
using ApiMenu.Infra.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions {
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
    ApplicationName = typeof(Program).Assembly.FullName
});

builder.Host.UseWindowsService();
builder.WebHost.UseUrls("http://0.0.0.0:8000");

var key = Encoding.ASCII.GetBytes(builder.Configuration["JwtSettings:SecretKey"] ?? "");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => {
        options.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["JwtSettings:Issuer"],
            ValidAudience = builder.Configuration["JwtSettings:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(key)
        };
    });

// Try to read SQL connection from Windows registry, fallback to environment variable
string? sqlConn = Global.GetConnectionString();

builder.Services.AddDbContext<SqlContext>(options => options.UseSqlServer(sqlConn).EnableSensitiveDataLogging());
builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll", policy => {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("AllowAll"); // Apply CORS Policy

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
await app.RunAsync();
