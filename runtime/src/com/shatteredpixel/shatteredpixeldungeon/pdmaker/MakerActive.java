/*
 * 전직 액티브 — 전직(subclass)에 붙는 "행동 버튼" 기술
 *   subclass.active = { enabled, name, icon, desc, message, color,
 *                       trigger: kill(적 처치) · hit(공격 적중) · damaged(피격) · lowHp(체력 낮음) · always(항상) · code(코드로만),
 *                       need(몇 번 채우면), hpPct(lowHp 기준 %), window(준비 뒤 쓸 수 있는 턴, 0 = 쓸 때까지), cooldown(쓴 뒤 대기 턴),
 *                       target · range · sound · hitSound · time · effects[] (주문·직업 능력과 같은 효과 — code 효과 포함) }
 *   조건을 채우면 게임 화면 오른쪽의 행동 버튼(ActionIndicator)이 켜지고, 누르면 효과가 나감.
 *   영웅 코드에서: MakerActive.ready() 준비 · MakerActive.isReady() · MakerActive.use() 바로 쓰기 · MakerActive.add(n) 진행 +n
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.watabou.noosa.Image;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Game;
import com.watabou.noosa.Visual;
import com.watabou.utils.Bundle;

public class MakerActive {

	/** 지금 전직의 액티브 정의 (없으면 null) */
	static JsonValue def() {
		String sc = MakerAbilities.subclassId();
		if (sc == null || sc.isEmpty()) return null;
		JsonValue s = MakerAbilities.find("subclasses", sc);
		JsonValue a = s == null ? null : s.get("active");
		if (a == null || !a.getBoolean("enabled", false)) return null;
		if (!a.has("id")) a.addChild("id", new JsonValue("active_" + sc));   // 효과 코드(case "active_<전직>#n") 이름
		return a;
	}
	static Buf buf() { Hero h = Dungeon.hero; return h == null ? null : h.buff(Buf.class); }

	/** 전직했을 때 · 층에 들어올 때 */
	public static void attach(Hero hero) {
		if (hero == null) return;
		if (def() == null) { Buf b = hero.buff(Buf.class); if (b != null) b.detach(); return; }
		if (hero.buff(Buf.class) == null) Buff.affect(hero, Buf.class);
		Buf b = hero.buff(Buf.class);
		if (b != null && b.ready) setAction(b);
	}
	/** 조건 알림 (HeroRuntime 에서): kill · hit · damaged */
	public static void trigger(String what) {
		JsonValue a = def(); if (a == null) return;
		String t = a.getString("trigger", "kill");
		if (!t.equals(what)) return;
		Buf b = buf(); if (b == null) { attach(Dungeon.hero); b = buf(); }
		if (b != null) b.progress(1);
	}
	static void onKill(Mob mob, Object cause) {
		if (Dungeon.hero == null || mob.alignment != Char.Alignment.ENEMY) return;
		if (cause != Dungeon.hero && !(cause instanceof com.shatteredpixel.shatteredpixeldungeon.items.Item)) return;
		trigger("kill");
	}

	// ---------- 영웅 코드에서 쓰는 도우미
	public static void ready() { Buf b = buf(); if (b == null) { attach(Dungeon.hero); b = buf(); } if (b != null) b.makeReady(); }
	public static boolean isReady() { Buf b = buf(); return b != null && b.ready; }
	public static void add(int n) { Buf b = buf(); if (b == null) { attach(Dungeon.hero); b = buf(); } if (b != null) b.progress(n); }
	public static void use() { Buf b = buf(); if (b != null && b.ready) b.doAction(); }

	static void setAction(Buf b) { Game.runOnRenderThread(() -> ActionIndicator.setAction(b)); }
	static void clearAction(Buf b) {
		Game.runOnRenderThread(() -> {
			ActionIndicator.clearAction(b);
			MakerGauge.Buf g = MakerGauge.buf();   // 게이지(원소 바꾸기) 버튼이 있으면 되돌림
			if (g != null) ActionIndicator.setAction(g);
		});
	}

	public static class Buf extends Buff implements ActionIndicator.Action {
		{ revivePersists = true; }
		int count = 0, readyLeft = -1, cooldown = 0;
		boolean ready = false;

		JsonValue d() { return def(); }

		void progress(int n) {
			JsonValue a = d(); if (a == null || ready || cooldown > 0) return;
			count += n;
			if (count >= Math.max(1, a.getInt("need", 1))) makeReady();
		}
		void makeReady() {
			JsonValue a = d(); if (a == null || ready) return;
			ready = true; count = 0;
			int w = a.getInt("window", 0);
			readyLeft = w > 0 ? w : -1;
			String msg = a.getString("message", "");
			GLog.p(msg.isEmpty() ? "「" + a.getString("name", "액티브") + "」 준비!" : msg);
			String snd = a.getString("readySound", "");
			if (!snd.isEmpty()) MakerAudio.playSe(snd);
			setAction(this);
		}
		void consume() {
			JsonValue a = d();
			ready = false; readyLeft = -1; count = 0;
			cooldown = a == null ? 0 : Math.max(0, a.getInt("cooldown", 0));
			clearAction(this);
		}

		@Override public boolean act() {
			JsonValue a = d();
			if (a == null) { detach(); return true; }
			if (cooldown > 0) cooldown--;
			if (ready && readyLeft > 0 && --readyLeft == 0) { ready = false; readyLeft = -1; clearAction(this); GLog.w("「" + a.getString("name", "액티브") + "」 준비가 풀렸다."); }
			String t = a.getString("trigger", "kill");
			if (!ready && cooldown <= 0) {
				if (t.equals("always")) makeReady();
				else if (t.equals("lowHp") && target.HP * 100 <= target.HT * Math.max(1, a.getInt("hpPct", 30))) makeReady();
			}
			spend(TICK);
			return true;
		}

		// ---------- 버프 아이콘 (준비됐거나 대기 중일 때만)
		@Override public int icon() { return ready || cooldown > 0 ? BuffIndicator.UPGRADE : BuffIndicator.NONE; }
		@Override public void tintIcon(com.watabou.noosa.Image icon) { icon.hardlight(ready ? 0xFFB35C : 0x888888); }
		public String iconTextDisplay() { return ready ? (readyLeft > 0 ? Integer.toString(readyLeft) : "") : cooldown > 0 ? Integer.toString(cooldown) : ""; }
		public String name() { JsonValue a = d(); return a == null ? "액티브" : a.getString("name", "액티브"); }
		@Override public String desc() {
			JsonValue a = d(); if (a == null) return "";
			StringBuilder sb = new StringBuilder(a.getString("desc", ""));
			if (ready) sb.append(sb.length() > 0 ? "\n\n" : "").append("준비됨").append(readyLeft > 0 ? " (" + readyLeft + "턴 남음)" : "").append(" — 오른쪽 행동 버튼을 누르세요.");
			else if (cooldown > 0) sb.append(sb.length() > 0 ? "\n\n" : "").append(cooldown).append("턴 뒤 다시 준비할 수 있다.");
			return sb.toString();
		}

		// ---------- 행동 버튼
		public String actionName() { return name(); }
		public int actionIcon() { JsonValue a = d(); return a == null ? 0 : MakerSpells.iconOf(a, 0); }
		public Visual secondaryVisual() {
			if (readyLeft <= 0) return null;
			BitmapText t = new BitmapText(PixelScene.pixelFont); t.text(Integer.toString(readyLeft)); t.hardlight(0xFFB35C); t.scale.set(0.75f); t.measure();
			return t;
		}
		public int indicatorColor() { JsonValue a = d(); return a == null ? 0xFFB35C : MakerTitle.color(a.getString("color", ""), 0xFFB35C); }
		/** 예전 판 행동 버튼(ActionIndicator.Action.getIcon) — 새 판에서는 쓰지 않음 */
		public Image getIcon() { return MakerSpells.heroIcon(actionIcon()); }
		@Override public void doAction() {
			final JsonValue a = d(); final Hero hero = Dungeon.hero;
			if (a == null || !ready || hero == null) return;
			MakerCast.cast(hero, a, cell -> consume(), "ability");
		}

		@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("count", count); b.put("readyLeft", readyLeft); b.put("cooldown", cooldown); b.put("ready", ready); }
		@Override public void restoreFromBundle(Bundle b) {
			super.restoreFromBundle(b);
			count = b.getInt("count"); readyLeft = b.getInt("readyLeft"); cooldown = b.getInt("cooldown"); ready = b.getBoolean("ready");
			if (ready) ActionIndicator.setAction(this);
		}
		@Override public void detach() { ActionIndicator.clearAction(this); super.detach(); }
	}
}
