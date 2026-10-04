/*
 * PDMaker — 안전구역 (맵 노드 · 방 템플릿의 safe 설정)
 *   safe { on, hunger(허기가 쌓이지 않고 천천히 풀림), feed(들어올 때 허기를 모두 풂), cure(해로운 상태이상 해제), heal(턴마다 체력 회복), msg(들어올 때 · 나갈 때 알림) }
 *   방(영웅이 그 방 안에 있을 때)이 맵 노드보다 먼저. 매 턴 EventTriggers.tick 에서 부름.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;

import java.util.ArrayList;
import java.util.List;

public class MakerSafe {

	static Level seen; static List<Object[]> rooms; static boolean inside;

	@SuppressWarnings("unchecked")
	static List<Object[]> rooms() {
		if (seen == Dungeon.level && rooms != null) return rooms;
		seen = Dungeon.level; rooms = new ArrayList<>(); inside = false;
		try {
			if (Dungeon.level instanceof RegularLevel) {
				java.lang.reflect.Field f = RegularLevel.class.getDeclaredField("rooms"); f.setAccessible(true);
				List<Room> l = (List<Room>) f.get(Dungeon.level);
				if (l != null) for (Room r : l) {
					JsonValue t = r instanceof TemplateRoom ? ((TemplateRoom) r).tpl() : r instanceof TemplateSpecialRoom ? ((TemplateSpecialRoom) r).tpl() : null;
					JsonValue s = t == null ? null : t.get("safe");
					if (s != null && s.getBoolean("on", false)) rooms.add(new Object[]{ r, s });
				}
			}
		} catch (Throwable t) { MakerRuntime.log("안전구역 방을 읽지 못함: " + t); }
		return rooms;
	}

	/** 영웅이 지금 있는 안전구역 설정 (없으면 null) */
	public static JsonValue zone() {
		if (Dungeon.hero == null || Dungeon.level == null) return null;
		int w = Dungeon.level.width(), x = Dungeon.hero.pos % w, y = Dungeon.hero.pos / w;
		for (Object[] r : rooms()) { Room rm = (Room) r[0]; if (x >= rm.left && x <= rm.right && y >= rm.top && y <= rm.bottom) return (JsonValue) r[1]; }
		JsonValue n = MakerRuntime.here(), s = n == null ? null : n.get("safe");
		return s != null && s.getBoolean("on", false) ? s : null;
	}
	public static boolean in() { return zone() != null; }

	public static void tick() {
		try {
			Hero h = Dungeon.hero;
			JsonValue z = zone();
			boolean was = inside; inside = z != null;
			if (z == null) { if (was && lastMsg) GLog.i(MakerRuntime.term("safe.leave", "안전구역을 벗어났다.")); return; }
			lastMsg = z.getBoolean("msg", true);
			Hunger hg = h.buff(Hunger.class);
			if (!was) {
				if (lastMsg) GLog.p(MakerRuntime.term("safe.enter", "안전구역에 들어왔다."));
				if (z.getBoolean("feed", false) && hg != null) hg.satisfy(Hunger.STARVING);
			}
			if (z.getBoolean("hunger", true) && hg != null) hg.satisfy(2f);   // 턴마다 쌓이는 1 을 지우고 1 만큼 더 풂 (경계에서 "배고프다" 알림이 되풀이되지 않게)
			if (z.getBoolean("cure", true)) {
				boolean ch = false;
				for (Buff b : new ArrayList<>(h.buffs())) if (b.type == Buff.buffType.NEGATIVE && !(b instanceof Hunger)) { b.detach(); ch = true; }
				if (ch) BuffIndicator.refreshHero();
			}
			int heal = z.getInt("heal", 0);
			if (heal > 0 && h.HP < h.HT) { h.HP = Math.min(h.HT, h.HP + heal); }
		} catch (Throwable t) { MakerRuntime.log("안전구역 오류: " + t); }
	}
	static boolean lastMsg = true;
}
