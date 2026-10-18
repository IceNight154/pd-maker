/*
 * PDMaker — 테스트 플레이 실행 환경 · 배속 · 스킵 (5차)
 *   켜지는 때: 편집기의 ▶ 테스트 플레이가 -Dpdmaker.testenv=<JSON> 을 넘겼을 때만 (내보낸 게임 · 안드로이드에서는 아무것도 하지 않음)
 *   JSON = 편집기 PDM.testEnv.resolve 결과: { env, name, kind, device:[w,h], dpi, zoom, logical:[w,h], window:[w,h], winZoom, iface, insets:[l,t,r,b], rotate, touch, debug, speed }
 *
 *   적용 (첫 화면에서 한 번): 창 크기(window) · 인터페이스 크기(iface: 0 = 휴대폰 배치) · 화면 배율(winZoom — 논리 화면이 기기와 같게)
 *     ※ 인터페이스 크기 · 화면 배율은 게임 설정(SPDSettings)에 저장됨 — 테스트 플레이의 게임 설정이 바뀜 (프로젝트 · 맵 데이터와는 상관없음)
 *   안전 영역 미리보기(insets, 창 px): PDMaker 대사창 · 선택지(MakerDialogue.safeArea)가 피하고 화면에 어둡게 표시. 원작 HUD 는 실제 기기 값만 따름
 *   F9 = 화면 돌리기(rotate 일 때 — 창 가로 ↔ 세로, 안전 영역도 함께 돌림) · 터치 표시(touch) · 디버그 정보(debug)
 *
 *   배속 (1 · 2 · 4 · 16): Game.timeScale — 게임의 모든 화면 시간(대사 글자 · 저절로 넘김 · 페이드 · 대기 · 일러스트 움직이기 · 캐릭터 움직임 · 효과)이 한 시계로 빨라짐.
 *     게임 차례(턴) 순서 · 이벤트 명령 순서는 그대로 (시간만 빨라짐). 소리는 그대로. 원작은 화면을 바꿀 때 timeScale 을 1 로 되돌려서 매 프레임 다시 넣음
 *   대사 완성 = 지금 대사의 글자를 다 보이기 (입력을 기다림) · 다음 대사 = 지금 대사를 닫고 다음 명령 (선택지가 있으면 선택지를 열기만 — 고르지 않음)
 *   스킵 = 지금 실행 중인 이벤트가 끝날 때까지: 대사는 바로 다 보이고 저절로 넘김, 시간은 16배. 선택지 · 입력 기다리기는 멈춤(사람이 정함).
 *          이벤트가 끝나거나 다시 누르면 꺼지고 배속은 스킵 전 값으로 돌아감
 *   단축키 (테스트 플레이만): F6 배속 바꾸기 · F7 대사 완성 · F8 다음 대사 · F10 스킵 · F9 화면 돌리기 · F12 디버그 정보 켜고 끄기
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.Input;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.SPDSettings;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.watabou.input.KeyEvent;
import com.watabou.input.PointerEvent;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Game;
import com.watabou.noosa.Group;
import com.watabou.utils.Signal;

import java.util.ArrayList;
import java.util.List;

public class MakerTestEnv {

	static JsonValue env;
	static boolean read, applied;
	static float[] insets = new float[4];   // 창 px (l, t, r, b)
	public static final int[] SPEEDS = {1, 2, 4, 16};
	static int speed = 1, speedBeforeSkip = 1;
	static boolean skipping, debugOn;

	/** 테스트 플레이 실행 환경이 있는지 (-Dpdmaker.testenv) */
	public static boolean on() {
		if (!read) {
			read = true;
			String p = System.getProperty("pdmaker.testenv");
			if (p != null && !p.trim().isEmpty()) {
				try {
					env = new JsonReader().parse(p);
					JsonValue in = env.get("insets");
					if (in != null && in.size == 4) for (int i = 0; i < 4; i++) insets[i] = Math.max(0, in.getFloat(i));
					int sp = env.getInt("speed", 1); for (int v : SPEEDS) if (v == sp) speed = v;
					debugOn = env.getBoolean("debug", true);
					MakerRuntime.log("테스트 실행 환경: " + env.getString("name", "?") + " · 창 " + arr(env, "window") + " · 배율 ×" + env.getInt("winZoom", 0) + " · 안전 영역 " + arr(env, "insets") + " · 배속 " + speed + "×");
				} catch (Throwable t) { MakerRuntime.log("테스트 실행 환경을 읽지 못했습니다 (기본으로 실행): " + t); env = null; }
			}
		}
		return env != null;
	}
	static String arr(JsonValue v, String k) { JsonValue a = v.get(k); if (a == null) return "-"; StringBuilder b = new StringBuilder(); for (JsonValue x : a) b.append(b.length() > 0 ? "×" : "").append(x.asInt()); return b.toString(); }

	/** 안전 영역 미리보기 (창 px) — MakerDialogue.safeArea 가 기기 값과 함께 씀 */
	public static float[] insets() { return on() ? insets : new float[4]; }
	public static int speed() { return on() ? (skipping ? 16 : speed) : 1; }
	public static boolean skipping() { return on() && skipping; }

	/** 모든 PixelScene 이 만들어질 때 (MakerAssets.onSceneCreate) */
	public static void onSceneCreate(PixelScene scene) {
		if (!on()) return;
		scene.add(new Overlay());   // 만드는 것은 첫 프레임에 (지금은 장면을 만드는 중이라 uiCamera 가 아직 없음)
	}
	/** 창 크기 · 인터페이스 크기 · 배율 — 창 크기가 바뀌면 게임이 화면을 다시 만들며 새 배율로 그림 */
	static void applyWindow() {
		try {
			int iface = env.getInt("iface", -1), z = env.getInt("winZoom", 0);
			if (iface >= 0) SPDSettings.interfaceSize(iface);
			if (z > 0) SPDSettings.scale(z);
			JsonValue w = env.get("window");
			if (w != null && w.size == 2) setWindow(w.getInt(0), w.getInt(1));
		} catch (Throwable t) { MakerRuntime.log("테스트 실행 환경 적용 오류: " + t); }
	}
	/** 창 크기 (데스크톱 판의 최소 창 크기 720×400 을 풀어야 세로 비율이 됨 — 백엔드 클래스를 직접 쓰지 않으려고 리플렉션) */
	static void setWindow(int w, int h) {
		try { Object win = Gdx.graphics.getClass().getMethod("getWindow").invoke(Gdx.graphics); win.getClass().getMethod("setSizeLimits", int.class, int.class, int.class, int.class).invoke(win, 1, 1, -1, -1); }
		catch (Throwable ignored) { /* 데스크톱이 아님 */ }
		Gdx.graphics.setWindowedMode(w, h);
	}
	/** F9: 가로 ↔ 세로 — 편집기가 미리 센 돌린 방향(rotated: 그 방향의 창 · 배율 · 안전 영역)과 처음 방향을 오감 (한 번 더 누르면 처음으로) */
	static boolean turned;
	public static void rotate() {
		JsonValue r = env.get("rotated");
		if (!env.getBoolean("rotate", true) || r == null || !r.isObject()) { MakerRuntime.log("화면 돌리기: 실행 환경에서 꺼져 있습니다 (휴대폰 환경 · 돌리기 켬에서만)"); return; }
		turned = !turned;
		JsonValue o = turned ? r : env;
		JsonValue in = o.get("insets");
		for (int i = 0; i < 4; i++) insets[i] = in != null && in.size == 4 ? Math.max(0, in.getFloat(i)) : 0;
		SPDSettings.interfaceSize(env.getInt("iface", 0));
		if (o.getInt("winZoom", 0) > 0) SPDSettings.scale(o.getInt("winZoom", 0));
		JsonValue w = o.get("window");
		int ow = Gdx.graphics.getWidth(), oh = Gdx.graphics.getHeight();
		if (w != null && w.size == 2) setWindow(w.getInt(0), w.getInt(1));
		MakerRuntime.log("화면 돌리기: " + ow + "×" + oh + " → " + arr(o, "window") + " (기기 " + arr(o, "device") + " → UI " + arr(o, "logical") + ")");
	}
	public static void setSpeed(int v) { for (int s : SPEEDS) if (s == v) { speed = v; if (skipping) speedBeforeSkip = v; } }
	static void cycleSpeed() { int i = 0; for (int k = 0; k < SPEEDS.length; k++) if (SPEEDS[k] == speed) i = k; setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); }
	/** 스킵 켜기/끄기 — 실행 중인 이벤트가 없으면 켜지 않음 */
	public static void toggleSkip() {
		if (skipping) { skipping = false; speed = speedBeforeSkip; MakerRuntime.log("스킵 끝 — 배속 " + speed + "× 로"); return; }
		if (!EventInterpreter.busy()) { MakerRuntime.log("스킵: 실행 중인 이벤트가 없습니다"); return; }
		speedBeforeSkip = speed; skipping = true; MakerRuntime.log("스킵 — 이 이벤트가 끝날 때까지 (선택지 · 입력 기다리기에서는 멈춤)");
		completeLine();
	}
	/** 떠 있는 대사창 (맨 위) */
	static MakerDialogue.Wnd topLine() {
		if (Game.scene() == null) return null;
		MakerDialogue.Wnd top = null;
		for (Object g : members(Game.scene())) if (g instanceof MakerDialogue.Wnd && ((MakerDialogue.Wnd) g).alive) top = (MakerDialogue.Wnd) g;
		return top;
	}
	static List<Object> members(Group g) {
		List<Object> out = new ArrayList<>();
		for (int i = 0; i < g.length; i++) { Object m = MakerDialogue.HudHider.member(g, i); if (m != null) out.add(m); }
		return out;
	}
	/** 떠 있는 기본 창 대사 (대사창 모드 "창" — 글자가 한 번에 나옴) */
	static EventInterpreter.WndMakerText topClassic() {
		if (Game.scene() == null) return null;
		EventInterpreter.WndMakerText top = null;
		for (Object g : members(Game.scene())) if (g instanceof EventInterpreter.WndMakerText && ((EventInterpreter.WndMakerText) g).alive) top = (EventInterpreter.WndMakerText) g;
		return top;
	}
	public static void completeLine() { MakerDialogue.Wnd w = topLine(); if (w != null) w.complete(); }
	/** 다음 대사: 대사창이면 그 창의 규칙대로 (선택지는 넘기지 않음), 기본 창 대사면 창을 닫음 */
	public static void nextLine() { MakerDialogue.Wnd w = topLine(); if (w != null) { w.next(); return; } EventInterpreter.WndMakerText c = topClassic(); if (c != null) c.hide(); }

	/** 상태 한 줄 (자동 테스트 tools/playtest "testenv") */
	public static String debugState() {
		return "on=" + on() + " speed=" + speed() + (skipping ? "(skip)" : "") + " timeScale=" + Game.timeScale + " window=" + Gdx.graphics.getWidth() + "x" + Gdx.graphics.getHeight()
				+ " ui=" + PixelScene.uiCamera.width + "x" + PixelScene.uiCamera.height + " z" + PixelScene.defaultZoom + " landscape=" + PixelScene.landscape()
				+ " turned=" + turned + " insets=" + (int) insets[0] + "," + (int) insets[1] + "," + (int) insets[2] + "," + (int) insets[3];
	}

	// ------------------------------------------------------------ 화면 위 표시 (장면마다 하나, uiCamera)

	static class Overlay extends Group {
		final List<ColorBlock> bars = new ArrayList<>();
		final List<float[]> taps = new ArrayList<>();   // {x, y, t}
		final List<ColorBlock> tapDots = new ArrayList<>();
		RenderedTextBlock info;
		final List<Btn> btns = new ArrayList<>();
		float infoT = 1f, fps, classicT; int frames;
		final Signal.Listener<KeyEvent> keys = new Signal.Listener<KeyEvent>() {
			@Override public boolean onSignal(KeyEvent e) {
				if (!e.pressed) return false;
				switch (e.code) {
					case Input.Keys.F6: cycleSpeed(); relabel(); return true;
					case Input.Keys.F7: completeLine(); return true;
					case Input.Keys.F8: nextLine(); return true;
					case Input.Keys.F10: toggleSkip(); relabel(); return true;
					case Input.Keys.F9: rotate(); return true;
					case Input.Keys.F12: debugOn = !debugOn; return true;
				}
				return false;
			}
		};
		Integer held = null;   // 단추를 누른 포인터 (떼는 것까지 이 단추가 받음 — 아래 창이 클릭으로 받지 않게)
		final Signal.Listener<PointerEvent> touches = new Signal.Listener<PointerEvent>() {
			@Override public boolean onSignal(PointerEvent e) {
				float ux = e.current.x / camera.zoom, uy = e.current.y / camera.zoom;
				if (e.type == PointerEvent.Type.DOWN && env.getBoolean("touch", false)) synchronized (taps) { taps.add(new float[]{ ux, uy, 0 }); }
				if (e.type == PointerEvent.Type.DOWN) for (Btn b : btns) if (b.hit(ux, uy)) { held = e.id; b.press(); return true; }
				if (e.type == PointerEvent.Type.UP && held != null && held == e.id) { held = null; return true; }
				return false;
			}
		};
		boolean built;
		/** 첫 프레임: (처음 한 번) 창 크기 · 배율 적용, 단추 · 표시 만들기 */
		void build() {
			built = true;
			if (!applied) { applied = true; applyWindow(); }
			camera = PixelScene.uiCamera;
			KeyEvent.addKeyListener(keys);
			PointerEvent.addPointerListener(touches);
			float W = camera.width, H = camera.height, z = camera.zoom;
			// 안전 영역 미리보기: 막힌 곳을 어둡게
			float[][] r = { {0, 0, insets[0] / z, H}, {0, 0, W, insets[1] / z}, {W - insets[2] / z, 0, insets[2] / z, H}, {0, H - insets[3] / z, W, insets[3] / z} };
			for (float[] q : r) if (q[2] > 0 && q[3] > 0) { ColorBlock b = new ColorBlock(q[2], q[3], 0x88000000); b.x = q[0]; b.y = q[1]; b.camera = camera; add(b); bars.add(b); }
			// 배속 · 스킵 단추 (위 가운데, 작게) — 누르기 · 클릭 모두
			String[] labels = { "1×", "2×", "4×", "16×", "완성", "다음", "스킵" };
			float bw = 15, bh = 9, gap = 1, total = labels.length * bw + (labels.length - 1) * gap + 6, x0 = (W - total) / 2f, y0 = 1 + insets[1] / z;
			for (int i = 0; i < labels.length; i++) { Btn b = new Btn(i, labels[i]); b.setRect(x0 + i * (bw + gap) + (i >= 4 ? 6 : 0), y0, bw, bh); btns.add(b); }
			info = PixelScene.renderTextBlock("", 5); info.camera = camera; info.maxWidth((int) (W - 4 - (insets[0] + insets[2]) / z)); add(info);   // 좁은 세로 화면에서는 줄을 바꿈
			relabel();
		}
		void relabel() { for (Btn b : btns) b.on(b.i < 4 ? !skipping && SPEEDS[b.i] == speed : b.i == 6 && skipping); }
		@Override public void update() {
			if (!built) { if (PixelScene.uiCamera == null) return; build(); }
			Game.timeScale = speed();   // 매 프레임 (원작이 화면을 바꿀 때 1 로 되돌림)
			// 입력 순서: 나중에 등록한 것이 먼저 받음(원작 Signal stackMode) — 대사창 · 입력 기다리기 창이 모든 키 · 화면 누름을 먹으므로 매 프레임 맨 앞으로
			KeyEvent.removeKeyListener(keys); KeyEvent.addKeyListener(keys);
			PointerEvent.removePointerListener(touches); PointerEvent.addPointerListener(touches);
			if (skipping) {   // 기본 창 대사도 넘김 (뜬 뒤 0.05초 — 실제 시간). 선택지 창(WndOptions) · 입력 기다리기는 건드리지 않음
				EventInterpreter.WndMakerText c = topClassic();
				if (c == null) classicT = 0; else if ((classicT += Game.elapsed / Math.max(0.0001f, Game.timeScale)) > 0.05f) { classicT = 0; c.hide(); }
			}
			if (skipping && !EventInterpreter.busy()) { skipping = false; speed = speedBeforeSkip; relabel(); MakerRuntime.log("스킵 끝 (이벤트가 끝남) — 배속 " + speed + "× 로"); }
			super.update();
			float dt = Game.elapsed / Math.max(0.0001f, Game.timeScale);   // 실제 시간
			frames++; infoT += dt;
			if (infoT >= 0.5f) { fps = frames / infoT; frames = 0; infoT = 0;
				info.visible = debugOn;
				if (debugOn) {
					info.text(env.getString("name", "") + (turned ? " (돌림)" : "") + "  창 " + Gdx.graphics.getWidth() + "×" + Gdx.graphics.getHeight() + "  UI " + (int) camera.width + "×" + (int) camera.height + " ×" + (int) camera.zoom
							+ (insets[0] + insets[1] + insets[2] + insets[3] > 0 ? "  안전 " + (int) insets[0] + "," + (int) insets[1] + "," + (int) insets[2] + "," + (int) insets[3] : "")
							+ "  " + speed() + "×" + (skipping ? " 스킵" : "") + "  " + Math.round(fps) + "fps");
					info.setPos(2 + insets[0] / camera.zoom, 12 + insets[1] / camera.zoom);   // 위 왼쪽 (배속 단추 아래) — 대사창(아래)을 가리지 않게
				}
				relabel();
			}
			synchronized (taps) {   // 터치 표시: 누른 자리에 0.4초 동안 사라지는 점
				for (float[] t : taps) t[2] += dt;
				taps.removeIf(t -> t[2] > 0.4f);
				while (tapDots.size() < taps.size()) { ColorBlock d = new ColorBlock(8, 8, 0xFFFFFFFF); d.camera = camera; add(d); tapDots.add(d); }
				for (int i = 0; i < tapDots.size(); i++) { ColorBlock d = tapDots.get(i); if (i < taps.size()) { float[] t = taps.get(i); float s = 4 + 10 * t[2]; d.size(s, s); d.x = t[0] - s / 2; d.y = t[1] - s / 2; d.alpha(0.6f * (1 - t[2] / 0.4f)); d.visible = true; } else d.visible = false; }
			}
			bringToTop();
		}
		/** 그림 순서: 맨 위 (단, 창보다는 아래로 두지 않으려고 — 창이 새로 떠도 위로) */
		void bringToTop() { if (parent != null && MakerDialogue.HudHider.member(parent, parent.length - 1) != this) parent.bringToFront(this); }
		@Override public void destroy() { KeyEvent.removeKeyListener(keys); PointerEvent.removePointerListener(touches); super.destroy(); }

		/** 배속 · 스킵 단추 (그림 + 칸 — 누르기는 Overlay 의 포인터 받기에서 hit) */
		class Btn {
			final int i; final ColorBlock bg, mark; final RenderedTextBlock t; float x, y, w, h;
			Btn(int i, String label) {
				this.i = i;
				bg = new ColorBlock(1, 1, 0xFFFFFFFF); bg.camera = PixelScene.uiCamera; Overlay.this.add(bg);
				mark = new ColorBlock(1, 1, 0xFFFFFFFF); mark.camera = PixelScene.uiCamera; Overlay.this.add(mark);   // 고른 단추 = 밑줄 (색만으로 구분하지 않음)
				t = PixelScene.renderTextBlock(label, 5); t.camera = PixelScene.uiCamera; Overlay.this.add(t);
			}
			void setRect(float x, float y, float w, float h) { this.x = x; this.y = y; this.w = w; this.h = h; bg.x = x; bg.y = y; bg.size(w, h); mark.x = x + 2; mark.y = y + h - 1; mark.size(w - 4, 1); t.setPos(x + (w - t.width()) / 2f, y + (h - t.height()) / 2f); PixelScene.align(t); }
			boolean hit(float px, float py) { return bg.visible && px >= x && py >= y && px < x + w && py < y + h; }
			void on(boolean v) { bg.hardlight(v ? 0x1E7F74 : 0x1A1D21); bg.alpha(v ? 0.95f : 0.75f); t.hardlight(0xFFFFFF); mark.visible = v; }
			void press() {
				if (i < 4) { setSpeed(SPEEDS[i]); if (skipping) { skipping = false; speed = SPEEDS[i]; } }
				else if (i == 4) completeLine(); else if (i == 5) nextLine(); else toggleSkip();
				relabel();
			}
		}
	}
}
