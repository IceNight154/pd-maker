/*
 * 연출 진행 상태 · 배속 · 스킵 · 배속 표시줄 (6차)
 *
 *   상태 모델 — 매 프레임 실제 실행 상태에서 다시 셈 (따로 켜고 끄는 전역 Boolean 하나가 아님 → 남거나 일찍 사라지지 않음):
 *     이벤트 시퀀스  EventInterpreter 가 실행 중 (공통 이벤트 호출 = 같은 실행기의 스택 — 바깥 이벤트가 끝나야 끝남)
 *     대사 진행      대사창(MakerDialogue.Wnd) · 원작 모양 대사 창 · 입력 기다리기 창이 떠 있음 (이벤트 밖 대화 — 말 걸기 메뉴 등 — 포함)
 *     카메라 연출    MakerCamera 가 옮기는 중 · 돌아가는 중 · 흔드는 중 (기다리지 않는 연출이 이벤트보다 오래 남아도)
 *     그 밖          플러그인 등이 begin(이유) · end(토큰)로 알린 연출 (토큰마다 따로 — 하나가 끝나도 다른 것은 남음)
 *   하나라도 있으면 "연출 중": 배속(Game.timeScale = speed, 스킵이면 16)이 적용되고 배속 표시줄이 화면 아래에 보임.
 *   모두 끝나는 순간(정상 끝 · 취소 · 오류로 멈춘 이벤트 정리 · 새 게임 · 불러오기 포함): 배속 1 · 스킵 끔 · 표시줄 숨김.
 *   일반 플레이에서는 Game.timeScale = 1 (표시줄을 숨겨도 시간은 바뀌지 않음 — 표시와 시간은 따로).
 *
 *   배속 표시줄: 테스트 플레이(-Dpdmaker.testenv)에서는 늘, 내보낸 게임에서는 project.json "cutsceneSpeed": true 일 때만 (예전 프로젝트 = 없음 = 끔).
 *     "▶ 2x" 현재 배속 · 1x 2x 4x 16x · 스킵 — 프로젝트 게임 UI 테마(MakerTheme) 색. 대사창이 있으면 그 위(이름표 반대쪽), 없으면 화면 아래 가운데
 *     (원작 도구 모음 위) — 안전 영역 안. 키: F6 배속 바꾸기 · F10 스킵 (연출 중에만)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Input;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.Toolbar;
import com.watabou.input.KeyEvent;
import com.watabou.input.PointerEvent;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Game;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Group;
import com.watabou.utils.Signal;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

public class MakerCutscene {

	public static final int[] SPEEDS = {1, 2, 4, 16};
	static int speed = 1;
	static boolean skipping, wasActive;
	static String lastWhy = "";
	static final Map<Object, String> tokens = new IdentityHashMap<>();

	// ------------------------------------------------------------ 상태

	/** 플러그인 등: 연출 시작을 알림 → 토큰 (끝나면 end(토큰)) */
	public static synchronized Object begin(String why) { Object t = new Object(); tokens.put(t, why == null ? "연출" : why); return t; }
	public static synchronized void end(Object token) { if (token != null) tokens.remove(token); }

	/** 지금 진행 중인 연출 (빈 글 = 일반 플레이). 이유를 + 로 이어 붙임 — 예: "event(ev1)+dialogue+camera" */
	public static String why() {
		StringBuilder b = new StringBuilder();
		if (EventInterpreter.busy()) b.append("event(").append(EventInterpreter.currentId()).append(')');
		String w = windowKind();
		if (w != null) b.append(b.length() > 0 ? "+" : "").append(w);
		if (MakerCamera.animating()) b.append(b.length() > 0 ? "+" : "").append("camera");
		synchronized (MakerCutscene.class) { for (String s : tokens.values()) b.append(b.length() > 0 ? "+" : "").append(s); }
		return b.toString();
	}
	public static boolean active() { return !why().isEmpty(); }
	/** 떠 있는 대사 · 입력 기다리기 창 종류 (없으면 null) */
	static String windowKind() {
		if (Game.scene() == null) return null;
		Group sc = Game.scene();
		for (int i = 0; i < sc.length; i++) {
			Gizmo g = MakerDialogue.HudHider.member(sc, i);
			if (g == null || !g.alive || !g.exists) continue;
			if (g instanceof MakerDialogue.Wnd && !((MakerDialogue.Wnd) g).done) return ((MakerDialogue.Wnd) g).line.text.isEmpty() ? "choice" : "dialogue";
			if (g instanceof MakerDialogue.WaitWnd) return "waitInput";
			if (g instanceof EventInterpreter.WndMakerText) return "dialogue";
		}
		return null;
	}
	/** 지금 적용할 시간 배율 */
	public static int timeScale() { return wasActive ? (skipping ? 16 : speed) : 1; }
	public static int speed() { return speed; }
	public static boolean skipping() { return skipping; }

	/** 매 프레임 (게임 화면의 Bar.update) — 연출 시작 · 끝 전환과 시간 배율 */
	static float classicT;
	static void frame() {
		String w = why();
		boolean a = !w.isEmpty();
		if (a && !wasActive) { speed = startSpeed(); skipping = false; }
		if (!a && wasActive) {
			if (speed != 1 || skipping) MakerRuntime.log("연출 끝 (" + lastWhy + ") — 배속 1× 로" + (skipping ? " · 스킵 끔" : ""));
			speed = 1; skipping = false;
		}
		wasActive = a;
		if (a) lastWhy = w;
		Game.timeScale = timeScale();   // 원작은 화면을 바꿀 때만 1 로 되돌림 — 연출이 아닐 때는 늘 1
		if (skipping) {   // 기본 창 대사(모드 "창")도 넘김 (뜬 뒤 0.05초 — 실제 시간). 선택지 · 입력 기다리기는 건드리지 않음
			EventInterpreter.WndMakerText c = topClassic();
			if (c == null) classicT = 0; else if ((classicT += Game.elapsed / Math.max(0.0001f, Game.timeScale)) > 0.05f) { classicT = 0; c.hide(); }
		}
	}
	/** 연출이 시작될 때의 배속: 1 (테스트 플레이 실행 환경의 "연출 시작 배속"이 있으면 그것 — 테스트용) */
	static int startSpeed() {
		int s = MakerTestEnv.on() ? MakerTestEnv.env.getInt("speed", 1) : 1;
		for (int v : SPEEDS) if (v == s) return v;
		return 1;
	}

	// ------------------------------------------------------------ 조작 (화면 단추 · 키 · 자동 테스트)

	/** 배속 바꾸기 — 연출 중에만 (일반 플레이에서는 무시: 표시도 없고 시간도 1) */
	public static boolean setSpeed(int v) {
		if (!active()) { MakerRuntime.log("배속: 연출 중이 아닙니다 (일반 플레이는 늘 1×)"); return false; }
		for (int s : SPEEDS) if (s == v) { speed = v; skipping = false; wasActive = true; Game.timeScale = timeScale(); return true; }
		return false;
	}
	static void cycleSpeed() { int i = 0; for (int k = 0; k < SPEEDS.length; k++) if (SPEEDS[k] == speed) i = k; setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); }
	/** 스킵 켜기/끄기 — 실행 중인 이벤트가 있을 때만 켬. 끄면 1×, 이벤트가 끝나도 1× */
	public static void toggleSkip() {
		if (skipping) { skipping = false; speed = 1; Game.timeScale = timeScale(); MakerRuntime.log("스킵 끔 — 배속 1×"); return; }
		if (!EventInterpreter.busy()) { MakerRuntime.log("스킵: 실행 중인 이벤트가 없습니다"); return; }
		skipping = true; wasActive = true; Game.timeScale = timeScale();
		MakerRuntime.log("스킵 — 이 이벤트가 끝날 때까지 (선택지 · 입력 기다리기에서는 멈춤)");
		completeLine();
	}
	static MakerDialogue.Wnd topLine() {
		if (Game.scene() == null) return null;
		MakerDialogue.Wnd top = null; Group sc = Game.scene();
		for (int i = 0; i < sc.length; i++) { Gizmo g = MakerDialogue.HudHider.member(sc, i); if (g instanceof MakerDialogue.Wnd && g.alive) top = (MakerDialogue.Wnd) g; }
		return top;
	}
	static EventInterpreter.WndMakerText topClassic() {
		if (Game.scene() == null) return null;
		EventInterpreter.WndMakerText top = null; Group sc = Game.scene();
		for (int i = 0; i < sc.length; i++) { Gizmo g = MakerDialogue.HudHider.member(sc, i); if (g instanceof EventInterpreter.WndMakerText && g.alive) top = (EventInterpreter.WndMakerText) g; }
		return top;
	}
	/** 대사 완성 — 지금 대사의 글자 · 연출을 끝까지 (창은 그대로) */
	public static void completeLine() { MakerDialogue.Wnd w = topLine(); if (w != null) w.complete(); }
	/** 다음 대사 — 대사창이면 그 창의 규칙대로 (선택지는 열기만), 원작 모양 대사 창이면 닫음 */
	public static void nextLine() { MakerDialogue.Wnd w = topLine(); if (w != null) { w.next(); return; } EventInterpreter.WndMakerText c = topClassic(); if (c != null) c.hide(); }

	/** 배속 표시줄을 쓰는가: 테스트 플레이 · 또는 project.json cutsceneSpeed */
	static boolean barEnabled() {
		if (MakerTestEnv.on()) return true;
		return MakerRuntime.project != null && MakerRuntime.project.getBoolean("cutsceneSpeed", false);
	}

	/** 배속 표시줄 단추의 화면(창) 픽셀 가운데 — 자동 테스트가 진짜 마우스로 누를 때 (없으면 null) */
	public static float[] barButton(String label) {
		Bar b = Bar.current;
		if (b == null || !b.visible || b.camera == null) return null;
		for (Bar.Seg s : b.segs) if (s.t != null && label.equals(s.label)) return new float[]{ (s.x + s.w / 2f) * b.camera.zoom, (s.y + s.h / 2f) * b.camera.zoom };
		return null;
	}
	public static String debugState() {
		Bar b = Bar.current;
		return "active=" + wasActive + " why=" + (why().isEmpty() ? "-" : why()) + " speed=" + speed + (skipping ? "(skip)" : "") + " timeScale=" + Game.timeScale
				+ " bar=" + (b == null ? "none" : (b.visible ? "shown" : "hidden") + (b.visible ? String.format(java.util.Locale.ROOT, " [%.0f,%.0f %.0fx%.0f] in=%s", b.x0, b.y0, b.w, b.h, b.inside()) : ""));
	}

	// ------------------------------------------------------------ 게임 화면마다 하나 (MakerAssets.onSceneCreate)

	public static void onSceneCreate(PixelScene scene) {
		if (scene instanceof GameScene) scene.add(new Bar());
		else { Game.timeScale = 1f; wasActive = false; speed = 1; skipping = false; }   // 게임 화면이 아님 (타이틀 · 층 이동) — 연출 상태를 남기지 않음
	}

	static class Bar extends Group {
		static Bar current;
		final List<Seg> segs = new ArrayList<>();
		RenderedTextBlock label;
		ColorBlock bg;
		final ColorBlock[] tri = new ColorBlock[3];   // ▶ (게임 글꼴에 ▶ 글자가 없어 점 3줄로 그림)
		float x0, y0, w, h;
		int builtVersion = -1;
		Integer held;
		final Signal.Listener<PointerEvent> touches = new Signal.Listener<PointerEvent>() {
			@Override public boolean onSignal(PointerEvent e) {
				if (e == null || !visible) return false;   // 원작은 끄는 동안 null 을 보냄
				float ux = e.current.x / camera.zoom, uy = e.current.y / camera.zoom;
				if (e.type == PointerEvent.Type.DOWN) for (Seg s : segs) if (s.hit(ux, uy)) { held = e.id; s.press(); return true; }
				if (e.type == PointerEvent.Type.UP && held != null && held == e.id) { held = null; return true; }
				return false;
			}
		};
		final Signal.Listener<KeyEvent> keys = new Signal.Listener<KeyEvent>() {
			@Override public boolean onSignal(KeyEvent e) {
				if (e == null || !e.pressed || !visible) return false;
				if (e.code == Input.Keys.F6) { cycleSpeed(); return true; }
				if (e.code == Input.Keys.F10) { toggleSkip(); return true; }
				return false;
			}
		};
		Bar() { current = this; visible = false; }
		void build() {
			builtVersion = MakerTheme.version;
			clear(); segs.clear();
			camera = PixelScene.uiCamera;
			bg = new ColorBlock(1, 1, 0xFF000000); bg.camera = camera; add(bg);
			for (int i = 0; i < 3; i++) { tri[i] = new ColorBlock(1, 5 - i * 2, 0xFFFFFFFF); tri[i].camera = camera; add(tri[i]); }
			label = PixelScene.renderTextBlock("1x", 6); label.camera = camera; add(label);
			for (int i = 0; i < SPEEDS.length; i++) segs.add(new Seg(i, SPEEDS[i] + "x"));
			segs.add(new Seg(-1, "스킵"));
		}
		@Override public void update() {
			if (members == null) return;
			current = this;
			frame();
			boolean show = barEnabled() && wasActive && PixelScene.uiCamera != null;
			if (show && (builtVersion != MakerTheme.version || bg == null)) build();
			visible = show;
			if (show) {
				KeyEvent.removeKeyListener(keys); KeyEvent.addKeyListener(keys);   // 대사창이 모든 키 · 누름을 먹으므로 매 프레임 맨 앞으로
				PointerEvent.removePointerListener(touches); PointerEvent.addPointerListener(touches);
				layout();
				if (parent != null && MakerDialogue.HudHider.member(parent, parent.length - 1) != this) parent.bringToFront(this);
			} else { KeyEvent.removeKeyListener(keys); PointerEvent.removePointerListener(touches); }
			super.update();
		}
		/** 자리: 대사창이 있으면 그 위(이름표 반대쪽), 없으면 화면 아래 가운데 (원작 도구 모음 위) — 안전 영역 안 */
		void layout() {
			int text = MakerTheme.c("text"), accent = MakerTheme.c("accent");
			label.text(skipping ? "16x 스킵" : speed + "x");
			label.hardlight(accent);
			float pad = 2, gap = 1, sh = 9;
			float lw = label.width() + pad * 2 + 5;   // ▶ + 글
			float total = lw + gap;
			for (Seg s : segs) { s.w = Math.max(11, s.t.width() + 4); total += s.w + gap; }
			w = total + pad - gap; h = sh + pad * 2;
			float W = camera.width, H = camera.height;
			float[] sa = MakerDialogue.safeArea(W, H);
			float left = sa[0], top = sa[1], right = sa[0] + sa[2], bottom = sa[1] + sa[3];
			MakerDialogue.Wnd d = topLine();
			float x, y;
			if (d != null && d.box != null && d.box.visible) {
				boolean plateRight = d.plate != null && d.plate.x + d.plate.width / 2f > d.box.x + d.box.width / 2f;
				y = d.box.y - h - 2 - (d.plate != null ? d.plate.height : 0);
				x = plateRight ? d.box.x + 2 : d.box.x + d.box.width - w - 2;
				if (d.plate != null && !plateRight) x = Math.max(x, d.plate.x + d.plate.width + 2);
			} else {
				float barBottom = bottom;
				Toolbar tb = toolbar();
				if (tb != null && tb.visible && tb.top() < bottom) barBottom = Math.min(barBottom, tb.top());
				y = barBottom - h - 2; x = (left + right - w) / 2f;
			}
			x = Math.max(left + 1, Math.min(right - w - 1, x)); y = Math.max(top + 1, Math.min(bottom - h - 1, y));
			x0 = x; y0 = y;
			bg.x = x; bg.y = y; bg.size(w, h); bg.hardlight(MakerTheme.c("panel")); bg.alpha(0.85f);
			for (int i = 0; i < 3; i++) { tri[i].x = x + pad + i; tri[i].y = y + h / 2f - (5 - i * 2) / 2f; tri[i].hardlight(accent); PixelScene.align(tri[i]); }
			label.setPos(x + pad + 5, y + (h - label.height()) / 2f); PixelScene.align(label);
			float cx = x + lw + gap;
			for (Seg s : segs) {
				boolean on = s.i < 0 ? skipping : !skipping && SPEEDS[s.i] == speed;
				s.place(cx, y + pad, s.w, sh, on, text, accent);
				cx += s.w + gap;
			}
		}
		/** 안전 영역 안인지 (자동 테스트) */
		boolean inside() {
			float[] sa = MakerDialogue.safeArea(camera.width, camera.height);
			return x0 >= sa[0] - 0.5f && y0 >= sa[1] - 0.5f && x0 + w <= sa[0] + sa[2] + 0.5f && y0 + h <= sa[1] + sa[3] + 0.5f;
		}
		Toolbar toolbar() {
			Group sc = Game.scene(); if (sc == null) return null;
			for (int i = 0; i < sc.length; i++) { Gizmo g = MakerDialogue.HudHider.member(sc, i); if (g instanceof Toolbar) return (Toolbar) g; }
			return null;
		}
		@Override public void destroy() { KeyEvent.removeKeyListener(keys); PointerEvent.removePointerListener(touches); if (current == this) current = null; super.destroy(); }

		/** 단추 하나 — 고른 것 = 강조 바탕 + 아래 줄 (색만으로 구분하지 않음) */
		class Seg {
			final int i; final String label; final ColorBlock bg, mark; final RenderedTextBlock t; float x, y, w = 11, h;
			Seg(int i, String label) {
				this.i = i; this.label = label;
				bg = new ColorBlock(1, 1, 0xFFFFFFFF); bg.camera = PixelScene.uiCamera; Bar.this.add(bg);
				mark = new ColorBlock(1, 1, 0xFFFFFFFF); mark.camera = PixelScene.uiCamera; Bar.this.add(mark);
				t = PixelScene.renderTextBlock(label, 5); t.camera = PixelScene.uiCamera; Bar.this.add(t);
			}
			void place(float x, float y, float w, float h, boolean on, int text, int accent) {
				this.x = x; this.y = y; this.w = w; this.h = h;
				bg.x = x; bg.y = y; bg.size(w, h); bg.hardlight(on ? MakerTheme.c("buttonOn") : MakerTheme.c("button")); bg.alpha(on ? 0.95f : 0.8f);
				mark.x = x + 2; mark.y = y + h - 1; mark.size(w - 4, 1); mark.hardlight(text); mark.visible = on;
				t.hardlight(text);   // 게임 글꼴은 검은 테두리가 있어 밝은 바탕 + 어두운 글은 뭉개짐 — 글은 늘 본문색, 고른 것은 바탕 + 아래 줄
				t.setPos(x + (w - t.width()) / 2f, y + (h - t.height()) / 2f); PixelScene.align(t);
			}
			boolean hit(float px, float py) { return px >= x && py >= y && px < x + w && py < y + h; }
			void press() { if (i < 0) toggleSkip(); else setSpeed(SPEEDS[i]); }
		}
	}
}
