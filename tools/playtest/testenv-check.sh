#!/bin/bash
# 테스트 플레이 실행 환경 · 배속 · 스킵 · 화면 돌리기 · 대사 연출을 실제 게임에서 검사 (5차 — 화면 시뮬레이션 수준)
#   사용: tools/playtest/testenv-check.sh <게임 저장소> <작업 폴더>
#   작업 폴더에 검사용 프로젝트(testenv-proj)를 만들고 build.sh 로 빌드 → run.sh 를 두 번 실행해 기록을 검사
#   ① 배속: 같은 줄(5자/초)을 1 · 2 · 4 · 16배로 — 실제 시간당 글자 수 비율
#   ② 화면 단추: 2× 단추를 진짜 마우스로 누르면 배속만 바뀌고 대사는 넘어가지 않음
#   ③ 스킵: 선택지에서 멈춤(고르지 않음) · 입력 기다리기에서 멈춤 · 이벤트가 끝나면 스킵 전 배속으로
#   ④ 화면 돌리기(F9 와 같은 rotate): 세로 154×334 ↔ 가로 390×180 · 안전 영역이 처음으로 돌아옴 · 나온 글자를 이어받음 · 배치 문제 0
#   ⑤ 줄마다 글꼴(크기 · 정렬 · 굵게 · 강조 색 · 여백) · 대사 스타일 되돌리기 — 배치 문제 0, 캡처
#   ⑥ 게임 오류 0 (누른 채 끌기 포함 — 원작은 끄는 동안 포인터 신호에 null 을 보냄)
#   기록 · 캡처: <작업 폴더>/testenv-check/
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$1"; WORK="$2"
[ -z "$REPO" -o -z "$WORK" ] && { echo "사용: testenv-check.sh <게임 저장소> <작업 폴더>"; exit 2; }
PROJ="$WORK/testenv-proj"; OUT="$WORK/testenv-check"
node "$HERE/testenv-project.js" "$PROJ" >/dev/null || exit 2
bash "$HERE/build.sh" "$REPO" "$WORK" "$PROJ" 2>&1 | grep -q BUILD_DONE || { echo "빌드 실패"; exit 2; }
rm -rf "$OUT"; mkdir -p "$OUT"
export XVFB_SCREEN="${XVFB_SCREEN:-1800x1800x24}"
export SYNC_RESIZE="${SYNC_RESIZE-1}"   # 기본: Windows LWJGL3 처럼 창 크기를 바꾸는 그 자리에서 resize → render (SYNC_RESIZE= 로 끄기)
export TESTENV="$(node "$HERE/testenv.js" phone-port '{"safeArea":"notch","touch":true}')"
START=(titlescene wait:3 start:WARRIOR wait:4 eval:closewnds wait:1)
bash "$HERE/run.sh" "$WORK" "$PROJ" "${START[@]}" \
  eval:drag,231,400,300,600 wait:1 \
  eval:speed,1 eval:ev,sp wait:1 eval:typing eval:speed,2 eval:next wait:1 eval:typing eval:speed,4 eval:next wait:1 eval:typing eval:speed,16 eval:next wait:1 eval:typing \
  eval:speed,1 eval:closewnds wait:1 eval:ev,sp wait:0.5 eval:typing eval:touch,126,58 wait:0.5 eval:testenv eval:typing eval:closewnds wait:1 \
  eval:speed,2 eval:ev,sk wait:0.3 eval:skip wait:1 eval:typing eval:testenv eval:wshot,skip-choice wait:2 eval:typing eval:pick,1 wait:1 eval:wnds eval:evstate wait:2 eval:evstate eval:wshot,skip-wait \
  eval:touch,231,500 wait:1 eval:evstate eval:testenv > "$OUT/run1.log" 2>&1
bash "$HERE/run.sh" "$WORK" "$PROJ" "${START[@]}" \
  eval:ev,fx eval:typing eval:rotate wait:1 eval:testenv eval:typing eval:layout eval:wshot,rot-land eval:rotate wait:1 eval:testenv eval:typing eval:layout eval:wshot,rot-back \
  eval:skip wait:1.5 eval:evstate eval:ev,ty wait:0.5 eval:layout eval:wshot,ty-style eval:next wait:0.5 eval:layout eval:wshot,ty-base > "$OUT/run2.log" 2>&1
