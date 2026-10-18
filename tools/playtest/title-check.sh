#!/bin/bash
# 7차: 타이틀 화면을 실제 게임에서 검사하고 편집기 미리보기와 비교 (화면 시뮬레이션 — PC 데스크톱 판)
#   사용: tools/playtest/title-check.sh <게임 저장소> <작업 폴더> [환경...]   (기본: pc phone-land phone-port)
#   프로젝트 = tools/playtest/title-project.js full (글 · 정보 요소, 상태 모양 · 효과, 이어하기(저장 없음), 만든 사람 창 · 소리 설정 창) + base (예전 모양)
#   환경마다: 배치 JSON(eval:titlegeo) · 포인터 오버 · 키보드(화살표 · Enter · Tab · Esc) · 창 열기/닫기 · 바깥 누르기 · 연속 클릭 · 비활성 이어하기 ·
#            창이 열리는 도중 화면 돌리기(휴대폰) · 캡처 → tools/playtest/title-compare.js 가 편집기 미리보기(같은 데이터 · 같은 화면 크기)와 비교
#   기록: <작업 폴더>/title-check/<환경>.log · 캡처 <환경>-*.png · 편집기 캡처 editor-<환경>-*.png · 비교 결과 compare.txt
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$1"; WORK="$2"; shift 2
[ -z "$REPO" -o -z "$WORK" ] && { echo "사용: title-check.sh <게임 저장소> <작업 폴더> [환경...]"; exit 2; }
ENVS=("$@"); [ ${#ENVS[@]} -eq 0 ] && ENVS=(pc phone-land phone-port)
OUT="$WORK/title-check"; rm -rf "$OUT"; mkdir -p "$OUT"
export XVFB_SCREEN="${XVFB_SCREEN:-1800x1800x24}" SYNC_RESIZE="${SYNC_RESIZE-1}"
PROJ="$WORK/title-proj-full"; BASE="$WORK/title-proj-base"
node "$HERE/title-project.js" "$PROJ" full >/dev/null || exit 2
node "$HERE/title-project.js" "$BASE" base >/dev/null || exit 2
bash "$HERE/build.sh" "$REPO" "$WORK" "$PROJ" 2>&1 | grep -q BUILD_DONE || { echo "빌드 실패"; exit 2; }
for E in "${ENVS[@]}"; do
  ROT=""; case "$E" in phone*) ROT="eval:mark,rot eval:titlewin,credits wait:0.05 eval:rotate wait:2 eval:titlegeo eval:wshot,$E-rot eval:rotate wait:2 eval:titlegeo";; esac
  TESTENV="$(node "$HERE/testenv.js" "$E" '{"safeArea":"notch"}')" bash "$HERE/run.sh" "$WORK" "$PROJ" titlescene wait:3 \
    eval:mark,menu eval:titlehover,-50,-50 wait:0.5 eval:titlegeo eval:wshot,$E-menu \
    eval:mark,hover eval:titlehover,@play wait:0.4 eval:titlegeo eval:titlehover,-50,-50 wait:0.3 \
    eval:mark,keys eval:key,DOWN wait:0.2 eval:titlegeo eval:key,DOWN wait:0.2 eval:titlegeo eval:wshot,$E-focus eval:key,ENTER wait:0.8 eval:titlegeo eval:wshot,$E-credits \
    eval:mark,winkeys eval:key,TAB wait:0.2 eval:titlegeo eval:key,ESCAPE wait:0.8 eval:titlegeo \
    eval:mark,options eval:titlewin,options wait:0.8 eval:titlegeo eval:wshot,$E-options eval:touch,4,4 wait:0.5 eval:titlegeo eval:key,ESCAPE wait:0.8 eval:titlegeo \
    eval:mark,outside eval:titlewin,credits wait:0.8 eval:touch,4,4 wait:0.8 eval:titlegeo \
    eval:mark,cont eval:titleclick,cont wait:0.5 eval:titlegeo \
    $ROT \
    eval:mark,rapid eval:titleclick,play eval:titleclick,play eval:titleclick,credits wait:0.2 eval:titlegeo wait:2 eval:mark,end > "$OUT/$E.log" 2>&1
  for f in "$WORK"/shots/*.png; do [ -e "$f" ] && cp "$f" "$OUT/"; done
done
# 예전 모양 (base) — PC 만: 원래 배치 그대로인지
bash "$HERE/build.sh" "$REPO" "$WORK" "$BASE" 2>&1 | grep -q BUILD_DONE || { echo "빌드 실패 (base)"; exit 2; }
TESTENV="$(node "$HERE/testenv.js" pc)" bash "$HERE/run.sh" "$WORK" "$BASE" titlescene wait:3 eval:titlehover,-50,-50 wait:0.3 eval:mark,menu eval:titlegeo eval:title eval:wshot,base-pc eval:mark,end > "$OUT/base-pc.log" 2>&1
for f in "$WORK"/shots/*.png; do [ -e "$f" ] && cp "$f" "$OUT/"; done
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node "$HERE/title-compare.js" "$OUT" "$PROJ" "$BASE" "${ENVS[@]}" | tee "$OUT/compare.txt"
exit ${PIPESTATUS[0]}
