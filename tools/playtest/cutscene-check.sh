#!/bin/bash
# 6차: 연출 배속 표시 · 1× 복원 · 스크린/카메라 연출을 실제 게임에서 검사 (화면 시뮬레이션 — PC 데스크톱 판)
#   사용: tools/playtest/cutscene-check.sh <게임 저장소> <작업 폴더> [환경...]   (기본: pc pc-small phone-land phone-port + 작은 맵 pc)
#   환경마다: 일반 플레이 = 표시 없음 · 1× / 스크린 이동 = 맵 경계 안 · 영웅이 움직여도 그대로 / 취소 = 영웅에게 돌아감 · 1× /
#             쉐이크 두 번 = 오프셋 0 · 위치가 밀리지 않음 / 4× 에서 카메라 이동이 4배 빨리 끝남 · 끝나면 1× / 중첩 이벤트 = 바깥이 끝날 때까지 연출 중 /
#             오류 명령이 있는 이벤트 = 끝나면 1× / 대사 중 배속 표시줄 = 안전 영역 안 · 대사창과 겹치지 않음 / 화면 돌리기 · 저장 → 불러오기 후 정상
#   기록: <작업 폴더>/cutscene-check/<환경>.log · 캡처 <환경>-*.png. SYNC_RESIZE=1 (Windows LWJGL3 처럼 창 크기 변경 즉시 다시 그림) 이 기본
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$1"; WORK="$2"; shift 2
[ -z "$REPO" -o -z "$WORK" ] && { echo "사용: cutscene-check.sh <게임 저장소> <작업 폴더> [환경...]"; exit 2; }
ENVS=("$@"); [ ${#ENVS[@]} -eq 0 ] && ENVS=(pc pc-small phone-land phone-port small:pc)
OUT="$WORK/cutscene-check"; rm -rf "$OUT"; mkdir -p "$OUT"
export XVFB_SCREEN="${XVFB_SCREEN:-1800x1800x24}" SYNC_RESIZE="${SYNC_RESIZE-1}"
fail=0; built=""
for E in "${ENVS[@]}"; do
  size=big; env="$E"; case "$E" in small:*) size=small; env="${E#small:}";; esac
  PROJ="$WORK/testenv-proj-$size"
  if [ "$built" != "$size" ]; then
    node "$HERE/testenv-project.js" "$PROJ" "$size" >/dev/null || exit 2
    bash "$HERE/build.sh" "$REPO" "$WORK" "$PROJ" 2>&1 | grep -q BUILD_DONE || { echo "빌드 실패"; exit 2; }
    built="$size"
  fi
  if [ "$size" = big ]; then W=40; else W=10; fi
  TP=$((5 * W + 6))   # 영웅을 옮길 바닥 칸 (5, 6)
  ROT=""; case "$env" in phone*) ROT="eval:mark,rot eval:ev,cm wait:2.5 eval:cam eval:rotate wait:2 eval:cam eval:cutscene eval:wshot,$E-rot eval:rotate wait:2 eval:evcancel wait:1.5 eval:cam";; esac
  TESTENV="$(node "$HERE/testenv.js" "$env" '{"safeArea":"notch"}')" bash "$HERE/run.sh" "$WORK" "$PROJ" titlescene wait:3 start:WARRIOR wait:4 eval:closewnds wait:1 \
    eval:mark,idle eval:cutscene eval:cam eval:speed,4 eval:cutscene \
    eval:mark,hold eval:ev,cm wait:2.5 eval:cam eval:cutscene eval:wshot,$E-hold eval:tp,$TP wait:1 eval:cam \
    eval:mark,cancel1 eval:evcancel wait:2 eval:cam eval:cutscene \
    eval:mark,shake eval:cam eval:ev,cmshake eval:cam wait:4 eval:cam eval:cutscene \
    eval:mark,speed1 eval:ev,cmlong wait:0.5 eval:cam wait:5 \
    eval:mark,speed4 eval:ev,cmlong eval:speed,4 eval:cam eval:cutscene wait:2 eval:cutscene \
    eval:mark,cancel2 eval:ev,cmcancel wait:0.5 eval:cam eval:speed,16 eval:evcancel wait:2 eval:cam eval:cutscene \
    eval:mark,nest eval:ev,nest wait:0.3 eval:cutscene eval:adv wait:0.3 eval:cutscene eval:adv wait:0.5 eval:cutscene wait:1.5 eval:cutscene eval:adv wait:1 eval:cutscene \
    eval:mark,err eval:ev,err wait:2.5 eval:cutscene \
    eval:mark,follow eval:ev,cmfollow wait:1 eval:cam wait:3 eval:cam wait:2 eval:cutscene \
    eval:mark,dlg eval:ev,dl wait:0.3 eval:speed,2 eval:cutscene eval:layout eval:wshot,$E-dlg eval:evcancel eval:closewnds wait:1.5 eval:cutscene \
    $ROT \
    eval:mark,reload eval:ev,cm wait:2.5 reload wait:3 eval:cam eval:cutscene eval:mark,end > "$OUT/$E.log" 2>&1
  for f in "$WORK"/shots/*.png; do [ -e "$f" ] && cp "$f" "$OUT/"; done
  node - "$OUT/$E.log" "$E" "$size" <<'JS' || fail=1
const fs = require('fs'), [file, E, size] = process.argv.slice(2), lines = fs.readFileSync(file, 'utf8').split('\n');
const sec = {}; let cur = 'start';
for (const l of lines) { const m = /^\[TEST\] mark (\w+)/.exec(l); if (m) { cur = m[1]; continue; } if (l.startsWith('[TEST] ')) (sec[cur] = sec[cur] || []).push(l); }
const pick = (s, k) => (sec[s] || []).filter(l => l.startsWith('[TEST] ' + k + ' '));
const kv = (l, k) => { const m = new RegExp(k + '=(\\S+)').exec(l || ''); return m ? m[1] : null; };
const xy = s => (s || '').split(',').map(Number);
const near = (a, b, e = 1) => Math.abs(a - b) <= e;
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + `[${E}] ` + m); if (!c) fail = 1; };
const ex = lines.filter(l => /Exception|Error:/.test(l) && !/ALSA/.test(l) && !/명령 실행 오류 \(wait @ err\)/.test(l));   // err 이벤트의 일부러 틀린 명령은 제외
// 일반 플레이
const id = pick('idle', 'cutscene');
ok(id.length === 2 && id.every(l => /active=false/.test(l) && /bar=hidden/.test(l) && /timeScale=1\.0/.test(l)), '일반 플레이: 표시줄 숨김 · 1× (배속을 바꾸려 해도 그대로)');
// 스크린 이동 · 멈춤 · 영웅이 움직여도 그대로
const hc = pick('hold', 'cam'), view = xy((kv(hc[0], 'view') || '0x0').replace('x', ',')), map = xy((kv(hc[0], 'map') || '0x0').replace('x', ','));
const exp = [0, 1].map(i => map[i] <= view[i] ? map[i] / 2 : view[i] / 2), c0 = xy(kv(hc[0], 'center')), c1 = xy(kv(hc[1], 'center'));
ok(kv(hc[0], 'mode') === 'HOLD' && near(c0[0], exp[0]) && near(c0[1], exp[1]), `스크린 이동 (0,0) → 맵 경계 안 가운데 ${c0} (기대 ${exp.join(',')} · 화면 ${view.join('x')} · 맵 ${map.join('x')})`);
ok(kv(hc[1], 'mode') === 'HOLD' && near(c1[0], c0[0]) && near(c1[1], c0[1]) && kv(hc[0], 'heroCell') !== kv(hc[1], 'heroCell'), `영웅이 옮겨져도(${kv(hc[0], 'heroCell')} → ${kv(hc[1], 'heroCell')}) 카메라는 그대로 ${c1}`);
ok(/active=true/.test(pick('hold', 'cutscene')[0]) && /bar=shown/.test(pick('hold', 'cutscene')[0]) && /in=true/.test(pick('hold', 'cutscene')[0]), '대사 없는 카메라 연출 중에도 표시줄 (안전 영역 안)');
const k1 = pick('cancel1', 'cam')[0];
ok(kv(k1, 'mode') === 'GAME' && kv(k1, 'center') === kv(k1, 'hero') && /active=false.*timeScale=1\.0/.test(pick('cancel1', 'cutscene')[0]), `이벤트 취소 → 영웅에게 돌아감 · 원작 따라가기 · 1× (${kv(k1, 'center')})`);
// 쉐이크
const sc = pick('shake', 'cam');
ok(sc.length === 3 && /shake=6\.0/.test(sc[1]) && kv(sc[1], 'off') !== '0.00,0.00' && kv(sc[2], 'off') === '0.00,0.00' && /shake=none/.test(sc[2]) && kv(sc[0], 'center') === kv(sc[2], 'center'),
  `쉐이크 두 번: 흔드는 중 오프셋 ${kv(sc[1], 'off')} → 끝 0 · 위치 그대로 ${kv(sc[0], 'center')} → ${kv(sc[2], 'center')}`);
// 배속: 3초 이동 — 1× 는 0.5초+ 뒤 아직 이동 중, 4× 는 같은 때 이미 끝남
const s1 = pick('speed1', 'cam')[0], s4 = pick('speed4', 'cam')[0];
ok(kv(s1, 'mode') === 'MOVE' && kv(s4, 'mode') !== 'MOVE', `배속: 3초 카메라 이동 — 1× ${kv(s1, 'mode')} / 4× ${kv(s4, 'mode')} (같은 실제 시간 뒤)`);
const sp4 = pick('speed4', 'cutscene');
ok(/timeScale=4\.0/.test(sp4[0] || '') || /active=false/.test(sp4[0] || ''), '4× 가 실제 시간 배율로 (timeScale)');
ok(/active=false.*timeScale=1\.0/.test(sp4[1] || ''), '이벤트가 끝나면 1× · 표시줄 숨김');
// 취소 (긴 쉐이크 + 16×)
const c2 = pick('cancel2', 'cam');
ok(/shake=8\.0/.test(c2[0] || '') && kv(c2[1], 'off') === '0.00,0.00' && kv(c2[1], 'mode') === 'GAME' && /active=false.*speed=1 .*timeScale=1\.0/.test(pick('cancel2', 'cutscene')[0] || ''), '16× 로 흔드는 중 취소 → 오프셋 0 · 영웅 따라가기 · 1×');
// 중첩
const ns = pick('nest', 'cutscene');
ok(ns.length === 5 && ns.slice(0, 4).every(l => /active=true/.test(l)) && /active=false/.test(ns[4]) && ns.some(l => /camera/.test(l)), '중첩(공통 이벤트 호출): 안쪽이 끝나도 바깥이 끝날 때까지 연출 중 — ' + ns.map(l => kv(l, 'why')).join(' → '));
// 오류
ok(/active=false.*speed=1 .*timeScale=1\.0/.test(pick('err', 'cutscene')[0] || '') && lines.some(l => /명령 실행 오류 \(wait @ err\)/.test(l)), '오류 명령이 있는 이벤트: 기록하고 이어서 끝 → 1×');
// 팔로우 · 없는 대상
const fc = pick('follow', 'cam');
ok(fc.length === 2 && kv(fc[0], 'follow') === '$hero' && lines.some(l => /스크린 팔로우: 대상이 없습니다 \(nobody_here\)/.test(l)) && kv(fc[1], 'mode') === 'GAME' && kv(fc[1], 'center') === kv(fc[1], 'hero'), `팔로우: 영웅 따라감 · 없는 대상은 기록하고 멈춤 · 리셋 → 영웅 따라가기 (${kv(fc[1], 'center')})`);
// 대사 + 표시줄
const dl = pick('dlg', 'cutscene')[0] || '', lay = pick('dlg', 'layout')[0] || '';
const bar = /\[([\d.]+),([\d.]+) ([\d.]+)x([\d.]+)\]/.exec(dl), box = /box=\[([\d.]+),([\d.]+) /.exec(lay);
ok(/bar=shown/.test(dl) && /in=true/.test(dl) && /speed=2/.test(dl) && bar && box && +bar[2] + +bar[4] <= +box[2] && /problems=0/.test(lay), `대사 중 표시줄: 안전 영역 안 · 대사창 위 (표시줄 아래 ${bar ? +bar[2] + +bar[4] : '?'} ≤ 대사창 위 ${box ? box[2] : '?'})`);
ok(/active=false.*timeScale=1\.0/.test(pick('dlg', 'cutscene')[1] || ''), '대사 이벤트 취소 → 1× · 숨김');
// 화면 돌리기
if (sec.rot) { const rc = pick('rot', 'cam'); const v2 = xy((kv(rc[1], 'view') || '0x0').replace('x', ',')), r2 = xy(kv(rc[1], 'center'));
  ok(kv(rc[1], 'mode') === 'HOLD' && near(r2[0], map[0] <= v2[0] ? map[0] / 2 : v2[0] / 2) && near(r2[1], map[1] <= v2[1] ? map[1] / 2 : v2[1] / 2) && /in=true/.test(pick('rot', 'cutscene')[0] || ''),
    `화면 돌리기 뒤: 화면 ${v2.join('x')} 기준으로 다시 맵 안 ${r2} · 표시줄 안전 영역 안`);
  ok(kv(rc[2], 'mode') === 'GAME', '돌린 뒤 취소 → 원작 따라가기'); }
// 저장 → 불러오기
const rl = pick('reload', 'cam')[0];
ok(kv(rl, 'mode') === 'GAME' && kv(rl, 'off') === '0.00,0.00' && /active=false.*timeScale=1\.0/.test(pick('reload', 'cutscene')[0] || ''), '카메라를 옮긴 채 저장 → 불러오기: 원작 카메라 · 1× · 연출 없음');
ok(ex.length === 0 && sec.end, `게임 오류 0 · 끝까지 실행${ex.length ? ' — ' + ex[0] : ''}`);
process.exit(fail);
JS
done
[ $fail = 0 ] && echo "모두 통과 (화면 시뮬레이션 — 에뮬레이터 · 실제 기기 아님)" || echo "실패가 있습니다 — 기록: $OUT"
exit $fail
