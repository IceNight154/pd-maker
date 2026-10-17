/*
 * PDMaker — 조합 타일 (maps/tilecombos.json list[] — 편집기 "조합 타일"): 여러 스프라이트 + 레이어 + 오프셋 + 광원 · 이펙트 · 오브젝트를 묶은 재사용 프리셋
 *   { id, name,
 *     sprites: [{ src: "tileset"(이 층 타일셋의 칸) | "image"(그림 파일), tile, image, x, y, size, layer, ox, oy (px, 한 칸 = 16), alpha, blend: normal | add(발광 스프라이트) }],
 *     light:   { on, color, k, z, range, ox, oy, pulse, pulseMin, shadow, charShadow }   — 게임 화면에 실제 빛 · 그림자 (MakerLights 점광원)
 *     effect:  effects.json id (그 칸에서 계속 재생)
 *     objects: [{ type: "trap" | "prop" | "plate" | "event" | …, ref, hidden, inactive, once }]   — 오브젝트 시스템(LevelHooks.placeObject)이 만들고 움직임
 *     terrain: -2 (지형 그대로) | 지형 번호 (놓을 때 그 칸 지형을 바꿈)
 *     autogen: { enabled, where: wallFace | wall | floor | floorNearWall | grass | water | terrain, terrains: [지형 번호], chance (%), max (0 = 제한 없음),
 *                spacing (칸), themes: [테마 — 비우면 모두], handmade (직접 그린 맵에도) } }
 *   놓기  ① 자동 생성: 층을 만든 직후(LevelHooks.afterCreate) 조건에 맞는 칸을 층 씨앗으로 섞어 확률 · 간격 · 최대 개수대로 (같은 층은 늘 같은 자리)
 *         배치 방식 tilecombos.json autogenVersion — 1(값 없음 · 예전 파일): 목록 순서대로 처리 · 씨앗에 목록 순번 포함 → 목록 순서를 바꾸면 배치가 바뀜 (예전 결과 그대로 보존)
 *                                                  2(새 파일 기본): 우선순위(autogen.priority 큰 것 먼저) → id 순으로 처리 · 씨앗은 id 만 → 목록 순서와 상관없음
 *         ② 맵에 직접: 오브젝트 { type: "combo", ref: 조합 id } (직접 그린 맵 · 방 템플릿 · 혼합 층)
 *   그림  스프라이트마다 MakerUserTiles 에 "combo:<id>#<번호>" 로 넣어 레이어 순서대로 그림 (세이브에는 그린 결과가 남음)
 *   참조  맵 · 자동 생성은 조합을 id 로 참조 — 조합을 고치면 다음에 만드는 층부터 반영, 이미 만든 층(세이브)은 그대로.
 *         지운 조합 · 끈 자동 생성은 새 층에 놓이지 않을 뿐 맵 데이터는 그대로 (편집기 검사가 없는 id 를 알려 줌)
 *   확장 기능 "tilecombos"(project.json extensions)가 꺼져 있으면 놓지도 자동 생성하지도 않음 (MakerRuntime.tileCombos)
 *   이 타일맵(보이지 않음)은 층에 놓인 조합 목록을 세이브에 저장 — 광원(MakerLights)이 여기서 점광원을 만듦.
 *   광원 설정은 놓을 때 그대로 복사해 둠(pdm_combo_lights) → 조합을 고치거나 지워도 이미 만든 층의 빛은 그대로 (그림 · 오프셋도 MakerUserTiles 에 구워져 있음).
 *   복사본이 없는 예전 세이브는 지금 조합 정의에서 찾음
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.badlogic.gdx.utils.JsonWriter;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.watabou.noosa.Image;
import com.watabou.noosa.TextureFilm;
import com.watabou.noosa.Tilemap;
import com.watabou.utils.Bundle;

import java.util.ArrayList;
import java.util.List;

public class MakerCombos extends CustomTilemap {

	public String[] ids = new String[0];
	public int[] cells = new int[0];
	/** 놓을 때의 광원 설정 JSON (ids 와 같은 순서, "" = 광원 없음 · null 배열 = 예전 세이브) */
	public String[] lights = new String[0];

	// ------------------------------------------------------------ 데이터

	static JsonValue list() {
		JsonValue c = MakerRuntime.tilecombos;
		if (c == null) return null;
		JsonValue l = c.get("list");
		return l != null ? l : c.get("combos");   // 예전 이름 combos
	}
	public static JsonValue combo(String id) {
		JsonValue l = list();
		if (l == null || id == null) return null;
		for (JsonValue c : l) if (id.equals(c.getString("id", ""))) return c;
		return null;
	}
	/** "combo:<id>#<n>" → 그 스프라이트를 사용자 타일 정의 모양으로 { image, x, y, size, over } (MakerUserTiles.def) */
	static JsonValue spriteDef(Level l, String key) {
		try {
			int h = key.indexOf('#');
			JsonValue c = combo(key.substring(6, h)), s = c == null || c.get("sprites") == null ? null : c.get("sprites").get(Integer.parseInt(key.substring(h + 1)));
			if (s == null) return null;
			JsonValue d = new JsonValue(JsonValue.ValueType.object);
			if ("image".equals(s.getString("src", "tileset"))) {
				d.addChild("image", new JsonValue(s.getString("image", "")));
				d.addChild("x", new JsonValue(s.getInt("x", 0))); d.addChild("y", new JsonValue(s.getInt("y", 0)));
				d.addChild("size", new JsonValue(s.getInt("size", 16)));
			} else {   // 이 층 타일셋의 칸 (테마를 따라감) — 텍스처 키로
				String tex = l != null ? l.tilesTex() : Dungeon.level.tilesTex();
				int tile = s.getInt("tile", 0), w = 256;
				try { w = com.watabou.gltextures.TextureCache.get(tex).width; } catch (Throwable ignored) { }
				d.addChild("image", new JsonValue("tex:" + tex));
				d.addChild("x", new JsonValue(tile % 16)); d.addChild("y", new JsonValue(tile / 16));
				d.addChild("size", new JsonValue(Math.max(1, w / 16)));
			}
			d.addChild("terrain", new JsonValue(-2));
			return d;
		} catch (Throwable t) { return null; }
	}

	// ------------------------------------------------------------ 놓기

	/** 층의 조합 목록 타일맵 (없으면 만듦) */
	static MakerCombos marks(Level l) {
		for (CustomTilemap t : l.customTiles) if (t instanceof MakerCombos) return (MakerCombos) t;
		MakerCombos m = new MakerCombos();
		m.setRect(0, 0, l.width(), l.height());
		l.customTiles.add(m);
		return m;
	}
	/** 조합 하나를 칸에 놓음 (그림은 MakerUserTiles.finish 가 그림 — 층 만들기 중에 부를 것) */
	public static boolean place(Level l, String id, int cell) {
		if (!MakerRuntime.tileCombos()) { MakerRuntime.warnOnce("조합 타일 확장 기능이 꺼져 있어 놓지 않음: " + id); return false; }
		JsonValue c = combo(id);
		if (c == null) { MakerRuntime.warnOnce("없는 조합 타일: " + id); return false; }
		if (cell < 0 || cell >= l.length()) return false;
		try {
			int ter = c.getInt("terrain", -2);
			if (ter >= 0) Level.set(cell, ter, l);
			JsonValue sp = c.get("sprites");
			if (sp != null) for (int i = 0; i < sp.size; i++) {
				JsonValue s = sp.get(i);
				MakerUserTiles.put(l, s.getString("layer", MakerTileLayers.BASE), cell, "combo:" + id + "#" + i);
			}
			String fx = c.getString("effect", "");
			if (!fx.isEmpty()) MakerEffect.place(l, fx, cell);
			JsonValue ob = c.get("objects");
			if (ob != null) for (JsonValue o : ob) LevelHooks.placeObject(l, o, cell);   // 함정 · 발판 · 맵 오브젝트 — 오브젝트 시스템이 만들고 동작
			MakerCombos m = marks(l);
			JsonValue lt = c.get("light");
			if (m.lights == null || m.lights.length != m.ids.length) m.lights = new String[m.ids.length];   // 예전 세이브에 이어 놓을 때 (복사본 없음 = null)
			m.ids = append(m.ids, id); m.cells = append(m.cells, cell);
			m.lights = append(m.lights, lt != null && lt.getBoolean("on", false) ? lt.toJson(JsonWriter.OutputType.json) : "");
			return true;
		} catch (Throwable t) { MakerRuntime.log("조합 타일 놓기 오류 " + id + ": " + t); return false; }
	}
	static String[] append(String[] a, String v) { String[] b = java.util.Arrays.copyOf(a, a.length + 1); b[a.length] = v; return b; }
	static int[] append(int[] a, int v) { int[] b = java.util.Arrays.copyOf(a, a.length + 1); b[a.length] = v; return b; }

	// ------------------------------------------------------------ 자동 생성

	/** 층을 만든 직후: 자동 생성에 등록한 조합을 조건에 맞는 칸에 (MakerUserTiles.finish 전에) */
	public static void autogen(Level l, String theme) {
		if (!MakerRuntime.tileCombos()) return;   // 확장 기능 꺼짐 = 예전 그대로
		try { autogen0(l, theme); } catch (Throwable t) { MakerRuntime.log("조합 타일 자동 생성 오류: " + t); }   // 프리셋 문제로 층 만들기가 멈추지 않게
	}
	static void autogen0(Level l, String theme) {
		JsonValue list = list();
		if (list == null || l == null) return;
		boolean handmade = l instanceof MakerLevel;
		int total = 0, idx = 0;
		JsonValue tc = MakerRuntime.tilecombos;
		boolean stable = tc != null && tc.getInt("autogenVersion", 1) >= 2;
		List<JsonValue> order = new ArrayList<>();
		for (JsonValue c : list) order.add(c);
		if (stable) order.sort((a, b) -> {   // 우선순위 큰 것 → id 순 (목록 순서와 상관없이 같은 차례)
			JsonValue ga = a.get("autogen"), gb = b.get("autogen");
			int pa = ga == null ? 0 : ga.getInt("priority", 0), pb = gb == null ? 0 : gb.getInt("priority", 0);
			return pa != pb ? Integer.compare(pb, pa) : a.getString("id", "").compareTo(b.getString("id", ""));
		});
		java.util.HashSet<Integer> used = new java.util.HashSet<>();
		MakerCombos existing = null;
		for (CustomTilemap t : l.customTiles) if (t instanceof MakerCombos) existing = (MakerCombos) t;
		if (existing != null) for (int c : existing.cells) used.add(c);
		for (JsonValue c : order) {
			idx++;   // 예전 방식(1)의 씨앗에 쓰는 목록 순번 — order 는 1 이면 목록 그대로
			JsonValue a = c.get("autogen");
			if (a == null || !a.getBoolean("enabled", false)) continue;
			if (handmade && !a.getBoolean("handmade", false)) continue;
			if (!themeOk(a.get("themes"), theme)) continue;
			List<Integer> cand = new ArrayList<>();
			for (int i = 0; i < l.length(); i++) if (!used.contains(i) && fits(l, i, a)) cand.add(i);
			java.util.Random rnd = new java.util.Random(Dungeon.seedCurDepth() * 31337L + c.getString("id", "").hashCode() * 7L + (stable ? 0 : idx));
			java.util.Collections.shuffle(cand, rnd);
			float chance = Math.max(0f, Math.min(100f, a.getFloat("chance", 10f))) / 100f, spacing = Math.max(0f, a.getFloat("spacing", 2f));
			int max = a.getInt("max", 0), n = 0, w = l.width();
			List<Integer> mine = new ArrayList<>();
			for (int cell : cand) {
				if (max > 0 && n >= max) break;
				if (rnd.nextFloat() >= chance) continue;
				boolean near = false;
				for (int o : mine) if (Math.max(Math.abs(o % w - cell % w), Math.abs(o / w - cell / w)) < spacing) { near = true; break; }
				if (near) continue;
				if (place(l, c.getString("id", ""), cell)) { mine.add(cell); used.add(cell); n++; }
			}
			total += n;
		}
		if (total > 0) MakerRuntime.log("조합 타일 자동 생성: " + total + "곳");
	}
	static boolean themeOk(JsonValue themes, String theme) {
		if (themes == null || themes.size == 0) return true;
		for (JsonValue t : themes) if (t.asString().equalsIgnoreCase(theme == null ? "" : theme)) return true;
		return false;
	}
	static boolean isWall(int t) { return t == Terrain.WALL || t == Terrain.WALL_DECO; }
	static boolean isFloor(int t) { return t == Terrain.EMPTY || t == Terrain.EMPTY_DECO || t == Terrain.EMPTY_SP || t == Terrain.GRASS || t == Terrain.EMBERS; }
	/** 놓을 수 있는 칸인지 — 벽 장식이 문 · 맵 가장자리 · 보이지 않는 벽에 붙지 않게, 바닥 장식이 계단 · 함정 · 물건 위에 오지 않게 */
	static boolean fits(Level l, int i, JsonValue a) {
		int w = l.width(), x = i % w, y = i / w, t = l.map[i];
		boolean edge = x == 0 || y == 0 || x == w - 1 || y == l.height() - 1;
		String where = a.getString("where", "wallFace");
		switch (where) {
			case "wallFace": {   // 아래가 바닥인 벽 = 화면에 앞면이 보이는 벽 (게임은 그 벽 칸에 앞면을 그림)
				if (!isWall(t) || y >= l.height() - 1 || x == 0 || x == w - 1) return false;
				int below = l.map[i + w];
				return (Terrain.flags[below] & Terrain.PASSABLE) != 0 && !isDoorish(below);
			}
			case "wall":   return isWall(t) && !edge && openNear(l, i);
			case "floor":  return isFloor(t) && free(l, i);
			case "floorNearWall": return isFloor(t) && free(l, i) && y > 0 && isWall(l.map[i - w]);
			case "grass":  return (t == Terrain.GRASS || t == Terrain.HIGH_GRASS || t == Terrain.FURROWED_GRASS) && free(l, i);
			case "water":  return t == Terrain.WATER;
			case "terrain": {
				JsonValue ts = a.get("terrains");
				if (ts == null) return false;
				for (JsonValue v : ts) if (v.asInt() == t) return !edge && (!((Terrain.flags[t] & Terrain.PASSABLE) != 0) || free(l, i));
				return false;
			}
		}
		return false;
	}
	static boolean isDoorish(int t) { return t == Terrain.DOOR || t == Terrain.OPEN_DOOR || t == Terrain.LOCKED_DOOR || t == Terrain.SECRET_DOOR || t == Terrain.CRYSTAL_DOOR; }
	static boolean openNear(Level l, int i) {
		for (int d : com.watabou.utils.PathFinder.NEIGHBOURS4) { int c = i + d; if (c >= 0 && c < l.length() && (Terrain.flags[l.map[c]] & Terrain.PASSABLE) != 0) return true; }
		return false;
	}
	/** 바닥 장식을 놓아도 되는 칸: 계단 · 함정 · 더미 · 식물이 없고 입구 · 출구가 아님 */
	static boolean free(Level l, int i) {
		if (l.traps.get(i) != null || l.plants.get(i) != null || l.heaps.get(i) != null) return false;
		int w = l.width(), x = i % w, y = i / w;   // 계단 칸 (Level.getTransition 은 Dungeon.level 을 써서 층 만들기 중엔 못 씀)
		for (com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition t : l.transitions)
			if (x >= t.left && x <= t.right && y >= t.top && y <= t.bottom) return false;
		return true;
	}

	// ------------------------------------------------------------ 광원 (MakerLights 가 부름)

	/** 이 층에 놓인 조합 중 광원이 켜진 것 → { 조합 광원 설정, 칸 } */
	public static List<Object[]> lights(Level l) {
		List<Object[]> out = new ArrayList<>();
		if (l == null || !MakerRuntime.tileCombos()) return out;
		for (CustomTilemap t : l.customTiles) if (t instanceof MakerCombos) {
			MakerCombos m = (MakerCombos) t;
			for (int i = 0; i < m.ids.length && i < m.cells.length; i++) {
				JsonValue lt = m.lightAt(i);
				if (lt != null && lt.getBoolean("on", false)) out.add(new Object[]{ lt, m.cells[i] });
			}
		}
		return out;
	}

	/** i 번째로 놓인 조합의 광원: 놓을 때 복사해 둔 설정 → 없으면(예전 세이브) 지금 조합 정의 */
	JsonValue lightAt(int i) {
		String s = lights != null && i < lights.length ? lights[i] : null;
		if (s != null) {
			if (s.isEmpty()) return null;
			try { return new JsonReader().parse(s); } catch (Throwable t) { MakerRuntime.warnOnce("조합 타일 광원 읽기 실패: " + ids[i]); return null; }
		}
		JsonValue c = combo(ids[i]);
		return c == null ? null : c.get("light");
	}

	// ------------------------------------------------------------ 보이지 않는 타일맵

	@Override public Tilemap create() {
		vis = new Tilemap(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, new TextureFilm(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, 16, 16)) {
			@Override public void draw() { }
		};
		vis.map(new int[1], 1);
		return vis;
	}
	@Override public Image image(int tx, int ty) { return null; }
	@Override public String name(int tx, int ty) { return null; }
	@Override public String desc(int tx, int ty) { return null; }
	@Override public void storeInBundle(Bundle b) {
		super.storeInBundle(b); b.put("pdm_combo_ids", ids); b.put("pdm_combo_cells", cells);
		if (lights != null && lights.length == ids.length) {   // 복사본이 없는 칸(예전 세이브에 이어 놓은 경우)은 저장하지 않음 → 다시 읽으면 지금 정의
			boolean all = true; for (String s : lights) if (s == null) { all = false; break; }
			if (all) b.put("pdm_combo_lights", lights);
		}
	}
	@Override public void restoreFromBundle(Bundle b) {
		super.restoreFromBundle(b);
		ids = b.contains("pdm_combo_ids") ? b.getStringArray("pdm_combo_ids") : new String[0];
		cells = b.contains("pdm_combo_cells") ? b.getIntArray("pdm_combo_cells") : new int[0];
		lights = b.contains("pdm_combo_lights") ? b.getStringArray("pdm_combo_lights") : null;   // 예전 세이브: 없음 → 지금 정의에서 찾음
	}
}
