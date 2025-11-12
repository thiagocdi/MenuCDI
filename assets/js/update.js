// Auto-update functionality
let updateInfo = null;
let downloadedInstallerPath = null;

// Check for updates on startup (after 2 seconds)
setTimeout(checkForUpdates, 2000);

// Check for updates periodically (every 10 minutes)
setInterval(checkForUpdates, 10 * 60 * 1000);

async function checkForUpdates() {
    try {
        console.log('[UI] Checking for application updates...');
        const result = await window.electronAPI.checkForAppUpdates();
        
        if (result.available) {
            updateInfo = result;
            showUpdateNotification(result);
        } else {
            console.log('[UI] No updates available:', result.message || 'Up to date');
        }
    } catch (error) {
        console.error('[UI] Update check failed:', error);
    }
}

function showUpdateNotification(info) {
    document.getElementById('currentVersionSpan').textContent = `v${info.currentVersion}`;
    document.getElementById('newVersionSpan').textContent = info.latestVersion;
    
    if (info.notes && info.notes.trim()) {
        document.getElementById('updateNotesParagraph').textContent = info.notes;
        document.getElementById('updateNotesDiv').style.display = 'block';
    } else {
        document.getElementById('updateNotesDiv').style.display = 'none';
    }
    
    const modal = new bootstrap.Modal(document.getElementById('updateModal'));
    modal.show();
}

// Download update button
document.getElementById('downloadUpdateBtn').addEventListener('click', async function() {
    if (!updateInfo || !updateInfo.downloadUrl) return;
    
    this.disabled = true;
    document.getElementById('updateLaterBtn').disabled = true;
    document.getElementById('downloadProgressDiv').style.display = 'block';
    
    // Listen for download progress
    window.electronAPI.onUpdateDownloadProgress((data) => {
        const { percent, downloadedBytes, totalBytes } = data;
        const progressBar = document.getElementById('downloadProgressBar');
        const progressText = document.getElementById('downloadProgressText');
        
        progressBar.style.width = percent + '%';
        progressBar.textContent = Math.round(percent) + '%';
        
        const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
        progressText.textContent = `Baixando: ${downloadedMB} MB / ${totalMB} MB`;
    });
    
    try {
        const result = await window.electronAPI.downloadAppUpdate(updateInfo.downloadUrl);
        
        if (result.success) {
            downloadedInstallerPath = result.path;
            document.getElementById('downloadProgressDiv').style.display = 'none';
            document.getElementById('downloadUpdateBtn').style.display = 'none';
            document.getElementById('installUpdateBtn').style.display = 'inline-block';
            showToast({
                color: "success",
                title: "Sucesso",
                message: 'Download concluído! Clique em "Instalar agora" para atualizar.',
                duration: 3000,
                autohide: true,
            });
        } else {
            throw new Error(result.message || 'Download failed');
        }
    } catch (error) {
        console.error('[UI] Download failed:', error);
        showToast({
            color: "danger",
            title: "Erro",
            message: 'Erro ao baixar atualização: ' + error.message,
            duration: 3000,
            autohide: true,
        });
        document.getElementById('downloadUpdateBtn').disabled = false;
        document.getElementById('updateLaterBtn').disabled = false;
        document.getElementById('downloadProgressDiv').style.display = 'none';
    }
});

// Install update button
document.getElementById('installUpdateBtn').addEventListener('click', async function() {
    if (!downloadedInstallerPath) return;
    
    this.disabled = true;
    
    try {
        showToast('Instalando atualização... O aplicativo será fechado.', 'info');
        
        setTimeout(async () => {
            const result = await window.electronAPI.installAppUpdate(downloadedInstallerPath);
            if (!result.success) {
                throw new Error(result.message || 'Install failed');
            }
        }, 1000);
    } catch (error) {
        console.error('[UI] Install failed:', error);
        showToast('Erro ao instalar atualização: ' + error.message, 'danger');
        this.disabled = false;
    }
});

// Later button
document.getElementById('updateLaterBtn').addEventListener('click', function() {
    const modal = bootstrap.Modal.getInstance(document.getElementById('updateModal'));
    modal.hide();
});