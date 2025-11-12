// Utility functions
function showLoading(state, message = "Carregando...") {
    isLoading = state;
    loadingOverlay.style.display = state ? "flex" : "none";
    loadingMessage.textContent = message;
}

function showToast({
    color = "primary",
    title = "Notification",
    message = "",
    duration = 5000,
    autohide = true,
    func = "",
    error = null,
}) {
    // Create the toast container if it doesn't exist
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toast-container";
        toastContainer.style.position = "fixed";
        toastContainer.style.top = "1rem"; // Position at the bottom
        toastContainer.style.left = "50%"; // Center horizontally
        toastContainer.style.transform = "translateX(-50%)"; // Adjust for centering
        toastContainer.style.zIndex = "1050";
        document.body.appendChild(toastContainer);
    }

    // Create the toast element
    const toast = document.createElement("div");
    toast.className = `toast align-items-center text-bg-${color} border-0`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");
    toast.setAttribute("aria-atomic", "true");
    toast.style.minWidth = "300px";

    // Set autohide and duration
    if (autohide) {
        toast.setAttribute("data-bs-autohide", "true");
        toast.setAttribute("data-bs-delay", duration);
    } else {
        toast.setAttribute("data-bs-autohide", "false");
    }

    // Toast content
    toast.innerHTML = `
    <div class="d-flex">
        <div class="toast-body">
            <strong>${title}</strong><br>${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    `;

    // Append the toast to the container
    toastContainer.appendChild(toast);

    // Initialize and show the toast
    const bootstrapToast = new bootstrap.Toast(toast);
    bootstrapToast.show();

    // Remove the toast from the DOM after it hides
    toast.addEventListener("hidden.bs.toast", () => {
        toast.remove();
    });

    if (color === "danger") {
        // Play audio for danger toasts
        //audioJumento();
    }

    if (error) {
        console.error(`Error (${func}):`, error);
        const currentUser = localStorage.getItem("user") || "";
        if (currentUser === "ADM") {
            alert(`Error (${func}):` + error.message);
        }
    }
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
