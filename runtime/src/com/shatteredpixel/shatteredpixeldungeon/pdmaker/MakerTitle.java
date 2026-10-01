/*
 * 타이틀 화면 — title.json (에디터 "타이틀 화면" 페이지)
 *   연결: TitleScene.create() 끝의 fadeIn(); 바로 앞에서 MakerTitle.apply(this)
 *   게임(원작·mod-2)이 만든 화면은 모두 숨기고, 설정대로 화면을 새로 만듦 → TitleScene 구조가 달라도 똑같이 동작
 *
 *   music      { tracks: [...] }                                      비우면 게임이 튼 음악 그대로
 *   background { archs, archDir: up|down|left|right, archSpeed, color, gradient:{color, alpha, from: top|bottom|left|right},
 *                vignette, effect: none|snow|rain|embers|sparkle|petals|fireflies|mana, effectDensity, effectColor, effectFront, effectArea: screen|logo }
 *   layers[]   { image, frame:[w,h], frames, fps, x, y, anchorX, anchorY, offsetX, offsetY, fit, scale, alpha, blend, tile,
 *                scrollX, scrollY(px/초 — 가로·세로 흐름), bob, bobSpeed, pulse, pulseSpeed, spin, front }
 *   logo       { mode: game|image|text|none, image, text, subtitle, size, color, subColor, scale, y(0~1, 0=자동), offsetY, glow, torches,
 *                anim: none|float|pulse|sway }
 *   gate       { enabled, text, color, logoAfter: fade|up|stay, idleReturn(초, 0=안 돌아감) }       "화면을 누르세요" 방식 (mod-2)
 *   buttons    { layout: game|grid|column, columns, firstWide, top(0~1, 0=자동), width, height, gap, offsetX, style,
 *                anim: { enter: none|fade|slideUp|slideDown|slideLeft|slideRight|drop|pop, duration, stagger, distance,
 *                        idle: none|bob|pulse|sway, idleAmount, idleSpeed },
 *                items: [{ id, label, visible, icon, action: newgame|continue|scene|text|url|quit, scene, title, text, url, custom }] }
 *   version    { visible, text }     exit { visible }
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.GamesInProgress;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.effects.BannerSprites;
import com.shatteredpixel.shatteredpixeldungeon.effects.Fireball;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.TitleScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.ExitButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndSettings;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndTitledMessage;
import com.watabou.gltextures.TextureCache;
import com.watabou.glwrap.Blending;
import com.watabou.input.PointerEvent;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Camera;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Game;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Group;
import com.watabou.noosa.Image;
import com.watabou.noosa.PointerArea;
import com.watabou.noosa.SkinnedBlock;
import com.watabou.noosa.TextureFilm;
import com.watabou.noosa.Visual;
import com.watabou.noosa.particles.Emitter;
import com.watabou.utils.DeviceCompat;
import com.watabou.utils.Random;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MakerTitle {

	static final String[] IDS = { "play", "support", "rankings", "journal", "news", "changes", "settings", "about" };
	static final String[] KEYS = { "enter", "support", "rankings", "journal", "news", "changes", "settings", "about" };
	static final String[] ICONS = { "ENTER", "GOLD", "RANKINGS", "JOURNAL", "NEWS", "CHANGES", "PREFS", "SHPX" };

	/** 다른 화면(랭킹 등)에서 돌아오면 "화면을 누르세요" 없이 바로 메뉴 */
	static boolean showMenuOnStart = false;
	static MakerTitle current;

	public static void apply(TitleScene scene) {
		try {
			if (!MakerRuntime.isActive()) return;
			JsonValue d = MakerRuntime.title;
			if (d == null || !d.getBoolean("enabled", true)) return;
			current = new MakerTitle(scene, d);
			current.build();
		} catch (Throwable t) {
			MakerRuntime.log("타이틀 화면 설정 오류: " + t);
			t.printStackTrace();
		}
	}

	final TitleScene scene; final JsonValue d;
	final int w, h;
	final boolean land;
	Root root;

	MakerTitle(TitleScene scene, JsonValue d) {
		this.scene = scene; this.d = d;
		w = Camera.main.width; h = Camera.main.height;
		land = PixelScene.landscape();
	}
	JsonValue obj(String k) { JsonValue v = d.get(k); return v == null ? new JsonValue(JsonValue.ValueType.object) : v; }

	// ------------------------------------------------------------ 만들기

	@SuppressWarnings("unchecked")
	void build() throws Exception {
		// 1) 게임이 만든 화면 숨기기 (입력 영역은 없앰)
		java.lang.reflect.Field f = Group.class.getDeclaredField("members");
		f.setAccessible(true);
		for (Gizmo g : new ArrayList<>((ArrayList<Gizmo>) f.get(scene))) {
			if (g == null) continue;
			if (g instanceof PointerArea) { scene.remove(g); g.destroy(); continue; }
			g.visible = false; g.active = false;
			hideInputs(g, f);
		}
		music();
		root = new Root();
		scene.add(root);
	}
	@SuppressWarnings("unchecked")
	static void hideInputs(Gizmo g, java.lang.reflect.Field f) throws Exception {
		if (!(g instanceof Group)) return;
		for (Gizmo c : new ArrayList<>((ArrayList<Gizmo>) f.get(g))) {
			if (c instanceof PointerArea) c.active = false;
			hideInputs(c, f);
		}
	}

	void music() {
		JsonValue m = d.get("music");
		if (m == null || m.get("tracks") == null || m.get("tracks").size == 0) return;
		List<String> l = new ArrayList<>();
		for (JsonValue t : m.get("tracks")) if (!t.asString().isEmpty()) l.add(t.asString());
		if (l.isEmpty()) return;
		if (l.size() == 1 && l.get(0).equals("none")) { com.watabou.noosa.audio.Music.INSTANCE.end(); return; }
		MakerAudio.playList(l);
	}

	static int color(String s, int def) {
		try { s = s.trim(); if (s.startsWith("#")) s = s.substring(1); if (s.length() == 3) s = "" + s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2); return (int) Long.parseLong(s, 16) & 0xFFFFFF; }
		catch (Exception e) { return def; }
	}
	static float ease(float t) { t = Math.max(0, Math.min(1, t)); return 1 - (1 - t) * (1 - t) * (1 - t); }          // easeOutCubic
	static float back(float t) { t = Math.max(0, Math.min(1, t)); float c = 1.70158f; return 1 + (c + 1) * (float) Math.pow(t - 1, 3) + c * (float) Math.pow(t - 1, 2); }

	/** 화면 전체: 상태(탭 전 / 메뉴) · 애니메이션 */
	class Root extends Group {
		final JsonValue bg = obj("background"), lg = obj("logo"), gate = obj("gate"), bs = obj("buttons");
		final JsonValue anim = bs.get("anim") == null ? new JsonValue(JsonValue.ValueType.object) : bs.get("anim");
		final boolean gateOn = gate.getBoolean("enabled", false);
		// 로고
		Visual logo; Image glow; final List<Visual> logoParts = new ArrayList<>(); final List<Fireball> torches = new ArrayList<>();
		float logoBaseX, logoBaseY, logoW, logoH;
		RenderedTextBlock prompt;
		Emitter manaBack, manaFront;
		// 버튼
		final List<Btn> btns = new ArrayList<>();
		// 상태
		boolean revealed; float revealT = 0, btnClock = 0, returnT = 0, idleT = 0, t = 0; boolean returning = false;

		Root() {
			revealed = !gateOn || showMenuOnStart;
			// 배경 (메뉴 화면과 같은 코드)
			addBackground(this, d, w, h, true);
			buildLogo();
			effect(false);
			if (d.get("layers") != null) for (JsonValue l : d.get("layers")) if (l.getBoolean("front", false)) { Layer ly = Layer.make(l, w, h); if (ly != null) add(ly); }
			effect(true);
			// 입력: 탭 → 메뉴, 아무 입력 → 대기 시간 초기화
			add(new PointerArea(0, 0, w, h) {
				@Override protected void onPointerDown(PointerEvent e) { idleT = 0; }
				@Override protected void onClick(PointerEvent e) {
					idleT = 0;
					if (!revealed && !returning) { revealed = true; revealT = 0; btnClock = 0; }
				}
			});
			if (gateOn) {
				prompt = PixelScene.renderTextBlock(gate.getString("text", "화면을 누르세요"), 8);
				prompt.hardlight(color(gate.getString("color", "#dddddd"), 0xDDDDDD));
				add(prompt);
			}
			buildButtons();
			JsonValue v = d.get("version");
			if (v == null || v.getBoolean("visible", true)) {
				String txt = v == null ? "" : v.getString("text", "");
				if (txt.isEmpty()) {
					BitmapText vt = new BitmapText("v" + Game.version, PixelScene.pixelFont); vt.measure(); vt.hardlight(0x888888);
					vt.x = w - vt.width() - 4; vt.y = h - vt.height() - 2; add(vt);
				} else {
					RenderedTextBlock vt = PixelScene.renderTextBlock(txt, 6); vt.hardlight(0x888888);
					vt.setPos(w - vt.width() - 4, h - vt.height() - 2); add(vt);
				}
			}
			JsonValue ex = d.get("exit");
			if (DeviceCompat.isDesktop() && (ex == null || ex.getBoolean("visible", true))) { ExitButton b = new ExitButton(); b.setPos(w - b.width(), 0); add(b); }
			if (revealed && gateOn) { revealT = 1; btnClock = 0; }
			step(0);
		}

		void buildLogo() {
			String mode = lg.getString("mode", "game");
			float sc = lg.getFloat("scale", 1f);
			Visual main = null;
			switch (mode) {
				case "none": break;
				case "image": {
					Object tx = MakerRuntime.texture(lg.getString("image", ""));
					if (tx != null) { Image im = new Image(tx); im.scale.set(sc); main = im; }
					break;
				}
				case "text": {
					RenderedTextBlock t = PixelScene.renderTextBlock(lg.getString("text", "").replace("\\n", "\n"), Math.max(6, lg.getInt("size", 16)));
					t.hardlight(color(lg.getString("color", "#ffd966"), 0xFFD966));
					t.align(RenderedTextBlock.CENTER_ALIGN);
					logoText = t;
					break;
				}
				default: {
					Image im = BannerSprites.get(land ? BannerSprites.Type.TITLE_LAND : BannerSprites.Type.TITLE_PORT);
					im.scale.set(sc); main = im;
					if (lg.getBoolean("glow", true)) {
						glow = new Image(BannerSprites.get(land ? BannerSprites.Type.TITLE_GLOW_LAND : BannerSprites.Type.TITLE_GLOW_PORT)) {
							@Override public void draw() { Blending.setLightMode(); super.draw(); Blending.setNormalMode(); }
						};
						glow.scale.set(sc);
					}
				}
			}
			if (main != null) { main.origin.set(0, 0); add(main); logoParts.add(main); logo = main; logoW = main.width(); logoH = main.height(); }
			if (logoText != null) { add(logoText); logoW = logoText.width(); logoH = logoText.height(); }
			String sub = lg.getString("subtitle", "");
			if (!sub.isEmpty() && mode.equals("text")) {
				subText = PixelScene.renderTextBlock(sub, 8);
				subText.hardlight(color(lg.getString("subColor", "#cccccc"), 0xCCCCCC));
				add(subText); logoH += subText.height() + 3;
			}
			if (glow != null) { glow.origin.set(0, 0); add(glow); }
			// 위치: y(0~1) 가 있으면 그 높이, 없으면 탭 방식은 화면 가운데, 아니면 원작처럼 위쪽
			float topRegion = Math.max(logoH - 6, h * 0.45f);
			float cy = lg.getFloat("y", 0) > 0 ? lg.getFloat("y", 0) * h : (gateOn ? h / 2f - 8 : 2 + topRegion / 2f);
			logoBaseX = (w - logoW) / 2f + lg.getFloat("offsetX", 0); logoBaseY = cy - logoH / 2f + lg.getFloat("offsetY", 0);
			if (mode.equals("game") && lg.getBoolean("torches", true)) {
				float[][] pts = land ? new float[][]{{30, 35}, {logoW / sc - 30, 35}} : new float[][]{{16, 70}, {logoW / sc - 16, 70}};
				for (float[] p : pts) { Fireball fb = new Fireball(); fb.x = logoBaseX + p[0] * sc - fb.width() / 2f; fb.y = logoBaseY + p[1] * sc - fb.height(); add(fb); torches.add(fb); }
			}
		}
		RenderedTextBlock logoText, subText;

		void effect(boolean front) {
			String eff = bg.getString("effect", "none");
			if (eff.equals("none") || eff.isEmpty() || bg.getBoolean("effectFront", false) != front) return;
			boolean aroundLogo = bg.getString("effectArea", "screen").equals("logo");
			if (eff.equals("mana")) {
				// mod-2 의 마나 반딧불 (없으면 일반 반딧불)
				try {
					Class<?> c = Class.forName("com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaBuffFireflyParticle$LayerFactory");
					Emitter e = new Emitter(); e.autoKill = false;
					e.pour((Emitter.Factory) c.getConstructor(float.class, float.class).newInstance(1.15f, 0.95f), 0.08f / Math.max(0.1f, bg.getFloat("effectDensity", 1f)));
					add(e); if (front) manaFront = e; else manaBack = e;
					return;
				} catch (Throwable ignored) { eff = "fireflies"; }
			}
			Weather wz = new Weather(eff, bg.getFloat("effectDensity", 1f), bg.getString("effectColor", ""), w, h);
			if (aroundLogo) wz.area(logoBaseX - logoW * 0.3f, logoBaseY - logoH * 0.3f, logoW * 1.6f, logoH * 1.6f);
			add(wz);
		}

		// ---------------- 버튼
		class Btn { StyledButton b; float x, y, bw, bh; int i; }
		void buildButtons() {
			Map<String, JsonValue> items = new LinkedHashMap<>();
			if (bs.get("items") != null) for (JsonValue it : bs.get("items")) items.put(it.getString("id", ""), it);
			List<String> order = new ArrayList<>(items.keySet());
			for (String id : IDS) if (!items.containsKey(id)) order.add(id);
			Chrome.Type style = Chrome.Type.GREY_BUTTON_TR;
			try { if (!bs.getString("style", "").isEmpty()) style = Chrome.Type.valueOf(bs.getString("style", "")); } catch (Exception ignored) { }
			List<StyledButton> made = new ArrayList<>(); List<String> ids = new ArrayList<>();
			for (String id : order) {
				final JsonValue it = items.get(id);
				if (it != null && !it.getBoolean("visible", true)) continue;
				int gi = java.util.Arrays.asList(IDS).indexOf(id);
				if (gi < 0 && (it == null || (!it.getBoolean("custom", false) && !it.has("action")))) continue;
				String label = it == null ? "" : it.getString("label", "");
				if (label.isEmpty() && gi >= 0) label = Messages.get(TitleScene.class, KEYS[gi]);
				final String gameId = gi >= 0 ? id : null;
				StyledButton b = new StyledButton(style, label) {
					@Override protected void onClick() {
						idleT = 0;
						if (it != null && !it.getString("action", "").isEmpty()) action(it); else if (gameId != null) gameAction(gameId);
					}
				};
				String icon = it == null ? "" : it.getString("icon", "");
				if (icon.isEmpty() && gi >= 0) icon = ICONS[gi];
				if (!icon.isEmpty() && !icon.equals("NONE")) { try { b.icon(Icons.get(Icons.valueOf(icon))); } catch (Exception ignored) { } }
				made.add(b); ids.add(id);
				add(b);
			}
			layout(made, ids);
		}
		void layout(List<StyledButton> made, List<String> ids) {
			String layout = bs.getString("layout", "game");
			float bh = bs.getInt("height", 20), gap = bs.getInt("gap", 3);
			float aw = bs.getInt("width", 0) > 0 ? bs.getInt("width", 0) : (land ? PixelScene.MIN_WIDTH_L - 6 : PixelScene.MIN_WIDTH_P - 2);
			aw = Math.min(aw, w - 4);
			float left = (w - aw) / 2f + bs.getFloat("offsetX", 0);
			int n = made.size();
			float top;
			float logoBottom = logoBaseY + logoH;
			boolean center = gateOn && gate.getString("logoAfter", "fade").equals("fade");
			if (layout.equals("game")) {
				// 원작 배치 (가로: 2칸 + 3칸×2, 세로: 1+1+2×3)
				float topRegion = Math.max(logoBottom - 2, h * 0.45f);
				int GAP = (int) (h - topRegion - (land ? 3 : 4) * bh) / 3; GAP /= land ? 3 : 5; GAP = Math.max(GAP, 2);
				top = bs.getFloat("top", 0) > 0 ? bs.getFloat("top", 0) * h : (center ? (h - (land ? 3 : 5) * (bh + GAP)) / 2f : topRegion + GAP);
				int[] perRow = land ? new int[]{2, 3, 3} : new int[]{1, 1, 2, 2, 2};
				int i = 0, row = 0; float y = top;
				while (i < n) {
					int cols = row < perRow.length ? perRow[row] : (land ? 3 : 2);
					cols = Math.min(cols, n - i);
					float cw = (aw - (cols - 1) * 2) / cols;
					for (int c = 0; c < cols; c++, i++) put(made.get(i), i, left + c * (cw + 2), y, cw, bh);
					y += bh + GAP; row++;
				}
				return;
			}
			int cols = layout.equals("column") ? 1 : Math.max(1, bs.getInt("columns", land ? 3 : 2));
			boolean firstWide = bs.getBoolean("firstWide", false) && cols > 1;
			int rows = firstWide ? 1 + (int) Math.ceil((n - 1) / (float) cols) : (int) Math.ceil(n / (float) cols);
			float blockH = rows * bh + (rows - 1) * gap;
			if (layout.equals("column") && bs.getInt("width", 0) <= 0) { aw = Math.min(120, w - 4); left = (w - aw) / 2f + bs.getFloat("offsetX", 0); }
			top = bs.getFloat("top", 0) > 0 ? bs.getFloat("top", 0) * h : (center ? (h - blockH) / 2f : Math.max(logoBottom + gap * 2, h * 0.45f));
			if (top + blockH > h - 4) top = Math.max(2, h - 4 - blockH);
			float cw = (aw - (cols - 1) * 2) / cols;
			int idx = 0; float y = top;
			for (int i = 0; i < n; i++) {
				if (i == 0 && firstWide) { put(made.get(i), i, left, y, aw, bh); y += bh + gap; continue; }
				int k = i - (firstWide ? 1 : 0), c = k % cols;
				if (c == 0 && k > 0) y += bh + gap;
				put(made.get(i), i, left + c * (cw + 2), y, cw, bh);
			}
		}
		void put(StyledButton b, int i, float x, float y, float bw, float bh) {
			Btn e = new Btn(); e.b = b; e.i = i; e.x = x; e.y = y; e.bw = bw; e.bh = bh; btns.add(e);
			b.setRect(x, y, bw, bh);
		}

		// ---------------- 매 프레임
		@Override public void update() {
			float e = Game.elapsed;
			super.update();
			step(e);
		}
		void step(float e) {
			t += e;
			if (revealed && !returning) {
				revealT = Math.min(1f, revealT + e * 2f);
				btnClock += e;
				int idle = gate.getInt("idleReturn", 15);
				if (gateOn && idle > 0) { idleT += e; if (idleT >= idle) { returning = true; returnT = 0; } }
			}
			if (returning) {
				returnT = Math.min(1f, returnT + e * 2f);
				if (returnT >= 1f) { returning = false; revealed = false; revealT = 0; btnClock = 0; idleT = 0; showMenuOnStart = false; }
			}
			// 로고
			float la = 1f, lift = 0f;
			String after = gate.getString("logoAfter", "fade");
			if (gateOn) {
				float k = returning ? 1 - returnT : (revealed ? ease(revealT) : 0);
				if (after.equals("fade")) { la = 1 - k; lift = -10 * k; }
				else if (after.equals("up")) { lift = -(logoBaseY - 4) * k; }
			}
			String la2 = lg.getString("anim", "none");
			float ax = 0, ay = 0, am = 1;
			if (la2.equals("float")) ay = (float) Math.sin(t * 1.6f) * 2f;
			else if (la2.equals("sway")) ax = (float) Math.sin(t * 1.2f) * 3f;
			else if (la2.equals("pulse")) am = 0.8f + 0.2f * (float) Math.sin(t * 2f);
			float lx = logoBaseX + ax, ly = logoBaseY + lift + ay;
			if (logo != null) { logo.x = lx; logo.y = ly; logo.alpha(la * am); logo.visible = la > 0.01f; }
			if (glow != null) { glow.x = lx; glow.y = ly; glow.alpha(la * (0.8f + 0.2f * (float) Math.sin(t * 2f))); glow.visible = la > 0.01f; }
			if (logoText != null) { logoText.setPos(w / 2f - logoText.width() / 2f + ax, ly); logoText.alpha(la * am); logoText.visible = la > 0.01f; }
			if (subText != null && logoText != null) { subText.setPos(w / 2f - subText.width() / 2f + ax, logoText.bottom() + 3); subText.alpha(la); subText.visible = la > 0.01f; }
			for (Fireball fb : torches) { fb.visible = la > 0.3f; }
			for (Emitter em : new Emitter[]{manaBack, manaFront}) if (em != null) {
				em.on = la > 0.02f || bg.getString("effectArea", "logo").equals("screen");
				float cx = lx + logoW / 2f, cy = ly + logoH / 2f, sp = em == manaBack ? 1.6f : 1.3f;
				if (bg.getString("effectArea", "logo").equals("screen")) em.pos(Random.Float(w), Random.Float(h));
				else em.pos(cx + Random.Float(-1, 1) * logoW / 2f * sp, cy + Random.Float(-1, 1) * logoH / 2f * sp);
			}
			if (prompt != null) {
				prompt.setPos((w - prompt.width()) / 2f, Math.min(h - prompt.height() - 12, logoBaseY + logoH + 12));
				float pa = (revealed && !returning) ? 1 - ease(revealT * 2) : (returning ? returnT : 1);
				prompt.alpha(pa * (gate.getBoolean("blink", true) ? 0.55f + 0.45f * (float) Math.sin(t * 3f) : 1f));
				prompt.visible = pa > 0.01f;
			}
			// 버튼
			String enter = anim.getString("enter", gateOn ? "slideUp" : "none");
			float dur = Math.max(0.05f, anim.getFloat("duration", 0.6f)), stag = anim.getFloat("stagger", 0.08f), dist = anim.getFloat("distance", 24f);
			String idle = anim.getString("idle", "none");
			float amt = anim.getFloat("idleAmount", 2f), spd = anim.getFloat("idleSpeed", 1f);
			float clock = gateOn ? btnClock : t;
			for (Btn b : btns) {
				float a;
				if (!revealed && !returning && gateOn) a = 0;
				else if (enter.equals("none")) a = 1;
				else a = Math.max(0, Math.min(1, (clock - b.i * stag) / dur));
				float out = returning ? returnT : 0;
				float k = ease(a), dx = 0, dy = 0, bw = b.bw;
				switch (enter) {
					case "slideUp": dy = dist * (1 - k); break;
					case "slideDown": dy = -dist * (1 - k); break;
					case "slideLeft": dx = dist * (1 - k); break;
					case "slideRight": dx = -dist * (1 - k); break;
					case "drop": dy = -dist * (1 - back(a)); k = Math.min(1, a * 2); break;
					case "pop": bw = b.bw * (0.6f + 0.4f * back(a)); k = Math.min(1, a * 2); break;
				}
				dy += dist * 0.5f * out;
				float alpha = (enter.equals("none") ? 1 : k) * (1 - out);
				if (a >= 1 && !returning) {
					float ph = t * spd * 2.5f + b.i * 0.7f;
					if (idle.equals("bob")) dy += (float) Math.sin(ph) * amt;
					else if (idle.equals("sway")) dx += (float) Math.sin(ph) * amt;
					else if (idle.equals("pulse")) alpha *= 0.8f + 0.2f * (float) Math.sin(ph);
				}
				b.b.setRect(b.x + dx + (b.bw - bw) / 2f, b.y + dy, bw, b.bh);
				PixelScene.align(b.b);
				b.b.alpha(alpha);
				b.b.visible = alpha > 0.01f;
				b.b.active = alpha > 0.5f;
			}
		}
	}

	// ------------------------------------------------------------ 동작

	void gameAction(String id) {
		showMenuOnStart = true;
		switch (id) {
			case "play":
				if (GamesInProgress.checkAll().size() == 0) {
					GamesInProgress.selectedClass = null; GamesInProgress.curSlot = 1;
					ShatteredPixelDungeon.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.HeroSelectScene.class);
				} else ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.StartScene.class);
				break;
			case "support": ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.SupporterScene.class); break;
			case "rankings": ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.RankingsScene.class); break;
			case "journal": ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.JournalScene.class); break;
			case "news": ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.NewsScene.class); break;
			case "changes": com.shatteredpixel.shatteredpixeldungeon.scenes.ChangesScene.changesSelected = 0; ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.ChangesScene.class); break;
			case "settings": scene.add(new WndSettings()); break;
			default: ShatteredPixelDungeon.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.AboutScene.class);
		}
	}
	void action(JsonValue it) {
		String a = it.getString("action", "text");
		switch (a) {
			case "newgame":
				showMenuOnStart = true;
				GamesInProgress.selectedClass = null; GamesInProgress.curSlot = 1;
				ShatteredPixelDungeon.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.HeroSelectScene.class); break;
			case "continue":
				showMenuOnStart = true;
				ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.StartScene.class); break;
			case "scene": gameAction(it.getString("scene", "about")); break;
			case "url": { String u = it.getString("url", ""); if (!u.isEmpty()) ShatteredPixelDungeon.platform.openURI(u); break; }
			case "quit": Game.instance.finish(); break;
			default: {
				String title = it.getString("title", it.getString("label", ""));
				scene.add(new WndTitledMessage(Icons.get(Icons.INFO), title, it.getString("text", "").replace("\\n", "\n")));
			}
		}
	}

	// ------------------------------------------------------------ 배경 (타이틀·메뉴 화면 공용)

	/** 게임 배경 방식: game = 게임의 Archs 그대로(mod-2: 숲·탑 10겹 시차 배경, 원작: 아치), classic = 원작 아치 그림(방향·속도·그림 바꾸기), none */
	static String archStyle(JsonValue bg) {
		if (!bg.getBoolean("archs", true)) return "none";
		return bg.getString("archStyle", "game");
	}
	/** 배경을 g 에 추가: 색 · 게임 배경 · 그라데이션 · (뒤)레이어 · 아래쪽 어둡게 · (메뉴) 입자 */
	static void addBackground(Group g, JsonValue d, int w, int h, boolean title) {
		JsonValue bg = d.get("background") == null ? new JsonValue(JsonValue.ValueType.object) : d.get("background");
		JsonValue menus = d.get("menus") == null ? new JsonValue(JsonValue.ValueType.object) : d.get("menus");
		String col = bg.getString("color", "");
		if (!col.isEmpty()) g.add(new ColorBlock(w, h, 0xFF000000 | color(col, 0)));
		switch (archStyle(bg)) {
			case "game": {
				com.shatteredpixel.shatteredpixeldungeon.ui.Archs a = new com.shatteredpixel.shatteredpixeldungeon.ui.Archs();
				a.setSize(w, h);
				a.reversed = bg.getBoolean("archReverse", false);
				g.add(a);
				break;
			}
			case "classic": {
				JsonValue im = bg.get("archImages");
				g.add(new Arcs(w, h, bg.getString("archDir", "up"), bg.getFloat("archSpeed", 20f), im == null ? "" : im.getString("bg", ""), im == null ? "" : im.getString("fg", "")));
				break;
			}
		}
		JsonValue gr = bg.get("gradient");
		if (gr != null && gr.isObject() && gr.getBoolean("enabled", true) && !gr.getString("color", "").isEmpty()) g.add(gradient(gr, w, h));
		if ((title || menus.getBoolean("layers", true)) && d.get("layers") != null)
			for (JsonValue l : d.get("layers")) if (!l.getBoolean("front", false) && (title || !l.getBoolean("titleOnly", false))) { Layer ly = Layer.make(l, w, h); if (ly != null) g.add(ly); }
		if (bg.getBoolean("vignette", false)) {
			Image dark = new Image(TextureCache.createGradient(0x00000000, 0x22000000, 0x55000000, 0x99000000, 0xEE000000));
			dark.angle = 90; dark.x = w; dark.scale.x = h / 5f; dark.scale.y = w;
			g.add(dark);
		}
		if (!title && menus.getBoolean("effect", false)) {
			String eff = bg.getString("effect", "none");
			if (eff.equals("mana")) eff = "fireflies";
			if (!eff.equals("none") && !eff.isEmpty()) g.add(new Weather(eff, bg.getFloat("effectDensity", 1f), bg.getString("effectColor", ""), w, h));
		}
	}
	static Group gradient(JsonValue gr, int w, int h) {
		Group g = new Group();
		int c = color(gr.getString("color", "#0b1b3a"), 0x0B1B3A);
		float a0 = gr.getFloat("alpha", 0.55f);
		String from = gr.getString("from", "top");
		boolean vert = from.equals("top") || from.equals("bottom");
		final int STEPS = 36;
		float len = vert ? h : w, step = (float) Math.ceil(len / STEPS);
		for (int i = 0; i < STEPS; i++) {
			ColorBlock s = vert ? new ColorBlock(w, step, 0xFF000000 | c) : new ColorBlock(step, h, 0xFF000000 | c);
			float k = (float) i / (STEPS - 1);
			s.alpha(a0 * (1 - k));
			int pos = (from.equals("bottom") || from.equals("right")) ? STEPS - 1 - i : i;
			if (vert) { s.x = 0; s.y = pos * step; } else { s.x = pos * step; s.y = 0; }
			g.add(s);
		}
		return g;
	}



	/** 원작 Archs 와 같은 그림(arcs1 뒤 · arcs2 앞, 앞이 2배 빠름)을 원하는 방향으로 흘림 */
	static class Arcs extends Group {
		final SkinnedBlock bgb, fgb; final float vx, vy;
		Arcs(int w, int h, String dir, float speed, String bgImg, String fgImg) {
			Object tb = bgImg == null || bgImg.isEmpty() ? null : MakerRuntime.texture(bgImg);
			Object tf = fgImg == null || fgImg.isEmpty() ? null : MakerRuntime.texture(fgImg);
			bgb = new SkinnedBlock(w, h, tb != null ? tb : Assets.Interfaces.ARCS_BG);
			fgb = new SkinnedBlock(w, h, tf != null ? tf : Assets.Interfaces.ARCS_FG);
			add(bgb); add(fgb);
			float s = speed;
			switch (dir) {
				case "down": vx = 0; vy = s; break;
				case "left": vx = -s; vy = 0; break;
				case "right": vx = s; vy = 0; break;
				default: vx = 0; vy = -s;          // up (원작)
			}
			bgb.offsetTo(bgb.texture.width / 4f - (w % bgb.texture.width) / 2f, 0);
			fgb.offsetTo(fgb.texture.width / 4f - (w % fgb.texture.width) / 2f, 0);
		}
		@Override public void update() {
			super.update();
			float e = Game.elapsed;
			// offset 은 그림 쪽이 움직이는 반대 방향
			bgb.offset(-vx * e, -vy * e);
			fgb.offset(-vx * e * 2, -vy * e * 2);
		}
	}

	/** 그림 레이어: 한 장 · 스프라이트 시트 애니메이션 · 반복 타일 스크롤 (가로·세로) */
	static class Layer extends Group {
		JsonValue l; Image img; SkinnedBlock tile; TextureFilm film; int[] frames; float fps;
		float t = 0, bx, by, baseAlpha, bob, bobSpeed, pulse, pulseSpeed, spin, sx, sy;
		boolean light;

		static Layer make(JsonValue l, int w, int h) {
			Object tx = MakerRuntime.texture(l.getString("image", ""));
			if (tx == null) return null;
			Layer ly = new Layer(); ly.l = l;
			ly.light = "light".equals(l.getString("blend", "normal"));
			ly.baseAlpha = l.getFloat("alpha", 1f);
			ly.bob = l.getFloat("bob", 0); ly.bobSpeed = l.getFloat("bobSpeed", 1);
			ly.pulse = l.getFloat("pulse", 0); ly.pulseSpeed = l.getFloat("pulseSpeed", 1);
			ly.spin = l.getFloat("spin", 0);
			ly.sx = l.getFloat("scrollX", 0); ly.sy = l.getFloat("scrollY", 0);
			final boolean li = ly.light;
			if (l.getBoolean("tile", false)) {
				SkinnedBlock b = new SkinnedBlock(w, h, tx) {
					@Override public void draw() { if (li) Blending.setLightMode(); super.draw(); if (li) Blending.setNormalMode(); }
				};
				float sc = l.getFloat("scale", 1f);
				b.scale(sc, sc); b.size(w / sc, h / sc); b.alpha(ly.baseAlpha);
				ly.tile = b; ly.add(b);
				return ly;
			}
			Image im = new Image(tx) {
				@Override public void draw() { if (li) Blending.setLightMode(); super.draw(); if (li) Blending.setNormalMode(); }
			};
			JsonValue fr = l.get("frame");
			int fw = fr != null && fr.size >= 2 ? fr.getInt(0) : 0, fh = fr != null && fr.size >= 2 ? fr.getInt(1) : 0;
			if (fw > 0 && fh > 0) {
				ly.film = new TextureFilm(im.texture, fw, fh);
				JsonValue fs = l.get("frames");
				ly.frames = fs != null && fs.size > 0 ? fs.asIntArray() : new int[]{0};
				ly.fps = Math.max(0.1f, l.getFloat("fps", 6));
				im.frame(ly.film.get(ly.frames[0]));
			}
			float iw = im.width, ih = im.height, sc = l.getFloat("scale", 1f);
			switch (l.getString("fit", "none")) {
				case "cover": im.scale.set(Math.max(w / iw, h / ih) * sc); break;
				case "contain": im.scale.set(Math.min(w / iw, h / ih) * sc); break;
				case "width": im.scale.set(w / iw * sc); break;
				case "height": im.scale.set(h / ih * sc); break;
				case "stretch": im.scale.set(w / iw * sc, h / ih * sc); break;
				default: im.scale.set(sc);
			}
			im.origin.set(iw / 2f, ih / 2f);
			float dw = iw * im.scale.x, dh = ih * im.scale.y;
			ly.bx = l.getFloat("x", 0.5f) * w - l.getFloat("anchorX", 0.5f) * dw + l.getFloat("offsetX", 0) + (dw - iw) / 2f;
			ly.by = l.getFloat("y", 0.5f) * h - l.getFloat("anchorY", 0.5f) * dh + l.getFloat("offsetY", 0) + (dh - ih) / 2f;
			ly.w = w; ly.h = h; ly.dw = dw; ly.dh = dh;
			im.x = ly.bx; im.y = ly.by; im.alpha(ly.baseAlpha);
			ly.img = im; ly.add(im);
			return ly;
		}
		int w, h; float dw, dh;

		@Override public void update() {
			super.update();
			float e = Game.elapsed; t += e;
			if (tile != null) {
				tile.offset(-sx * e / Math.max(0.01f, tile.scale.x), -sy * e / Math.max(0.01f, tile.scale.y));
				if (pulse != 0) tile.alpha(clamp(baseAlpha + pulse * (float) Math.sin(t * pulseSpeed * 6.2832f)));
				return;
			}
			if (img == null) return;
			if (film != null && frames.length > 1) img.frame(film.get(frames[(int) (t * fps) % frames.length]));
			// 흐름: 화면 밖으로 나가면 반대편에서 다시 들어옴 (가로·세로)
			// 흐름(가로·세로): 화면 밖으로 나가면 반대편에서 다시 들어옴
			float x = bx, y = by;
			if (sx != 0) x = wrap(bx - (dw - img.width) / 2f + sx * t, dw, w) + (dw - img.width) / 2f;
			if (sy != 0) y = wrap(by - (dh - img.height) / 2f + sy * t, dh, h) + (dh - img.height) / 2f;
			img.x = x;
			img.y = y + (bob != 0 ? bob * (float) Math.sin(t * bobSpeed * 6.2832f) : 0);
			if (pulse != 0) img.alpha(clamp(baseAlpha + pulse * (float) Math.sin(t * pulseSpeed * 6.2832f)));
			if (spin != 0) img.angle = (spin * t) % 360f;
		}
		static float clamp(float a) { return Math.max(0, Math.min(1, a)); }
		/** 보이는 왼쪽(위) 좌표를 [-크기, 화면] 안으로 되감기 */
		static float wrap(float v, float size, float screen) { float span = screen + size; return ((v + size) % span + span) % span - size; }
	}

	/** 날씨·입자 효과 (화면 전체 또는 로고 주변) */
	static class Weather extends Group {
		final String type; int ax = 0, ay = 0, aw, ah; final int col;
		final List<float[]> ps = new ArrayList<>();
		final List<ColorBlock> blocks = new ArrayList<>();
		float t = 0;
		Weather(String type, float density, String color, int w, int h) {
			this.type = type; aw = w; ah = h;
			int def;
			switch (type) {
				case "rain": def = 0x8FB8FF; break;
				case "embers": def = 0xFF8A2A; break;
				case "sparkle": def = 0xFFF4A0; break;
				case "petals": def = 0xFFA8C8; break;
				case "fireflies": def = 0xC8FF6A; break;
				default: def = 0xFFFFFF;
			}
			col = color(color, def);
			int n = Math.max(1, Math.round((type.equals("rain") ? 70 : type.equals("fireflies") ? 18 : 45) * Math.max(0.1f, density)));
			for (int i = 0; i < n; i++) {
				float[] p = new float[6];
				spawn(p, true);
				ps.add(p);
				ColorBlock b = new ColorBlock(1, 1, 0xFF000000 | col);
				if (type.equals("rain")) b.size(1, 4); else if (type.equals("petals")) b.size(2, 1); else b.size(p[5], p[5]);
				blocks.add(b); add(b);
			}
		}
		void area(float x, float y, float w, float h) {
			ax = (int) x; ay = (int) y; aw = Math.max(8, (int) w); ah = Math.max(8, (int) h);
			for (float[] p : ps) spawn(p, true);
		}
		void spawn(float[] p, boolean anywhere) {
			p[0] = ax + Random.Float(aw); p[4] = Random.Float(6.28f); p[5] = Random.Int(3) == 0 ? 2 : 1;
			switch (type) {
				case "rain": p[1] = anywhere ? ay + Random.Float(ah) : ay - 5; p[2] = -20; p[3] = Random.Float(160, 220); break;
				case "embers": p[1] = anywhere ? ay + Random.Float(ah) : ay + ah + 2; p[2] = Random.Float(-6, 6); p[3] = -Random.Float(10, 25); break;
				case "petals": p[1] = anywhere ? ay + Random.Float(ah) : ay - 3; p[2] = Random.Float(8, 20); p[3] = Random.Float(10, 20); break;
				case "sparkle": case "fireflies": p[1] = ay + Random.Float(ah); p[2] = Random.Float(-4, 4); p[3] = Random.Float(-4, 4); break;
				default: p[1] = anywhere ? ay + Random.Float(ah) : ay - 3; p[2] = Random.Float(-3, 3); p[3] = Random.Float(8, 18);
			}
		}
		@Override public void update() {
			super.update();
			float e = Game.elapsed; t += e;
			for (int i = 0; i < ps.size(); i++) {
				float[] p = ps.get(i); ColorBlock b = blocks.get(i);
				float wob = (float) Math.sin(t * 1.5f + p[4]);
				p[0] += (p[2] + (type.equals("snow") || type.equals("petals") ? wob * 6 : 0)) * e;
				p[1] += p[3] * e;
				if (type.equals("fireflies") || type.equals("sparkle")) {
					p[2] += Random.Float(-10, 10) * e; p[3] += Random.Float(-10, 10) * e;
					p[2] = Math.max(-8, Math.min(8, p[2])); p[3] = Math.max(-8, Math.min(8, p[3]));
					if (p[0] < ax) p[0] += aw; if (p[0] > ax + aw) p[0] -= aw; if (p[1] < ay) p[1] += ah; if (p[1] > ay + ah) p[1] -= ah;
					b.alpha(0.5f + 0.5f * (float) Math.sin(t * (type.equals("sparkle") ? 4 : 2) + p[4]));
				} else if (p[1] > ay + ah + 5 || p[1] < ay - 6 || p[0] < ax - 10 || p[0] > ax + aw + 10) spawn(p, false);
				if (type.equals("embers")) b.alpha(Math.max(0, Math.min(1, (p[1] - ay) / ah)));
				b.x = p[0]; b.y = p[1];
			}
		}
	}

	/** 테스트용: 지금 보이는 버튼 */
	public static List<String> describe() {
		List<String> out = new ArrayList<>();
		if (current == null || current.root == null) return out;
		for (Root.Btn b : current.root.btns) if (b.b.visible) out.add(b.b.text() + "@" + (int) b.b.left() + "," + (int) b.b.top() + " a" + String.format("%.2f", b.b.alpha()));
		out.add("revealed=" + current.root.revealed);
		return out;
	}
	/** 테스트용: 화면 누르기 */
	public static void tap() { if (current != null && current.root != null && !current.root.revealed) { current.root.revealed = true; current.root.revealT = 0; current.root.btnClock = 0; } }
}
