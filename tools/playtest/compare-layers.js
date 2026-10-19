#!/usr/bin/env node
// 게임이 만든 레이어(eval:layercells 줄) = 편집기가 저장한 레이어(expected-layers.json — tools/tests/ui-layers.js <폴더> 가 남김)?
//   사용: node tools/playtest/compare-layers.js <expected-layers.json> <run.sh 출력 로그>
//   비교: 레이어마다 칸 → 사용자 타일 id (빈 칸 제외) · 캐릭터 위(above)/아래(below) 위치 · 칸 지형(편집기 지형 id = 게임 Terrain 값)
const fs = require('fs');
const [expF, logF] = process.argv.slice(2);
const exp = JSON.parse(fs.readFileSync(expF, 'utf8'));
const line = fs.readFileSync(logF, 'utf8').split('\n').find(l => l.startsWith('[TEST] layercells'));
if (!line) { console.log('✗ 로그에 layercells 줄이 없음'); process.exit(1); }
const m = /w=(\d+) h=(\d+) (\{.*\}) map=([\d,-]+)/.exec(line);
const gw = +m[1], gh = +m[2], game = JSON.parse(m[3]), map = m[4].split(',').map(Number);
let bad = 0; const out = [];
if (gw !== exp.W || gh !== exp.H) { console.log(`✗ 맵 크기 ${gw}×${gh} ≠ ${exp.W}×${exp.H}`); process.exit(1); }
const ABOVE = { front: true };   // 기본 레이어 정의에서 캐릭터 위인 것 (테스트 프로젝트는 기본 레이어)
for (const [id, arr] of Object.entries(exp.tiles)) {
  const g = game[id + (ABOVE[id] ? '@above' : '@below')] || {};
  const want = {}; arr.forEach((v, i) => { if (v) want[i] = v; });
  const diff = Object.keys(Object.assign({}, want, g)).filter(k => want[k] !== g[k]);
  if (diff.length) { bad++; out.push(`✗ ${id}: ${diff.length}칸 다름 (예: 칸 ${diff[0]} 편집기 ${want[diff[0]]} · 게임 ${g[diff[0]]})`); }
  else out.push(`✓ ${id}${ABOVE[id] ? ' (캐릭터 위)' : ''}: ${Object.keys(want).length}칸 같음`);
}
const extra = Object.keys(game).filter(k => !exp.tiles[k.split('@')[0]]); if (extra.length) { bad++; out.push('✗ 게임에만 있는 레이어: ' + extra.join(', ')); }
const TRAPS = [17, 18, 19];   // 함정 오브젝트가 놓인 칸은 게임이 함정 지형(숨은 함정 · 함정 · 꺼진 함정)으로 바꿈 — 레이어와 상관없음
const tdiff = exp.terrain.map((v, i) => v >= 0 && v !== map[i] && !TRAPS.includes(map[i]) ? i : -1).filter(i => i >= 0);
if (tdiff.length) { bad++; out.push(`✗ 지형 ${tdiff.length}칸 다름 (예: 칸 ${tdiff[0]} 편집기 ${exp.terrain[tdiff[0]]} · 게임 ${map[tdiff[0]]})`); } else out.push(`✓ 지형 ${exp.terrain.filter(v => v >= 0).length}칸 같음`);
console.log(out.join('\n')); process.exit(bad ? 1 : 0);
