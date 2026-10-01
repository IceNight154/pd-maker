@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0editor"
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist node_modules\electron call npm install
call npm run dist
echo.
echo 완료되면 editor\dist 폴더에 PDMaker exe 가 생깁니다.
pause
goto :eof
:nonode
echo [!] Node.js 가 필요합니다. https://nodejs.org
pause
