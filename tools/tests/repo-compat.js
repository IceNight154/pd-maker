#!/usr/bin/env node
// ================================================================
//  9차 — 여러 Pixel Dungeon 파생 저장소 호환성 테스트 (Node 만 — Electron · 게임 빌드 없이)
//    사용: node tools/tests/repo-compat.js [--game <game 폴더>] [--out <결과.json>] [이름 일부]
//      --game 을 주지 않으면 PDMaker 의 game/ 폴더. 그 안의 세 저장소를 씀:
//        shattered-pixel-dungeon-master (기준) · ARK_PD-main · New-Blue-Archive-Pixel-Dungeon-main
//      저장소가 없으면 그 테스트는 "실행하지 못함"으로 표시하고 실패로 셈 (성공으로 꾸미지 않음)
//    ① 합성 저장소(임시 폴더): 루트 찾기 · 순환/바깥 링크 · 권한 오류 · 손상된 그림/소리 · 깨진 Java · 병합 충돌 · 캐시
//    ② 실제 저장소 세 개: 루트 · 모듈 · 소스 · 리소스 디코딩 · 구조 차이(어댑터) · 대표 객체의 식별자 · 속성 · 그림 연결 ·
//       편집기 목록(gamescan) 변환 · 원본과 변환 결과 비교 · 다시 맞춰도 중복 없음 · 원본 파일을 바꾸지 않음 · 기준 저장소 회귀
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), assert = require('assert');
const env = require('./editor-env');
const ROOT = path.join(__dirname, '..', '..');
const A = require(path.join(ROOT, 'editor', 'repo-analyzer.js'));
const JS = require(path.join(ROOT, 'editor', 'renderer', 'js', 'javasrc.js'));

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const GAME = path.resolve(opt('--game') || path.join(ROOT, 'game'));
const OUT = opt('--out');
const filter = args.filter((a, i) => !a.startsWith('--') && !['--game', '--out'].includes(args[i - 1]))[0] || '';
const REPOS = { base: 'shattered-pixel-dungeon-master', ark: 'ARK_PD-main', ba: 'New-Blue-Archive-Pixel-Dungeon-main' };

const tests = [], tmpDirs = [], results = { metrics: {}, notRun: [] };
const test = (name, fn) => tests.push({ name, fn });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-compat-')); tmpDirs.push(d); return d; };
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const cacheDir = tmp();
const reports = {};
const report = key => { const d = path.join(GAME, REPOS[key]); if (!fs.existsSync(d)) return null; return reports[key] || (reports[key] = A.analyze(d, { cacheDir })); };
const need = key => { const r = report(key); if (!r) { const msg = `${REPOS[key]} 저장소가 없어 실행하지 못함 — 필요한 경로: ${path.join(GAME, REPOS[key])}`; results.notRun.push(msg); throw new Error(msg); } return r; };

// ---------------------------------------------------------------- 작은 PNG 만들기 · 읽기 (테스트용)
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function makePng(w, h, fill) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4)); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (1 + w * 4) + 1 + x * 4; const v = fill(x, y); raw[o] = v[0]; raw[o + 1] = v[1]; raw[o + 2] = v[2]; raw[o + 3] = v[3]; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** 8비트 RGBA PNG → { w, h, alpha(x,y) } (필터 0~4) */
function readPng(file) {
  const b = fs.readFileSync(file); let off = 8, w, h, depth, color; const idat = [];
  while (off < b.length) { const len = b.readUInt32BE(off), type = b.toString('latin1', off + 4, off + 8); if (type === 'IHDR') { w = b.readUInt32BE(off + 8); h = b.readUInt32BE(off + 12); depth = b[off + 16]; color = b[off + 17]; } if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len)); if (type === 'IEND') break; off += 12 + len; }
  assert.strictEqual(depth, 8, '테스트 PNG 읽기: 8비트만'); assert.strictEqual(color, 6, '테스트 PNG 읽기: RGBA 만');
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? out[i - bpp] : 0, u = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0; let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1; else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; } out[i] = v & 255; } }
  return { w, h, alpha: (x, y) => px[(y * w + x) * 4 + 3] };
}
/** 칸 안에 보이는 픽셀이 있는지 */
const cellHasPixels = (img, x0, y0, cw, ch) => { let n = 0; for (let y = y0; y < Math.min(img.h, y0 + ch); y++) for (let x = x0; x < Math.min(img.w, x0 + cw); x++) if (img.alpha(x, y) > 0) n++; return n; };

