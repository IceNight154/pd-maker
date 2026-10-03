/*
 * PDMaker — 예고편 컷신 (편집기 확장 기능 "글자 연출" 안의 "예고편 컷신" — trailers.json)
 *   { list: [ { id, name, style(simple|band|frame), bg, bgAlpha(0~100), text, accent, skippable, fade(초), scenes: [ 장면 ] } ] }
 *   장면 type:
 *     title  { title, sub, sec }                                   제목 (위에 작은 글 sub — 시스템 · 부제)
 *     char   { chars: [ { char(캐릭터 id), image, name, line } ] (1~2명), sec }   등장인물 소개 (2명이면 나란히)
 *     copy   { text, sec }                                         맺음말 (한 줄 문구)
 *     credit { lines, date, countdown(YYYY-MM-DD), sec }           크레딧 · 날짜 · 남은 날 (D-n)
 *   영상이 아니라 게임이 그 자리에서 그림 (글자는 게임 글꼴). 이벤트 명령 "예고편 컷신 재생" (trailer): { id, nowait }
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Game;
import com.watabou.noosa.Group;
import com.watabou.noosa.Image;
import com.watabou.noosa.PointerArea;
import com.watabou.noosa.Visual;
import com.watabou.input.PointerEvent;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

public class MakerTrailer extends Group {

	static JsonValue find(String id) {
		JsonValue l = MakerRuntime.trailers == null ? null : MakerRuntime.trailers.get("list");
		if (l != null && id != null) for (JsonValue v : l) if (id.equals(v.getString("id", ""))) return v;
		return null;
	}

	/** 지금 화면 위에 재생 (그리기 스레드에서 부름). 끝나면 done. 만들지 못하면 null */
	public static MakerTrailer show(String id, Runnable done) {
		try {
			JsonValue d = find(id);
			if (d == null || d.get("scenes") == null || d.get("scenes").size == 0 || Game.scene() == null) { MakerRuntime.warnOnce("예고편 컷신 「" + id + "」 이(가) 없거나 장면이 없습니다"); return null; }
			MakerTrailer t = new MakerTrailer(d, done);
			Game.scene().addToFront(t);
			return t;
		} catch (Throwable e) { MakerRuntime.log("예고편 컷신 오류: " + e); return null; }
	}

	static int rgb(String s, int d) { try { return Integer.parseInt(s.replace("#", ""), 16) & 0xFFFFFF; } catch (Throwable t) { return d; } }

	final JsonValue def; final Runnable done;
	/** F: 화면이 넓으면 글자 · 그림을 키움 (세로 화면 1 ~ 가로 화면 1.6) */
	final float W, H, fade, bgA, F; final int cText, cAccent; final String style;
	final ColorBlock bg;
	int idx = -1; float t, dur; boolean ending; float endT;
	Group scene; final List<Object[]> vis = new ArrayList<>();   // [Visual 또는 RenderedTextBlock, 기본 알파]
	ColorBlock band; float bandH, bandY;

	MakerTrailer(JsonValue d, Runnable done) {
		this.def = d; this.done = done;
		camera = PixelScene.uiCamera;
		W = PixelScene.uiCamera.width; H = PixelScene.uiCamera.height;
		F = Math.max(1f, Math.min(1.6f, W / 200f));
		style = d.getString("style", "simple"); fade = Math.max(0.05f, d.getFloat("fade", 0.4f)); bgA = Math.max(0, Math.min(1, d.getFloat("bgAlpha", 100) / 100f));
		cText = rgb(d.getString("text", "#ffffff"), 0xFFFFFF); cAccent = rgb(d.getString("accent", "#e6b95c"), 0xE6B95C);
		bg = new ColorBlock(W, H, 0xFF000000 | rgb(d.getString("bg", "#000000"), 0)); bg.alpha(0); add(bg);
		// 화면 전체를 덮어 뒤의 게임 조작을 막고, 누르면 다음 장면으로 (skippable)
		final boolean skip = d.getBoolean("skippable", true);
		PointerArea pa = new PointerArea(0, 0, W, H) { @Override protected void onClick(PointerEvent e) { if (skip && !ending && t > 0.3f) t = Math.max(t, dur - fade); } };
		pa.camera = PixelScene.uiCamera; add(pa);
		next();
	}

	RenderedTextBlock text(String s, int size, int color, float maxW) {
		RenderedTextBlock b = PixelScene.renderTextBlock(s, Math.round(size * F));
		b.maxWidth((int) maxW); b.align(RenderedTextBlock.CENTER_ALIGN); b.hardlight(color);
		return b;
	}
	void put(Object v, float a) { vis.add(new Object[]{ v, a }); if (v instanceof RenderedTextBlock) scene.add((RenderedTextBlock) v); else scene.add((Visual) v); }
	float place(RenderedTextBlock b, float cx, float y) { b.setPos(cx - b.width() / 2f, y); PixelScene.align(b); return y + b.height(); }

	/** 캐릭터 그림: 정한 그림 → 초상화 → 스프라이트 첫 칸. 높이 h 에 맞춤 */
	Image face(JsonValue c, float h) {
		String img = c.getString("image", "");
		JsonValue ch = MakerRuntime.character(c.getString("char", ""));
		Image im = null;
		try {
			if (img.isEmpty() && ch != null && ch.get("portrait") != null) img = ch.get("portrait").getString("default", "");
			Object tx = img.isEmpty() ? null : MakerRuntime.texture(img);
			if (tx != null) im = new Image(tx);
			else if (ch != null && ch.get("sprite") != null) {
				JsonValue sp = ch.get("sprite"); tx = MakerRuntime.texture(sp.getString("sheet", ""));
				if (tx != null) { im = new Image(tx); int fw = 16, fh = 16; if (sp.get("frame") != null && sp.get("frame").size >= 2) { fw = sp.get("frame").getInt(0); fh = sp.get("frame").getInt(1); } im.frame(im.texture.uvRect(0, 0, fw, fh)); }
			}
		} catch (Throwable e) { im = null; }
		if (im != null) im.scale.set(h / im.height);
		return im;
	}

	void next() {
		if (scene != null) { scene.killAndErase(); scene = null; }
		vis.clear(); band = null;
		idx++;
		JsonValue sc = def.get("scenes");
		if (idx >= sc.size) { ending = true; endT = 0; return; }
		JsonValue s = sc.get(idx);
		t = 0; dur = Math.max(fade * 2 + 0.2f, s.getFloat("sec", 3));
		scene = new Group(); add(scene);
		String type = s.getString("type", "copy");
		float cx = W / 2f, maxW = W * 0.86f;
		List<Object[]> rows = new ArrayList<>();   // [RenderedTextBlock | Image | Image[] (나란히), 위 여백]
		if (type.equals("title")) {
			if (!s.getString("sub", "").isEmpty()) rows.add(new Object[]{ text(StoryState.expand(s.getString("sub", "")), 7, cAccent, maxW), 0f });
			rows.add(new Object[]{ text(StoryState.expand(s.getString("title", "")), 16, cText, maxW), 4f });
		} else if (type.equals("char")) {
			JsonValue cs = s.get("chars"); int n = cs == null ? 0 : Math.min(2, cs.size);
			float colW = n > 1 ? W * 0.44f : maxW, ih = Math.min(H * 0.34f, 64f * F);
			if (n > 1) rows.add(new Object[]{ new float[]{ colW, ih }, 0f, cs });   // 두 사람: 나란히
			else if (n == 1) {
				JsonValue c = cs.get(0); Image im = face(c, ih); if (im != null) rows.add(new Object[]{ im, 0f });
				JsonValue ch = MakerRuntime.character(c.getString("char", ""));
				String nm = c.getString("name", ""); if (nm.isEmpty() && ch != null) nm = ch.getString("name", "");
				String ln = c.getString("line", ""); if (ln.isEmpty() && ch != null) ln = ch.getString("title", "");
				if (!nm.isEmpty()) rows.add(new Object[]{ text(StoryState.expand(nm), 12, cText, maxW), 5f });
				if (!ln.isEmpty()) rows.add(new Object[]{ text(StoryState.expand(ln), 7, cAccent, maxW), 3f });
			}
		} else if (type.equals("credit")) {
			if (!s.getString("lines", "").isEmpty()) rows.add(new Object[]{ text(StoryState.expand(s.getString("lines", "")), 8, cText, maxW), 0f });
			if (!s.getString("date", "").isEmpty()) rows.add(new Object[]{ text(StoryState.expand(s.getString("date", "")), 7, cAccent, maxW), 6f });
			String cd = countdown(s.getString("countdown", ""));
			if (cd != null) rows.add(new Object[]{ text(cd, 14, cAccent, maxW), 6f });
		} else rows.add(new Object[]{ text(StoryState.expand(s.getString("text", "")), 11, cText, maxW), 0f });

		// 높이 계산 → 가운데 정렬
		float total = 0;
		for (Object[] r : rows) {
			float h = r[0] instanceof RenderedTextBlock ? ((RenderedTextBlock) r[0]).height() : r[0] instanceof Image ? ((Image) r[0]).height() : pairHeight((float[]) r[0], (JsonValue) r[2]);
			total += h + (Float) r[1];
		}
		float y = (H - total) / 2f;
		bandH = total + 20; bandY = y - 10;
		if (style.equals("band")) { band = new ColorBlock(W, bandH, 0xFF000000 | cAccent); band.y = bandY; scene.add(band); }
		if (style.equals("frame")) {
			float in = 8, th = 1;
			float[][] b = { { in, in, W - in * 2, th }, { in, H - in - th, W - in * 2, th }, { in, in, th, H - in * 2 }, { W - in - th, in, th, H - in * 2 } };
			for (float[] q : b) { ColorBlock c = new ColorBlock(q[2], q[3], 0xFF000000 | cAccent); c.x = q[0]; c.y = q[1]; put(c, 0.9f); }
		}
		for (Object[] r : rows) {
			y += (Float) r[1];
			if (r[0] instanceof RenderedTextBlock) { RenderedTextBlock b = (RenderedTextBlock) r[0]; if (style.equals("band")) b.hardlight(0x000000); put(b, 1); y = place(b, cx, y); }
			else if (r[0] instanceof Image) { Image im = (Image) r[0]; im.x = cx - im.width() / 2f; im.y = y; put(im, 1); y += im.height(); }
			else y = pair((float[]) r[0], (JsonValue) r[2], y);
		}
		if (style.equals("simple") && !rows.isEmpty() && !(rows.get(rows.size() - 1)[0] instanceof float[])) { ColorBlock ln = new ColorBlock(Math.min(W * 0.5f, 80), 1, 0xFF000000 | cAccent); ln.x = cx - ln.width() / 2f; ln.y = y + 4; put(ln, 0.9f); }
		apply(0);
	}

	final List<Object[]> pairCache = new ArrayList<>();
	float pairHeight(float[] wh, JsonValue cs) {
		pairCache.clear(); float mx = 0;
		for (int i = 0; i < 2; i++) {
			JsonValue c = cs.get(i); JsonValue ch = MakerRuntime.character(c.getString("char", ""));
			Image im = face(c, wh[1]);
			String nm = c.getString("name", ""); if (nm.isEmpty() && ch != null) nm = ch.getString("name", "");
			String ln = c.getString("line", ""); if (ln.isEmpty() && ch != null) ln = ch.getString("title", "");
			RenderedTextBlock a = nm.isEmpty() ? null : text(StoryState.expand(nm), 10, style.equals("band") ? 0 : cText, wh[0]), b = ln.isEmpty() ? null : text(StoryState.expand(ln), 6, style.equals("band") ? 0 : cAccent, wh[0]);
			float h = (im == null ? 0 : im.height()) + (a == null ? 0 : a.height() + 4) + (b == null ? 0 : b.height() + 2);
			mx = Math.max(mx, h);
			pairCache.add(new Object[]{ im, a, b });
		}
		return mx;
	}
	float pair(float[] wh, JsonValue cs, float y0) {
		float end = y0;
		for (int i = 0; i < pairCache.size(); i++) {
			Object[] p = pairCache.get(i); float cx = W * (i == 0 ? 0.27f : 0.73f), y = y0;
			if (p[0] != null) { Image im = (Image) p[0]; im.x = cx - im.width() / 2f; im.y = y; put(im, 1); y += im.height(); }
			if (p[1] != null) { y += 4; put(p[1], 1); y = place((RenderedTextBlock) p[1], cx, y); }
			if (p[2] != null) { y += 2; put(p[2], 1); y = place((RenderedTextBlock) p[2], cx, y); }
			end = Math.max(end, y);
		}
		return end;
	}

	/** "YYYY-MM-DD" 까지 남은 날: D-12 · D-DAY · (지났으면 표시 안 함) */
	static String countdown(String date) {
		try {
			if (date == null || date.trim().isEmpty()) return null;
			String[] p = date.trim().split("-");
			Calendar a = Calendar.getInstance(), b = Calendar.getInstance();
			b.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
			a.set(Calendar.HOUR_OF_DAY, 0); a.set(Calendar.MINUTE, 0); a.set(Calendar.SECOND, 0);
			long days = Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86400000.0);
			return days < 0 ? null : days == 0 ? "D-DAY" : "D-" + days;
		} catch (Throwable t) { return null; }
	}

	/** k: 0(안 보임)~1(다 보임) */
	void apply(float k) {
		for (Object[] v : vis) { float a = (Float) v[1] * k; if (v[0] instanceof RenderedTextBlock) ((RenderedTextBlock) v[0]).alpha(a); else ((Visual) v[0]).alpha(a); }
		if (band != null) { band.alpha(0.92f); band.x = -W * (1 - k) * (t < dur / 2 ? 1 : -1); }   // 띠: 왼쪽에서 들어와 오른쪽으로 나감
	}

	@Override
	public void update() {
		super.update();
		float dt = Game.elapsed;
		if (ending) { endT += dt; bg.alpha(bgA * Math.max(0, 1 - endT / fade)); if (endT >= fade) finish(); return; }
		if (idx == 0) bg.alpha(bgA * Math.min(1, t / fade)); else bg.alpha(bgA);
		t += dt;
		float k = t < fade ? t / fade : t > dur - fade ? Math.max(0, (dur - t) / fade) : 1;
		apply(k);
		if (t >= dur) next();
	}

	void finish() {
		Runnable d = done;
		killAndErase();
		if (d != null) d.run();
	}
}
