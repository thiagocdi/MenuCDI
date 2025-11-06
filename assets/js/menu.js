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

// Utility functions
function showLoading(state, message = "Carregando...") {
    isLoading = state;
    loadingOverlay.style.display = state ? "flex" : "none";
    loadingMessage.textContent = message;
}

function showError(message) {
    document.getElementById("toast-message").textContent = message;
    const toast = new bootstrap.Toast(errorToast, { delay: 8000 });
    toast.show();
}

function showSuccess(message) {
    successMessage.textContent = message;
    const toast = new bootstrap.Toast(successToast, { delay: 4000 });
    toast.show();
}

function showConfirmModal(message) {
    return new Promise((resolve) => {
        modalMessage.textContent = message;

        const handleConfirm = () => {
            modalConfirmBtn.removeEventListener("click", handleConfirm);
            confirmModal.hide();
            resolve(true);
        };

        const handleCancel = () => {
            document
                .querySelector("#confirmModal .btn-secondary")
                .removeEventListener("click", handleCancel);
            confirmModal.hide();
            resolve(false);
        };

        modalConfirmBtn.addEventListener("click", handleConfirm);
        document
            .querySelector("#confirmModal .btn-secondary")
            .addEventListener("click", handleCancel);

        confirmModal.show();
    });
}

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
        showError("Erro ao inicializar aplicação: " + error.message);
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
        showError("Erro ao carregar sistemas: " + error.message);
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

        // Launch the application
        showLoading(true, `Executando ${item.title}...`);

        const result = await window.electronAPI.launchExe(exePath, [
            currentUser?.username || "",
        ]);

        if (result.success) {
            showSuccess(`${item.title} foi executado com sucesso!`);
        } else {
            showError(result.message || "Erro ao executar aplicativo");
        }
    } catch (error) {
        console.error("Menu click error:", error);
        showError(`Erro ao executar ${item.title}: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function checkForUpdates(item, tmpDir) {
    try {
        // This runs in background, don't show loading
        const sistema = await window.electronAPI.getSystemVersion(
            item.idSistema
        );
        const exePath = `${appConfig.caminhoExecLocal}${item.action}`;

        const localVersion = await window.electronAPI.getFileVersion(exePath);

        if (localVersion && sistema.versao) {
            // Simple version comparison (you might want to implement proper semver comparison)
            const localVersionString = localVersion.version || "0.0.0.0";
            const serverVersionString = sistema.versao || "0.0.0.0";

            if (localVersionString !== serverVersionString) {
                console.log(
                    `Update available for ${item.title}: ${localVersionString} -> ${serverVersionString}`
                );

                // Download update in background
                downloadUpdate(item, tmpDir);
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
        }
    } catch (error) {
        console.error("Download update error:", error);
    }
}

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
            showError("Erro ao fazer logout: " + error.message);
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
