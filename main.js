const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const StreamZip = require('node-stream-zip');
const { spawn, exec } = require('child_process');
const os = require('os');

// Configuration
let appConfig = {
  apiBaseUrl: process.env.CDI_URL_API_MENU || '',
  caminhoExecLocal: process.env.CDI_CAMINHO_EXEC_LOCAL || ''
};

// Normalize API base: ensure it ends with '/api' (no trailing slash)
function normalizeApiBase(url) {
  if (!url) return url;
  // Trim whitespace
  url = url.trim();
  // Remove trailing slashes
  url = url.replace(/\/+$|\s+$/g, '');
  if (!/\/api$/i.test(url)) {
    // Remove any trailing slash then append /api
    url = url.replace(/\/+$/g, '') + '/api';
  }
  return url.replace(/\/+$/g, '');
}

// Apply normalization at startup
appConfig.apiBaseUrl = normalizeApiBase(appConfig.apiBaseUrl);

// Auth state
let authToken = null;
let currentUser = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('login.html');
  
  // Only open dev tools in development
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
ipcMain.handle('get-config', () => {
  return appConfig;
});

ipcMain.handle('set-config', (event, key, value) => {
  if (key === 'apiBaseUrl') {
    appConfig[key] = normalizeApiBase(value);
  } else {
    appConfig[key] = value;
  }
  return true;
});

// Auth API handlers
ipcMain.handle('api-status', async () => {
  try {
    if (!appConfig.apiBaseUrl) return false;
    const response = await axios.get(`${appConfig.apiBaseUrl}/status`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('API Status error:', error.message, error.response ? error.response.data : '');
    return false;
  }
});

ipcMain.handle('api-login', async (event, { username, password }) => {
  try {
    // Try legacy/auth path first (some deployments use /auth/login)
    let response;
    try {
      response = await axios.post(`${appConfig.apiBaseUrl}/auth/login`, {
        username,
        password
      });
    } catch (err) {
      // If the endpoint does not exist (404), we'll try the alternative documented API below
      if (err.response && err.response.status === 404) {
        response = null;
      } else {
        throw err;
      }
    }

    // If we got a response from /auth/login handle its expected shape
    if (response && response.data) {
      // older variant: { success: true, token, user }
      if (response.data.success === true) {
        authToken = response.data.token || response.data.accessToken;
        currentUser = response.data.user || null;
        return { success: true, user: currentUser, token: authToken };
      }

      // newer variant may return tokens directly
      if (response.data.token || response.data.accessToken) {
        authToken = response.data.token || response.data.accessToken;
        currentUser = response.data.user || null;
        return { success: true, user: currentUser, token: authToken };
      }

      // otherwise fall through to try documented endpoint
    }

    // Fallback: documented API sample exposes POST /login (under route prefix api/ at server)
    // The sample expects DTO keys like Usuario and Senha. Map accordingly.
    response = await axios.post(`${appConfig.apiBaseUrl}/login`, {
      Usuario: username,
      Senha: password
    });

    // Sample /login returns { accessToken, refreshToken, ... }
    if (response && response.data) {
      const token = response.data.accessToken || response.data.access_token || response.data.token;
      if (token) {
        authToken = token;
        // The sample doesn't always include a full user object; store minimal info
        currentUser = { username };
        return { success: true, user: currentUser, token: authToken };
      }

      // If login failed with a message
      return { success: false, message: response.data.message || 'Login falhou' };
    }

    return { success: false, message: 'Login falhou' };
  } catch (error) {
    console.error('Login error:', error.message, error.response ? error.response.data : '');
    const body = error.response && error.response.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
    return { success: false, message: `Erro ao conectar com o servidor: ${body}` };
  }
});

ipcMain.handle('api-logout', () => {
  authToken = null;
  currentUser = null;
  return true;
});

ipcMain.handle('get-auth-state', () => {
  return { 
    isAuthenticated: !!authToken, 
    user: currentUser, 
    token: authToken 
  };
});

// Menu/Systems API handlers
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

// Process management handlers
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

// File operations
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

ipcMain.handle('move-file', (event, source, destination) => {
  try {
    fs.renameSync(source, destination);
    return true;
  } catch (error) {
    console.error('Move file error:', error.message);
    return false;
  }
});

// Navigation handler
ipcMain.handle('navigate-to-main', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.loadFile('index.html');
});

ipcMain.handle('navigate-to-login', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.loadFile('login.html');
});
