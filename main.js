// Módulos do Electron e Node.js usados pela aplicação
// - app / BrowserWindow: controle da janela principal e ciclo de vida
// - ipcMain: handlers para comunicação renderer -> main (invokes)
// - shell: abrir caminhos/URLs no SO (p.ex. abrir pasta/exe)
// - nativeImage: carregar imagens/icones nativos (para taskbar)
const { app, BrowserWindow, ipcMain, nativeImage, dialog, } = require("electron");
const path = require("path"); // manipulação de caminhos cross-platform
const fs = require("fs"); // acesso ao sistema de arquivos
const axios = require("axios"); // cliente HTTP para chamadas de API
const StreamZip = require("node-stream-zip"); // leitura/extração de ZIPs (usado em updates)
const { spawn, exec, execSync } = require("child_process"); // spawn/exec/execSync para gerenciar processos e ler registry
const os = require("os"); // informações do sistema
const winVersionInfo = require("win-version-info"); // obter versão do executável no Windows

// CRITICAL: Handle Squirrel events FIRST, before any other app logic
// This must run before app.whenReady() or createWindow()
if (process.platform === 'win32') {
    const handleSquirrelEvent = () => {
        if (process.argv.length === 1) {
            return false;
        }

        const appFolder = path.resolve(process.execPath, '..');
        const rootAtomFolder = path.resolve(appFolder, '..');
        const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
        const exeName = path.basename(process.execPath);

        const spawnSquirrel = function(command, args) {
            let spawnedProcess;
            try {
                spawnedProcess = require('child_process').spawn(command, args, { 
                    detached: true,
                    stdio: 'ignore'
                });
            } catch (error) {
                console.error('Squirrel event error:', error);
            }
            return spawnedProcess;
        };

        const spawnUpdate = function(args) {
            return spawnSquirrel(updateDotExe, args);
        };

        const squirrelEvent = process.argv[1];
        console.log('[Squirrel] Event received:', squirrelEvent);
        
        switch (squirrelEvent) {
            case '--squirrel-install':
            case '--squirrel-updated':
                // Create desktop shortcut with explicit description
                console.log('[Squirrel] Creating shortcuts...');
                spawnUpdate([
                    '--createShortcut', exeName,
                    '--shortcut-locations', 'Desktop,StartMenu',
                    '--shortcutDescription', 'MenuCDI - Launcher de Sistemas CDI'
                ]);
                setTimeout(() => {
                    console.log('[Squirrel] Install/update complete, quitting...');
                    app.quit();
                }, 1000);
                return true;

            case '--squirrel-uninstall':
                // Remove desktop shortcut
                console.log('[Squirrel] Removing shortcuts...');
                spawnUpdate(['--removeShortcut', exeName]);
                setTimeout(() => {
                    console.log('[Squirrel] Uninstall complete, quitting...');
                    app.quit();
                }, 1000);
                return true;

            case '--squirrel-obsolete':
                console.log('[Squirrel] Obsolete version, quitting...');
                app.quit();
                return true;
        }

        return false;
    };

    if (handleSquirrelEvent()) {
        // Squirrel event handled, exit immediately without starting the app
        console.log('[Squirrel] Event handled, exiting process...');
        // Don't run ANY other code - just exit
        return;
    }
}


// Global window reference
let mainWindow = null;

// CRITICAL: Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('[Single Instance] Another instance is already running. Quitting...');
    app.quit();
} else {
    // Handle second instance attempt - focus the existing window
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('[Single Instance] Second instance detected. Focusing existing window...');
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// Configuration
let appConfig = {
    apiBaseUrl: getApiBaseFromEnvOrRegistry() || "",
    caminhoExecLocal: determineCaminhoExecLocal() || "",
};

// Auto-updater initialization (only in packaged mode)
if (app.isPackaged) {
    try {
        const updateElectronApp = require('update-electron-app');
        if (typeof updateElectronApp === 'f') {
            updateElectronApp({
                repo: 'thiagocdi/MenuCDI',
                updateInterval: '5 minutes',
                logger: console,
                notifyUser: true
            });
            console.log('[Auto-Update] Initialized');
        } else {
            console.warn('[Auto-Update] update-electron-app did not return a function');
        }
    } catch (error) {
        console.warn('[Auto-Update] Failed to initialize:', error.message);
    }
} else {
    console.log("[Auto-Update] Skipped in development mode");
}

// Auth state
let authToken = null;
let currentUser = null;

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
    url = url.replace(/\/+$/g, "");
    // se não terminar em '/api', anexa
    if (!/\/api$/i.test(url)) {
        url = url + "/api";
    }
    // garante que não tenha barra final
    return url.replace(/\/+$/g, "");
}

// Apply normalization at startup
appConfig.apiBaseUrl = normalizeApiBase(appConfig.apiBaseUrl);

// Ensure AppUserModelId is set on Windows so taskbar icons and notifications work correctly
if (process.platform === "win32") {
    try {
        app.setAppUserModelId(appConfig.appId || "com.cdi.menu");
    } catch (e) {
        // ignore if not supported
    }
}

