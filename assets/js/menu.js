// Global state
let isLoading = false;
let currentUser = null;
let menuItems = [];
let hiddenMenuItems = [];
let appConfig = {};
// Track ongoing downloads per system ID
let downloadingSystemIds = new Set();

// DOM elements
const loadingOverlay = document.getElementById("loading-overlay");
const loadingMessage = document.getElementById("loading-message");
const menuContainer = document.getElementById("menu-container");
const usernameDisplay = document.getElementById("username-display");
const logoutBtn = document.getElementById("logout-btn");
const errorToast = document.getElementById("error-toast");
const successToast = document.getElementById("success-toast");
const toastMessage = document.getElementById("toast-message");
const successMessage = document.getElementById("success-message");
const version = document.getElementById("versao");
const filial = document.getElementById("filial");
const confirmModal = new bootstrap.Modal(
    document.getElementById("confirmModal")
);
const modalMessage = document.getElementById("modal-message");
const modalConfirmBtn = document.getElementById("modal-confirm-btn");

// Make it globally available for consistency with MAUI version
window.showConfirmModal = showConfirmModal;

async function initializePage() {
    try {
        showLoading(true, "Verificando autenticação...");

        // Check authentication
        const authState = await window.electronAPI.getAuthState();
        if (!authState.isAuthenticated) {
            await window.electronAPI.navigateToLogin();
            return;
        }

        currentUser = authState.user;
        //usernameDisplay.textContent = currentUser?.username || "Usuário";
        usernameDisplay.textContent =
            localStorage.getItem("userName") || "Usuário";

        // Load configuration
        appConfig = await window.electronAPI.getConfig();

        // Load menu systems
        await loadMenuSystems();

        if (version) {
            version.textContent = await window.electronAPI.getVersion();
        }

        if (filial) {
            filial.textContent = localStorage.getItem("filial") || "";
        }

        const userId = localStorage.getItem("lastUsername");
        if (userId && userId.toUpperCase() === "ADM") {
            const installBtn = document.getElementById("install-btn");
            if (installBtn) {
                installBtn.classList.remove("d-none");
            }
        }

        // Start background update check for hidden systems (non-blocking)
        checkAndUpdateHiddenSystems();

    } catch (error) {
        console.error("Initialization error:", error);
        showToast({
            color: "danger",
            title: "Erro",
            message: "Erro ao inicializar aplicação: " + error.message,
            duration: 3000,
            autohide: true,
        });
    } finally {
        showLoading(false);
    }
}

async function loadMenuSystems() {
    try {
        showLoading(true, "Carregando sistemas...");

        const systems = await window.electronAPI.getSystems();
        menuItems = systems.map((sistema) => ({
            idSistema: sistema.idSistema,
            title: sistema.descricao,
            icon: sistema.icon || "bi-application",
            action: sistema.nomeExe,
        }));

        renderMenuItems();
    } catch (error) {
        console.error("Load systems error:", error);
        showToast({
            color: "danger",
            title: "Erro",
            message: "Erro ao carregar sistemas: " + error.message,
            duration: 3000,
            autohide: true,
        });
    }
}

function renderMenuItems() {
    menuContainer.innerHTML = "";

    if (menuItems.length === 0) {
        menuContainer.innerHTML = `
          <div class="col-12 text-center py-5">
            <div class="text-muted">
              <i class="bi bi-inbox display-1"></i>
              <h5 class="mt-3">Nenhum sistema disponível</h5>
              <p>Entre em contato com o suporte para configurar os sistemas.</p>
            </div>
          </div>
        `;
        return;
    }

    menuItems.forEach((item) => {
        const menuButton = document.createElement("button");
        menuButton.className = "menu-button";
        menuButton.innerHTML = `
          <div class="menu-icon">
            <i class="bi ${item.icon}"></i>
          </div>
          <div class="menu-text">${item.title}</div>
        `;

        menuButton.addEventListener("click", () => handleMenuClick(item));
        menuContainer.appendChild(menuButton);
    });
}

