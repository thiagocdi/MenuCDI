namespace ApiMenu.Models.Views {
    public class ViewProgramas {
        public int IdPrograma { get; set; }
        public string Descricao { get; set; } = string.Empty;
        public string Pagina { get; set; } = string.Empty;
        public string? Icon { get; set; } = string.Empty;
        public int Acesso { get; set; }
    }
}