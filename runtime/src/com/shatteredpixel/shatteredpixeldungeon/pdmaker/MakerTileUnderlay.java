/*
 * PDMaker — 분리된(투명 배경) 타일셋을 예전 일체형 모습 그대로: 지형 타일맵 아래에 "밑그림" 타일맵을 깔아 줌
 *   게임은 칸마다 그림 하나(DungeonTerrainTilemap.getTileVisual)만 그리므로, 풀 · 장식 · 계단 · 조각상처럼 바닥이 그려져 있던 칸의
 *   바닥을 지우면 그 자리에 물 층(지형 타일맵 아래)이 비쳐 보임. → 그 칸의 게임 그림(visual)을 그대로 물어서, 대응표에 있는 밑그림을 먼저 그림.
 *   대응표  기본 LEGACY (원작 타일셋 5종에서 "그 칸 뒤에 그려져 있던 바닥"을 픽셀로 맞춰 본 결과) + tilecombos.json legacy[{ visual, under: [칸 …] }] 로 바꿈 · 추가
 *   그리는 픽셀  "지금 타일셋에서는 투명한데 원작 타일셋에서는 불투명한" 픽셀 = 지운 바닥에만 밑그림 (반투명 가장자리 포함).
 *             원작에서도 투명한 구멍(HOLES — 우물 물 · 연금술 솥 입구: 물 층이 비치는 자리)은 비워 둠. 원작 타일셋은 아무것도 그리지 않음 — 화면이 예전과 같음
 *   층을 만들 때 한 번 밑그림 텍스처(타일셋과 같은 크기)를 구워 두고, 칸마다 같은 자리를 그림
 *   순서  물 → 밑그림(under[0], under[1] …) → 지형(원래 그림 — 이제 투명 배경) → customTiles(타일 레이어) …
 *   칸 크기 · 기준점 · 큰 타일셋(32px 칸 등)은 지형 타일맵과 같은 생성자를 거치므로 똑같음 (LevelHooks.hiresTiles)
 *   확장 기능 "tilecombos"(project.json extensions)를 켠 프로젝트에서만 (꺼져 있으면 예전 그대로 — 밑그림 층을 만들지 않음)
 *   연결 줄  GameScene.create (지형 타일맵을 넣기 직전) · updateMap() · updateMap(cell)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTerrainTilemap;
import com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTilemap;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Group;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MakerTileUnderlay extends DungeonTilemap {

	/** 기본 대응표 — 편집기 PDM.TILE_LEGACY_DEFAULT 와 같음.
	 *  0 바닥 · 6 바닥(변형 1) · 4 특수 바닥. 75 · 131(지역 장식 변형)은 원작 타일셋마다 달라(하수도 · 동굴 4, 도시 10, 전당 0) 4 로 둠 — 편집기에서 바꿀 수 있음 */
	static final String LEGACY = "["
			+ "{visual:1,under:[0]},{visual:2,under:[0]},{visual:3,under:[0]},{visual:7,under:[6]},{visual:8,under:[6]},{visual:9,under:[6]},"
			+ "{visual:16,under:[0]},{visual:18,under:[0]},{visual:22,under:[4]},"
			+ "{visual:64,under:[4]},{visual:65,under:[0]},{visual:66,under:[0]},{visual:67,under:[0]},{visual:69,under:[6]},{visual:70,under:[6]},"
			+ "{visual:72,under:[0]},{visual:73,under:[4]},{visual:74,under:[0]},{visual:75,under:[4]},"
			+ "{visual:120,under:[4]},{visual:121,under:[0]},{visual:122,under:[0]},{visual:123,under:[0]},{visual:125,under:[6]},{visual:126,under:[6]},"
			+ "{visual:128,under:[0]},{visual:129,under:[4]},{visual:130,under:[0]},{visual:131,under:[4]}]";

	/** 대응표: 게임 그림 번호 → 밑그림 칸 번호들 (아래부터) */
	public static Map<Integer, int[]> table() {
		Map<Integer, int[]> m = new HashMap<>();
		read(new JsonReader().parse(LEGACY), m);
		JsonValue c = MakerRuntime.tilecombos, l = c == null ? null : c.get("legacy");
		if (l != null) read(l, m);   // 프로젝트 설정이 기본값을 덮어씀 (under: [] = 밑그림 없음)
		return m;
	}
	static void read(JsonValue list, Map<Integer, int[]> m) {
		for (JsonValue e : list) {
			if (!e.has("visual")) continue;
			JsonValue u = e.get("under");
			m.put(e.getInt("visual"), u == null ? new int[0] : u.asIntArray());
		}
	}

	// ------------------------------------------------------------ 층 만들기

	private static final List<MakerTileUnderlay> live = new ArrayList<>();
	private static Method visualOf;

	final DungeonTerrainTilemap terrain;
	final java.util.Set<Integer> active;   // 밑그림을 그리는 게임 그림 번호

	/** tex = 밑그림 텍스처 (타일셋과 같은 크기 — 칸 v 자리에 v 의 밑그림이 그려져 있음 → 같은 TextureFilm 을 그대로 씀) */
	MakerTileUnderlay(DungeonTerrainTilemap terrain, java.util.Set<Integer> active, SmartTexture tex) {
		super(Dungeon.level.tilesTex());
		this.terrain = terrain; this.active = active;
		texture = tex;
		map(Dungeon.level.map, Dungeon.level.width());
	}

	/** GameScene.create 연결 줄: 지형 타일맵(tiles)을 넣기 직전에 밑그림 층들을 넣음 */
	public static void addTo(Group terrainGroup, DungeonTerrainTilemap tiles) {
		live.clear();
		try {
			if (!MakerRuntime.isActive() || !MakerRuntime.tileCombos() || Dungeon.level == null || tiles == null) return;   // 확장 기능 "tilecombos" 꺼짐 = 밑그림 없음
			Pixmap src = pixmap(tiles);
			if (src == null) return;
			Map<Integer, int[]> table = table();
			int depth = 0; for (int[] u : table.values()) depth = Math.max(depth, u.length);
			java.util.Set<Integer> active = new java.util.HashSet<>();
			List<Pixmap> layers = new ArrayList<>();
			for (int d = 0; d < depth; d++) layers.add(bake(src, table, d, active));
			if (active.isEmpty()) { for (Pixmap p : layers) p.dispose(); return; }
			for (Pixmap p : layers) { MakerTileUnderlay u = new MakerTileUnderlay(tiles, active, new SmartTexture(p)); terrainGroup.add(u); live.add(u); }
			MakerRuntime.log("분리된 타일셋: 밑그림 " + active.size() + "종 (" + Dungeon.level.tilesTex() + ")");
		} catch (Throwable t) { MakerRuntime.log("밑그림 층 오류: " + t); }
	}
	/** 원작 타일셋의 원래 구멍 (16×16 기준, 줄마다 비트 = 투명 픽셀) — 원작 5종(하수도 · 감옥 · 동굴 · 도시 · 전당)이 모두 같음.
	 *  18 우물 물 · 64 연금술 솥 입구 · 120 솥 입구(벽 쪽) — 물 층이 비쳐야 하는 자리. 편집기 assets.js HOLES 와 같음 */
	static final Map<Integer, int[]> HOLES = new HashMap<>();
	static {
		HOLES.put(18, new int[]{ 0, 0, 0, 0, 0, 0, 8184, 8184, 8184, 8184, 8184, 0, 0, 0, 0, 0 });
		HOLES.put(64, new int[]{ 0, 0, 0, 0, 0, 2016, 8184, 8184, 4080, 960, 0, 0, 0, 0, 0, 0 });
		HOLES.put(120, new int[]{ 2016, 8184, 8184, 4080, 960, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 });
	}
	/** 원작에서도 투명한 픽셀인지 (n = 지금 타일셋 한 칸 px — 큰 타일셋은 16 기준으로 줄여 봄) */
	static boolean hole(int v, int x, int y, int n) {
		int[] h = HOLES.get(v);
		if (h == null) return false;
		return (h[y * 16 / n] >> (x * 16 / n) & 1) != 0;
	}
	/** 밑그림 한 장: 대응표의 칸 v 마다, "지금 타일셋에서는 투명한데 원작에서는 불투명한" 픽셀(= 지운 바닥)에만 under[d] 칸의 픽셀을 그림.
	 *  원작에서도 투명한 구멍(우물 물 · 솥 입구)은 비워 둬서 예전처럼 물 층이 비침. 원작과 투명 모양이 같은 타일셋이면 아무것도 그리지 않음 */
	static Pixmap bake(Pixmap src, Map<Integer, int[]> table, int d, java.util.Set<Integer> active) {
		int W = src.getWidth(), H = src.getHeight(), n = Math.max(1, W / 16);
		Pixmap out = new Pixmap(W, H, Pixmap.Format.RGBA8888);
		out.setBlending(Pixmap.Blending.None);
		for (Map.Entry<Integer, int[]> e : table.entrySet()) {
			int v = e.getKey(); int[] u = e.getValue();
			if (v < 0 || v >= 256 || d >= u.length || u[d] < 0 || u[d] >= 256) continue;
			int x0 = (v % 16) * n, y0 = (v / 16) * n, bx = (u[d] % 16) * n, by = (u[d] / 16) * n;
			if (x0 + n > W || y0 + n > H || bx + n > W || by + n > H) continue;
			boolean any = false;
			for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
				if ((src.getPixel(x0 + x, y0 + y) & 0xFF) == 255) continue;                           // 그림이 가린 칸
				if (hole(v, x, y, n)) continue;                                                         // 원작에서도 투명 = 원래 구멍 → 비움
				out.drawPixel(x0 + x, y0 + y, src.getPixel(bx + x, by + y));
				any = true;
			}
			if (any) active.add(v);
		}
		return out;
	}
	static Pixmap pixmap(DungeonTerrainTilemap tiles) {
		try {
			Object tx = MakerCompat.getField(tiles, "texture");
			SmartTexture st = tx instanceof SmartTexture ? (SmartTexture) tx : TextureCache.get(tx);
			return st == null ? null : st.bitmap;
		} catch (Throwable t) { return null; }
	}

	/** GameScene.updateMap 연결 줄 (cell < 0 = 전부) */
	public static void refresh(int cell) {
		for (MakerTileUnderlay u : live) {
			try { if (cell < 0) u.updateMap(); else u.updateMapCell(cell); } catch (Throwable ignored) { }
		}
	}

	/** 지형 타일맵이 이 칸에 그리는 그림을 그대로 물어봄 (변형 · 이음 규칙도 게임 그대로) → 대응표의 밑그림 */
	@Override protected int getTileVisual(int pos, int tile, boolean flat) {
		int v = engineVisual(terrain, pos, tile, flat);
		return active.contains(v) ? v : -1;   // 밑그림 텍스처의 같은 칸 자리
	}
	static int engineVisual(DungeonTerrainTilemap t, int pos, int tile, boolean flat) {
		try {
			if (visualOf == null) { visualOf = DungeonTerrainTilemap.class.getDeclaredMethod("getTileVisual", int.class, int.class, boolean.class); visualOf.setAccessible(true); }
			return (Integer) visualOf.invoke(t, pos, tile, flat);
		} catch (Throwable e) { return -1; }
	}
	@Override public boolean overlapsPoint(float x, float y) { return false; }
	@Override public boolean overlapsScreenPoint(int x, int y) { return false; }
}