// ---------------------------------------------------------------- 합성 저장소
const PKG = 'core/src/main/java/com/shatteredpixel/shatteredpixeldungeon';
function fakeRepo(dir, o = {}) {
  write(path.join(dir, 'settings.gradle'), o.settings || "include ':core', ':desktop',\n        ':android'\n");
  write(path.join(dir, 'build.gradle'), "allprojects {\n  ext {\n    appName = 'Fake PD'\n    appPackageName = 'com.example.fake'\n    appVersionName = '1.0'\n    appVersionName += '_test'\n    appJavaCompatibility = JavaVersion.VERSION_11\n  }\n}\n");
  write(path.join(dir, 'gradlew'), '#!/bin/sh\n');
  write(path.join(dir, 'core', 'build.gradle'), "apply plugin: 'java-library'\ndependencies { api project(':SPD-classes') }\n");
  write(path.join(dir, 'desktop', 'build.gradle'), "dependencies { implementation project(':core') }\n");
  write(path.join(dir, 'desktop/src/main/java/com/example/DesktopLauncher.java'), 'package com.example;\npublic class DesktopLauncher { public static void main(String[] a) { } }\n');
  const J = (rel, s) => write(path.join(dir, PKG, rel), 'package com.shatteredpixel.shatteredpixeldungeon' + (rel.includes('/') ? '.' + rel.split('/').slice(0, -1).join('.') : '') + ';\n' + s);
  J('Dungeon.java', 'public class Dungeon { public static void init() { } }\n');
  J('FakeGame.java', 'import com.watabou.noosa.Game;\npublic class FakeGame extends Game { }\n');
  J('Assets.java', 'public class Assets {\n\tpublic static class Sprites {\n\t\tpublic static final String ITEMS = "sprites/items.png";\n\t\tpublic static final String HERO_A = "sprites/hero_a.png";\n\t\tpublic static final String BLOB = "sprites/blob.png";\n\t\tpublic static final String GONE = "sprites/gone.png";\n\t}\n\tpublic static class Messages {\n\t\tpublic static final String ACTORS = "messages/actors/actors";\n\t}\n}\n');
  J('sprites/ItemSpriteSheet.java', 'public class ItemSpriteSheet {\n\tprivate static final int WIDTH = 4;\n\tpublic static final int SIZE = 32;\n\tprivate static int xy(int x, int y){ x -= 1; y -= 1; return x + WIDTH*y; }\n' +
    Array.from({ length: 22 }, (_, i) => `\tpublic static final int C${i} = xy(${(i % 4) + 1}, ${Math.floor(i / 4) + 1});\n`).join('') + '\tpublic static final int SWORD = xy(2, 2);\n}\n');
  J('actors/hero/HeroClass.java', 'public enum HeroClass {\n\tWARRIOR( "warrior" ),\n\tMAGE( "mage" );\n\tHeroClass(String t) { }\n\tpublic String spritesheet() {\n\t\tswitch (this) {\n\t\t\tcase WARRIOR: default:\n\t\t\t\treturn Assets.Sprites.HERO_A;\n\t\t\tcase MAGE:\n\t\t\t\treturn Assets.Sprites.GONE;\n\t\t}\n\t}\n}\n');
  J('sprites/HeroSprite.java', 'public class HeroSprite { private static final int FRAME_WIDTH = 20; private static final int FRAME_HEIGHT = 20; }\n');
  J('actors/Char.java', 'public abstract class Char { public int HP; }\n');
  J('actors/mobs/Mob.java', 'public abstract class Mob extends com.shatteredpixel.shatteredpixeldungeon.actors.Char { }\n');
  J('actors/mobs/Blob.java', 'public class Blob extends Mob {\n\t{\n\t\tspriteClass = BlobSprite.class;\n\t\tHP = HT = 12;\n\t\tdefenseSkill = 3;\n\t\tEXP = 2;\n\t}\n}\n');
  J('actors/mobs/Spaced.java', 'public class Spaced extends Mob {\n\t{ spriteClass = BlobSprite .class; HP = HT = 5; }\n}\n');   // ARK AirborneSoldier 모양 (점 앞 공백)
  J('actors/mobs/Dyn.java', 'public class Dyn extends Mob {\n\t{ spriteClass = Status.getSprite(); }\n}\n');   // ARK TheEndspeaker 모양 (코드로 고름)
  J('actors/mobs/BigBlob.java', 'public class BigBlob extends Blob {\n\t{ HP = HT = 40; }\n}\n');
  J('sprites/BlobSprite.java', 'public class BlobSprite extends MobSprite {\n\tpublic BlobSprite() {\n\t\tsuper();\n\t\ttexture( Assets.Sprites.BLOB );\n\t\tTextureFilm frames = new TextureFilm( texture, 8, 8 );\n\t\tidle = new Animation( 2, true );\n\t\tidle.frames( frames, 0, 1 );\n\t\tdie = new Animation( 10, false );\n\t\tdie.frames( frames, 2, 3 );\n\t}\n}\n');
  J('items/Item.java', 'public class Item { }\n');
  J('items/weapon/Sword.java', 'public class Sword extends com.shatteredpixel.shatteredpixeldungeon.items.Item {\n\t{ image = ItemSpriteSheet.SWORD; }\n}\n');
  if (o.broken !== false) {
    J('Broken.java', 'public class Broken {\n\tvoid a() {\n\t\tif (true) {\n\t}\n');   // 닫는 괄호 모자람
    J('Conflict.java', 'public class Conflict {\n<<<<<<< HEAD\n\tint a = 1;\n=======\n\tint a = 2;\n>>>>>>> abc\n}\n');
  }
  const AS = path.join(dir, 'core/src/main/assets');
  write(path.join(AS, 'sprites/items.png'), makePng(128, 96, (x, y) => x >= 32 && x < 64 && y >= 32 && y < 64 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
  write(path.join(AS, 'sprites/hero_a.png'), makePng(40, 20, () => [0, 0, 255, 255]));
  write(path.join(AS, 'sprites/blob.png'), makePng(32, 8, () => [0, 255, 0, 255]));
  const bad = makePng(16, 16, () => [1, 2, 3, 255]); bad[bad.length - 20] ^= 0xff; write(path.join(AS, 'sprites/crc_bad.png'), bad);
  write(path.join(AS, 'sprites/truncated.png'), makePng(16, 16, () => [1, 2, 3, 255]).subarray(0, 40));
  write(path.join(AS, 'sounds/fake.ogg'), Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 1, 2, 3, 4, 5, 6, 7, 8]));
  write(path.join(AS, 'sounds/ok.mp3'), Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0]), Buffer.from([0xFF, 0xFB, 0x90, 0x00]), Buffer.alloc(64)]));
  write(path.join(AS, 'gdx/skin.json'), '{\ncom.badlogic.Font: { default: { file: font.fnt } },\n}\n');
  write(path.join(AS, 'messages/actors/actors.properties'), 'actors.mobs.blob.name=블롭\nactors.hero.heroclass.warrior=전사\n');
  write(path.join(AS, 'messages/actors/actors.properties.bak'), 'x=y\n');
  write(path.join(AS, 'sprites/source.aseprite'), Buffer.from('ase'));
}

