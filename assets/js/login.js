// JavaScript extracted from login.html
// Handles login form UI, API status check and calling electronAPI.login

// Global state
let isLoading = false;

// DOM elements
const loadingOverlay = document.getElementById("loading-overlay");
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("btn-login");
const errorToast = document.getElementById("error-toast");
const toastMessage = document.getElementById("toast-message");
const togglePassword = document.getElementById("togglePassword");

const newPasswordContainer = document.getElementById("new-password-container");
const newPasswordInput = document.getElementById("newPassword");
const toggleNewPassword = document.getElementById("toggleNewPassword");

togglePassword.addEventListener("click", () => {
    const type =
        passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);

    // toggle icon classes
    togglePassword.classList.toggle("bi-eye");
    togglePassword.classList.toggle("bi-eye-slash");
});

toggleNewPassword.addEventListener("click", () => {
    const type =
        newPasswordInput.getAttribute("type") === "password" ? "text" : "password";
    newPasswordInput.setAttribute("type", type);

    // toggle icon classes
    toggleNewPassword.classList.toggle("bi-eye");
    toggleNewPassword.classList.toggle("bi-eye-slash");
});

// Utility functions
function showLoading(state) {
    isLoading = state;
    loadingOverlay.style.display = state ? "flex" : "none";
    loginButton.disabled = state;

    if (state) {
        loginButton.innerHTML =
            '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Entrando...';
    } else {
        loginButton.innerHTML =
            '<i class="bi bi-box-arrow-in-right me-2"></i>Login';
    }
}

function showError(message) {
    toastMessage.textContent = message;
    const toast = new bootstrap.Toast(errorToast, { delay: 8000 });
    toast.show();
}

function handleUserInput(event) {
    // Convert to uppercase as user types (like MAUI version)
    event.target.value = event.target.value.toUpperCase();
    // wait for 50ms and focus on password input if username length is 3
    if (event.target.id === "username" && event.target.value.length === 3) {
        setTimeout(() => {
            passwordInput.focus();
        }, 50);
    }
}

// Event listeners
usernameInput.addEventListener("input", handleUserInput);

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();

    if (!username || !password) {
        showError("Por favor, preencha usuário e senha");
        return;
    }

    if (newPasswordContainer.classList.contains("d-none") === false && !newPassword) {
        showError("Por favor, preencha a nova senha");
        return;
    }

    try {
        showLoading(true);

        // Check API status first
        const apiStatus = await window.electronAPI.checkApiStatus();
        if (!apiStatus) {
            const config = await window.electronAPI.getConfig();
            showError(
                `⚠️ O servidor está offline. Verifique sua conexão e tente novamente.\n${config.apiBaseUrl}`
            );
            return;
        }

        // Attempt login
        const loginResult = await window.electronAPI.login({
            username: username,
            password: password,
            newPassword: newPasswordContainer.classList.contains("d-none") ? null : newPassword
        });

        if (loginResult.success) {
            console.log("loginResult.success")
            console.log(loginResult)

            console.log("companyName", loginResult.companyName)

            // Store user preferences if needed
            localStorage.setItem("lastUsername", username);
            localStorage.setItem("filial", loginResult.companyName);
            localStorage.setItem("userName", loginResult.userName);

            // Navigate to main menu
            await window.electronAPI.navigateToMain();
        } else {
            showError(loginResult.message || "Erro ao efetuar login");
        }
    } catch (error) {
        console.error("Login error:", error);
        showError("Erro inesperado ao efetuar login: " + error.message);
    } finally {
        showLoading(false);
    }
});

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Load last username if available
        const lastUsername = localStorage.getItem("lastUsername");
        if (lastUsername) {
            usernameInput.value = lastUsername;
            passwordInput.focus();
        } else {
            usernameInput.focus();
        }

        // Check if already authenticated
        const authState = await window.electronAPI.getAuthState();
        if (authState.isAuthenticated) {
            await window.electronAPI.navigateToMain();
            return;
        }

        // Check API status on load
        try {
            const apiStatus = await window.electronAPI.checkApiStatus();
            if (!apiStatus) {
                const config = await window.electronAPI.getConfig();
                if (config.apiBaseUrl) {
                    showError(`⚠️ Servidor offline: ${config.apiBaseUrl}`);
                } else {
                    showError(
                        "⚠️ URL da API não configurada. Verifique as variáveis de ambiente."
                    );
                }
            }
        } catch (error) {
            console.error("API status check failed:", error);
        }
    } catch (error) {
        console.error("Page initialization error:", error);
        showError("Erro ao inicializar a página");
    }
});

// Handle Enter key navigation
usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        passwordInput.focus();
    }
});

passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        loginForm.dispatchEvent(new Event("submit"));
    }
});

function trocarSenha() {
    newPasswordContainer.classList.remove("d-none");
}