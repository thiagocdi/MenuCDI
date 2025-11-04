using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ApiMenu.Models {
    [Table("TabUsuarios")]
    public class Usuario {
        [Key]
        [Column("Identificacao")]
        public string Sigla { get; set; } = string.Empty;
        public string Nome { get; set; } = string.Empty;
        public string Senha { get; set; } = string.Empty;
        public int? Filial { get; set; }
    }
}