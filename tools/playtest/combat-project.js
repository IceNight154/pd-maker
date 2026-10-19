#!/usr/bin/env node
// ================================================================
//  8차: 캐릭터 AI · 공격 프로필 · 아이템 공격 모션 검사용 프로젝트 (tools/playtest/combat-check.sh 가 씀)
//    사용: node tools/playtest/combat-project.js <만들 폴더>   (폴더를 지우고 새로 만듦 — 이름에 combat-proj 가 들어간 폴더만)
//    캐릭터 cb_brute  = 전투 프로필 (도망 · 쏘기(독 · 재사용 3) · 베기(준비 1 · 밀치기 1 · 기절 1) · 다가가기 · 쓰러질 때 말) · debug 기록
//           cb_plain  = 전투 프로필 없음 (원래 AI 그대로인지)
//           cb_broken = 오류가 있는 전투 프로필 (없는 공격) — 게임이 멈추지 않고 원래 AI · 경고
//    맵 = 직접 그린 20×12 방 (벽 테두리 · 바닥 · 입구)
// ================================================================
const fs = require('fs'), path = require('path');
const env = require(path.join(__dirname, '..', 'tests', 'editor-env.js'));
const COMBAT = {
  version: 1, enabled: true, detect: 10, debug: true,
  attacks: [
    { id: 'slash', name: '내려찍기', type: 'melee', range: 1, windup: 1, recovery: 0, mult: 1, flat: 1, knockback: 1, stun: 1 },
    { id: 'bolt', name: '독침', type: 'ranged', range: 6, mult: 0.5, cooldown: 3, status: 'poison', statusTurns: 5 }],
  behaviors: [
    { id: 'flee', name: '도망', priority: 100, when: { op: 'and', items: [{ k: 'hp', cmp: '<=', v: 30 }, { k: 'dist', cmp: '<=', v: 5 }] }, action: 'flee' },
    { id: 'shoot', name: '쏘기', priority: 50, when: { op: 'and', items: [{ k: 'dist', cmp: '>', v: 1 }, { k: 'visible' }] }, action: 'attack', attack: 'bolt' },
    { id: 'melee', name: '베기', priority: 40, action: 'attack', attack: 'slash' },
    { id: 'approach', name: '다가가기', priority: 10, action: 'approach' },
    { id: 'lastword', name: '쓰러질 때', on: 'death', action: 'say', say: '크윽…' }]
};
(async () => {
  const dir = process.argv[2];
  if (!dir || !/combat-proj/.test(dir)) { console.log('사용: combat-project.js <폴더 — 이름에 combat-proj>'); process.exit(2); }
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { PDM } = env.load(), S = PDM.store;
  await S.createNew(dir, 'combat-check');
  const W = 20, H = 12, T = new Array(W * H).fill(1);
  for (let x = 0; x < W; x++) { T[x] = 4; T[(H - 1) * W + x] = 4; } for (let y = 0; y < H; y++) { T[y * W] = 4; T[y * W + W - 1] = 4; }
  T[2 * W + 2] = 7;
  const node = S.keys('node')[0];
  S.edit(node, '맵', r => { r.mode = 'handmade'; r.size = { w: W, h: H }; r.layers = { terrain: T }; r.objects = []; });
  const mob = (id, name, extra) => S.add('char:' + id, Object.assign({ id, name, kind: 'mob', desc: '', sprite: { sheet: 'game:sprites/rat.png', frame: [16, 15], anims: { idle: { frames: [0, 0, 0, 1], fps: 2, loop: true }, run: { frames: [6, 7, 8, 9, 10], fps: 10, loop: true }, attack: { frames: [2, 3, 4, 5, 0], fps: 15, loop: false }, die: { frames: [11, 12, 13, 14], fps: 10, loop: false } } },
    stats: { hp: 30, attackMin: 2, attackMax: 4, defense: 0, accuracy: 30, evasion: 0, speed: 1 }, ai: { mode: 'hunt' }, behaviors: {} }, extra));
  mob('cb_brute', '시험 불량배', { combat: COMBAT });
  mob('cb_plain', '평범한 쥐', {});
  mob('cb_broken', '고장 난 쥐', { combat: { version: 1, enabled: true, behaviors: [{ id: 'x', action: 'attack', attack: 'nope' }], attacks: [] } });
  await S.save();
  const issues = PDM.aiModel.validate(COMBAT).filter(i => i.level === 'error');
  console.log(JSON.stringify({ node, W, H, errors: issues.length, brokenErrors: PDM.aiModel.validate(S.get('char:cb_broken').combat).filter(i => i.level === 'error').map(i => i.code) }));
})();
