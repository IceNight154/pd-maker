/*
 * PDMaker — 광원 (점광원): 맵에 놓는 "광원" 오브젝트와, 맵 오브젝트(prop)의 light 설정.
 *   밝기 = k / (sqrt(d² + z²) − z)   (d = 광원에서의 거리 px, z = 높이 — 클수록 넓고 부드럽게, k = 세기)
 *   가운데는 밝고 멀어질수록 길고 부드럽게 줄어드는 빛. range(칸) 끝에서 0 이 되도록 끝 값을 빼고, 그림 한 장으로 미리 구워 덧셈으로 그림.
 *   광원 오브젝트: { type: "light", at, cond, color, k, z, range, pulse, pulseMin }   · 조건(cond)은 0.5초마다 다시 검사 (스위치로 켜고 끄기)
 *   맵 오브젝트: props/<id>.json 의 light { on, color, k, z, range, ox, oy, pulse, pulseMin }
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.TextureFilm;
import com.watabou.noosa.Tilemap;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class MakerLights extends CustomTilemap {

	public MakerLights() { }

	static final int TEX = 128;
	static final Map<String, SmartTexture> baked = new HashMap<>();

	/** a = z ÷ 범위(px), kk = k ÷ 범위(px) 인 빛 그림 (가운데 = 광원, 가장자리 = 범위 끝) */
	static SmartTexture bake(float a, float kk) {
		a = Math.max(0.01f, Math.round(a * 50) / 50f); kk = Math.max(0.001f, Math.round(kk * 200) / 200f);
		String key = a + "|" + kk;
		SmartTexture old = baked.get(key);
		if (old != null) { boolean alive = true; try { alive = MakerAssets.cache().containsValue(old); } catch (Throwable ignored) { } if (alive) return old; baked.remove(key); }
		Pixmap pm = new Pixmap(TEX, TEX, Pixmap.Format.RGBA8888);
		pm.setBlending(Pixmap.Blending.None);
		float edge = kk / ((float) Math.sqrt(1 + a * a) - a), c = (TEX - 1) / 2f;
		for (int y = 0; y < TEX; y++) for (int x = 0; x < TEX; x++) {
			float t = (float) Math.hypot(x - c, y - c) / c;   // 0 = 광원, 1 = 범위 끝
			float den = (float) Math.sqrt(t * t + a * a) - a;
			float v = t >= 1 ? 0 : den <= 1e-5f ? 1 : Math.max(0, Math.min(1, kk / den - edge));
			int b = Math.round(v * 255);
			pm.drawPixel(x, y, (b << 24) | (b << 16) | (b << 8) | 0xFF);
		}
		SmartTexture tx = TextureCache.get(pm);
		tx.filter(com.watabou.glwrap.Texture.LINEAR, com.watabou.glwrap.Texture.LINEAR);
		baked.put(key, tx);
		return tx;
	}

	static boolean any(Level l) {
		try {
			JsonValue f = WorldGraph.node(WorldGraph.current());
			if (f != null && f.get("objects") != null) for (JsonValue o : f.get("objects")) if ("light".equals(o.getString("type", ""))) return true;
			for (JsonValue p : MakerRuntime.props.values()) { JsonValue lt = p.get("light"); if (lt != null && lt.getBoolean("on", false)) return true; }
		} catch (Throwable ignored) { }
		return false;
	}
	/** 게임 화면을 만들기 직전: 이 맵에 광원이 있으면 하나 넣고, 없으면 뺌 */
	public static void ensure(Level l) {
		try {
			if (l == null || l.customTiles == null) return;
			for (CustomTilemap t : l.customTiles.toArray(new CustomTilemap[0])) if (t instanceof MakerLights) l.customTiles.remove(t);
			if (!MakerRuntime.isActive() || !any(l)) return;
			MakerLights t = new MakerLights();
			t.tileX = 0; t.tileY = 0; t.tileW = l.width(); t.tileH = l.height();
			l.customTiles.add(t);
		} catch (Throwable e) { MakerRuntime.log("광원 오류: " + e); }
	}

	@Override public Tilemap create() { vis = new Vis(); return vis; }
	@Override public Image image(int tileX, int tileY) { return null; }
	@Override public String name(int tileX, int tileY) { return null; }
	@Override public String desc(int tileX, int tileY) { return null; }

	static class Spot { float x, y; JsonValue cfg; String cond; boolean on = true; }

	/** 그림자 계산용: 광원 하나가 실제로 닿는 범위 (각도별 거리) — 벽 · 닫힌 문 뒤로는 빛이 가지 않음 */
	static final int RAYS = 240;
	static class Reach { float x, y, range; int ver; final float[] d = new float[RAYS]; }
	static boolean blocks(Level l, int cx, int cy) {
		if (cx < 0 || cy < 0 || cx >= l.width() || cy >= l.height()) return true;
		int c = cx + cy * l.width();
		return l.solid[c] && l.losBlocking[c];   // 벽 · 닫힌 문 · 책장 · 바리케이드 (풀 · 조각상은 빛을 막지 않음)
	}
	static void cast(Level l, Reach r) {
		boolean inside = blocks(l, (int) Math.floor(r.x / 16), (int) Math.floor(r.y / 16));
		for (int i = 0; i < RAYS; i++) {
			double a = i * 2 * Math.PI / RAYS; float dx = (float) Math.cos(a), dy = (float) Math.sin(a), t = 0;
			if (!inside) while (t < r.range) {
				t += 1.5f;
				if (blocks(l, (int) Math.floor((r.x + dx * t) / 16), (int) Math.floor((r.y + dy * t) / 16))) { t = Math.min(r.range, t + 9f); break; }   // 벽 면은 조금 비춤
			} else t = r.range;
			r.d[i] = Math.min(t, r.range);
		}
		// 이웃 각도와 조금 섞어 톱니 모양을 줄임
		float[] sm = new float[RAYS];
		for (int i = 0; i < RAYS; i++) { float p = r.d[(i + RAYS - 1) % RAYS], n = r.d[(i + 1) % RAYS]; sm[i] = Math.min(r.d[i], (p + 2 * r.d[i] + n) / 4f + 1f); }
		System.arraycopy(sm, 0, r.d, 0, RAYS);
	}
	/** 광원에서 (px, py) 가 보이는지 (벽에 가리지 않는지) */
	static boolean sees(Reach r, float px, float py) {
		float dx = px - r.x, dy = py - r.y, d = (float) Math.hypot(dx, dy);
		if (d >= r.range) return false;
		double a = Math.atan2(dy, dx); if (a < 0) a += 2 * Math.PI;
		return r.d[(int) Math.round(a / (2 * Math.PI) * RAYS) % RAYS] >= d - 2f;
	}

	/** 부채꼴 그물로 빛 그림을 그림 (가운데 + 각도별 끝점) */
	static class Fan extends com.watabou.noosa.Visual {
		final java.nio.FloatBuffer vb = java.nio.ByteBuffer.allocateDirect((RAYS + 2) * 4 * 4).order(java.nio.ByteOrder.nativeOrder()).asFloatBuffer();
		final java.nio.ShortBuffer ib = java.nio.ByteBuffer.allocateDirect(RAYS * 3 * 2).order(java.nio.ByteOrder.nativeOrder()).asShortBuffer();
		final float[] v = new float[(RAYS + 2) * 4];
		Fan() { super(0, 0, 0, 0); for (int i = 0; i < RAYS; i++) { ib.put((short) 0); ib.put((short) (1 + i)); ib.put((short) (2 + i)); } ((java.nio.Buffer) ib).position(0); }
		void draw(SmartTexture tx, Reach r, com.watabou.noosa.Camera cam, float cr, float cg, float cb) {
			v[0] = r.x; v[1] = r.y; v[2] = 0.5f; v[3] = 0.5f;
			for (int i = 0; i <= RAYS; i++) {
				double a = (i % RAYS) * 2 * Math.PI / RAYS; float d = r.d[i % RAYS], dx = (float) Math.cos(a) * d, dy = (float) Math.sin(a) * d; int o = (i + 1) * 4;
				v[o] = r.x + dx; v[o + 1] = r.y + dy; v[o + 2] = 0.5f + dx / (2 * r.range); v[o + 3] = 0.5f + dy / (2 * r.range);
			}
			((java.nio.Buffer) vb).position(0); vb.put(v); ((java.nio.Buffer) vb).position(0);
			x = 0; y = 0; camera = cam; super.draw();
			com.watabou.noosa.NoosaScript sc = com.watabou.noosa.NoosaScript.get();
			tx.bind();
			sc.uModel.valueM4(matrix);
			sc.lighting(cr, cg, cb, 1, 0, 0, 0, 0);
			sc.camera(cam);
			sc.drawElements(vb, ib, RAYS * 3);
		}
	}

	/** 캐릭터 그림자 그림 (왼쪽 끝이 짙고 오른쪽으로 옅어지는 길쭉한 타원) */
	static SmartTexture shadowTex;
	static SmartTexture shadowTex() {
		if (shadowTex != null) { boolean alive = true; try { alive = MakerAssets.cache().containsValue(shadowTex); } catch (Throwable ignored) { } if (alive) return shadowTex; }
		int W = 64, H = 24; Pixmap pm = new Pixmap(W, H, Pixmap.Format.RGBA8888); pm.setBlending(Pixmap.Blending.None);
		for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
			float u = x / (float) (W - 1), vv = (y - (H - 1) / 2f) / ((H - 1) / 2f);
			float half = 0.55f + 0.45f * u;                         // 멀어질수록 조금 넓어짐
			float side = Math.max(0, 1 - (vv * vv) / (half * half));
			float along = (float) Math.pow(1 - u, 1.4) * Math.min(1f, u * 10f + 0.35f);
			int a = Math.round(255 * Math.max(0, Math.min(1, side * along)));
			pm.drawPixel(x, y, a);                                   // 검정 + 알파
		}
		shadowTex = TextureCache.get(pm); shadowTex.filter(com.watabou.glwrap.Texture.LINEAR, com.watabou.glwrap.Texture.LINEAR);
		return shadowTex;
	}

	/** 지금 화면의 광원들 (캐릭터가 받는 빛 계산용) */
	static Vis current;
	/** (px, py) 에 닿는 빛의 색 합 (0~1 ×3) — 벽에 가린 광원은 빼고 */
	public static float[] litAt(float px, float py) {
		float[] out = { 0, 0, 0 };
		Vis v = current; if (v == null || !v.alive || v.active.isEmpty()) return out;
		try {
			for (Object[] e : v.active) {
				Reach r = (Reach) e[0]; JsonValue c = (JsonValue) e[1]; float amt = (Float) e[2];
				if (!sees(r, px, py)) continue;
				float d = (float) Math.hypot(px - r.x, py - r.y), z = Math.max(0.5f, c.getFloat("z", 10f)), k = Math.max(0f, c.getFloat("k", 3f));
				float den = (float) Math.sqrt(d * d + z * z) - z, edge = k / ((float) Math.sqrt(r.range * r.range + z * z) - z);
				float val = den <= 1e-4f ? 1 : Math.max(0, Math.min(1, k / den - edge)) * amt;
				int col = 0xFFE9A8; try { col = Integer.parseInt(c.getString("color", "#ffe9a8").replace("#", ""), 16); } catch (Throwable ignored) { }
				out[0] += ((col >> 16) & 0xFF) / 255f * val; out[1] += ((col >> 8) & 0xFF) / 255f * val; out[2] += (col & 0xFF) / 255f * val;
			}
		} catch (Throwable ignored) { }
		for (int i = 0; i < 3; i++) out[i] = Math.min(1f, out[i]);
		return out;
	}

	static class Vis extends Tilemap {
		final ArrayList<Spot> spots = new ArrayList<>(); Image img, shadow; float wait;
		final Fan fan = new Fan(); final Map<Object, Reach> reach = new HashMap<>(); int mapVer; float verWait;
		final ArrayList<Object[]> active = new ArrayList<>();   // 이번 프레임에 그린 광원 { Reach, 설정, 세기 }
		Vis() {
			super(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, new TextureFilm(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, 16, 16));
			try {
				String id = WorldGraph.current(); JsonValue f = WorldGraph.node(id); Level l = Dungeon.level;
				int[] off = LevelHooks.nodeOffset(l, id);
				if (f != null && f.get("objects") != null && off != null) for (JsonValue o : f.get("objects")) {
					if (!"light".equals(o.getString("type", ""))) continue;
					JsonValue at = o.get("at"); if (at == null || !at.has("x")) continue;
					Spot s = new Spot(); s.cfg = o; s.cond = o.getString("cond", "").trim();
					s.x = (off[0] + at.getInt("x") + 0.5f) * 16; s.y = (off[1] + at.getInt("y") + 0.5f) * 16;
					spots.add(s);
				}
			} catch (Throwable t) { MakerRuntime.log("광원 오류: " + t); }
		}
		@Override public void update() {
			super.update();
			current = this;
			if ((verWait -= Game.elapsed) <= 0 && Dungeon.level != null) {   // 벽 · 문이 바뀌었는지 (바뀌면 그림자를 다시 계산)
				verWait = 0.25f; Level l = Dungeon.level; int hsh = 17;
				for (int i = 0; i < l.solid.length; i++) if (l.solid[i] && l.losBlocking[i]) hsh = hsh * 31 + i;
				mapVer = hsh;
			}
			if ((wait -= Game.elapsed) > 0) return;
			wait = 0.5f;
			for (Spot s : spots) { try { s.on = s.cond.isEmpty() || Cond.eval(s.cond, StoryState.globalResolver()); } catch (Throwable t) { s.on = true; } }
		}
		void one(Object key, float x, float y, JsonValue c, com.watabou.noosa.Camera cam) {
			float range = Math.max(0.5f, c.getFloat("range", 4f)) * 16, z = Math.max(0.5f, c.getFloat("z", 10f)), k = Math.max(0f, c.getFloat("k", 3f));
			if (x + range < cam.scroll.x || y + range < cam.scroll.y || x - range > cam.scroll.x + cam.width || y - range > cam.scroll.y + cam.height) return;   // 화면 밖
			SmartTexture tx = bake(z / range, k / range);
			float amt = 1f, per = c.getFloat("pulse", 0f);
			if (per > 0) { float lo = Math.max(0f, Math.min(1f, c.getFloat("pulseMin", 60f) / 100f)); amt = lo + (1 - lo) * (0.5f + 0.5f * (float) Math.sin(Game.timeTotal * 2 * Math.PI / per + x * 0.37f)); }
			int col = 0xFFE9A8; try { col = Integer.parseInt(c.getString("color", "#ffe9a8").replace("#", ""), 16); } catch (Throwable ignored) { }
			float cr = ((col >> 16) & 0xFF) / 255f * amt, cg = ((col >> 8) & 0xFF) / 255f * amt, cb = (col & 0xFF) / 255f * amt;
			// 닿는 범위: 벽 그림자를 켰으면 각도별로 벽까지, 껐으면 둥글게 끝까지
			Reach r = reach.get(key);
			boolean wall = c.getBoolean("shadow", true);
			if (r == null) { r = new Reach(); r.ver = Integer.MIN_VALUE; reach.put(key, r); }
			int ver = wall ? mapVer : -1;
			if (r.x != x || r.y != y || r.range != range || r.ver != ver) {
				r.x = x; r.y = y; r.range = range; r.ver = ver;
				if (wall) cast(Dungeon.level, r); else java.util.Arrays.fill(r.d, range);
			}
			fan.draw(tx, r, cam, cr, cg, cb);
			active.add(new Object[]{ r, c, amt });
		}
		/** 광원 가까이 있는 캐릭터의 그림자 (빛 반대쪽으로 늘어짐) */
		void shadows(com.watabou.noosa.Camera cam) {
			if (active.isEmpty()) return;
			if (shadow == null) shadow = new Image(shadowTex()); else if (shadow.texture != shadowTex()) shadow.texture(shadowTex());
			ArrayList<com.shatteredpixel.shatteredpixeldungeon.actors.Char> chars = new ArrayList<>(Dungeon.level.mobs);
			if (Dungeon.hero != null) chars.add(Dungeon.hero);
			for (Object[] e : active) {
				Reach r = (Reach) e[0]; JsonValue c = (JsonValue) e[1]; float amt = (Float) e[2];
				if (!c.getBoolean("charShadow", true)) continue;
				float z = Math.max(0.5f, c.getFloat("z", 10f)), k = Math.max(0f, c.getFloat("k", 3f));
				float edge = k / ((float) Math.sqrt(r.range * r.range + z * z) - z);
				for (com.shatteredpixel.shatteredpixeldungeon.actors.Char ch : chars) {
					com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite sp = ch.sprite;
					if (sp == null || !sp.visible || sp.parent == null) continue;
					float fx = sp.x + sp.width() / 2f, fy = sp.y + sp.height() - 1.5f;
					float dx = fx - r.x, dy = fy - r.y, d = (float) Math.hypot(dx, dy);
					if (d < 3f || !sees(r, fx, fy)) continue;
					float den = (float) Math.sqrt(d * d + z * z) - z, val = Math.max(0, Math.min(1, k / den - edge)) * amt;
					if (val < 0.03f) continue;
					float len = Math.max(5f, Math.min(30f, sp.height() * d / (z * 1.6f)));   // 광원이 낮고 멀수록 길게
					float wid = Math.max(5f, sp.width() * 1.05f);
					shadow.camera = cam;
					shadow.origin.set(0, shadow.height / 2f);
					shadow.scale.set(len / shadow.width, wid / shadow.height);
					shadow.x = fx; shadow.y = fy - shadow.height / 2f;
					shadow.angle = (float) Math.toDegrees(Math.atan2(dy, dx));
					shadow.rm = shadow.gm = shadow.bm = 0; shadow.ra = shadow.ga = shadow.ba = 0;
					shadow.am = Math.min(0.7f, 0.3f + val * 1.6f);
					shadow.draw();
				}
			}
		}
		// 크기가 없는 그림이라 게임이 "화면 밖"으로 여겨 건너뛰지 않게 (화면을 옮기면 빛이 사라지던 문제)
		@Override public boolean isVisible() { return visible && camera() != null; }
		@Override public void draw() {
			com.watabou.noosa.Camera cam = camera(); if (cam == null || Dungeon.level == null) return;
			Gdx.gl.glBlendFunc(GL20.GL_ONE, GL20.GL_ONE);
			try {
				active.clear();
				for (Spot s : spots) if (s.on) one(s, s.x, s.y, s.cfg, cam);
				for (CustomTilemap t : Dungeon.level.customTiles) {   // 맵 오브젝트에 붙은 광원 (밀면 따라감)
					if (!(t instanceof MakerProp)) continue;
					JsonValue d = MakerRuntime.props.get(((MakerProp) t).propId), lt = d == null ? null : d.get("light");
					if (lt == null || !lt.getBoolean("on", false)) continue;
					JsonValue ft = d.get("foot"); float fw = ft != null && ft.size >= 2 ? Math.max(1, ft.getInt(0)) : 1;
					one(t, (t.tileX + fw / 2f) * 16 + lt.getFloat("ox", 0), (t.tileY + 0.5f) * 16 + lt.getFloat("oy", 0), lt, cam);
				}
			} catch (Throwable e) { MakerRuntime.warnOnce("광원 그리기 오류: " + e + " @ " + (e.getStackTrace().length > 0 ? e.getStackTrace()[0] : "")); } finally { com.watabou.glwrap.Blending.setNormalMode(); }
			try { shadows(cam); } catch (Throwable e) { MakerRuntime.warnOnce("그림자 그리기 오류: " + e + " @ " + (e.getStackTrace().length > 0 ? e.getStackTrace()[0] : "")); }
		}
		@Override public void destroy() { if (current == this) current = null; super.destroy(); }
	}
}
