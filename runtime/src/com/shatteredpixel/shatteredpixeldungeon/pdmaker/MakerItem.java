/*
 * 데이터로 정의되는 아이템.
 *   · 이름·설명·가격·겹침 여부를 items/<id>.json 에서 읽음
 *   · 스프라이트: builtin:items 의 번호 (직접 그린 PNG 는 M5 에서 지원, 지금은 대체 그림)
 *   · "사용" : onUse 이벤트 명령 실행. 분류(게임 items 폴더 기준)에 따라 버튼 이름(마시기·읽기·먹기)과 소모 여부가 정해짐 (consumable 로 바꿈)
 *   · 음식: stats.energy 만큼 배고픔 해소
 *   · "선물하기" : 옆에 마음 시스템을 쓰는 NPC 가 있으면 선물 → 좋아함/보통/싫어함 반응
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.watabou.noosa.Game;
import com.watabou.utils.Bundle;
import com.watabou.utils.PathFinder;
import com.watabou.utils.Reflection;

import java.util.ArrayList;

public class MakerItem extends Item {

	public static final String AC_USE = "USE";
	public static final String AC_GIFT = "GIFT";

	public String makerId = "";

	{
		image = ItemSpriteSheet.SOMETHING;
		stackable = true;
	}

	/** 바닥에 놓인 아이템 그림의 배율 (아이템 groundScale, 0·1 = 그대로). ItemSprite.link(Heap) 연결 줄 — 그림은 재활용되므로 매번 다시 정함 */
	public static void heapScale(com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite spr, com.shatteredpixel.shatteredpixeldungeon.items.Heap heap) {
		try {
			float sc = 1f;
			if (MakerRuntime.isActive() && heap != null && heap.items != null && heap.size() > 0
					&& (heap.type == com.shatteredpixel.shatteredpixeldungeon.items.Heap.Type.HEAP || heap.type == com.shatteredpixel.shatteredpixeldungeon.items.Heap.Type.FOR_SALE)) {
				Item it = heap.peek();
				String id = it instanceof GenSupport.Coded ? ((GenSupport.Coded) it).makerId() : it instanceof MakerItem ? ((MakerItem) it).makerId : null;
				JsonValue d = id == null ? null : MakerRuntime.item(id);
				if (d != null && d.getFloat("groundScale", 0f) > 0f) sc = d.getFloat("groundScale", 1f);
			}
			spr.scale.set(sc);
		} catch (Throwable ignored) { }
	}

	// ------------------------------------------------------------ 판매 불가 · 버리기 금지 (noSell · noDrop)
	/** 그 아이템의 설정: 프로젝트 아이템 데이터, 아니면 gameitems.json 의 게임 클래스(상속 사슬) */
	static JsonValue flagsOf(Item it) {
		if (it == null || !MakerRuntime.isActive()) return null;
		String pid = MakerAudio.projectItemId(it);
		if (pid != null) return MakerRuntime.item(pid);
		JsonValue gi = MakerRuntime.gameitems == null ? null : MakerRuntime.gameitems.get("items");
		if (gi == null) return null;
		final String P = "com.shatteredpixel.shatteredpixeldungeon.items.";
		for (Class<?> c = it.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
			if (!c.getName().startsWith(P)) continue;
			JsonValue e = gi.get("spd:" + c.getName().substring(P.length()).replace('$', '.'));
			if (e != null) return e;
		}
		return null;
	}
	/** Item.actions 연결 줄 — 버리기 금지면 버리기 (· 투척 무기가 아니면 던지기) 버튼을 뺌 */
	public static void flagActions(Item it, java.util.ArrayList<String> actions) {
		try {
			MakerFacets.addActions(it, actions);   // 추가 기능 (사용 효과 · 가방 기능)
			JsonValue d = flagsOf(it);
			if (d == null || !d.getBoolean("noDrop", false)) return;
			actions.remove(Item.AC_DROP);
			if (!(it instanceof com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon)) actions.remove(Item.AC_THROW);
		} catch (Throwable t) { MakerRuntime.log("버리기 금지 오류: " + t); }
	}
	/** Shopkeeper.canSell 연결 줄 — 판매 불가면 true */
	public static boolean noSell(Item it) {
		try { JsonValue d = flagsOf(it); return d != null && d.getBoolean("noSell", false); } catch (Throwable t) { return false; }
	}

	/** 프로젝트 아이템 id → MakerItem,  'spd:ClassName' → 게임 기본 아이템 */
	public static Item create(String id) {
		if (id == null || id.isEmpty()) return null;
		id = id.trim();
		if (id.startsWith("spd:")) return spdItem(id.substring(4));
		JsonValue d = MakerRuntime.item(id);
		if (d == null && id.startsWith("I_") && MakerRuntime.item(id.substring(2)) != null) { id = id.substring(2); d = MakerRuntime.item(id); }   // 생성 클래스 이름으로 불러도
		if (d != null && MakerRuntime.itemOff(id)) return null;   // "사용" 을 끈 아이템 — 드랍 · 상점 · 시작 아이템 · 맵 · 이벤트 어디서도 만들지 않음
		if (d == null) {
			// 프로젝트 아이템이 아니면 게임 아이템으로 — "Cudgel" · "cudgel" · "potion_of_healing" · "weapon.melee.Cudgel" 모두 (spd: 를 붙이지 않아도)
			Item g = gameItem(id);
			if (g == null) MakerRuntime.log("없는 아이템: " + id + " — 프로젝트 아이템 id 또는 게임 아이템 클래스 이름(예: Cudgel, PotionOfHealing, spd:weapon.melee.Cudgel)");
			return g;
		}
		// 무기·갑옷이나 코드가 있는 아이템은 에디터가 만든 클래스(gen/I_<id>)로
		Item gen = GenSupport.item(id);
		if (gen != null) {
			if (gen instanceof MakerCodex) ((MakerCodex) gen).initQuantity();
			if (d.getInt("level", 0) > 0 && gen.isUpgradable()) gen.upgrade(d.getInt("level", 0));
			return gen;
		}
		String kind = d.getString("kind", "misc");
		if (kind.equals("grimoire")) { MakerCodex.MakerGrimoire g = new MakerCodex.MakerGrimoire(); g.makerId = id; g.applyData(); return g; }
		if (kind.equals("bag")) { MakerBag g = new MakerBag(); g.makerId = id; g.applyData(); return g; }
		if (kind.equals("codex")) {
			MakerCodex c = new MakerCodex(); c.makerId = id; c.applyData(); c.initQuantity();
			if (d.getInt("level", 0) > 0) c.upgrade(d.getInt("level", 0));
			return c;
		}
		if (kind.equals("game")) {   // 게임 아이템 상속인데 생성 코드가 아직 없으면 바탕 게임 아이템으로
			MakerRuntime.warnOnce("아이템 " + id + " 의 코드가 게임에 없습니다 — 에디터에서 테스트 플레이(또는 런타임 설치)를 한 번 하세요");
			return spdItem(d.getString("base", ""));
		}
		if (!kind.equals("misc")) MakerRuntime.warnOnce("아이템 " + id + " 의 코드가 게임에 없습니다 — 에디터에서 테스트 플레이(또는 런타임 설치)를 한 번 하세요");
		MakerItem it = new MakerItem();
		it.makerId = id;
		it.applyData();
		return it;
	}
	/** 게임 items 폴더 (spd:짧은이름 도 찾도록) — mod-2 의 코덱스·그리모어 포함 */
	static final String[] PKGS = { "", "potions.", "potions.exotic.", "potions.brews.", "potions.elixirs.", "scrolls.", "scrolls.exotic.", "food.",
			"weapon.", "weapon.melee.", "weapon.missiles.", "weapon.missiles.darts.", "weapon.codices.melee.", "weapon.codices.ranged.", "weapon.codices.cast.",
			"armor.", "wands.", "rings.", "artifacts.", "stones.", "bags.", "bags.grimoire.", "keys.", "quest.", "spells.", "bombs.", "trinkets.", "journal.", "remains." };
	/** 아이템을 만들어 영웅에게 줌 (가방이 꽉 차면 발밑에). 코드에서: MakerItem.give(hero, "knuckleduster") · MakerItem.give(hero, "Cudgel", 2) */
	public static Item give(com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero, String id) { return give(hero, id, 1); }
	public static Item give(com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero, String id, int count) {
		Item it = create(id);
		if (it == null || hero == null) return it;
		if (count > 1 && it.stackable) it.quantity(count);
		if (!it.collect()) com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.drop(it, hero.pos).sprite.drop();
		return it;
	}
	/** 게임 아이템을 이름으로: 그대로 · 첫 글자 대문자 · snake/kebab → CamelCase · 무작위 생성 목록(Generator)에서 대소문자 무시 */
	static Item gameItem(String name) {
		String n = name.replace('/', '.');
		java.util.LinkedHashSet<String> cand = new java.util.LinkedHashSet<>();
		cand.add(n);
		int dot = n.lastIndexOf('.'); String pre = dot >= 0 ? n.substring(0, dot + 1) : "", simple = n.substring(dot + 1);
		if (!simple.isEmpty()) cand.add(pre + Character.toUpperCase(simple.charAt(0)) + simple.substring(1));
		StringBuilder camel = new StringBuilder(); for (String part : simple.split("[_\\-\\s]+")) if (!part.isEmpty()) camel.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
		if (camel.length() > 0) cand.add(pre + camel);
		for (String c : cand) { Item it = spdItemQuiet(c); if (it != null) return it; }
		String low = camel.toString().toLowerCase();
		for (com.shatteredpixel.shatteredpixeldungeon.items.Generator.Category cat : com.shatteredpixel.shatteredpixeldungeon.items.Generator.Category.values()) {
			if (cat.classes == null) continue;
			for (Class<?> c : cat.classes) if (c.getSimpleName().toLowerCase().equals(low) || c.getSimpleName().equalsIgnoreCase(simple)) { try { return (Item) Reflection.newInstance(c); } catch (Throwable ignored) { } }
		}
		return null;
	}
	static Item spdItemQuiet(String cls) {
		if (cls.startsWith("items.")) cls = cls.substring(6);
		for (String p : PKGS) {
			try { Class<?> c = Class.forName("com.shatteredpixel.shatteredpixeldungeon.items." + p + cls); if (Item.class.isAssignableFrom(c)) return (Item) Reflection.newInstance(c); }
			catch (ClassNotFoundException ignored) { }
		}
		return null;
	}
	static Item spdItem(String cls) {
		Item it = spdItemQuiet(cls);
		if (it == null) it = gameItem(cls.startsWith("items.") ? cls.substring(6) : cls);   // spd:cudgel 처럼 대소문자가 달라도
		if (it == null) MakerRuntime.log("게임 아이템 클래스를 찾지 못함: " + cls);
		return it;
	}

	protected JsonValue data() { return MakerRuntime.item(makerId); }
	protected void applyData() {
		JsonValue d = data(); if (d == null) return;
		JsonValue sp = d.get("sprite");
		if (sp != null && !sp.getString("png", "").isEmpty()) image = MakerAssets.customItemImage(sp.getString("png"), image);
		else if (sp != null && (sp.has("index") || sp.has("name"))) image = GenSupport.spriteIndex(sp, image);
		stackable = d.getBoolean("stackable", true);
		unique = d.getBoolean("unique", false);
	}
	ArrayList<String> tags() {
		ArrayList<String> t = new ArrayList<>();
		JsonValue d = data();
		if (d != null && d.get("tags") != null) for (JsonValue v : d.get("tags")) t.add(v.asString());
		return t;
	}

	@Override public String name() { JsonValue d = data(); return d == null ? "?" : d.getString("name", makerId); }
	@Override public String desc() { JsonValue d = data(); return d == null ? "" : d.getString("desc", ""); }
	@Override public boolean isUpgradable() { return false; }
	@Override public boolean isIdentified() { return true; }
	@Override public int value() { JsonValue d = data(); return (d == null ? 0 : d.getInt("price", 0)) * quantity; }

	@Override
	public boolean isSimilar(Item item) {
		return item instanceof MakerItem && makerId.equals(((MakerItem) item).makerId);
	}

	@Override
	public ArrayList<String> actions(Hero hero) {
		ArrayList<String> a = super.actions(hero);
		JsonValue d = data();
		if (usable(d)) a.add(AC_USE);
		if (giftTarget(hero) != null) a.add(AC_GIFT);
		return a;
	}
	@Override
	public String actionName(String action, Hero hero) {
		if (action.equals(AC_USE)) { JsonValue d = data(); String l = d == null ? "" : d.getString("useLabel", ""); return l.isEmpty() ? defaultUse(d == null ? "" : d.getString("category", "")) : l; }
		if (action.equals(AC_GIFT)) { MakerNPC n = giftTarget(hero); return n == null ? "선물하기" : n.name() + "에게 선물"; }
		return super.actionName(action, hero);
	}
	@Override public String defaultAction() { JsonValue d = data(); return usable(d) ? AC_USE : super.defaultAction(); }
	/** 사용 명령이 있거나 음식이면 "사용(먹기)" 버튼 */
	static boolean usable(JsonValue d) {
		return d != null && ((d.get("onUse") != null && d.get("onUse").size > 0) || d.getString("category", "").equals("food") || MakerFacets.useFx(d) != null);
	}

	@Override
	public void execute(Hero hero, String action) {
		super.execute(hero, action);
		if (action.equals(AC_USE)) {
			JsonValue d = data();
			String cat = d == null ? "" : d.getString("category", "");
			if (d != null && d.getBoolean("consumable", consumableCat(cat))) detach(hero.belongings.backpack);
			if (cat.equals("food")) {
				float energy = d.get("stats") != null ? d.get("stats").getFloat("energy", 300f) : 300f;
				com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff.affect(hero, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger.class).satisfy(energy);
				MakerAudio.playSe(d.getString("sound", "").isEmpty() ? "sfx:item.eat" : d.getString("sound", ""));
				if (hero.sprite != null) hero.sprite.operate(hero.pos);
			} else if (cat.equals("potion")) {
				MakerAudio.playSe(d.getString("sound", "").isEmpty() ? "sfx:item.drink" : d.getString("sound", ""));
				if (hero.sprite != null) hero.sprite.operate(hero.pos);
			} else if (cat.equals("scroll") || cat.equals("journal")) {
				MakerAudio.playSe(d.getString("sound", "").isEmpty() ? "sfx:item.read" : d.getString("sound", ""));
			} else if (d != null) {
				MakerAudio.playSe(d.getString("sound", "").isEmpty() ? "sfx:item.use" : d.getString("sound", ""));
			}
			JsonValue uf = MakerFacets.useFx(d);
			if (uf != null) MakerFacets.applyUse(hero, uf);   // 사용 효과 (효과 목록 — 회복 · 상태 효과 · 둘레 피해 …)
			hero.spend(uf != null ? Math.max(0f, uf.getFloat("time", 1f)) : Actor.TICK); hero.busy();
			if (d != null && d.get("onUse") != null) EventInterpreter.run(d.get("onUse"), null, null);
			hero.next();
		} else if (action.equals(AC_GIFT)) {
			final MakerNPC n = giftTarget(hero);
			if (n == null) return;
			detach(hero.belongings.backpack);
			String topic = HeartSystem.giftTopic(n.charId, makerId, tags());
			hero.spend(Actor.TICK); hero.busy();
			String cmds = "[{\"cmd\":\"topic\",\"char\":\"" + n.charId + "\",\"topic\":\"" + topic + "\"}]";
			EventInterpreter.run(new com.badlogic.gdx.utils.JsonReader().parse(cmds), null, n.charId);
			hero.next();
		}
	}

	/** 분류별 기본값 (에디터 PDM.ITEM_CATEGORY_INFO 와 같음) */
	static boolean consumableCat(String cat) {
		switch (cat) { case "potion": case "scroll": case "stone": case "spell": case "bomb": case "food": return true; default: return false; }
	}
	static String defaultUse(String cat) {
		switch (cat) { case "potion": return "마시기"; case "scroll": case "journal": return "읽기"; case "food": return "먹기"; case "spell": return "시전"; default: return "사용"; }
	}

	/** 영웅 바로 옆의 마음 시스템 NPC */
	static MakerNPC giftTarget(Hero hero) {
		if (hero == null || Dungeon.level == null) return null;
		for (int o : PathFinder.NEIGHBOURS8) {
			Char c = Actor.findChar(hero.pos + o);
			if (c instanceof MakerNPC && HeartSystem.enabled(((MakerNPC) c).charId)) return (MakerNPC) c;
		}
		return null;
	}

	@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_item", makerId); }
	@Override public void restoreFromBundle(Bundle bundle) { super.restoreFromBundle(bundle); makerId = bundle.getString("pdm_item"); applyData(); }
}
