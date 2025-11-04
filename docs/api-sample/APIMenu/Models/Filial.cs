using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ApiMenu.Models {
    [Table("Filial")]
    public class Filial {
        [Key]
        [Column("Filial")]
        public int Id { get; set; }
        [Column("Descricao")]
        public string Nome { get; set; } = string.Empty;
    }
}