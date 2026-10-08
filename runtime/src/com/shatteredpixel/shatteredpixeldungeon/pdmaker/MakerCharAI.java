/*
 * PDMaker — 캐릭터 AI 추가 방식 · 체력 설정 (몬스터 · NPC · 게임 캐릭터 모두 — 프로젝트 캐릭터 데이터로)
 *   characters/<id>.json
 *     ai { mode: … "fixed"(제자리 고정 — 걷지도 밀려나지도 않음) | "code"(코드로 직접 — 생성 파일 GenCharAI),
 *          fixedAttack (고정일 때 옆에 온 적을 공격 — 끄면 가만히 맞기만 함: 샌드백), code, imports }
 *     stats { infiniteHp (체력 무한 — 피해 숫자는 뜨지만 체력이 줄지 않고 쓰러지지 않음),
 *             regen (지속 회복: 회복량), regenEvery (몇 턴마다, 기본 1), regenDelay (마지막으로 맞은 뒤 몇 턴 지나야 회복, 기본 0) }
 *   연결 줄: Mob.act 의 super.act() 바로 뒤 (act) · Char.damage 의 "if (HP < 0) HP = 0;" 바로 앞 (afterDamage) · Mob.die 맨 앞 (preventDeath)
 *            MakerNPC.act 는 직접 부름
 *   코드 방식: GenCharAI.act(charId, self, ai) — true = 이번 턴을 씀(ai 의 도우미가 spend 함), null · false = 원래 AI 로
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.effects.FloatingText;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.utils.PathFinder;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;
import java.util.WeakHashMap;

public class MakerCharAI {

	// ------------------------------------------------------------ 이 캐릭터의 프로젝트 데이터

	private static final Map<Class<?>, String> byClass = new HashMap<>();
	private static final String NONE = "\u0000";
	/** 이 몬스터의 프로젝트 캐릭터 id (MakerMob · MakerNPC · 게임 클래스가 같은 캐릭터) — 없으면 null */
	public static String charId(Char c) {
		if (c instanceof MakerMob) return ((MakerMob) c).charId;
		if (c instanceof MakerNPC) return ((MakerNPC) c).charId;
		if (!(c instanceof Mob) || MakerRuntime.chars == null) return null;
		String t = tags.get(c);
		if (t != null) return t;
		String id = byClass.get(c.getClass());
		if (id == null) { id = MakerDrops.charOfClass(c.getClass()); byClass.put(c.getClass(), id == null ? NONE : id); }
		return id == null || id.equals(NONE) ? null : id;
	}
	/** 프로젝트 캐릭터로 만든 게임 클래스 몬스터 → 그 캐릭터 id (LevelHooks.gameChar 가 붙임 · Mob 저장 연결 줄로 저장) */
	private static final Map<Char, String> tags = new WeakHashMap<>();
	public static void tag(Mob m, String charId) { if (m != null && charId != null && !(m instanceof MakerMob) && !(m instanceof MakerNPC)) tags.put(m, charId); }
	static String tagOf(Mob m) { return tags.get(m); }
	/** Mob.storeInBundle · restoreFromBundle 연결 줄 */
	public static void store(Mob m, com.watabou.utils.Bundle b) { String t = tags.get(m); if (t != null) b.put("pdm_charTag", t); }
	public static void restore(Mob m, com.watabou.utils.Bundle b) { if (b.contains("pdm_charTag")) { tags.put(m, b.getString("pdm_charTag")); onCreate(m); } }
	static JsonValue data(Char c) { String id = charId(c); return id == null ? null : MakerRuntime.character(id); }
	static JsonValue part(JsonValue d, String k) { return d == null ? null : d.get(k); }

	/** 같은 캐릭터 데이터가 바뀌어도 (게임을 새로 켜면) 다시 찾도록 */
	public static void reset() { byClass.clear(); }

	// ------------------------------------------------------------ 상태 (몬스터마다 — 저장하지 않음: 회복 대기 · 받은 피해)

	static class St { int sinceHit = 9999, tick, total, hits, last; }
	private static final Map<Char, St> states = new WeakHashMap<>();
	static St st(Char c) { return states.computeIfAbsent(c, k -> new St()); }

	// ------------------------------------------------------------ Mob.act 연결 줄

	/** null = 원래 AI 대로, true/false = 이번 행동을 여기서 끝냄 */
	public static Boolean act(Mob self) {
		try {
			if (!MakerRuntime.isActive()) return null;
			JsonValue d = data(self);
			if (d == null) return null;
			regen(self, part(d, "stats"));
			JsonValue ai = part(d, "ai");
			String mode = ai == null ? "" : ai.getString("mode", "");
			if (self.paralysed > 0) return null;
			if (mode.equals("fixed")) {
				hold(self);
				if (ai.getBoolean("fixedAttack", false) && !(self instanceof MakerNPC)) return null;   // 원래 AI — 걷지 못하니 옆에 오면 공격만
				if (self.state != self.PASSIVE) self.state = self.PASSIVE;
				spend(self, Actor.TICK);
				return true;
			}
			if (mode.equals("code")) return code(self, ai);
		} catch (Throwable t) { MakerRuntime.warnOnce("캐릭터 AI 오류: " + t); }
		return null;
	}
	/** 만들 때 (LevelHooks.createMob) — 고정이면 바로 붙잡아 둠 */
	public static void onCreate(Mob m) {
		try { JsonValue ai = part(data(m), "ai"); if (ai != null && "fixed".equals(ai.getString("mode", ""))) hold(m); } catch (Throwable ignored) { }
	}
	/** 제자리 고정: 걷지 못하고(rooted) 밀려나지 않음(IMMOVABLE) */
	static void hold(Char c) {
		c.rooted = true;
		try {
			if (PROPS == null) { PROPS = Char.class.getDeclaredField("properties"); PROPS.setAccessible(true); }
			@SuppressWarnings("unchecked") java.util.HashSet<Char.Property> p = (java.util.HashSet<Char.Property>) PROPS.get(c);
			p.add(Char.Property.IMMOVABLE);
		} catch (Throwable ignored) { }
	}
	private static Field PROPS;

	static Boolean code(Mob self, JsonValue ai) {
		String id = charId(self);
		try {
			Class<?> g = Class.forName(GenSupport.GEN + "GenCharAI");
			Ctl ctl = new Ctl(self);
			Object r = g.getMethod("act", String.class, Mob.class, Ctl.class).invoke(null, id, self, ctl);
			if (ctl.anim) return false;   // 공격 동작이 끝나면 게임이 이어서 (Mob.onAttackComplete)
			if ((r instanceof Boolean && (Boolean) r) || ctl.acted) return true;   // return 을 빠뜨려도 도우미로 턴을 썼으면 그걸로 (원래 AI 가 또 움직이지 않게)
		} catch (java.lang.reflect.InvocationTargetException e) {
			MakerRuntime.log("캐릭터 AI 코드 오류 (" + id + "): " + e.getCause());
			MakerRuntime.warnOnce("캐릭터 AI 코드 오류 (" + id + "): " + e.getCause());
		} catch (Throwable e) { MakerRuntime.warnOnce("캐릭터 AI 코드를 찾지 못함 (" + id + "): " + e); }
		return null;
	}

	// ------------------------------------------------------------ 체력 무한 · 지속 회복

	static void regen(Mob self, JsonValue s) {
		if (s == null) return;
		St t = st(self);
		t.sinceHit++;
		int amt = s.getInt("regen", 0);
		if (amt <= 0 || self.HP >= self.HT || t.sinceHit <= s.getInt("regenDelay", 0)) return;
		if (++t.tick < Math.max(1, s.getInt("regenEvery", 1))) return;
		t.tick = 0;
		int add = Math.min(amt, self.HT - self.HP);
		self.HP += add;
		if (self.sprite != null && self.sprite.visible) self.sprite.showStatusWithIcon(CharSprite.POSITIVE, Integer.toString(add), FloatingText.HEALING);
	}
	/** Char.damage 연결 줄 (체력을 깎은 뒤 · 쓰러짐 판정 전) */
	public static void afterDamage(Char c, int dmg) {
		try {
			if (!(c instanceof Mob) || !MakerRuntime.isActive()) return;
			JsonValue d = data(c), s = part(d, "stats"), ai = part(d, "ai");
			if (ai != null && "fixed".equals(ai.getString("mode", ""))) hold(c);   // 아직 차례가 오지 않았어도 맞자마자 밀려나지 않게
			if (s == null) return;
			St t = st(c);
			if (dmg > 0) { t.sinceHit = 0; t.total += dmg; t.hits++; t.last = dmg; }
			if (s.getBoolean("infiniteHp", false)) c.HP = c.HT;
		} catch (Throwable t) { MakerRuntime.log("캐릭터 체력 오류: " + t); }
	}
	/** Mob.die 연결 줄 — 체력 무한이면 쓰러지지 않음 (즉사 효과 등) */
	public static boolean preventDeath(Mob m) {
		try {
			if (!MakerRuntime.isActive()) return false;
			JsonValue s = part(data(m), "stats");
			if (s == null || !s.getBoolean("infiniteHp", false)) return false;
			m.HP = m.HT;
			return true;
		} catch (Throwable t) { return false; }
	}
	/** 받은 피해 (설명에 붙임 — 샌드백) */
	public static String damageInfo(Char c) {
		St t = states.get(c);
		if (t == null || t.hits == 0) return "";
		try { JsonValue st = part(data(c), "stats"); if (st == null || !st.getBoolean("infiniteHp", false)) return ""; } catch (Throwable e) { return ""; }
		return "\n\n받은 피해: 합계 " + t.total + " · " + t.hits + "번 · 평균 " + Math.round(t.total / (float) t.hits) + " · 마지막 " + t.last;
	}

	// ------------------------------------------------------------ 코드 방식의 도우미 (ai.…)

	/** 코드에서 쓰는 도우미 — self 를 대신 움직이고 턴을 씀. 이동 · 공격 · 기다리기는 true 를 돌려주니 그대로 return 하세요 */
	public static class Ctl {
		public final Mob self;
		/** 이번 차례에 턴을 쓰는 도우미를 불렀는지 */
		public boolean acted, anim;
		public Ctl(Mob self) { this.self = self; }
		void spendT(float t) { if (acted) return; acted = true; MakerCharAI.spend(self, t); }   // 한 차례에 한 번만
		/** 원래 AI 에 맡김 (return ai.def();) */
		public Boolean def() { return null; }
		/** 한 턴 (또는 turns 턴) 기다림 */
		public boolean waitTurn() { spendT(Actor.TICK); return true; }
		public boolean waitTurns(float turns) { spendT(Math.max(0.1f, turns)); return true; }
		/** 그 칸 쪽으로 한 칸 (막혔으면 기다림) */
		public boolean stepTo(int cell) {
			if (acted) return true;   // 이번 차례에 이미 움직임
			if (cell == self.pos || self.rooted) return waitTurn();
			boolean[] all = new boolean[Dungeon.level.length()]; java.util.Arrays.fill(all, true);
			int step = Dungeon.findStep(self, cell, Dungeon.level.passable, all, true);
			if (step == -1) return waitTurn();
			int old = self.pos; self.move(step); if (self.sprite != null) self.sprite.move(old, self.pos);
			spendT(1f / self.speed());
			return true;
		}
		/** 그 칸에서 멀어지는 쪽으로 한 칸 */
		public boolean stepAway(int cell) {
			if (acted) return true;   // 이번 차례에 이미 움직임
			if (self.rooted) return waitTurn();
			int best = -1, bd = Dungeon.level.distance(self.pos, cell);
			for (int o : PathFinder.NEIGHBOURS8) {
				int c = self.pos + o;
				if (c < 0 || c >= Dungeon.level.length() || !Dungeon.level.passable[c] || Actor.findChar(c) != null) continue;
				int dd = Dungeon.level.distance(c, cell); if (dd > bd) { bd = dd; best = c; }
			}
			if (best < 0) return waitTurn();
			int old = self.pos; self.move(best); if (self.sprite != null) self.sprite.move(old, self.pos);
			spendT(1f / self.speed());
			return true;
		}
		/** 무작위로 한 칸 */
		public boolean wander() {
			if (acted) return true;   // 이번 차례에 이미 움직임
			int c = self.pos + PathFinder.NEIGHBOURS8[com.watabou.utils.Random.Int(8)];
			if (c < 0 || c >= Dungeon.level.length() || !Dungeon.level.passable[c] || Actor.findChar(c) != null) return waitTurn();
			return stepTo(c);
		}
		/** 옆에 있는 대상을 공격 (멀면 다가감) */
		public boolean attack(Char target) {
			if (target == null || !target.isAlive()) return waitTurn();
			if (!Dungeon.level.adjacent(self.pos, target.pos)) return stepTo(target.pos);
			try {
				if (ENEMY == null) { ENEMY = Mob.class.getDeclaredField("enemy"); ENEMY.setAccessible(true); DO_ATTACK = Mob.class.getDeclaredMethod("doAttack", Char.class); DO_ATTACK.setAccessible(true); }
				if (acted) return true;
				ENEMY.set(self, target);
				acted = true;
				boolean done = (Boolean) DO_ATTACK.invoke(self, target);   // false = 공격 동작을 보여 주는 중 (끝나면 게임이 턴을 씀)
				if (!done) anim = true;
				return done;
			} catch (Throwable e) { self.attack(target); spendT(Actor.TICK); return true; }
		}
		/** 대상을 쫓게 하고 원래 AI 에 맡김 (return ai.hunt(hero);) */
		public Boolean hunt(Char target) { if (target != null) { self.aggro(target); self.state = self.HUNTING; } return null; }
		/** 그 칸으로 순간이동 (빈 칸일 때) */
		public boolean teleport(int cell) {
			if (acted) return true;   // 이번 차례에 이미 움직임
			if (cell < 0 || cell >= Dungeon.level.length() || !Dungeon.level.passable[cell] || Actor.findChar(cell) != null) return waitTurn();
			self.pos = cell; Dungeon.level.occupyCell(self); if (self.sprite != null) self.sprite.place(cell);
			return waitTurn();
		}
		/** 머리 위에 글자 */
		public void say(String text) { if (self.sprite != null) self.sprite.showStatus(CharSprite.NEUTRAL, text); }
		public int cell(int x, int y) { return x + y * Dungeon.level.width(); }
		public int x(int cell) { return cell % Dungeon.level.width(); }
		public int y(int cell) { return cell / Dungeon.level.width(); }
		public int dist(int cell) { return Dungeon.level.distance(self.pos, cell); }
		public boolean sees(Char c) { return c != null && self.fieldOfView != null && c.pos >= 0 && c.pos < self.fieldOfView.length && self.fieldOfView[c.pos]; }
		public boolean near(Char c) { return c != null && Dungeon.level.adjacent(self.pos, c.pos); }
		/** 지금까지 지난 턴 (게임 시간) */
		public float now() { return Actor.now(); }
	}
	private static Field ENEMY; private static Method DO_ATTACK, SPEND;
	/** Actor.spend 는 protected — 반사로 (하위 클래스의 spend 가 불림) */
	static void spend(Char c, float t) {
		try {
			if (SPEND == null) { SPEND = Actor.class.getDeclaredMethod("spend", float.class); SPEND.setAccessible(true); }
			SPEND.invoke(c, t);
		} catch (Throwable e) { MakerRuntime.log("캐릭터 턴 오류: " + e); }
	}
}
