#!/usr/bin/env node
// ================================================================
//  12차 — 다른 저장소 기능 찾기 · 가져오기 · 패키지 이름을 바꾼 파생작 · long 체력 적응 테스트 (Node 만 — 게임 빌드 없이)
//    사용: node tools/tests/repo-features.js [--game <game 폴더>] [이름 일부]
//    저장소가 없으면 그 테스트는 "실행하지 못함" 으로 표시하고 실패로 셈 (성공으로 꾸미지 않음)
//    ① 합성 저장소(임시 폴더): 멤버 나누기 · enum 상수 · 바꾸기 · 넣기(원래 순서) · import · 빼면 바이트까지 원래대로
//    ② 실제 저장소: BA 총기 패키지 · ARK 계단(Hero.handle) 의 필요한 것 · 임시 사본에 넣고 빼기 · 원본 저장소는 그대로
//    ③ 적응: RKPD2(com.zrp200.rkpd2) 게임 패키지 · 연결 줄 이름 · Experienced(long 체력) 덮어쓰기 함수 모양 · SPD 는 바뀌는 것 없음
//    컴파일 확인은 tools/playtest/feature-check.sh (javac) — 이 테스트는 구조 · 파일만 봄
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const F = require(path.join(ROOT, 'editor', 'repo-features.js'));
const A = require(path.join(ROOT, 'editor', 'runtime-adapt.js'));
const I = require(path.join(ROOT, 'editor', 'runtime-installer.js'));

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const GAME = path.resolve(opt('--game') || path.join(ROOT, 'game'));
const filter = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--game')[0] || '';
const R = { base: 'shattered-pixel-dungeon-master', ark: 'ARK_PD-main', ba: 'New-Blue-Archive-Pixel-Dungeon-main', rk: 'rkpd2', exp: 'Experienced-Pixel-Dungeon-Redone', pd: 'pixel-dungeon', sum: 'Summoning-Pixel-Dungeon', pow: 'powered-pixel-dungeon' };
const tests = [], tmpDirs = [], notRun = [];
const test = (name, fn) => tests.push({ name, fn });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-feat-')); tmpDirs.push(d); return d; };
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const need = k => { const d = path.join(GAME, R[k]); if (!fs.existsSync(d)) { const m = `${R[k]} 저장소가 없어 실행하지 못함 — ${d}`; notRun.push(m); throw new Error(m); } return d; };
const J = 'core/src/main/java/com/shatteredpixel/shatteredpixeldungeon';
/** 폴더의 모든 파일 해시 (바이트 비교) */
function hashTree(dir) { const out = {}; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '.git') walk(p); } else out[path.relative(dir, p)] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'); } }; walk(dir); return out; }
/** 게임 저장소 사본 (자바 소스 · 글자만 — 빠르게) */
function copyRepo(src) {
  const d = tmp();
  for (const sub of ['build.gradle', 'settings.gradle', 'core/src/main/java', 'SPD-classes/src/main/java', 'core/src/main/assets/messages', 'services', 'desktop/src/main/java']) {
    const s = path.join(src, sub); if (fs.existsSync(s)) fs.cpSync(s, path.join(d, sub), { recursive: true });
  }
  I.uninstall(d, () => {});   // 저장소에 이미 있는 PDMaker 연결 줄은 걷어 냄
  return d;
}

// ---------------------------------------------------------------- ① 합성 저장소
function synth(dir, heroSrc, extra) {
  write(path.join(dir, 'build.gradle'), "appName = 'Synth'\n");
  write(path.join(dir, J, 'Dungeon.java'), 'package com.shatteredpixel.shatteredpixeldungeon;\npublic class Dungeon { public static int depth; }\n');
  write(path.join(dir, J, 'levels/Level.java'), 'package com.shatteredpixel.shatteredpixeldungeon.levels;\npublic class Level { }\n');
  write(path.join(dir, J, 'actors/hero/Hero.java'), heroSrc);
  for (const [r, s] of Object.entries(extra || {})) write(path.join(dir, J, r), s);
}
const HERO_T = `package com.shatteredpixel.shatteredpixeldungeon.actors.hero;

public class Hero {
	public int HP = 10;

	public boolean handle(int cell) {
		return cell > 0;
	}

	public enum Kind {
		A, B;
	}
}
`;
const HERO_S = `package com.shatteredpixel.shatteredpixeldungeon.actors.hero;

import java.util.ArrayList;

public class Hero {
	public int HP = 10;
	public static final int BASE = 3;
	public static final int MORE = BASE + 1;

	// 계단을 적이 있어도 씀
	public boolean handle(int cell) {
		ArrayList<Integer> l = new ArrayList<>();
		return cell >= 0 && helper(cell) > MORE;
	}

	private int helper(int c) { return c * 2; }

	public enum Kind {
		A, B, C(2);
		Kind() { }
		Kind(int x) { }
	}
}
`;

