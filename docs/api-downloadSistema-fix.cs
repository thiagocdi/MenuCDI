// SUGGESTED CHANGES to /downloadSistema endpoint
// Fix: Support both network paths and local paths for zip file location

[HttpPost("downloadSistema")]
public async Task<IActionResult> DownloadSistema([FromQuery] int? IdSistema) {
    StringBuilder sql = new();
    var Usuario = User.Identity?.Name;

    if (IdSistema == null || IdSistema == 0) {
        return BadRequest("Informe o sistema");
    }

    // ... existing sistema query code ...

    string zipFile = $"{sistema.NomeExe}.zip";

    Stream stream = new MemoryStream();
    if (param?.ExecNumvem == 1) {
        // DOWNLOAD DA NUVEM (unchanged)
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

        // FIX 1: Try multiple locations for the zip file
        var possiblePaths = new List<string>();
        
        // Option A: Network path tmp folder (original logic)
        possiblePaths.Add(Path.Combine(caminhoExec, "tmp", zipFile));
        
        // Option B: Local converted path (if running on server machine)
        // Convert \\Servidor\c\Exec to C:\Exec
        if (caminhoExec.StartsWith("\\\\")) {
            var parts = caminhoExec.Split('\\', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 3) {
                // parts[0] = server name, parts[1] = share name (e.g., "c"), parts[2+] = path
                var localPath = parts[1].ToUpper() + ":\\" + string.Join("\\", parts.Skip(2));
                possiblePaths.Add(Path.Combine(localPath, "tmp", zipFile));
            }
        }
        
        // Option C: Direct caminhoExec without tmp subdirectory
        possiblePaths.Add(Path.Combine(caminhoExec, zipFile));

        string? foundPath = null;
        foreach (var testPath in possiblePaths) {
            if (System.IO.File.Exists(testPath)) {
                foundPath = testPath;
                break;
            }
        }

        if (foundPath == null) {
            var attemptedPaths = string.Join("\r\n", possiblePaths);
            return NotFound($"Arquivo não encontrado em nenhum dos locais:\r\n{attemptedPaths}");
        }

        stream = System.IO.File.OpenRead(foundPath);
    }

    return File(stream, "application/zip", zipFile);
}
