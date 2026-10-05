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
	public int var = 0;   // 변형 (TemplateRoom.pickVar)

	public TemplateSpecialRoom() { super(); }
	public TemplateSpecialRoom(String key) { super(); templateKey = key; var = TemplateRoom.pickVar(MakerRuntime.template(key), key); }

	JsonValue tpl() { return MakerRuntime.template(templateKey); }

	@Override public int minWidth()  { return TemplateRoom.vw(tpl(), var); }
	@Override public int maxWidth()  { return TemplateRoom.vw(tpl(), var); }
	@Override public int minHeight() { return TemplateRoom.vh(tpl(), var); }
	@Override public int maxHeight() { return TemplateRoom.vh(tpl(), var); }

	@Override public boolean canConnect(Point p) { return super.canConnect(p) && TemplateRoom.doorAllowed(this, tpl(), p, var); }
	@Override public boolean canPlaceWater(Point p) { return false; }
	@Override public boolean canPlaceGrass(Point p) { return false; }
	@Override public boolean canPlaceTrap(Point p) { return false; }
	@Override public boolean canPlaceItem(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("keepClean", false)) && super.canPlaceItem(p, l); }
	@Override public boolean canPlaceCharacter(Point p, Level l) { JsonValue t = tpl(); return (t == null || !t.getBoolean("noMobs", t.getBoolean("keepClean", false))) && super.canPlaceCharacter(p, l); }

	@Override
	public void paint(Level level) {
		TemplateRoom.paintTemplate(level, this, tpl(), var);
		if (entrance() != null) entrance().set(Door.Type.REGULAR);
		LevelHooks.painted.add(this);
	}

	@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_tpl", templateKey); bundle.put("pdm_var", var); }
	@Override public void restoreFromBundle(Bundle bundle) { super.restoreFromBundle(bundle); templateKey = bundle.getString("pdm_tpl"); var = bundle.contains("pdm_var") ? bundle.getInt("pdm_var") : 0; }
}
