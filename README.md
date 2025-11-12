# MenuCDI - Electron Launcher

> A modern Electron-based application launcher that replaces MAUI Blazor hybrid app with enhanced compatibility for legacy Windows systems.

## 🚀 Overview

MenuCDI is a desktop application launcher that provides secure authentication, dynamic menu loading from APIs, process management, and automatic update capabilities. Originally built as a MAUI Blazor hybrid app, it has been migrated to Electron for better compatibility with older Windows systems and easier deployment.

## ✨ Features

### 🔐 Authentication System
- Secure login with API validation
- Bearer token authentication
- Real-time API status checking
- Persistent session management
- Automatic navigation between login/main screens

### 📋 Dynamic Menu System
- API-driven menu loading
- Bootstrap Icons support
- Responsive grid layout with hover effects
- Real-time system availability checking

### ⚙️ Process Management
- Check running processes by name
- Smart process conflict resolution
- Kill/restart confirmation dialogs
- Launch executables with custom parameters

### 🔄 Auto-Update System
- Background version checking
- Non-blocking update downloads
- Automatic file replacement on restart
- ZIP extraction and deployment

### 🎨 Modern UI/UX
- Bootstrap 5 styling with custom CDI branding
- Loading overlays and progress indicators
- Toast notifications for user feedback
- Responsive design for different screen sizes
- Smooth animations and transitions

## 🖥️ Windows Compatibility

### Supported Operating Systems
- ✅ **Windows 11** (Electron 22.x)
- ✅ **Windows 10** (Electron 22.x)
- ✅ **Windows 7** (Electron 13.x - Legacy build)
- ✅ **Windows Server 2012 R2** (Electron 13.x - Legacy build)

### Build Targets
- **Modern Windows**: Uses Electron 22.x with latest features
- **Legacy Windows**: Uses Electron 13.x for Windows 7/Server 2012 R2 compatibility

## 🛠️ Installation

### Prerequisites
- **Node.js** 16.x or higher
- **npm** 8.x or higher
- **Git** (for cloning)

### Clone and Setup
```bash
# Clone the repository
git clone https://github.com/thiagocdi/MenuCDI.git
cd MenuCDI

# Install dependencies
npm install
```

### Environment Configuration
Set the following system environment variables:

```cmd
# API Base URL (including /api path)
setx CDI_URL_API_MENU "http://your-server.com/api" /M

# Local executable directory
setx CDI_CAMINHO_EXEC_LOCAL "C:\YourAppsPath\" /M
```

**Note**: Restart your terminal after setting environment variables.

## 🚀 Usage

### Development Mode
```bash
# Start the application in development mode
npm start
```

### Production Build
```bash
# Build for modern Windows (10/11)
npm run build

# Build for legacy Windows (7/Server 2012 R2)
npm run build-legacy
```

### Distribution
The built application will be available in the `dist/` directory as a portable executable.

## Publishing (build + publish)

To publish a new release to GitHub (so auto-updates via update.electronjs.org work), follow these steps:

1. Bump the version in package.json (example — set the desired version):
```powershell
# edit package.json or use npm to bump
npm version patch -m "chore(release): v%s"
# or manually update "version" in package.json
```

2. Build the app:
```powershell
npm run build
```

3. Publish the artifacts to GitHub Releases:
```powershell
# ensure GH_TOKEN or GITHUB_TOKEN is set in the environment
npm run publish
```

Notes:
- The published GitHub Release must be public (not a draft) and include Squirrel artifacts (.nupkg, RELEASES, Setup.exe) for Windows auto-updates to work.
- Users who run a portable/unpacked exe will not receive auto-updates; they must run the Setup.exe once to install the app (Squirrel install) so future updates are automatic.
- If you use CI, make sure the environment has GH_TOKEN (or GITHUB_TOKEN) configured so electron-builder can upload releases.

## 🔧 API Integration

### Required API Endpoints

Your API server must implement the following endpoints:

#### Authentication
- `GET /api/status` - API health check
- `POST /api/auth/login` - User authentication
  ```json
  // Request
  { "username": "ABC", "password": "password123" }
  
  // Response
  { "success": true, "token": "jwt_token", "user": { "username": "ABC" } }
  ```

#### Systems Management
- `GET /api/sistemas/menu` - Get available systems
  ```json
  [
    {
      "idSistema": 1,
      "descricao": "System Name",
      "icon": "bi-application",
      "nomeExe": "app.exe"
    }
  ]
  ```