async function handleMenuClick(item) {
    try {
        // Check if system is currently being downloaded/updated
        if (downloadingSystemIds.has(item.idSistema)) {
            showToast({
                color: "info",
                title: "Aguarde",
                message: `${item.title} está sendo atualizado em segundo plano. Aguarde a conclusão.`,
                duration: 4000,
                autohide: true,
            });
            return;
        }

        showLoading(true, `Iniciando ${item.title}...`);

        const exePath = `${appConfig.caminhoExecLocal}${item.action}`;
        // FIXED: Use local temp directory for extraction (network paths may have permission issues)
        const tmpDir = await window.electronAPI.getLocalTempDir();

        // Ensure tmp directory exists
        await window.electronAPI.ensureDirectory(tmpDir);

        // Get process name (without .exe extension)
        const exeName = item.action.replace(".exe", "");

        // Check if process is already running
        const runningProcesses = await window.electronAPI.checkProcess(exeName);

        if (runningProcesses.length > 0) {
            showLoading(false);

            const shouldRestart = await showConfirmModal(
                `O sistema ${item.title} já está em execução. Deseja fechá-lo e reabrir?`
            );

            if (shouldRestart) {
                showLoading(true, `Fechando ${item.title}...`);

                // Kill existing processes
                for (const process of runningProcesses) {
                    await window.electronAPI.killProcess(process.pid);
                }

                // Wait a moment for processes to close
                await new Promise((resolve) => setTimeout(resolve, 2000));
            } else {
                console.log("Usuário cancelou a reabertura.");
                return;
            }
        }

        // Check for updated version in tmp folder
        const tmpExePath = `${tmpDir}${item.action}`;
        const tmpFileExists = await window.electronAPI.getFileVersion(
            tmpExePath
        );

        if (tmpFileExists) {
            showLoading(true, "Aplicando atualização...");
            await window.electronAPI.moveFile(tmpExePath, exePath);
        }

        // Check for updates in background (won't start if already downloading)
        checkForSystemUpdates(item, tmpDir);

        // Launch the application with systemId for auto-download
        showLoading(true, `Executando ${item.title}...`);

        const result = await window.electronAPI.launchExe(
            exePath, 
            [currentUser?.username || ""],
            item.idSistema
        );

        if (result.success) {
            const message = result.wasDownloaded 
                ? `${item.title} foi baixado e executado com sucesso!`
                : `${item.title} foi executado com sucesso!`;
                
            showToast({
                color: "success",
                title: "Sucesso",
                message: message,
                duration: 3000,
                autohide: true,
            });
        } else {
            showToast({
                color: "danger",
                title: "Erro",
                message: result.message || "Erro ao executar aplicativo",
                duration: 3000,
                autohide: true,
            });
        }
    } catch (error) {
        console.error("Menu click error:", error);
        showToast({
            color: "danger",
            title: "Erro",
            message: `Erro ao executar ${item.title}: ${error.message}`,
            duration: 3000,
            autohide: true,
        });
    } finally {
        showLoading(false);
    }
}

