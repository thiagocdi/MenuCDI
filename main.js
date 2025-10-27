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

// Auth state
let authToken = null;
let currentUser = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
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
  appConfig[key] = value;
  return true;
});

// Auth API handlers
ipcMain.handle('api-status', async () => {
  try {
    if (!appConfig.apiBaseUrl) return false;
    const response = await axios.get(`${appConfig.apiBaseUrl}/status`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('API Status error:', error.message);
    return false;
  }
});

ipcMain.handle('api-login', async (event, { username, password }) => {
  try {
    const response = await axios.post(`${appConfig.apiBaseUrl}/auth/login`, {
      username,
      password
    });
    
    if (response.data.success) {
      authToken = response.data.token;
      currentUser = response.data.user;
      return { success: true, user: currentUser, token: authToken };
    }
    return { success: false, message: response.data.message };
  } catch (error) {
    console.error('Login error:', error.message);
    return { success: false, message: 'Erro ao conectar com o servidor' };
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
    
    const response = await axios.get(`${appConfig.apiBaseUrl}/sistemas/menu`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    return response.data;
  } catch (error) {
    console.error('Get systems error:', error.message);
    throw error;
  }
});

ipcMain.handle('api-get-system-version', async (event, systemId) => {
  try {
    if (!authToken) throw new Error('Not authenticated');
    
    const response = await axios.get(`${appConfig.apiBaseUrl}/sistemas/${systemId}/versao`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    return response.data;
  } catch (error) {
    console.error('Get system version error:', error.message);
    throw error;
  }
});

ipcMain.handle('api-download-system', async (event, systemId) => {
  try {
    if (!authToken) throw new Error('Not authenticated');
    
    const response = await axios.get(`${appConfig.apiBaseUrl}/sistemas/${systemId}/download`, {
      headers: { Authorization: `Bearer ${authToken}` },
      responseType: 'stream'
    });
    
    return response;
  } catch (error) {
    console.error('Download system error:', error.message);
    throw error;
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
    if (!fs.existsSync(exePath)) {
      return { success: false, message: 'Arquivo não encontrado: ' + exePath };
    }

    const process = spawn(exePath, args, {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(exePath)
    });

    process.unref();
    
    return { success: true };
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
