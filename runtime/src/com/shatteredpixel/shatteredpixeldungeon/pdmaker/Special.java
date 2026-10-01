/*
 * 특수 기능 (영웅 코드용 도구) — 게이지·스택·충전·자세 같은 영웅만의 시스템을 코드로 만들 때 쓰는 부품.
 *   데이터 편집기로 정해 둔 기능이 아니라, 영웅 편집기 "코드" 칸에서 직접 조합합니다.
 *
 *   값 (게임에 저장됨)
 *     Special.get("heat")            값 읽기 (없으면 0)
 *     Special.set("heat", 50)        값 정하기
 *     Special.add("heat", 5)         더하기 (새 값을 돌려줌)
 *     Special.add("heat", 5, 0, 100) 더하되 0~100 안으로
 *
 *   화면 표시 — 버프 칸에 아이콘 + 숫자 (누르면 설명)
 *     Special.show("heat", "과열", BuffIndicator.FIRE, 100, "턴마다 오르고, 가득 차면 폭주한다.")
 *       → 아이콘 위에 값이 보이고, 최대값이 있으면 아이콘이 차오름 (0 = 최대 없음)
 *     Special.color("heat", 0xFF4400)  아이콘 색
 *     Special.hide("heat")
 *
 *   행동 버튼 — 게임 화면 오른쪽 (한 번에 하나)
 *     Special.button("vent", "냉각", HeroIcon.ENDURE)   → 누르면 (아이콘 = HeroIcon 번호 — 직업 능력·전직 아이콘) 영웅 코드의 onAction(hero, "vent")
 *     Special.removeButton("vent")
 *
 * 영웅이 바뀌거나 새 게임이면 모두 지워짐. 불러오기 하면 값·표시·버튼이 그대로 돌아옴.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.utils.Bundle;

import java.util.LinkedHashMap;
import java.util.Map;

public class Special {

	// ------------------------------------------------------------ 값

	static Store store() {
		Hero h = Dungeon.hero;
		if (h == null) return null;
		Store s = h.buff(Store.class);
		if (s == null) s = Buff.affect(h, Store.class);
		return s;
	}

	public static int get(String key) { Store s = store(); Integer v = s == null ? null : s.vals.get(key); return v == null ? 0 : v; }
	public static void set(String key, int value) {
		Store s = store(); if (s == null) return;
		s.vals.put(key, value);
		refresh();
	}
	public static int add(String key, int n) { set(key, get(key) + n); return get(key); }
	public static int add(String key, int n, int min, int max) { set(key, Math.max(min, Math.min(max, get(key) + n))); return get(key); }

	// ------------------------------------------------------------ 화면 표시 (버프 칸)

	public static void show(String key, String name, int icon, int max, String desc) {
		Hero h = Dungeon.hero; if (h == null) return;
		Bar b = bar(key);
		if (b == null) { b = new Bar(); b.key = key; b.attachTo(h); }
		b.label = name == null ? key : name; b.iconId = icon; b.max = Math.max(0, max); b.text = desc == null ? "" : desc;
		BuffIndicator.refreshHero();
	}
	public static void show(String key, String name, int icon, int max) { show(key, name, icon, max, ""); }
	public static void color(String key, int rgb) { Bar b = bar(key); if (b != null) { b.tint = rgb; BuffIndicator.refreshHero(); } }
	public static void hide(String key) { Bar b = bar(key); if (b != null) b.detach(); }

	static Bar bar(String key) {
		Hero h = Dungeon.hero; if (h == null) return null;
		for (Bar b : h.buffs(Bar.class)) if (b.key.equals(key)) return b;
		return null;
	}
	static void refresh() { try { BuffIndicator.refreshHero(); ActionIndicator.refresh(); } catch (Throwable ignored) { } }

	// ------------------------------------------------------------ 행동 버튼

	public static void button(String id, String label, int heroIcon) {
		Hero h = Dungeon.hero; if (h == null) return;
		Btn b = h.buff(Btn.class);
		if (b == null) b = Buff.affect(h, Btn.class);
		b.id = id; b.label = label == null ? id : label; b.iconId = heroIcon;
		final Btn fb = b;
		Game.runOnRenderThread(() -> ActionIndicator.setAction(fb));
	}
	public static void removeButton(String id) {
		Hero h = Dungeon.hero; if (h == null) return;
		Btn b = h.buff(Btn.class);
		if (b == null || !b.id.equals(id)) return;
		final Btn fb = b;
		Game.runOnRenderThread(() -> ActionIndicator.clearAction(fb));
		b.detach();
	}

	/** 새 게임: 앞 판의 값·표시·버튼 지우기 (HeroRuntime.afterInit) */
	static void reset(Hero hero) {
		if (hero == null) return;
		for (Buff b : hero.buffs()) if (b instanceof Store || b instanceof Bar || b instanceof Btn) b.detach();
	}

	// ------------------------------------------------------------ 버프 (저장되는 부분)

	/** 값 저장소 (보이지 않음) */
	public static class Store extends Buff {
		{ revivePersists = true; }
		final Map<String, Integer> vals = new LinkedHashMap<>();
		@Override public boolean act() { spend(TICK); return true; }
		@Override public void storeInBundle(Bundle b) {
			super.storeInBundle(b);
			String[] k = vals.keySet().toArray(new String[0]); int[] v = new int[k.length];
			for (int i = 0; i < k.length; i++) v[i] = vals.get(k[i]);
			b.put("keys", k); b.put("vals", v);
		}
		@Override public void restoreFromBundle(Bundle b) {
			super.restoreFromBundle(b);
			String[] k = b.getStringArray("keys"); int[] v = b.getIntArray("vals");
			if (k != null && v != null) for (int i = 0; i < k.length && i < v.length; i++) vals.put(k[i], v[i]);
		}
	}

	/** 버프 칸 표시 하나 */
	public static class Bar extends Buff {
		{ revivePersists = true; type = buffType.NEUTRAL; }
		String key = "", label = "", text = "";
		int iconId = BuffIndicator.UPGRADE, max = 0, tint = -1;
		@Override public boolean act() { spend(TICK); return true; }
		@Override public int icon() { return iconId; }
		@Override public void tintIcon(Image icon) { if (tint >= 0) icon.hardlight(tint); }
		@Override public float iconFadePercent() { return max <= 0 ? 0 : Math.max(0, Math.min(1, 1f - get(key) / (float) max)); }
		@Override public String iconTextDisplay() { return Integer.toString(get(key)); }
		@Override public String name() { return label; }
		@Override public String desc() { return (text.isEmpty() ? "" : text + "\n\n") + label + ": " + get(key) + (max > 0 ? " / " + max : ""); }
		@Override public void storeInBundle(Bundle b) {
			super.storeInBundle(b);
			b.put("key", key); b.put("label", label); b.put("text", text); b.put("icon", iconId); b.put("max", max); b.put("tint", tint);
		}
		@Override public void restoreFromBundle(Bundle b) {
			super.restoreFromBundle(b);
			key = b.getString("key"); label = b.getString("label"); text = b.getString("text");
			iconId = b.getInt("icon"); max = b.getInt("max"); tint = b.contains("tint") ? b.getInt("tint") : -1;
		}
	}

	/** 행동 버튼 → 영웅 코드 onAction(hero, id) */
	public static class Btn extends Buff implements ActionIndicator.Action {
		{ revivePersists = true; }
		String id = "", label = "";
		int iconId = 0;
		@Override public boolean act() { spend(TICK); return true; }
		@Override public String actionName() { return label; }
		@Override public int actionIcon() { return iconId; }
		@Override public int indicatorColor() { return 0x5A3A8C; }
		@Override public void doAction() {
			MakerHeroCode c = HeroRuntime.code();
			Hero h = Dungeon.hero;
			if (c == null || h == null) return;
			try { c.onAction(h, id); } catch (Throwable t) { GenSupport.error("영웅 " + HeroRuntime.heroId(), "onAction", t); }
			refresh();
		}
		@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("id", id); b.put("label", label); b.put("icon", iconId); }
		@Override public void restoreFromBundle(Bundle b) {
			super.restoreFromBundle(b);
			id = b.getString("id"); label = b.getString("label"); iconId = b.getInt("icon");
			final Btn fb = this;
			Game.runOnRenderThread(() -> ActionIndicator.setAction(fb));
		}
	}
}
