/*
 * 게임 그림 바꾸기 + 메뉴 화면 꾸미기
 *   · 프로젝트의 assets/game/<게임 에셋 경로>.png 가 있으면 게임의 같은 그림 대신 씀
 *     (예: assets/game/interfaces/title3.png → mod-2 타이틀 배경 3번째 층, assets/game/sprites/items.png → 아이템 시트)
 *     게임은 그림을 "interfaces/title3.png" 같은 경로 이름으로 TextureCache 에 넣어 두므로, 같은 이름으로 먼저 넣어 둠
 *   · 메뉴 화면(시작·랭킹·모험 일지·변경·새 소식·소개·지원·환영)에 타이틀 화면과 같은 배경·음악 (title.json 의 menus)
 *   연결: PixelScene.create() 의 float minWidth… 바로 앞 (모든 화면이 만들어질 때, 텍스처 캐시를 비운 직후)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Group;
import com.watabou.noosa.audio.Music;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class MakerAssets {

	/** 게임 경로(interfaces/title3.png) → 프로젝트 파일 */
	static Map<String, FileHandle> overrides = null;
	/** 지금 캐시에 넣어 둔 우리 텍스처 */
	static final Map<String, SmartTexture> installed = new HashMap<>();

	static void scan() {
		overrides = new HashMap<>();
		FileHandle root = MakerRuntime.root();
		if (root == null) return;
		FileHandle dir = root.child("assets/game");
		if (dir.exists()) walk(dir, "");
		if (!overrides.isEmpty()) MakerRuntime.log("게임 그림 바꾸기 " + overrides.size() + "개: " + overrides.keySet());
	}
	static void walk(FileHandle d, String prefix) {
		for (FileHandle f : d.list()) {
			if (f.isDirectory()) walk(f, prefix + f.name() + "/");
			else if (f.extension().equalsIgnoreCase("png")) overrides.put(prefix + f.name(), f);
		}
	}
	public static boolean has(String gamePath) { if (overrides == null) scan(); return overrides.containsKey(gamePath); }

	@SuppressWarnings("unchecked")
	static Map<Object, SmartTexture> cache() throws Exception {
		java.lang.reflect.Field f = TextureCache.class.getDeclaredField("all");
		f.setAccessible(true);
		return (Map<Object, SmartTexture>) f.get(null);
	}

	/** 캐시가 비워졌거나 처음이면 우리 그림을 다시 넣음 */
	public static synchronized void install() {
		try {
			if (!MakerRuntime.isActive()) return;
			if (overrides == null) scan();
			boolean items = !customItemRefs().isEmpty();
			boolean icons = !customIcons().isEmpty();
			if (!overrides.isEmpty()) {
				Map<Object, SmartTexture> all = cache();
				for (Map.Entry<String, FileHandle> e : overrides.entrySet()) {
					String key = e.getKey();
					if (items && key.equals(ITEMS)) continue;                        // 아이템 시트는 아래에서 (바꾼 시트 + 프로젝트 아이템 그림)
					if (icons && key.equals(HERO_ICONS)) continue;                   // 능력 아이콘 시트도 아래에서
					SmartTexture cur = all.get(key);
					if (cur != null && cur == installed.get(key)) continue;       // 이미 우리 것
					if (cur != null) { all.remove(key); cur.delete(); }           // 게임 원래 그림 → 버림
					SmartTexture tx = new SmartTexture(new Pixmap(e.getValue()));
					all.put(key, tx);
					installed.put(key, tx);
				}
			}
			if (items) installItems();
			if (!customIcons().isEmpty()) installHeroIcons();
		} catch (Throwable t) {
			MakerRuntime.log("게임 그림 바꾸기 실패: " + t);
		}
	}

	// ------------------------------------------------------------ 아이템 그림 (프로젝트 PNG)
	//  프로젝트 아이템의 sprite.png · 게임 아이템 그림 바꾸기(gameitems.json)의 PNG 를 items 시트 아래에 줄을 더해 붙이고,
	//  ItemSpriteSheet.film 에 번호(CUSTOM_BASE + n)를 등록 → 게임은 평소처럼 items 시트의 한 칸으로 그림 (가방·바닥·퀵슬롯·정보 창 모두)

	static final String ITEMS = Assets.Sprites.ITEMS;
	public static final int CUSTOM_BASE = 20000;
	static final Map<String, Integer> itemPng = new HashMap<>();
	// 세밀한(고해상도) 아이템 그림: 아이템 시트에는 한 칸(16px)으로 줄여 붙이지만, 그릴 때는 원래 PNG 를 같은 크기로 (배율 적용으로 키운 그림)
	static final Map<Integer, String> hiresItem = new HashMap<>();
	static final Map<Integer, int[]> hiresSize = new HashMap<>();
	static final java.util.Set<Object> hiresTex = java.util.Collections.newSetFromMap(new java.util.WeakHashMap<>());
	private static java.lang.reflect.Method updVerts;
	/** ItemSprite.frame(image) 맨 앞 연결 줄 — 세밀한 그림이면 그 PNG 를 한 칸 크기로 그리고 true. 아니면 (예전에 바꿔 둔 그림이면 아이템 시트로 되돌리고) false */
	public static boolean hiresItem(com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite s, int image) {
		try {
			String png = hiresItem.get(image);
			if (png == null) {
				if (s.texture != null && hiresTex.contains(s.texture)) s.texture(ITEMS);
				return false;
			}
			Object tx = MakerRuntime.texture(png);
			if (tx == null) return false;
			s.texture(tx);
			hiresTex.add(s.texture);
			s.frame(new com.watabou.utils.RectF(0, 0, 1, 1));
			int[] sz = hiresSize.get(image);
			s.width = sz[0]; s.height = sz[1];
			if (updVerts == null) { updVerts = com.watabou.noosa.Image.class.getDeclaredMethod("updateVertices"); updVerts.setAccessible(true); }
			updVerts.invoke(s);
			return true;
		} catch (Throwable t) { MakerRuntime.log("세밀한 아이템 그림 오류: " + t); return false; }
	}
	static SmartTexture itemsTex;
	static List<String> itemRefs;

	/** 프로젝트가 쓰는 아이템 PNG 목록 (프로젝트 아이템 + 게임 아이템 그림 바꾸기) */
	static List<String> customItemRefs() {
		if (itemRefs != null) return itemRefs;
		java.util.TreeSet<String> set = new java.util.TreeSet<>();
		for (JsonValue it : MakerRuntime.items.values()) {
			JsonValue sp = it.get("sprite"); if (sp != null && !sp.getString("png", "").isEmpty()) set.add(sp.getString("png"));
			// 원거리 무기의 발사체 그림 · 마법봉 이펙트의 날아가는 그림
			JsonValue r = it.get("ranged"), p = r == null ? null : r.get("proj"), ps = p == null ? null : p.get("sprite"); if (ps != null && !ps.getString("png", "").isEmpty()) set.add(ps.getString("png"));
			JsonValue wf = it.get("wandFx"), ws = wf == null ? null : wf.get("sprite"); if (ws != null && !ws.getString("png", "").isEmpty()) set.add(ws.getString("png"));
		}
		// 영웅 주문서 그림 (spellbook.image 가 "assets/…png" 파일이면)
		for (JsonValue hr : MakerRuntime.heroes.values()) { JsonValue bk = hr.get("spellbook"); if (bk != null && bk.get("image") != null && bk.get("image").isString() && !bk.getString("image", "").isEmpty()) set.add(bk.getString("image")); }
		JsonValue gi = MakerRuntime.gameitems == null ? null : MakerRuntime.gameitems.get("items");
		if (gi != null) for (JsonValue e : gi) {
			JsonValue sp = e.get("sprite"); if (sp != null && !sp.getString("png", "").isEmpty()) set.add(sp.getString("png"));
			JsonValue wf = e.get("wandFx"), ws = wf == null ? null : wf.get("sprite"); if (ws != null && !ws.getString("png", "").isEmpty()) set.add(ws.getString("png"));
		}
		List<String> out = new ArrayList<>();
		FileHandle root = MakerRuntime.root();
		for (String r : set) {
			if (root != null && root.child(r).exists()) out.add(r);
			else MakerRuntime.warnOnce("아이템 그림 파일이 없습니다: " + r);
		}
		return itemRefs = out;
	}

	static void installItems() throws Exception {
		Map<Object, SmartTexture> all = cache();
		SmartTexture cur = all.get(ITEMS);
		if (cur != null && cur == itemsTex) return;
		List<String> refs = customItemRefs();
		hiresItem.clear(); hiresSize.clear();
		FileHandle baseFile = overrides.containsKey(ITEMS) ? overrides.get(ITEMS) : com.badlogic.gdx.Gdx.files.internal(ITEMS);
		Pixmap base = new Pixmap(baseFile);
		final int S = com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.SIZE;   // 원작 16 · mod-2 32
		int cols = Math.max(1, base.getWidth() / S);
		int rowsAdd = (refs.size() + cols - 1) / cols;
		int baseH = base.getHeight();
		Pixmap px = new Pixmap(base.getWidth(), baseH + rowsAdd * S, Pixmap.Format.RGBA8888);
		px.setBlending(Pixmap.Blending.None);
		px.drawPixmap(base, 0, 0);
		base.dispose();
		px.setFilter(Pixmap.Filter.NearestNeighbour);
		int[][] rects = new int[refs.size()][];
		for (int k = 0; k < refs.size(); k++) {
			Pixmap src = new Pixmap(MakerRuntime.root().child(refs.get(k)));
			int w = src.getWidth(), h = src.getHeight();
			// 칸보다 크면 비율을 지켜 줄이고, 작으면 정수 배로 키움 (16px 그림 → mod-2 32px 칸)
			float sc = Math.min((float) S / w, (float) S / h);
			if (sc >= 1f) sc = (float) Math.floor(sc);
			int dw = Math.max(1, Math.round(w * sc)), dh = Math.max(1, Math.round(h * sc));
			int x = (k % cols) * S + (S - dw) / 2, y = baseH + (k / cols) * S + (S - dh) / 2;
			px.setBlending(Pixmap.Blending.SourceOver);
			px.drawPixmap(src, 0, 0, w, h, x, y, dw, dh);
			src.dispose();
			rects[k] = new int[]{x, y, dw, dh};
			if (w > S || h > S) { hiresItem.put(CUSTOM_BASE + k, refs.get(k)); hiresSize.put(CUSTOM_BASE + k, new int[]{dw, dh}); }   // 칸보다 세밀한 그림 → 그릴 때는 원래 PNG 로 (hiresItem)
		}
		SmartTexture tx = new SmartTexture(px);
		if (cur != null) { all.remove(ITEMS); cur.delete(); }
		all.put(ITEMS, tx);
		itemsTex = tx;
		// 게임의 프레임 목록: 시트가 길어졌으니 기존 칸의 세로 비율을 고치고, 새 칸을 등록
		com.watabou.noosa.TextureFilm film = com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.film;
		java.lang.reflect.Field fw = com.watabou.noosa.TextureFilm.class.getDeclaredField("texWidth"), fh = com.watabou.noosa.TextureFilm.class.getDeclaredField("texHeight");
		fw.setAccessible(true); fh.setAccessible(true);
		int oldW = fw.getInt(film), oldH = fh.getInt(film), newW = px.getWidth(), newH = px.getHeight();
		if (oldH != newH || oldW != newW) {
			java.lang.reflect.Field ff = com.watabou.noosa.TextureFilm.class.getDeclaredField("frames"); ff.setAccessible(true);
			@SuppressWarnings("unchecked") Map<Object, com.watabou.utils.RectF> frames = (Map<Object, com.watabou.utils.RectF>) ff.get(film);
			float kx = (float) oldW / newW, ky = (float) oldH / newH;
			for (com.watabou.utils.RectF r : frames.values()) { r.left *= kx; r.right *= kx; r.top *= ky; r.bottom *= ky; }
			fw.setInt(film, newW); fh.setInt(film, newH);
		}
		itemPng.clear();
		for (int k = 0; k < refs.size(); k++) {
			int[] r = rects[k];
			film.add(CUSTOM_BASE + k, r[0], r[1], r[0] + r[2], r[1] + r[3]);
			itemPng.put(refs.get(k), CUSTOM_BASE + k);
		}
		MakerRuntime.log("아이템 그림 " + refs.size() + "개를 아이템 시트에 붙였습니다");
	}

	// ------------------------------------------------------------ 능력 아이콘 (hero_icons.png 16×16) — 직접 지정한 아이콘 파일
	//  영웅 데이터의 "icon" 이 숫자가 아니라 파일이면(전직·직업 능력·주문·원소):
	//    "assets/icons/x.png"                          → 그림 한 장을 16×16 칸에 맞춰
	//    { "file": "assets/icons/sheet.png", "size": 16, "index": 3 } → 시트의 칸 하나
	//  hero_icons.png 아래에 줄을 더해 붙이고 번호(원래 칸 수 + n)를 줌 → 게임의 HeroIcon·행동 버튼이 그대로 그림

	static final String HERO_ICONS = Assets.Interfaces.HERO_ICONS;
	static final Map<String, Integer> iconIdx = new HashMap<>();
	static SmartTexture iconTex;
	static List<JsonValue> iconVals;

	static String iconKey(JsonValue v) {
		if (v == null) return null;
		if (v.isString()) return v.asString().isEmpty() ? null : v.asString();
		if (v.isObject() && !v.getString("file", "").isEmpty()) return v.getString("file") + "|" + v.getInt("size", 16) + "|" + v.getInt("index", 0);
		return null;
	}
	static void collectIcons(JsonValue v, Map<String, JsonValue> out) {
		if (v == null) return;
		for (JsonValue c = v.child; c != null; c = c.next) {
			if ("icon".equals(c.name)) { String k = iconKey(c); if (k != null) out.put(k, c); }
			else if ("talents".equals(c.name)) continue;   // 특성 아이콘은 hero_icons 가 아니라 따로 그림 (MakerTalentsPane.talentIcon)
			else if (c.isObject() || c.isArray()) collectIcons(c, out);
		}
	}
	static List<JsonValue> customIcons() {
		if (iconVals != null) return iconVals;
		Map<String, JsonValue> m = new java.util.TreeMap<>();
		for (JsonValue h : MakerRuntime.heroes.values()) collectIcons(h, m);
		iconVals = new ArrayList<>();
		FileHandle root = MakerRuntime.root();
		for (JsonValue v : m.values()) {
			String f = v.isString() ? v.asString() : v.getString("file", "");
			if (root != null && root.child(f).exists()) iconVals.add(v); else MakerRuntime.warnOnce("아이콘 파일이 없습니다: " + f);
		}
		return iconVals;
	}
	static void installHeroIcons() throws Exception {
		Map<Object, SmartTexture> all = cache();
		SmartTexture cur = all.get(HERO_ICONS);
		if (cur != null && cur == iconTex) return;
		List<JsonValue> vals = customIcons();
		FileHandle baseFile = overrides.containsKey(HERO_ICONS) ? overrides.get(HERO_ICONS) : com.badlogic.gdx.Gdx.files.internal(HERO_ICONS);
		Pixmap base = new Pixmap(baseFile);
		final int S = 16;
		int cols = Math.max(1, base.getWidth() / S), baseRows = base.getHeight() / S;
		int rowsAdd = (vals.size() + cols - 1) / cols;
		Pixmap px = new Pixmap(base.getWidth(), (baseRows + rowsAdd) * S, Pixmap.Format.RGBA8888);
		px.setBlending(Pixmap.Blending.None);
		px.drawPixmap(base, 0, 0);
		base.dispose();
		px.setFilter(Pixmap.Filter.NearestNeighbour);
		px.setBlending(Pixmap.Blending.SourceOver);
		iconIdx.clear();
		for (int k = 0; k < vals.size(); k++) {
			JsonValue v = vals.get(k);
			String f = v.isString() ? v.asString() : v.getString("file", "");
			Pixmap src = new Pixmap(MakerRuntime.root().child(f));
			int sx = 0, sy = 0, sw = src.getWidth(), sh = src.getHeight();
			if (v.isObject()) {
				int cs = Math.max(1, v.getInt("size", 16)), cc = Math.max(1, src.getWidth() / cs), i = Math.max(0, v.getInt("index", 0));
				sx = (i % cc) * cs; sy = (i / cc) * cs; sw = cs; sh = cs;
			}
			float sc = Math.min((float) S / sw, (float) S / sh);
			int dw = Math.max(1, Math.round(sw * sc)), dh = Math.max(1, Math.round(sh * sc));
			int n = baseRows * cols + k;
			px.drawPixmap(src, sx, sy, sw, sh, (n % cols) * S + (S - dw) / 2, (n / cols) * S + (S - dh) / 2, dw, dh);
			src.dispose();
			iconIdx.put(iconKey(v), n);
		}
		SmartTexture tx = new SmartTexture(px);
		if (cur != null) { all.remove(HERO_ICONS); cur.delete(); }
		all.put(HERO_ICONS, tx);
		iconTex = tx;
		// 게임·PDMaker 가 만들어 둔 16×16 칸 목록을 버려서 새 크기로 다시 만들게 함
		for (Class<?> c : new Class<?>[]{ com.shatteredpixel.shatteredpixeldungeon.ui.HeroIcon.class, MakerSpells.class }) {
			try { java.lang.reflect.Field f = c.getDeclaredField("film"); f.setAccessible(true); f.set(null, null); } catch (Exception ignored) { }
		}
	}
	/** 직접 지정한 아이콘 → hero_icons 번호 (없으면 -1) */
	public static int heroIconIndex(JsonValue v) {
		String k = iconKey(v);
		if (k == null) return -1;
		install();
		Integer i = iconIdx.get(k);
		return i == null ? -1 : i;
	}

	/** 프로젝트 PNG 아이템 그림 → 게임 그림 번호 (없으면 def) */
	public static int customItemImage(String png, int def) {
		if (png == null || png.isEmpty()) return def;
		install();
		Integer i = itemPng.get(png);
		return i == null ? def : i;
	}

	/** 게임 아이템 그림 바꾸기 (Item.image() 첫 줄) — 없으면 -1 */
	static final Map<Class<?>, Integer> gameItemImage = new HashMap<>();
	public static int itemImage(com.shatteredpixel.shatteredpixeldungeon.items.Item it) {
		if (it == null || MakerRuntime.gameitems == null) return -1;
		Class<?> c = it.getClass();
		Integer v = gameItemImage.get(c);
		if (v != null) return v;
		v = -1;
		try {
			String cn = c.getName(), P = "com.shatteredpixel.shatteredpixeldungeon.items.";
			JsonValue gi = MakerRuntime.gameitems.get("items");
			JsonValue e = gi == null || !cn.startsWith(P) ? null : gi.get("spd:" + cn.substring(P.length()));
			JsonValue sp = e == null ? null : e.get("sprite");
			if (sp != null) {
				if (!sp.getString("png", "").isEmpty()) v = customItemImage(sp.getString("png"), -1);
				else if (sp.has("name") || sp.has("index")) v = GenSupport.spriteIndex(sp, -1);
			}
		} catch (Throwable t) { MakerRuntime.log("게임 아이템 그림 오류: " + t); }
		gameItemImage.put(c, v);
		return v;
	}

	// ------------------------------------------------------------ 모든 화면

	static final Set<String> MENU_SCENES = new HashSet<>(Arrays.asList(
			"StartScene", "RankingsScene", "JournalScene", "ChangesScene", "NewsScene", "AboutScene", "SupporterScene", "WelcomeScene", "HeroSelectScene"));

	/** PixelScene.create() 연결 줄 */
	public static void onSceneCreate(PixelScene scene) {
		install();
		try {
			if (!MakerRuntime.isActive()) return;
			if (MENU_SCENES.contains(scene.getClass().getSimpleName())) scene.add(new MenuStyler(scene));
			MakerPages.onSceneCreate(scene);   // 타이틀 하위 페이지 (소식 · 소개 · 지원 · 변경)
		} catch (Throwable t) { MakerRuntime.log("메뉴 화면 꾸미기 오류: " + t); }
	}

	/** 화면이 다 만들어진 뒤(첫 프레임) 배경·음악을 타이틀과 맞춤 */
	static class MenuStyler extends Gizmo {
		final PixelScene scene; boolean done = false;
		MenuStyler(PixelScene scene) { this.scene = scene; }
		@Override public void update() {
			if (done) return;
			done = true;
			try { apply(); } catch (Throwable t) { MakerRuntime.log("메뉴 화면 꾸미기 오류: " + t); }
			// killAndErase() 로 지우면 화면 목록 맨 앞에 빈칸이 생기고, 나중에 scene.add() 로 띄운 창(저장 슬롯의
			// "이어하기" 창 등)이 그 빈칸에 들어가 배경 뒤에 그려져 안 보였음 → 빈칸을 남기지 않고 목록에서 빼냄
			active = visible = false;
			if (parent != null) parent.remove(this);
		}
		@SuppressWarnings("unchecked")
		void apply() throws Exception {
			JsonValue d = MakerRuntime.title;
			if (d == null) return;
			JsonValue menus = d.get("menus") == null ? new JsonValue(JsonValue.ValueType.object) : d.get("menus");
			// 음악: 타이틀과 같은 곡 (게임은 랭킹·일지 등에서 theme 곡으로 바꿈) — 원래 타이틀을 쓸 때도 정한 곡이 있으면
			if (menus.getBoolean("music", true)) titleMusic(d, true);
			if (!d.getBoolean("enabled", true)) return;
			// 배경
			if (!menus.getBoolean("background", true)) return;
			if (!customBackground(d)) return;       // 게임 배경 그대로면 손댈 것 없음
			java.lang.reflect.Field f = Group.class.getDeclaredField("members");
			f.setAccessible(true);
			List<Gizmo> hidden = new ArrayList<>();
			for (Gizmo g : new ArrayList<>((ArrayList<Gizmo>) f.get(scene)))
				if (g instanceof com.shatteredpixel.shatteredpixeldungeon.ui.Archs) { g.visible = false; g.active = false; hidden.add(g); }
			if (hidden.isEmpty() && !scene.getClass().getSimpleName().equals("HeroSelectScene")) return;
			if (hidden.isEmpty()) return;                                // 영웅 선택 화면은 배경이 영웅 그림이라 그대로
			Group bgGroup = new Group();
			MakerTitle.addBackground(bgGroup, d, Camera.main.width, Camera.main.height, false);
			scene.addToBack(bgGroup);
		}
	}

	/** 메뉴 화면(타이틀 · 랭킹 · 일지 …)이 게임 곡을 틀기 직전 (연결 줄): 타이틀 음악으로 정한 프로젝트 곡이 이미 흐르고 있으면 true → 게임 곡을 틀지 않음
	 *  (예전에는 게임이 theme 곡으로 바꿨다가 PDMaker 가 프로젝트 곡을 처음부터 다시 틀어서, 메뉴를 오갈 때마다 끊기고 처음으로 돌아감) */
	public static boolean keepMenuMusic(Object scene) {
		try {
			JsonValue d = MakerRuntime.isActive() ? MakerRuntime.title : null;
			if (d == null) return false;
			boolean title = scene instanceof com.shatteredpixel.shatteredpixeldungeon.scenes.TitleScene;
			if (!title) { JsonValue menus = d.get("menus"); if (menus != null && !menus.getBoolean("music", true)) return false; }
			JsonValue m = d.get("music");
			List<String> l = new ArrayList<>();
			if (m != null && m.get("tracks") != null) for (JsonValue t : m.get("tracks")) if (!t.asString().isEmpty()) l.add(t.asString());
			if (l.size() == 1 && l.get(0).equals("none")) return true;   // 무음 — 게임 곡도 틀지 않음
			return MakerAudio.holds(l);
		} catch (Throwable t) { return false; }
	}

	/** 타이틀 화면에서 트는 곡과 같은 곡. menu = 메뉴 화면에서 (곡을 정하지 않았으면 게임 타이틀 곡으로 되돌림 — 원래 타이틀을 쓰면 손대지 않음) */
	static void titleMusic(JsonValue d, boolean menu) {
		JsonValue m = d.get("music");
		List<String> l = new ArrayList<>();
		if (m != null && m.get("tracks") != null) for (JsonValue t : m.get("tracks")) if (!t.asString().isEmpty()) l.add(t.asString());
		if (l.isEmpty() && (!menu || !d.getBoolean("enabled", true))) return;   // 타이틀: 게임이 튼 곡 그대로
		if (!l.isEmpty()) {
			if (l.size() == 1 && l.get(0).equals("none")) { Music.INSTANCE.end(); return; }
			MakerAudio.playList(l);
			return;
		}
		// 비어 있으면 게임의 타이틀 곡 (mod-2: Assets.Music.TITLE, 원작: theme_1·2)
		try {
			String t = (String) Assets.Music.class.getField("TITLE").get(null);
			Music.INSTANCE.playTracks(new String[]{t}, new float[]{1}, false);
		} catch (Throwable ignored) {
			Music.INSTANCE.playTracks(new String[]{Assets.Music.THEME_1, Assets.Music.THEME_2}, new float[]{1, 1}, false);
		}
	}

	/** 타이틀 배경이 게임 기본과 다른지 (다르면 메뉴 화면에도 같은 배경을 그림) */
	static boolean customBackground(JsonValue d) {
		JsonValue bg = d.get("background");
		if (bg == null) return false;
		if (!MakerTitle.archStyle(bg).equals("game") || bg.getBoolean("archReverse", false)) return true;
		if (MakerTitle.Ruins.on(bg)) return true;   // 떠오르는 폐허를 직접 설정함
		if (!bg.getString("color", "").isEmpty() || bg.getBoolean("vignette", false)) return true;
		JsonValue gr = bg.get("gradient");
		if (gr != null && gr.isObject() && gr.getBoolean("enabled", false)) return true;
		JsonValue menus = d.get("menus");
		if (menus != null && menus.getBoolean("layers", true) && d.get("layers") != null)
			for (JsonValue l : d.get("layers")) if (!l.getBoolean("front", false) && !l.getBoolean("titleOnly", false)) return true;
		if (menus != null && menus.getBoolean("effect", false) && !bg.getString("effect", "none").equals("none")) return true;
		return false;
	}
}
