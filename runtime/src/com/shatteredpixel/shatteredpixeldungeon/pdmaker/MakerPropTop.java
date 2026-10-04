/*
 * 맵 오브젝트의 윗부분 (sprite.over = true 일 때) — 설치 칸 위로 솟은 그림을 벽 층(customWalls)에 그려서
 * 그 뒤(위쪽 칸)에 선 캐릭터를 가림. 아랫부분은 MakerProp 이 바닥 층에 그림.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.watabou.noosa.Tilemap;
import com.watabou.utils.Bundle;

public class MakerPropTop extends CustomTilemap {

	public String propId = "";

	public MakerPropTop() { }

	static MakerPropTop of(Level l, MakerProp p) {
		if (l == null || p == null) return null;
		for (CustomTilemap t : l.customWalls) if (t instanceof MakerPropTop && t.tileX == p.tileX && t.tileY == p.tileY && ((MakerPropTop) t).propId.equals(p.propId)) return (MakerPropTop) t;
		return null;
	}
	MakerProp base() {
		if (Dungeon.level == null) return null;
		for (CustomTilemap t : Dungeon.level.customTiles) if (t instanceof MakerProp && t.tileX == tileX && t.tileY == tileY && ((MakerProp) t).propId.equals(propId)) return (MakerProp) t;
		return null;
	}

	@Override
	public Tilemap create() {
		if (vis != null && vis.alive) vis.killAndErase();
		JsonValue d = MakerRuntime.props.get(propId); JsonValue sp = d == null ? null : d.get("sprite");
		Object tx = sp == null ? null : MakerRuntime.texture(sp.getString("sheet", ""));
		int fw = 16, fh = 16;
		if (sp != null && sp.get("frame") != null && sp.get("frame").size >= 2) { fw = Math.max(1, sp.get("frame").getInt(0)); fh = Math.max(1, sp.get("frame").getInt(1)); }
		if (tx == null) tx = com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES;
		vis = new MakerProp.Vis(tx, fw, fh);
		((MakerProp.Vis) vis).light(sp);
		MakerProp b = base();
		if (b != null) sync(b); else ((MakerProp.Vis) vis).img.visible = false;
		return vis;
	}
	void sync(MakerProp b) { if (vis instanceof MakerProp.Vis) b.layout((MakerProp.Vis) vis, 2); }

	@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("pdm_prop", propId); }
	@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); propId = b.getString("pdm_prop"); }
}