test('합성: 루트 찾기 — 모듈 폴더를 고르면 상위 저장소, 여러 저장소가 든 폴더는 후보만 (첫 폴더를 고르지 않음), 한글 · 공백 경로', () => {
  const t = tmp(), a = path.join(t, '게임 저장소 A'), b = path.join(t, 'repo b');
  fakeRepo(a); fakeRepo(b);
  let r = A.findRoot(t); assert.strictEqual(r.root, null, '여러 저장소면 루트를 정하지 않음'); assert.strictEqual(r.candidates.length, 2);
  r = A.findRoot(path.join(a, 'core')); assert.strictEqual(r.root, a, '모듈 폴더 → 상위 저장소'); assert.ok(/모듈/.test(r.reason));
  r = A.findRoot(a); assert.strictEqual(r.root, a);
  const one = path.join(t, 'wrap'); fakeRepo(path.join(one, 'inner', 'repo'));
  r = A.findRoot(one); assert.strictEqual(r.root, path.join(one, 'inner', 'repo'), '아래에 하나뿐이면 그것');
  r = A.findRoot(path.join(t, 'none')); assert.ok(r.problems.length && !r.root, '없는 폴더');
  const unrelated = path.join(a, 'docs'); fs.mkdirSync(unrelated); r = A.findRoot(unrelated);
  assert.notStrictEqual(r.root, a, '모듈이 아닌 하위 폴더에서 상관없는 상위 저장소로 올라가지 않음');
  return `후보 ${A.findRoot(t).candidates.length}개 · 모듈 폴더 → ${path.basename(a)}`;
});

test('합성: 저장소 하나 끝까지 — 모듈 · 패키지 · 시작 클래스 · 깨진 Java · 병합 충돌 · 손상 그림 · 형식이 다른 소리 · 미지원 · 백업 · 참조', () => {
  const d = path.join(tmp(), '한글 경로 repo'); fakeRepo(d);
  const r = A.analyze(d);
  assert.strictEqual(r.root, d); assert.deepStrictEqual(r.modules.map(m => m.name), [':core', ':desktop', ':android']);
  assert.ok(r.modules.find(m => m.name === ':android').exists === false && r.warnings.some(w => /:android/.test(w.reason)), '없는 모듈 폴더는 경고 (실패 아님)');
  assert.strictEqual(r.build.appVersionName, '1.0_test', 'appVersionName += 이어 붙이기');
  assert.ok(r.features.some(f => f.id === 'settings-single-include'), '한 문장 include');
  assert.strictEqual(r.source.pkg, 'com.shatteredpixel.shatteredpixeldungeon'); assert.strictEqual(r.source.gameModule, ':core');
  assert.deepStrictEqual(r.source.entry.game.map(g => g.cls), ['FakeGame']); assert.ok(r.features.some(f => f.id === 'game-class'));
  const probs = r.source.java.problems.list;
  const br = probs.find(p => /Broken\.java$/.test(p.file)), cf = probs.find(p => /Conflict\.java$/.test(p.file));
  assert.ok(br && !br.partial && /닫히지 않은/.test(br.reason), '괄호가 모자란 파일 = 실패 + 이유: ' + JSON.stringify(br));
  assert.ok(cf && /병합 충돌/.test(cf.reason) && cf.line === 3, '병합 충돌 표시 + 줄: ' + JSON.stringify(cf));
  assert.strictEqual(r.source.java.failed, 2);
  const failed = r.resources.failed.list.map(f => path.basename(f.file) + ': ' + f.reason).join('\n');
  assert.ok(/crc_bad\.png: .*CRC/.test(failed), failed); assert.ok(/truncated\.png: /.test(failed), failed); assert.ok(/fake\.ogg: .*webm/.test(failed), failed);
  assert.ok(!/skin\.json/.test(failed), 'libGDX 느슨한 JSON 은 성공');
  assert.ok(r.resources.unsupported.list.some(u => /\.aseprite$/.test(u.file)), 'aseprite = 미지원(경로 보존)');
  assert.ok(r.resources.ignored.list.some(u => /\.bak$/.test(u.file)), '백업 = 무시');
  assert.ok(r.refs.missing.list.some(m => m.path === 'sprites/gone.png'), '상수는 있는데 파일 없음');
  // 구조 차이 · 객체
  assert.ok(r.features.some(f => f.id === 'item-sheet-geometry'), '32px × 4칸 시트');
  assert.strictEqual(r.itemSheet.cell, 32); assert.strictEqual(r.itemSheet.cols, 4); assert.strictEqual(r.itemSheet.consts.SWORD, 5);
  const sw = r.objects.items.find(i => i.cls === 'weapon.Sword'); assert.ok(sw && sw.index === 5 && sw.inSheet === true, JSON.stringify(sw));
  const h = r.objects.heroes; assert.deepStrictEqual(h.map(x => [x.cls, x.sheet, x.sheetFound]), [['WARRIOR', 'sprites/hero_a.png', true], ['MAGE', 'sprites/gone.png', false]]);
  assert.ok(r.features.some(f => f.id === 'hero-sheet-switch'));
  const bl = r.objects.mobs.find(m => m.cls === 'Blob'), big = r.objects.mobs.find(m => m.cls === 'BigBlob');
  assert.ok(bl.spriteOk && bl.name === '블롭' && bl.stats.hp === 12 && bl.stats.evasion === 3 && bl.stats.exp === 2, JSON.stringify(bl));
  assert.deepStrictEqual(bl.sprite.frame, [8, 8]); assert.deepStrictEqual(bl.sprite.anims.idle.frames, [0, 1]);
  assert.ok(big.spriteOk && big.sprite.from === 'Blob' && big.stats.hp === 40 && big.stats.exp === 2 && big.stats.from.exp === 'Blob', '부모에서 이어받은 값은 어디서 왔는지 표시: ' + JSON.stringify(big.stats));
  const spc = r.objects.mobs.find(m => m.cls === 'Spaced'), dyn = r.objects.mobs.find(m => m.cls === 'Dyn');
  assert.ok(spc.spriteOk && spc.sprite.ref === 'BlobSprite', '"BlobSprite .class" (점 앞 공백) 도 읽음: ' + JSON.stringify(spc.reasons));
  assert.ok(dyn.convertible && !dyn.spriteOk && /코드로 고름 \(spriteClass = Status\.getSprite\(\)\)/.test(dyn.reasons.join()), '코드로 고르는 그림 = 변환은 하되 이유 표시: ' + JSON.stringify(dyn.reasons));
  assert.ok(r.support.length >= 8 && r.support.every(s => Object.keys(s.stages).length === 8), '지원 범위 8단계');
  return `소스 실패 ${r.source.java.failed} · 리소스 실패 ${r.resources.failed.total} · 구조 차이 ${r.features.map(f => f.id).join(',')}`;
});

