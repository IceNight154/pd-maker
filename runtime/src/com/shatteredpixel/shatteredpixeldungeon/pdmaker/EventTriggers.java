/*
 * 이벤트 페이지의 트리거 중 맵 오브젝트 없이 스스로 실행되는 것 + 동료(파티) + 스토리 비트 · 루트 자동 진입.
 *   auto(조건이 맞으면 한 번) · parallel(매 턴) · floorEnter(층에 들어올 때마다) · turn(N 턴마다)
 *   heart(마음 조건을 만족하면 한 번) · itemPickup · mobKilled · bossDefeated
 *   활성 페이지 = 뒤에서부터 조건이 맞는 첫 페이지 (RPG Maker 와 같음). 그 페이지의 트리거가 맞을 때만 실행.
 *   연결: MakerRuntime.onFloorEnter/onFloorLeave · HeroRuntime.onMobDie · MakerAudio.onItemPickup (연결 줄 추가 없음)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.noosa.Game;

public class EventTriggers {

	static int turns = 0;
	static int heroPos = -1, lastMoveTurn = -99;
	/** 영웅이 방금(지난 턴 안에) 걸어서 움직였는지 — 동료와 자리 바꾸기 판단 */
	public static boolean heroWalking() { noteHero(); return turns - lastMoveTurn <= 1; }
	static void noteHero() { if (Dungeon.hero != null && Dungeon.hero.pos != heroPos) { if (heroPos >= 0) lastMoveTurn = turns; heroPos = Dungeon.hero.pos; } }

	/** 매 턴 도는 보이지 않는 액터 (층마다 새로 넣음 — 저장되지 않음) */
	public static class Ticker extends Actor {
		{ actPriority = BUFF_PRIO; }
		@Override protected boolean act() {
			spend(TICK);
			try { turns++; noteHero(); tick(); } catch (Throwable t) { MakerRuntime.log("이벤트 트리거 오류: " + t); }
			return true;
		}
	}

	static void tick() {
		if (!MakerRuntime.isActive() || Dungeon.hero == null || !Dungeon.hero.isAlive()) return;
		checkRoutes();
		showHidden();
		MakerSafe.tick();   // 안전구역: 허기 · 상태이상 · 회복
		MakerQuests.tick();
		MakerBadges.check("turn");
		if (EventInterpreter.busy()) return;
		fire("auto", null);
		fire("heart", null);
		fire("turn", null);
		fire("parallel", null);
	}

	/** 층에 들어온 뒤 (MakerRuntime.onFloorEnter 끝) */
	public static void onFloorEnter(String nodeId) {
		try {
			Actor.add(new Ticker());
			MakerHomes.onFloorEnter();   // 이주한 NPC 를 이 맵에 맞춤
			MakerQuests.onFloorEnter(nodeId);
			MakerBadges.check("floorEnter");
			partyArrive();
			// 스토리 비트: 이 맵에 묶인 이벤트를 한 번씩
			JsonValue beats = MakerRuntime.story == null ? null : MakerRuntime.story.get("beats");
			if (beats != null && nodeId != null) for (JsonValue b : beats) {
				String ev = b.getString("event", ""), key = "beat_" + b.getString("id", nodeId + "_" + ev);
				if (ev.isEmpty() || !nodeId.equals(b.getString("node", "")) || StoryState.flag(key)) continue;
				if (EventInterpreter.runEvent(ev, null)) StoryState.setFlag(key, true);
			}
			checkRoutes();
			fire("floorEnter", null);
			fire("auto", null);
		} catch (Throwable t) { MakerRuntime.log("층 입장 트리거 오류: " + t); }
	}
	public static void onFloorLeave() { try { partyLeave(); } catch (Throwable t) { MakerRuntime.log("동료 이동 오류: " + t); } }

	/** 루트의 "자동 진입 조건"이 맞으면 그 루트로 (목록 순서대로 처음 맞는 것, 조건이 빈 루트는 건너뜀) */
	static void checkRoutes() {
		JsonValue rs = MakerRuntime.story == null ? null : MakerRuntime.story.get("routes");
		if (rs == null) return;
		for (JsonValue r : rs) {
			String when = r.getString("when", ""), id = r.getString("id", "");
			if (when.isEmpty() || id.isEmpty() || id.equals(StoryState.route)) continue;
			if (StoryState.flag("route_auto_" + id)) continue;
			if (Cond.eval(when, StoryState.globalResolver())) { StoryState.setFlag("route_auto_" + id, true); StoryState.route = id; MakerRuntime.log("루트 → " + id); return; }
		}
	}

	/** 트리거에 맞는 이벤트를 모두 실행. ref = 몬스터·아이템 이름들 (| 로 이어 붙인 것 중 하나와 같으면 맞음) */
	public static void fire(String trig, String ref) {
		if (!MakerRuntime.isActive()) return;
		for (JsonValue ev : MakerRuntime.events.values()) {
			JsonValue pages = ev.get("pages");
			if (pages == null) continue;
			if (trig.equals("floorEnter") && "daily".equals(ev.getString("kind", ""))) continue;   // 데일리는 확률로 따로 굴림
			String id = ev.getString("id", "");
			for (int i = pages.size - 1; i >= 0; i--) {
				JsonValue p = pages.get(i);
				if (!EventInterpreter.pageOk(id, p)) continue;
				if (trig.equals(p.getString("trigger", "action")) && matches(trig, p, id, i, ref)) EventInterpreter.run(p.get("commands"), id, null);
				break;   // 활성 페이지 하나만 봄
			}
		}
	}
	static boolean matches(String trig, JsonValue p, String id, int page, String ref) {
		switch (trig) {
			case "auto": {
				String k = "auto_" + id + "_" + page;
				if (StoryState.flag(k)) return false;
				StoryState.setFlag(k, true); return true;
			}
			case "heart": {
				String ch = p.getString("heartChar", ""), k = "heart_" + id + "_" + page;
				if (ch.isEmpty() || StoryState.flag(k) || !HeartSystem.enabled(ch)) return false;
				if (!Cond.eval(p.getString("heartCond", ""), HeartSystem.resolver(ch))) return false;
				StoryState.setFlag(k, true); return true;
			}
			case "turn": return turns % Math.max(1, p.getInt("turnEvery", 10)) == 0;
			case "mobKilled": case "itemPickup": {
				String want = p.getString("triggerRef", "").trim().toLowerCase();
				if (want.isEmpty()) return trig.equals("mobKilled");
				if (want.startsWith("spd:")) want = want.substring(4);
				if (want.contains(".")) want = want.substring(want.lastIndexOf('.') + 1);
				if (ref != null) for (String r : ref.toLowerCase().split("\\|")) if (r.equals(want)) return true;
				return false;
			}
			default: return true;
		}
	}

	/** 몬스터가 죽었을 때 (HeroRuntime.onMobDie) */
	public static void onMobDie(Mob mob, Object cause) {
		if (!MakerRuntime.isActive() || mob == null || mob.alignment != Char.Alignment.ENEMY) return;
		String ref = mob.getClass().getSimpleName();
		if (mob instanceof MakerMob) ref += "|" + ((MakerMob) mob).charId;
		// 프로젝트 캐릭터 가운데 이 게임 클래스를 쓰는 것의 id 도
		for (JsonValue c : MakerRuntime.chars.values()) { String g = c.getString("game", ""); if (!g.isEmpty() && (g.equals(mob.getClass().getSimpleName()) || g.endsWith("." + mob.getClass().getSimpleName()))) ref += "|" + c.getString("id", ""); }
		MakerQuests.onMobDie(ref);
		fire("mobKilled", ref);
		MakerBadges.check("mobKilled");
		if (mob.properties().contains(Char.Property.BOSS)) fire("bossDefeated", ref);
	}
	/** 아이템을 주웠을 때 (MakerAudio.onItemPickup) */
	public static void onItemPickup(Item it) {
		if (!MakerRuntime.isActive() || it == null) return;
		String ref = it.getClass().getSimpleName();
		if (it instanceof MakerItem) ref += "|" + ((MakerItem) it).makerId;
		if (it instanceof GenSupport.Coded) ref += "|" + ((GenSupport.Coded) it).makerId();
		fire("itemPickup", ref);
		MakerBadges.check("itemPickup");
	}

	// ------------------------------------------------------------ 맵에 놓은 이벤트 (페이지마다 이미지 · 자율 이동)
	//   페이지에 이미지(graphic.char)가 있는 이벤트를 맵에 놓으면 그 캐릭터 그림의 MakerNPC 로 나타남.
	//   지금 페이지에 이미지가 없으면(조건에 맞는 페이지가 없어도) 사라지고, 자리만 기억해 둠 (플래그 evhide:깊이:가지:칸:이벤트)
	static final String HIDE = "evhide:";
	/** 지금 페이지의 이미지 캐릭터 id (없으면 "") */
	public static String graphicOf(JsonValue ev) {
		int i = EventInterpreter.pageIndex(ev);
		if (i < 0) return "";
		JsonValue g = ev.get("pages").get(i).get("graphic");
		String c = g == null || !g.isObject() ? "" : g.getString("char", "");
		return MakerRuntime.character(c) == null ? "" : c;
	}
	public static JsonValue pageOf(JsonValue ev) { int i = EventInterpreter.pageIndex(ev); return i < 0 ? null : ev.get("pages").get(i); }
	static boolean hasGraphic(JsonValue ev) {
		JsonValue pages = ev == null ? null : ev.get("pages");
		if (pages != null) for (JsonValue p : pages) { JsonValue g = p.get("graphic"); if (g != null && g.isObject() && !g.getString("char", "").isEmpty()) return true; }
		return false;
	}
	/** 층을 만들 때: 이미지가 있는 이벤트면 캐릭터로 놓고 true (없으면 false → 보이지 않는 이벤트 칸) */
	public static boolean placeEvent(com.shatteredpixel.shatteredpixeldungeon.levels.Level level, String eventId, int cell) {
		JsonValue ev = MakerRuntime.event(eventId);
		if (!hasGraphic(ev)) return false;
		String g = graphicOf(ev);
		if (g.isEmpty()) { hide(eventId, cell); return true; }
		MakerNPC n = MakerNPC.create(g); n.eventId = eventId; n.pageEvent = true; n.pos = cell;
		level.mobs.add(n);
		return true;
	}
	public static void hide(String eventId, int cell) { StoryState.setFlag(HIDE + Dungeon.depth + ":" + Dungeon.branch + ":" + cell + ":" + eventId, true); }
	/** 숨어 있던 이벤트 가운데 이미지가 있는 페이지가 된 것을 다시 나타냄 */
	static void showHidden() {
		if (Dungeon.level == null) return;
		String pre = HIDE + Dungeon.depth + ":" + Dungeon.branch + ":";
		for (String f : StoryState.flagsWith(pre)) {
			String rest = f.substring(pre.length()); int k = rest.indexOf(':'); if (k < 0) continue;
			final int cell; try { cell = Integer.parseInt(rest.substring(0, k)); } catch (NumberFormatException e) { continue; }
			String eventId = rest.substring(k + 1), g = graphicOf(MakerRuntime.event(eventId));
			if (g.isEmpty() || cell < 0 || cell >= Dungeon.level.length() || Actor.findChar(cell) != null) continue;
			StoryState.setFlag(f, false);
			final MakerNPC n = MakerNPC.create(g); n.eventId = eventId; n.pageEvent = true; n.pos = cell;
			Game.runOnRenderThread(() -> { if (Game.scene() instanceof GameScene) GameScene.add(n); else Dungeon.level.mobs.add(n); });
		}
	}

	// ------------------------------------------------------------ 동료 (이벤트 명령 "동료 합류/이탈")
	static final String PARTY = "party:";
	public static boolean inParty(String charId) { return StoryState.flag(PARTY + charId); }
	static MakerNPC npcOnLevel(String charId) {
		if (Dungeon.level == null) return null;
		for (Mob m : Dungeon.level.mobs) if (m instanceof MakerNPC && ((MakerNPC) m).charId.equals(charId)) return (MakerNPC) m;
		return null;
	}
	public static void setParty(String charId, boolean join) {
		if (charId == null || charId.isEmpty() || MakerRuntime.character(charId) == null || (join && MakerRuntime.charOff(charId))) return;
		StoryState.setFlag(PARTY + charId, join);
		if (join && npcOnLevel(charId) == null) spawnNear(charId);
	}
	static void spawnNear(String charId) {
		if (Dungeon.level == null || Dungeon.hero == null) return;
		int cell = LevelHooks.freeNeighbour(Dungeon.level, Dungeon.hero.pos);
		if (cell < 0) return;
		final MakerNPC npc = MakerNPC.create(charId);
		npc.pos = cell;
		Game.runOnRenderThread(() -> { if (Game.scene() instanceof GameScene) GameScene.add(npc); else Dungeon.level.mobs.add(npc); });
	}
	static void partyArrive() { for (String f : StoryState.flagsWith(PARTY)) { String id = f.substring(PARTY.length()); if (npcOnLevel(id) == null) spawnNear(id); } }
	/** 층을 떠날 때: 따라오는 동료를 이 층에서 뺌 (다음 층에서 영웅 옆에 다시 나옴) */
	static void partyLeave() {
		if (Dungeon.level == null) return;
		for (Mob m : Dungeon.level.mobs.toArray(new Mob[0]))
			if (m instanceof MakerNPC && inParty(((MakerNPC) m).charId)) { Dungeon.level.mobs.remove(m); Actor.remove(m); }
	}
}