function createWindow() {
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

    // Check if appConfig.caminhoExecLocal has the final slash
    if (appConfig.caminhoExecLocal) {
        if (
            !appConfig.caminhoExecLocal.endsWith("\\") &&
            !appConfig.caminhoExecLocal.endsWith("/")
        ) {
            appConfig.caminhoExecLocal += "\\";
        }
    }

    // Tenta carregar o ícone local para mostrar durante desenvolvimento
    const iconPath = path.join(__dirname, "assets", "images", "icon.ico");
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

        useContentSize: true,
        // Esconde a menu bar automaticamente (não remove totalmente)
        autoHideMenuBar: true,

        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            // por segurança, mantemos nodeIntegration desligado e contextIsolation ligado
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Remove o menu completamente quando empacotado (distribuição)
    if (app.isPackaged) {
        //Menu.setApplicationMenu(null);
        // garante que a menu bar não apareça por Alt
        //win.setMenuBarVisibility(false);
    }

    // Carrega a tela de login como página inicial
    win.loadFile("login.html");

    // Em ambiente de desenvolvimento abrimos as DevTools para facilitar debug
    if (process.env.NODE_ENV === "development") {
        win.webContents.openDevTools();
    }

    // Aviso para administradores/usuários se o caminho base não estiver definido
    if (
        !appConfig.caminhoExecLocal ||
        appConfig.caminhoExecLocal.trim() === ""
    ) {
        // Mostra uma mensagem modal curta orientando o que fazer (rodar o instalador ou criar a chave de registro)
        try {
            dialog.showMessageBox(win, {
                type: "info",
                title: "Caminho base não encontrado",
                message:
                    "O caminho base para os executáveis não foi localizado.\n\n" +
                    "Solução:\n" +
                    " - Crie o caminho C:\\Exec ou\n" +
                    " - Crie a chave de registro: HKCU\\Software\\CDI\\CaminhoExecLocal com o caminho Exec local do usuário\n\n" +
                    "Após isso, reinicie o MenuCDI.",
                buttons: ["OK"],
            });
        } catch (e) {
            console.warn(
                "Falha ao exibir aviso de caminho base:",
                e && e.message
            );
        }
    }

    return win;
}

app.whenReady().then(() => {
    mainWindow = createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-config", () => {
/**
 * Handler: get-config
 * Retorna a configuração atual carregada no processo principal.
 * Usado pelo renderer para obter valores como apiBaseUrl e caminhoExecLocal.
 */

    return appConfig;
});

ipcMain.handle("set-config", (event, key, value) => {
/**
 * Handler: set-config
 * Atualiza uma chave de configuração armazenada em memória no main process.
 * - Se a chave for `apiBaseUrl`, normalizamos o valor via normalizeApiBase.
 * Retorna true se a atualização foi aplicada.
 */

    if (key === "apiBaseUrl") {
        appConfig[key] = normalizeApiBase(value);
    } else {
        appConfig[key] = value;
    }
    return true;
});

ipcMain.handle("get-local-temp-dir", () => {
/**
 * Handler: get-local-temp-dir
 * Returns the local temporary directory path for MenuCDI operations.
 * Always uses the local user temp directory to avoid network path permission issues.
 */
    const localTempDir = path.join(os.tmpdir(), "MenuCDI-Temp");
    if (!fs.existsSync(localTempDir)) {
        fs.mkdirSync(localTempDir, { recursive: true });
    }
    return localTempDir + path.sep; // Return with trailing separator
});

ipcMain.handle("api-status", async () => {
/**
 * Handler: api-status
 * Verifica se a API está acessível. Útil para mostrar erros de conectividade
 * antes do usuário tentar logar.
 * Retorna booleano (true = API respondeu 200).
 */

    try {
        if (!appConfig.apiBaseUrl) return false;
        const response = await axios.get(`${appConfig.apiBaseUrl}/status`, {
            timeout: 5000,
        });
        return response.status === 200;
    } catch (error) {
        // Log seguro: evite serializar objetos grandes/circulares
        console.error(
            "API Status error:",
            error.message,
            error.response ? error.response.data : ""
        );
        return false;
    }
});

ipcMain.handle("api-login", async (event, { username, password, newPassword = "" }) => {
/**
 * Handler: api-login
 * Faz a chamada de login para a API. Mapeamos o formato esperado pelo backend
 * e normalizamos tokens/objetos retornados.
 * Retornos possíveis:
 * - { success: true, user, token, ... }
 * - { success: false, message }
 */

        try {
            // Chamada principal ao endpoint de login (padrão documentado neste projeto)
            let response = await axios.post(
                `${appConfig.apiBaseUrl}/loginMenu`,
                {
                    Username: username,
                    Password: password,
                    NewPassword: newPassword,
                }
            );

            if (response && response.data) {
                // Alguns backends retornam accessToken ou token; aceitamos ambos
                const token =
                    response.data.accessToken ||
                    response.data.access_token ||
                    response.data.token;
                if (token) {
                    authToken = token;
                    // Armazena informação mínima do usuário (pode ser enriquecida conforme API)
                    currentUser = { username };
                    return {
                        success: true,
                        user: currentUser,
                        userName:
                            (response.data.user && response.data.user.name) ||
                            "",
                        token: authToken,
                        companyName:
                            (response.data.user &&
                                response.data.user.companyName) ||
                            "",
                    };
                }

                // Se login falhou, o backend pode retornar uma mensagem explicativa
                return {
                    success: false,
                    message: response.data.message || "Login falhou",
                };
            }

            return { success: false, message: "Login falhou" };
        } catch (error) {
            // Log detalhado para debug: não serializamos objetos circulares
            console.error(
                "Login error:",
                error.message,
                error.response ? error.response.data : ""
            );
            const body =
                error.response && error.response.data
                    ? typeof error.response.data === "string"
                        ? error.response.data
                        : JSON.stringify(error.response.data)
                    : error.message;
            return {
                success: false,
                message: `Erro ao conectar com o servidor: ${body}`,
            };
        }
    }
);

ipcMain.handle("api-logout", () => {
/**
 * Handler: api-logout
 * Limpa o estado de autenticação mantido no processo principal.
 */

    authToken = null;
    currentUser = null;
    return true;
});

ipcMain.handle("get-auth-state", () => {
/**
 * Handler: get-auth-state
 * Retorna o estado atual de autenticação para o renderer (usado em inicialização).
 */

    return {
        isAuthenticated: !!authToken,
        user: currentUser,
        token: authToken,
    };
});