test('합성: 순환 링크 · 저장소 밖 링크 · 깨진 링크 · 읽을 수 없는 폴더 — 전체가 실패하지 않고 기록', () => {
  const d = path.join(tmp(), 'links'); fakeRepo(d, { broken: false });
  const outside = path.join(tmp(), 'outside'); write(path.join(outside, 'secret.png'), makePng(4, 4, () => [0, 0, 0, 255]));
  let linked = true;
  try {
    fs.symlinkSync(path.join(d, 'core'), path.join(d, 'core', 'src', 'loop'), 'dir');
    fs.symlinkSync(outside, path.join(d, 'core', 'src', 'main', 'assets', 'ext'), 'dir');
    fs.symlinkSync(path.join(d, 'nothing-here'), path.join(d, 'dangling'));
  } catch (e) { linked = false; }
  let locked = false; const lockDir = path.join(d, 'core', 'locked');
  if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) { fs.mkdirSync(lockDir); write(path.join(lockDir, 'x.java'), 'class x {}'); fs.chmodSync(lockDir, 0); locked = true; }
  try {
    const r = A.analyze(d);
    assert.ok(r.root && r.source.gameModule === ':core', '분석은 끝까지');
    const sk = r.walk.skipped.list.map(s => s.rel + ' ' + s.reason).join('\n');
    if (linked) {
      assert.ok(/loop .*(순환|이미 훑은)/.test(sk), '순환 링크: ' + sk);
      assert.ok(/ext .*저장소 밖/.test(sk), '바깥 링크: ' + sk);
      assert.ok(/dangling .*깨진 링크/.test(sk), '깨진 링크: ' + sk);
      assert.ok(!r.resources.failed.list.concat(r.resources.unsupported.list).some(f => /secret/.test(f.file)) && !JSON.stringify(r).includes('secret.png'), '저장소 밖 파일은 읽지 않음');
    }
    if (locked) assert.ok(r.errors.some(e => /locked/.test(e.file || '') && /EACCES|EPERM/.test(e.reason)), '권한 오류 기록: ' + JSON.stringify(r.errors));
    return `링크 ${linked ? '확인' : '이 환경에서 만들 수 없음 (건너뜀)'} · 권한 ${locked ? '확인' : '이 환경에서 확인 못 함 (root/Windows)'}`;
  } finally { if (locked) fs.chmodSync(lockDir, 0o755); }
});

test('합성: 캐시 — 파일이 그대로면 저장된 결과, 하나라도 바뀌면 다시 분석 (바뀐 내용이 빠지지 않음)', () => {
  const d = path.join(tmp(), 'cache'); fakeRepo(d, { broken: false }); const cd = tmp();
  const r1 = A.analyze(d, { cacheDir: cd }); assert.ok(!r1.cached);
  const r2 = A.analyze(d, { cacheDir: cd }); assert.ok(r2.cached && r2.fingerprint === r1.fingerprint, '같으면 캐시');
  write(path.join(d, PKG, 'actors/mobs/NewMob.java'), 'package com.shatteredpixel.shatteredpixeldungeon.actors.mobs;\npublic class NewMob extends Mob {\n\t{ spriteClass = BlobSprite.class; }\n}\n');
  const r3 = A.analyze(d, { cacheDir: cd }); assert.ok(!r3.cached && r3.objects.mobs.some(m => m.cls === 'NewMob'), '새 파일 반영');
  const r4 = A.analyze(d, { cacheDir: cd, force: true }); assert.ok(!r4.cached, '다시 분석(force)');
  fs.writeFileSync(r4.cacheFile, '{ 깨진');
  const r5 = A.analyze(d, { cacheDir: cd }); assert.ok(!r5.cached && r5.objects.mobs.length === r4.objects.mobs.length, '깨진 캐시 → 다시 분석');
  return '캐시 → 바뀐 파일 감지 → 다시 분석 → 깨진 캐시 복구';
});

