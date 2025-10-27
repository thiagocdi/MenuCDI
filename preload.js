const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
  
  // Authentication
  checkApiStatus: () => ipcRenderer.invoke('api-status'),
  login: (credentials) => ipcRenderer.invoke('api-login', credentials),
  logout: () => ipcRenderer.invoke('api-logout'),
  getAuthState: () => ipcRenderer.invoke('get-auth-state'),
  
  // Systems/Menu
  getSystems: () => ipcRenderer.invoke('api-get-systems'),
  getSystemVersion: (systemId) => ipcRenderer.invoke('api-get-system-version', systemId),
  downloadSystem: (systemId) => ipcRenderer.invoke('api-download-system', systemId),
  
  // Process management
  checkProcess: (processName) => ipcRenderer.invoke('check-process', processName),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  
  // File operations
  launchExe: (exePath, args) => ipcRenderer.invoke('launch-exe', exePath, args),
  getFileVersion: (filePath) => ipcRenderer.invoke('get-file-version', filePath),
  ensureDirectory: (dirPath) => ipcRenderer.invoke('ensure-directory', dirPath),
  moveFile: (source, destination) => ipcRenderer.invoke('move-file', source, destination),
  
  // Navigation
  navigateToMain: () => ipcRenderer.invoke('navigate-to-main'),
  navigateToLogin: () => ipcRenderer.invoke('navigate-to-login')
});