test('합성: 멤버 나누기 — 함수 · 필드 · enum 상수 · 안쪽 형 · 초기화 블록', () => {
  const p = F.parseFile(HERO_S + '\nclass X { static { int a = 1; } int b; }\n');
  const hero = p.types.find(t => t.path === 'Hero'), kind = p.types.find(t => t.path === 'Hero.Kind');
  assert.deepStrictEqual(hero.members.map(m => m.key), ['field HP', 'field BASE', 'field MORE', 'handle(int)', 'helper(int)', 'type Kind']);
  assert.deepStrictEqual(kind.members.filter(m => m.kind === 'const').map(m => m.key), ['const A', 'const B', 'const C']);
  assert.ok(kind.members.some(m => m.key === 'Kind(int)'));
  const x = p.types.find(t => t.path === 'X'); assert.ok(x.members.some(m => m.kind === 'init'));
});

test('합성: 바뀐 함수를 고르면 쓰는 새 함수 · 필드(앞쪽 참조 순서) · import 까지 — 빼면 바이트까지 원래대로', () => {
  const S = tmp(), T = tmp(), P = tmp();
  synth(S, HERO_S); synth(T, HERO_T);
  const cat = F.catalog(S, T);
  const id = 'member:com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero#handle(int)';
  assert.ok(cat.features.some(f => f.id === id && f.change === 'changed'), '바뀐 handle(int) 을 찾음');
  const cl = F.closure(S, T, [id]);
  const keys = cl.members.map(m => m.key).sort();
  assert.deepStrictEqual(keys, ['field BASE', 'field MORE', 'handle(int)', 'helper(int)'], '쓰는 것만 (enum 상수 C 는 쓰지 않음)');
  const before = hashTree(T);
  F.savePack(P, F.pack(S, T, [id], { id: 'synth' }));
  const r = F.applyPacks(T, F.listPacks(P));
  assert.deepStrictEqual(r.problems, []);
  const out = fs.readFileSync(path.join(T, J, 'actors/hero/Hero.java'), 'utf8');
  assert.ok(out.includes('import java.util.ArrayList;'), 'import 더함');
  assert.ok(out.indexOf('BASE = 3') < out.indexOf('MORE = BASE + 1'), '정적 필드 순서 (앞쪽 참조 없음)');
  assert.ok(out.includes('helper(cell) > MORE') && out.includes('private int helper'));
  F.removePacks(T);
  assert.deepStrictEqual(hashTree(T), before, '빼면 원래 파일 그대로');
});

test('합성: enum 상수를 쓰는 새 클래스 → 그 상수 · 생성자도 (new 없이 부르는 enum 생성자)', () => {
  const S = tmp(), T = tmp();
  synth(S, HERO_S, { 'items/Gun.java': 'package com.shatteredpixel.shatteredpixeldungeon.items;\nimport com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;\npublic class Gun { Hero.Kind k = Hero.Kind.C; }\n' });
  synth(T, HERO_T);
  const cat = F.catalog(S, T);
  const f = cat.features.find(x => x.kind === 'package' && x.pkg === 'com.shatteredpixel.shatteredpixeldungeon.items');
  assert.ok(f, '새 패키지 items');
  const cl = F.closure(S, T, [f.id]);
  assert.ok(cl.members.some(m => m.key === 'Kind.const C'), 'enum 상수 C');
  assert.ok(cl.members.some(m => m.key === 'Kind.Kind(int)'), 'C(2) 가 부르는 생성자');
});

test('합성: 꾸러미를 만든 뒤 게임 쪽 함수가 바뀌면 덮어쓰지 않고 알림', () => {
  const S = tmp(), T = tmp(), P = tmp();
  synth(S, HERO_S); synth(T, HERO_T);
  const id = 'member:com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero#handle(int)';
  F.savePack(P, F.pack(S, T, [id], { id: 'synth' }));
  const f = path.join(T, J, 'actors/hero/Hero.java');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('return cell > 0;', 'return cell > 1;'));
  const r = F.applyPacks(T, F.listPacks(P));
  assert.ok(r.problems.some(p => /다름/.test(p)), r.problems.join(' / '));
  assert.ok(fs.readFileSync(f, 'utf8').includes('return cell > 1;'), '사용자 · 게임 쪽 코드를 지킴');
  F.removePacks(T);
});

