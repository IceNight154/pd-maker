#!/bin/bash
# 12차: 다른 저장소의 기능을 가져와 컴파일되는지 · 빼면 원래대로인지 확인 (Linux · javac — gradle 없이)
#   사용: tools/playtest/feature-check.sh <가져올 저장소> <게임 저장소> <작업 폴더> <기능 id>…
#   ① 게임 저장소를 작업 폴더/src 로 복사 (원본은 읽기만) ② repo-features.pack → 작업 폴더/proj/features/<id>
#   ③ applyPacks → 넣은 파일 · 고친 파일 목록 ④ javac 로 컴파일 (JARS — build.sh 와 같음) ⑤ removePacks → 복사본이 처음과 바이트까지 같은지
#   결과: 작업 폴더/feature-check.txt
HERE="$(cd "$(dirname "$0")" && pwd)"; PDM="$HERE/../.."
SRC="$(cd "$1" && pwd)"; TGT="$(cd "$2" && pwd)"; WORK="$3"; shift 3
[ -z "$SRC" -o -z "$TGT" -o -z "$WORK" -o -z "$1" ] && { echo "사용: feature-check.sh <가져올 저장소> <게임 저장소> <작업 폴더> <기능 id>…"; exit 2; }
JARS="${JARS:-/tmp/jars}"
mkdir -p "$WORK"; WORK="$(cd "$WORK" && pwd)"
rm -rf "${WORK:?}/src" "${WORK:?}/proj" "${WORK:?}/out" "${WORK:?}/orig"; cp -r "$TGT" "$WORK/src"; rm -rf "$WORK/src/.git"
# 저장소에 PDMaker 연결 줄이 이미 있으면 복사본에서 걷어 냄 (pdmaker 패키지 없이 컴파일 — 게임 + 가져온 기능만 봄)
node -e "require('$PDM/editor/runtime-installer.js').uninstall(process.argv[1], () => {})" "$WORK/src"
cp -r "$WORK/src" "$WORK/orig"; mkdir -p "$WORK/proj"
node -e "
const F=require('$PDM/editor/repo-features.js');
const p=F.pack(process.argv[1], process.argv[2], process.argv.slice(5), { id: 'check' });
F.savePack(process.argv[3], p);
const r=F.applyPacks(process.argv[2], F.listPacks(process.argv[3]), l=>console.log(l));
console.log('classes='+p.feature.classes.length+' members='+p.feature.members.length+' assets='+p.feature.assets.length+' messages='+p.feature.messages.length+' lines='+p.feature.lines);
console.log('files='+r.files.length+' patched='+r.patched.length+' problems='+r.problems.length); r.problems.slice(0,20).forEach(x=>console.log('  문제: '+x));
" "$SRC" "$WORK/src" "$WORK/proj" x "$@" > "$WORK/apply.log" 2>&1
cd "$WORK/src"
find $(for d in SPD-classes/src core/src/main/java desktop/src/main/java services/src services/updates/debugUpdates services/news/debugNews; do [ -d "$d" ] && echo "$d"; done) -name "*.java" > "$WORK/srcs.txt"
CP=$(ls "$JARS"/*.jar "$JARS"/lw/*.jar | grep -v '/lombok' | tr '\n' ':'); PROC=""
if grep -rlq "^import lombok\." core/src/main/java 2>/dev/null; then LB=$(ls "$JARS"/lombok*.jar | head -1); CP="$CP:$LB"; PROC="-processorpath $LB"; fi
mkdir -p "$WORK/out"
javac -Xmaxerrs 2000 -nowarn -encoding UTF-8 -d "$WORK/out" -cp "$CP" $PROC @"$WORK/srcs.txt" > "$WORK/javac.log" 2>&1
ERR=$(grep -c "error:" "$WORK/javac.log")
node -e "require('$PDM/editor/repo-features.js').removePacks(process.argv[1], l=>console.log(l))" "$WORK/src" >> "$WORK/apply.log" 2>&1
if diff -rq "$WORK/orig" "$WORK/src" > "$WORK/restore.diff" 2>&1; then RESTORE="같음"; else RESTORE="다름 ($(wc -l < "$WORK/restore.diff")개)"; fi
{ echo "가져올 저장소: $SRC"; echo "게임 저장소: $TGT"; echo "기능: $*"; cat "$WORK/apply.log"; echo "컴파일 오류: $ERR"
  grep "error:" "$WORK/javac.log" | sed 's/:[0-9]*: error: /: /' | sed "s#^core/src/main/java/com/[a-z0-9]*/[a-z0-9]*/##" | sort | uniq -c | sort -rn | head -25
  echo "빼고 난 뒤 원본과 비교: $RESTORE"; } > "$WORK/feature-check.txt"
cat "$WORK/feature-check.txt"
