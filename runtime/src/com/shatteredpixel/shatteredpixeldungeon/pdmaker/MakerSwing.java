/*
 * PDMaker — 무기 공격 모션: 영웅이 공격할 때 그 무기의 아이템 그림이 영웅 가운데에서 휘둘러짐 (편집기 swing.js 와 같은 계산)
 *   데이터: 프로젝트 아이템 items/<id>.json attackFx (없으면 게임 클래스 사슬로 gameitems.json items["spd:weapon.melee.X"].attackFx)
 *     attackFx { on, keys: [[t(0~1), 각도(°, 바라보는 쪽 기준 · + = 시계 방향), 거리(px), 크기, 불투명도]], hits: [t …], dur(초),
 *                dist(+px), speed(배), scale(배), behind, trail(이펙트 id), trailEvery(초), hit(이펙트 id), hitAt(tip | target), sound }
 *   그림: 아이템 그림의 왼쪽 아래 = 손잡이(돌아가는 중심), 오른쪽 위 = 날(그림 안에서 -45°).
 *   방향: θ = φ(영웅 → 대상) + 각도, 왼쪽을 보면(또는 위 · 아래를 보며 영웅 그림이 뒤집혀 있으면) θ = φ − 각도 + 무기 그림도 좌우로 뒤집음(날 -135°)
 *   연결 줄: CharSprite.attack(cell, callback) 의 play(attack) 바로 뒤 — 영웅만. 게임의 피해 계산은 그대로 (그림 · 이펙트를 더함)
 *   8차: 자리 · 이징 · 이펙트 시각은 MakerAtkMotion (편집기 atkmotion.js 와 같은 규칙) — 2판 tracks (속성마다 키프레임 · 이징) · events (같은 타임라인의 이펙트:
 *        effect · flash · shake(MakerCamera.shake) · sound · trail · shock(충격파) · image · projectile) · sync 'hit' = 게임 공격 동작 길이를 첫 타격 시각에 맞춤
 *        (판정 = 영웅 공격 동작이 끝날 때 → 그 공격에만 한 칸 시간을 바꿈, 다음 공격 · 모션 없는 무기는 원래 값). 1판 keys 는 같은 계산으로 그대로
 *   정리: 모션 · 이펙트가 모두 끝나면 스스로 지움 (화면이 바뀌면 화면과 함께 · 저장하지 않음). 이미지 이펙트도 같이 지움 — 여러 번 공격해도 쌓이지 않음
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
	static boolean ok(JsonValue f) {
		if (f == null || !f.getBoolean("on", false)) return false;
		try { for (java.util.List<MakerAtkMotion.Key> t : MakerAtkMotion.tracksOf(new MakerTitle.JV(f))) if (!t.isEmpty()) return true; } catch (Throwable e) { MakerRuntime.warnOnce("공격 모션 데이터 오류: " + e); }
		return false;
	}
	/** 게임 공격 동작(CharSprite.attack 애니메이션)의 원래 한 칸 시간 — 판정 맞추기(sync 'hit')가 바꾼 것을 되돌릴 때 */
	private static final java.util.Map<CharSprite, Float> origDelay = new java.util.WeakHashMap<>();
	private static java.lang.reflect.Field ATTACK;
	public static com.watabou.noosa.MovieClip.Animation attackAnim(CharSprite sp) {
		try { if (ATTACK == null) { ATTACK = CharSprite.class.getDeclaredField("attack"); ATTACK.setAccessible(true); } return (com.watabou.noosa.MovieClip.Animation) ATTACK.get(sp); } catch (Throwable e) { return null; }
	}
	/** 판정 맞추기: sync 'hit' 이면 이번 공격 동작이 첫 타격 시각에 끝나게 (게임은 공격 동작이 끝날 때 피해를 줌), 아니면 원래 값 */
	static void syncAttack(CharSprite sp, JsonValue c) {
		com.watabou.noosa.MovieClip.Animation a = attackAnim(sp);
		if (a == null || a.frames == null) return;
		Float o = origDelay.get(sp);
		double d = c == null ? -1 : MakerAtkMotion.syncDelay(new MakerTitle.JV(c), a.frames.length);
		if (d > 0) { if (o == null) origDelay.put(sp, a.delay); a.delay = (float) d; lastSyncDelay = (float) d; }
		else if (o != null) { a.delay = o; origDelay.remove(sp); lastSyncDelay = -1; }
	}
	/** 테스트 도구용: 마지막 공격 동작을 시작한 시각 (System.nanoTime) — 판정까지 걸린 시간을 잼 */
	public static long lastAttackNanos;
	/** 테스트 도구용: 마지막 판정 맞추기 한 칸 시간 (-1 = 원래) */
	public static float lastSyncDelay = -1;
	/** 테스트 도구용: 이펙트를 낸 수 · 살아 있는 모션 · 이미지 수 */
	public static int fxFired;
	public static final java.util.Set<Object> LIVE = java.util.Collections.newSetFromMap(new java.util.WeakHashMap<>());

	/** CharSprite.attack 연결 줄 */
	public static void onAttack(CharSprite sp, int cell) {
		try {
			if (sp == null || !(sp.ch instanceof Hero) || sp.parent == null || Dungeon.level == null) return;
			Hero hero = (Hero) sp.ch;
			Object w = hero.belongings.attackingWeapon();
			if (!(w instanceof Item)) return;
			JsonValue c = cfg((Item) w);
			lastAttackNanos = System.nanoTime();
			syncAttack(sp, c);   // 모션이 없거나 sync 가 아니면 원래 동작 길이로 되돌림
			if (c == null) return;
			String snd = c.getString("sound", ""); if (!snd.isEmpty()) MakerAudio.playSe(snd);
			final Item it = (Item) w;
			// 8차: 그림을 화면 무리(Group)에 넣는 일은 화면(GL) 스레드에서 — 게임(Actor) 스레드는 CharSprite.attack 의 영웅 그림 잠금을 쥔 채 여기로 오고,
			//      화면 스레드는 Group.update 의 무리 잠금을 쥔 채 영웅 그림을 기다리므로, 여기서 바로 add 하면 서로 기다려 멈춤 (교착)
			if (Thread.currentThread().getName().startsWith("SHPD Actor")) Game.runOnRenderThread(() -> spawn(it, sp, cell, c));
			else spawn(it, sp, cell, c);
		} catch (Throwable t) { MakerRuntime.log("공격 모션 오류: " + t); }
	}
	static void spawn(Item w, CharSprite sp, int cell, JsonValue c) {
		try {
			if (sp.parent == null || Dungeon.level == null) return;   // 그 사이 화면이 바뀜
			Swing s = new Swing(w, sp, cell, c);
			spawned++;
			sp.parent.add(s);
			if (c.getBoolean("behind", false)) {   // 영웅 그림 바로 뒤로
				Object m = MakerCompat.getField(sp.parent, "members");
				if (m instanceof java.util.List) { @SuppressWarnings("unchecked") java.util.List<Object> l = (java.util.List<Object>) m; l.remove(s); int i = l.indexOf(sp); l.add(Math.max(0, i), s); }
			}
		} catch (Throwable t) { MakerRuntime.log("공격 모션 오류: " + t); }
	}

	public static class Swing extends ItemSprite {
		final CharSprite owner; final JsonValue c; final int cell;
		final java.util.List<java.util.List<MakerAtkMotion.Key>> tracks;
		final java.util.List<MakerAtkMotion.Ev> events; final boolean[] evOn, evDone; final float[] evTrail;
		final float face, dur, dist, scl, trailEvery, life; final boolean mirror;
		final float[] hits; final boolean[] hitDone;
		final java.util.List<com.watabou.noosa.Gizmo> spawned = new java.util.ArrayList<>();
		float time, trailT; boolean shook;
		/** 마지막으로 계산한 날 끝 (테스트 도구용) */
		public PointF lastTip;

		Swing(Item w, CharSprite owner, int cell, JsonValue c) {
			super(w);
			this.owner = owner; this.c = c; this.cell = cell;
			MakerTitle.JV v = new MakerTitle.JV(c);
			tracks = MakerAtkMotion.tracksOf(v); events = MakerAtkMotion.eventsOf(v);
			evOn = new boolean[events.size()]; evDone = new boolean[events.size()]; evTrail = new float[events.size()];
			int W = Dungeon.level.width(), pos = owner.ch.pos;
			int dx = cell % W - pos % W, dy = cell / W - pos / W;
			face = (dx == 0 && dy == 0) ? (owner.flipHorizontal ? 180 : 0) : (float) Math.toDegrees(Math.atan2(dy, dx));
			mirror = dx < 0 || (dx == 0 && owner.flipHorizontal);
			dur = (float) MakerAtkMotion.durOf(v);
			float end = dur; for (MakerAtkMotion.Ev e : events) end = (float) Math.max(end, e.t * dur + e.dur);
			life = end;
			dist = c.getFloat("dist", 0f); scl = c.getFloat("scale", 1f); trailEvery = Math.max(0.01f, c.getFloat("trailEvery", 0.03f));
			double[] hs = MakerAtkMotion.hitsOf(v); hits = new float[hs.length]; for (int i = 0; i < hits.length; i++) hits[i] = (float) hs[i];
			hitDone = new boolean[hits.length];
			flipHorizontal = mirror;
			updateFrame();   // 뒤집기는 그림 칸(frame)을 다시 정할 때만 반영됨 — 생성자에서 이미 칸이 정해졌으므로 직접 다시 (안 하면 왼쪽을 볼 때 그림은 안 뒤집히고 중심 · 날 방향만 뒤집혀 꼬임)
			origin.set(mirror ? width : 0, height);   // 손잡이 = 왼쪽 아래 (뒤집으면 오른쪽 아래)
			LIVE.add(this);
			pose(0f);
		}
		/** t 에서 자리 · 각도 · 크기 · 불투명도를 정하고 날 끝(세상 좌표)을 돌려줌 (편집기 미리보기와 같은 계산) */
		PointF pose(float t) {
			double[] s = MakerAtkMotion.sample(tracks, t);
			double f = Math.toRadians(face), th = Math.toRadians(face + (mirror ? -s[0] : s[0]));
			float d = (float) s[1] + dist, sc = (float) s[2] * scl;
			double fwd = s[4], side = mirror ? -s[5] : s[5];   // 앞 · 옆 오프셋 (옆 + = 바라보는 쪽에서 시계 방향)
			PointF ctr = owner.center();
			float px = ctr.x + (float) (Math.cos(th) * d + Math.cos(f) * fwd - Math.sin(f) * side), py = ctr.y + (float) (Math.sin(th) * d + Math.sin(f) * fwd + Math.cos(f) * side);
			double r = th + (mirror ? 3 : 1) * Math.PI / 4;
			angle = (float) Math.toDegrees(r);
			scale.set(sc);
			alpha((float) Math.max(0, Math.min(1, s[3])));
			x = px - origin.x; y = py - origin.y;
			float vx = (mirror ? -width : width) * sc, vy = -height * sc;
			return new PointF(px + vx * (float) Math.cos(r) - vy * (float) Math.sin(r), py + vx * (float) Math.sin(r) + vy * (float) Math.cos(r));
		}
		@Override public void update() {
			super.update();
			time += Game.elapsed;
			float t = Math.min(1f, time / dur);
			PointF tip = pose(t); lastTip = tip;
			if (time >= dur) visible = false;   // 그림은 끝 — 이펙트가 남았으면 그것만 마저
			try {
				String tr = c.getString("trail", "");
				if (!tr.isEmpty() && (trailT -= Game.elapsed) <= 0 && t < 1f) { trailT = trailEvery; MakerEffect.play(tr, tip, null); }
				String hf = c.getString("hit", "");
				for (int i = 0; i < hits.length; i++) if (!hitDone[i] && t >= hits[i]) {
					hitDone[i] = true;
					if (!hf.isEmpty()) MakerEffect.play(hf, "target".equals(c.getString("hitAt", "tip")) ? DungeonTilemap.tileCenterToWorld(cell) : tip, null);
				}
				for (int i = 0; i < events.size(); i++) {
					if (evDone[i]) continue;
					MakerAtkMotion.Ev e = events.get(i);
					double[] es = MakerAtkMotion.eventState(e, dur, time);
					if (es[0] == 0) continue;
					if (!evOn[i]) { evOn[i] = true; fire(e, tip); fxFired++; }
					if ("trail".equals(e.type) && es[0] == 1 && !e.ref.isEmpty() && (evTrail[i] -= Game.elapsed) <= 0) { evTrail[i] = (float) e.every; MakerEffect.play(e.ref, anchor(e, tip), null); }
					if (es[0] == 2 || es[0] == 3) { evDone[i] = true; if ("shake".equals(e.type)) MakerCamera.eventEnded(this); }
				}
			} catch (Throwable e) { MakerRuntime.log("공격 모션 이펙트 오류: " + e); }
			if (time >= life) killAndErase();
		}
		/** 이펙트의 기준점: 무기 끝 · 영웅 가운데 · 대상 칸 가운데 */
		PointF anchor(MakerAtkMotion.Ev e, PointF tip) {
			if ("hero".equals(e.anchor)) return owner.center();
			if ("target".equals(e.anchor)) return DungeonTilemap.tileCenterToWorld(cell);
			return tip == null ? owner.center() : new PointF(tip.x, tip.y);
		}
		int anchorCell(MakerAtkMotion.Ev e, PointF tip) {
			if ("hero".equals(e.anchor)) return owner.ch.pos;
			if ("target".equals(e.anchor) || tip == null) return cell;
			int W = Dungeon.level.width(); int cx = (int) (tip.x / DungeonTilemap.SIZE), cy = (int) (tip.y / DungeonTilemap.SIZE);
			return Math.max(0, Math.min(Dungeon.level.length() - 1, cx + cy * W));
		}
		/** 그 칸의 캐릭터 — 화면(GL) 스레드에서 부르므로 Actor.findChar(Actor.class 잠금 — 공격 동작을 기다리는 게임 스레드가 쥐고 있음 → 교착)를 쓰지 않고 목록을 훑음 */
		static com.shatteredpixel.shatteredpixeldungeon.actors.Char charAt(int cell) {
			try {
				if (Dungeon.hero != null && Dungeon.hero.pos == cell) return Dungeon.hero;
				for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : Dungeon.level.mobs.toArray(new com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob[0])) if (m.pos == cell) return m;
			} catch (Throwable ignored) { }
			return null;
		}
		void fire(MakerAtkMotion.Ev e, PointF tip) {
			switch (e.type) {
				case "effect": if (!e.ref.isEmpty()) MakerEffect.play(e.ref, anchor(e, tip), null); break;
				case "sound": if (!e.ref.isEmpty()) MakerAudio.playSe(e.ref); break;
				case "flash": { com.shatteredpixel.shatteredpixeldungeon.actors.Char ch = "hero".equals(e.anchor) ? owner.ch : charAt(anchorCell(e, tip)); if (ch != null && ch.sprite != null) ch.sprite.flash(); break; }
				case "shake": MakerCamera.shake(this, (float) e.power, (float) Math.max(0.05, e.dur), 12f, "linear", "both"); shook = true; break;
				case "shock": try { com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfBlastWave.BlastWave.blast(anchorCell(e, tip), (float) Math.max(0.5, e.size)); } catch (Throwable x) { com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfBlastWave.BlastWave.blast(anchorCell(e, tip)); } break;
				case "projectile": try { com.shatteredpixel.shatteredpixeldungeon.effects.MagicMissile.boltFromChar(owner.parent, com.shatteredpixel.shatteredpixeldungeon.effects.MagicMissile.MAGIC_MISSILE, owner, cell, null); } catch (Throwable ignored) { } break;
				case "image": { Object tx = e.ref.isEmpty() ? null : MakerRuntime.texture(e.ref); if (tx == null) { MakerRuntime.warnOnce("공격 모션 그림을 찾지 못함: " + e.ref); break; }
					FxImage im = new FxImage(tx, e, dur, anchor(e, tip), (float) (face + (mirror ? -e.dir : e.dir))); spawned.add(im); owner.parent.add(im); break; }
			}
		}
		@Override public void kill() { super.kill(); LIVE.remove(this); }   // killAndErase 는 destroy 를 부르지 않음
		@Override public void destroy() {   // 화면이 바뀌거나 지울 때: 남은 이미지 · 흔들림도 함께
			for (com.watabou.noosa.Gizmo g : spawned) if (g.alive) g.killAndErase();
			spawned.clear();
			if (shook) MakerCamera.eventEnded(this);
			LIVE.remove(this);
			super.destroy();
		}
		// 바닥 아이템처럼 떨어지거나 반짝이지 않게
		@Override public void link() { }
	}
	/** 이미지 이펙트: 기준점에 그림 하나 — 불투명도 · 크기가 이징으로 (atkmotion.js eventState 와 같음), 끝나면 지움 */
	public static class FxImage extends com.watabou.noosa.Image {
		final MakerAtkMotion.Ev e; final double D; float time;
		FxImage(Object tx, MakerAtkMotion.Ev e, double D, PointF at, float angleDeg) {
			super(tx);
			this.e = e; this.D = D; time = (float) (e.t * D);
			origin.set(width / 2f, height / 2f); x = at.x - width / 2f; y = at.y - height / 2f; angle = angleDeg;
			LIVE.add(this); apply();
		}
		void apply() { double[] s = MakerAtkMotion.eventState(e, D, time); scale.set((float) s[4]); alpha((float) Math.max(0, Math.min(1, s[3]))); }
		@Override public void update() { super.update(); time += Game.elapsed; apply(); if (time > e.t * D + e.dur) killAndErase(); }
		@Override public void kill() { super.kill(); LIVE.remove(this); }
		@Override public void destroy() { LIVE.remove(this); super.destroy(); }
	}
}
