/*
 * 데이터로 정의되는 NPC (캐릭터 종류 npc / companion).
 *   · 말을 걸면: 맵 오브젝트에 지정한 이벤트 → 캐릭터의 onInteract 행동 → 기본 인사(마음 시스템 TALK + greet 토픽) 순
 *   · AI: stand / wander / patrol(경로 순찰)
 *   · 공격받으면 다치지 않고 마음 시스템의 "attacked" 반응
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.NPC;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.utils.Bundle;

public class MakerNPC extends NPC {

	public String charId = "";
	public String eventId = "";   // 맵 오브젝트에서 지정한 "말 걸면 실행할 이벤트"
	private int pathIndex = 0, waitLeft = 0, decayLeft = 0;

	{
		spriteClass = MakerSprite.class;
		state = PASSIVE;
	}

	public static MakerNPC create(String charId) {
		MakerNPC n = new MakerNPC();
		n.charId = charId;
		n.applyData();
		return n;
	}
	JsonValue data() { return MakerRuntime.character(charId); }
	void applyData() {
		JsonValue d = data();
		if (d == null) return;
		JsonValue st = d.get("stats");
		HP = HT = st == null ? 1 : Math.max(1, st.getInt("hp", 1));
		if (d.get("behaviors") != null && d.get("behaviors").get("onSpawn") != null)
			EventInterpreter.run(d.get("behaviors").get("onSpawn"), null, charId);
	}

	@Override public CharSprite sprite() { return new MakerSprite(data()); }
	@Override public String name() { JsonValue d = data(); return d == null ? "?" : d.getString("name", charId); }
	@Override public String description() { JsonValue d = data(); return d == null ? "" : d.getString("desc", ""); }

	/** 머리 위 말풍선 대신 로그에 대사 */
	public void say(String text) {
		if (text == null || text.isEmpty()) return;
		GLog.newLine();
		GLog.i("%s: \"%s\"", name(), text);
	}

	@Override
	public boolean interact(Char c) {
		if (sprite != null) sprite.turnTo(pos, c.pos);
		if (c != Dungeon.hero) return super.interact(c);
		if (EventInterpreter.busy()) return true;
		MakerAudio.charSound(charId, "talk");
		if (!eventId.isEmpty() && EventInterpreter.runEvent(eventId, charId, "action")) return true;
		JsonValue d = data();
		JsonValue on = d == null || d.get("behaviors") == null ? null : d.get("behaviors").get("onInteract");
		if (on != null && on.size > 0) { EventInterpreter.run(on, null, charId); return true; }
		// 기본: 마음 시스템 — 말 걸기 메뉴(행동표의 menu 행동 + 부탁)가 있으면 메뉴, 없으면 대화 + 인사 토픽
		if (HeartSystem.enabled(charId) && HeartMenu.show(this)) return true;
		boolean sulk = false;
		if (HeartSystem.enabled(charId)) { HeartSystem.applyAction(charId, "TALK"); sulk = HeartSystem.rec(charId).sulk; }
		topic(sulk ? "sulk" : "greet");
		return true;
	}

	/** 토픽 대사를 대화창으로 */
	void topic(String t) {
		if (t == null) return;
		String cmds = "[{\"cmd\":\"topic\",\"char\":\"" + charId + "\",\"topic\":\"" + t + "\"}]";
		EventInterpreter.run(new JsonReader().parse(cmds), null, charId);
	}

	@Override
	protected boolean act() {
		if (fieldOfView == null || fieldOfView.length != Dungeon.level.length()) fieldOfView = new boolean[Dungeon.level.length()];
		Dungeon.level.updateFieldOfView(this, fieldOfView);
		// 분노가 조금씩 풀림
		if (HeartSystem.enabled(charId) && MakerRuntime.heart != null && --decayLeft <= 0) {
			decayLeft = MakerRuntime.heart.get("rules").getInt("decayTurns", 10);
			HeartSystem.decay(charId);
		}
		JsonValue d = data();
		JsonValue ai = d == null ? null : d.get("ai");
		String mode = ai == null ? "stand" : ai.getString("mode", "stand");
		if ((mode.equals("patrol") || mode.equals("schedule")) && ai.get("path") != null && ai.get("path").size > 0
				&& (ai.getString("pathNode", "").isEmpty() ? ai.getInt("pathDepth", Dungeon.depth) == Dungeon.depth : ai.getString("pathNode").equals(WorldGraph.current()))) {
			if (waitLeft > 0) { waitLeft--; spend(TICK); return true; }
			JsonValue pts = ai.get("path");
			JsonValue p = pts.get(pathIndex % pts.size);
			int target = p.getInt("x", 0) + p.getInt("y", 0) * Dungeon.level.width();
			if (target == pos) { pathIndex = (pathIndex + 1) % pts.size; waitLeft = ai.getInt("wait", 3); spend(TICK); return true; }
			int step = Dungeon.findStep(this, target, Dungeon.level.passable, fieldOfView, true);
			if (step != -1) { int old = pos; move(step); moveSprite(old, pos); }
			spend(TICK);
			return true;
		}
		if (mode.equals("wander")) { state = WANDERING; }
		return super.act();
	}

	@Override public void damage(int dmg, Object src) {
		if (src == Dungeon.hero) HeartSystem.counter("attacked", charId);
	}
	@Override public boolean add(Buff buff) { return false; }
	@Override public boolean reset() { return true; }
	@Override public boolean isInvulnerable(Class effect) { return true; }

	@Override public void storeInBundle(Bundle bundle) {
		super.storeInBundle(bundle);
		bundle.put("pdm_char", charId); bundle.put("pdm_event", eventId);
		bundle.put("pdm_path", pathIndex); bundle.put("pdm_wait", waitLeft);
	}
	@Override public void restoreFromBundle(Bundle bundle) {
		super.restoreFromBundle(bundle);
		charId = bundle.getString("pdm_char"); eventId = bundle.getString("pdm_event");
		pathIndex = bundle.getInt("pdm_path"); waitLeft = bundle.getInt("pdm_wait");
	}
}
