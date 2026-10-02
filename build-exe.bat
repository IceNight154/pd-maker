@echo off
rem Builds the PDMaker exe. Keep this file ASCII-only with CRLF line endings.
setlocal
cd /d "%~dp0editor"
if errorlevel 1 goto nofolder
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist "node_modules\electron" call npm install
call npm run dist
echo.
echo Done. The PDMaker exe is in the editor\dist folder.
pause
goto :eof
:nofolder
echo [!] The "editor" folder was not found next to this file.
pause
goto :eof
:nonode
echo [!] Node.js is required. https://nodejs.org
pause
