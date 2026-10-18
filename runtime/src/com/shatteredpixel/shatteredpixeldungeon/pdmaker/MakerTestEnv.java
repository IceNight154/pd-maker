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
 *   6차: 배속 · 스킵 · 대사 완성 · 다음 대사는 MakerCutscene (연출 중에만 화면 아래 배속 표시줄 · 끝나면 1×). 여기는 실행 환경(창 · 배율 · 안전 영역 ·
 *     돌리기 · 터치 표시 · 디버그 정보)과 테스트용 키(F7 완성 · F8 다음 · F9 돌리기 · F12 디버그)만. env.speed = 연출이 시작될 때의 배속 (테스트용)
 *   (5차 설명 — 지금은 MakerCutscene) 배속 (1 · 2 · 4 · 16): Game.timeScale — 게임의 모든 화면 시간(대사 글자 · 저절로 넘김 · 페이드 · 대기 · 일러스트 움직이기 · 캐릭터 움직임 · 효과)이 한 시계로 빨라짐.
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
	public static final int[] SPEEDS = MakerCutscene.SPEEDS;
	static boolean debugOn;

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
					debugOn = env.getBoolean("debug", true);
					MakerRuntime.log("테스트 실행 환경: " + env.getString("name", "?") + " · 창 " + arr(env, "window") + " · 배율 ×" + env.getInt("winZoom", 0) + " · 안전 영역 " + arr(env, "insets") + " · 연출 시작 배속 " + env.getInt("speed", 1) + "×");
				} catch (Throwable t) { MakerRuntime.log("테스트 실행 환경을 읽지 못했습니다 (기본으로 실행): " + t); env = null; }
			}
		}
		return env != null;
	}
	static String arr(JsonValue v, String k) { JsonValue a = v.get(k); if (a == null) return "-"; StringBuilder b = new StringBuilder(); for (JsonValue x : a) b.append(b.length() > 0 ? "×" : "").append(x.asInt()); return b.toString(); }

	/** 안전 영역 미리보기 (창 px) — MakerDialogue.safeArea 가 기기 값과 함께 씀 */
	public static float[] insets() { return on() ? insets : new float[4]; }
	/** 지금 시간 배율 (연출 중이 아니면 1 — MakerCutscene) */
	public static int speed() { return MakerCutscene.timeScale(); }
	public static boolean skipping() { return MakerCutscene.skipping(); }

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
		// 자동 테스트 전용: Windows 의 LWJGL3 처럼 창 크기를 바꾸는 그 자리에서 resize → render 를 부름 (Linux xvfb 는 늦게 와서 그대로는 재현되지 않음)
		if (Boolean.getBoolean("pdmaker.testSyncResize")) { Gdx.app.getApplicationListener().resize(w, h); Gdx.app.getApplicationListener().render(); }
	}
	/** F9: 가로 ↔ 세로 — 편집기가 미리 센 돌린 방향(rotated: 그 방향의 창 · 배율 · 안전 영역)과 처음 방향을 오감 (한 번 더 누르면 처음으로) */
	static boolean turned, rotateAsked;
	/** F9 · 자동 테스트: 돌리기를 부탁만 함 — 실제로는 Overlay.update 첫머리에서 (키 처리 · 다른 스레드 한가운데서 창 크기를 바꾸면
	 *  Windows 등에서 그 자리에서 다시 그리며 장면이 바뀌어, 처리 중이던 입력 · 장면이 없어진 채로 이어질 수 있음) */
	public static void rotate() { rotateAsked = true; }
	static void doRotate() {
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
	// 배속 · 스킵 · 대사 넘기기는 MakerCutscene (6차) — 예전 이름은 자동 테스트 · 플러그인을 위해 그대로 둠
	public static void setSpeed(int v) { MakerCutscene.setSpeed(v); }
	public static void toggleSkip() { MakerCutscene.toggleSkip(); }
	public static void completeLine() { MakerCutscene.completeLine(); }
	public static void nextLine() { MakerCutscene.nextLine(); }

	/** 상태 한 줄 (자동 테스트 tools/playtest "testenv") */
	public static String debugState() {
		return "on=" + on() + " speed=" + speed() + (skipping() ? "(skip)" : "") + " timeScale=" + Game.timeScale + " window=" + Gdx.graphics.getWidth() + "x" + Gdx.graphics.getHeight()
				+ " ui=" + PixelScene.uiCamera.width + "x" + PixelScene.uiCamera.height + " z" + PixelScene.defaultZoom + " landscape=" + PixelScene.landscape()
				+ " turned=" + turned + " insets=" + (int) insets[0] + "," + (int) insets[1] + "," + (int) insets[2] + "," + (int) insets[3];
	}

	// ------------------------------------------------------------ 화면 위 표시 (장면마다 하나, uiCamera)

	static class Overlay extends Group {
		final List<ColorBlock> bars = new ArrayList<>();
		final List<float[]> taps = new ArrayList<>();   // {x, y, t}
		final List<ColorBlock> tapDots = new ArrayList<>();
		RenderedTextBlock info;
		float infoT = 1f, fps; int frames;
		final Signal.Listener<KeyEvent> keys = new Signal.Listener<KeyEvent>() {
			@Override public boolean onSignal(KeyEvent e) {
				if (e == null || !e.pressed) return false;
				switch (e.code) {
					case Input.Keys.F7: completeLine(); return true;   // F6 배속 · F10 스킵 = 배속 표시줄 (연출 중에만, MakerCutscene.Bar)
					case Input.Keys.F8: nextLine(); return true;
					case Input.Keys.F9: rotate(); return true;
					case Input.Keys.F12: debugOn = !debugOn; return true;
				}
				return false;
			}
		};
		final Signal.Listener<PointerEvent> touches = new Signal.Listener<PointerEvent>() {
			@Override public boolean onSignal(PointerEvent e) {
				if (e == null) return false;   // 원작은 누른 채 끌 때(같은 종류가 이어질 때) null 을 보냄 — 예전엔 여기서 NullPointerException
				float ux = e.current.x / camera.zoom, uy = e.current.y / camera.zoom;
				if (e.type == PointerEvent.Type.DOWN && env.getBoolean("touch", false)) synchronized (taps) { taps.add(new float[]{ ux, uy, 0 }); }
				return false;   // 터치 표시만 — 누름은 그대로 아래로
			}
		};
		boolean built;
		/** 첫 프레임: (처음 한 번) 창 크기 · 배율 적용, 단추 · 표시 만들기 */
		void build() {
			built = true;
			camera = PixelScene.uiCamera;
			KeyEvent.addKeyListener(keys);
			PointerEvent.addPointerListener(touches);
			float W = camera.width, H = camera.height, z = camera.zoom;
			// 안전 영역 미리보기: 막힌 곳을 어둡게
			float[][] r = { {0, 0, insets[0] / z, H}, {0, 0, W, insets[1] / z}, {W - insets[2] / z, 0, insets[2] / z, H}, {0, H - insets[3] / z, W, insets[3] / z} };
			for (float[] q : r) if (q[2] > 0 && q[3] > 0) { ColorBlock b = new ColorBlock(q[2], q[3], 0x88000000); b.x = q[0]; b.y = q[1]; b.camera = camera; add(b); bars.add(b); }
			info = PixelScene.renderTextBlock("", 5); info.camera = camera; info.maxWidth((int) (W - 4 - (insets[0] + insets[2]) / z)); add(info);   // 좁은 세로 화면에서는 줄을 바꿈
			info.hardlight(MakerTheme.c("text"));
		}
		@Override public void update() {
			if (members == null) return;   // 이미 없어진 장면의 것 (아래 창 크기 바꾸기 중에 장면이 바뀐 경우)
			// 창 크기 바꾸기는 장면 update 밖에서 (다음 프레임 첫머리 — Gdx.app.postRunnable): Windows 처럼 그 자리에서 다시 그리면 장면이 바뀌는데,
			// update 안에서 바꾸면 super.update() 뒤에 제 멤버를 도는 장면(영웅 선택 HeroSelectScene 등)이 없어진 멤버로 "this.members is null" (7차에서 찾음)
			if (rotateAsked) { rotateAsked = false; Gdx.app.postRunnable(MakerTestEnv::doRotate); return; }
			if (!applied) {
				// 창 크기 · 배율은 처음 한 번, 이 프레임에서는 그것만 함. Windows 등에서는 창 크기를 바꾸는 순간 libGDX 가
				// 그 자리에서 다시 그리며(resize → render) 장면을 새로 만들어 이 Overlay 를 없앰 — 예전엔 그 뒤에 단추를 붙이다
				// "this.members is null" 로 게임이 멈췄음 (xvfb 에서는 창 크기 변경이 늦게 와서 드러나지 않았음). 단추는 다음 프레임에.
				applied = true; Gdx.app.postRunnable(MakerTestEnv::applyWindow); return;
			}
			if (!built) { if (PixelScene.uiCamera == null) return; build(); }
			// 입력 순서: 나중에 등록한 것이 먼저 받음(원작 Signal stackMode) — 대사창 · 입력 기다리기 창이 모든 키 · 화면 누름을 먹으므로 매 프레임 맨 앞으로
			KeyEvent.removeKeyListener(keys); KeyEvent.addKeyListener(keys);
			PointerEvent.removePointerListener(touches); PointerEvent.addPointerListener(touches);
			super.update();
			float dt = Game.elapsed / Math.max(0.0001f, Game.timeScale);   // 실제 시간
			frames++; infoT += dt;
			if (infoT >= 0.5f) { fps = frames / infoT; frames = 0; infoT = 0;
				info.visible = debugOn;
				if (debugOn) {
					info.text(env.getString("name", "") + (turned ? " (돌림)" : "") + "  창 " + Gdx.graphics.getWidth() + "×" + Gdx.graphics.getHeight() + "  UI " + (int) camera.width + "×" + (int) camera.height + " ×" + (int) camera.zoom
							+ (insets[0] + insets[1] + insets[2] + insets[3] > 0 ? "  안전 " + (int) insets[0] + "," + (int) insets[1] + "," + (int) insets[2] + "," + (int) insets[3] : "")
							+ "  " + speed() + "×" + (skipping() ? " 스킵" : "") + "  연출 " + (MakerCutscene.why().isEmpty() ? "없음" : MakerCutscene.why()) + "  " + Math.round(fps) + "fps");
					info.setPos(2 + insets[0] / camera.zoom, 2 + insets[1] / camera.zoom);   // 위 왼쪽 — 대사창 · 배속 표시줄(아래)을 가리지 않게
				}
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
		void bringToTop() { if (parent == null) return; Object last = MakerDialogue.HudHider.member(parent, parent.length - 1); if (last != this && !(last instanceof MakerCutscene.Bar)) parent.bringToFront(this); }   // 배속 표시줄은 이 위 (서로 번갈아 앞으로 오지 않게)
		@Override public void destroy() { KeyEvent.removeKeyListener(keys); PointerEvent.removePointerListener(touches); super.destroy(); }
	}
}