test('합성: 런타임 클래스 확인 — 런타임이 이름으로 부르는 게임 클래스가 없으면 "컴파일 안 됨" (주석 · 문자열 속 이름은 무시 · 다른 모듈의 클래스도 찾음)', () => {
  const d = path.join(tmp(), 'rtcheck'); fakeRepo(d, { broken: false });
  write(path.join(d, 'services/src/main/java/com/shatteredpixel/shatteredpixeldungeon/services/News.java'), 'package com.shatteredpixel.shatteredpixeldungeon.services;\npublic class News { }\n');
  const rt = path.join(tmp(), 'rt', 'src'), rd = path.join(rt, 'com/shatteredpixel/shatteredpixeldungeon/pdmaker');
  write(path.join(rd, 'MakerA.java'), 'package com.shatteredpixel.shatteredpixeldungeon.pdmaker;\nimport com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Blob;\nclass MakerA {\n\t// com.shatteredpixel.shatteredpixeldungeon.InComment\n\tString s = "com.shatteredpixel.shatteredpixeldungeon.InString";\n\tObject a = com.shatteredpixel.shatteredpixeldungeon.Dungeon.class;\n\tObject b = com.shatteredpixel.shatteredpixeldungeon.services.News.class;\n\tObject c = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerB.class;\n\tvoid f() { com.shatteredpixel.shatteredpixeldungeon.actors.mobs.MobSpawner.x(); }\n}\n');
  write(path.join(rd, 'MakerB.java'), 'package com.shatteredpixel.shatteredpixeldungeon.pdmaker;\nclass MakerB { }\n');
  const r = A.analyze(d, { runtimeSrc: rt }), cc = r.runtime.classCheck;
  assert.ok(cc.checked); assert.strictEqual(cc.refs, 4, '주석 · 문자열 · pdmaker 자신은 빼고 4개: ' + JSON.stringify(cc));
  assert.deepStrictEqual(cc.missing.map(m => [m.cls, m.uses]), [['actors.mobs.MobSpawner', ['MakerA.java:9']]]);
  assert.strictEqual(r.support[0].stages.runtime.s, 'no'); assert.ok(r.warnings.some(w => /MobSpawner/.test(w.reason) && /컴파일/.test(w.reason)));
  // 런타임 소스가 바뀌면 캐시를 쓰지 않음 (편집기 업데이트)
  const cd = tmp(); A.analyze(d, { runtimeSrc: rt, cacheDir: cd }); assert.ok(A.analyze(d, { runtimeSrc: rt, cacheDir: cd }).cached);
  write(path.join(rd, 'MakerB.java'), 'package com.shatteredpixel.shatteredpixeldungeon.pdmaker;\nclass MakerB { int more; }\n');
  assert.ok(!A.analyze(d, { runtimeSrc: rt, cacheDir: cd }).cached, '런타임이 바뀌면 다시 분석');
  return '없는 클래스 actors.mobs.MobSpawner (MakerA.java:9) · 다른 모듈 services.News 는 찾음';
});

test('합성: worker 스레드 실행 (Electron main.js 의 repo:analyze 와 같은 방식) — 결과를 보내고 종료 코드 0', async () => {
  const d = path.join(tmp(), 'worker'); fakeRepo(d, { broken: false }); const cd = tmp();
  const { Worker } = require('worker_threads');
  const res = await new Promise((resolve, reject) => {
    let msg = null; const w = new Worker(path.join(ROOT, 'editor', 'repo-analyzer.js'), { workerData: { pdmAnalyze: { dir: d, force: false, cacheDir: cd } }, stdout: true });
    let out = ''; w.stdout.on('data', b => { out += b; });
    w.once('message', m => { msg = m; }); w.once('error', reject); w.once('exit', code => resolve({ code, msg, out }));
  });
  assert.strictEqual(res.code, 0, '종료 코드 (예전: 명령줄 처리까지 돌아 1)'); assert.ok(!/사용법/.test(res.out), '명령줄 안내를 찍지 않음');
  assert.ok(res.msg && res.msg.value && res.msg.value.root === d && res.msg.value.objects.mobs.some(m => m.cls === 'Blob'), JSON.stringify(res.msg && res.msg.error));
  assert.strictEqual(fs.readdirSync(cd).filter(f => f.endsWith('.json')).length, 1, '캐시 파일');
});

test('합성: Java 구조 분석 — 주석 · 문자열 속 괄호 · 안쪽/지역 클래스 · enum 생성자 인자', () => {
  const src = 'package a.b;\n/* class Fake { */\npublic class Outer extends Base implements X, Y<Z> {\n\tString s = "}{ class No {";\n\tchar c = \'{\';\n\tstatic class Inner extends Outer { }\n\tvoid m() { class Local { } Runnable r = new Runnable() { public void run() { } }; }\n}\nenum E { A(1, "x"), B { void f() { } }, C; E() { } E(int a, String b) { } }\n';
  const st = JS.structure(src);
  assert.ok(st.balanced, JSON.stringify(st.problems)); assert.strictEqual(st.pkg, 'a.b');
  assert.deepStrictEqual(st.types.map(t => [t.name, t.ext, t.depth, t.local]), [['Outer', 'Base', 0, false], ['Inner', 'Outer', 1, false], ['Local', '', 1, true], ['E', '', 0, false]]);
  assert.deepStrictEqual(JS.enumConstants(src, 'E'), ['A', 'B', 'C']);
  assert.deepStrictEqual(JS.gradleIncludes("include ':core', ':a',\n  ':b'\ninclude(':c')\n// include ':no'\n").modules, [':core', ':a', ':b', ':c']);
});

// ---------------------------------------------------------------- 실제 저장소
const editorScan = async (key, analyzer) => { const ctx = env.load({ analyzer, analysisCache: cacheDir }); ctx.PDM.log = () => { }; await ctx.PDM.gameScan(path.join(GAME, REPOS[key]), true); return ctx; };
const metrics = (key, r, conv) => { const S = r.summary; results.metrics[key] = { name: REPOS[key], sourceFound: S.sourceFound, sourceOk: S.sourceOk, sourcePartial: S.sourcePartial, sourceFailed: S.sourceFailed,
  resourcesFound: S.resourcesFound, resourcesDecoded: S.resourcesDecoded, resourcesFailed: S.resourcesFailed, resourcesUnsupported: S.resourcesUnsupported, recognized: S.recognized, converted: S.converted, unsupported: S.unsupported,
  heroes: S.heroes, mobs: S.mobs, mobsWithSprite: S.mobsWithSprite, items: S.items, itemsWithImage: S.itemsWithImage, rooms: S.rooms, features: S.features, errors: S.errors, warnings: S.warnings, mismatch: conv ? conv.mismatch : null, durationMs: r.durationMs, runtime: r.runtime && { ok: r.runtime.ok, missing: r.runtime.missing.length } }; };

