/*
 * 이벤트 그림(일러스트) 층 — "일러스트 표시 / 숨김 / 움직이기" 명령 (번호 1~8)
 *   pos: left · center · right · full(화면 가득)   fade: 나타나는·사라지는 시간(0.1초)
 *   더 고를 수 있는 것 (편집기 schema.js 와 같음 — 값이 없으면 예전과 같은 모습):
 *     scale  크기 % (기본 100 — 화면 높이의 90% 에 맞춘 크기 기준, full 은 화면을 덮는 크기 기준)
 *     alpha  불투명도 % (기본 100) · ox oy 위치 옮기기(화면 단위 px, 오른쪽 · 아래 +) · flip 좌우 뒤집기
 *   번호가 큰 그림이 앞(위)에 그려짐. 같은 번호에 다시 표시하면 앞 그림은 페이드 아웃되며 바뀜(교체).
 *   움직이기(move): 지금 모습에서 목표(위치 · 크기 · 불투명도)까지 time 초 동안 — 시간은 Game.elapsed 로 재서 프레임 수와 상관없음
 *   크기 기준: 화면 높이의 90% — 단, 그림 폭이 화면 폭을 넘지 않게 (세로 화면에서 가로로 긴 그림)
 *   게임 화면 위, 대사창 아래에 그려집니다. 다른 층으로 옮기거나 화면이 바뀌면 사라집니다(세이브에 남지 않음).
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.watabou.noosa.Game;
import com.watabou.noosa.Group;
import com.watabou.noosa.Image;
import com.watabou.noosa.Scene;

import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

public class MakerStage extends Group {

	private static MakerStage stage;
	private static Scene owner;

	static MakerStage get() {
		Scene s = Game.scene();
		if (stage == null || owner != s || stage.parent == null) {
			stage = new MakerStage();
			stage.camera = PixelScene.uiCamera;
			owner = s;
			// 대사창은 명령이 이어질 때 새로 뜨므로 항상 이 층보다 위에 그려짐
			s.addToFront(stage);
			// 화면 어둡게(페이드)는 일러스트도 덮음 — 층을 나중에 만들어도 같은 순서 (편집기 미리보기와 같음: 게임 화면 < 일러스트 < 페이드 < 대사창)
			com.watabou.noosa.ColorBlock fb = EventInterpreter.fadeBlock;
			if (fb != null && fb.parent == s) s.bringToFront(fb);
		}
		return stage;
	}
	/** 지금 화면의 층 (없으면 null — 자동 테스트 · 상태 확인용, 만들지 않음) */
	public static MakerStage peek() { return stage != null && stage.parent != null && owner == Game.scene() ? stage : null; }

	final Map<Integer, Slot> slots = new TreeMap<>();   // 번호 순 = 그리는 순서

	public static class Slot {
		public Image img; public String ref = "";
		float t, dur, a0 = 1f; boolean out;   // a0 = 페이드 아웃을 시작할 때의 불투명도
		/** 기준 자리(크기 100% · 옮기기 0 일 때의 왼쪽 위) · 기준 배율 */
		float baseX, baseY, baseSc;
		/** 지금 값 — 크기 %(1 = 100%) · 옮기기 · 불투명도(0~1) */
		public float scale = 1f, ox, oy, alpha = 1f; public boolean flip;
		String pos = "center"; boolean full;   // 자리 (화면 크기가 바뀌면 다시 계산)
		Tween tw;
	}
	static class Tween { float t, dur, s0, s1, x0, x1, y0, y1, a0, a1, bx0, bx1; }

	/** 예전 호출 (편집기에서 새 칸을 쓰지 않은 명령) */
	public static void show(int slot, String ref, String pos, float fadeSec) { show(slot, ref, pos, fadeSec, 1f, 1f, 0, 0, false); }
	/** 그림 보이기 (같은 번호에 있던 그림은 페이드 아웃 — 교체). 그림을 못 읽으면 false (로그에 남김) */
	public static boolean show(int slot, String ref, String pos, float fadeSec, float scale, float alpha, float ox, float oy, boolean flip) {
		MakerStage st = get();
		st.remove(slot, fadeSec);
		if (ref == null || ref.isEmpty()) return true;
		float W = PixelScene.uiCamera.width, H = PixelScene.uiCamera.height;
		boolean full = "full".equals(pos);
		float th = full ? H : H * 0.9f;
		Image img = MakerDialogue.illustImage(ref, th);
		if (img == null) { MakerRuntime.warnOnce("일러스트 그림을 찾지 못했습니다: " + ref + " (검사 F7 의 에셋 확인)"); return false; }
		// 화면보다 넓어지지 않게 (4차: 세로 화면에서 가로로 긴 그림이 화면 폭의 3배가 되어 대부분 잘렸음 — 가로 화면 · 세로로 긴 그림은 그대로)
		if (!full) th = Math.min(th, W * img.height / img.width);
		Slot s = new Slot();
		s.img = img; s.ref = ref; s.dur = Math.max(0.01f, fadeSec);
		s.pos = pos == null ? "center" : pos; s.full = full;
		if (full) {
			s.baseSc = Math.max(W / img.width, H / img.height);
			s.baseX = (W - img.width * s.baseSc) / 2f; s.baseY = (H - img.height * s.baseSc) / 2f;
		} else {
			s.baseSc = th / img.height;
			float iw = img.width * s.baseSc;
			// 서 있는 그림 = 아래에 붙임. 폭 때문에 줄어든 그림(세로 화면 · 가로로 긴 그림)은 화면 세로 가운데 — 아래에 붙이면 대사창에 다 가려졌음
			s.baseX = baseX(pos, W, iw); s.baseY = th < H * 0.9f - 0.5f ? (H - th) / 2f : H - th;
		}
		s.scale = scale > 0 ? scale : 1f; s.alpha = clamp01(alpha); s.ox = ox; s.oy = oy; s.flip = flip;
		img.alpha(0);
		st.add(img);
		st.slots.put(slot, s);
		st.place(s);
		st.order();
		return true;
	}
	static float baseX(String pos, float W, float iw) { return "left".equals(pos) ? W * 0.04f : "right".equals(pos) ? W * 0.96f - iw : (W - iw) / 2f; }
	static float clamp01(float v) { return Math.max(0f, Math.min(1f, v)); }

	/** 크기 · 옮기기 · 뒤집기를 그림에 — 크기를 바꿔도 아래 가운데가 그 자리에 있게 (서 있는 그림) */
	void place(Slot s) {
		Image img = s.img; float sc = s.baseSc * s.scale;
		float w0 = img.width * s.baseSc, h0 = img.height * s.baseSc, w = img.width * sc, h = img.height * sc;
		img.scale.set(s.flip ? -sc : sc, sc);
		img.x = s.baseX + s.ox + (w0 - w) / 2f + (s.flip ? w : 0);
		img.y = s.baseY + s.oy + (h0 - h);
	}
	/** 번호가 큰 그림이 앞에 */
	void order() { for (Slot s : slots.values()) bringToFront(s.img); }

	/** 움직이기: time 초 동안 지금 모습 → 목표. pos 가 left · center · right 면 그 자리로 (비우면 지금 자리 그대로). 그 번호에 그림이 없으면 false */
	public static boolean move(int slot, String pos, float dx, float dy, float scale, float alpha, float sec) {
		MakerStage st = get();
		Slot s = st.slots.get(slot);
		if (s == null) { MakerRuntime.warnOnce("일러스트 움직이기: " + slot + "번에 그림이 없습니다"); return false; }
		Tween t = new Tween();
		t.dur = Math.max(0.01f, sec);
		t.s0 = s.scale; t.s1 = scale > 0 ? scale : s.scale;
		t.x0 = s.ox; t.x1 = dx; t.y0 = s.oy; t.y1 = dy;
		t.a0 = s.alpha; t.a1 = alpha >= 0 ? clamp01(alpha) : s.alpha;
		t.bx0 = s.baseX; t.bx1 = s.baseX;
		if (pos != null && !pos.isEmpty() && !"full".equals(pos)) { t.bx1 = baseX(pos, PixelScene.uiCamera.width, s.img.width * s.baseSc); s.pos = pos; }   // 자리: 다시 만들 때(rebuild)는 목표 자리로
		if (s.t < s.dur) s.t = s.dur;   // 나타나는 중이면 끝난 것으로 (불투명도는 움직이기가 맡음)
		s.tw = t;
		return true;
	}
	/** 창 크기 · 화면 방향이 바뀌어 화면을 다시 만든 뒤 (EventInterpreter.rebuild): 남아 있던 그림을 새 화면 크기에 맞춰 같은 번호 · 자리 · 크기 · 불투명도로 다시 놓음.
	 *  움직이는 중이던 것은 목표 모습으로, 사라지는 중이던 것은 버림. 다시 놓은 수 */
	static int rebuild() {
		MakerStage old = stage;
		if (old == null || (old.parent != null && owner == Game.scene())) return 0;
		java.util.List<Map.Entry<Integer, Slot>> prev = new java.util.ArrayList<>(old.slots.entrySet());
		stage = null;
		int n = 0;
		for (Map.Entry<Integer, Slot> e : prev) {
			Slot s = e.getValue(); Tween t = s.tw;
			float sc = t != null ? t.s1 : s.scale, a = t != null ? t.a1 : s.alpha, ox = t != null ? t.x1 : s.ox, oy = t != null ? t.y1 : s.oy;
			if (show(e.getKey(), s.ref, s.full ? "full" : s.pos, 0.01f, sc, a, ox, oy, s.flip)) n++;
		}
		return n;
	}
	/** 이 번호의 그림이 나타나기 · 움직이기를 끝냈는지 (명령의 "끝날 때까지 대기") */
	public static boolean idle(int slot) {
		MakerStage st = peek(); if (st == null) return true;
		Slot s = st.slots.get(slot);
		return s == null || (s.t >= s.dur && s.tw == null);
	}

	/** 상태 (자동 테스트): 번호:그림 불투명도 크기 x y 뒤집기 · 사라지는 중인 수 */
	public static String debugState() {
		MakerStage st = peek(); if (st == null) return "[]";
		StringBuilder b = new StringBuilder("[");
		for (Map.Entry<Integer, Slot> e : st.slots.entrySet()) { Slot s = e.getValue();
			b.append(String.format(java.util.Locale.ROOT, "%d:%s a=%.2f sc=%.2f x=%.1f y=%.1f%s%s ", e.getKey(), s.ref, s.img.alpha(), s.scale, s.img.x, s.img.y, s.flip ? " flip" : "", s.tw != null ? " moving" : "")); }
		return b.append("fading=").append(st.fading.size()).append("]").toString();
	}
	/** 배치 (자동 테스트 "layout"): 번호마다 화면에 그려지는 사각형 (뒤집기 반영) */
	public static String debugLayout() {
		MakerStage st = peek(); if (st == null) return "";
		StringBuilder b = new StringBuilder();
		for (Map.Entry<Integer, Slot> e : st.slots.entrySet()) { float[] q = rect(e.getValue()); b.append(String.format(java.util.Locale.ROOT, "%d=[%.0f,%.0f %.0fx%.0f] ", e.getKey(), q[0], q[1], q[2], q[3])); }
		return b.toString().trim();
	}
	static float[] rect(Slot s) { float w = s.img.width * Math.abs(s.img.scale.x), h = s.img.height * s.img.scale.y; return new float[]{s.flip ? s.img.x - w : s.img.x, s.img.y, w, h}; }
	/** 화면에 절반도 안 보이는 일러스트 · 화면보다 넓어 양쪽이 잘리는 일러스트 (full 제외) */
	public static java.util.List<String> layoutProblems() {
		java.util.List<String> out = new java.util.ArrayList<>();
		MakerStage st = peek(); if (st == null) return out;
		float W = PixelScene.uiCamera.width;
		for (Map.Entry<Integer, Slot> e : st.slots.entrySet()) { Slot s = e.getValue(); float[] q = rect(s);
			if (s.full) continue;
			float vis = Math.max(0, Math.min(W, q[0] + q[2]) - Math.max(0, q[0]));
			if (vis < q[2] * 0.5f) out.add("일러스트 " + e.getKey() + "번이 절반 넘게 화면 밖 x=" + Math.round(q[0]) + " 폭 " + Math.round(q[2]) + " / 화면 " + Math.round(W));
			else if (q[0] < -0.5f && q[0] + q[2] > W + 0.5f) out.add("일러스트 " + e.getKey() + "번이 화면보다 넓어 양쪽이 잘림 폭 " + Math.round(q[2]) + " / 화면 " + Math.round(W));
		}
		return out;
	}
	/** 숨기기 (0 = 전부) */
	public static void hide(int slot, float fadeSec) {
		MakerStage st = get();
		if (slot <= 0) { for (Integer k : st.slots.keySet().toArray(new Integer[0])) st.remove(k, fadeSec); }
		else st.remove(slot, fadeSec);
	}
	void remove(int slot, float fadeSec) {
		Slot s = slots.remove(slot);
		if (s == null) return;
		s.out = true; s.t = 0; s.dur = Math.max(0.01f, fadeSec); s.tw = null;
		s.a0 = s.img.alpha();
		fading.put(s, s);
	}
	final Map<Slot, Slot> fading = new HashMap<>();

	static float ease(float k) { return k * k * (3 - 2 * k); }   // 부드럽게 시작 · 끝

	@Override public void update() {
		super.update();
		float dt = Game.elapsed;
		for (Slot s : slots.values()) {
			if (s.t < s.dur) { s.t += dt; s.img.alpha(s.alpha * Math.min(1, s.t / s.dur)); }
			Tween t = s.tw;
			if (t != null) {
				t.t += dt; float k = ease(Math.min(1f, t.t / t.dur));
				s.scale = t.s0 + (t.s1 - t.s0) * k; s.ox = t.x0 + (t.x1 - t.x0) * k; s.oy = t.y0 + (t.y1 - t.y0) * k;
				s.alpha = t.a0 + (t.a1 - t.a0) * k; s.baseX = t.bx0 + (t.bx1 - t.bx0) * k;
				place(s); s.img.alpha(s.alpha);
				if (t.t >= t.dur) s.tw = null;
			}
		}
		for (Slot s : fading.keySet().toArray(new Slot[0])) {
			s.t += dt;
			s.img.alpha(Math.max(0, s.a0 * (1 - s.t / s.dur)));
			if (s.t >= s.dur) { s.img.killAndErase(); s.img.destroy(); fading.remove(s); }
		}
	}
}