// ---------------------------------------------------------------- ② 실제 저장소
test('BA 총기: 새 패키지 items.weapon.melee.gun · 필요한 클래스 · 특성 상수 · 생성자 · 번역 (new_messages → messages)', () => {
  const ba = need('ba'), base = need('base');
  const cat = F.catalog(ba, base, { members: false });
  const f = cat.features.find(x => x.id === 'package:com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.gun');
  assert.ok(f && f.classes.length >= 60, '총기 패키지 (클래스 60개 이상)');
  const cl = F.closure(ba, base, [f.id]);
  assert.deepStrictEqual(cl.missing, []);
  assert.ok(cl.members.some(m => /Talent$/.test(m.cls) && /^Talent\(int,int,int\)$/.test(m.key)), 'BA 특성 상수가 부르는 Talent(int,int,int)');
  assert.ok(cl.messages.some(m => m.key.startsWith('items.weapon.melee.gun.') && m.file.startsWith('messages/')), '총기 번역을 게임의 messages 폴더로');
  assert.ok(!cl.members.some(m => /VaultFinalRoom/.test(m.cls)), '흔한 이름(.image · .update)으로 관계없는 클래스를 끌어오지 않음');
});

test('ARK 계단: Hero.handle(int) → 새 행동 HeroAction.Descend · Ascend 와 그것을 처리하는 Hero.act() · 이름 겹침 없음', () => {
  const ark = need('ark'), base = need('base');
  const id = 'member:com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero#handle(int)';
  const cl = F.closure(ark, base, [id]);
  const ks = cl.members.map(m => m.cls.split('.').pop() + '#' + m.key);
  for (const k of ['Hero#handle(int)', 'HeroAction#type Descend', 'HeroAction#type Ascend', 'Hero#act()', 'Hero#actDescend(Descend)']) assert.ok(ks.includes(k), k);
  assert.ok(!ks.some(k => /BuffIndicator/.test(k)), '흔한 이름(buff)이나 생성자 이름만으로 BuffIndicator 를 끌어오지 않음');
  assert.deepStrictEqual(cl.conflicts, []);
});

test('실제 저장소: SPD 사본에 ARK 계단 넣기 → 빼면 바이트까지 원래대로 · 원본 저장소는 그대로', () => {
  const ark = need('ark'), base = need('base');
  const T = copyRepo(base), P = tmp();
  const origBefore = hashTree(path.join(base, 'core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/hero'));
  const before = hashTree(T);
  F.savePack(P, F.pack(ark, base, ['member:com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero#handle(int)'], { id: 'ark-stairs' }));
  const r = F.applyPacks(T, F.listPacks(P));
  assert.deepStrictEqual(r.problems, []);
  assert.ok(fs.readFileSync(path.join(T, J, 'actors/hero/HeroAction.java'), 'utf8').includes('class Descend'));
  F.removePacks(T);
  assert.deepStrictEqual(hashTree(T), before);
  assert.deepStrictEqual(hashTree(path.join(base, 'core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/hero')), origBefore, '원본 저장소를 바꾸지 않음');
});

test('설치기: 프로젝트 features/ 의 기능을 설치 때 넣고 제거하면 원래대로 · 서명이 바뀌면 다시 설치', () => {
  const ark = need('ark'), base = need('base');
  const T = copyRepo(base), P = tmp();
  const before = hashTree(T);
  assert.strictEqual(I.featuresSig(P), '');
  F.savePack(P, F.pack(ark, base, ['member:com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero#handle(int)'], { id: 'ark-stairs' }));
  const sig = I.featuresSig(P); assert.ok(sig.startsWith('1:'));
  I.install(T, path.join(ROOT, 'runtime', 'src'), () => {}, P);
  const hero = fs.readFileSync(path.join(T, J, 'actors/hero/Hero.java'), 'utf8');
  assert.ok(hero.includes('HeroAction.Descend') && hero.includes('>>> pdmaker'), '기능 + 연결 줄');
  assert.strictEqual(fs.readFileSync(path.join(T, J, 'pdmaker/features.sig'), 'utf8'), sig);
  assert.strictEqual(I.state(T, path.join(ROOT, 'runtime', 'src'), P).upToDate, true);
  // 기능 끄기 → 다시 설치해야 함
  const fj = path.join(P, 'features', 'ark-stairs', 'feature.json'), o = JSON.parse(fs.readFileSync(fj, 'utf8')); o.enabled = false; fs.writeFileSync(fj, JSON.stringify(o));
  assert.strictEqual(I.state(T, path.join(ROOT, 'runtime', 'src'), P).upToDate, false);
  I.install(T, path.join(ROOT, 'runtime', 'src'), () => {}, P);
  assert.ok(!fs.readFileSync(path.join(T, J, 'actors/hero/Hero.java'), 'utf8').includes('HeroAction.Descend'), '끈 기능은 빠짐');
  I.uninstall(T, () => {});
  assert.deepStrictEqual(hashTree(T), before, '제거하면 원래대로');
});

