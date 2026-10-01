/*
 * 이벤트 그림(일러스트) 층 — "일러스트 표시 / 숨김" 명령 (번호 1~8)
 *   pos: left · center · right · full(화면 가득)   fade: 나타나는·사라지는 시간(0.1초)
 *   게임 화면 위, 대사창 아래에 그려집니다. 다른 층으로 옮기거나 화면이 바뀌면 사라집니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.watabou.noosa.Game;
import com.watabou.noosa.Group;
import com.watabou.noosa.Image;
import com.watabou.noosa.Scene;

import java.util.HashMap;
import java.util.Map;

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
		}
		return stage;
	}

	final Map<Integer, Slot> slots = new HashMap<>();

	static class Slot {
		Image img; float t, dur; boolean out;
	}

	/** 그림 보이기 (같은 번호에 있던 그림은 사라짐) */
	public static void show(int slot, String ref, String pos, float fadeSec) {
		MakerStage st = get();
		st.remove(slot, fadeSec);
		if (ref == null || ref.isEmpty()) return;
		float W = PixelScene.uiCamera.width, H = PixelScene.uiCamera.height;
		boolean full = "full".equals(pos);
		float th = full ? H : H * 0.9f;
		Image img = MakerDialogue.illustImage(ref, th);
		if (img == null) return;
		if (full) {
			float sc = Math.max(W / img.width, H / img.height);
			img.scale.set(sc);
			img.x = (W - img.width * sc) / 2f; img.y = (H - img.height * sc) / 2f;
		} else {
			float sc = th / img.height;
			img.scale.set(sc);
			float iw = img.width * sc;
			img.x = "left".equals(pos) ? W * 0.04f : "right".equals(pos) ? W * 0.96f - iw : (W - iw) / 2f;
			img.y = H - th;
		}
		Slot s = new Slot();
		s.img = img; s.dur = Math.max(0.01f, fadeSec);
		img.alpha(0);
		st.add(img);
		st.slots.put(slot, s);
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
		s.out = true; s.t = 0; s.dur = Math.max(0.01f, fadeSec);
		fading.put(s, s);
	}
	final Map<Slot, Slot> fading = new HashMap<>();

	@Override public void update() {
		super.update();
		float dt = Game.elapsed;
		for (Slot s : slots.values()) if (s.t < s.dur) { s.t += dt; s.img.alpha(Math.min(1, s.t / s.dur)); }
		for (Slot s : fading.keySet().toArray(new Slot[0])) {
			s.t += dt;
			s.img.alpha(Math.max(0, 1 - s.t / s.dur));
			if (s.t >= s.dur) { s.img.killAndErase(); s.img.destroy(); fading.remove(s); }
		}
	}
}
