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

	/** Dungeon.switchLevel 연결 줄: 맵에 놓은 "플레이어 스폰 위치" 오브젝트가 있으면 영웅을 그 칸에 세움.
	 *  when: start = 게임을 시작할 때(이번 판에서 처음 서는 맵에서 한 번) · always = 이 맵에 들어올 때마다 · from = 고른 맵에서 넘어올 때.  저장 불러오기 · 추락 등은 건드리지 않음 */
	/** 맵에 놓은 것의 좌표 → 층 좌표로 옮길 양: 직접 그린 맵 {0,0} · 혼합 맵은 직접 그린 방이 놓인 자리 · 자동 생성 맵은 null (좌표 없음) */
	@SuppressWarnings("unchecked")
	public static int[] nodeOffset(Level level, String id) {
		try {
			JsonValue f = WorldGraph.node(id); if (f == null) return null;
			String mode = f.getString("mode", "");
			if ("handmade".equals(mode)) return new int[]{ 0, 0 };
			if ("hybrid".equals(mode) && level instanceof com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel) {
				java.lang.reflect.Field rf = com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel.class.getDeclaredField("rooms"); rf.setAccessible(true);
				java.util.List<Room> rs = (java.util.List<Room>) rf.get(level);
				if (rs != null) for (Room r : rs) {
					String k = r instanceof TemplateRoom ? ((TemplateRoom) r).templateKey : r instanceof TemplateSpecialRoom ? ((TemplateSpecialRoom) r).templateKey : null;
					if (("node:" + id).equals(k)) return new int[]{ r.left, r.top };
				}
			}
		} catch (Throwable t) { MakerRuntime.log("맵 좌표 오류: " + t); }
		return null;
	}
	/** 입구도 출구도 없는 맵(직접 그린 맵에 계단을 안 놓음)에서 게임이 멈추지 않게: 설 자리가 없으면 맵 가운데에서 가장 가까운 지나갈 수 있는 칸 */
	static int safePos(Level level, int pos) {
		try {
			if (pos >= 0 && pos < level.length() && !level.invalidHeroPos(pos)) return pos;
			if (pos == -2 && level.getTransition(com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type.REGULAR_EXIT) != null) return pos;
			if (level.getTransition(null) != null) return pos;
			int w = level.width(), cx = w / 2, cy = level.height() / 2, best = -1, bd = Integer.MAX_VALUE;
			for (int i = 0; i < level.length(); i++) { if (level.invalidHeroPos(i) || Actor.findChar(i) != null) continue; int d = Math.abs(i % w - cx) + Math.abs(i / w - cy); if (d < bd) { bd = d; best = i; } }
			if (best >= 0) { MakerRuntime.warnOnce("이 맵에는 입구 · 출구 · 플레이어 스폰 위치가 없어서 가운데 근처 빈 칸에 세웠습니다 — 맵 그리기에서 「플레이어 스폰 위치」를 놓으세요"); return best; }
		} catch (Throwable t) { MakerRuntime.log("스폰 위치 오류: " + t); }
		return pos;
	}
	@SuppressWarnings("unchecked")
	public static int heroSpawn(Level level, int pos) {
		try {
			if (!MakerRuntime.isActive() || level == null) return pos;
			if (com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.mode == com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode.CONTINUE) return pos;
			com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode md = com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.mode;
			if (md != com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode.DESCEND && md != com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode.ASCEND) return safePos(level, pos);
			String id = WorldGraph.current(); JsonValue f = WorldGraph.node(id);
			if (f == null || f.get("objects") == null) return safePos(level, pos);
			boolean first = !StoryState.flag("pdm_spawned");   // 이번 판에서 처음 맵에 서는 순간 (시작 맵이 아니어도 — 테스트 플레이로 다른 맵에서 시작할 때 포함)
			String from = fromDepth < 0 ? null : WorldGraph.at(fromDepth, fromBranch);
			// 오브젝트 좌표 → 층 좌표: 직접 그린 맵은 그대로, 혼합 맵은 그 방(직접 그린 방)이 층 안에 놓인 자리만큼 옮김
			int[] off = { 0, 0 };
			String mode = f.getString("mode", "");
			if (!"handmade".equals(mode)) {
				off = null;
				if ("hybrid".equals(mode) && level instanceof com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel) {
					java.lang.reflect.Field rf = com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel.class.getDeclaredField("rooms"); rf.setAccessible(true);
					java.util.List<Room> rs = (java.util.List<Room>) rf.get(level);
					if (rs != null) for (Room r : rs) {
						String k = r instanceof TemplateRoom ? ((TemplateRoom) r).templateKey : r instanceof TemplateSpecialRoom ? ((TemplateSpecialRoom) r).templateKey : null;
						if (("node:" + id).equals(k)) { off = new int[]{ r.left, r.top }; break; }
					}
				}
				if (off == null) { if (first) StoryState.setFlag("pdm_spawned", true); return safePos(level, pos); }
			}
			int best = -1, rank = 0;
			for (JsonValue o : f.get("objects")) {
				if (!"start".equals(o.getString("type", ""))) continue;
				JsonValue at = o.get("at"); if (at == null || !at.has("x")) continue;
				if (!Cond.eval(o.getString("cond", ""), StoryState.globalResolver())) continue;
				int c = (off[0] + at.getInt("x")) + (off[1] + at.getInt("y")) * level.width();
				if (c < 0 || c >= level.length() || level.invalidHeroPos(c)) { MakerRuntime.warnOnce("플레이어 스폰 위치가 설 수 없는 칸에 있습니다 (" + id + " 의 " + at.getInt("x") + "," + at.getInt("y") + ") — 지나갈 수 있는 바닥 위에 놓으세요"); continue; }
				String w = o.getString("when", "start");
				int r = w.equals("from") ? (!first && from != null && from.equals(o.getString("from", "")) ? 3 : 0) : w.equals("start") ? (first ? 2 : 0) : 1;
				if (r > rank) { rank = r; best = c; }
			}
			if (first) StoryState.setFlag("pdm_spawned", true);
			if (best >= 0) { MakerRuntime.log("스폰 위치: " + id + " 의 칸 " + (best % level.width()) + "," + (best / level.width()) + (off[0] != 0 || off[1] != 0 ? " (직접 그린 방이 놓인 자리 " + off[0] + "," + off[1] + ")" : "")); return best; }
			return safePos(level, pos);
		} catch (Throwable t) { MakerRuntime.log("스폰 위치 오류: " + t); return pos; }
	}
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
		// 0) 구성 블럭: 있으면 게임 기본 구성(입구·출구 빼고)을 지우고 블럭대로 다시 채움
		JsonValue blocks = blocks(id);
		if (blocks != null) {
			while (initRooms.size() > 2) initRooms.remove(initRooms.size() - 1);
			boolean specialInit = false;
			int std = 0, spc = 0, sec = 0;
			for (JsonValue b : blocks) {
				String type = b.getString("type", "");
				int min = Math.max(0, b.getInt("min", 1)), max = Math.max(min, b.getInt("max", min));
				int n = Random.IntRange(min, max);
				try {
					switch (type) {
						case "standard": {   // 무작위 일반 방 (게임과 같은 방식: 큰 방은 여러 칸으로 셈)
							n = Math.min(n, 24 - std); std += Math.max(0, n);
							boolean big = b.getBoolean("big", true);
							for (int i = 0; i < n; i++) {
								com.shatteredpixel.shatteredpixeldungeon.levels.rooms.standard.StandardRoom r;
								do { r = com.shatteredpixel.shatteredpixeldungeon.levels.rooms.standard.StandardRoom.createRoom(); } while (!r.setSizeCat(big ? n - i : 1));
								i += r.sizeFactor() - 1;
								initRooms.add(r);
							}
							break;
						}
						case "special": {    // 무작위 특수 방 (같은 종류는 한 층에 한 번)
							n = Math.min(n, 6 - spc); spc += Math.max(0, n);
							if (!specialInit) { com.shatteredpixel.shatteredpixeldungeon.levels.rooms.special.SpecialRoom.initForFloor(); specialInit = true; }
							for (int i = 0; i < n; i++) initRooms.add(com.shatteredpixel.shatteredpixeldungeon.levels.rooms.special.SpecialRoom.createRoom());
							break;
						}
						case "secret": {     // 무작위 비밀 방
							n = Math.min(n, 4 - sec); sec += Math.max(0, n);
							for (int i = 0; i < n; i++) initRooms.add(com.shatteredpixel.shatteredpixeldungeon.levels.rooms.secret.SecretRoom.createRoom());
							break;
						}
						case "room": addOne(initRooms, b); break;   // 지정한 방 (방 템플릿 · 게임 기본 방)
						default: break;                              // layout · feeling 은 builder() 에서
					}
				} catch (Throwable ex) { MakerRuntime.log("구성 블럭 오류 (" + type + "): " + ex); }
			}
			if (std == 0) initRooms.add(com.shatteredpixel.shatteredpixeldungeon.levels.rooms.standard.StandardRoom.createRoom());   // 일반 방이 하나도 없으면 층을 못 만듦
		}
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
		// 3) "자동 생성"을 켠 방 템플릿 (그룹 제한·확률, 이미 들어간 것은 건너뜀)
		String gid = g == null ? "" : g.getString("id", "");
		for (Map.Entry<String, JsonValue> e : MakerRuntime.rooms.entrySet()) {
			JsonValue t = e.getValue();
			if (!t.getBoolean("auto", false)) continue;
			JsonValue ag = t.get("autoGroups");
			if (ag != null && ag.size > 0) { boolean ok = false; for (JsonValue x : ag) if (gid.equals(x.asString())) ok = true; if (!ok) continue; }
			String tk = "room:" + e.getKey();
			boolean has = false;
			for (Room r : initRooms) if ((r instanceof TemplateRoom && tk.equals(((TemplateRoom) r).templateKey)) || (r instanceof TemplateSpecialRoom && tk.equals(((TemplateSpecialRoom) r).templateKey))) has = true;
			if (has || Random.Int(100) >= t.getInt("autoChance", 100)) continue;
			initRooms.add("special".equals(t.getString("kind", "standard")) ? new TemplateSpecialRoom(tk) : new TemplateRoom(tk));
		}
	}
	/** 이 노드의 구성 블럭 (노드에 없으면 그룹 것). 없으면 null = 게임 기본 구성 */
	static JsonValue blocks(String id) {
		if (id == null) return null;   // 맵 그래프에 없는 층
		JsonValue f = WorldGraph.node(id);
		JsonValue b = f == null || f.get("procedural") == null ? null : f.get("procedural").get("blocks");
		if (b == null || b.size == 0) { JsonValue g = WorldGraph.group(id); b = g == null ? null : g.get("blocks"); }
		return b == null || b.size == 0 ? null : b;
	}
	/** 구성 블럭의 "구조"·"분위기" (RegularLevel.build 의 builder = builder() 바로 뒤에서 호출) */
	public static com.shatteredpixel.shatteredpixeldungeon.levels.builders.Builder builder(Level level, com.shatteredpixel.shatteredpixeldungeon.levels.builders.Builder def) {
		try {
			if (!MakerRuntime.isActive()) return def;
			JsonValue blocks = blocks(WorldGraph.current());
			if (blocks == null) return def;
			com.shatteredpixel.shatteredpixeldungeon.levels.builders.Builder out = def;
			for (JsonValue b : blocks) {
				String type = b.getString("type", "");
				if (type.equals("feeling")) {
					String fe = b.getString("feeling", "NONE");
					Level.Feeling want = null;
					for (Level.Feeling x : Level.Feeling.values()) if (x.name().equals(fe)) want = x;
					if (want != null && level.feeling != want) {
						if (want == Level.Feeling.DARK) level.viewDistance = Math.round(5 * level.viewDistance / 8f);
						level.feeling = want;
					}
				} else if (type.equals("layout")) {
					String shape = b.getString("shape", "auto");
					com.shatteredpixel.shatteredpixeldungeon.levels.builders.RegularBuilder rb = null;
					switch (shape) {
						case "loop": rb = new com.shatteredpixel.shatteredpixeldungeon.levels.builders.LoopBuilder().setLoopShape(2, Random.Float(0f, 0.65f), Random.Float(0f, 0.50f)); break;
						case "figure8": rb = new com.shatteredpixel.shatteredpixeldungeon.levels.builders.FigureEightBuilder().setLoopShape(2, Random.Float(0.3f, 0.8f), 0f); break;
						case "line": rb = new com.shatteredpixel.shatteredpixeldungeon.levels.builders.LineBuilder(); break;
						default: if (def instanceof com.shatteredpixel.shatteredpixeldungeon.levels.builders.RegularBuilder) rb = (com.shatteredpixel.shatteredpixeldungeon.levels.builders.RegularBuilder) def;
					}
					if (rb != null) {
						String tn = b.getString("tunnels", "default");
						if (tn.equals("none")) rb.setTunnelLength(new float[]{1, 0, 0}, new float[]{1, 0, 0});
						else if (tn.equals("long")) rb.setTunnelLength(new float[]{0, 2, 3}, new float[]{1, 2, 1});
						int extra = b.getInt("extra", -1);
						if (extra >= 0) rb.setExtraConnectionChance(Math.min(100, extra) / 100f);
						out = rb;
					}
				}
			}
			return out;
		} catch (Throwable t) { MakerRuntime.log("구성 블럭(구조) 오류: " + t); return def; }
	}
	private static void addList(ArrayList<Room> initRooms, JsonValue list) {
		if (list == null) return;
		for (JsonValue e : list) addOne(initRooms, e);
	}
	private static void addOne(ArrayList<Room> initRooms, JsonValue e) {
		{
			String rid = e.getString("room", "");
			boolean game = rid.startsWith("game:");   // 게임 기본 방: "game:<분류>.<클래스>" (levels.rooms 아래)
			JsonValue t = game ? null : MakerRuntime.rooms.get(rid);
			if (!game && t == null) { MakerRuntime.log("없는 방 템플릿: " + rid); return; }
			if (!Cond.eval(e.getString("cond", ""), StoryState.globalResolver())) return;
			int count = Math.max(1, e.getInt("count", 1));
			for (int i = 0; i < count; i++) {
				if (Random.Int(100) >= e.getInt("chance", 100)) continue;
				if (game) {
					try {
						Object o = Class.forName("com.shatteredpixel.shatteredpixeldungeon.levels.rooms." + rid.substring(5)).getDeclaredConstructor().newInstance();
						if (o instanceof Room) initRooms.add((Room) o);
					} catch (Throwable ex) { MakerRuntime.log("게임 기본 방을 만들 수 없음: " + rid + " (" + ex + ")"); break; }
					continue;
				}
				initRooms.add("special".equals(t.getString("kind", "standard")) ? new TemplateSpecialRoom("room:" + rid) : new TemplateRoom("room:" + rid));
			}
		}
	}

	// ------------------------------------------------------------ 층 생성 직후 (Dungeon.newLevel 의 level.create() 뒤)

	public static void afterCreate(Level level) {
		if (!MakerRuntime.isActive()) return;
		WorldGraph.wire(level, false);
		MakerUserTiles.finish(level);   // 맵 그리기로 칠한 사용자 타일
		if (!(level instanceof MakerLevel)) {
			MakerDrops.chestLoot(level);
			// 노드의 "몬스터 스폰" 을 끄면(noMobs): 게임이 놓은 적 몬스터를 치움 (다시 생기는 것은 MakerRuntime.onFloorEnter 에서 막음)
			JsonValue nd = MakerRuntime.here();
			if (nd != null && nd.getBoolean("noMobs", false)) {
				ArrayList<Mob> out = new ArrayList<>();
				for (Mob m : level.mobs) if (m.alignment == Char.Alignment.ENEMY && !(m instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.NPC)) out.add(m);
				level.mobs.removeAll(out);
			}
		}   // 게임이 만든 상자만 (직접 놓은 상자보다 먼저)
		placeTemplateObjects(level);
		MakerDrops.floorDrops(level);
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
				if (MakerRuntime.charOff(ref)) break;
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
			case "item": { Item it = MakerItem.create(ref); if (it != null) { it.quantity(Math.max(1, o.getInt("count", 1))); level.drop(it, cell).type = MakerDrops.heapType(o.getString("container", "")); } break; }
			case "prop": MakerProp.place(level, ref, cell); break;
			case "effect": MakerEffect.place(level, ref, cell); break;
			case "event":
				if (EventTriggers.placeEvent(level, ref, cell)) break;
				if (level instanceof MakerLevel) ((MakerLevel) level).eventCells.put(cell, ref);
				else eventCells.put(Dungeon.depth + ":" + Dungeon.branch + ":" + cell, ref);
				break;
		}
	}

	/** 템플릿 방에 그려 둔 오브젝트를 실제 위치에 배치 */
	static void placeTemplateObjects(Level level) {
		for (Room r : painted) {
			String key = r instanceof TemplateRoom ? ((TemplateRoom) r).templateKey : ((TemplateSpecialRoom) r).templateKey;
			int var = r instanceof TemplateRoom ? ((TemplateRoom) r).var : ((TemplateSpecialRoom) r).var;
			JsonValue t = MakerRuntime.template(key);
			if (t == null || t.get("objects") == null) continue;
			for (JsonValue o : t.get("objects")) {
				JsonValue at = o.get("at");
				if (at == null || !at.has("x")) continue;
				if (!Cond.eval(o.getString("cond", ""), StoryState.globalResolver())) continue;
				float ch = o.getFloat("chance", 100f);
				if (ch < 100f && com.watabou.utils.Random.Float(100f) >= ch) continue;   // 나올 확률
				int[] d = TemplateRoom.dst(t, var, at.getInt("x"), at.getInt("y"));   // 변형(뒤집기 · 돌리기)을 따라감
				int cell = (r.left + d[0]) + (r.top + d[1]) * level.width();
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
		if (MakerRuntime.charOff(ref)) return null;
		Mob g = gameChar(ref);
		Mob m = g != null ? g : MakerMob.create(ref);
		MakerCharAI.onCreate(m);
		return m;
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
	/** 영웅이 맵 오브젝트 옆에서 그것을 눌렀을 때 (Hero.actMove 맨 앞 연결 줄) — true 면 처리함 (한 턴 씀) */
	public static boolean propInteract(com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h, int dst) {
		try {
			if (!MakerRuntime.isActive() || Dungeon.level == null || dst == h.pos || dst < 0 || dst >= Dungeon.level.length()) return false;
			MakerProp p = MakerProp.at(Dungeon.level, dst);
			if (p == null || !p.solid() || !Dungeon.level.adjacent(h.pos, dst)) return false;
			if (!p.interact(h, dst)) return false;
			h.curAction = null;
			if (h.sprite != null) h.sprite.turnTo(h.pos, dst);
			h.spendAndNext(1f);
			return true;
		} catch (Throwable t) { MakerRuntime.log("맵 오브젝트 오류: " + t); return false; }
	}
	public static void onOccupy(Level level, Char ch) {
		if (!MakerRuntime.isActive() || ch != Dungeon.hero) return;
		try { MakerProp p = MakerProp.at(level, ch.pos); if (p != null) p.stepOn(); } catch (Throwable t) { MakerRuntime.log("맵 오브젝트 오류: " + t); }
		if (level instanceof MakerLevel) return;
		String ev = eventCells.get(Dungeon.depth + ":" + Dungeon.branch + ":" + ch.pos);
		if (ev != null && !EventInterpreter.busy()) EventInterpreter.runEvent(ev, null, "touch");
	}

	// ------------------------------------------------------------ 사용자 테마 타일

	public static JsonValue customTheme(String id) {
		JsonValue w = WorldGraph.world;
		if (w == null || w.get("customThemes") == null) return null;
		for (JsonValue c : w.get("customThemes")) if (id.equals(c.getString("id"))) return c;
		return null;
	}
	public static String customBase(String id) { JsonValue c = customTheme(id); return c == null ? "SEWER" : c.getString("base", "SEWER"); }

	/** 사용자 타일셋 PNG 를 TextureCache 에 문자열 키로 등록하고 그 키를 돌려줌 (실패하면 null → 바탕 테마) */
	@SuppressWarnings("unchecked")
	/** 잠긴 맵 (스토리의 locks): 이 계단이 가는 맵이 아직 잠겨 있으면 문구를 내고 true — Level.activateTransition 맨 앞 연결 줄 */
	public static boolean lockedNode(com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition t) {
		try {
			if (!MakerRuntime.isActive() || t == null || MakerRuntime.story == null || MakerRuntime.story.get("locks") == null) return false;
			String dest = WorldGraph.at(t.destDepth, t.destBranch);
			if (dest == null) return false;
			for (JsonValue l : MakerRuntime.story.get("locks")) {
				if (!dest.equals(l.getString("node", "")) || l.getString("cond", "").trim().isEmpty()) continue;
				if (Cond.eval(l.getString("cond", ""), StoryState.globalResolver())) continue;
				String msg = l.getString("message", "");
				com.shatteredpixel.shatteredpixeldungeon.utils.GLog.w(msg.isEmpty() ? MakerRuntime.term("node.locked", "아직 이곳으로는 갈 수 없다.") : StoryState.expand(msg));
				return true;
			}
		} catch (Throwable e) { MakerRuntime.log("잠긴 맵 확인 실패: " + e); }
		return false;
	}
	/** 큰(또는 작은) 타일셋: 타일셋 PNG 의 가로가 256 이 아니면 한 칸 = 가로 ÷ 16 px 로 읽음 (화면에서는 그대로 한 칸 16) — DungeonTilemap 생성자 연결 줄 */
	public static void hiresTiles(com.watabou.noosa.Tilemap tm, Object tex) {
		try {
			if (!(tex instanceof String) || !((String) tex).startsWith("pdmaker:tiles:")) return;
			SmartTexture t = TextureCache.get(tex);
			int cell = t.width / 16;
			if (cell == 16 || cell < 1 || t.width % 16 != 0) return;
			Field f = com.watabou.noosa.Tilemap.class.getDeclaredField("tileset");
			f.setAccessible(true);
			f.set(tm, new com.watabou.noosa.TextureFilm(tex, cell, cell));
		} catch (Throwable e) { MakerRuntime.log("큰 타일셋 적용 실패: " + e); }
	}
	/** 타일 한 칸짜리 그림(발견 연출 · 정보 창)을 한 칸 크기로 맞춤 */
	public static void tileImg(com.watabou.noosa.Image img) {
		try { if (img != null && img.width > 0 && img.width != 16) img.scale.set(16f / img.width); } catch (Throwable ignored) { }
	}
	public static String customTiles(String id) { return customTex(id, "tiles"); }
	/** 사용자 테마의 물 그림 (world.customThemes[].water — 비우면 null → 바탕 테마 물) */
	public static String customWater(String id) { return customTex(id, "water"); }
	static String customTex(String id, String field) {
		JsonValue c = customTheme(id);
		if (c == null || c.getString(field, "").isEmpty()) return null;
		String key = "pdmaker:" + field + ":" + id;
		try {
			Field f = TextureCache.class.getDeclaredField("all");
			f.setAccessible(true);
			Map<Object, SmartTexture> all = (Map<Object, SmartTexture>) f.get(null);
			if (!all.containsKey(key)) {
				Pixmap p = new Pixmap(MakerRuntime.root().child(c.getString(field)));
				all.put(key, new SmartTexture(p));
			}
			return key;
		} catch (Exception e) {
			MakerRuntime.log("사용자 " + (field.equals("water") ? "물 그림" : "타일셋") + " 등록 실패(" + id + "): " + e);
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
