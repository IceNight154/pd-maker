/*
 * 직접 만든 방 템플릿을 SPD 절차 생성 층에 끼워 넣는 방 (일반 방).
 *   · 크기는 템플릿 그대로 (5~18칸)
 *   · 템플릿 테두리의 문(DOOR) 타일 = 문이 생길 수 있는 자리. 없으면 테두리 어디든.
 *   · 연결되지 않은 테두리 문 자리는 벽으로 바뀌고, 문 안쪽이 막혀 있으면 한 칸 뚫어 줌
 *   · 물·풀·함정 자동 장식을 하지 않아서 디자인이 그대로 유지됨
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

public class TemplateRoom extends StandardRoom {

	public String templateKey = "";

	public TemplateRoom() { super(); }
	public TemplateRoom(String key) { super(); templateKey = key; setSizeCat(); }

	JsonValue tpl() { return MakerRuntime.template(templateKey); }
	static int tw(JsonValue t) { return t == null ? 5 : t.get("size").getInt("w", 5); }
	static int th(JsonValue t) { return t == null ? 5 : t.get("size").getInt("h", 5); }

	@Override public float[] sizeCatProbs() {
		JsonValue t = tpl();
		if (t == null) return super.sizeCatProbs();
		int m = Math.max(tw(t), th(t));
		return m <= 10 ? new float[]{1, 0, 0} : m <= 14 ? new float[]{0, 1, 0} : new float[]{0, 0, 1};
	}
	@Override public int minWidth()  { return tw(tpl()); }
	@Override public int maxWidth()  { return tw(tpl()); }
	@Override public int minHeight() { return th(tpl()); }
	@Override public int maxHeight() { return th(tpl()); }

	@Override public boolean canConnect(Point p) { return super.canConnect(p) && doorAllowed(this, tpl(), p); }
	@Override public boolean canMerge(Level l, Room other, Point p, int mergeTerrain) { return false; }
	@Override public boolean canPlaceWater(Point p) { return false; }
	@Override public boolean canPlaceGrass(Point p) { return false; }
	@Override public boolean canPlaceTrap(Point p) { return false; }
	@Override public boolean canPlaceItem(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("keepClean", false)) && super.canPlaceItem(p, l); }
	@Override public boolean canPlaceCharacter(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("keepClean", false)) && super.canPlaceCharacter(p, l); }

	@Override
	public void paint(Level level) {
		paintTemplate(level, this, tpl());
		for (Door door : connected.values()) door.set(Door.Type.REGULAR);
		LevelHooks.painted.add(this);
	}

	// ------------------------------------------------------------ 공용 (특수 방도 사용)

	/** 테두리에 문 타일이 하나라도 있으면 그 자리만 허용 */
	static boolean doorAllowed(Room r, JsonValue t, Point p) {
		if (t == null) return true;
		int w = tw(t), h = th(t);
		JsonValue ter = t.get("layers").get("terrain");
		boolean any = false;
		for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) {
			if (x != 0 && y != 0 && x != w - 1 && y != h - 1) continue;
			if (isDoor(ter.getInt(y * w + x))) any = true;
		}
		if (!any) return true;
		int x = p.x - r.left, y = p.y - r.top;
		return x >= 0 && y >= 0 && x < w && y < h && isDoor(ter.getInt(y * w + x));
	}
	static boolean isDoor(int t) { return t == Terrain.DOOR || t == Terrain.OPEN_DOOR || t == Terrain.LOCKED_DOOR || t == Terrain.SECRET_DOOR || t == Terrain.CRYSTAL_DOOR; }

	static void paintTemplate(Level level, Room r, JsonValue t) {
		if (t == null) {   // 템플릿을 못 찾으면 빈 방
			Painter.fill(level, r, Terrain.WALL);
			Painter.fill(level, r, 1, Terrain.EMPTY);
			return;
		}
		int w = tw(t), h = th(t);
		JsonValue ter = t.get("layers").get("terrain");
		for (int y = 0; y < h && y < r.height(); y++) {
			for (int x = 0; x < w && x < r.width(); x++) {
				int v = ter.getInt(y * w + x);
				boolean border = x == 0 || y == 0 || x == w - 1 || y == h - 1;
				if (border && isDoor(v)) v = Terrain.WALL;               // 문 자리 → 연결 안 되면 벽
				if (v == Terrain.ENTRANCE || v == Terrain.EXIT) v = Terrain.EMPTY_SP; // 템플릿 안의 계단은 장식으로
				Painter.set(level, r.left + x, r.top + y, v);
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

	@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_tpl", templateKey); }
	@Override public void restoreFromBundle(Bundle bundle) { super.restoreFromBundle(bundle); templateKey = bundle.getString("pdm_tpl"); }
}
