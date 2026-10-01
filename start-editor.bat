@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0editor"
title PDMaker
rem 1) 함께 들어 있는 Electron 으로 바로 실행 (Node.js 없어도 됨 — make-release.bat 로 만든 zip)
if exist "node_modules\electron\dist\electron.exe" goto direct
rem 2) Node.js 로 실행 (처음이면 Electron 을 내려받음)
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist node_modules\electron goto run
echo 처음 실행: Electron 을 내려받는 중입니다. 1~2분 걸립니다...
call npm install
if errorlevel 1 goto npmfail
:run
call npm start
goto :eof
:direct
start "" "node_modules\electron\dist\electron.exe" "%~dp0editor"
goto :eof
:nonode
echo [!] Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
echo     (make-release.bat 로 만든 zip 에는 Electron 이 들어 있어 Node.js 가 필요 없습니다)
pause
goto :eof
:npmfail
echo [!] npm install 실패. 위 메시지를 확인하세요.
pause
