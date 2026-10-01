/*
 * 직접 만든 방 템플릿 — 특수 방 버전 (입구가 하나뿐인 막다른 방. 보물방·NPC 방 등에 적합)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.special.SpecialRoom;
import com.watabou.utils.Bundle;
import com.watabou.utils.Point;

public class TemplateSpecialRoom extends SpecialRoom {

	public String templateKey = "";

	public TemplateSpecialRoom() { super(); }
	public TemplateSpecialRoom(String key) { super(); templateKey = key; }

	JsonValue tpl() { return MakerRuntime.template(templateKey); }

	@Override public int minWidth()  { return TemplateRoom.tw(tpl()); }
	@Override public int maxWidth()  { return TemplateRoom.tw(tpl()); }
	@Override public int minHeight() { return TemplateRoom.th(tpl()); }
	@Override public int maxHeight() { return TemplateRoom.th(tpl()); }

	@Override public boolean canConnect(Point p) { return super.canConnect(p) && TemplateRoom.doorAllowed(this, tpl(), p); }
	@Override public boolean canPlaceWater(Point p) { return false; }
	@Override public boolean canPlaceGrass(Point p) { return false; }
	@Override public boolean canPlaceTrap(Point p) { return false; }
	@Override public boolean canPlaceItem(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("keepClean", false)) && super.canPlaceItem(p, l); }
	@Override public boolean canPlaceCharacter(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("keepClean", false)) && super.canPlaceCharacter(p, l); }

	@Override
	public void paint(Level level) {
		TemplateRoom.paintTemplate(level, this, tpl());
		if (entrance() != null) entrance().set(Door.Type.REGULAR);
		LevelHooks.painted.add(this);
	}

	@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_tpl", templateKey); }
	@Override public void restoreFromBundle(Bundle bundle) { super.restoreFromBundle(bundle); templateKey = bundle.getString("pdm_tpl"); }
}