for (const key of Object.keys(REPOS)) {
  test(`${REPOS[key]}: 루트 · 모듈 · 소스 · 리소스 · 지원 범위가 채워짐 (오류 없이)`, () => {
    const r = need(key);
    assert.strictEqual(path.resolve(r.root), path.join(GAME, REPOS[key]));
    assert.strictEqual(r.source.gameModule, ':core'); assert.strictEqual(r.source.pkg, 'com.shatteredpixel.shatteredpixeldungeon');
    assert.ok(r.modules.some(m => m.name === ':SPD-classes') && r.modules.some(m => m.name === ':desktop'));
    assert.deepStrictEqual(r.errors, [], '분석 오류 없음');
    assert.ok(r.summary.sourceFound > 1000 && r.summary.sourceOk >= r.summary.sourceFound - 2, '소스 거의 모두 구조 분석');
    assert.ok(r.summary.resourcesDecoded >= r.summary.resourcesFound * 0.9, '리소스 90% 이상 디코딩');
    { const im = (r.byType || r.resources.byType).image; assert.ok(im.exts.png > 100 && im.decoded === im.exts.png, `PNG 모두 끝까지 디코딩 (${im.decoded}/${im.exts.png})`); }
    assert.strictEqual(r.support.length >= 12, true);
    metrics(key, r);
    return `소스 ${r.summary.sourceOk}/${r.summary.sourceFound} · 리소스 ${r.summary.resourcesDecoded}/${r.summary.resourcesFound} · 객체 ${r.summary.recognized} · ${r.durationMs}ms`;
  });

  test(`${REPOS[key]}: 편집기 변환 — 리소스 목록 · 새 프로젝트에 맞추기 · 원본 값과 비교 · 다시 맞춰도 중복 없음 · 저장해도 원본 정보 유지 · 원본 파일 그대로`, async () => {
    const r = need(key), before = A.analyze(path.join(GAME, REPOS[key])).fingerprint;
    const ctx = await editorScan(key, true), P = ctx.PDM, sc = P.GAME_SCAN;
    assert.ok(sc && sc.analysis && sc.analysis.summary.recognized === r.summary.recognized, '편집기가 같은 분석 결과를 씀');
    const dir = path.join(tmp(), 'proj'); fs.mkdirSync(dir); await P.store.createNew(dir, 'compat');
    const s1 = await P.gameSyncVanilla(false, { remove: 'untouched' }), s2 = await P.gameSyncVanilla(false, { remove: 'untouched' });   // 새 프로젝트 흐름 (app.js newProject 와 같음)
    assert.deepStrictEqual([s2.charsAdded, s2.charsRemoved, s2.heroesAdded, s2.heroesRemoved], [0, 0, 0, 0], '두 번째는 바뀌는 것 없음 (중복 없음)');
    const chars = P.store.all('char'), ids = chars.map(c => c.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'id 중복 없음');
    // 원본(분석기) ↔ 변환 결과(프로젝트 캐릭터) 비교: 클래스 · 이름 · 그림 시트 · 프레임 · 애니메이션 · 체력
    const byCls = new Map(r.objects.mobs.filter(m => m.convertible).map(m => [m.cls, m]));   // 같은 이름의 다른 클래스(예: 아이템 안의 몬스터)는 변환 대상이 아님
    let mismatch = 0, checked = 0; const bad = [];
    for (const c of chars.filter(c => c.origin)) {
      const m = byCls.get(c.game); checked++;
      const exp = { game: m && m.cls, sheet: m && m.spriteOk ? 'game:' + m.sprite.sheet : c.sprite.sheet, frame: m && m.spriteOk ? m.sprite.frame : c.sprite.frame, idle: m && m.spriteOk ? m.sprite.anims.idle.frames : c.sprite.anims.idle.frames, hp: m && m.stats.hp != null ? m.stats.hp : c.stats.hp, file: m && m.file };
      const got = { game: c.game, sheet: c.sprite.sheet, frame: c.sprite.frame, idle: c.sprite.anims.idle.frames, hp: c.stats.hp, file: c.origin.file };
      if (JSON.stringify(exp) !== JSON.stringify(got)) { mismatch++; bad.push(c.id + ' ' + JSON.stringify({ exp, got })); }
    }
    assert.strictEqual(mismatch, 0, bad.slice(0, 3).join('\n'));
    // 영웅: 게임이 실제로 쓰는 시트
    for (const hr of P.store.all('hero').filter(x => x.baseClass)) { const x = r.objects.heroes.find(q => q.cls === hr.baseClass); assert.ok(x, hr.baseClass); assert.strictEqual(hr.sprite.sheet, 'game:' + x.sheet, hr.id); }
    // 저장 → 다시 열기 → 고치기 → 저장: 원본 위치(origin) 와 모르는 필드가 남음
    const one = chars.find(c => c.origin); P.store.edit('char:' + one.id, '테스트: 모르는 필드', o => { o.x_unknown = { keep: [1, 2] }; });
    await P.store.save();
    const ctx2 = env.load(); await ctx2.PDM.store.load(dir);
    ctx2.PDM.store.edit('char:' + one.id, '이름 고침', o => { o.name = o.name + '!'; }); await ctx2.PDM.store.save();
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'characters', one.id + '.json'), 'utf8'));
    assert.deepStrictEqual(disk.origin, J(one.origin)); assert.deepStrictEqual(disk.x_unknown, { keep: [1, 2] }, '편집기가 모르는 필드도 저장 후 유지');
    assert.strictEqual(A.analyze(path.join(GAME, REPOS[key])).fingerprint, before, '분석 · 변환 중 원본 저장소 파일이 바뀌지 않음');
    metrics(key, r, { mismatch });
    return `캐릭터 +${s1.charsAdded} −${s1.charsRemoved} · 영웅 +${s1.heroesAdded} −${s1.heroesRemoved} · 원본 위치 기록 ${checked} · 불일치 ${mismatch}`;
  });
}
const J = x => JSON.parse(JSON.stringify(x));