ipcMain.handle("api-get-systems", async (event, onlyHidden = 0) => {
/**
 * Handler: api-get-systems
 * Busca a lista de sistemas/sistemasMenu disponíveis para o usuário autenticado.
 * - Tenta um endpoint "legado" primeiro (/sistemas/menu) e depois a rota
 *   documentada (/sistemasMenu). Também descompacta a resposta caso o backend
 *   envolva um wrapper ApiResponse<T> (campo `data`).
 */

    try {
        if (!authToken) throw new Error("Not authenticated");
        let response;
        response = await axios.get(`${appConfig.apiBaseUrl}/sistemasMenu${onlyHidden ? '?Mostrar=0' : ''}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });

        // API sample wraps result in ApiResponse<T>. Try to unwrap if present.
        if (response.data && response.data.data) return response.data.data;
        return response.data;
    } catch (error) {
        const body =
            error.response && error.response.data
                ? typeof error.response.data === "string"
                    ? error.response.data
                    : JSON.stringify(error.response.data)
                : error.message;
        console.error(
            "Get systems error:",
            error.message,
            error.response ? error.response.data : ""
        );
        throw new Error(`Get systems failed: ${body}`);
    }
});

ipcMain.handle("api-get-system-version", async (event, systemId) => {
/**
 * Handler: api-get-system-version
 * Recupera a versão do sistema remoto (usada para comparar com a versão local
 * e decidir se há necessidade de download/atualização).
 * - Tenta rota legada e depois `/sistema?IdSistema=...` conforme o sample API.
 */

    try {
        if (!authToken) throw new Error("Not authenticated");
        // Try legacy route then fallback to API sample's /sistema?IdSistema=...
        let response;
        // try {
        //   response = await axios.get(`${appConfig.apiBaseUrl}/sistemas/${systemId}/versao`, {
        //     headers: { Authorization: `Bearer ${authToken}` }
        //   });
        // } catch (err) {
        //   if (err.response && err.response.status === 404) {
        //     response = null;
        //   } else {
        //     throw err;
        //   }
        // }

        // if (response && response.data) return response.data;

        // Fallback: GET /sistema?IdSistema=123 (API sample)
        response = await axios.get(`${appConfig.apiBaseUrl}/sistema`, {
            headers: { Authorization: `Bearer ${authToken}` },
            params: { IdSistema: systemId },
        });

        // If wrapped in ApiResponse, unwrap
        if (response.data && response.data.data) return response.data.data;
        return response.data;
    } catch (error) {
        const body =
            error.response && error.response.data
                ? typeof error.response.data === "string"
                    ? error.response.data
                    : JSON.stringify(error.response.data)
                : error.message;
        console.error(
            "Get system version error:",
            error.message,
            error.response ? error.response.data : ""
        );
        throw new Error(`Get system version failed: ${body}`);
    }
});

ipcMain.handle("api-download-system", async (event, systemId) => {
    try {
        console.log(`[Download] Starting download for system ID: ${systemId}`);
        
        if (!authToken) {
            console.error('[Download] Authentication token missing');
            throw new Error("Not authenticated");
        }

        console.log(`[Download] Making API request to: ${appConfig.apiBaseUrl}/downloadSistema`);
        console.log(`[Download] Request params: IdSistema=${systemId}`);
        console.log(`[Download] Auth token present: ${authToken ? 'YES' : 'NO'}`);
        
        const response = await axios.post(
            `${appConfig.apiBaseUrl}/downloadSistema`,
            null,
            {
                headers: { Authorization: `Bearer ${authToken}` },
                params: { IdSistema: systemId },
                responseType: "stream",
                timeout: 60000, // 60 second timeout
                maxRedirects: 5,
            }
        );

        console.log(
            "[Download] Response received - Status:",
            response.status,
            "Content-Type:",
            response.headers['content-type'],
            "Content-Disposition:",
            response.headers['content-disposition']
        );

        // Helper: parse Content-Disposition safely (supports filename* RFC5987)
        function getFilenameFromContentDisposition(header) {
            if (!header || typeof header !== "string") return null;
            const fnStarMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
            if (fnStarMatch) {
                let val = fnStarMatch[1].trim().replace(/^['"]+|['"]+$/g, "");
                const rfcMatch = val.match(/^[^']*'[^']*'(.+)$/);
                if (rfcMatch && rfcMatch[1]) {
                    try {
                        return decodeURIComponent(rfcMatch[1]);
                    } catch (e) {
                        return rfcMatch[1];
                    }
                }
                try {
                    return decodeURIComponent(val);
                } catch (e) {
                    return val;
                }
            }
            const fnMatch = header.match(/filename\s*=\s*("?)([^";]+)\1/i);
            if (fnMatch && fnMatch[2]) return fnMatch[2];
            return null;
        }

        const disposition =
            response.headers && response.headers["content-disposition"];
        let filename =
            getFilenameFromContentDisposition(disposition) || `${systemId}.zip`;
        filename = path
            .basename(filename)
            .replace(/["']/g, "")
            .replace(/[\0<>:"/\\|?*\x00-\x1F]/g, "_");

        // FIXED: Always use local temp directory first (network paths may have write restrictions)
        const tmpDir = path.join(os.tmpdir(), "MenuCDI-Downloads");
        console.log(`[Download] Temp directory: ${tmpDir}`);
        
        try {
            if (!fs.existsSync(tmpDir)) {
                console.log(`[Download] Creating temp directory: ${tmpDir}`);
                fs.mkdirSync(tmpDir, { recursive: true });
            }
        } catch (dirError) {
            console.error(`[Download] Failed to create temp directory: ${dirError.message}`);
            throw new Error(`Não foi possível criar diretório temporário: ${dirError.message}`);
        }

        const tmpPath = path.join(tmpDir, filename);
        console.log(`[Download] Target file path: ${tmpPath}`);
        console.log(`[Download] Filename from server: ${filename}`);

        // Check if we have write permissions
        try {
            fs.accessSync(tmpDir, fs.constants.W_OK);
            console.log(`[Download] Write permission verified for: ${tmpDir}`);
        } catch (permError) {
            console.error(`[Download] No write permission for: ${tmpDir}`);
            throw new Error(`Sem permissão de escrita no diretório temporário: ${tmpDir}`);
        }

        // Write stream to disk
        console.log(`[Download] Starting file write to: ${tmpPath}`);
        const writer = fs.createWriteStream(tmpPath);
        
        let bytesWritten = 0;
        writer.on('pipe', () => {
            console.log('[Download] Stream pipe started');
        });
        
        await new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                bytesWritten += chunk.length;
            });
            
            response.data.pipe(writer);
            writer.on("finish", () => {
                console.log(`[Download] Write finished. Total bytes written: ${bytesWritten}`);
                resolve();
            });
            writer.on("error", reject);
            response.data.on && response.data.on("error", reject);
        });

        // Verify file was actually created and has content
        try {
            const stats = fs.statSync(tmpPath);
            console.log(`[Download] File saved successfully:`);
            console.log(`  - Path: ${tmpPath}`);
            console.log(`  - Size: ${stats.size} bytes`);
            console.log(`  - Created: ${stats.birthtime}`);
            
            if (stats.size === 0) {
                throw new Error('Arquivo baixado está vazio (0 bytes)');
            }
            
            return { success: true, path: tmpPath, size: stats.size };
        } catch (statError) {
            console.error(`[Download] File verification failed: ${statError.message}`);
            throw new Error(`Arquivo não foi criado corretamente: ${statError.message}`);
        }
    } catch (error) {
        // Read and stringify possible stream/object response bodies (best-effort)
        async function readStreamToString(
            stream,
            maxBytes = 200 * 1024,
            timeoutMs = 3000
        ) {
            return new Promise((resolve, reject) => {
                try {
                    const chunks = [];
                    let length = 0;
                    let done = false;
                    const onData = (chunk) => {
                        const buf = Buffer.isBuffer(chunk)
                            ? chunk
                            : Buffer.from(String(chunk));
                        chunks.push(buf);
                        length += buf.length;
                        if (length >= maxBytes) {
                            cleanup();
                            done = true;
                            resolve(Buffer.concat(chunks).toString("utf8"));
                        }
                    };
                    const onEnd = () => {
                        if (done) return;
                        cleanup();
                        resolve(Buffer.concat(chunks).toString("utf8"));
                    };
                    const onError = (err) => {
                        cleanup();
                        reject(err);
                    };
                    const onTimeout = () => {
                        if (done) return;
                        cleanup();
                        resolve(Buffer.concat(chunks).toString("utf8"));
                    };
                    const cleanup = () => {
                        try {
                            stream.removeListener &&
                                stream.removeListener("data", onData);
                            stream.removeListener &&
                                stream.removeListener("end", onEnd);
                            stream.removeListener &&
                                stream.removeListener("error", onError);
                        } catch (e) {}
                        clearTimeout(tmr);
                    };
                    stream.on && stream.on("data", onData);
                    stream.on && stream.on("end", onEnd);
                    stream.on && stream.on("error", onError);
                    const tmr = setTimeout(onTimeout, timeoutMs);
                } catch (e) {
                    reject(e);
                }
            });
        }

        let bodyStr = error.message || String(error);
        try {
            if (error.response) {
                const { status, statusText, data } = error.response;
                if (data) {
                    if (typeof data === "string") bodyStr = data;
                    else if (Buffer.isBuffer(data))
                        bodyStr = data.toString("utf8");
                    else if (data && typeof data.pipe === "function") {
                        try {
                            bodyStr = await readStreamToString(data);
                        } catch (e) {
                            bodyStr = "[stream data]";
                        }
                    } else {
                        try {
                            bodyStr = JSON.stringify(data);
                        } catch (_) {
                            bodyStr = String(data);
                        }
                    }
                } else {
                    bodyStr =
                        `${status || ""} ${statusText || ""}`.trim() || bodyStr;
                }
            }
        } catch (e) {
            // ignore serialization errors
        }

        const status = error.response && error.response.status;
        const statusText = error.response && error.response.statusText;
        const headers = error.response && error.response.headers;
        
        console.error("[Download] ERROR DETAILS:", {
            errorType: error.constructor.name,
            errorMessage: error.message,
            errorCode: error.code,
            httpStatus: status,
            httpStatusText: statusText,
            responseHeaders: headers,
            responseBody: bodyStr,
            requestSystemId: systemId,
            requestUrl: `${appConfig.apiBaseUrl}/downloadSistema`,
            stack: error.stack,
        });
        
        // Provide clearer error message for common issues
        let errorMessage = bodyStr;
        let errorCode = "DOWNLOAD_FAILED";
        
        // Special handling for 500 Internal Server Error
        if (status === 500) {
            console.error(`[Download] SERVER ERROR 500 - Server-side issue for system ${systemId}`);
            console.error(`[Download] Server response body: ${bodyStr}`);
            errorMessage = `Erro interno no servidor ao processar download do sistema ${systemId}. O servidor retornou: ${bodyStr}. Contate o administrador da API.`;
            errorCode = "SERVER_ERROR_500";
        } else if (status >= 500 && status < 600) {
            errorMessage = `Erro no servidor (${status}): ${bodyStr}. Tente novamente mais tarde ou contate o suporte.`;
            errorCode = "SERVER_ERROR";
        } else if (error.code === 'EACCES') {
            errorMessage = `Sem permissão de acesso ao diretório temporário. Verifique as permissões da pasta TEMP.`;
            errorCode = "PERMISSION_DENIED";
        } else if (error.code === 'ENOSPC') {
            errorMessage = `Espaço em disco insuficiente para download.`;
            errorCode = "DISK_FULL";
        } else if (error.code === 'ENOENT') {
            errorMessage = `Caminho não encontrado. Verifique se o diretório temporário existe.`;
            errorCode = "PATH_NOT_FOUND";
        } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            errorMessage = `Tempo de download esgotado. Verifique sua conexão de internet.`;
            errorCode = "TIMEOUT";
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            errorMessage = `Não foi possível conectar ao servidor. Verifique sua conexão.`;
            errorCode = "CONNECTION_FAILED";
        } else if (bodyStr.includes("Arquivo não encontrado") || bodyStr.includes("não encontrado")) {
            errorMessage = `Arquivo não disponível no servidor para o sistema ${systemId}. ${bodyStr}`;
            errorCode = "FILE_NOT_FOUND";
        } else if (status === 404) {
            errorMessage = `Endpoint de download não encontrado no servidor (404).`;
            errorCode = "ENDPOINT_NOT_FOUND";
        } else if (status === 401 || status === 403) {
            errorMessage = `Sem autorização para fazer download (${status}). Faça login novamente.`;
            errorCode = "UNAUTHORIZED";
        }
        
        console.error(`[Download] Throwing error with code: ${errorCode}`);
        throw new Error(`Download system failed: ${errorMessage}`);
    }
});

ipcMain.handle("extract-zip", async (event, zipPath, destDir) => {
/**
 * Handler: extract-zip
 * Extrai um arquivo .zip para um diretório destino preservando as datas de
 * modificação presentes dentro do zip (mantém mtime original).
 * - zipPath: caminho completo do arquivo .zip já baixado
 * - destDir: diretório de destino onde o conteúdo será extraído
 * Retorna: { success: true, dest } ou { success: false, message }
 */

    let zip;
    try {
        if (!zipPath || !fs.existsSync(zipPath)) {
            throw new Error("Arquivo zip não encontrado: " + zipPath);
        }

        // Resolve caminhos absolutos e evita extração fora da pasta permitida
        const resolvedZip = path.resolve(zipPath);
        const resolvedDest = path.resolve(
            destDir ||
                path.join(appConfig.caminhoExecLocal || os.tmpdir(), "tmp")
        );

        // Garantir que a pasta destino exista
        if (!fs.existsSync(resolvedDest))
            fs.mkdirSync(resolvedDest, { recursive: true });

        // Abrir zip (API async)
        zip = new StreamZip.async({ file: resolvedZip });

        // Obter entradas do zip
        const entries = await zip.entries();

        // Itera cada entrada e faz extração manual (para preservar mtime)
        for (const entryName of Object.keys(entries)) {
            const entry = entries[entryName];
            const entryPath = entry.name; // caminho interno no zip (p.ex. "bin/Vendas.exe")
            const destPath = path.join(resolvedDest, entryPath);

            if (entry.isDirectory) {
                // garante diretório
                if (!fs.existsSync(destPath))
                    fs.mkdirSync(destPath, { recursive: true });
                continue;
            }

            // garante diretório pai
            const parentDir = path.dirname(destPath);
            if (!fs.existsSync(parentDir))
                fs.mkdirSync(parentDir, { recursive: true });

            // extrai o stream e grava em disco
            const readStream = await zip.stream(entryName);
            await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(destPath, {
                    flags: "w",
                });
                readStream.pipe(writeStream);
                readStream.on("error", (err) => reject(err));
                writeStream.on("error", (err) => reject(err));
                writeStream.on("close", () => resolve());
            });

            // preserva a data de modificação do entry se disponível
            try {
                // entry.time pode vir como Date ou número (segundos ou ms)
                let mtimeMs = null;
                if (entry.time instanceof Date) {
                    mtimeMs = entry.time.getTime();
                } else if (typeof entry.time === "number") {
                    mtimeMs = entry.time;
                } else {
                    mtimeMs = Date.now();
                }

                // detectar magnitude: se for timestamp em segundos (~1e9) converte para ms
                if (typeof mtimeMs === "number" && mtimeMs < 1e12)
                    mtimeMs = mtimeMs * 1000;

                // Ajuste de timezone: muitos zips armazenam timestamp sem timezone.
                // Para manter a data/hora exibida igual à original local (ex: Brasil UTC-3),
                // compensamos usando o offset local atual (minutos -> ms).
                // Ex.: se entry.time foi interpretado como UTC, adicionar o offset local
                // corrige a visualização local (15:02 em vez de 12:02).
                const tzOffsetMs = new Date().getTimezoneOffset() * 60 * 1000; // minutos -> ms
                mtimeMs = mtimeMs + tzOffsetMs;

                const mtimeDate = new Date(mtimeMs);
                // Ajusta atime para manter coerência (usa mesma data)
                fs.utimesSync(destPath, mtimeDate, mtimeDate);
            } catch (e) {
                // se não for possível ajustar a data, apenas loga e continua
                console.warn(
                    "Falha ao preservar mtime para",
                    destPath,
                    e && e.message
                );
            }
        }

        await zip.close();

        return { success: true, dest: resolvedDest };
    } catch (error) {
        console.error("Extract zip error:", error && error.message);
        try {
            if (zip && zip.close) await zip.close();
        } catch (e) {
            // ignore
        }
        return { success: false, message: error.message || String(error) };
    }
});

ipcMain.handle("delete-file", async (event, filePath) => {
/**
 * Handler: delete-file
 * Deleta um arquivo especificado por filePath.
 * Retorna { success: true } ou { success: false, message }
 */

    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        } else {
            return { success: false, message: "File not found" };
        }
    } catch (error) {
        console.error("Delete file error:", error.message);
        return { success: false, message: error.message };
    }
});

ipcMain.handle("check-process", (event, processName) => {
/**
 * Handler: check-process
 * Verifica se existe um processo em execução com o nome fornecido.
 * Retorna um array de objetos { name, pid } (no Windows) ou lista de PIDs no Linux.
 * Utiliza comandos nativos (`tasklist` no Windows, `pgrep` em Unix) para compatibilidade.
 */

    return new Promise((resolve) => {
        const command =
            process.platform === "win32"
                ? `tasklist /FI "IMAGENAME eq ${processName}.exe" /FO CSV /NH`
                : `pgrep ${processName}`;

        exec(command, (error, stdout) => {
            if (error) {
                resolve([]);
                return;
            }

            if (process.platform === "win32") {
                const lines = stdout.trim().split("\n");
                const processes = lines
                    .filter((line) => line.includes(processName))
                    .map((line) => {
                        const parts = line.split('","');
                        return {
                            name: parts[0].replace('"', ""),
                            pid: parseInt(parts[1]),
                        };
                    });
                resolve(processes);
            } else {
                const pids = stdout
                    .trim()
                    .split("\n")
                    .filter((pid) => pid);
                resolve(
                    pids.map((pid) => ({
                        pid: parseInt(pid),
                        name: processName,
                    }))
                );
            }
        });
    });
});

ipcMain.handle("kill-process", (event, pid) => {
/**
 * Handler: kill-process
 * Mata um processo pelo PID. Retorna true se a operação aparentemente teve sucesso.
 */

    return new Promise((resolve) => {
        const command =
            process.platform === "win32"
                ? `taskkill /PID ${pid} /F`
                : `kill -9 ${pid}`;

        exec(command, (error) => {
            resolve(!error);
        });
    });
});

ipcMain.handle("launch-exe-old", async (event, exePath, args = []) => {
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
            pushTry(exePath.replace(/^([a-zA-Z]:)/, "$1\\"));
        }
        // If it's a plain filename, try joining with configured caminhoExecLocal
        if (!exePath.includes("\\") && !exePath.includes("/")) {
            if (appConfig.caminhoExecLocal)
                pushTry(path.join(appConfig.caminhoExecLocal, exePath));
        }

        // Finally, try with a trailing backslash on caminhoExecLocal if present
        if (appConfig.caminhoExecLocal) {
            const base = appConfig.caminhoExecLocal;
            if (!base.endsWith("\\") && !base.endsWith("/"))
                pushTry(path.join(base + "\\", exePath));
        }

        // Find first existing path
        let found = tried.find((p) => {
            try {
                return fs.existsSync(p);
            } catch {
                return false;
            }
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
                        if (
                            fs.existsSync(left) &&
                            fs.statSync(left).isDirectory()
                        ) {
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
            return {
                success: false,
                message: "Arquivo não encontrado: " + exePath,
                tried,
            };
        }

        const proc = spawn(found, args, {
            detached: true,
            stdio: "ignore",
            cwd: path.dirname(found),
        });

        proc.unref();
        return { success: true, launched: found };
    } catch (error) {
        console.error("Launch exe error:", error.message);
        return { success: false, message: error.message };
    }
});

ipcMain.handle("launch-exe", async (event, exePath, args = [], systemId = null) => {
    try {
        console.log(`[launch-exe] Starting with exePath: ${exePath}, systemId: ${systemId}`);
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
            pushTry(exePath.replace(/^([a-zA-Z]:)/, "$1\\"));
        }
        // If it's a plain filename, try joining with configured caminhoExecLocal
        if (!exePath.includes("\\") && !exePath.includes("/")) {
            if (appConfig.caminhoExecLocal)
                pushTry(path.join(appConfig.caminhoExecLocal, exePath));
        }

        // Finally, try with a trailing backslash on caminhoExecLocal if present
        if (appConfig.caminhoExecLocal) {
            const base = appConfig.caminhoExecLocal;
            if (!base.endsWith("\\") && !base.endsWith("/"))
                pushTry(path.join(base + "\\", exePath));
        }

        // Find first existing path
        let found = tried.find((p) => {
            try {
                return fs.existsSync(p);
            } catch {
                return false;
            }
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
                        if (
                            fs.existsSync(left) &&
                            fs.statSync(left).isDirectory()
                        ) {
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

        // If still not found and we have a systemId, attempt auto-download
        if (!found && systemId) {
            console.log(`[launch-exe] Arquivo não encontrado localmente. Iniciando download do sistema ${systemId}...`);
            
            try {
                // Notify renderer about download start
                event.sender.send('system-download-started', { systemId, exePath });
                
                // Download the system using correct POST endpoint
                const downloadResult = await (async () => {
                    try {
                        if (!authToken) {
                            throw new Error("Não autenticado");
                        }

                        console.log(`[launch-exe] Downloading system ${systemId}...`);
                        
                        const url = `${appConfig.apiBaseUrl}/downloadSistema?IdSistema=${systemId}`;
                        console.log(`[launch-exe] POST request to: ${url}`);
                        
                        const response = await axios.post(url, null, {
                            headers: { Authorization: `Bearer ${authToken}` },
                            responseType: "arraybuffer",
                            timeout: 300000, // 5 minutes
                        });

                        // Success! Save to temp directory
                        const tmpDir = path.join(os.tmpdir(), "MenuCDI-Downloads");
                        if (!fs.existsSync(tmpDir)) {
                            fs.mkdirSync(tmpDir, { recursive: true });
                        }

                        const filename = `system_${systemId}_${Date.now()}.zip`;
                        const tmpPath = path.join(tmpDir, filename);

                        fs.writeFileSync(tmpPath, Buffer.from(response.data));

                        console.log(`[launch-exe] System downloaded to: ${tmpPath}`);
                        return { success: true, path: tmpPath };
                        
                    } catch (error) {
                        console.error("[launch-exe] Download system error:", error.message);
                        if (error.response) {
                            console.error(`[launch-exe] Response status: ${error.response.status}`);
                            console.error(`[launch-exe] Response data:`, error.response.data);
                        }
                        return { 
                            success: false, 
                            message: error.response?.data?.message || error.message 
                        };
                    }
                })();

                if (!downloadResult.success) {
                    throw new Error(downloadResult.message || 'Download failed');
                }

                console.log(`[launch-exe] Download concluído: ${downloadResult.path}`);
                event.sender.send('system-download-progress', { systemId, status: 'extracting' });

                // Determine extraction directory from exePath
                const destDir = path.dirname(tried[0] || exePath);
                
                // Extract the downloaded zip
                const extractResult = await (async () => {
                    try {
                        console.log(`[launch-exe] Extracting ${downloadResult.path} to ${destDir}...`);
                        
                        const zip = new StreamZip.async({ file: downloadResult.path });
                        await zip.extract(null, destDir);
                        await zip.close();
                        
                        console.log(`[launch-exe] Extraction complete to: ${destDir}`);
                        return { success: true, dest: destDir };
                    } catch (error) {
                        console.error("[launch-exe] Extract error:", error.message);
                        return { success: false, message: error.message };
                    }
                })();

                if (!extractResult.success) {
                    throw new Error(extractResult.message || 'Extraction failed');
                }

                console.log(`[launch-exe] Extração concluída: ${extractResult.dest}`);

                // Delete the downloaded zip file
                try {
                    if (fs.existsSync(downloadResult.path)) {
                        fs.unlinkSync(downloadResult.path);
                    }
                } catch (e) {
                    console.warn(`[launch-exe] Falha ao deletar arquivo temporário: ${e.message}`);
                }

                // Re-try to find the executable after extraction
                found = tried.find((p) => {
                    try {
                        return fs.existsSync(p);
                    } catch {
                        return false;
                    }
                });

                if (!found) {
                    throw new Error('Arquivo ainda não encontrado após download e extração');
                }

                event.sender.send('system-download-complete', { systemId, path: found });
                
            } catch (downloadError) {
                console.error('[launch-exe] Auto-download failed:', downloadError.message);
                event.sender.send('system-download-failed', { 
                    systemId, 
                    error: downloadError.message 
                });
                
                return {
                    success: false,
                    message: `Arquivo não encontrado e download falhou: ${downloadError.message}`,
                    tried,
                    autoDownloadAttempted: true
                };
            }
        }

        if (!found) {
            // Return clearer error listing the attempted paths
            return {
                success: false,
                message: systemId 
                    ? "Arquivo não encontrado. Verifique se o systemId está correto para download automático."
                    : "Arquivo não encontrado: " + exePath,
                tried,
            };
        }

        const proc = spawn(found, args, {
            detached: true,
            stdio: "ignore",
            cwd: path.dirname(found),
        });

        proc.unref();
        return { 
            success: true, 
            launched: found,
            wasDownloaded: systemId ? true : undefined
        };
    } catch (error) {
        console.error("[launch-exe] Launch exe error:", error.message);
        return { success: false, message: error.message };
    }
});

ipcMain.handle("get-file-version", (event, filePath) => {
/**
 * Handler: get-file-version
 * Retorna uma indicação simples de versão do arquivo local. Atualmente
 * devolve um objeto com `version` (placeholder) e `modified` (mtime).
 * Nota: para um produto real, implementar leitura de versão do arquivo
 * (ex.: recurso de versão em exe no Windows) em vez deste placeholder.
 */

    try {
        if (!fs.existsSync(filePath)) return null;

        const stats = fs.statSync(filePath);
        const info = winVersionInfo(filePath);

        return {
            version: info.FileVersion || info.ProductVersion,
            modified: stats.mtime,
        };
    } catch (error) {
        console.error("Get file version error:", error.message);
        return null;
    }
});

ipcMain.handle("ensure-directory", (event, dirPath) => {
/**
 * Handler: ensure-directory
 * Garante que o diretório exista (cria de forma recursiva se necessário).
 * Retorna true em sucesso, false em falha.
 */

    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return true;
    } catch (error) {
        console.error("Ensure directory error:", error.message);
        return false;
    }
});

ipcMain.handle("move-file", (event, source, destination) => {
/**
 * Handler: move-file
 * Move/renomeia um arquivo no filesystem. Retorna true/false indicando sucesso.
 * Observação: fs.renameSync pode falhar se o destino estiver em outro volume;
 * em situações mais complexas, usar copy+unlink.
 */

    try {
        fs.renameSync(source, destination);
        return true;
    } catch (error) {
        console.error("Move file error:", error.message);
        return false;
    }
});

ipcMain.handle("navigate-to-main", (event) => {
/**
 * Handler: navigate-to-main
 * Carrega a página principal (index.html) na janela que requisitou a navegação.
 */

    const win = BrowserWindow.fromWebContents(event.sender);
    win.loadFile("index.html");
});

ipcMain.handle("navigate-to-login", (event) => {
/**
 * Handler: navigate-to-login
 * Carrega a tela de login (login.html) na janela que requisitou.
 */

    const win = BrowserWindow.fromWebContents(event.sender);
    win.loadFile("login.html");
});

ipcMain.handle("get-app-version", () => {
/**
 * Handler: get-app-version
 * Retorna a versão da aplicação (definida em package.json) para exibição
 * no renderer ou para uso em lógica de atualização.
 */

    return app.getVersion();
});

function ensureTrailingSep(p) {
/**
 * Determina o caminho local base (caminhoExecLocal) onde os EXEs/artefatos
 * devem ser procurados/gravados.
 *
 * Prioridade:
 * 1) variável de ambiente CDI_CAMINHO_EXEC_LOCAL (se definida)
 * 2) se app.isPackaged => pega o diretório pai do diretório do executável
 *    (ex.: exe em D:\Exec\win-unpacked\MenuCDI.exe -> retorna D:\Exec\)
 * 3) desenvolvimento => diretório pai de __dirname (projeto)
 *
 * Garante que o caminho retornado termine com separador (backslash no Windows).
 */

    if (!p) return p || "";
    const norm = path.normalize(p);
    return norm.endsWith(path.sep) ? norm : norm + path.sep;
}

function determineCaminhoExecLocal() {
    try {
        // 1) Prefer common default folder C:\Exec if it exists
        const commonPath = path.join("C:", "Exec");
        if (
            fs.existsSync(commonPath) &&
            fs.statSync(commonPath).isDirectory()
        ) {
            console.log("Usando caminho padrão detectado C:\\Exec");
            return ensureTrailingSep(commonPath);
        }

        // 2) Try registry key HKCU\Software\CDI -> value CaminhoExecLocal
        if (process.platform === "win32") {
            try {
                // Ex: reg query "HKCU\Software\CDI" /v CaminhoExecLocal
                const out = execSync(
                    'reg query "HKCU\\Software\\CDI" /v CaminhoExecLocal',
                    {
                        stdio: ["ignore", "pipe", "ignore"],
                        encoding: "utf8",
                        timeout: 3000,
                    }
                );
                if (out) {
                    const m = out.match(
                        /CaminhoExecLocal\s+REG_[A-Z_]+\s+(.*)/i
                    );
                    if (m && m[1]) {
                        const val = m[1].trim();
                        if (val) {
                            console.log(
                                "Usando CaminhoExecLocal do registry:",
                                val
                            );
                            return ensureTrailingSep(val);
                        }
                    }
                }
            } catch (e) {
                // não encontrou no registry — log para debug e continua
                console.warn(
                    "Cannot read CaminhoExecLocal from registry:",
                    e && e.message
                );
            }
        }

        // 3) fallback: empty string (caller will handle notification)
        console.warn(
            "CaminhoExecLocal não encontrado (C:\\Exec ausente e registro CDI\\CaminhoExecLocal não preenchido)."
        );
        return "";
    } catch (e) {
        console.warn("determineCaminhoExecLocal error:", e && e.message);
        return "";
    }
}

function getApiBaseFromEnvOrRegistry() {
/**
 * getApiBaseFromEnvOrRegistry()
 * - Primeiro tenta ler process.env.CDI_URL_API_MENU
 * - Se não definido e estamos no Windows, tenta ler HKCU\Software\CDI\ApiBaseUrl via `reg query`
 * - Retorna string (ou "") sempre que não encontrar valor
 */

    // 1) prefer env var
    const envVal = process.env.CDI_URL_API_MENU;
    if (envVal && String(envVal).trim()) {
        console.log("Usando CDI_URL_API_MENU:", envVal);
        return String(envVal).trim();
    }

    // 2) tenta ler do registry no Windows
    if (process.platform === "win32") {
        try {
            // Ex: reg query "HKCU\Software\CDI" /v ApiBaseUrl
            const out = execSync(
                'reg query "HKCU\\Software\\CDI" /v ApiBaseUrl',
                {
                    stdio: ["ignore", "pipe", "ignore"],
                    encoding: "utf8",
                    timeout: 3000,
                }
            );
            if (out) {
                // Saída típica:
                // HKEY_CURRENT_USER\Software\CDI
                //     ApiBaseUrl    REG_SZ    http://localhost:8000
                const m = out.match(/ApiBaseUrl\s+REG_[A-Z_]+\s+(.*)/i);
                if (m && m[1]) {
                    const val = m[1].trim();
                    if (val) {
                        console.log("Usando ApiBaseUrl do registry:", val);
                        return val;
                    }
                }
            }
        } catch (e) {
            // falha ao ler o registry — log para debug mas não interrompe
            console.warn(
                "Cannot read ApiBaseUrl from registry:",
                e && e.message
            );
        }
    }

    // 3) fallback vazio
    console.log("Usando fallback vazio para ApiBaseUrl");
    return "";
}

ipcMain.handle('check-for-app-updates', async () => {
/**
 * Handler: check-for-app-updates
 * Manually checks for application updates via update.electronjs.org
 * Returns update info if available
 */

    if (!app.isPackaged) {
        return { 
            available: false, 
            message: 'Development mode - updates disabled',
            currentVersion: app.getVersion()
        };
    }

    try {
        const currentVersion = app.getVersion();
        const platform = process.platform;
        const arch = process.arch;
        
        console.log(`[Auto-Update] Checking for updates: current=${currentVersion}, platform=${platform}, arch=${arch}`);
        
        const response = await axios.get(
            `https://update.electronjs.org/thiagocdi/MenuCDI/${platform}-${arch}/${currentVersion}`,
            { timeout: 10000 }
        );

        if (response.status === 200 && response.data) {
            console.log('[Auto-Update] Update available:', response.data);
            return {
                available: true,
                currentVersion,
                latestVersion: response.data.name,
                downloadUrl: response.data.url,
                notes: response.data.notes || 'Nova versão disponível'
            };
        } else if (response.status === 204) {
            console.log('[Auto-Update] Already up to date');
            return {
                available: false,
                message: 'Você já está usando a versão mais recente',
                currentVersion
            };
        }
        
        return {
            available: false,
            message: 'Nenhuma atualização disponível',
            currentVersion
        };
    } catch (error) {
        console.error('[Auto-Update] Check failed:', error.message);
        
        if (error.response && error.response.status === 204) {
            return {
                available: false,
                message: 'Você já está usando a versão mais recente',
                currentVersion: app.getVersion()
            };
        }
        
        return {
            available: false,
            error: error.message,
            currentVersion: app.getVersion()
        };
    }
});

