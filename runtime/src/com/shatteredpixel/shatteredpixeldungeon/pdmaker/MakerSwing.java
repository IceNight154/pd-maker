/*
 * PDMaker — 무기 공격 모션: 영웅이 공격할 때 그 무기의 아이템 그림이 영웅 가운데에서 휘둘러짐 (편집기 swing.js 와 같은 계산)
 *   데이터: 프로젝트 아이템 items/<id>.json attackFx (없으면 게임 클래스 사슬로 gameitems.json items["spd:weapon.melee.X"].attackFx)
 *     attackFx { on, keys: [[t(0~1), 각도(°, 바라보는 쪽 기준 · + = 시계 방향), 거리(px), 크기, 불투명도]], hits: [t …], dur(초),
 *                dist(+px), speed(배), scale(배), behind, trail(이펙트 id), trailEvery(초), hit(이펙트 id), hitAt(tip | target), sound }
 *   그림: 아이템 그림의 왼쪽 아래 = 손잡이(돌아가는 중심), 오른쪽 위 = 날(그림 안에서 -45°).
 *   방향: θ = φ(영웅 → 대상) + 각도, 왼쪽을 보면(또는 위 · 아래를 보며 영웅 그림이 뒤집혀 있으면) θ = φ − 각도 + 무기 그림도 좌우로 뒤집음(날 -135°)
 *   연결 줄: CharSprite.attack(cell, callback) 의 play(attack) 바로 뒤 — 영웅만. 게임의 피해 · 공격 동작은 그대로 (그림만 더함)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTilemap;
import com.watabou.noosa.Game;
import com.watabou.utils.PointF;

public class MakerSwing {

	static final String ITEMS = "com.shatteredpixel.shatteredpixeldungeon.items.";
	/** 지금까지 나온 공격 모션 수 (테스트 도구용) */
	public static int spawned;

	/** 이 무기의 attackFx (켜져 있을 때만) — 프로젝트 아이템 자기 설정 → 게임 클래스 사슬(gameitems) */
	static JsonValue cfg(Item w) {
		if (w == null || !MakerRuntime.isActive()) return null;
		String pid = MakerAudio.projectItemId(w);
		if (pid != null) { JsonValue d = MakerRuntime.item(pid), f = d == null ? null : d.get("attackFx"); if (ok(f)) return f; }
		JsonValue gi = MakerRuntime.gameitems == null ? null : MakerRuntime.gameitems.get("items");
		if (gi == null) return null;
		for (Class<?> c = w.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
			if (!c.getName().startsWith(ITEMS)) continue;
			JsonValue e = gi.get("spd:" + c.getName().substring(ITEMS.length()).replace('$', '.')), f = e == null ? null : e.get("attackFx");
			if (ok(f)) return f;
		}
		return null;
	}
	static boolean ok(JsonValue f) { return f != null && f.getBoolean("on", false) && f.get("keys") != null && f.get("keys").size >= 2; }

	/** CharSprite.attack 연결 줄 */
	public static void onAttack(CharSprite sp, int cell) {
		try {
			if (sp == null || !(sp.ch instanceof Hero) || sp.parent == null || Dungeon.level == null) return;
			Hero hero = (Hero) sp.ch;
			Object w = hero.belongings.attackingWeapon();
			if (!(w instanceof Item)) return;
			JsonValue c = cfg((Item) w);
			if (c == null) return;
			String snd = c.getString("sound", ""); if (!snd.isEmpty()) MakerAudio.playSe(snd);
			Swing s = new Swing((Item) w, sp, cell, c);
			spawned++;
			sp.parent.add(s);
			if (c.getBoolean("behind", false)) {   // 영웅 그림 바로 뒤로
				Object m = MakerCompat.getField(sp.parent, "members");
				if (m instanceof java.util.List) { @SuppressWarnings("unchecked") java.util.List<Object> l = (java.util.List<Object>) m; l.remove(s); int i = l.indexOf(sp); l.add(Math.max(0, i), s); }
			}
		} catch (Throwable t) { MakerRuntime.log("공격 모션 오류: " + t); }
	}

	/** t(0~1) 에서의 [각도, 거리, 크기, 불투명도] — 구간마다 smoothstep (편집기 PDM.swingSample 과 같음) */
	static float[] sample(JsonValue keys, float t) {
		JsonValue a = keys.get(0);
		if (t <= a.getFloat(0)) return new float[]{ a.getFloat(1), a.getFloat(2), a.getFloat(3), a.getFloat(4) };
		for (int i = 1; i < keys.size; i++) {
			JsonValue p = keys.get(i - 1), b = keys.get(i);
			if (t <= b.getFloat(0)) {
				float u = (t - p.getFloat(0)) / Math.max(1e-6f, b.getFloat(0) - p.getFloat(0)); u = u * u * (3 - 2 * u);
				float[] r = new float[4];
				for (int j = 0; j < 4; j++) r[j] = p.getFloat(j + 1) + (b.getFloat(j + 1) - p.getFloat(j + 1)) * u;
				return r;
			}
		}
		JsonValue z = keys.get(keys.size - 1);
		return new float[]{ z.getFloat(1), z.getFloat(2), z.getFloat(3), z.getFloat(4) };
	}

	public static class Swing extends ItemSprite {
		final CharSprite owner; final JsonValue c, keys; final int cell;
		final float face, dur, dist, scl, trailEvery; final boolean mirror;
		final float[] hits; final boolean[] hitDone;
		float time, trailT;
		/** 마지막으로 계산한 날 끝 (테스트 도구용) */
		public PointF lastTip;

		Swing(Item w, CharSprite owner, int cell, JsonValue c) {
			super(w);
			this.owner = owner; this.c = c; this.keys = c.get("keys"); this.cell = cell;
			int W = Dungeon.level.width(), pos = owner.ch.pos;
			int dx = cell % W - pos % W, dy = cell / W - pos / W;
			face = (dx == 0 && dy == 0) ? (owner.flipHorizontal ? 180 : 0) : (float) Math.toDegrees(Math.atan2(dy, dx));
			mirror = dx < 0 || (dx == 0 && owner.flipHorizontal);
			dur = Math.max(0.05f, c.getFloat("dur", 0.3f) / Math.max(0.1f, c.getFloat("speed", 1f)));
			dist = c.getFloat("dist", 0f); scl = c.getFloat("scale", 1f); trailEvery = Math.max(0.01f, c.getFloat("trailEvery", 0.03f));
			JsonValue hs = c.get("hits"); hits = new float[hs == null ? 0 : hs.size]; for (int i = 0; i < hits.length; i++) hits[i] = hs.getFloat(i);
			hitDone = new boolean[hits.length];
			flipHorizontal = mirror;
			updateFrame();   // 뒤집기는 그림 칸(frame)을 다시 정할 때만 반영됨 — 생성자에서 이미 칸이 정해졌으므로 직접 다시 (안 하면 왼쪽을 볼 때 그림은 안 뒤집히고 중심 · 날 방향만 뒤집혀 꼬임)
			origin.set(mirror ? width : 0, height);   // 손잡이 = 왼쪽 아래 (뒤집으면 오른쪽 아래)
			pose(0f);
		}
		/** t 에서 자리 · 각도 · 크기 · 불투명도를 정하고 날 끝(세상 좌표)을 돌려줌 */
		PointF pose(float t) {
			float[] s = sample(keys, t);
			double th = Math.toRadians(face + (mirror ? -s[0] : s[0]));
			float d = s[1] + dist, sc = s[2] * scl;
			PointF ctr = owner.center();
			float px = ctr.x + (float) Math.cos(th) * d, py = ctr.y + (float) Math.sin(th) * d;
			double r = th + (mirror ? 3 : 1) * Math.PI / 4;
			angle = (float) Math.toDegrees(r);
			scale.set(sc);
			alpha(Math.max(0f, Math.min(1f, s[3])));
			x = px - origin.x; y = py - origin.y;
			float vx = (mirror ? -width : width) * sc, vy = -height * sc;
			return new PointF(px + vx * (float) Math.cos(r) - vy * (float) Math.sin(r), py + vx * (float) Math.sin(r) + vy * (float) Math.cos(r));
		}
		@Override public void update() {
			super.update();
			time += Game.elapsed;
			float t = Math.min(1f, time / dur);
			PointF tip = pose(t); lastTip = tip;
			try {
				String tr = c.getString("trail", "");
				if (!tr.isEmpty() && (trailT -= Game.elapsed) <= 0 && t < 1f) { trailT = trailEvery; MakerEffect.play(tr, tip, null); }
				String hf = c.getString("hit", "");
				for (int i = 0; i < hits.length; i++) if (!hitDone[i] && t >= hits[i]) {
					hitDone[i] = true;
					if (!hf.isEmpty()) MakerEffect.play(hf, "target".equals(c.getString("hitAt", "tip")) ? DungeonTilemap.tileCenterToWorld(cell) : tip, null);
				}
			} catch (Throwable e) { MakerRuntime.log("공격 모션 이펙트 오류: " + e); }
			if (time >= dur) killAndErase();
		}
		// 바닥 아이템처럼 떨어지거나 반짝이지 않게
		@Override public void link() { }
	}
}
