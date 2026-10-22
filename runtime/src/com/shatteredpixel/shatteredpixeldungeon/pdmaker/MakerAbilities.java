/*
 * 직업 능력(ArmorAbility) · 전직(HeroSubClass) — 원작 구조를 데이터로
 *   heroes/<id>.json
 *     abilities[]  : { id, name, icon(hero_icons.png), shortDesc, desc, chargeUse(원작 35), target · range · projectile · visual · time · shout · sound · heat · effects[] }
 *                    ← actors/hero/abilities/ArmorAbility. 왕관(KingsCrown)으로 셋 중 하나를 골라 갑옷이 직업 갑옷(ClassArmor)이 되고,
 *                      갑옷 충전(0~100%)을 chargeUse 만큼 써서 발동. (HeroClass.armorAbilities() 연결 줄)
 *     subclasses[] : { id, name, icon, shortDesc, desc, base(게임 HeroSubClass 이름, 비우면 없음), effects[{stat, value}] }
 *                    ← actors/hero/HeroSubClass. 텐구의 가면(TengusMask)을 쓰면 고름 (TengusMask.execute 연결 줄).
 *                      base 를 적으면 게임 원래 전직 효과(예: BERSERKER, mod-2 ARIA_OVERHEAT)도 함께 켜짐.
 *   특성 3단계는 전직 뒤, 4단계는 직업 능력 뒤에 열림 (MakerTalents). 이벤트 명령 "전직 고르기"·"직업 능력 고르기" 로도 열 수 있음.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroSubClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
//#if has:actors.hero.abilities.ArmorAbility && has:items.KingsCrown && has:windows.WndChooseAbility @ 직업 능력 (영웅 편집기 abilities — 왕관 · 직업 갑옷)
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.ArmorAbility;
import com.shatteredpixel.shatteredpixeldungeon.items.KingsCrown;
import com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndChooseAbility;
//#endif
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.shatteredpixel.shatteredpixeldungeon.ui.IconButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Bundle;

public class MakerAbilities {

	/** 고른 전직 id ("" = 아직) */
	static String subclass = "";

	static JsonValue data() { return HeroRuntime.data(); }
	static JsonValue arr(String key) { JsonValue h = data(); return h == null ? null : h.get(key); }
	public static boolean anySubclass() { JsonValue a = arr("subclasses"); return a != null && a.size > 0; }
	public static boolean anyAbility() { JsonValue a = arr("abilities"); return a != null && a.size > 0; }
	static JsonValue find(String key, String id) {
		JsonValue a = arr(key); if (a == null || id == null || id.isEmpty()) return null;
		for (JsonValue x : a) if (id.equals(x.getString("id", ""))) return x;
		return null;
	}
	static void reset() { subclass = ""; }

	// ------------------------------------------------------------ 전직

	public static String subclassId() { return subclass; }
	public static JsonValue subclassData() { return find("subclasses", subclass); }
	public static String subclassName(String id) { JsonValue s = find("subclasses", id); return s == null ? id : s.getString("name", id); }
	/** 전직 효과 합 (effects[{stat, value}]) */
	static int subclassStat(String stat) {
		JsonValue s = subclassData(); if (s == null || s.get("effects") == null) return 0;
		int sum = 0; for (JsonValue e : s.get("effects")) if (stat.equals(e.getString("stat", ""))) sum += e.getInt("value", 0);
		return sum;
	}

	/** 전직 아이템 연결 줄 (SPD = TengusMask.execute · 다른 판은 그 게임의 전직 아이템 — 예: TomeOfMastery): 이 영웅에게 전직 목록이 있으면 우리 창 (true = 처리함) */
	public static boolean chooseSubclass(Item mask, Hero hero) {
		try {
			if (!anySubclass()) {
				if (!HeroRuntime.zeroBase()) return false;
				GLog.w("이 영웅은 전직이 없다.");     // 새 영웅: 게임 직업의 전직을 주지 않음
				return true;
			}
			GameScene.show(new WndMakerSubclass(mask, hero));
			return true;
		} catch (Throwable t) { MakerRuntime.log("전직 창 오류: " + t); return false; }
	}
	/** 이벤트 명령 "전직 고르기" (가면 없이) */
	public static void openSubclass() {
		Hero hero = Dungeon.hero; if (hero == null) return;
		if (!anySubclass()) { GLog.w("이 영웅은 전직이 없다."); return; }
		if (!subclass.isEmpty()) { GLog.w("이미 전직했다."); return; }
		com.watabou.noosa.Game.runOnRenderThread(() -> GameScene.show(new WndMakerSubclass(null, hero)));
	}

	static void choose(Item mask, Hero hero, JsonValue s) {
		if (mask != null) mask.detach(hero.belongings.backpack);
		subclass = s.getString("id", "");
		String base = s.getString("base", "");
		if (!base.isEmpty()) {
			try { hero.subClass = HeroSubClass.valueOf(base); Talent.initSubclassTalents(hero); }
			catch (IllegalArgumentException e) { MakerRuntime.log("게임 전직을 찾지 못함: " + base); }
		}
		hero.spend(Actor.TICK); hero.busy();
		Sample.INSTANCE.play(Assets.Sounds.MASTERY);
		GLog.p("「" + s.getString("name", subclass) + "」(으)로 전직했다!");
		HeroRuntime.gain("subclass", subclass);
		HeroRuntime.syncHP(hero, false);
		MakerActive.attach(hero);
		Item.updateQuickslot();
		if (MakerTalents.availableAll(hero) > 0) com.shatteredpixel.shatteredpixeldungeon.ui.StatusPane.talentBlink = 10f;
		if (hero.sprite != null) hero.sprite.operate(hero.pos); else hero.next();   // 원작처럼 동작이 끝나면 다음 턴
	}

	/** WndChooseSubclass 와 같은 모양 */
	public static class WndMakerSubclass extends Window {
		static final int WIDTH = 130;
		public WndMakerSubclass(final Item mask, final Hero hero) {
			ItemSprite is = new ItemSprite(mask == null ? MakerCompat.staticInt(com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.class, "MASK", MakerCompat.staticInt(com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.class, "MASTERY", 0)) : mask.image(), null);
			is.x = 0; is.y = 0; add(is);
			RenderedTextBlock t = PixelScene.renderTextBlock(mask == null ? "전직" : mask.name(), 9);
			t.hardlight(MakerTheme.or("accent", 0xFFFF44)); t.setPos(20, (16 - t.height()) / 2f); add(t);
			RenderedTextBlock m = PixelScene.renderTextBlock("앞으로 나아갈 길을 하나 고르세요. 한 번 고르면 바꿀 수 없습니다.", 6);
			m.maxWidth(WIDTH); m.setPos(0, 20); add(m);
			float pos = m.bottom() + 6;
			for (final JsonValue s : arr("subclasses")) {
				RedButton b = new RedButton(s.getString("name", "") + ": " + s.getString("shortDesc", ""), 6) {
					@Override protected void onClick() {
						GameScene.show(new WndOptions(MakerSpells.heroIcon(MakerSpells.iconOf(s, 0)), s.getString("name", ""), "이 전직을 고를까요?", "네", "아니요") {
							@Override protected void onSelect(int index) {
								if (index == 0 && WndMakerSubclass.this.parent != null) { WndMakerSubclass.this.hide(); choose(mask, hero, s); }
							}
						});
					}
				};
				b.leftJustify = true; b.multiline = true;
				b.icon(MakerSpells.heroIcon(MakerSpells.iconOf(s, 0)));
				b.setSize(WIDTH - 20, b.reqHeight() + 2);
				b.setRect(0, pos, WIDTH - 20, b.reqHeight() + 2); add(b);
				IconButton info = new IconButton(Icons.get(Icons.INFO)) {
					@Override protected void onClick() { GameScene.show(new HeartUI.WndMakerSimple(s.getString("name", ""), s.getString("desc", s.getString("shortDesc", "")))); }
				};
				info.setRect(WIDTH - 20, b.top() + (b.height() - 20) / 2, 20, 20); add(info);
				pos = b.bottom() + 2;
			}
			RedButton cancel = new RedButton("취소") { @Override protected void onClick() { hide(); } };
			cancel.setRect(0, pos, WIDTH, 18); add(cancel);
			resize(WIDTH, (int) cancel.bottom());
		}
	}

	// ------------------------------------------------------------ 직업 능력

