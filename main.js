// Módulos do Electron e Node.js usados pela aplicação
// - app / BrowserWindow: controle da janela principal e ciclo de vida
// - ipcMain: handlers para comunicação renderer -> main (invokes)
// - shell: abrir caminhos/URLs no SO (p.ex. abrir pasta/exe)
// - nativeImage: carregar imagens/icones nativos (para taskbar)
const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path = require('path'); // manipulação de caminhos cross-platform
const fs = require('fs'); // acesso ao sistema de arquivos
const axios = require('axios'); // cliente HTTP para chamadas de API
const StreamZip = require('node-stream-zip'); // leitura/extração de ZIPs (usado em updates)
const { spawn, exec } = require('child_process'); // spawn/exec para gerenciar processos
const os = require('os'); // informações do sistema

// Configuration
let appConfig = {
  apiBaseUrl: process.env.CDI_URL_API_MENU || '',
  caminhoExecLocal: process.env.CDI_CAMINHO_EXEC_LOCAL || ''
};

/**
 * normalizeApiBase(url)
 *
 * Normaliza a URL base da API garantindo que termine com '/api' sem barras
 * extras. Aceita strings vazias e retorna a mesma entrada quando vazia.
 *
 * Por que: várias versões do backend usam ou não o sufixo '/api'.
 * Padronizando aqui evitamos construir URLs inconsistentes pelo código.
 *
 * @param {string} url - URL base fornecida via variável de ambiente/config
 * @returns {string} url normalizada terminando em '/api' (sem barra final)
 */
function normalizeApiBase(url) {
  if (!url) return url;
  // remove espaços em branco nas pontas
  url = url.trim();
  // remove barras finais redundantes
  url = url.replace(/\/+$/g, '');
  // se não terminar em '/api', anexa
  if (!/\/api$/i.test(url)) {
    url = url + '/api';
  }
  // garante que não tenha barra final
  return url.replace(/\/+$/g, '');
}

// Apply normalization at startup
appConfig.apiBaseUrl = normalizeApiBase(appConfig.apiBaseUrl);

// Auth state
let authToken = null;
let currentUser = null;
let currentCompany = null;

// Ensure AppUserModelId is set on Windows so taskbar icons and notifications work correctly
if (process.platform === 'win32') {
  try {
    app.setAppUserModelId(appConfig.appId || 'com.cdi.menu');
  } catch (e) {
    // ignore if not supported
  }
}

/**
 * createWindow()
 *
 * Cria a janela principal da aplicação Electron. Configura o ícone
 * (dev) e as preferências de webContents (preload, contextIsolation).
 * Mantemos configurações mínimas compatíveis com Windows e segurança.
 *
 * Observações:
 * - `useContentSize` não é aplicado aqui, escolhemos dimensões do frame
 * - Caso queira persistir posição/tamanho do usuário, implementar um
 *   armazenamento de estado (não implementado neste patch)
 */
