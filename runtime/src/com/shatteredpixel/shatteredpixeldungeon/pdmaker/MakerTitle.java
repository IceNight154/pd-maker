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
import com.watabou.noosa.NinePatch;
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
			if (d == null) return;
			if (!d.getBoolean("enabled", true)) { MakerAssets.titleMusic(d, false); return; }   // 원래 타이틀이어도 음악 설정은 씀
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
		// 1) 새 화면을 먼저 만듦 — 설정이 깨져 만들다 실패하면 원작 타이틀을 숨기지 않고 그대로 둠 (검은 화면이 되지 않게, 7차)
		Root made = new Root();
		// 2) 게임이 만든 화면 숨기기 (입력 영역은 없앰)
		java.lang.reflect.Field f = Group.class.getDeclaredField("members");
		f.setAccessible(true);
		for (Gizmo g : new ArrayList<>((ArrayList<Gizmo>) f.get(scene))) {
			if (g == null) continue;
			if (g.getClass().getName().startsWith("com.shatteredpixel.shatteredpixeldungeon.pdmaker.")) continue;   // PDMaker 가 붙인 것(테스트 실행 환경 표시 · 화면 돌리기 F9 등)은 그대로 (7차: 예전엔 함께 숨겨 타이틀에서 F9 가 안 됐음)
			if (g instanceof PointerArea) { scene.remove(g); g.destroy(); continue; }
			g.visible = false; g.active = false;
			hideInputs(g, f);
		}
		music();
		root = made;
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

	void music() { MakerAssets.titleMusic(d, false); }

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
		// 화면 감추기 (4.0 타이틀의 아래 화살표): 누르면 로고·버튼이 사라져 배경만 보이고, 화면을 누르면 돌아옴
		boolean uiHidden = false; float hideK = 0; com.shatteredpixel.shatteredpixeldungeon.ui.IconButton btnHide;
		float[] hoverAt;

		Root() {
			revealed = !gateOn || showMenuOnStart;
			// 배경 (메뉴 화면과 같은 코드)
			addBackground(this, d, w, h, true);
			buildElements(false);   // 7차: 요소 (로고 뒤)
			buildLogo();
			effect(false);
			if (d.get("layers") != null) for (JsonValue l : d.get("layers")) if (l.getBoolean("front", false)) { Layer ly = Layer.make(l, w, h); if (ly != null) add(ly); }
			effect(true);
			// 입력: 탭 → 메뉴, 아무 입력 → 대기 시간 초기화
			add(new PointerArea(0, 0, w, h) {
				@Override protected void onPointerDown(PointerEvent e) { idleT = 0; }
				@Override protected void onClick(PointerEvent e) {
					idleT = 0;
					if (uiHidden) { uiHidden = false; return; }
					if (!revealed && !returning) { revealed = true; revealT = 0; btnClock = 0; }
				}
			});
			if (gateOn) {
				prompt = PixelScene.renderTextBlock(gate.getString("text", "화면을 누르세요"), 8);
				prompt.hardlight(color(gate.getString("color", "#dddddd"), 0xDDDDDD));
				add(prompt);
			}
			buildButtons();
			buildElements(true);    // 7차: 요소 (버튼 위)
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
			if (d.getBoolean("hideButton", titleBgClass() != null)) {
				try {
					btnHide = new com.shatteredpixel.shatteredpixeldungeon.ui.IconButton(Icons.get(Icons.valueOf("CHEVRON"))) {
						@Override protected void onClick() { idleT = 0; uiHidden = true; }
					};
					{ Image ic = btnHide.icon(); ic.origin.set(ic.width / 2f, ic.height / 2f); ic.angle = 180f; }
					btnHide.setRect((w - 16) / 2f, h - 16, 16, 16);
					add(btnHide);
				} catch (Throwable ignored) { btnHide = null; }   // 이 아이콘이 없는 게임 버전
			}
			if (revealed && gateOn) { revealT = 1; btnClock = 0; }
			step(0);
			com.watabou.input.KeyEvent.addKeyListener(keys);   // 다 만든 뒤에 (만들다 실패하면 남지 않게)
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
					Image im = BannerSprites.get(MakerCompat.enumOf(BannerSprites.Type.class, land ? "TITLE_LAND" : "TITLE_PORT", "PIXEL_DUNGEON"));   // 예전 판(SPD 2.x)은 PIXEL_DUNGEON 하나
					im.scale.set(sc); main = im;
					if (lg.getBoolean("glow", true)) {
						glow = new Image(BannerSprites.get(MakerCompat.enumOf(BannerSprites.Type.class, land ? "TITLE_GLOW_LAND" : "TITLE_GLOW_PORT", "PIXEL_DUNGEON_SIGNS"))) {
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
				for (float[] p : pts) { Fireball fb = new Fireball(); MakerCompat.place(fb, logoBaseX + p[0] * sc - fb.width() / 2f, logoBaseY + p[1] * sc - fb.height()); add(fb); torches.add(fb); }   // 판마다 Fireball 이 MovieClip · Component
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

		// ---------------- 버튼 (7차: 목록 · 배치 = MakerTitleModel — 편집기 미리보기와 같은 식, 상태 모양 · 효과 · 키보드 포커스)
		class Btn { TitleBtn b; float x, y, bw, bh; int i; }
		final JV bsv = new JV(bs);
		final List<Btn> order = new ArrayList<>();   // 키보드 순서
		int focus = -1; boolean focusVisible = false;
		/** 게임 상태를 바꾸는 동작(새 게임 · 이어하기 · 다른 화면 · 끄기)을 이미 했음 — 연속 클릭 · 효과 중 클릭으로 두 번 실행되지 않게 */
		boolean leaving = false;
		void buildButtons() {
			List<MakerTitleModel.Entry> list = MakerTitleModel.buttonList(bsv, hasSaves(), canQuit());
			List<TitleBtn> made = new ArrayList<>();
			MakerTitleModel.Val[] places = new MakerTitleModel.Val[list.size()];
			for (int k = 0; k < list.size(); k++) {
				final MakerTitleModel.Entry en = list.get(k);
				final JsonValue it = en.item == null ? null : ((JV) en.item).v;
				String label = it == null ? "" : it.getString("label", "");
				boolean gameLabel = label.isEmpty() && en.gameIndex >= 0;
				if (gameLabel) label = Messages.get(TitleScene.class, KEYS[en.gameIndex]);
				String accent = "support".equals(en.id) && gameLabel ? String.format("#%06x", MakerTheme.or("accent", 0xFFFF44)) : null;   // 게임처럼 노란 글자
				final TitleBtn b = new TitleBtn(bsv, en.item, accent, label, it == null ? 9 : Math.max(5, gi(it, "size", 9)), en.disabled);
				b.id = en.id;
				b.click = () -> { idleT = 0; act(en.action, it, en.gameIndex >= 0 ? en.id : null, null); };
				String icon = it == null ? "" : it.getString("icon", "");
				if (icon.isEmpty() && en.gameIndex >= 0) icon = ICONS[en.gameIndex];
				if (!icon.isEmpty() && !icon.equals("NONE")) { try { b.icon(Icons.get(Icons.valueOf(icon))); } catch (Exception ignored) { } }
				places[k] = en.item == null ? null : en.item.get("place");
				made.add(b);
				add(b);
			}
			double[][] r = MakerTitleModel.buttonRects(bsv, made.size(), w, h, land, logoBaseY, logoH, new JV(gate), places);
			for (int i = 0; i < made.size(); i++) put(made.get(i), i, (float) r[i][0], (float) r[i][1], (float) r[i][2], (float) r[i][3]);
			// 키보드 순서: focusOrder 가 있으면 작은 것 먼저, 같으면 화면 순서
			order.addAll(btns);
			java.util.Collections.sort(order, (x, y) -> Double.compare(fo(x), fo(y)));
		}
		double fo(Btn b) { return b.b.item != null && b.b.item.has("focusOrder") ? b.b.item.num("focusOrder", b.i) : b.i; }
		void put(TitleBtn b, int i, float x, float y, float bw, float bh) {
			Btn e = new Btn(); e.b = b; e.i = i; e.x = x; e.y = y; e.bw = bw; e.bh = bh; btns.add(e);
			b.setRect(x, y, bw, bh);
		}

		// ---------------- 요소 (글 · 그림 — 7차)
		class El { JsonValue v; JV jv; Image img; RenderedTextBlock txt; float sw, sh, baseScale = 1, shownT; boolean wasShown; MakerTitleModel.Fx[] fx; double[] tau; String text = ""; double[] rect; }
		final List<El> els = new ArrayList<>();
		void buildElements(boolean front) {
			JsonValue list = d.get("elements");
			if (list == null || !list.isArray()) return;
			for (JsonValue e : list) {
				if (e == null || !e.isObject() || !e.getBoolean("visible", true)) continue;
				if (front != e.getString("layer", "back").equals("front")) continue;
				El el = new El(); el.v = e; el.jv = new JV(e);
				String type = e.getString("type", "");
				if (type.equals("image")) {
					Object tx = MakerRuntime.texture(e.getString("image", ""));
					if (tx == null) continue;   // 그림이 없거나 못 읽음 — 건너뜀 (편집기 검사가 알림)
					Image im = new Image(tx);
					el.baseScale = Math.max(0.01f, gf(e, "scale", 1f));
					im.scale.set(el.baseScale); im.origin.set(im.width / 2f, im.height / 2f); im.angle = gf(e, "angle", 0);
					el.sw = im.width * el.baseScale; el.sh = im.height * el.baseScale; el.img = im; add(im);
				} else if (type.equals("text")) {
					List<String> bt = MakerTitleModel.bindText(e.getString("text", ""), infoValues(), e.getString("fallback", ""));
					el.text = bt.get(0);
					RenderedTextBlock t = PixelScene.renderTextBlock(el.text.replace("\\n", "\n"), Math.max(5, gi(e, "size", 8)));
					int mw = (int) gf(e, "w", 0);
					if (mw > 0) t.maxWidth(mw);
					String al = e.getString("align", "center");
					t.align(al.equals("left") ? RenderedTextBlock.LEFT_ALIGN : al.equals("right") ? RenderedTextBlock.RIGHT_ALIGN : RenderedTextBlock.CENTER_ALIGN);
					t.hardlight(color(e.getString("color", "#ffffff"), 0xFFFFFF));
					el.sw = t.width(); el.sh = t.height(); el.txt = t; add(t);
				} else continue;
				el.fx = fxList(e.get("effects")); el.tau = new double[el.fx.length];
				els.add(el);
			}
		}
		void stepElements(float e) {
			boolean gateShowing = gateOn && (!revealed || returning);
			float[] safe = null;
			for (El el : els) {
				boolean on = MakerTitleModel.elementShown(el.jv, gateShowing);
				if (on && !el.wasShown) el.shownT = 0;
				el.wasShown = on;
				if (el.img != null) el.img.visible = on;
				if (el.txt != null) el.txt.visible = on;
				if (!on) continue;
				el.shownT += e;
				float[] area = el.v.getBoolean("safe", true) ? (safe != null ? safe : (safe = MakerDialogue.safeArea(w, h))) : new float[]{ 0, 0, w, h };
				double[] r = MakerTitleModel.elementRect(el.jv, new double[]{ area[0], area[1], area[2], area[3] }, el.sw, el.sh);
				el.rect = r;
				List<double[]> vals = new ArrayList<>();
				for (int i = 0; i < el.fx.length; i++) {
					String tr = el.fx[i].trigger;
					if (tr.equals("enter")) el.tau[i] = el.shownT; else if (tr.equals("always")) el.tau[i] = t; else continue;   // 요소는 "나타날 때" · "늘" 효과만
					vals.add(MakerTitleModel.fxValue(el.fx[i], el.tau[i]));
				}
				double[] v = MakerTitleModel.fxCombine(vals);
				float a = (float) Math.max(0, Math.min(1, gf(el.v, "alpha", 1f))) * (float) v[3] * (1 - hideK);
				if (el.txt != null) { el.txt.setPos((float) (r[4] + v[0]), (float) (r[1] + v[1])); PixelScene.align(el.txt); el.txt.alpha(a); }
				if (el.img != null) {
					float s = el.baseScale * (float) v[2];
					el.img.scale.set(s);
					el.img.x = (float) (r[0] + el.sw / 2f - el.img.width / 2f + v[0]); el.img.y = (float) (r[1] + el.sh / 2f - el.img.height / 2f + v[1]);
					el.img.alpha(a); el.img.brightness((float) v[4]);
				}
			}
		}

		// ---------------- 키보드 포커스 (화살표 · Tab = 옮기기, Enter · Space = 누르기) — 창이 떠 있으면 창이 먼저 받음
		final com.watabou.utils.Signal.Listener<com.watabou.input.KeyEvent> keys = ev -> onKey(ev);
		boolean onKey(com.watabou.input.KeyEvent ev) {
			if (!ev.pressed || leaving || !visible || anyWindow()) return false;
			int c = ev.code;
			boolean enter = c == com.badlogic.gdx.Input.Keys.ENTER || c == com.badlogic.gdx.Input.Keys.NUMPAD_ENTER || c == com.badlogic.gdx.Input.Keys.SPACE;
			boolean next = c == com.badlogic.gdx.Input.Keys.DOWN || c == com.badlogic.gdx.Input.Keys.RIGHT || c == com.badlogic.gdx.Input.Keys.TAB;
			boolean prev = c == com.badlogic.gdx.Input.Keys.UP || c == com.badlogic.gdx.Input.Keys.LEFT;
			if (!enter && !next && !prev) return false;
			idleT = 0;
			if (uiHidden) { uiHidden = false; return true; }
			if (gateOn && !revealed) { if (enter) { revealed = true; revealT = 0; btnClock = 0; } return enter; }
			if (order.isEmpty()) return false;
			if (!focusVisible || focus < 0) { focusVisible = true; focus = firstEnabled(); return true; }
			if (enter) { TitleBtn b = order.get(focus).b; if (!b.disabled && b.active) { b.onPointerDown(); b.onPointerUp(); b.onClick(); } return true; }
			int n = order.size();
			for (int k = 1; k <= n; k++) { int j = ((focus + (next ? k : -k)) % n + n) % n; if (!order.get(j).b.disabled) { focus = j; break; } }
			return true;
		}
		int firstEnabled() { for (int i = 0; i < order.size(); i++) if (!order.get(i).b.disabled) return i; return 0; }
		boolean anyWindow() {
			for (int i = 0; i < scene.length; i++) { Gizmo g = MakerDialogue.HudHider.member(scene, i); if (g instanceof com.shatteredpixel.shatteredpixeldungeon.ui.Window && g.alive) return true; }
			return false;
		}
		@Override public void destroy() { com.watabou.input.KeyEvent.removeKeyListener(keys); super.destroy(); }

		// ---------------- 매 프레임
		@Override public void update() {
			float e = Game.elapsed;
			super.update();
			step(e);
		}
		void step(float e) {
			t += e;
			hoverAt = null;
			if ((DeviceCompat.isDesktop() || debugHover != null) && !anyWindow()) {
				if (debugHover != null) hoverAt = debugHover;
				else { com.watabou.utils.PointF hp = com.watabou.input.PointerEvent.currentHoverPos(); if (hp != null) { Camera cam = camera() != null ? camera() : Camera.main; com.watabou.utils.PointF c = cam.screenToCamera((int) hp.x, (int) hp.y); hoverAt = new float[]{ c.x, c.y }; } }
			}
			stepElements(e);
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
			hideK = Math.max(0, Math.min(1, hideK + (uiHidden ? e : -e) * 2f));
			la *= 1 - hideK;
			if (btnHide != null) { boolean on = hideK < 0.5f && revealed && !returning; btnHide.visible = on; btnHide.active = on && !uiHidden; btnHide.icon().alpha(1 - hideK); }
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
			// 버튼: 묶음 등장 · 대기 애니메이션 (MakerTitleModel.groupAnim — 편집기와 같은 식)
			float clock = gateOn ? btnClock : t;
			JV anv = new JV(anim);
			for (Btn b : btns) {
				double[] g = MakerTitleModel.groupAnim(anv, gateOn, revealed, returning, returnT, clock, t, b.i, b.bw, hideK);
				float dx = (float) g[0], dy = (float) g[1], alpha = (float) g[2], bw = (float) g[3], stag = (float) g[5];
				// 7차: 상태 모양 · 효과 (MakerTitleModel — 편집기와 같은 규칙). 오버 = PC 의 실제 포인터 자리 (창이 떠 있으면 없음)
				boolean showFocus = focusVisible && focus >= 0 && focus < order.size() && order.get(focus) == b;
				b.b.hover = hoverAt != null && b.b.visible && alpha > 0.5f && hoverAt[0] >= b.b.left() && hoverAt[0] < b.b.right() && hoverAt[1] >= b.b.top() && hoverAt[1] < b.b.bottom();
				b.b.focus = showFocus;
				b.b.apply(b.x + dx + (b.bw - bw) / 2f, b.y + dy, bw, b.bh, alpha, clock - b.i * stag, t, e);
				b.b.visible = alpha > 0.01f;
				b.b.active = alpha > 0.5f && !leaving;
			}
		}
	}

	// ------------------------------------------------------------ 동작

	/** 동작이 화면을 떠나는가 (새 게임 · 이어하기 · 다른 화면 · 끄기) — 한 번 하면 다른 버튼은 무시 (연속 클릭 · 효과 도중 클릭으로 두 번 실행 안 됨) */
	static boolean leaves(String action, String gameId, JsonValue it) {
		if (action == null || action.isEmpty()) return gameId != null && !gameId.equals("settings");
		switch (action) {
			case "newgame": case "continue": case "quit": return true;
			case "scene": return !"settings".equals(it == null ? "" : it.getString("scene", "about"));
			default: return false;
		}
	}
	/** 버튼 동작 (타이틀 · 창 안 버튼 공통). from = 누른 버튼이 있는 창 (타이틀이면 null) */
	void act(String action, JsonValue it, String gameId, TitleWnd from) {
		if (root == null || root.leaving) return;
		if (leaves(action, gameId, it)) root.leaving = true;
		MakerRuntime.log("타이틀 동작: " + (action == null || action.isEmpty() ? "game:" + gameId : action) + (from != null ? " (창 " + from.id + ")" : ""));
		if (action == null || action.isEmpty()) { if (gameId != null) gameAction(gameId); return; }
		switch (action) {
			case "window": openWindow(it == null ? "" : it.getString("window", "")); break;
			case "close": if (from != null) from.close(); break;
			case "newgame":
				showMenuOnStart = true;
				GamesInProgress.selectedClass = null; GamesInProgress.curSlot = 1;
				ShatteredPixelDungeon.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.HeroSelectScene.class); break;
			case "continue":
				showMenuOnStart = true;
				ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.StartScene.class); break;
			case "scene": gameAction(it.getString("scene", "about")); break;
			case "url": { String u = it.getString("url", ""); if (!u.isEmpty()) ShatteredPixelDungeon.platform.openURI(u); break; }
			case "quit": if (canQuit()) Game.instance.finish(); else root.leaving = false; break;   // iOS · 웹: 끄지 않음 (버튼도 안 보임)
			default: {
				String title = it.getString("title", it.getString("label", ""));
				scene.add(new WndTitledMessage(Icons.get(Icons.INFO), title, it.getString("text", "").replace("\\n", "\n")));
			}
		}
	}
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
			case "journal": goScene("JournalScene"); break;
			case "badges": goScene("BadgesScene"); break;   // 예전 판 · 파생작의 배지 화면 (모험 일지 대신)
			case "news": ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.NewsScene.class); break;
			case "changes": try { com.shatteredpixel.shatteredpixeldungeon.scenes.ChangesScene.class.getField("changesSelected").setInt(null, 0); } catch (Throwable ignored) { /* 이 칸이 없는 저장소 */ } ShatteredPixelDungeon.switchNoFade(com.shatteredpixel.shatteredpixeldungeon.scenes.ChangesScene.class); break;
			case "settings": scene.add(new WndSettings()); break;
			default: ShatteredPixelDungeon.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.AboutScene.class);
		}
	}
	/** 화면 이름으로 이동 (판 · 파생작마다 있는 화면이 다름 — 없으면 알리고 그대로) */
	@SuppressWarnings("unchecked")
	boolean goScene(String name) {
		Class<?> c = com.watabou.utils.Reflection.forName("com.shatteredpixel.shatteredpixeldungeon.scenes." + name);
		if (c == null || !PixelScene.class.isAssignableFrom(c)) { MakerRuntime.log("타이틀 동작: 이 게임에는 " + name + " 화면이 없습니다"); if (root != null) root.leaving = false; return false; }
		ShatteredPixelDungeon.switchNoFade((Class<? extends PixelScene>) c);
		return true;
	}
	/** 버튼 투명도 (StyledButton.alpha() 가 없는 판은 1) */
	static float alphaOf(Object b) { Object v = MakerCompat.invoke(b, "alpha"); return v instanceof Float ? (Float) v : 1f; }
	/** 저장된 게임이 있는가 (이어하기 버튼) */
	static boolean hasSaves() { try { return GamesInProgress.checkAll().size() > 0; } catch (Throwable t) { return false; } }
	/** 이 플랫폼에서 게임을 끌 수 있는가 — PC · Android 만 (iOS 는 앱이 스스로 끄면 안 됨, 웹은 끌 수 없음) */
	static boolean canQuit() { return DeviceCompat.isDesktop() || MakerCompat.isAndroid(); }

	/** 정보 칸 값 (게임이 실제로 아는 것만 — 없으면 넣지 않음 = "값 없음" → 대체 문구) */
	Map<String, String> info;
	Map<String, String> infoValues() {
		if (info != null) return info;
		info = new java.util.HashMap<>();
		JsonValue p = MakerRuntime.project;
		if (p != null) { info.put("gameName", p.getString("name", "")); info.put("author", p.getString("author", "")); }
		info.put("version", Game.version == null ? "" : Game.version);
		info.put("versionCode", String.valueOf(Game.versionCode));
		info.put("date", new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT).format(new java.util.Date()));
		try {
			List<GamesInProgress.Info> all = new ArrayList<>(GamesInProgress.checkAll());
			info.put("saveCount", String.valueOf(all.size()));
			GamesInProgress.Info last = null; long lastAt = Long.MIN_VALUE;
			for (GamesInProgress.Info g : all) { long at = played(g); if (last == null || at > lastAt) { last = g; lastAt = at; } }
			if (last != null) {
				info.put("lastHero", last.heroClass == null ? "" : last.heroClass.title());
				info.put("lastDepth", String.valueOf(last.depth)); info.put("lastLevel", String.valueOf(last.level));
			}
		} catch (Throwable t) { MakerRuntime.log("타이틀 정보 칸: 저장 정보를 읽지 못함 — " + t); }
		return info;
	}
	/** 마지막으로 한 시각 (예전 판에는 칸이 없음 → 슬롯 번호) */
	static long played(GamesInProgress.Info g) { try { return GamesInProgress.Info.class.getField("lastPlayed").getLong(g); } catch (Throwable t) { return g.slot; } }

	static MakerTitleModel.Fx[] fxList(JsonValue list) {
		List<MakerTitleModel.Fx> out = new ArrayList<>();
		if (list != null && list.isArray()) for (JsonValue f : list) if (f != null && f.isObject()) out.add(MakerTitleModel.fxNorm(new JV(f)));
		return out.toArray(new MakerTitleModel.Fx[0]);
	}
	static final java.util.Set<String> CHROME = new java.util.HashSet<>();
	static { for (Chrome.Type ty : Chrome.Type.values()) CHROME.add(ty.name()); }

	/** JsonValue → 공통 규칙(MakerTitleModel) 값 읽기 */
	static final class JV implements MakerTitleModel.Val, MakerAIModel.KeyList {
		final JsonValue v;
		JV(JsonValue v) { this.v = v; }
		@Override public java.util.List<String> keys() { java.util.List<String> out = new java.util.ArrayList<>(); if (v != null && v.isObject()) for (JsonValue x : v) out.add(x.name); return out; }
		JsonValue c(String k) { return v == null || !v.isObject() ? null : v.get(k); }
		@Override public boolean has(String k) { JsonValue x = c(k); return x != null && !x.isNull(); }
		@Override public MakerTitleModel.Val get(String k) { JsonValue x = c(k); return x == null || x.isNull() ? null : new JV(x); }
		@Override public String str(String k, String d) { JsonValue x = c(k); if (x == null || x.isNull() || x.isObject() || x.isArray()) return d; try { return x.asString(); } catch (Exception e) { return d; } }
		@Override public double num(String k, double d) {
			JsonValue x = c(k); if (x == null || x.isNull()) return d;
			try { if (x.isString()) { String t = x.asString().trim(); return t.isEmpty() ? d : Double.parseDouble(t); } return x.isNumber() ? x.asDouble() : d; } catch (Exception e) { return d; }
		}
		@Override public boolean bool(String k, boolean d) { JsonValue x = c(k); return x == null || !x.isBoolean() ? d : x.asBoolean(); }
		@Override public int size() { return v == null ? 0 : v.size; }
		@Override public MakerTitleModel.Val at(int i) { JsonValue x = v.get(i); return x == null ? null : new JV(x); }
		@Override public boolean isObject() { return v != null && v.isObject(); }
		@Override public boolean isArray() { return v != null && v.isArray(); }
		@Override public boolean isString() { return v != null && v.isString(); }
		@Override public String asString() { return v == null ? "" : v.asString(); }
	}

	/** 타이틀 · 창 버튼: 상태 모양(MakerTitleModel.resolveStyle) · 효과 · 키보드 포커스. 오버 · 포커스는 바깥(Root · 창)이 정해 줌 */
	static class TitleBtn extends StyledButton {
		final MakerTitleModel.Val group, item; final String accent;
		final MakerTitleModel.Fx[] fx; final double[] tau;
		String id = "", skinKey = "";
		boolean hover, focus, pressed, disabled;
		Runnable click;
		MakerTitleModel.Style last;
		TitleBtn(MakerTitleModel.Val group, MakerTitleModel.Val item, String accent, String label, int size, boolean disabled) {
			super(Chrome.Type.GREY_BUTTON_TR, label, size);
			this.group = group; this.item = item; this.accent = accent; this.disabled = disabled;
			fx = fxList(item == null ? null : ((JV) item).v.get("effects"));
			tau = new double[fx.length];
			for (int i = 0; i < fx.length; i++) if (fx[i].trigger.equals("click")) tau[i] = -1;   // -1 = 아직 안 누름
			apply(0, 0, 0, 0, 1, 0, 0, 0);
		}
		@Override protected void onPointerDown() { if (disabled) return; pressed = true; com.watabou.noosa.audio.Sample.INSTANCE.play(Assets.Sounds.CLICK); }
		@Override protected void onPointerUp() { pressed = false; }
		@Override protected void onClick() {
			if (disabled || click == null) return;
			for (int i = 0; i < fx.length; i++) if (fx[i].trigger.equals("click")) tau[i] = 0;   // 누를 때마다 처음부터 (쌓이지 않음)
			click.run();
		}
		/** 매 프레임: (x, y, bw, bh) = 효과 전 자리, groupAlpha = 묶음 등장 애니메이션 · 창 투명도, enterT = 등장 시간, t = 화면 시간, dt = 지난 프레임 */
		void apply(float x, float y, float bw, float bh, float groupAlpha, float enterT, float t, float dt) {
			MakerTitleModel.Style st = MakerTitleModel.resolveStyle(group, item, new boolean[]{ hover && !disabled, focus, pressed && !disabled, disabled }, accent, CHROME);
			last = st;
			String key = st.image + "|" + st.skin + "|" + st.slice;
			if (!key.equals(skinKey)) {
				skinKey = key;
				NinePatch np = st.image.isEmpty() ? null : MakerDialogue.imagePatch(st.image, (float) st.slice);
				if (np == null) { try { np = Chrome.get(Chrome.Type.valueOf(st.skin)); } catch (Exception e) { np = Chrome.get(Chrome.Type.GREY_BUTTON_TR); } }
				remove(bg); bg.destroy(); bg = np; addToBack(bg);
			}
			text.hardlight(color(st.textColor, 0xFFFFFF));
			List<double[]> vals = new ArrayList<>();
			for (int i = 0; i < fx.length; i++) {
				switch (fx[i].trigger) {
					case "enter": tau[i] = enterT; break;
					case "always": tau[i] = t; break;
					case "hover": tau[i] = MakerTitleModel.heldStep(tau[i], hover && !disabled, dt, fx[i]); break;
					case "focus": tau[i] = MakerTitleModel.heldStep(tau[i], focus, dt, fx[i]); break;
					case "click": if (tau[i] >= 0) tau[i] += dt; break;
				}
				if (!(fx[i].trigger.equals("click") && tau[i] < 0)) vals.add(MakerTitleModel.fxValue(fx[i], tau[i]));
			}
			double[] v = MakerTitleModel.fxCombine(vals);
			float sc = (float) (st.scale * v[2]), nw = bw * sc, nh = bh * sc;
			if (bw > 0) { setRect(x + (bw - nw) / 2f + (float) v[0], y + (bh - nh) / 2f + (float) v[1] + (float) st.dy, nw, nh); PixelScene.align(this); }
			float a = groupAlpha * (float) (st.alpha * v[3]);
			alpha(a);
			text.alpha(a * (float) st.textAlpha);
			bg.brightness((float) (st.bright * v[4]));
		}
	}

	// ------------------------------------------------------------ 창 (7차 — 버튼이 여는 사용자 창)

	final List<TitleWnd> wins = new ArrayList<>();
	JsonValue windowDef(String id) {
		JsonValue ws = d.get("windows");
		if (ws != null && ws.isArray()) for (JsonValue w : ws) if (w != null && w.isObject() && id.equals(w.getString("id", ""))) return w;
		return null;
	}
	void openWindow(String id) {
		JsonValue v = windowDef(id);
		if (v == null) { MakerRuntime.log("타이틀: 없는 창 \"" + id + "\" — 편집기 검사에서 고치세요"); return; }
		for (TitleWnd w : wins) if (w.id.equals(id) && !w.closing) return;   // 같은 창을 두 번 열지 않음 (연속 클릭)
		TitleWnd w = new TitleWnd(v);
		wins.add(w);
		scene.add(w);
	}
	static NinePatch windowPatch(JsonValue v) {
		NinePatch np = MakerDialogue.imagePatch(v.getString("image", ""), gf(v, "slice", 6));
		if (np != null) return np;
		try { return Chrome.get(Chrome.Type.valueOf(v.getString("skin", "WINDOW"))); } catch (Exception e) { return Chrome.get(Chrome.Type.WINDOW); }
	}

	/** 사용자 창: 원작 Window (가운데 · 안전 영역 · 바깥 입력 막음) + 내용 배치 = MakerTitleModel.windowLayout (편집기와 같은 식) */
	class TitleWnd extends com.shatteredpixel.shatteredpixeldungeon.ui.Window {
		final JsonValue v; final JV jv; final String id, anim; final float dur;
		boolean closing; float openT, closeT;
		final List<TitleBtn> bts = new ArrayList<>(); final List<float[]> btRects = new ArrayList<>();
		final List<com.shatteredpixel.shatteredpixeldungeon.ui.ScrollPane> panes = new ArrayList<>(); final List<float[]> paneRects = new ArrayList<>();
		final List<Visual> statics = new ArrayList<>(); final List<Float> staticAlpha = new ArrayList<>();
		final List<RenderedTextBlock> texts = new ArrayList<>(); final List<Float> textAlpha = new ArrayList<>();
		int focus = -1; boolean focusVisible;
		MakerTitleModel.WinLayout L; double[][] sizes = new double[0][]; double titleH; double[] margins;

		TitleWnd(JsonValue v) {
			super(0, 0, windowPatch(v));
			this.v = v; this.jv = new JV(v); this.id = v.getString("id", "");
			JsonValue an = v.get("anim");
			anim = an == null ? "fade" : an.getString("type", "fade");
			dur = an == null ? 0.2f : Math.max(0.01f, gf(an, "duration", 0.2f));
			// 바깥 누르기: 원작은 늘 닫음 → 설정대로 (입력은 늘 막음 — 뒤 타이틀 버튼이 눌리지 않음)
			remove(blocker); blocker.destroy();
			final boolean outside = v.getBoolean("closeOutside", true);
			blocker = new PointerArea(0, 0, PixelScene.uiCamera.width, PixelScene.uiCamera.height) {
				@Override protected void onClick(PointerEvent event) {
					if (outside && TitleWnd.this.parent != null && !chrome.overlapsScreenPoint((int) event.current.x, (int) event.current.y)) close();
				}
			};
			blocker.camera = PixelScene.uiCamera;
			addToBack(blocker);
			build();
			String snd = v.get("sounds") == null ? "" : v.get("sounds").getString("open", "");
			if (!snd.isEmpty()) MakerAudio.playSe(snd);
			step(0);
		}
		void build() {
			int W = (int) Math.max(40, jv.num("w", 120)), pad = (int) Math.max(0, jv.num("padding", 4));
			boolean closeBtn = v.getBoolean("closeButton", true);
			int cw = W - pad * 2;
			String ttl = MakerTitleModel.bindText(v.getString("title", ""), infoValues(), "").get(0);
			RenderedTextBlock title = null;
			if (!ttl.isEmpty()) {
				title = PixelScene.renderTextBlock(ttl, 9);
				title.maxWidth(W - pad * 2 - (closeBtn ? 12 : 0));
				String tc = v.getString("titleColor", "");
				title.hardlight(tc.isEmpty() ? MakerTheme.or("accent", TITLE_COLOR) : color(tc, TITLE_COLOR));
			}
			JsonValue content = v.get("content");
			int n = content != null && content.isArray() ? content.size : 0;
			double[][] sizes = new double[n][];
			Object[] made = new Object[n];
			for (int i = 0; i < n; i++) {
				JsonValue c = content.get(i); String type = c.getString("type", "");
				sizes[i] = new double[]{ 0, 0 };
				if (type.equals("text")) {
					RenderedTextBlock t = PixelScene.renderTextBlock(MakerTitleModel.bindText(c.getString("text", ""), infoValues(), c.getString("fallback", "")).get(0).replace("\\n", "\n"), Math.max(5, gi(c, "size", 7)));
					t.maxWidth(cw);
					String al = c.getString("align", "left");
					t.align(al.equals("center") ? RenderedTextBlock.CENTER_ALIGN : al.equals("right") ? RenderedTextBlock.RIGHT_ALIGN : RenderedTextBlock.LEFT_ALIGN);
					t.hardlight(color(c.getString("color", "#ffffff"), 0xFFFFFF));
					sizes[i] = new double[]{ t.height(), t.width() }; made[i] = t;
				} else if (type.equals("image")) {
					Object tx = MakerRuntime.texture(c.getString("image", ""));
					if (tx != null) { Image im = new Image(tx); float sc = Math.max(0.01f, gf(c, "scale", 1f)); im.scale.set(sc); sizes[i] = new double[]{ im.height * sc, im.width * sc }; made[i] = im; }
				}
			}
			this.sizes = sizes; this.titleH = title == null ? 0 : title.height();
			L = MakerTitleModel.windowLayout(jv, Camera.main.width, Camera.main.height, toD(MakerDialogue.safeArea(Camera.main.width, Camera.main.height)), margins = new double[]{ chrome.marginLeft(), chrome.marginTop(), chrome.marginRight(), chrome.marginBottom() }, sizes, title == null ? 0 : title.height());
			resize((int) L.w, (int) L.h);
			float ox = (float) L.x, oy = (float) L.y;
			if (title != null) { title.setPos((float) (L.title[0] - ox), (float) (L.title[1] - oy)); add(title); texts.add(title); }
			if (closeBtn) {
				com.shatteredpixel.shatteredpixeldungeon.ui.IconButton x = new com.shatteredpixel.shatteredpixeldungeon.ui.IconButton(Icons.get(Icons.CLOSE)) { @Override protected void onClick() { close(); } };
				x.setRect((float) (L.close[0] - ox), (float) (L.close[1] - oy), 11, 11); add(x); statics.add(x.icon()); staticAlpha.add(1f);
			}
			for (int i = 0; i < n; i++) {
				final JsonValue c = content.get(i); String type = c.getString("type", "");
				double[] r = L.items.get(i);
				float x = (float) (r[0] - ox), y = (float) (r[1] - oy), w = (float) r[2], hh = (float) r[3];
				switch (type) {
					case "text": { RenderedTextBlock t = (RenderedTextBlock) made[i]; String al = c.getString("align", "left");
						t.setPos(al.equals("center") ? x + (w - t.width()) / 2f : al.equals("right") ? x + w - t.width() : x, y); PixelScene.align(t); add(t); texts.add(t); textAlpha.add(1f); break; }
					case "image": if (made[i] != null) { Image im = (Image) made[i]; im.x = x; im.y = y; add(im); statics.add(im); staticAlpha.add(1f); } break;
					case "divider": { ColorBlock cb = new ColorBlock(w, Math.max(1, gi(c, "thickness", 1)), 0xFF000000 | color(c.getString("color", "#888888"), 0x888888)); cb.x = x; cb.y = y; add(cb); statics.add(cb); staticAlpha.add(1f); break; }
					case "scroll": {
						RenderedTextBlock t = PixelScene.renderTextBlock(MakerTitleModel.bindText(c.getString("text", ""), infoValues(), "").get(0).replace("\\n", "\n"), Math.max(5, gi(c, "size", 6)));
						t.maxWidth((int) w - 2); t.hardlight(color(c.getString("color", "#dddddd"), 0xDDDDDD));
						com.watabou.noosa.ui.Component box = new com.watabou.noosa.ui.Component();
						com.shatteredpixel.shatteredpixeldungeon.ui.ScrollPane sp = new com.shatteredpixel.shatteredpixeldungeon.ui.ScrollPane(box);
						add(sp);
						box.add(t); t.setPos(0, 0); box.setSize(w, t.height());
						sp.setRect(x, y, w, hh); sp.scrollTo(0, 0);
						panes.add(sp); paneRects.add(new float[]{ x, y, w, hh }); texts.add(t); textAlpha.add(1f);
						break;
					}
					case "setting": add(setting(c, x, y, w)); break;
					case "button": {
						String action = c.getString("action", "close");
						boolean dis = !c.getBoolean("enabled", true);
						if (action.equals("continue") && !hasSaves()) { String ns = c.getString("noSave", "disable"); if (ns.equals("hide")) break; if (ns.equals("newgame")) action = "newgame"; else dis = true; }
						if (action.equals("quit") && !canQuit()) break;
						final String act = action;
						TitleBtn b = new TitleBtn(root.bsv, new JV(c), null, c.getString("label", ""), Math.max(5, gi(c, "size", 9)), dis);
						String icon = c.getString("icon", "");
						if (!icon.isEmpty() && !icon.equals("NONE")) { try { b.icon(Icons.get(Icons.valueOf(icon))); } catch (Exception ignored) { } }
						b.click = () -> act(act, c, null, TitleWnd.this);
						b.setRect(x, y, w, hh); add(b); bts.add(b); btRects.add(new float[]{ x, y, w, hh });
						break;
					}
				}
			}
			place(0);
			for (int i = 0; i < members.size(); i++) { Gizmo g = members.get(i); if (g == chrome) { statics.add(chrome); staticAlpha.add(1f); } }
		}
		com.watabou.noosa.ui.Component setting(JsonValue c, float x, float y, float w) {
			String key = c.getString("key", "music"), label = c.getString("label", "");
			switch (key) {
				case "musicVol": case "sfxVol": {
					final boolean mus = key.equals("musicVol");
					com.shatteredpixel.shatteredpixeldungeon.ui.OptionSlider s = new com.shatteredpixel.shatteredpixeldungeon.ui.OptionSlider(label.isEmpty() ? Messages.get(mus ? "windows.wndsettings$audiotab.music_vol" : "windows.wndsettings$audiotab.sfx_vol") : label, "0", "10", 0, 10) {
						@Override protected void onChange() {
							if (mus) com.shatteredpixel.shatteredpixeldungeon.SPDSettings.musicVol(getSelectedValue());
							else { com.shatteredpixel.shatteredpixeldungeon.SPDSettings.SFXVol(getSelectedValue()); com.watabou.noosa.audio.Sample.INSTANCE.play(Assets.Sounds.ITEM); }
						}
					};
					s.setSelectedValue(mus ? com.shatteredpixel.shatteredpixeldungeon.SPDSettings.musicVol() : com.shatteredpixel.shatteredpixeldungeon.SPDSettings.SFXVol());
					s.setRect(x, y, w, 21);
					return s;
				}
				default: {   // 원작 소리 설정과 같은 "끄기" 체크 (체크 = 꺼짐)
					final boolean mus = !key.equals("sound");
					com.shatteredpixel.shatteredpixeldungeon.ui.CheckBox cb = new com.shatteredpixel.shatteredpixeldungeon.ui.CheckBox(label.isEmpty() ? Messages.get(mus ? "windows.wndsettings$audiotab.music_mute" : "windows.wndsettings$audiotab.sfx_mute") : label) {
						@Override protected void onClick() {
							super.onClick();
							if (mus) com.shatteredpixel.shatteredpixeldungeon.SPDSettings.music(!checked()); else com.shatteredpixel.shatteredpixeldungeon.SPDSettings.soundFx(!checked());
						}
					};
					cb.checked(mus ? !com.shatteredpixel.shatteredpixeldungeon.SPDSettings.music() : !com.shatteredpixel.shatteredpixeldungeon.SPDSettings.soundFx());
					cb.setRect(x, y, w, 16);
					return cb;
				}
			}
		}
		/** 창 자리 = 공통 규칙이 정한 틀 자리 (MakerTitleModel.windowLayout — 편집기 미리보기와 같음). 원작 Window 의 가운데 맞춤 · offset 대신 카메라를 직접 놓음
		 *  (원작은 기기의 막는 영역(INSET_BLK)만 빼고 가운데 — 규칙은 안전 영역 가운데라 휴대폰에서 몇 점 달랐음). dy = 열고 닫는 애니메이션 */
		int placedDy = Integer.MIN_VALUE;
		void place(int dy) {
			placedDy = dy;
			Camera mc = Camera.main; float z = camera.zoom;
			camera.x = Math.round(mc.x + (float) L.chrome[0] * z);
			camera.y = Math.round(mc.y + (float) (L.chrome[1] + dy) * z);
			shadow.boxRect(camera.x / z, camera.y / z, chrome.width(), chrome.height);
			for (int i = 0; i < panes.size(); i++) { float[] r = paneRects.get(i); panes.get(i).setRect(r[0], r[1], r[2], r[3]); }   // 스크롤 칸은 화면 자리로 다시 셈
		}
		@Override public synchronized void update() { super.update(); step(Game.elapsed); }
		void step(float e) {
			if (closing) closeT += e; else openT += e;
			float k = closing ? 1 - closeT / dur : openT / dur;
			k = Math.max(0, Math.min(1, k));
			float ek = (float) MakerTitleModel.ease("smooth", k);
			float a = anim.equals("none") ? (closing && closeT >= dur ? 0 : 1) : ek;
			int dy = anim.equals("slideUp") ? Math.round(12 * (1 - ek)) : anim.equals("slideDown") ? -Math.round(12 * (1 - ek)) : 0;
			if (dy != placedDy) place(dy);
			for (int i = 0; i < statics.size(); i++) statics.get(i).alpha(staticAlpha.get(i) * a);
			for (int i = 0; i < texts.size(); i++) texts.get(i).alpha(a);
			shadow.am = 0.5f * a;
			for (int i = 0; i < bts.size(); i++) {
				TitleBtn b = bts.get(i); float[] r = btRects.get(i);
				b.focus = focusVisible && focus == i;
				b.apply(r[0], r[1], r[2], r[3], a, openT, openT, e);
				b.active = !closing && a > 0.5f;
			}
			if (closing && (closeT >= dur || anim.equals("none"))) finish();
		}
		/** 닫기 (애니메이션 뒤 없어짐) — 두 번 불러도 한 번만 */
		void close() {
			if (closing) return;
			closing = true; closeT = 0;
			String snd = v.get("sounds") == null ? "" : v.get("sounds").getString("close", "");
			if (!snd.isEmpty()) MakerAudio.playSe(snd);
		}
		boolean finished;
		void finish() { if (finished) return; finished = true; wins.remove(this); super.hide(); }
		@Override public void hide() { finish(); }   // 다른 길(원작 창 모두 닫기 등)로 닫혀도 정리
		@Override public void onBackPressed() { if (v.getBoolean("closeEsc", true)) close(); }
		@Override public boolean onSignal(com.watabou.input.KeyEvent ev) {
			if (!ev.pressed) return true;
			int c = ev.code;
			if (com.shatteredpixel.shatteredpixeldungeon.SPDAction.BACK == com.watabou.input.KeyBindings.getActionForKey(ev)) { onBackPressed(); return true; }
			boolean enter = c == com.badlogic.gdx.Input.Keys.ENTER || c == com.badlogic.gdx.Input.Keys.NUMPAD_ENTER || c == com.badlogic.gdx.Input.Keys.SPACE;
			boolean next = c == com.badlogic.gdx.Input.Keys.DOWN || c == com.badlogic.gdx.Input.Keys.RIGHT || c == com.badlogic.gdx.Input.Keys.TAB;
			boolean prev = c == com.badlogic.gdx.Input.Keys.UP || c == com.badlogic.gdx.Input.Keys.LEFT;
			if (bts.isEmpty() || closing) return true;
			if (!focusVisible || focus < 0) { if (enter || next || prev) { focusVisible = true; focus = 0; } return true; }
			if (enter) { TitleBtn b = bts.get(focus); if (!b.disabled) { b.onPointerDown(); b.onPointerUp(); b.onClick(); } return true; }
			if (next || prev) focus = ((focus + (next ? 1 : -1)) % bts.size() + bts.size()) % bts.size();
			return true;
		}
	}
	/** 안전한 숫자 읽기 (7차 — 손으로 고친 파일의 "big" 같은 값이 있어도 멈추지 않고 기본값) */
	static int gi(JsonValue v, String k, int d) { try { JsonValue c = v == null ? null : v.get(k); return c == null || !c.isNumber() ? (c != null && c.isString() ? (int) Double.parseDouble(c.asString().trim()) : d) : c.asInt(); } catch (Exception e) { return d; } }
	static float gf(JsonValue v, String k, float d) { try { JsonValue c = v == null ? null : v.get(k); return c == null || !c.isNumber() ? (c != null && c.isString() ? Float.parseFloat(c.asString().trim()) : d) : c.asFloat(); } catch (Exception e) { return d; } }
	static double[] toD(float[] a) { double[] o = new double[a.length]; for (int i = 0; i < a.length; i++) o[i] = a[i]; return o; }

	// ------------------------------------------------------------ 배경 (타이틀·메뉴 화면 공용)

	/** 게임 배경 방식: game = 게임의 Archs 그대로(mod-2: 숲·탑 10겹 시차 배경, 원작: 아치), classic = 원작 아치 그림(방향·속도·그림 바꾸기), none */
	static String archStyle(JsonValue bg) {
		if (!bg.getBoolean("archs", true)) return "none";
		return bg.getString("archStyle", "game");
	}
	static Class<?> titleBgClass() {
		try { return Class.forName("com.shatteredpixel.shatteredpixeldungeon.ui.TitleBackground"); } catch (Throwable t) { return null; }
	}
	static Gizmo gameTitleBackground(int w, int h) {
		try { Class<?> c = titleBgClass(); return c == null ? null : (Gizmo) c.getConstructor(int.class, int.class).newInstance(w, h); }
		catch (Throwable t) { return null; }
	}
	/** 배경을 g 에 추가: 색 · 게임 배경 · 그라데이션 · (뒤)레이어 · 아래쪽 어둡게 · (메뉴) 입자 */
	static void addBackground(Group g, JsonValue d, int w, int h, boolean title) {
		JsonValue bg = d.get("background") == null ? new JsonValue(JsonValue.ValueType.object) : d.get("background");
		JsonValue menus = d.get("menus") == null ? new JsonValue(JsonValue.ValueType.object) : d.get("menus");
		String col = bg.getString("color", "");
		if (!col.isEmpty()) g.add(new ColorBlock(w, h, 0xFF000000 | color(col, 0)));
		switch (archStyle(bg)) {
			case "game": {
				// 떠오르는 폐허를 직접 설정했으면(background.ruins.on) 그 설정대로 — 메뉴 화면도 같은 배경
				if (Ruins.on(bg)) { g.add(new Ruins(bg.get("ruins"), w, h)); break; }
				// 타이틀: 게임에 타이틀 전용 배경(4.0 의 ui.TitleBackground — 폐허가 떠오르는 시차 배경)이 있으면 그것, 없으면 아치
				if (title) { Gizmo tb = gameTitleBackground(w, h); if (tb != null) { g.add(tb); break; } }
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



	/**
	 * 떠오르는 폐허 (SPD 4.0 ui.TitleBackground 를 설정할 수 있게 다시 만든 것) — background.ruins
	 *   { on, dir: up|down|left|right, speed(px/초, 게임 15), dark(아래쪽 어둡게), wall: { show, image, fw, fh, cols, frames },
	 *     layers: [{ name, image, fw, fh, cols, frames, count(화면에 몇 개), speed(벽 대비 배율), size(배율), dark(0~1 어둡게), spin(기울기 ±도), show }] }
	 *   크기 단위는 게임과 같이 화면 높이 450 기준 (세로 화면이면 1.5 배 작게 · 느리게). 레이어는 순서대로 위에 그려짐.
	 */
	static class Ruins extends Group {
		static boolean on(JsonValue bg) { JsonValue r = bg == null ? null : bg.get("ruins"); return r != null && r.getBoolean("on", false); }
		static final String[][] DEF = {   // 이름, 그림, fw, fh, cols, frames, count, speed, size, dark — 편집기 기본값(title.js RUINS_LAYERS)과 같음
			{ "먼 덩어리", "game:splashes/title/back_clusters.png", "450", "250", "1", "2", "4", "1.33", "0.5", "0.5" },
			{ "덩어리", "game:splashes/title/back_clusters.png", "450", "250", "1", "2", "3", "2", "1", "0.25" },
			{ "먼 작은 조각", "game:splashes/title/front_small.png", "112", "116", "9", "36", "6", "2.66", "1", "0.2" },
			{ "가운데 폐허 1", "game:splashes/title/mid_mixed.png", "273", "242", "7", "28", "3", "3.54", "1", "0.1" },
			{ "가운데 폐허 2", "game:splashes/title/mid_mixed.png", "273", "242", "7", "28", "2", "4.7", "1.5", "0" },
			{ "앞 작은 조각", "game:splashes/title/front_small.png", "112", "116", "9", "36", "3", "6.26", "2.25", "0" } };
		final int w, h; final float vx, vy, k, speed;
		float t = 0;
		// 벽
		TextureFilm wallFilm; int wallFrames, wallCols; float aw, ah; Image[][] cells;
		// 떠다니는 조각
		static class Bit { Image img; float p, q; int cycle; }
		static class Lay { TextureFilm film; int frames; float spd, size, spin, bw, bh; List<Bit> bits = new ArrayList<>(); }
		final List<Lay> lays = new ArrayList<>();

		Ruins(JsonValue r, int w, int h) {
			this.w = w; this.h = h;
			boolean portrait = w <= h;
			float k0 = h / 450f; k = portrait ? k0 / 1.5f : k0;
			speed = r.getFloat("speed", 15f) * k0 * (portrait ? 1 / 1.5f : 1f);
			switch (r.getString("dir", "up")) {
				case "down": vx = 0; vy = 1; break;
				case "left": vx = -1; vy = 0; break;
				case "right": vx = 1; vy = 0; break;
				default: vx = 0; vy = -1;
			}
			JsonValue wl = r.get("wall");
			if (wl == null || wl.getBoolean("show", true)) {
				Object tx = MakerRuntime.texture(wl == null || wl.getString("image", "").isEmpty() ? "game:splashes/title/archs.png" : wl.getString("image", ""));
				if (tx != null) {
					int fw = wl == null ? 333 : wl.getInt("fw", 333), fh = wl == null ? 100 : wl.getInt("fh", 100);
					wallCols = Math.max(1, wl == null ? 3 : wl.getInt("cols", 3)); wallFrames = Math.max(1, wl == null ? 6 : wl.getInt("frames", 6));
					wallFilm = new TextureFilm(tx, fw, fh);
					aw = (fw - 9) * k0; ah = (fh - 5) * k0;   // 게임처럼 조금씩 겹침
					if (aw > 1 && ah > 1) {
						int nx = (int) Math.ceil(w / aw) + 2, ny = (int) Math.ceil(h / ah) + 2;
						cells = new Image[ny][nx];
						for (int y = 0; y < ny; y++) for (int x = 0; x < nx; x++) { Image im = new Image(tx); im.scale.set(k0); cells[y][x] = im; add(im); }
					}
				}
			}
			if (r.getBoolean("dark", true)) {
				Image dk = new Image(TextureCache.createGradient(0x00000000, 0x11000000, 0x22000000, 0x33000000, 0x44000000, 0x88000000));
				dk.angle = 90; dk.x = w; dk.scale.x = h / 6f; dk.scale.y = w; add(dk);
			}
			JsonValue ls = r.get("layers");
			if (ls == null) for (String[] d : DEF) addLayer(d[1], i(d[2]), i(d[3]), i(d[4]), i(d[5]), i(d[6]), f(d[7]), f(d[8]), f(d[9]), 20f);
			else for (JsonValue l : ls) if (l.getBoolean("show", true))
				addLayer(l.getString("image", ""), l.getInt("fw", 0), l.getInt("fh", 0), l.getInt("cols", 1), l.getInt("frames", 1), l.getInt("count", 3), l.getFloat("speed", 2f), l.getFloat("size", 1f), l.getFloat("dark", 0f), l.getFloat("spin", 20f));
		}
		static int i(String v) { return Integer.parseInt(v); }
		static float f(String v) { return Float.parseFloat(v); }
		void addLayer(String img, int fw, int fh, int cols, int frames, int count, float spd, float size, float dark, float spin) {
			Object tx = img == null || img.isEmpty() ? null : MakerRuntime.texture(img);
			if (tx == null) return;
			Lay L = new Lay();
			Image probe = new Image(tx);
			if (fw <= 0) fw = (int) probe.width; if (fh <= 0) fh = (int) probe.height;
			L.film = new TextureFilm(tx, fw, fh); L.frames = Math.max(1, frames); L.spd = spd; L.size = size; L.spin = spin;
			L.bw = fw * k * size; L.bh = fh * k * size;
			float span = (vy != 0 ? h : w) + Math.max(L.bw, L.bh) * 2;
			for (int n = 0; n < Math.max(0, count); n++) {
				Bit b = new Bit(); b.img = new Image(tx); b.img.scale.set(k * size);
				if (dark > 0) b.img.brightness(Math.max(0, 1 - dark));
				b.p = Random.Float(span); reroll(L, b);
				L.bits.add(b); add(b.img);
			}
			lays.add(L);
		}
		void reroll(Lay L, Bit b) {
			b.img.frame(L.film.get(Random.Int(L.frames)));
			b.img.origin.set(b.img.width / 2f, b.img.height / 2f);
			b.img.angle = L.spin > 0 ? Random.Float(-L.spin, L.spin) : 0;
			float cross = vy != 0 ? w : h, big = vy != 0 ? L.bw : L.bh;
			b.q = Random.Float(-big / 3f, cross - big * 2 / 3f);
		}
		@Override public void update() {
			super.update();
			float e = Game.elapsed; t += e;
			float off = t * speed;
			if (cells != null) {   // 벽: 칸마다 프레임은 (전체 줄 · 칸 번호)로 정해져 흘러가도 바뀌지 않음
				boolean vert = vy != 0;
				float step = vert ? ah : aw, o = ((off % step) + step) % step;
				long base = (long) Math.floor(off / step);
				for (int y = 0; y < cells.length; y++) for (int x = 0; x < cells[y].length; x++) {
					Image im = cells[y][x];
					long gy = vert ? (vy < 0 ? base + y : -base + y) : y, gx = vert ? x : (vx < 0 ? base + x : -base + x);
					int fr = (int) Math.floorMod(gy * 7919L + gx * 104729L + (gy * gx) % 13, (long) wallFrames);
					im.frame(wallFilm.get(fr));
					float px = x * aw - aw / 2f, py = y * ah - ah / 2f;
					if (vert) py += vy < 0 ? -o : o - ah; else px += vx < 0 ? -o : o - aw;
					im.x = px; im.y = py;
				}
			}
			for (Lay L : lays) {
				float big = Math.max(L.bw, L.bh), span = (vy != 0 ? h : w) + big * 2;
				for (Bit b : L.bits) {
					b.p += speed * L.spd * e;
					if (b.p >= span) { b.p -= span; reroll(L, b); }
					float along = b.p - big;   // 화면 밖(뒤쪽)에서 들어와 앞쪽 밖으로 나감
					if (vy < 0) { b.img.x = b.q; b.img.y = h - along; }
					else if (vy > 0) { b.img.x = b.q; b.img.y = along - b.img.height(); }
					else if (vx < 0) { b.img.y = b.q; b.img.x = w - along; }
					else { b.img.y = b.q; b.img.x = along - b.img.width(); }
				}
			}
		}
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
		for (Root.Btn b : current.root.btns) if (b.b.visible) out.add(b.b.text() + "@" + (int) b.b.left() + "," + (int) b.b.top() + " a" + String.format("%.2f", alphaOf(b.b)));
		out.add("revealed=" + current.root.revealed);
		return out;
	}
	/** 테스트용: 화면 누르기 */
	public static void tap() { if (current != null && current.root != null && !current.root.revealed) { current.root.revealed = true; current.root.revealT = 0; current.root.btnClock = 0; } }
	/** 테스트용 (7차): 포인터 오버 자리 (UI 좌표, null = 실제 포인터) — xvfb 에는 오버 신호가 없어서 */
	static float[] debugHover;
	public static void hover(float[] at) { debugHover = at; }
	/** 테스트용: 그 버튼 가운데에 포인터 */
	public static void hoverOn(String id) {
		if (current == null || current.root == null) return;
		for (Root.Btn b : current.root.btns) if (b.b.id.equals(id)) debugHover = new float[]{ b.x + b.bw / 2f, b.y + b.bh / 2f };
	}
	public static void openWin(String id) { if (current != null && current.root != null) current.openWindow(id); }
	/** 테스트용: 버튼 누르기 (사람이 누른 것과 같은 길 — 비활성 · 이미 떠남이면 아무 일 없음) */
	public static void click(String id) {
		if (current == null || current.root == null) return;
		for (Root.Btn b : current.root.btns) if (b.b.id.equals(id) && b.b.active) { b.b.onPointerDown(); b.b.onPointerUp(); b.b.onClick(); }
	}
	static String r4(double[] r) { return r == null ? "null" : String.format(java.util.Locale.ROOT, "[%.2f,%.2f,%.2f,%.2f]", r[0], r[1], r[2], r[3]); }
	static String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""; }
	/** 테스트용: 타이틀 배치 · 상태 (JSON) — tools/playtest/title-check.sh 가 편집기 식(PDM.titleModel)으로 계산한 값과 비교 */
	public static String geo() {
		if (current == null || current.root == null) return "{}";
		MakerTitle m = current; Root R = m.root;
		StringBuilder b = new StringBuilder("{");
		b.append("\"W\":").append(m.w).append(",\"H\":").append(m.h).append(",\"land\":").append(m.land).append(",\"revealed\":").append(R.revealed).append(",\"leaving\":").append(R.leaving)
			.append(",\"saves\":").append(hasSaves()).append(",\"logo\":").append(r4(new double[]{ R.logoBaseX, R.logoBaseY, R.logoW, R.logoH }))
			.append(",\"safe\":").append(r4(toD(MakerDialogue.safeArea(m.w, m.h)))).append(",\"focus\":").append(R.focusVisible && R.focus >= 0 && R.focus < R.order.size() ? q(R.order.get(R.focus).b.id) : "null");
		b.append(",\"buttons\":[");
		for (int i = 0; i < R.btns.size(); i++) {
			Root.Btn x = R.btns.get(i); TitleBtn t = x.b; MakerTitleModel.Style st = t.last;
			if (i > 0) b.append(',');
			b.append("{\"id\":").append(q(t.id)).append(",\"label\":").append(q(t.text())).append(",\"base\":").append(r4(new double[]{ x.x, x.y, x.bw, x.bh }))
				.append(",\"r\":").append(r4(new double[]{ t.left(), t.top(), t.width(), t.height() })).append(",\"a\":").append(String.format(java.util.Locale.ROOT, "%.3f", alphaOf(t)))
				.append(",\"vis\":").append(t.visible).append(",\"active\":").append(t.active).append(",\"hover\":").append(t.hover).append(",\"focus\":").append(t.focus).append(",\"pressed\":").append(t.pressed).append(",\"dis\":").append(t.disabled)
				.append(",\"skin\":").append(q(st == null ? "" : st.skin)).append(",\"tc\":").append(q(st == null ? "" : st.textColor)).append(",\"bright\":").append(st == null ? 1 : st.bright).append("}");
		}
		b.append("],\"elements\":[");
		for (int i = 0; i < R.els.size(); i++) {
			Root.El e = R.els.get(i); if (i > 0) b.append(',');
			b.append("{\"id\":").append(q(e.v.getString("id", ""))).append(",\"text\":").append(q(e.text)).append(",\"size\":[").append(e.sw).append(',').append(e.sh).append("],\"r\":").append(r4(e.rect))
				.append(",\"vis\":").append(e.txt != null ? e.txt.visible : e.img != null && e.img.visible).append("}");
		}
		b.append("],\"windows\":[");
		for (int i = 0; i < m.wins.size(); i++) {
			TitleWnd w = m.wins.get(i); if (i > 0) b.append(',');
			float z = w.camera.zoom;
			b.append("{\"id\":").append(q(w.id)).append(",\"chrome\":").append(r4(new double[]{ w.camera.x / z - Camera.main.x / Camera.main.zoom, w.camera.y / z - Camera.main.y / Camera.main.zoom, w.camera.width, w.camera.height }))
				.append(",\"model\":").append(r4(w.L.chrome)).append(",\"closing\":").append(w.closing).append(",\"items\":[");
			for (int j = 0; j < w.L.items.size(); j++) { if (j > 0) b.append(','); b.append(r4(w.L.items.get(j))); }
			b.append("],\"sizes\":[");
			for (int j = 0; j < w.sizes.length; j++) { if (j > 0) b.append(','); b.append('[').append(w.sizes[j][0]).append(',').append(w.sizes[j][1]).append(']'); }
			b.append("],\"titleH\":").append(w.titleH).append(",\"margins\":").append(r4(w.margins))
				.append(",\"focus\":").append(w.focusVisible ? w.focus : -1).append("}");
		}
		b.append("]}");
		return b.toString();
	}
}
