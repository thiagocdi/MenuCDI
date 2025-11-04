using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ApiMenu.Models.DTO {
    [Table("tabSistemasCDI")]
    public class SistemasDto {
        [Key]
        [Column("Codigo")]
        public int IdSistema { get; set; }
        public string Descricao { get; set; } = string.Empty;
        public string NomeExe { get; set; } = string.Empty;
        [Column("NRO_VERSAO")]
        public string? Versao { get; set; }
        [Column("DT_VERSAO")]
        public DateTime? DataVersao { get; set; }
        public string? Icon { get; set; }
        public int Generico { get; set; }
    }
}
