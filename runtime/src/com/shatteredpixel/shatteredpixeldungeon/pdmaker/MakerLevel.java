/*
 * 직접 그린 층 (floor_XX.json 의 mode = "handmade").
 *   · 타일: layers.terrain (Terrain.java 번호 그대로)
 *   · 입구(7)/출구(8) 타일 → 층 이동 연결
 *   · 오브젝트: npc → MakerNPC, mob → MakerMob / spd:Class, item → MakerItem, event → 밟으면 실행
 *   · 몬스터 스폰: spawn.enabled 일 때만 (기본은 재생성 없음)
 *       spawn = { enabled, mobs:[{ref, weight}] (비우면 게임 기본 순서), initial(처음 수), max(최대 수), respawn(재생성 턴), minDist(영웅과 최소 거리) }
 *       layers.spawn = 칸마다 0(보통) · 1(스폰 구역) · 2(스폰 금지)
 *         스폰 구역이 하나라도 있으면 그 안에서만, 없으면 금지 구역을 뺀 아무 곳에서
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.watabou.utils.Bundle;
import com.watabou.utils.Reflection;

import java.util.HashMap;
import java.util.Map;

public class MakerLevel extends Level {

	/** 맵 그래프의 노드 id (maps/nodes/<id>.json) */
	public String nodeId = "";
	/** 칸 → 이벤트 id (밟거나 조사하면 실행) */
	public final Map<Integer, String> eventCells = new HashMap<>();

	{
		color1 = 0x48763c;
		color2 = 0x59994a;
	}

	JsonValue data() { return WorldGraph.node(nodeId); }
	String theme() { return WorldGraph.theme(nodeId); }

	@Override
	public String tilesTex() {
		String t = theme();
		if (t.startsWith("custom:")) { String k = LevelHooks.customTiles(t.substring(7)); if (k != null) return k; t = LevelHooks.customBase(t.substring(7)); }
		switch (t) {
			case "PRISON": return Assets.Environment.TILES_PRISON;
			case "CAVES":  return Assets.Environment.TILES_CAVES;
			case "CITY":   return Assets.Environment.TILES_CITY;
			case "HALLS":  return Assets.Environment.TILES_HALLS;
			default:       return Assets.Environment.TILES_SEWERS;
		}
	}
	@Override
	public String waterTex() {
		String t = theme();
		if (t.startsWith("custom:")) t = LevelHooks.customBase(t.substring(7));
		switch (t) {
			case "PRISON": return Assets.Environment.WATER_PRISON;
			case "CAVES":  return Assets.Environment.WATER_CAVES;
			case "CITY":   return Assets.Environment.WATER_CITY;
			case "HALLS":  return Assets.Environment.WATER_HALLS;
			default:       return Assets.Environment.WATER_SEWERS;
		}
	}

	@Override
	protected boolean build() {
		JsonValue f = data();
		if (f == null) return false;
		int w = f.get("size").getInt("w", 16), h = f.get("size").getInt("h", 16);
		setSize(w, h);
		JsonValue t = f.get("layers").get("terrain");
		for (int i = 0; i < w * h && i < t.size; i++) map[i] = t.getInt(i);
		for (int i = 0; i < map.length; i++) {
			if (map[i] == Terrain.ENTRANCE || map[i] == Terrain.ENTRANCE_SP) {
				transitions.add(new LevelTransition(this, i, LevelTransition.Type.REGULAR_ENTRANCE));   // 목적지·출구는 WorldGraph.wire 에서
			}
		}
		return true;
	}

	@Override
	protected void createMobs() {
		JsonValue f = data();
		if (f == null) return;
		if (f.get("objects") == null) { spawnInitial(); return; }
		for (JsonValue o : f.get("objects")) {
			if (!Cond.eval(o.getString("cond", ""), StoryState.globalResolver())) continue;
			JsonValue at = o.get("at");
			if (at == null || !at.has("x")) continue;
			int cell = at.getInt("x") + at.getInt("y") * width();
			String type = o.getString("type", ""), ref = o.getString("ref", "");
			if (type.equals("npc")) {
				Mob g = LevelHooks.gameChar(ref);
				if (g != null) { g.pos = cell; mobs.add(g); continue; }
				MakerNPC n = MakerNPC.create(ref);
				n.eventId = o.getString("event", "");
				n.pos = cell; mobs.add(n);
			} else if (type.equals("mob")) {
				for (int i = 0; i < Math.max(1, o.getInt("count", 1)); i++) {
					Mob m = LevelHooks.createMob(ref);
					if (m == null) break;
					m.pos = i == 0 ? cell : LevelHooks.freeNeighbour(this, cell);
					if (m.pos >= 0) mobs.add(m);
				}
			} else if (type.equals("prop")) {
				MakerProp.place(this, ref, cell);
			} else if (type.equals("effect")) {
				MakerEffect.place(this, ref, cell);
			} else if (type.equals("event")) {
				if (!EventTriggers.placeEvent(this, ref, cell)) eventCells.put(cell, ref);
			}
		}
		spawnInitial();
	}

	@Override
	protected void createItems() {
		JsonValue f = data();
		if (f == null || f.get("objects") == null) return;
		for (JsonValue o : f.get("objects")) {
			if (!"item".equals(o.getString("type", ""))) continue;
			if (!Cond.eval(o.getString("cond", ""), StoryState.globalResolver())) continue;
			JsonValue at = o.get("at");
			if (at == null || !at.has("x")) continue;
			Item it = MakerItem.create(o.getString("ref", ""));
			if (it == null) continue;
			it.quantity(Math.max(1, o.getInt("count", 1)));
			drop(it, at.getInt("x") + at.getInt("y") * width()).type = MakerDrops.heapType(o.getString("container", ""));
		}
	}

	/** 같은 종류 계단이 여러 개면(샛길 등) 방금 떠나온 층으로 이어지는 계단을 우선 */
	@Override
	public LevelTransition getTransition(LevelTransition.Type type) {
		LevelTransition via = WorldGraph.pickArrival(this, type);   // 통로로 들어오는 중: 짝 계단
		if (via != null) return via;
		if (type != null) {
			LevelTransition first = null;
			for (LevelTransition t : transitions) {
				if (t.type != type) continue;
				if (first == null) first = t;
				if (t.destDepth == LevelHooks.fromDepth && t.destBranch == LevelHooks.fromBranch) return t;
			}
			if (first != null) return first;
		}
		return super.getTransition(type);
	}

	// ------------------------------------------------------------ 몬스터 스폰 (spawn 설정 · 스폰 구역)

	JsonValue spawn() {
		JsonValue f = data();
		JsonValue s = f == null ? null : f.get("spawn");
		return s != null && s.getBoolean("enabled", false) ? s : null;
	}
	int zone(int cell) {
		JsonValue f = data();
		JsonValue z = f == null || f.get("layers") == null ? null : f.get("layers").get("spawn");
		return z == null || cell < 0 || cell >= z.size ? 0 : z.getInt(cell);
	}
	private java.util.List<Integer> zoneCells;
	java.util.List<Integer> zoneCells() {
		if (zoneCells == null) {
			zoneCells = new java.util.ArrayList<>();
			for (int c = 0; c < length(); c++) if (zone(c) == 1) zoneCells.add(c);
		}
		return zoneCells;
	}

	/** 스폰 목록에서 무게대로 (비었거나 실패하면 게임 기본 순서) */
	@Override public Mob createMob() {
		JsonValue s = spawn();
		if (s == null) return null;
		JsonValue list = s.get("mobs");
		if (list != null && list.size > 0) {
			int total = 0;
			for (JsonValue m : list) total += Math.max(0, m.getInt("weight", 1));
			if (total > 0) {
				int r = com.watabou.utils.Random.Int(total);
				for (JsonValue m : list) {
					r -= Math.max(0, m.getInt("weight", 1));
					if (r < 0) { Mob mob = LevelHooks.createMob(m.getString("ref", "")); if (mob != null) return mob; break; }
				}
			}
		}
		return super.createMob();
	}
	@Override public Actor addRespawner() { return spawn() == null ? null : super.addRespawner(); }
	@Override public int mobLimit() { JsonValue s = spawn(); return s == null ? 0 : Math.max(0, s.getInt("max", 6)); }
	@Override public float respawnCooldown() {
		JsonValue s = spawn();
		return s == null ? super.respawnCooldown() : Math.max(1f, s.getFloat("respawn", 50f));
	}
	@Override public boolean spawnMob(int disLimit) {
		JsonValue s = spawn();
		return s != null && super.spawnMob(Math.min(disLimit, Math.max(0, s.getInt("minDist", 8))));
	}
	@Override public int randomRespawnCell(Char ch) {
		JsonValue s = spawn();
		if (s == null) return super.randomRespawnCell(ch);
		java.util.List<Integer> z = zoneCells();
		for (int tries = 0; tries < 60; tries++) {
			int c = z.isEmpty() ? com.watabou.utils.Random.Int(length()) : com.watabou.utils.Random.element(z);
			if (z.isEmpty() && zone(c) == 2) continue;
			if (Dungeon.level == this && heroFOV != null && heroFOV[c]) continue;
			if (!passable[c] || Actor.findChar(c) != null) continue;
			if (Char.hasProp(ch, Char.Property.LARGE) && !openSpace[c]) continue;
			if (map[c] == Terrain.ENTRANCE || map[c] == Terrain.ENTRANCE_SP) continue;
			return c;
		}
		return -1;
	}
	/** 처음 놓이는 몬스터 (spawn.initial 마리) */
	void spawnInitial() {
		JsonValue s = spawn();
		if (s == null) return;
		int n = Math.max(0, s.getInt("initial", 0));
		for (int i = 0; i < n; i++) {
			Mob m = createMob();
			if (m == null) break;
			int c = randomRespawnCell(m);
			if (c < 0) break;
			m.pos = c;
			mobs.add(m);
		}
	}

	@Override
	public void occupyCell(Char ch) {
		super.occupyCell(ch);
		if (ch == Dungeon.hero && eventCells.containsKey(ch.pos) && !EventInterpreter.busy()) {
			EventInterpreter.runEvent(eventCells.get(ch.pos), null, "touch");
		}
	}

	@Override
	public void storeInBundle(Bundle bundle) {
		super.storeInBundle(bundle);
		bundle.put("pdm_node", nodeId);
		int[] cells = new int[eventCells.size()]; String[] ids = new String[cells.length]; int i = 0;
		for (Map.Entry<Integer, String> e : eventCells.entrySet()) { cells[i] = e.getKey(); ids[i++] = e.getValue(); }
		bundle.put("pdm_ev_cells", cells); bundle.put("pdm_ev_ids", ids);
	}
	@Override
	public void restoreFromBundle(Bundle bundle) {
		nodeId = bundle.getString("pdm_node");
		super.restoreFromBundle(bundle);
		int[] cells = bundle.getIntArray("pdm_ev_cells"); String[] ids = bundle.getStringArray("pdm_ev_ids");
		if (cells != null && ids != null) for (int i = 0; i < cells.length && i < ids.length; i++) eventCells.put(cells[i], ids[i]);
	}
}
