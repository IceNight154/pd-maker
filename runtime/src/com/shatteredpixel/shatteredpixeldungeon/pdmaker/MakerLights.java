/*
 * PDMaker — 광원 (점광원): 맵에 놓는 "광원" 오브젝트와, 맵 오브젝트(prop)의 light 설정.
 *   밝기 = k / (sqrt(d² + z²) − z)   (d = 광원에서의 거리 px, z = 높이 — 클수록 넓고 부드럽게, k = 세기)
 *   가운데는 밝고 멀어질수록 길고 부드럽게 줄어드는 빛. range(칸) 끝에서 0 이 되도록 끝 값을 빼고, 1 − e^−x 로 부드럽게 눌러 0~1 로 만듦.
 *   광원 오브젝트: { type: "light", at, cond, color, k, z, range, pulse, pulseMin, shadow, charShadow }   · 조건(cond)은 0.5초마다 다시 검사 (스위치로 켜고 끄기)
 *   지형 광원: 맵(노드) · 그룹의 terrainLights[{ terrain, color, k, z, range, pulse, pulseMin }] — 그 지형 칸마다 은은한 빛 (발광 호수 · 용암)
 *             벽 그림자는 없고(칸이 많아서), 못 보는 칸은 지움. 깜빡임은 칸마다 박자를 어긋나게 해서 일렁임.
 *   맵 오브젝트: props/<id>.json 의 light { on, color, k, z, range, ox, oy, pulse, pulseMin, shadow, charShadow } · castShadow(막힌 상태일 때 다른 빛을 가림, 기본 켬)
 *
 * 그리는 순서 (GameMaker 조명 코드와 같은 방식):
 *   · 이 층은 customWalls 맨 끝에 들어가 벽 · 캐릭터 · 맵 오브젝트 위, 안개 아래에 그려짐 (빛이 캐릭터와 물건에도 더해짐).
 *   · 빛 지도(광원 버퍼, 깊이 버퍼 포함)에 광원마다
 *       ① 그림자 볼륨: 벽 칸 · 막힌 맵 오브젝트의 대각선 두 개를 광원 반대쪽으로 아주 길게 늘인 사각형을 깊이에만 씀 (z = 광원 z − 0.5)
 *       ② 빛: 감쇠식을 셰이더에서 계산해 덧셈 (z = 광원 z, 깊이 검사 — 그림자 볼륨 뒤는 그려지지 않음)
 *       광원마다 z 를 조금씩 앞으로 당겨서 앞 광원의 그림자가 뒤 광원을 가리지 않음 (깊이 버퍼는 한 번만 지움).
 *     캐릭터 그림자도 같은 깊이 단계에 씀 (그 광원의 빛만 빠짐 — 캐릭터 몸에는 그림자가 덮이지 않게 몸 자리를 되돌림).
 *   · 빛 지도를 화면에 얹음: 화면 × (1 + 빛) + 빛 × GLOW — 그림 무늬를 살린 채 밝힘 (흰색으로 덮어 버리지 않음).
 *   · 영웅이 지금 못 보는 칸은 빛 지도에서 지움 (다른 방 · 벽 너머로 빛이 남지 않게).
 *   · 번짐(블룸)은 여기서 그리지 않음 — 각 그림 바로 위에 그대로 (맨 위로 올리면 자기 그림을 하얗게 덮음).
 *   광원 버퍼를 못 쓰는 기기에서는 예전 방식(각도별 광선 + 부채꼴)으로 그림.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.glutils.FrameBuffer;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.glscripts.Script;
import com.watabou.glwrap.Attribute;
import com.watabou.glwrap.Uniform;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.NoosaScript;
import com.watabou.noosa.TextureFilm;
import com.watabou.noosa.Tilemap;

import java.nio.Buffer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.IntBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class MakerLights extends CustomTilemap {

	public MakerLights() { }

	static final int TEX = 128;
	static final Map<String, SmartTexture> baked = new HashMap<>();

	/** (예전 방식용) a = z ÷ 범위(px), kk = k ÷ 범위(px) 인 빛 그림 (가운데 = 광원, 가장자리 = 범위 끝) */
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
			float v = t >= 1 ? 0 : den <= 1e-5f ? 1 : soft(kk / den - edge);
			int b = Math.round(v * 255);
			pm.drawPixel(x, y, (b << 24) | (b << 16) | (b << 8) | 0xFF);
		}
		SmartTexture tx = TextureCache.get(pm);
		tx.filter(com.watabou.glwrap.Texture.LINEAR, com.watabou.glwrap.Texture.LINEAR);
		baked.put(key, tx);
		return tx;
	}

	/** 감쇠식 값을 0~1 로 부드럽게 눌러 줌 (1 − e^−x) — 세기를 높여도 가운데가 평평한 흰 덩어리가 되지 않고 멀어질수록 서서히 줄어듦 */
	static float soft(float x) { return x <= 0 ? 0 : 1 - (float) Math.exp(-x); }
	/** 빛 지도를 화면에 얹는 방식: 화면 × (1 + 빛) (그림의 무늬를 살린 채 밝힘) + 빛 × GLOW (어두운 곳에 은은한 빛 기운) */
	static final float GLOW = 0.3f;
	/** 테스트 플레이 때 게임 로그에 한 번 보여 주는 판 (런타임이 새것으로 바뀌었는지 확인용) */
	static final String VERSION = "v4"; static boolean told; static String pending;

	/** 게임 화면을 만들기 직전: 이 맵에 광원이 있으면 맨 위 빛 층을 벽 층(customWalls) 맨 끝에 하나 넣음 */
	public static void ensure(Level l) {
		try {
			if (l == null || l.customTiles == null || l.customWalls == null) return;
			for (CustomTilemap t : l.customTiles.toArray(new CustomTilemap[0])) if (t instanceof MakerLights) l.customTiles.remove(t);   // 예전 세이브 (지형 층에 있던 것)
			for (CustomTilemap t : l.customWalls.toArray(new CustomTilemap[0])) if (t instanceof MakerLights) l.customWalls.remove(t);
			if (!MakerRuntime.isActive()) return;
			int n = count(l);
			JsonValue ta = terrainLights();
			pending = "[PDMaker] 광원 " + VERSION + ": " + (n > 0 || ta != null ? "이 맵의 점광원 " + n + "개" + (ta != null ? " · 지형 광원 " + ta.size + "종" : "") + " (빛 · 그림자 · 못 보는 칸은 지움)"
				: "이 맵에는 점광원이 없습니다 — 빛 · 그림자는 '광원' 오브젝트나 맵 오브젝트의 '광원 켜기'로 생깁니다 (효과 레이어 · 번짐은 그림만 빛남)");
			if (!any(l)) return;
			MakerLights t = new MakerLights();
			t.tileX = 0; t.tileY = 0; t.tileW = l.width(); t.tileH = l.height();
			l.customWalls.add(t);
		} catch (Throwable e) { MakerRuntime.log("광원 오류: " + e); }
	}

	/** 영웅이 지금 보는 칸인지 (맵 밖 · 아직 모르면 true) */
	public static boolean seenCell(int cx, int cy) {
		Level l = Dungeon.level;
		if (l == null || l.heroFOV == null || cx < 0 || cy < 0 || cx >= l.width() || cy >= l.height()) return true;
		return l.heroFOV[cx + cy * l.width()];
	}
	/** 테스트 플레이에서 층에 들어올 때 한 번: 이 맵에 점광원이 몇 개인지 게임 로그에 알림 (빛 레이어만 있고 점광원이 없으면 그림자가 없다는 것도) */
	public static void announce() {
		String s = pending; pending = null;
		if (s == null || System.getProperty("pdmaker.project") == null) return;
		try { com.shatteredpixel.shatteredpixeldungeon.utils.GLog.i(s); } catch (Throwable ignored) { }
	}
	/** 이 맵의 지형 광원 설정 (노드에 없으면 그룹 것) */
	static JsonValue terrainLights() {
		try {
			String id = WorldGraph.current(); JsonValue f = WorldGraph.node(id), a = f == null ? null : f.get("terrainLights");
			if (a == null || a.size == 0) { JsonValue g = WorldGraph.group(id); a = g == null ? null : g.get("terrainLights"); }
			return a != null && a.isArray() && a.size > 0 ? a : null;
		} catch (Throwable ignored) { return null; }
	}
	static int count(Level l) {
		int n = 0;
		try {
			JsonValue f = WorldGraph.node(WorldGraph.current());
			if (f != null && f.get("objects") != null) for (JsonValue o : f.get("objects")) if ("light".equals(o.getString("type", ""))) n++;
			for (CustomTilemap t : l.customTiles) if (t instanceof MakerProp) { JsonValue d = MakerRuntime.props.get(((MakerProp) t).propId), lt = d == null ? null : d.get("light"); if (lt != null && lt.getBoolean("on", false)) n++; }
		} catch (Throwable ignored) { }
		return n;
	}
	static boolean any(Level l) {
		if (terrainLights() != null) return true;
		try {
			JsonValue f = WorldGraph.node(WorldGraph.current());
			if (f != null && f.get("objects") != null) for (JsonValue o : f.get("objects")) if ("light".equals(o.getString("type", ""))) return true;
			for (JsonValue p : MakerRuntime.props.values()) { JsonValue lt = p.get("light"); if (lt != null && lt.getBoolean("on", false)) return true; }
		} catch (Throwable ignored) { }
		return false;
	}

	@Override public Tilemap create() { vis = new Vis(); return vis; }
	@Override public Image image(int tileX, int tileY) { return null; }
	@Override public String name(int tileX, int tileY) { return null; }
	@Override public String desc(int tileX, int tileY) { return null; }

	// ------------------------------------------------------------ 빛을 가리는 것

	static boolean blocks(Level l, int cx, int cy) {
		if (cx < 0 || cy < 0 || cx >= l.width() || cy >= l.height()) return true;
		int c = cx + cy * l.width();
		return l.solid[c] && l.losBlocking[c];   // 벽 · 닫힌 문 · 책장 · 바리케이드 (풀 · 조각상은 빛을 막지 않음)
	}
	/** 열린 칸과 맞닿은 벽 칸만 그림자를 만듦 (안쪽 벽은 어차피 그 뒤라서) */
	static boolean edge(Level l, int cx, int cy) {
		return (cx > 0 && !blocks(l, cx - 1, cy)) || (cx < l.width() - 1 && !blocks(l, cx + 1, cy))
			|| (cy > 0 && !blocks(l, cx, cy - 1)) || (cy < l.height() - 1 && !blocks(l, cx, cy + 1));
	}

	/** (예전 방식 · 캐릭터 그림자용) 광원 하나가 실제로 닿는 범위 (각도별 거리) — 벽 · 닫힌 문 뒤로는 빛이 가지 않음 */
	static final int RAYS = 240;
	static class Reach { float x, y, range; int ver; final float[] d = new float[RAYS]; }
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

	// ------------------------------------------------------------ 셰이더 (GameMaker 의 shdShadow + shdLight)

	/** uMode 0 = 그림자 볼륨 (aXYZW.z > 0 인 점을 광원 반대쪽으로 멀리 늘임) · 1 = 그림 모양 그림자 (알파가 낮으면 버림) · 2 = 빛 · 3 = 지형 광원 (aXYZW.zw = 칸 가운데, 칸마다 깜빡임 박자) */
	public static class LightScript extends Script {
		public Uniform uCamera, uPos, uZ, uMode, uLight, uColor, uTex, uPulse;
		public Attribute aXYZW;
		public LightScript() {
			super();
			compile(SHADER);
			uCamera = uniform("uCamera"); uPos = uniform("uPos"); uZ = uniform("uZ"); uMode = uniform("uMode");
			uLight = uniform("uLight"); uColor = uniform("uColor"); uTex = uniform("uTex"); uPulse = uniform("uPulse");
			aXYZW = attribute("aXYZW");
		}
		@Override public void use() { super.use(); aXYZW.enable(); }
		void draw(FloatBuffer vb, int verts) {
			if (verts <= 0) return;
			((Buffer) vb).position(0);
			aXYZW.vertexPointer(4, 4, vb);
			Gdx.gl.glDrawArrays(GL20.GL_TRIANGLES, 0, verts);
		}
		// Script.compile 은 "//\n" 으로 정점/조각 셰이더를 나누므로 셰이더 안에 // 주석을 쓰지 않음
		static final String SHADER =
			"uniform mat4 uCamera;\n" +
			"uniform vec2 uPos;\n" +
			"uniform float uZ;\n" +
			"uniform float uMode;\n" +
			"uniform vec4 uLight;\n" +
			"uniform vec3 uPulse;\n" +
			"attribute vec4 aXYZW;\n" +
			"varying vec2 vRel;\n" +
			"varying vec2 vUV;\n" +
			"varying float vAmt;\n" +
			"void main() {\n" +
			"  vec2 p = aXYZW.xy;\n" +
			"  if (uMode < 0.5 && aXYZW.z > 0.5) {\n" +
			"    vec2 d = p - uPos; float l = length(d);\n" +
			"    if (l > 0.0001) p += d / l * 100000.0;\n" +
			"  }\n" +
			"  vec2 c = uMode > 2.5 ? aXYZW.zw : uPos;\n" +
			"  vRel = (p - c) / uLight.z;\n" +
			"  vAmt = 1.0;\n" +
			"  if (uMode > 2.5 && uPulse.x > 0.0) vAmt = uPulse.y + (1.0 - uPulse.y) * (0.5 + 0.5 * sin(uPulse.z * 6.2831853 / uPulse.x + c.x * 0.37 + c.y * 0.61));\n" +
			"  vUV = aXYZW.zw;\n" +
			"  gl_Position = uCamera * vec4(p, 0.0, 1.0);\n" +
			"  gl_Position.z = uZ * gl_Position.w;\n" +
			"}\n" +
			"//\n" +
			"#ifdef GL_ES\n" +
			"  #ifdef GL_FRAGMENT_PRECISION_HIGH\n" +
			"    precision highp float;\n" +
			"  #else\n" +
			"    precision mediump float;\n" +
			"  #endif\n" +
			"#endif\n" +
			"uniform float uMode;\n" +
			"uniform vec4 uLight;\n" +
			"uniform vec3 uColor;\n" +
			"uniform sampler2D uTex;\n" +
			"varying vec2 vRel;\n" +
			"varying vec2 vUV;\n" +
			"varying float vAmt;\n" +
			"void main() {\n" +
			"  if (uMode < 0.5) { gl_FragColor = vec4(0.0); return; }\n" +
			"  if (uMode < 1.5) { if (texture2D(uTex, vUV).a < 0.3) discard; gl_FragColor = vec4(0.0); return; }\n" +
			"  float t = length(vRel);\n" +
			"  float a = uLight.y;\n" +
			"  float den = sqrt(t * t + a * a) - a;\n" +
			"  float v = den <= 0.00001 ? 1.0 : 1.0 - exp(-max(uLight.x / den - uLight.w, 0.0));\n" +
			"  if (t >= 1.0) v = 0.0;\n" +
			"  gl_FragColor = vec4(uColor * (v * vAmt), 1.0);\n" +
			"}\n";
	}

	/** 늘어나는 정점 버퍼 (x, y, z/u, w/v) */
	static class Verts {
		FloatBuffer buf = alloc(4096); int n;   // n = 정점 수
		static FloatBuffer alloc(int floats) { return ByteBuffer.allocateDirect(floats * 4).order(ByteOrder.nativeOrder()).asFloatBuffer(); }
		void clear() { n = 0; ((Buffer) buf).clear(); }
		void v(float x, float y, float z, float w) {
			if (buf.remaining() < 4) { FloatBuffer nb = alloc(buf.capacity() * 2); ((Buffer) buf).flip(); nb.put(buf); buf = nb; }
			buf.put(x); buf.put(y); buf.put(z); buf.put(w); n++;
		}
		/** GameMaker 의 Quad(): 선분 (x1,y1)-(x2,y2) 를 광원 반대쪽으로 늘인 사각형 (z = 1 인 점이 늘어남) */
		void quad(float x1, float y1, float x2, float y2) {
			v(x1, y1, 0, 0); v(x1, y1, 1, 0); v(x2, y2, 0, 0);
			v(x1, y1, 1, 0); v(x2, y2, 0, 0); v(x2, y2, 1, 0);
		}
		/** 상자 하나 = 대각선 두 개 */
		void box(float x1, float y1, float x2, float y2) { quad(x1, y1, x2, y2); quad(x2, y1, x1, y2); }
		void rect(float x1, float y1, float x2, float y2) {
			v(x1, y1, 0, 0); v(x2, y1, 0, 0); v(x2, y2, 0, 0);
			v(x1, y1, 0, 0); v(x2, y2, 0, 0); v(x1, y2, 0, 0);
		}
		/** 그림(텍스처) 사각형 — 네 꼭짓점과 uv */
		void tex(float[] p) {
			int[] o = { 0, 1, 2, 0, 2, 3 };
			for (int i : o) v(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3]);
		}
	}

	/** 부채꼴 그물로 빛 그림을 그림 (예전 방식 — 광원 버퍼를 못 쓸 때) */
	static class Fan extends com.watabou.noosa.Visual {
		final FloatBuffer vb = ByteBuffer.allocateDirect((RAYS + 2) * 4 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
		final java.nio.ShortBuffer ib = ByteBuffer.allocateDirect(RAYS * 3 * 2).order(ByteOrder.nativeOrder()).asShortBuffer();
		final float[] v = new float[(RAYS + 2) * 4];
		Fan() { super(0, 0, 0, 0); for (int i = 0; i < RAYS; i++) { ib.put((short) 0); ib.put((short) (1 + i)); ib.put((short) (2 + i)); } ((Buffer) ib).position(0); }
		void draw(SmartTexture tx, Reach r, Camera cam, float cr, float cg, float cb) {
			v[0] = r.x; v[1] = r.y; v[2] = 0.5f; v[3] = 0.5f;
			for (int i = 0; i <= RAYS; i++) {
				double a = (i % RAYS) * 2 * Math.PI / RAYS; float d = r.d[i % RAYS], dx = (float) Math.cos(a) * d, dy = (float) Math.sin(a) * d; int o = (i + 1) * 4;
				v[o] = r.x + dx; v[o + 1] = r.y + dy; v[o + 2] = 0.5f + dx / (2 * r.range); v[o + 3] = 0.5f + dy / (2 * r.range);
			}
			((Buffer) vb).position(0); vb.put(v); ((Buffer) vb).position(0);
			x = 0; y = 0; camera = cam; super.draw();
			NoosaScript sc = NoosaScript.get();
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

	/** 지금 화면의 빛 층 */
	static Vis current;

	/** 이번 프레임에 그릴 광원 하나 */
	static class Lit {
		Reach r; JsonValue c; Object owner; float k, z, amt, cr, cg, cb;
		float edge() { return k / ((float) Math.sqrt(r.range * r.range + z * z) - z); }
		float at(float d) { float den = (float) Math.sqrt(d * d + z * z) - z; return (den <= 1e-4f ? 1 : soft(k / den - edge())) * amt; }
	}

	// 광원 버퍼 (GL 자원 — 화면 크기가 바뀌면 다시 만듦)
	static FrameBuffer fbo; static int fboW, fboH; static boolean gpuOk = true;
	static final int Q = 2;   // 빛 지도 해상도: 게임 1px 당 2px (LINEAR 로 늘려서 부드럽게)
	static final float[] ortho = new float[16], ident = new float[16];
	static { com.watabou.glwrap.Matrix.setIdentity(ident); }
	static final IntBuffer ib4 = ByteBuffer.allocateDirect(16 * 4).order(ByteOrder.nativeOrder()).asIntBuffer();
	static final FloatBuffer blit = Verts.alloc(16);

	static class Vis extends Tilemap {
		final ArrayList<Spot> spots = new ArrayList<>(); Image shadow; float wait;
		final Fan fan = new Fan(); final Map<Object, Reach> reach = new HashMap<>(); int mapVer; float verWait;
		final ArrayList<Lit> active = new ArrayList<>();   // 이번 프레임에 그리는 광원
		JsonValue areas;   // 지형 광원 설정 (없으면 null)
		final Verts vs = new Verts();
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
				areas = terrainLights();
			} catch (Throwable t) { MakerRuntime.log("광원 오류: " + t); }
		}
		String note;
		@Override public void update() {
			super.update();
			current = this;
			if (note != null) { try { com.shatteredpixel.shatteredpixeldungeon.utils.GLog.i(note); } catch (Throwable ignored) { } note = null; }
			if ((verWait -= Game.elapsed) <= 0 && Dungeon.level != null) {   // 벽 · 문이 바뀌었는지 (바뀌면 캐릭터 그림자용 광선을 다시 계산)
				verWait = 0.25f; Level l = Dungeon.level; int hsh = 17;
				for (int i = 0; i < l.solid.length; i++) if (l.solid[i] && l.losBlocking[i]) hsh = hsh * 31 + i;
				mapVer = hsh;
			}
			if ((wait -= Game.elapsed) > 0) return;
			wait = 0.5f;
			for (Spot s : spots) { try { s.on = s.cond.isEmpty() || Cond.eval(s.cond, StoryState.globalResolver()); } catch (Throwable t) { s.on = true; } }
		}
		/** 화면에 보이는 광원이면 active 에 넣음 */
		void collect(Object key, Object owner, float x, float y, JsonValue c, Camera cam) {
			float range = Math.max(0.5f, c.getFloat("range", 4f)) * 16, z = Math.max(0.5f, c.getFloat("z", 10f)), k = Math.max(0f, c.getFloat("k", 3f));
			if (x + range < cam.scroll.x || y + range < cam.scroll.y || x - range > cam.scroll.x + cam.width || y - range > cam.scroll.y + cam.height) return;   // 화면 밖
			float amt = 1f, per = c.getFloat("pulse", 0f);
			if (per > 0) { float lo = Math.max(0f, Math.min(1f, c.getFloat("pulseMin", 60f) / 100f)); amt = lo + (1 - lo) * (0.5f + 0.5f * (float) Math.sin(Game.timeTotal * 2 * Math.PI / per + x * 0.37f)); }
			int col = 0xFFE9A8; try { col = Integer.parseInt(c.getString("color", "#ffe9a8").replace("#", ""), 16); } catch (Throwable ignored) { }
			Reach r = reach.get(key);
			boolean wall = c.getBoolean("shadow", true);
			if (r == null) { r = new Reach(); r.ver = Integer.MIN_VALUE; reach.put(key, r); }
			int ver = wall ? mapVer : -1;
			if (r.x != x || r.y != y || r.range != range || r.ver != ver) {
				r.x = x; r.y = y; r.range = range; r.ver = ver;
				if (wall) cast(Dungeon.level, r); else java.util.Arrays.fill(r.d, range);
			}
			Lit e = new Lit(); e.r = r; e.c = c; e.owner = owner; e.k = k; e.z = z; e.amt = amt;
			e.cr = ((col >> 16) & 0xFF) / 255f * amt; e.cg = ((col >> 8) & 0xFF) / 255f * amt; e.cb = (col & 0xFF) / 255f * amt;
			active.add(e);
		}
		/** 광원 가까이 있는 캐릭터마다 그림자 모양을 계산 → { 발 x, 발 y, 길이, 폭, 각도(라디안), 빛 세기 } */
		ArrayList<float[]> charShadows(Lit e) {
			ArrayList<float[]> out = new ArrayList<>();
			if (!e.c.getBoolean("charShadow", true)) return out;
			ArrayList<Char> chars = new ArrayList<>(Dungeon.level.mobs);
			if (Dungeon.hero != null) chars.add(Dungeon.hero);
			Reach r = e.r;
			for (Char ch : chars) {
				CharSprite sp = ch.sprite;
				if (sp == null || !sp.visible || sp.parent == null) continue;
				float fx = sp.x + sp.width() / 2f, fy = sp.y + sp.height() - 1.5f;
				float dx = fx - r.x, dy = fy - r.y, d = (float) Math.hypot(dx, dy);
				if (d < 3f || !sees(r, fx, fy)) continue;
				float val = e.at(d);
				if (val < 0.03f) continue;
				float len = Math.max(5f, Math.min(30f, sp.height() * d / (e.z * 1.6f)));   // 광원이 낮고 멀수록 길게
				float wid = Math.max(5f, sp.width() * 1.05f);
				out.add(new float[]{ fx, fy, len, wid, (float) Math.atan2(dy, dx), val, sp.x, sp.y, sp.x + sp.width(), sp.y + sp.height() });
			}
			return out;
		}
		/** 광원 e 의 빛을 가리는 상자들 (벽 칸 · 막힌 맵 오브젝트) → 그림자 볼륨 */
		void casters(Lit e, Level l) {
			Reach r = e.r;
			int lcx = (int) Math.floor(r.x / 16), lcy = (int) Math.floor(r.y / 16);
			boolean inside = blocks(l, lcx, lcy);   // 벽에 붙인 광원: 안쪽 벽도 모두 가림 (빛이 벽 너머로 새지 않게)
			int x0 = Math.max(0, (int) Math.floor((r.x - r.range) / 16)), x1 = Math.min(l.width() - 1, (int) Math.floor((r.x + r.range) / 16));
			int y0 = Math.max(0, (int) Math.floor((r.y - r.range) / 16)), y1 = Math.min(l.height() - 1, (int) Math.floor((r.y + r.range) / 16));
			for (int cy = y0; cy <= y1; cy++) for (int cx = x0; cx <= x1; cx++) {
				if (cx == lcx && cy == lcy) continue;
				if (!blocks(l, cx, cy) || (!inside && !edge(l, cx, cy))) continue;
				vs.box(cx * 16, cy * 16, cx * 16 + 16, cy * 16 + 16);
			}
			for (CustomTilemap t : l.customTiles) {   // 막힌 맵 오브젝트 (castShadow 를 끄지 않았으면)
				if (!(t instanceof MakerProp) || t == e.owner) continue;
				MakerProp p = (MakerProp) t;
				if (!p.solid()) continue;
				JsonValue d = MakerRuntime.props.get(p.propId);
				if (d == null || !d.getBoolean("castShadow", true)) continue;
				int[] f = p.foot();
				float bx1 = p.tileX * 16 + 2, by1 = (p.tileY - f[1] + 1) * 16 + 2, bx2 = (p.tileX + f[0]) * 16 - 2, by2 = (p.tileY + 1) * 16 - 2;
				if (bx2 < r.x - r.range || bx1 > r.x + r.range || by2 < r.y - r.range || by1 > r.y + r.range) continue;
				if (r.x >= bx1 && r.x <= bx2 && r.y >= by1 && r.y <= by2) continue;   // 광원이 그 안에 있음
				vs.box(bx1, by1, bx2, by2);
			}
		}
		/** 광원 버퍼에 그림자 볼륨 + 빛을 그리고 화면에 덧셈 — 못 그리면 false */
		boolean gpu(Camera cam, Level l) {
			GL20 gl = Gdx.gl;
			float ox = (float) Math.floor(cam.scroll.x) - 2, oy = (float) Math.floor(cam.scroll.y) - 2;
			int fw = (int) Math.ceil(cam.width) + 4, fh = (int) Math.ceil(cam.height) + 4, pw = fw * Q, ph = fh * Q;
			if (fbo == null || fboW != pw || fboH != ph) {
				if (fbo != null) try { fbo.dispose(); } catch (Throwable ignored) { }
				fbo = null;
				fbo = new FrameBuffer(Pixmap.Format.RGBA8888, pw, ph, true);
				fbo.getColorBufferTexture().setFilter(com.badlogic.gdx.graphics.Texture.TextureFilter.Linear, com.badlogic.gdx.graphics.Texture.TextureFilter.Linear);
				fboW = pw; fboH = ph;
				com.watabou.glwrap.Texture.clear();
			}
			// 지금 GL 상태 (빛 지도를 그린 뒤 되돌림)
			boolean scissor = gl.glIsEnabled(GL20.GL_SCISSOR_TEST);
			int[] sbox = new int[4], vp = new int[4];
			((Buffer) ib4).clear(); gl.glGetIntegerv(GL20.GL_SCISSOR_BOX, ib4); ib4.get(sbox);
			((Buffer) ib4).clear(); gl.glGetIntegerv(GL20.GL_VIEWPORT, ib4); ib4.get(vp);
			// 세상 좌표 → 빛 지도 (위 = oy 가 텍스처 v = 0)
			java.util.Arrays.fill(ortho, 0);
			ortho[0] = 2f / fw; ortho[5] = 2f / fh; ortho[10] = 1; ortho[15] = 1;
			ortho[12] = -1 - 2f * ox / fw; ortho[13] = -1 - 2f * oy / fh;
			LightScript s = null;
			try {
				gl.glDisable(GL20.GL_SCISSOR_TEST);
				fbo.begin();
				gl.glViewport(0, 0, pw, ph);
				gl.glDepthMask(true); gl.glColorMask(true, true, true, true);
				gl.glClearColor(0, 0, 0, 0); gl.glClearDepthf(1f);
				gl.glClear(GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT);
				gl.glEnable(GL20.GL_DEPTH_TEST); gl.glDepthFunc(GL20.GL_LESS);
				gl.glBindBuffer(GL20.GL_ARRAY_BUFFER, 0);
				s = Script.use(LightScript.class);
				s.uCamera.valueM4(ortho);
				gl.glUniform1i(s.uTex.location(), 0);
				SmartTexture st = null;
				int i = 0;
				for (Lit e : active) {
					Reach r = e.r;
					float zl = 0.9f - i * 0.008f, zs = zl - 0.004f;   // 광원마다 앞으로 당김 (GameMaker 의 _z--)
					if (++i > 200) break;
					s.uPos.value2f(r.x, r.y);
					s.uLight.value4f(e.k / r.range, e.z / r.range, r.range, e.edge());
					gl.glColorMask(false, false, false, false);
					// ① 캐릭터 그림자 (그림 모양) → ② 캐릭터 몸 자리는 되돌림 → ③ 벽 · 오브젝트 그림자 볼륨
					ArrayList<float[]> cs = charShadows(e);
					if (!cs.isEmpty()) {
						if (st == null) st = shadowTex();
						com.watabou.glwrap.Texture.activate(0); st.bind();
						vs.clear();
						for (float[] c : cs) {
							float ca = (float) Math.cos(c[4]), sa = (float) Math.sin(c[4]), px = -sa * c[3] / 2f, py = ca * c[3] / 2f, ex = ca * c[2], ey = sa * c[2];
							vs.tex(new float[]{ c[0] - px, c[1] - py, 0, 0,   c[0] + ex - px, c[1] + ey - py, 1, 0,   c[0] + ex + px, c[1] + ey + py, 1, 1,   c[0] + px, c[1] + py, 0, 1 });
						}
						s.uMode.value1f(1); s.uZ.value1f(zs); s.draw(vs.buf, vs.n);
						vs.clear();
						for (float[] c : cs) vs.rect(c[6], c[7], c[8], c[9]);
						gl.glDepthFunc(GL20.GL_ALWAYS);
						s.uMode.value1f(0); s.uZ.value1f(0.99f); s.draw(vs.buf, vs.n);
						gl.glDepthFunc(GL20.GL_LESS);
					}
					if (e.c.getBoolean("shadow", true)) {
						vs.clear(); casters(e, l);
						s.uMode.value1f(0); s.uZ.value1f(zs); s.draw(vs.buf, vs.n);
					}
					// ④ 빛 (덧셈, 깊이 검사)
					gl.glColorMask(true, true, true, true);
					gl.glEnable(GL20.GL_BLEND); gl.glBlendFunc(GL20.GL_ONE, GL20.GL_ONE);
					vs.clear(); vs.rect(r.x - r.range, r.y - r.range, r.x + r.range, r.y + r.range);
					s.uMode.value1f(2); s.uZ.value1f(zl);
					gl.glUniform3f(s.uColor.location(), e.cr, e.cg, e.cb);
					s.draw(vs.buf, vs.n);
				}
				// ⑥ 지형 광원: 그 지형 칸마다 빛 사각형 하나 (가운데는 정점의 zw) — 그림자 없이 덧셈, 한 설정당 한 번에 그림
				if (areas != null) {
					gl.glDisable(GL20.GL_DEPTH_TEST); gl.glColorMask(true, true, true, true);
					gl.glEnable(GL20.GL_BLEND); gl.glBlendFunc(GL20.GL_ONE, GL20.GL_ONE);
					s.uMode.value1f(3);
					for (JsonValue a : areas) {
						int ter; try { ter = a.getInt("terrain", -1); } catch (Throwable t) { continue; }
						float range = Math.max(0.5f, a.getFloat("range", 2f)) * 16, z = Math.max(0.5f, a.getFloat("z", 10f)), k = Math.max(0f, a.getFloat("k", 1.5f));
						float m = range;
						int cx0 = Math.max(0, (int) Math.floor((ox - m) / 16)), cx1 = Math.min(l.width() - 1, (int) Math.floor((ox + fw + m) / 16));
						int cy0 = Math.max(0, (int) Math.floor((oy - m) / 16)), cy1 = Math.min(l.height() - 1, (int) Math.floor((oy + fh + m) / 16));
						vs.clear();
						for (int cy = cy0; cy <= cy1; cy++) for (int cx = cx0; cx <= cx1; cx++) {
							if (l.map[cx + cy * l.width()] != ter) continue;
							float px = cx * 16 + 8, py = cy * 16 + 8;
							vs.v(px - range, py - range, px, py); vs.v(px + range, py - range, px, py); vs.v(px + range, py + range, px, py);
							vs.v(px - range, py - range, px, py); vs.v(px + range, py + range, px, py); vs.v(px - range, py + range, px, py);
						}
						if (vs.n == 0) continue;
						int col = 0x9a7cff; try { col = Integer.parseInt(a.getString("color", "#9a7cff").replace("#", ""), 16); } catch (Throwable ignored) { }
						float per = a.getFloat("pulse", 0f), lo = Math.max(0f, Math.min(1f, a.getFloat("pulseMin", 60f) / 100f));
						s.uLight.value4f(k / range, z / range, range, k / ((float) Math.sqrt(range * range + z * z) - z));
						gl.glUniform3f(s.uPulse.location(), per, lo, per > 0 ? Game.timeTotal % (per * 1000f) : 0f);
						gl.glUniform3f(s.uColor.location(), ((col >> 16) & 0xFF) / 255f, ((col >> 8) & 0xFF) / 255f, (col & 0xFF) / 255f);
						s.draw(vs.buf, vs.n);
					}
					gl.glUniform3f(s.uPulse.location(), 0, 0, 0);
				}
				// ⑤ 영웅이 지금 못 보는 칸은 빛을 지움 (다른 방 · 벽 너머로 빛이 남아 보이지 않게)
				boolean[] fov = l.heroFOV;
				if (fov != null && fov.length == l.length()) {
					gl.glDisable(GL20.GL_DEPTH_TEST); gl.glDisable(GL20.GL_BLEND); gl.glColorMask(true, true, true, true);
					vs.clear();
					int cx0 = Math.max(0, (int) Math.floor(ox / 16)), cx1 = Math.min(l.width() - 1, (int) Math.floor((ox + fw) / 16));
					int cy0 = Math.max(0, (int) Math.floor(oy / 16)), cy1 = Math.min(l.height() - 1, (int) Math.floor((oy + fh) / 16));
					for (int cy = cy0; cy <= cy1; cy++) for (int cx = cx0; cx <= cx1; cx++) if (!fov[cx + cy * l.width()]) vs.rect(cx * 16, cy * 16, cx * 16 + 16, cy * 16 + 16);
					s.uMode.value1f(0); s.draw(vs.buf, vs.n);
				}
			} finally {
				gl.glColorMask(true, true, true, true);
				gl.glDisable(GL20.GL_DEPTH_TEST);
				if (s != null) s.aXYZW.disable();
				fbo.end();
				gl.glViewport(vp[0], vp[1], vp[2], vp[3]);
				gl.glScissor(sbox[0], sbox[1], sbox[2], sbox[3]);
				if (scissor) gl.glEnable(GL20.GL_SCISSOR_TEST); else gl.glDisable(GL20.GL_SCISSOR_TEST);
				com.watabou.glwrap.Texture.clear();
				gl.glEnable(GL20.GL_BLEND);   // ⑤ 에서 껐던 것 (noosa 는 블렌딩이 늘 켜져 있다고 여김)
				com.watabou.glwrap.Blending.setNormalMode();
			}
			// 빛 지도를 화면에 얹음
			NoosaScript sc = NoosaScript.get();
			sc.resetCamera(); sc.camera(cam);
			sc.uModel.valueM4(ident);
			sc.lighting(1, 1, 1, 1, 0, 0, 0, 0);
			com.watabou.glwrap.Texture.activate(0);
			gl.glBindTexture(GL20.GL_TEXTURE_2D, fbo.getColorBufferTexture().getTextureObjectHandle());
			com.watabou.glwrap.Texture.clear();
			((Buffer) blit).position(0);
			blit.put(new float[]{ ox, oy, 0, 0,   ox + fw, oy, 1, 0,   ox + fw, oy + fh, 1, 1,   ox, oy + fh, 0, 1 });
			((Buffer) blit).position(0);
			try {
				gl.glBlendFunc(GL20.GL_DST_COLOR, GL20.GL_ONE);   // 화면 + 화면 × 빛
				sc.drawQuad(blit);
				gl.glBlendFunc(GL20.GL_ONE, GL20.GL_ONE);         // + 빛 × GLOW
				sc.lighting(GLOW, GLOW, GLOW, 1, 0, 0, 0, 0);
				sc.drawQuad(blit);
			} finally { com.watabou.glwrap.Blending.setNormalMode(); }
			return true;
		}
		static boolean seen(float x, float y) {
			Level l = Dungeon.level; int cx = (int) Math.floor(x / 16), cy = (int) Math.floor(y / 16);
			if (l == null || l.heroFOV == null || cx < 0 || cy < 0 || cx >= l.width() || cy >= l.height()) return true;
			return l.heroFOV[cx + cy * l.width()];
		}
		/** 예전 방식: 각도별 광선으로 만든 부채꼴 + 캐릭터 그림자 그림 (그림자는 빛 위에 어둡게) */
		void fallback(Camera cam) {
			try {
				for (Lit e : active) {   // 빛 지도와 같은 얹는 방식: 화면 × (1 + 빛) + 빛 × GLOW
					if (!seen(e.r.x, e.r.y)) continue;   // 못 보는 칸의 광원은 그리지 않음 (빛 지도를 못 쓰면 칸마다 지울 수 없어서)
					SmartTexture tx = bake(e.z / e.r.range, e.k / e.r.range);
					Gdx.gl.glBlendFunc(GL20.GL_DST_COLOR, GL20.GL_ONE); fan.draw(tx, e.r, cam, e.cr, e.cg, e.cb);
					Gdx.gl.glBlendFunc(GL20.GL_ONE, GL20.GL_ONE); fan.draw(tx, e.r, cam, e.cr * GLOW, e.cg * GLOW, e.cb * GLOW);
				}
			} finally { com.watabou.glwrap.Blending.setNormalMode(); }
			if (shadow == null) shadow = new Image(shadowTex()); else if (shadow.texture != shadowTex()) shadow.texture(shadowTex());
			for (Lit e : active) for (float[] c : charShadows(e)) {
				shadow.camera = cam;
				shadow.origin.set(0, shadow.height / 2f);
				shadow.scale.set(c[2] / shadow.width, c[3] / shadow.height);
				shadow.x = c[0]; shadow.y = c[1] - shadow.height / 2f;
				shadow.angle = (float) Math.toDegrees(c[4]);
				shadow.rm = shadow.gm = shadow.bm = 0; shadow.ra = shadow.ga = shadow.ba = 0;
				shadow.am = Math.min(0.7f, 0.3f + c[5] * 1.6f);
				shadow.draw();
			}
		}
		// 크기가 없는 그림이라 게임이 "화면 밖"으로 여겨 건너뛰지 않게 (화면을 옮기면 빛이 사라지던 문제)
		@Override public boolean isVisible() { return visible && camera() != null; }
		@Override public void draw() {
			Camera cam = camera(); if (cam == null || Dungeon.level == null) return;
			current = this;
			try {
				active.clear();
				for (Spot s : spots) if (s.on) collect(s, null, s.x, s.y, s.cfg, cam);
				for (CustomTilemap t : Dungeon.level.customTiles) {   // 맵 오브젝트에 붙은 광원 (밀면 따라감)
					if (!(t instanceof MakerProp)) continue;
					JsonValue d = MakerRuntime.props.get(((MakerProp) t).propId), lt = d == null ? null : d.get("light");
					if (lt == null || !lt.getBoolean("on", false)) continue;
					JsonValue ft = d.get("foot"); float fw = ft != null && ft.size >= 2 ? Math.max(1, ft.getInt(0)) : 1;
					collect(t, t, (t.tileX + fw / 2f) * 16 + lt.getFloat("ox", 0), (t.tileY + 0.5f) * 16 + lt.getFloat("oy", 0), lt, cam);
				}
				if (!active.isEmpty() || areas != null) {
					boolean done = false;
					if (gpuOk) try { done = gpu(cam, Dungeon.level); } catch (Throwable e) {
						gpuOk = false;
						MakerRuntime.warnOnce("광원 버퍼를 쓸 수 없어 예전 방식으로 그립니다: " + e + " @ " + (e.getStackTrace().length > 0 ? e.getStackTrace()[0] : ""));
					}
					if (!done && !active.isEmpty()) fallback(cam);   // 예전 방식은 지형 광원을 그리지 않음
					if (!told && System.getProperty("pdmaker.project") != null) {   // 테스트 플레이: 어느 방식으로 그리는지 한 번 알림
						told = true;
						note = ("[PDMaker] 광원 " + VERSION + ": " + (done ? "빛 지도 + 그림자 볼륨" : "예전 방식 (광원 버퍼 없음)") + " · 광원 " + active.size() + "개");   // 그리는 중에 로그 창을 바꾸지 않게 update 에서 씀
					}
				}
			} catch (Throwable e) { MakerRuntime.warnOnce("광원 그리기 오류: " + e + " @ " + (e.getStackTrace().length > 0 ? e.getStackTrace()[0] : "")); } finally { com.watabou.glwrap.Blending.setNormalMode(); }
		}
		@Override public void destroy() {
			if (current == this) current = null;
			super.destroy();
		}
	}

	static class Spot { float x, y; JsonValue cfg; String cond; boolean on = true; }
}
