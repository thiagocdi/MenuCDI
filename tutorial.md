# Tutorial de distribuição — MenuCDI 1.0.1 (pt-BR)

Este documento explica o procedimento recomendado para distribuir e instalar o MenuCDI usando o arquivo `MenuCDI 1.0.1.zip` (que contém a pasta `win-unpacked`) em máquinas clientes.

Resumo rápido
- Extrair `MenuCDI 1.0.1.zip` dentro da pasta local `Exec` do cliente (ex.: `C:\Exec\win-unpacked`).
- Criar atalho na área de trabalho apontando para `C:\Exec\win-unpacked\MenuCDI.exe`.
- Reaplicar o arquivo `.reg` do cliente para garantir a chave de registro:
  `HKEY_CURRENT_USER\Software\CDI` → valor `ApiBaseUrl` (REG_SZ).
- A API (ApiMenu) já deve estar configurada e em execução no servidor antes do teste.
- Testar: executar `MenuCDI.exe`, fazer login e abrir sistemas.

Passo a passo

1) Preparar pasta de destino
- No computador do cliente crie (se não existir) a pasta onde será colocado o aplicativo:
  - Exemplo: `C:\Exec`
- Extraia o conteúdo de `MenuCDI 1.0.1.zip` de forma que a estrutura fique:
  ```
  C:\Exec\win-unpacked\
    ├─ MenuCDI.exe
    ├─ resources/
    └─ ...
  ```

2) Criar atalho na Área de Trabalho
- Localize `C:\Exec\win-unpacked\MenuCDI.exe`.
- Clique com o botão direito → Enviar para → Área de trabalho (criar atalho).
- (Opcional) Ajuste ícone/propriedades do atalho conforme necessário.

3) Aplicar/Executar arquivo .reg (configurar ApiBaseUrl)
- Antes de testar, confirme que a API do Menu (ApiMenu) no servidor do cliente está configurada e em execução (ex.: `http://servidor:8000/api`).
- Uma única vez no usuário que irá executar o MenuCDI é necessário aplicar o arquivo `.reg` da empresa para criar/atualizar a chave:
  - Chave: `HKEY_CURRENT_USER\Software\CDI`
  - Valor: `ApiBaseUrl` (tipo REG_SZ) — deve conter a URL base da API com `/api` no final.
  - Exemplo (valor que deve ficar exatamente como string):  
    `"ApiBaseUrl"="http://servidor:8000/api"`
  - Atenção: substituir `servidor` pelo nome real do servidor do cliente (ou IP) para que o caminho fique correto.
- Exemplo de conteúdo do arquivo `client-api.reg`:
  ```reg
  Windows Registry Editor Version 5.00

  [HKEY_CURRENT_USER\Software\CDI]
  "ApiBaseUrl"="http://servidor:8000/api"
  ```
- Como aplicar:
  - Salve o conteúdo acima como `client-api.reg`.
  - Clique duas vezes no arquivo e confirme a importação.
  - IMPORTANTE: execute o .reg com o mesmo usuário que irá rodar o MenuCDI (HKCU é por usuário). Se o app for executado por outro usuário, o valor deve ser criado nesse usuário.

4) Notas sobre sessão / permissões
- Se as variáveis de ambiente / registry foram alteradas recentemente, pedir ao usuário para:
  - fechar e reabrir o app; ou
  - efetuar logoff/login do Windows (quando aplicável) para garantir leitura correta do HKCU.
- Se o app for executado como serviço ou outro usuário, a chave deve existir no HKCU desse usuário ou usar HKLM (se desejado).

5) Teste funcional (verificar que está tudo ok)
- Duplo-clique no atalho `MenuCDI` na área de trabalho.
- Na tela de login:
  - Informe usuário/senha conforme ambiente.
  - Se receber mensagem "URL da API não configurada", verifique:
    - Conteúdo do valor `HKEY_CURRENT_USER\Software\CDI\ApiBaseUrl`.
    - Se o processo está sendo executado pelo mesmo usuário que tem o registro.
    - Se a URL configurada aponta para um servidor onde a ApiMenu está em execução.
- Após login, abra os sistemas disponíveis e verifique se os executáveis são lançados corretamente.
- Verifique logs/console se necessário (em caso de problemas, consulte logs do app).

6) Problemas comuns e soluções rápidas
- Erro "URL da API não configurada":
  - Confirme `ApiBaseUrl` em `HKCU\Software\CDI`.
  - Verifique se o aplicativo está sendo executado no mesmo usuário (HKCU é por usuário).
  - Verifique se a ApiMenu está em execução no servidor indicado.
- Executável não encontrado / caminho incorreto:
  - Confirme que a pasta pai (`C:\Exec`) foi detectada corretamente pelo app — o app deriva `caminhoExecLocal` a partir do local do exe (pasta pai de `win-unpacked`).
  - Se necessário, defina explicitamente `CDI_CAMINHO_EXEC_LOCAL` como variável de ambiente para o usuário.
- Permissões / antivírus:
  - Se o arquivo não executa ou é bloqueado, libere no antivírus/SmartScreen ou assine o binário (recomendado para produção).
- Atualizações repetidas (mesma versão):
  - Caso o app baixe atualizações repetidas, verifique o formato da versão no servidor e se o `ApiBaseUrl` está apontando para a API correta.

7) Checklist final para suporte antes de entregar ao cliente
- [ ] `C:\Exec\win-unpacked\` criado com `MenuCDI.exe`.
- [ ] Atalho criado na área de trabalho.
- [ ] `client-api.reg` importado com `ApiBaseUrl` correto no HKCU.
- [ ] ApiMenu no servidor do cliente está configurada e em execução.
- [ ] Executou o MenuCDI e fez login com sucesso.
- [ ] Abriu pelo menos um sistema e confirmou que o executável local abre corretamente.

Contato / logs
- Se houver falha, solicite ao cliente a captura do console/erro exibido pelo app e a saída do registro:
  - Abra `regedit` → navegue até `HKEY_CURRENT_USER\Software\CDI` → confirme `ApiBaseUrl`.
- Em caso de dúvidas, forneça logs de erro do app para a equipe de desenvolvimento.

----  
Fim do tutorial.