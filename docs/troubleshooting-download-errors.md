# Troubleshooting - Erros de Download de Sistemas

## Visão Geral
Este documento explica os erros comuns ao fazer download de executáveis e como diagnosticá-los usando os logs melhorados.

## Códigos de Erro e Soluções

### SERVER_ERROR_500 ⚠️ ERRO CRÍTICO
**Sintoma:** "Request failed with status code 500" ou "Erro interno no servidor"

**Causa:** Erro interno no servidor da API ao processar o download. Este é um **erro do backend**, não do computador cliente.

**Possíveis causas no servidor:**
- Arquivo ZIP não existe no caminho configurado no servidor
- Permissões incorretas no servidor para acessar o arquivo
- Caminho do arquivo malformado ou incorreto no banco de dados
- Erro ao ler ou processar o arquivo no servidor
- Banco de dados com dados inconsistentes para este sistema
- Exceção não tratada no código da API

**Solução:**
1. **IMPORTANTE:** Este erro precisa ser investigado no servidor/API, não no cliente!
2. Verifique os logs do servidor da API (backend)
3. Confirme que o arquivo existe no servidor: verifique o caminho configurado para o sistema ID
4. Verifique permissões de leitura do arquivo no servidor
5. Teste o endpoint manualmente com Postman/curl:
   ```bash
   curl -X POST "https://api.exemplo.com/downloadSistema?IdSistema=1" \
        -H "Authorization: Bearer SEU_TOKEN" \
        --output test.zip
   ```
6. Verifique o banco de dados: o registro do sistema tem caminho correto?
7. Revise o código do endpoint `/downloadSistema` no backend

**Logs esperados no cliente:**
```
[Download] ERROR DETAILS: {
  httpStatus: 500,
  httpStatusText: 'Internal Server Error',
  responseBody: '...',  // <-- Importante verificar
  ...
}
[Download] SERVER ERROR 500 - Server-side issue for system 1
```

### PERMISSION_DENIED (EACCES)
**Sintoma:** "Sem permissão de acesso ao diretório temporário"

**Causa:** O usuário não tem permissões de escrita na pasta TEMP.

**Solução:**
1. Execute o aplicativo como Administrador
2. Verifique permissões da pasta: `%TEMP%\MenuCDI-Downloads`
3. Limpe a pasta TEMP se necessário: `cleanmgr`

### DISK_FULL (ENOSPC)
**Sintoma:** "Espaço em disco insuficiente para download"

**Causa:** Não há espaço suficiente no drive que contém a pasta TEMP.

**Solução:**
1. Libere espaço em disco
2. Limpe arquivos temporários
3. Verifique se há pelo menos 500MB livres

### PATH_NOT_FOUND (ENOENT)
**Sintoma:** "Caminho não encontrado"

**Causa:** O diretório temporário não pode ser criado ou acessado.

**Solução:**
1. Verifique se a variável `%TEMP%` está configurada corretamente
2. Execute: `echo %TEMP%` no CMD
3. Recrie a pasta temporária manualmente

### TIMEOUT
**Sintoma:** "Tempo de download esgotado"

**Causa:** Conexão lenta ou instável com o servidor (timeout de 60 segundos).

**Solução:**
1. Verifique a conexão de internet
2. Teste conectividade: `ping api.exemplo.com`
3. Tente novamente em horário com menos tráfego

### CONNECTION_FAILED (ECONNREFUSED/ENOTFOUND)
**Sintoma:** "Não foi possível conectar ao servidor"

**Causa:** Servidor inacessível ou problemas de DNS/rede.

**Solução:**
1. Verifique se o servidor está online
2. Teste conectividade de rede
3. Verifique firewall/proxy
4. Confirme URL da API nas variáveis de ambiente

### FILE_NOT_FOUND
**Sintoma:** "Arquivo não disponível no servidor"

**Causa:** O arquivo ZIP não existe no servidor para este sistema.

