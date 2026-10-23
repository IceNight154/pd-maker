#!/bin/bash
# 자동 플레이 테스트 실행 (xvfb 화면에서 게임을 켜고 단계대로 조작 · 스크린샷)
#   사용: tools/playtest/run.sh <작업 폴더> <프로젝트 폴더> 단계...
#   예:   run.sh /tmp/play2 sample-project titlescene wait:3 shot:title eval:tap wait:2 shot:menu scene:RankingsScene shot:rank
#   스크린샷: <작업 폴더>/shots/*.png   (단계 목록은 README.md)
#   TESTENV=<JSON> = 편집기 ▶ 테스트 플레이의 실행 환경 (PDM.testEnv.resolve 결과 — node tools/playtest/testenv.js <환경>)
#   SYNC_RESIZE=1 = 창 크기를 바꾸는 그 자리에서 resize → render (Windows LWJGL3 동작 재현 — 실행 중 장면이 바뀌는 경우 검사)
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$1"; PROJ="$(cd "$2" && pwd)"; shift 2; JARS="${JARS:-/tmp/jars}"
CP="$WORK/out:$WORK/hout:$WORK/src/core/src/main/assets:$WORK/src/desktop/src/main/assets:$(ls "$JARS"/*.jar "$JARS"/lw/*.jar | tr '\n' ':')"
mkdir -p "$WORK/hout" "$WORK/home"
# 11차: 검사 도구도 그 게임 저장소 구조에 맞춰 (게임 본체 이름 · 옮겨진 클래스 · //#if 블록) — 원본 tools/playtest 는 그대로
rm -rf "$WORK/hsrc"; node "$HERE/../../editor/runtime-adapt.js" --dir "$WORK/src" "$HERE" "$WORK/hsrc" | sed "s/^/[HARNESS] /"
LC_ALL=C.UTF-8 LANG=C.UTF-8 javac -J-Dsun.jnu.encoding=UTF-8 -Xmaxerrs 500 -nowarn -encoding UTF-8 -d "$WORK/hout" -cp "$CP" "$WORK/hsrc"/*.java 2>&1 | grep -v "^Note\|JAVA_TOOL" | sed "s/^/[HARNESS] /"
rm -rf "$WORK/shots"; mkdir -p "$WORK/shots"
cd "$WORK/home"
LC_ALL=C.UTF-8 LANG=C.UTF-8 timeout ${TIMEOUT:-240} xvfb-run -a -s "-screen 0 ${XVFB_SCREEN:-1280x800x24}" java -Dsun.jnu.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dfile.encoding=UTF-8 -Duser.home="$WORK/home" -Dpdmaker.project="$PROJ" -Dshots="$WORK/shots" ${TESTENV:+"-Dpdmaker.testenv=$TESTENV"} ${SYNC_RESIZE:+-Dpdmaker.testSyncResize=true} \
  -DSpecification-Title=PDMakerPlaytest -DImplementation-Title=com.shatteredpixel.shatteredpixeldungeon -DSpecification-Version=${GAMEVER:-3.2.0-INDEV} -DImplementation-Version=859 \
  -cp "$CP" PlayTest "$@" 2>&1 | grep -v "JAVA_TOOL_OPTIONS"
