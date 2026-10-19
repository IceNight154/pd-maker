#!/bin/bash
# 8차: 아이템 공격 모션 · 이펙트 타임라인을 실제 게임에서 검사 (tools/playtest/combat-project.js 의 mo_sword · mo_plain)
#   사용: tools/playtest/motion-check.sh <게임 저장소> <작업 폴더>
#   mo_sword (2판: 트랙 · 이징 · 타격 0.5 × 0.4초 · 판정 맞추기 'hit' · 이펙트 그림 · 번쩍임 · 흔들기 · 충격파) 로 세 번 공격 → 판정까지 걸린 시간 = 0.2초 (편집기 judgeSec)
#   → 모션 · 그림이 끝나면 지워짐 (쌓이지 않음) → mo_plain (모션 없음) 으로 바꾸면 게임 공격 동작 길이가 원래대로 (4 × 1/15초) · 판정 0.267초
#   → 공격 중 다른 층으로 · 저장/불러오기 → 예외 없이 정리
#   기록: <작업 폴더>/motion-check/motion.log · result.txt
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$1"; WORK="$2"
[ -z "$REPO" -o -z "$WORK" ] && { echo "사용: motion-check.sh <게임 저장소> <작업 폴더>"; exit 2; }
OUT="$WORK/motion-check"; rm -rf "$OUT"; mkdir -p "$OUT"
PROJ="$WORK/combat-proj"
node "$HERE/combat-project.js" "$PROJ" > "$OUT/project.json" || exit 2
bash "$HERE/build.sh" "$REPO" "$WORK" "$PROJ" 2>&1 | grep -q BUILD_DONE || { echo "빌드 실패"; exit 2; }
bash "$HERE/run.sh" "$WORK" "$PROJ" start:WARRIOR wait:3 eval:herotank eval:equipitem,mo_sword wait:0.5 eval:motionstat \
  eval:mark,sword eval:motiontime,r wait:0.15 eval:wshot,motion-mid wait:1 eval:motiontime,r wait:1.2 eval:motiontime,r wait:0.1 eval:motionstat wait:1.5 eval:mark,after eval:motionstat \
  eval:mark,plain eval:equipitem,mo_plain wait:0.5 eval:motiontime,r wait:1.2 eval:motionstat \
  eval:mark,left eval:equipitem,mo_sword wait:0.5 eval:motiontime,l wait:1.2 eval:motionstat \
  eval:mark,reload eval:motiontime,r wait:0.1 reload wait:2 eval:motionstat \
  eval:mark,depth eval:herotank eval:equipitem,mo_sword wait:0.3 eval:motiontime,r wait:0.1 eval:godepth,2 wait:3 eval:motionstat eval:mark,end > "$OUT/motion.log" 2>&1
for f in "$WORK"/shots/*.png; do [ -e "$f" ] && cp "$f" "$OUT/"; done
node - "$OUT/motion.log" "$OUT/project.json" <<'JS' | tee "$OUT/result.txt"
const fs = require('fs'), log = fs.readFileSync(process.argv[2], 'utf8').split('\n'), proj = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let sec = ''; const rows = [], out = []; let bad = 0;
for (const l of log) { const m = /\[TEST\] mark (\S+)/.exec(l); if (m) { sec = m[1]; continue; } rows.push({ sec, l }); }
const ok = (c, m) => { out.push((c ? '✓ ' : '✗ ') + m); if (!c) bad++; };
const dts = s => rows.filter(r => r.sec === s && /motiondmg/.test(r.l)).map(r => +/dt=([\d.]+)/.exec(r.l)[1]);
const stat = s => rows.filter(r => r.sec === s && /motionstat/.test(r.l)).map(r => Object.fromEntries(r.l.replace(/.*motionstat /, '').split(' ').map(kv => kv.split('=')).map(([k, v]) => [k, +v])));
const sw = dts('sword'), J = proj.motionJudge;
ok(proj.motionIssues.length === 0, '편집기 검사: mo_sword 문제 없음');
ok(sw.length === 3 && sw.every(t => Math.abs(t - J) < 0.06), `판정 맞추기(첫 타격): 공격 동작 시작 → 피해 ${sw.map(t => t.toFixed(3)).join(', ')}초 ≈ 편집기 ${J}초 (±0.06 — 화면 한두 프레임)`);
const s1 = stat('sword').pop() || {};
ok(s1.sync > 0 && Math.abs(s1.heroAttackDelay - J / s1.frames) < 1e-3, `그 공격만 게임 공격 동작 한 칸 = ${s1.heroAttackDelay} (= ${J} ÷ ${s1.frames})`);
ok(s1.fx >= 8, `이펙트 실행 ${s1.fx}번 (세 번째 공격은 아직 진행 중일 수 있음)`);
const s2 = stat('after').pop() || {};
ok(s2.live === 0, `끝난 뒤 남은 모션 · 그림 = ${s2.live} (쌓이지 않음)`);
ok(s2.spawned === 3 && s2.fx === 12, `세 번 공격 = 모션 3 · 이펙트 12 (4개 × 3) — 실제 ${s2.spawned} · ${s2.fx}`);
const pl = dts('plain'), s3 = stat('plain').pop() || {};
ok(pl.length === 1 && Math.abs(pl[0] - 4 / 15) < 0.06, `모션 없는 무기 = 원작 판정 ${pl.map(t => t.toFixed(3))}초 ≈ ${(4 / 15).toFixed(3)}초`);
ok(Math.abs(s3.heroAttackDelay - 1 / 15) < 1e-4 && s3.sync === -1 && s3.spawned === 3, `모션 없는 무기로 바꾸면 공격 동작 한 칸이 원래대로 (${s3.heroAttackDelay}) · 모션 안 나옴`);
const lf = dts('left'); ok(lf.length === 1 && Math.abs(lf[0] - J) < 0.06, `왼쪽 공격도 같은 판정 시각 ${lf.map(t => t.toFixed(3))}초`);
const rl = stat('reload').pop() || {}; ok(rows.some(r => r.sec === 'reload' && /saved; reloading/.test(r.l)) && rl.live === 0, `공격 중 저장 · 불러오기 → 남은 모션 ${rl.live}`);
const dp = stat('depth').pop() || {}; ok(dp.live === 0, `공격 중 다른 층으로 → 남은 모션 ${dp.live}`);
ok(!log.some(l => /Exception|FATAL|공격 모션 (이펙트 )?오류/.test(l) && !/ALSA|libEGL|SoundPool/.test(l)), '예외 · 모션 오류 없음');
console.log(out.join('\n') + `\n\n${out.length - bad} 통과 · ${bad} 실패`); process.exit(bad ? 1 : 0);
JS
exit ${PIPESTATUS[0]}
