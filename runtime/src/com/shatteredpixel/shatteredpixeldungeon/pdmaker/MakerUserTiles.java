/*
 * PDMaker — 사용자 타일: "맵 그림"에서 만든 타일(아무 그림의 한 칸)을 맵 그리기로 칠한 칸에 지형 위로 그림
 *   world.json  userTiles [{ id, name, image, x, y (칸 — size 단위), size (그림의 한 칸 px, 기본 16), terrain (-2 = 칠한 지형 그대로 · 지형 번호), over (캐릭터 위에 그림) }]
 *   노드 · 방 템플릿  layers.utile [칸] = 타일 id ("" = 없음) — 지형(판정)은 layers.terrain 그대로 (편집기가 타일의 terrain 으로 같이 칠함)
 *   층을 만들 때 MakerLevel.build · TemplateRoom.paintTemplate 이 put(칸, id) 로 모아 두고, LevelHooks.afterCreate 가 finish 로
 *   (그림 · 칸 크기 · 위/아래) 묶음마다 CustomTilemap 하나를 customTiles(지형 위) 또는 customWalls(캐릭터 위)에 넣음. 세이브에 칸 배치를 저장.
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
	public int[] cells = new int[0], frames = new int[0];

	// ------------------------------------------------------------ 타일 정의 · 층 만들 때 모으기

	static JsonValue def(String id) {
		JsonValue w = WorldGraph.world, l = w == null ? null : w.get("userTiles");
		if (l == null || id == null || id.isEmpty()) return null;
		for (JsonValue t : l) if (id.equals(t.getString("id", ""))) return t;
		return null;
	}
	private static final Map<Level, LinkedHashMap<Integer, String>> pending = new WeakHashMap<>();
	public static void put(Level l, int cell, String id) {
		if (l == null || id == null || id.isEmpty()) return;
		pending.computeIfAbsent(l, k -> new LinkedHashMap<>()).put(cell, id);
	}
	/** 노드 · 방의 layers.utile 의 칸 i 의 타일 id ("" = 없음) */
	public static String at(JsonValue data, int i) {
		JsonValue ly = data == null ? null : data.get("layers"), u = ly == null ? null : ly.get("utile");
		if (u == null || i < 0 || i >= u.size) return "";
		JsonValue v = u.get(i);
		return v == null || v.isNull() ? "" : v.asString();
	}
	/** 모은 칸을 (그림 · 크기 · 위/아래) 묶음마다 타일맵 하나로 */
	public static void finish(Level l) {
		LinkedHashMap<Integer, String> m = pending.remove(l);
		if (m == null || m.isEmpty()) return;
		try {
			for (CustomTilemap t : l.customTiles.toArray(new CustomTilemap[0])) if (t instanceof MakerUserTiles) l.customTiles.remove(t);
			for (CustomTilemap t : l.customWalls.toArray(new CustomTilemap[0])) if (t instanceof MakerUserTiles) l.customWalls.remove(t);
			Map<String, MakerUserTiles> groups = new LinkedHashMap<>();
			Map<String, java.util.ArrayList<int[]>> lists = new HashMap<>();
			for (Map.Entry<Integer, String> e : m.entrySet()) {
				JsonValue d = def(e.getValue());
				if (d == null) { MakerRuntime.warnOnce("없는 사용자 타일: " + e.getValue()); continue; }
				String img = d.getString("image", ""); if (img.isEmpty()) continue;
				int sz = Math.max(1, d.getInt("size", 16)); boolean ov = d.getBoolean("over", false);
				Object tx = MakerRuntime.texture(img); if (tx == null) continue;
				int cols = Math.max(1, TextureCache.get(tx).width / sz);
				String gk = img + "|" + sz + "|" + ov;
				MakerUserTiles g = groups.get(gk);
				if (g == null) { g = new MakerUserTiles(); g.image = img; g.size = sz; g.over = ov; g.setRect(0, 0, l.width(), l.height()); groups.put(gk, g); lists.put(gk, new java.util.ArrayList<>()); }
				lists.get(gk).add(new int[]{ e.getKey(), d.getInt("x", 0) + d.getInt("y", 0) * cols });
			}
			for (Map.Entry<String, MakerUserTiles> e : groups.entrySet()) {
				MakerUserTiles g = e.getValue(); java.util.ArrayList<int[]> a = lists.get(e.getKey());
				g.cells = new int[a.size()]; g.frames = new int[a.size()];
				for (int i = 0; i < a.size(); i++) { g.cells[i] = a.get(i)[0]; g.frames[i] = a.get(i)[1]; }
				(g.over ? l.customWalls : l.customTiles).add(g);
			}
		} catch (Throwable t) { MakerRuntime.log("사용자 타일 오류: " + t); }
	}

	// ------------------------------------------------------------ 그리기

	@Override public Tilemap create() {
		Object tx = MakerRuntime.texture(image);
		if (tx == null) { texture = MakerPaint.blank(); vis = super.create(); vis.map(new int[tileW * tileH], tileW); vis.visible = false; return vis; }
		texture = tx;
		vis = super.create();
		try {   // 그림의 한 칸이 16 이 아니면 그 크기로 잘라 화면의 한 칸(16)에 맞춤 (큰 타일셋과 같은 방식)
			if (size != SIZE) { java.lang.reflect.Field f = Tilemap.class.getDeclaredField("tileset"); f.setAccessible(true); f.set(vis, new TextureFilm(tx, size, size)); }
		} catch (Throwable e) { MakerRuntime.log("사용자 타일 크기 적용 실패: " + e); }
		int[] data = new int[tileW * tileH];
		java.util.Arrays.fill(data, -1);
		for (int i = 0; i < cells.length; i++) if (cells[i] >= 0 && cells[i] < data.length) data[cells[i]] = frames[i];
		vis.map(data, tileW);
		return vis;
	}
	// 칸 정보 창(살펴보기)에는 끼어들지 않음 — 지형 이름 · 설명 그대로
	@Override public Image image(int tileX, int tileY) { return null; }
	@Override public String name(int tileX, int tileY) { return null; }
	@Override public String desc(int tileX, int tileY) { return null; }

	@Override public void storeInBundle(Bundle b) {
		super.storeInBundle(b);
		b.put("pdm_img", image); b.put("pdm_size", size); b.put("pdm_over", over); b.put("pdm_cells", cells); b.put("pdm_frames", frames);
	}
	@Override public void restoreFromBundle(Bundle b) {
		super.restoreFromBundle(b);
		image = b.getString("pdm_img"); size = b.contains("pdm_size") ? b.getInt("pdm_size") : 16; over = b.getBoolean("pdm_over");
		cells = b.contains("pdm_cells") ? b.getIntArray("pdm_cells") : new int[0]; frames = b.contains("pdm_frames") ? b.getIntArray("pdm_frames") : new int[0];
	}
}