test('기준 저장소 회귀: 분석기가 있어도 아이템 · 방 목록은 예전과 같고, 새 몬스터는 예전 것을 모두 포함 (+ 부모에게서 그림을 이어받는 금고 몬스터)', async () => {
  need('base');
  const a = await editorScan('base', false), b = await editorScan('base', true);
  const A1 = a.PDM.GAME_SCAN, B1 = b.PDM.GAME_SCAN;
  assert.deepStrictEqual([A1.items.total, A1.items.added.length, A1.items.removed.length, A1.rooms.total], [282, 0, 0, 172], '기준 저장소 아이템 282 · 방 172 (7 · 8차 기록과 같음)');
  assert.deepStrictEqual([B1.items.total, B1.rooms.total], [A1.items.total, A1.rooms.total]);
  assert.deepStrictEqual(J(a.PDM.SPD_ITEM_SPRITES.vanilla), J(b.PDM.SPD_ITEM_SPRITES.vanilla), '아이템 그림 번호표 같음');
  const old = J(A1.newMobs.map(m => m.cls)), now = J(B1.newMobs.map(m => m.cls));
  assert.deepStrictEqual(old.filter(x => !now.includes(x)), [], '예전에 찾던 몬스터를 잃지 않음');
  assert.deepStrictEqual(now.filter(x => !old.includes(x)).sort(), ['quest.vault.VaultGhoul', 'quest.vault.VaultGolem', 'quest.vault.VaultRat']);
  assert.deepStrictEqual(J(A1.heroes.map(x => x.cls + ':' + x.sheet)), J(B1.heroes.map(x => x.cls + ':' + x.sheet)));
  assert.ok(A1.heroes.every(x => x.sheet === 'sprites/' + x.cls.toLowerCase() + '.png'), '기준 저장소 영웅 시트 = 예전 규칙');
  const r = need('base'); assert.deepStrictEqual(r.features, [], '기준 저장소에는 구조 차이 없음'); assert.ok(r.runtime.ok && r.runtime.missing.length === 0, '런타임 연결 줄 모두'); assert.deepStrictEqual(r.runtime.classCheck.missing, [], '런타임이 쓰는 게임 클래스 모두 있음'); assert.ok(r.runtime.classCheck.refs > 100);
  // 편집기 아이템 칸 계산: 기준 시트(256px) → 16px · 16칸 (예전과 같음)
  const g = b.PDM.assets.itemGrid({ width: 256 }); assert.deepStrictEqual([g.cell, g.stride], [16, 16]);
  return `아이템 ${A1.items.total} · 방 ${A1.rooms.total} · 새 몬스터 ${old.length} → ${now.length}`;
});

test('ARK_PD-main: 인식하지 못하던 원인 → 수정 확인 (아이템 시트 32px×32칸 · 영웅 시트 · MobRotation · 한 문장 include · 런타임이 쓰는 클래스 없음)', async () => {
  const r = need('ark'), ids = r.features.map(f => f.id);
  for (const f of ['item-sheet-geometry', 'hero-sheet-switch', 'mob-rotation-class', 'settings-single-include', 'hero-frame']) assert.ok(ids.includes(f), f);
  assert.deepStrictEqual([r.itemSheet.cell, r.itemSheet.cols, r.itemSheet.imageSize[0]], [32, 32, 1024]);
  // 그림 번호 → 칸 위치가 맞는지: 실제 items.png 픽셀로 확인 (분석기 격자 vs 예전 추정 격자)
  const img = readPng(path.join(GAME, REPOS.ark, 'core/src/main/assets', r.itemSheet.image));
  const sample = r.objects.items.filter(i => i.convertible && i.index !== undefined && i.index > 0).slice(0, 120);
  const okNew = sample.filter(i => cellHasPixels(img, (i.index % 32) * 32, Math.floor(i.index / 32) * 32, 32, 32) > 0).length;
  const okOld = sample.filter(i => cellHasPixels(img, (i.index % 16) * 64, Math.floor(i.index / 16) * 64, 64, 64) > 0 && i.index % 16 === i.index % 32).length;   // 예전: 그림 너비 ÷ 16 = 64px 칸
  assert.ok(okNew >= sample.length * 0.95, `새 격자로 그림이 있는 칸 ${okNew}/${sample.length}`);
  const ctx = await editorScan('ark', true), P = ctx.PDM;
  const g = P.assets.itemGrid({ width: 1024 }); assert.deepStrictEqual([g.cell, g.stride], [32, 32], '편집기 아이템 칸 = 32px · 32칸');
  const sword = r.objects.items.find(i => i.convertible && i.index !== undefined && i.inSheet);
  assert.strictEqual(P.assets.itemIndex({ sheet: 'builtin:items', name: sword.image }, { width: 1024 }), sword.index, '편집기 그림 번호 = 분석기');
  assert.strictEqual(P.GAME_SCAN.heroes.find(x => x.cls === 'WARRIOR').sheet, 'sprites/blaze.png');
  assert.ok(readPng(path.join(GAME, REPOS.ark, 'core/src/main/assets/sprites/blaze.png')).w % 36 === 0, 'blaze.png 너비가 36px 프레임의 배수');
  assert.strictEqual(P.GAME_SCAN.mobRotation, 'actors/mobs/MobRotation.java');
  const nm = P.GAME_SCAN.newMobs.map(m => m.cls);
  assert.ok(nm.includes('AirborneSoldier') && P.GAME_SCAN.newMobs.find(m => m.cls === 'AirborneSoldier').sprite, 'AirborneSoldier (spriteClass = AirborneSprite .class) 그림 연결');
  const te = P.GAME_SCAN.newMobs.find(m => m.cls === 'miniboss.TheEndspeaker'); assert.ok(te && !te.sprite && /코드로 고름/.test(te.spriteProblem), '그림을 코드로 고르는 TheEndspeaker 도 목록에 남음 (임시 그림 + 이유)');
  const rot = await P.gameRotation(3); assert.ok(rot && rot.list.length > 0 && rot.file === 'actors/mobs/MobRotation.java', '맵 편집기 "몬스터 스폰" 이 MobRotation 을 읽음');
  assert.ok(P.GAME_SCAN.newMobs.filter(m => m.sprite).length >= 100, '새 몬스터 그림 연결');
  assert.ok(r.runtime.ok && r.runtime.missing.length > 0, '런타임: 설치는 되지만 연결 줄 일부 누락 (보고서에 표시)');
  const miss = r.runtime.classCheck.missing.map(m => m.cls);
  assert.ok(miss.includes('actors.mobs.MobSpawner'), '런타임이 쓰는 MobSpawner 가 ARK 에 없음 → 컴파일 안 됨을 알려 줌: ' + miss.join(', '));
  assert.strictEqual(r.support[0].stages.runtime.s, 'no', '지원 범위: 게임 런타임 = 미지원 (설치 가능으로 보이지 않음)');
  return `그림 있는 칸: 새 격자 ${okNew}/${sample.length} · 예전 추정 격자 ${okOld}/${sample.length} · 몬스터 목록 ${rot.list.length}종 (깊이 3)`;
});

