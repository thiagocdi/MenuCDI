using ApiMenu.Infra.Data;
using ApiMenu.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Win32;

namespace ApiMenu {
    public static class Global {
        public async static Task GravaLog(SqlContext sqlContextComplemento, string usuario, int idPrograma, string tabela, string operacao, int idRegistro, string instrucaoRealizada, string? observacao = "") {
            await sqlContextComplemento.LogCDI.AddAsync(new LogCDI {
                Usuario = usuario,
                IdPrograma = idPrograma,
                Tabela = tabela,
                Operacao = operacao,
                IdRegistro = idRegistro,
                InstrucaoRealizada = instrucaoRealizada,
                Observacao = observacao,
                DataHora = DateTime.Now
            });

            await sqlContextComplemento.SaveChangesAsync();
        }

        public static string GetConnectionString() {
            string? sqlConn = null;
            if (OperatingSystem.IsWindows()) {
                try {
                    using var regKey = Registry.CurrentUser.OpenSubKey(@"Software\CDI\Contas a Receber\Banco de Dados");
                    if (regKey != null) {
                        var localBase = regKey.GetValue("LocalBase") as string;
                        var nomeBase = regKey.GetValue("NomeBase") as string;
                        var nomeUser = regKey.GetValue("NomeUserSQL") as string;
                        var senhaUser = regKey.GetValue("SenhaUserSQL") as string;


                        if (!string.IsNullOrWhiteSpace(localBase) && !string.IsNullOrWhiteSpace(nomeBase)
                            && !string.IsNullOrWhiteSpace(nomeUser) && !string.IsNullOrWhiteSpace(senhaUser)) {

                            Console.WriteLine($"Servidor: {localBase}/{nomeBase} (conforme Registro)");
                            sqlConn = $"Data Source={localBase};Initial Catalog={nomeBase};Persist Security Info=False;User ID={nomeUser};Password={senhaUser};Encrypt=False;";
                        }
                    }
                } catch {
                    // ignore registry read errors and fallback to environment variable
                }
            }

            if (string.IsNullOrWhiteSpace(sqlConn)) {
                sqlConn = Environment.GetEnvironmentVariable("CDI_SQL_CONNECTION_STRING");
                //extrai Data Source e Initial Catalog to write connection log
                var csb = new SqlConnectionStringBuilder(sqlConn);
                var localBase = csb.DataSource;       // "cdi-info-003"
                var nomeBase  = csb.InitialCatalog;   // "Barbi"

                Console.WriteLine($"Servidor: {localBase}/{nomeBase} (conforme CDI_SQL_CONNECTION_STRING)");
            }

            if (string.IsNullOrWhiteSpace(sqlConn)) {
                throw new InvalidOperationException("Database connection string not found: check registry key 'HKEY_CURRENT_USER\\Software\\CDI\\Contas a Receber\\Banco de Dados' or CDI_SQL_CONNECTION_STRING environment variable.");
            }

            return sqlConn;
        }

        public static string FngMudaNome(string txt) {
            if (string.IsNullOrWhiteSpace(txt))
                return string.Empty;

            txt = txt.Trim();

            // elimina letras acentuadas e substitui por grupos
            txt = txt.Replace("á", "a")
                     .Replace("à", "a")
                     .Replace("â", "a")
                     .Replace("ä", "a")
                     .Replace("ã", "a")
                     .Replace("a", "[aáàâäã]");

            txt = txt.Replace("é", "e")
                     .Replace("è", "e")
                     .Replace("ê", "e")
                     .Replace("ë", "e")
                     .Replace("e", "[eéèêë]");

            txt = txt.Replace("í", "i")
                     .Replace("ì", "i")
                     .Replace("î", "i")
                     .Replace("ï", "i")
                     .Replace("ý", "i")
                     .Replace("ÿ", "i")
                     .Replace("y", "i")
                     .Replace("i", "[iíìîïyÿý]");

            txt = txt.Replace("ó", "o")
                     .Replace("ò", "o")
                     .Replace("ô", "o")
                     .Replace("ö", "o")
                     .Replace("õ", "o")
                     .Replace("o", "[oóòôöõ]");

            txt = txt.Replace("ú", "u")
                     .Replace("ù", "u")
                     .Replace("û", "u")
                     .Replace("ü", "u")
                     .Replace("u", "[uúùûü]");

            txt = txt.Replace("ñ", "n")
                     .Replace("n", "[nñ]");

            txt = txt.Replace("ç", "c")
                     .Replace("k", "c")
                     .Replace("c", "[cçk]");

            txt = txt.Replace("z", "s")
                     .Replace("s", "[sz]");

            txt = txt.Replace("w", "v")
                     .Replace("v", "[wv]");

            txt = txt.Replace(" ", "%");

            // elimina duplicado de %
            while (txt.Contains("%%")) {
                txt = txt.Replace("%%", "%");
            }

            return txt;
        }


    }
}