**Solução:**
1. Contate o administrador do sistema
2. Verifique se o sistema foi publicado corretamente
3. Confirme o ID do sistema

### UNAUTHORIZED (401/403)
**Sintoma:** "Sem autorização para fazer download"

**Causa:** Token de autenticação expirado ou inválido.

**Solução:**
1. Faça logout e login novamente
2. Verifique se o usuário tem permissão para acessar o sistema
3. Contate o administrador se o problema persistir

### ENDPOINT_NOT_FOUND (404)
**Sintoma:** "Endpoint de download não encontrado"

**Causa:** URL da API está incorreta ou o endpoint foi removido.

**Solução:**
1. Verifique a variável `CDI_URL_API_MENU`
2. Confirme que a API está na versão correta
3. Contate o desenvolvedor

## Como Interpretar os Logs

### Logs Normais (Sucesso)
```
[Download] Starting download for system ID: 123
[Download] Making API request to: https://api.exemplo.com/downloadSistema
[Download] Response received - Status: 200 Content-Type: application/zip
[Download] Temp directory: C:\Users\...\AppData\Local\Temp\MenuCDI-Downloads
[Download] Creating temp directory: ...
[Download] Target file path: ...\sistema-123.zip
[Download] Write permission verified for: ...
[Download] Starting file write to: ...
[Download] Stream pipe started
[Download] Write finished. Total bytes written: 1234567
[Download] File saved successfully:
  - Path: C:\...\sistema-123.zip
  - Size: 1234567 bytes
  - Created: 2026-01-07T...
```

### Logs de Erro
Quando ocorre um erro, procure por:
```
[Download] ERROR DETAILS: {
  errorType: 'Error',
  errorMessage: '...',
  errorCode: 'EACCES',  // <-- Código do erro do sistema
  status: ...,           // <-- Status HTTP (se aplicável)
  ...
}
[Download] Throwing error with code: PERMISSION_DENIED  // <-- Código customizado
```

## Checklist de Diagnóstico

Quando um computador específico está com problemas:

1. **Verificar logs no console** (F12 no Electron)
   - Procure por `[Download] ERROR DETAILS`
   - Anote o `errorCode` e `errorMessage`

2. **Verificar permissões**
   ```cmd
   icacls "%TEMP%"
   ```

3. **Verificar espaço em disco**
   ```cmd
   wmic logicaldisk get caption,freespace
   ```

4. **Verificar conectividade**
   ```cmd
   ping api.exemplo.com
   curl -I https://api.exemplo.com/downloadSistema
   ```

5. **Verificar variáveis de ambiente**
   ```cmd
   echo %TEMP%
   echo %CDI_URL_API_MENU%
   echo %CDI_CAMINHO_EXEC_LOCAL%
   ```

6. **Testar manualmente a criação de arquivo**
   ```powershell
   New-Item -Path "$env:TEMP\MenuCDI-Downloads\test.txt" -ItemType File -Force
   ```

## Melhorias Implementadas (Janeiro 2026)

### 1. Logging Detalhado
- Log de cada etapa do download
- Informações sobre permissões, tamanho do arquivo, tempo
- Stack trace completo em caso de erro

### 2. Códigos de Erro Específicos
- Mapeamento de erros do sistema para códigos legíveis
- Mensagens de erro em português
- Sugestões de solução para cada tipo de erro

### 3. Validações Adicionais
- Verificação de permissões antes de escrever
- Validação de arquivo criado (size > 0)
- Timeout configurável (60 segundos)
- Monitoramento de bytes escritos

### 4. Mensagens de Usuário Melhoradas
- Toast notifications com cores apropriadas
- Mensagens específicas por tipo de erro
- Duração aumentada para erros (8 segundos)

## Contato de Suporte
Se o problema persistir após seguir este guia:
1. Colete os logs completos do console (F12)
2. Execute o checklist de diagnóstico
3. Envie as informações para a equipe de desenvolvimento
