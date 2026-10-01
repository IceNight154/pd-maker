/*
 * 맵 그래프 — maps/world.json (그룹 · 노드 · 연결) + maps/nodes/<id>.json (노드의 맵 데이터)
 *
 *   노드마다 게임의 (depth, branch) 번호를 에디터(world.js)와 같은 규칙으로 계산합니다.
 *     depth  : 시작 노드 1, 연결을 따라 +1 (가장 긴 경로). 노드 데이터의 depth(1 이상)가 있으면 고정
 *     branch : depth 가 같은 노드끼리 0, 2, 3 … (1 은 게임의 광산)
 *
 *   계단 연결 (wire)
 *     · 입구 계단: 노드의 entranceTo 가 있으면 그 노드로, 없으면 "온 곳"(마지막으로 앞에서 들어온 노드) 으로.
 *                  시작 노드에 처음 들어온 상태면 원래대로 "지상으로 나가기"
 *     · 출구 계단: kind = main 연결. 여러 개면 조건을 통과한 것 중 무게대로 하나 (처음 한 번 정해 저장)
 *     · 샛길 계단: kind = stair 연결. 조건을 만족하면 계단이 하나 더 생김 (직접 그린 맵은 두 번째 출구 타일부터 차례로)
 *     · 통로     : kind = door 연결. 연결마다 "출발 노드의 출구 하나 ↔ 도착 노드의 입구 하나" 가 짝지어짐.
 *                  같은 두 노드 사이에 여러 개를 그을 수 있고, 연결마다 다른 출구·입구를 씀.
 *                  exit / entrance = 직접 그린 맵의 출구·입구 타일 번호 (-1 = 자동: 남은 타일 차례로)
 *                  타일이 모자라거나 자동 생성 맵이면 계단을 새로 놓음 (한 번 정해 저장)
 *                  이 통로로 이동하면 반대쪽 짝 계단에 도착 (Level.getTransition 맨 앞 → pickArrival)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.utils.Bundle;
import com.watabou.utils.Random;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class WorldGraph {

	public static JsonValue world;
	/** 노드 id → 맵 데이터 */
	public static final Map<String, JsonValue> data = new LinkedHashMap<>();
	/** 노드 id → {depth, branch} */
	static final Map<String, int[]> where = new HashMap<>();
	static final Map<Long, String> byWhere = new HashMap<>();
	static final List<String> ids = new ArrayList<>();
	static final List<JsonValue> edges = new ArrayList<>();
	static String start = null;

	/** 노드 id → 마지막으로 앞에서 들어온 곳 "depth,branch,TYPE" (세이브에 저장) */
	static final Map<String, String> cameFrom = new HashMap<>();
	/** "노드|연결id" → 자동 생성 맵에 놓은 샛길 계단 칸 (세이브에 저장) */
	static final Map<String, Integer> stairCells = new HashMap<>();

	static long key(int d, int b) { return d * 100000L + b; }

	// ------------------------------------------------------------ 불러오기 · 계산

	static void load(JsonValue w) {
		world = w;
		ids.clear(); edges.clear(); where.clear(); byWhere.clear();
		if (w == null) return;
		if (w.get("nodes") != null) for (JsonValue n : w.get("nodes")) ids.add(n.getString("id"));
		if (w.get("edges") != null) for (JsonValue e : w.get("edges")) {
			String f = e.getString("from", ""), t = e.getString("to", "");
			if (!f.equals(t) && ids.contains(f) && ids.contains(t)) edges.add(e);
		}
		compute();
	}

	static void compute() {
		start = world.getString("start", "");
		if (!ids.contains(start)) start = ids.isEmpty() ? null : ids.get(0);
		Map<String, Integer> fixed = new HashMap<>(), depth = new HashMap<>(), found = new HashMap<>();
		for (String id : ids) { JsonValue d = data.get(id); if (d != null && d.getInt("depth", 0) > 0) fixed.put(id, d.getInt("depth", 0)); }
		int order = 0;
		if (start != null) {
			ArrayList<String> q = new ArrayList<>();
			q.add(start); found.put(start, order++);
			while (!q.isEmpty()) {
				String a = q.remove(0);
				for (JsonValue e : edges) if (e.getString("from").equals(a)) {
					String t = e.getString("to");
					if (!found.containsKey(t)) { found.put(t, order++); q.add(t); }
				}
			}
			depth.put(start, fixed.containsKey(start) ? fixed.get(start) : 1);
			for (int it = 0; it < ids.size(); it++) {
				boolean changed = false;
				for (JsonValue e : edges) {
					String f = e.getString("from"), t = e.getString("to");
					if (!depth.containsKey(f)) continue;
					if (!(found.containsKey(t) && found.containsKey(f) && found.get(t) > found.get(f))) continue;
					int want = fixed.containsKey(t) ? fixed.get(t) : Math.min(depth.get(f) + 1, 99);
					if (!depth.containsKey(t) || (!fixed.containsKey(t) && want > depth.get(t))) { depth.put(t, want); changed = true; }
				}
				if (!changed) break;
			}
		}
		for (String id : ids) if (!depth.containsKey(id)) depth.put(id, fixed.containsKey(id) ? fixed.get(id) : 1);
		List<String> sorted = new ArrayList<>(ids);
		sorted.sort((a, b) -> {
			int c = depth.get(a) - depth.get(b); if (c != 0) return c;
			c = (found.containsKey(a) ? found.get(a) : 1000000) - (found.containsKey(b) ? found.get(b) : 1000000); if (c != 0) return c;
			return ids.indexOf(a) - ids.indexOf(b);
		});
		Map<Integer, Integer> next = new HashMap<>();
		for (String id : sorted) {
			int d = depth.get(id);
			int n = next.containsKey(d) ? next.get(d) : 0;
			next.put(d, n == 0 ? 2 : n + 1);
			where.put(id, new int[]{d, n});
			byWhere.put(key(d, n), id);
		}
	}

	// ------------------------------------------------------------ 조회

	public static String at(int depth, int branch) { return byWhere.get(key(depth, branch)); }
	public static String current() { return MakerRuntime.isActive() ? at(Dungeon.depth, Dungeon.branch) : null; }
	public static JsonValue node(String id) { return id == null ? null : data.get(id); }
	public static int[] whereOf(String id) { return where.get(id); }

	static JsonValue pos(String id) {
		if (world == null || world.get("nodes") == null) return null;
		for (JsonValue n : world.get("nodes")) if (id.equals(n.getString("id"))) return n;
		return null;
	}
	public static JsonValue group(String id) {
		JsonValue p = pos(id);
		if (p == null || world.get("groups") == null) return null;
		String g = p.getString("group", "");
		for (JsonValue x : world.get("groups")) if (g.equals(x.getString("id"))) return x;
		return null;
	}
	public static String groupId(String id) { JsonValue g = group(id); return g == null ? "" : g.getString("id", ""); }

	public static String theme(String id) {
		JsonValue d = node(id);
		if (d != null && !d.getString("theme", "").isEmpty()) return d.getString("theme");
		JsonValue g = group(id);
		if (g != null && !g.getString("theme", "").isEmpty()) return g.getString("theme");
		int[] w = where.get(id);
		return MakerRuntime.defaultTheme(w == null ? 1 : w[0]);
	}
	public static String direction(String id) {
		JsonValue g = group(id);
		String dir = MakerRuntime.project == null ? "down" : MakerRuntime.project.getString("direction", "down");
		if (g != null && !g.getString("direction", "").isEmpty()) dir = g.getString("direction");
		return dir;
	}

	static List<JsonValue> out(String id) {
		List<JsonValue> o = new ArrayList<>();
		for (JsonValue e : edges) if (e.getString("from").equals(id)) o.add(e);
		return o;
	}

	// ------------------------------------------------------------ 계단 연결

	static boolean isEntrance(LevelTransition t) {
		return t.type == LevelTransition.Type.REGULAR_ENTRANCE || t.type == LevelTransition.Type.SURFACE || t.type == LevelTransition.Type.BRANCH_ENTRANCE;
	}
	static void setDest(LevelTransition t, String target, LevelTransition.Type destType) {
		int[] w = where.get(target);
		if (w == null) return;
		t.destDepth = w[0]; t.destBranch = w[1]; t.destType = destType;
	}

	/** 이 노드로 "되돌아가는" 곳: 기억 → 들어오는 연결의 출발 노드 → null */
	static Object[] backOf(String id) {
		String m = cameFrom.get(id);
		if (m != null) {
			String[] p = m.split(",");
			try {
				String from = at(Integer.parseInt(p[0]), Integer.parseInt(p[1]));
				if (from != null && !from.equals(id)) return new Object[]{from, LevelTransition.Type.valueOf(p[2])};
			} catch (Exception ignored) { }
		}
		for (JsonValue e : edges) if (e.getString("to").equals(id) && !isDoor(e))
			return new Object[]{e.getString("from"), "stair".equals(e.getString("kind", "main")) ? LevelTransition.Type.BRANCH_EXIT : LevelTransition.Type.REGULAR_EXIT};
		for (JsonValue e : edges) if (e.getString("to").equals(id))
			return new Object[]{e.getString("from"), "stair".equals(e.getString("kind", "main")) ? LevelTransition.Type.BRANCH_EXIT : LevelTransition.Type.REGULAR_EXIT};
		return null;
	}

	/** 출구 연결 고르기 (여러 개면 무게대로, 처음 한 번 정해 저장) */
	static JsonValue mainExit(String id) {
		List<JsonValue> ok = new ArrayList<>();
		for (JsonValue e : out(id)) if ("main".equals(kind(e)) && Cond.eval(e.getString("cond", ""), StoryState.globalResolver())) ok.add(e);
		if (ok.isEmpty()) return null;
		if (ok.size() == 1) return ok.get(0);
		String chosen = StoryState.choice(id);
		if (chosen != null) for (JsonValue e : ok) if (chosen.equals(e.getString("to"))) return e;
		int total = 0;
		for (JsonValue e : ok) total += Math.max(0, e.getInt("weight", 100));
		JsonValue pick = ok.get(0);
		if (total > 0) {
			int r = Random.Int(total);
			for (JsonValue e : ok) { r -= Math.max(0, e.getInt("weight", 100)); if (r < 0) { pick = e; break; } }
		}
		StoryState.setChoice(id, pick.getString("to"));
		MakerRuntime.log("출구 갈림길: " + id + " → " + pick.getString("to"));
		return pick;
	}

	// ------------------------------------------------------------ 통로 (door) — 연결마다 출구·입구 짝

	static String kind(JsonValue e) { return e.getString("kind", "main"); }
	static boolean isDoor(JsonValue e) { return "door".equals(kind(e)); }
	static String eid(JsonValue e) { return e.getString("id", e.getString("from") + ">" + e.getString("to")); }
	static JsonValue edge(String eid) { for (JsonValue e : edges) if (eid.equals(eid(e))) return e; return null; }
	static List<JsonValue> in(String id) {
		List<JsonValue> o = new ArrayList<>();
		for (JsonValue e : edges) if (e.getString("to").equals(id)) o.add(e);
		return o;
	}
	static boolean condOk(JsonValue e) { return Cond.eval(e.getString("cond", ""), StoryState.globalResolver()); }

	/** 직접 그린 맵 데이터의 출구(exit=true) / 입구 타일 칸 (맵 순서) */
	static List<Integer> tiles(String id, boolean exit) {
		List<Integer> r = new ArrayList<>();
		JsonValue d = node(id);
		if (d == null || d.get("layers") == null || d.get("layers").get("terrain") == null) return r;
		JsonValue t = d.get("layers").get("terrain");
		for (int i = 0; i < t.size; i++) {
			int m = t.getInt(i);
			if (exit ? (m == Terrain.EXIT || m == Terrain.UNLOCKED_EXIT || m == Terrain.LOCKED_EXIT) : (m == Terrain.ENTRANCE || m == Terrain.ENTRANCE_SP)) r.add(i);
		}
		return r;
	}

	/** 한 층의 계단 배정 결과 */
	static final class Ports {
		/** "연결id|out" (출발 쪽 출구) / "연결id|in" (도착 쪽 입구) → 칸 */
		final Map<String, Integer> cell = new HashMap<>();
		/** 칸 → "연결id|out|in" */
		final Map<Integer, String> at = new HashMap<>();
		/** 직접 그린 맵: 출구 연결(main)·되돌아가기용 타일 */
		int mainTile = -1;
		/** 직접 그린 맵: 샛길 연결 순서대로 쓸 타일 */
		final List<Integer> stairTiles = new ArrayList<>();
		/** 새로 놓아야 하는(아직 칸이 없는) 통로 끝: [연결, "out"|"in"] */
		final List<Object[]> missing = new ArrayList<>();
		/** 자동 생성 맵의 원래 출구·입구를 통로가 쓰는 칸 (계단 종류를 REGULAR 로 유지) */
		final Set<Integer> regular = new HashSet<>();
		void put(JsonValue e, String role, int c) { cell.put(eid(e) + "|" + role, c); at.put(c, eid(e) + "|" + role); }
	}
	static String extraKey(String id, JsonValue e, String role) { return id + "|door:" + eid(e) + "|" + role; }
	static int nextFree(List<Integer> tiles, Set<Integer> used) {
		for (int i = 0; i < tiles.size(); i++) if (!used.contains(i)) { used.add(i); return tiles.get(i); }
		return -1;
	}
	static int firstCell(Level level, LevelTransition.Type... types) {
		for (LevelTransition t : level.transitions) for (LevelTransition.Type ty : types) if (t.type == ty) return t.cell();
		return -1;
	}
	/** 입구 첫 타일(자동 생성 맵은 원래 입구)을 통로 말고 원래 용도(되돌아가기·지상)로 남겨야 하는지 */
	static boolean keepFirstEntrance(String id) {
		JsonValue d = node(id);
		if (id.equals(start) || (d != null && !d.getString("entranceTo", "").isEmpty())) return true;
		List<JsonValue> ins = in(id);
		if (ins.isEmpty()) return true;
		for (JsonValue e : ins) if (!isDoor(e)) return true;
		return false;
	}

	/** 이 층(노드 id)의 계단 배정 — 데이터만으로 정해지므로 언제 계산해도 같음 (새로 놓은 계단은 stairCells 에 저장된 것) */
	static Ports ports(Level level, String id) {
		Ports p = new Ports();
		boolean hand = level instanceof MakerLevel;
		List<JsonValue> outs = out(id), ins = in(id);
		boolean hasMain = false, hasDoorOut = false;
		for (JsonValue e : outs) { if ("main".equals(kind(e))) hasMain = true; if (isDoor(e)) hasDoorOut = true; }
		// ---- 출구 쪽
		if (hand) {
			List<Integer> ex = tiles(id, true);
			Set<Integer> used = new HashSet<>();
			List<JsonValue> auto = new ArrayList<>();
			for (JsonValue e : outs) if (isDoor(e)) {
				int k = e.getInt("exit", -1);
				if (k >= 0 && k < ex.size() && !used.contains(k)) { used.add(k); p.put(e, "out", ex.get(k)); }
				else auto.add(e);
			}
			if (hasMain || !hasDoorOut) p.mainTile = nextFree(ex, used);   // 출구 연결(또는 되돌아가기)용
			for (JsonValue e : auto) { int c = nextFree(ex, used); if (c >= 0) p.put(e, "out", c); else p.missing.add(new Object[]{e, "out"}); }
			for (JsonValue e : outs) if ("stair".equals(kind(e))) { int c = nextFree(ex, used); if (c < 0) break; p.stairTiles.add(c); }
		} else {
			int reg = firstCell(level, LevelTransition.Type.REGULAR_EXIT);
			boolean regFree = !hasMain && reg >= 0;
			for (JsonValue e : outs) if (isDoor(e)) {
				if (regFree) { p.put(e, "out", reg); p.regular.add(reg); regFree = false; continue; }
				p.missing.add(new Object[]{e, "out"});
			}
		}
		// ---- 입구 쪽
		boolean keep = keepFirstEntrance(id);
		if (hand) {
			List<Integer> en = tiles(id, false);
			Set<Integer> used = new HashSet<>();
			if (keep && !en.isEmpty()) used.add(0);
			List<JsonValue> auto = new ArrayList<>();
			for (JsonValue e : ins) if (isDoor(e)) {
				int k = e.getInt("entrance", -1);
				if (k >= 0 && k < en.size()) { used.add(k); p.put(e, "in", en.get(k)); }   // 직접 고른 번호는 겹쳐도 그대로
				else auto.add(e);
			}
			for (JsonValue e : auto) { int c = nextFree(en, used); if (c >= 0) p.put(e, "in", c); else p.missing.add(new Object[]{e, "in"}); }
		} else {
			int reg = firstCell(level, LevelTransition.Type.REGULAR_ENTRANCE, LevelTransition.Type.SURFACE);
			boolean regFree = !keep && reg >= 0;
			for (JsonValue e : ins) if (isDoor(e)) {
				if (regFree) { p.put(e, "in", reg); p.regular.add(reg); regFree = false; continue; }
				p.missing.add(new Object[]{e, "in"});
			}
		}
		// ---- 새로 놓은 계단 (저장된 칸)
		for (Object[] m : new ArrayList<>(p.missing)) {
			Integer c = stairCells.get(extraKey(id, (JsonValue) m[0], (String) m[1]));
			if (c != null) { p.put((JsonValue) m[0], (String) m[1], c); p.missing.remove(m); }
		}
		return p;
	}

	/** 현재 층에서 통로 연결의 계단 칸 (role: out = 출발 쪽 출구, in = 도착 쪽 입구) — 없으면 -1 */
	public static int portCell(Level level, String edgeId, String role) {
		String id = current();
		if (id == null || level == null) return -1;
		Integer c = ports(level, id).cell.get(edgeId + "|" + role);
		return c == null ? -1 : c;
	}

	/** 층을 떠날 때: 밟은 계단이 통로면 기억 (도착 층에서 짝 계단으로) */
	public static String viaEdge = null, viaRole = null;
	static boolean arriving = false;
	static void noteLeave(Level level, LevelTransition ct) {
		viaEdge = null; viaRole = null; arriving = true;
		String id = current();
		if (id == null || level == null || ct == null) return;
		String v = ports(level, id).at.get(ct.cell());
		if (v == null) return;
		int bar = v.lastIndexOf('|');
		viaEdge = v.substring(0, bar); viaRole = v.substring(bar + 1);
	}
	static void arrived() { arriving = false; }

	private static boolean picking = false;
	/** Level.getTransition(type) 맨 앞: 통로로 들어오는 중이면 짝 계단 */
	public static LevelTransition pickArrival(Level level, LevelTransition.Type type) {
		if (!arriving || viaEdge == null || picking || !MakerRuntime.isActive() || level == null) return null;
		picking = true;
		try {
			String id = current();
			JsonValue e = id == null ? null : edge(viaEdge);
			if (e == null) return null;
			String role;
			if ("out".equals(viaRole) && id.equals(e.getString("to"))) role = "in";
			else if ("in".equals(viaRole) && id.equals(e.getString("from"))) role = "out";
			else return null;
			Integer c = ports(level, id).cell.get(eid(e) + "|" + role);
			if (c == null || c < 0 || c >= level.length()) return null;
			for (LevelTransition t : level.transitions) if (t.cell() == c) return t;
			return new LevelTransition(level, c, "in".equals(role) ? LevelTransition.Type.REGULAR_ENTRANCE : LevelTransition.Type.REGULAR_EXIT);
		} catch (Throwable t) {
			MakerRuntime.log("통로 도착 계산 실패: " + t);
			return null;
		} finally { picking = false; }
	}

	/** 층을 만든 직후(live=false) · 층에 들어올 때마다(live=true) 계단 목적지를 데이터로 다시 맞춤 */
	public static void wire(Level level, boolean live) {
		String id = current();
		if (id == null || level == null) return;
		JsonValue d = node(id);
		Ports P = ports(level, id);
		// ---- 통로 계단 중 아직 칸이 없는 것: 새로 놓음 (출구 쪽은 조건을 만족할 때만)
		for (Object[] m : P.missing) {
			JsonValue e = (JsonValue) m[0]; String role = (String) m[1];
			boolean outSide = "out".equals(role);
			if (outSide && !condOk(e)) continue;
			int c = -1;
			JsonValue at = e.get(outSide ? "at" : "atIn");
			if (outSide && "xy".equals(e.getString("place", "")) && at != null && level instanceof MakerLevel) c = at.getInt("x", 0) + at.getInt("y", 0) * level.width();
			if (c < 0 && level instanceof MakerLevel) {
				// 직접 그린 맵: 출구(또는 입구) 타일 옆
				List<Integer> base = tiles(id, outSide);
				String place = e.getString("place", "exit");
				if (!outSide || place.equals("exit") || place.equals("xy")) for (int b : base) { c = LevelHooks.freeNeighbour(level, b); if (c >= 0 && P.at.get(c) == null && level.map[c] != Terrain.EXIT && level.map[c] != Terrain.ENTRANCE) break; c = -1; }
			}
			if (c < 0) c = LevelHooks.cellFor(level, outSide ? e.getString("place", "exit").replace("xy", "exit") : "entrance");
			if (c < 0) { MakerRuntime.log("통로 계단 자리를 찾지 못함: " + eid(e) + " " + role); continue; }
			stairCells.put(extraKey(id, e, role), c);
			Level.set(c, outSide ? Terrain.EXIT : Terrain.ENTRANCE, level);
			if (live) {
				GameScene.updateMap(c);
				if (outSide) { String msg = e.getString("message", ""); GLog.p(msg.isEmpty() ? "어딘가에 새로운 길이 열렸다…" : msg); }
			}
			P.put(e, role, c);
		}
		// 통로 계단 다시 만듦 (자동 생성 맵에 새로 놓은 것은 BRANCH 종류 → 원래 출구·입구와 구별)
		final boolean hand = level instanceof MakerLevel;
		level.transitions.removeIf(t -> P.at.containsKey(t.cell()));
		for (Map.Entry<Integer, String> en : P.at.entrySet()) {
			String v = en.getValue(); int bar = v.lastIndexOf('|');
			JsonValue e = edge(v.substring(0, bar));
			if (e == null) continue;
			boolean outSide = v.endsWith("|out");
			if (outSide) {
				if (!condOk(e)) continue;   // 조건 전: 계단 그림만 있고 막힘
				LevelTransition t = new LevelTransition(level, en.getKey(), hand || P.regular.contains(en.getKey()) ? LevelTransition.Type.REGULAR_EXIT : LevelTransition.Type.BRANCH_EXIT);
				setDest(t, e.getString("to"), LevelTransition.Type.REGULAR_ENTRANCE);
				level.transitions.add(t);
			} else {
				LevelTransition t = new LevelTransition(level, en.getKey(), hand || P.regular.contains(en.getKey()) ? LevelTransition.Type.REGULAR_ENTRANCE : LevelTransition.Type.BRANCH_ENTRANCE);
				setDest(t, e.getString("from"), LevelTransition.Type.REGULAR_EXIT);
				level.transitions.add(t);
			}
		}
		// ---- 입구 (통로가 아닌 것)
		String ent = d == null ? "" : d.getString("entranceTo", "");
		Object[] back = backOf(id);
		for (LevelTransition t : level.transitions) {
			if (!isEntrance(t) || P.at.containsKey(t.cell())) continue;
			if (!ent.isEmpty() && where.containsKey(ent)) {
				if (t.type == LevelTransition.Type.SURFACE) t.type = LevelTransition.Type.REGULAR_ENTRANCE;
				setDest(t, ent, LevelTransition.Type.REGULAR_EXIT);
			} else if (back != null) {
				if (t.type == LevelTransition.Type.SURFACE) t.type = LevelTransition.Type.REGULAR_ENTRANCE;
				setDest(t, (String) back[0], (LevelTransition.Type) back[1]);
			} else if (id.equals(start)) {
				t.type = LevelTransition.Type.SURFACE; t.destDepth = 0; t.destBranch = 0; t.destType = null;
			} else if (start != null) {
				if (t.type == LevelTransition.Type.SURFACE) t.type = LevelTransition.Type.REGULAR_ENTRANCE;
				setDest(t, start, LevelTransition.Type.REGULAR_ENTRANCE);
			}
		}
		// ---- 출구 · 샛길
		JsonValue main = mainExit(id);
		List<JsonValue> stairs = new ArrayList<>();
		for (JsonValue e : out(id)) if ("stair".equals(kind(e))) stairs.add(e);
		int used = 0;
		if (level instanceof MakerLevel) {
			// 직접 그린 맵: 출구 타일에서 다시 만듦 (통로가 쓰지 않은 타일: 출구 연결 → 샛길 연결 차례로)
			level.transitions.removeIf(t -> !isEntrance(t) && !P.at.containsKey(t.cell()));
			if (P.mainTile >= 0) {
				LevelTransition t = new LevelTransition(level, P.mainTile, LevelTransition.Type.REGULAR_EXIT);
				boolean ok = true;
				if (main != null) setDest(t, main.getString("to"), LevelTransition.Type.REGULAR_ENTRANCE);
				else if (back != null) setDest(t, (String) back[0], (LevelTransition.Type) back[1]);
				else if (start != null) setDest(t, start, LevelTransition.Type.REGULAR_ENTRANCE);   // 갈 곳 없음: 시작 노드로
				else ok = false;
				if (ok) level.transitions.add(t);
			}
			for (int c : P.stairTiles) {
				JsonValue e = stairs.get(used++);
				if (!condOk(e)) continue;   // 조건 전: 계단 그림만 있고 막힘
				level.transitions.removeIf(t -> t.cell() == c && !isEntrance(t));
				LevelTransition t = new LevelTransition(level, c, LevelTransition.Type.BRANCH_EXIT);
				setDest(t, e.getString("to"), LevelTransition.Type.REGULAR_ENTRANCE);
				level.transitions.add(t);
			}
		} else {
			for (LevelTransition t : level.transitions) {
				if (t.type != LevelTransition.Type.REGULAR_EXIT || P.at.containsKey(t.cell())) continue;
				if (main != null) setDest(t, main.getString("to"), LevelTransition.Type.REGULAR_ENTRANCE);
				else if (back != null) setDest(t, (String) back[0], (LevelTransition.Type) back[1]);
				else if (start != null) setDest(t, start, LevelTransition.Type.REGULAR_ENTRANCE);
				break;
			}
		}
		// 남은 샛길: 계단을 새로 놓음
		for (int i = used; i < stairs.size(); i++) {
			JsonValue e = stairs.get(i);
			String sk = id + "|" + e.getString("id", e.getString("to"));
			Integer cell = stairCells.get(sk);
			if (cell == null) {
				if (!condOk(e)) continue;
				int c = -1;
				JsonValue at = e.get("at");
				if ("xy".equals(e.getString("place", "")) && at != null && level instanceof MakerLevel) c = at.getInt("x", 0) + at.getInt("y", 0) * level.width();
				if (c < 0) c = LevelHooks.cellFor(level, e.getString("place", "exit"));
				if (c < 0) { MakerRuntime.log("샛길 계단 자리를 찾지 못함: " + sk); continue; }
				cell = c;
				stairCells.put(sk, cell);
				Level.set(cell, Terrain.EXIT, level);
				if (live) {
					GameScene.updateMap(cell);
					String msg = e.getString("message", "");
					GLog.p(msg.isEmpty() ? "어딘가에 새로운 길이 열렸다…" : msg);
				}
			}
			final int cc = cell;
			level.transitions.removeIf(t -> t.cell() == cc && !isEntrance(t));
			LevelTransition t = new LevelTransition(level, cell, LevelTransition.Type.BRANCH_EXIT);
			setDest(t, e.getString("to"), LevelTransition.Type.REGULAR_ENTRANCE);
			level.transitions.add(t);
		}
	}

	/** 층에 들어올 때: 앞에서(출구/샛길/이동 명령으로) 들어왔으면 "온 곳" 기억 */
	static void rememberArrival() {
		String id = current();
		if (id == null || LevelHooks.fromDepth < 0) return;
		if (viaEdge != null) return;   // 통로로 왔으면 짝 계단이 곧 돌아가는 길 → 입구 계단의 "온 곳"은 그대로
		String from = at(LevelHooks.fromDepth, LevelHooks.fromBranch);
		if (from == null || from.equals(id)) return;
		LevelTransition.Type ft = LevelHooks.fromType;
		boolean forward = ft == null || ft == LevelTransition.Type.REGULAR_EXIT || ft == LevelTransition.Type.BRANCH_EXIT;
		if (!forward) return;
		cameFrom.put(id, LevelHooks.fromDepth + "," + LevelHooks.fromBranch + "," + (ft == null ? LevelTransition.Type.REGULAR_ENTRANCE : ft).name());
	}

	// ------------------------------------------------------------ 저장

	static void reset() { cameFrom.clear(); stairCells.clear(); }
	static void store(Bundle b) {
		b.put("pdm_came_k", cameFrom.keySet().toArray(new String[0]));
		b.put("pdm_came_v", cameFrom.values().toArray(new String[0]));
		b.put("pdm_stair_k", stairCells.keySet().toArray(new String[0]));
		int[] v = new int[stairCells.size()]; int i = 0; for (int x : stairCells.values()) v[i++] = x;
		b.put("pdm_stair_v", v);
	}
	static void restore(Bundle b) {
		reset();
		String[] k = b.getStringArray("pdm_came_k"), v = b.getStringArray("pdm_came_v");
		if (k != null && v != null) for (int i = 0; i < k.length && i < v.length; i++) cameFrom.put(k[i], v[i]);
		String[] sk = b.getStringArray("pdm_stair_k"); int[] sv = b.getIntArray("pdm_stair_v");
		if (sk != null && sv != null) for (int i = 0; i < sk.length && i < sv.length; i++) stairCells.put(sk[i], sv[i]);
	}
}
