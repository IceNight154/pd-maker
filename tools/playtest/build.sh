#!/bin/bash
# 자동 플레이 테스트용 빌드 (Linux · Java 17 · gradle 없이 javac)
#   사용: tools/playtest/build.sh <게임 저장소> <작업 폴더> [프로젝트 폴더]
#   JARS=<libGDX·lwjgl 등 의존 jar 폴더> (기본 /tmp/jars — 하위 폴더 lw 포함)
#   게임 저장소를 작업 폴더/src 로 복사 → pdmaker 런타임 설치 → 작업 폴더/out 에 컴파일
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; PDM="$HERE/../.."
REPO="$1"; WORK="$2"; PROJ="${3:-$PDM/sample-project}"; JARS="${JARS:-/tmp/jars}"
[ -z "$REPO" -o -z "$WORK" ] && { echo "사용: build.sh <게임 저장소> <작업 폴더> [프로젝트]"; exit 1; }
rm -rf "$WORK/src" "$WORK/out"; mkdir -p "$WORK"
cp -r "$REPO" "$WORK/src"; rm -rf "$WORK/src/.git"
node "$PDM/editor/runtime-installer.js" "$WORK/src" --install "$PROJ"
# 테스트 환경에 mp3 디코더가 없으면 mod-2 타이틀 곡을 ogg 로 (NOMP3=1)
[ -n "$NOMP3" ] && sed -i "s#music/title.mp3#music/theme_1.ogg#" "$WORK/src/core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/Assets.java" || true
cd "$WORK/src"
find SPD-classes/src core/src/main/java desktop/src/main/java services/src services/updates/debugUpdates services/news/debugNews -name "*.java" > "$WORK/srcs.txt"
CP=$(ls "$JARS"/*.jar "$JARS"/lw/*.jar | tr '\n' ':')
mkdir -p "$WORK/out"
javac -nowarn -encoding UTF-8 -d "$WORK/out" -cp "$CP" @"$WORK/srcs.txt" 2>&1 | grep -v "^Note:" | tail -40
echo BUILD_DONE
