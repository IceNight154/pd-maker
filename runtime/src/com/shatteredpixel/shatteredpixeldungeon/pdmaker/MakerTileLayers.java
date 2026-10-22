/*
 * PDMaker — 타일 레이어: 지형(layers.terrain — 게임 판정) 위에 사용자 타일을 여러 레이어로 칠함
 *   레이어 정의  world.json tileLayers [{ id, name, depth: below(캐릭터 아래) | above(캐릭터 위), visible(게임에 그림), solid(칠한 칸은 못 지나감) }]
 *                없으면 DEFAULT. 배열 순서 = 그리는 순서 (같은 depth 안에서 뒤에 있을수록 위)
 *   레이어 데이터  노드 · 방 템플릿 layers.tiles { <레이어 id>: [칸 → 타일 id ("" = 없음)] }
 *                예전 형식 layers.utile (사용자 타일 한 장) = "base" 레이어 (편집기가 열 때 옮기지만, 런타임도 그대로 읽음)
 *   타일 정의    world.userTiles (MakerUserTiles.def) — 그림 · 칠할 때 지형 · 효과 · 이름. 레이어는 "어느 칸에 무엇"만 가짐
 *   그리기       MakerUserTiles.finish 가 (레이어 · 그림) 묶음마다 타일맵 하나를 레이어 순서대로 customTiles(below) / customWalls(above) 에
 *   판정         지형(Level.map)이 유일한 판정. solid 레이어는 층을 만들 때 칠한 칸의 지나갈 수 있는 지형을 게임의 보이지 않는 막힌 장식(CUSTOM_DECO)으로 바꿈
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;

import java.util.ArrayList;
import java.util.List;

public class MakerTileLayers {

	/** "광원 · 효과" 레이어 — 조합 타일 확장 기능을 켠 프로젝트의 기본 레이어에만 */
	static final String LIGHT = "{id:light,name:\"광원 · 효과\",depth:below,visible:true,solid:false,blend:add},";
	/** 기본 레이어 — 편집기 PDM.TILE_LAYERS_DEFAULT 와 같음 */
	static final String DEFAULT = "["
			+ "{id:base,name:\"기본 타일\",depth:below,visible:true,solid:false},"
			+ "{id:grass,name:\"풀 · 식생\",depth:below,visible:true,solid:false},"
			+ "{id:wall,name:\"벽 · 구조물\",depth:below,visible:true,solid:true},"
			+ "{id:walldeco,name:\"벽 장식\",depth:below,visible:true,solid:false},"
			+ LIGHT
			+ "{id:front,name:\"전경 (캐릭터 위)\",depth:above,visible:true,solid:false}]";
	private static JsonValue defaults, defaultsNoFx;
	public static final String BASE = "base";

	/** 레이어 정의 목록 (순서 = 그리는 순서) */
	public static JsonValue defs() {
		JsonValue w = WorldGraph.world, l = w == null ? null : w.get("tileLayers");
		if (l != null && l.isArray() && l.size > 0) return l;
		if (defaults == null) {
			defaults = new JsonReader().parse(DEFAULT);
			defaultsNoFx = new JsonReader().parse(DEFAULT.replace(LIGHT, ""));
		}
		return MakerRuntime.tileCombos() ? defaults : defaultsNoFx;   // "광원 · 효과" 레이어는 조합 타일 확장 기능에 딸림
	}
	static JsonValue def(String id) {
		for (JsonValue d : defs()) if (id.equals(d.getString("id", ""))) return d;
		return null;
	}
	/** 그리는 순서 (정의에 없는 레이어는 맨 뒤) */
	public static int order(String id) {
		int i = 0;
		for (JsonValue d : defs()) { if (id.equals(d.getString("id", ""))) return i; i++; }
		return 1000;
	}
	public static boolean above(String id) { JsonValue d = def(id); return d != null && "above".equals(d.getString("depth", "below")); }
	public static boolean visible(String id) { JsonValue d = def(id); return d == null || d.getBoolean("visible", true); }
	public static boolean solid(String id) { JsonValue d = def(id); return d != null && d.getBoolean("solid", false); }
	/** 레이어 렌더링: normal | add (발광 — 광원 · 효과 레이어) */
	public static String blend(String id) { JsonValue d = def(id); return d == null ? "normal" : d.getString("blend", "normal"); }

	/** 노드 · 방 데이터에 있는 레이어 id (그리는 순서대로) */
	public static List<String> layersOf(JsonValue data) {
		List<String> out = new ArrayList<>();
		JsonValue ly = data == null ? null : data.get("layers");
		if (ly == null) return out;
		JsonValue t = ly.get("tiles");
		if (t != null) for (JsonValue l : t) if (l.isArray()) out.add(l.name);
		if (ly.get("utile") != null && !out.contains(BASE)) out.add(BASE);   // 예전 형식
		out.sort((a, b) -> Integer.compare(order(a), order(b)));
		return out;
	}
	/** 레이어 layer 의 칸 i 의 타일 id ("" = 없음) */
	public static String at(JsonValue data, String layer, int i) {
		JsonValue ly = data == null ? null : data.get("layers");
		if (ly == null || i < 0) return "";
		JsonValue t = ly.get("tiles"), u = t == null ? null : t.get(layer);
		if (u == null && BASE.equals(layer)) u = ly.get("utile");
		if (u == null || i >= u.size) return "";
		JsonValue v = u.get(i);
		return v == null || v.isNull() ? "" : v.asString();
	}

	/** 층을 만들 때 칸 하나: 모든 레이어의 타일을 모으고(그림은 afterCreate 에서), solid 레이어에 타일이 있으면 그 칸을 막음.
	 *  src = 데이터의 칸 번호, cell = 층의 칸 번호 (방 템플릿은 다름) */
	public static void putCell(Level l, JsonValue data, List<String> layers, int src, int cell) {
		for (String layer : layers) {
			String id = at(data, layer, src);
			if (id.isEmpty()) continue;
			MakerUserTiles.put(l, layer, cell, id);
			if (solid(layer)) block(l, cell);
		}
	}
	/** 지나갈 수 있는 칸 → 게임의 보이지 않는 막힌 장식 (바닥 그림 그대로 · 못 지나감). 물이면 물 위 장식 */
	static void block(Level l, int cell) {
		if (cell < 0 || cell >= l.length()) return;
		int t = l.map[cell];
		if ((Terrain.flags[t] & Terrain.PASSABLE) == 0 || (Terrain.flags[t] & Terrain.SOLID) != 0) return;
		l.map[cell] = t == Terrain.WATER && DECO_WTR >= 0 ? DECO_WTR : MakerCompat.T_CUSTOM_DECO;
	}
	/** MakerCompat.T_CUSTOM_DECO_WTR (판마다 없을 수 있음 → -1) */
	static final int DECO_WTR;
	static { int v = -1; try { v = Terrain.class.getField("CUSTOM_DECO_WTR").getInt(null); } catch (Throwable ignored) { } DECO_WTR = v; }
}
