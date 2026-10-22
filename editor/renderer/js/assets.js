// ================================================================
//  에셋 — 게임 저장소의 스프라이트/타일 + 프로젝트 assets 폴더 이미지를 불러와 그립니다.
//  경로 규칙:
//    'builtin:items'           → 게임 sprites/items.png
//    'game:sprites/rat.png'    → 게임 assets 폴더 기준
//    'assets/sprites/x.png'    → 프로젝트 폴더 기준
//  게임 그림 바꾸기: 프로젝트에 assets/game/<게임 경로> 가 있으면 game:/builtin: 은 그 파일을 씀
//    (게임 런타임 MakerAssets 와 같은 규칙) — 원본은 resolvePath(ref, true) 또는 gamePath(rel)
// ================================================================
PDM.assets = (function () {
  const cache = new Map();     // 절대경로 → Promise<Image|null>
  const BUILTIN = { items: 'sprites/items.png', item_icons: 'sprites/item_icons.png', avatars: 'sprites/avatars.png', icons: 'interfaces/icons.png' };

  let overrides = new Set();   // 프로젝트 assets/game 아래에 있는 게임 경로 (interfaces/title0.png …)
  /** game:/builtin: → 게임 assets 기준 경로 (sprites/items.png) */
  function gameRel(ref) {
    if (ref.startsWith('builtin:')) return BUILTIN[ref.slice(8)] || ref.slice(8);
    if (ref.startsWith('game:')) return ref.slice(5);
    return null;
  }
  function gamePath(rel) { const g = PDM.store.gameAssetsDir(); return g ? pdm.join(g, rel) : null; }
  /** original=true 면 프로젝트의 바꾼 그림을 무시하고 게임 원본 */
  function resolvePath(ref, original) {
    if (!ref) return null;
    const store = PDM.store;
    const gr = gameRel(ref);
    if (gr != null) {
      if (!original && overrides.has(gr)) return store.abs('assets/game/' + gr);
      return gamePath(gr);
    }
    return store.abs(ref);
  }
  /** 프로젝트 assets/game 을 훑어 바꾼 게임 그림 목록을 만듦 (프로젝트 열 때 · 바꾼 뒤) */
  async function scanOverrides() {
    const out = new Set();
    const walk = async (abs, pre) => {
      let l = []; try { l = await pdm.list(abs); } catch (_) { return; }
      for (const e of l) {
        if (e.dir) await walk(pdm.join(abs, e.name), pre + e.name + '/');
        else if (/\.png$/i.test(e.name)) out.add(pre + e.name);
      }
    };
    if (PDM.store.isOpen) await walk(PDM.store.abs('assets/game'), '');
    overrides = out; cache.clear();
    return out;
  }
  const isOverridden = gr => overrides.has(gr);

  /** 그림을 둘 표준 폴더 (assets/ 아래) — 리소스 키와 용도로 정함 */
  const KIND_DIR = { npc: 'npc', companion: 'companion', mob: 'monster', boss: 'boss' };
  function folderFor(key, what) {
    const [t, id] = String(key || '').split(':');
    const o = (PDM.store.get(key) || {});
    if (what === 'portrait') return `portraits/${id || 'common'}`;
    if (t === 'hero') return 'sprites/heroes';
    if (t === 'char') return `sprites/characters/${KIND_DIR[o.kind] || 'npc'}`;
    if (t === 'item') return 'sprites/items';
    if (t === 'title') return 'title';
    if (t === 'world' || t === 'node') return 'tiles';
    if (t === 'event' || t === 'story') return 'illustrations';
    return 'images';
  }
  function load(ref) {
    const p = resolvePath(ref);
    if (!p) return Promise.resolve(null);
    if (!cache.has(p)) {
      cache.set(p, pdm.readDataURL(p).then(url => new Promise(res => {
        const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = url;
      })).catch(() => null));
    }
    return cache.get(p);
  }
  function invalidate(ref) { const p = resolvePath(ref); if (p) cache.delete(p); }
  function clear() { cache.clear(); }

  /** 게임 assets 폴더가 제대로 연결됐는지 */
  async function checkGameAssets() {
    const g = PDM.store.gameAssetsDir();
    if (!g) return { ok: false, reason: 'project.json 에 gameRepo 가 없습니다' };
    const ok = await pdm.exists(pdm.join(g, 'environment', 'tiles_sewers.png'));
    return ok ? { ok: true, dir: g } : { ok: false, reason: '게임 에셋을 찾지 못했습니다: ' + g };
  }

  /** 분리된(투명 배경) 타일셋 → 밑그림을 합친 사본 (런타임 MakerTileUnderlay 와 같은 규칙: 지금 타일셋에서 투명하고 원작에서는 불투명한 픽셀에만 under 칸을 아래에 깜).
   *  원작과 같은 타일셋이면 그대로 img. 대응표가 바뀌면 다시 구움 */
  const underCache = new WeakMap();
  function withUnderlay(img) {
    if (!img || !img.width || !PDM.tileLegacy || !(PDM.extensions && PDM.extensions.on('tilecombos'))) return img;   // 확장 기능 "조합 타일 · 분리 타일셋 밑그림" 꺼짐 = 게임처럼 그대로
    const tbl = PDM.tileLegacy(), key = JSON.stringify([...tbl]);
    const hit = underCache.get(img); if (hit && hit.key === key) return hit.out;
    const W = img.width, H = img.height, n = Math.max(1, Math.round(W / 16));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    let id; try { id = g.getImageData(0, 0, W, H); } catch (_) { return img; }
    const d = id.data, src = new Uint8ClampedArray(d); let changed = false;
    const over = (o, p) => { const a = src[p + 3] / 255; if (!a) return; const oa = o[3] + a * (1 - o[3]); for (let k = 0; k < 3; k++) o[k] = (src[p + k] * a + o[k] * o[3] * (1 - a)) / oa; o[3] = oa; };
    for (const [v, under] of tbl) {
      if (v < 0 || v > 255 || !under || !under.length) continue;
      const x0 = (v % 16) * n, y0 = Math.floor(v / 16) * n, hole = PDM.TILE_HOLES[v];
      if (x0 + n > W || y0 + n > H) continue;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const p = ((y0 + y) * W + x0 + x) * 4;
        if (src[p + 3] === 255) continue;
        if (hole && (hole[Math.floor(y * 16 / n)] >> Math.floor(x * 16 / n) & 1)) continue;
        const o = [0, 0, 0, 0];
        under.forEach(u => { if (u >= 0 && u < 256) over(o, ((Math.floor(u / 16) * n + y) * W + (u % 16) * n + x) * 4); });
        if (!o[3]) continue;
        over(o, p);
        d[p] = o[0]; d[p + 1] = o[1]; d[p + 2] = o[2]; d[p + 3] = Math.round(o[3] * 255); changed = true;
      }
    }
    let out = img;
    if (changed) { g.putImageData(id, 0, 0); out = cv; }
    underCache.set(img, { key, out });
    return out;
  }

  /** 테마 타일셋 이미지 (분리된 타일셋은 밑그림을 합친 모습 — 게임 화면과 같게). raw = 타일셋 파일 그대로 (조합 타일의 스프라이트 고르기) */
  function themeTiles(theme, raw) {
    const t = PDM.THEMES[theme];
    const custom = !t && ((PDM.store.get('world') || {}).customThemes || []).find(c => c.id === theme);
    const baseTiles = 'game:' + PDM.THEMES[(custom && PDM.THEMES[custom.base]) ? custom.base : 'SEWER'].tiles;
    const p = t ? load('game:' + t.tiles) : custom && custom.tiles ? load(custom.tiles).then(i => i || load(baseTiles)) : load(baseTiles);
    // 물 그림도 함께 불러와 타일셋 그림에 묶어 둠 → drawTerrain 이 물 칸을 실제 물 그림으로 (사용자 테마의 물 · 바꾼 게임 물 포함)
    // 사용자 테마는 바탕 테마와 같은 타일셋 그림을 쓸 수 있어서, 물이 섞이지 않게 사본(캔버스)에 묶음
    return p.then(img => {
      if (!img) return img;
      let out = raw ? img : withUnderlay(img);
      if (custom) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(out, 0, 0); out = c; }
      return themeWater(theme).then(w => { if (w) waterOf.set(out, w); return out; }, () => out);
    });
  }
  const waterOf = new WeakMap();
  /** 테마의 물 그림 (사용자 테마: water 가 있으면 그것, 없으면 바탕 테마 물) */
  function themeWater(theme) {
    const t = PDM.THEMES[theme];
    if (t) return load('game:' + t.water).catch(() => null);
    const custom = ((PDM.store.get('world') || {}).customThemes || []).find(c => c.id === theme);
    if (custom && custom.water) return load(custom.water).catch(() => null);
    return load('game:' + PDM.THEMES[(custom && custom.base) || 'SEWER'].water).catch(() => null);
  }

  /** 타일 하나 그리기 (평면 타일, 물·함정은 색으로) */
  function drawTerrain(g, tilesImg, terrainId, x, y, size, up) {
    if (up && terrainId === 7) terrainId = 8; else if (up && terrainId === 8) terrainId = 7;   // 탑 모드: 계단 그림 뒤바꿈
    const t = PDM.TERRAIN_BY_ID[terrainId];
    if (!t) { g.fillStyle = terrainId < 0 ? '#1b1922' : '#000'; g.fillRect(x, y, size, size); return; }
    if (t.key === 'WATER') {
      const w = tilesImg && waterOf.get(tilesImg);
      if (w && w.width) {   // 물 그림을 칸 위치에 맞춰 이어 붙임 (게임처럼 끊김 없이)
        const cx = Math.round(x / size), cy = Math.round(y / size), sx = (cx * 16) % w.width, sy = (cy * 16) % w.height;
        g.drawImage(w, sx, sy, Math.min(16, w.width - sx), Math.min(16, w.height - sy), x, y, size, size); return;
      }
      g.fillStyle = '#2d5f86'; g.fillRect(x, y, size, size);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + size * .15, y + size * .3, size * .5, Math.max(1, size * .08));
      return;
    }
    if (tilesImg && t.tile >= 0) {
      const c = Math.max(1, Math.round(tilesImg.width / 16));   // 타일셋 한 칸 px (기본 16 · 큰 타일셋은 32 · 48 …)
      const sx = (t.tile % 16) * c, sy = Math.floor(t.tile / 16) * c;
      g.drawImage(tilesImg, sx, sy, c, c, x, y, size, size);
    } else { g.fillStyle = t.color; g.fillRect(x, y, size, size); }
    if (t.mark) {
      g.fillStyle = t.key.includes('TRAP') ? 'rgba(170,40,110,.55)' : 'rgba(0,0,0,.35)';
      g.fillRect(x, y, size, size);
      g.fillStyle = '#fff'; g.font = `bold ${Math.max(8, size * .6)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t.mark, x + size / 2, y + size / 2 + 1);
    }
  }

  /** 아이템 스프라이트 (items.png 16x16 격자 번호, 또는 PNG 한 장) */
  /** items.png 칸 배치: 원작은 16px·한 줄 16칸, mod-2 는 32px(scale 2)·번호가 한 줄 32씩 (앞 16칸만 씀) */
  //  9차: 게임 저장소의 ItemSpriteSheet(SIZE · WIDTH)를 읽었으면 그 격자 — ARK 계열은 32px × 한 줄 32칸 (그림 너비 ÷ 16 으로 추정하면 64px 로 어긋남)
  function itemGrid(img) {
    const g = PDM.GAME_SCAN && PDM.GAME_SCAN.itemSheet;
    if (g && img && g.cols > 0 && img.width % g.cols === 0) {
      const cell = img.width / g.cols;   // 프로젝트에서 배율을 키운 복사본이면 칸도 같은 비율로
      if (cell >= g.cell && Number.isInteger(cell / g.cell)) return { cell, stride: g.cols, cols: g.cols, mod2: false, geo: true, base: g.cell };
    }
    const cell = Math.max(16, Math.round((img ? img.width : 256) / 16));
    return { cell, stride: 16 * (cell / 16), cols: 16, mod2: cell > 16 };
  }
  /** 아이템 그림 번호: sprite.name(ItemSpriteSheet 상수)이 있으면 지금 게임 시트 기준 번호로 */
  function itemIndex(sprite, img) {
    if (sprite && sprite.name && PDM.SPD_ITEM_SPRITES) {
      const t = PDM.SPD_ITEM_SPRITES[itemGrid(img).mod2 ? 'mod2' : 'vanilla'];
      if (t && t[sprite.name] !== undefined) return t[sprite.name];
    }
    return (sprite && sprite.index) || 0;
  }
  /** 번호 → ItemSpriteSheet 상수 이름 (그 번호의 첫 이름) */
  function itemSpriteName(idx, img) {
    const t = PDM.SPD_ITEM_SPRITES && PDM.SPD_ITEM_SPRITES[itemGrid(img).mod2 ? 'mod2' : 'vanilla'];
    const hit = t && Object.entries(t).find(([k, v]) => v === idx);
    return hit ? hit[0] : '';
  }
  async function drawItemSprite(canvas, sprite, scale) {
    scale = scale || 2;
    const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
    canvas.width = 16 * scale; canvas.height = 16 * scale;
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!sprite) return;
    if (sprite.png) { const img = await load(sprite.png); if (img) g.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height); return; }
    const img = await load(sprite.sheet || 'builtin:items');
    if (!img) return;
    const G = (sprite.sheet || 'builtin:items') === 'builtin:items' ? itemGrid(img) : { cell: 16, stride: 16 };
    const i = itemIndex(sprite, img), sx = (i % G.stride) * G.cell, sy = Math.floor(i / G.stride) * G.cell;
    g.drawImage(img, sx, sy, G.cell, G.cell, 0, 0, canvas.width, canvas.height);
  }

  /** 캐릭터 스프라이트 시트의 n 번째 프레임 */
  function drawFrame(g, img, frameW, frameH, n, dx, dy, scale, flip) {
    if (!img) return;
    const cols = Math.max(1, Math.floor(img.width / frameW));
    const sx = (n % cols) * frameW, sy = Math.floor(n / cols) * frameH;
    g.save();
    if (flip) { g.translate(dx + frameW * scale, dy); g.scale(-1, 1); dx = 0; dy = 0; }
    g.drawImage(img, sx, sy, frameW, frameH, dx, dy, frameW * scale, frameH * scale);
    g.restore();
  }

  return { resolvePath, gamePath, gameRel, scanOverrides, isOverridden, get overrides() { return overrides; }, folderFor, KIND_DIR, load, invalidate, clear, checkGameAssets, themeTiles, themeWater, withUnderlay, drawTerrain, drawItemSprite, drawFrame, itemGrid, itemIndex, itemSpriteName };
})();
