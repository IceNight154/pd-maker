#!/bin/bash
# 8차: 캐릭터 AI · 공격 프로필을 실제 게임에서 검사 (tools/playtest/combat-project.js 의 cb_brute · cb_plain · cb_broken)
#   사용: tools/playtest/combat-check.sh <게임 저장소> <작업 폴더>
#   순서: 영웅 옆 4칸에 cb_brute → 차례마다 aistat (쏘기 · 재사용 대기 3 · 다가가기 · 준비 1 후 베기 · 밀치기 · 기절 · 독) → 체력 5 → 도망
#         → 저장 · 불러오기(reload) 후에도 같은 규칙으로 계속 (멈추지 않음) → cb_broken(오류 설정) = 원래 AI + 경고 → cb_plain(설정 없음) = 원래 AI · [AI] 줄 없음 → 쓰러질 때 말
#   기록: <작업 폴더>/combat-check/combat.log · 결과 result.txt (자동 판정)
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$1"; WORK="$2"
[ -z "$REPO" -o -z "$WORK" ] && { echo "사용: combat-check.sh <게임 저장소> <작업 폴더>"; exit 2; }
OUT="$WORK/combat-check"; rm -rf "$OUT"; mkdir -p "$OUT"
PROJ="$WORK/combat-proj"
node "$HERE/combat-project.js" "$PROJ" > "$OUT/project.json" || exit 2
bash "$HERE/build.sh" "$REPO" "$WORK" "$PROJ" 2>&1 | grep -q BUILD_DONE || { echo "빌드 실패"; exit 2; }
R="eval:rest wait:0.35"
S="eval:aistat,cb_brute"
bash "$HERE/run.sh" "$WORK" "$PROJ" start:WARRIOR wait:3 eval:herotank eval:charai,cb_brute,4 wait:0.5 $S \
  eval:mark,fight $R $S $R $S $R $S $R $S $R $S $R $S $R $S $R $S eval:wshot,combat-fight \
  eval:mark,flee eval:aisethp,cb_brute,5 $R $S $R $S $R $S \
  eval:mark,presave eval:aisethp,cb_brute,30 $R $S \
  eval:mark,reload reload wait:2 eval:herotank $S $R $S $R $S \
  eval:mark,broken eval:charai,cb_broken,2 $R $R eval:aistat,cb_broken \
  eval:mark,plain eval:charai,cb_plain,3 $R $R eval:aistat,cb_plain \
  eval:mark,death eval:charhit,cb_brute,999 wait:0.5 eval:mark,end > "$OUT/combat.log" 2>&1
