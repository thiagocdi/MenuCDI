using ApiMenu.Infra.Data;
using ApiMenu.Models.DTO;
using ApiMenu.Models.Helpers;
using ApiMenu.Models.Views;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace ApiMenu.Controllers {
    [Route("api/")]
    [ApiController]
    [Authorize] // <-- protege todas as rotas deste controller
    public class MenuController(SqlContext sqlContext) : ControllerBase {
        private readonly SqlContext _sqlContext = sqlContext;

        [HttpGet("programas")]
        public async Task<ActionResult<ApiResponse<List<ViewProgramas>>>> Programas() {

            var Usuario = User.Identity?.Name;
            Console.WriteLine($"username User.Identity?.Name: {Usuario}");

            if (string.IsNullOrEmpty(Usuario)) {
                return BadRequest(ApiResponse<List<SistemasDto>>.Fail("Informe o usuário", "USER_MISSING"));
            }
            StringBuilder sql = new();
            sql.Clear();
            sql.Append(" SELECT ");
            sql.Append(" TabProgramas.Programa as IdPrograma, ");
            sql.Append(" RTRIM(TabProgramas.Nome) as Descricao, ");
            sql.Append(" LOWER(RTRIM(TabProgramas.NomeVB)) AS Pagina, ");
            sql.Append(" TabProgramas.Icon, ");
            sql.Append(" CASE WHEN TabNiveis.Acesso = 'SIM' THEN 1 ELSE 0 END AS Acesso ");
            sql.Append(" FROM ");
            sql.Append(" TabProgramas ");
            sql.Append(" INNER JOIN TabNiveis ON TabNiveis.Programa = TabProgramas.Programa ");
            sql.Append(" WHERE ");
            sql.Append(" TabProgramas.Nome LIKE 'CDI APP - %' ");
            sql.Append($" AND TabNiveis.Usuario = '{Usuario}' ");
            var result = await _sqlContext.ViewProgramas
                .FromSqlRaw(sql.ToString())
                .AsNoTracking()
                .ToListAsync();

            return Ok(ApiResponse<List<ViewProgramas>>.Ok(result));
        }

        [HttpGet("sistemasMenu")]
        public async Task<ActionResult<ApiResponse<List<SistemasDto>>>> SistemasMenu() {

            var Usuario = User.Identity?.Name;
            Console.WriteLine($"username User.Identity?.Name: {Usuario}");

            if (string.IsNullOrEmpty(Usuario)) {
                return BadRequest(ApiResponse<List<SistemasDto>>.Fail("Informe o usuário", "USER_MISSING"));
            }

            StringBuilder sql = new();
            sql.Clear();

            sql.Append(" SELECT ");
            sql.Append(" tabSistemasCDI.Codigo, ");
            sql.Append(" COALESCE(tabSistemasCDI.Descricao, '') AS Descricao, ");
            sql.Append(" COALESCE(tabSistemasCDI.NomeExe, '') + '.exe' AS NomeExe, ");
            sql.Append(" tabSistemasCDI.NRO_VERSAO, ");
            sql.Append(" tabSistemasCDI.DT_VERSAO, ");
            sql.Append(" tabSistemasCDI.Icon, ");
            sql.Append(" CAST(COALESCE(tabSistemasCDI.Generico, 0) AS INT) AS Generico ");
            sql.Append(" FROM ");
            sql.Append(" tabSistemasCDI ");
            sql.Append(" INNER JOIN tabSistemasCDI_Usuarios ON tabSistemasCDI_Usuarios.Sistemas = tabSistemasCDI.Codigo ");
            sql.Append($" AND tabSistemasCDI_Usuarios.Usuarios = '{Usuario}' ");
            sql.Append(" WHERE ");
            sql.Append(" tabSistemasCDI.Mostrar = 1 ");
            sql.Append(" AND tabSistemasCDI_Usuarios.Acessos > 0 ");
            sql.Append(" ORDER BY ");
            sql.Append(" tabSistemasCDI_Usuarios.Acessos DESC, ");
            sql.Append(" tabSistemasCDI.Codigo ");

            Console.WriteLine(sql.ToString());

            var result = await _sqlContext.SistemasDto
                .FromSqlRaw(sql.ToString())
                .AsNoTracking()
                .ToListAsync();

            return Ok(ApiResponse<List<SistemasDto>>.Ok(result));
        }

        [HttpGet("sistema")]
        public async Task<ActionResult<ApiResponse<SistemasDto>>> Sistema(int IdSistema) {
            var Usuario = User.Identity?.Name;
            Console.WriteLine($"username User.Identity?.Name: {Usuario}");

            if (string.IsNullOrEmpty(Usuario)) {
                return BadRequest(ApiResponse<SistemasDto>.Fail("Informe o usuário", "USER_MISSING"));
            }

            StringBuilder sql = new();
            sql.Clear();
            sql.Append(" SELECT ");
            sql.Append(" tabSistemasCDI.Codigo, ");
            sql.Append(" tabSistemasCDI.Descricao, ");
            sql.Append(" tabSistemasCDI.NomeExe + '.exe' AS NomeExe, ");
            sql.Append(" tabSistemasCDI.NRO_VERSAO, ");
            sql.Append(" tabSistemasCDI.DT_VERSAO, ");
            sql.Append(" tabSistemasCDI.Icon, ");
            sql.Append(" CAST(COALESCE(tabSistemasCDI.Generico, 0) AS INT) AS Generico ");
            sql.Append(" FROM ");
            sql.Append(" tabSistemasCDI ");
            sql.Append(" INNER JOIN tabSistemasCDI_Usuarios ON tabSistemasCDI_Usuarios.Sistemas = tabSistemasCDI.Codigo ");
            sql.Append($" AND tabSistemasCDI_Usuarios.Usuarios = '{Usuario}' ");
            sql.Append(" WHERE ");
            sql.Append(" tabSistemasCDI.Mostrar = 1 ");
            sql.Append(" AND tabSistemasCDI_Usuarios.Acessos > 0 ");
            sql.Append($" AND tabSistemasCDI.Codigo = {IdSistema}");

            var result = await _sqlContext.SistemasDto
                .FromSqlRaw(sql.ToString())
                .AsNoTracking()
                .FirstOrDefaultAsync();

            return Ok(result);
        }

        [HttpPost("downloadSistema")]
        public async Task<IActionResult> DownloadSistema([FromQuery] int? IdSistema) {
            StringBuilder sql = new();
            var Usuario = User.Identity?.Name;

            if (IdSistema == null || IdSistema == 0) {
                return BadRequest("Informe o sistema");
            }

            sql.Clear();
            sql.Append(" SELECT ");
            sql.Append(" tabSistemasCDI.Codigo, ");
            sql.Append(" tabSistemasCDI.Descricao, ");
            sql.Append(" tabSistemasCDI.NomeExe + '.exe' AS NomeExe, ");
            sql.Append(" tabSistemasCDI.NRO_VERSAO, ");
            sql.Append(" tabSistemasCDI.DT_VERSAO, ");
            sql.Append(" tabSistemasCDI.Icon, ");
            sql.Append(" CAST(COALESCE(tabSistemasCDI.Generico, 0) AS INT) AS Generico ");
            sql.Append(" FROM ");
            sql.Append(" tabSistemasCDI ");
            sql.Append(" INNER JOIN tabSistemasCDI_Usuarios ON tabSistemasCDI_Usuarios.Sistemas = tabSistemasCDI.Codigo ");
            sql.Append($" AND tabSistemasCDI_Usuarios.Usuarios = '{Usuario}' ");
            sql.Append(" WHERE ");
            sql.Append(" tabSistemasCDI.Mostrar = 1 ");
            sql.Append(" AND tabSistemasCDI_Usuarios.Acessos > 0 ");
            sql.Append($" AND tabSistemasCDI.Codigo = {IdSistema}");
            var sistema = await _sqlContext.SistemasDto
                .FromSqlRaw(sql.ToString())
                .AsNoTracking()
                .FirstOrDefaultAsync() ?? new();

            if (sistema.IdSistema == 0) {
                return BadRequest("sistema não encontrado");
            }

            sql.Clear();
            sql.Append(" SELECT ");
            sql.Append(" idClienteOS, ");
            sql.Append(" CaminhoNuvem, ");
            sql.Append(" SenhaCaminhoNuvem, ");
            sql.Append(" CaminhoNuvemGenerico, ");
            sql.Append(" SenhaCaminhoNuvemGenerico, ");
            sql.Append(" COALESCE(CK_EXEC_NUVEM, 0) AS CK_EXEC_NUVEM ");
            sql.Append(" FROM ");
            sql.Append(" PARAMETROS ");
            var param = await _sqlContext.ParamDto.FromSqlRaw(sql.ToString()).AsNoTracking().FirstOrDefaultAsync();

            string zipFile = $"{sistema.Descricao}.zip";

            Stream stream = new MemoryStream();
            if (param?.ExecNumvem == 1) {
                // DOWNLOAD DA NUVEM
                string caminhoNuvem = (sistema.Generico == 0 ? param?.CaminhoNuvem ?? "" : param?.CaminhoNuvemGenerico ?? "");
                string usuarioNuvem = $"client{param?.ClientCode}";
                string senhaNuvem = (sistema.Generico == 0 ? param?.SenhaCaminhoNuvem ?? "" : param?.SenhaCaminhoNuvemGenerico ?? "");

                if (caminhoNuvem.EndsWith('/')) caminhoNuvem = caminhoNuvem[..^1];
                string url = $"{caminhoNuvem}/{zipFile}";
                using var http = new HttpClient();
                var authValue = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{usuarioNuvem}:{senhaNuvem}"));
                http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authValue);
                var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
                if (!response.IsSuccessStatusCode) {
                    return StatusCode((int)response.StatusCode, $"Erro ao baixar: {response.StatusCode}\r\n{url}");
                }
                stream = await response.Content.ReadAsStreamAsync();
            } else {
                // DOWNLOAD REDE LOCAL
                var caminhoExec = await _sqlContext.Database
                .SqlQuery<string>($@"
                    SELECT 
                    Filial.CAMINHOEXEC AS Value
                    FROM 
                    FILIAL
                    INNER JOIN TabUsuarios ON FILIAL.FILIAL = TabUsuarios.FILIAL
                    WHERE 
                    TabUsuarios.Identificacao = {Usuario}
                ")
                .FirstOrDefaultAsync() ?? "";

                if (caminhoExec.EndsWith('\\')) caminhoExec = caminhoExec[..^1];

                caminhoExec = caminhoExec + "\\tmp";

                if (!Directory.Exists(caminhoExec)) {
                    Directory.CreateDirectory(caminhoExec);
                }

                var filePath = Path.Combine(caminhoExec, zipFile);
                if (!System.IO.File.Exists(filePath)) {
                    return NotFound($"Arquivo não encontrado\r\n{filePath}");
                } else {
                    stream = System.IO.File.OpenRead(filePath);
                }
            }

            // return the zip file stream directly to Blazor caller
            return File(stream, "application/zip", zipFile);
        }
    }
}