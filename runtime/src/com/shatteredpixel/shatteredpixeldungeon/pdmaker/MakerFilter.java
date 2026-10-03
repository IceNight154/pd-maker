/*
 * PDMaker — 화면 필터 (편집기 확장 기능 "화면 필터" — filters.json)
 *   { list: [ { id, name, overUI, layers: [ 층 ] } ] }
 *   층 type:
 *     tint  { color, alpha(0~100), blend(normal|add), pulse(0~100 %), pulseSec }          색 덮기 (밤 · 노을 · 안개 색)
 *     image { png, alpha, blend, scale, vx, vy(px/초 흐름), jitter(초당 튐 횟수), fw, frames, fps }   그림을 화면 가득 반복 (비 · 눈 · 노이즈 · 주사선)
 *     vignette { color, alpha, size(가운데 투명한 크기 %), soft(번짐 %), pulse, pulseSec }   조리개: 가장자리를 어둡게
 *     code  — 편집기가 코드를 PNG 로 구워 둔 것: image 와 같게 다룸 (fit 기본 stretch)
 *     letterbox { color, alpha, size(띠 두께 %), side(tb 위아래 | lr 좌우) }                레터박스
 *     flash { color, alpha, every(초), dur(초) }                                          가끔 번쩍 (번개 · 글리치)
 *     shake { power, every(초), time(초) }                                                가끔 흔들림
 *   나타남 · 사라짐: inType / outType (none | fade | dissolve | slide), inSec / outSec — 필터가 바뀔 때 앞의 것은 사라지고 새것이 나타남
 *     dissolve 는 색 덮기 · 레터박스에서 점 무늬로, 그 밖의 층은 fade 로. slide 는 레터박스 띠가 밀려 들어오고 그 밖의 층은 fade
 *   어떤 필터를 쓸지 (앞이 우선):  이벤트 명령 "화면 필터" → 영웅이 서 있는 방 템플릿의 filter → 맵 노드의 filter → 그룹의 filter
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.glwrap.Blending;
import com.watabou.noosa.Camera;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Game;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Group;
import com.watabou.noosa.SkinnedBlock;
import com.watabou.utils.Random;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class MakerFilter {

	/** 이벤트 명령으로 정한 필터가 들어가는 문자열 변수 ("" = 맵 설정대로, "-" = 필터 없음) */
	static final String VAR = "__filter";

	static JsonValue def(String id) {
		JsonValue f = MakerRuntime.filters;
		if (id == null || id.isEmpty() || f == null || f.get("list") == null) return null;
		for (JsonValue x : f.get("list")) if (id.equals(x.getString("id", ""))) return x;
		return null;
	}

	/** 층에 들어올 때(화면이 만들어질 때)마다 */
	@SuppressWarnings("unchecked")
	public static void attach() {
		if (MakerRuntime.filters == null || !(Game.scene() instanceof GameScene)) return;
		// UI 아래(게임 화면 바로 위)용 하나, UI 위까지 덮는 것 하나 — 필터의 overUI 에 따라 한쪽만 그림
		Host under = new Host(false), over = new Host(true);
		under.camera = over.camera = PixelScene.uiCamera;
		Group sc = Game.scene();
		sc.add(under);
		try {
			Field mf = Group.class.getDeclaredField("members"); mf.setAccessible(true);
			ArrayList<Gizmo> ms = (ArrayList<Gizmo>) mf.get(sc);
			int at = -1;
			for (int i = 0; i < ms.size(); i++) { Gizmo g = ms.get(i); if (g != null && g != under && g.camera == PixelScene.uiCamera) { at = i; break; } }
			if (at >= 0 && ms.remove(under)) ms.add(Math.min(at, ms.size()), under);
		} catch (Throwable t) { MakerRuntime.log("화면 필터를 UI 아래에 두지 못함: " + t); }
		sc.addToFront(over);
	}
	/** 이벤트 명령: id = 필터 · "" = 맵 설정대로 · "-" = 필터 끄기 */
	public static void set(String id) { StoryState.setStr(VAR, id == null ? "" : id); }

	/** 지금 보여야 할 필터 id ("" = 없음) */
	static String wanted(Host h) {
		String ev = StoryState.str(VAR);
		if ("-".equals(ev)) return "";
		if (!ev.isEmpty()) return ev;
		if (Dungeon.hero != null && Dungeon.level != null) {
			int w = Dungeon.level.width(), x = Dungeon.hero.pos % w, y = Dungeon.hero.pos / w;
			for (Object[] r : h.rooms()) { Room rm = (Room) r[0]; if (x >= rm.left && x <= rm.right && y >= rm.top && y <= rm.bottom) return (String) r[1]; }
		}
		JsonValue n = MakerRuntime.here();
		String f = n == null ? "" : n.getString("filter", "");
		if (!f.isEmpty()) return f;
		String id = WorldGraph.current();
		JsonValue g = id == null ? null : WorldGraph.group(id);
		return g == null ? "" : g.getString("filter", "");
	}

	static int rgb(String s, int d) { try { return Integer.parseInt(s.replace("#", ""), 16) & 0xFFFFFF; } catch (Throwable t) { return d; } }

	/** 시트의 프레임들을 반복(REPEAT)할 수 있는 텍스처로 (TextureCache 에 넣어 화면 전환 때 같이 관리) */
	@SuppressWarnings("unchecked")
	static List<SmartTexture> frames(String png, int fw, int n) {
		List<SmartTexture> out = new ArrayList<>();
		try {
			if (png.isEmpty() || !MakerRuntime.root().child(png).exists()) return out;
			Field fd = TextureCache.class.getDeclaredField("all");
			fd.setAccessible(true);
			Map<Object, SmartTexture> all = (Map<Object, SmartTexture>) fd.get(null);
			Pixmap src = null;
			for (int i = 0; i < Math.max(1, n); i++) {
				String key = "pdmaker:filter:" + png + ":" + fw + ":" + i;
				SmartTexture t = all.get(key);
				if (t == null) {
					if (src == null) src = new Pixmap(MakerRuntime.root().child(png));
					int w = n > 1 && fw > 0 ? Math.min(fw, src.getWidth()) : src.getWidth(), hh = src.getHeight();
					int cols = Math.max(1, src.getWidth() / w);
					if (n > 1 && fw > 0) hh = Math.max(1, src.getHeight() / Math.max(1, (n + cols - 1) / cols));
					Pixmap p = new Pixmap(w, hh, Pixmap.Format.RGBA8888);
					p.setBlending(Pixmap.Blending.None);
					p.drawPixmap(src, 0, 0, (i % cols) * w, (i / cols) * hh, w, hh);
					t = new SmartTexture(p);
					all.put(key, t);
				}
				out.add(t);
			}
			if (src != null) src.dispose();
		} catch (Throwable t) { MakerRuntime.log("화면 필터 그림을 읽지 못함: " + png + " — " + t); }
		return out;
	}

	// ------------------------------------------------------------ 화면에 붙는 것

	static class Host extends Group {
		final boolean overUI;
		Host(boolean overUI) { this.overUI = overUI; }
		String cur = null;
		List<Object[]> rooms = null;

		List<Object[]> rooms() {
			if (rooms != null) return rooms;
			rooms = new ArrayList<>();
			try {
				if (Dungeon.level instanceof RegularLevel) {
					Field f = RegularLevel.class.getDeclaredField("rooms");
					f.setAccessible(true);
					List<Room> l = (List<Room>) f.get(Dungeon.level);
					if (l != null) for (Room r : l) {
						JsonValue t = r instanceof TemplateRoom ? ((TemplateRoom) r).tpl() : r instanceof TemplateSpecialRoom ? ((TemplateSpecialRoom) r).tpl() : null;
						String fl = t == null ? "" : t.getString("filter", "");
						if (!fl.isEmpty()) rooms.add(new Object[]{ r, fl });
					}
				}
			} catch (Throwable t) { MakerRuntime.log("방 필터를 읽지 못함: " + t); }
			return rooms;
		}

		@Override
		public void update() {
			String want;
			try { want = wanted(this); } catch (Throwable t) { want = ""; }
			if (!want.equals(cur)) {
				boolean first = cur == null;
				cur = want;
				for (Gizmo g : new ArrayList<>(members)) if (g instanceof Shown) ((Shown) g).leave();   // 보이던 것은 사라지는 연출로
				JsonValue d = def(want);
				// 화면이 새로 만들어졌을 뿐(층 이동 · 불러오기) 같은 필터가 이어지면 나타나는 연출 없이 바로
				if (d != null && d.get("layers") != null && d.getBoolean("overUI", false) == overUI) add(new Shown(d, first && want.equals(last[overUI ? 1 : 0])));
				last[overUI ? 1 : 0] = want;
			}
			super.update();
		}
	}
	static final String[] last = { "", "" };

	/** 층 하나: 나타남·사라짐 정도 k(0~1)와 방식(fade | dissolve | slide)을 받아 제 모습에 반영 */
	interface Lay { void trans(float k, String mode); }

	/** 지금 보이는(또는 나타나는 · 사라지는 중인) 필터 하나 */
	static class Shown extends Group {
		final String inMode, outMode; final float inSec, outSec;
		float k; boolean leaving;
		Shown(JsonValue d, boolean instant) {
			inMode = d.getString("inType", "fade"); outMode = d.getString("outType", "fade");
			inSec = "none".equals(inMode) ? 0 : Math.max(0, d.getFloat("inSec", 0.5f)); outSec = "none".equals(outMode) ? 0 : Math.max(0, d.getFloat("outSec", 0.5f));
			float W = PixelScene.uiCamera.width, H = PixelScene.uiCamera.height;
			for (JsonValue l : d.get("layers")) {
				if (!l.getBoolean("on", true)) continue;
				String type = l.getString("type", "");
				try {
					if (type.equals("tint")) add(new Tint(l, W, H));
					else if (type.equals("letterbox")) add(new Letterbox(l, W, H));
					else if (type.equals("image") || type.equals("code")) {
						boolean stretch = "stretch".equals(l.getString("fit", type.equals("code") ? "stretch" : "tile"));
						if (stretch) { Stretch st = new Stretch(l, W, H); if (st.ok) add(st); }
						else { Img im = new Img(l, W, H); if (im.ok) add(im); }
					}
					else if (type.equals("vignette")) add(new Vignette(l, W, H));
					else if (type.equals("flash")) add(new Flash(l, W, H));
					else if (type.equals("shake")) add(new Shake(l));
				} catch (Throwable t) { MakerRuntime.log("화면 필터 층 오류 (" + type + "): " + t); }
			}
			k = instant || inSec <= 0 ? 1 : 0;
			apply();
		}
		void leave() { leaving = true; if (outSec <= 0) k = 0; }
		void apply() { String m = leaving ? outMode : inMode; for (Gizmo g : members) if (g instanceof Lay) ((Lay) g).trans(k, m); }
		@Override public void update() {
			if (leaving) { k = outSec <= 0 ? 0 : k - Game.elapsed / outSec; if (k <= 0) { killAndErase(); return; } }
			else if (k < 1) k = Math.min(1, k + Game.elapsed / inSec);
			apply();
			super.update();
		}
	}

	static void light(boolean add) { if (add) Blending.setLightMode(); }
	static void normal(boolean add) { if (add) Blending.setNormalMode(); }
	static float zoom() { return (Camera.main == null ? PixelScene.uiCamera.zoom : Camera.main.zoom) / PixelScene.uiCamera.zoom; }

	/** 디졸브용 점 무늬 (16단계: 단계가 오를수록 점이 촘촘 → 16 = 꽉 참). 흰색이라 색은 hardlight 로 입힘 */
	@SuppressWarnings("unchecked")
	static SmartTexture dither(int level) {
		String key = "pdmaker:dither:" + level;
		try {
			Field fd = TextureCache.class.getDeclaredField("all"); fd.setAccessible(true);
			Map<Object, SmartTexture> all = (Map<Object, SmartTexture>) fd.get(null);
			SmartTexture t = all.get(key);
			if (t == null) {
				int n = 32; Pixmap p = new Pixmap(n, n, Pixmap.Format.RGBA8888); p.setBlending(Pixmap.Blending.None);
				for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
					int hsh = x * 374761393 + y * 668265263; hsh = (hsh ^ (hsh >>> 13)) * 1274126177; hsh = (hsh ^ (hsh >>> 16)) & 0xFF;   // 칸마다 정해진 문턱값 (언제나 같은 무늬)
					p.drawPixel(x, y, hsh * 16 < level * 256 ? 0xFFFFFFFF : 0x00000000);
				}
				t = new SmartTexture(p);
				all.put(key, t);
			}
			return t;
		} catch (Throwable e) { return TextureCache.createSolid(0xFFFFFFFF); }
	}

	/** 한 가지 색으로 채운 네모 (디졸브할 수 있음) */
	static class Fill extends SkinnedBlock {
		final boolean add; int level = 16; float fw, fh;
		Fill(float w, float h, int rgb, boolean add) {
			super(w, h, dither(16));
			this.add = add; fw = w; fh = h;
			hardlight(rgb);
			float z = zoom(); scale(z, z);
		}
		void resize(float w, float h) { fw = w; fh = h; size(w, h); }
		/** 0~1: 점이 찬 정도 */
		void cover(float k) {
			int lv = Math.max(0, Math.min(16, Math.round(k * 16)));
			if (lv == level) return;
			level = lv;
			texture(dither(lv));
			texture.wrap(com.watabou.glwrap.Texture.REPEAT, com.watabou.glwrap.Texture.REPEAT);
			size(fw, fh); float z = zoom(); scale(z, z);
		}
		@Override public void draw() { if (level <= 0) return; light(add); super.draw(); normal(add); }
	}

	static class Tint extends Fill implements Lay {
		final float a, pulse, sec; float t, kk = 1;
		Tint(JsonValue l, float w, float h) {
			super(w, h, rgb(l.getString("color", "#000000"), 0), "add".equals(l.getString("blend", "normal")));
			a = l.getFloat("alpha", 30) / 100f; pulse = l.getFloat("pulse", 0) / 100f; sec = Math.max(0.1f, l.getFloat("pulseSec", 2));
			alpha(a);
		}
		public void trans(float k, String mode) { if ("dissolve".equals(mode)) { cover(k); kk = 1; } else { cover(1); kk = k; } }
		@Override public void update() { super.update(); t += Game.elapsed; alpha(Math.max(0, Math.min(1, kk * a * (1 - pulse * (0.5f + 0.5f * (float) Math.sin(t * 6.2832f / sec)))))); }
	}

	/** 레터박스: 위·아래(또는 왼쪽·오른쪽) 띠. slide = 띠가 밀려 들어옴 */
	static class Letterbox extends Group implements Lay {
		final Fill a, b; final boolean lr; final float size, al, W, H;
		Letterbox(JsonValue l, float w, float h) {
			W = w; H = h; lr = "lr".equals(l.getString("side", "tb")); size = Math.max(0, Math.min(50, l.getFloat("size", 12))) / 100f; al = l.getFloat("alpha", 100) / 100f;
			int c = rgb(l.getString("color", "#000000"), 0);
			add(a = new Fill(1, 1, c, false)); add(b = new Fill(1, 1, c, false));
			place(1);
		}
		void place(float k) {
			float s = (lr ? W : H) * size * k;
			if (lr) { a.resize(s, H); a.x = 0; a.y = 0; b.resize(s, H); b.x = W - s; b.y = 0; }
			else { a.resize(W, s); a.x = 0; a.y = 0; b.resize(W, s); b.x = 0; b.y = H - s; }
		}
		public void trans(float k, String mode) {
			boolean slide = "slide".equals(mode), dis = "dissolve".equals(mode);
			place(slide ? k : 1);
			a.cover(dis ? k : 1); b.cover(dis ? k : 1);
			float al2 = slide || dis ? al : al * k;
			a.alpha(al2); b.alpha(al2);
		}
	}

	static class Flash extends ColorBlock implements Lay {
		final float a, every, dur; float next, left, kk = 1;
		Flash(JsonValue l, float w, float h) {
			super(w, h, 0xFF000000 | rgb(l.getString("color", "#ffffff"), 0xFFFFFF));
			a = l.getFloat("alpha", 60) / 100f; every = Math.max(0.05f, l.getFloat("every", 6)); dur = Math.max(0.02f, l.getFloat("dur", 0.15f));
			next = Random.Float(every * 0.5f, every * 1.5f); alpha(0);
		}
		public void trans(float k, String mode) { kk = k; }
		@Override public void update() {
			super.update();
			if (left > 0) { left -= Game.elapsed; alpha(Math.max(0, kk * a * left / dur)); }
			else if ((next -= Game.elapsed) <= 0) { next = Random.Float(every * 0.5f, every * 1.5f); left = dur; alpha(kk * a); }
		}
		@Override public void draw() { if (left > 0) { Blending.setLightMode(); super.draw(); Blending.setNormalMode(); } }
	}

	static class Shake extends Gizmo implements Lay {
		final float power, every, time; float next, kk = 1;
		Shake(JsonValue l) { power = l.getFloat("power", 1); every = Math.max(0.1f, l.getFloat("every", 4)); time = Math.max(0.05f, l.getFloat("time", 0.2f)); next = Random.Float(every * 0.5f, every * 1.5f); }
		public void trans(float k, String mode) { kk = k; }
		@Override public void update() { if ((next -= Game.elapsed) <= 0) { next = Random.Float(every * 0.5f, every * 1.5f); if (kk >= 1 && Camera.main != null) Camera.main.shake(power, time); } }
	}

	/** 그림 한 장(또는 시트의 프레임)을 화면 크기에 맞게 늘려 덮음 */
	static class Stretch extends Group implements Lay {
		final List<com.watabou.noosa.Image> im = new ArrayList<>();
		final boolean add, ok; final float fps, a; float ft; int fr;
		public void trans(float k, String mode) { for (com.watabou.noosa.Image i : im) i.alpha(a * k); }
		Stretch(JsonValue l, float w, float h) {
			add = "add".equals(l.getString("blend", "normal")); fps = Math.max(1, l.getFloat("fps", 8));
			a = l.getFloat("alpha", 100) / 100f;
			for (SmartTexture t : frames(l.getString("png", ""), l.getInt("fw", 0), Math.max(1, l.getInt("frames", 1)))) {
				com.watabou.noosa.Image i = new com.watabou.noosa.Image(t) { @Override public void draw() { light(add); super.draw(); normal(add); } };
				i.scale.set(w / i.width, h / i.height); i.alpha(a); i.visible = im.isEmpty();
				im.add(i); add(i);
			}
			ok = !im.isEmpty();
		}
		@Override public void update() {
			super.update();
			if (im.size() > 1 && (ft += Game.elapsed) >= 1f / fps) { ft = 0; im.get(fr).visible = false; fr = (fr + 1) % im.size(); im.get(fr).visible = true; }
		}
	}

	/** 조리개: 가운데는 비치고 가장자리로 갈수록 색이 짙어짐 (작은 그림을 부드럽게 늘림) */
	static class Vignette extends com.watabou.noosa.Image implements Lay {
		final float a, pulse, sec; float t, kk = 1;
		public void trans(float k, String mode) { kk = k; }
		@SuppressWarnings("unchecked")
		static SmartTexture tex(int rgb, float size, float soft) {
			String key = "pdmaker:vignette:" + rgb + ":" + size + ":" + soft;
			try {
				Field fd = TextureCache.class.getDeclaredField("all"); fd.setAccessible(true);
				Map<Object, SmartTexture> all = (Map<Object, SmartTexture>) fd.get(null);
				SmartTexture t = all.get(key);
				if (t == null) {
					int n = 64; Pixmap p = new Pixmap(n, n, Pixmap.Format.RGBA8888); p.setBlending(Pixmap.Blending.None);
					float r0 = Math.max(0, Math.min(1, size)), r1 = Math.min(1.5f, r0 + Math.max(0.01f, soft));
					for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
						float dx = (x + 0.5f) / n * 2 - 1, dy = (y + 0.5f) / n * 2 - 1, d = (float) Math.sqrt(dx * dx + dy * dy) / 1.4143f;   // 모서리 = 1
						float k = Math.max(0, Math.min(1, (d - r0) / (r1 - r0)));
						p.drawPixel(x, y, (rgb << 8) | (int) (k * 255));
					}
					t = new SmartTexture(p);
					t.filter(com.watabou.glwrap.Texture.LINEAR, com.watabou.glwrap.Texture.LINEAR);
					all.put(key, t);
				}
				return t;
			} catch (Throwable e) { MakerRuntime.log("조리개 그림 준비 실패: " + e); return TextureCache.createSolid(0); }
		}
		Vignette(JsonValue l, float w, float h) {
			super(tex(rgb(l.getString("color", "#000000"), 0), l.getFloat("size", 45) / 100f, l.getFloat("soft", 55) / 100f));
			a = l.getFloat("alpha", 80) / 100f; pulse = l.getFloat("pulse", 0) / 100f; sec = Math.max(0.1f, l.getFloat("pulseSec", 2));
			scale.set(w / width, h / height); alpha(a);
		}
		@Override public void update() { super.update(); t += Game.elapsed; alpha(Math.max(0, Math.min(1, kk * a * (1 - pulse * (0.5f + 0.5f * (float) Math.sin(t * 6.2832f / sec)))))); }
	}

	/** 그림을 화면 가득 반복해서 깔고 흘림 */
	static class Img extends Group implements Lay {
		final List<SkinnedBlock> bl = new ArrayList<>();
		final boolean add, ok; final float vx, vy, jit, fps, a; float ox, oy, jt, ft; int fr;
		public void trans(float k, String mode) { for (SkinnedBlock b : bl) b.alpha(a * k); }
		Img(JsonValue l, float w, float h) {
			add = "add".equals(l.getString("blend", "normal")); vx = l.getFloat("vx", 0); vy = l.getFloat("vy", 0); jit = l.getFloat("jitter", 0); fps = Math.max(1, l.getFloat("fps", 8));
			int n = Math.max(1, l.getInt("frames", 1));
			List<SmartTexture> tx = frames(l.getString("png", ""), l.getInt("fw", 0), n);
			// 배율 1 = 그림 한 칸이 게임 화면의 한 픽셀과 같은 크기
			float z = zoom() * Math.max(0.1f, l.getFloat("scale", 1));
			a = l.getFloat("alpha", 50) / 100f;
			for (SmartTexture t : tx) {
				SkinnedBlock b = new SkinnedBlock(w, h, t) { @Override public void draw() { light(add); super.draw(); normal(add); } };
				b.autoAdjust = true; b.scale(z, z); b.alpha(a); b.visible = bl.isEmpty();
				bl.add(b); add(b);
			}
			ok = !bl.isEmpty();
		}
		@Override public void update() {
			super.update();
			float dt = Game.elapsed;
			ox -= vx * dt; oy -= vy * dt;
			if (jit > 0 && (jt -= dt) <= 0) { jt = 1f / jit; ox = Random.Float(256); oy = Random.Float(256); }
			if (bl.size() > 1 && (ft += dt) >= 1f / fps) { ft = 0; bl.get(fr).visible = false; fr = (fr + 1) % bl.size(); bl.get(fr).visible = true; }
			bl.get(fr).offsetTo(ox, oy);
		}
	}
}
