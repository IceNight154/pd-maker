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
# 게임 패키지 폴더 (12차: 패키지 이름을 바꾼 파생작 — RKPD2 · Rat King Adventure 의 com/zrp200/rkpd2 — 도)
PK=$(node -e "console.log(require('$PDM/editor/runtime-installer.js').javaDir(process.argv[1]))" "$WORK/src" 2>/dev/null | tail -1)
[ -z "$PK" ] && PK="$WORK/src/core/src/main/java/com/shatteredpixel/shatteredpixeldungeon"
if [ -n "$PRISTINE" ]; then
  # 12차: 비교용 원본 — 저장소에 이미 설치된 연결 줄 · pdmaker 패키지가 있으면 복사본에서 걷어 내 원래 파일로 (원본 저장소는 그대로),
  #       검사 도구가 부르는 pdmaker 패키지만 이 저장소 구조에 맞춰 넣음 (연결 줄 없음 = PDMaker 가 게임에 끼어들지 않음)
  node -e "require('$PDM/editor/runtime-installer.js').uninstall(process.argv[1], l => console.log('[원본] ' + l))" "$WORK/src"
  node "$PDM/editor/runtime-adapt.js" --dir "$WORK/src" "$PDM/runtime/src/com/shatteredpixel/shatteredpixeldungeon/pdmaker" "$PK/pdmaker" | tail -2
else
  node "$PDM/editor/runtime-installer.js" "$WORK/src" --install "$PROJ"
fi
# 테스트 환경에 mp3 디코더가 없으면 mod-2 타이틀 곡을 ogg 로 (NOMP3=1)
[ -n "$NOMP3" ] && sed -i "s#music/title.mp3#music/theme_1.ogg#" "$PK/Assets.java" || true
cd "$WORK/src"
find $(for d in SPD-classes/src core/src/main/java desktop/src/main/java services/src services/updates/debugUpdates services/news/debugNews; do [ -d "$d" ] && echo "$d"; done) -name "*.java" > "$WORK/srcs.txt"
CP=$(ls "$JARS"/*.jar "$JARS"/lw/*.jar | grep -v '/lombok' | tr '\n' ':')
mkdir -p "$WORK/out"
# 11차: 저장소가 Lombok(@Getter · @Setter 로 메서드를 만듦 — ARK_PD)을 쓰면 그 jar 를 주석 처리기로 (JARS 에 lombok.jar 가 있어야 함 — gradle 의 compileOnly · annotationProcessor 와 같은 일)
PROC=""
if grep -rlq "^import lombok\." core/src/main/java 2>/dev/null; then
  LB=$(ls "$JARS"/lombok*.jar 2>/dev/null | head -1)
  [ -z "$LB" ] && { echo "이 저장소는 Lombok 을 씀 — $JARS/lombok.jar 가 필요 (core/build.gradle 의 lombok 판)"; exit 1; }
  CP="$CP:$LB"; PROC="-processorpath $LB"
fi
javac -nowarn -encoding UTF-8 -d "$WORK/out" -cp "$CP" $PROC @"$WORK/srcs.txt" 2>&1 | grep -v "^Note:" | tail -40
echo BUILD_DONE