test('New-Blue-Archive-Pixel-Dungeon-main: 인식하지 못하던 원인 → 수정 확인 (new_messages 겹침 · 감춘 직업 · 병합 충돌 파일 · 그림 원본 파일)', async () => {
  const r = need('ba');
  assert.ok(r.features.some(f => f.id === 'messages-overlay') && JSON.stringify(r.messages.roots) === '["messages","new_messages"]');
  const aris = r.objects.heroes.find(x => x.cls === 'ARIS'); assert.ok(aris && aris.name && aris.sheetFound, JSON.stringify(aris));
  assert.strictEqual(r.objects.heroes.filter(x => x.hidden).length, 6, '원작 6직업은 영웅 선택 화면에서 감춤');
  const ios = r.source.java.problems.list.find(p => /IOSPlatformSupport\.java$/.test(p.file)); assert.ok(ios && /병합 충돌/.test(ios.reason), '병합 충돌이 남은 iOS 파일을 알려 줌');
  assert.ok(r.resources.unsupported.list.filter(u => /\.aseprite$/.test(u.file)).length >= 20, 'aseprite 원본 = 미지원(경로 보존)');
  const ctx = await editorScan('ba', true), P = ctx.PDM;
  assert.strictEqual(P.GAME_SCAN.heroes.find(x => x.cls === 'ARIS').name, aris.name, '편집기와 분석기가 같은 이름 (new_messages)');
  return `영웅 ${r.objects.heroes.length} (감춤 6) · 글자 폴더 ${r.messages.roots.join(' + ')}`;
});

// ---------------------------------------------------------------- 실행
(async () => {
  let pass = 0, fail = 0; const lines = [];
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    const t0 = Date.now();
    try { const r = await t.fn(); pass++; lines.push(`✓ ${t.name} (${Date.now() - t0}ms)${r ? '\n    ' + r : ''}`); }
    catch (e) { fail++; lines.push(`✗ ${t.name}\n    ${String(e && e.message || e).split('\n').slice(0, 8).join('\n    ')}`); }
  }
  console.log(lines.join('\n'));
  const M = results.metrics, keys = Object.keys(M);
  if (keys.length) {
    const row = (label, f) => `| ${label} | ${keys.map(k => f(M[k])).join(' | ')} |`;
    console.log('\n| 측정 항목 | ' + keys.map(k => M[k].name).join(' | ') + ' |\n|---|' + keys.map(() => '---:').join('|') + '|');
    [['발견한 소스 파일 수', m => m.sourceFound], ['분석 성공 파일 수', m => m.sourceOk], ['부분 · 파싱 실패 파일 수', m => `${m.sourcePartial} · ${m.sourceFailed}`], ['발견한 리소스 수', m => m.resourcesFound], ['디코딩 성공 리소스 수', m => m.resourcesDecoded],
      ['디코딩 실패 · 미지원/무시', m => `${m.resourcesFailed} · ${m.resourcesUnsupported}`], ['인식한 게임 객체 수', m => m.recognized], ['변환된 객체 수', m => m.converted], ['미지원 항목 수', m => m.unsupported], ['원본과 변환 결과 불일치', m => m.mismatch == null ? '–' : m.mismatch]].forEach(([l, f]) => console.log(row(l, f)));
  }
  if (results.notRun.length) console.log('\n실행하지 못함:\n· ' + [...new Set(results.notRun)].join('\n· '));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(Object.assign({ pass, fail, at: new Date().toISOString(), game: GAME }, results), null, 1));
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  for (const d of tmpDirs) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* 무시 */ }
  process.exit(fail ? 1 : 0);
})();
