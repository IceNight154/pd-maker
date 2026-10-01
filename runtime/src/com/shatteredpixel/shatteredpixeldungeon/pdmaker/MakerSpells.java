/*
 * 주문 — 성직자의 주문(actors/hero/spells/ClericSpell + items/artifacts/HolyTome + windows/WndClericSpells)을 데이터로 옮긴 것
 *   heroes/<id>.json
 *     spellbook : { enabled, name, desc, image, charges, rechargeTurns }   ← HolyTome (충전은 영웅이 가지고 저장됨)
 *     spells[]  : { id, name, icon(hero_icons.png), desc, tier(1~4), cost(= chargeUse), cooldown,
 *                   target · range · projectile · visual · time · shout · sound · hitSound · heat · effects[]  (MakerCast)
 *                   배우는 조건: unlockLevel · requiresTalent/requiresPoints · subclass · ability · cond }
 *   ClericSpell.getSpellList(hero, tier) 처럼 단계별로 "지금 배운 주문"만 창에 나옴. 창에서 길게 누르면 빠른 시전(퀵슬롯 기본 동작).
 *   특성: {type: unlockSpell, spell} 이 있으면 그 특성을 1포인트 이상 찍어야 배움 (원작: 특성 = 주문)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.ui.IconButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Image;
import com.watabou.noosa.NinePatch;
import com.watabou.noosa.TextureFilm;
import com.watabou.utils.Bundle;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MakerSpells {

	public static final int MAX_TIERS = 4;

	public static int charge = 0;
	public static float partial = 0;
	public static final Map<String, Integer> cooldowns = new HashMap<>();
	/** 빠른 시전 주문 (주문서의 기본 동작) */
	public static String quickSpell = "";

	static JsonValue data() { return HeroRuntime.data(); }
	static JsonValue book() { JsonValue h = data(); return h == null ? null : h.get("spellbook"); }
	/** 주문 목록 (예전 skills 도 읽음) */
	static JsonValue list() { JsonValue h = data(); if (h == null) return null; return h.get("spells") != null ? h.get("spells") : h.get("skills"); }
	public static boolean any() { JsonValue l = list(); return l != null && l.size > 0; }

	public static int maxCharge() {
		JsonValue s = book();
		return Math.max(0, (s == null ? 3 : s.getInt("charges", 3)) + (Dungeon.hero == null ? 0 : HeroRuntime.bonus("charges")));
	}
	static void reset() { charge = 0; partial = 0; cooldowns.clear(); quickSpell = ""; }
	static void fill() { charge = maxCharge(); }

	/** 매 턴 (HeroRuntime.Tracker) — HolyTome.Charger 처럼 천천히 충전 */
	static void tick(Hero hero) {
		for (Map.Entry<String, Integer> e : new ArrayList<>(cooldowns.entrySet())) {
			if (e.getValue() <= 1) cooldowns.remove(e.getKey()); else e.setValue(e.getValue() - 1);
		}
		int max = maxCharge();
		if (charge >= max) { partial = 0; charge = max; return; }
		JsonValue s = book();
		int turns = Math.max(1, s == null ? 40 : s.getInt("rechargeTurns", 40));
		partial += (1f / turns) * Math.max(0.1f, 1f + HeroRuntime.bonus("recharge") / 100f);
		while (partial >= 1f && charge < max) { partial -= 1f; charge++; Item.updateQuickslot(); }
	}

	// ------------------------------------------------------------ 목록 (ClericSpell.getSpellList)

	public static List<JsonValue> all() {
		List<JsonValue> l = new ArrayList<>();
		JsonValue s = list();
		if (s != null) for (JsonValue sp : s) l.add(sp);
		return l;
	}
	static JsonValue find(String id) {
		if (id == null || id.isEmpty()) return null;
		for (JsonValue sp : all()) if (id.equals(sp.getString("id", ""))) return sp;
		return null;
	}
	public static int tierOf(JsonValue sp) {
		if (sp.has("tier")) return Math.max(1, Math.min(MAX_TIERS, sp.getInt("tier", 1)));
		int lv = sp.getInt("unlockLevel", 1);         // 예전 스킬: 배우는 레벨로 단계 추측
		return lv >= 21 ? 4 : lv >= 13 ? 3 : lv >= 7 ? 2 : 1;
	}
	/** 못 배운 이유 (배웠으면 null) */
	public static String lockReason(Hero hero, JsonValue sp) {
		if (hero.lvl < sp.getInt("unlockLevel", 1)) return "레벨 " + sp.getInt("unlockLevel", 1) + " 에 배움";
		String sub = sp.getString("subclass", "");
		if (!sub.isEmpty() && !sub.equals(MakerAbilities.subclassId())) return "전직 「" + MakerAbilities.subclassName(sub) + "」 전용";
		String ab = sp.getString("ability", "");
		if (!ab.isEmpty() && !ab.equals(MakerAbilities.abilityId())) return "직업 능력 「" + MakerAbilities.abilityName(ab) + "」 필요";
		if (!MakerTalents.spellUnlocked(sp)) {
			String req = sp.getString("requiresTalent", "");
			JsonValue t = req.isEmpty() ? null : MakerTalents.talent(req);
			return t != null ? "특성 「" + t.getString("name", req) + "」 필요" : "특성으로 배움";
		}
		if (!Cond.eval(sp.getString("cond", ""), StoryState.globalResolver())) return "지금은 쓸 수 없음";
		return null;
	}
	public static List<JsonValue> learned(Hero hero, int tier) {
		List<JsonValue> l = new ArrayList<>();
		for (JsonValue sp : all()) if (tierOf(sp) == tier && lockReason(hero, sp) == null) l.add(sp);
		return l;
	}
	public static List<JsonValue> learned(Hero hero) {
		List<JsonValue> l = new ArrayList<>();
		for (int t = 1; t <= MAX_TIERS; t++) l.addAll(learned(hero, t));
		return l;
	}
	public static int cost(JsonValue sp) { return MakerCast.val(sp, "cost", 1); }
	/** 지금 쓸 수 없는 이유 (HolyTome.canCast) */
	public static String blocked(Hero hero, JsonValue sp) {
		String lock = lockReason(hero, sp);
		if (lock != null) return lock;
		String id = sp.getString("id", "");
		if (cooldowns.containsKey(id)) return "재사용 대기 " + cooldowns.get(id) + "턴";
		if (charge < cost(sp)) return "충전 부족 (" + charge + "/" + cost(sp) + ")";
		return null;
	}
	public static String info(JsonValue sp) {
		StringBuilder b = new StringBuilder(sp.getString("desc", ""));
		b.append(b.length() > 0 ? "\n\n" : "").append("충전 ").append(cost(sp));
		if (MakerCast.val(sp, "cooldown", 0) > 0) b.append(" · 대기 ").append(MakerCast.val(sp, "cooldown", 0)).append("턴");
		String ef = MakerCast.effectsInfo(sp);
		if (!ef.isEmpty()) b.append(ef.startsWith("\n") ? "" : " · ").append(ef);
		return b.toString();
	}

	// ------------------------------------------------------------ 아이콘 (hero_icons.png 16×16)

	private static TextureFilm film;
	public static int iconOf(JsonValue sp, int def) {
		JsonValue ic = sp == null ? null : sp.get("icon");
		if (ic != null && (ic.isString() || ic.isObject())) { int c = MakerAssets.heroIconIndex(ic); if (c >= 0) return c; }   // 직접 지정한 아이콘 파일
		else if (ic != null && ic.isNumber() && ic.asInt() >= 0) return ic.asInt();
		if (def >= 0) return def;
		switch (sp.getString("target", "self")) {
			case "self": return 42;   // HOLY_WARD
			case "cell": return 17;   // SHOCKWAVE
			default: return 19;       // ELEMENTAL_BLAST
		}
	}
	public static Image heroIcon(int idx) {
		Image im = new Image(Assets.Interfaces.HERO_ICONS);
		if (film == null) film = new TextureFilm(im.texture, 16, 16);
		im.frame(film.get(idx));
		return im;
	}
	public static Image icon(JsonValue sp) { return heroIcon(iconOf(sp, -1)); }

	// ------------------------------------------------------------ 시전 (ClericSpell.onCast → onSpellCast)

	public static void cast(final Hero hero, final JsonValue sp) {
		String why = blocked(hero, sp);
		if (why != null) { GLog.w(why); return; }
		MakerCast.cast(hero, sp, new MakerCast.Done() {
			@Override public void done(int cell) { onSpellCast(hero, sp); }
		});
	}
	static void onSpellCast(Hero hero, JsonValue sp) {
		charge = Math.max(0, charge - cost(sp));
		int cd = MakerCast.val(sp, "cooldown", 0);
		if (cd > 0) cooldowns.put(sp.getString("id", ""), cd);
		com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility.dispel();
		Item.updateQuickslot();
	}

	// ------------------------------------------------------------ 주문서 (HolyTome)

	public static class MakerSpellbook extends Item {
		public static final String AC_CAST = "CAST";
		public static final String AC_QUICK = "QUICK";

		{
			image = ItemSpriteSheet.MASTERY;
			stackable = false;
			unique = true;
			bones = false;
			defaultAction = AC_CAST;
		}
		JsonValue b() { return book(); }
		@Override public int image() {
			JsonValue s = b();
			if (s == null || s.get("image") == null) return image;
			JsonValue im = s.get("image");
			if (im.isString()) return MakerAssets.customItemImage(im.asString(), image);   // 직접 지정한 PNG
			return im.isNumber() ? im.asInt() : image;
		}
		@Override public String name() { JsonValue s = b(); return s == null ? "주문서" : s.getString("name", "주문서"); }
		@Override public String desc() {
			JsonValue s = b();
			StringBuilder sb = new StringBuilder(s == null ? "" : s.getString("desc", ""));
			sb.append("\n\n충전: ").append(charge).append("/").append(maxCharge());
			JsonValue q = find(quickSpell);
			if (q != null) sb.append("\n빠른 시전: ").append(q.getString("name", ""));
			return sb.toString();
		}
		@Override public String status() { return charge + "/" + maxCharge(); }
		@Override public boolean isUpgradable() { return false; }
		@Override public boolean isIdentified() { return true; }
		@Override public String defaultAction() { return find(quickSpell) != null && Dungeon.hero != null && lockReason(Dungeon.hero, find(quickSpell)) == null ? AC_QUICK : AC_CAST; }
		@Override public ArrayList<String> actions(Hero hero) {
			ArrayList<String> a = super.actions(hero);
			a.add(AC_CAST);
			JsonValue q = find(quickSpell);
			if (q != null && lockReason(hero, q) == null) a.add(AC_QUICK);
			return a;
		}
		@Override public String actionName(String action, Hero hero) {
			if (action.equals(AC_CAST)) return "주문";
			if (action.equals(AC_QUICK)) { JsonValue q = find(quickSpell); return q == null ? "빠른 시전" : q.getString("name", "빠른 시전"); }
			return super.actionName(action, hero);
		}
		@Override public void execute(Hero hero, String action) {
			super.execute(hero, action);
			if (action.equals(AC_CAST)) GameScene.show(new WndMakerSpells(this, hero, false));
			else if (action.equals(AC_QUICK)) { JsonValue q = find(quickSpell); if (q != null) MakerSpells.cast(hero, q); }
		}
		// 예전(전용 아이템) 저장 파일의 충전 값
		@Override public void restoreFromBundle(Bundle bb) {
			super.restoreFromBundle(bb);
			if (bb.contains("charge") && !HeroRuntime.restoredSpells) charge = bb.getInt("charge");
		}
	}

	/** 주문 창 (WndClericSpells) — 단계별 아이콘. 누르면 시전, 길게 누르면 빠른 시전 지정, 정보 모드 전환 */
	public static class WndMakerSpells extends Window {
		static final int WIDTH = 120, BTN = 20;
		public WndMakerSpells(final MakerSpellbook book, final Hero hero, final boolean info) {
			ItemSprite is = new ItemSprite(book == null ? ItemSpriteSheet.MASTERY : book.image(), null);
			is.x = 0; is.y = 0; add(is);
			RenderedTextBlock title = PixelScene.renderTextBlock(info ? "주문 정보" : (book == null ? "주문" : book.name()) + "  " + charge + "/" + maxCharge(), 9);
			title.hardlight(TITLE_COLOR); title.setPos(20, (16 - title.height()) / 2f); add(title);
			IconButton toggle = new IconButton(info ? new ItemSprite(book == null ? ItemSpriteSheet.MASTERY : book.image(), null) : com.shatteredpixel.shatteredpixeldungeon.ui.Icons.INFO.get()) {
				@Override protected void onClick() { hide(); GameScene.show(new WndMakerSpells(book, hero, !info)); }
			};
			toggle.setRect(WIDTH - 16, 0, 16, 16); add(toggle);
			RenderedTextBlock msg = PixelScene.renderTextBlock(info ? "주문을 누르면 설명을 봅니다." : "주문을 누르면 시전합니다. 길게 누르면 빠른 시전(퀵슬롯)으로 정합니다.", 6);
			msg.maxWidth(WIDTH); msg.setPos(0, 20); add(msg);
			int top = (int) msg.bottom() + 4;
			boolean first = true;
			for (int t = 1; t <= MAX_TIERS; t++) {
				List<JsonValue> l = learned(hero, t);
				if (l.isEmpty()) continue;
				if (!first) { top += BTN + 2; ColorBlock sep = new ColorBlock(WIDTH, 1, 0xFF000000); sep.y = top; add(sep); top += 3; }
				first = false;
				int left = 2 + (WIDTH - l.size() * (BTN + 4)) / 2;
				for (JsonValue sp : l) {
					SpellBtn b = new SpellBtn(this, hero, sp, info);
					add(b); b.setRect(left, top, BTN, BTN); left += BTN + 4;
				}
			}
			if (first) {
				RenderedTextBlock none = PixelScene.renderTextBlock("아직 배운 주문이 없다.", 6);
				none.setPos(0, top); add(none); top = (int) none.bottom() - BTN + 2;
			}
			resize(WIDTH, top + BTN);
		}
	}
	static class SpellBtn extends IconButton {
		final Window wnd; final Hero hero; final JsonValue sp; final boolean info; NinePatch bg;
		SpellBtn(Window wnd, Hero hero, JsonValue sp, boolean info) {
			super(MakerSpells.icon(sp));
			this.wnd = wnd; this.hero = hero; this.sp = sp; this.info = info;
			if (blocked(hero, sp) != null) icon.alpha(0.3f);
			if (sp.getString("id", "").equals(quickSpell)) icon.brightness(1.5f);
			bg = Chrome.get(Chrome.Type.TOAST); addToBack(bg);
		}
		@Override protected void layout() { super.layout(); if (bg != null) { bg.size(width, height); bg.x = x; bg.y = y; } }
		@Override protected void onClick() {
			if (info) { GameScene.show(new WndSpellInfo(hero, sp, false)); return; }
			wnd.hide();
			MakerSpells.cast(hero, sp);
		}
		@Override protected boolean onLongClick() {
			wnd.hide();
			quickSpell = sp.getString("id", "");
			GLog.i("빠른 시전: " + sp.getString("name", ""));
			Item.updateQuickslot();
			return true;
		}
		@Override protected String hoverText() { return sp.getString("name", ""); }
	}

	/** 주문 정보 (영웅 창·주문 창에서) */
	public static class WndSpellInfo extends Window {
		public WndSpellInfo(final Hero hero, final JsonValue sp, boolean withUse) {
			int w = 120;
			Image ic = MakerSpells.icon(sp); ic.x = 0; ic.y = 0; add(ic);
			RenderedTextBlock t = PixelScene.renderTextBlock(sp.getString("name", "") + "  (" + tierOf(sp) + "단계)", 9);
			t.hardlight(TITLE_COLOR); t.setPos(20, (16 - t.height()) / 2f); add(t);
			RenderedTextBlock b = PixelScene.renderTextBlock(info(sp), 6);
			b.maxWidth(w); b.setPos(0, 20); add(b);
			float y = b.bottom() + 4;
			final String why = blocked(hero, sp);
			if (why != null) {
				RenderedTextBlock r = PixelScene.renderTextBlock("(" + why + ")", 6);
				r.hardlight(0xCC6666); r.setPos(0, y); add(r); y = r.bottom() + 4;
			}
			if (withUse) {
				RedButton use = new RedButton("시전") {
					@Override protected void onClick() { hide(); MakerTalentsPane.closeWindows(); MakerSpells.cast(hero, sp); }
				};
				use.enable(why == null);
				use.setRect(0, y, w, 18); add(use); y += 20;
			}
			resize(w, (int) y);
		}
	}

	// ------------------------------------------------------------ 저장

	static void store(Bundle b) {
		b.put("pdm_sp_c", charge); b.put("pdm_sp_p", partial); b.put("pdm_sp_q", quickSpell);
		b.put("pdm_sp_k", cooldowns.keySet().toArray(new String[0]));
		int[] v = new int[cooldowns.size()]; int i = 0; for (int x : cooldowns.values()) v[i++] = x;
		b.put("pdm_sp_v", v);
	}
	static boolean restore(Bundle b) {
		reset();
		String p = b.contains("pdm_sp_c") ? "pdm_sp_" : b.contains("pdm_sk_c") ? "pdm_sk_" : null;   // 예전 스킬 저장값도 읽음
		if (p == null) { fill(); return false; }
		charge = b.getInt(p + "c"); partial = b.getFloat(p + "p");
		if (b.contains("pdm_sp_q")) quickSpell = b.getString("pdm_sp_q");
		String[] k = b.getStringArray(p + "k"); int[] v = b.getIntArray(p + "v");
		for (int i = 0; k != null && v != null && i < k.length && i < v.length; i++) cooldowns.put(k[i], v[i]);
		return true;
	}
}
