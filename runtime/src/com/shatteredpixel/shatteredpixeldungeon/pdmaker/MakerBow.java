/*
 * PDMaker — 원거리 무기 (활 · 석궁 · 지팡이처럼 "쏘기"로 발사체를 날림) — 영혼의 활(SpiritBow)과 같은 방식
 *   아이템 kind "ranged" → 생성 클래스 gen/…/I_<id> extends MakerBow (근접 수치 = weapon, 들고 때릴 때)
 *   items/<id>.json  ranged {
 *     shootLabel ("쏘기"), needEquip (true — 장착해야 쏨), ammo: "none"(발사체를 무한히 만들어 쏨) | "item"(가방의 프로젝트 투척 무기 projectile 을 하나씩 소모),
 *     projectile: 투척 무기 아이템 id (ammo item 일 때),
 *     proj { name, sprite { name | index | png }, spin(빙글빙글), damage: "bow"(활의 피해) | "own"(아래 수치), min, max, minPerLvl, maxPerLvl, accuracy(배율),
 *            sound(쏠 때) · hitSound(맞을 때) · castEffect(쏠 때 영웅에게) · hitEffect(맞은 칸 · effects.json id) }
 *   }
 *   맞힘 판정 · 강화 · 마법 부여 · 저주는 활(MeleeWeapon)의 것을 그대로 (proc · hasEnchant)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.MeleeWeapon;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.utils.Random;

import java.util.ArrayList;

public abstract class MakerBow extends MeleeWeapon implements GenSupport.Coded {

	public static final String AC_SHOOT = "PDM_SHOOT";

	{
		defaultAction = AC_SHOOT;
		usesTargeting = true;
	}

	JsonValue rcfg() { JsonValue d = MakerRuntime.item(makerId()); JsonValue r = d == null ? null : d.get("ranged"); return r == null ? new JsonValue(JsonValue.ValueType.object) : r; }
	JsonValue pcfg() { JsonValue p = rcfg().get("proj"); return p == null ? new JsonValue(JsonValue.ValueType.object) : p; }

	@Override public ArrayList<String> actions(Hero hero) { ArrayList<String> a = super.actions(hero); a.add(AC_SHOOT); return a; }
	@Override public String actionName(String action, Hero hero) {
		if (AC_SHOOT.equals(action)) { String s = rcfg().getString("shootLabel", ""); return s.isEmpty() ? MakerRuntime.term("bow.shoot", "쏘기") : s; }
		return super.actionName(action, hero);
	}
	@Override public void execute(Hero hero, String action) {
		super.execute(hero, action);
		if (!AC_SHOOT.equals(action)) return;
		if (rcfg().getBoolean("needEquip", true) && !isEquipped(hero)) { GLog.w(MakerRuntime.term("bow.equip", "먼저 장착해야 쏠 수 있다.")); return; }
		curUser = hero; curItem = this;
		GameScene.selectCell(shooter);
	}

	/** 쏠 발사체 하나 — 화살을 만들거나, 가방의 탄환 아이템 (없으면 null) */
	MissileWeapon knock(Hero hero) {
		JsonValue r = rcfg();
		if ("item".equals(r.getString("ammo", "none"))) {
			String pid = r.getString("projectile", "");
			for (Item i : hero.belongings.backpack.items)
				if (i instanceof MissileWeapon && i instanceof GenSupport.Coded && pid.equals(((GenSupport.Coded) i).makerId())) return (MissileWeapon) i;
			JsonValue pd = MakerRuntime.item(pid);
			GLog.w(MakerRuntime.term("bow.noAmmo", "쏠 것이 없다") + (pd != null ? " (" + pd.getString("name", pid) + ")" : ""));
			return null;
		}
		Arrow a = pcfg().getBoolean("spin", false) ? new Arrow() : new StraightArrow();
		a.bow = this; a.applyCfg();
		return a;
	}

	static final CellSelector.Listener shooter = new CellSelector.Listener() {
		@Override public void onSelect(Integer target) {
			if (target == null || !(curItem instanceof MakerBow) || curUser == null || target == curUser.pos) return;
			MakerBow b = (MakerBow) curItem;
			MissileWeapon m = b.knock(curUser);
			if (m == null) return;
			String ce = b.pcfg().getString("castEffect", ""); if (!ce.isEmpty()) MakerEffect.playOn(ce, curUser);
			m.cast(curUser, target);
		}
		@Override public String prompt() { return MakerRuntime.term("bow.prompt", "쏠 곳을 고르세요"); }
	};

	/** 활이 쏘는 발사체 (영혼의 활의 SpiritArrow 처럼 가방에 들어가지 않고, 땅에 떨어지지 않음) */
	public static class Arrow extends MissileWeapon {
		public MakerBow bow;
		{ sticky = false; MakerCompat.setField(this, "setID", 0L); }   // setID 는 SPD 3.1 부터 (없으면 건너뜀)

		void applyCfg() {
			JsonValue p = bow.pcfg();
			JsonValue sp = p.get("sprite");
			if (sp != null && !sp.getString("png", "").isEmpty()) image = MakerAssets.customItemImage(sp.getString("png"), image);
			else image = GenSupport.spriteIndex(sp, com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.SPIRIT_ARROW);
		}
		JsonValue p() { return bow == null ? new JsonValue(JsonValue.ValueType.object) : bow.pcfg(); }

		@Override public String name() { String n = p().getString("name", ""); return n.isEmpty() ? super.name() : n; }
		@Override public ArrayList<String> actions(Hero hero) { return new ArrayList<>(); }
		@Override public String defaultAction() { return null; }
		public int defaultQuantity() { return 1; }   // (@Override 없이 — 이 함수가 없는 예전 판에서도 컴파일)
		@Override public Item split(int amount) { return null; }

		@Override public int damageRoll(Char owner) {
			JsonValue p = p();
			if (bow == null || !"own".equals(p.getString("damage", "bow"))) return bow == null ? super.damageRoll(owner) : bow.damageRoll(owner);
			int l = (int) bow.buffedLvl();
			return Random.NormalIntRange(p.getInt("min", 1) + l * p.getInt("minPerLvl", 0), Math.max(p.getInt("min", 1), p.getInt("max", 5)) + l * p.getInt("maxPerLvl", 1));
		}
		@Override public boolean hasEnchant(Class<? extends com.shatteredpixel.shatteredpixeldungeon.items.weapon.Weapon.Enchantment> type, Char owner) { return bow != null ? bow.hasEnchant(type, owner) : super.hasEnchant(type, owner); }
		@Override public int proc(Char attacker, Char defender, int damage) {
			int d = (int) (bow != null ? bow.proc(attacker, defender, damage) : damage);
			String hs = p().getString("hitSound", ""); if (!hs.isEmpty()) MakerAudio.playSe(hs);
			return d;
		}
//#if method:items.KindOfWeapon#delayFactor @ 원거리 무기 공격 시간 · 정확도 (예전 판 함수 이름으로)
		@Override public float delayFactor(Char user) { return bow != null ? bow.delayFactor(user) : super.delayFactor(user); }
		@Override public float accuracyFactor(Char owner, Char target) { return super.accuracyFactor(owner, target) * p().getFloat("accuracy", 1f); }
//#else
		//#| // 예전 판: 공격 시간 = speedFactor(사용자) · 정확도 = accuracyFactor(사용자)
		//#| @Override public float speedFactor(Char user) { return bow != null ? bow.speedFactor(user) : super.speedFactor(user); }
		//#| @Override public float accuracyFactor(Char owner) { return super.accuracyFactor(owner) * p().getFloat("accuracy", 1f); }
//#endif
		@Override public int STRReq(int lvl) { return bow != null ? bow.STRReq() : super.STRReq(lvl); }
		@Override public void throwSound() { String s = p().getString("sound", ""); if (!s.isEmpty()) MakerAudio.playSe(s); else super.throwSound(); }

		@Override protected void onThrow(int cell) {
			Char enemy = Actor.findChar(cell);
			if (enemy != null && enemy != curUser) curUser.shoot(enemy, this);
			String he = p().getString("hitEffect", ""); if (!he.isEmpty()) MakerEffect.playAt(he, cell);
		}
	}
	/** 빙글빙글 돌지 않고 날아가는 방향을 향함 (게임의 화살 · 다트처럼) */
	public static class StraightArrow extends Arrow {
		static {
			try {   // MissileSprite.ANGULAR_SPEEDS 에 0 으로 등록 (영혼의 활 화살과 같은 표)
				java.lang.reflect.Field f = com.shatteredpixel.shatteredpixeldungeon.sprites.MissileSprite.class.getDeclaredField("ANGULAR_SPEEDS");
				f.setAccessible(true);
				@SuppressWarnings("unchecked") java.util.HashMap<Class<? extends Item>, Integer> m = (java.util.HashMap<Class<? extends Item>, Integer>) f.get(null);
				m.put(StraightArrow.class, 0);
			} catch (Throwable e) { MakerRuntime.log("발사체 방향 등록 실패: " + e); }
		}
	}
}
