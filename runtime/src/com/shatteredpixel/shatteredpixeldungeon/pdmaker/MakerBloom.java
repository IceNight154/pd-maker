/*
 * PDMaker — 번짐(블룸): 효과 레이어(_light.png)를 칸(타일 · 프레임)마다 가우시안으로 흐리게 만든 그림을 따로 만들어, 그 칸보다 넓게 더해 그림.
 *   효과 레이어만 그리면 픽셀 경계가 또렷해서 딱딱해 보이므로, 이 번짐을 겹쳐 "은은하게 퍼지는 빛"을 만듦 (칸 밖 · 이웃 타일 위로도 퍼짐).
 *   radius = 번짐 반경 (효과 그림의 px). 흐린 그림은 낮은 해상도로 만들고 부드럽게 늘려 그림(LINEAR).
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Pixmap;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Image;
import com.watabou.utils.RectF;

import java.util.HashMap;
import java.util.Map;

public class MakerBloom {

	public SmartTexture tex;
	public int cols, rows;        // 칸 수
	public int cell, cellH, pad;  // 흐린 그림에서 칸 하나의 안쪽 크기 · 둘레 여백 (px)
	public float ds;              // 원래 그림 px ÷ 흐린 그림 px
	public boolean[] has;         // 그 칸에 빛이 있는지
	Image img;

	static final Map<String, MakerBloom> cache = new HashMap<>();

	/** sheet = 원래 시트 경로(…png), cw × ch = 칸 크기(px), radius = 번짐 반경(px). 효과 그림이 없거나 radius ≤ 0 이면 null */
	public static MakerBloom get(String sheet, int cw, int ch, float radius) {
		try {
			if (radius <= 0 || sheet == null || sheet.isEmpty() || sheet.startsWith("game:") || sheet.startsWith("builtin:") || MakerRuntime.root() == null) return null;
			String ref = sheet.replaceAll("(?i)\\.png$", "") + "_light.png";
			String key = ref + "#" + cw + "x" + ch + "r" + radius;
			MakerBloom old = cache.get(key);
			if (old != null) { boolean alive = true; try { alive = MakerAssets.cache().containsValue(old.tex); } catch (Throwable ignored) { } if (alive) return old; cache.remove(key); }
			if (!MakerRuntime.root().child(ref).exists()) return null;
			MakerBloom b = build(new Pixmap(MakerRuntime.root().child(ref)), Math.max(1, cw), Math.max(1, ch), radius);
			if (b != null) cache.put(key, b);
			return b;
		} catch (Throwable t) { MakerRuntime.log("번짐 그림 만들기 실패: " + t); return null; }
	}

	static MakerBloom build(Pixmap src, int cw, int ch, float radius) {
		MakerBloom b = new MakerBloom();
		b.cols = Math.max(1, src.getWidth() / cw); b.rows = Math.max(1, src.getHeight() / ch);
		int d = Math.max(1, Math.round(Math.max(cw, ch) / 16f));          // 큰 그림은 줄여서 계산 (어차피 흐린 그림)
		while ((cw / d + 2 * (int) Math.ceil(radius * 1.2f / d)) * b.cols > 2048 && d < 16) d++;
		b.ds = d; b.cell = Math.max(1, cw / d); b.cellH = Math.max(1, ch / d);
		float r = radius / d, sigma = Math.max(0.6f, r / 2.2f);
		b.pad = Math.max(1, (int) Math.ceil(r * 1.2f));
		int W = b.cell + 2 * b.pad, H = b.cellH + 2 * b.pad, n = W * H;
		b.has = new boolean[b.cols * b.rows];
		int k = b.pad; float[] ker = new float[2 * k + 1]; float ks = 0;
		for (int i = -k; i <= k; i++) { ker[i + k] = (float) Math.exp(-(i * i) / (2 * sigma * sigma)); ks += ker[i + k]; }
		for (int i = 0; i < ker.length; i++) ker[i] /= ks;
		Pixmap out = new Pixmap(W * b.cols, H * b.rows, Pixmap.Format.RGBA8888);
		out.setBlending(Pixmap.Blending.None);
		out.setColor(0, 0, 0, 1); out.fill();
		float[][] a = new float[3][n], t = new float[3][n];
		for (int cy = 0; cy < b.rows; cy++) for (int cx = 0; cx < b.cols; cx++) {
			boolean any = false;
			for (int c = 0; c < 3; c++) java.util.Arrays.fill(a[c], 0);
			for (int y = 0; y < b.cellH; y++) for (int x = 0; x < b.cell; x++) {   // 칸을 줄여 담기 (d × d 평균, 알파 곱)
				float sr = 0, sg = 0, sb = 0;
				for (int yy = 0; yy < d; yy++) for (int xx = 0; xx < d; xx++) {
					int px = cx * cw + x * d + xx, py = cy * ch + y * d + yy; if (px >= src.getWidth() || py >= src.getHeight()) continue;
					int p = src.getPixel(px, py); float al = (p & 0xFF) / 255f; if (al <= 0) continue;
					sr += ((p >>> 24) & 0xFF) / 255f * al; sg += ((p >>> 16) & 0xFF) / 255f * al; sb += ((p >>> 8) & 0xFF) / 255f * al;
				}
				if (sr + sg + sb > 0) { any = true; int i = (y + b.pad) * W + x + b.pad; float inv = 1f / (d * d); a[0][i] = sr * inv; a[1][i] = sg * inv; a[2][i] = sb * inv; }
			}
			if (!any) continue;
			b.has[cy * b.cols + cx] = true;
			for (int c = 0; c < 3; c++) {   // 가로 → 세로로 흐리게
				for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { float s = 0; for (int i = -k; i <= k; i++) { int xx = x + i; if (xx >= 0 && xx < W) s += a[c][y * W + xx] * ker[i + k]; } t[c][y * W + x] = s; }
				for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { float s = 0; for (int i = -k; i <= k; i++) { int yy = y + i; if (yy >= 0 && yy < H) s += t[c][yy * W + x] * ker[i + k]; } a[c][y * W + x] = s; }
			}
			float gain = 1f + sigma * 0.9f;   // 흐리면 어두워지므로 가운데 밝기를 어느 정도 되살림
			for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
				int i = y * W + x;
				// 칸 여백 가장자리에서는 0 으로 부드럽게 떨어지게 (네모난 끝이 보이지 않도록)
				float ex = Math.min(1f, Math.min(x, W - 1 - x) / (float) Math.max(1, b.pad / 2)), ey = Math.min(1f, Math.min(y, H - 1 - y) / (float) Math.max(1, b.pad / 2)), e = Math.min(ex, ey);
				int rr = Math.min(255, Math.round(a[0][i] * gain * e * 255)), gg = Math.min(255, Math.round(a[1][i] * gain * e * 255)), bb = Math.min(255, Math.round(a[2][i] * gain * e * 255));
				out.drawPixel(cx * W + x, cy * H + y, (rr << 24) | (gg << 16) | (bb << 8) | 0xFF);
			}
		}
		b.tex = TextureCache.get(out);
		b.tex.filter(com.watabou.glwrap.Texture.LINEAR, com.watabou.glwrap.Texture.LINEAR);
		b.img = new Image(b.tex);
		return b;
	}

	public boolean has(int index) { return index >= 0 && index < has.length && has[index]; }

	/** 칸 index 의 번짐을 그림. (x, y) = 그 칸(여백 없는 원래 그림)의 왼쪽 위 화면 좌표, scale = 원래 그림 1px 의 크기, amount = 세기 (1 넘으면 여러 번) */
	public void draw(int index, float x, float y, float scale, float amount, com.watabou.noosa.Camera cam) {
		if (!has(index) || amount <= 0.01f) return;
		int W = cell + 2 * pad, H = cellH + 2 * pad, cx = index % cols, cy = index / cols;
		float tw = tex.width, th = tex.height;
		img.frame(new RectF(cx * W / tw, cy * H / th, (cx + 1) * W / tw, (cy + 1) * H / th));
		float s = scale * ds;
		img.scale.set(s); img.x = x - pad * s; img.y = y - pad * s; img.camera = cam;
		img.am = 1; img.ra = img.ga = img.ba = 0;
		Gdx.gl.glBlendFunc(GL20.GL_ONE, GL20.GL_ONE);
		float left = amount; int n = 0;
		while (left > 0.01f && n++ < 3) { float k = Math.min(1f, left); left -= 1f; img.rm = img.gm = img.bm = k; img.draw(); }
	}
	public static void done() { com.watabou.glwrap.Blending.setNormalMode(); }

	/** 설정에서 번짐 반경(px) · 세기 */
	public static float radius(com.badlogic.gdx.utils.JsonValue cfg) { return cfg == null ? 0 : cfg.getFloat("lightBloom", 0f); }
	public static float power(com.badlogic.gdx.utils.JsonValue cfg) { return cfg == null ? 1f : cfg.getFloat("lightBloomPower", 100f) / 100f; }
}
