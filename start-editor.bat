@echo off
rem PDMaker launcher. Keep this file ASCII-only with CRLF line endings:
rem non-ASCII text makes cmd.exe misread the lines on some PCs.
setlocal
cd /d "%~dp0editor"
if errorlevel 1 goto nofolder
title PDMaker
rem 1) Bundled Electron: run it directly (Node.js not needed)
if exist "node_modules\electron\dist\electron.exe" goto direct
rem 2) Otherwise use Node.js (first run downloads Electron)
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist "node_modules\electron" goto run
echo First run: downloading Electron. This can take 1-2 minutes...
call npm install
if errorlevel 1 goto npmfail
:run
call npm start
goto :eof
:direct
start "" "node_modules\electron\dist\electron.exe" "%~dp0editor"
goto :eof
:nofolder
echo [!] The "editor" folder was not found next to this file.
echo     Unzip the whole pd-maker folder first, then run start-editor.bat inside it.
pause
goto :eof
:nonode
echo [!] Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
echo     (A zip made with make-release.bat includes Electron, so Node.js is not needed.)
pause
goto :eof
:npmfail
echo [!] npm install failed. Check the messages above (internet connection is required).
pause
