/*
 * PDMaker — 아이템의 추가 기능 (한 아이템에 종류를 여러 개): 어떤 종류의 아이템이든(무기 · 갑옷 · 일반 · 게임 아이템 상속 …) 덧붙임
 *   items/<id>.json (게임 아이템은 gameitems.json items["spd:…"]) 의
 *     useFx   { on, label, effects:[MakerCast 효과], consume, time, sound, fx }        "사용" — 영웅 자신 · 영웅 칸 둘레에 효과 (일반 아이템은 "사용" 버튼에 합쳐짐)
 *     throwFx { on, effects, consume(true), fuse(0 = 바로), sound, fx, when }         던져서 떨어진 칸에서 효과 (물약 깨짐 · 폭탄 · 룬석)
 *             투척 무기: 원래 규칙(맞히기 · 바닥에 남기)은 그대로, 그 칸에서 효과만 더함 — when "always"(맞히든 빗나가든) | "hit"(맞혔을 때만); consume · fuse 는 안 씀
 *             퓨즈가 타는 중인 폭탄은 저장됨(pdm_fuse — 남은 턴) → 불러오거나 층에 돌아오면 이어서 탐 (Actor.init 연결 줄)
 *     bagFx   { on, capacity, holds, categories, items, tags, openLabel, putLabel }   가방 기능: "넣기"로 담고 "열기"에서 바로 쓰거나 "꺼내기"
 *             안에 든 아이템도 가방 속 아이템처럼 그 자리에서 사용 · 장착 · 던지기 가능 (Item.detachAll 연결 줄이 이 가방에서도 빼냄)
 *   연결 줄 (Item.java): actions(MakerItem.flagActions 에서 이어 부름) · actionName · execute · onThrow · detachAll · storeInBundle · restoreFromBundle
 *           (MissileWeapon.rangedHit · Actor.init)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndBag;
import com.watabou.utils.Bundlable;
import com.watabou.utils.Bundle;

import java.util.ArrayList;
import java.util.Map;
import java.util.WeakHashMap;

public class MakerFacets {

	public static final String AC_FXUSE = "PDM_FXUSE", AC_BAG_OPEN = "PDM_BAG_OPEN", AC_BAG_PUT = "PDM_BAG_PUT", AC_BAG_TAKE = "PDM_BAG_TAKE";

	static JsonValue facet(Item it, String k) {
		JsonValue d = MakerItem.flagsOf(it), f = d == null ? null : d.get(k);
		return f != null && f.getBoolean("on", false) ? f : null;
	}

	// ------------------------------------------------------------ 버튼

	/** Item.actions (flagActions 에서) */
	static void addActions(Item it, ArrayList<String> a) {
		if (!(it instanceof MakerItem) && facet(it, "useFx") != null) a.add(AC_FXUSE);   // 일반 아이템은 "사용"에 합쳐짐
		if (facet(it, "bagFx") != null) { a.add(AC_BAG_OPEN); a.add(AC_BAG_PUT); }
		if (holder(it) != null) a.add(AC_BAG_TAKE);
	}
	/** Item.actionName 연결 줄 — null 이면 원래 이름 */
	public static String actionName(Item it, String action) {
		try {
			if (AC_FXUSE.equals(action)) { JsonValue f = facet(it, "useFx"); String l = f == null ? "" : f.getString("label", ""); return l.isEmpty() ? "사용" : l; }
			if (AC_BAG_OPEN.equals(action)) { JsonValue f = facet(it, "bagFx"); String l = f == null ? "" : f.getString("openLabel", ""); return (l.isEmpty() ? "열기" : l) + " (" + inner(it).items.size() + "/" + inner(it).capacity() + ")"; }
			if (AC_BAG_PUT.equals(action)) { JsonValue f = facet(it, "bagFx"); String l = f == null ? "" : f.getString("putLabel", ""); return l.isEmpty() ? "넣기" : l; }
			if (AC_BAG_TAKE.equals(action)) return "꺼내기";
		} catch (Throwable t) { MakerRuntime.log("아이템 추가 기능 오류: " + t); }
		return null;
	}
	/** Item.execute 연결 줄 — 처리했으면 true */
	public static boolean execute(final Item it, final Hero hero, String action) {
		try {
			if (AC_FXUSE.equals(action)) { JsonValue f = facet(it, "useFx"); if (f == null) return true; use(it, hero, f); return true; }
			if (AC_BAG_OPEN.equals(action)) { openBag(it, hero); return true; }
			if (AC_BAG_PUT.equals(action)) { putBag(it, hero); return true; }
			if (AC_BAG_TAKE.equals(action)) { takeOut(it, hero); return true; }
		} catch (Throwable t) { MakerRuntime.log("아이템 추가 기능 오류: " + t); return true; }
		return false;
	}

	// ------------------------------------------------------------ 사용 효과

	static void use(Item it, Hero hero, JsonValue f) {
		if (f.getBoolean("consume", false)) it.detach(hero.belongings.backpack);
		applyUse(hero, f);
		hero.spend(Math.max(0f, f.getFloat("time", 1f))); hero.busy(); hero.next();
	}
	/** 영웅에게 (일반 아이템의 "사용" 에서도 부름) */
	public static void applyUse(Hero hero, JsonValue f) {
		String s = f.getString("sound", ""); if (!s.isEmpty()) MakerAudio.playSe(s);
		String fx = f.getString("fx", ""); if (!fx.isEmpty()) MakerEffect.playOn(fx, hero);
		if (hero.sprite != null) hero.sprite.operate(hero.pos);
		MakerCast.apply(hero, f, hero.pos, f.getString("hitSound", ""));
	}
	/** 일반 아이템의 useFx (MakerItem 의 "사용") */
	static JsonValue useFx(JsonValue d) { JsonValue f = d == null ? null : d.get("useFx"); return f != null && f.getBoolean("on", false) ? f : null; }

	// ------------------------------------------------------------ 던지기 효과

	/** Item.onThrow 연결 줄 — 처리했으면 true (원래처럼 바닥에 떨어지지 않음) */
	public static boolean onThrow(final Item it, final int cell) {
		try {
			final JsonValue f = facet(it, "throwFx");
			if (f == null) return false;
			if (it instanceof MissileWeapon) {   // 빗나가거나 바닥에 떨어짐 (맞힘은 rangedHit 연결 줄) — 원래처럼 바닥에 남김
				if (!"hit".equals(f.getString("when", "always")) && !((MissileWeapon) it).spawnedForEffect) trigger(f, cell);
				return false;
			}
			final boolean consume = f.getBoolean("consume", true);
			int fuse = Math.max(0, f.getInt("fuse", 0));
			if (fuse <= 0) {
				trigger(f, cell);
				if (!consume) drop(it, cell);
				return true;
			}
			// 퓨즈: 바닥에 놓였다가 fuse 턴 뒤 그 자리(주워 가면 터지지 않음)에서
			final Heap heap = drop(it, cell);
			if (heap != null && heap.sprite != null) MakerEffect.playAt(f.getString("fuseFx", ""), cell);
			light(it, cell, fuse);
			return true;
		} catch (Throwable t) { MakerRuntime.log("던지기 효과 오류: " + t); return false; }
	}
	/** MissileWeapon.rangedHit 연결 줄 — 투척 무기가 맞혔을 때 그 칸에서 던지기 효과 */
	public static void missileHit(MissileWeapon m, int cell) {
		try {
			JsonValue f = facet(m, "throwFx");
			if (f != null && !m.spawnedForEffect) trigger(f, cell);
		} catch (Throwable t) { MakerRuntime.log("던지기 효과 오류: " + t); }
	}

	// 퓨즈 (바닥의 아이템 → 타는 중인 퓨즈). 저장할 때 남은 턴을 pdm_fuse 로, 불러온 뒤엔 fuseLeft 에 두었다가 Actor.init 에서 다시 붙임
	private static final Map<Item, Fuse> fuses = new WeakHashMap<>();
	private static final Map<Item, Float> fuseLeft = new WeakHashMap<>();
	static class Fuse extends Actor {
		final Item it; final int cell;
		Fuse(Item it, int cell) { this.it = it; this.cell = cell; actPriority = BUFF_PRIO; }
		float left() { return cooldown(); }
		@Override protected boolean act() {
			Actor.remove(this);
			fuses.remove(it);
			Heap h = Dungeon.level == null ? null : Dungeon.level.heaps.get(cell);
			JsonValue f = facet(it, "throwFx");
			if (f != null && h != null && h.items.contains(it)) {   // 주워 갔으면 터지지 않음
				if (f.getBoolean("consume", true)) h.remove(it);
				trigger(f, cell);
			}
			return true;
		}
	}
	static void light(Item it, int cell, float turns) {
		Fuse old = fuses.remove(it); if (old != null) Actor.remove(old);
		Fuse a = new Fuse(it, cell); fuses.put(it, a);
		Actor.addDelayed(a, Math.max(0f, turns));
	}
	/** Actor.init 연결 줄 — 층을 불러왔을 때 바닥에서 타던 퓨즈를 다시 붙임 */
	public static void reviveFuses() {
		try {
			if (Dungeon.level == null || fuseLeft.isEmpty() && fuses.isEmpty()) return;
			for (Heap h : Dungeon.level.heaps.valueList()) for (Item i : h.items) {
				Float left = fuseLeft.remove(i);
				Fuse cur = fuses.get(i);
				if (left == null && cur != null && !Actor.all().contains(cur)) left = 0f;   // 같은 아이템 객체가 남아 있는데 Actor.clear 로 지워짐
				if (left != null) light(i, h.pos, left);
			}
		} catch (Throwable t) { MakerRuntime.log("퓨즈 다시 붙이기 오류: " + t); }
	}
	static Heap drop(Item it, int cell) { Heap h = Dungeon.level.drop(it, cell); if (h != null && h.sprite != null && !h.isEmpty()) h.sprite.drop(cell); return h; }
	static void trigger(JsonValue f, int cell) {
		String s = f.getString("sound", ""); if (!s.isEmpty()) MakerAudio.playSe(s);
		String fx = f.getString("fx", ""); if (!fx.isEmpty()) MakerEffect.playAt(fx, cell);
		if (Dungeon.hero != null) MakerCast.apply(Dungeon.hero, f, cell, f.getString("hitSound", ""));
	}

	// ------------------------------------------------------------ 가방 기능

	private static final Map<Item, Inner> inners = new WeakHashMap<>();
	public static Inner inner(Item it) { return inners.computeIfAbsent(it, Inner::new); }
	/** 아이템 안의 가방 (가방 목록 창에는 오르지 않음 — "열기"로만) */
	public static class Inner extends Bag {
		final Item host;
		public Inner() { host = null; }
		Inner(Item host) { this.host = host; }
		JsonValue cfg() { JsonValue f = facet(host, "bagFx"); return f == null ? new JsonValue(JsonValue.ValueType.object) : f; }
		@Override public int capacity() { return Math.max(1, Math.min(60, cfg().getInt("capacity", 10))); }
		@Override public boolean canHold(Item item) { return item != host && MakerBag.accepts(cfg(), item) && super.canHold(item); }
		@Override public String name() { return host == null ? "가방" : host.name(); }
	}
	static void openBag(final Item it, final Hero hero) {
		final Inner b = inner(it);
		if (b.items.isEmpty()) { GLog.i(it.name() + ": 비어 있다."); return; }
		GameScene.show(new WndBag(b));   // 보통 가방 창 — 아이템을 누르면 그 자리에서 쓰기 · 장착 · "꺼내기"
	}
	/** 이 아이템을 담고 있는 가방 기능 (없으면 null) */
	public static Inner holder(Item it) {
		if (it == null || inners.isEmpty()) return null;
		for (Inner in : inners.values()) if (in.items.contains(it)) return in;
		return null;
	}
	/** Item.detachAll 연결 줄 — 그 가방에 없는데 가방 기능 안에 있으면 그곳에서 빼냄 (안에 든 채로 사용 · 장착 · 던지기) */
	public static Bag detachFrom(Item it, Bag container) {
		try {
			if (container == null || container instanceof Inner || inners.isEmpty() || container.contains(it)) return container;
			Inner in = holder(it);
			return in != null ? in : container;
		} catch (Throwable t) { return container; }
	}
	static void takeOut(Item item, Hero hero) {
		Inner b = holder(item);
		if (b == null) return;
		b.items.remove(item);
		com.shatteredpixel.shatteredpixeldungeon.Dungeon.quickslot.clearItem(item);
		if (!item.collect(hero.belongings.backpack)) { Dungeon.level.drop(item, hero.pos).sprite.drop(); GLog.w("가방이 가득 차서 바닥에 놓았다."); }
		else GLog.i(item.name() + " 을(를) 꺼냈다.");
	}
	static void putBag(final Item it, final Hero hero) {
		final Inner b = inner(it);
		GameScene.selectItem(new WndBag.ItemSelector() {
			@Override public String textPrompt() { return it.name() + " 에 넣을 아이템"; }
			@Override public boolean itemSelectable(Item item) { return item != it && !(item instanceof Bag) && !item.isEquipped(hero) && b.canHold(item); }
			@Override public void onSelect(Item item) {
				if (item == null || item == it) return;
				if (!b.canHold(item)) { GLog.w("넣을 수 없다."); return; }
				Item moved = item.detachAll(hero.belongings.backpack);
				if (moved == null) return;
				if (!moved.collect(b)) { moved.collect(hero.belongings.backpack); GLog.w("가득 찼다."); return; }
				GLog.i(moved.name() + " 을(를) 넣었다.");
			}
		});
	}

	// ------------------------------------------------------------ 저장 (Item.storeInBundle · restoreFromBundle 연결 줄)

	public static void store(Item it, Bundle b) {
		Inner in = inners.get(it);
		if (in != null && !in.items.isEmpty()) b.put("pdm_inner", in.items);
		Fuse fz = fuses.get(it);
		if (fz != null) {   // 아직 그 칸 바닥에 있을 때만 (주워 갔으면 꺼진 퓨즈)
			Heap h = Dungeon.level == null ? null : Dungeon.level.heaps.get(fz.cell);
			if (h != null && h.items.contains(it)) b.put("pdm_fuse", Math.max(0f, fz.left()));
		}
		else { Float l = fuseLeft.get(it); if (l != null) b.put("pdm_fuse", l); }
	}
	public static void restore(Item it, Bundle b) {
		if (b.contains("pdm_fuse")) fuseLeft.put(it, b.getFloat("pdm_fuse"));
		if (!b.contains("pdm_inner")) return;
		Inner in = inner(it); in.items.clear();
		for (Bundlable x : b.getCollection("pdm_inner")) if (x instanceof Item) in.items.add((Item) x);
	}
}
