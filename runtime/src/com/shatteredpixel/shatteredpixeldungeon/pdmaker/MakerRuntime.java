/*
 * PDMaker runtime — 에디터(PDMaker)가 만든 프로젝트 폴더를 읽어서 게임에 반영합니다.
 *
 * 프로젝트 폴더 찾는 순서
 *   1) -Dpdmaker.project=경로   (에디터의 ▶ 테스트 플레이가 넘겨줌)
 *   2) 실행 폴더의 project/ · jar(또는 jpackage 실행 파일) 옆의 project/  (에디터의 "게임 파일 내보내기")
 *      · 같은 자리의 project.zip (Windows 설치 파일 — 사용자 폴더의 .pdmaker-games/ 에 한 번 풀어서 씀)
 *   3) 게임 assets 안의 pdmaker-project/ (안드로이드 등 내장 배포)
 *   없으면 isActive() == false 이고, 게임은 원래대로 동작합니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.GL20;
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

	public static JsonValue project, terms, story, heart, sounds, title, dialogue, gameitems, textfx, effects, filters, trailers, badges, quests, tilecombos;
	/** 방 템플릿 (rooms/<id>.json) */
	public static final Map<String, JsonValue> rooms = new LinkedHashMap<>();
	public static final Map<String, JsonValue> chars = new LinkedHashMap<>();
	public static final Map<String, JsonValue> items = new LinkedHashMap<>();
	/** 맵 오브젝트 (props/<id>.json) */
	public static final Map<String, JsonValue> props = new LinkedHashMap<>();
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
			MakerTexts.load(readOpt(r, "texts.json"));   // 게임 글자 바꾸기
			quests = readOpt(r, "quests.json");   // 퀘스트 (MakerQuests)
			badges = readOpt(r, "badges.json");   // 내 배지 (MakerBadges)
			trailers = readOpt(r, "trailers.json");   // 예고편 컷신 (MakerTrailer)
			filters = readOpt(r, "filters.json");   // 화면 필터 (MakerFilter)
			effects = readOpt(r, "effects.json");   // 이펙트 · 파티클 (MakerEffect)
			textfx = readOpt(r, "textfx.json");   // 글자 연출 (MakerTextFx)
			tilecombos = readOpt(r, "maps/tilecombos.json");   // 조합 타일 · 분리 타일셋 밑그림 대응표 (MakerCombos · MakerTileUnderlay)
			gameitems = readOpt(r, "gameitems.json");   // 게임 아이템 그림 바꾸기 { items: { "spd:<경로>": { sprite } } }
			for (FileHandle f : list("characters")) if (f.extension().equals("json")) { JsonValue v = r.parse(f); chars.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("rooms"))      if (f.extension().equals("json")) { JsonValue v = r.parse(f); rooms.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("props"))      if (f.extension().equals("json")) { JsonValue v = r.parse(f); props.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("items"))      if (f.extension().equals("json")) { JsonValue v = r.parse(f); items.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("heroes"))     if (f.extension().equals("json")) { JsonValue v = r.parse(f); heroes.put(v.getString("id", f.nameWithoutExtension()), v); }
			for (FileHandle f : list("events"))     if (f.extension().equals("json")) { JsonValue v = r.parse(f); events.put(v.getString("id", f.nameWithoutExtension()), v); }
			PluginHost.loadAll(root);
			MakerDrops.load();          // 드랍 테이블 · 등장 금지
			GenSupport.loadIndex();     // 아이템 클래스 위치 표 (분류/세부 종류 폴더) + 예전 세이브 별칭
			MakerPages.applyServices(); // 타이틀 하위 페이지: 업데이트 확인 · 소식 주소 (서비스 모듈의 연결 줄이 읽음)
			MakerCatalog.register();   // 아이템 도감에 프로젝트 아이템
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
				java.io.File zip = new java.io.File(d, "project.zip");   // Windows 설치 파일: 한글 파일 이름을 MSI 에 넣을 수 없어서 zip 하나로 넣음
				if (zip.isFile()) { java.io.File x = unpackProject(zip); if (x != null) return Gdx.files.absolute(x.getAbsolutePath()); }
			}
		} catch (Exception ignored) { }
		try {
			FileHandle internal = Gdx.files.internal("pdmaker-project");
			if (internal.child("project.json").exists()) return internal;
		} catch (Exception ignored) { }
		return null;
	}
	/** project.zip 을 사용자 폴더(~/.pdmaker-games/<zip 자리>-<크기>-<날짜>)에 한 번 풀어 둠 — 같은 zip 이면 다시 풀지 않고, 예전 판은 지움 */
	private static java.io.File unpackProject(java.io.File zip) {
		try {
			java.io.File base = new java.io.File(System.getProperty("user.home"), ".pdmaker-games");
			String key = Integer.toHexString(zip.getAbsolutePath().hashCode());
			java.io.File dir = new java.io.File(base, key + "-" + zip.length() + "-" + zip.lastModified());
			if (new java.io.File(dir, ".done").exists() && new java.io.File(dir, "project.json").exists()) return dir;
			java.io.File[] old = base.listFiles(); if (old != null) for (java.io.File o : old) if (o.getName().startsWith(key + "-") && !o.equals(dir)) deleteTree(o);
			deleteTree(dir); dir.mkdirs();
			String root = dir.getCanonicalPath() + java.io.File.separator;
			byte[] buf = new byte[65536];
			try (java.util.zip.ZipInputStream in = new java.util.zip.ZipInputStream(new java.io.FileInputStream(zip), java.nio.charset.StandardCharsets.UTF_8)) {
				for (java.util.zip.ZipEntry e; (e = in.getNextEntry()) != null; ) {
					java.io.File f = new java.io.File(dir, e.getName());
					if (!f.getCanonicalPath().startsWith(root)) continue;   // 바깥 경로는 막음
					if (e.isDirectory()) { f.mkdirs(); continue; }
					f.getParentFile().mkdirs();
					try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) { for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n); }
				}
			}
			if (!new java.io.File(dir, "project.json").exists()) { log("project.zip 안에 project.json 이 없습니다: " + zip); return null; }
			new java.io.File(dir, ".done").createNewFile();
			log("project.zip 을 풀었습니다: " + dir);
			return dir;
		} catch (Exception e) { log("project.zip 을 풀지 못했습니다: " + e); return null; }
	}
	private static void deleteTree(java.io.File f) {
		java.io.File[] c = f.listFiles(); if (c != null) for (java.io.File x : c) deleteTree(x);
		f.delete();
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
	/** 캐릭터 · 아이템 편집기의 "사용" 체크를 끈 것 (enabled: false) — 데이터는 남기고(대사 화자 이름 · 생성 클래스) 게임에 나오지만 않게 함 */
	public static boolean off(JsonValue d) { return d != null && !d.getBoolean("enabled", true); }
	public static boolean charOff(String id) { if (off(character(id))) { warnOnce("사용 안 함 캐릭터라 나오지 않음: " + id); return true; } return false; }
	public static boolean itemOff(String id) { if (off(item(id))) { warnOnce("사용 안 함 아이템이라 만들지 않음: " + id); return true; } return false; }
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

	// ------------------------------------------------------------ 소개 화면 (스토리의 intro): 처음 켰을 때 글 · 구역에 처음 들어갈 때 로딩 화면의 이야기 글과 배경 그림
	/** 로딩 화면이 지금 보여 줄 이야기 글 (없으면 null → 게임 원래 글) */
	static volatile String pendingStory = null;
	private static String introGroup = null; private static boolean introFirst = false;
	private static JsonValue introCfg() {
		JsonValue in = story == null ? null : story.get("intro");
		JsonValue gs = in == null ? null : in.get("groups");
		return gs == null || introGroup == null ? null : gs.get(introGroup);
	}
	/** InterlevelScene 연결 줄 ①: 로딩 배경 그림. 가는 맵의 그룹에 정한 그림이 있으면 그것 (TextureCache 열쇠), 없으면 원래 것 */
	@SuppressWarnings("unchecked")
	public static String splash(String asset) {
		pendingStory = null; introGroup = null; introFirst = false;
		try {
			if (!isActive() || story == null) return asset;
			com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition ct = com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.curTransition;
			boolean fresh = Dungeon.hero == null;
			String node = fresh || ct == null ? (fresh ? WorldGraph.start : null) : WorldGraph.at(ct.destDepth, ct.destBranch);
			JsonValue g = node == null ? null : WorldGraph.group(node);
			if (g == null) return asset;
			introGroup = g.getString("id", "");
			introFirst = fresh || !StoryState.flag("grpstory_" + introGroup);
			JsonValue c = introCfg();
			String img = c == null ? "" : c.getString("image", "");
			if (img.isEmpty() || !root().child(img).exists()) return asset;
			String key = "pdmaker:splash:" + img;
			java.lang.reflect.Field f = com.watabou.gltextures.TextureCache.class.getDeclaredField("all");
			f.setAccessible(true);
			Map<Object, SmartTexture> all = (Map<Object, SmartTexture>) f.get(null);
			if (!all.containsKey(key)) { SmartTexture t = new SmartTexture(new com.badlogic.gdx.graphics.Pixmap(root().child(img))); t.filter(com.watabou.glwrap.Texture.LINEAR, com.watabou.glwrap.Texture.LINEAR); all.put(key, t); }
			return key;
		} catch (Throwable t) { log("로딩 배경 그림 오류: " + t); return asset; }
	}
	/** InterlevelScene 연결 줄 ②: 이야기 글을 보여 줄지. 돌려줌 [loadingDepth, lastRegion] — 게임은 "새로 온 5n+1 층"일 때만 글을 띄우므로 그 조건에 맞게(또는 안 맞게) 값을 바꿔 줌 */
	public static int[] storyGate(int loadingDepth, int lastRegion) {
		int[] same = { loadingDepth, lastRegion };
		try {
			if (!isActive() || story == null || introGroup == null) return same;
			if (com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.mode != com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode.DESCEND) return same;
			JsonValue in = story.get("intro"), c = introCfg();
			String text = c == null ? "" : c.getString("text", "");
			boolean fresh = Dungeon.hero == null;
			if (!text.isEmpty() && introFirst) {
				int region = (int) Math.ceil(loadingDepth / 5f);
				if (region < 1 || region > 5) { warnOnce("구역 소개 글: 26층보다 깊은 곳에서는 로딩 화면의 이야기 글을 띄울 수 없습니다 (입장 문구를 쓰세요)"); return same; }
				pendingStory = StoryState.expand(text);
				if (fresh) return same;   // 새 게임: 언제나 글이 뜸
				int deep = com.shatteredpixel.shatteredpixeldungeon.Statistics.deepestFloor;
				return new int[]{ (deep / 5 + 1) * 5 + 1, Math.min(lastRegion, 5) };
			}
			// 정한 글이 없음: 원작 구역 소개 글을 쓸지 (intro.vanilla — 기본 켬). 끄면 글 없이 바로 넘어감. 이미 본 그룹은 다시 띄우지 않음
			boolean vanilla = in == null || in.getBoolean("vanilla", true);
			if (vanilla && introFirst) return same;
			return new int[]{ loadingDepth, 99 };
		} catch (Throwable t) { log("구역 소개 글 오류: " + t); return same; }
	}

	/** 층에 들어올 때 기록에 나오는 글 (스토리의 messages) — 없으면 null (게임 원래 글).  String.format 에 넣을 글이라 % 는 %% 로, {depth} 는 %d 로 */
	static String enterText(boolean firstVisit) {
		if (!isActive() || story == null || Dungeon.hero == null) return null;
		JsonValue m = story.get("messages");
		if (m == null) return null;
		String id = WorldGraph.current();
		String text = null; boolean win = false;
		JsonValue st = m.get("start");
		if (st != null && !st.getString("text", "").isEmpty() && !StoryState.flag("__startmsg")) { StoryState.setFlag("__startmsg", true); text = st.getString("text", ""); win = st.getBoolean("window", false); }
		if (text == null && id != null && m.get("nodes") != null) for (JsonValue n : m.get("nodes")) {
			if (!id.equals(n.getString("node", "")) || n.getString("text", "").isEmpty() || StoryState.flag("nodemsg_" + id)) continue;
			StoryState.setFlag("nodemsg_" + id, true); text = n.getString("text", ""); win = n.getBoolean("window", false); break;
		}
		JsonValue grp = id == null ? null : WorldGraph.group(id);
		if (grp != null && m.get("groups") != null) {
			String gid = grp.getString("id", ""); JsonValue g = m.get("groups").get(gid);
			if (g != null && !g.getString("text", "").isEmpty() && !StoryState.flag("grpmsg_" + gid)) {
				StoryState.setFlag("grpmsg_" + gid, true);   // 그룹에 처음 들어온 것으로 침 (다른 문구가 먼저 나왔더라도)
				if (text == null) { text = g.getString("text", ""); win = g.getBoolean("window", false); }
			}
		}
		if (text == null) text = m.getString(firstVisit ? "descend" : "back", "");
		if (text.isEmpty()) return null;
		final String shown = StoryState.expand(text.replace("{depth}", String.valueOf(Dungeon.depth)));
		if (win) com.watabou.noosa.Game.runOnRenderThread(() -> { try { if (com.watabou.noosa.Game.scene() instanceof com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene) com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.show(new com.shatteredpixel.shatteredpixeldungeon.windows.WndStory(shown)); } catch (Throwable ignored) { } });
		return shown.replace("%", "%%");
	}

	/** GameScene 이 만들어진 뒤 (층 입장) */
	public static void onFloorEnter() {
		WorldGraph.arrived();
		if (!isActive() || Dungeon.hero == null) return;
		MakerLights.announce();
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
		pendingStory = null;
		if (grp != null) StoryState.setFlag("grpstory_" + grp.getString("id", ""), true);   // 이 그룹의 소개 화면은 봤음
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
		// 몬스터 스폰을 끈 노드(noMobs): 게임의 몬스터 재생성기를 뺌 (직접 그린 맵은 MakerLevel 이 spawn.enabled 로 처리)
		try {
			if (f != null && f.getBoolean("noMobs", false) && !(Dungeon.level instanceof MakerLevel))
				for (com.shatteredpixel.shatteredpixeldungeon.actors.Actor a : new java.util.ArrayList<>(com.shatteredpixel.shatteredpixeldungeon.actors.Actor.all()))
					if (a instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.MobSpawner) com.shatteredpixel.shatteredpixeldungeon.actors.Actor.remove(a);
		} catch (Throwable t) { log("몬스터 스폰 끄기 실패: " + t); }
		HeroRuntime.onFloorEnter();
		HeartUI.attach();
		MakerFilter.attach();
		HeartSystem.onFloorEnter(depth, safe);
		EventTriggers.onFloorEnter(id);
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
		EventTriggers.onFloorLeave();
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
		MakerTileLight.ensure(Dungeon.level);   // 타일 효과(빛) 레이어
		MakerLights.ensure(Dungeon.level);      // 광원 (점광원)
		// 맵 그룹/노드의 배경음 (게임 기본 음악을 튼 직후라 여기서 바꿔 끼움)
		MakerAudio.floorBgm();
	}

	// ------------------------------------------------------------ 이미지

	private static final Map<String, SmartTexture> textures = new HashMap<>();
	/** 'game:sprites/x.png' → 게임 내장 에셋,  'assets/..' → 프로젝트 폴더 */
	/** 효과(빛) 레이어: 시트와 같은 이름의 _light.png 가 프로젝트에 있으면 그 텍스처 (없으면 null — 경고 없음).
	 *  mode: add 발광(더하기) · screen 스크린 · overlay 오버레이 · dodge 닷지 — 더하기가 아닌 방식은 합성식에 맞게 색을 미리 손본 텍스처 */
	public static Object lightTexture(String sheet) { return lightTexture(sheet, "add"); }
	public static Object lightTexture(String sheet, String mode) {
		try {
			if (sheet == null || sheet.isEmpty() || sheet.startsWith("game:") || sheet.startsWith("builtin:")) return null;
			String ref = sheet.replaceAll("(?i)\\.png$", "") + "_light.png";
			if (root == null || !root.child(ref).exists()) return null;
			if (mode == null || mode.equals("add") || mode.isEmpty()) return texture(ref);
			String key = ref + "#" + (mode.equals("overlay") ? "ov" : "pm");
			SmartTexture old = textures.get(key);
			if (old != null) { boolean alive = true; try { alive = MakerAssets.cache().containsValue(old); } catch (Throwable ignored) { } if (alive) return old; textures.remove(key); }
			Pixmap pm = new Pixmap(root.child(ref));
			pm.setBlending(Pixmap.Blending.None);
			boolean ov = mode.equals("overlay");
			for (int y = 0; y < pm.getHeight(); y++) for (int x = 0; x < pm.getWidth(); x++) {
				int c = pm.getPixel(x, y); float a = (c & 0xFF) / 255f;
				int r = (c >>> 24) & 0xFF, g = (c >>> 16) & 0xFF, b = (c >>> 8) & 0xFF;
				if (ov) { r = Math.round(127.5f + (r - 127.5f) * a); g = Math.round(127.5f + (g - 127.5f) * a); b = Math.round(127.5f + (b - 127.5f) * a); }   // 투명한 곳 = 회색(아무 변화 없음)
				else { r = Math.round(r * a); g = Math.round(g * a); b = Math.round(b * a); }                                                                 // 투명한 곳 = 검정(아무 변화 없음)
				pm.drawPixel(x, y, (r << 24) | (g << 16) | (b << 8) | 0xFF);
			}
			SmartTexture tx = TextureCache.get(pm);
			textures.put(key, tx);
			return tx;
		} catch (Throwable t) { log("효과 레이어 불러오기 실패: " + t); return null; }
	}
	/** 빛 레이어를 지금 얼마나 세게 그릴지 (0~): sprite.lightPower % · lightPulse 초 주기 · lightPulseMin % */
	public static float lightAmount(JsonValue sp) {
		if (sp == null) return 1f;
		float pw = sp.getFloat("lightPower", 100f) / 100f, per = sp.getFloat("lightPulse", 0f);
		if (per <= 0) return pw;
		float lo = Math.max(0f, Math.min(1f, sp.getFloat("lightPulseMin", 40f) / 100f));
		float k = 0.5f + 0.5f * (float) Math.sin(com.watabou.noosa.Game.timeTotal * 2 * Math.PI / per);
		return pw * (lo + (1 - lo) * k);
	}
	/** 합성 방식에 맞는 GL 블렌드와 색 곱 · 더하기 값을 맞춤 (그린 뒤 Blending.setNormalMode 로 되돌릴 것) */
	public static void lightBlend(com.watabou.noosa.Visual light, float k, String mode) {
		com.badlogic.gdx.graphics.GL20 gl = Gdx.gl;
		switch (mode == null ? "add" : mode) {
			case "screen": gl.glBlendFunc(GL20.GL_ONE_MINUS_DST_COLOR, GL20.GL_ONE); light.am = 1; light.rm = light.gm = light.bm = k; light.ra = light.ga = light.ba = 0; break;
			case "dodge": gl.glBlendFunc(GL20.GL_DST_COLOR, GL20.GL_ONE); light.am = 1; light.rm = light.gm = light.bm = k; light.ra = light.ga = light.ba = 0; break;
			case "overlay": gl.glBlendFunc(GL20.GL_DST_COLOR, GL20.GL_SRC_COLOR); light.am = 1; light.rm = light.gm = light.bm = k; light.ra = light.ga = light.ba = 0.5f * (1 - k); break;
			default: com.watabou.glwrap.Blending.setLightMode(); light.am = k; light.rm = light.gm = light.bm = 1; light.ra = light.ga = light.ba = 0;
		}
	}
	public static void drawLight(com.watabou.noosa.Image light, float amount) { drawLight(light, amount, "add"); }
	/** 효과 레이어를 그림 위에 겹쳐 그림. 세기가 1 을 넘으면 여러 번 겹침.
	 *  add: 화면 + 색 · screen: 화면 + 색×(1−화면) · dodge: 화면×(1+색) (밑이 밝을수록 강함) · overlay: 화면×색×2 (회색 = 그대로) */
	public static void drawLight(com.watabou.noosa.Image light, float amount, String mode) {
		if (light == null || amount <= 0.01f) return;
		if (mode == null) mode = "add";
		com.badlogic.gdx.graphics.GL20 gl = Gdx.gl;
		try {
			float left = amount; int n = 0;
			while (left > 0.01f && n++ < 3) {
				float k = Math.min(1f, left); left -= 1f;
				lightBlend(light, k, mode);
				light.draw();
			}
		} finally { com.watabou.glwrap.Blending.setNormalMode(); }
	}
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
		// 게임이 층 구역을 옮길 때 TextureCache.clear() 로 텍스처를 지우므로, 캐시에 아직 있는지 확인 (없으면 다시 읽음)
		SmartTexture old = textures.get(ref);
		if (old != null) {
			boolean alive = true;
			try { alive = MakerAssets.cache().containsValue(old); } catch (Throwable ignored) { }
			if (alive) return old;
			textures.remove(ref);
		}
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