function createWindow() {
  // Tenta carregar o ícone local para mostrar durante desenvolvimento
  const iconPath = path.join(__dirname, 'assets', 'images', 'icon.ico');
  let iconImage = null;
  try {
    if (fs.existsSync(iconPath)) {
      iconImage = nativeImage.createFromPath(iconPath);
    }
  } catch (e) {
    // se algo falhar no carregamento do ícone, apenas ignoramos e continuamos
    iconImage = null;
  }

  const win = new BrowserWindow({
    width: 420,
    height: 700,
    icon: iconImage || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // por segurança, mantemos nodeIntegration desligado e contextIsolation ligado
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Carrega a tela de login como página inicial
  win.loadFile('login.html');

  // Em ambiente de desenvolvimento abrimos as DevTools para facilitar debug
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  return win;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Configuration handlers
/**
 * Handler: get-config
 * Retorna a configuração atual carregada no processo principal.
 * Usado pelo renderer para obter valores como apiBaseUrl e caminhoExecLocal.
 */
ipcMain.handle('get-config', () => {
  return appConfig;
});

/**
 * Handler: set-config
 * Atualiza uma chave de configuração armazenada em memória no main process.
 * - Se a chave for `apiBaseUrl`, normalizamos o valor via normalizeApiBase.
 * Retorna true se a atualização foi aplicada.
 */
ipcMain.handle('set-config', (event, key, value) => {
  if (key === 'apiBaseUrl') {
    appConfig[key] = normalizeApiBase(value);
  } else {
    appConfig[key] = value;
  }
  return true;
});

// Auth API handlers
/**
 * Handler: api-status
 * Verifica se a API está acessível. Útil para mostrar erros de conectividade
 * antes do usuário tentar logar.
 * Retorna booleano (true = API respondeu 200).
 */
ipcMain.handle('api-status', async () => {
  try {
    if (!appConfig.apiBaseUrl) return false;
    const response = await axios.get(`${appConfig.apiBaseUrl}/status`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    // Log seguro: evite serializar objetos grandes/circulares
    console.error('API Status error:', error.message, error.response ? error.response.data : '');
    return false;
  }
});

/**
 * Handler: api-login
 * Faz a chamada de login para a API. Mapeamos o formato esperado pelo backend
 * e normalizamos tokens/objetos retornados.
 * Retornos possíveis:
 * - { success: true, user, token, ... }
 * - { success: false, message }
 */
ipcMain.handle('api-login', async (event, { username, password, newPassword = '' }) => {
  try {
    // Chamada principal ao endpoint de login (padrão documentado neste projeto)
    let response = await axios.post(`${appConfig.apiBaseUrl}/loginMenu`, {
      Username: username,
      Password: password,
      NewPassword: newPassword
    });

    if (response && response.data) {
      // Alguns backends retornam accessToken ou token; aceitamos ambos
      const token = response.data.accessToken || response.data.access_token || response.data.token;
      if (token) {
        authToken = token;
        // Armazena informação mínima do usuário (pode ser enriquecida conforme API)
        currentUser = { username };
        return {
          success: true,
          user: currentUser,
          userName: (response.data.user && response.data.user.name) || '',
          token: authToken,
          companyName: (response.data.user && response.data.user.companyName) || ''
        };
      }

      // Se login falhou, o backend pode retornar uma mensagem explicativa
      return { success: false, message: response.data.message || 'Login falhou' };
    }

    return { success: false, message: 'Login falhou' };
  } catch (error) {
    // Log detalhado para debug: não serializamos objetos circulares
    console.error('Login error:', error.message, error.response ? error.response.data : '');
    const body = error.response && error.response.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
    return { success: false, message: `Erro ao conectar com o servidor: ${body}` };
  }
});

/**
 * Handler: api-logout
 * Limpa o estado de autenticação mantido no processo principal.
 */
ipcMain.handle('api-logout', () => {
  authToken = null;
  currentUser = null;
  return true;
});

/**
 * Handler: get-auth-state
 * Retorna o estado atual de autenticação para o renderer (usado em inicialização).
 */
ipcMain.handle('get-auth-state', () => {
  return {
    isAuthenticated: !!authToken,
    user: currentUser,
    token: authToken
  };
});

/**
 * Handler: api-get-systems
 * Busca a lista de sistemas/sistemasMenu disponíveis para o usuário autenticado.
 * - Tenta um endpoint "legado" primeiro (/sistemas/menu) e depois a rota
 *   documentada (/sistemasMenu). Também descompacta a resposta caso o backend
 *   envolva um wrapper ApiResponse<T> (campo `data`).
 */
ipcMain.handle('api-get-systems', async () => {
  try {
    if (!authToken) throw new Error('Not authenticated');
    // Try legacy endpoint first, then fallback to documented API sample
    let response;
    try {
      response = await axios.get(`${appConfig.apiBaseUrl}/sistemas/menu`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
    } catch (err) {
      if (err.response && err.response.status === 404) {
        response = null;
      } else {
        throw err;
      }
    }

    if (response && response.data) return response.data;

    // Fallback to /sistemasMenu (API sample)
    response = await axios.get(`${appConfig.apiBaseUrl}/sistemasMenu`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    // API sample wraps result in ApiResponse<T>. Try to unwrap if present.
    if (response.data && response.data.data) return response.data.data;
    return response.data;
  } catch (error) {
    const body = error.response && error.response.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
    console.error('Get systems error:', error.message, error.response ? error.response.data : '');
    throw new Error(`Get systems failed: ${body}`);
  }
});

/**
 * Handler: api-get-system-version
 * Recupera a versão do sistema remoto (usada para comparar com a versão local
 * e decidir se há necessidade de download/atualização).
 * - Tenta rota legada e depois `/sistema?IdSistema=...` conforme o sample API.
 */
ipcMain.handle('api-get-system-version', async (event, systemId) => {
  try {
    if (!authToken) throw new Error('Not authenticated');
    // Try legacy route then fallback to API sample's /sistema?IdSistema=...
    let response;
    try {
      response = await axios.get(`${appConfig.apiBaseUrl}/sistemas/${systemId}/versao`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
    } catch (err) {
      if (err.response && err.response.status === 404) {
        response = null;
      } else {
        throw err;
      }
    }

    if (response && response.data) return response.data;

    // Fallback: GET /sistema?IdSistema=123 (API sample)
    response = await axios.get(`${appConfig.apiBaseUrl}/sistema`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { IdSistema: systemId }
    });

    // If wrapped in ApiResponse, unwrap
    if (response.data && response.data.data) return response.data.data;
    return response.data;
  } catch (error) {
    const body = error.response && error.response.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
    console.error('Get system version error:', error.message, error.response ? error.response.data : '');
    throw new Error(`Get system version failed: ${body}`);
  }
});

/**
 * Handler: api-download-system
 * Faz download do binário/zip do sistema no backend como stream e grava em
 * disco na pasta tmp (dentro de appConfig.caminhoExecLocal ou pasta tmp do SO).
 * Retorna { success: true, path } apontando para o arquivo temporário baixado.
 *
 * Observações de implementação:
 * - Usamos responseType: 'stream' e gravamos com createWriteStream para evitar
 *   serializar objetos de stream sobre IPC (causa erros de circular refs).
 * - Caso o backend retorne Content-Disposition com filename, usamos esse nome.
 */
ipcMain.handle('api-download-system', async (event, systemId) => {
  try {
    if (!authToken) throw new Error('Not authenticated');
    // Try legacy path first, fall back to documented POST /downloadSistema?IdSistema=...
    try {
      const legacyResp = await axios.get(`${appConfig.apiBaseUrl}/sistemas/${systemId}/download`, {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'stream'
      });
      // Save stream to temporary file and return a safe object
      const tmpDir = path.join(appConfig.caminhoExecLocal || os.tmpdir(), 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const filename = (legacyResp.headers && legacyResp.headers['content-disposition'])
        ? (legacyResp.headers['content-disposition'].split('filename=')[1] || `${systemId}.zip`).replace(/"/g, '')
        : `${systemId}.zip`;
      const tmpPath = path.join(tmpDir, filename);

      const writer = fs.createWriteStream(tmpPath);
      await new Promise((resolve, reject) => {
        legacyResp.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      return { success: true, path: tmpPath };
    } catch (err) {
      if (!(err.response && err.response.status === 404)) {
        throw err;
      }
      // else fallback below
    }
    // API sample uses POST /downloadSistema with IdSistema as query
    const response = await axios.post(`${appConfig.apiBaseUrl}/downloadSistema`, null, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { IdSistema: systemId },
      responseType: 'stream'
    });

    // Save stream to temp file and return path
    const tmpDir = path.join(appConfig.caminhoExecLocal || os.tmpdir(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filename = (response.headers && response.headers['content-disposition'])
      ? (response.headers['content-disposition'].split('filename=')[1] || `${systemId}.zip`).replace(/"/g, '')
      : `${systemId}.zip`;
    const tmpPath = path.join(tmpDir, filename);

    const writer = fs.createWriteStream(tmpPath);
    await new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return { success: true, path: tmpPath };
  } catch (error) {
    // Avoid serializing the full error/response (may contain circular refs). Log safe fields.
    const status = error.response && error.response.status;
    const statusText = error.response && error.response.statusText;
    console.error('Download system error:', error.message, { status, statusText });
    const body = error.response && error.response.data ? (typeof error.response.data === 'string' ? error.response.data : '[object]') : error.message;
    throw new Error(`Download system failed: ${body}`);
  }
});


/**
 * Handler: check-process
 * Verifica se existe um processo em execução com o nome fornecido.
 * Retorna um array de objetos { name, pid } (no Windows) ou lista de PIDs no Linux.
 * Utiliza comandos nativos (`tasklist` no Windows, `pgrep` em Unix) para compatibilidade.
 */
ipcMain.handle('check-process', (event, processName) => {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' 
      ? `tasklist /FI "IMAGENAME eq ${processName}.exe" /FO CSV /NH`
      : `pgrep ${processName}`;
    
    exec(command, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      
      if (process.platform === 'win32') {
        const lines = stdout.trim().split('\n');
        const processes = lines
          .filter(line => line.includes(processName))
          .map(line => {
            const parts = line.split('","');
            return {
              name: parts[0].replace('"', ''),
              pid: parseInt(parts[1])
            };
          });
        resolve(processes);
      } else {
        const pids = stdout.trim().split('\n').filter(pid => pid);
        resolve(pids.map(pid => ({ pid: parseInt(pid), name: processName })));
      }
    });
  });
});

/**
 * Handler: kill-process
 * Mata um processo pelo PID. Retorna true se a operação aparentemente teve sucesso.
 */
ipcMain.handle('kill-process', (event, pid) => {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' 
      ? `taskkill /PID ${pid} /F`
      : `kill -9 ${pid}`;
    
    exec(command, (error) => {
      resolve(!error);
    });
  });
});


/**
 * Handler: launch-exe
 * Tenta lançar o executável indicado por `exePath` com argumentos `args`.
 * Estratégia aplicada:
 * 1. Gera uma lista de caminhos candidatos normalizados (path.normalize / resolve).
 * 2. Se detectar formatos comuns faltando separador (como "D:\\ExecSHEVendas.exe"),
 *    tenta dividir a string onde o lado esquerdo é um diretório existente e junta com o resto.
 * 3. Se um candidato existir, usa spawn(...) com detached=true para lançar o processo
 *    de forma independente do Electron.
 * 4. Retorna objetos ricos contendo `success`, `launched` ou `tried` para ajudar no debug.
 *
 * Observações:
 * - Evitamos lançar caminhos inválidos diretamente; sempre verificamos fs.existsSync
 * - O retorno `tried` facilita diagnosticar porque um caminho não foi encontrado
 *   (útil quando um nome foi concatenado sem barra, por exemplo).
 */
ipcMain.handle('launch-exe', async (event, exePath, args = []) => {
  try {
    console.log(`launch-exe exePath: ${exePath}`);
    // Try multiple normalized paths before failing to give clearer diagnostics.
    const tried = [];

    function pushTry(p) {
      if (!p) return;
      const normalized = path.normalize(p);
      if (!tried.includes(normalized)) tried.push(normalized);
    }

    pushTry(exePath);
    pushTry(path.resolve(exePath));
    // If path looks like 'D:Something' (missing backslash), insert one: 'D:\Something'
    if (/^[a-zA-Z]:[^\\\/]/.test(exePath)) {
      pushTry(exePath.replace(/^([a-zA-Z]:)/, '$1\\'));
    }
    // If it's a plain filename, try joining with configured caminhoExecLocal
    if (!exePath.includes('\\') && !exePath.includes('/')) {
      if (appConfig.caminhoExecLocal) pushTry(path.join(appConfig.caminhoExecLocal, exePath));
    }

    // Finally, try with a trailing backslash on caminhoExecLocal if present
    if (appConfig.caminhoExecLocal) {
      const base = appConfig.caminhoExecLocal;
      if (!base.endsWith('\\') && !base.endsWith('/')) pushTry(path.join(base + '\\', exePath));
    }

    // Find first existing path
    let found = tried.find(p => {
      try { return fs.existsSync(p); } catch { return false; }
    });

    // If not found yet, attempt to detect a missing separator between an existing folder
    // and the rest of the filename. Example: "D:\ExecSHEVendas.exe" should be
    // split as "D:\ExecSHE" + "Vendas.exe" -> "D:\ExecSHE\Vendas.exe".
    if (!found) {
      try {
        for (let i = 3; i < exePath.length - 1; i++) {
          const left = exePath.slice(0, i);
          const right = exePath.slice(i);
          try {
            if (fs.existsSync(left) && fs.statSync(left).isDirectory()) {
              const candidate = path.join(left, right);
              pushTry(candidate);
              if (fs.existsSync(candidate)) {
                found = candidate;
                break;
              }
            }
          } catch (e) {
            // ignore and continue
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!found) {
      // Return clearer error listing the attempted paths
      return { success: false, message: 'Arquivo não encontrado: ' + exePath, tried };
    }

    const proc = spawn(found, args, {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(found)
    });

    proc.unref();
    return { success: true, launched: found };
  } catch (error) {
    console.error('Launch exe error:', error.message);
    return { success: false, message: error.message };
  }
});

/**
 * Handler: get-file-version
 * Retorna uma indicação simples de versão do arquivo local. Atualmente
 * devolve um objeto com `version` (placeholder) e `modified` (mtime).
 * Nota: para um produto real, implementar leitura de versão do arquivo
 * (ex.: recurso de versão em exe no Windows) em vez deste placeholder.
 */
ipcMain.handle('get-file-version', (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    // For Windows, we'll need to implement version reading
    // For now, return file modification time as version indicator
    const stats = fs.statSync(filePath);
    return {
      version: '1.0.0.0', // Placeholder - implement proper version reading
      modified: stats.mtime
    };
  } catch (error) {
    console.error('Get file version error:', error.message);
    return null;
  }
});

/**
 * Handler: ensure-directory
 * Garante que o diretório exista (cria de forma recursiva se necessário).
 * Retorna true em sucesso, false em falha.
 */
ipcMain.handle('ensure-directory', (event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Ensure directory error:', error.message);
    return false;
  }
});

/**
 * Handler: move-file
 * Move/renomeia um arquivo no filesystem. Retorna true/false indicando sucesso.
 * Observação: fs.renameSync pode falhar se o destino estiver em outro volume;
 * em situações mais complexas, usar copy+unlink.
 */
ipcMain.handle('move-file', (event, source, destination) => {
  try {
    fs.renameSync(source, destination);
    return true;
  } catch (error) {
    console.error('Move file error:', error.message);
    return false;
  }
});


/**
 * Handler: navigate-to-main
 * Carrega a página principal (index.html) na janela que requisitou a navegação.
 */
ipcMain.handle('navigate-to-main', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.loadFile('index.html');
});

/**
 * Handler: navigate-to-login
 * Carrega a tela de login (login.html) na janela que requisitou.
 */
ipcMain.handle('navigate-to-login', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.loadFile('login.html');
});

/**
 * Handler: get-app-version
 * Retorna a versão da aplicação (definida em package.json) para exibição
 * no renderer ou para uso em lógica de atualização.
 */
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});