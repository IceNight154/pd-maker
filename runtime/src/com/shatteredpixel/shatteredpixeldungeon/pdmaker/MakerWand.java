/*
 * PDMaker — 마법봉 공격 이펙트: 마법봉을 쏠 때 날아가는 것 · 소리 · 쏠 때/맞을 때 이펙트를 바꿈
 *   프로젝트 아이템(게임 마법봉 상속 — kind game, base wands.*): items/<id>.json  wandFx { on, … }
 *   게임 마법봉 그대로: gameitems.json  items["spd:wands.WandOfX"].wandFx { on, … }
 *   wandFx { on, bolt: "game"(게임 원래 효과) | "none" | 마법 화살 종류(magic · fire · frost · …) | "sprite"(그림이 날아감) | "code"(code · imports — 생성 파일 GenWandFx),
 *            sprite { name | index | png }, spin, sound(쏠 때 — 비우면 게임 소리/zap), hitSound, castEffect(쏠 때 영웅에게), hitEffect(맞은 칸 — effects.json id) }
 *   연결 줄: Wand.zapper 의 curWand.fx(…) 바로 앞 — 설정이 있으면 여기서 효과를 내고 onZap · wandUsed 를 부른 뒤 원래 줄을 건너뜀
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.effects.MagicMissile;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.sprites.MissileSprite;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Callback;

public class MakerWand {

	static final String ITEMS = "com.shatteredpixel.shatteredpixeldungeon.items.";

	/** 이 마법봉의 wandFx (켜져 있을 때만) — 프로젝트 아이템이면 그 데이터, 아니면 gameitems.json 의 게임 클래스 (상속한 바탕 클래스까지) */
	public static JsonValue cfg(Item w) { Object[] r = find(w); return r == null ? null : (JsonValue) r[1]; }
	/** { 코드 열쇠(item:<id> · spd:wands.X), wandFx } */
	static Object[] find(Item w) {
		if (w == null || !MakerRuntime.isActive()) return null;
		if (w instanceof GenSupport.Coded) {
			String id = ((GenSupport.Coded) w).makerId();
			JsonValue d = MakerRuntime.item(id), f = d == null ? null : d.get("wandFx");
			if (f != null && f.getBoolean("on", false)) return new Object[]{ "item:" + id, f };
		}
		JsonValue gi = MakerRuntime.gameitems == null ? null : MakerRuntime.gameitems.get("items");
		if (gi == null) return null;
		for (Class<?> c = w.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
			String n = c.getName();
			if (!n.startsWith(ITEMS)) continue;
			String k = "spd:" + n.substring(ITEMS.length()).replace('$', '.');
			JsonValue e = gi.get(k), f = e == null ? null : e.get("wandFx");
			if (f != null && f.getBoolean("on", false)) return new Object[]{ k, f };
		}
		return null;
	}

	static void warn(String s) { try { com.shatteredpixel.shatteredpixeldungeon.utils.GLog.w(s); } catch (Throwable ignored) { } }

	/** Wand.zapper 연결 줄 — 설정이 있으면 효과를 내고 true (원래 fx 줄을 건너뜀) */
	public static boolean zap(final Wand w, final Ballistica shot) {
		final JsonValue c; final String key;
		try { Object[] r = find(w); if (r == null) return false; key = (String) r[0]; c = (JsonValue) r[1]; } catch (Throwable t) { MakerRuntime.log("마법봉 이펙트 오류: " + t); return false; }
		final Hero hero = Dungeon.hero;
		if (hero == null || hero.sprite == null || hero.sprite.parent == null) return false;
		final int to = shot.collisionPos;
		final Callback done = new Callback() {
			@Override public void call() {
				try {
					String hs = c.getString("hitSound", ""); if (!hs.isEmpty()) MakerAudio.playSe(hs);
					String he = c.getString("hitEffect", ""); if (!he.isEmpty()) MakerEffect.playAt(he, to);
				} catch (Throwable t) { MakerRuntime.log("마법봉 맞은 효과 오류: " + t); }
				w.onZap(shot);
				w.wandUsed();
			}
		};
		String snd = c.getString("sound", "");
		String ce = c.getString("castEffect", ""); if (!ce.isEmpty()) MakerEffect.playOn(ce, hero);
		String bolt = c.getString("bolt", "game");
		try {
			switch (bolt) {
				case "game":   // 게임 원래 날아가는 효과 (+ 소리 · 이펙트만 더하거나 바꿈)
					if (!snd.isEmpty()) MakerAudio.playSe(snd);
					w.fx(shot, done);
					break;
				case "code": {   // 편집기 "코드로 직접" — 생성 파일 gen/GenWandFx.java (없거나 오류면 게임 원래 효과)
					if (!snd.isEmpty()) MakerAudio.playSe(snd);
					boolean ran = false;
					try {
						Class<?> g = Class.forName(GenSupport.GEN + "GenWandFx");
						ran = (Boolean) g.getMethod("fx", String.class, Wand.class, Ballistica.class, Callback.class).invoke(null, key, w, shot, done);
					} catch (java.lang.reflect.InvocationTargetException e) { MakerRuntime.log("마법봉 이펙트 코드 오류 (" + key + "): " + e.getCause()); warn("마법봉 이펙트 코드 오류: " + e.getCause()); }
					catch (Throwable e) { MakerRuntime.log("마법봉 이펙트 코드를 찾지 못함 (" + key + "): " + e); }
					if (!ran) w.fx(shot, done);
					break;
				}
				case "none":
					if (!snd.isEmpty()) MakerAudio.playSe(snd); else Sample.INSTANCE.play(com.shatteredpixel.shatteredpixeldungeon.Assets.Sounds.ZAP);
					done.call();
					break;
				case "sprite": {
					JsonValue sp = c.get("sprite");
					Item proxy = c.getBoolean("spin", false) ? new Item() : new com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.darts.Dart();
					int def = com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.SPIRIT_ARROW;   // 비우면 화살 그림 (편집기 안내와 같음)
					proxy.image = sp != null && !sp.getString("png", "").isEmpty() ? MakerAssets.customItemImage(sp.getString("png"), def) : GenSupport.spriteIndex(sp, def);
					if (!snd.isEmpty()) MakerAudio.playSe(snd); else Sample.INSTANCE.play(com.shatteredpixel.shatteredpixeldungeon.Assets.Sounds.ZAP);
					((MissileSprite) hero.sprite.parent.recycle(MissileSprite.class)).reset(hero.sprite, to, proxy, done);
					break;
				}
				default:   // 마법 화살 종류 (magic · fire · frost · …)
					if (!snd.isEmpty()) MakerAudio.playSe(snd); else Sample.INSTANCE.play(com.shatteredpixel.shatteredpixeldungeon.Assets.Sounds.ZAP);
					MagicMissile.boltFromChar(hero.sprite.parent, MakerCast.missile(bolt), hero.sprite, to, done);
			}
		} catch (Throwable t) { MakerRuntime.log("마법봉 이펙트 오류: " + t); return false; }
		w.cursedKnown = true;
		return true;
	}
}
