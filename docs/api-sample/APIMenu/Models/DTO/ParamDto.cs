using System.ComponentModel.DataAnnotations.Schema;

namespace ApiMenu.Models.DTO {
    public class ParamDto {
        [Column( "idClienteOS")]
        public int ClientCode { get; set; }
        public string? CaminhoNuvem { get; set; } = string.Empty;
        public string? SenhaCaminhoNuvem { get; set; } = string.Empty;
        public string CaminhoNuvemGenerico { get; set; } = string.Empty;
        public string SenhaCaminhoNuvemGenerico {  get; set; } = string.Empty;
        [Column("CK_EXEC_NUVEM")]
        public int ExecNumvem { get; set; }
    }
}
