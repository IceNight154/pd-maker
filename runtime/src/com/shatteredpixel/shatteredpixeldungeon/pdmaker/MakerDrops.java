/*
 * 드랍 테이블 · 등장 금지 · 전역 스위치
 *
 *   드랍 (아이템 편집기 "드랍 테이블" — 아이템의 drops, 게임 아이템은 gameitems.json 의 items["spd:…"].drops)
 *     { src: "mob",   char: <캐릭터 id>, chance: %, min, max, cond }   그 몬스터가 죽을 때
 *     { src: "floor", chance: %, min, max, depthMin, depthMax, groups:[그룹 id], cond }   층을 만들 때 바닥에 놓임
 *   캐릭터의 noGameLoot = true 면 게임 원래 전리품은 떨어뜨리지 않음
 *
 *   캐릭터 쪽 드랍 테이블 (캐릭터 편집기 "등장 · 전리품") — 캐릭터의 drops [{ item, chance, min, max, cond }]
 *   상자 드랍 테이블 ("드랍 테이블" 화면) — project.loot.<chest|locked|crystal|tomb|skeleton>
 *     { mode: "add"|"replace", pick: "each"|"one", rows: [{ item, chance, min, max, depthMin, depthMax, cond }] }
 *     each = 줄마다 따로 확률(%) · one = 확률을 가중치로 하나만 뽑음.  replace 인데 아무것도 안 뽑히면 원래 내용물 유지
 *     열쇠·퀘스트 아이템(unique)은 바꾸기에서도 남김. 맵에 직접 놓은 상자(오브젝트 container)는 건드리지 않음
 *
 *   등장 금지
 *     게임 아이템: gameitems.json 의 items["spd:…"].banned  → 게임의 무작위 생성(Generator)에서 뺌
 *     게임 몬스터: 캐릭터의 noSpawn (또는 "사용" 끔) + project.bannedMobs[]  → 층의 몬스터 목록(MobSpawner)에서 뺌
 *
 *   테마별 몬스터 ("드랍 테이블" 화면 › 테마별 몬스터) — project.themeMobs.<테마 id>
 *     { on, chance: %(100 = 이 목록만, 50 = 반은 게임 기본), mobs: [{ ref: 캐릭터 id | "spd:<게임 몬스터>", weight }], depthMin, depthMax }
 *     Level.createMob 연결 줄 — 지금 맵의 테마(노드 → 그룹 → 깊이 기본)로 고름. 사용자 테마에 목록이 없으면 바탕 테마의 목록.
 *     직접 그리기 맵의 "몬스터 스폰" 목록이 있으면 그것이 먼저.
 *
 *   금화 ("드랍 테이블" 화면 › 금화) — project.loot.gold
 *     { mult: %(게임이 만드는 금화 양 — Gold.random 연결 줄, 바닥 · 몬스터 · 상자 모두), noGame: 몬스터의 게임 금화 드랍 끄기,
 *       extra: { on, chance: %(30), min(5), max(15), perDepth(깊이마다 양 +, 3), boss: 보스 배율(5), cond } — 괄호 = 비웠을 때 (편집기 기본값과 같음) — 모든 적 몬스터가 죽을 때 금화를 더 떨어뜨림 }
 *
 *   전역 스위치: 새 게임을 시작해도 남는 값 (영웅 해금 조건 등). 조건식 global.<이름>, 이벤트 명령 "전역 스위치"
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.shatteredpixel.shatteredpixeldungeon.items.Gold;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Generator;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.keys.Key;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.watabou.utils.GameSettings;
import com.watabou.utils.Random;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class MakerDrops {

	static class Entry { String item; JsonValue d; }
	private static Map<String, List<Entry>> byChar;       // 캐릭터 id → 드랍
	private static List<Entry> floor;                     // 층 드랍
	private static Set<String> bannedMobs;                // 게임 클래스 이름 ("Rat", "Shaman$RedShaman")

	// ------------------------------------------------------------ 전역 스위치

	public static boolean global(String key) { return key != null && GameSettings.getBoolean("pdm_g_" + key, false); }
	public static void setGlobal(String key, boolean v) { if (key != null && !key.isEmpty()) GameSettings.put("pdm_g_" + key, v); }

	// ------------------------------------------------------------ 읽기 (MakerRuntime.init)

	public static synchronized void load() {
		byChar = new HashMap<>(); floor = new ArrayList<>(); bannedMobs = new HashSet<>();
		try {
			for (Map.Entry<String, JsonValue> e : MakerRuntime.items.entrySet()) addDrops(e.getKey(), e.getValue().get("drops"));
			JsonValue gi = MakerRuntime.gameitems == null ? null : MakerRuntime.gameitems.get("items");
			if (gi != null) for (JsonValue v : gi) { addDrops(v.name, v.get("drops")); if (v.getBoolean("banned", false)) banItem(v.name); }
			for (Map.Entry<String, JsonValue> ce : MakerRuntime.chars.entrySet()) {
				JsonValue cd = ce.getValue().get("drops");
				if (cd != null) for (JsonValue d : cd) { String it = d.getString("item", ""); if (it.isEmpty()) continue; Entry e = new Entry(); e.item = it; e.d = d; byChar.computeIfAbsent(ce.getKey(), k -> new ArrayList<>()).add(e); }
			}
			for (JsonValue c : MakerRuntime.chars.values()) if ((c.getBoolean("noSpawn", false) || MakerRuntime.off(c)) && !c.getString("game", "").isEmpty()) bannedMobs.add(c.getString("game", ""));
			JsonValue bm = MakerRuntime.project == null ? null : MakerRuntime.project.get("bannedMobs");
			if (bm != null) for (JsonValue v : bm) bannedMobs.add(v.asString());
		} catch (Throwable t) { MakerRuntime.log("드랍 테이블 읽기 오류: " + t); }
	}
	private static void addDrops(String item, JsonValue list) {
		if (list == null) return;
		for (JsonValue d : list) {
			Entry e = new Entry(); e.item = item; e.d = d;
			if ("floor".equals(d.getString("src", "mob"))) floor.add(e);
			else { String c = d.getString("char", ""); if (!c.isEmpty()) byChar.computeIfAbsent(c, k -> new ArrayList<>()).add(e); }
		}
	}
	/** 게임 아이템을 무작위 생성에서 빼기: "spd:weapon.melee.Sword" → Generator 의 그 클래스 확률 0 */
	private static void banItem(String ref) {
		String path = ref.startsWith("spd:") ? ref.substring(4) : ref;
		String cn = "com.shatteredpixel.shatteredpixeldungeon.items." + path;
		for (Generator.Category cat : Generator.Category.values()) {
			if (cat.classes == null) continue;
			for (int i = 0; i < cat.classes.length; i++) {
				if (!cat.classes[i].getName().equals(cn)) continue;
				for (String fn : new String[]{"probs", "defaultProbs", "defaultProbs2", "defaultProbsTotal"}) {
					try { float[] a = (float[]) Generator.Category.class.getField(fn).get(cat); if (a != null && i < a.length) a[i] = 0; } catch (Throwable ignored) { }
				}
			}
		}
	}

	// ------------------------------------------------------------ 몬스터 드랍 (Mob.rollToDropLoot 맨 앞 연결 줄)

	/** 이 몬스터의 프로젝트 캐릭터 id (게임 몬스터는 game 이 그 클래스인 캐릭터) */
	static String charOf(Mob m) {
		if (m instanceof MakerMob) return ((MakerMob) m).charId;
		String cn = m.getClass().getName();
		String pre = "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.";
		if (!cn.startsWith(pre)) return null;
		cn = cn.substring(pre.length());
		for (Map.Entry<String, JsonValue> e : MakerRuntime.chars.entrySet()) if (cn.equals(e.getValue().getString("game", ""))) return e.getKey();
		return null;
	}
	/** 드랍 테이블대로 떨어뜨림. true = 게임 원래 전리품은 건너뜀 */
	public static boolean mobDrop(Mob m) {
		try {
			if (!MakerRuntime.isActive() || Dungeon.level == null) return false;
			if (byChar == null) load();
			goldDrop(m);
			String id = charOf(m);
			if (id == null) return false;
			List<Entry> l = byChar.get(id);
			if (l != null) for (Entry e : l) {
				if (Random.Float() * 100f >= e.d.getFloat("chance", 100f)) continue;
				if (!Cond.eval(e.d.getString("cond", ""), StoryState.globalResolver())) continue;
				Item it = make(e);
				if (it != null) Dungeon.level.drop(it, m.pos).sprite.drop();
			}
			JsonValue c = MakerRuntime.character(id);
			return c != null && c.getBoolean("noGameLoot", false);
		} catch (Throwable t) { MakerRuntime.log("드랍 오류: " + t); return false; }
	}
	// ------------------------------------------------------------ 금화

	static JsonValue goldCfg() { JsonValue l = MakerRuntime.project == null ? null : MakerRuntime.project.get("loot"); return l == null ? null : l.get("gold"); }
	/** 게임이 만드는 금화 양 (Gold.random 연결 줄) × 배율 */
	public static int goldAmount(int q) {
		try {
			JsonValue g = goldCfg(); if (g == null) return q;
			float mult = g.getFloat("mult", 100f);
			return mult == 100f ? q : Math.max(0, Math.round(q * mult / 100f));
		} catch (Throwable t) { return q; }
	}
	/** 몬스터가 죽을 때: 게임 금화 드랍 끄기(loot 가 금화면 비움) · 모든 적 몬스터의 추가 금화 */
	static void goldDrop(Mob m) {
		JsonValue g = goldCfg(); if (g == null || m.alignment != com.shatteredpixel.shatteredpixeldungeon.actors.Char.Alignment.ENEMY) return;
		if (g.getBoolean("noGame", false)) {
			try {
				java.lang.reflect.Field f = Mob.class.getDeclaredField("loot"); f.setAccessible(true);
				Object l = f.get(m);
				if (l == Generator.Category.GOLD || l == Gold.class) f.set(m, null);
			} catch (Throwable ignored) { }
		}
		JsonValue x = g.get("extra");
		if (x == null || !x.getBoolean("on", false)) return;
		if (Random.Float() * 100f >= x.getFloat("chance", 30f)) return;
		if (!Cond.eval(x.getString("cond", ""), StoryState.globalResolver())) return;
		int min = Math.max(0, x.getInt("min", 5)), max = Math.max(min, x.getInt("max", Math.max(min, 15)));
		float n = Random.IntRange(min, max) + x.getFloat("perDepth", 3f) * Math.max(0, Dungeon.depth - 1);
		if (m.properties().contains(com.shatteredpixel.shatteredpixeldungeon.actors.Char.Property.BOSS)) n *= x.getFloat("boss", 5f);
		int q = Math.round(n);
		if (q > 0) Dungeon.level.drop(new Gold(q), m.pos).sprite.drop();
	}

	static Item make(Entry e) {
		Item it = MakerItem.create(e.item);
		if (it == null) return null;
		int min = Math.max(1, e.d.getInt("min", 1)), max = Math.max(min, e.d.getInt("max", min));
		int n = Random.IntRange(min, max);
		if (n > 1 && it.stackable) it.quantity(n);
		return it;
	}

	// ------------------------------------------------------------ 층 드랍 (LevelHooks.afterCreate)

	public static void floorDrops(Level level) {
		try {
			if (floor == null) load();
			if (floor.isEmpty()) return;
			String gid = WorldGraph.groupId(WorldGraph.current());
			for (Entry e : floor) {
				JsonValue d = e.d;
				int lo = d.getInt("depthMin", 0), hi = d.getInt("depthMax", 0);
				if (lo > 0 && Dungeon.depth < lo) continue;
				if (hi > 0 && Dungeon.depth > hi) continue;
				JsonValue gs = d.get("groups");
				if (gs != null && gs.size > 0) { boolean ok = false; for (JsonValue g : gs) if (g.asString().equals(gid)) ok = true; if (!ok) continue; }
				if (Random.Float() * 100f >= d.getFloat("chance", 100f)) continue;
				if (!Cond.eval(d.getString("cond", ""), StoryState.globalResolver())) continue;
				Item it = make(e);
				if (it == null) continue;
				int cell = -1;
				for (int i = 0; i < 30 && cell < 0; i++) { int c = level.randomRespawnCell(null); if (c >= 0 && level.heaps.get(c) == null && MakerProp.at(level, c) == null) cell = c; }
				if (cell >= 0) level.drop(it, cell);
			}
		} catch (Throwable t) { MakerRuntime.log("층 드랍 오류: " + t); }
	}

	// ------------------------------------------------------------ 상자 드랍 (LevelHooks.afterCreate — 게임이 만든 상자만)

	static String heapKey(Heap.Type t) {
		switch (t) {
			case CHEST: return "chest"; case LOCKED_CHEST: return "locked"; case CRYSTAL_CHEST: return "crystal";
			case TOMB: return "tomb"; case SKELETON: return "skeleton"; default: return null;
		}
	}
	public static Heap.Type heapType(String key) {
		switch (key == null ? "" : key) {
			case "chest": return Heap.Type.CHEST; case "locked": return Heap.Type.LOCKED_CHEST; case "crystal": return Heap.Type.CRYSTAL_CHEST;
			case "tomb": return Heap.Type.TOMB; case "skeleton": return Heap.Type.SKELETON; default: return Heap.Type.HEAP;
		}
	}
	private static boolean rowOk(JsonValue d) {
		int lo = d.getInt("depthMin", 0), hi = d.getInt("depthMax", 0);
		if (lo > 0 && Dungeon.depth < lo) return false;
		if (hi > 0 && Dungeon.depth > hi) return false;
		if (d.getString("item", "").isEmpty()) return false;
		return Cond.eval(d.getString("cond", ""), StoryState.globalResolver());
	}
	/** 표 하나를 굴려 나온 아이템들 */
	static List<Item> roll(JsonValue table) {
		List<Item> out = new ArrayList<>();
		JsonValue rows = table == null ? null : table.get("rows");
		if (rows == null) return out;
		List<JsonValue> ok = new ArrayList<>();
		for (JsonValue d : rows) if (rowOk(d)) ok.add(d);
		if ("one".equals(table.getString("pick", "each"))) {
			float total = 0; for (JsonValue d : ok) total += Math.max(0, d.getFloat("chance", 0));
			if (total <= 0) return out;
			float r = Random.Float() * total;
			for (JsonValue d : ok) { r -= Math.max(0, d.getFloat("chance", 0)); if (r < 0) { addItem(out, d); break; } }
		} else for (JsonValue d : ok) if (Random.Float() * 100f < d.getFloat("chance", 100f)) addItem(out, d);
		return out;
	}
	private static void addItem(List<Item> out, JsonValue d) {
		Entry e = new Entry(); e.item = d.getString("item", ""); e.d = d;
		Item it = make(e); if (it != null) out.add(it);
	}
	public static void chestLoot(Level level) {
		try {
			JsonValue loot = MakerRuntime.project == null ? null : MakerRuntime.project.get("loot");
			if (loot == null) return;
			for (Heap hp : level.heaps.valueList()) {
				String k = heapKey(hp.type);
				JsonValue t = k == null ? null : loot.get(k);
				if (t == null) continue;
				List<Item> got = roll(t);
				if (got.isEmpty()) continue;
				if ("replace".equals(t.getString("mode", "add"))) {
					ArrayList<Item> keep = new ArrayList<>();
					for (Item it : hp.items) if (it.unique || it instanceof Key) keep.add(it);
					hp.items.clear(); hp.items.addAll(keep);
				}
				for (Item it : got) hp.items.add(it);   // 상자 안에는 겹치지 않고 그대로 담음 (맨 위 = 원래 내용물)
			}
		} catch (Throwable t) { MakerRuntime.log("상자 드랍 오류: " + t); }
	}

	// ------------------------------------------------------------ 테마별 몬스터 (Level.createMob 연결 줄)

	/** 지금 맵의 테마에 정한 몬스터 목록에서 하나 (없거나 확률에서 빠지면 null → 게임 기본) */
	public static com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob themeMob(com.shatteredpixel.shatteredpixeldungeon.levels.Level level) {
		try {
			if (!MakerRuntime.isActive() || MakerRuntime.project == null) return null;
			JsonValue all = MakerRuntime.project.get("themeMobs");
			if (all == null || all.size == 0) return null;
			String node = WorldGraph.current();
			String th = node != null ? WorldGraph.theme(node) : MakerRuntime.defaultTheme(Dungeon.depth);
			JsonValue t = themeEntry(all, th);
			if (t == null) return null;
			if (Dungeon.depth < t.getInt("depthMin", 0) || (t.getInt("depthMax", 0) > 0 && Dungeon.depth > t.getInt("depthMax", 0))) return null;
			if (Random.Float() * 100f >= t.getFloat("chance", 100f)) return null;
			JsonValue list = t.get("mobs");
			int total = 0;
			for (JsonValue m : list) total += themeWeight(m);
			if (total <= 0) return null;
			int r = Random.Int(total);
			for (JsonValue m : list) {
				r -= themeWeight(m);
				if (r < 0) {
					com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mob = LevelHooks.createMob(m.getString("ref", ""));
					if (mob != null) com.shatteredpixel.shatteredpixeldungeon.actors.buffs.ChampionEnemy.rollForChampion(mob);
					return mob;
				}
			}
		} catch (Throwable t) { MakerRuntime.log("테마별 몬스터 오류: " + t); }
		return null;
	}
	/** 무게 ("사용" 을 끈 캐릭터는 0 — 뽑지 않음) */
	static int themeWeight(JsonValue m) { String ref = m.getString("ref", ""); return !ref.startsWith("spd:") && MakerRuntime.off(MakerRuntime.character(ref)) ? 0 : Math.max(0, m.getInt("weight", 1)); }
	/** 테마 id 의 목록 (켜져 있고 몬스터가 있을 때). 사용자 테마는 없으면 바탕 테마 */
	static JsonValue themeEntry(JsonValue all, String th) {
		for (int i = 0; i < 3 && th != null && !th.isEmpty(); i++) {
			JsonValue t = all.get(th);
			if (t != null && t.getBoolean("on", true) && t.get("mobs") != null && t.get("mobs").size > 0) return t;
			th = customBase(th);
		}
		return null;
	}
	static String customBase(String th) {
		if (th.startsWith("custom:")) th = th.substring(7);
		JsonValue cts = WorldGraph.world == null ? null : WorldGraph.world.get("customThemes");
		if (cts != null) for (JsonValue c : cts) if (th.equals(c.getString("id", ""))) return c.getString("base", "");
		return null;
	}

	// ------------------------------------------------------------ 몬스터 등장 금지 (MobSpawner.getMobRotation 연결 줄)

	public static void filterMobs(ArrayList<Class<? extends Mob>> mobs) {
		try {
			if (!MakerRuntime.isActive() || mobs == null) return;
			if (bannedMobs == null) load();
			if (bannedMobs.isEmpty()) return;
			String pre = "com.shatteredpixel.shatteredpixeldungeon.actors.mobs.";
			ArrayList<Class<? extends Mob>> keep = new ArrayList<>();
			for (Class<? extends Mob> c : mobs) { String n = c.getName(); if (!(n.startsWith(pre) && bannedMobs.contains(n.substring(pre.length())))) keep.add(c); }
			if (keep.isEmpty()) { MakerRuntime.warnOnce("이 층에 나올 수 있는 몬스터를 모두 등장 금지해서, 금지를 무시하고 원래대로 나옵니다 (깊이 " + Dungeon.depth + ")"); return; }
			mobs.clear(); mobs.addAll(keep);
		} catch (Throwable t) { MakerRuntime.log("등장 금지 오류: " + t); }
	}
}
