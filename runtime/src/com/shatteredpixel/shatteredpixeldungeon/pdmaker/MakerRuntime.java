/*
 * PDMaker runtime — 에디터(PDMaker)가 만든 프로젝트 폴더를 읽어서 게임에 반영합니다.
 *
 * 프로젝트 폴더 찾는 순서
 *   1) -Dpdmaker.project=경로   (에디터의 ▶ 테스트 플레이가 넘겨줌)
 *   2) 실행 폴더의 project/ · jar(또는 jpackage 실행 파일) 옆의 project/  (에디터의 "게임 파일 내보내기")
 *   3) 게임 assets 안의 pdmaker-project/ (안드로이드 등 내장 배포)
 *   없으면 isActive() == false 이고, 게임은 원래대로 동작합니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.utils.Random;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

public class MakerRuntime {

	public static final String VERSION = "0.1.0";

	private static boolean loaded = false;
	private static FileHandle root = null;

	public static JsonValue project, terms, story, heart, sounds, title, dialogue, gameitems;
	/** 방 템플릿 (rooms/<id>.json) */
	public static final Map<String, JsonValue> rooms = new LinkedHashMap<>();
	public static final Map<String, JsonValue> chars = new LinkedHashMap<>();
	public static final Map<String, JsonValue> items = new LinkedHashMap<>();
	public static final Map<String, JsonValue> events = new LinkedHashMap<>();
	/** 플레이어블 영웅 (heroes/<id>.json) */
	public static final Map<String, JsonValue> heroes = new LinkedHashMap<>();

	// ------------------------------------------------------------ 로드

	/** 게임 시작 시 한 번 (여러 번 불러도 안전) */
	public static synchronized void init() {
		if (loaded) return;
		loaded = true;
		try {
			root = findRoot();
			if (root == null) return;
			JsonReader r = new JsonReader();
			project  = r.parse(root.child("project.json"));
			terms    = readOpt(r, "terms.json");
			for (FileHandle f : list("maps/nodes")) if (f.extension().equals("json")) { JsonValue v = r.parse(f); WorldGraph.data.put(v.getString("id", f.nameWithoutExtension()), v); }
			JsonValue w = readOpt(r, "maps/world.json");
			if (w == null) log("maps/world.json 이 없습니다 — 에디터에서 프로젝트를 한 번 열고 저장하면 새 형식(맵 그래프)으로 바뀝니다");
			WorldGraph.load(w);
			story    = readOpt(r, "story/story.json");
			heart    = readOpt(r, "heart/heart.json");
			sounds   = readOpt(r, "audio/sounds.json");
			title    = readOpt(r, "title.json");
			dialogue = readOpt(r, "dialogue.json");
			gameitems = readOpt(r, "gameitems.json");   // 게임 아이템 그림 바꾸기 { items: { "spd:<경로>": { sprite } } }
			for (FileHandle f : list("characters")) if (f.extension().equals("json")) { JsonValue v = r.parse(f); chars.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("rooms"))      if (f.extension().equals("json")) { JsonValue v = r.parse(f); rooms.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("items"))      if (f.extension().equals("json")) { JsonValue v = r.parse(f); items.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("heroes"))     if (f.extension().equals("json")) { JsonValue v = r.parse(f); heroes.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("events"))     if (f.extension().equals("json")) { JsonValue v = r.parse(f); events.put(v.getString("id", f.nameWithoutExtension()), v); }
			PluginHost.loadAll(root);
			log("PDMaker 프로젝트 불러옴: " + project.getString("name", "?") + " (" + root.path() + ")"
					+ " · 맵 노드 " + WorldGraph.ids.size() + " · 영웅 " + heroes.size() + " · 캐릭터 " + chars.size() + " · 아이템 " + items.size() + " · 이벤트 " + events.size());
		} catch (Exception e) {
			log("PDMaker 프로젝트를 읽지 못했습니다: " + e);
			root = null;
		}
	}

	private static FileHandle findRoot() {
		String p = System.getProperty("pdmaker.project");
		if (p != null && !p.isEmpty()) {
			FileHandle f = Gdx.files.absolute(p);
			if (f.child("project.json").exists()) return f;
			log("pdmaker.project 경로에 project.json 이 없습니다: " + p);
		}
		try {
			FileHandle local = Gdx.files.local("project");
			if (local.child("project.json").exists()) return local;
		} catch (Exception ignored) { }
		// 게임 파일 내보내기(에디터)로 만든 폴더: jar 옆 또는 jpackage 실행 파일 옆(app/ 의 한 단계 위)의 project/
		try {
			java.io.File jar = new java.io.File(MakerRuntime.class.getProtectionDomain().getCodeSource().getLocation().toURI());
			java.io.File d = jar.isDirectory() ? jar : jar.getParentFile();
			for (int i = 0; i < 3 && d != null; i++, d = d.getParentFile()) {
				java.io.File pj = new java.io.File(d, "project");
				if (new java.io.File(pj, "project.json").exists()) return Gdx.files.absolute(pj.getAbsolutePath());
			}
		} catch (Exception ignored) { }
		try {
			FileHandle internal = Gdx.files.internal("pdmaker-project");
			if (internal.child("project.json").exists()) return internal;
		} catch (Exception ignored) { }
		return null;
	}
	private static JsonValue readOpt(JsonReader r, String rel) {
		FileHandle f = root.child(rel);
		return f.exists() ? r.parse(f) : null;
	}
	private static FileHandle[] list(String dir) {
		FileHandle d = root.child(dir);
		return d.exists() ? d.list() : new FileHandle[0];
	}
	static void log(String s) { System.out.println("[PDMaker] " + s); }
	private static final java.util.Set<String> warned = new java.util.HashSet<>();
	/** 같은 경고는 한 번만 (콘솔 + 게임 로그) */
	static void warnOnce(String s) {
		if (!warned.add(s)) return;
		log("경고: " + s);
		try { GLog.w("[PDMaker] " + s); } catch (Exception ignored) { }
	}

	public static boolean isActive() { init(); return root != null; }
	public static FileHandle root() { return root; }

	// ------------------------------------------------------------ 조회

	/** 지금 있는 노드의 맵 데이터 */
	public static JsonValue here() { return WorldGraph.node(WorldGraph.current()); }
	/** 방 템플릿: 'room:<id>' 또는 'node:<id>' (혼합 노드의 직접 그린 방) */
	public static JsonValue template(String key) {
		if (key == null) return null;
		if (key.startsWith("room:")) return rooms.get(key.substring(5));
		if (key.startsWith("node:")) return WorldGraph.node(key.substring(5));
		return null;
	}

	public static JsonValue character(String id) { return id == null ? null : chars.get(id); }
	public static JsonValue item(String id) { return id == null ? null : items.get(id); }
	public static JsonValue event(String id) { return id == null ? null : events.get(id); }

	/** 용어 사전 (terms.json 에 없으면 기본값) */
	public static String term(String key) { return term(key, key.contains(".") ? key.substring(key.indexOf('.') + 1) : key); }
	public static String term(String key, String fallback) {
		if (terms != null) {
			JsonValue t = terms.get("terms");
			if (t != null && t.has(key)) return t.get(key).getString("label", fallback);
		}
		String d = DefaultTerms.M.get(key);
		return d != null ? d : fallback;
	}

	public static String defaultTheme(int d) { return d <= 5 ? "SEWER" : d <= 10 ? "PRISON" : d <= 15 ? "CAVES" : d <= 20 ? "CITY" : "HALLS"; }

	// ------------------------------------------------------------ 레벨

	/** Dungeon.newLevel() 에서 호출. (depth, branch) 에 해당하는 노드로 층을 만듦. 노드가 없으면 null (원래 생성기) */
	public static Level createLevel(int depth, int branch) {
		if (!isActive()) return null;
		String id = WorldGraph.at(depth, branch);
		if (id == null) return null;
		JsonValue f = WorldGraph.node(id);
		if (f == null) { log("노드 맵 파일이 없습니다: " + id); return null; }
		if ("handmade".equals(f.getString("mode", "procedural"))) {
			MakerLevel l = new MakerLevel();
			l.nodeId = id;
			return l;
		}
		String theme = WorldGraph.theme(id);
		if (theme.startsWith("custom:")) theme = LevelHooks.customBase(theme.substring(7));
		Level l = themeLevel(theme, f.getBoolean("boss", false));
		return l != null ? l : themeLevel("SEWER", false);
	}

	/** 테마 이름 → SPD 레벨 생성기 */
	static Level themeLevel(String theme, boolean boss) {
		switch (theme) {
			case "SEWER":  return boss ? new com.shatteredpixel.shatteredpixeldungeon.levels.SewerBossLevel()  : new com.shatteredpixel.shatteredpixeldungeon.levels.SewerLevel();
			case "PRISON": return boss ? new com.shatteredpixel.shatteredpixeldungeon.levels.PrisonBossLevel() : new com.shatteredpixel.shatteredpixeldungeon.levels.PrisonLevel();
			case "CAVES":  return boss ? new com.shatteredpixel.shatteredpixeldungeon.levels.CavesBossLevel()  : new com.shatteredpixel.shatteredpixeldungeon.levels.CavesLevel();
			case "CITY":   return boss ? new com.shatteredpixel.shatteredpixeldungeon.levels.CityBossLevel()   : new com.shatteredpixel.shatteredpixeldungeon.levels.CityLevel();
			case "HALLS":  return boss ? new com.shatteredpixel.shatteredpixeldungeon.levels.HallsBossLevel()  : new com.shatteredpixel.shatteredpixeldungeon.levels.HallsLevel();
			default: return null;
		}
	}

	/** GameScene 이 만들어진 뒤 (층 입장) */
	public static void onFloorEnter() {
		WorldGraph.arrived();
		if (!isActive() || Dungeon.hero == null) return;
		int depth = Dungeon.depth;
		// 1) 게임 첫 시작 이벤트
		if (story != null && !StoryState.flag("__started")) {
			StoryState.setFlag("__started", true);
			String start = story.getString("startEvent", "");
			if (!start.isEmpty()) EventInterpreter.runEvent(start, null);
		}
		// 2) 노드 입장: 온 곳 기억 → 계단 목적지 다시 맞춤 (샛길 계단 조건도 다시 검사)
		String id = WorldGraph.current();
		JsonValue f = WorldGraph.node(id);
		JsonValue grp = WorldGraph.group(id);
		WorldGraph.rememberArrival();
		LevelHooks.refreshTargets(Dungeon.level);
		boolean safe = grp != null && grp.getBoolean("safe", false);
		if (f != null && safe) GLog.h("— " + f.getString("name", grp.getString("name", "")) + " —");
		// 3) 입장 이벤트 (노드마다 한 번)
		if (f != null) {
			String on = f.getString("onEnter", "");
			if (!on.isEmpty() && !StoryState.flag("enter_" + id)) {
				StoryState.setFlag("enter_" + id, true);
				EventInterpreter.runEvent(on, null);
			}
		}
		// 4) 층 이벤트(데일리): 확률·깊이 범위 (던전 밖 그룹은 없음)
		if (id != null && !safe && !StoryState.flag("daily_rolled_" + id)) {
			StoryState.setFlag("daily_rolled_" + id, true);
			for (JsonValue e : events.values()) {
				if (!"daily".equals(e.getString("kind", ""))) continue;
				JsonValue d = e.get("daily"); if (d == null) continue;
				if (depth < d.getInt("from", 1) || depth > d.getInt("to", 99)) continue;
				if (d.getBoolean("once", false) && StoryState.flag("daily_done_" + e.getString("id"))) continue;
				if (Random.Int(100) >= d.getInt("chance", 0)) continue;
				StoryState.setFlag("daily_done_" + e.getString("id"), true);
				EventInterpreter.runEvent(e.getString("id"), null);
				break;
			}
		}
		HeroRuntime.onFloorEnter();
		HeartUI.attach();
		HeartSystem.onFloorEnter(depth, safe);
	}

	/** 층을 떠날 때 (InterlevelScene 직전) — 감정 결정화, 일기, 떠난 계단 기록 */
	public static void onFloorLeave() {
		if (!isActive()) return;
		LevelHooks.fromDepth = Dungeon.depth;
		LevelHooks.fromBranch = Dungeon.branch;
		LevelTransition ct = com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.curTransition;
		LevelHooks.fromType = ct == null ? null : ct.type;
		// 돌아올 때 같은 종류 계단이 여러 개면 게임은 첫 번째로 내려 줌 → 방금 쓴 계단을 맨 앞으로
		if (ct != null && Dungeon.level != null && Dungeon.level.transitions.remove(ct)) Dungeon.level.transitions.add(0, ct);
		// 통로(연결마다 짝지은 출구·입구)로 떠나면 도착 층에서 짝 계단으로
		WorldGraph.noteLeave(Dungeon.level, ct);
		HeartSystem.onFloorLeave(Dungeon.depth);
	}

	// ------------------------------------------------------------ 진행 방향 (내려가기 / 올라가기)

	/** "up" 이면 탑 모드: 계단 그림이 뒤바뀜 (입구 = 아래로 가는 계단, 출구 = 위로 가는 계단) */
	public static String direction(int depth, int branch) {
		if (!isActive()) return "down";
		String id = WorldGraph.at(depth, branch);
		return id == null ? project.getString("direction", "down") : WorldGraph.direction(id);
	}

	/** GameScene.create() 맨 앞 (타일맵을 만들기 전): 이 층의 방향에 맞게 계단 그림을 바꿔 끼움 */
	public static void beforeScene() {
		if (!isActive()) return;
		boolean up = "up".equals(direction(Dungeon.depth, Dungeon.branch));
		com.watabou.utils.SparseArray<Integer> dv = com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTileSheet.directVisuals;
		int in = com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTileSheet.ENTRANCE;
		int out = com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTileSheet.EXIT;
		dv.put(com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.ENTRANCE, up ? out : in);
		dv.put(com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.EXIT, up ? in : out);
		// 맵 그룹/노드의 배경음 (게임 기본 음악을 튼 직후라 여기서 바꿔 끼움)
		MakerAudio.floorBgm();
	}

	// ------------------------------------------------------------ 이미지

	private static final Map<String, SmartTexture> textures = new HashMap<>();
	/** 'game:sprites/x.png' → 게임 내장 에셋,  'assets/..' → 프로젝트 폴더 */
	public static Object texture(String ref) {
		if (ref == null || ref.isEmpty()) return null;
		if (ref.startsWith("game:") || ref.startsWith("builtin:items")) {
			String p = ref.startsWith("game:") ? ref.substring(5) : "sprites/items.png";
			// 프로젝트의 assets/game/ 에 바꾼 그림이 있으면 그것 (캐시에 같은 이름으로 들어가 있음)
			if (MakerAssets.has(p)) { MakerAssets.install(); return p; }
			// 게임에 없는 파일을 TextureCache 에 넘기면 게임이 멈추므로 먼저 확인
			if (!Gdx.files.internal(p).exists()) { warnOnce("게임 에셋에 없는 이미지: " + p + " — 기본 그림으로 대신합니다"); return null; }
			return p;
		}
		if (textures.containsKey(ref)) return textures.get(ref);
		try {
			FileHandle f = root.child(ref);
			if (!f.exists()) { warnOnce("프로젝트에 없는 이미지: " + ref); return null; }
			SmartTexture tx = TextureCache.get(new Pixmap(f));
			textures.put(ref, tx);
			return tx;
		} catch (Exception e) {
			log("이미지 불러오기 실패 " + ref + ": " + e);
			return null;
		}
	}
}
