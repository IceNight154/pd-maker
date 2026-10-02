/*
 * 글자 연출 (편집기 "글자 연출 (APNG)" — textfx.json)
 *   편집기가 CSS 로 그린 글자 애니메이션을 프레임마다 찍어 APNG(공유용)와 격자 시트 PNG(게임용)로 저장합니다.
 *   게임은 APNG 를 읽지 못하므로 시트를 씁니다:  list[].sheet { png, cols, frames, w, h, fps }
 *   이벤트 명령 "글자 연출 표시" (textfx): { fx, pos: center|top|bottom, width: 화면 너비 %, loops, nowait }
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.watabou.glwrap.Texture;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;

public class MakerTextFx extends Image {

	private int cols, fw, fh, frames, loops, cur = -1;
	private float fps, t;
	private Runnable done;

	private MakerTextFx(Object tx) { super(tx); }

	static JsonValue find(String id) {
		JsonValue l = MakerRuntime.textfx == null ? null : MakerRuntime.textfx.get("list");
		if (l != null && id != null) for (JsonValue v : l) if (id.equals(v.getString("id", ""))) return v;
		return null;
	}

	/** 지금 화면 위에 연출을 재생 (그리기 스레드에서 부름). 끝나면 done. 만들지 못하면 null */
	public static MakerTextFx show(String id, String pos, float widthPct, int loops, Runnable done) {
		try {
			JsonValue fx = find(id), s = fx == null ? null : fx.get("sheet");
			if (s == null || Game.scene() == null) { MakerRuntime.warnOnce("글자 연출 「" + id + "」 의 게임용 시트가 없습니다 — 편집기 글자 연출 화면에서 \"만들기\"를 누르세요"); return null; }
			Object tx = MakerRuntime.texture(s.getString("png", ""));
			if (tx == null) return null;
			MakerTextFx f = new MakerTextFx(tx);
			f.texture.filter(Texture.LINEAR, Texture.LINEAR);
			f.cols = Math.max(1, s.getInt("cols", 1)); f.frames = Math.max(1, s.getInt("frames", 1));
			f.fw = s.getInt("w", 1); f.fh = s.getInt("h", 1); f.fps = Math.max(1, s.getFloat("fps", 20));
			f.loops = Math.max(1, loops); f.done = done;
			f.camera = PixelScene.uiCamera;
			float W = PixelScene.uiCamera.width, H = PixelScene.uiCamera.height;
			float sc = Math.min(W * Math.max(5, Math.min(100, widthPct)) / 100f / f.fw, H * 0.9f / f.fh);
			f.setFrame(0);
			f.scale.set(sc);
			f.x = (W - f.fw * sc) / 2f;
			f.y = "top".equals(pos) ? H * 0.1f : "bottom".equals(pos) ? H * 0.9f - f.fh * sc : (H - f.fh * sc) / 2f;
			Game.scene().add(f);
			return f;
		} catch (Throwable e) { MakerRuntime.log("글자 연출 오류: " + e); return null; }
	}

	private void setFrame(int i) {
		if (i == cur) return;
		cur = i;
		int cx = i % cols, cy = i / cols;
		frame(texture.uvRect(cx * fw, cy * fh, cx * fw + fw, cy * fh + fh));
	}

	@Override
	public void update() {
		super.update();
		t += Game.elapsed;
		int i = (int) (t * fps);
		if (i >= frames) {
			if (--loops <= 0) { finish(); return; }
			t = 0; i = 0;
		}
		setFrame(i);
	}

	private void finish() {
		active = false;
		Runnable d = done; done = null;
		killAndErase();
		if (d != null) d.run();
	}
}