async function checkForSystemUpdates(item, tmpDir) {
    console.log(`checkForSystemUpdates(${item.title}, ${tmpDir})`);
    
    // Check if already downloading
    if (downloadingSystemIds.has(item.idSistema)) {
        console.log(`System ${item.idSistema} is already downloading, skipping...`);
        return;
    }
    
    try {
        // This runs in background, don't show loading
        const sistema = await window.electronAPI.getSystemVersion(
            item.idSistema
        );

        console.log("sistema", sistema);

        const exePath = `${appConfig.caminhoExecLocal}${item.action}`;

        console.log("exePath", exePath);

        const localVersion = await window.electronAPI.getFileVersion(exePath);
        
        console.log("localVersion", localVersion);

        if (localVersion && sistema.versao) {
            const localVersionString = normalizeVersionString(localVersion.version || "0.0.0");
            const serverVersionString = normalizeVersionString(sistema.versao || "0.0.0");

            const cmp = compareVersions(serverVersionString, localVersionString);

            console.log(`Version compare: server=${serverVersionString} local=${localVersionString} cmp=${cmp}`);

            if (cmp > 0) {
                console.log(
                    `Update available for ${item.title}: ${localVersionString} -> ${serverVersionString}`
                );

                // Mark as downloading
                downloadingSystemIds.add(item.idSistema);

                // Download update in background and return downloaded path
                const downloadResp = await downloadSystemUpdate(item, tmpDir);
                if (downloadResp && downloadResp.path) {
                    // FIXED: Extract to local temp directory (tmpDir is now local, not network)
                    try {
                        console.log(`Extracting ${item.title} from ${downloadResp.path} to ${tmpDir}`);
                        const extractResp = await window.electronAPI.extractZip(
                            downloadResp.path, 
                            tmpDir
                        );
                        
                        if (extractResp && extractResp.success) {
                            console.log(`Successfully extracted ${item.title} to ${extractResp.dest}`);
                            
                            // Clean up downloaded zip
                            await window.electronAPI.deleteFile(downloadResp.path);
                            
                            // Show success notification
                            showToast({
                                color: "success",
                                title: "Atualização Concluída",
                                message: `${item.title} foi atualizado! Pode abrir novamente.`,
                                duration: 5000,
                                autohide: true,
                            });
                        } else {
                            console.warn("Extract failed:", extractResp && extractResp.message);
                            showToast({
                                color: "warning",
                                title: "Erro na Extração",
                                message: extractResp?.message || "Falha ao extrair atualização",
                                duration: 4000,
                                autohide: true,
                            });
                        }
                    } catch (err) {
                        console.error("Extraction/apply update error:", err);
                        showToast({
                            color: "danger",
                            title: "Erro",
                            message: `Erro ao aplicar atualização: ${err.message}`,
                            duration: 4000,
                            autohide: true,
                        });
                    }
                }
                
                // Remove from downloading set
                downloadingSystemIds.delete(item.idSistema);
            } else {
                console.log(`No update required for ${item.title} (server ${serverVersionString} <= local ${localVersionString})`);
            }
        }
    } catch (error) {
        console.error("System update check error:", error);
        // Remove from downloading set on error
        downloadingSystemIds.delete(item.idSistema);
    }
}

async function downloadSystemUpdate(item, tmpDir) {
    try {
        console.log(`Downloading system update for ${item.title}...`);

        const response = await window.electronAPI.downloadSystem(
            item.idSistema
        );

        if (response && response.success) {
            console.log(`System update downloaded for ${item.title} - Size: ${response.size || 'unknown'} bytes`);
            return response;
        } else if (response) {
            console.warn(`Download returned but success=false for ${item.title}:`, response);
            throw new Error(response.message || response.error || 'Download falhou sem mensagem específica');
        }
        
        console.warn(`Download returned null/undefined for ${item.title}`);
        return null;
    } catch (error) {
        console.error("Download system update error:", error);
        
        // Show user-friendly error message with specific codes
        const errorMsg = error.message || String(error);
        let toastColor = "danger";
        let toastTitle = "Erro no Download";
        let toastMessage = `Falha ao baixar ${item.title}`;
        
        // Check for specific error patterns
        if (errorMsg.includes("SERVER_ERROR_500") || errorMsg.includes("status code 500") || errorMsg.includes("Erro interno no servidor")) {
            toastColor = "danger";
            toastTitle = "Erro no Servidor";
            toastMessage = `O servidor encontrou um erro ao processar ${item.title}. Contate o administrador da API para verificar os logs do servidor.`;
        } else if (errorMsg.includes("SERVER_ERROR") || (errorMsg.includes("status code") && errorMsg.match(/5\d{2}/))) {
            toastColor = "danger";
            toastTitle = "Erro no Servidor";
            toastMessage = `Erro no servidor ao baixar ${item.title}. Tente novamente mais tarde ou contate o suporte.`;
        } else if (errorMsg.includes("Arquivo não encontrado") || errorMsg.includes("FILE_NOT_FOUND")) {
            toastColor = "warning";
            toastTitle = "Atualização Indisponível";
            toastMessage = `O servidor não tem o arquivo de atualização para ${item.title}. Contate o suporte.`;
        } else if (errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("permissão")) {
            toastMessage = `Sem permissão de acesso. Execute o aplicativo como Administrador ou verifique as permissões da pasta TEMP.`;
        } else if (errorMsg.includes("DISK_FULL") || errorMsg.includes("espaço em disco")) {
            toastMessage = `Espaço em disco insuficiente para download. Libere espaço e tente novamente.`;
        } else if (errorMsg.includes("TIMEOUT") || errorMsg.includes("tempo")) {
            toastMessage = `Tempo de download esgotado. Verifique sua conexão com a internet e tente novamente.`;
        } else if (errorMsg.includes("CONNECTION_FAILED") || errorMsg.includes("conectar")) {
            toastMessage = `Não foi possível conectar ao servidor. Verifique sua conexão de rede.`;
        } else if (errorMsg.includes("UNAUTHORIZED") || errorMsg.includes("autorização")) {
            toastMessage = `Sessão expirada. Faça login novamente.`;
        } else {
            // Generic error with truncated message
            toastMessage = `Falha ao baixar ${item.title}: ${errorMsg.substring(0, 150)}`;
        }
        
        showToast({
            color: toastColor,
            title: toastTitle,
            message: toastMessage,
            duration: 8000,
            autohide: true,
        });
        
        return null;
    }
}

