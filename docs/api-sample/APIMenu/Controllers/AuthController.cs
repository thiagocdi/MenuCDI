using ApiMenu.Infra.Data;
using ApiMenu.Models;
using ApiMenu.Models.DTO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace ApiMenu.Controllers {
    [Route("api/")]
    [ApiController]
    public class AuthController(IConfiguration config, SqlContext sqlContext) : ControllerBase {
        private readonly IConfiguration _config = config;
        private readonly SqlContext _sqlContext = sqlContext;
        private TextInfo textInfo = CultureInfo.CurrentCulture.TextInfo;

        [HttpPost("loginMenu")]
        [AllowAnonymous]
        public IActionResult LoginMenu([FromBody] LoginMenuDto login) {
            try {
                if (login == null) {
                    return BadRequest("Credenciais não informadas");
                }
                if (login.Username == null) {
                    return BadRequest("Usuário não informado");
                }
                if (login.Username.Length != 3) {
                    return BadRequest("Usuário deve ter 3 caracteres");
                }
                if (login.Password == null) {
                    return BadRequest("Senha não informada");
                }

                login.Username = login.Username.ToUpper();
                login.Password = login.Password.ToUpper();

                var user = _sqlContext.Usuarios
                    .FirstOrDefault(u => u.Sigla.Equals(login.Username) && u.Senha.Equals(login.Password));

                if (user != null) {
                    var filial = _sqlContext.Filiais.FirstOrDefault(f => f.Id.Equals(user.Filial));

                    var nomeFilial = textInfo.ToTitleCase((filial != null ? filial.Nome.Trim() : "").ToLower());
                    user.Nome = textInfo.ToTitleCase(user.Nome.Trim().ToLower());

                    var accessToken = GenerateJwtToken(user);
                    var refreshToken = new RefreshToken { Username = user.Sigla, Expiration = DateTime.UtcNow.AddDays(7) };
                    _sqlContext.RefreshTokens.Add(refreshToken);
                    _sqlContext.SaveChanges();

                    if (!string.IsNullOrEmpty(login.NewPassword)) {
                        //TROCAR SENHA
                        user.Senha = login.NewPassword.ToUpper();
                        _sqlContext.SaveChanges();
                    }

                    var loggedInUser = new LoggedInUser(user.Sigla, user.Nome, "", nomeFilial);
                    var token = accessToken;

                    var loggedInResponse = new LoginResponseDto(loggedInUser, token);

                    return Ok(loggedInResponse);

                } else {
                    return Unauthorized("Login inválido");
                }
            } catch (DbUpdateException dbEx) {
                return StatusCode(StatusCodes.Status500InternalServerError, $"Erro ao salvar dados no banco.\r\n{dbEx.Message}");
            } catch (InvalidOperationException invalidOpEx) {
                return BadRequest("Operação inválida: " + invalidOpEx.Message);
            } catch (SqlException sqlEx) {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, $"Banco de dados indisponível.\r\n{sqlEx.Message}");
            } catch (Exception ex) {
                // Logar internamente o erro detalhado
                return StatusCode(StatusCodes.Status500InternalServerError, $"Erro interno inesperado.\r\n{ex.Message}");
            }
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public IActionResult Login([FromBody] Login login) {
            try {
                if (login == null) {
                    return BadRequest("Credenciais não informadas");
                }
                if (login.Usuario == null) {
                    return BadRequest("Usuário não informado");
                }
                if (login.Usuario.Length != 3) {
                    return BadRequest("Usuário deve ter 3 caracteres");
                }
                if (login.Senha == null) {
                    return BadRequest("Senha não informada");
                }

                login.Usuario = login.Usuario.ToUpper();
                login.Senha = login.Senha.ToUpper();

                var user = _sqlContext.Usuarios
                    .FirstOrDefault(u => u.Sigla.Equals(login.Usuario) && u.Senha.Equals(login.Senha));

                if (user != null) {
                    user.Nome = user.Nome.Trim();

                    var accessToken = GenerateJwtToken(user);
                    var refreshToken = new RefreshToken { Username = user.Sigla };
                    _sqlContext.RefreshTokens.Add(refreshToken);
                    _sqlContext.SaveChanges();

                    var app = _sqlContext.Parametros.FirstOrDefault();

                    var erro = 0;
                    //Console.WriteLine(accessToken);
                    //Console.WriteLine(refreshToken);

                    return Ok(new {
                        accessToken,
                        refreshToken = refreshToken.Token,
                        versaoApp = app?.VersaoAPP ?? "",
                        dataVersaoApp = app?.DataVersaoAPP ?? null,
                        linkDownloadApp = app?.LinkDownloadAPP ?? "",
                        erro,
                    });

                } else {
                    return Unauthorized("Login inválido");
                }
            } catch (Exception ex) {
                return BadRequest(ex.Message);
            }
        }


        [HttpPost("refresh-token")]
        [AllowAnonymous]
        public IActionResult RefreshToken([FromBody] string token) {
            var rt = _sqlContext.RefreshTokens.FirstOrDefault(r => r.Token == token && r.Expiration > DateTime.UtcNow);
            if (rt == null) return Unauthorized("Refresh token inválido ou expirado");

            var user = _sqlContext.Usuarios.FirstOrDefault(u => u.Sigla == rt.Username);
            if (user == null) return Unauthorized("Usuário não encontrado");

            var accessToken = GenerateJwtToken(user);
            return Ok(new { accessToken });
        }

        [HttpGet("status")]
        [AllowAnonymous]
        public IActionResult Status() {
            return Ok(1);
        }

        private string GenerateJwtToken(Usuario user) {
            var key = Encoding.ASCII.GetBytes(_config["JwtSettings:SecretKey"] ?? "");
            var tokenDescriptor = new SecurityTokenDescriptor {
                Subject = new ClaimsIdentity([
                    new Claim(ClaimTypes.Name, user.Sigla),
                    new Claim(ClaimTypes.GivenName, user.Nome)
                ]),
                Expires = DateTime.UtcNow.AddHours(72),
                Issuer = _config["JwtSettings:Issuer"],
                Audience = _config["JwtSettings:Audience"],
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256)
            };

            var tokenHandler = new JwtSecurityTokenHandler();
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

    }
}