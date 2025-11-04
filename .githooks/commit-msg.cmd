@echo off
REM Wrapper to run PowerShell commit-msg hook on Windows
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%commit-msg.ps1" %1
exit /b %ERRORLEVEL%