// System download event listeners
window.electronAPI.onSystemDownloadStarted((event, data) => {
    console.log('[System Download] Started:', data);
    // Extract filename from path manually (Windows-style)
    const filename = data.exePath.split('\\').pop() || 'arquivo';
    showLoading(true, `Baixando ${filename}...`);
});

window.electronAPI.onSystemDownloadProgress((event, data) => {
    console.log('[System Download] Progress:', data);
    if (data.status === 'extracting') {
        showLoading(true, 'Extraindo arquivos...');
    }
});

window.electronAPI.onSystemDownloadComplete((event, data) => {
    console.log('[System Download] Complete:', data);
    showLoading(false);
    showToast({
        color: "success",
        title: "Download Completo",
        message: "Sistema baixado e instalado com sucesso!",
        duration: 3000,
        autohide: true,
    });
});

window.electronAPI.onSystemDownloadFailed((event, data) => {
    console.log('[System Download] Failed:', data);
    console.error('[System Download] Error details:', {
        systemId: data.systemId,
        error: data.error,
        timestamp: new Date().toISOString()
    });
    
    showLoading(false);
    
    // Parse error message for specific handling
    const errorMsg = data.error || 'Erro desconhecido';
    let toastMessage = `Falha ao baixar sistema: ${errorMsg}`;
    let toastTitle = "Erro no Download";
    
    if (errorMsg.includes('status code 500') || errorMsg.includes('SERVER_ERROR_500')) {
        toastTitle = "Erro no Servidor";
        toastMessage = "O servidor encontrou um erro ao processar esta solicitação. Contate o administrador da API.";
    } else if (errorMsg.match(/status code 5\d{2}/)) {
        toastTitle = "Erro no Servidor";
        toastMessage = "Erro no servidor. Tente novamente mais tarde ou contate o suporte.";
    } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
        toastTitle = "Sem Autorização";
        toastMessage = "Sua sessão expirou. Por favor, faça login novamente.";
    }
    
    showToast({
        color: "danger",
        title: toastTitle,
        message: toastMessage,
        duration: 8000,
        autohide: true,
    });
});

// Event listeners
logoutBtn.addEventListener("click", async () => {
    const confirmLogout = await showConfirmModal(
        "Deseja realmente sair do sistema?"
    );

    if (confirmLogout) {
        try {
            localStorage.removeItem("filial");
            await window.electronAPI.logout();
            await window.electronAPI.navigateToLogin();
        } catch (error) {
            console.error("Logout error:", error);
            showToast({
                color: "danger",
                title: "Erro",
                message: "Erro ao fazer logout: " + error.message,
                duration: 3000,
                autohide: true,
            });
        }
    }
});

// Install button event listener (only visible for ADM users)
const installBtn = document.getElementById("install-btn");
if (installBtn) {
    installBtn.addEventListener("click", () => {
        const installerUrl = "http://145.223.26.230/cdi4cbbf9c648c05/InstalacaoCDI.zip";
        window.electronAPI.openExternal(installerUrl);
    });
}

