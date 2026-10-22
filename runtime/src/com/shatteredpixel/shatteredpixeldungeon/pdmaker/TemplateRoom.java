/*
 * 직접 만든 방 템플릿을 SPD 절차 생성 층에 끼워 넣는 방 (일반 방).
 *   · 크기는 템플릿 그대로 (5~18칸)
 *   · 템플릿 테두리의 문(DOOR) 타일 = 문이 생길 수 있는 자리. 없으면 테두리 어디든.
 *   · 연결되지 않은 테두리 문 자리는 벽으로 바뀌고, 문 안쪽이 막혀 있으면 한 칸 뚫어 줌
 *   · 물·풀·함정 자동 장식을 하지 않아서 디자인이 그대로 유지됨
 *   · 변형 (방 템플릿만): variation { flipH, flipV, rotate } — 방이 생길 때마다 무작위로 좌우 · 상하 뒤집기 · 90° 돌리기 (오브젝트 · 문 자리도 따라감, 층에 저장)
 *     무작위 칸: layers.rand[칸] = 묶음 번호(1부터), randSets[{ name, mode: cell(칸마다) | all(묶음 전체가 같이), opts: [{ t: 지형 | -2(그린 그대로), w: 무게 }] }]
 *     오브젝트 chance(%) = 나올 확률
 *   templateKey: 'room:<id>' (방 템플릿) 또는 'floor:<깊이>' (혼합 층에 직접 그린 방)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.painters.Painter;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.standard.StandardRoom;
import com.watabou.utils.Bundle;
import com.watabou.utils.Point;
import com.watabou.utils.Random;

public class TemplateRoom extends StandardRoom {

	public String templateKey = "";
	public int var = 0;   // 변형: 1 좌우 뒤집기 · 2 상하 뒤집기 · 4 90° 돌리기

	public TemplateRoom() { super(); }
	public TemplateRoom(String key) { super(); templateKey = key; var = pickVar(MakerRuntime.template(key), key); setSizeCat(); }

	JsonValue tpl() { return MakerRuntime.template(templateKey); }
	static int tw(JsonValue t) { return t == null ? 5 : t.get("size").getInt("w", 5); }
	static int th(JsonValue t) { return t == null ? 5 : t.get("size").getInt("h", 5); }

	@Override public float[] sizeCatProbs() {
		JsonValue t = tpl();
		if (t == null) return super.sizeCatProbs();
		int m = Math.max(tw(t), th(t));   // 돌려도 긴 변은 같음
		return m <= 10 ? new float[]{1, 0, 0} : m <= 14 ? new float[]{0, 1, 0} : new float[]{0, 0, 1};
	}
	@Override public int minWidth()  { return vw(tpl(), var); }
	@Override public int maxWidth()  { return vw(tpl(), var); }
	@Override public int minHeight() { return vh(tpl(), var); }
	@Override public int maxHeight() { return vh(tpl(), var); }

	@Override public boolean canConnect(Point p) { return super.canConnect(p) && doorAllowed(this, tpl(), p, var); }
	public boolean canMerge(Level l, Room other, Point p, int mergeTerrain) { return false; }
	public boolean canMerge(Level l, Point p, int mergeTerrain) { return false; }   // 예전 판 (방 인자 없음)
	@Override public boolean canPlaceWater(Point p) { return false; }
	@Override public boolean canPlaceGrass(Point p) { return false; }
	@Override public boolean canPlaceTrap(Point p) { return false; }
//#if method:levels.rooms.Room#canPlaceItem @ 방 템플릿 "깨끗하게" 의 아이템 자리 제한
	@Override public boolean canPlaceItem(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("keepClean", false)) && super.canPlaceItem(p, l); }
//#else
	//#| // (예전 판: 방마다 아이템 자리 판정이 없음)
//#endif
	@Override public boolean canPlaceCharacter(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("noMobs", t.getBoolean("keepClean", false))) && super.canPlaceCharacter(p, l); }

	@Override
	public void paint(Level level) {
		paintTemplate(level, this, tpl(), var);
		for (Door door : connected.values()) door.set(Door.Type.REGULAR);
		LevelHooks.painted.add(this);
	}

	// ------------------------------------------------------------ 공용 (특수 방도 사용)

	// ---- 변형 ----
	/** 방이 생길 때 변형을 고름 (방 템플릿만 — 혼합 맵의 직접 그린 방은 좌표가 다른 곳과 이어져 있어서 그대로) */
	static int pickVar(JsonValue t, String key) {
		JsonValue v = t == null || key == null || !key.startsWith("room:") ? null : t.get("variation");
		if (v == null) return 0;
		int m = 0;
		if (v.getBoolean("flipH", false) && Random.Int(2) == 0) m |= 1;
		if (v.getBoolean("flipV", false) && Random.Int(2) == 0) m |= 2;
		if (v.getBoolean("rotate", false) && Random.Int(2) == 0) m |= 4;
		return m;
	}
	/** 변형 뒤 가로 · 세로 */
	static int vw(JsonValue t, int var) { return (var & 4) != 0 ? th(t) : tw(t); }
	static int vh(JsonValue t, int var) { return (var & 4) != 0 ? tw(t) : th(t); }
	/** 방 안의 칸 (rx, ry) → 템플릿의 칸 번호 */
	static int src(JsonValue t, int var, int rx, int ry) {
		int w = tw(t), h = th(t), x = rx, y = ry;
		if ((var & 4) != 0) { int s = x; x = y; y = s; }
		if ((var & 2) != 0) y = h - 1 - y;
		if ((var & 1) != 0) x = w - 1 - x;
		return y * w + x;
	}
	/** 템플릿의 칸 (tx, ty) → 방 안의 칸 { x, y } */
	static int[] dst(JsonValue t, int var, int tx, int ty) {
		int w = tw(t), h = th(t), x = tx, y = ty;
		if ((var & 1) != 0) x = w - 1 - x;
		if ((var & 2) != 0) y = h - 1 - y;
		if ((var & 4) != 0) { int s = x; x = y; y = s; }
		return new int[]{ x, y };
	}
	/** 무작위 칸을 정해 템플릿 크기의 지형 배열로 (그린 칸은 그대로) */
	static int[] resolve(JsonValue t) {
		int w = tw(t), h = th(t);
		JsonValue ter = t.get("layers").get("terrain"), rl = t.get("layers").get("rand"), sets = t.get("randSets");
		int[] out = new int[w * h];
		for (int i = 0; i < w * h; i++) out[i] = ter.getInt(i);
		if (rl == null || sets == null || rl.size != w * h) return out;
		int[] pickAll = new int[sets.size];
		for (int s = 0; s < sets.size; s++) pickAll[s] = pickOpt(sets.get(s));
		for (int i = 0; i < w * h; i++) {
			int s = rl.getInt(i) - 1;
			if (s < 0 || s >= sets.size) continue;
			JsonValue set = sets.get(s), opts = set.get("opts");
			int k = "all".equals(set.getString("mode", "cell")) ? pickAll[s] : pickOpt(set);
			if (opts == null || k < 0 || k >= opts.size) continue;
			int v = opts.get(k).getInt("t", -2);
			if (v != -2) out[i] = v;   // -2 = 그린 타일 그대로
		}
		return out;
	}
	/** 무게대로 선택지 하나 */
	static int pickOpt(JsonValue set) {
		JsonValue opts = set == null ? null : set.get("opts");
		if (opts == null || opts.size == 0) return -1;
		float sum = 0; for (JsonValue o : opts) sum += Math.max(0f, o.getFloat("w", 1f));
		if (sum <= 0) return -1;
		float r = Random.Float(sum);
		for (int k = 0; k < opts.size; k++) { r -= Math.max(0f, opts.get(k).getFloat("w", 1f)); if (r < 0) return k; }
		return opts.size - 1;
	}

	/** 테두리에 문 타일이 하나라도 있으면 그 자리만 허용 (변형을 따라감) */
	static boolean doorAllowed(Room r, JsonValue t, Point p, int var) {
		if (t == null) return true;
		int w = vw(t, var), h = vh(t, var);
		JsonValue ter = t.get("layers").get("terrain");
		boolean any = false;
		for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) {
			if (x != 0 && y != 0 && x != w - 1 && y != h - 1) continue;
			if (isDoor(ter.getInt(src(t, var, x, y)))) any = true;
		}
		if (!any) return true;
		int x = p.x - r.left, y = p.y - r.top;
		return x >= 0 && y >= 0 && x < w && y < h && isDoor(ter.getInt(src(t, var, x, y)));
	}
	static boolean isDoor(int t) { return t == Terrain.DOOR || t == Terrain.OPEN_DOOR || t == Terrain.LOCKED_DOOR || t == Terrain.SECRET_DOOR || t == MakerCompat.T_CRYSTAL_DOOR; }

	static void paintTemplate(Level level, Room r, JsonValue t, int var) {
		if (t == null) {   // 템플릿을 못 찾으면 빈 방
			Painter.fill(level, r, Terrain.WALL);
			Painter.fill(level, r, 1, Terrain.EMPTY);
			return;
		}
		int w = vw(t, var), h = vh(t, var);
		int[] ter = resolve(t);
		java.util.List<String> tl = MakerTileLayers.layersOf(t);
		for (int y = 0; y < h && y < r.height(); y++) {
			for (int x = 0; x < w && x < r.width(); x++) {
				int v = ter[src(t, var, x, y)];
				if (v < 0) v = Terrain.WALL;                              // 에디터의 빈 칸
				boolean border = x == 0 || y == 0 || x == w - 1 || y == h - 1;
				if (border && isDoor(v)) v = Terrain.WALL;               // 문 자리 → 연결 안 되면 벽
				if (v == Terrain.ENTRANCE || v == Terrain.EXIT) v = Terrain.EMPTY_SP; // 템플릿 안의 계단은 장식으로
				Painter.set(level, r.left + x, r.top + y, v);
				int cell = r.left + x + (r.top + y) * level.width();
				if (!tl.isEmpty()) MakerTileLayers.putCell(level, t, tl, src(t, var, x, y), cell);   // 타일 레이어
				MakerTraps.legacy(level, cell);                                                      // 예전 데이터: 지형에 칠한 함정
			}
		}
		// 연결된 문 안쪽이 막혀 있으면 한 칸 뚫기
		for (Point p : r.connected.values()) {
			int ix = p.x == r.left ? p.x + 1 : p.x == r.right ? p.x - 1 : p.x;
			int iy = p.y == r.top ? p.y + 1 : p.y == r.bottom ? p.y - 1 : p.y;
			int cell = ix + iy * level.width();
			if ((com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.flags[level.map[cell]] & Terrain.PASSABLE) == 0) Painter.set(level, cell, Terrain.EMPTY);
		}
	}

	@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_tpl", templateKey); bundle.put("pdm_var", var); }
	@Override public void restoreFromBundle(Bundle bundle) { super.restoreFromBundle(bundle); templateKey = bundle.getString("pdm_tpl"); var = bundle.contains("pdm_var") ? bundle.getInt("pdm_var") : 0; }
}