ipcMain.handle('download-app-update', async (event, downloadUrl) => {
/**
 * Handler: download-app-update
 * Downloads the update installer to a temporary location
 */

    if (!app.isPackaged) {
        return { success: false, message: 'Development mode' };
    }

    try {
        console.log('[Auto-Update] Downloading update from:', downloadUrl);
        
        const response = await axios.get(downloadUrl, {
            responseType: 'stream',
            timeout: 300000 // 5 minutes for download
        });

        const tmpDir = path.join(os.tmpdir(), 'MenuCDI-Updates');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const filename = path.basename(downloadUrl);
        const tmpPath = path.join(tmpDir, filename);

        const writer = fs.createWriteStream(tmpPath);
        
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
                const percent = Math.round((downloadedBytes / totalBytes) * 100);
                event.sender.send('update-download-progress', { percent, downloadedBytes, totalBytes });
            }
        });

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.pipe(writer);
        });

        console.log('[Auto-Update] Download complete:', tmpPath);
        return { success: true, path: tmpPath };
    } catch (error) {
        console.error('[Auto-Update] Download failed:', error.message);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('install-app-update', async (event, installerPath) => {
/**
 * Handler: install-app-update
 * Launches the downloaded installer and quits the current app
 */

    if (!app.isPackaged) {
        return { success: false, message: 'Development mode' };
    }

    try {
        console.log('[Auto-Update] Launching installer:', installerPath);
        
        if (!fs.existsSync(installerPath)) {
            throw new Error('Installer file not found');
        }

        // Launch installer with elevated privileges
        const { spawn } = require('child_process');
        spawn(installerPath, [], {
            detached: true,
            stdio: 'ignore'
        }).unref();

        // Give the installer a moment to start, then quit
        setTimeout(() => {
            app.quit();
        }, 1000);

        return { success: true };
    } catch (error) {
        console.error('[Auto-Update] Install failed:', error.message);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('open-external', async (event, url) => {
// Handler: open-external
// Opens a URL in the default browser
    try {
        const { shell } = require('electron');
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        console.error('[open-external] Error:', error.message);
        return { success: false, message: error.message };
    }
});