// Initialize page when DOM is loaded
document.addEventListener("DOMContentLoaded", initializePage);

function abrirAnyDesk() {
    var downloadUrl = "https://anydesk.com/pt/downloads/thank-you?dv=win_exe";
    var protocolUrl = "anydesk:";

    var opened = false;

    // Detect if user left the page (app opened)
    var blurHandler = function () {
        opened = true;
        window.removeEventListener("blur", blurHandler);
    };
    window.addEventListener("blur", blurHandler);

    // Try to open AnyDesk via hidden iframe
    var iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = protocolUrl;
    document.body.appendChild(iframe);

    // Fallback after 1.5s
    setTimeout(function () {
        document.body.removeChild(iframe);
        if (!opened) {
            window.open(downloadUrl, "_blank");
        }
    }, 1500);
}

function abrirWhatsApp() {
    var phoneNumber = "553584653219";
    var whatsappUrl = "https://wa.me/" + phoneNumber;
    window.open(whatsappUrl, "_blank");
}

// Utility: parse a version string into numeric segments
function parseVersion(v) {
    if (!v && v !== 0) return [];
    const s = String(v).trim();
    // remove any non-digit/dot characters (e.g. "1.0.0-beta" -> "1.0.0")
    const cleaned = s.replace(/[^0-9.]/g, "");
    if (!cleaned) return [];
    return cleaned
        .split(".")
        .map((p) => {
            // remove leading zeros safely and parse int
            const num = parseInt(p.replace(/^0+(?=\d)/, "") || "0", 10);
            return Number.isNaN(num) ? 0 : num;
        });
}

// Utility: normalize version to a canonical string "x.y.z"
function normalizeVersionString(v) {
    const parts = parseVersion(v);
    if (parts.length === 0) return "0.0.0";
    return parts.join(".");
}

// Utility: compare two version strings (numeric comparison)
// returns 1 if a>b, -1 if a<b, 0 if equal
function compareVersions(a, b) {
    const A = parseVersion(a);
    const B = parseVersion(b);
    const len = Math.max(A.length, B.length);
    for (let i = 0; i < len; i++) {
        const ai = A[i] || 0;
        const bi = B[i] || 0;
        if (ai > bi) return 1;
        if (ai < bi) return -1;
    }
    return 0;
}

