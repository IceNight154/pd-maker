/*
 * 프로젝트 데이터(캐릭터 JSON)로 만드는 스프라이트.
 *   sprite.sheet  : 'game:sprites/x.png' 또는 프로젝트 'assets/..png'
 *   sprite.frame  : [가로, 세로]
 *   sprite.scale  : 그릴 때 크기 배율 (없으면 세로 24px 초과 시 15px 높이에 맞춤)
 *   sprite.anims  : idle / run / attack / zap / die / operate / fly(공중에 떠 있을 때) + 추가 이름  → { frames:[..], fps, loop }
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.sprites.MobSprite;
import com.watabou.noosa.TextureFilm;

public class MakerSprite extends MobSprite {

	/** fly(날기) + 이름을 붙여 만든 추가 애니메이션 — 이벤트 명령 "애니메이션 재생" */
	final java.util.Map<String, Animation> extra = new java.util.HashMap<>();
	Animation fly;

	/** 불러오기(세이브 복원) 때 쓰는 기본 생성자 — 곧바로 setup() 이 불립니다 */
	public MakerSprite() {
		super();
		fallback();
	}

	public MakerSprite(JsonValue character) {
		super();
		if (!setup(character)) fallback();
	}

	MakerBloom bloom; int bfw = 12, bfh = 15;
	com.watabou.noosa.Image light; JsonValue lightCfg;   // 빛 레이어 (<시트>_light.png): 그림 위에 덧셈 합성
	@Override public void draw() {
		super.draw();   // 광원(MakerLights)의 빛은 맨 위 빛 층이 캐릭터 위에 더해 줌
		if (light == null || !visible) return;
		try {
			light.frame(frame()); light.camera = camera();
			light.x = x; light.y = y; light.scale.set(scale.x, scale.y); light.origin.set(origin.x, origin.y); light.angle = angle; light.flipHorizontal = flipHorizontal;
			MakerRuntime.drawLight(light, MakerRuntime.lightAmount(lightCfg) * alpha(), lightCfg == null ? "add" : lightCfg.getString("lightMode", "add"));
			if (bloom != null && frame() != null) { try { int col = Math.round(frame().left * texture.width / bfw), row = Math.round(frame().top * texture.height / bfh);
				bloom.draw(row * bloom.cols + col, x, y, scale.x, MakerRuntime.lightAmount(lightCfg) * MakerBloom.power(lightCfg) * alpha(), camera()); } finally { MakerBloom.done(); } }
		} catch (Throwable t) { light = null; }
	}
	public boolean setup(JsonValue ch) {
		if (ch == null || ch.get("sprite") == null) return false;
		JsonValue sp = ch.get("sprite");
		Object tx = MakerRuntime.texture(sp.getString("sheet", ""));
		if (tx == null) return false;
		texture(tx);
		try { Object lt = MakerRuntime.lightTexture(sp.getString("sheet", ""), sp.getString("lightMode", "add")); light = lt == null ? null : new com.watabou.noosa.Image(lt); lightCfg = sp; } catch (Throwable ignored) { light = null; }
		int fw = 12, fh = 15;
		JsonValue fr = sp.get("frame");
		if (fr != null && fr.size >= 2) { fw = fr.getInt(0); fh = fr.getInt(1); }
		bfw = Math.max(1, fw); bfh = Math.max(1, fh);
		try { bloom = light == null ? null : MakerBloom.get(sp.getString("sheet", ""), bfw, bfh, MakerBloom.radius(sp)); } catch (Throwable ignored) { bloom = null; }
		TextureFilm film = new TextureFilm(texture, fw, fh);
		JsonValue anims = sp.get("anims");
		idle = anim(anims, "idle", film, null);
		run = anim(anims, "run", film, idle);
		attack = anim(anims, "attack", film, idle);
		zap = anim(anims, "zap", film, attack);
		operate = anim(anims, "operate", film, idle);
		die = anim(anims, "die", film, idle);
		// 한 번만 재생되는 동작은 반드시 별도 객체여야 함 — idle(반복)과 같은 객체면
		// idle 이 한 바퀴 돌 때마다 "공격 끝남"으로 처리되어 ch 가 없는 스프라이트(대화창 아이콘 등)에서 튕김
		if (run == idle) run = copy(idle, true);
		attack = once(attack); zap = once(zap); operate = once(operate); die = once(die);
		extra.clear(); fly = null;
		if (anims != null) for (JsonValue a : anims) {
			if (a.get("frames") == null || a.get("frames").size == 0) continue;
			switch (a.name) { case "idle": case "run": case "attack": case "zap": case "operate": case "die": continue; }
			Animation x = anim(anims, a.name, film, idle);
			if (a.name.equals("fly")) fly = x; else extra.put(a.name, x.looped ? x : x);
		}
		// 고해상도 시트(예: 48x60 = 12x15 의 4배)는 scale 로 줄여서 그림
		float sc = sp.getFloat("scale", 0f);
		if (sc <= 0f) sc = fh > 24 ? 15f / fh : 1f;
		if (sc != 1f) scale.set(sc);
		play(idle);
		return true;
	}

	private Animation anim(JsonValue anims, String key, TextureFilm film, Animation def) {
		JsonValue a = anims == null ? null : anims.get(key);
		if (a == null || a.get("frames") == null || a.get("frames").size == 0) {
			if (def != null) return def;
			Animation x = new Animation(1, true); x.frames(film, 0); return x;
		}
		Animation x = new Animation(Math.max(1, a.getInt("fps", 10)), a.getBoolean("loop", key.equals("idle") || key.equals("run")));
		JsonValue fs = a.get("frames");
		Object[] frames = new Object[fs.size];
		for (int i = 0; i < fs.size; i++) frames[i] = fs.getInt(i);
		x.frames(film, frames);
		return x;
	}

	private Animation copy(Animation a, boolean loop) { Animation x = a.clone(); x.looped = loop; return x; }
	/** idle/run 과 겹치거나 반복으로 설정된 동작 → 반복하지 않는 복사본 */
	private Animation once(Animation a) {
		if (a == null) return null;
		return (a == idle || a == run || a.looped) ? copy(a, false) : a;
	}

	// 공중에 떠 있으면(날개·공중부양) 가만히·이동 대신 fly
	@Override public void idle() { super.idle(); if (fly != null && ch != null && ch.flying) play(fly); }
	@Override public void move(int from, int to) { super.move(from, to); if (fly != null && ch != null && ch.flying) play(fly); }

	/** ch 가 없는(연결 안 된) 스프라이트에서도 안전하게 */
	@Override
	public synchronized void onComplete(Animation anim) {
		if (ch == null && animCallback == null) {
			if (anim == attack || anim == operate || anim == zap) idle();
			return;
		}
		super.onComplete(anim);
	}

	private void fallback() {
		texture(Assets.Sprites.MAKER);
		TextureFilm film = new TextureFilm(texture, 12, 14);
		idle = new Animation(10, true); idle.frames(film, 0, 0, 0, 1);
		run = new Animation(20, true); run.frames(film, 0);
		attack = copy(run, false); zap = copy(run, false); operate = copy(run, false);
		die = new Animation(20, false); die.frames(film, 0);
		play(idle);
	}
}