cp "$WORK"/shots/*.png "$OUT/" 2>/dev/null
node - "$OUT/run1.log" "$OUT/run2.log" <<'EOF'
const fs = require('fs'), [l1, l2] = process.argv.slice(2).map(f => fs.readFileSync(f, 'utf8').split('\n').filter(l => l.startsWith('[TEST]')));
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail = 1; };
const typ = l => l.filter(x => x.startsWith('[TEST] typing')), num = (s, k) => { const m = new RegExp(k + '=([\\d.]+)').exec(s); return m ? +m[1] : NaN; };
const env = l => l.filter(x => x.startsWith('[TEST] testenv')), ev = l => l.filter(x => x.startsWith('[TEST] evstate'));
// ① 배속
const t1 = typ(l1), r = t1.slice(0, 4).map(s => num(s, 'perRealSec'));
ok(r.length === 4 && r[1] / r[0] > 1.7 && r[1] / r[0] < 2.3 && r[2] / r[0] > 3.4 && r[2] / r[0] < 4.6 && r[3] / r[0] > 12 && r[3] / r[0] < 20, `① 배속 1 · 2 · 4 · 16× — 실제 1초당 글자 ${r.join(' · ')} (기준 5자/초)`);
// ② 화면 단추 2×
const before = t1[4] || '', after = t1[5] || '', e1 = env(l1);
ok(/speed=2 /.test(e1[0] || '') && /line='1번/.test(after) && !/done=true/.test(after), `② 2× 단추(마우스) → ${(/speed=\S+/.exec(e1[0] || '') || [''])[0]} · 대사 그대로 (${(/shown=\S+/.exec(before) || [''])[0]} → ${(/shown=\S+/.exec(after) || [''])[0]})`);
// ③ 스킵
const ch = t1[6] || '', ch2 = t1[7] || '', es = ev(l1);
ok(/choices=2 open=true done=false/.test(ch) && /choices=2 open=true done=false/.test(ch2) && /speed=16\(skip\)/.test(e1[1] || ''), '③-1 스킵: 선택지에서 멈춤 · 2초 뒤에도 고르지 않음 · 16배');
ok(l1.some(x => /wnd .*WaitWnd/.test(x)) && /busy=true/.test(es[0] || '') && /busy=true/.test(es[1] || ''), '③-2 스킵: 입력 기다리기에서 멈춤 (2초 넘게)');
ok(/busy=false/.test(es[2] || '') && /speed=2 /.test(e1[2] || '') && !/skip/.test(e1[2] || ''), `③-3 화면을 누르면 이어서 끝까지 · 스킵 끝 → 배속 ${(/speed=\S+/.exec(e1[2] || '') || [''])[0]} (스킵 전 2)`);
// ④ 화면 돌리기
const e2 = env(l2), t2 = typ(l2), lay = l2.filter(x => x.startsWith('[TEST] layout'));
ok(/ui=390\.0x180\.0|ui=390x180/.test(e2[0] || '') && /landscape=true/.test(e2[0] || '') && /insets=43,0,43,22/.test(e2[0] || ''), '④-1 돌리기 → 가로 390×180 · 안전 영역 43,0,43,22 — ' + (e2[0] || '').replace('[TEST] testenv ', ''));
ok(/ui=154\.0x334\.0|ui=154x334/.test(e2[1] || '') && /insets=0,42,0,21/.test(e2[1] || ''), '④-2 다시 돌리기 → 세로 154×334 · 안전 영역이 처음 값');
const sh = t2.slice(0, 3).map(s => num(s, 'shown'));
ok(sh.length === 3 && sh[1] >= sh[0] && sh[2] >= sh[1] && t2.slice(0, 3).every(s => /line='글자/.test(s)), `④-3 돌려도 같은 줄 · 나온 글자를 이어받음 (${sh.join(' → ')})`);
// ⑤ 글꼴
ok(lay.length >= 4 && lay.every(s => /problems=0/.test(s)), `④ · ⑤ 배치 문제 0 (${lay.length}번 검사)`);
ok(/busy=false/.test(ev(l2)[0] || ''), '⑤-0 스킵으로 연출 이벤트를 끝냄 (대사 스타일은 그 이벤트 안에서만)');
const big = /text=\[\d+,\d+ (\d+)x(\d+)\]/.exec(lay[2] || ''), base = /text=\[\d+,\d+ (\d+)x(\d+)\]/.exec(lay[3] || '');
const bx = /text=\[(\d+),/.exec(lay[2] || '');
ok(big && base && +big[2] > +base[2] && bx && +bx[1] >= 20, `⑤ 줄마다 글자 크기 150% · 여백 16 (글 높이 ${big && big[2]} > 기본 ${base && base[2]} · 글 x ${bx && bx[1]}) · 다음 줄은 기본으로`);
const all = process.argv.slice(2).map(f => fs.readFileSync(f, 'utf8')).join('\n'), ex = all.split('\n').filter(l => /Exception|Error:/.test(l) && !/ALSA/.test(l));
ok(ex.length === 0 && l1.some(x => x.startsWith('[TEST] drag')), `⑥ 게임 오류 0 — 누른 채 끌기(원작이 포인터 신호에 null 을 보냄) 포함${ex.length ? ': ' + ex[0] : ''}`);
console.log(fail ? '\n실패가 있습니다 — 기록: ' + process.argv[2].replace(/run1\.log$/, '') : '\n모두 통과 (화면 시뮬레이션 — 실제 기기 검증 아님)');
process.exit(fail);
EOF
