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
	/** 맵에 놓은 이벤트가 페이지의 이미지로 나타난 것 (EventTriggers.placeEvent) — 페이지에 따라 그림 · 자율 이동이 바뀜 */
	public boolean pageEvent = false;
	private int routeIdx = 0, faceX = 0, faceY = 1, moveSpeed = 0;
	private boolean routeThrough = false, routeDirFix = false;

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

	boolean shopSkip;
	@Override
	public boolean interact(Char c) {
		if (sprite != null) sprite.turnTo(pos, c.pos);
		if (c != Dungeon.hero) return super.interact(c);
		if (EventInterpreter.busy()) return true;
		if (pageEvent) { EventInterpreter.runEvent(eventId, charId, "action"); return true; }   // 페이지의 실행 내용만 (기본 인사 없음)
		// 동료: 길을 막고 있거나(좁은 길 · 문) 영웅이 걸어오던 중이면 자리를 바꿈. 넓은 곳에서 멈춰 서서 누르면 말 걸기
		if (EventTriggers.inParty(charId) && Dungeon.level.adjacent(pos, c.pos) && (EventTriggers.heroWalking() || narrow(pos) || narrow(c.pos))
				&& Dungeon.level.passable[pos] && !c.rooted && !rooted) {
			int mine = pos, his = c.pos;
			moveSprite(mine, his); move(his);
			if (c.sprite != null) c.sprite.move(his, mine);
			c.move(mine);
			Dungeon.hero.spend(1 / Dungeon.hero.speed());
			Dungeon.hero.busy();
			return true;
		}
		if (MakerQuests.onTalk(charId)) return true;   // 줄 · 보고받을 퀘스트가 있으면 그 창
		if (MakerShop.has(charId) && !shopSkip) {   // 상인 기능: 사고파는 창 (다른 대화가 있으면 먼저 고르게 함)
			JsonValue d0 = data();
			JsonValue on0 = d0 == null || d0.get("behaviors") == null ? null : d0.get("behaviors").get("onInteract");
			boolean other = !eventId.isEmpty() || (on0 != null && on0.size > 0) || HeartSystem.enabled(charId);
			if (!other || MakerShop.direct(charId)) { MakerAudio.charSound(charId, "talk"); MakerShop.open(charId, null); return true; }
			final MakerNPC self = this; final Char who = c;
			com.watabou.noosa.Game.runOnRenderThread(() -> com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.show(new com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions(self.sprite(), self.name(), "", MakerRuntime.term("shop.browse", "물건 보기"), MakerRuntime.term("shop.talk", "대화하기")) {
				@Override protected void onSelect(int index) {
					if (index == 0) MakerShop.open(charId, null);
					else { shopSkip = true; try { self.interact(who); } finally { shopSkip = false; } }
				}
			}));
			return true;
		}
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

	// ------------------------------------------------------------ 페이지 이벤트: 그림 · 자율 이동
	static final float[] SPEED = { 8f, 4f, 2f, 1f, 0.5f, 0.25f };   // 속도 1~6 → 한 걸음에 드는 턴
	private boolean freeCell(int cell) {
		return cell >= 0 && cell < Dungeon.level.length() && (routeThrough || Dungeon.level.passable[cell]) && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(cell) == null;
	}
	private boolean stepBy(int dx, int dy) {
		int w = Dungeon.level.width(), x = pos % w + dx, y = pos / w + dy, dest = x < 0 || x >= w ? -1 : x + y * w;
		if ((dx == 0 && dy == 0) || !freeCell(dest)) return false;
		faceX = dx; faceY = dy;
		int old = pos; boolean flip = sprite != null && sprite.flipHorizontal;
		move(dest); moveSprite(old, pos);
		if (routeDirFix && sprite != null) sprite.flipHorizontal = flip;
		return true;
	}
	private void face(int dx) { if (dx != 0) { faceX = dx; if (sprite != null && !routeDirFix) sprite.flipHorizontal = dx < 0; } }
	private boolean actPageEvent() {
		JsonValue ev = MakerRuntime.event(eventId);
		String g = EventTriggers.graphicOf(ev);
		if (!g.equals(charId)) {   // 페이지가 바뀜: 이미지가 없으면 사라지고(자리 기억), 다른 이미지면 그 캐릭터로 바뀜
			final MakerNPC me = this; final int at = pos;
			com.shatteredpixel.shatteredpixeldungeon.actors.Actor.remove(this); Dungeon.level.mobs.remove(this);
			final MakerNPC next = g.isEmpty() ? null : MakerNPC.create(g);
			if (next == null) EventTriggers.hide(eventId, at); else { next.eventId = eventId; next.pageEvent = true; next.pos = at; }
			com.watabou.noosa.Game.runOnRenderThread(() -> { if (me.sprite != null) me.sprite.killAndErase(); if (next != null) com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(next); });
			return true;
		}
		JsonValue pg = EventTriggers.pageOf(ev), mv = pg == null ? null : pg.get("move"), op = pg == null ? null : pg.get("opts");
		String type = mv == null ? "fixed" : mv.getString("type", "fixed");
		int speed = moveSpeed > 0 ? moveSpeed : mv == null ? 3 : Math.max(1, Math.min(6, mv.getInt("speed", 3)));
		int freq = mv == null ? 3 : Math.max(1, Math.min(5, mv.getInt("freq", 3)));
		if (op != null) { if (op.has("through")) routeThrough = op.getBoolean("through", false); if (op.has("dirFix")) routeDirFix = op.getBoolean("dirFix", false); }
		if (type.equals("fixed") || EventInterpreter.busy() || Dungeon.hero == null) { spend(TICK); return true; }
		if (waitLeft > 0) { waitLeft--; spend(TICK); return true; }
		int w = Dungeon.level.width(), hx = Dungeon.hero.pos % w - pos % w, hy = Dungeon.hero.pos / w - pos / w;
		boolean moved = false;
		if (type.equals("random")) {
			int o = com.watabou.utils.PathFinder.NEIGHBOURS8[com.watabou.utils.Random.Int(8)];
			int dx = (pos + o) % w - pos % w, dy = (pos + o) / w - pos / w;
			if (Math.abs(dx) <= 1) moved = stepBy(dx, dy);
		} else if (type.equals("approach")) {
			if (Math.abs(hx) > 1 || Math.abs(hy) > 1) {
				boolean[] all = new boolean[Dungeon.level.length()]; java.util.Arrays.fill(all, true);
				int st = Dungeon.findStep(this, Dungeon.hero.pos, Dungeon.level.passable, all, true);
				if (st != -1) moved = stepBy(st % w - pos % w, st / w - pos / w);
			} else face(Integer.signum(hx));
		} else if (mv.get("route") != null && mv.get("route").size > 0) {   // 사용자 지정 루트: 한 번에 걸음 하나 (시간이 들지 않는 명령은 이어서)
			JsonValue route = mv.get("route"); boolean skip = mv.getBoolean("skip", false), repeat = mv.getBoolean("repeat", true);
			for (int guard = 0; guard < 40 && !moved; guard++) {
				if (routeIdx >= route.size) { if (!repeat) break; routeIdx = 0; if (guard > 0) break; }
				JsonValue o = route.get(routeIdx); String c = o.getString("op", ""); boolean timed = true, ok = true;
				switch (c) {
					case "down": ok = stepBy(0, 1); break; case "up": ok = stepBy(0, -1); break; case "left": ok = stepBy(-1, 0); break; case "right": ok = stepBy(1, 0); break;
					case "dl": ok = stepBy(-1, 1); break; case "dr": ok = stepBy(1, 1); break; case "ul": ok = stepBy(-1, -1); break; case "ur": ok = stepBy(1, -1); break;
					case "random": { int o2 = com.watabou.utils.PathFinder.NEIGHBOURS8[com.watabou.utils.Random.Int(8)]; int dx = (pos + o2) % w - pos % w; if (Math.abs(dx) <= 1) stepBy(dx, (pos + o2) / w - pos / w); break; }
					case "toward": if (Math.abs(hx) > 1 || Math.abs(hy) > 1) ok = stepBy(Integer.signum(hx), Integer.signum(hy)); break;
					case "away": ok = stepBy(-Integer.signum(hx), -Integer.signum(hy)); break;
					case "forward": ok = stepBy(faceX, faceY); break;
					case "backward": { int kx = faceX, ky = faceY; ok = stepBy(-faceX, -faceY); faceX = kx; faceY = ky; break; }
					case "goto": {
						int target = o.getInt("x", 0) + o.getInt("y", 0) * w;
						if (target == pos || target < 0 || target >= Dungeon.level.length()) { timed = false; break; }
						boolean[] all = new boolean[Dungeon.level.length()]; java.util.Arrays.fill(all, true);
						int st = Dungeon.findStep(this, target, Dungeon.level.passable, all, true);
						ok = st != -1 && stepBy(st % w - pos % w, st / w - pos / w);
						if (ok && pos != target) { moved = true; continue; }   // 아직 가는 중 → 같은 명령에 머묾
						break;
					}
					case "jump": {
						int x = pos % w + o.getInt("x", 0), y = pos / w + o.getInt("y", 0), dest = x < 0 || x >= w ? -1 : x + y * w;
						if (dest != pos && freeCell(dest)) { final int old = pos, to = dest; pos = dest; Dungeon.level.occupyCell(this); if (sprite != null) { final com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite sp = sprite; com.watabou.noosa.Game.runOnRenderThread(() -> sp.jump(old, to, () -> { })); } }
						break;
					}
					case "wait": waitLeft = Math.max(0, o.getInt("n", 10) / 10); break;
					case "turnLeft": face(-1); faceY = 0; timed = false; break; case "turnRight": face(1); faceY = 0; timed = false; break;
					case "turnDown": faceX = 0; faceY = 1; timed = false; break; case "turnUp": faceX = 0; faceY = -1; timed = false; break;
					case "turn180": face(-faceX); faceY = -faceY; timed = false; break;
					case "turnR90": { int t = faceX; faceX = -faceY; faceY = t; face(faceX); timed = false; break; }
					case "turnL90": { int t = faceX; faceX = faceY; faceY = -t; face(faceX); timed = false; break; }
					case "turnRandom": face(com.watabou.utils.Random.Int(2) == 0 ? -1 : 1); timed = false; break;
					case "turnToward": faceY = Integer.signum(hy); if (hx != 0) face(Integer.signum(hx)); else faceX = 0; timed = false; break;
					case "turnAway": faceY = -Integer.signum(hy); if (hx != 0) face(-Integer.signum(hx)); else faceX = 0; timed = false; break;
					case "switchOn": StoryState.setSw(o.getString("id", ""), true); timed = false; break;
					case "switchOff": StoryState.setSw(o.getString("id", ""), false); timed = false; break;
					case "speed": moveSpeed = Math.max(1, Math.min(6, o.getInt("n", 4))); speed = moveSpeed; timed = false; break;
					case "throughOn": routeThrough = true; timed = false; break; case "throughOff": routeThrough = false; timed = false; break;
					case "dirFixOn": routeDirFix = true; timed = false; break; case "dirFixOff": routeDirFix = false; timed = false; break;
					case "transparentOn": if (sprite != null) sprite.alpha(0f); timed = false; break;
					case "transparentOff": if (sprite != null) sprite.alpha(1f); timed = false; break;
					case "opacity": if (sprite != null) sprite.alpha(Math.max(0, Math.min(255, o.getInt("n", 255))) / 255f); timed = false; break;
					case "se": MakerAudio.playSe(o.getString("file", "")); timed = false; break;
					default: timed = false; break;
				}
				if (!ok && !skip) { moved = true; break; }   // 못 감: 건너뛰기가 아니면 다음 턴에 같은 명령을 다시
				routeIdx++;
				if (timed) moved = true;
			}
		}
		if (moved) waitLeft += (5 - freq);   // 빈도: 5 = 쉬지 않음 … 1 = 4턴 쉼
		spend(TICK * SPEED[speed - 1]);
		return true;
	}
	/** 좁은 칸인지: 둘레 8칸 가운데 지나갈 수 있는 칸이 3개 이하 (복도 · 문) */
	static boolean narrow(int cell) {
		int n = 0;
		for (int o : com.watabou.utils.PathFinder.NEIGHBOURS8) { int x = cell + o; if (x >= 0 && x < Dungeon.level.length() && Dungeon.level.passable[x]) n++; }
		return n <= 3;
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
		if (pageEvent) return actPageEvent();
		// 동료(이벤트 명령 "동료 합류"): 영웅을 따라다님 — 멀어지면 옆으로 건너뜀
		if (EventTriggers.inParty(charId) && Dungeon.hero != null && Dungeon.hero.isAlive()) {
			int dist = Dungeon.level.distance(pos, Dungeon.hero.pos);
			if (dist > 8) {
				int c = LevelHooks.freeNeighbour(Dungeon.level, Dungeon.hero.pos);
				if (c >= 0) { int old = pos; pos = c; Dungeon.level.occupyCell(this); if (sprite != null) { sprite.place(pos); sprite.visible = Dungeon.level.heroFOV[pos]; } }
			} else if (dist > 1) {
				boolean[] all = new boolean[Dungeon.level.length()]; java.util.Arrays.fill(all, true);
				int step = Dungeon.findStep(this, Dungeon.hero.pos, Dungeon.level.passable, all, true);
				if (step != -1) { int old = pos; move(step); moveSprite(old, pos); }
			}
			spend(TICK / 2f);
			return true;
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
		bundle.put("pdm_pev", pageEvent); bundle.put("pdm_ri", routeIdx);
	}
	@Override public void restoreFromBundle(Bundle bundle) {
		super.restoreFromBundle(bundle);
		charId = bundle.getString("pdm_char"); eventId = bundle.getString("pdm_event");
		pathIndex = bundle.getInt("pdm_path"); waitLeft = bundle.getInt("pdm_wait");
		pageEvent = bundle.getBoolean("pdm_pev"); routeIdx = bundle.getInt("pdm_ri");
	}
}
