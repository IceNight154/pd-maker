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

  /** 테마 타일셋 이미지 */
  function themeTiles(theme) {
    const t = PDM.THEMES[theme];
    if (t) return load('game:' + t.tiles);
    const custom = ((PDM.store.get('world') || {}).customThemes || []).find(c => c.id === theme);
    return custom ? load(custom.tiles) : load('game:' + PDM.THEMES.SEWER.tiles);
  }

  /** 타일 하나 그리기 (평면 타일, 물·함정은 색으로) */
  function drawTerrain(g, tilesImg, terrainId, x, y, size, up) {
    if (up && terrainId === 7) terrainId = 8; else if (up && terrainId === 8) terrainId = 7;   // 탑 모드: 계단 그림 뒤바꿈
    const t = PDM.TERRAIN_BY_ID[terrainId];
    if (!t) { g.fillStyle = '#000'; g.fillRect(x, y, size, size); return; }
    if (t.key === 'WATER') {
      g.fillStyle = '#2d5f86'; g.fillRect(x, y, size, size);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + size * .15, y + size * .3, size * .5, Math.max(1, size * .08));
      return;
    }
    if (tilesImg && t.tile >= 0) {
      const sx = (t.tile % 16) * 16, sy = Math.floor(t.tile / 16) * 16;
      g.drawImage(tilesImg, sx, sy, 16, 16, x, y, size, size);
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
  function itemGrid(img) {
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

  return { resolvePath, gamePath, gameRel, scanOverrides, isOverridden, get overrides() { return overrides; }, folderFor, KIND_DIR, load, invalidate, clear, checkGameAssets, themeTiles, drawTerrain, drawItemSprite, drawFrame, itemGrid, itemIndex, itemSpriteName };
})();
