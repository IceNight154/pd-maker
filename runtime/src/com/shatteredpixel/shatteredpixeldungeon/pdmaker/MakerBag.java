/*
 * PDMaker — 완전히 새 가방 (아이템 kind "bag" → 생성 클래스 gen/…/I_<id> extends MakerBag)
 *   items/<id>.json  bag {
 *     capacity (칸 수, 기본 20),
 *     holds: "all"(무엇이든) | "filter"(아래에 맞는 것만),
 *     categories: [분류 — potion · scroll · wand · ring · artifact · stone · spell · bomb · food · weapon · missile(투척 무기) · armor · key · quest · trinket · seed(씨앗) · material · gift · misc …],
 *     items: [프로젝트 아이템 id · "spd:<게임 경로>"(그 클래스와 상속한 것)], tags: [프로젝트 아이템 태그],
 *     tabIcon: "item"(가방 그림) | backpack · pouch · scroll · wand · potion (게임 가방 아이콘)
 *   }
 *   게임 규칙 그대로: 주운 아이템은 담을 수 있는 가방에 먼저 들어가고, 가방 창에 탭이 생김(탭 아이콘 — WndBag · InventoryPane 연결 줄)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag;
import com.watabou.utils.Bundle;

public class MakerBag extends Bag {

	public String makerId = "";
	{ image = com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.POUCH; }

	protected JsonValue data() { return MakerRuntime.item(makerId); }
	protected JsonValue bag() { JsonValue d = data(), b = d == null ? null : d.get("bag"); return b == null ? new JsonValue(JsonValue.ValueType.object) : b; }
	protected void applyData() { image = GenSupport.image(makerId, image); }

	@Override public String name() { return GenSupport.name(makerId); }
	@Override public String desc() { return GenSupport.desc(makerId); }
	@Override public int value() { JsonValue d = data(); return d == null ? 0 : d.getInt("price", 0); }
	@Override public int capacity() { return Math.max(1, Math.min(60, bag().getInt("capacity", 20))); }

	@Override public boolean canHold(Item item) {
		try { if (!accepts(bag(), item)) return false; } catch (Throwable t) { MakerRuntime.log("가방 오류: " + t); return false; }
		return super.canHold(item);
	}

	static final String P = "com.shatteredpixel.shatteredpixeldungeon.items.";
	/** 이 가방 설정(b)이 그 아이템을 받는지 */
	static boolean accepts(JsonValue b, Item item) {
		if (item == null || item instanceof Bag) return false;   // 가방 안에 가방은 안 넣음
		if (!"filter".equals(b.getString("holds", "all"))) return true;
		String pid = MakerAudio.projectItemId(item);
		JsonValue d = pid == null ? null : MakerRuntime.item(pid);
		JsonValue ids = b.get("items");
		if (ids != null) for (JsonValue v : ids) {
			String s = v.asString();
			if (pid != null && s.equals(pid)) return true;
			if (s.startsWith("spd:")) {
				String cls = P + s.substring(4);
				for (Class<?> c = item.getClass(); c != null && c != Object.class; c = c.getSuperclass()) if (c.getName().replace('$', '.').equals(cls)) return true;
			}
		}
		JsonValue tags = b.get("tags");
		if (tags != null && d != null && d.get("tags") != null) for (JsonValue t : tags) for (JsonValue it : d.get("tags")) if (t.asString().equals(it.asString())) return true;
		JsonValue cats = b.get("categories");
		if (cats != null && cats.size > 0) {
			String cat = category(item, d);
			for (JsonValue c : cats) {
				String k = c.asString();
				if (k.equals(cat)) return true;
				if (k.equals("missile") && item instanceof com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon) return true;
				if (k.equals("seed") && item instanceof com.shatteredpixel.shatteredpixeldungeon.plants.Plant.Seed) return true;
			}
		}
		return false;
	}
	/** 아이템의 분류: 프로젝트 아이템은 데이터의 category, 게임 아이템은 패키지(items.<폴더>) */
	static String category(Item item, JsonValue d) {
		if (d != null) return d.getString("category", "misc");
		for (Class<?> c = item.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
			String n = c.getName();
			if (!n.startsWith(P)) continue;
			String seg = n.substring(P.length()); int k = seg.indexOf('.'); if (k < 0) return "misc";
			switch (seg.substring(0, k)) {
				case "potions": return "potion"; case "scrolls": return "scroll"; case "wands": return "wand"; case "rings": return "ring";
				case "artifacts": return "artifact"; case "stones": return "stone"; case "spells": return "spell"; case "bombs": return "bomb";
				case "food": return "food"; case "weapon": return "weapon"; case "armor": return "armor"; case "keys": return "key";
				case "quest": return "quest"; case "trinkets": return "trinket"; case "bags": return "bag"; case "journal": return "journal"; case "remains": return "remains";
			}
			return "misc";
		}
		return "misc";
	}

	/** 가방 창 탭 아이콘 (WndBag.icon · InventoryPane.bagIcon 연결 줄) — null 이면 게임 기본 */
	public static com.watabou.noosa.Image icon(Bag bag) {
		if (!(bag instanceof MakerBag)) return null;
		try {
			String t = ((MakerBag) bag).bag().getString("tabIcon", "item");
			com.shatteredpixel.shatteredpixeldungeon.ui.Icons ic;
			switch (t) {
				case "backpack": ic = com.shatteredpixel.shatteredpixeldungeon.ui.Icons.BACKPACK; break;
				case "pouch": ic = com.shatteredpixel.shatteredpixeldungeon.ui.Icons.SEED_POUCH; break;
				case "scroll": ic = com.shatteredpixel.shatteredpixeldungeon.ui.Icons.SCROLL_HOLDER; break;
				case "wand": ic = com.shatteredpixel.shatteredpixeldungeon.ui.Icons.WAND_HOLSTER; break;
				case "potion": ic = com.shatteredpixel.shatteredpixeldungeon.ui.Icons.POTION_BANDOLIER; break;
				default: return new com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite(bag);
			}
			return com.shatteredpixel.shatteredpixeldungeon.ui.Icons.get(ic);
		} catch (Throwable e) { return null; }
	}

	@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_item", makerId); }
	@Override public void restoreFromBundle(Bundle bundle) { if (bundle.contains("pdm_item")) makerId = bundle.getString("pdm_item"); applyData(); super.restoreFromBundle(bundle); }
}
