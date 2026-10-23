/*
 * 코덱스 — mod-2 의 items/weapon/codices (Codex · MeleeCodex · RangedCodex · CastCodex) 를 데이터로 옮긴 것
 *   items/<id>.json  kind: "codex",  codex:
 *     { type: melee(옆 칸 적) | ranged(날아가 맞힘) | cast(시전: target self/cell/enemy),
 *       tier, min, max, minPerLvl, maxPerLvl, str(0 = 티어로 계산), baseUses(내구: 사용 횟수, 강화마다 ×1.5, 100 이상 = 무한),
 *       quantity(처음 개수), castTime(턴), range, radius, visual, heat(과열 게이지 +), sound, hitSound, effects[] (MakerCast 효과 — 추가) }
 *   · 겹쳐 쌓이고, 쓸 때마다 내구가 닳아 다 닳으면 한 개가 사라짐 (Codex.decrementDurability)
 *   · 피해 × (1 + codexPct%) — 과열 단계·원소·특성·전직의 "코덱스 피해 %" / 힘이 모자라면 약해짐
 *   · 그리모어(kind: grimoire) 가방에 들어감
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.utils.Bundle;

import java.util.ArrayList;

public class MakerCodex extends MakerItem {

	public static final float MAX_DURABILITY = 100;
	protected float durability = MAX_DURABILITY;

	{ stackable = true; defaultAction = AC_USE; image = com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.ARTIFACT_SPELLBOOK; }

	JsonValue cx() { JsonValue d = data(); return d == null ? null : d.get("codex"); }
	@Override protected void applyData() {
		super.applyData();
		stackable = true;
		// 퀵슬롯 자동 조준 (원작 투척 무기·mod-2 코덱스처럼): 대상을 고르는 코덱스
		JsonValue c = cx();
		String t = type();
		usesTargeting = !(t.equals("cast") && c != null && c.getString("target", "cell").equals("self"));
	}
	/** 처음 만들 때 개수 (MakerItem.create) */
	void initQuantity() { JsonValue c = cx(); if (c != null) quantity(Math.max(1, c.getInt("quantity", 3))); }

	public String type() { JsonValue c = cx(); return c == null ? "melee" : c.getString("type", "melee"); }
	public int tier() { JsonValue c = cx(); return c == null ? 1 : Math.max(1, c.getInt("tier", 1)); }
	public int min() { JsonValue c = cx(); return c == null ? 1 : c.getInt("min", tier()) + (int) level() * c.getInt("minPerLvl", 1); }
	public int max() { JsonValue c = cx(); return c == null ? 4 : c.getInt("max", 4 * tier() + 2) + (int) level() * c.getInt("maxPerLvl", tier()); }
	public int STRReq() { JsonValue c = cx(); int s = c == null ? 0 : c.getInt("str", 0); return (s > 0 ? s : 7 + 2 * tier()) - Math.min((int) level(), 2); }
	/** 강화 1마다 사용 횟수 ×1.5, 100회 이상이면 무한 (Codex.durabilityPerUse) */
	public float usesMax() { JsonValue c = cx(); return (c == null ? 10 : c.getFloat("baseUses", 10)) * (float) Math.pow(1.5f, level()); }
	public float perUse() { float u = usesMax(); return u >= 100 ? 0 : MAX_DURABILITY / Math.max(1, Math.round(u)) + 0.001f; }
	public int usesLeft() { float p = perUse(); return p <= 0 ? -1 : (int) Math.ceil(durability / p); }

	@Override public boolean isUpgradable() { return true; }
	@Override public boolean isIdentified() { return true; }
	@Override public String name() { return super.name() + (level() > 0 ? " +" + level() : ""); }
	@Override public boolean isSimilar(Item item) { return super.isSimilar(item) && item.level() == level(); }

	@Override public ArrayList<String> actions(Hero hero) {
		ArrayList<String> a = super.actions(hero);
		if (!a.contains(AC_USE)) a.add(AC_USE);
		return a;
	}
	@Override public String actionName(String action, Hero hero) {
		if (action.equals(AC_USE)) { JsonValue d = data(); String l = d == null ? "" : d.getString("useLabel", ""); return l.isEmpty() ? "사용" : l; }
		return super.actionName(action, hero);
	}
	@Override public String defaultAction() { return AC_USE; }

	/** 이번 사용의 시전 정의 (MakerCast) */
	JsonValue castDef(Hero hero) {
		JsonValue c = cx();
		JsonValue d = new JsonValue(JsonValue.ValueType.object);
		String type = type();
		d.addChild("id", new JsonValue(makerId));
		d.addChild("name", new JsonValue(name()));
		String target = type.equals("melee") ? "adjacent" : type.equals("ranged") ? "enemy" : (c == null ? "self" : c.getString("target", "cell"));
		d.addChild("target", new JsonValue(target));
		d.addChild("range", new JsonValue(c == null ? 6 : c.getInt("range", type.equals("ranged") ? 6 : 5)));
		d.addChild("projectile", new JsonValue(!type.equals("cast") || (c != null && c.getBoolean("projectile", true))));
		d.addChild("visual", new JsonValue(c == null ? "magic" : c.getString("visual", type.equals("melee") ? "none" : "magic")));
		d.addChild("time", new JsonValue(c == null ? 1f : c.getFloat("castTime", 1f)));
		d.addChild("heat", new JsonValue(c == null ? 0 : c.getInt("heat", 0)));
		d.addChild("sound", new JsonValue(c == null ? "" : c.getString("sound", "")));
		d.addChild("hitSound", new JsonValue(c == null ? "" : c.getString("hitSound", "")));
		// 비워 두면 게임 효과음 설정 (사운드 편집기 → 게임 효과음): 코덱스 종류별 쓸 때 · 맞을 때
		d.addChild("sfxUse", new JsonValue(type.equals("melee") ? "codex.melee" : type.equals("ranged") ? "codex.ranged" : "codex.cast"));
		d.addChild("sfxHit", new JsonValue(type.equals("melee") ? "codex.meleeHit" : "codex.hit"));
		d.addChild("hitCheck", new JsonValue(!type.equals("cast")));
		d.addChild("missSound", new JsonValue(c == null ? "" : c.getString("missSound", "")));
		// 날아가는 그림 · 근접 애니메이션 · 연타 (mod-2 RangedCodex.magicImage · MagicImageAnimator · MagicBullet)
		int mimg = c == null ? -1 : GenSupport.spriteIndex(c.get("magicImage"), -1);
		String vis = c == null ? "" : c.getString("visual", "");
		if (type.equals("ranged") && mimg >= 0 && (vis.isEmpty() || vis.equals("item"))) d.addChild("missileImage", new JsonValue(mimg));
		if (type.equals("cast") && mimg >= 0 && vis.equals("item")) d.addChild("missileImage", new JsonValue(mimg));
		if (c != null && c.getBoolean("spin", false)) d.addChild("missileSpin", new JsonValue(true));
		if (type.equals("melee") && mimg >= 0) {
			d.addChild("anim", new JsonValue(c.getString("anim", "sweep")));
			d.addChild("animImage", new JsonValue(mimg));
		}
		d.addChild("hits", new JsonValue(c == null ? 1 : Math.max(1, c.getInt("hits", 1))));
		d.addChild("hitDelay", new JsonValue(c == null ? 0.1f : c.getFloat("hitDelay", type.equals("ranged") ? 0.05f : 0.1f)));
		float pct = HeroRuntime.bonus("codexPct") - HeroRuntime.bonus("castPct");     // apply() 가 castPct 를 이미 곱함 → 코덱스는 codexPct 만
		if (hero.STR() < STRReq()) pct -= 33;
		d.addChild("extraPct", new JsonValue(pct));
		JsonValue effs = new JsonValue(JsonValue.ValueType.array);
		int mx = max(), mn = Math.min(min(), mx);
		int exStr = hero.STR() - STRReq();
		if (mx > 0) {
			JsonValue dmg = new JsonValue(JsonValue.ValueType.object);
			dmg.addChild("type", new JsonValue("damage"));
			int radius = c == null ? 0 : c.getInt("radius", 0);
			dmg.addChild("on", new JsonValue(type.equals("cast") && radius > 0 ? "area" : "target"));
			dmg.addChild("radius", new JsonValue(radius));
			dmg.addChild("min", new JsonValue(mn));
			dmg.addChild("max", new JsonValue(mx + Math.max(0, exStr)));
			effs.addChild(dmg);
		}
		if (c != null && c.get("effects") != null) for (JsonValue e : c.get("effects")) effs.addChild(new com.badlogic.gdx.utils.JsonReader().parse(e.toJson(com.badlogic.gdx.utils.JsonWriter.OutputType.json)));
		d.addChild("effects", effs);
		return d;
	}

	@Override public void execute(Hero hero, String action) {
		if (!action.equals(AC_USE)) { super.execute(hero, action); return; }
		curUser = hero; curItem = this;
		if (hero.STR() < STRReq()) GLog.w("이 코덱스를 다루기엔 힘이 모자라 위력이 약해진다.");
		final MakerCodex me = this;
		MakerCast.cast(hero, castDef(hero), new MakerCast.Done() {
			@Override public void done(int cell) { me.afterUse(); }
		});
	}
	/** Codex.afterUse: 게이지(afterUse) · 내구 감소 */
	void afterUse() {
		MakerGauge.markUse();
		float p = perUse();
		if (p <= 0) return;
		durability -= p;
		if (durability > 0 && durability <= p) GLog.w(name() + "이(가) 곧 닳아 없어진다.");
		else if (durability <= 0) {
			GLog.n(name() + " 하나가 닳아 없어졌다.");
			JsonValue cc = cx();
			String bs = cc == null ? "" : cc.getString("breakSound", "");
			MakerAudio.playSe(bs.isEmpty() ? "sfx:codex.break" : bs);
			durability = MAX_DURABILITY;
			Hero hero = Dungeon.hero;
			if (hero != null) detach(hero.belongings.backpack);   // 그리모어 안에 있어도 찾아서 하나 뺌
		}
		updateQuickslot();
	}

	@Override public String desc() {
		StringBuilder sb = new StringBuilder(super.desc());
		String t = type();
		sb.append("\n\n").append(t.equals("melee") ? "근접 코덱스" : t.equals("ranged") ? "원거리 코덱스" : "시전 코덱스").append(" · ").append(tier()).append("티어");
		if (max() > 0) sb.append("\n피해 ").append(min()).append("~").append(max());
		sb.append(" · 힘 ").append(STRReq());
		if (Dungeon.hero != null && Dungeon.hero.STR() < STRReq()) sb.append(" (힘이 모자람)");
		int u = usesLeft();
		sb.append("\n").append(u < 0 ? "닳지 않음" : "이 코덱스 남은 사용 " + u + "회 (새 것 " + Math.round(usesMax()) + "회)");
		JsonValue c = cx();
		if (c != null && c.getInt("heat", 0) != 0 && MakerGauge.enabled()) sb.append("\n").append(MakerGauge.name()).append(" +").append(c.getInt("heat", 0));
		return sb.toString();
	}
	@Override public int value() { return super.value() * (level() + 1); }

	@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("durability", durability); }
	@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); durability = b.contains("durability") ? b.getFloat("durability") : MAX_DURABILITY; }

	// ------------------------------------------------------------ 그리모어 (mod-2 bags/grimoire)

	/** items/<id>.json kind: "grimoire", bag: { capacity(19), holds: codex | all } */
	public static class MakerGrimoire extends Bag {
		public String makerId = "";
		{ image = com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.SCROLL_HOLDER; }
		protected JsonValue data() { return MakerRuntime.item(makerId); }
		protected void applyData() {
			JsonValue d = data(); if (d == null) return;
			JsonValue sp = d.get("sprite");
			if (sp != null && (sp.has("index") || sp.has("name"))) image = GenSupport.spriteIndex(sp, image);
		}
		@Override public String name() { JsonValue d = data(); return d == null ? "그리모어" : d.getString("name", makerId); }
		@Override public String desc() { JsonValue d = data(); return d == null ? "" : d.getString("desc", ""); }
		@Override public int capacity() { JsonValue d = data(); JsonValue b = d == null ? null : d.get("bag"); return b == null ? 19 : b.getInt("capacity", 19); }
		@Override public boolean canHold(Item item) {
			JsonValue d = data(); JsonValue b = d == null ? null : d.get("bag");
			String holds = b == null ? "codex" : b.getString("holds", "codex");
			if (holds.equals("codex") && !isCodex(item)) return false;
			return super.canHold(item);
		}
		static boolean isCodex(Item item) {
			if (item instanceof MakerCodex) return true;
			for (Class<?> c = item.getClass(); c != null; c = c.getSuperclass()) if (c.getSimpleName().equals("Codex")) return true;   // mod-2 코덱스
			return false;
		}
		@Override public int value() { JsonValue d = data(); return d == null ? 0 : d.getInt("price", 0); }
		@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_item", makerId); }
		@Override public void restoreFromBundle(Bundle bundle) { makerId = bundle.getString("pdm_item"); applyData(); super.restoreFromBundle(bundle); }
	}
}
