/*
 * 마음 시스템 (era 방식) — 에디터 heart-core.js 와 같은 계산식.
 *
 *   행동 → 자극(source) → 감정 게이지(gauge) → (층을 떠날 때) 마음의 결정(crystal) → 관계 능력(abl)
 *   + 호감도/신뢰도/분노 (era TRACHECK 규칙), 성격 보정, 흔적(mark), 태도, 관계 이정표, 반응(counter), 구상 대사, 일기
 *
 * 모든 표시 이름은 terms.json (MakerRuntime.term) 에서 가져옵니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.utils.Bundle;
import com.watabou.utils.Random;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class HeartSystem {

	/** 한 캐릭터의 마음 상태 */
	public static class Record {
		public int favor, trust, anger;
		public boolean sulk;
		/** eraTW: 무드(층마다 0) · 기분(−1/0/+1) · 언짢음(남은 층 수) · 스트레스 · 질투 누계 · 대화 피로 · 이번 층에 어울렸는지 */
		public int mood, temper, displeased, stress, jealousy, fatigue;
		public boolean warm;
		public final Map<String, Integer> gauges = new HashMap<>(), crystals = new HashMap<>(), abl = new HashMap<>(), marks = new HashMap<>(), exp = new HashMap<>(), uses = new HashMap<>();
		public final List<String> bonds = new ArrayList<>(), memory = new ArrayList<>();
		public int lastTalkTurn;
		int get(Map<String, Integer> m, String k) { Integer v = m.get(k); return v == null ? 0 : v; }
		void add(Map<String, Integer> m, String k, int d) { m.put(k, get(m, k) + d); }
	}

	private static final Map<String, Record> records = new LinkedHashMap<>();
	/** 같은 층 입장이 두 번 처리되지 않게 (불러오기 때 GameScene 이 다시 만들어짐) */
	private static String lastFloorKey = "";

	public static void reset() { records.clear(); lastFloorKey = ""; }
	/** 만난(기록이 생긴) 캐릭터 id, 만난 순서 */
	public static List<String> knownIds() { return new ArrayList<>(records.keySet()); }
	static JsonValue sys() { return MakerRuntime.heart; }

	/** 마음의 결정 (era JUEL) — 예전 이름 gem.<광물> → crystal.<감정> (heart-core.js GEM_TO_CRYSTAL 과 같음) */
	static String crystalKey(String k) {
		if (k == null || k.isEmpty() || k.startsWith("crystal.")) return k == null ? "" : k;
		switch (k) {
			case "gem.sunstone": case "gem.morganite": case "gem.goshenite": case "gem.heliodor": return "crystal.joy";
			case "gem.emerald": return "crystal.relief"; case "gem.enstatite": return "crystal.tension"; case "gem.obsidian": return "crystal.fear";
			case "gem.ruby": return "crystal.anger"; case "gem.amethyst": return "crystal.shy";
			case "gem.lapis": case "gem.diamond": return "crystal.respect"; case "gem.aquamarine": return "crystal.sorrow";
		}
		return k.startsWith("gem.") ? "crystal." + k.substring(4) : k;
	}
	static String gaugeCrystal(JsonValue g) {
		String c = g.getString("crystal", "");
		if (c.isEmpty()) c = crystalKey(g.getString("gem", ""));
		if (c.isEmpty()) c = "crystal." + g.getString("key", "").replace("gauge.", "");
		return c;
	}
	/** 결정 목록 (예전 heart.json 은 gems) */
	static List<String> crystalList() {
		List<String> out = new ArrayList<>();
		JsonValue l = sys().get("crystals");
		if (l == null) l = sys().get("gems");
		if (l != null) for (JsonValue v : l) { String k = crystalKey(v.isString() ? v.asString() : v.getString("key", "")); if (!out.contains(k)) out.add(k); }
		for (JsonValue g : sys().get("gauges")) { String k = gaugeCrystal(g); if (!out.contains(k)) out.add(k); }
		return out;
	}
	static JsonValue rules() { JsonValue r = sys().get("rules"); return r != null ? r : new JsonValue(JsonValue.ValueType.object); }
	static int ri(String k, int d) { return rules().getInt(k, d); }
	static float rf(String k, float d) { return rules().getFloat(k, d); }
	static boolean rb(String k, boolean d) { return rules().getBoolean(k, d); }
	static int[] rarr(String k, int[] d) {
		JsonValue a = rules().get(k); if (a == null || !a.isArray()) return d;
		int[] o = new int[a.size]; for (int i = 0; i < o.length; i++) o[i] = a.get(i).asInt(); return o;
	}
	static float[] rfarr(String k, float[] d) {
		JsonValue a = rules().get(k); if (a == null || !a.isArray()) return d;
		float[] o = new float[a.size]; for (int i = 0; i < o.length; i++) o[i] = a.get(i).asFloat(); return o;
	}
	/** 규칙 안의 {이름: 수} 표 (없으면 기본값) */
	static Map<String, Float> rmap(String k, String defs) {
		Map<String, Float> m = new LinkedHashMap<>();
		JsonValue o = rules().get(k);
		if (o == null) o = new com.badlogic.gdx.utils.JsonReader().parse(defs);
		for (JsonValue v : o) m.put(v.name, v.asFloat());
		return m;
	}
	static int moodMax() { return Math.max(1, ri("moodMax", 500)); }
	static int angerMax() { return Math.max(1, ri("angerMax", 1000)); }

	public static boolean enabled(String charId) {
		JsonValue c = MakerRuntime.character(charId);
		return sys() != null && c != null && c.get("heart") != null && c.get("heart").getBoolean("enabled", false);
	}
	public static Record rec(String charId) {
		Record r = records.get(charId);
		if (r == null) {
			r = new Record();
			JsonValue c = MakerRuntime.character(charId);
			JsonValue init = c == null || c.get("heart") == null ? null : c.get("heart").get("initial");
			if (init != null) { r.favor = init.getInt("favor", 0); r.trust = init.getInt("trust", 0); }
			records.put(charId, r);
		}
		return r;
	}

	// ------------------------------------------------------------ 조회

	public static int stage(Record r) {
		int s = 0, i = 0;
		for (JsonValue st : sys().get("stages")) { if (r.favor >= st.getInt("favor", 0) && r.trust >= st.getInt("trust", 0)) s = i; i++; }
		return s;
	}
	public static String stageName(Record r) { return sys().get("stages").get(stage(r)).getString("name", ""); }

	/** 마음 열림 (era 합의판정) — heart.json acceptance 표 (없으면 기본 표) */
	static final String ACCEPT_DEFAULT = "{favor:[[0,0],[100,30],[300,50],[800,75],[1500,100],[3000,150],[6000,200]],trust:[[0,-30],[30,-10],[100,0],[300,30],[500,50],[1000,100]],"
		+ "bonds:{bond.admire:30,bond.close:60,bond.partner:100},abl:{abl.intimacy:10},moodDiv:5,marks:{mark.joy:20,mark.awe:10,mark.resent:-30,mark.fear:-20,mark.hurt:-10},levels:[100,250,450]}";
	private static JsonValue acceptDefault;
	static JsonValue acceptCfg(String key) {
		JsonValue a = sys().get("acceptance");
		if (a != null && a.get(key) != null) return a.get(key);
		if (acceptDefault == null) acceptDefault = new com.badlogic.gdx.utils.JsonReader().parse(ACCEPT_DEFAULT);
		return acceptDefault.get(key);
	}
	static int tier(JsonValue table, int v) { int p = 0; if (table != null) for (JsonValue row : table) if (v >= row.get(0).asInt()) p = row.get(1).asInt(); return p; }
	public static int acceptance(Record r) {
		int s = tier(acceptCfg("favor"), r.favor) + tier(acceptCfg("trust"), r.trust);
		JsonValue b = acceptCfg("bonds"); if (b != null) for (JsonValue v : b) if (r.bonds.contains(v.name)) s += v.asInt();
		JsonValue ab = acceptCfg("abl"); if (ab != null) for (JsonValue v : ab) s += Math.min(r.get(r.abl, v.name), 20) * v.asInt();
		JsonValue mk = acceptCfg("marks"); if (mk != null) for (JsonValue v : mk) s += r.get(r.marks, v.name) * v.asInt();
		JsonValue md = acceptCfg("moodDiv");
		s += r.mood / Math.max(1, md == null ? 5 : md.asInt());
		s += r.temper * 20;
		return s;
	}
	public static int acceptLevel(Record r) {
		if (r.sulk || r.displeased > 0) return 0;
		int s = acceptance(r), lv = 0, i = 0;
		JsonValue lvs = acceptCfg("levels");
		if (lvs != null) for (JsonValue th : lvs) { i++; if (s >= th.asInt()) lv = i; }
		return lv;
	}
	static int stressTier(Record r) { int t = 0, i = 0; for (int th : rarr("stressTiers", new int[]{100, 250, 500, 1000, 3000})) { i++; if (r.stress >= th) t = i; } return t; }

	/** 캐릭터 문맥 조건식 이름 해석 (없으면 전역으로) */
	public static Cond.Resolver resolver(final String charId) {
		return name -> {
			Object v = resolve(charId, name);
			return v != null ? v : StoryState.resolveGlobal(name, null);
		};
	}
	public static Object resolve(String charId, String name) {
		if (sys() == null) return null;
		Record r = rec(charId);
		switch (name) {
			case "favor": return r.favor;
			case "trust": return r.trust;
			case "anger": return r.anger;
			case "sulk": return r.sulk;
			case "mood": return r.mood;
			case "stage": return stage(r);
			case "temper": return r.temper;
			case "displeased": return r.displeased > 0;
			case "stress": return r.stress;
			case "jealousy": return r.jealousy;
			case "fatigue": return r.fatigue;
			case "warm": return r.warm;
			case "accept": return acceptance(r);
			case "acceptLv": return acceptLevel(r);
			case "moodFull": return r.mood >= moodMax();
		}
		if (name.startsWith("gauge.")) return r.get(r.gauges, name);
		if (name.startsWith("crystal.")) return r.get(r.crystals, name);
		if (name.startsWith("gem.")) return r.get(r.crystals, crystalKey(name));   // 예전 이름
		if (name.startsWith("abl.")) return r.get(r.abl, name);
		if (name.startsWith("mark.")) return r.get(r.marks, name);
		if (name.startsWith("exp.")) return r.get(r.exp, name);
		if (name.startsWith("bond.")) return r.bonds.contains(name);
		if (name.startsWith("att.")) return attitude(charId).equals(name);
		if (name.startsWith("memory.")) return r.memory.contains(name.substring(7));
		if (name.startsWith("uses.")) return r.get(r.uses, name.substring(5));
		return null;
	}

	public static String attitude(final String charId) {
		final Record r = rec(charId);
		Cond.Resolver noAtt = name -> name.startsWith("att.") ? Boolean.FALSE : resolve(charId, name);
		for (JsonValue a : sys().get("attitudes")) if (Cond.eval(a.getString("when", ""), noAtt)) return a.getString("key");
		return "att.indifferent";
	}

	// ------------------------------------------------------------ 행동 적용 (heart-core.js applyAction 과 같은 식)

	public static class Result {
		public int fav, tru, anger, mood;
		public String outcome = "ok";
		public boolean capped, gotSulk, calmed, stageUp;
		public final List<String> jealous = new ArrayList<>();
	}

	static JsonValue action(String key) {
		if (sys() == null || sys().get("actions") == null) return null;
		for (JsonValue a : sys().get("actions")) if (key.equals(a.getString("key", ""))) return a;
		return null;
	}
	static int valence(String g) {
		for (JsonValue d : sys().get("gauges")) if (g.equals(d.getString("key", ""))) { if (d.has("valence")) return d.getInt("valence"); break; }
		switch (g) { case "gauge.joy": case "gauge.relief": case "gauge.respect": return 1; case "gauge.fear": case "gauge.anger": case "gauge.sorrow": return -1; default: return 0; }
	}
	static JsonValue gaugeDef(String g) { for (JsonValue d : sys().get("gauges")) if (g.equals(d.getString("key", ""))) return d; return null; }
	static double soft(double v) { for (int th : rarr("moodSoft", new int[]{50, 100, 200})) { if (v <= th || th == 0) return v; v = th + Math.sqrt(v - th) * 2; } return v; }

	/** 게임 안에서: 곁에서 보고 있는(시야 안의) 다른 마음 캐릭터 */
	static List<String> onlookers(String charId) {
		List<String> out = new ArrayList<>();
		if (Dungeon.level == null) return out;
		for (Mob m : Dungeon.level.mobs.toArray(new Mob[0])) {
			if (!(m instanceof MakerNPC)) continue;
			String id = ((MakerNPC) m).charId;
			if (id.equals(charId) || !enabled(id) || !Dungeon.level.heroFOV[m.pos]) continue;
			out.add(id);
		}
		return out;
	}

	public static Result applyAction(String charId, String actionKey) { return applyAction(charId, actionKey, -1); }
	/** roll: 0~99 (−1 이면 무작위) */
	public static Result applyAction(String charId, String actionKey, int roll) {
		if (!enabled(charId)) return null;
		JsonValue act = action(actionKey);
		if (act == null) { MakerRuntime.log("없는 행동: " + actionKey); return null; }
		Record r = rec(charId);
		List<JsonValue> traits = traitsOf(charId);
		Result res = new Result();
		List<String> looking = onlookers(charId);
		boolean crowd = !looking.isEmpty();
		int moodMax = moodMax(), angerMax = angerMax(), max = ri("maxValue", 10000);
		int intim = r.get(r.abl, "abl.intimacy");

		if (act.getBoolean("calm", false) && !r.sulk && r.displeased <= 0) { res.outcome = "blocked"; return res; }
		// 결과 판정
		if (roll < 0) roll = Random.Int(100);
		int base = act.getInt("success", 100);
		int rate = base >= 100 ? 100 : clamp(base + clamp(Math.floorDiv(acceptance(r) - 100, 20), -20, 20) + r.get(r.abl, "abl.talk"), 1, 99);
		if (roll < act.getInt("great", 0)) res.outcome = "great";
		else if (roll >= rate) res.outcome = "fail";
		// 대화 피로 · 층당 횟수
		int fatigue = act.getInt("fatigue", 0);
		if (fatigue > 0 && r.fatigue >= ri("fatigueMax", 300) && !r.bonds.contains("bond.partner")) res.outcome = "tired";
		int used = r.get(r.uses, actionKey);
		boolean limited = act.getInt("perFloor", 0) > 0 && used >= act.getInt("perFloor", 0);
		if (limited && !res.outcome.equals("tired")) res.outcome = "limit";
		r.uses.put(actionKey, used + 1);
		if (fatigue > 0) r.fatigue += Math.round(fatigue * 4f / (4 + r.get(r.abl, "abl.talk")));
		boolean fail = res.outcome.equals("fail") || res.outcome.equals("tired");
		boolean dead = limited || res.outcome.equals("tired");
		r.warm = true;

		// 자극 → 게이지
		double outMul = res.outcome.equals("great") ? 2 : fail ? 0.1 : dead ? 0 : 1;
		float[] smul = rfarr("stressMul", new float[]{1, 0.9f, 0.85f, 0.8f, 0.7f, 0.6f});
		int st = stressTier(r);
		double sMul = st < smul.length ? smul[st] : 1;
		double curve = 0, good = 0;
		JsonValue src = act.get("source");
		if (src != null) for (JsonValue g : src) {
			double mul = outMul;
			for (JsonValue t : traits) { JsonValue gm = t.get("gaugeMul"); if (gm != null && gm.has(g.name)) mul *= gm.getFloat(g.name); }
			if (g.name.equals("gauge.joy")) mul *= 1 + 0.05 * intim;
			int val = valence(g.name);
			if (val > 0) mul *= sMul;
			int add = (int) Math.round(g.asFloat() * mul);
			if (add == 0) continue;
			r.add(r.gauges, g.name, add);
			JsonValue d = gaugeDef(g.name);
			int k = d != null && d.has("k") ? d.getInt("k") : ri("curveK", 200);
			int cap = d != null && d.has("cap") ? d.getInt("cap") : ri("curveCap", 50);
			double c = val * cap * (double) Math.abs(add) / (Math.abs(add) + k);
			curve += c; if (c > 0) good += c;
		}

		// 호감도
		int fav = act.getInt("favor", 0), tru = act.getInt("trust", 0);
		boolean positive = fav > 0;
		if (positive) fav += (intim + r.get(r.abl, "abl.deference")) / 2 + r.temper;
		boolean halve = false; String halveKey = "";
		for (JsonValue t : traits) {
			boolean onlyPos = t.getBoolean("onlyPositive", false);
			if (!(onlyPos && fav <= 0)) fav += t.getInt("favorAdd", 0);
			if (!(onlyPos && tru <= 0)) tru += t.getInt("trustAdd", 0);
			if (t.getBoolean("halve", false)) { halve = true; halveKey = t.getString("halveUnless", ""); }
		}
		fav += (int) (curve / 10);
		int resent = r.get(r.marks, "mark.resent");
		if (positive) { fav -= resent; fav = Math.max(fav, -resent); }
		boolean bondTop = halveKey.isEmpty() ? stage(r) >= sys().get("stages").size - 1 : r.bonds.contains(halveKey);
		if (halve && !bondTop) { if (fav > 1) fav /= 2; else if (fav > 0) fav = 1; }
		if ((r.sulk || r.displeased > 0) && fav > 0) fav = 0;
		if (fail || dead) fav = Math.min(0, fav);
		if (res.outcome.equals("great") && fav > 0) fav = fav * 3 / 2;
		if (fav > 0 && r.favor > ri("capStart", 500) && r.favor > r.trust * rf("trustRatio", 4)) {
			float K = ri("trustK", 20);
			for (Map.Entry<String, Float> e : rmap("bondTrustK", "{bond.admire:30,bond.close:30,bond.partner:40}").entrySet()) if (r.bonds.contains(e.getKey())) K = Math.max(K, e.getValue());
			double ref = r.trust * K;
			fav = (int) Math.floor(fav * ref / Math.max(1, r.favor + ref)); res.capped = true;
		}

		// 신뢰도
		if (tru > 0 || positive) tru += intim / 5 + r.temper + (int) (curve / 10);
		if (res.outcome.equals("great")) tru += 1;
		if (fail && r.anger > 0) tru -= r.anger / 100;
		if (r.mood >= moodMax) { tru += 2; if (tru < 0) tru = 0; }
		else if (r.mood >= moodMax * 4 / 5) { tru += 1; if (tru < 0) tru += Math.abs(tru) / 2; }
		if (halve && !bondTop && tru > 1) tru /= 2;
		if (tru < 0 && !act.getBoolean("canLowerTrust", false) && !fail) tru = 0;
		if ((fail || dead) && tru > 0) tru = 0;

		// 무드
		int mood = 0;
		if (good > 0 && !dead) {
			double m = Math.min(intim + 1, 10) * good / 3;
			m = soft(m);
			if (crowd && rb("crowdHalf", true)) m /= 2;
			mood = (int) Math.min(Math.round(m), ri("moodPerAction", 200));
		}

		// 분노
		int anger = act.getInt("anger", 0);
		if (anger > 0) {
			double a = anger * (2.0 * moodMax - r.mood) / (2.0 * moodMax + r.mood);
			a *= r.temper > 0 ? 0.7 : r.temper < 0 ? 1.5 : 1;
			for (JsonValue t : traits) if (t.has("angerMul")) a *= t.getFloat("angerMul");
			anger = (int) Math.round(a);
		}

		// 적용
		int before = stage(r);
		r.favor = clamp(r.favor + fav, -max, max);
		if (fav > 0) MakerAudio.sysSfx(MakerRuntime.heart == null ? null : MakerRuntime.heart.get("sounds"), "up", "heart.up");
		else if (fav < 0) MakerAudio.sysSfx(MakerRuntime.heart == null ? null : MakerRuntime.heart.get("sounds"), "down", "heart.down");
		r.trust = clamp(r.trust + tru, 0, max);
		r.mood = clamp(r.mood + mood, 0, moodMax);
		r.anger = clamp(r.anger + anger, 0, angerMax);
		if (anger < 0 && r.anger == 0 && r.displeased <= 0) r.sulk = false;
		if (act.getBoolean("calm", false) && !fail) {
			r.sulk = false; r.displeased = 0;
			r.anger = res.outcome.equals("great") ? 0 : r.anger / 2;
			int rm = act.getInt("removeResent", 0);
			if (rm > 0 && resent > 0) r.marks.put("mark.resent", Math.max(0, resent - rm));
			res.calmed = true;
		}
		if (r.anger >= angerMax && !r.sulk) { getAngry(r); res.gotSulk = true; }
		String exp = act.getString("exp", "");
		if (!exp.isEmpty()) r.add(r.exp, exp, 1);
		if (actionKey.equals("TALK")) r.lastTalkTurn = (int) Actor.now();

		// 질투: 곁에서 본 이정표 캐릭터
		if (mood > 0 && rb("jealousy", true)) {
			Map<String, Float> J = rmap("jealousyDiv", "{bond.partner:3,bond.close:5,bond.admire:5,favor:8}");
			for (String oid : looking) {
				Record o = rec(oid);
				float div = 0;
				for (String b : new String[]{"bond.partner", "bond.close", "bond.admire"}) if (div == 0 && o.bonds.contains(b) && J.containsKey(b)) div = J.get(b);
				if (div == 0 && o.favor >= ri("jealousyFavor", 500) && J.containsKey("favor")) div = J.get("favor");
				double mul = 1;
				for (JsonValue t : traitsOf(oid)) if (t.has("jealousMul")) mul *= t.getFloat("jealousMul");
				if (div <= 0 || mul <= 0) continue;
				int a = (int) Math.round(Math.min(o.get(o.abl, "abl.intimacy") + 1, 10) * good / div * mul);
				if (a <= 0) continue;
				o.anger = clamp(o.anger + a, 0, angerMax); o.jealousy += a;
				if (o.anger >= angerMax && !o.sulk) { getAngry(o); GLog.w(name(oid) + ": " + MakerRuntime.term("rel.sulk", "삐짐")); }
				res.jealous.add(oid);
				sayNearby(oid, "jealous");
			}
		}
		res.fav = fav; res.tru = tru; res.anger = anger; res.mood = mood;
		res.stageUp = stage(r) > before;
		if (res.stageUp) GLog.p(name(charId) + ": 「" + stageName(r) + "」");
		if (res.gotSulk) GLog.w(name(charId) + ": " + MakerRuntime.term("rel.sulk", "삐짐"));
		checkMilestones(charId);
		return res;
	}

	/** era GET_ANGRY: 삐짐 + 언짢음 + 기분 나쁨 (+ 반발 흔적) */
	static void getAngry(Record r) {
		r.sulk = true; r.anger = angerMax(); r.displeased = Math.max(r.displeased, ri("displeasedFloors", 1)); r.temper = -1;
		int m = ri("sulkMark", 0);
		if (m > 0) r.marks.put("mark.resent", Math.min(3, r.get(r.marks, "mark.resent") + m));
	}

	/** 행동 결과 → 말할 토픽 (heart-core.js topicFor 와 같음) */
	public static String topicFor(String actionKey, Result res) {
		if (res == null || res.outcome.equals("blocked")) return null;
		JsonValue act = action(actionKey);
		if (res.gotSulk) return "sulk";
		if (res.calmed) return "apology_ok";
		if (act != null && act.getBoolean("calm", false)) return "apology_fail";
		if (res.outcome.equals("tired")) return "talk_tired";
		if (res.stageUp) return "stage_up";
		String t = act == null ? "" : act.getString("topic", "");
		if (t.isEmpty()) switch (actionKey) {
			case "TALK": t = "talk"; break; case "GIFT_LIKED": t = "gift_liked"; break; case "GIFT_NORMAL": t = "gift_normal"; break;
			case "GIFT_DISLIKED": t = "gift_disliked"; break; case "ATTACKED": t = "attacked"; break; case "IGNORED": t = "ignored"; break;
			default: return null;
		}
		return t;
	}

	/** 부탁 (era REJECT_CHECK): 마음 열림 > need → 들어줌. 결과 행동도 적용 */
	public static boolean request(String charId, String reqKey) {
		if (!enabled(charId) || sys().get("requests") == null) return false;
		JsonValue q = null;
		for (JsonValue x : sys().get("requests")) if (reqKey.equals(x.getString("key", ""))) q = x;
		if (q == null) { MakerRuntime.log("없는 부탁: " + reqKey); return false; }
		Record r = rec(charId);
		boolean ok = acceptance(r) > q.getInt("need", 0);
		if (r.sulk || r.displeased > 0) ok = false;
		if (q.getFloat("moodNeed", 0) > 0 && r.mood < moodMax() * q.getFloat("moodNeed", 0)) ok = false;
		String when = q.getString("when", "");
		if (!when.isEmpty() && !Cond.eval(when, resolver(charId))) ok = false;
		String a = q.getString(ok ? "okAction" : "noAction", "");
		if (!a.isEmpty()) applyAction(charId, a);
		MakerRuntime.log("부탁 " + reqKey + " → " + (ok ? "들어줌" : "거절") + " (마음 열림 " + acceptance(r) + " / 필요 " + q.getInt("need", 0) + ")");
		return ok;
	}

	static List<JsonValue> traitsOf(String charId) {
		List<JsonValue> out = new ArrayList<>();
		JsonValue c = MakerRuntime.character(charId);
		if (c == null || c.get("heart") == null || c.get("heart").get("traits") == null) return out;
		for (JsonValue key : c.get("heart").get("traits"))
			for (JsonValue t : sys().get("traits")) if (key.asString().equals(t.getString("key"))) out.add(t);
		return out;
	}

	/** 수치 직접 변경 (이벤트 명령 "마음 수치 변경") */
	public static void addStat(String charId, String stat, int value) {
		if (sys() == null) return;
		Record r = rec(charId);
		switch (stat) {
			case "rel.favor": r.favor += value; break;
			case "rel.trust": r.trust = Math.max(0, r.trust + value); break;
			case "rel.anger": r.anger = clamp(r.anger + value, 0, angerMax()); if (r.anger == 0) { r.sulk = false; r.displeased = 0; } else if (r.anger >= angerMax() && !r.sulk) getAngry(r); break;
			case "rel.mood": r.mood = clamp(r.mood + value, 0, moodMax()); break;
			case "rel.temper": r.temper = clamp(r.temper + value, -1, 1); break;
			case "rel.stress": r.stress = Math.max(0, r.stress + value); break;
			case "rel.jealousy": r.jealousy = Math.max(0, r.jealousy + value); break;
			case "rel.displeased": r.displeased = Math.max(0, r.displeased + value); if (r.displeased == 0 && r.anger < angerMax()) r.sulk = false; break;
			default:
				if (stat.startsWith("gauge.")) r.add(r.gauges, stat, value);
				else if (stat.startsWith("crystal.") || stat.startsWith("gem.")) r.add(r.crystals, crystalKey(stat), value);
				else if (stat.startsWith("abl.")) r.add(r.abl, stat, value);
				else if (stat.startsWith("mark.")) r.marks.put(stat, clamp(r.get(r.marks, stat) + value, 0, 3));
				else if (stat.startsWith("exp.")) r.add(r.exp, stat, value);
		}
		checkMilestones(charId);
	}

	public static void remember(String charId, String key) { Record r = rec(charId); if (!r.memory.contains(key)) r.memory.add(key); }

	/** 선물: 좋아함/싫어함 판정 → 행동 적용 + 반응 토픽 */
	public static String giftTopic(String charId, String itemId, List<String> itemTags) {
		JsonValue h = MakerRuntime.character(charId).get("heart");
		String t = "gift_normal";
		if (matches(h.get("likes"), itemId, itemTags)) t = "gift_liked";
		else if (matches(h.get("dislikes"), itemId, itemTags)) t = "gift_disliked";
		Result res = applyAction(charId, t.equals("gift_liked") ? "GIFT_LIKED" : t.equals("gift_disliked") ? "GIFT_DISLIKED" : "GIFT_NORMAL");
		if (res != null && res.gotSulk) return "sulk";
		return rec(charId).sulk && !t.equals("gift_disliked") ? "sulk" : t;
	}
	private static boolean matches(JsonValue list, String id, List<String> tags) {
		if (list == null) return false;
		for (JsonValue v : list) {
			String s = v.asString();
			if (s.equals(id)) return true;
			if (s.startsWith("tag:") && tags != null && tags.contains(s.substring(4))) return true;
		}
		return false;
	}

	// ------------------------------------------------------------ 이정표 · 능력 · 결정화

	public static void checkMilestones(String charId) {
		if (sys() == null || sys().get("milestones") == null) return;
		Record r = rec(charId);
		for (JsonValue m : sys().get("milestones")) {
			String key = m.getString("key");
			if (r.bonds.contains(key)) continue;
			String blocked = m.getString("blockedBy", "");
			if (!blocked.isEmpty() && Cond.eval(blocked, resolver(charId))) continue;
			if (Cond.eval(m.getString("when", ""), resolver(charId))) {
				r.bonds.add(key);
				String rep = m.getString("replaces", "");
				if (!rep.isEmpty()) r.bonds.remove(rep);
				GLog.p(name(charId) + ": " + MakerRuntime.term(key, key));
				MakerAudio.sysSfx(MakerRuntime.heart == null ? null : MakerRuntime.heart.get("sounds"), "bond", "heart.bond");
				String ev = m.getString("event", "");
				if (!ev.isEmpty()) EventInterpreter.runEvent(ev, charId);
			}
		}
	}

	public static int ablCost(JsonValue ab, int lv) { return (int) Math.ceil(ab.getFloat("base", 1) * Math.pow(ab.getFloat("growth", 2), lv)); }

	/** 마음의 결정으로 능력을 올릴 수 있으면 올림 (층을 떠날 때 자동) */
	public static void autoLevelUp(String charId) {
		Record r = rec(charId);
		boolean any = true;
		while (any) {
			any = false;
			for (JsonValue ab : sys().get("abilities")) {
				String key = ab.getString("key"); int lv = r.get(r.abl, key);
				if (lv >= ab.getInt("max", 10)) continue;
				int cost = ablCost(ab, lv);
				for (String g : new String[]{ crystalKey(ab.getString("crystal", ab.getString("gem", ""))), crystalKey(ab.getString("alt", "")) }) {
					if (g.isEmpty() || r.get(r.crystals, g) < cost) continue;
					r.add(r.crystals, g, -cost); r.abl.put(key, lv + 1); any = true;
					GLog.p(name(charId) + ": " + MakerRuntime.term(key, key) + " Lv " + (lv + 1));
					break;
				}
			}
		}
		checkMilestones(charId);
	}

	public static void onFloorEnter(int depth) { onFloorEnter(depth, false); }
	/** 새 층 도착 (heart-core.js newFloor): 무드·피로·횟수 초기화, 언짢음 −1, 분노 일부 남김, 기분 변화, 스트레스 회복 */
	public static void onFloorEnter(int depth, boolean safe) {
		if (sys() == null) return;
		String key = WorldGraph.current() + "@" + (int) Actor.now();
		if (key.equals(lastFloorKey)) return;   // 불러오기로 같은 층을 다시 연 것
		lastFloorKey = key;
		int angerMax = angerMax();
		for (Map.Entry<String, Record> e : records.entrySet()) {
			Record r = e.getValue();
			r.mood = 0; r.fatigue = 0; r.uses.clear(); r.warm = false;
			if (r.displeased > 0) {
				r.displeased--;
				if (r.displeased == 0 && r.get(r.marks, "mark.resent") >= ri("resentLock", 3)) r.displeased = 1;
			}
			if (r.displeased > 0) { r.anger = angerMax; r.sulk = true; }
			else { r.anger = (int) (r.anger * rf("angerFloorKeep", 0.5f)); if (r.sulk && r.anger < angerMax) r.sulk = false; }
			float chance = ri("temperChance", 10);
			for (JsonValue t : traitsOf(e.getKey())) if (t.has("temperMul")) chance *= t.getFloat("temperMul");
			if (r.displeased <= 0) r.temper = 0;
			if (Random.Float(100) < chance) r.temper = clamp(r.temper + (Random.Int(2) == 0 ? 1 : -1), -1, 1);
			r.stress = Math.max(0, r.stress - (safe ? ri("stressRecoverSafe", 200) : ri("stressRecover", 30)));
		}
		counter("floorEnter");
	}

	/** 층을 떠날 때: 일기 → 게이지 결정화 → 흔적 → 능력 자동 상승 */
	public static void onFloorLeave(int depth) {
		if (sys() == null) return;
		boolean diary = sys().get("diary") == null || sys().get("diary").getBoolean("enabled", true);
		for (Map.Entry<String, Record> e : records.entrySet()) {
			String id = e.getKey(); Record r = e.getValue();
			if (r.gauges.isEmpty()) continue;
			if (diary) {
				JsonValue line = pickLine(id, "diary");
				if (line != null) GLog.i(MakerRuntime.term("sys.diary", "일기") + " — " + name(id) + ": " + line.getString("text", ""));
			}
			for (JsonValue m : sys().get("marks")) {
				int v = r.get(r.gauges, m.getString("gauge")), lv = 0, i = 0;
				for (JsonValue th : m.get("levels")) { i++; if (v >= th.asInt()) lv = i; }
				if (lv > r.get(r.marks, m.getString("key"))) r.marks.put(m.getString("key"), lv);
			}
			for (Map.Entry<String, Float> sf : rmap("stressFrom", "{gauge.fear:0.2,gauge.sorrow:0.2,gauge.tension:0.05}").entrySet())
				r.stress += Math.round(r.get(r.gauges, sf.getKey()) * sf.getValue());
			for (JsonValue g : sys().get("gauges")) {
				int n = r.get(r.gauges, g.getString("key")) / Math.max(1, g.getInt("rate", 100));
				if (n > 0) { r.add(r.crystals, gaugeCrystal(g), n); MakerAudio.sysSfx(MakerRuntime.heart == null ? null : MakerRuntime.heart.get("sounds"), "crystal", "heart.crystal"); }
			}
			r.gauges.clear();
			autoLevelUp(id);
		}
	}

	/** 시간 경과 (분노 풀림) — MakerNPC.act 에서 decayTurns 마다 */
	public static void decay(String charId) {
		Record r = rec(charId);
		if (r.displeased > 0) return;   // 언짢음 동안은 안 풀림
		r.anger = Math.max(0, r.anger - rules().getInt("angerDecay", 20));
		if (r.sulk && r.anger == 0) r.sulk = false;
	}

	// ------------------------------------------------------------ 대사 (era 구상 방식)

	/** 조건 맞는 대사 중 가장 구체적인 것, 같으면 무작위 */
	public static JsonValue pickLine(String charId, String topic) {
		JsonValue c = MakerRuntime.character(charId);
		if (c == null || c.get("dialogue") == null || c.get("dialogue").get(topic) == null) return null;
		Cond.Resolver r = resolver(charId);
		List<JsonValue> ok = new ArrayList<>(); int best = -1;
		for (JsonValue l : c.get("dialogue").get(topic)) {
			String when = l.getString("when", "");
			if (!Cond.eval(when, r)) continue;
			int s = Cond.specificity(when);
			if (s > best) { best = s; ok.clear(); }
			if (s == best) ok.add(l);
		}
		return ok.isEmpty() ? null : Random.element(ok);
	}

	// ------------------------------------------------------------ 반응 (era COUNTER)

	/** trigger: heroLowHp, heroKill, attacked, floorEnter, bossDefeated, heroHeal, itemUse, ignored */
	public static void counter(String trigger) { counter(trigger, null); }
	public static void counter(String trigger, String onlyChar) {
		if (sys() == null || sys().get("counters") == null || Dungeon.level == null) return;
		for (Mob m : Dungeon.level.mobs.toArray(new Mob[0])) {
			if (!(m instanceof MakerNPC)) continue;
			MakerNPC npc = (MakerNPC) m;
			if (onlyChar != null && !onlyChar.equals(npc.charId)) continue;
			if (!enabled(npc.charId) || !Dungeon.level.heroFOV[npc.pos]) continue;
			// era COUNTER_SELECT: 조건·확률을 통과한 후보 중 무게(weight)로 하나만 고름 (무드가 높으면 좋은 반응 쪽 무게 +)
			List<JsonValue> cand = new ArrayList<>(); List<Float> w = new ArrayList<>(); float total = 0;
			Record rr = rec(npc.charId);
			for (JsonValue c : sys().get("counters")) {
				if (!trigger.equals(c.getString("trigger"))) continue;
				if (c.getBoolean("needWarm", false) && !rr.warm) continue;
				if (Random.Int(100) >= c.getInt("chance", 100)) continue;
				if (!Cond.eval(c.getString("when", ""), resolver(npc.charId))) continue;
				float wt = c.getFloat("weight", 100) * (1 + c.getFloat("moodBonus", 0) * rr.mood / moodMax());
				if (wt <= 0) continue;
				cand.add(c); w.add(wt); total += wt;
			}
			if (cand.isEmpty()) continue;
			float pick = Random.Float(total); JsonValue c = cand.get(cand.size() - 1);
			for (int i = 0; i < cand.size(); i++) { pick -= w.get(i); if (pick < 0) { c = cand.get(i); break; } }
			{
				String act = c.getString("action", ""), topic = c.getString("topic", ""), ev = c.getString("event", "");
				if (!act.isEmpty()) applyAction(npc.charId, act);
				if (!topic.isEmpty()) { JsonValue l = pickLine(npc.charId, topic); if (l != null) npc.say(l.getString("text", "")); }
				if (!ev.isEmpty()) EventInterpreter.runEvent(ev, npc.charId);
			}
		}
	}

	/** 곁에 있는 그 캐릭터가 토픽 대사를 머리 위에 말함 */
	static void sayNearby(String charId, String topic) {
		if (Dungeon.level == null) return;
		for (Mob m : Dungeon.level.mobs.toArray(new Mob[0]))
			if (m instanceof MakerNPC && ((MakerNPC) m).charId.equals(charId)) {
				JsonValue l = pickLine(charId, topic); if (l != null) ((MakerNPC) m).say(l.getString("text", ""));
			}
	}

	static String name(String charId) { JsonValue c = MakerRuntime.character(charId); return c == null ? charId : c.getString("name", charId); }
	static int clamp(int v, int a, int b) { return Math.max(a, Math.min(b, v)); }

	// ------------------------------------------------------------ 저장

	static void store(Bundle out) {
		Bundle all = new Bundle();
		all.put("ids", records.keySet().toArray(new String[0]));
		for (Map.Entry<String, Record> e : records.entrySet()) {
			Record r = e.getValue(); Bundle b = new Bundle();
			b.put("favor", r.favor); b.put("trust", r.trust); b.put("anger", r.anger); b.put("sulk", r.sulk);
			b.put("lastTalk", r.lastTalkTurn);
			b.put("moodN", r.mood); b.put("temper", r.temper); b.put("displeased", r.displeased); b.put("stress", r.stress);
			b.put("jealousy", r.jealousy); b.put("fatigue", r.fatigue); b.put("warm", r.warm); putMap(b, "uses", r.uses);
			putMap(b, "gauges", r.gauges); putMap(b, "crystals", r.crystals); putMap(b, "abl", r.abl); putMap(b, "marks", r.marks); putMap(b, "exp", r.exp);
			b.put("bonds", r.bonds.toArray(new String[0])); b.put("memory", r.memory.toArray(new String[0]));
			all.put("c_" + e.getKey(), b);
		}
		all.put("floorKey", lastFloorKey);
		out.put("heart", all);
	}
	static void restore(Bundle in) {
		records.clear();
		if (!in.contains("heart")) return;
		Bundle all = in.getBundle("heart");
		lastFloorKey = all.contains("floorKey") ? all.getString("floorKey") : "";
		for (String id : all.getStringArray("ids")) {
			Bundle b = all.getBundle("c_" + id); Record r = new Record();
			r.favor = b.getInt("favor"); r.trust = b.getInt("trust"); r.anger = b.getInt("anger"); r.sulk = b.getBoolean("sulk");
			r.lastTalkTurn = b.getInt("lastTalk");
			r.mood = b.getInt("moodN"); r.temper = b.getInt("temper"); r.displeased = b.getInt("displeased"); r.stress = b.getInt("stress");
			r.jealousy = b.getInt("jealousy"); r.fatigue = b.getInt("fatigue"); r.warm = b.getBoolean("warm"); getMap(b, "uses", r.uses);
			getMap(b, "gauges", r.gauges); getMap(b, "crystals", r.crystals);
			Map<String, Integer> old = new HashMap<>(); if (b.contains("gems_k")) getMap(b, "gems", old);   // 예전 저장 (마음의 보석)
			for (Map.Entry<String, Integer> e2 : old.entrySet()) r.add(r.crystals, crystalKey(e2.getKey()), e2.getValue()); getMap(b, "abl", r.abl); getMap(b, "marks", r.marks); getMap(b, "exp", r.exp);
			for (String s : b.getStringArray("bonds")) r.bonds.add(s);
			for (String s : b.getStringArray("memory")) r.memory.add(s);
			records.put(id, r);
		}
	}
	private static void putMap(Bundle b, String k, Map<String, Integer> m) {
		String[] keys = m.keySet().toArray(new String[0]); int[] vals = new int[keys.length];
		for (int i = 0; i < keys.length; i++) vals[i] = m.get(keys[i]);
		b.put(k + "_k", keys); b.put(k + "_v", vals);
	}
	private static void getMap(Bundle b, String k, Map<String, Integer> m) {
		if (!b.contains(k + "_k")) return;
		String[] keys = b.getStringArray(k + "_k"); int[] vals = b.getIntArray(k + "_v");
		if (keys == null || vals == null) return;
		for (int i = 0; i < keys.length && i < vals.length; i++) m.put(keys[i], vals[i]);
	}
}
