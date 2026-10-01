/*
 * 원래 SPD 생성기로 만든 층(절차 생성 / 혼합)에 프로젝트의 오브젝트를 끼워 넣습니다.
 *   Dungeon.newLevel() 에서 level.create() 뒤에 LevelHooks.afterCreate(level) 호출.
 *   배치 규칙: random(아무 방) · entrance(입구 근처) · exit(출구 근처) · special(아무 곳, M1 에서 특수 방으로)
 *   혼합(hybrid) 층의 "직접 그린 방" 끼워 넣기는 M1 (지금은 오브젝트만 배치)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.utils.Bundle;
import com.watabou.utils.PathFinder;
import com.watabou.utils.Random;
import com.watabou.utils.Reflection;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LevelHooks {

	/** 절차 생성 층의 이벤트 칸: "깊이:칸" → 이벤트 id  (StoryState 와 함께 저장) */
	static final Map<String, String> eventCells = new HashMap<>();

	/** 층을 떠나기 직전 위치 (돌아올 계단 고르기용) */
	public static int fromDepth = -1, fromBranch = 0;
	/** 떠날 때 밟은 계단 종류 (던전 밖 맵에서 "돌아가기" 할 때 같은 계단으로) */
	public static LevelTransition.Type fromType = null;
	/** 이번 층 생성 중 칠해진 템플릿 방 (오브젝트 배치용) */
	static final List<Room> painted = new ArrayList<>();

	// ------------------------------------------------------------ 방 추가 (RegularLevel.initRooms 끝에서 호출)

	/** 그룹 · 노드 설정의 "추가 방" + 혼합 노드의 직접 그린 방을 방 목록에 넣음 */
	public static void addRooms(Level level, ArrayList<Room> initRooms) {
		painted.clear();
		if (!MakerRuntime.isActive()) return;
		String id = WorldGraph.current();
		JsonValue f = WorldGraph.node(id);
		if (f == null) return;
		// 1) 혼합 노드: 직접 그린 방
		if ("hybrid".equals(f.getString("mode", "")) && f.get("layers") != null && f.get("layers").get("terrain") != null
				&& f.get("layers").get("terrain").size == f.get("size").getInt("w", 0) * f.get("size").getInt("h", 0)) {
			String place = f.get("hybrid") == null ? "special" : f.get("hybrid").getString("placement", "special");
			initRooms.add(place.equals("special") ? new TemplateSpecialRoom("node:" + id) : new TemplateRoom("node:" + id));
		}
		// 2) 그룹 전체 + 이 노드의 추가 방
		JsonValue g = WorldGraph.group(id);
		addList(initRooms, g == null ? null : g.get("rooms"));
		addList(initRooms, f.get("procedural") == null ? null : f.get("procedural").get("rooms"));
	}
	private static void addList(ArrayList<Room> initRooms, JsonValue list) {
		if (list == null) return;
		for (JsonValue e : list) {
			String rid = e.getString("room", "");
			JsonValue t = MakerRuntime.rooms.get(rid);
			if (t == null) { MakerRuntime.log("없는 방 템플릿: " + rid); continue; }
			if (!Cond.eval(e.getString("cond", ""), StoryState.globalResolver())) continue;
			int count = Math.max(1, e.getInt("count", 1));
			for (int i = 0; i < count; i++) {
				if (Random.Int(100) >= e.getInt("chance", 100)) continue;
				initRooms.add("special".equals(t.getString("kind", "standard")) ? new TemplateSpecialRoom("room:" + rid) : new TemplateRoom("room:" + rid));
			}
		}
	}

	// ------------------------------------------------------------ 층 생성 직후 (Dungeon.newLevel 의 level.create() 뒤)

	public static void afterCreate(Level level) {
		if (!MakerRuntime.isActive()) return;
		WorldGraph.wire(level, false);
		placeTemplateObjects(level);
		if (level instanceof MakerLevel) return;
		JsonValue f = MakerRuntime.here();
		if (f == null || f.get("objects") == null) return;
		boolean hybrid = "hybrid".equals(f.getString("mode", ""));
		for (JsonValue o : f.get("objects")) {
			JsonValue at = o.get("at");
			if (hybrid && at != null && at.has("x")) continue;   // 직접 그린 방 안의 좌표 오브젝트는 placeTemplateObjects 에서
			if (!Cond.eval(o.getString("cond", ""), StoryState.globalResolver())) continue;
			String rule = at == null ? "random" : at.getString("rule", "random");
			int cell = cellFor(level, rule);
			if (cell >= 0) placeObject(level, o, cell);
		}
	}

	static void placeObject(Level level, JsonValue o, int cell) {
		String type = o.getString("type", ""), ref = o.getString("ref", "");
		switch (type) {
			case "npc": {
				Mob g = gameChar(ref);
				if (g != null) { g.pos = cell; level.mobs.add(g); break; }
				MakerNPC n = MakerNPC.create(ref); n.eventId = o.getString("event", ""); n.pos = cell; level.mobs.add(n); break;
			}
			case "mob": {
				for (int i = 0; i < Math.max(1, o.getInt("count", 1)); i++) {
					Mob m = createMob(ref); if (m == null) break;
					m.pos = i == 0 ? cell : freeNeighbour(level, cell);
					if (m.pos >= 0) level.mobs.add(m);
				}
				break;
			}
			case "item": { Item it = MakerItem.create(ref); if (it != null) { it.quantity(Math.max(1, o.getInt("count", 1))); level.drop(it, cell); } break; }
			case "event":
				if (level instanceof MakerLevel) ((MakerLevel) level).eventCells.put(cell, ref);
				else eventCells.put(Dungeon.depth + ":" + Dungeon.branch + ":" + cell, ref);
				break;
		}
	}

	/** 템플릿 방에 그려 둔 오브젝트를 실제 위치에 배치 */
	static void placeTemplateObjects(Level level) {
		for (Room r : painted) {
			String key = r instanceof TemplateRoom ? ((TemplateRoom) r).templateKey : ((TemplateSpecialRoom) r).templateKey;
			JsonValue t = MakerRuntime.template(key);
			if (t == null || t.get("objects") == null) continue;
			for (JsonValue o : t.get("objects")) {
				JsonValue at = o.get("at");
				if (at == null || !at.has("x")) continue;
				if (!Cond.eval(o.getString("cond", ""), StoryState.globalResolver())) continue;
				int cell = (r.left + at.getInt("x")) + (r.top + at.getInt("y")) * level.width();
				if (cell >= 0 && cell < level.length()) placeObject(level, o, cell);
			}
		}
		painted.clear();
	}

	/** 층에 들어올 때마다: 계단 목적지를 데이터에서 다시 맞춤 */
	public static void refreshTargets(Level level) { WorldGraph.wire(level, true); }

	static int cellFor(Level level, String rule) {
		int base = -1;
		if (rule.equals("entrance")) base = level.entrance();
		else if (rule.equals("exit")) base = level.exit();
		if (base >= 0) { int c = freeNeighbour(level, base); if (c >= 0) return c; }
		for (int tries = 0; tries < 200; tries++) {
			int c = level.randomDestination(null);
			if (c >= 0 && Actor.findChar(c) == null && c != level.entrance() && c != level.exit()) return c;
		}
		return -1;
	}
	static int freeNeighbour(Level level, int cell) {
		for (int k = 0; k < 20; k++) {
			int c = cell + PathFinder.NEIGHBOURS8[Random.Int(8)];
			if (c >= 0 && c < level.length() && level.passable[c] && Actor.findChar(c) == null) return c;
		}
		return -1;
	}

	/** 'spd:Rat' → 게임 기본 몬스터,  프로젝트 캐릭터 id → MakerMob (원작 캐릭터 game + useGame 이면 게임 클래스 그대로) */
	public static Mob createMob(String ref) {
		if (ref.startsWith("spd:")) {
			Mob m = gameMob(ref.substring(4));
			if (m == null) MakerRuntime.log("게임 몬스터를 찾지 못함: " + ref);
			return m;
		}
		if (MakerRuntime.character(ref) == null) { MakerRuntime.log("없는 캐릭터: " + ref); return null; }
		Mob g = gameChar(ref);
		if (g != null) return g;
		return MakerMob.create(ref);
	}
	/** 게임 캐릭터 클래스 (actors.mobs 기준: "Rat" · "npcs.Ghost" · "Shaman$RedShaman") → 새 인스턴스 */
	public static Mob gameMob(String cls) {
		if (cls == null || cls.isEmpty()) return null;
		if (cls.startsWith("actors.mobs.")) cls = cls.substring(12);
		if (!cls.contains(".") && !cls.contains("$")) cls = Character.toUpperCase(cls.charAt(0)) + cls.substring(1);
		try {
			Class<?> c = Class.forName("com.shatteredpixel.shatteredpixeldungeon.actors.mobs." + cls);
			return (Mob) Reflection.newInstance(c);
		} catch (Throwable e) { return null; }
	}
	/** 프로젝트 캐릭터가 "게임 원래 동작 그대로"(원작 캐릭터: game 이 있고 useGame)면 게임 클래스 인스턴스, 아니면 null */
	public static Mob gameChar(String charId) {
		JsonValue d = MakerRuntime.character(charId);
		if (d == null || d.getString("game", "").isEmpty() || !d.getBoolean("useGame", true)) return null;
		Mob m = gameMob(d.getString("game"));
		if (m == null) MakerRuntime.warnOnce("게임 캐릭터 클래스를 찾지 못함: " + d.getString("game") + " (" + charId + ") — 데이터 캐릭터로 대신합니다");
		return m;
	}

	/** 절차 생성 층에서 영웅이 칸을 밟았을 때 (Level.occupyCell 에 한 줄 추가) */
	public static void onOccupy(Level level, Char ch) {
		if (!MakerRuntime.isActive() || level instanceof MakerLevel || ch != Dungeon.hero) return;
		String ev = eventCells.get(Dungeon.depth + ":" + Dungeon.branch + ":" + ch.pos);
		if (ev != null && !EventInterpreter.busy()) EventInterpreter.runEvent(ev, null, "touch");
	}

	// ------------------------------------------------------------ 사용자 테마 타일

	static JsonValue customTheme(String id) {
		JsonValue w = WorldGraph.world;
		if (w == null || w.get("customThemes") == null) return null;
		for (JsonValue c : w.get("customThemes")) if (id.equals(c.getString("id"))) return c;
		return null;
	}
	public static String customBase(String id) { JsonValue c = customTheme(id); return c == null ? "SEWER" : c.getString("base", "SEWER"); }

	/** 사용자 타일셋 PNG 를 TextureCache 에 문자열 키로 등록하고 그 키를 돌려줌 (실패하면 null → 바탕 테마) */
	@SuppressWarnings("unchecked")
	public static String customTiles(String id) {
		JsonValue c = customTheme(id);
		if (c == null || c.getString("tiles", "").isEmpty()) return null;
		String key = "pdmaker:tiles:" + id;
		try {
			Field f = TextureCache.class.getDeclaredField("all");
			f.setAccessible(true);
			Map<Object, SmartTexture> all = (Map<Object, SmartTexture>) f.get(null);
			if (!all.containsKey(key)) {
				Pixmap p = new Pixmap(MakerRuntime.root().child(c.getString("tiles")));
				all.put(key, new SmartTexture(p));
			}
			return key;
		} catch (Exception e) {
			MakerRuntime.log("사용자 타일셋 등록 실패(" + id + "): " + e);
			return null;
		}
	}

	// ------------------------------------------------------------ 저장

	static void store(Bundle b) {
		b.put("pdm_evcell_k", eventCells.keySet().toArray(new String[0]));
		b.put("pdm_evcell_v", eventCells.values().toArray(new String[0]));
		b.put("pdm_from", new int[]{fromDepth, fromBranch});
		b.put("pdm_fromType", fromType == null ? "" : fromType.name());
	}
	static void restore(Bundle b) {
		eventCells.clear();
		String[] k = b.getStringArray("pdm_evcell_k"), v = b.getStringArray("pdm_evcell_v");
		if (k != null && v != null) for (int i = 0; i < k.length && i < v.length; i++) eventCells.put(k[i], v[i]);
		int[] fr = b.getIntArray("pdm_from");
		if (fr != null && fr.length == 2) { fromDepth = fr[0]; fromBranch = fr[1]; }
		String ft = b.getString("pdm_fromType");
		try { fromType = ft == null || ft.isEmpty() ? null : LevelTransition.Type.valueOf(ft); } catch (Exception e) { fromType = null; }
	}
}
