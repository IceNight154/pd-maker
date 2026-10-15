/*
 * PDMaker — 사용자 타일: "맵 그림"에서 만든 타일(아무 그림의 한 칸)을 맵 그리기로 칠한 칸에 지형 위로 그림
 *   world.json  userTiles [{ id, name, image, x, y (칸 — size 단위), size (그림의 한 칸 px, 기본 16), terrain (-2 = 칠한 지형 그대로 · 지형 번호), over (캐릭터 위에 그림),
 *                            fx (effects.json id — 그 칸에서 계속 재생), gameFx (게임 효과: sink · torch · vein · smoke · greenflame · stream · alchemy · sacrificial · healing),
 *                            title · desc (살펴보기 창의 이름 · 설명 — 비우면 지형 그대로) }]
 *   flow (true) · flowX · flowY (px/초 — 물은 0, -5) = 그림 전체를 칸에 이어 붙여 물처럼 흐르게 (FlowTiles — 물 그림을 타일로 쓸 때)
 *   그림이 없는(image "") 타일 = 지형 + 효과만 (희생의 재단 · 연금술 솥 · 배수구처럼 "효과가 붙은 타일")
 *   노드 · 방 템플릿  layers.tiles { 레이어 id: [칸 → 타일 id] } (예전 layers.utile = base 레이어) — 레이어 정의 · 읽기는 MakerTileLayers.
 *   지형(판정)은 layers.terrain 그대로 (편집기가 타일의 terrain 으로 같이 칠함)
 *   층을 만들 때 MakerLevel.build · TemplateRoom.paintTemplate 이 MakerTileLayers.putCell → put(레이어, 칸, id) 로 모아 두고, LevelHooks.afterCreate 가 finish 로
 *   레이어 순서대로 (레이어 · 그림 · 칸 크기) 묶음마다 CustomTilemap 하나를 customTiles(below) 또는 customWalls(above · 타일의 over)에 넣음. 세이브에 칸 배치를 저장.
 *   테마의 물을 사용자 타일로 (world.customThemes[].waterTile · waterFxEvery): 물 그림은 LevelHooks.customWater 가 그 타일 그림으로,
 *   물 칸마다 그 타일의 효과 · 살펴보기 이름을 붙임(themeWater — id 뒤에 "#water", 효과를 건너뛰는 칸은 "#waterq": 그림 · 흐름은 안 씀 → 물가 모양 그대로)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Image;
import com.watabou.noosa.TextureFilm;
import com.watabou.noosa.Tilemap;
import com.watabou.utils.Bundle;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.WeakHashMap;

public class MakerUserTiles extends CustomTilemap {

	public String image = "";
	public int size = 16;
	public boolean over;
	public String layer = MakerTileLayers.BASE;
	/** 조합 타일 스프라이트 · 레이어 렌더링: 칸 안 오프셋(px) · 불투명도 · 더하기(발광) */
	public float ox, oy, alpha = 1f;
	public boolean add;
	public int[] cells = new int[0], frames = new int[0];
	public String[] ids = new String[0];

	// ------------------------------------------------------------ 타일 정의 · 층 만들 때 모으기

	/** finish 중인 층 (조합 스프라이트의 "이 층 타일셋") */
	static Level building;
	static JsonValue def(String id) {
		if (id != null && id.startsWith("combo:")) return MakerCombos.spriteDef(building, id);   // 조합 타일의 스프라이트
		JsonValue w = WorldGraph.world, l = w == null ? null : w.get("userTiles");
		if (l == null || id == null || id.isEmpty()) return null;
		int k = id.indexOf('#'); if (k >= 0) id = id.substring(0, k);
		for (JsonValue t : l) if (id.equals(t.getString("id", ""))) return t;
		return null;
	}
	/** 층마다 레이어 → (칸 → 타일 id) */
	private static final Map<Level, Map<String, LinkedHashMap<Integer, String>>> pending = new WeakHashMap<>();
	static LinkedHashMap<Integer, String> pend(Level l, String layer) { return pending.computeIfAbsent(l, k -> new HashMap<>()).computeIfAbsent(layer, k -> new LinkedHashMap<>()); }
	public static void put(Level l, String layer, int cell, String id) {
		if (l == null || id == null || id.isEmpty()) return;
		pend(l, layer == null || layer.isEmpty() ? MakerTileLayers.BASE : layer).put(cell, id);
	}
	/** 기본(base) 레이어에 (예전 호출) */
	public static void put(Level l, int cell, String id) { put(l, MakerTileLayers.BASE, cell, id); }
	/** 노드 · 방의 base 레이어 칸 i 의 타일 id (예전 호출 — 레이어는 MakerTileLayers.at) */
	public static String at(JsonValue data, int i) { return MakerTileLayers.at(data, MakerTileLayers.BASE, i); }
	static final String WATER = "#water", WATER_Q = "#waterq";
	/** 테마의 물 타일 (사용자 테마 waterTile) — 그 층의 물 칸마다 효과 · 이름 (finish 전에, 맵에 직접 칠한 칸은 그대로) */
	public static void themeWater(Level l, String themeId) {
		try {
			JsonValue c = themeId == null || !themeId.startsWith("custom:") ? null : LevelHooks.customTheme(themeId.substring(7));
			String id = c == null ? "" : c.getString("waterTile", "");
			JsonValue d = def(id);
			if (d == null) return;
			boolean any = !d.getString("fx", "").isEmpty() || !d.getString("gameFx", "").isEmpty() || !d.getString("title", "").isEmpty() || !d.getString("desc", "").isEmpty();
			if (!any) return;
			int every = Math.max(1, c.getInt("waterFxEvery", 1)), n = 0;
			LinkedHashMap<Integer, String> m = pend(l, MakerTileLayers.BASE);
			for (int i = 0; i < l.length(); i++) {
				if (l.map[i] != com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.WATER || m.containsKey(i)) continue;
				int x = i % l.width(), y = i / l.width();
				boolean fxHere = every <= 1 || ((x + 2 * y) % every == 0);   // 고르게 흩어 놓음
				m.put(i, id + (fxHere ? WATER : WATER_Q));
				n++;
			}
			if (n > 0) MakerRuntime.log("테마 물 타일 " + id + ": 물 " + n + "칸");
		} catch (Throwable t) { MakerRuntime.log("테마 물 타일 오류: " + t); }
	}

	/** 모은 칸을 (그림 · 크기 · 위/아래) 묶음마다 타일맵 하나로 */
	public static void finish(Level l) {
		Map<String, LinkedHashMap<Integer, String>> all = pending.remove(l);
		if (all == null || all.isEmpty()) return;
		building = l;
		try {
			for (CustomTilemap t : l.customTiles.toArray(new CustomTilemap[0])) if (t instanceof MakerUserTiles) l.customTiles.remove(t);
			for (CustomTilemap t : l.customWalls.toArray(new CustomTilemap[0])) if (t instanceof MakerUserTiles) l.customWalls.remove(t);
			Map<String, MakerUserTiles> groups = new LinkedHashMap<>();
			Map<String, FlowTiles> flows = new LinkedHashMap<>();
			for (CustomTilemap t : l.customTiles.toArray(new CustomTilemap[0])) if (t instanceof FlowTiles) l.customTiles.remove(t);
			Map<String, java.util.ArrayList<int[]>> lists = new HashMap<>();
			java.util.List<String> order = new java.util.ArrayList<>(all.keySet());
			order.sort((a, b) -> Integer.compare(MakerTileLayers.order(a), MakerTileLayers.order(b)));   // 레이어 순서대로 → 타일맵도 그 순서로 쌓임
			for (String layer : order) {
			boolean shown = MakerTileLayers.visible(layer), layerAbove = MakerTileLayers.above(layer);
			for (Map.Entry<Integer, String> e : all.get(layer).entrySet()) {
				JsonValue d = def(e.getValue());
				if (d == null) { MakerRuntime.warnOnce("없는 사용자 타일: " + e.getValue()); continue; }
				int cell = e.getKey();
				boolean water = e.getValue().contains(WATER), quiet = e.getValue().endsWith(WATER_Q);
				// 효과 (그림과 따로 — 그림이 없어도)
				if (!quiet && shown) {
					String fx = d.getString("fx", ""); if (!fx.isEmpty()) MakerEffect.place(l, fx, cell);
					String gf = d.getString("gameFx", ""); if (!gf.isEmpty()) { GameFx g = new GameFx(); g.kind = gf; g.pos(cell, l); l.customTiles.add(g); }
				}
				String img = water || !shown ? "" : d.getString("image", "");   // 테마 물: 그림은 물 그림으로 (칸에 덮지 않음) · 숨긴 레이어: 그림 없음 (이름 · 설명만)
				if (d.getBoolean("flow", false) && !img.isEmpty()) {   // 흐르는 그림: 따로 (이름 · 설명만 아래 타일맵에)
					String fk = img + "|" + d.getFloat("flowX", 0f) + "|" + d.getFloat("flowY", -5f);
					FlowTiles ft = flows.get(fk);
					if (ft == null) { ft = new FlowTiles(); ft.image = img; ft.vx = d.getFloat("flowX", 0f); ft.vy = d.getFloat("flowY", -5f); ft.setRect(0, 0, l.width(), l.height()); flows.put(fk, ft); }
					ft.cellList.add(cell);
					img = "";
				}
				int sz = Math.max(1, d.getInt("size", 16)); boolean ov = (layerAbove || d.getBoolean("over", false)) && !img.isEmpty();   // 레이어가 above 거나 타일 자체가 over
				int cols = 1;
				if (!img.isEmpty()) { Object tx = tex(img); if (tx == null) img = ""; else cols = Math.max(1, TextureCache.get(tx).width / sz); }
				if (img.isEmpty() && d.getString("title", "").isEmpty() && d.getString("desc", "").isEmpty()) continue;   // 그림도 이름도 없음 → 타일맵 필요 없음
				float[] rd = render(e.getValue(), layer);   // { ox, oy, alpha, add }
				String gk = layer + "|" + img + "|" + sz + "|" + ov + "|" + rd[0] + "|" + rd[1] + "|" + rd[2] + "|" + rd[3];
				MakerUserTiles g = groups.get(gk);
				if (g == null) { g = new MakerUserTiles(); g.image = img; g.size = sz; g.over = ov; g.layer = layer; g.ox = rd[0]; g.oy = rd[1]; g.alpha = rd[2]; g.add = rd[3] > 0; g.setRect(0, 0, l.width(), l.height()); groups.put(gk, g); lists.put(gk, new java.util.ArrayList<>()); }
				lists.get(gk).add(new int[]{ cell, img.isEmpty() ? -1 : d.getInt("x", 0) + d.getInt("y", 0) * cols });
				g.idList.add(e.getValue());
			}
			}
			for (Map.Entry<String, MakerUserTiles> e : groups.entrySet()) {   // LinkedHashMap — 레이어 순서대로 만든 묶음 순서
				MakerUserTiles g = e.getValue(); java.util.ArrayList<int[]> a = lists.get(e.getKey());
				g.cells = new int[a.size()]; g.frames = new int[a.size()]; g.ids = g.idList.toArray(new String[0]);
				for (int i = 0; i < a.size(); i++) { g.cells[i] = a.get(i)[0]; g.frames[i] = a.get(i)[1]; }
				(g.over ? l.customWalls : l.customTiles).add(g);
			}
			for (FlowTiles ft : flows.values()) { ft.cells = new int[ft.cellList.size()]; for (int i = 0; i < ft.cells.length; i++) ft.cells[i] = ft.cellList.get(i); MakerCompat.addFirst(l.customTiles, ft); }   // 맨 아래 (다른 타일 · 효과 밑 — 목록이 순서 없는 판에서는 그냥 넣음)
		} catch (Throwable t) { MakerRuntime.log("사용자 타일 오류: " + t); }
		finally { building = null; }
	}
	/** 그림 경로 → 텍스처: "tex:<TextureCache 키>"(이 층 타일셋) · game: · 프로젝트 파일 */
	static Object tex(String img) {
		if (img.startsWith("tex:")) { try { return TextureCache.get(img.substring(4)); } catch (Throwable t) { return null; } }
		return MakerRuntime.texture(img);
	}
	/** 칸 하나의 렌더링 설정: 조합 스프라이트의 ox · oy · alpha · blend + 레이어의 blend */
	static float[] render(String id, String layer) {
		float ox = 0, oy = 0, a = 1f, add = 0;
		try {
			if (id.startsWith("combo:")) {
				int h = id.indexOf('#');
				JsonValue c = MakerCombos.combo(id.substring(6, h)), sp = c == null ? null : c.get("sprites").get(Integer.parseInt(id.substring(h + 1)));
				if (sp != null) { ox = sp.getFloat("ox", 0); oy = sp.getFloat("oy", 0); a = sp.getFloat("alpha", 1f); if ("add".equals(sp.getString("blend", "normal"))) add = 1; }
			}
			if ("add".equals(MakerTileLayers.blend(layer))) add = 1;
		} catch (Throwable ignored) { }
		return new float[]{ ox, oy, Math.max(0f, Math.min(1f, a)), add };
	}

	transient java.util.ArrayList<String> idList = new java.util.ArrayList<>();

	// ------------------------------------------------------------ 그리기

	@Override public Tilemap create() {
		Object tx = image == null || image.isEmpty() ? null : tex(image);
		if (tx == null) { texture = MakerPaint.blank(); vis = super.create(); vis.map(new int[tileW * tileH], tileW); vis.visible = false; return vis; }
		texture = tx;
		if (vis != null && vis.alive) vis.killAndErase();
		final boolean glow = add;
		vis = new Tilemap(texture, new TextureFilm(texture, SIZE, SIZE)) {
			@Override protected com.watabou.noosa.NoosaScript script() { return com.watabou.noosa.NoosaScript.get(); }   // 빛을 받음 (CustomTilemap 과 같음)
			@Override public void draw() {   // 더하기(발광): 아래 그림에 밝기를 더함
				if (glow) com.watabou.glwrap.Blending.setLightMode();
				super.draw();
				if (glow) com.watabou.glwrap.Blending.setNormalMode();
			}
		};
		vis.x = tileX * SIZE + ox; vis.y = tileY * SIZE + oy;
		if (alpha < 1f) vis.alpha(alpha);
		try {   // 그림의 한 칸이 16 이 아니면 그 크기로 잘라 화면의 한 칸(16)에 맞춤 (큰 타일셋과 같은 방식)
			if (size != SIZE) { java.lang.reflect.Field f = Tilemap.class.getDeclaredField("tileset"); f.setAccessible(true); f.set(vis, new TextureFilm(tx, size, size)); }
		} catch (Throwable e) { MakerRuntime.log("사용자 타일 크기 적용 실패: " + e); }
		int[] data = new int[tileW * tileH];
		java.util.Arrays.fill(data, -1);
		for (int i = 0; i < cells.length; i++) if (cells[i] >= 0 && cells[i] < data.length) data[cells[i]] = frames[i];
		vis.map(data, tileW);
		return vis;
	}
	// 칸 정보 창(살펴보기): 타일에 이름 · 설명이 있으면 그것 (그림 = 이 타일 그림, 그림이 없으면 지형 그림), 없으면 지형 그대로
	JsonValue defAt(int tx, int ty) {
		int c = (tileY + ty) * tileW + tileX + tx;
		for (int i = 0; i < cells.length && i < ids.length; i++) if (cells[i] == c) return def(ids[i]);
		return null;
	}
	int frameAt(int tx, int ty) { int c = (tileY + ty) * tileW + tileX + tx; for (int i = 0; i < cells.length; i++) if (cells[i] == c) return frames[i]; return -1; }
	@Override public Image image(int tx, int ty) {
		JsonValue d = defAt(tx, ty);
		if (d == null || (d.getString("title", "").isEmpty() && d.getString("desc", "").isEmpty())) return null;
		if (frameAt(tx, ty) >= 0 && vis != null && vis.visible) { Image im = vis.image(tx, ty); if (im != null) return im; }
		try { int c = (tileY + ty) * tileW + tileX + tx; return com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTerrainTilemap.tile(c, com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.map[c]); } catch (Throwable e) { return null; }
	}
	@Override public String name(int tx, int ty) { JsonValue d = defAt(tx, ty); String t = d == null ? "" : d.getString("title", ""); return t.isEmpty() ? null : t; }
	@Override public String desc(int tx, int ty) { JsonValue d = defAt(tx, ty); String t = d == null ? "" : d.getString("desc", ""); return t.isEmpty() ? null : t; }

	// ------------------------------------------------------------ 흐르는 그림 (물 그림을 타일로 — 게임 물처럼 SkinnedBlock 을 칸마다, 세상 좌표에 맞춰 이음매 없이)
	public static class FlowTiles extends CustomTilemap {
		public String image = ""; public float vx, vy = -5f; public int[] cells = new int[0];
		transient java.util.ArrayList<Integer> cellList = new java.util.ArrayList<>();
		class Vis extends Tilemap {
			com.watabou.noosa.Group grp; java.util.ArrayList<com.watabou.noosa.SkinnedBlock> blocks = new java.util.ArrayList<>(); float t; boolean bad;
			Vis() { super(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, new TextureFilm(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, 16, 16)); }
			@Override public void draw() { }
			@Override public void update() {
				super.update();
				if (bad || parent == null) return;
				try {
					if (grp == null) {
						Object tx = MakerRuntime.texture(image); if (tx == null) { bad = true; return; }
						grp = new com.watabou.noosa.Group();
						Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level; int w = l.width();
						for (int c : cells) { com.watabou.noosa.SkinnedBlock b = new com.watabou.noosa.SkinnedBlock(16, 16, tx); b.x = (c % w) * 16; b.y = (c / w) * 16; blocks.add(b); grp.add(b); }
						parent.addToBack(grp);
					}
					if (!com.watabou.noosa.particles.Emitter.freezeEmitters) t += com.watabou.noosa.Game.elapsed;
					int w = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width();
					for (int i = 0; i < blocks.size() && i < cells.length; i++) {
						com.watabou.noosa.SkinnedBlock b = blocks.get(i);
						float tw = b.texture.width, th = b.texture.height;
						float ox = ((cells[i] % w) * 16 + vx * t) % tw, oy = ((cells[i] / w) * 16 + vy * t) % th;   // 게임 물과 같은 방향 (vy -5 = 게임 물)
						b.offsetTo(ox < 0 ? ox + tw : ox, oy < 0 ? oy + th : oy);
					}
				} catch (Throwable e) { bad = true; MakerRuntime.log("흐르는 타일 오류: " + e); }
			}
			@Override public void destroy() { if (grp != null) grp.killAndErase(); super.destroy(); }
		}
		@Override public Tilemap create() { vis = new Vis(); return vis; }
		@Override public Image image(int tx, int ty) { return null; }
		@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("pdm_img", image); b.put("pdm_vx", vx); b.put("pdm_vy", vy); b.put("pdm_cells", cells); }
		@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); image = b.getString("pdm_img"); vx = b.getFloat("pdm_vx"); vy = b.getFloat("pdm_vy"); cells = b.contains("pdm_cells") ? b.getIntArray("pdm_cells") : new int[0]; }
	}

	// ------------------------------------------------------------ 게임 효과 (지역 장식 · 연금술 솥 · 희생의 재단처럼 그 칸에서 계속)
	public static class GameFx extends CustomTilemap {
		public String kind = "";
		{ tileW = tileH = 1; }
		class Vis extends Tilemap {
			com.watabou.noosa.Gizmo fx; boolean bad;
			Vis() { super(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, new TextureFilm(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, 16, 16)); }
			@Override public void draw() { /* 그림 없음 — 효과만 */ }
			@Override public void update() {
				super.update();
				if (bad || fx != null && fx.parent != null) return;
				try {
					Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level; if (l == null) return;
					if (parent == null) return;
					fx = make(kind, tileX + tileY * l.width());
					if (fx == null) { bad = true; MakerRuntime.warnOnce("없는 게임 효과: " + kind); return; }
					parent.add(fx);   // 지형 층(지역 장식 효과와 같은 높이 — 캐릭터 아래)
				} catch (Throwable t) { bad = true; MakerRuntime.log("게임 효과 타일 오류: " + t); }
			}
			@Override public void destroy() { if (fx != null) fx.killAndErase(); super.destroy(); }
		}
		@Override public Tilemap create() { vis = new Vis(); vis.x = tileX * 16; vis.y = tileY * 16; return vis; }
		@Override public Image image(int tx, int ty) { return null; }
		@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("pdm_gfx", kind); }
		@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); kind = b.getString("pdm_gfx"); }
	}
	/** 영웅이 지금 보는 칸에서만 나오는 효과 */
	static class CellEmitter extends com.watabou.noosa.particles.Emitter {
		final int pos;
		CellEmitter(int pos) { this.pos = pos; com.watabou.utils.PointF p = com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTilemap.tileCenterToWorld(pos); pos(p.x - 5, p.y - 5, 10, 10); }
		@Override public void update() { Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level; if (visible = (l != null && l.heroFOV != null && pos < l.heroFOV.length && l.heroFOV[pos])) super.update(); }
	}
	/** 게임 지역이 그 지형 칸에 붙이는 장식 효과를 이 칸 하나에만 (지형 지도를 잠깐 바꿔 게임 함수를 그대로 부름) */
	interface Adder { void add(Level l, com.watabou.noosa.Group g); }
	static com.watabou.noosa.Gizmo only(Level l, int cell, int terrain, Adder a) {
		int[] old = l.map; int[] m = new int[old.length]; m[cell] = terrain;
		com.watabou.noosa.Group g = new com.watabou.noosa.Group();
		l.map = m;
		try { a.add(l, g); } finally { l.map = old; }
		return g;
	}
	static com.watabou.noosa.Gizmo make(String kind, int cell) {
		Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
		final int WD = com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.WALL_DECO;
		switch (kind) {
			case "sink":   return only(l, cell, WD, com.shatteredpixel.shatteredpixeldungeon.levels.SewerLevel::addSewerVisuals);      // 하수도 배수구 물방울
			case "vein":   return only(l, cell, WD, com.shatteredpixel.shatteredpixeldungeon.levels.CavesLevel::addCavesVisuals);      // 동굴 광맥 반짝임
			case "stream": return only(l, cell, com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.WATER, com.shatteredpixel.shatteredpixeldungeon.levels.HallsLevel::addHallsVisuals);   // 전당 물 김
			case "torch":  return new com.shatteredpixel.shatteredpixeldungeon.levels.PrisonLevel.Torch(cell);   // 감옥 횃불
			case "smoke":  return new com.shatteredpixel.shatteredpixeldungeon.levels.CityLevel.Smoke(cell);     // 도시 연기
			case "greenflame": { Object g = MakerCompat.make("com.shatteredpixel.shatteredpixeldungeon.levels.CityLevel$GreenFlame", cell); return g instanceof com.watabou.noosa.Gizmo ? (com.watabou.noosa.Gizmo) g : new com.shatteredpixel.shatteredpixeldungeon.levels.CityLevel.Smoke(cell); }   // GreenFlame 은 SPD 3.1 부터 — 없으면 연기   // 도시 초록 불꽃
			case "alchemy": { CellEmitter e = new CellEmitter(cell); e.start(com.shatteredpixel.shatteredpixeldungeon.effects.Speck.factory(com.shatteredpixel.shatteredpixeldungeon.effects.Speck.BUBBLE), 0.33f, 0); return e; }   // 연금술 솥 거품
			case "sacrificial": { CellEmitter e = new CellEmitter(cell); e.pour(com.shatteredpixel.shatteredpixeldungeon.effects.particles.SacrificialParticle.FACTORY, 0.04f); return e; }   // 희생의 불꽃
			case "healing": { CellEmitter e = new CellEmitter(cell); e.start(com.shatteredpixel.shatteredpixeldungeon.effects.Speck.factory(com.shatteredpixel.shatteredpixeldungeon.effects.Speck.HEALING), 0.5f, 0); return e; }   // 치유의 샘
			case "flame": { CellEmitter e = new CellEmitter(cell); e.pour(com.shatteredpixel.shatteredpixeldungeon.effects.particles.FlameParticle.FACTORY, 0.1f); return e; }   // 불꽃
			case "sparks": { CellEmitter e = new CellEmitter(cell); e.start(com.shatteredpixel.shatteredpixeldungeon.effects.particles.SparkParticle.STATIC, 0.6f, 0); return e; }   // 전기 불꽃
		}
		return null;
	}

	@Override public void storeInBundle(Bundle b) {
		super.storeInBundle(b);
		b.put("pdm_img", image); b.put("pdm_size", size); b.put("pdm_over", over); b.put("pdm_cells", cells); b.put("pdm_frames", frames); b.put("pdm_ids", ids); b.put("pdm_layer", layer); b.put("pdm_ox", ox); b.put("pdm_oy", oy); b.put("pdm_alpha", alpha); b.put("pdm_add", add);
	}
	@Override public void restoreFromBundle(Bundle b) {
		super.restoreFromBundle(b);
		image = b.getString("pdm_img"); size = b.contains("pdm_size") ? b.getInt("pdm_size") : 16; over = b.getBoolean("pdm_over");
		cells = b.contains("pdm_cells") ? b.getIntArray("pdm_cells") : new int[0]; frames = b.contains("pdm_frames") ? b.getIntArray("pdm_frames") : new int[0];
		ids = b.contains("pdm_ids") ? b.getStringArray("pdm_ids") : new String[0];
		layer = b.contains("pdm_layer") ? b.getString("pdm_layer") : MakerTileLayers.BASE;
		ox = b.getFloat("pdm_ox"); oy = b.getFloat("pdm_oy"); alpha = b.contains("pdm_alpha") ? b.getFloat("pdm_alpha") : 1f; add = b.getBoolean("pdm_add");
	}
}
