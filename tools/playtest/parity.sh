#!/bin/bash
# 12차: 저장소 하나를 "PDMaker 로 연 게임" 과 "원본 게임" 으로 똑같이 실행해 비교 (Linux · 헤드리스)
#   사용: tools/playtest/parity.sh <게임 저장소> <작업 폴더> [직업=저장소의 첫 직업]
#   ① repo-project.js 로 저장소 기준 프로젝트 (편집기의 새 프로젝트와 같은 과정)
#   ② build.sh 로 PDMaker 판(런타임 설치) · PRISTINE=1 로 원본 판(게임 파일 그대로) 을 각각 컴파일
#   ③ 같은 단계(타이틀 → 영웅 선택 → 시작 버튼(처음 판처럼) → 첫 층)를 내보낸 게임과 같은 버전(-PLAYTEST)으로 실행
#   ④ 비교: 선택 아이콘 · 시작 층(깊이 · 갈래 · 층 클래스 · 계단) · 영웅 그림 · 화면 글자 · 그림 목록(imgstat) → <작업 폴더>/parity.txt
#   원본 저장소는 읽기만 (복사본에서 빌드)
HERE="$(cd "$(dirname "$0")" && pwd)"; PDM="$HERE/../.."
REPO="$(cd "$1" && pwd)"; WORK="$2"; CLS="$3"
[ -z "$REPO" -o -z "$WORK" ] && { echo "사용: parity.sh <게임 저장소> <작업 폴더> [직업]"; exit 2; }
mkdir -p "$WORK"; WORK="$(cd "$WORK" && pwd)"
PROJ="$WORK/repo-proj"
node "$HERE/repo-project.js" "$REPO" "$PROJ" > "$WORK/project.log" 2>&1 || { echo "프로젝트를 만들지 못함 (project.log)"; exit 1; }
[ -z "$CLS" ] && CLS=$(node -e "const A=require('$PDM/editor/repo-analyzer.js');const r=A.analyze('$REPO');const h=(r.objects.heroes||[]).find(x=>!x.hidden)||{};console.log(h.cls||'WARRIOR')" 2>/dev/null | tail -1)
for side in pdm orig; do
  if [ $side = orig ]; then PRISTINE=1 bash "$HERE/build.sh" "$REPO" "$WORK/$side" "$PROJ" > "$WORK/$side-build.log" 2>&1; else bash "$HERE/build.sh" "$REPO" "$WORK/$side" "$PROJ" > "$WORK/$side-build.log" 2>&1; fi
  if ! grep -q BUILD_DONE "$WORK/$side-build.log" || grep -q "error:" "$WORK/$side-build.log"; then echo "$side 빌드 실패 ($side-build.log): $(grep -m2 'error:' "$WORK/$side-build.log")"; fi
  rm -rf "${WORK:?}/${side:?}/home"
  VER=$(node -e "const A=require('$PDM/editor/repo-analyzer.js');console.log((A.analyze('$REPO').build||{}).appVersionName||'0.0')" 2>/dev/null | tail -1)
  GAMEVER="$VER-PLAYTEST" TIMEOUT=${TIMEOUT:-240} bash "$HERE/run.sh" "$WORK/$side" "$PROJ" titlescene wait:2 eval:imgstat scene:HeroSelectScene wait:2 eval:selicons "startbtn:$CLS,intro" wait:2 eval:screentext eval:closewnd wait:6 eval:where eval:herosprite eval:screentext shot:first > "$WORK/$side-run.log" 2>&1
done
# 비교할 줄 (화면 글자의 PDMaker 테스트 알림 · 무작위 층 모양에 따른 칸 번호는 뺌)
#   · imgstat: 타이틀 화면의 무작위 장식(떠다니는 그림의 크기 · 위치)은 판마다 다름 → 그림 종류 · 크기 · 텍스처만 모아 정렬
#   · where: 계단 목록 순서는 층을 만드는 순서라 정렬 · herosprite: 가만히 있는 동작의 몇째 칸인지는 시간에 따라 달라 줄(y)만
norm() { grep "^\[TEST\] \(selicon\|where\|herosprite\|screentext\|imgstat\|startbtn\|intro\)" "$1" | sed -e 's/ | \[PDMaker\][^|]*//g' -e 's/pos=[0-9]*//' -e 's/@[0-9]*->/->/g' -e 's/ node=[^ ]*//' -e 's/native=[a-z]*//' -e 's/\(herosprite.* frame=\)[0-9]*,/\1*,/' | while IFS= read -r l; do
  case "$l" in
    "[TEST] imgstat"*) echo "[TEST] imgstat $(echo "$l" | sed 's/^\[TEST\] imgstat | //' | tr '|' '\n' | sed -E 's/^ *//; s/ s[0-9.]+ / /; s/ uv[0-9.,]+//; s/ *$//' | grep -v '^$' | sort -u | tr '\n' ';')" ;;
    "[TEST] where"*) echo "$(echo "$l" | sed 's/transitions:.*//')transitions: $(echo "$l" | sed 's/.*transitions: *//' | tr ' ' '\n' | grep -v '^$' | sort | tr '\n' ' ')" ;;
    *) echo "$l" ;;
  esac; done; }
norm "$WORK/pdm-run.log" > "$WORK/pdm.txt"; norm "$WORK/orig-run.log" > "$WORK/orig.txt"
{ echo "저장소: $REPO · 직업 $CLS"; echo "PDMaker 줄 $(wc -l < "$WORK/pdm.txt") · 원본 줄 $(wc -l < "$WORK/orig.txt")"; if [ ! -s "$WORK/pdm.txt" -o ! -s "$WORK/orig.txt" ]; then echo "결과: 실행 실패 (검사 줄이 없음 — pdm-run.log · orig-run.log 를 보세요)"; grep -h "HARNESS.*error\|Exception\|ClassNotFound" "$WORK/pdm-run.log" "$WORK/orig-run.log" | head -4; elif diff -q "$WORK/pdm.txt" "$WORK/orig.txt" >/dev/null; then echo "결과: 같음"; else echo "결과: 다름"; diff "$WORK/orig.txt" "$WORK/pdm.txt" | head -40; fi; } > "$WORK/parity.txt"
cat "$WORK/parity.txt"
