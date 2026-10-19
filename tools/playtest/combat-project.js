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
  // 8차 D: 공격 모션 — mo_sword = 2판 타임라인 (트랙 · 이징 · 앞 오프셋 · 타격 0.5 · 판정 맞추기 · 이펙트: 그림 · 번쩍임 · 흔들기 · 충격파), mo_plain = 모션 없음
  const zlib = require('zlib');
  const png = (w, h, rgba) => { const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) rgba.forEach((v, i) => { raw[y * (w * 4 + 1) + 1 + x * 4 + i] = v; }); }
    const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
    const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]); };
  fs.mkdirSync(path.join(dir, 'assets/effects'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets/effects/slash.png'), png(12, 12, [255, 240, 160, 220]));
  const weapon = (id, name, attackFx) => S.add('item:' + id, Object.assign(PDM.make.item(id, 'weapon'), { id, name, category: 'weapon', kind: 'melee', stackable: false, weapon: PDM.make.weaponStats('melee', 1), sprite: { sheet: 'builtin:items', index: 1 } }, attackFx ? { attackFx } : {}));
  weapon('mo_sword', '모션 검', { on: true, v: 2, dur: 0.4, speed: 1, dist: 0, scale: 1, sync: 'hit', hits: [0.5], hitWindows: [[0.45, 0.6]], segments: { windup: 0, hit: 0.45, recovery: 0.6 },
    tracks: { angle: [[0, -100, 'out'], [0.5, 70, 'inout'], [1, 80, 'linear']], dist: [[0, 3, 'smooth'], [0.5, 8, 'back'], [1, 4]], scale: [[0, 1], [1, 1]], alpha: [[0, 1, 'linear'], [0.8, 1, 'linear'], [1, 0]], ox: [[0, 0, 'smooth'], [0.5, 3], [1, 0]] },
    events: [{ id: 'img', type: 'image', t: 0.45, dur: 0.3, anchor: 'tip', ref: 'assets/effects/slash.png', size: 1, grow: 1, alpha: 1, ease: 'out' }, { id: 'fl', type: 'flash', t: 0.5, anchor: 'target', role: 'hit' }, { id: 'sh', type: 'shake', t: 0.5, dur: 0.2, power: 3 }, { id: 'sw', type: 'shock', t: 0.5, anchor: 'target', size: 1 }] });
  weapon('mo_plain', '모션 없는 검', null);
  await S.save();
  const motionIssues = PDM.atkMotion.validate(S.get('item:mo_sword').attackFx).map(i => i.code);
  const issues = PDM.aiModel.validate(COMBAT).filter(i => i.level === 'error');
  console.log(JSON.stringify({ node, W, H, motionIssues, motionJudge: PDM.atkMotion.judgeSec(S.get('item:mo_sword').attackFx), errors: issues.length, brokenErrors: PDM.aiModel.validate(S.get('char:cb_broken').combat).filter(i => i.level === 'error').map(i => i.code) }));
})();
