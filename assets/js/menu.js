// Global state
let isLoading = false;
let currentUser = null;
let menuItems = [];
let appConfig = {};

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
        showLoading(true, `Iniciando ${item.title}...`);

        const exePath = `${appConfig.caminhoExecLocal}${item.action}`;
        const tmpDir = `${appConfig.caminhoExecLocal}tmp\\`;

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

        // Check for updates in background
        checkForUpdates(item, tmpDir);

        // Launch the application with systemId for auto-download
        showLoading(true, `Executando ${item.title}...`);

        const result = await window.electronAPI.launchExe(
            exePath, 
            [currentUser?.username || ""],
            item.idSistema  // ← ADICIONADO: Pass systemId for auto-download
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

async function checkForUpdates(item, tmpDir) {
    console.log(`checkForUpdates(${item}, ${tmpDir})`)
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
            // Simple version comparison (you might want to implement proper semver comparison)
            //const localVersionString = localVersion.version || "0.0.0.0";
            //const serverVersionString = sistema.versao || "0.0.0.0";
            const localVersionString = normalizeVersionString(localVersion.version || "0.0.0");
            const serverVersionString = normalizeVersionString(sistema.versao || "0.0.0");

            // Use numeric comparison instead of simple string inequality
            const cmp = compareVersions(serverVersionString, localVersionString);

            console.log(`Version compare: server=${serverVersionString} local=${localVersionString} cmp=${cmp}`);

            if (cmp > 0) {
                console.log(
                    `Update available for ${item.title}: ${localVersionString} -> ${serverVersionString}`
                );

                // Download update in background and return downloaded path
                const downloadResp = await downloadUpdate(item, tmpDir);
                if (downloadResp && downloadResp.path) {
                    // Try to extract the downloaded zip to tmpDir
                    try {
                        const extractResp = await window.electronAPI.extractZip(downloadResp.path, tmpDir);
                        if (extractResp && extractResp.success) {
                            // After extraction, check for the expected tmp exe and move it to exePath
                            const tmpExePath = `${tmpDir}${item.action}`;
                            const tmpFileExists = await window.electronAPI.getFileVersion(tmpExePath);
                            if (tmpFileExists) {
                                //delete the .zip file
                                await window.electronAPI.deleteFile(downloadResp.path);
                            } else {
                                console.warn(`Extracted but tmp exe not found at ${tmpExePath}`);
                            }
                        } else {
                            console.warn("Extract failed:", extractResp && extractResp.message);
                        }
                    } catch (err) {
                        console.error("Extraction/apply update error:", err);
                    }
                }
            } else {
                console.log(`No update required for ${item.title} (server ${serverVersionString} <= local ${localVersionString})`);
            }
        }
    } catch (error) {
        console.error("Update check error:", error);
        // Don't show error to user for background operation
    }
}

async function downloadUpdate(item, tmpDir) {
    try {
        console.log(`Downloading update for ${item.title}...`);

        // Note: This is a simplified version. In a real implementation,
        // you'd need to handle the stream download properly
        const response = await window.electronAPI.downloadSystem(
            item.idSistema
        );

        if (response) {
            console.log(`Update downloaded for ${item.title}`);
            // The actual file download and extraction would happen in the main process
            return response;
        }
        return null;
    } catch (error) {
        console.error("Download update error:", error);
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
    showLoading(false);
    showToast({
        color: "danger",
        title: "Erro no Download",
        message: `Falha ao baixar sistema: ${data.error}`,
        duration: 5000,
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