//#if has:actors.hero.abilities.ArmorAbility && has:items.KingsCrown && has:windows.WndChooseAbility @ 직업 능력 (영웅 편집기 abilities — 왕관 · 직업 갑옷)
	public static String abilityId() {
		Hero h = Dungeon.hero;
		return h != null && h.armorAbility instanceof MakerArmorAbility ? ((MakerArmorAbility) h.armorAbility).abilityId : "";
	}
	/** 영웅이 게임 원래 직업 능력을 가졌는지 (특성 4단계 열림 판정) */
	public static boolean nativeAbility(Hero hero) { return hero != null && hero.armorAbility != null; }
	public static String abilityName(String id) { JsonValue s = find("abilities", id); return s == null ? id : s.getString("name", id); }

	/** HeroClass.armorAbilities() 첫 줄: 이 영웅에게 직업 능력 목록이 있으면 그것 (null = 게임 원래) */
	public static ArmorAbility[] armorAbilities(HeroClass cls) {
		try {
			if (Dungeon.hero == null || Dungeon.hero.heroClass != cls) return null;
			if (!(com.watabou.noosa.Game.scene() instanceof GameScene)) return null;
			if (!anyAbility()) return HeroRuntime.zeroBase() ? new ArmorAbility[0] : null;   // 새 영웅: 게임 직업의 능력을 주지 않음
			JsonValue a = arr("abilities");
			ArmorAbility[] out = new ArmorAbility[a.size];
			for (int i = 0; i < a.size; i++) out[i] = new MakerArmorAbility(a.get(i).getString("id", ""));
			return out;
		} catch (Throwable t) { MakerRuntime.log("직업 능력 목록 오류: " + t); return null; }
	}
	/** 이벤트 명령 "직업 능력 고르기" (왕관 없이 — 입은 갑옷이 직업 갑옷이 됨) */
	public static void openAbility() {
		Hero hero = Dungeon.hero; if (hero == null) return;
		if (hero.armorAbility != null) { GLog.w("이미 직업 능력이 있다."); return; }
		if (hero.belongings.armor() == null) { GLog.w("갑옷을 입고 있어야 한다."); return; }
		com.watabou.noosa.Game.runOnRenderThread(() -> GameScene.show(new WndChooseAbility(new KingsCrown(), hero.belongings.armor(), hero)));
	}

	/** 데이터로 정의한 ArmorAbility */
	public static class MakerArmorAbility extends ArmorAbility {
		public String abilityId = "";
		public MakerArmorAbility() { }
		public MakerArmorAbility(String id) { abilityId = id; applyData(); }
		JsonValue def() { return find("abilities", abilityId); }
		void applyData() { JsonValue d = def(); if (d != null) baseChargeUse = d.getFloat("chargeUse", 35f); }

		@Override public String targetingPrompt() {
			JsonValue d = def();
			return d == null || d.getString("target", "self").equals("self") ? null : d.getString("name", "") + ": 대상을 고르세요";
		}
		@Override public float chargeUse(Hero hero) { JsonValue d = def(); return d == null ? baseChargeUse : Math.max(0, MakerCast.val(d, "chargeUse", 35)); }
		@Override protected void activate(ClassArmor armor, Hero hero, Integer target) {
			JsonValue d = def();
			if (d == null || target == null) return;
			if (!d.getString("target", "self").equals("self") && !MakerCast.check(hero, d, target)) return;
			armor.charge -= chargeUse(hero);
			Item.updateQuickslot();
			com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility.dispel();
			int cell = d.getString("target", "self").equals("self") ? hero.pos : target;
			MakerCast.perform(hero, d, cell, null, "ability");
			HeroRuntime.use("ability", abilityId, hero, cell);
		}
		@Override public String name() { JsonValue d = def(); return d == null ? abilityId : d.getString("name", abilityId); }
		@Override public String shortDesc() { JsonValue d = def(); return d == null ? "" : "_" + name() + ":_ " + d.getString("shortDesc", ""); }
		@Override public String desc() {
			JsonValue d = def(); if (d == null) return "";
			String ef = MakerCast.effectsInfo(d);
			return d.getString("desc", d.getString("shortDesc", "")) + "\n\n갑옷 충전 " + Math.round(chargeUse(Dungeon.hero)) + "% 사용" + (ef.isEmpty() ? "" : (ef.startsWith("\n") ? "" : "\n") + ef);
		}
		@Override public int icon() { JsonValue d = def(); return d == null ? 0 : MakerSpells.iconOf(d, 19); }
		/** 4단계 특성은 영웅 편집기의 특성(ability 표시)으로 — 게임 창이 빈 목록을 못 그리므로 원작 공통 특성 하나만 알려 줌 */
		@Override public Talent[] talents() { return new Talent[]{ Talent.HEROIC_ENERGY }; }
		@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_ab", abilityId); }
		@Override public void restoreFromBundle(Bundle bundle) { super.restoreFromBundle(bundle); abilityId = bundle.getString("pdm_ab"); applyData(); }
	}
