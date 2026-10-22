/*
 * 아이템 도감 (journal.Catalog) — 프로젝트 아이템을 게임의 도감 분류에 올림.
 *   아이템마다 에디터가 만든 클래스(gen/I_<id>)가 있으므로 그 클래스를 분류(MELEE_WEAPONS · ARMOR · POTIONS …)에 더함
 *   → 게임이 평소처럼 주울 때 "본 아이템"으로 표시하고, 도감 창에서 그림·이름을 보여 줌
 *   아이템 데이터의 catalog: false 면 올리지 않음
 * 게임 연결: MakerRuntime.init() 끝에서 register() (도감을 불러오기 전에 — Journal.loadGlobal 은 메뉴 화면에서)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.journal.Catalog;

import java.lang.reflect.Field;
import java.util.Map;

public class MakerCatalog {

	static boolean done = false;

	static Catalog catalogOf(JsonValue it) {
		String kind = it.getString("kind", "misc"), cat = it.getString("category", "misc"), sub = it.getString("subtype", "");
		if (kind.equals("game")) {
			String b = it.getString("base", "");
			if (b.startsWith("weapon.melee.")) return Catalog.MELEE_WEAPONS;
			if (b.startsWith("weapon.missiles.")) return Catalog.THROWN_WEAPONS;
			if (b.startsWith("armor.")) return Catalog.ARMOR;
			cat = b.contains(".") ? b.substring(0, b.indexOf('.')) : cat;
			switch (cat) { case "potions": cat = "potion"; break; case "scrolls": cat = "scroll"; break; case "rings": cat = "ring"; break; case "wands": cat = "wand"; break;
				case "artifacts": cat = "artifact"; break; case "stones": cat = "stone"; break; case "spells": cat = "spell"; break; case "bombs": cat = "bomb"; break; case "trinkets": cat = "trinket"; break; default: }
		}
		if (kind.equals("melee")) return Catalog.MELEE_WEAPONS;
		if (kind.equals("missile")) return Catalog.THROWN_WEAPONS;
		if (kind.equals("armor")) return Catalog.ARMOR;
		switch (cat) {
			case "weapon": return sub.equals("missile") || sub.equals("dart") ? Catalog.THROWN_WEAPONS : Catalog.MELEE_WEAPONS;
			case "armor": return Catalog.ARMOR;
			case "wand": return Catalog.WANDS;
			case "ring": return Catalog.RINGS;
			case "artifact": return Catalog.ARTIFACTS;
			case "trinket": { Object t = MakerCompat.staticValue(Catalog.class, "TRINKETS", null); return t instanceof Catalog ? (Catalog) t : null; }   // 장신구가 없는 판
			case "potion": return sub.equals("exotic") ? Catalog.EXOTIC_POTIONS : sub.equals("brew") || sub.equals("elixir") ? Catalog.BREWS_ELIXIRS : Catalog.POTIONS;
			case "scroll": return sub.equals("exotic") ? Catalog.EXOTIC_SCROLLS : Catalog.SCROLLS;
			case "stone": return Catalog.STONES;
			case "food": return Catalog.FOOD;
			case "bomb": return Catalog.BOMBS;
			case "spell": return Catalog.SPELLS;
			case "bag": case "codex": case "key": case "quest": return Catalog.MISC_EQUIPMENT;
			default: return Catalog.MISC_CONSUMABLES;
		}
	}

	@SuppressWarnings("unchecked")
	static void register() {
		if (done) return;
		done = true;
		int n = 0;
		try {
			Field fs = Catalog.class.getDeclaredField("seen"), fu = Catalog.class.getDeclaredField("useCount");
			fs.setAccessible(true); fu.setAccessible(true);
			for (JsonValue it : MakerRuntime.items.values()) {
				if (!it.getBoolean("catalog", true) || MakerRuntime.off(it)) continue;
				Class<?> c = GenSupport.cls("I_" + GenSupport.safe(it.getString("id", "")));
				if (c == null) continue;   // 아직 생성 코드가 없음 (테스트 플레이 때 만들어짐)
				Catalog cat = catalogOf(it);
				Map<Class<?>, Boolean> seen = (Map<Class<?>, Boolean>) fs.get(cat);
				Map<Class<?>, Integer> uses = (Map<Class<?>, Integer>) fu.get(cat);
				if (seen.containsKey(c)) continue;
				seen.put(c, false); uses.put(c, 0);
				n++;
			}
		} catch (Throwable t) { MakerRuntime.log("아이템 도감 등록 오류: " + t); }
		if (n > 0) MakerRuntime.log("아이템 도감에 프로젝트 아이템 " + n + "개를 올렸습니다");
	}
}
