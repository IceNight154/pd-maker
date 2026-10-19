/*
 * PDMaker — 캐릭터 AI · 공격 프로필 규칙 (8차). 편집기 editor/renderer/js/aimodel.js (PDM.aiModel) 와 같은 규칙 — 같은 입력이면 같은 결과
 *   (tools/tests/run.js 가 이 파일을 javac 로 컴파일 · 실행해 편집기 결과와 비교: tools/tests/AIModelCheck.java)
 *   데이터 characters/<id>.json combat { version, enabled, detect, behaviors, attacks } — 형식은 aimodel.js 머리말
 *   게임 라이브러리를 쓰지 않음 (MakerTitleModel.Val 로 읽음) — 게임 상황을 Sit 로 넘기면 고를 행동을 돌려줌. 실제로 움직이고 때리는 것은 MakerCharAI
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitleModel.Val;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class MakerAIModel {

	public static final List<String> ACTIONS = Arrays.asList("attack", "approach", "retreat", "keep", "flee", "wander", "patrol", "wait", "heal", "protect", "say", "default");
	public static final List<String> TARGETS = Arrays.asList("enemy", "hero", "nearestEnemy", "weakestEnemy", "weakestAlly", "self");
	public static final List<String> TYPES = Arrays.asList("melee", "ranged", "area");
	public static final List<String> KEYS = Arrays.asList("hp", "targetHp", "dist", "visible", "line", "hasTarget", "chance", "turn", "event", "allies", "enemies", "status", "targetStatus", "ready");
	public static final List<String> CMPS = Arrays.asList("<", "<=", ">", ">=", "==", "!=");
	public static final List<String> EVENTS = Arrays.asList("hit", "attacked", "targetLost");
	public static final List<String> ONS = Arrays.asList("", "hit", "attacked", "targetLost", "death");
	public static final List<String> STATUS = Arrays.asList("burning", "poison", "slow", "weak", "cripple", "bleed", "blind", "vertigo", "roots", "frost");
	public static final List<String> FILTERS = Arrays.asList("enemies", "allies", "all");
	static final List<String> NEEDS_TARGET = Arrays.asList("attack", "approach", "retreat", "keep", "flee", "protect");
	static final List<String> STR_KEYS = Arrays.asList("event", "status", "targetStatus", "ready");
	static final List<String> BOOL_KEYS = Arrays.asList("visible", "line", "hasTarget");

	// ------------------------------------------------------------ 읽기 (aimodel.js 의 num · str · bool · clamp 와 같음)
	static double clamp(double v, double lo, double hi) { return Math.min(hi, Math.max(lo, v)); }
	static double num(Val o, String k, double d) { return o == null || !o.isObject() ? d : o.num(k, d); }
	static String str(Val o, String k, String d) {
		if (o == null || !o.isObject() || !o.has(k)) return d;
		Val v = o.get(k);
		if (v == null || v.isObject() || v.isArray()) return d;
		String s = o.str(k, null);
		if (s == null) return d;
		if (!v.isString()) { double n = o.num(k, Double.NaN); return Double.isNaN(n) || Double.isInfinite(n) ? d : s; }   // 숫자 → 글 (true/false 는 글이 아님)
		return s;
	}
	static boolean bool(Val o, String k, boolean d) { return o == null || !o.isObject() ? d : o.bool(k, d); }
	static double cnum(Val o, String k, double d, double lo, double hi) { return clamp(num(o, k, d), lo, hi); }
	static int cint(Val o, String k, double d, double lo, double hi) { return (int) clamp(Math.round(num(o, k, d)), lo, hi); }
	static String pick(Val o, String k, List<String> list, String d) { String v = str(o, k, d); return list.contains(v) ? v : d; }
	static List<Val> objs(Val a) { List<Val> out = new ArrayList<>(); if (a == null || !a.isArray()) return out; for (int i = 0; i < a.size(); i++) { Val v = a.at(i); if (v != null && v.isObject()) out.add(v); } return out; }

	// ------------------------------------------------------------ 정리된 프로필
	public static class Attack {
		public String id, name, type, status, filter, anim, effect, sound;
		public int range, radius, flat, hits, hpCost, knockback;
		public double windup, recovery, mult, acc, crit, critMult, cooldown, stun, statusTurns;
		public boolean friendlyFire, projectile;
	}
	public static class Cond {
		public String op, k, cmp, sv = ""; public double v; public boolean not; public List<Cond> items;
	}
	public static class Behavior {
		public String id, name, action, attack, say, target, next, fail, on;
		public boolean enabled, interrupt;
		public double priority, cooldown, chance, weight, delay;
		public int dist, amount;
		public Cond when;
	}
	public static class Profile {
		public int version, detect; public boolean enabled;
		public List<Attack> attacks = new ArrayList<>(); public List<Behavior> behaviors = new ArrayList<>();
		public Attack attack(String id) { for (Attack a : attacks) if (a.id.equals(id)) return a; return null; }
		public Behavior behavior(String id) { for (Behavior b : behaviors) if (b.id.equals(id)) return b; return null; }
	}

	static Attack normAttack(Val a) {
		Attack o = new Attack();
		o.type = pick(a, "type", TYPES, "melee");
		o.id = str(a, "id", ""); o.name = str(a, "name", "");
		o.range = cint(a, "range", "melee".equals(o.type) ? 1 : 4, 1, 20); o.radius = cint(a, "radius", 1, 0, 6);
		o.windup = cnum(a, "windup", 0, 0, 10); o.recovery = cnum(a, "recovery", 0, 0, 10);
		o.mult = cnum(a, "mult", 1, 0, 20); o.flat = cint(a, "flat", 0, -999, 999); o.acc = cnum(a, "acc", 1, 0, 10);
		o.crit = cnum(a, "crit", 0, 0, 100); o.critMult = cnum(a, "critMult", 1.5, 1, 10); o.hits = cint(a, "hits", 1, 1, 10);
		o.cooldown = cnum(a, "cooldown", 0, 0, 100); o.hpCost = cint(a, "hpCost", 0, 0, 9999);
		o.knockback = cint(a, "knockback", 0, 0, 10); o.stun = cnum(a, "stun", 0, 0, 20);
		List<String> st = new ArrayList<>(); st.add(""); st.addAll(STATUS);
		o.status = pick(a, "status", st, ""); o.statusTurns = cnum(a, "statusTurns", 3, 1, 50);
		o.filter = pick(a, "filter", FILTERS, "enemies"); o.friendlyFire = bool(a, "friendlyFire", false); o.projectile = bool(a, "projectile", true);
		o.anim = pick(a, "anim", Arrays.asList("attack", "zap"), "ranged".equals(o.type) ? "zap" : "attack"); o.effect = str(a, "effect", ""); o.sound = str(a, "sound", "");
		return o;
	}
	static Cond normCond(Val c, int depth) {
		if (c == null || !c.isObject() || depth > 8) return null;
		Cond o = new Cond();
		o.not = bool(c, "not", false);
		Val items = c.get("items");
		if (items != null && items.isArray()) {
			o.op = pick(c, "op", Arrays.asList("and", "or"), "and");
			o.items = new ArrayList<>();
			for (int i = 0; i < items.size(); i++) { Cond x = normCond(items.at(i), depth + 1); if (x != null) o.items.add(x); }
			return o;
		}
		o.k = pick(c, "k", KEYS, "?"); o.cmp = pick(c, "cmp", CMPS, ">=");
		if (STR_KEYS.contains(o.k)) o.sv = str(c, "v", ""); else o.v = num(c, "v", 0);
		return o;
	}
	static Behavior normBehavior(Val b) {
		Behavior o = new Behavior();
		o.id = str(b, "id", ""); o.name = str(b, "name", ""); o.enabled = bool(b, "enabled", true); o.priority = cnum(b, "priority", 0, -1000, 1000);
		o.when = normCond(b.get("when"), 0); o.action = pick(b, "action", ACTIONS, "default"); o.attack = str(b, "attack", "");
		o.dist = cint(b, "dist", 3, 1, 20); o.amount = cint(b, "amount", 5, 0, 9999); o.say = str(b, "say", ""); o.target = pick(b, "target", TARGETS, "enemy");
		o.cooldown = cnum(b, "cooldown", 0, 0, 1000); o.chance = cnum(b, "chance", 100, 0, 100); o.weight = cnum(b, "weight", 1, 0, 1000);
		o.delay = cnum(b, "delay", 0, 0, 20); o.next = str(b, "next", ""); o.fail = str(b, "fail", ""); o.interrupt = bool(b, "interrupt", true); o.on = pick(b, "on", ONS, "");
		return o;
	}
	public static Profile normalize(Val p) {
		Profile o = new Profile();
		o.version = cint(p, "version", 1, 1, 1000); o.enabled = bool(p, "enabled", true); o.detect = cint(p, "detect", 8, 1, 30);
		if (p != null && p.isObject()) {
			for (Val a : objs(p.get("attacks"))) o.attacks.add(normAttack(a));
			for (Val b : objs(p.get("behaviors"))) o.behaviors.add(normBehavior(b));
		}
		return o;
	}

	// ------------------------------------------------------------ 상황
	public static class T {
		public double hp, ht = 1, dist; public boolean visible = true, line = true; public List<String> st = new ArrayList<>();
		public T copy() { T t = new T(); t.hp = hp; t.ht = ht; t.dist = dist; t.visible = visible; t.line = line; t.st = new ArrayList<>(st); return t; }
	}
	public static class Sit {
		public double turn, allies, enemies;
		public T self = new T();
		public Map<String, T> targets = new HashMap<>();
		public Map<String, Boolean> ev = new HashMap<>();
		public Map<String, Double> cd = new LinkedHashMap<>();
		public String next = "";
		public double[] rolls = new double[0];
		/** 난수를 rolls 대신 게임 난수로 (런타임) */
		public java.util.function.DoubleSupplier rng;
		T target(String k) { if ("self".equals(k)) { T t = targets.get("self"); if (t != null) return t; T s = self.copy(); s.dist = 0; return s; } return targets.get(k); }
		boolean ev(String k) { Boolean b = ev.get(k); return b != null && b; }
		double cd(String k) { Double v = cd.get(k); return v == null ? Double.NEGATIVE_INFINITY : v; }
	}
	static T readT(Val t) {
		if (t == null || !t.isObject()) return null;
		T o = new T(); o.hp = num(t, "hp", 0); o.ht = num(t, "ht", 1); o.dist = num(t, "dist", 0); o.visible = bool(t, "visible", true); o.line = bool(t, "line", true);
		Val st = t.get("st"); if (st != null && st.isArray()) for (int i = 0; i < st.size(); i++) { Val x = st.at(i); if (x != null && x.isString()) o.st.add(x.asString()); }
		return o;
	}
	/** 편집기와 같은 상황 JSON 읽기 (검사 · 시뮬레이터 비교용) */
	public static Sit readSit(Val s) {
		Sit o = new Sit();
		o.turn = num(s, "turn", 0); o.allies = num(s, "allies", 0); o.enemies = num(s, "enemies", 0); o.next = str(s, "next", "");
		T self = readT(s == null ? null : s.get("self")); if (self != null) o.self = self; else { o.self.hp = 1; o.self.ht = 1; }
		Val tg = s == null ? null : s.get("targets");
		for (String k : TARGETS) { T t = readT(tg == null || !tg.isObject() ? null : tg.get(k)); if (t != null) o.targets.put(k, t); }
		Val ev = s == null ? null : s.get("ev");
		for (String e : EVENTS) o.ev.put(e, ev != null && ev.isObject() && ev.has(e) && ev.bool(e, false) && ev.bool(e, true));
		Val cd = s == null ? null : s.get("cd");
		if (cd != null && cd.isObject()) for (String k : keys(cd)) { double v = cd.num(k, Double.NaN); Val x = cd.get(k); if (x != null && !x.isString() && !Double.isNaN(v) && !Double.isInfinite(v)) o.cd.put(k, v); }
		Val r = s == null ? null : s.get("rolls");
		if (r != null && r.isArray()) { List<Double> l = new ArrayList<>(); for (int i = 0; i < r.size(); i++) { Val x = r.at(i); if (x == null || x.isString() || x.isObject() || x.isArray()) continue; try { double d = Double.parseDouble(x.asString()); if (!Double.isNaN(d) && !Double.isInfinite(d)) l.add(d); } catch (Exception ignored) { } } o.rolls = new double[l.size()]; for (int i = 0; i < l.size(); i++) o.rolls[i] = l.get(i); }
		return o;
	}
	/** Val 객체의 키 목록 (Val 에는 없음) — KeyList 를 구현한 Val 만 (검사 프로그램 AIModelCheck · 런타임 MakerCharAI 의 JSON 어댑터) */
	public interface KeyList { List<String> keys(); }
	static List<String> keys(Val v) { return v instanceof KeyList ? ((KeyList) v).keys() : new ArrayList<>(); }

	// ------------------------------------------------------------ 조건
	static boolean cmp(double a, String op, double b) {
		switch (op) { case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b; case "==": return a == b; default: return a != b; }
	}
	static double pct(T t) { return t != null && t.ht > 0 ? t.hp / t.ht * 100 : 0; }
	static final class Ctx { Sit sit; T T; int used; Map<String, Boolean> conds = new LinkedHashMap<>();
		double roll() { double r = sit.rng != null ? sit.rng.getAsDouble() : sit.rolls.length > 0 ? sit.rolls[used % sit.rolls.length] : 0.5; used++; return r; } }
	static boolean evalCond(Cond c, Ctx ctx) {
		if (c == null) return true;
		if (c.items != null) {
			boolean any = false, all = true;
			for (Cond x : c.items) { boolean ok = evalCond(x, ctx); any |= ok; all &= ok; }   // 모든 자식을 끝까지 (난수 순서)
			boolean ok = c.items.isEmpty() || ("or".equals(c.op) ? any : all);
			return c.not != ok;
		}
		Sit s = ctx.sit; T t = ctx.T; boolean ok;
		switch (c.k) {
			case "hp": ok = cmp(pct(s.self), c.cmp, c.v); break;
			case "targetHp": ok = t != null && cmp(pct(t), c.cmp, c.v); break;
			case "dist": ok = t != null && cmp(t.dist, c.cmp, c.v); break;
			case "visible": ok = t != null && t.visible; break;
			case "line": ok = t != null && t.line; break;
			case "hasTarget": ok = t != null; break;
			case "chance": ok = ctx.roll() * 100 < c.v; break;
			case "turn": ok = cmp(s.turn, c.cmp, c.v); break;
			case "event": ok = s.ev(c.sv); break;
			case "allies": ok = cmp(s.allies, c.cmp, c.v); break;
			case "enemies": ok = cmp(s.enemies, c.cmp, c.v); break;
			case "status": ok = s.self.st.contains(c.sv); break;
			case "targetStatus": ok = t != null && t.st.contains(c.sv); break;
			case "ready": ok = !(s.cd("a:" + c.sv) > s.turn); break;
			default: ok = false;
		}
		return c.not != ok;
	}

	// ------------------------------------------------------------ 고르기
	public static class Result {
		public String id, action = "default", attack = "", target = "", reason;
		public List<String[]> trace = new ArrayList<>();   // { 행동 id, 이유 코드 }
		public int rolls;
		public Behavior behavior; public Attack att;
	}
	static String check(Profile P, Behavior b, Sit sit, Ctx ctx) {
		if (!b.enabled) return "disabled";
		if ("death".equals(b.on)) return "death";
		if (!b.on.isEmpty() && !sit.ev(b.on)) return "event";
		if (sit.cd("b:" + b.id) > sit.turn) return "cooldown";
		T t = sit.target(b.target);
		if (NEEDS_TARGET.contains(b.action) && t == null) return "noTarget";
		ctx.T = t;
		boolean c = evalCond(b.when, ctx);
		ctx.conds.put(b.id, c);
		if (!c) return "cond";
		if ("attack".equals(b.action)) {
			Attack a = P.attack(b.attack);
			if (a == null) return "noAttack";
			if (sit.cd("a:" + a.id) > sit.turn) return "attackCd";
			if (t.dist > a.range) return "range";
			if ("ranged".equals(a.type) && a.projectile && !t.line) return "line";
			if (a.hpCost > 0 && a.hpCost >= sit.self.hp) return "cost";
		}
		if (b.chance < 100 && !(ctx.roll() * 100 < b.chance)) return "chance";
		return "ok";
	}
	static Result done(Profile P, Behavior b, String reason, List<String[]> trace, Ctx ctx) {
		Result r = new Result();
		r.behavior = b; r.reason = reason; r.trace = trace; r.rolls = ctx.used;
		if (b != null) { r.id = b.id; r.action = b.action; r.target = b.target; r.att = "attack".equals(b.action) ? P.attack(b.attack) : null; r.attack = r.att == null ? "" : r.att.id; }
		return r;
	}
	public static Result decide(Profile P, Sit sit) {
		Ctx ctx = new Ctx(); ctx.sit = sit;
		List<String[]> trace = new ArrayList<>();
		if (!P.enabled) return done(P, null, "disabled", trace, ctx);
		List<Behavior> order = new ArrayList<>(P.behaviors);
		order.sort((x, y) -> Double.compare(y.priority, x.priority));   // 안정 정렬 — 같은 우선순위는 목록 순서
		String chained = "";
		if (!sit.next.isEmpty()) {
			Behavior nb = P.behavior(sit.next);
			if (nb != null) {
				chained = nb.id;
				String why = check(P, nb, sit, ctx);
				trace.add(new String[]{ nb.id, "ok".equals(why) ? "chain" : why });
				if ("ok".equals(why)) return done(P, nb, "chain", trace, ctx);
			}
		}
		List<Behavior> cand = new ArrayList<>(); Double level = null;
		for (Behavior b : order) {
			if (!chained.isEmpty() && b.id.equals(chained)) continue;
			if (level != null && b.priority < level) { trace.add(new String[]{ b.id, "lower" }); continue; }
			String why = check(P, b, sit, ctx);
			trace.add(new String[]{ b.id, why });
			if ("ok".equals(why)) { cand.add(b); level = b.priority; }
		}
		if (cand.isEmpty()) return done(P, null, P.behaviors.isEmpty() ? "empty" : "none", trace, ctx);
		if (cand.size() == 1) return done(P, cand.get(0), "chosen", trace, ctx);
		double total = 0; for (Behavior b : cand) total += b.weight;
		if (total <= 0) return done(P, cand.get(0), "chosen", trace, ctx);
		double r = ctx.roll() * total;
		for (Behavior b : cand) { r -= b.weight; if (r < 0) return done(P, b, "weighted", trace, ctx); }
		return done(P, cand.get(cand.size() - 1), "weighted", trace, ctx);
	}
	/** 행동을 한 뒤: 재사용 대기 · 이어서 할 행동 (sit.cd · sit.next 를 고침) */
	public static void after(Profile P, Sit sit, String id, boolean ok) {
		Behavior b = id == null ? null : P.behavior(id);
		if (b == null) { sit.next = ""; return; }
		if (b.cooldown > 0) sit.cd.put("b:" + b.id, sit.turn + b.cooldown);
		Attack a = "attack".equals(b.action) ? P.attack(b.attack) : null;
		if (a != null && ok && a.cooldown > 0) sit.cd.put("a:" + a.id, sit.turn + a.cooldown);
		sit.next = ok ? b.next : b.fail;
	}
	/** 행동 한 번이 쓰는 턴 (aimodel.js turns 와 같음) */
	public static double turns(Profile P, String id) {
		Behavior b = id == null ? null : P.behavior(id);
		if (b == null) return 1;
		Attack a = "attack".equals(b.action) ? P.attack(b.attack) : null;
		return (a != null ? a.windup + 1 + a.recovery : 1) + b.delay;
	}

	// ------------------------------------------------------------ 검사 (aimodel.js validate 와 같은 코드 · 경로) — 오류가 하나라도 있으면 게임은 이 프로필을 쓰지 않음
	public static class Issue { public String level, code, path, msg; Issue(String l, String c, String p, String m) { level = l; code = c; path = p; msg = m; } }
	public static List<Issue> validate(Val raw) {
		List<Issue> out = new ArrayList<>();
		if (raw == null || !raw.isObject()) { out.add(new Issue("error", "shape", "", "전투 설정이 객체가 아닙니다")); return out; }
		Profile P = normalize(raw);
		if (num(raw, "version", 1) > 1) out.add(new Issue("warn", "version", "version", "더 새 형식"));
		List<Val> rawA = objs(raw.get("attacks")), rawB = objs(raw.get("behaviors"));
		Set<String> seenA = new HashSet<>(), seenB = new HashSet<>();
		for (int i = 0; i < P.attacks.size(); i++) {
			Attack a = P.attacks.get(i); Val r = rawA.get(i); String p = "attacks." + i;
			if (a.id.isEmpty()) out.add(new Issue("error", "noId", p, "공격 id 없음")); else if (!seenA.add(a.id)) out.add(new Issue("error", "dupId", p, "공격 id 겹침 " + a.id));
			for (String k : new String[]{ "windup", "recovery", "cooldown", "stun", "statusTurns", "hpCost", "hits", "range", "radius", "knockback" }) if (num(r, k, 0) < 0) out.add(new Issue("error", "negative", p + "." + k, k + " 음수"));
			if (r.has("type") && !TYPES.contains(str(r, "type", "\u0000"))) out.add(new Issue("warn", "attackType", p + ".type", "모르는 종류"));
			String rs = str(r, "status", ""); if (!rs.isEmpty() && !STATUS.contains(rs)) out.add(new Issue("warn", "unsupported", p + ".status", "모르는 상태 " + rs));
			if (num(r, "crit", 0) > 100) out.add(new Issue("warn", "range", p + ".crit", "치명 확률 0~100"));
		}
		for (int i = 0; i < P.behaviors.size(); i++) {
			Behavior b = P.behaviors.get(i); Val r = rawB.get(i); String p = "behaviors." + i;
			if (b.id.isEmpty()) out.add(new Issue("error", "noId", p, "행동 id 없음")); else if (!seenB.add(b.id)) out.add(new Issue("error", "dupId", p, "행동 id 겹침 " + b.id));
			for (String k : new String[]{ "cooldown", "delay", "weight", "chance", "dist", "amount" }) if (num(r, k, 0) < 0) out.add(new Issue("error", "negative", p + "." + k, k + " 음수"));
			if (num(r, "chance", 100) > 100) out.add(new Issue("warn", "range", p + ".chance", "확률 0~100"));
			if (r.has("action") && !ACTIONS.contains(str(r, "action", "\u0000"))) out.add(new Issue("error", "action", p + ".action", "모르는 동작"));
			if ("attack".equals(b.action) && b.attack.isEmpty()) out.add(new Issue("error", "actionNoAttack", p + ".attack", "공격 없음"));
			else if ("attack".equals(b.action) && P.attack(b.attack) == null) out.add(new Issue("error", "attackRef", p + ".attack", "없는 공격 " + b.attack));
			if ("attack".equals(b.action) && "self".equals(b.target)) out.add(new Issue("warn", "targetSelf", p + ".target", "자기 자신 공격"));
			if (!b.next.isEmpty() && P.behavior(b.next) == null) out.add(new Issue("error", "nextRef", p + ".next", "없는 행동 " + b.next));
			if (!b.fail.isEmpty() && P.behavior(b.fail) == null) out.add(new Issue("error", "failRef", p + ".fail", "없는 행동 " + b.fail));
			if ("death".equals(b.on) && !Arrays.asList("attack", "say", "heal").contains(b.action)) out.add(new Issue("warn", "deathAction", p + ".action", "쓰러질 때는 공격 · 말하기만"));
			walk(r.get("when"), p + ".when", P, out);
		}
		Map<String, Behavior> by = new LinkedHashMap<>(); for (Behavior b : P.behaviors) if (!by.containsKey(b.id)) by.put(b.id, b);
		Set<String> reported = new HashSet<>();
		for (Behavior b0 : P.behaviors) for (String k : new String[]{ "next", "fail" }) {
			List<String> path = new ArrayList<>(); path.add(b0.id);
			Behavior cur = by.get("next".equals(k) ? b0.next : b0.fail);
			while (cur != null && path.size() <= P.behaviors.size()) {
				if (cur.id.equals(b0.id)) {
					List<String> sorted = new ArrayList<>(path); java.util.Collections.sort(sorted); String key = String.join("|", sorted);
					boolean allHot = true; for (String id : path) allHot &= hot(P, by.get(id));
					if (!reported.contains(key) && allHot) { reported.add(key); out.add(new Issue(path.size() == 1 ? "error" : "warn", path.size() == 1 ? "selfNext" : "cycle", "behaviors." + P.behaviors.indexOf(b0) + "." + k, "고리")); }
					break;
				}
				if (path.contains(cur.id)) break;
				path.add(cur.id);
				Behavior nx = by.get(cur.next); cur = nx != null ? nx : by.get(cur.fail);
			}
		}
		if (P.enabled && P.behaviors.isEmpty()) out.add(new Issue("warn", "noBehaviors", "behaviors", "행동 없음"));
		return out;
	}
	static boolean hot(Profile P, Behavior b) { Attack a = "attack".equals(b.action) ? P.attack(b.attack) : null; return b.cooldown <= 0 && b.delay <= 0 && !(a != null && a.cooldown > 0); }
	static void walk(Val c, String cp, Profile P, List<Issue> out) {
		if (c == null || !c.isObject()) return;
		Val items = c.get("items");
		if (items != null && items.isArray()) {
			if (items.size() == 0) out.add(new Issue("warn", "emptyGroup", cp, "빈 조건 묶음"));
			for (int j = 0; j < items.size(); j++) walk(items.at(j), cp + ".items." + j, P, out);
			return;
		}
		String k = str(c, "k", "\u0000");
		if (!KEYS.contains(k)) out.add(new Issue("error", "condKey", cp, "모르는 조건 " + k));
		if (c.has("cmp") && !BOOL_KEYS.contains(k) && !STR_KEYS.contains(k) && !CMPS.contains(str(c, "cmp", "\u0000"))) out.add(new Issue("error", "condCmp", cp, "모르는 비교"));
		if ("event".equals(k) && !EVENTS.contains(str(c, "v", "\u0000"))) out.add(new Issue("warn", "condEvent", cp, "모르는 사건"));
		if ("ready".equals(k) && P.attack(str(c, "v", "\u0000")) == null) out.add(new Issue("error", "attackRef", cp, "조건의 공격 없음"));
	}
	public static boolean hasErrors(List<Issue> l) { for (Issue i : l) if ("error".equals(i.level)) return true; return false; }
}
