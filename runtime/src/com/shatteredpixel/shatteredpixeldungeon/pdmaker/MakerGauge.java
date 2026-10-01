/*
 * 게이지 · 원소 — mod-2 아리아의 과열(actors/buffs/aria/NewOverHeat)을 데이터로 옮긴 것
 *   heroes/<id>.json 의 gauge:
 *     { enabled, name("과열"), max(100), buffIcon(BuffIndicator 번호),
 *       perTurn(항상 +), sameElement(원소를 바꾸지 않은 턴 +), afterUse(주문·능력·코덱스를 쓴 뒤 recentTurns 턴 동안 +), idle(그 밖의 턴 −), recentTurns(3),
 *       levels[{ at, name, effects[{stat, value}] }]         ← 게이지가 at 이상이면 그 단계 (가장 높은 것 하나)
 *       overflow{ enabled, delay(4), resetTo(60), effects[] } ← 최대치가 되면 delay 턴 뒤 폭주(멜트다운): 효과(MakerCast) 후 resetTo 로
 *       elements[{ id, name, color, icon(hero_icons), effects[{stat, value}], onSwitch[] }]  ← 원소(자세). 화면 오른쪽 행동 버튼으로 바꿈
 *       switchCool(바꿀 때 게이지 −%), switchCooldown(턴), replaceNative(["NewOverHeat"]) }
 *   게이지 변화: 주문·능력·코덱스의 heat, 효과 {type: gauge, amount}, 코드 MakerGauge.add(n)
 *   능력치(stat): damagePct · takenPct · castPct · codexPct · accuracy · evasion · armor · damage · speed … (HeroRuntime.bonus)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Image;
import com.watabou.noosa.Visual;
import com.watabou.utils.Bundle;

public class MakerGauge {

	static JsonValue def() { JsonValue h = HeroRuntime.data(); return h == null ? null : h.get("gauge"); }
	public static boolean enabled() { JsonValue g = def(); return g != null && g.getBoolean("enabled", false); }
	public static String name() { JsonValue g = def(); return g == null ? "게이지" : g.getString("name", "게이지"); }
	public static int max() { JsonValue g = def(); return g == null ? 100 : Math.max(1, g.getInt("max", 100)); }
	static Buf buf() { Hero h = Dungeon.hero; return h == null ? null : h.buff(Buf.class); }

	/** 게이지 값 (없으면 0) */
	public static int value() { Buf b = buf(); return b == null ? 0 : b.gauge; }
	public static String element() { Buf b = buf(); return b == null ? "" : b.element; }
	/** 게이지 늘리기/줄이기 (코드에서도) */
	public static void add(int n) { Buf b = buf(); if (b != null && n != 0) b.change(n); }
	public static void set(int n) { Buf b = buf(); if (b != null) { b.gauge = Math.max(0, Math.min(max(), n)); ActionIndicator.refresh(); } }
	/** 주문·능력·코덱스를 썼음 (afterUse) */
	public static void markUse() { Buf b = buf(); if (b != null) b.sinceUse = 0; }
	public static boolean setElement(String id) { Buf b = buf(); if (b == null || findElement(id) == null) return false; b.switchTo(id, false); return true; }

	static JsonValue findElement(String id) {
		JsonValue g = def(); if (g == null || g.get("elements") == null) return null;
		for (JsonValue e : g.get("elements")) if (e.getString("id", "").equals(id)) return e;
		return null;
	}
	/** 지금 단계 (없으면 null) */
	static JsonValue level() {
		JsonValue g = def(); Buf b = buf(); if (g == null || b == null || g.get("levels") == null) return null;
		JsonValue best = null;
		for (JsonValue l : g.get("levels")) if (b.gauge >= l.getInt("at", 0) && (best == null || l.getInt("at", 0) >= best.getInt("at", 0))) best = l;
		return best;
	}
	/** 단계·원소 효과의 능력치 합 */
	static int stat(String stat) {
		if (!enabled()) return 0;
		int sum = 0;
		JsonValue l = level(); if (l != null && l.get("effects") != null) for (JsonValue e : l.get("effects")) if (stat.equals(e.getString("stat", ""))) sum += e.getInt("value", 0);
		JsonValue el = findElement(element()); if (el != null && el.get("effects") != null) for (JsonValue e : el.get("effects")) if (stat.equals(e.getString("stat", ""))) sum += e.getInt("value", 0);
		return sum;
	}

	/** 새 게임·불러오기·층 입장: 켜져 있으면 버프를 붙이고 게임 원래 게이지(예: NewOverHeat)를 뗌 */
	static void attach(Hero hero) {
		if (hero == null) return;
		if (!enabled()) { Buf b = hero.buff(Buf.class); if (b != null) b.detach(); return; }
		JsonValue g = def();
		JsonValue rep = g.get("replaceNative");
		java.util.List<String> names = new java.util.ArrayList<>();
		if (rep == null) names.add("NewOverHeat"); else for (JsonValue r : rep) names.add(r.asString());
		for (Buff b : hero.buffs().toArray(new Buff[0])) if (names.contains(b.getClass().getSimpleName())) b.detach();
		Buf b = hero.buff(Buf.class);
		if (b == null) {
			b = Buff.affect(hero, Buf.class);
			JsonValue els = g.get("elements");
			if (els != null && els.size > 0) b.element = b.prevElement = els.get(0).getString("id", "");
		}
		ActionIndicator.setAction(b);
	}

	/** 영웅에게 붙는 게이지 버프 + 원소 바꾸기 행동 버튼 */
	public static class Buf extends Buff implements ActionIndicator.Action {
		{ type = buffType.NEUTRAL; revivePersists = true; }
		int gauge = 0, sinceUse = 99, meltdown = -1, switchCd = 0;
		String element = "", prevElement = "";

		void change(int n) {
			int before = gauge;
			gauge = Math.max(0, Math.min(max(), gauge + n));
			if (gauge >= max() && before < max()) startOverflow();
			ActionIndicator.refresh();
		}
		void startOverflow() {
			JsonValue g = def(); JsonValue o = g == null ? null : g.get("overflow");
			if (o == null || !o.getBoolean("enabled", true) || meltdown >= 0) return;
			meltdown = Math.max(0, o.getInt("delay", 4));
			if (target != null && target.sprite != null) target.sprite.showStatus(CharSprite.WARNING, name() + " 폭주!");
			MakerAudio.sysSfx(g.get("sounds"), "overflow", "gauge.overflow");
		}
		void overflow() {
			JsonValue g = def(); JsonValue o = g == null ? null : g.get("overflow");
			meltdown = -1;
			if (o == null) return;
			GLog.n(name() + "이(가) 폭주했다!");
			if (o.get("effects") != null && target instanceof Hero) {
				JsonValue d = new JsonValue(JsonValue.ValueType.object);
				d.addChild("id", new JsonValue("overflow"));
				d.addChild("effects", o.get("effects"));
				MakerCast.apply((Hero) target, d, target.pos);
			}
			gauge = Math.max(0, Math.min(max(), o.getInt("resetTo", 60)));
			ActionIndicator.refresh();
		}

		@Override public boolean act() {
			spend(TICK);
			JsonValue g = def();
			if (g == null || !enabled()) { detach(); return true; }
			if (switchCd > 0) switchCd--;
			if (meltdown >= 0) {
				if (meltdown == 0) overflow();
				else { if (target.sprite != null) target.sprite.showStatus(CharSprite.WARNING, Integer.toString(meltdown)); meltdown--; }
				return true;
			}
			int amt = g.getInt("perTurn", 0);
			if (!element.isEmpty() && element.equals(prevElement)) amt += g.getInt("sameElement", 0);
			if (sinceUse < g.getInt("recentTurns", 3)) amt += g.getInt("afterUse", 0); else amt -= g.getInt("idle", 0);
			sinceUse++;
			prevElement = element;
			if (amt != 0) change(amt);
			return true;
		}

		void switchTo(String id, boolean byPlayer) {
			JsonValue g = def(); JsonValue el = findElement(id);
			if (g == null || el == null || id.equals(element)) return;
			element = id;
			MakerAudio.sysSfx(g.get("sounds"), "switch", "gauge.switch");
			int cool = g.getInt("switchCool", 0);
			if (cool > 0) gauge = Math.max(0, gauge - Math.round(gauge * cool / 100f));
			if (byPlayer) switchCd = g.getInt("switchCooldown", 0);
			if (el.get("onSwitch") != null && target instanceof Hero) {
				JsonValue d = new JsonValue(JsonValue.ValueType.object);
				d.addChild("id", new JsonValue("element_" + id));
				d.addChild("effects", el.get("onSwitch"));
				MakerCast.apply((Hero) target, d, target.pos);
			}
			if (target != null && target.sprite != null) target.sprite.showStatus(CharSprite.NEUTRAL, el.getString("name", id));
			ActionIndicator.refresh();
			BuffIndicator.refreshHero();
		}

		// ---------- 버프 아이콘
		@Override public int icon() { JsonValue g = def(); return g == null ? BuffIndicator.NONE : g.getInt("buffIcon", BuffIndicator.FIRE); }
		@Override public void tintIcon(Image icon) {
			JsonValue el = findElement(element);
			if (el != null && el.has("color")) { int c = MakerTitle.color(el.getString("color", ""), 0xFFFFFF); icon.hardlight(c); }
		}
		@Override public float iconFadePercent() { return 1f - Math.min(1f, gauge / (float) max()); }
		@Override public String iconTextDisplay() { return Integer.toString(gauge); }
		@Override public String name() {
			JsonValue l = level(); JsonValue el = findElement(element);
			return MakerGauge.name() + (l != null ? " " + l.getString("name", "") : "") + (el != null ? " (" + el.getString("name", "") + ")" : "");
		}
		@Override public String desc() {
			StringBuilder sb = new StringBuilder(MakerGauge.name() + ": " + gauge + "/" + max());
			JsonValue el = findElement(element); if (el != null) sb.append("\n원소: ").append(el.getString("name", "")).append(el.has("desc") ? " — " + el.getString("desc", "") : "");
			JsonValue l = level(); if (l != null && l.has("desc")) sb.append("\n").append(l.getString("desc", ""));
			if (meltdown >= 0) sb.append("\n\n").append(meltdown + 1).append("턴 뒤 폭주!");
			return sb.toString();
		}

		// ---------- 행동 버튼 (원소 바꾸기)
		@Override public String actionName() { return "원소 바꾸기"; }
		@Override public int actionIcon() { JsonValue el = findElement(element); return el == null ? 0 : MakerSpells.iconOf(el, 0); }
		@Override public Visual secondaryVisual() {
			BitmapText t = new BitmapText(PixelScene.pixelFont);
			t.text(gauge + "/" + max());
			float k = gauge / (float) max();
			t.hardlight(meltdown >= 0 ? 0xEA265D : k < 0.25f ? 0x4DE1BC : k < 0.5f ? 0x4CD040 : k < 0.75f ? 0xD8DF46 : 0xD04540);
			t.scale.set(0.75f); t.measure();
			return t;
		}
		@Override public int indicatorColor() { JsonValue el = findElement(element); return el == null ? 0x888888 : MakerTitle.color(el.getString("color", ""), 0x888888); }
		@Override public void doAction() {
			final JsonValue g = def(); if (g == null || g.get("elements") == null || g.get("elements").size == 0) return;
			if (switchCd > 0) { GLog.w("아직 바꿀 수 없다 (" + switchCd + "턴)"); return; }
			final JsonValue els = g.get("elements");
			String[] opts = new String[els.size];
			for (int i = 0; i < els.size; i++) opts[i] = els.get(i).getString("name", "") + (els.get(i).getString("id", "").equals(element) ? " (지금)" : "");
			GameScene.show(new WndOptions(MakerSpells.heroIcon(actionIcon()), "원소 바꾸기", MakerGauge.name() + " " + gauge + "/" + max() + (g.getInt("switchCool", 0) > 0 ? "\n바꾸면 " + MakerGauge.name() + " −" + g.getInt("switchCool", 0) + "%" : ""), opts) {
				@Override protected void onSelect(int index) { switchTo(els.get(index).getString("id", ""), true); }
			});
		}

		@Override public void storeInBundle(Bundle b) {
			super.storeInBundle(b);
			b.put("gauge", gauge); b.put("sinceUse", sinceUse); b.put("meltdown", meltdown); b.put("switchCd", switchCd);
			b.put("element", element); b.put("prevElement", prevElement);
		}
		@Override public void restoreFromBundle(Bundle b) {
			super.restoreFromBundle(b);
			gauge = b.getInt("gauge"); sinceUse = b.getInt("sinceUse"); meltdown = b.getInt("meltdown"); switchCd = b.getInt("switchCd");
			element = b.getString("element"); prevElement = b.getString("prevElement");
			ActionIndicator.setAction(this);
		}
		@Override public void detach() { ActionIndicator.clearAction(this); super.detach(); }
	}
}
