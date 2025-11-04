using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ApiMenu.Models {
    [Table("LOG_CDI")]
    public class LogCDI {
        [Key]
        [Column("ID_LOG_CDI")]
        public int? Id { get; set; }
        public string Usuario { get; set; } = string.Empty;
        public string Tabela { get; set; } = string.Empty;
        public string Operacao { get; set; } = string.Empty;
        [Column("DATA_HORA")]
        public DateTime DataHora { get; set; }
        [Column("ID_REGISTRO")]
        public int IdRegistro { get; set; }
        [Column("INSTRUCAO_REALIZADA")]
        public string InstrucaoRealizada { get; set; } = string.Empty;
        [Column("ID_PROGRAMA")]
        public int IdPrograma { get; set; }
        public string? Observacao { get; set; }
    }
}
