/*
 * 대사창 — RPG Maker 식: 화면 아래 넓은 대사 상자 + 캐릭터 일러스트(스탠딩) + 이름표 + ▼ 표시 + 한 글자씩 나오기 + 선택지
 *   설정: 프로젝트의 dialogue.json (에디터 → 대사창)
 *     mode      "box"(아래 대사창) | "window"(원작 가운데 창)
 *     box       style(round·game·image) color alpha border radius textColor fontSize height margin padding image slice
 *     name      show pos(auto=일러스트 반대편·right·left·text) color textColor fontSize
 *     illust    show side(left·right) height layer(front·back) avoidText smooth(auto·on·off)
 *     typing    speed(글자/초, 0 = 바로) sound
 *     box       + highlight(_강조_ 색) align(left·center)
 *     name      + image slice (이름표 그림 9조각)
 *     indicator show color image(▼ 대신 그림) anim(bob·blink·none)
 *     choice    pos(middle=화면 가운데·right·center·left) width(화면 비율) fontSize textColor textOnColor image imageOn slice
 *     소리: 사운드 편집기 → 게임 효과음 (dialogue.open · dialogue.type · dialogue.next · choice.move · choice.select)
 *   캐릭터별 (characters/<id>.json portrait): default · expressions[{key,image}] · scale · offsetX · offsetY(화면 높이 %) · side · flip
 *   EventInterpreter 의 text / topic / choice 명령이 씀. 이 창이 닫히면 이벤트가 이어서 실행됩니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Input;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.glwrap.Texture;
import com.watabou.input.KeyEvent;
import com.watabou.input.PointerEvent;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.NinePatch;
import com.watabou.noosa.PointerArea;
import com.watabou.noosa.RenderedText;
import com.watabou.noosa.ui.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MakerDialogue {

	// ------------------------------------------------------------ 설정

	/** 기본값 — 에디터 PDM.defaults.dialogue() 와 같음 */
	static final String DEFAULTS = "{mode:box,"
			+ "box:{style:round,color:\"#ffffff\",alpha:0.94,border:\"#b9b4c8\",radius:5,textColor:\"#3a3448\",fontSize:8,height:0.27,margin:4,padding:8,image:\"\",slice:6,highlight:\"#d0602a\",align:left,hideHud:true},"
			+ "name:{show:true,pos:auto,color:\"#3c3a48\",textColor:\"#ffffff\",fontSize:7,image:\"\",slice:4},"
			+ "illust:{show:true,side:left,height:0.92,layer:front,avoidText:true,smooth:auto},"
			+ "typing:{speed:40,sound:\"\"},"
			+ "indicator:{show:true,color:\"#8a82a8\",image:\"\",anim:bob},"
			+ "layout:{enabled:false},"
			+ "sounds:{open:\"\",type:\"\",next:\"\",move:\"\",select:\"\"},"
			+ "choice:{pos:middle,width:0.42,fontSize:0,textColor:\"\",textOnColor:\"\",image:\"\",imageOn:\"\",slice:4}}";
	private static JsonValue defaults;

	static JsonValue cfg(String group) {
		if (defaults == null) defaults = new com.badlogic.gdx.utils.JsonReader().parse(DEFAULTS);
		JsonValue d = MakerRuntime.dialogue;
		JsonValue g = d == null ? null : d.get(group);
		return g != null ? g : defaults.get(group);
	}
	static String s(String group, String key) {
		JsonValue g = cfg(group);
		if (g != null && g.has(key)) return g.getString(key, "");
		return defaults.get(group).getString(key, "");
	}
	static float f(String group, String key) {
		JsonValue g = cfg(group);
		try { if (g != null && g.has(key)) return g.getFloat(key); } catch (Exception ignored) { }
		return defaults.get(group).getFloat(key, 0);
	}
	static boolean b(String group, String key) {
		JsonValue g = cfg(group);
		try { if (g != null && g.has(key)) return g.getBoolean(key); } catch (Exception ignored) { }
		return defaults.get(group).getBoolean(key, false);
	}
	static int col(String group, String key) { return MakerTitle.color(s(group, key), MakerTitle.color(defaults.get(group).getString(key, "#ffffff"), 0xFFFFFF)); }

	/** 원작 가운데 창을 쓸지 */
	public static boolean classic() {
		cfg("box");
		JsonValue d = MakerRuntime.dialogue;
		return d != null && "window".equals(d.getString("mode", "box"));
	}

	// ------------------------------------------------------------ 표정 (face 명령)

	/** face 명령으로 바꾼 캐릭터의 지금 표정 (대사에 표정을 안 적으면 이것) */
	static final Map<String, String> faces = new HashMap<>();
	public static void setFace(String charId, String face) {
		if (charId == null) return;
		if (face == null || face.isEmpty()) faces.remove(charId); else faces.put(charId, face);
	}

	// ------------------------------------------------------------ 한 줄 대사

	/** 창 하나에 보여 줄 것 */
	public static class Line {
		public String name = "", text = "";
		public String speaker = "";    // 캐릭터 id · $hero
		public String illust;          // 그림 경로 (null = 없음)
		public String side;            // left · right (null = 설정값)
		public float scale = 1f, offX = 0, offY = 0;
		public boolean flip;
		public String[] choices;       // 대사 뒤에 이어서 고르는 선택지 (null = 없음)
		public String voice = "";      // 캐릭터 목소리 (글자가 나올 때 소리, 캐릭터 편집기)
	}

	/** 화자(캐릭터 id 또는 $hero) · 표정 · 직접 고른 그림으로 Line 을 채움 */
	public static Line line(String speaker, String face, String illust, String text) {
		Line l = new Line();
		l.text = text == null ? "" : text;
		l.speaker = speaker == null ? "" : speaker;
		JsonValue ch = null;
		if ("$hero".equals(speaker)) {
			JsonValue hd = HeroRuntime.data();
			if (hd != null) ch = MakerRuntime.character(hd.getString("character", ""));
			String hn = hd != null ? hd.getString("name", "") : "";
			if (hn.isEmpty() && ch != null) hn = ch.getString("name", "");
			if (hn.isEmpty() && Dungeon.hero != null) hn = Dungeon.hero.name();
			l.name = hn;
		} else if (speaker != null && !speaker.isEmpty()) {
			ch = MakerRuntime.character(speaker);
			l.name = ch != null ? ch.getString("name", speaker) : speaker;
		}
		JsonValue p = ch == null ? null : ch.get("portrait");
		if (p != null) {
			String f = face != null && !face.isEmpty() ? face : faces.get(ch.getString("id", ""));
			String img = p.getString("default", "");
			JsonValue ex = p.get("expressions");
			if (f != null && ex != null) {
				if (ex.isArray()) { for (JsonValue e : ex) if (f.equals(e.getString("key", ""))) { String i = e.getString("image", ""); if (!i.isEmpty()) img = i; } }
				else if (ex.has(f)) img = ex.getString(f, img);
			}
			if (!img.isEmpty()) l.illust = img;
			l.scale = p.getFloat("scale", 1f);
			l.offX = p.getFloat("offsetX", 0);
			l.offY = p.getFloat("offsetY", 0);
			l.flip = p.getBoolean("flip", false);
			String sd = p.getString("side", "");
			if (!sd.isEmpty()) l.side = sd;
		}
		if (ch != null) l.voice = ch.getString("voice", "");
		if (illust != null && !illust.isEmpty()) l.illust = illust;
		return l;
	}

	public interface OnChoice { void pick(int index); }

	/** 대사창 소리: 대사창 설정(dialogue.json sounds) → 비었으면 게임 효과음 설정 */
	static void snd(String local) {
		String global = local.equals("move") || local.equals("select") ? "choice." + local : "dialogue." + local;
		MakerAudio.sysSfx(cfg("sounds"), local, global);
	}
	static String sndRef(String local) {
		String v = s("sounds", local);
		return v.isEmpty() ? "sfx:dialogue." + local : v;
	}

	/** 대사창 띄우기 (렌더 스레드에서 부름). onDone: 닫힌 뒤 · onChoice: 선택지를 골랐을 때 */
	public static void show(Line l, Runnable onDone, OnChoice onChoice) {
		GameScene.show(new Wnd(l, onDone, onChoice));
	}

	// ------------------------------------------------------------ 그림 만들기 (둥근 상자 · ▼)

	private static final Map<String, SmartTexture> made = new HashMap<>();

	static int rgba(int rgb, float a) { return (rgb << 8) | Math.round(Math.max(0, Math.min(1, a)) * 255); }

	/** 둥근 사각형 9조각 그림: 크기 2r+3, 안쪽 채움 + 1픽셀 테두리 */
	static SmartTexture rounded(int fill, float alpha, int border, int r) {
		r = Math.max(0, Math.min(12, r));
		String key = "pdm_round_" + fill + "_" + alpha + "_" + border + "_" + r;
		SmartTexture tx = made.get(key);
		if (tx != null) return tx;
		int n = 2 * r + 3;
		Pixmap pm = new Pixmap(n, n, Pixmap.Format.RGBA8888);
		pm.setBlending(Pixmap.Blending.None);
		for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) {
			if (!inside(x, y, n, r)) { pm.drawPixel(x, y, 0); continue; }
			boolean edge = !inside(x - 1, y, n, r) || !inside(x + 1, y, n, r) || !inside(x, y - 1, n, r) || !inside(x, y + 1, n, r);
			pm.drawPixel(x, y, edge ? rgba(border, Math.max(alpha, 0.9f)) : rgba(fill, alpha));
		}
		tx = TextureCache.get(pm);
		made.put(key, tx);
		return tx;
	}
	private static boolean inside(int x, int y, int n, int r) {
		if (x < 0 || y < 0 || x >= n || y >= n) return false;
		if (r == 0) return true;
		float cx = x < r ? r : (x > n - 1 - r ? n - 1 - r : x);
		float cy = y < r ? r : (y > n - 1 - r ? n - 1 - r : y);
		float dx = x - cx, dy = y - cy;
		return dx * dx + dy * dy <= (r + 0.35f) * (r + 0.35f);
	}
	/** 아래를 가리키는 작은 삼각형 7×4 */
	static SmartTexture arrow(int color) {
		String key = "pdm_arrow_" + color;
		SmartTexture tx = made.get(key);
		if (tx != null) return tx;
		Pixmap pm = new Pixmap(7, 4, Pixmap.Format.RGBA8888);
		pm.setBlending(Pixmap.Blending.None);
		for (int y = 0; y < 4; y++) for (int x = 0; x < 7; x++) pm.drawPixel(x, y, (x >= y && x <= 6 - y) ? rgba(color, 1) : 0);
		tx = TextureCache.get(pm);
		made.put(key, tx);
		return tx;
	}

	static NinePatch boxPatch() {
		String st = s("box", "style");
		if (st.equals("game")) return Chrome.get(Chrome.Type.WINDOW);
		if (st.equals("image") && !s("box", "image").isEmpty()) {
			Object tx = MakerRuntime.texture(s("box", "image"));
			if (tx != null) return new NinePatch(tx, (int) Math.max(0, f("box", "slice")));
		}
		return new NinePatch(rounded(col("box", "color"), f("box", "alpha"), col("box", "border"), (int) f("box", "radius")), (int) f("box", "radius") + 1);
	}
	/** 그림 9조각 (없거나 못 읽으면 null) */
	static NinePatch imagePatch(String ref, float slice) {
		if (ref == null || ref.isEmpty()) return null;
		Object tx = MakerRuntime.texture(ref);
		return tx == null ? null : new NinePatch(tx, (int) Math.max(0, slice));
	}
	static NinePatch namePatch() {
		NinePatch p = imagePatch(s("name", "image"), f("name", "slice"));
		return p != null ? p : platePatch(col("name", "color"), col("name", "color"));
	}
	static NinePatch choicePatch(boolean on) {
		NinePatch p = imagePatch(s("choice", on ? "imageOn" : "image"), f("choice", "slice"));
		if (p == null && on) p = imagePatch(s("choice", "image"), f("choice", "slice"));   // 고른 것 그림이 없으면 같은 그림 (색으로 구분)
		if (p != null) return p;
		return on ? platePatch(col("name", "color"), col("indicator", "color")) : boxPatch();
	}
	/** 직접 그린 레이아웃 (dialogue.json layout.enabled) 의 영역 — 없으면 null. 좌표는 화면의 비율 0~1 */
	static JsonValue lay(String key) {
		JsonValue d = MakerRuntime.dialogue;
		JsonValue L = d == null ? null : d.get("layout");
		if (L == null || !L.getBoolean("enabled", false)) return null;
		JsonValue r = L.get(key);
		return r != null && r.has("x") ? r : null;
	}
	static int colOr(String group, String key, String fbGroup, String fbKey) {
		String v = s(group, key);
		return v.isEmpty() ? col(fbGroup, fbKey) : MakerTitle.color(v, col(fbGroup, fbKey));
	}
	static NinePatch platePatch(int fill, int border) {
		int r = Math.max(2, Math.min(4, (int) f("box", "radius")));
		return new NinePatch(rounded(fill, 1f, border, r), r + 1);
	}

	/** 일러스트 그림 (큰 그림을 줄일 때는 부드럽게) */
	static Image illustImage(String ref, float targetH) {
		Object tx = MakerRuntime.texture(ref);
		if (tx == null) return null;
		SmartTexture st = TextureCache.get(tx);
		String sm = s("illust", "smooth");
		boolean smooth = sm.equals("on") || (!sm.equals("off") && st.height > targetH * PixelScene.defaultZoom * 1.2f);
		if (smooth) st.filter(Texture.LINEAR, Texture.LINEAR);
		return new Image(st);
	}

	// ------------------------------------------------------------ 한 글자씩 나오는 글

	static class TypeText extends RenderedTextBlock {
		int total = 0;
		TypeText(int size) { super(size); }
		void set(String text, int maxW, int color, boolean perChar) {
			multiline = true;
			maxWidth(maxW);
			hardlight(color);
			setHightlighting(true, col("box", "highlight"));
			if ("center".equals(s("box", "align"))) align(CENTER_ALIGN);
			if (!perChar) { text(text); total = 0; for (RenderedText w : wordsOf()) total++; return; }
			List<String> tk = new ArrayList<>();
			int i = 0;
			while (i < text.length()) {
				if (text.startsWith("**", i)) { tk.add("**"); i += 2; continue; }
				int cp = text.codePointAt(i);
				tk.add(new String(Character.toChars(cp)));
				i += Character.charCount(cp);
			}
			tokens(tk.toArray(new String[0]));
			total = wordsOf().size();
		}
		/** 화면에 그려지는 글자들 (빈칸·줄바꿈 제외) */
		List<RenderedText> wordsOf() {
			List<RenderedText> out = new ArrayList<>();
			for (RenderedText w : words) if (w.parent == this) out.add(w);
			return out;
		}
		void reveal(int n) {
			int k = 0;
			for (RenderedText w : wordsOf()) w.visible = k++ < n;
		}
	}

	// ------------------------------------------------------------ 대사창이 떠 있는 동안 다른 UI 숨기기 (box.hideHud)

	/** 대사창·선택지가 떠 있는 동안 게임 화면의 UI(상태창·도구막대·기록 등 uiCamera 로 그리는 것)를 숨기고, 닫히면 되돌림.
	 *  대사가 이어질 때 깜빡이지 않도록 마지막 창이 닫히고 잠깐(0.15초) 뒤에 되돌림. */
	static class HudHider extends com.watabou.noosa.Gizmo {
		private static HudHider cur;
		private final List<com.watabou.noosa.Gizmo> hidden = new ArrayList<>();
		private float idle = 0;
		private boolean held = false;

		private static java.lang.reflect.Field MEMBERS;
		@SuppressWarnings("unchecked")
		static com.watabou.noosa.Gizmo member(com.watabou.noosa.Group g, int i) {
			try {
				if (MEMBERS == null) { MEMBERS = com.watabou.noosa.Group.class.getDeclaredField("members"); MEMBERS.setAccessible(true); }
				List<com.watabou.noosa.Gizmo> m = (List<com.watabou.noosa.Gizmo>) MEMBERS.get(g);
				return i < m.size() ? m.get(i) : null;
			} catch (Exception e) { return null; }
		}

		static void hold() {
			if (!b("box", "hideHud")) { release(); return; }
			com.watabou.noosa.Scene sc = Game.scene();
			if (!(sc instanceof GameScene)) return;
			if (cur == null || cur.parent != sc) { cur = new HudHider(); sc.add(cur); }
			cur.idle = 0; cur.held = true;
			cur.sweep(sc);
		}
		/** 창이 닫힐 때: 잠시 뒤 되돌림 (그 사이 다음 대사창이 뜨면 계속 숨김) */
		static void letGo() { if (cur != null) cur.held = false; }
		static void release() { if (cur != null) cur.restore(); }

		void sweep(com.watabou.noosa.Group sc) {
			for (int i = 0; i < sc.length; i++) {
				com.watabou.noosa.Gizmo g = member(sc, i);
				if (g == null || g == this || !g.visible) continue;
				if (g.camera != PixelScene.uiCamera) continue;
				if (g instanceof Window || g instanceof MakerStage || g instanceof MakerFilter.Host) continue;   // 화면 필터(날씨 등)는 대사 중에도 그대로
				g.visible = false;
				hidden.add(g);
			}
		}
		void restore() {
			for (com.watabou.noosa.Gizmo g : hidden) g.visible = true;
			hidden.clear();
			held = false;
			if (cur == this) cur = null;
			killAndErase_();
		}
		private void killAndErase_() { if (parent != null) parent.remove(this); }

		@Override public void update() {
			super.update();
			// 대사창이 떠 있는 동안 계속 숨김 (새로 생긴 UI 도), 모두 닫히고 잠시 뒤 되돌림
			boolean any = false;
			com.watabou.noosa.Group sc = parent;
			if (sc != null) for (int i = 0; i < sc.length; i++) { com.watabou.noosa.Gizmo g = member(sc, i); if (g instanceof Wnd && g.alive && !((Wnd) g).done) { any = true; break; } }
			if (any || held) { held = false; idle = 0; if (sc != null) sweep(sc); return; }
			idle += Game.elapsed;
			if (idle >= 0.15f) restore();
		}
	}

	// ------------------------------------------------------------ 창

	public static class Wnd extends Window {
		public final Line line;
		Runnable onDone; final OnChoice onChoice;
		final int W, H;
		NinePatch box;
		TypeText text;
		Image arrow;
		float shown = 0, speed, arrowT = 0, arrowY;
		boolean typing;
		int soundEvery = 3, lastSound = 0;
		String sound;
		final List<Choice> choices = new ArrayList<>();
		int sel = 0;
		boolean choiceOpen = false, done = false;

		public Wnd(Line l, Runnable onDone, OnChoice onChoice) {
			super(0, 0, new NinePatch(TextureCache.createSolid(0x00000000), 0));
			this.line = l; this.onDone = onDone; this.onChoice = onChoice;
			shadow.visible = false;
			W = PixelScene.uiCamera.width; H = PixelScene.uiCamera.height;
			resize(W, H);

			snd("open");
			HudHider.hold();
			add(new PointerArea(0, 0, W, H) {
				@Override protected void onClick(PointerEvent event) { advance(); }
			});

			boolean hasText = !l.text.isEmpty();
			float margin = f("box", "margin"), pad = f("box", "padding");
			int fs = Math.max(5, Math.round(f("box", "fontSize")));
			float bh = Math.max(fs * 3 + pad * 2, H * f("box", "height"));
			float bx = margin, bw = W - margin * 2, by = H - margin - bh;
			JsonValue Lb = lay("box");
			if (Lb != null) { bx = Lb.getFloat("x") * W; by = Lb.getFloat("y") * H; bw = Math.max(20, Lb.getFloat("w", 0.9f) * W); bh = Math.max(12, Lb.getFloat("h", 0.27f) * H); }

			// 일러스트
			Image ill = null;
			String side = l.side != null && (l.side.equals("left") || l.side.equals("right")) ? l.side : s("illust", "side");
			boolean showIll = b("illust", "show") && l.illust != null && !"none".equals(l.side);
			if (showIll) {
				JsonValue Li = lay("illust");
				float th = H * (Li != null ? Li.getFloat("h", 0.9f) : f("illust", "height")) * (l.scale <= 0 ? 1 : l.scale);
				ill = illustImage(l.illust, th);
				if (ill != null) {
					float sc = th / ill.height;
					ill.scale.set(sc);
					ill.flipHorizontal = l.flip;
					float iw = ill.width * sc;
					float baseX = Li != null ? Li.getFloat("x") * W : bx;          // 왼쪽 기준 (오른쪽에 서면 좌우 대칭)
					ill.x = side.equals("right") ? (Li != null ? W - baseX - iw : bx + bw - iw) - l.offX * H / 100f : baseX + l.offX * H / 100f;
					ill.y = (Li != null ? Li.getFloat("y", 1f) * H : H) - th + l.offY * H / 100f;
				}
			}
			boolean front = !"back".equals(s("illust", "layer"));
			if (ill != null && !front) add(ill);

			if (hasText) {
				box = boxPatch();
				box.x = bx; box.y = by; box.size(bw, bh);
				add(box);
			}
			if (ill != null && front) add(ill);

			// 글이 들어갈 자리 (일러스트를 피해서)
			float tx = bx + pad, tr = bx + bw - pad, textY = by + pad;
			if (ill != null && b("illust", "avoidText")) {
				float iw = ill.width * ill.scale.x;
				if (side.equals("right")) tr = Math.min(tr, Math.max(bx + bw * 0.5f, ill.x - pad));
				else tx = Math.max(tx, Math.min(bx + bw * 0.5f, ill.x + iw + pad));
			}

			JsonValue Lt = lay("text");
			if (Lt != null) { tx = Lt.getFloat("x") * W; tr = (Lt.getFloat("x") + Lt.getFloat("w", 0.5f)) * W; textY = Lt.getFloat("y") * H; }
			if (hasText) {
				speed = f("typing", "speed");
				sound = l.voice;                                        // 캐릭터 목소리 → 글자 소리 → 대사창 소리 → 게임 효과음
				if (sound == null || sound.isEmpty()) sound = s("typing", "sound");
				if (sound.isEmpty()) sound = sndRef("type");
				text = new TypeText(fs * PixelScene.defaultZoom);
				text.zoom(1 / (float) PixelScene.defaultZoom);
				text.set(l.text, (int) (tr - tx), col("box", "textColor"), speed > 0);
				boolean centerText = "center".equals(s("box", "align"));
				text.setPos(centerText ? tx + Math.max(0, (tr - tx) - text.width()) / 2f : tx, textY);
				PixelScene.align(text);
				add(text);
				typing = speed > 0;
				if (typing) text.reveal(0);

				// 이름표
				if (b("name", "show") && !l.name.isEmpty()) {
					int nfs = Math.max(5, Math.round(f("name", "fontSize")));
					RenderedTextBlock nt = PixelScene.renderTextBlock(l.name, nfs);
					nt.hardlight(col("name", "textColor"));
					NinePatch plate = namePatch();
					float pw = nt.width() + 10, ph = nt.height() + 5;
					String np = s("name", "pos");
					if (np.equals("auto") || np.isEmpty()) np = ill != null && side.equals("right") ? "left" : "right";   // 일러스트 반대편
					float px = np.equals("left") ? bx + pad : np.equals("text") ? tx : bx + bw - pad - pw;
					float py = by - ph + 2;
					JsonValue Ln = lay("name");
					if (Ln != null) { px = Ln.getFloat("x") * W; py = Ln.getFloat("y") * H; }
					plate.x = px; plate.y = py; plate.size(pw, ph);
					add(plate);
					nt.setPos(px + 5, py + (ph - nt.height()) / 2f);
					PixelScene.align(nt);
					add(nt);
				}
				// ▼
				if (b("indicator", "show")) {
					Object ai = s("indicator", "image").isEmpty() ? null : MakerRuntime.texture(s("indicator", "image"));
					arrow = ai != null ? new Image(ai) : new Image(arrow(col("indicator", "color")));
					if (ai != null && arrow.height > 12) arrow.scale.set(12f / arrow.height);   // 큰 그림은 12px 높이로
					arrow.x = bx + (bw - arrow.width()) / 2f;
					arrowY = by + bh - arrow.height() - 3;
					JsonValue La = lay("indicator");
					if (La != null) { arrow.x = La.getFloat("x") * W; arrowY = La.getFloat("y") * H; }
					arrow.y = arrowY;
					arrow.visible = !typing;
					add(arrow);
				}
			}

			// 선택지 (대사가 다 나오면 보임 · 대사 없이 선택지만 있으면 바로)
			if (l.choices != null && l.choices.length > 0) {
				float cw = 0;
				int cfs = f("choice", "fontSize") > 0 ? Math.round(f("choice", "fontSize")) : fs;
				String cp = s("choice", "pos");
				List<RenderedTextBlock> labels = new ArrayList<>();
				for (String c : l.choices) { RenderedTextBlock t = PixelScene.renderTextBlock(c, cfs); labels.add(t); cw = Math.max(cw, t.width()); }
				float minW = W * (f("choice", "width") > 0 ? f("choice", "width") : 0.22f);
				float contentW = cw + pad * 2 + 6;
				cw = Math.min(W - margin * 2, Math.max(contentW, minW));
				float ch = cfs + 8, gap = 2;
				float total = l.choices.length * ch + (l.choices.length - 1) * gap;
				float bottom = hasText ? by - (b("name", "show") && !l.name.isEmpty() ? 14 : 4) : H - margin;
				float cy = bottom - total;
				if (cp.equals("middle")) cy = Math.max(margin, Math.min(bottom - total, (bottom - total) / 2f));   // 대사창 위 공간의 가운데
				float rightEdge = ill != null && side.equals("right") ? Math.max(bx + cw, ill.x - 4) : bx + bw;   // 오른쪽 일러스트를 가리지 않게
				float cx = cp.equals("left") ? bx : (cp.equals("center") || cp.equals("middle")) ? (W - cw) / 2f : rightEdge - cw;
				JsonValue Lc = lay("choices");
				if (Lc != null) { cx = Lc.getFloat("x") * W; cy = Lc.getFloat("y") * H; cw = Math.min(W - cx, Math.max(contentW, Lc.getFloat("w", 0.4f) * W)); }
				for (int i = 0; i < l.choices.length; i++) {
					Choice c = new Choice(i, labels.get(i), pad, cp.equals("middle") || cp.equals("center"));
					c.setRect(cx, cy + i * (ch + gap), cw, ch);
					c.visible = c.active = false;
					choices.add(c);
					add(c);
				}
				if (!hasText) openChoices();
			}
		}

		void openChoices() {
			if (choiceOpen || choices.isEmpty()) return;
			choiceOpen = true;
			sel = -1;
			for (Choice c : choices) { c.visible = c.active = true; }
			select(0);
			if (arrow != null) arrow.visible = false;
		}
		void select(int i) {
			if (choices.isEmpty()) return;
			int before = sel;
			sel = (i + choices.size()) % choices.size();
			if (before >= 0 && before != sel) snd("move");
			for (Choice c : choices) c.on(c.index == sel);
		}
		public void choose(int i) {
			if (done) return;
			done = true;
			snd("select");
			Runnable r = onDone; onDone = null;
			// 이벤트를 먼저 이어 줌 (다음 창은 다음 프레임에 뜸) — 창이 사라진 틈에 "멈춘 이벤트"로 오해받지 않게
			if (onChoice != null) onChoice.pick(i);
			else if (r != null) r.run();
			super.hide();
		}

		/** 누르기·확인 키: 글자가 나오는 중이면 다 보이기 → 선택지 열기 → 닫기 */
		public void advance() {
			if (typing) { finishTyping(); return; }
			if (!choices.isEmpty()) { if (!choiceOpen) openChoices(); return; }
			hide();
		}
		void finishTyping() {
			typing = false;
			if (text != null) text.reveal(Integer.MAX_VALUE);
			if (!choices.isEmpty()) openChoices();
			else if (arrow != null) arrow.visible = true;
		}

		@Override public void update() {
			super.update();
			if (typing && text != null) {
				shown += speed * Game.elapsed;
				int n = (int) shown;
				text.reveal(n);
				if (sound != null && !sound.isEmpty() && n >= lastSound + soundEvery) { lastSound = n; MakerAudio.playSe(sound); }
				if (n >= text.total) finishTyping();
			}
			if (arrow != null && arrow.visible) {
				arrowT += Game.elapsed;
				String an = s("indicator", "anim");
				if (an.equals("blink")) arrow.alpha(0.35f + 0.65f * (float) Math.abs(Math.cos(arrowT * 3)));
				else if (!an.equals("none")) arrow.y = arrowY + (float) Math.round(Math.sin(arrowT * 5) * 1.2f);
			}
		}

		@Override public boolean onSignal(KeyEvent event) {
			if (!event.pressed) return true;
			int k = event.code;
			if (choiceOpen) {
				if (k == Input.Keys.UP || k == Input.Keys.W || k == Input.Keys.NUMPAD_8) { select(sel - 1); return true; }
				if (k == Input.Keys.DOWN || k == Input.Keys.S || k == Input.Keys.NUMPAD_2) { select(sel + 1); return true; }
				if (k >= Input.Keys.NUM_1 && k <= Input.Keys.NUM_9) { int i = k - Input.Keys.NUM_1; if (i < choices.size()) choose(i); return true; }
				if (k == Input.Keys.ENTER || k == Input.Keys.SPACE || k == Input.Keys.Z || k == Input.Keys.NUMPAD_ENTER) { choose(sel); return true; }
				return true;
			}
			if (k == Input.Keys.ENTER || k == Input.Keys.SPACE || k == Input.Keys.Z || k == Input.Keys.NUMPAD_ENTER || k == Input.Keys.ESCAPE || k == Input.Keys.BACK) advance();
			return true;
		}
		@Override public void onBackPressed() { if (!choiceOpen) advance(); }

		/** 닫힘 — 선택지가 남아 있으면 첫 번째를 고른 것으로 (자동 테스트 등) */
		@Override public void hide() {
			if (done) return;
			if (!choices.isEmpty()) { choose(choiceOpen ? sel : 0); return; }
			done = true;
			snd("next");
			Runnable r = onDone; onDone = null;
			if (r != null) r.run();
			super.hide();
			HudHider.letGo();
		}

		/** 화면 전체를 쓰는 창이라 가방 창 옆으로 밀리지 않게 (GameScene.show 가 창 위치를 옮기려 함) */
		@Override public void offset(int xOffset, int yOffset) { }

		/** 선택지 한 줄 */
		class Choice extends Component {
			final int index;
			NinePatch bg, bgOn;
			RenderedTextBlock label;
			PointerArea hot;
			final float pad; final boolean centered;
			Choice(int index, RenderedTextBlock label, float pad, boolean centered) {
				super();
				this.index = index; this.label = label; this.pad = pad; this.centered = centered;
				bg = choicePatch(false); add(bg);
				bgOn = choicePatch(true); add(bgOn);
				add(label);
				hot = new PointerArea(0, 0, 0, 0) {
					@Override protected void onClick(PointerEvent e) { choose(Choice.this.index); }
					@Override protected void onHoverStart(PointerEvent e) { select(Choice.this.index); }
				};
				add(hot);
			}
			void on(boolean v) {
				bgOn.visible = v; bg.visible = !v;
				label.hardlight(v ? colOr("choice", "textOnColor", "name", "textColor") : colOr("choice", "textColor", "box", "textColor"));
			}
			@Override protected void layout() {
				if (bg == null) return;
				bg.x = x; bg.y = y; bg.size(width, height);
				bgOn.x = x; bgOn.y = y; bgOn.size(width, height);
				label.setPos(centered ? x + (width - label.width()) / 2f : x + pad, y + (height - label.height()) / 2f);
				PixelScene.align(label);
				hot.x = x; hot.y = y; hot.width = width; hot.height = height;
			}
		}
	}
}
