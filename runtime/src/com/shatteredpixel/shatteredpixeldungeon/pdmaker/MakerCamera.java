/*
 * 스크린 · 카메라 연출 (6차) — 이벤트 명령 camMove · camFollow · camShake · camReset
 *
 *   원작 카메라(noosa Camera)는 이미 "기본 위치(scroll)"와 "흔들림(shakeX/Y — 그리기 행렬에만)"을 나눠 둠. 이것을 그대로 씀:
 *     최종 화면 = 기본 위치(scroll — 이 클래스가 정하거나, 원작이 영웅을 따라감) + 원작 흔들림 + 이 클래스의 흔들림 오프셋(그리기에만)
 *   한 프레임에 한 번, 카메라 자신의 update 안에서 (설치기 패치: PixelScene.PixelCamera.update → before() · shakeX/Y 에 offX/offY 더함)
 *     → 따로 도는 타이머 · 그리기 루프 없음, 시간은 Game.elapsed (= Game.timeScale 이 들어간 시간: 2 · 4 · 16배가 그대로 적용)
 *     → 영웅 이동(HeroSprite.place 의 panFollow — 게임 행동 스레드)이 같은 프레임에 끼어들어도, 이 클래스가 기본 위치를 쥐고 있는 동안에는
 *       카메라 update 안에서 원작의 따라가기를 끄므로 덮어쓰지 못함 (panFollow · update 모두 synchronized).
 *
 *   상태 (mode): GAME(원작이 영웅을 따라감 — 기본) · MOVE(목표로 옮겨 가는 중) · HOLD(멈춰 둠) · FOLLOW(대상 따라가기) · RETURN(영웅에게 돌아가는 중)
 *   좌표: 월드 = 게임 픽셀 (칸 하나 = 16, 칸 (x, y) 의 가운데 = (x*16+8, y*16+8)). 카메라 "가운데"로 다룸 (화면 크기 · 회전과 무관).
 *   맵 경계: 명령으로 정한 목표만 제한 — 맵이 화면보다 크면 화면이 맵 밖을 보지 않게, 작으면 그 축은 맵 가운데 (작은 맵에서 쓸데없이 움직이지 않게).
 *     원작의 영웅 따라가기(GAME)는 원작 그대로 (제한 없음).
 *   끝 · 정리: 이벤트가 끝나거나 취소되면(EventInterpreter.finish · reset) 흔들림을 멈추고 영웅에게 부드럽게 돌아감.
 *     새 게임 · 불러오기 · 층 이동 = 바로 원래대로. 화면 크기 · 회전으로 장면을 다시 만들어도 상태(가운데 좌표)는 그대로 이어짐.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.watabou.noosa.Visual;

public class MakerCamera {

	public enum Mode { GAME, MOVE, HOLD, FOLLOW, RETURN }
	static final int TILE = 16;

	static Mode mode = Mode.GAME;
	static float cx, cy;                       // 지금 카메라 가운데 (월드) — GAME 이 아닐 때 이 값이 기본 위치
	static float fromX, fromY, toX, toY, t, dur;
	static float rawX, rawY;                   // 명령이 정한 목표 그대로 (맵 경계로 자르기 전) — 화면이 돌거나 커져도 그 목표를 새 화면 기준으로 다시 자름
	static String ease = "smooth";
	static boolean returnFollow = true;        // RETURN 이 끝나면 원작 영웅 따라가기로 (false = 영웅 자리에 멈춰 둠)
	// 따라가기
	static String followRef = "";              // $hero · 캐릭터 id · event:<이벤트 id>
	static boolean followSmooth = true;
	static float followSpeed = 5f;             // 1초에 남은 거리의 이만큼 (원작 영웅 따라가기 = 5)
	static float anchorX, anchorY;             // 대상이 놓일 화면 자리 (가운데 = 0, -0.4 ~ 0.4 = 화면 폭 · 높이의 비율)
	static boolean followWarned;
	// 흔들림 (그리기 오프셋 — 기본 위치는 바꾸지 않음)
	static float shPower, shDur, shT, shFreq = 12f;
	static String shDecay = "linear", shAxis = "both";
	public static float offX, offY;
	// 누가 시작했는가 (이 이벤트가 끝나면 정리)
	static Object owner;
	static Level level;                        // 시작한 층 (층이 바뀌면 바로 원래대로)
	static Camera lastCam;

	// ------------------------------------------------------------ 이벤트 명령이 부름 (화면 스레드)

	/** 지금 기본 위치 (GAME 이면 원작 카메라의 가운데) */
	static void syncFromCamera() {
		Camera c = Camera.main;
		if (mode == Mode.GAME && c != null) { cx = c.scroll.x + c.width / 2f - c.centerOffset.x; cy = c.scroll.y + c.height / 2f - c.centerOffset.y; }
	}
	static void own(Object who) { owner = who; level = Dungeon.level; }

	/** 스크린 이동: 월드 좌표 (가운데)로 sec 초 동안 (0 = 바로) */
	public static void moveTo(Object who, float x, float y, float sec, String easing) {
		syncFromCamera(); own(who);
		rawX = x; rawY = y;
		float[] p = clamp(x, y);
		fromX = cx; fromY = cy; toX = p[0]; toY = p[1]; t = 0; dur = safeTime(sec); ease = easing == null ? "smooth" : easing;
		if (dur <= 0) { cx = toX; cy = toY; mode = Mode.HOLD; } else mode = Mode.MOVE;   // HOLD 은 rawX/rawY (명령의 목표)를 지킴
	}
	/** 스크린 팔로우: ref = $hero · 캐릭터 id · event:<id> */
	public static void follow(Object who, String ref, boolean snapStart, boolean smooth, float speed, float ax, float ay) {
		syncFromCamera(); own(who);
		followRef = ref == null || ref.isEmpty() ? "$hero" : ref; followSmooth = smooth;
		followSpeed = finite(speed, 5f) <= 0 ? 5f : Math.min(60f, finite(speed, 5f));
		anchorX = Math.max(-0.45f, Math.min(0.45f, finite(ax, 0))); anchorY = Math.max(-0.45f, Math.min(0.45f, finite(ay, 0)));
		followWarned = false;
		if (target(followRef) == null) { warn("스크린 팔로우: 대상이 없습니다 (" + followRef + ") — 카메라를 지금 자리에 둡니다"); hold(); return; }
		mode = Mode.FOLLOW;
		if (snapStart || !smooth) { float[] p = followPoint(); if (p != null) { cx = p[0]; cy = p[1]; } }
	}
	/** 스크린 쉐이크: 강도(게임 픽셀) · 시간 · 주파수(Hz) · 감쇠(none · linear · smooth) · 방향(both · x · y). 새로 부르면 앞의 흔들림을 바꿈 (더해 쌓이지 않음) */
	public static void shake(Object who, float power, float sec, float freq, String decay, String axis) {
		if (owner == null) own(who);
		shPower = Math.max(0, Math.min(64f, finite(power, 4f))); shDur = safeTime(sec); shT = 0;
		shFreq = Math.max(1f, Math.min(60f, finite(freq, 12f)));
		shDecay = decay == null ? "linear" : decay; shAxis = axis == null ? "both" : axis;
		if (shDur <= 0 || shPower <= 0) stopShake();
	}
	/** 스크린 리셋: 흔들림 · 이동 · 따라가기를 모두 멈추고 영웅에게. smooth = sec 초 동안 돌아감, follow = 끝나면 원작 영웅 따라가기 */
	public static void reset(float sec, boolean follow) {
		stopShake();
		float d = safeTime(sec);
		returnFollow = follow;
		if (mode == Mode.GAME) { if (!follow) { syncFromCamera(); hold(); } return; }
		float[] h = heroPoint();
		if (h == null || d <= 0 || Game.scene() == null) { release(follow); return; }
		fromX = cx; fromY = cy; toX = h[0]; toY = h[1]; t = 0; dur = d; ease = "smooth"; mode = Mode.RETURN;
	}
	/** 바로 원래대로 (새 게임 · 불러오기 · 층 이동) */
	public static void resetNow() { stopShake(); owner = null; mode = Mode.GAME; release(true); }

	/** 이벤트가 끝남 · 취소됨 — 그 이벤트가 연 카메라 연출을 정리 (흔들림 멈춤 · 영웅에게 0.4초 동안 돌아감) */
	public static void eventEnded(Object who) {
		if (owner == null || owner != who) return;
		owner = null;
		stopShake();
		if (mode != Mode.GAME && mode != Mode.RETURN) reset(0.4f, true);
	}

	/** 지금 자리에 멈춰 둠 (목표 = 지금 가운데) */
	static void hold() { rawX = cx; rawY = cy; mode = Mode.HOLD; }
	static void stopShake() { shPower = 0; shDur = 0; shT = 0; offX = 0; offY = 0; }
	/** 원작 따라가기로 돌려줌 (follow=false 면 영웅 자리에 멈춰 둠) */
	static void release(boolean follow) {
		Camera c = Camera.main;
		float[] h = heroPoint();
		if (!follow && h != null) { cx = h[0]; cy = h[1]; hold(); return; }
		mode = Mode.GAME;
		if (c != null && Dungeon.hero != null && Dungeon.hero.sprite != null && Game.scene() instanceof GameScene) {
			c.snapTo(h != null ? h[0] : c.scroll.x + c.width / 2f, h != null ? h[1] : c.scroll.y + c.height / 2f);
			c.panFollow(Dungeon.hero.sprite, 5f);   // 원작 HeroSprite.place 와 같은 세기
		}
	}

	// ------------------------------------------------------------ 상태 (연출 진행 · 기다리기 · 자동 테스트)

	public static boolean moving() { return mode == Mode.MOVE || mode == Mode.RETURN; }
	public static boolean shaking() { return shDur > 0 && shT < shDur; }
	/** 연출 진행 중인 카메라 효과 (배속 표시 — MakerCutscene) */
	public static boolean animating() { return moving() || shaking(); }
	public static Mode mode() { return mode; }
	public static String debugState() {
		Camera c = Camera.main;
		String cam = c == null ? "-" : String.format(java.util.Locale.ROOT, "%.1f,%.1f", c.scroll.x + c.width / 2f - c.centerOffset.x, c.scroll.y + c.height / 2f - c.centerOffset.y);
		return String.format(java.util.Locale.ROOT, "mode=%s center=%s base=%.1f,%.1f shake=%s off=%.2f,%.2f follow=%s view=%s map=%s owner=%s",
				mode, cam, cx, cy, shaking() ? String.format(java.util.Locale.ROOT, "%.1f/%.2fs", shPower, shDur - shT) : "none", offX, offY,
				mode == Mode.FOLLOW ? followRef : "-", c == null ? "-" : (int) c.width + "x" + (int) c.height,
				Dungeon.level == null ? "-" : Dungeon.level.width() * TILE + "x" + Dungeon.level.height() * TILE, owner == null ? "-" : "event");
	}

	// ------------------------------------------------------------ 카메라 update 안에서 (설치기 패치)

	/** PixelScene.PixelCamera.update 의 맨 앞에서. 이 클래스가 기본 위치를 쥐고 있으면 그 자리로 놓고 원작 따라가기를 끔 */
	public static void before(Camera cam) {
		if (cam != Camera.main) return;
		lastCam = cam;
		if (!(Game.scene() instanceof GameScene) || Dungeon.level == null) return;
		if (level != null && Dungeon.level != level && (mode != Mode.GAME || shaking())) { level = null; resetNow(); return; }   // 층이 바뀜
		float dt = Game.elapsed;
		// 흔들림 (그리기 오프셋)
		if (shaking()) {
			shT += dt;
			if (shT >= shDur) stopShake();
			else {
				float k = shT / shDur, d = shDecay.equals("none") ? 1f : shDecay.equals("smooth") ? (1 - k) * (1 - k) : 1 - k;
				float w = (float) (Math.PI * 2 * shFreq * shT), amp = shPower * d;
				offX = shAxis.equals("y") ? 0 : amp * (float) (0.7 * Math.sin(w) + 0.3 * Math.sin(w * 2.3 + 1.1));
				offY = shAxis.equals("x") ? 0 : amp * (float) (0.7 * Math.sin(w * 1.13 + 2.0) + 0.3 * Math.cos(w * 1.7));
			}
		}
		if (mode == Mode.GAME) return;
		switch (mode) {
			case MOVE: case RETURN: {
				if (mode == Mode.RETURN) { float[] h = heroPoint(); if (h != null) { toX = h[0]; toY = h[1]; } }   // 돌아가는 동안 영웅이 움직여도 그 자리로
				else { float[] q = clamp(rawX, rawY); toX = q[0]; toY = q[1]; }   // 화면 크기가 바뀌면 목표를 새 화면 기준으로
				t += dt;
				float k = Math.min(1f, t / Math.max(0.0001f, dur)), e = ease(ease, k);
				cx = fromX + (toX - fromX) * e; cy = fromY + (toY - fromY) * e;
				if (k >= 1f) { if (mode == Mode.RETURN) { release(returnFollow); return; } mode = Mode.HOLD; }   // 목표(raw) 그대로 멈춤
				break;
			}
			case FOLLOW: {
				float[] p = followPoint();
				if (p == null) { warn("스크린 팔로우: 대상이 사라졌습니다 (" + followRef + ") — 카메라를 지금 자리에 둡니다"); hold(); break; }
				if (followSmooth) { float a = Math.min(1f, dt * followSpeed); cx += (p[0] - cx) * a; cy += (p[1] - cy) * a; }
				else { cx = p[0]; cy = p[1]; }
				break;
			}
			case HOLD: { float[] q = clamp(rawX, rawY); cx = q[0]; cy = q[1]; break; }
			default: break;
		}
		// 이 클래스가 정한 자리는 지금 화면 크기 기준으로 다시 맵 안으로 (화면을 돌리거나 창 크기가 바뀌어도 맵 밖을 보지 않게). 영웅에게 돌아가는 중은 원작처럼 제한 없음
		if (mode != Mode.RETURN) { float[] q = clamp(cx, cy); cx = q[0]; cy = q[1]; }
		// 기본 위치를 놓고, 원작 따라가기 · 끌어 옮기기를 끔 (이번 update 에서 원작 pan 이 움직이지 않음)
		cam.scroll.set(cx - cam.width / 2f + cam.centerOffset.x, cy - cam.height / 2f + cam.centerOffset.y);
		cam.panFollow(null, 0f);
	}

	// ------------------------------------------------------------ 계산 (편집기 미리보기 PDM.camera 와 같은 식 — run.js 가 비교)

	static float ease(String name, float k) {
		switch (name) {
			case "linear": return k;
			case "in": return k * k;
			case "out": return 1 - (1 - k) * (1 - k);
			default: return k * k * (3 - 2 * k);   // smooth
		}
	}
	/** 목표 가운데를 맵 안으로: 맵이 화면보다 크면 화면이 맵 밖을 보지 않게, 작으면 맵 가운데 */
	static float[] clamp(float x, float y) {
		Camera c = Camera.main; Level l = Dungeon.level;
		if (c == null || l == null) return new float[]{ x, y };
		return new float[]{ clampAxis(x, c.width, l.width() * TILE), clampAxis(y, c.height, l.height() * TILE) };
	}
	static float clampAxis(float v, float view, float map) {
		if (!Float.isFinite(v)) v = map / 2f;
		if (map <= view) return map / 2f;
		return Math.max(view / 2f, Math.min(map - view / 2f, v));
	}
	/** 잘못된 시간(음수 · NaN · 무한대) = 0 (바로) · 최대 60초 */
	static float safeTime(float s) { return !Float.isFinite(s) || s <= 0 ? 0 : Math.min(60f, s); }
	static float finite(float v, float d) { return Float.isFinite(v) ? v : d; }

	// ------------------------------------------------------------ 대상

	/** 이벤트 명령의 대상 → 월드 좌표 (가운데). kind = tile · world · char · event. 없으면 null */
	public static float[] point(String kind, float x, float y, String ref) {
		switch (kind == null ? "tile" : kind) {
			case "world": return new float[]{ x, y };
			case "char": case "event": { Visual v = target(kind.equals("event") ? "event:" + ref : ref); if (v != null) return center(v);
				int cell = kind.equals("event") ? eventCell(ref) : -1;
				if (cell >= 0 && Dungeon.level != null) return new float[]{ (cell % Dungeon.level.width()) * TILE + TILE / 2f, (cell / Dungeon.level.width()) * TILE + TILE / 2f };
				return null; }
			default: return new float[]{ x * TILE + TILE / 2f, y * TILE + TILE / 2f };
		}
	}
	static Visual target(String ref) {
		if (ref == null || ref.isEmpty() || ref.equals("$hero")) return Dungeon.hero == null ? null : Dungeon.hero.sprite;
		if (Dungeon.level == null) return null;
		if (ref.startsWith("event:")) {
			String id = ref.substring(6);
			for (Mob m : Dungeon.level.mobs) if (m instanceof MakerNPC && id.equals(((MakerNPC) m).eventId) && m.sprite != null) return m.sprite;
			return null;
		}
		Char ch = EventInterpreter.findChar(ref);
		return ch == null || !ch.isAlive() ? null : ch.sprite;
	}
	static int eventCell(String id) {
		if (!(Dungeon.level instanceof MakerLevel)) return -1;
		for (java.util.Map.Entry<Integer, String> e : ((MakerLevel) Dungeon.level).eventCells.entrySet()) {
			String v = e.getValue(); if (v.startsWith("!") || v.startsWith("*")) v = v.substring(1);
			if (v.equals(id)) return e.getKey();
		}
		return -1;
	}
	static float[] center(Visual v) { return new float[]{ v.x + v.width() / 2f, v.y + v.height() / 2f }; }
	static float[] heroPoint() { return Dungeon.hero == null || Dungeon.hero.sprite == null ? null : center(Dungeon.hero.sprite); }
	static float[] followPoint() {
		Visual v = target(followRef); Camera c = Camera.main;
		if (v == null || c == null || (v.parent == null && v != (Dungeon.hero == null ? null : Dungeon.hero.sprite))) return null;
		float[] p = center(v);
		// 대상이 화면의 (가운데 + anchor) 에 오게 → 카메라 가운데는 그만큼 반대로
		return clamp(p[0] - anchorX * c.width, p[1] - anchorY * c.height);
	}
	static void warn(String m) { if (!followWarned) { followWarned = true; MakerRuntime.log(m); } }

	/** 이벤트 명령 JSON → 실행 (EventInterpreter). 반환 = 기다릴 조건 (null = 기다리지 않음) */
	static java.util.function.BooleanSupplier exec(Object who, JsonValue c) {
		String cmd = c.getString("cmd", "");
		float sec = c.getFloat("time", 0) / 10f;   // 0.1초 단위 (다른 연출 명령과 같음)
		boolean wait = c.getBoolean("wait", true);
		switch (cmd) {
			case "camMove": {
				String kind = c.getString("target", "tile");
				float[] p = point(kind, c.getFloat("x", 0), c.getFloat("y", 0), c.getString("ref", ""));
				if (p == null) { MakerRuntime.log("스크린 이동: 대상이 없습니다 (" + kind + " " + c.getString("ref", "") + ") — 건너뜀"); return null; }
				moveTo(who, p[0], p[1], sec, c.getString("ease", "smooth"));
				return wait && moving() ? () -> !moving() || mode != Mode.MOVE : null;
			}
			case "camFollow":
				follow(who, "event".equals(c.getString("kind", "char")) ? "event:" + c.getString("event", "") : c.getString("ref", "$hero"),
						"snap".equals(c.getString("start", "pan")), c.getBoolean("smooth", true), c.getFloat("speed", 5f), c.getFloat("ax", 0) / 100f, c.getFloat("ay", 0) / 100f);
				return null;
			case "camShake":
				shake(who, c.getFloat("power", 4), sec <= 0 ? 0.5f : sec, c.getFloat("freq", 12), c.getString("decay", "linear"), c.getString("axis", "both"));
				return wait && shaking() ? () -> !shaking() : null;
			case "camReset": {
				boolean smooth = !"instant".equals(c.getString("mode", "smooth"));
				reset(smooth ? (sec <= 0 ? 0.5f : sec) : 0, c.getBoolean("follow", true));
				return wait && moving() ? () -> !moving() : null;
			}
		}
		return null;
	}
}