- `GET /api/sistemas/{id}/versao` - Get system version
  ```json
  { "versao": "1.0.0.0" }
  ```

- `GET /api/sistemas/{id}/download` - Download system update (ZIP file)

## 📁 Project Structure

```
MenuCDI/
├── 📄 main.js              # Electron main process
├── 📄 preload.js           # Security bridge (IPC API)
├── 📄 login.html           # Authentication page
├── 📄 index.html           # Main menu interface
├── 📄 package.json         # Project configuration
├── 📁 assets/              # Static assets
│   ├── 📁 css/             # Bootstrap & custom styles
│   ├── 📁 js/              # Bootstrap JavaScript
│   └── 📁 images/          # Application images
├── 📁 .github/             # GitHub configuration
│   └── 📄 copilot-instructions.md
└── 📄 README.md            # This file
```

## 🔒 Security Features

### Context Isolation
- **nodeIntegration**: Disabled
- **contextIsolation**: Enabled
- **Preload Script**: Controlled API surface

### Authentication
- Bearer token authentication
- Token stored in main process memory
- Automatic token validation on API calls

### Process Security
- Controlled executable launching
- Process validation before termination
- Secure file operations

## 🛠️ Development

### Adding New Features

1. **New API Endpoint**: 
   - Add handler in `main.js`
   - Expose in `preload.js`
   - Call from renderer

2. **New UI Component**:
   - Use Bootstrap 5 components
   - Follow existing toast/modal patterns
   - Maintain CDI branding colors

3. **New Configuration**:
   - Add to environment variables in `main.js`
   - Document in README

### Code Style
- **JavaScript**: ES6+ with async/await
- **HTML**: Semantic HTML5 with Bootstrap 5
- **CSS**: Bootstrap utilities with custom CDI theming

## 🧪 Testing

### Manual Testing Checklist
- [ ] Login with valid/invalid credentials
- [ ] API status checking (online/offline)
- [ ] Menu loading and system display
- [ ] Process management (launch/kill/restart)
- [ ] Update checking and downloading
- [ ] Error handling and user feedback

### Compatibility Testing
- [ ] Windows 11 (modern build)
- [ ] Windows 10 (modern build)
- [ ] Windows 7 (legacy build)
- [ ] Windows Server 2012 R2 (legacy build)

## 📋 API Migration from MAUI

This Electron version maintains **100% API compatibility** with the original MAUI Blazor version:

| MAUI Blazor | Electron Equivalent |
|-------------|-------------------|
| `IAuthApi.VerificaApiStatus()` | `window.electronAPI.checkApiStatus()` |
| `IAuthApi.LoginAsync()` | `window.electronAPI.login()` |
| `IAuthApi.SistemasMenuAsync()` | `window.electronAPI.getSystems()` |
| `Process.GetProcessesByName()` | `window.electronAPI.checkProcess()` |
| `Process.Kill()` | `window.electronAPI.killProcess()` |
| `Process.Start()` | `window.electronAPI.launchExe()` |

## 🔧 Troubleshooting

### Common Issues

#### API Connection Errors
```
Error: connect ECONNREFUSED
```
**Solution**: Check environment variables and ensure API server is running.

#### Authentication Failures
```
Error: Not authenticated
```
**Solution**: Verify API credentials and check server response format.

#### Process Launch Failures
```
Error: Arquivo não encontrado
```
**Solution**: Verify `CDI_CAMINHO_EXEC_LOCAL` path and file permissions.

### Debug Mode
Set environment variable for detailed logging:
```cmd
set NODE_ENV=development
npm start
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Company**: CDI Informática e Assessoria Ltda
- **GitHub**: [thiagocdi/MenuCDI](https://github.com/thiagocdi/MenuCDI)
- **Issues**: [GitHub Issues](https://github.com/thiagocdi/MenuCDI/issues)

## 🎯 Roadmap

### Planned Features
- [ ] Multi-language support (PT/EN)
- [ ] Download progress indicators
- [ ] Windows file version detection
- [ ] System tray integration
- [ ] Auto-startup on Windows boot
- [ ] Keyboard shortcuts
- [ ] Dark mode theme

### Performance Improvements
- [ ] Lazy loading for large menu systems
- [ ] Background update optimizations
- [ ] Memory usage optimization
- [ ] Startup time improvements

---

**Built with ❤️ by CDI Informática e Assessoria Ltda**