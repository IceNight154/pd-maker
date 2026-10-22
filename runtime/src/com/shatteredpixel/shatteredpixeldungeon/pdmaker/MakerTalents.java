/*
 * 영웅 편집기의 특성(Talent) — SPD 의 특성 트리를 데이터로 옮긴 것
 *   heroes/<id>.json
 *     talentTiers : [{ name, unlockLevel, points, requires: ""|subclass|ability }]   단계마다 (레벨 − 열리는 레벨 + 1) 만큼, 최대 points 개의 포인트
 *                   원작처럼 3단계는 전직 뒤, 4단계는 직업 능력 뒤에 열림 (영웅에게 전직·능력이 있을 때 기본값)
 *     talents     : [{ id, name, tier, maxPoints, icon, desc, pointText[], requires, requiresPoints,
 *                      subclass(이 전직일 때만) · ability(이 직업 능력일 때만),
 *                      effects: [{ type: stat|spell|unlockSpell, stat, spell, field, perPoint }] }]
 *   효과:  stat  — hp · str · accuracy · evasion · damage · armor · speed(%) · charges · recharge(%) · gold · view
 *                  · damagePct · takenPct · castPct · codexPct (%)
 *          spell — 주문·직업 능력·코덱스(id)의 damage · amount · turns · radius · range · cost · chargeUse · cooldown · count 를 포인트당 바꿈
 *          unlockSpell — 1포인트 이상이면 그 주문을 배움 (원작 성직자: 특성 = 주문)
 *          (예전 skill / unlockSkill 도 같은 뜻으로 읽음)
 *   코드: HeroRuntime.talent("id") 로 포인트 수, 영웅 코드 훅 onTalentUp(hero, id, points)
 *   게임: 영웅 정보 창(왼쪽 위 초상화)의 특성 탭에서 포인트를 씀 (MakerTalentsPane) — 원작과 같음
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.watabou.utils.Bundle;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MakerTalents {

	static final Map<String, Integer> points = new LinkedHashMap<>();
	static int notifiedLevel = 0;

	static JsonValue data() { return HeroRuntime.data(); }
	/** 특성 하나의 최대 포인트 — 원작처럼 4 까지 (영웅 편집기에서 talentCapRaised 를 켜면 그 값 그대로) */
	public static int maxPts(JsonValue t) {
		JsonValue h = data();
		int m = Math.max(1, t.getInt("maxPoints", 2));
		return h != null && h.getBoolean("talentCapRaised", false) ? m : Math.min(4, m);
	}
	public static boolean any() { JsonValue h = data(); return h != null && h.get("talents") != null && h.get("talents").size > 0; }
	public static void reset() { points.clear(); notifiedLevel = 0; }
	public static int get(String id) { Integer v = points.get(id); return v == null ? 0 : v; }

	static JsonValue tiers() {
		JsonValue h = data();
		JsonValue t = h == null ? null : h.get("talentTiers");
		if (t != null && t.size > 0) return t;
		return new com.badlogic.gdx.utils.JsonReader().parse("[{name:'1단계',unlockLevel:2,points:5},{name:'2단계',unlockLevel:7,points:6},{name:'3단계',unlockLevel:13,points:8},{name:'4단계',unlockLevel:21,points:10}]");
	}
	/** 단계가 열리려면 필요한 것: "" · subclass · ability (Hero.talentPointsAvailable 의 tier 3/4 조건) */
	static String tierRequires(int tier) {
		JsonValue t = tiers().get(tier - 1);
		String r = t != null && t.has("requires") ? t.getString("requires", "") : tier == 3 ? "subclass" : tier == 4 ? "ability" : "";
		// 전직·직업 능력이 없는 영웅이면 그 조건은 없는 것으로
		if (r.equals("subclass") && !MakerAbilities.anySubclass()) return "";
		if (r.equals("ability") && !MakerAbilities.anyAbility()) return "";
		return r;
	}
	/** 단계가 잠긴 이유 (열렸으면 null) */
	static String tierLock(int tier, Hero hero) {
		JsonValue t = tiers().get(Math.max(0, tier - 1));
		if (t == null) return "없는 단계";
		if (hero.lvl < t.getInt("unlockLevel", 2)) return "레벨 " + t.getInt("unlockLevel", 2) + " 에 열림";
		String r = tierRequires(tier);
		if (r.equals("subclass") && MakerAbilities.subclassId().isEmpty()) return "전직하면 열림";
		if (r.equals("ability") && MakerAbilities.abilityId().isEmpty() && !MakerAbilities.nativeAbility(hero)) return "직업 능력을 얻으면 열림";
		return null;
	}
	/** 지금 전직·직업 능력에 맞는 특성인지 */
	static boolean visible(JsonValue t) {
		String sub = t.getString("subclass", ""), ab = t.getString("ability", "");
		if (!sub.isEmpty() && !sub.equals(MakerAbilities.subclassId())) return false;
		if (!ab.isEmpty() && !ab.equals(MakerAbilities.abilityId())) return false;
		return true;
	}
	static JsonValue talent(String id) {
		JsonValue h = data(); if (h == null || h.get("talents") == null) return null;
		for (JsonValue t : h.get("talents")) if (id.equals(t.getString("id", ""))) return t;
		return null;
	}
	/** 단계 t(1부터)에서 지금 레벨로 얻은 포인트 */
	static int earned(int tier, int lvl) {
		JsonValue t = tiers().get(tier - 1); if (t == null) return 0;
		if (Dungeon.hero != null && tierLock(tier, Dungeon.hero) != null) return 0;
		return Math.max(0, Math.min(t.getInt("points", 5), lvl - t.getInt("unlockLevel", 2) + 1));
	}
	static int spent(int tier) {
		int s = 0; JsonValue h = data(); if (h == null || h.get("talents") == null) return 0;
		for (JsonValue t : h.get("talents")) if (t.getInt("tier", 1) == tier) s += get(t.getString("id", ""));
		return s;
	}
	public static int available(int tier, Hero hero) { return earned(tier, hero.lvl) - spent(tier); }
	public static int availableAll(Hero hero) { int s = 0; for (int i = 1; i <= tiers().size; i++) s += Math.max(0, available(i, hero)); return s; }

	/** stat 효과 합 (포인트 × perPoint) */
	public static int stat(String stat) {
		JsonValue h = data(); if (h == null || h.get("talents") == null || points.isEmpty()) return 0;
		int sum = 0;
		for (JsonValue t : h.get("talents")) {
			int p = get(t.getString("id", "")); if (p <= 0 || t.get("effects") == null) continue;
			for (JsonValue e : t.get("effects")) if ("stat".equals(e.getString("type", "")) && stat.equals(e.getString("stat", ""))) sum += Math.round(p * e.getFloat("perPoint", 0));
		}
		return sum;
	}
	/** 주문·능력·코덱스 값 보정 합 (특성 효과 spell / 예전 skill) */
	public static int mod(String skillId, String field) {
		JsonValue h = data(); if (h == null || h.get("talents") == null || points.isEmpty()) return 0;
		int sum = 0;
		for (JsonValue t : h.get("talents")) {
			int p = get(t.getString("id", "")); if (p <= 0 || t.get("effects") == null) continue;
			for (JsonValue e : t.get("effects"))
				if (("spell".equals(e.getString("type", "")) || "skill".equals(e.getString("type", ""))) && field.equals(e.getString("field", "")) && (skillId.equals(ref(e)) || ref(e).equals("*")))
					sum += Math.round(p * e.getFloat("perPoint", 0));
		}
		return sum;
	}
	static String ref(JsonValue e) { return e.has("spell") ? e.getString("spell", "") : e.getString("skill", ""); }
	/** 주문을 배웠는지 (requiresTalent / 특성의 unlockSpell) */
	public static boolean spellUnlocked(JsonValue sk) {
		String req = sk.getString("requiresTalent", "");
		if (!req.isEmpty() && get(req) < Math.max(1, sk.getInt("requiresPoints", 1))) return false;
		JsonValue h = data(); if (h == null || h.get("talents") == null) return true;
		String id = sk.getString("id", "");
		boolean gated = false, open = false;
		for (JsonValue t : h.get("talents")) if (t.get("effects") != null) for (JsonValue e : t.get("effects"))
			if (("unlockSpell".equals(e.getString("type", "")) || "unlockSkill".equals(e.getString("type", ""))) && id.equals(ref(e))) { gated = true; if (get(t.getString("id", "")) > 0) open = true; }
		return !gated || open;
	}

	/** 올릴 수 있는지 (이유 문자열, 되면 null) */
	static String blocked(JsonValue t, Hero hero) {
		int tier = t.getInt("tier", 1), p = get(t.getString("id", ""));
		if (p >= maxPts(t)) return "이미 최대";
		if (!visible(t)) return "다른 전직·직업 능력의 특성";
		String lock = tierLock(tier, hero); if (lock != null) return lock;
		if (available(tier, hero) <= 0) return "이 단계의 포인트가 없음";
		String req = t.getString("requires", "");
		if (!req.isEmpty() && get(req) < Math.max(1, t.getInt("requiresPoints", 1))) {
			JsonValue r = talent(req);
			return "먼저 「" + (r == null ? req : r.getString("name", req)) + "」 필요";
		}
		return null;
	}

	static void upgrade(Hero hero, JsonValue t) {
		String id = t.getString("id", "");
		if (blocked(t, hero) != null) return;
		int p = get(id) + 1;
		points.put(id, p);
		// 한 번만 적용되는 것: 힘·골드·시야
		if (t.get("effects") != null) for (JsonValue e : t.get("effects")) {
			if (!"stat".equals(e.getString("type", ""))) continue;
			int v = Math.round(e.getFloat("perPoint", 0));
			switch (e.getString("stat", "")) {
				case "str": hero.STR += v; break;
				case "gold": Dungeon.gold += v; break;
				case "view": hero.viewDistance = Math.max(1, hero.viewDistance + v); break;
			}
		}
		HeroRuntime.syncHP(hero, false);
		GLog.p("특성 「" + t.getString("name", id) + "」 " + p + "/" + maxPts(t));
		MakerHeroCode code = HeroRuntime.code();
		if (code != null && code.overrides(MakerHeroCode.TALENT_UP)) {
			try { code.onTalentUp(hero, id, p); } catch (Throwable x) { GenSupport.error("영웅 " + HeroRuntime.heroId(), "onTalentUp", x); }
		}
		HeroRuntime.gain("talent", id);
	}

	/** 레벨이 올라 새 포인트가 생기면 알림 */
	static void checkNew(Hero hero) {
		if (!any() || hero.lvl <= notifiedLevel) return;
		int before = notifiedLevel; notifiedLevel = hero.lvl;
		if (before == 0) return;
		if (availableAll(hero) > 0) {
			GLog.p("특성 포인트를 얻었다! (영웅 정보 창 → 특성)");
			com.shatteredpixel.shatteredpixeldungeon.ui.StatusPane.talentBlink = 10f;
		}
	}

	static String desc(JsonValue t) {
		StringBuilder sb = new StringBuilder(t.getString("desc", ""));
		JsonValue pt = t.get("pointText");
		if (pt != null) { int i = 0; for (JsonValue l : pt) { i++; if (!l.asString().isEmpty()) sb.append("\n").append(get(t.getString("id", "")) >= i ? "_+" + i + "_ " : "+" + i + " ").append(l.asString()); } }
		return sb.toString();
	}

	// ------------------------------------------------------------ 창

	/** 게임 원래 특성 창 대신 우리 창을 쓰는지 */
	static boolean replacesNative() {
		JsonValue h = data();
		return h != null && (any() || MakerSpells.any() || MakerAbilities.anySubclass() || MakerAbilities.anyAbility() || HeroRuntime.zeroBase(h)) && !h.getBoolean("nativeTalents", false);
	}
	/** Hero.talentPointsAvailable 연결 줄: 우리 특성을 쓰면 그 단계의 남은 포인트 (-1 = 원래대로)
	 *  → 초상화 반짝임 · "남은 특성 포인트" 알림이 우리 포인트를 따름 */
	public static int nativeOverride(int tier) {
		try {
			if (!replacesNative() || Dungeon.hero == null) return -1;
			if (!any() || tier < 1 || tier > tiers().size) return 0;
			return Math.max(0, available(tier, Dungeon.hero));
		} catch (Throwable t) { return -1; }
	}

	/** 영웅 정보 창의 특성 탭 열기 (원작 방식) */
	public static void openHeroWindow() {
		com.shatteredpixel.shatteredpixeldungeon.windows.WndHero.lastIdx = 1;
		com.watabou.noosa.Game.runOnRenderThread(() -> GameScene.show(new com.shatteredpixel.shatteredpixeldungeon.windows.WndHero()));
	}

	/** 예전 목록 창 (코드·테스트용) */
	public static void show(final Hero hero) {
		if (!any()) { GLog.w("특성이 없는 영웅입니다."); return; }
		final List<JsonValue> list = new ArrayList<>();
		List<String> labels = new ArrayList<>();
		JsonValue ts = tiers();
		StringBuilder head = new StringBuilder();
		for (int i = 1; i <= ts.size; i++) {
			JsonValue tr = ts.get(i - 1);
			if (hero.lvl < tr.getInt("unlockLevel", 2) && i > 1) { head.append(tr.getString("name", i + "단계")).append(": Lv").append(tr.getInt("unlockLevel", 2)).append("부터  "); continue; }
			head.append(tr.getString("name", i + "단계")).append(" 포인트 ").append(Math.max(0, available(i, hero))).append("  ");
			for (JsonValue t : data().get("talents")) {
				if (t.getInt("tier", 1) != i || !visible(t)) continue;
				list.add(t);
				String b = blocked(t, hero);
				labels.add("[" + i + "] " + t.getString("name", "?") + "  " + get(t.getString("id", "")) + "/" + maxPts(t) + (b == null ? "  ▲" : ""));
			}
		}
		if (list.isEmpty()) { GameScene.show(new HeartUI.WndMakerSimple("특성", head.toString().trim())); return; }
		GameScene.show(new WndOptions("특성", head.toString().trim(), labels.toArray(new String[0])) {
			@Override protected void onSelect(int index) { detail(hero, list.get(index)); }
			protected boolean hasInfo(int index) { return true; }
			protected void onInfo(int index) { GameScene.show(new HeartUI.WndMakerSimple(list.get(index).getString("name", ""), desc(list.get(index)))); }
		});
	}
	static void detail(final Hero hero, final JsonValue t) {
		final String b = blocked(t, hero);
		String[] opts = b == null ? new String[]{"올리기 (" + get(t.getString("id", "")) + " → " + (get(t.getString("id", "")) + 1) + ")", "돌아가기"} : new String[]{"돌아가기"};
		GameScene.show(new WndOptions(t.getString("name", ""), desc(t) + (b == null ? "" : "\n\n(" + b + ")"), opts) {
			@Override protected void onSelect(int index) {
				if (b == null && index == 0) upgrade(hero, t);
				show(hero);
			}
		});
	}

	// ------------------------------------------------------------ 저장

	static void store(Bundle b) {
		b.put("pdm_tal_k", points.keySet().toArray(new String[0]));
		int[] v = new int[points.size()]; int i = 0; for (int x : points.values()) v[i++] = x;
		b.put("pdm_tal_v", v);
		b.put("pdm_tal_n", notifiedLevel);
	}
	static void restore(Bundle b) {
		reset();
		if (!b.contains("pdm_tal_k")) return;
		String[] k = b.getStringArray("pdm_tal_k"); int[] v = b.getIntArray("pdm_tal_v");
		for (int i = 0; k != null && v != null && i < k.length && i < v.length; i++) points.put(k[i], v[i]);
		notifiedLevel = b.getInt("pdm_tal_n");
	}
}
