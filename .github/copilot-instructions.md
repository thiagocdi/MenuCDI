## Project summary

This is an Electron-based MenuCDI launcher that replicates functionality from a MAUI Blazor hybrid app. It provides authentication, dynamic menu loading from APIs, process management, and auto-update capabilities for launching Windows executables. The project supports both modern Windows (10/11) and legacy systems (Windows 7/Server 2012 R2).

## Big-picture architecture (authentication flow)
- **login.html** — Bootstrap-styled login page, API status checking, credential validation
- **index.html** — Main menu with dynamic system loading, process management, version checking  
- **main.js** — Electron main process with comprehensive IPC handlers for auth, API calls, file ops, process management
- **preload.js** — Security bridge exposing controlled API surface to renderer

Data flow example (auth + menu launch):
1. Login: renderer calls `window.electronAPI.login(credentials)` → API validation → auth state stored in main
2. Menu load: `getSystems()` → API call with Bearer token → dynamic menu rendering
3. Launch: `launchExe(path, args)` → process check → optional kill/restart → spawn process

## Key files to inspect
- `main.js` — Auth state, API client (axios), IPC handlers for all features, process management, file operations
- `login.html` — Bootstrap login form, API status validation, auth error handling
- `index.html` — Dynamic menu grid, process conflict resolution, background updates, toast notifications  
- `preload.js` — Complete API surface: auth, systems, process mgmt, file ops, navigation
- `package.json` — Dependencies (axios, node-stream-zip), legacy build target for Windows 7 compatibility

## Developer workflows (commands)
- **Development**: `npm start` (runs Electron, loads login.html first)
- **Modern build**: `npm run build` (Windows 10/11, Electron 22.x)
- **Legacy build**: `npm run build-legacy` (Windows 7/Server 2012, Electron 13.x)
- **Install deps**: `npm install` (includes axios for HTTP, node-stream-zip for updates)

## Configuration & Environment
- Required env vars: `CDI_URL_API_MENU` (API base URL), `CDI_CAMINHO_EXEC_LOCAL` (local exe directory)
- Auth state: stored in main process memory (authToken, currentUser), validated per API call
- App config: loaded from env vars via `get-config` IPC call

## Project-specific patterns & security
- **Multi-page navigation**: `navigateToLogin()` / `navigateToMain()` load different HTML files
- **Auth flow**: login.html → API validation → navigate to index.html → check auth state
- **Process management**: check running processes by name → confirm kill/restart → spawn with args
- **Background updates**: version check → download to tmp/ → move on next launch
- **Error handling**: Bootstrap toasts for user feedback, console logging for debugging

## API integration patterns
All API calls use Bearer token authentication after login:
```javascript
// Auth check
const status = await window.electronAPI.checkApiStatus();
const result = await window.electronAPI.login({ username, password });

// Menu loading  
const systems = await window.electronAPI.getSystems();
const version = await window.electronAPI.getSystemVersion(systemId);
```

## Process & file management
```javascript
// Check/kill running processes
const running = await window.electronAPI.checkProcess('appname');
await window.electronAPI.killProcess(pid);

// Launch with user args
await window.electronAPI.launchExe(exePath, [username]);

// File operations for updates
await window.electronAPI.ensureDirectory(tmpDir);
await window.electronAPI.moveFile(source, destination);
```

## Legacy Windows compatibility
- Use `npm run build-legacy` for Windows 7/Server 2012 R2 (Electron 13.x)
- Feature detection patterns for graceful degradation
- Process management tested on both modern and legacy Windows

## Auto-update mechanism (background)
1. Check local file version vs API version
2. Download newer version to tmp/ folder (non-blocking)
3. Move tmp file to main location on next app launch
4. Uses node-stream-zip for extraction

## What to add when extending
- **New API endpoint**: Add handler in main.js → expose in preload.js → call from renderer
- **New process type**: Extend process management with platform-specific commands
- **Config option**: Add to env var loading in main.js AppConfig object
- **UI enhancement**: Use Bootstrap components, maintain toast/modal patterns

## Version Control & Change Management
**CRITICAL WORKFLOW**: Always create a commit before making any suggested changes for backup and version control.

### Pre-change workflow:
1. **Before making ANY changes**: Create a commit with current state
2. **Use clear commit messages** that explain what will be changed (e.g., "feat: prepare for authentication refactor", "fix: backup before process management updates")
3. **After implementing changes**: Suggest a follow-up commit command with descriptive message

### Commit message patterns:
- `feat: add [feature description]` — new functionality
- `fix: resolve [issue description]` — bug fixes  
- `refactor: improve [component/area]` — code restructuring
- `docs: update [documentation area]` — documentation changes
- `chore: [maintenance task]` — dependency updates, build changes

### Example workflow:
```bash
# Before making changes
git add -A
git commit -m "feat: prepare for new API endpoint integration"

# [Make suggested changes to files]

# After changes are complete
git add -A  
git commit -m "feat: implement new system status API endpoint"
```

**Always suggest the commit command** after completing any code changes, using the appropriate commit message pattern and clear description of what was implemented.

## Assistant commit workflow — simple and explicit
You told us you prefer a minimal, easy workflow and don't want hooks. Good — we'll keep it simple.

When the assistant suggests code changes, follow this exact flow so you can easily roll back any change:

1. Create a backup commit BEFORE making the change. Example:

```powershell
git add -A
git commit -m "chore: backup before <short description of upcoming change>"
```

2. Apply the suggested code changes (the assistant will make edits or give the exact patch).

3. Commit the changes AFTER implementing them with a clear conventional-style message. Example:

```powershell
git add -A
git commit -m "feat: implement <short description of change>"
```

4. Push the branch to the remote so the change is visible on the web:

```powershell
git push origin main
```

Notes:
- The assistant will always include the two suggested commit commands (before and after) and will push the final commit to the remote when you request it.
- Your corporate VCS and any further integration steps are separate — we'll only use Git here to track assistant-suggested changes and to make rollback easy for you.

If you later change your mind and want hook-based enforcement, tell us and we can add it back; for now we keep the repo clean and simple.
