module.exports = {
    packagerConfig: {
        asar: true,
        icon: './assets/images/icon.ico',
        executableName: 'MenuCDI',
        appBundleId: 'com.cdi.menu',
        appCopyright: 'Copyright © 2025 CDI Informática e Assessoria Ltda',
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'MenuCDI',
                authors: 'CDI Informática e Assessoria Ltda',
                exe: 'MenuCDI.exe',
                setupExe: 'MenuCDI-Setup.exe',
                iconUrl: 'https://raw.githubusercontent.com/thiagocdi/MenuCDI/main/assets/images/icon.ico',
                setupIcon: './assets/images/icon.ico',
                loadingGif: './assets/images/installer.gif',
                noMsi: true,
                // remoteReleases disabled during build to avoid 404/rate limit errors
                // Auto-update will still work via update-electron-app in main.js
                // remoteReleases: 'https://github.com/thiagocdi/MenuCDI',
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['win32'],
        },
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'thiagocdi',
                    name: 'MenuCDI',
                },
                prerelease: false,
                draft: false,
            },
        },
    ],
};