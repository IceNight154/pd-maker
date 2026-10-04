/*
 * 스토리 진행 상태 — 스위치 · 변수 · 셀프 스위치 · 루트 · 내부 플래그.  세이브 파일(Bundle)에 저장됩니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.watabou.utils.Bundle;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class StoryState {

	private static final Set<String> switches = new HashSet<>();
	private static final Map<String, Integer> vars = new HashMap<>();
	private static final Map<String, String> strs = new HashMap<>();     // 문자열 변수
	private static final Map<String, String> varTypes = new HashMap<>();  // 변수 id → number | string | bool (스토리의 변수 표)
	private static final Set<String> selfSwitches = new HashSet<>();   // "이벤트id:A"
	private static final Set<String> flags = new HashSet<>();          // 내부용 (입장 이벤트 실행 여부 등)
	private static final Map<String, String> paths = new HashMap<>();  // 장 id → 정해진 길 id ("main" = 본래 길)
	public static String route = "main";
	public static String ending = "";

	/** 새 게임 (Dungeon.init 에서 호출) */
	public static void reset() {
		switches.clear(); vars.clear(); strs.clear(); varTypes.clear(); selfSwitches.clear(); flags.clear(); paths.clear();
		WorldGraph.reset();
		route = "main"; ending = "";
		if (MakerRuntime.isActive() && MakerRuntime.story != null) {
			JsonValue vs = MakerRuntime.story.get("variables");
			if (vs != null) for (JsonValue v : vs) {
				String id = v.getString("id", ""), type = v.getString("type", "number");
				varTypes.put(id, type);
				JsonValue iv = v.get("initial");
				if (type.equals("string")) strs.put(id, iv == null || iv.isNull() ? "" : iv.asString());
				else if (type.equals("bool")) vars.put(id, iv != null && (iv.isBoolean() ? iv.asBoolean() : iv.isNumber() ? iv.asInt() != 0 : "true".equals(iv.asString())) ? 1 : 0);
				else { int n = 0; try { n = iv == null || iv.isNull() ? 0 : iv.isBoolean() ? (iv.asBoolean() ? 1 : 0) : iv.asInt(); } catch (Exception ignored) { } vars.put(id, n); }
			}
			// 스위치의 처음 상태 (스토리 편집기에서 켜 둔 것)
			JsonValue sws = MakerRuntime.story.get("switches");
			if (sws != null) for (JsonValue v : sws) if (v.getBoolean("initial", false)) switches.add(v.getString("id", ""));
			JsonValue rs = MakerRuntime.story.get("routes");
			if (rs != null && rs.size > 0) route = rs.get(0).getString("id", "main");
		}
		HeartSystem.reset();
		LevelHooks.eventCells.clear();
		EventInterpreter.reset();   // 이전 게임에서 멈춘·대기 중인 이벤트 버림 (새 게임·불러오기)
	}

	public static boolean sw(String id) { return switches.contains(id); }
	public static void setSw(String id, boolean v) { if (v) switches.add(id); else switches.remove(id); }
	public static int var(String id) { Integer v = vars.get(id); return v == null ? 0 : v; }
	public static void setVar(String id, int v) { vars.put(id, v); }
	public static String varType(String id) { String t = varTypes.get(id); return t == null ? "number" : t; }
	public static String str(String id) { String v = strs.get(id); return v == null ? "" : v; }
	public static void setStr(String id, String v) { strs.put(id, v == null ? "" : v); }
	public static java.util.List<String> strKeys(String prefix) { java.util.List<String> out = new java.util.ArrayList<>(); for (String k : strs.keySet()) if (k.startsWith(prefix)) out.add(k); return out; }
	/** 변수 값을 형식에 맞게: 숫자 → Integer · 문자열 → String · 참/거짓 → Boolean */
	public static Object varValue(String id) {
		String t = varType(id);
		if (t.equals("string")) return str(id);
		if (t.equals("bool")) return var(id) != 0;
		return var(id);
	}
	/** 글 안의 {이름} 을 값으로 바꿈 — {var.변수id} {gold} {hero.lvl} {switch.id} 등 조건식에서 쓰는 이름 */
	public static String expand(String text) {
		if (text == null || text.indexOf('{') < 0) return text;
		StringBuilder out = new StringBuilder(); int i = 0;
		while (i < text.length()) {
			int a = text.indexOf('{', i), b = a < 0 ? -1 : text.indexOf('}', a);
			if (a < 0 || b < 0) { out.append(text, i, text.length()); break; }
			out.append(text, i, a);
			String name = text.substring(a + 1, b).trim();
			Object v = null;
			try { v = name.matches("[\\w.%]+") ? resolveGlobal(name, null) : null; } catch (Throwable ignored) { }
			if (v == null) out.append(text, a, b + 1);
			else out.append(v instanceof Boolean ? ((Boolean) v ? "예" : "아니오") : String.valueOf(v));
			i = b + 1;
		}
		return out.toString();
	}
	public static boolean self(String ev, String key) { return selfSwitches.contains(ev + ":" + key); }
	public static void setSelf(String ev, String key, boolean v) { if (v) selfSwitches.add(ev + ":" + key); else selfSwitches.remove(ev + ":" + key); }
	/** 노드의 출구 갈림길에서 고른 노드 id (여러 출구 연결 중 무게로 뽑은 것) */
	public static String choice(String nodeId) { return paths.get(nodeId); }
	public static void setChoice(String nodeId, String to) { if (to == null) paths.remove(nodeId); else paths.put(nodeId, to); }
	public static boolean flag(String f) { return flags.contains(f); }
	public static java.util.List<String> flagsWith(String prefix) { java.util.List<String> out = new java.util.ArrayList<>(); for (String f : flags) if (f.startsWith(prefix)) out.add(f); return out; }
	public static void setFlag(String f, boolean v) { if (v) flags.add(f); else flags.remove(f); }

	/** 전역 이름 해석 (캐릭터 문맥 없음) */
	public static Cond.Resolver globalResolver() { return globalResolver(null); }
	public static Cond.Resolver globalResolver(final String eventId) {
		return name -> resolveGlobal(name, eventId);
	}
	public static Object resolveGlobal(String name, String eventId) {
		if (name.startsWith("global.")) return MakerDrops.global(name.substring(7));   // 전역 스위치 (새 게임에도 유지)
		if (name.startsWith("quest.")) return MakerQuests.resolve(name.substring(6));   // 퀘스트 상태
		if (name.startsWith("badge.")) return MakerBadges.has(name.substring(6));     // 내 배지를 얻었는지
		if (name.startsWith("stat.")) return MakerBadges.stat(name.substring(5));     // 게임 통계 (Statistics 의 값 — 예: stat.enemiesSlain)
		if (name.startsWith("switch.")) return sw(name.substring(7));
		if (name.startsWith("var.")) return varValue(name.substring(4));
		if (name.startsWith("self.")) return eventId != null && self(eventId, name.substring(5));
		if (name.startsWith("char.")) {
			String rest = name.substring(5);
			int dot = rest.indexOf('.');
			if (dot > 0) return HeartSystem.resolve(rest.substring(0, dot), rest.substring(dot + 1));
			return null;
		}
		if (name.startsWith("item.")) return itemCount(name.substring(5));
		if (name.startsWith("party.")) return EventTriggers.inParty(name.substring(6));
		if (name.startsWith("choice.")) { String p = paths.get(name.substring(7)); return p == null ? "" : p; }
		if (name.startsWith("visited.")) return flags.contains("enter_" + name.substring(8)) || name.substring(8).equals(WorldGraph.current());
		switch (name) {
			case "route": return route;
			case "safe": return MakerSafe.in();   // 지금 안전구역 안인지
			case "depth": return Dungeon.depth;
			case "chapter": case "group": return WorldGraph.groupId(WorldGraph.current());
			case "node": { String n = WorldGraph.current(); return n == null ? "" : n; }
			case "branch": return Dungeon.branch;
			case "hero.id": return HeroRuntime.heroId();
			case "gold": return Dungeon.gold;
			case "turns": return EventTriggers.turns;
			case "hero.x": return Dungeon.hero == null || Dungeon.level == null ? 0 : Dungeon.hero.pos % Dungeon.level.width();
			case "hero.y": return Dungeon.hero == null || Dungeon.level == null ? 0 : Dungeon.hero.pos / Dungeon.level.width();
			case "hero.str": return Dungeon.hero == null ? 0 : Dungeon.hero.STR();
			case "hero.maxhp": return Dungeon.hero == null ? 0 : Dungeon.hero.HT;
			case "hero.class": return Dungeon.hero == null ? "" : Dungeon.hero.heroClass.name().toLowerCase();
			case "hero.subclass": return MakerAbilities.subclassId();
			case "hero.ability": return MakerAbilities.abilityId();
			case "hero.gauge": return MakerGauge.value();
			case "hero.element": return MakerGauge.element();
			case "hero.charge": return MakerSpells.charge;
			case "hero.lvl": return Dungeon.hero == null ? 0 : Dungeon.hero.lvl;
			case "hero.hp": return Dungeon.hero == null ? 0 : Dungeon.hero.HP;
			case "hero.hp%": return Dungeon.hero == null ? 0 : Dungeon.hero.HP * 100 / Math.max(1, Dungeon.hero.HT);
		}
		return null;
	}
	/** 영웅이 가진 아이템 개수: 프로젝트 아이템 id 또는 게임 클래스 이름(spd:ClassName) */
	public static int itemCount(String id) {
		if (Dungeon.hero == null) return 0;
		int n = 0;
		for (Item it : Dungeon.hero.belongings) {
			if (it instanceof MakerItem && id.equals(((MakerItem) it).makerId)) n += it.quantity();
			else if (it instanceof GenSupport.Coded && id.equals(((GenSupport.Coded) it).makerId())) n += it.quantity();
			else if (id.startsWith("spd:") && it.getClass().getSimpleName().equals(id.substring(4))) n += it.quantity();
		}
		return n;
	}

	// ------------------------------------------------------------ 저장

	private static final String NODE = "pdmaker_story";
	public static void store(Bundle bundle) {
		Bundle b = new Bundle();
		b.put("switches", switches.toArray(new String[0]));
		String[] vk = vars.keySet().toArray(new String[0]);
		int[] vv = new int[vk.length];
		for (int i = 0; i < vk.length; i++) vv[i] = vars.get(vk[i]);
		b.put("varKeys", vk); b.put("varVals", vv);
		b.put("strKeys", strs.keySet().toArray(new String[0])); b.put("strVals", strs.values().toArray(new String[0]));
		b.put("self", selfSwitches.toArray(new String[0]));
		b.put("flags", flags.toArray(new String[0]));
		b.put("route", route); b.put("ending", ending);
		b.put("pathKeys", paths.keySet().toArray(new String[0]));
		b.put("pathVals", paths.values().toArray(new String[0]));
		WorldGraph.store(b);
		HeroRuntime.store(b);
		HeartSystem.store(b);
		LevelHooks.store(b);
		bundle.put(NODE, b);
	}
	public static void restore(Bundle bundle) {
		reset();
		if (!bundle.contains(NODE)) return;
		Bundle b = bundle.getBundle(NODE);
		switches.clear();   // 처음부터 켜 둔 스위치는 저장된 상태로 덮어씀
		for (String s : b.getStringArray("switches")) switches.add(s);
		String[] vk = b.getStringArray("varKeys"); int[] vv = b.getIntArray("varVals");
		for (int i = 0; i < vk.length; i++) vars.put(vk[i], vv[i]);
		if (b.contains("strKeys")) { String[] sk = b.getStringArray("strKeys"), sv = b.getStringArray("strVals"); for (int i = 0; i < sk.length && i < sv.length; i++) strs.put(sk[i], sv[i]); }
		for (String s : b.getStringArray("self")) selfSwitches.add(s);
		for (String s : b.getStringArray("flags")) flags.add(s);
		route = b.getString("route"); ending = b.getString("ending");
		String[] pk = b.getStringArray("pathKeys"), pv = b.getStringArray("pathVals");
		if (pk != null && pv != null) for (int i = 0; i < pk.length && i < pv.length; i++) paths.put(pk[i], pv[i]);
		WorldGraph.restore(b);
		HeroRuntime.restore(b);
		HeartSystem.restore(b);
		LevelHooks.restore(b);
	}
}
