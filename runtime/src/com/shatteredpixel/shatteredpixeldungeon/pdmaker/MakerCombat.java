/*
 * PDMaker — 캐릭터 AI · 공격 프로필 실행 (8차). characters/<id>.json combat 을 MakerAIModel(편집기 aimodel.js 와 같은 규칙)로 골라 게임에서 실제로 움직이고 때림
 *   부르는 곳: MakerCharAI.act (Mob.act 의 super.act() 바로 뒤 연결 줄 · MakerNPC.act) — combat 이 없거나 꺼졌거나 검사 오류가 있으면 null = 원래 AI 그대로
 *            MakerCharAI.afterDamage (맞음 → 사건 hit) · MakerCharAI.preventDeath (쓰러질 때 행동)
 *   상황(MakerAIModel.Sit): 자신 · 대상(현재 적 · 영웅 · 가장 가까운/약한 적 · 가장 약한 아군 — 감지 거리 detect 안 · 시야), 칸 거리(Level.distance), 투사체가 닿는지(Ballistica),
 *            상태(버프 → burning · poison · slow · weak · cripple · bleed · blind · vertigo · roots · frost · paralysed), 사건(hit · attacked · targetLost), 재사용 대기 · 이어서 할 행동
 *   공격: 명중 = Char.hit(자신, 대상, acc) (범위 공격은 늘 맞음) · 피해 = round(damageRoll × mult + flat) (치명이면 × critMult) − 대상 drRoll (원래 공격과 같은 방어 계산) · hits 번
 *         준비(windup) 턴 = 머리 위 "!" 후 그만큼 기다렸다 다음 차례에 공격 (맞으면 끊길 수 있음 — interrupt) · 회복(recovery) · 대기(delay) = 그만큼 턴을 더 씀
 *         밀치기 = WandOfBlastWave.throwChar · 기절 = Paralysis · 상태 = 게임 버프 · 체력 소모 hpCost · 이펙트(effects.json) · 소리
 *   시간: 게임 시간 clock() = Statistics.duration + Actor.now() (저장 때 Actor 시간을 다시 맞춰도 이어짐)
 *   저장: 재사용 대기 · 이어서 할 행동을 몬스터와 함께 (준비 중인 공격 · 사건은 저장하지 않음 — 불러오면 다시 판단). 디버그: combat.debug = true 면 차례마다 [PDMaker] [AI] 줄
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.utils.Callback;
import com.watabou.utils.Random;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

public class MakerCombat {

	// ------------------------------------------------------------ 프로필 (캐릭터마다 한 번 검사 · 정리 — 데이터가 바뀌면 다시)
	static final class Prof { JsonValue src; MakerAIModel.Profile P; boolean ok; JsonValue raw; }
	private static final Map<String, Prof> profs = new HashMap<>();
	/** 쓸 수 있는 프로필 (없음 · 꺼짐 · 오류 = null — 오류는 한 번만 알림) */
	static Prof prof(String charId, JsonValue cb) {
		if (cb == null || !cb.isObject()) return null;
		Prof p = profs.get(charId);
		if (p == null || p.src != cb) {
			p = new Prof(); p.src = cb; p.raw = cb;
			try {
				MakerTitle.JV v = new MakerTitle.JV(cb);
				List<MakerAIModel.Issue> issues = MakerAIModel.validate(v);
				p.P = MakerAIModel.normalize(v);
				p.ok = !MakerAIModel.hasErrors(issues);
				if (!p.ok) {
					StringBuilder sb = new StringBuilder();
					for (MakerAIModel.Issue i : issues) if ("error".equals(i.level)) sb.append(" · ").append(i.code).append(' ').append(i.path);
					MakerRuntime.log("전투 설정 오류 (" + charId + ") — 원래 AI 로 움직입니다:" + sb);
					MakerRuntime.warnOnce("캐릭터 「" + charId + "」 전투 설정에 오류가 있어 원래 AI 로 움직입니다");
				}
			} catch (Throwable t) { p.ok = false; MakerRuntime.log("전투 설정을 읽지 못함 (" + charId + "): " + t); MakerRuntime.warnOnce("캐릭터 「" + charId + "」 전투 설정을 읽지 못해 원래 AI 로 움직입니다"); }
			profs.put(charId, p);
		}
		return p.ok && p.P.enabled ? p : null;
	}
	public static void reset() { profs.clear(); }

	// ------------------------------------------------------------ 몬스터마다 상태
	static final class Pending { MakerAIModel.Behavior b; MakerAIModel.Attack a; Char target; }
	static final class St {
		final Map<String, Double> cd = new LinkedHashMap<>();
		String next = "";
		boolean hit, attacked, hadTarget;
		Pending pending;
		int home = -1;
		String last = "";
		int decisions;
		final Map<String, Integer> used = new LinkedHashMap<>();
	}
	private static final Map<Char, St> states = new WeakHashMap<>();
	static St st(Char c) { return states.computeIfAbsent(c, k -> new St()); }
	/** 맞음 (MakerCharAI.afterDamage) */
	static void onHit(Char c) { St s = states.get(c); if (s != null) s.hit = true; else if (c instanceof Mob && profFor(c) != null) st(c).hit = true; }
	static Prof profFor(Char c) { String id = MakerCharAI.charId(c); JsonValue d = id == null ? null : MakerRuntime.character(id); return d == null ? null : prof(id, d.get("combat")); }
	/** 디버그 · 시험: 마지막 결정 · 고른 횟수 */
	public static String debug(Char c) { St s = states.get(c); return s == null ? "" : "last=" + s.last + " n=" + s.decisions + " used=" + s.used + " cd=" + s.cd + " next=" + s.next + (s.pending != null ? " pending=" + s.pending.b.id : ""); }

	/** 게임 시간 (턴) — Statistics.duration + Actor.now(): 저장할 때 게임이 Actor 시간을 다시 맞춰도(fixTime) 줄지 않고 저장 · 불러오기에도 이어짐 */
	static double clock() { return com.shatteredpixel.shatteredpixeldungeon.Statistics.duration + Actor.now(); }

	// ------------------------------------------------------------ 저장 · 불러오기 (Mob 저장 연결 줄 — MakerCharAI.store · restore)
	/** 재사용 대기(게임 시간 clock 기준 — 그대로 이어짐) · 이어서 할 행동만 저장. 준비 중인 공격 · 사건은 저장하지 않음 (불러오면 다시 판단) */
	static void store(Mob m, com.watabou.utils.Bundle b) {
		try {
			St s = states.get(m); if (s == null) return;
			List<String> ks = new ArrayList<>(); List<Float> vs = new ArrayList<>();
			for (Map.Entry<String, Double> e : s.cd.entrySet()) if (e.getValue() > clock()) { ks.add(e.getKey()); vs.add(e.getValue().floatValue()); }
			float[] fv = new float[vs.size()]; for (int i = 0; i < fv.length; i++) fv[i] = vs.get(i);
			b.put("pdm_cmb_cdk", ks.toArray(new String[0])); b.put("pdm_cmb_cdv", fv); b.put("pdm_cmb_next", s.next);
		} catch (Throwable t) { MakerRuntime.log("전투 상태 저장 오류: " + t); }
	}
	static void restore(Mob m, com.watabou.utils.Bundle b) {
		try {
			if (!b.contains("pdm_cmb_cdk")) return;
			St s = st(m);
			String[] ks = b.getStringArray("pdm_cmb_cdk"); float[] vs = b.getFloatArray("pdm_cmb_cdv");
			for (int i = 0; i < ks.length && i < vs.length; i++) s.cd.put(ks[i], (double) vs[i]);
			s.next = b.contains("pdm_cmb_next") ? b.getString("pdm_cmb_next") : "";
		} catch (Throwable t) { MakerRuntime.log("전투 상태 불러오기 오류: " + t); }
	}

	// ------------------------------------------------------------ 차례
	/** null = 원래 AI, true = 턴을 씀, false = 동작을 보여 주는 중 (끝나면 next) */
	static Boolean act(Mob self, String charId, JsonValue d) {
		Prof pf = prof(charId, d.get("combat"));
		if (pf == null) return null;
		MakerAIModel.Profile P = pf.P;
		St s = st(self);
		if (s.home < 0) s.home = self.pos;
		Map<String, Char> tg = new HashMap<>();
		MakerAIModel.Sit sit = situation(self, P, s, tg);
		boolean debug = pf.raw.getBoolean("debug", false);
		// 준비 중인 공격: 맞아서 끊기거나(행동 interrupt) 그대로 공격
		if (s.pending != null) {
			Pending pd = s.pending; s.pending = null;
			if (pd.b.interrupt && s.hit) {
				if (self.sprite != null && self.sprite.visible) self.sprite.showStatus(CharSprite.NEUTRAL, "!?");
				MakerAIModel.after(P, sit, pd.b.id, false); s.next = sit.next; s.cd.clear(); s.cd.putAll(sit.cd);
				s.last = pd.b.id + ":interrupted"; clearEv(s, tg);
				if (debug) MakerRuntime.log("[AI] " + charId +  " t=" + clock() + " 준비 중 공격 끊김: " + pd.b.id);
				MakerCharAI.spend(self, Actor.TICK);
				return true;
			}
			Char t = pd.target != null && pd.target.isAlive() ? pd.target : tg.get(pd.b.target);
			boolean ok = t != null && t.isAlive() && Dungeon.level.distance(self.pos, t.pos) <= pd.a.range && (!"ranged".equals(pd.a.type) || !pd.a.projectile || line(self, t));
			MakerAIModel.after(P, sit, pd.b.id, ok); s.next = sit.next; s.cd.clear(); s.cd.putAll(sit.cd);
			s.last = pd.b.id + (ok ? ":strike" : ":missed"); clearEv(s, tg);
			if (debug) MakerRuntime.log("[AI] " + charId +  " t=" + clock() + " 준비 끝 → " + pd.b.id + (ok ? " 공격" : " 대상이 없거나 멀어짐"));
			if (!ok) { MakerCharAI.spend(self, Actor.TICK); return true; }
			s.attacked = true;
			return strike(self, pd.b, pd.a, t, pd.a.recovery + pd.b.delay + 1);
		}
		sit.rng = Random::Float;
		MakerAIModel.Result R = MakerAIModel.decide(P, sit);
		s.decisions++;
		if (debug) {
			StringBuilder tr = new StringBuilder(); for (String[] x : R.trace) tr.append(' ').append(x[0]).append('=').append(x[1]);
			MakerRuntime.log("[AI] " + charId +  " t=" + clock() + " hp=" + self.HP + "/" + self.HT + " → " + (R.id == null ? "원래 AI" : R.id + " (" + R.action + (R.attack.isEmpty() ? "" : " " + R.attack) + ")") + " 이유=" + R.reason + " |" + tr);
		}
		s.last = R.id == null ? "default:" + R.reason : R.id;
		if (R.id != null) s.used.merge(R.id, 1, Integer::sum);
		boolean hadT = tg.get("enemy") != null;
		if (R.id == null || "default".equals(R.action)) { if (R.id != null) { MakerAIModel.after(P, sit, R.id, true); s.next = sit.next; s.cd.clear(); s.cd.putAll(sit.cd); } s.hit = false; s.attacked = false; s.hadTarget = hadT; return null; }
		MakerAIModel.Behavior b = R.behavior;
		Char t = "self".equals(b.target) ? self : tg.get(b.target);
		Boolean ret; boolean ok = true;
		MakerCharAI.Ctl ctl = new MakerCharAI.Ctl(self);
		switch (b.action) {
			case "attack": {
				MakerAIModel.Attack a = R.att;
				if (a.windup > 0) {   // 준비: 머리 위 "!" · 준비 턴만큼 기다린 뒤 다음 차례에 공격 (after 는 공격할 때)
					Pending pd = new Pending(); pd.b = b; pd.a = a; pd.target = t; s.pending = pd;
					if (self.sprite != null && self.sprite.visible) { self.sprite.showStatus(CharSprite.WARNING, "!"); self.sprite.turnTo(self.pos, t.pos); }
					clearEv(s, tg);
					MakerCharAI.spend(self, (float) a.windup);
					return true;
				}
				MakerAIModel.after(P, sit, b.id, true); s.next = sit.next; s.cd.clear(); s.cd.putAll(sit.cd);
				clearEv(s, tg); s.attacked = true;
				return strike(self, b, a, t, a.recovery + b.delay + 1);
			}
			case "approach": ok = t.pos != self.pos; ctl.stepTo(t.pos); break;
			case "retreat": case "flee": ctl.stepAway(t.pos); break;
			case "keep": { int dd = Dungeon.level.distance(self.pos, t.pos); if (dd < b.dist) ctl.stepAway(t.pos); else if (dd > b.dist) ctl.stepTo(t.pos); else ctl.waitTurn(); break; }
			case "wander": ctl.wander(); break;
			case "patrol": if (s.home >= 0 && Dungeon.level.distance(self.pos, s.home) > 4) ctl.stepTo(s.home); else ctl.wander(); break;
			case "protect": if (Dungeon.level.distance(self.pos, t.pos) > 1) ctl.stepTo(t.pos); else ctl.waitTurn(); break;
			case "heal": { int add = Math.min(b.amount, self.HT - self.HP); ok = add > 0; if (add > 0) { self.HP += add; if (self.sprite != null && self.sprite.visible) self.sprite.showStatusWithIcon(CharSprite.POSITIVE, Integer.toString(add), com.shatteredpixel.shatteredpixeldungeon.effects.FloatingText.HEALING); } ctl.waitTurn(); break; }
			case "say": if (self.sprite != null && self.sprite.visible && !b.say.isEmpty()) self.sprite.showStatus(CharSprite.NEUTRAL, b.say); ctl.waitTurn(); break;
			default: ctl.waitTurn();
		}
		if (!ctl.acted) MakerCharAI.spend(self, Actor.TICK);
		if (b.delay > 0) MakerCharAI.spend(self, (float) b.delay);
		MakerAIModel.after(P, sit, b.id, ok); s.next = sit.next; s.cd.clear(); s.cd.putAll(sit.cd);
		clearEv(s, tg);
		ret = true;
		return ret;
	}
	static void clearEv(St s, Map<String, Char> tg) { s.hit = false; s.attacked = false; s.hadTarget = tg.get("enemy") != null; }

	// ------------------------------------------------------------ 상황
	private static Method CHOOSE; private static Field ENEMY;
	static Char currentEnemy(Mob self) {
		try {
			if (CHOOSE == null) { CHOOSE = Mob.class.getDeclaredMethod("chooseEnemy"); CHOOSE.setAccessible(true); ENEMY = Mob.class.getDeclaredField("enemy"); ENEMY.setAccessible(true); }
			Char e = (Char) CHOOSE.invoke(self);
			ENEMY.set(self, e);   // 원래 AI 로 돌아가도 같은 적
			return e;
		} catch (Throwable t) { return null; }
	}
	static boolean hostile(Char a, Char b) { return a != b && b.isAlive() && a.alignment != Char.Alignment.NEUTRAL && b.alignment != Char.Alignment.NEUTRAL && a.alignment != b.alignment; }
	static boolean line(Char a, Char b) { try { return new Ballistica(a.pos, b.pos, Ballistica.PROJECTILE).collisionPos == b.pos; } catch (Throwable t) { return false; } }
	static boolean sees(Char self, Char c) { return c != null && self.fieldOfView != null && c.pos >= 0 && c.pos < self.fieldOfView.length && self.fieldOfView[c.pos] && c.invisible <= 0; }
	static MakerAIModel.T T(Char self, Char c) {
		MakerAIModel.T t = new MakerAIModel.T();
		t.hp = c.HP; t.ht = Math.max(1, c.HT); t.dist = Dungeon.level.distance(self.pos, c.pos); t.visible = c == self || sees(self, c); t.line = c == self || line(self, c);
		t.st = statuses(c);
		return t;
	}
	static List<String> statuses(Char c) {
		List<String> out = new ArrayList<>();
		for (Buff b : c.buffs()) {
			String n = b.getClass().getSimpleName();
			switch (n) {
				case "Burning": out.add("burning"); break; case "Poison": out.add("poison"); break; case "Slow": out.add("slow"); break; case "Weakness": out.add("weak"); break;
				case "Cripple": out.add("cripple"); break; case "Bleeding": out.add("bleed"); break; case "Blindness": out.add("blind"); break; case "Vertigo": out.add("vertigo"); break;
				case "Roots": out.add("roots"); break; case "Chill": case "Frost": out.add("frost"); break; case "Paralysis": out.add("paralysed"); break;
			}
		}
		return out;
	}
	static MakerAIModel.Sit situation(Mob self, MakerAIModel.Profile P, St s, Map<String, Char> tg) {
		MakerAIModel.Sit sit = new MakerAIModel.Sit();
		sit.turn = clock(); sit.self = T(self, self); sit.self.dist = 0;
		Char enemy = currentEnemy(self);
		if (enemy != null && (!enemy.isAlive() || Dungeon.level.distance(self.pos, enemy.pos) > P.detect && !sees(self, enemy))) enemy = null;
		Char near = null, weak = null, ally = null; int nd = 999; double wp = 2, ap = 2; int allies = 0, enemies = 0;
		for (Char c : Actor.chars()) {
			if (c == self || !c.isAlive() || !sees(self, c) || Dungeon.level.distance(self.pos, c.pos) > P.detect) continue;
			if (hostile(self, c)) {
				enemies++;
				int dd = Dungeon.level.distance(self.pos, c.pos); if (dd < nd) { nd = dd; near = c; }
				double p = c.HP / (double) Math.max(1, c.HT); if (p < wp) { wp = p; weak = c; }
			} else if (c.alignment == self.alignment) {
				allies++;
				double p = c.HP / (double) Math.max(1, c.HT); if (p < ap) { ap = p; ally = c; }
			}
		}
		if (enemy == null && self.alignment == Char.Alignment.ENEMY && near != null) enemy = near;
		Char hero = Dungeon.hero;
		put(sit, tg, self, "enemy", enemy);
		put(sit, tg, self, "hero", hero != null && hero.isAlive() && (sees(self, hero) || hero == enemy) ? hero : null);
		put(sit, tg, self, "nearestEnemy", near); put(sit, tg, self, "weakestEnemy", weak); put(sit, tg, self, "weakestAlly", ally);
		tg.put("self", self);
		sit.allies = allies; sit.enemies = enemies;
		sit.ev.put("hit", s.hit); sit.ev.put("attacked", s.attacked); sit.ev.put("targetLost", s.hadTarget && enemy == null);
		sit.cd.putAll(s.cd); sit.next = s.next;
		return sit;
	}
	static void put(MakerAIModel.Sit sit, Map<String, Char> tg, Char self, String k, Char c) { if (c == null) return; tg.put(k, c); sit.targets.put(k, T(self, c)); }

	// ------------------------------------------------------------ 공격
	/** 공격 동작 + 맞히기. turns = 이 공격이 쓰는 턴 (1 + 회복 + 대기). 동작을 보여 주면 false (끝나면 next) */
	static Boolean strike(final Mob self, final MakerAIModel.Behavior b, final MakerAIModel.Attack a, final Char t, double turns) {
		MakerCharAI.spend(self, (float) turns);
		if (a.hpCost > 0) self.HP = Math.max(1, self.HP - a.hpCost);
		final boolean shown = self.sprite != null && self.sprite.visible || t.sprite != null && t.sprite.visible;
		if (!shown || self.sprite == null) { apply(self, a, t); return true; }
		final Callback done = () -> { try { apply(self, a, t); } catch (Throwable e) { MakerRuntime.log("전투 공격 오류: " + e); } self.next(); };
		try {
			if ("ranged".equals(a.type) || "zap".equals(a.anim)) {
				self.sprite.zap(t.pos, () -> {
					if ("ranged".equals(a.type)) {
						try { com.shatteredpixel.shatteredpixeldungeon.effects.MagicMissile.boltFromChar(self.sprite.parent, com.shatteredpixel.shatteredpixeldungeon.effects.MagicMissile.MAGIC_MISSILE, self.sprite, t.pos, done); }
						catch (Throwable e) { done.call(); }
					} else done.call();
					self.sprite.idle();
				});
			} else self.sprite.attack(t.pos, () -> { done.call(); self.sprite.idle(); });
		} catch (Throwable e) { apply(self, a, t); return true; }
		return false;
	}
	/** 맞히기: 근접 · 원거리 = 대상 하나 (명중 판정), 범위 = 대상 칸 둘레 radius 안의 모두 (늘 맞음, filter · friendlyFire) */
	static void apply(Mob self, MakerAIModel.Attack a, Char t) {
		if (!a.effect.isEmpty()) try { MakerEffect.playAt(a.effect, t.pos); } catch (Throwable ignored) { }
		if (!a.sound.isEmpty()) try { MakerAudio.playSe(a.sound); } catch (Throwable ignored) { }
		if ("area".equals(a.type)) {
			int center = t.pos;
			if (a.effect.isEmpty()) try { com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter.center(center).burst(com.shatteredpixel.shatteredpixeldungeon.effects.particles.BlastParticle.FACTORY, 8); } catch (Throwable ignored) { }
			for (Char c : Actor.chars().toArray(new Char[0])) {
				if (!c.isAlive() || Dungeon.level.distance(center, c.pos) > a.radius) continue;
				boolean foe = hostile(self, c), friend = c == self || c.alignment == self.alignment;
				boolean take = "all".equals(a.filter) || ("enemies".equals(a.filter) && foe) || ("allies".equals(a.filter) && friend && c != self);
				if (take && friend && !a.friendlyFire && !"allies".equals(a.filter)) take = false;
				if (take) hitOnce(self, a, c, true);
			}
			return;
		}
		hitOnce(self, a, t, false);
	}
	static void hitOnce(Mob self, MakerAIModel.Attack a, Char t, boolean always) {
		boolean landed = false;
		for (int i = 0; i < a.hits && t.isAlive(); i++) {
			boolean hit = always || hit(self, t, (float) a.acc);
			if (!hit) { if (t.sprite != null && t.sprite.visible) t.sprite.showStatus(CharSprite.NEUTRAL, t.defenseVerb()); continue; }
			double dmg = self.damageRoll() * a.mult + a.flat;
			boolean crit = a.crit > 0 && Random.Float() * 100 < a.crit;
			if (crit) dmg *= a.critMult;
			int d = Math.max(0, (int) Math.round(dmg) - t.drRoll());
			t.damage(d, self);
			landed = true;
			if (crit && t.sprite != null && t.sprite.visible) t.sprite.showStatus(CharSprite.WARNING, "!!");
		}
		if (!landed || !t.isAlive()) return;
		if (a.stun > 0) Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Paralysis.class, (float) a.stun);
		status(t, a.status, (float) a.statusTurns);
		if (a.knockback > 0 && t != self) knock(self, t, a.knockback);
	}
	static boolean hit(Char a, Char d, float acc) { try { return Char.hit(a, d, acc, false); } catch (Throwable e) { return Random.Float() < 0.8f; } }
	static void status(Char t, String s, float turns) {
		try {
			switch (s) {
				case "burning": Buff.affect(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Burning.class).reignite(t); break;
				case "poison": Buff.affect(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison.class).set(turns); break;
				case "slow": Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Slow.class, turns); break;
				case "weak": Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Weakness.class, turns); break;
				case "cripple": Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Cripple.class, turns); break;
				case "bleed": Buff.affect(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bleeding.class).set(turns); break;
				case "blind": Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Blindness.class, turns); break;
				case "vertigo": Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vertigo.class, turns); break;
				case "roots": Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Roots.class, turns); break;
				case "frost": Buff.prolong(t, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Chill.class, turns); break;
			}
		} catch (Throwable e) { MakerRuntime.warnOnce("전투 상태 효과 오류 (" + s + "): " + e); }
	}
	static void knock(Char self, Char t, int power) {
		try {
			int w = Dungeon.level.width(), sx = self.pos % w, sy = self.pos / w, tx = t.pos % w, ty = t.pos / w;
			int dx = Integer.signum(tx - sx), dy = Integer.signum(ty - sy);
			int ex = Math.max(0, Math.min(w - 1, tx + dx * power)), ey = Math.max(0, Math.min(Dungeon.level.height() - 1, ty + dy * power));
			Ballistica tr = new Ballistica(t.pos, ex + ey * w, Ballistica.MAGIC_BOLT);
			com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfBlastWave.throwChar(t, tr, power, false, true, self);
		} catch (Throwable e) { MakerRuntime.warnOnce("전투 밀치기 오류: " + e); }
	}

	// ------------------------------------------------------------ 쓰러질 때 (on: death — 범위 공격 · 말 · 회복은 의미 없음)
	static void onDeath(Mob self) {
		try {
			Prof pf = profFor(self); if (pf == null) return;
			St s = st(self);
			Map<String, Char> tg = new HashMap<>();
			MakerAIModel.Sit sit = situation(self, pf.P, s, tg); sit.rng = Random::Float;
			for (MakerAIModel.Behavior b : pf.P.behaviors) {
				if (!b.enabled || !"death".equals(b.on)) continue;
				MakerAIModel.Ctx ctx = new MakerAIModel.Ctx(); ctx.sit = sit; ctx.T = "self".equals(b.target) ? sit.self : sit.targets.get(b.target);
				if (!MakerAIModel.evalCond(b.when, ctx)) continue;
				if (b.chance < 100 && !(ctx.roll() * 100 < b.chance)) continue;
				if ("say".equals(b.action) && self.sprite != null && !b.say.isEmpty()) self.sprite.showStatus(CharSprite.NEUTRAL, b.say);
				if ("attack".equals(b.action)) { MakerAIModel.Attack a = pf.P.attack(b.attack); if (a != null) apply(self, a, "area".equals(a.type) ? self : tg.getOrDefault(b.target, self)); }
				s.used.merge(b.id, 1, Integer::sum); s.last = b.id + ":death";
				if (pf.raw.getBoolean("debug", false)) MakerRuntime.log("[AI] " + MakerCharAI.charId(self) + " 쓰러짐 → " + b.id);
			}
		} catch (Throwable t) { MakerRuntime.log("전투 쓰러질 때 오류: " + t); }
	}
}
