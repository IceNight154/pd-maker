#!/bin/bash
# 자동 플레이 테스트 실행 (xvfb 화면에서 게임을 켜고 단계대로 조작 · 스크린샷)
#   사용: tools/playtest/run.sh <작업 폴더> <프로젝트 폴더> 단계...
#   예:   run.sh /tmp/play2 sample-project titlescene wait:3 shot:title eval:tap wait:2 shot:menu scene:RankingsScene shot:rank
#   스크린샷: <작업 폴더>/shots/*.png   (단계 목록은 README.md)
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$1"; PROJ="$(cd "$2" && pwd)"; shift 2; JARS="${JARS:-/tmp/jars}"
CP="$WORK/out:$WORK/hout:$WORK/src/core/src/main/assets:$WORK/src/desktop/src/main/assets:$(ls "$JARS"/*.jar "$JARS"/lw/*.jar | tr '\n' ':')"
mkdir -p "$WORK/hout" "$WORK/home"
javac -nowarn -encoding UTF-8 -d "$WORK/hout" -cp "$CP" "$HERE"/*.java 2>&1 | grep -v "^Note\|JAVA_TOOL" | sed "s/^/[HARNESS] /"
rm -rf "$WORK/shots"; mkdir -p "$WORK/shots"
cd "$WORK/home"
LC_ALL=C.UTF-8 LANG=C.UTF-8 timeout ${TIMEOUT:-240} xvfb-run -a -s "-screen 0 1280x800x24" java -Dsun.jnu.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dfile.encoding=UTF-8 -Duser.home="$WORK/home" -Dpdmaker.project="$PROJ" -Dshots="$WORK/shots" \
  -DSpecification-Title=PDMakerPlaytest -DImplementation-Title=com.shatteredpixel.shatteredpixeldungeon -DSpecification-Version=3.2.0-INDEV -DImplementation-Version=859 \
  -cp "$CP" PlayTest "$@" 2>&1 | grep -v "JAVA_TOOL_OPTIONS"