for f in "$WORK"/shots/*.png; do [ -e "$f" ] && cp "$f" "$OUT/"; done
node - "$OUT/combat.log" <<'JS' | tee "$OUT/result.txt"
const fs = require('fs'), log = fs.readFileSync(process.argv[2], 'utf8').split('\n');
let sec = '', rows = []; const out = []; let bad = 0;
for (const l of log) { const m = /\[TEST\] mark (\S+)/.exec(l); if (m) { sec = m[1]; continue; } rows.push({ sec, l }); }
const ok = (c, m) => { out.push((c ? '✓ ' : '✗ ') + m); if (!c) bad++; };
const ai = rows.filter(r => /\[AI\] cb_brute/.test(r.l)), st = rows.filter(r => /aistat cb_brute/.test(r.l));
const kv = (l, k) => { const m = new RegExp(k + ' ([^ ]+)').exec(l); return m ? m[1] : null; };
const turnOf = l => +(/t=([\d.]+)/.exec(l) || [])[1];
const shoots = ai.filter(r => /→ shoot/.test(r.l) && ['fight', 'flee'].includes(r.sec)).map(r => turnOf(r.l));
ok(shoots.length >= 2 && shoots.every((t, i) => i === 0 || t - shoots[i - 1] >= 3), `쏘기(독침 · 재사용 대기 3턴): ${shoots.join(', ')}턴 — 간격 ≥ 3`);
ok(ai.some(r => /shoot=attackCd/.test(r.l)), '재사용 대기 중에는 이유 attackCd 로 건너뜀');
ok(st.some(r => r.sec === 'fight' && /Poison/.test(r.l)), '독침을 맞은 영웅에게 독(Poison) 버프');
const melee = ai.findIndex(r => /→ melee/.test(r.l)), strike = ai.findIndex(r => /준비 끝 → melee 공격/.test(r.l));
ok(melee >= 0 && strike > melee && turnOf(ai[strike].l) - turnOf(ai[melee].l) === 1, `베기: 준비 1턴 뒤 공격 (고름 ${melee >= 0 ? turnOf(ai[melee].l) : '-'}턴 → 공격 ${strike >= 0 ? turnOf(ai[strike].l) : '-'}턴)`);
const hp = st.filter(r => ['fight', 'flee'].includes(r.sec)).map(r => [+kv(r.l, 'heroPos'), r.l]);   // 명중은 확률 — 두 번의 베기 중 맞은 것
ok(hp.some((x, i) => i > 0 && x[0] !== hp[i - 1][0]), '베기 밀치기 1칸: 영웅 위치가 바뀜 ' + [...new Set(hp.map(x => x[0]))].join('→'));
ok(st.some(r => /Paralysis/.test(r.l)), '베기 기절: 영웅에게 마비(Paralysis 또는 마비 내성) 버프');
const fl = st.filter(r => r.sec === 'flee').map(r => +kv(r.l, 'dist'));
ok(ai.some(r => /hp=5\/30 → flee/.test(r.l)) && fl.length >= 2 && fl[fl.length - 1] > fl[0], `체력 5/30 → 도망: 거리 ${fl.join('→')}`);
const rl = rows.filter(r => r.sec === 'reload');
ok(rl.some(r => /saved; reloading/.test(r.l)) && rl.filter(r => /\[AI\] cb_brute t=.*→ (approach|melee|shoot)/.test(r.l)).length >= 2, '저장 · 불러오기 뒤에도 같은 전투 설정으로 계속 판단 (게임이 멈추지 않음)');
{ const ps = rows.filter(r => r.sec === 'presave'), shot = ps.find(r => /\[AI\] cb_brute .*→ shoot/.test(r.l)), before = ps.filter(r => /aistat cb_brute/.test(r.l)).pop(), cdB = before && /a:bolt=([\d.]+)/.exec(before.l);
  const loaded = rl.find(r => /aistat cb_brute/.test(r.l)), cdL = loaded && /a:bolt=([\d.]+)/.exec(loaded.l), tA = rl.filter(r => /\[AI\] cb_brute t=/.test(r.l));
  ok(shot && cdB && cdL && cdB[1] === cdL[1], `불러오기: 저장 직전 쏜 독침의 재사용 대기가 그대로 (저장 전 a:bolt=${cdB ? cdB[1] : '-'} · 불러온 뒤 ${cdL ? cdL[1] : '-'})`);
  const first = tA[0], ft = first ? turnOf(first.l) : NaN;
  ok(first && ft < +(cdB || [])[1] && /shoot=attackCd/.test(first.l), `불러온 뒤 첫 차례(${ft}턴)는 재사용 대기 중이라 쏘지 않음 (${first ? first.l.replace(/.*→ ([^ ]+).*?(shoot=\w+).*/, '$1 · $2') : '-'})`); }
ok(rows.some(r => /전투 설정 오류 \(cb_broken\) — 원래 AI 로 움직입니다: · attackRef/.test(r.l)) && !rows.some(r => /\[AI\] cb_broken/.test(r.l)), '오류가 있는 설정 = 원래 AI + 경고 (게임이 멈추지 않음)');
ok(rows.some(r => r.sec === 'broken' && /aistat cb_broken/.test(r.l)), '오류 설정 캐릭터도 게임에 있음 (원래 AI 로 움직임)');
ok(!rows.some(r => /\[AI\] cb_plain/.test(r.l)) && rows.some(r => /aistat cb_plain .*\| $/.test(r.l) || /aistat cb_plain/.test(r.l)), '설정 없는 캐릭터 = 원래 AI ([AI] 줄 없음)');
ok(rows.some(r => r.sec === 'death' && /쓰러짐 → lastword/.test(r.l)), '쓰러질 때 행동 (말하기)');
ok(!log.some(l => /Exception|FATAL/.test(l) && !/ALSA|libEGL|SoundPool/.test(l)), '예외 없음');
console.log(out.join('\n') + `\n\n${out.length - bad} 통과 · ${bad} 실패`); process.exit(bad ? 1 : 0);
JS
exit ${PIPESTATUS[0]}
