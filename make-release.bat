@echo off
rem ================================================================
rem  Makes a zip of PDMaker to move to another PC.
rem  Keep this file ASCII-only with CRLF line endings.
rem   Included: editor, game runtime, docs, tools
rem             + game\shattered-pixel-dungeon-master (needed for test play / game export)
rem             + Electron (the receiver only needs to run start-editor.bat, no Node.js)
rem   Excluded: .git .gradle .idea build dist backups local.properties
rem   Java (JDK 17+) is downloaded by the editor on first test play if missing.
rem ================================================================
setlocal
cd /d "%~dp0"
if not exist "game\shattered-pixel-dungeon-master\gradlew.bat" goto norepo
if exist "editor\node_modules\electron\dist\electron.exe" goto pack
echo Electron is missing. Downloading it first...
pushd editor
call npm install
popd
:pack
cd ..
set "OUT=%CD%\pd-maker-release.zip"
if exist "%OUT%" del "%OUT%"
set E=pd-maker/editor
set PARTS=pd-maker/README.md pd-maker/DESIGN.md pd-maker/start-editor.bat pd-maker/build-exe.bat pd-maker/make-release.bat pd-maker/docs pd-maker/references pd-maker/runtime pd-maker/tools pd-maker/game/shattered-pixel-dungeon-master
set PARTS=%PARTS% %E%/main.js %E%/preload.js %E%/playtest-init.js %E%/runtime-installer.js %E%/zip.js %E%/package.json %E%/package-lock.json %E%/renderer %E%/builtin-plugins
if exist "pd-maker\editor\node_modules\electron\dist\electron.exe" set PARTS=%PARTS% %E%/node_modules/electron
echo Making the zip... (this can take a few minutes)
tar -a -c -f "%OUT%" --exclude=.git --exclude=.gradle --exclude=.idea --exclude=build --exclude=dist/win-unpacked --exclude=*.pdmaker-backup --exclude=local.properties --exclude=out %PARTS%
if errorlevel 1 goto fail
echo Done: %OUT%
echo For the receiver: unzip it and run pd-maker\start-editor.bat
pause
goto :eof
:fail
echo [!] Failed to make the zip.
pause
goto :eof
:norepo
echo [!] game\shattered-pixel-dungeon-master was not found.
echo     Open a project in the editor and move the game repository into the PDMaker folder first
echo     (Project settings - game repository - "move into the PDMaker folder").
pause
