#!/bin/bash
# 화면 환경별 연출 검사 (PC · 휴대폰 가로/세로 비율 · 안전 영역 · 화면 돌림) — 데스크톱 판 게임을 창 크기만 바꿔 실행
#   사용: tools/playtest/platform-matrix.sh <작업 폴더(build.sh 로 만든)> <프로젝트> [환경...]
#   통과 조건 (환경마다): 배치 문제(LAYOUT-PROBLEM) 0 · 마지막에 이벤트가 끝남(busy=false · 창 없음) · 돌림 환경은 "연출을 새 화면으로 옮겼습니다"
#   기록: <작업 폴더>/matrix/<환경>.log · 캡처 <작업 폴더>/matrix/<환경>-*.png
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$1"; PROJ="$2"; shift 2
ENVS=("$@"); [ ${#ENVS[@]} -eq 0 ] && ENVS=(pc pc-narrow phone-land phone-port phone-land-insets phone-port-insets phone-land-rot pc-rot pc-rotfade)
export XVFB_SCREEN="${XVFB_SCREEN:-1800x1800x24}" TIMEOUT="${TIMEOUT:-220}"
mkdir -p "$WORK/matrix"; fail=0
for e in "${ENVS[@]}"; do
  mapfile -t STEPS < <(node "$HERE/scenarios.js" "$e")
  bash "$HERE/run.sh" "$WORK" "$PROJ" "${STEPS[@]}" > "$WORK/matrix/$e.log" 2>&1
  for f in "$WORK"/shots/*.png; do [ -e "$f" ] && cp "$f" "$WORK/matrix/"; done
  probs=$(grep -c "LAYOUT-PROBLEM" "$WORK/matrix/$e.log")
  last=$(grep "\[TEST\] cut " "$WORK/matrix/$e.log" | tail -1)
  ok=1; [ "$probs" != 0 ] && ok=0
  echo "$last" | grep -q "busy=false .*windows=\[\]" || ok=0
  case "$e" in *rot*) grep -q "연출을 새 화면으로 옮겼습니다" "$WORK/matrix/$e.log" || ok=0 ;; esac
  [ $ok = 1 ] && echo "✓ $e (배치 문제 0 · 이벤트 끝남)" || { echo "✗ $e (배치 문제 $probs · 마지막: $last)"; fail=1; }
done
exit $fail
