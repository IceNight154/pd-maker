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
 *     text      autoScale(화면 크기에 맞춰 글자 키움) scaleMax scale(배율) lineSpacing(줄 간격 px) shadow shadowColor shadowX shadowY outline outlineColor outlineWidth bold
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
			+ "choice:{pos:middle,width:0.42,fontSize:0,textColor:\"\",textOnColor:\"\",image:\"\",imageOn:\"\",slice:4},"
			+ "text:{autoScale:true,scaleMax:2,scale:1,lineSpacing:0,tracking:0,shadow:false,shadowColor:\"#000000\",shadowX:0.5,shadowY:0.5,outline:false,outlineColor:\"#000000\",outlineWidth:0.5,bold:false},"
			+ "fx:{effect:none,dur:0.25,strength:1,scope:all,emScale:1}}";   // 5차: 글자 간격(tracking) · 글자 연출(fx) — 없으면 예전과 같은 모습
	private static JsonValue defaults;

	static JsonValue cfg(String group) {
		if (defaults == null) defaults = new com.badlogic.gdx.utils.JsonReader().parse(DEFAULTS);
		JsonValue d = MakerRuntime.dialogue;
		JsonValue g = d == null ? null : d.get(group);
		return g != null ? g : defaults.get(group);
	}
	/** 빈 칸("")이면 프로젝트 게임 UI 테마를 따르는 칸 (6차 — 우선순위: 대사창 설정 → 테마 → 원작). 예전 프로젝트는 값이 들어 있어 그대로.
	 *  모양(box.style) 빈 칸 = "skin": 대사창 · 이름표 · 선택지를 게임 UI 스프라이트(chrome.png 9조각 — MakerTheme.patch)로. 글자 색은 테마 글자 색 */
	static final java.util.Map<String, String> THEMED = new java.util.HashMap<>();
	static {
		THEMED.put("box.textColor", "text"); THEMED.put("box.highlight", "accent"); THEMED.put("name.textColor", "text"); THEMED.put("indicator.color", "accent");
		THEMED.put("box.style", "@skin");
	}
	static String s(String group, String key) {
		JsonValue g = cfg(group);
		String v = g != null && g.has(key) ? g.getString(key, "") : defaults.get(group).getString(key, "");
		if (v.isEmpty()) {
			String t = THEMED.get(group + "." + key);
			if (t != null) return t.equals("@skin") ? "skin" : MakerTheme.hex(t);
			v = defaults.get(group).getString(key, "");   // 테마와 상관없는 칸(둥근 상자의 색 등)을 비웠으면 기본값
		}
		return v;
	}
	/** 대사창 · 이름표 · 선택지를 게임 UI 스프라이트로 그리는가 (모양 = 테마) */
	static boolean skinned() { return "skin".equals(s("box", "style")); }
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
		public float speed = -1;       // 이 줄만 글자 속도 (글자/초, 0 = 바로 다 보임, < 0 = 대사창 설정)
		public float auto = 0;         // 다 보인 뒤 이 초가 지나면 저절로 넘김 (0 = 입력을 기다림, 선택지가 있으면 쓰지 않음)
		// 5차 — 이 줄만 덮어쓰기 (NaN · null = 이벤트의 "대사 스타일" → 대사창 설정 순서로)
		public float tracking = Float.NaN, lineGap = Float.NaN, fxDur = Float.NaN, fxStrength = Float.NaN;
		public String effect, fxScope;
		public float sizePct = Float.NaN, padding = Float.NaN;   // 글자 크기(대사창 글자 크기의 %) · 안쪽 여백(px)
		public String align, emColor;                            // 정렬(left · center) · 강조 색(#rrggbb)
		public Boolean bold;                                     // 굵게 (null = 설정 그대로)
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

	static int boxRadius() { return (int) f("box", "radius"); }
	static NinePatch boxPatch() {
		String st = s("box", "style");
		if (st.equals("skin")) return MakerTheme.patch("box");   // 게임 UI 스프라이트 (프로젝트 chrome.png — 테마가 고른 조각)
		if (st.equals("game")) return Chrome.get(Chrome.Type.WINDOW);
		if (st.equals("image") && !s("box", "image").isEmpty()) {
			Object tx = MakerRuntime.texture(s("box", "image"));
			if (tx != null) return new NinePatch(tx, (int) Math.max(0, f("box", "slice")));
		}
		int rad = boxRadius();
		return new NinePatch(rounded(col("box", "color"), f("box", "alpha"), col("box", "border"), rad), rad + 1);
	}
	/** 그림 9조각 (없거나 못 읽으면 null) */
	static NinePatch imagePatch(String ref, float slice) {
		if (ref == null || ref.isEmpty()) return null;
		Object tx = MakerRuntime.texture(ref);
		return tx == null ? null : new NinePatch(tx, (int) Math.max(0, slice));
	}
	static NinePatch namePatch() {
		NinePatch p = imagePatch(s("name", "image"), f("name", "slice"));
		if (p != null) return p;
		return skinned() ? MakerTheme.patch("name") : platePatch(col("name", "color"), col("name", "color"));
	}
	static NinePatch choicePatch(boolean on) {
		NinePatch p = imagePatch(s("choice", on ? "imageOn" : "image"), f("choice", "slice"));
		if (p == null && on) p = imagePatch(s("choice", "image"), f("choice", "slice"));   // 고른 것 그림이 없으면 같은 그림 (색으로 구분)
		if (p != null) return p;
		if (skinned()) return MakerTheme.patch(on ? "choiceOn" : "choice");
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
		int r = Math.max(2, Math.min(4, boxRadius()));
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

	/** 글자 크기 배율: 화면(uiCamera)이 기준보다 크면 키움 (text.autoScale · scaleMax) × text.scale.
	 *  게임은 PC 에서 보통 3배 확대라 큰 창일수록 화면 단위가 넓어져 글자가 상대적으로 작아 보였음.
	 *  기준: 가로 화면 300×190 · 세로 화면 150×260 (화면 단위) — 그보다 작으면 ×1 (휴대폰 세로 등) */
	static float textScale(int W, int H) {
		float k = 1f;
		if (b("text", "autoScale")) {
			boolean land = W >= H;
			float rw = land ? 300f : 150f, rh = land ? 190f : 260f;
			k = Math.max(1f, Math.min(Math.max(1f, f("text", "scaleMax")), Math.min(W / rw, H / rh)));
		}
		float m = f("text", "scale");
		return k * (m > 0 ? m : 1f);
	}
	/** 글자 꾸밈 거리(게임 화면 px) → 실제 화면 한 픽셀 단위로 맞춤 (최소 한 픽셀) */
	static float px(float v) { float z = PixelScene.defaultZoom; return v == 0 ? 0 : Math.signum(v) * Math.max(1f, Math.round(Math.abs(v) * z)) / z; }

	// ------------------------------------------------------------ 한 글자씩 나오는 글

	static class TypeText extends RenderedTextBlock {
		int total = 0;
		float lineExtra = 0;   // 줄 간격 더하기 (text.lineSpacing)
		float tracking = 0;    // 글자 사이 더하기 (text.tracking, 5차) — 글자 단위로 나눈 대사에만
		float emScale = 1;     // 강조(**…**) 글자 크기 (fx.emScale)
		Boolean center;        // 가운데 정렬 (null = 대사창 설정 box.align)
		boolean[] em = new boolean[0];   // 글자마다 강조 구간인지 (글자 번호 = wordsOf 순서)
		float[] baseX = new float[0], baseY = new float[0], baseS = new float[0];   // 줄 배치가 정한 자리 · 크기 (글자 연출이 여기서부터 움직임)
		TypeText(int size) { super(size); }
		void set(String text, int maxW, int color, boolean perChar) { set(text, maxW, color, col("box", "highlight"), perChar); }
		void set(String text, int maxW, int color, int hiColor, boolean perChar) {
			multiline = true;
			maxWidth(maxW);
			hardlight(color);
			setHightlighting(true, hiColor);
			if (center != null ? center : "center".equals(s("box", "align"))) align(CENTER_ALIGN);
			if (!perChar) { text(text); total = 0; for (RenderedText w : wordsOf()) total++; return; }
			// 글자 = 사람이 보는 한 글자(grapheme — 결합 문자 · 이모지 조합을 쪼개지 않음, 5차). "**" · "_" 는 강조 표시 (원작 RenderedTextBlock 규칙)
			List<String> tk = new ArrayList<>();
			List<Boolean> emList = new ArrayList<>();
			boolean on = false;
			String[] parts = text.split("\\*\\*", -1);
			for (int pi = 0; pi < parts.length; pi++) {
				if (pi > 0) { tk.add("**"); on = !on; }
				String part = parts[pi];
				java.text.BreakIterator bi = java.text.BreakIterator.getCharacterInstance();
				bi.setText(part);
				for (int a = bi.first(), b = bi.next(); b != java.text.BreakIterator.DONE; a = b, b = bi.next()) {
					String g = part.substring(a, b); tk.add(g);
					if (g.equals("_")) { on = !on; continue; }   // 원작 강조 표시 "_" 도 (그리는 글자가 아님 — 강조 번호가 밀리지 않게)
					if (!g.equals(" ") && !g.equals("\n")) emList.add(on);
				}
			}
//#if method:ui.RenderedTextBlock#tokens @ 대사창 강조 글자 나누기 (예전 판 방식으로)
			tokens(tk.toArray(new String[0]));
//#else
			//#| this.tokens = tk.toArray(new String[0]); MakerCompat.invoke(this, "build");   // 예전 판: tokens 함수가 없음 — 필드에 넣고 다시 짜기
//#endif
			total = wordsOf().size();
			em = new boolean[total]; for (int k = 0; k < total && k < emList.size(); k++) em[k] = emList.get(k);
			if (emScale != 1f) { int k = 0; for (RenderedText w : wordsOf()) { if (k < em.length && em[k]) w.scale.set(w.scale.x * emScale, w.scale.y * emScale); k++; } layout(); }
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
		/** 글자 전체(채움 + 게임 글꼴의 검은 테두리)를 한 색으로 — 그림자 · 외곽선 사본 (hardlight 는 곱하기라 검은 테두리가 그대로 남음) */
		void silhouette(int color) {
			float r = ((color >> 16) & 0xFF) / 255f, g = ((color >> 8) & 0xFF) / 255f, b = (color & 0xFF) / 255f;
			for (RenderedText w : words) { if (w == null) continue; w.rm = w.gm = w.bm = 0; w.ra = r; w.ga = g; w.ba = b; }
		}
		int align = LEFT_ALIGN;
		@Override public synchronized void align(int a) { align = a; super.align(a); }
		/** 원작의 빈칸 · 줄바꿈 표시 (RenderedTextBlock 의 private 상수 — 줄 배치를 직접 하려고 읽음) */
		static final RenderedText SPACE_, NEWLINE_;
		static {
			RenderedText sp = null, nl = null;
			try {
				java.lang.reflect.Field f = RenderedTextBlock.class.getDeclaredField("SPACE"); f.setAccessible(true); sp = (RenderedText) f.get(null);
				f = RenderedTextBlock.class.getDeclaredField("NEWLINE"); f.setAccessible(true); nl = (RenderedText) f.get(null);
			} catch (Throwable t) { MakerRuntime.log("대사 줄 배치: 원작 글 상자 구조가 달라 원작 배치를 씁니다 (" + t + ")"); }
			SPACE_ = sp; NEWLINE_ = nl;
		}
		static boolean cjk(RenderedText w) {
			String t = w.text(); if (t == null || t.isEmpty()) return false;
			Character.UnicodeScript sc = Character.UnicodeScript.of(t.codePointAt(0));
			return sc == Character.UnicodeScript.HAN || sc == Character.UnicodeScript.HIRAGANA || sc == Character.UnicodeScript.KATAKANA
					|| (t.codePointAt(0) >= 0x3000 && t.codePointAt(0) <= 0x303F) || (t.codePointAt(0) >= 0xFF00 && t.codePointAt(0) <= 0xFFEF);
		}
		/** 줄 배치 — 원작(RenderedTextBlock.layout)과 같은 규칙이되 두 가지를 고침 (4차 · 게임에서 발견):
		 *   ① 글자마다 나누어 그리는 대사(글자가 하나씩 나오는 효과)는 빈칸까지를 한 낱말로 묶는데, 빈칸 없이 이어진 글(일본어 · 중국어 · 긴 주소)이
		 *      대사창 폭보다 길면 앞 글자들이 한 줄에 하나씩 세로로 쌓였음 → 한 줄보다 긴 낱말은 글자 단위로 자름
		 *   ② 한자 · 가나 · 전각 문장 부호는 어디서든 줄을 바꿀 수 있게 (원작은 게임 언어가 중국어 · 일본어일 때만 그렇게 함)
		 *   그 밖(빈칸이 있는 한국어 · 영어)은 원작과 같은 자리에 놓임 + 줄 간격(lineExtra) */
		@Override protected synchronized void layout() {
			if (SPACE_ == null || NEWLINE_ == null || words == null) { super.layout(); applyLineExtra(); return; }
			float x = this.x, y = this.y, lh = 0; nLines = 1;
			List<List<RenderedText>> lines = new ArrayList<>(); List<RenderedText> cur = new ArrayList<>(); lines.add(cur);
			int maxW = maxWidth();
			width = 0;
			for (int i = 0; i < words.size(); i++) {
				RenderedText w = words.get(i);
				if (w == SPACE_) { x += 1.667f; continue; }
				if (w == NEWLINE_) { y += lh + 2f; x = this.x; nLines++; cur = new ArrayList<>(); lines.add(cur); continue; }
				if (w.height() > lh) lh = w.height();
				float full = w.width();
				if (!cjk(w)) for (int j = i + 1; j < words.size() && words.get(j) != SPACE_ && words.get(j) != NEWLINE_ && !cjk(words.get(j)); j++) full += words.get(j).width() - 0.667f + tracking;
				if (full > maxW) full = w.width();   // ① 한 줄보다 긴 낱말: 이 글자만 보고 넘침을 판단
				if ((x - this.x) + full - 0.001f > maxW && !cur.isEmpty()) { y += lh + 2f; x = this.x; nLines++; cur = new ArrayList<>(); lines.add(cur); }
				w.x = x; w.y = y; PixelScene.align(w);
				x += w.width(); cur.add(w);
				if (x - this.x > width) width = x - this.x;
				x -= 0.667f;
				x += tracking;   // 글자 간격 (5차)
			}
			height = (y - this.y) + lh;
			if (align == CENTER_ALIGN || align == RIGHT_ALIGN) for (List<RenderedText> line : lines) {
				if (line.isEmpty()) continue;
				RenderedText last = line.get(line.size() - 1);
				float lw = last.width() + last.x - this.x;
				for (RenderedText t : line) { t.x += align == CENTER_ALIGN ? (width - lw) / 2f : width - lw; PixelScene.align(t); }
			}
			applyLineExtra();
			saveBase();
		}
		/** 줄 배치 결과(자리 · 크기)를 기억 — 글자 연출은 매 프레임 이 값에서 옮김 */
		void saveBase() {
			List<RenderedText> g = wordsOf(); int n = g.size();
			if (baseX.length != n) { baseX = new float[n]; baseY = new float[n]; baseS = new float[n]; }
			for (int k = 0; k < n; k++) { RenderedText w = g.get(k); baseX[k] = w.x; baseY[k] = w.y; baseS[k] = w.scale.y; }
		}
		/** 글자 연출 (5차): 글자마다 나타난 때(t0) 부터 지난 시간으로 — fade 흐리게 · rise 아래에서 올라옴 · drop 위에서 내려옴 · pop 크게 나타나 제자리 · shake 떨림 · wave 물결.
		 *  emOnly = 강조(**…**) 글자에만. 시간은 Game.elapsed 를 더한 Wnd 시계 (배속 · 스킵과 같은 시계) */
		void fx(String effect, float[] t0, float now, float dur, float strength, boolean emOnly) {
			List<RenderedText> g = wordsOf();
			for (int k = 0; k < g.size() && k < baseX.length; k++) {
				RenderedText w = g.get(k);
				if (!w.visible) continue;
				float dx = 0, dy = 0, sc = 1, a = 1;
				boolean act = !emOnly || (k < em.length && em[k]);
				if (act) {
					float p = Math.max(0, Math.min(1, (now - (k < t0.length ? t0[k] : 0)) / Math.max(0.01f, dur))), e = p * p * (3 - 2 * p);
					switch (effect) {
						case "fade": a = e; break;
						case "rise": dy = 3f * strength * (1 - e); a = e; break;
						case "drop": dy = -3f * strength * (1 - e); a = e; break;
						case "pop": sc = 1 + 0.8f * strength * (1 - e); a = Math.min(1, e * 2); break;
						case "shake": dx = 0.7f * strength * (float) Math.sin(now * 40 + k * 2.3f); dy = 0.7f * strength * (float) Math.cos(now * 33 + k * 1.7f); break;
						case "wave": dy = 1.2f * strength * (float) Math.sin(now * 6 + k * 0.6f); break;
					}
				}
				float bs = baseS[k], bw = w.width() / (w.scale.y / bs), bh = w.height() / (w.scale.y / bs);
				w.scale.set(bs * sc);
				w.x = baseX[k] + dx - (sc - 1) * bw / 2f; w.y = baseY[k] + dy - (sc - 1) * bh / 2f;
				w.alpha(a);
			}
		}
		/** 줄마다 lineExtra 씩 아래로 */
		void applyLineExtra() {
			if (lineExtra == 0 || words == null) return;
			java.util.TreeSet<Integer> ys = new java.util.TreeSet<>();
			for (RenderedText w : words) if (w.parent == this) ys.add(Math.round(w.y * 100));
			if (ys.size() < 2) return;
			java.util.List<Integer> order = new ArrayList<>(ys);
			for (RenderedText w : words) if (w.parent == this) w.y += order.indexOf(Math.round(w.y * 100)) * lineExtra;
			height += (order.size() - 1) * lineExtra;
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
				if (g instanceof Window || g instanceof MakerStage || g instanceof MakerFilter.Host || g instanceof MakerTestEnv.Overlay || g instanceof MakerCutscene.Bar) continue;   // 화면 필터(날씨 등) · 테스트 플레이 단추는 대사 중에도 그대로
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

	/** "입력 기다리기" 명령: 화면을 누르거나 확인 · 취소 키를 누를 때까지 (보이는 것 없음 — 그 사이 게임 조작도 막힘). 끝나면 onDone 한 번 */
	public static class WaitWnd extends Window {
		Runnable onDone;
		public WaitWnd(Runnable onDone) {
			super(0, 0, new NinePatch(TextureCache.createSolid(0x00000000), 0));
			this.onDone = onDone;
			shadow.visible = false;
			int W = PixelScene.uiCamera.width, H = PixelScene.uiCamera.height;
			resize(W, H); pinToScreen(this);
			add(new PointerArea(0, 0, W, H) { @Override protected void onClick(PointerEvent event) { hide(); } });
		}
		@Override public boolean onSignal(KeyEvent event) {
			if (!event.pressed) return true;
			int k = event.code;
			if (k == Input.Keys.ENTER || k == Input.Keys.SPACE || k == Input.Keys.Z || k == Input.Keys.NUMPAD_ENTER || k == Input.Keys.ESCAPE || k == Input.Keys.BACK) hide();
			return true;
		}
		@Override public void onBackPressed() { hide(); }
		@Override public void offset(int xOffset, int yOffset) { }   // 화면 전체 창 — 가방 창 옆으로 밀리지 않게 (Wnd 와 같음)
		@Override public void hide() {
			Runnable r = onDone; onDone = null;
			if (r != null) r.run();   // 이벤트를 먼저 이어 줌 — 창이 사라진 틈에 "멈춘 이벤트"로 오해받지 않게 (Wnd 와 같음)
			super.hide();
		}
	}

	/** 안전 영역 (ui 좌표: x, y, w, h) — 노치 · 상태 줄 · 내비게이션 바를 뺀 곳. 데스크톱은 화면 전체 (원작 GameScene 과 같은 getSafeInsets(INSET_ALL)) */
	static float[] safeArea(float W, float H) {
		com.watabou.utils.RectF in;
//#if field:com.watabou.utils.PlatformSupport#INSET_ALL @ 기기 안전 영역 (노치 · 내비게이션 바 — 없는 예전 판은 화면 전체)
		try { in = Game.platform.getSafeInsets(com.watabou.utils.PlatformSupport.INSET_ALL).scale(1f / PixelScene.uiCamera.zoom); }
		catch (Throwable t) { in = new com.watabou.utils.RectF(); }
//#else
		//#| in = new com.watabou.utils.RectF();   // 예전 판: 안전 영역 API 가 없음 (화면 전체)
//#endif
		float[] te = MakerTestEnv.insets(); float z = PixelScene.uiCamera.zoom;   // 테스트 플레이 안전 영역 미리보기 (5차) — 기기 값과 큰 쪽
		in.left = Math.max(in.left, te[0] / z); in.top = Math.max(in.top, te[1] / z); in.right = Math.max(in.right, te[2] / z); in.bottom = Math.max(in.bottom, te[3] / z);
		return new float[]{in.left, in.top, Math.max(1, W - in.left - in.right), Math.max(1, H - in.top - in.bottom)};
	}

	/** 화면 전체 창의 카메라를 화면 (0,0) 에 — 원작 Window 는 내비게이션 바만큼 줄인 곳의 가운데에 두어, 안전 영역이 위아래 · 좌우로 다르면 창 전체가 반만큼 밀렸음.
	 *  이렇게 하면 창 안 좌표 = 화면 좌표(uiCamera)라서 안전 영역(safeArea)을 그대로 쓸 수 있음 */
	static void pinToScreen(Window w) { w.camera.x = 0; w.camera.y = 0; }

	public static class Wnd extends Window {
		public final Line line;
		Runnable onDone; final OnChoice onChoice;
		final int W, H;
		NinePatch box;
		TypeText text;
		final List<TypeText> deco = new ArrayList<>();   // 그림자 · 외곽선 · 굵게 사본
		Image arrow;
		NinePatch plate; RenderedTextBlock nameText; Image illImg;   // 이름표 · 일러스트 (배치 검사 debugLayout 용)
		TypeText newText(int fs, float lineExtra) {
			TypeText t = new TypeText(fs * PixelScene.defaultZoom);
			t.zoom(1 / (float) PixelScene.defaultZoom);
			t.lineExtra = lineExtra;
			return t;
		}
		// 글자 연출 (5차): 효과 · 시간 · 세기 · 강조만 — 줄 → 이벤트 "대사 스타일" → 대사창 설정 순서 (EventInterpreter 가 줄에 채움)
		String effect = "none"; float fxDur = 0.25f, fxStrength = 1f, fxT = 0; boolean fxEm; float[] t0 = new float[0]; int shownN = 0;
		void revealAll(int n) {
			if (text != null) text.reveal(n); for (TypeText c : deco) c.reveal(n);
			if (text != null) { int m = Math.min(n, text.total); if (t0.length != text.total) t0 = new float[text.total]; for (int k = shownN; k < m; k++) t0[k] = fxT; shownN = Math.max(shownN, m); }
		}
		void applyFx() { if ("none".equals(effect) || text == null) return; text.fx(effect, t0, fxT, fxDur, fxStrength, fxEm); for (TypeText c : deco) c.fx(effect, t0, fxT, fxDur, fxStrength, fxEm); }
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
			resize(W, H); pinToScreen(this);

			snd("open");
			HudHider.hold();
			add(new PointerArea(0, 0, W, H) {
				@Override protected void onClick(PointerEvent event) { advance(); }
			});

			boolean hasText = !l.text.isEmpty();
			float margin = f("box", "margin"), pad = !Float.isNaN(l.padding) ? Math.max(0, Math.min(40, l.padding)) : f("box", "padding");
			final float tk = textScale(W, H);   // 화면 크기에 맞춘 글자 배율
			int fs = Math.max(5, Math.round(f("box", "fontSize") * (Float.isNaN(l.sizePct) ? 1f : Math.max(0.5f, Math.min(3f, l.sizePct / 100f))) * tk));
			// 대사창 · 글 · 이름표 · ▼ · 선택지는 안전 영역(노치 · 상태 줄 · 내비게이션 바를 뺀 곳) 안에 — 데스크톱 · 안전 영역이 없는 기기는 화면 전체라 예전과 같음.
			// 일러스트 · 배경은 화면 전체 (4차: 예전엔 대사창이 내비게이션 바 · 노치 아래로 들어갔음)
			final float[] sa = safeArea(W, H); final float SX = sa[0], SY = sa[1], SW = sa[2], SH = sa[3];
			float bh = Math.max(fs * 3 + pad * 2, SH * f("box", "height"));
			float bx = SX + margin, bw = SW - margin * 2, by = SY + SH - margin - bh;
			JsonValue Lb = lay("box");
			if (Lb != null) { bx = SX + Lb.getFloat("x") * SW; by = SY + Lb.getFloat("y") * SH; bw = Math.max(20, Lb.getFloat("w", 0.9f) * SW); bh = Math.max(12, Lb.getFloat("h", 0.27f) * SH); }

			// 일러스트
			Image ill = null;
			String side = l.side != null && (l.side.equals("left") || l.side.equals("right")) ? l.side : s("illust", "side");
			boolean showIll = b("illust", "show") && l.illust != null && !"none".equals(l.side);
			if (showIll) {
				JsonValue Li = lay("illust");
				float th = H * (Li != null ? Li.getFloat("h", 0.9f) : f("illust", "height")) * (l.scale <= 0 ? 1 : l.scale);
				ill = illustImage(l.illust, th);
				if (ill != null) {
					if (Li == null) th = Math.min(th, W * ill.height / ill.width);   // 화면보다 넓어지지 않게 (세로 화면 · 가로로 긴 그림 — 편집기 미리보기와 같음)
					float sc = th / ill.height;
					ill.scale.set(sc);
					ill.flipHorizontal = l.flip;
					float iw = ill.width * sc;
					float baseX = Li != null ? Li.getFloat("x") * W : bx;          // 왼쪽 기준 (오른쪽에 서면 좌우 대칭)
					ill.x = side.equals("right") ? (Li != null ? W - baseX - iw : bx + bw - iw) - l.offX * H / 100f : baseX + l.offX * H / 100f;
					ill.y = (Li != null ? Li.getFloat("y", 1f) * H : H) - th + l.offY * H / 100f;
				}
			}
			illImg = ill;
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
			if (Lt != null) { tx = SX + Lt.getFloat("x") * SW; tr = SX + (Lt.getFloat("x") + Lt.getFloat("w", 0.5f)) * SW; textY = SY + Lt.getFloat("y") * SH; }
			if (hasText) {
				speed = l.speed >= 0 ? l.speed : f("typing", "speed");
				effect = l.effect != null && !l.effect.isEmpty() ? l.effect : s("fx", "effect");
				fxDur = !Float.isNaN(l.fxDur) ? l.fxDur : f("fx", "dur"); fxStrength = !Float.isNaN(l.fxStrength) ? l.fxStrength : f("fx", "strength");
				fxEm = "em".equals(l.fxScope != null && !l.fxScope.isEmpty() ? l.fxScope : s("fx", "scope"));
				final float tracking = !Float.isNaN(l.tracking) ? l.tracking : f("text", "tracking"), emScale = Math.max(0.5f, Math.min(2f, f("fx", "emScale")));
				final boolean perChar = speed > 0 || tracking != 0 || !"none".equals(effect) || emScale != 1f;   // 글자 단위로 나눌 때: 글자가 하나씩 · 글자 간격 · 연출 · 강조 크기
				sound = l.voice;                                        // 캐릭터 목소리 → 글자 소리 → 대사창 소리 → 게임 효과음
				if (sound == null || sound.isEmpty()) sound = s("typing", "sound");
				if (sound.isEmpty()) sound = sndRef("type");
				// 꾸밈(그림자 · 외곽선 · 굵게) = 같은 글을 조금씩 옮겨 겹쳐 그림 (글자가 나오는 것도 함께)
				float ow = px(f("text", "outlineWidth")), sx = px(f("text", "shadowX")), sy = px(f("text", "shadowY")), bd = px(0.34f);
				List<float[]> offs = new ArrayList<>(); List<Integer> ocs = new ArrayList<>();   // 옮길 거리 {dx, dy} · 색 (null = 본문 색)
				if (b("text", "shadow")) { offs.add(new float[]{sx, sy}); ocs.add(col("text", "shadowColor")); }
				if (b("text", "outline")) { int oc = col("text", "outlineColor"); for (float[] d : new float[][]{{-ow, 0}, {ow, 0}, {0, -ow}, {0, ow}, {-ow, -ow}, {ow, -ow}, {-ow, ow}, {ow, ow}}) { offs.add(d); ocs.add(oc); } }
				final boolean bold = l.bold != null ? l.bold : b("text", "bold");
				final boolean centerText = "center".equals(l.align != null && !l.align.isEmpty() ? l.align : s("box", "align"));
				final int hi = l.emColor != null && !l.emColor.isEmpty() ? MakerTitle.color(l.emColor, col("box", "highlight")) : col("box", "highlight");
				if (bold) { offs.add(new float[]{bd, 0}); ocs.add(null); }
				int maxW = (int) (tr - tx - (bold ? bd : 0));
				float lineExtra = !Float.isNaN(l.lineGap) ? l.lineGap : f("text", "lineSpacing");
				text = newText(fs, lineExtra); text.tracking = tracking; text.emScale = emScale; text.center = centerText;
				text.set(l.text, maxW, col("box", "textColor"), hi, perChar);
				float textX = centerText ? tx + Math.max(0, (tr - tx) - text.width()) / 2f : tx;
				for (int oi = 0; oi < offs.size(); oi++) {
					float[] o = offs.get(oi); Integer occ = ocs.get(oi);
					TypeText c = newText(fs, lineExtra); c.tracking = tracking; c.emScale = emScale; c.center = centerText;
					int oc = occ == null ? col("box", "textColor") : occ;
					c.set(l.text, maxW, oc, occ == null ? hi : oc, perChar);
					if (occ != null) c.silhouette(occ);
					c.setPos(textX + o[0], textY + o[1]);
					PixelScene.align(c);
					add(c);
					deco.add(c);
				}
				text.setPos(textX, textY);
				PixelScene.align(text);
				add(text);
				typing = speed > 0;
				revealAll(typing ? 0 : Integer.MAX_VALUE);   // 바로 다 보이는 대사도 나타난 시각을 기록 (연출이 한꺼번에)
				applyFx();

				// 이름표
				if (b("name", "show") && !l.name.isEmpty()) {
					int nfs = Math.max(5, Math.round(f("name", "fontSize") * tk));
					RenderedTextBlock nt = PixelScene.renderTextBlock(l.name, nfs);
					nt.hardlight(col("name", "textColor"));
					NinePatch plate = namePatch();
					float pw = nt.width() + 10, ph = nt.height() + 5;
					String np = s("name", "pos");
					if (np.equals("auto") || np.isEmpty()) np = ill != null && side.equals("right") ? "left" : "right";   // 일러스트 반대편
					float px = np.equals("left") ? bx + pad : np.equals("text") ? tx : bx + bw - pad - pw;
					float py = by - ph + 2;
					JsonValue Ln = lay("name");
					if (Ln != null) { px = SX + Ln.getFloat("x") * SW; py = SY + Ln.getFloat("y") * SH; }
					plate.x = px; plate.y = py; plate.size(pw, ph);
					add(plate);
					this.plate = plate; this.nameText = nt;
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
					if (La != null) { arrow.x = SX + La.getFloat("x") * SW; arrowY = SY + La.getFloat("y") * SH; }
					arrow.y = arrowY;
					arrow.visible = !typing;
					add(arrow);
				}
			}

			// 선택지 (대사가 다 나오면 보임 · 대사 없이 선택지만 있으면 바로)
			if (l.choices != null && l.choices.length > 0) {
				float cw = 0;
				int cfs = f("choice", "fontSize") > 0 ? Math.max(5, Math.round(f("choice", "fontSize") * tk)) : fs;
				String cp = s("choice", "pos");
				List<RenderedTextBlock> labels = new ArrayList<>();
				for (String c : l.choices) { RenderedTextBlock t = PixelScene.renderTextBlock(c, cfs); labels.add(t); cw = Math.max(cw, t.width()); }
				float minW = SW * (f("choice", "width") > 0 ? f("choice", "width") : 0.22f);
				float contentW = cw + pad * 2 + 6;
				cw = Math.min(SW - margin * 2, Math.max(contentW, minW));
				float ch = cfs + 8, gap = 2;
				float total = l.choices.length * ch + (l.choices.length - 1) * gap;
				float bottom = hasText ? by - (b("name", "show") && !l.name.isEmpty() ? 14 : 4) : SY + SH - margin;
				float cy = bottom - total;
				if (cp.equals("middle")) cy = Math.max(SY + margin, Math.min(bottom - total, SY + (bottom - SY - total) / 2f));   // 대사창 위 공간의 가운데
				float rightEdge = ill != null && side.equals("right") ? Math.max(bx + cw, ill.x - 4) : bx + bw;   // 오른쪽 일러스트를 가리지 않게
				float cx = cp.equals("left") ? bx : (cp.equals("center") || cp.equals("middle")) ? SX + (SW - cw) / 2f : rightEdge - cw;
				JsonValue Lc = lay("choices");
				if (Lc != null) { cx = SX + Lc.getFloat("x") * SW; cy = SY + Lc.getFloat("y") * SH; cw = Math.min(SX + SW - cx, Math.max(contentW, Lc.getFloat("w", 0.4f) * SW)); }
				for (int i = 0; i < l.choices.length; i++) {
					Choice c = new Choice(i, labels.get(i), pad, cp.equals("middle") || cp.equals("center"));
					c.setRect(cx, cy + i * (ch + gap), cw, ch);
					c.visible = c.active = false;
					choices.add(c);
					add(c);
				}
				if (!hasText) openChoices();
			}
			// 화면 크기가 바뀌어(돌리기 · 창 크기) 같은 줄을 다시 띄운 경우: 나온 글자 · 연출 시계를 이어받음 (처음부터 다시 타자하지 않게)
			Carry k = carry; carry = null;
			if (k != null && k.line == l && text != null) {
				fxT = k.fxT; autoT = k.autoT;
				if (!k.typing) { finishTyping(); for (int i = 0; i < t0.length; i++) t0[i] = fxT - 100f; }
				else { shown = k.shown; revealAll((int) shown); for (int i = 0; i < Math.min(t0.length, k.t0.length); i++) t0[i] = k.t0[i]; }
				applyFx();
			}
		}
		/** 다시 띄울 창에 넘길 진행 상태 (EventInterpreter.rebuild 가 옛 창에서 담음 — 같은 Line 객체일 때만 씀) */
		static final class Carry { Line line; float shown, fxT, autoT; boolean typing; float[] t0; }
		static Carry carry;
		public void carryOver() {
			if (done) return;
			Carry k = new Carry(); k.line = line; k.shown = shown; k.fxT = fxT; k.autoT = autoT; k.typing = typing; k.t0 = t0.clone();
			carry = k;
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
		/** 상태 (자동 테스트 "typing"): 글자 진행 · 연출 · 글자 간격 · 줄 수 · 글 크기 */
		public String debugTyping() {
			return String.format(java.util.Locale.ROOT, "line='%s' shown=%d/%d real=%.2f perRealSec=%.1f typing=%s speed=%.0f effect=%s dur=%.2f fxT=%.2f tracking=%.1f lineExtra=%.1f text=%.0fx%.0f choices=%d open=%s done=%s",
					line.text.length() > 20 ? line.text.substring(0, 20) : line.text, Math.min(shownN, text == null ? 0 : text.total), text == null ? 0 : text.total, realT, typedRealT > 0 ? Math.min(shownN, text == null ? 0 : text.total) / typedRealT : 0f, typing, speed, effect, fxDur, fxT,
					text == null ? 0 : text.tracking, text == null ? 0 : text.lineExtra, text == null ? 0 : text.width(), text == null ? 0 : text.height(), choices.size(), choiceOpen, done);
		}
		/** 대사 완성 (테스트 플레이): 글자 · 연출을 바로 끝까지 — 창은 그대로 (입력을 기다림) */
		public void complete() {
			if (typing) finishTyping();
			for (int k = 0; k < t0.length; k++) t0[k] = Math.min(t0[k], fxT - 100f);
			if (!choices.isEmpty() && !choiceOpen) openChoices();
		}
		/** 다음 대사 (테스트 플레이): 완성한 뒤 닫음 — 선택지가 있으면 선택지를 열기만 (사람이 고름) */
		public void next() {
			if (done) return;
			complete();
			if (!choices.isEmpty()) return;
			hide();
		}
		void finishTyping() {
			typing = false;
			if (text != null) revealAll(Integer.MAX_VALUE);
			if (!choices.isEmpty()) openChoices();
			else if (arrow != null) arrow.visible = true;
		}

		float autoT = 0, skipT = 0, realT = 0, typedRealT = 0;   // realT · typedRealT = 실제로 지난 시간 (배속과 무관 — 자동 테스트가 배속을 잼)
		@Override public void update() {
			super.update();
			fxT += Game.elapsed;
			realT += Game.elapsed / Math.max(0.0001f, Game.timeScale);
			if (typing) typedRealT = realT;
			// 테스트 플레이 스킵 (MakerTestEnv): 글자를 다 보이고 잠깐 뒤 넘김 — 선택지는 열기만 (고르지 않음)
			if (MakerCutscene.skipping() && !done) {
				complete();
				if (choices.isEmpty()) { skipT += Game.elapsed / Math.max(0.0001f, Game.timeScale); if (skipT >= 0.05f) { hide(); return; } }
			}
			if (!typing && !done && line.auto > 0 && choices.isEmpty()) { autoT += Game.elapsed; if (autoT >= line.auto) advance(); }   // 저절로 넘기기 (시간은 실제 지난 시간)
			if (typing && text != null) {
				shown += speed * Game.elapsed;
				int n = (int) shown;
				revealAll(n);
				if (sound != null && !sound.isEmpty() && n >= lastSound + soundEvery) { lastSound = n; MakerAudio.playSe(sound); }
				if (n >= text.total) finishTyping();
			}
			applyFx();
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

		// ---- 배치 검사 (자동 테스트 tools/playtest "layout") — 화면 크기 · 비율 · 안전 영역마다 잘리는 것이 없는지 ----
		static String r(float x, float y, float w, float h) { return String.format(java.util.Locale.ROOT, "[%.0f,%.0f %.0fx%.0f]", x, y, w, h); }
		public String debugLayout() {
			StringBuilder b = new StringBuilder();
			if (box != null) b.append("box=").append(r(box.x, box.y, box.width(), box.height()));
			if (text != null) b.append(" text=").append(r(text.left(), text.top(), text.width(), text.height()));
			if (plate != null) b.append(" name=").append(r(plate.x, plate.y, plate.width(), plate.height()));
			if (illImg != null) b.append(" ill=").append(r(illImg.x, illImg.y, illImg.width(), illImg.height()));
			if (arrow != null) b.append(" arrow=").append(r(arrow.x, arrowY, arrow.width(), arrow.height()));
			for (Choice c : choices) b.append(" choice").append(c.index).append('=').append(r(c.left(), c.top(), c.width(), c.height()));
			return b.toString();
		}
		/** 화면 밖 · 안전 영역(노치 · 내비게이션 바) 침범 · 글이 대사창을 넘침 · 이름표/선택지가 화면 밖 — 없으면 빈 목록. 일러스트는 화면 밖으로 조금 나가도 됨(배경 그림) — 절반 넘게 나가면 문제 */
		public java.util.List<String> layoutProblems() {
			java.util.List<String> out = new java.util.ArrayList<>();
			float[] sa = safeArea(W, H);
			float e = 0.5f;
			java.util.function.BiConsumer<String, float[]> in = (n, q) -> {
				if (q[0] < -e || q[1] < -e || q[0] + q[2] > W + e || q[1] + q[3] > H + e) out.add(n + " 화면 밖 " + r(q[0], q[1], q[2], q[3]) + " 화면 " + W + "x" + H);
				else if (q[0] < sa[0] - e || q[1] < sa[1] - e || q[0] + q[2] > sa[0] + sa[2] + e || q[1] + q[3] > sa[1] + sa[3] + e) out.add(n + " 안전 영역 침범 " + r(q[0], q[1], q[2], q[3]) + " 안전 " + r(sa[0], sa[1], sa[2], sa[3]));
			};
			if (box != null) in.accept("대사창", new float[]{box.x, box.y, box.width(), box.height()});
			if (text != null && box != null) {
				in.accept("대사 글", new float[]{text.left(), text.top(), text.width(), text.height()});
				if (lay("text") == null && text.top() + text.height() > box.y + box.height() + e) out.add("대사 글이 대사창 아래로 넘침 (글 " + Math.round(text.height()) + " / 창 " + Math.round(box.height()) + ")");
				if (text.width() < 40) out.add("대사 글 폭이 너무 좁음 " + Math.round(text.width()));
			}
			if (plate != null) in.accept("이름표", new float[]{plate.x, plate.y, plate.width(), plate.height()});
			for (Choice c : choices) in.accept("선택지 " + (c.index + 1), new float[]{c.left(), c.top(), c.width(), c.height()});
			if (illImg != null) { float vis = Math.max(0, Math.min(W, illImg.x + illImg.width()) - Math.max(0, illImg.x)); if (vis < illImg.width() * 0.5f) out.add("일러스트가 절반 넘게 화면 밖 " + r(illImg.x, illImg.y, illImg.width(), illImg.height())); }
			return out;
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
