@echo off
chcp 65001 >nul
setlocal
rem ================================================================
rem  PDMaker 를 다른 PC 로 옮길 zip 만들기
rem   들어가는 것: 에디터 · 게임 런타임 · 문서 · 도구
rem              + game\shattered-pixel-dungeon-master (게임 저장소 — 테스트 플레이·게임 내보내기에 필요)
rem              + Electron 실행 파일 (받는 사람은 Node.js 없이 start-editor.bat 만 누르면 됨)
rem   빼는 것  : .git · .gradle · .idea · build · dist · 백업 파일 · local.properties
rem   Java(JDK 17+)는 없으면 테스트 플레이 때 에디터가 자동으로 내려받습니다 (처음 한 번, 인터넷 필요)
rem ================================================================
cd /d "%~dp0"
if not exist "game\shattered-pixel-dungeon-master\gradlew.bat" (
  echo [!] game\shattered-pixel-dungeon-master 가 없습니다.
  echo     에디터를 켜서 프로젝트를 열면 "게임 저장소를 PDMaker 폴더 안으로 옮길까요?" 가 나옵니다. 먼저 옮겨 주세요.
  echo     ^(프로젝트 설정 → 게임 저장소 연결 → "게임 저장소를 PDMaker 폴더 안으로 옮기기" 버튼도 있음^)
  pause
  goto :eof
)
if not exist "editor\node_modules\electron\dist\electron.exe" (
  echo Electron 이 없어 먼저 내려받습니다...
  pushd editor
  call npm install
  popd
)
cd ..
set OUT=%CD%\pd-maker-release.zip
if exist "%OUT%" del "%OUT%"
set E=pd-maker/editor
set PARTS=pd-maker/README.md pd-maker/DESIGN.md pd-maker/start-editor.bat pd-maker/build-exe.bat pd-maker/make-release.bat pd-maker/docs pd-maker/references pd-maker/runtime pd-maker/tools pd-maker/game/shattered-pixel-dungeon-master
set PARTS=%PARTS% %E%/main.js %E%/preload.js %E%/runtime-installer.js %E%/zip.js %E%/package.json %E%/package-lock.json %E%/renderer %E%/builtin-plugins
if exist "pd-maker\editor\node_modules\electron\dist\electron.exe" set PARTS=%PARTS% %E%/node_modules/electron
echo zip 만드는 중... (몇 분 걸릴 수 있음)
tar -a -c -f "%OUT%" --exclude=.git --exclude=.gradle --exclude=.idea --exclude=build --exclude=dist/win-unpacked --exclude=*.pdmaker-backup --exclude=local.properties --exclude=out %PARTS%
if errorlevel 1 (echo [!] 실패) else (echo 완료: %OUT%)
echo 받는 사람: zip 을 풀고 pd-maker\start-editor.bat 을 실행하세요.
pause
