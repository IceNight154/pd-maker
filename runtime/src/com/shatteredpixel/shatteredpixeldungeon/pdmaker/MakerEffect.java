/*
 * 이펙트 · 파티클 (편집기 "이펙트 · 파티클" — effects.json).  Defold ParticleFX 와 같은 구성: 이미터 여러 개 + 모디파이어 + 곡선
 *   list[] { id, name, sound, emitters: [E…], modifiers: [M…] }
 *     E { name, x, y, rot, mode: once|loop, duration, delay, startOffset, space: world|emitter, max, burst,
 *         type: circle|box|cone, blend: alpha|add|mult|screen, orient: default|initial|movement, inheritVel, stretchVel,
 *         sprite { png, fw, fh, frames: "0-3", fps, anim: none|life|loop|random }, color, colorSp,
 *         이미터 속성 { v, sp, pts }: rate sizeX sizeY life speed size alpha rot0 stretchX stretchY angVel   (pts = 이미터 진행 0~1 곡선)
 *         수명 속성 { v, pts }: lScale lAlpha lRot lStretchX lStretchY lAngVel,  lColor [[t,"#hex"]…]          (pts = 알갱이 수명 0~1 곡선)
 *         modifiers [M…] }
 *     M { type: accel|drag|radial|vortex, mag { v, sp, pts }, x, y, rot, maxDist }
 *   light { on, color, k, z, range, … } = 재생하는 동안 이펙트 자리에서 점광원 (MakerLights.fxLights — 알갱이가 줄면 함께 어두워짐)
 *   쓰는 곳
 *     · 이벤트 명령 "이펙트 재생" (effect): { fx, target: $hero|캐릭터 id, at: "char"|"xy", x, y }
 *     · 아이템: fxUse · fxThrow · fxEquip (행동 버튼을 누를 때 영웅에 붙어서)
 *     · 맵 오브젝트 종류 "이펙트" → Spot (층에 저장되는 CustomTilemap, 그 칸에서 계속 재생)
 *   단위: 게임 픽셀(한 칸 16px) · 초 · 도. 편집기 미리보기(editors/effect.js 의 Sim)와 같은 계산.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTilemap;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.glwrap.Blending;
import com.watabou.noosa.Game;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Group;
import com.watabou.noosa.Image;
import com.watabou.noosa.TextureFilm;
import com.watabou.noosa.Tilemap;
import com.watabou.noosa.Visual;
import com.watabou.utils.Bundle;
import com.watabou.utils.PointF;
import com.watabou.utils.Random;
import com.watabou.utils.RectF;

import java.util.ArrayList;

public class MakerEffect {

	// ------------------------------------------------------------ 값 · 곡선

	/** { v, sp, pts } — 곡선이 있으면 곡선, 없으면 v. sp = ± 퍼짐 */
	static class Key {
		float v, sp; float[] t, y;
		Key(JsonValue d, float def) {
			v = def;
			if (d == null) return;
			if (!d.isObject()) { v = d.asFloat(); return; }
			v = d.getFloat("v", def); sp = d.getFloat("sp", 0);
			JsonValue p = d.get("pts");
			if (p != null && p.isArray() && p.size > 0) { t = new float[p.size]; y = new float[p.size]; int i = 0; for (JsonValue q : p) { t[i] = q.getFloat(0); y[i] = q.getFloat(1); i++; } }
		}
		float at(float x) {
			if (t == null) return v;
			if (x <= t[0]) return y[0];
			for (int i = 1; i < t.length; i++) if (x <= t[i]) { float d = t[i] - t[i - 1]; return d <= 0 ? y[i] : y[i - 1] + (y[i] - y[i - 1]) * (x - t[i - 1]) / d; }
			return y[t.length - 1];
		}
		float roll(float x) { return at(x) + (sp != 0 ? Random.Float(-sp, sp) : 0); }
	}
	static class Mod {
		String type; Key mag; float x, y, rot, maxDist;
		Mod(JsonValue d) { type = d.getString("type", "accel"); mag = new Key(d.get("mag"), 0); x = d.getFloat("x", 0); y = d.getFloat("y", 0); rot = d.getFloat("rot", 0); maxDist = d.getFloat("maxDist", 0); }
	}
	static int hex(String s) { try { return Integer.parseInt(s.replace("#", ""), 16); } catch (Exception e) { return 0xFFFFFF; } }

	static class EDef {
		float x, y, rot, duration, delay, startOffset, inheritVel, colorSp, fps;
		int max, burst, color, fw, fh; boolean loop, world, stretchVel;
		String type, blend, orient, png, anim;
		int[] frames = {0};
		Key rate, sizeX, sizeY, life, speed, size, alpha, rot0, stretchX, stretchY, angVel, lScale, lAlpha, lRot, lStretchX, lStretchY, lAngVel;
		float[] gt; int[] gc;
		ArrayList<Mod> mods = new ArrayList<>();
		EDef(JsonValue d, JsonValue shared) {
			x = d.getFloat("x", 0); y = d.getFloat("y", 0); rot = d.getFloat("rot", 0);
			loop = "loop".equals(d.getString("mode", "once")); duration = Math.max(0.02f, d.getFloat("duration", 1)); delay = Math.max(0, d.getFloat("delay", 0)); startOffset = Math.max(0, d.getFloat("startOffset", 0));
			world = !"emitter".equals(d.getString("space", "world")); max = Math.max(1, d.getInt("max", 200)); burst = d.getInt("burst", 0);
			type = d.getString("type", "circle"); blend = d.getString("blend", "alpha"); orient = d.getString("orient", "default");
			inheritVel = d.getFloat("inheritVel", 0); stretchVel = d.getBoolean("stretchVel", false);
			color = hex(d.getString("color", "#ffffff")); colorSp = d.getFloat("colorSp", 0);
			JsonValue sp = d.get("sprite");
			png = sp == null ? "" : sp.getString("png", ""); fw = sp == null ? 0 : sp.getInt("fw", 0); fh = sp == null ? 0 : sp.getInt("fh", 0);
			fps = sp == null ? 10 : Math.max(1, sp.getFloat("fps", 10)); anim = sp == null ? "none" : sp.getString("anim", "none");
			if (sp != null) frames = parseFrames(sp.getString("frames", ""));
			rate = new Key(d.get("rate"), 0); sizeX = new Key(d.get("sizeX"), 0); sizeY = new Key(d.get("sizeY"), 0); life = new Key(d.get("life"), 0.8f); speed = new Key(d.get("speed"), 0);
			size = new Key(d.get("size"), 2); alpha = new Key(d.get("alpha"), 1); rot0 = new Key(d.get("rot0"), 0); stretchX = new Key(d.get("stretchX"), 1); stretchY = new Key(d.get("stretchY"), 1); angVel = new Key(d.get("angVel"), 0);
			lScale = new Key(d.get("lScale"), 1); lAlpha = new Key(d.get("lAlpha"), 1); lRot = new Key(d.get("lRot"), 0); lStretchX = new Key(d.get("lStretchX"), 1); lStretchY = new Key(d.get("lStretchY"), 1); lAngVel = new Key(d.get("lAngVel"), 0);
			JsonValue lc = d.get("lColor");
			if (lc != null && lc.isArray() && lc.size > 0) { gt = new float[lc.size]; gc = new int[lc.size]; int i = 0; for (JsonValue q : lc) { gt[i] = q.getFloat(0); gc[i] = hex(q.getString(1)); i++; } }
			JsonValue m = d.get("modifiers"); if (m != null) for (JsonValue q : m) mods.add(new Mod(q));
			if (shared != null) for (JsonValue q : shared) mods.add(new Mod(q));
		}
		static int[] parseFrames(String s) {
			ArrayList<Integer> out = new ArrayList<>();
			for (String part : s.split(",")) { try {
				String[] ab = part.trim().split("-");
				int a = Integer.parseInt(ab[0].trim()), b = ab.length > 1 ? Integer.parseInt(ab[1].trim()) : a;
				for (int i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) out.add(i);
			} catch (Exception ignored) { } }
			if (out.isEmpty()) return new int[]{0};
			int[] r = new int[out.size()]; for (int i = 0; i < r.length; i++) r[i] = out.get(i); return r;
		}
		/** 수명 동안 색 (곱) → {r,g,b} 0~1 */
		void tint(float k, float[] o) {
			if (gt == null) { o[0] = o[1] = o[2] = 1; return; }
			int a = gc[0], b = gc[0]; float f = 0;
			if (k > gt[0]) { a = b = gc[gt.length - 1]; for (int i = 1; i < gt.length; i++) if (k <= gt[i]) { a = gc[i - 1]; b = gc[i]; float d = gt[i] - gt[i - 1]; f = d <= 0 ? 1 : (k - gt[i - 1]) / d; break; } }
			for (int i = 0; i < 3; i++) { int sh = 16 - i * 8; float x = (a >> sh & 255), y2 = (b >> sh & 255); o[i] = (x + (y2 - x) * f) / 255f; }
		}
	}

	// ------------------------------------------------------------ 알갱이 · 이미터

	public static class P extends Image {
		float px, py, vx, vy, life, age, size, a0, rot, stx, sty, av, spin, dir, te, mr, cr, cg, cb; int fr, shown = -1;
		public P() { super(); }
	}

	static class Em extends Group {
		final EDef e; Object tx; TextureFilm film; float fwPx = 1, fhPx = 1;
		float t, acc; boolean burstDone, warmed;
		Em(EDef e) {
			this.e = e;
			if (!e.png.isEmpty()) tx = MakerRuntime.texture(e.png);
			if (tx == null) { tx = TextureCache.createSolid(0xFFFFFFFF); fwPx = fhPx = 1; }
			else { SmartTexture st = TextureCache.get(tx); fwPx = e.fw > 0 ? e.fw : st.width; fhPx = e.fh > 0 ? e.fh : st.height; if (e.fw > 0 && e.fh > 0) film = new TextureFilm(tx, e.fw, e.fh); }
		}
		String first() { for (Gizmo g : members) if (g instanceof P && g.alive) { P p = (P) g; return " p(" + p.x + "," + p.y + " s=" + p.scale.x + " a=" + p.am + " v=" + p.visible + " w=" + p.width + ")"; } return ""; }
		int living() { int n = 0; for (Gizmo g : members) if (g != null && g.exists && g.alive) n++; return n; }
		void spawn(float te, float cx, float cy, float cvx, float cvy) {
			if (living() >= e.max) return;
			float sx = e.sizeX.roll(te), sy = e.sizeY.roll(te), px = 0, py = 0, dx = 0, dy = -1;
			if (e.type.equals("box")) { px = (Random.Float() - 0.5f) * sx; py = (Random.Float() - 0.5f) * sy; }
			else if (e.type.equals("cone")) { float u = (float) Math.sqrt(Random.Float()); px = (Random.Float() - 0.5f) * sx * u; py = -u * sy; float l = (float) Math.hypot(px, py); if (l > 0.001f) { dx = px / l; dy = py / l; } }
			else { double a = Random.Float() * Math.PI * 2; float r = sx / 2f * (float) Math.sqrt(Random.Float()); dx = (float) Math.cos(a); dy = (float) Math.sin(a); px = dx * r; py = dy * r; }
			double rr = Math.toRadians(e.rot); float cs = (float) Math.cos(rr), sn = (float) Math.sin(rr);
			float t1 = px * cs - py * sn; py = px * sn + py * cs; px = t1;
			t1 = dx * cs - dy * sn; dy = dx * sn + dy * cs; dx = t1;
			P p = (P) recycle(P.class);
			p.revive(); p.texture(tx); p.shown = -1;
			float sp = e.speed.roll(te);
			p.px = (e.world ? cx : 0) + e.x + px; p.py = (e.world ? cy : 0) + e.y + py;
			p.vx = dx * sp + e.inheritVel * cvx; p.vy = dy * sp + e.inheritVel * cvy;
			p.life = Math.max(0.02f, e.life.roll(te)); p.age = 0; p.size = e.size.roll(te); p.a0 = e.alpha.roll(te); p.rot = e.rot0.roll(te);
			p.stx = e.stretchX.roll(te); p.sty = e.stretchY.roll(te); p.av = e.angVel.roll(te); p.spin = 0; p.te = te; p.mr = Random.Float(-1, 1);
			p.dir = (float) Math.toDegrees(Math.atan2(dy, dx)) + 90; p.fr = Random.Int(e.frames.length);
			float j = e.colorSp != 0 ? 1 + Random.Float(-e.colorSp, e.colorSp) : 1;
			p.cr = Math.min(1, (e.color >> 16 & 255) / 255f * j); p.cg = Math.min(1, (e.color >> 8 & 255) / 255f * j); p.cb = Math.min(1, (e.color & 255) / 255f * j);
			p.speed.set(0); p.acc.set(0);
		}
		void step(float dt, float cx, float cy, float cvx, float cvy, boolean loopAll, boolean emit) {
			t += dt; float local = t - e.delay;
			if (local >= e.duration) {
				if (e.loop && loopAll) { t -= e.duration; local -= e.duration; burstDone = false; }
				else if (loopAll && living() == 0) { t = 0; acc = 0; burstDone = false; local = -e.delay; }
			}
			if (emit && local >= 0 && local < e.duration) {
				float te = local / e.duration;
				if (!burstDone) { burstDone = true; for (int i = 0; i < e.burst; i++) spawn(te, cx, cy, cvx, cvy); }
				acc += Math.max(0, e.rate.at(te)) * dt;
				while (acc >= 1) { acc -= 1; spawn(te, cx, cy, cvx, cvy); }
			}
			float bx = (e.world ? cx : 0) + e.x, by = (e.world ? cy : 0) + e.y;
			for (Gizmo g : members) {
				if (!(g instanceof P) || !g.exists || !g.alive) continue;
				P p = (P) g;
				p.age += dt; float k = p.age / p.life;
				if (k >= 1) { p.kill(); continue; }
				for (Mod m : e.mods) {
					float mag = m.mag.at(p.te) + p.mr * m.mag.sp;
					if (m.type.equals("accel")) { double r = Math.toRadians(m.rot); p.vx += Math.sin(r) * mag * dt; p.vy += -Math.cos(r) * mag * dt; }
					else if (m.type.equals("drag")) { float f = Math.max(0, 1 - mag * dt); p.vx *= f; p.vy *= f; }
					else {
						float ox = p.px - (bx + m.x), oy = p.py - (by + m.y), d = (float) Math.hypot(ox, oy);
						if (d < 0.001f || (m.maxDist > 0 && d > m.maxDist)) continue;
						if (m.type.equals("radial")) { p.vx += ox / d * mag * dt; p.vy += oy / d * mag * dt; } else { p.vx += -oy / d * mag * dt; p.vy += ox / d * mag * dt; }
					}
				}
				p.px += p.vx * dt; p.py += p.vy * dt; p.spin += (p.av + e.lAngVel.at(k)) * dt;
			}
		}
		private final float[] tc = new float[3];
		/** 계산한 값을 그림에 반영 */
		void apply(float cx, float cy) {
			int n = e.frames.length; boolean screen = e.blend.equals("screen");
			for (Gizmo g : members) {
				if (!(g instanceof P) || !g.exists || !g.alive) continue;
				P p = (P) g; float k = p.age / p.life;
				int fi = e.anim.equals("life") ? Math.min(n - 1, (int) (k * n)) : e.anim.equals("loop") ? (int) (p.age * e.fps) % n : e.anim.equals("random") ? p.fr : 0;
				int f = e.frames[fi];
				if (film != null && f != p.shown) { RectF r = film.get(f); if (r != null) p.frame(r); p.shown = f; }
				float w = p.size * e.lScale.at(k), spd = (float) Math.hypot(p.vx, p.vy);
				float sx = p.stx * e.lStretchX.at(k), sy = p.sty * e.lStretchY.at(k) * (e.stretchVel ? 1 + spd / 40f : 1);
				boolean move = e.orient.equals("movement") || e.stretchVel;
				float base = move ? (float) Math.toDegrees(Math.atan2(p.vy, p.vx)) + 90 : e.orient.equals("initial") ? p.dir : 0;
				float a = Math.max(0, Math.min(1, p.a0 * e.lAlpha.at(k)));
				p.visible = w > 0 && a > 0;
				p.origin.set(p.width / 2f, p.height / 2f);
				float s = w / fwPx;
				p.scale.set(s * sx, s * sy);
				p.angle = base + p.rot + e.lRot.at(k) + p.spin;
				p.x = p.px + (e.world ? 0 : cx) - p.width / 2f; p.y = p.py + (e.world ? 0 : cy) - p.height / 2f;
				e.tint(k, tc);
				float pm = screen ? a : 1;   // 스크린은 알파를 색에 곱해서
				p.rm = p.cr * tc[0] * pm; p.gm = p.cg * tc[1] * pm; p.bm = p.cb * tc[2] * pm; p.am = a;
			}
		}
		@Override public void draw() {
			switch (e.blend) {
				case "add": Blending.setLightMode(); break;
				case "mult": Gdx.gl.glBlendFunc(GL20.GL_DST_COLOR, GL20.GL_ONE_MINUS_SRC_ALPHA); break;
				case "screen": Gdx.gl.glBlendFunc(GL20.GL_ONE_MINUS_DST_COLOR, GL20.GL_ONE); break;
				default: super.draw(); return;
			}
			super.draw();
			Blending.setNormalMode();
		}
	}

	/** 이펙트 하나의 재생 (화면에 붙는 그룹) */
	public static class Sys extends Group {
		final ArrayList<Em> ems = new ArrayList<>();
		PointF center = new PointF(); Visual follow; boolean loopAll, emitting = true;
		private float lx, ly; private boolean first = true;
		Sys(JsonValue fx, boolean loopAll) {
			this.loopAll = loopAll;
			JsonValue es = fx.get("emitters");
			if (es != null) for (JsonValue d : es) { Em m = new Em(new EDef(d, fx.get("modifiers"))); ems.add(m); add(m); }
			light = MakerLights.addFx(fx);
		}
		final MakerLights.FxLight light; int peak;
		@Override public synchronized void destroy() { MakerLights.removeFx(light); super.destroy(); }
		boolean finished() {
			for (Em m : ems) if (m.t < m.e.delay + m.e.duration || m.living() > 0) return false;
			return true;
		}
		@Override public void update() {
			float dt = Math.min(0.05f, Game.elapsed);
			if (follow != null && follow.parent != null) center.set(follow.center());
			float cvx = first ? 0 : (center.x - lx) / Math.max(dt, 0.001f), cvy = first ? 0 : (center.y - ly) / Math.max(dt, 0.001f);
			lx = center.x; ly = center.y; first = false;
			for (Em m : ems) {
				if (!m.warmed) { m.warmed = true; float w = m.e.startOffset; while (w > 0) { m.step(Math.min(w, 1 / 30f), center.x, center.y, 0, 0, loopAll, true); w -= 1 / 30f; } }
				m.step(dt, center.x, center.y, cvx, cvy, loopAll, emitting);
				m.apply(center.x, center.y);
			}
			super.update();
			if (light != null) {   // 빛: 이펙트 가운데를 따라감, 한 번 재생이면 살아 있는 알갱이 수에 맞춰 어두워짐
				int n = 0; for (Em m : ems) n += m.living(); peak = Math.max(peak, n);
				light.x = center.x; light.y = center.y; light.amt = !shown ? 0 : loopAll || peak == 0 ? 1 : n / (float) peak;
			}
			if (!loopAll && finished()) { MakerLights.removeFx(light); host.killAndErase(); }
		}
		/** 게임 화면의 이펙트 층은 Visual 만 받으므로, 이 그룹을 대신 돌려 주는 빈 Visual */
		final Visual host = new Visual(0, 0, 0, 0) {
			@Override public void update() { Sys.this.camera = camera(); Sys.this.visible = shown; Sys.this.update(); }
			@Override public void draw() { if (shown) Sys.this.draw(); }
			@Override public boolean isVisible() { return shown; }   // 크기가 없는 Visual 이라 화면 밖으로 판정되지 않게
			@Override public void destroy() { Sys.this.destroy(); super.destroy(); }
		};
		boolean shown = true;
	}

	// ------------------------------------------------------------ 재생

	static JsonValue find(String id) {
		JsonValue l = MakerRuntime.effects == null ? null : MakerRuntime.effects.get("list");
		if (l != null && id != null) for (JsonValue v : l) if (id.equals(v.getString("id", ""))) return v;
		return null;
	}
	static Sys lastSys;
	/** 테스트용: 마지막으로 재생한 이펙트의 상태 */
	public static String debug() {
		Sys s = lastSys; if (s == null) return "none";
		StringBuilder b = new StringBuilder("center=" + s.center.x + "," + s.center.y + " hostParent=" + (s.host.parent != null) + " alive=" + s.host.alive);
		for (Em m : s.ems) { b.append(" | t=").append(m.t).append(" living=").append(m.living()); b.append(m.first()); }
		return b.toString();
	}
	/** 한 번 재생 (월드 좌표 또는 따라갈 그림). 그리기 스레드가 아니어도 됨 */
	public static void play(final String id, final PointF center, final Visual follow) {
		if (id == null || id.isEmpty() || (center == null && follow == null)) return;
		Game.runOnRenderThread(() -> {
			try {
				JsonValue d = find(id);
				if (d == null) { MakerRuntime.warnOnce("없는 이펙트: " + id); return; }
				if (d.get("emitters") == null) { MakerRuntime.warnOnce("이펙트 「" + id + "」 이(가) 예전 형식입니다 — 편집기에서 프로젝트를 열고 저장하세요"); return; }
				Sys s = new Sys(d, false);
				s.follow = follow; if (center != null) s.center.set(center); else s.center.set(follow.center());
				GameScene.effect(s.host); lastSys = s;
				String snd = d.getString("sound", "");
				if (!snd.isEmpty() && !snd.equals("none")) MakerAudio.playSe(snd);
			} catch (Throwable t) { MakerRuntime.log("이펙트 오류: " + t); }
		});
	}
	public static void playAt(String id, int cell) { if (cell >= 0) play(id, DungeonTilemap.tileCenterToWorld(cell), null); }
	public static void playOn(String id, com.shatteredpixel.shatteredpixeldungeon.actors.Char ch) {
		if (ch == null) return;
		if (ch.sprite != null && ch.sprite.parent != null) play(id, null, ch.sprite); else playAt(id, ch.pos);
	}
	/** 아이템 행동 (MakerAudio.onItemAction 에서): 프로젝트 아이템의 fxUse · fxThrow · fxEquip */
	static void itemAction(com.shatteredpixel.shatteredpixeldungeon.items.Item it, String key) {
		String pid = MakerAudio.projectItemId(it);
		JsonValue d = pid == null ? null : MakerRuntime.item(pid);
		if (d == null || Dungeon.hero == null) return;
		String fx = d.getString("fx" + Character.toUpperCase(key.charAt(0)) + key.substring(1), "");
		if (!fx.isEmpty()) playOn(fx, Dungeon.hero);
	}

	// ------------------------------------------------------------ 맵에 놓는 이펙트 (계속 재생)

	public static class Spot extends CustomTilemap {
		String fxId = "";
		{ tileW = tileH = 1; }
		class Vis extends Tilemap {
			Sys sys; boolean bad;
			Vis() { super(Assets.Environment.TERRAIN_FEATURES, new TextureFilm(Assets.Environment.TERRAIN_FEATURES, 16, 16)); }
			@Override public void draw() { /* 그림 없음 — 파티클만 */ }
			@Override public void update() {
				super.update();
				if (bad) return;
				try {
					Level l = Dungeon.level; if (l == null) return;
					int cell = tileX + tileY * l.width();
					if (sys == null || !sys.host.alive || sys.host.parent == null) {
						JsonValue d = find(fxId);
						if (d == null || d.get("emitters") == null) { bad = true; return; }
						sys = new Sys(d, true);
						sys.center.set(DungeonTilemap.tileCenterToWorld(cell));
						GameScene.effect(sys.host);
					}
					boolean seen = cell >= 0 && cell < l.length() && l.heroFOV != null && l.heroFOV[cell];
					sys.shown = seen; sys.emitting = seen;
				} catch (Throwable t) { bad = true; MakerRuntime.log("맵 이펙트 오류: " + t); }
			}
			@Override public void destroy() { if (sys != null) sys.host.killAndErase(); super.destroy(); }
		}
		@Override public Tilemap create() { vis = new Vis(); vis.x = tileX * 16; vis.y = tileY * 16; return vis; }
		@Override public com.watabou.noosa.Image image(int tx, int ty) { return null; }   // 살펴보기 창에 끼어들지 않음 (그림 데이터가 없어서 예전엔 오류)
		@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("pdm_fx", fxId); }
		@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); fxId = b.getString("pdm_fx"); }
	}
	/** 층을 만들 때 놓기 */
	public static void place(Level l, String id, int cell) {
		if (cell < 0 || cell >= l.length()) return;
		Spot s = new Spot(); s.fxId = id; s.pos(cell, l);
		l.customTiles.add(s);
	}
}