//#else
	//#| // 이 게임에는 직업 능력(ArmorAbility · 왕관 · 능력 고르기 창) 구조가 없음 — 영웅 편집기의 직업 능력은 이 게임에서 동작하지 않음
	//#| public static String abilityId() { return ""; }
	//#| public static String abilityName(String id) { JsonValue s = find("abilities", id); return s == null ? id : s.getString("name", id); }
	//#| public static boolean nativeAbility(Hero hero) { return false; }
	//#| public static void openAbility() { GLog.w("이 게임에는 직업 능력이 없다."); MakerRuntime.log("직업 능력 고르기: 이 게임 저장소에는 ArmorAbility 구조가 없어 동작하지 않습니다"); }
//#endif

	/** Hero.className() 첫 줄: 전직했으면 그 이름 (null = 게임 원래) */
	public static String className(Hero hero) {
		try {
			if (hero != Dungeon.hero) return null;
			if (subclass.isEmpty()) { JsonValue h = data(); return HeroRuntime.zeroBase(h) ? h.getString("name", null) : null; }   // 새 영웅: 직업 이름 대신 영웅 이름
			JsonValue s = subclassData();
			return s == null ? null : s.getString("name", null);
		} catch (Throwable t) { return null; }
	}

	// ------------------------------------------------------------ 저장

	static void store(Bundle b) { b.put("pdm_subclass", subclass); }
	static void restore(Bundle b) { reset(); if (b.contains("pdm_subclass")) subclass = b.getString("pdm_subclass"); }
}