async function launchSystem(system) {
    try {
        showLoading(true, `Verificando ${system.nome}...`);

        const exePath = system.caminho;
        // Extract filename manually (Windows-style) since path module is not available in renderer
        const processName = exePath.split('\\').pop().replace('.exe', '');

        // Check if process is running
        const runningProcesses = await window.electronAPI.checkProcess(processName);

        if (runningProcesses && runningProcesses.length > 0) {
            showLoading(false);
            
            const shouldKill = await showConfirmModal(
                `${system.nome} já está em execução. Deseja fechar e reiniciar?`
            );

            if (!shouldKill) return;

            showLoading(true, `Encerrando ${system.nome}...`);

            for (const proc of runningProcesses) {
                await window.electronAPI.killProcess(proc.pid);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        showLoading(true, `Iniciando ${system.nome}...`);

        const username = currentUser?.username || "";
        
        // Pass systemId for auto-download if file not found
        const result = await window.electronAPI.launchExe(
            exePath, 
            [username],
            system.id  // Pass systemId for auto-download
        );

        showLoading(false);

        if (result.success) {
            const message = result.wasDownloaded 
                ? `${system.nome} foi baixado e iniciado com sucesso!`
                : `${system.nome} iniciado com sucesso!`;
                
            showToast({
                color: "success",
                title: "Sucesso",
                message: message,
                duration: 3000,
                autohide: true,
            });
        } else {
            showToast({
                color: "danger",
                title: "Erro ao Iniciar",
                message: result.message || `Falha ao iniciar ${system.nome}`,
                duration: 5000,
                autohide: true,
            });
        }
    } catch (error) {
        showLoading(false);
        console.error('Launch error:', error);
        showToast({
            color: "danger",
            title: "Erro",
            message: error.message || 'Erro ao iniciar sistema',
            duration: 5000,
            autohide: true,
        });
    }
}

async function checkAndUpdateHiddenSystems() {
    try {
        console.log('[Hidden Systems] Starting background update check...');

        const hiddenSystems = await window.electronAPI.getSystems(1);

        if (!hiddenSystems || hiddenSystems.length === 0) {
            console.log('[Hidden Systems] No hidden systems found');
            return;
        }

        hiddenMenuItems = hiddenSystems.map((sistema) => ({
            idSistema: sistema.idSistema,
            title: sistema.descricao,
            icon: sistema.icon || "bi-application",
            action: sistema.nomeExe,
        }));

        console.log("[Hidden Systems]", hiddenSystems)
        console.log(`[Hidden Systems] Found ${hiddenMenuItems.length} hidden systems to check`);

        // Process each hidden system in background (non-blocking, async)
        for (const item of hiddenMenuItems) {
            // Don't await - let it run in background
            processHiddenSystemUpdate(item).catch(error => {
                console.error(`[Hidden Systems] Error updating ${item.title}:`, error);
            });
        }

    } catch (error) {
        console.error("[Hidden Systems] Load error:", error);
        showToast({
            color: "danger",
            title: "Erro",
            message: "Erro ao carregar sistemas internos: " + error.message,
            duration: 3000,
            autohide: true,
        });
    }
}

async function processHiddenSystemUpdate(system) {
    try {
        console.log(`[Hidden Systems] Processing ${system.name}...`);
        
        // Get server version info
        const serverVersion = await window.electronAPI.getSystemVersion(system.id);
        
        // FIXED: Skip systems without version info instead of throwing error
        if (!serverVersion || !serverVersion.version) {
            console.warn(`[Hidden Systems] ${system.name} - No version info available, skipping update check`);
            return;
        }

        console.log(`[Hidden Systems] ${system.name} - Server version: ${serverVersion.version}`);

        // Build full exe path
        const exePath = await buildExePath(system);
        if (!exePath) {
            console.warn(`[Hidden Systems] ${system.name} - Cannot build exe path`);
            return;
        }

        // Get local file version
        const localVersion = await window.electronAPI.getFileVersion(exePath);
        
        // If file doesn't exist locally, download it
        if (!localVersion) {
            console.log(`[Hidden Systems] ${system.name} - File not found locally, downloading...`);
            await downloadAndExtractSystem(system, exePath);
            return;
        }

        console.log(`[Hidden Systems] ${system.name} - Local version: ${localVersion.version}`);

        // Compare versions (simple string comparison for now)
        if (serverVersion.version !== localVersion.version) {
            console.log(`[Hidden Systems] ${system.name} - Update needed (${localVersion.version} -> ${serverVersion.version})`);
            await downloadAndExtractSystem(system, exePath);
        } else {
            console.log(`[Hidden Systems] ${system.name} - Already up to date`);
        }
    } catch (error) {
        // FIXED: Softer error handling - log but don't stop the update flow
        console.warn(`[Hidden Systems] ${system.name} - Update check failed:`, error.message);
    }
}

async function downloadAndExtractSystem(system, exePath) {
    try {
        console.log(`[Hidden Systems] ${system.name} - Starting download...`);
        
        const result = await window.electronAPI.downloadSystem(system.id);
        if (!result || !result.success) {
            throw new Error(result?.message || 'Download failed');
        }

        console.log(`[Hidden Systems] ${system.name} - Downloaded to: ${result.path}`);
        console.log(`[Hidden Systems] ${system.name} - Extracting...`);

        const destDir = exePath.substring(0, exePath.lastIndexOf('\\'));
        const extractResult = await window.electronAPI.extractZip(result.path, destDir);
        
        if (!extractResult || !extractResult.success) {
            throw new Error(extractResult?.message || 'Extraction failed');
        }

        console.log(`[Hidden Systems] ${system.name} - Extracted to: ${extractResult.dest}`);

        // Clean up downloaded zip
        await window.electronAPI.deleteFile(result.path);
        console.log(`[Hidden Systems] ${system.name} - Update complete!`);
    } catch (error) {
        console.error(`[Hidden Systems] ${system.name} - Download/extract failed:`, error.message);
        throw error;
    }
}