// ---------------------------------------------------------------- ③ 적응
test('RKPD2: 게임 패키지 com.zrp200.rkpd2 · 폴더 · 설치 가능 · 연결 줄 이름', () => {
  const rk = need('rk');
  assert.strictEqual(A.gamePackage(rk), 'com.zrp200.rkpd2');
  assert.ok(A.gameJavaDir(rk).endsWith(path.join('com', 'zrp200', 'rkpd2')));
  const c = I.compat(rk); assert.ok(c.ok, c.problems.join(' / ')); assert.deepStrictEqual(c.missing, []);
  assert.strictEqual(A.toGamePkg('com.shatteredpixel.shatteredpixeldungeon.pdmaker.X', 'com.zrp200.rkpd2'), 'com.zrp200.rkpd2.pdmaker.X');
  const ad = A.adaptRuntime(rk, path.join(ROOT, 'runtime/src/com/shatteredpixel/shatteredpixeldungeon/pdmaker'));
  assert.deepStrictEqual(ad.missing, []);
  assert.ok(Object.values(ad.files).every(s => !/com\.shatteredpixel\.shatteredpixeldungeon/.test(s)), '사본에 SPD 패키지 이름이 남지 않음');
  assert.ok(/public synchronized void layout\(\)/.test(ad.files['MakerDialogue.java']), '물려받는 RenderedTextBlock.layout() 이 public → 덮어쓰는 함수도 public');
});

test('Experienced: long 체력 · 피해 — 덮어쓰는 함수를 게임 선언에 맞춤 · SPD · ARK · BA 는 바뀌는 것 없음', () => {
  const exp = need('exp');
  const ad = A.adaptRuntime(exp, path.join(ROOT, 'runtime/src/com/shatteredpixel/shatteredpixeldungeon/pdmaker'));
  assert.ok(/@Override public long damageRoll\(\)/.test(ad.files['MakerMob.java']));
  assert.ok(/@Override public void damage\(long dmg, Object src\)/.test(ad.files['MakerMob.java']));
  assert.ok(I.compat(exp).ok);
  for (const k of ['base', 'ark', 'ba']) {
    const d = need(k), a = A.adaptRuntime(d, path.join(ROOT, 'runtime/src/com/shatteredpixel/shatteredpixeldungeon/pdmaker'));
    assert.deepStrictEqual(a.changes.filter(c => c.kind === 'numeric'), [], k + ' 는 바뀌는 것 없음');
  }
});

test('원작 Pixel Dungeon (gradle 없는 Eclipse 프로젝트): 분석 · 영웅 시트 · 몬스터 그림 · 런타임은 이유와 함께 거부', () => {
  const pd = need('pd');
  const An = require(path.join(ROOT, 'editor', 'repo-analyzer.js'));
  const r = An.analyze(pd);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.source.pkg, 'com.watabou.pixeldungeon');
  assert.deepStrictEqual(r.objects.heroes.map(h => h.sheet), ['warrior.png', 'mage.png', 'rogue.png', 'ranger.png'], '바깥 Assets 상수 (Assets.WARRIOR)');
  assert.ok(r.summary.mobsWithSprite >= 40 && r.summary.resourcesDecoded > 100);
  assert.ok(r.features.some(f => f.id === 'eclipse-layout'));
  const c = I.compat(pd); assert.ok(!c.ok && /원작 Pixel Dungeon/.test(c.problems.join(' ')));
});

test('SPD 2.5 이전 (Summoning · Powered): 분석은 되고 런타임은 이유와 함께 거부', () => {
  for (const k of ['sum', 'pow']) {
    const d = need(k);
    const An = require(path.join(ROOT, 'editor', 'repo-analyzer.js')), r = An.analyze(d);
    assert.deepStrictEqual(r.errors, [], k);
    assert.ok(r.objects.heroes.length >= 4 && r.summary.mobs > 50, k);
    const c = I.compat(d); assert.ok(!c.ok && /BRANCH_EXIT/.test(c.problems.join(' ')), k + ': ' + c.problems.join(' / '));
  }
});

// ---------------------------------------------------------------- 실행
(async () => {
  let pass = 0, fail = 0;
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    try { await t.fn(); pass++; console.log('✓ ' + t.name); }
    catch (e) { fail++; console.log('✗ ' + t.name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); }
  }
  for (const d of tmpDirs) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* 무시 */ }
  if (notRun.length) console.log('\n실행하지 못함:\n· ' + notRun.join('\n· '));
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
