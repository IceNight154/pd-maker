/*
 * 시전 엔진 — 주문(MakerSpells) · 직업 능력(MakerAbilities) · 코덱스(MakerCodex) · 과열 폭주(MakerGauge) 가 함께 씀
 *   정의(JSON): target(self|enemy|ally|cell|adjacent) · range · projectile · visual · time · shout · sound · hitSound · heat · effects[]
 *   효과: damage · heal · shield · buff · knockback · blink · summon · event · heart · code
 *     on: target(고른 칸의 캐릭터) · self · area(반경 안의 적) — radius
 *   수치 보정: 특성 효과 {type: spell, spell: <id|*>, field, perPoint} (예전 skill 도 읽음)
 *   피해 배율: castPct (특성·전직·과열 단계·원소의 "주문 피해 %")
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FlavourBuff;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.effects.MagicMissile;
import com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfTeleportation;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.MissileSprite;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.utils.Callback;
import com.watabou.utils.PathFinder;
import com.watabou.utils.Random;

import java.util.ArrayList;

public class MakerCast {

	/** 시전 결과를 받을 곳 (null 가능). cell = 실제로 효과가 난 칸 */
	public interface Done { void done(int cell); }

	// ------------------------------------------------------------ 수치

	/** 정의 값 + 특성 보정 (0 이상) */
	public static int val(JsonValue def, String field, int d) { return Math.max(0, def.getInt(field, d) + MakerTalents.mod(def.getString("id", ""), field)); }
	static int efInt(JsonValue def, JsonValue e, String key, String field, int d) { return Math.max(0, e.getInt(key, d) + MakerTalents.mod(def.getString("id", ""), field)); }

	static int missile(String vis) {
		switch (vis) {
			case "fire": return MagicMissile.FIRE;
			case "frost": return MagicMissile.FROST;
			case "earth": return MagicMissile.EARTH;
			case "shadow": return MagicMissile.SHADOW;
			case "light": return MagicMissile.LIGHT_MISSILE;
			case "poison": return MagicMissile.POISON;
			case "foliage": return MagicMissile.FOLIAGE;
			case "force": return MagicMissile.FORCE;
			case "rainbow": return MagicMissile.RAINBOW;
			default: return MagicMissile.MAGIC_MISSILE;
		}
	}

	/** 게임 버프 이름 (에디터 PDM.SPD_BUFFS 와 같음) */
	static String buffName(String b) {
		switch (b) {
			case "Burning": return "불붙음"; case "Chill": return "냉기"; case "Frost": return "빙결"; case "Paralysis": return "마비"; case "Poison": return "독";
			case "Bleeding": return "출혈"; case "Cripple": return "절름"; case "Blindness": return "실명"; case "Weakness": return "약화"; case "Vulnerable": return "취약";
			case "Charm": return "매혹"; case "Terror": return "공포"; case "Slow": return "느려짐"; case "Roots": return "속박"; case "Haste": return "가속";
			case "Invisibility": return "투명"; case "Bless": return "축복"; case "Adrenaline": return "아드레날린"; case "MindVision": return "마음의 눈";
			case "Levitation": return "부양"; case "Recharging": return "재충전"; case "Barkskin": return "나무껍질";
			default: return b;
		}
	}
	/** 게임 안 설명: 설명 + 사거리 + 효과 요약 (cost 줄은 부르는 쪽이 붙임) */
	public static String effectsInfo(JsonValue def) {
		StringBuilder b = new StringBuilder();
		if (val(def, "range", 0) > 0) b.append("사거리 ").append(val(def, "range", 0));
		if (def.getInt("heat", 0) != 0 && MakerGauge.enabled()) b.append(b.length() > 0 ? " · " : "").append(MakerGauge.name()).append(" ").append(def.getInt("heat", 0) > 0 ? "+" : "").append(def.getInt("heat", 0));
		if (def.get("effects") != null) for (JsonValue e : def.get("effects")) {
			String t = e.getString("type", ""); int ch = e.getInt("chance", 100);
			String x = null;
			switch (t) {
				case "damage": { int d = MakerTalents.mod(def.getString("id", ""), "damage"); x = "피해 " + (e.getInt("min", 1) + d) + "~" + (e.getInt("max", 4) + d); break; }
				case "heal": x = "회복 " + efInt(def, e, "amount", "amount", 0) + (e.getInt("percent", 0) > 0 ? " + " + e.getInt("percent", 0) + "%" : ""); break;
				case "shield": x = "보호막 " + efInt(def, e, "amount", "amount", 5); break;
				case "buff": x = buffName(e.getString("buff", "")) + " " + efInt(def, e, "turns", "turns", 5) + "턴"; break;
				case "summon": x = "소환 ×" + Math.max(1, efInt(def, e, "count", "count", 1)); break;
				case "knockback": x = "밀치기 " + efInt(def, e, "power", "power", 2); break;
				case "blink": x = "순간이동"; break;
				case "gauge": x = MakerGauge.name() + " " + (e.getInt("amount", 0) > 0 ? "+" : "") + e.getInt("amount", 0); break;
			}
			if (x != null) b.append("\n- ").append(x).append(ch < 100 ? " (" + ch + "%)" : "");
		}
		return b.toString();
	}

	// ------------------------------------------------------------ 대상 고르기 → 실행

	/** 대상을 고르게 한 뒤(필요하면) perform. 고르기를 취소하면 아무것도 안 함 */
	public static void cast(final Hero hero, final JsonValue def, final Done done) { cast(hero, def, done, "spell"); }
	/** kind: 효과음 설정 종류 (spell · ability) — 정의에 sound/hitSound 가 비어 있으면 게임 효과음 설정의 kind.cast / kind.hit */
	public static void cast(final Hero hero, final JsonValue def, final Done done, final String kind) {
		final String target = def.getString("target", "self");
		if (target.equals("self")) { perform(hero, def, hero.pos, done, kind); return; }
		GameScene.selectCell(new CellSelector.Listener() {
			@Override public void onSelect(Integer cell) {
				if (cell == null) return;
				if (!check(hero, def, cell)) return;
				perform(hero, def, cell, done, kind);
			}
			@Override public String prompt() { return def.getString("name", "") + ": 대상을 고르세요"; }
		});
	}
	/** 고른 칸이 맞는지 (틀리면 메시지 후 false) */
	public static boolean check(Hero hero, JsonValue def, int cell) {
		String target = def.getString("target", "self");
		int range = val(def, "range", 0);
		if (target.equals("adjacent")) range = 1;
		if (range > 0 && Dungeon.level.distance(hero.pos, cell) > range) { GLog.w("너무 멀다."); return false; }
		Char c = Actor.findChar(cell);
		if ((target.equals("enemy") || target.equals("adjacent")) && !(c instanceof Mob && c.alignment != Char.Alignment.ALLY)) { GLog.w("적을 골라야 한다."); return false; }
		if (target.equals("ally") && !(c != null && (c == hero || c.alignment == Char.Alignment.ALLY))) { GLog.w("아군을 골라야 한다."); return false; }
		return true;
	}

	/** 소리·날아가는 효과·효과 적용·시간 소모 */
	public static void perform(final Hero hero, final JsonValue def, int cell, final Done done) { perform(hero, def, cell, done, "spell"); }
	public static void perform(final Hero hero, final JsonValue def, int cell, final Done done, String kind) {
		String snd = def.getString("sound", "");
		if (snd.isEmpty()) snd = "sfx:" + def.getString("sfxUse", kind + ".cast");
		MakerAudio.playSe(snd);
		final String hitSnd = def.getString("hitSound", "").isEmpty() ? "sfx:" + def.getString("sfxHit", kind + ".hit") : def.getString("hitSound", "");
		String vis = def.getString("visual", "");
		String target = def.getString("target", "self");
		boolean bolt = !target.equals("self") && !target.equals("adjacent") && def.getBoolean("projectile", true);
		final int to = bolt ? new Ballistica(hero.pos, cell, Ballistica.MAGIC_BOLT).collisionPos : cell;
		final float time = def.getFloat("time", 1f);
		hero.busy();
		String say = def.getString("shout", "");
		if (!say.isEmpty()) { JsonValue hd = HeroRuntime.data(); GLog.i("%s: \"%s\"", hd != null ? hd.getString("name", hero.name()) : hero.name(), say); }
		if (def.getInt("heat", 0) != 0) MakerGauge.add(def.getInt("heat", 0));
		final int hits = Math.max(1, Math.min(10, def.getInt("hits", 1)));
		final int missileImg = def.getInt("missileImage", -1);
		if (bolt && missileImg >= 0 && hero.sprite != null && hero.sprite.parent != null) {
			// 코덱스 그림이 날아감 (mod-2 RangedCodex 처럼 magicImage 를 던짐)
			hero.sprite.zap(to);
			Item proxy = def.getBoolean("missileSpin", false) ? new Item() : new com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.darts.Dart();
			proxy.image = missileImg;
			((MissileSprite) hero.sprite.parent.recycle(MissileSprite.class)).reset(hero.sprite, to, proxy, new Callback() {
				@Override public void call() { applyHits(hero, def, to, hitSnd, hits, () -> finish(hero, time, to, done)); }
			});
		} else if (bolt && !vis.equals("none") && hero.sprite != null) {   // "item" 인데 그림이 없으면(원작 저장소) 마법 화살로
			hero.sprite.zap(to);
			MagicMissile.boltFromChar(hero.sprite.parent, missile(vis), hero.sprite, to, new Callback() {
				@Override public void call() { applyHits(hero, def, to, hitSnd, hits, () -> finish(hero, time, to, done)); }
			});
		} else {
			// 근접·자신: 영웅 시전 동작 (attack 은 영웅의 일반 공격을 한 번 더 부르므로 zap)
			if (hero.sprite != null) { if (target.equals("self")) hero.sprite.operate(hero.pos); else hero.sprite.zap(to); }
			applyHits(hero, def, to, hitSnd, hits, () -> finish(hero, time, to, done));
		}
	}

	/** 효과를 hits 번 (두 번째부터 hitDelay 초 간격, mod-2 MagicBullet·MagicSlash 처럼) — 근접 애니메이션도 매번 */
	static void applyHits(final Hero hero, final JsonValue def, final int to, final String hitSnd, final int hits, final Runnable then) {
		meleeAnim(hero, def, to, 0);
		apply(hero, def, to, hitSnd);
		if (hits <= 1 || hero.sprite == null || hero.sprite.parent == null) { then.run(); return; }
		final float delay = Math.max(0.02f, def.getFloat("hitDelay", 0.1f));
		hero.busy();
		for (int i = 1; i < hits; i++) {
			final int k = i;
			hero.sprite.parent.add(new com.watabou.noosa.tweeners.Tweener(hero.sprite.parent, delay * i) {
				@Override protected void updateValues(float progress) { }
				@Override protected void onComplete() {
					super.onComplete();
					Char c = Actor.findChar(to);
					if (c == null || !c.isAlive()) { if (k == hits - 1) then.run(); return; }
					meleeAnim(hero, def, to, k);
					apply(hero, def, to, hitSnd);
					if (k == hits - 1) then.run();
				}
			});
		}
	}

	/** 근접 코덱스 애니메이션: mod-2 MagicImageAnimator (sweep·stab·charge·smash) — 원작 저장소에는 없으므로 조용히 건너뜀 */
	static void meleeAnim(Hero hero, JsonValue def, int to, int hitIndex) {
		String anim = def.getString("anim", "none");
		int img = def.getInt("animImage", -1);
		if (anim.equals("none") || img < 0 || hero.sprite == null) return;
		if (anim.equals("alternate")) anim = hitIndex % 2 == 0 ? "sweep" : "stab";
		try {
			Class<?> c = Class.forName("com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee.MagicImageAnimator");
			c.getMethod(anim, CharSprite.class, int.class, int.class).invoke(null, hero.sprite, img, dir8(hero.pos, to));
		} catch (Throwable ignored) { }
	}
	static int dir8(int from, int to) {
		int w = Dungeon.level.width();
		int dx = Integer.signum(to % w - from % w), dy = Integer.signum(to / w - from / w);
		if (dx == 0 && dy == -1) return 0; if (dx == 1 && dy == -1) return 1; if (dx == 1 && dy == 0) return 2; if (dx == 1 && dy == 1) return 3;
		if (dx == 0 && dy == 1) return 4; if (dx == -1 && dy == 1) return 5; if (dx == -1 && dy == 0) return 6; if (dx == -1 && dy == -1) return 7;
		return 2;
	}
	static void finish(Hero hero, float time, int cell, Done done) {
		if (done != null) { try { done.done(cell); } catch (Throwable t) { MakerRuntime.log("시전 뒤 처리 오류: " + t); } }
		if (time > 0) hero.spendAndNext(time); else hero.next();
	}

	// ------------------------------------------------------------ 효과

	/** 효과 목록 실행 (시간·소리 없이) */
	public static void apply(Hero hero, JsonValue def, int cell) { apply(hero, def, cell, def.getString("hitSound", "")); }
	/** hitSound: 맞을 때 소리 (sfx:키 가능, "" = 없음) */
	public static void apply(Hero hero, JsonValue def, int cell, String hitSound) {
		if (def.get("effects") == null) return;
		// 빗나감이 있는 코덱스는 맞았을 때만 맞는 소리 (빗나가면 missSound)
		boolean perHit = def.getBoolean("hitCheck", false);
		if (!perHit && hitSound != null && !hitSound.isEmpty()) MakerAudio.playSe(hitSound);
		float mult = Math.max(0f, 1f + HeroRuntime.bonus("castPct") / 100f + def.getFloat("extraPct", 0) / 100f);
		for (JsonValue e : def.get("effects")) {
			String type = e.getString("type", "");
			int chance = e.getInt("chance", 100);
			if (chance < 100 && Random.Int(100) >= chance) continue;
			ArrayList<Char> targets = new ArrayList<>();
			String on = e.getString("on", type.equals("heal") || type.equals("shield") ? "self" : "target");
			int radius = efInt(def, e, "radius", "radius", 0);
			if (on.equals("self")) targets.add(hero);
			else if (on.equals("target") || on.equals("area")) {
				Char c = Actor.findChar(cell);
				if (c != null && c != hero && on.equals("target")) targets.add(c);
				if (radius > 0 || on.equals("area")) {
					if (c != null && c != hero && on.equals("area") && c.alignment != Char.Alignment.ALLY) targets.add(c);
					for (Mob m : Dungeon.level.mobs.toArray(new Mob[0]))
						if (m != c && m.alignment == Char.Alignment.ENEMY && Dungeon.level.distance(cell, m.pos) <= Math.max(1, radius)) targets.add(m);
				}
			}
			switch (type) {
				case "damage": {
					for (Char c : targets) {
						int dm = MakerTalents.mod(def.getString("id", ""), "damage");
						int dmg = Random.NormalIntRange(e.getInt("min", 1) + dm, Math.max(e.getInt("min", 1) + dm, e.getInt("max", 4) + dm));
						dmg += e.getInt("perLevel", 0) * (hero.lvl - 1) + c.HT * e.getInt("percent", 0) / 100;
						if (c != hero) {
							if (def.getBoolean("hitCheck", false) && !Char.hit(hero, c, false)) {   // 코덱스: 원작처럼 빗나갈 수 있음
								if (c.sprite != null) c.sprite.showStatus(CharSprite.NEUTRAL, c.defenseVerb());
								String ms = def.getString("missSound", "");
								MakerAudio.playSe(ms.isEmpty() ? "sfx:codex.miss" : ms);
								continue;
							}
							if (perHit && hitSound != null && !hitSound.isEmpty()) MakerAudio.playSe(hitSound);
							dmg = Math.round(dmg * mult);
						}
						c.damage(dmg, hero);
						if (c.sprite != null) c.sprite.flash();
					}
					break;
				}
				case "heal": {
					for (Char c : targets) {
						int amt = efInt(def, e, "amount", "amount", 0) + c.HT * e.getInt("percent", 0) / 100;
						int before = c.HP; c.HP = Math.min(c.HT, c.HP + amt);
						if (c.sprite != null && c.HP > before) c.sprite.showStatus(CharSprite.POSITIVE, "+" + (c.HP - before));
					}
					break;
				}
				case "shield": {
					for (Char c : targets) Buff.affect(c, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier.class).setShield(efInt(def, e, "amount", "amount", 5) + c.HT * e.getInt("percent", 0) / 100);
					break;
				}
				case "buff": for (Char c : targets) addBuff(c, e.getString("buff", ""), e.getFloat("turns", 5f) + MakerTalents.mod(def.getString("id", ""), "turns")); break;
				case "knockback": {
					for (Char c : targets) {
						if (c == hero) continue;
						int dir = PathFinder.NEIGHBOURS8[0];
						for (int o : PathFinder.NEIGHBOURS8) if (c.pos + o != hero.pos && Dungeon.level.distance(hero.pos, c.pos + o) > Dungeon.level.distance(hero.pos, c.pos)) { dir = o; break; }
						int dest = c.pos;
						for (int i = 0; i < efInt(def, e, "power", "power", 2); i++) {
							int n = dest + dir;
							if (n < 0 || n >= Dungeon.level.length() || !Dungeon.level.passable[n] || Actor.findChar(n) != null) break;
							dest = n;
						}
						if (dest != c.pos) { int old = c.pos; c.pos = dest; if (c.sprite != null) c.sprite.move(old, dest); Dungeon.level.occupyCell(c); }
					}
					break;
				}
				case "blink": {
					if (Dungeon.level.passable[cell] && Actor.findChar(cell) == null) ScrollOfTeleportation.appear(hero, cell);
					break;
				}
				case "summon": {
					for (int i = 0; i < Math.max(1, efInt(def, e, "count", "count", 1)); i++) {
						Mob m = LevelHooks.createMob(e.getString("ref", ""));
						if (m == null) break;
						int p = Actor.findChar(cell) == null && Dungeon.level.passable[cell] ? cell : LevelHooks.freeNeighbour(Dungeon.level, cell);
						if (p < 0) break;
						m.pos = p;
						if (e.getBoolean("ally", true)) m.alignment = Char.Alignment.ALLY;
						GameScene.add(m);
					}
					break;
				}
				case "gauge": MakerGauge.add(e.getInt("amount", 0)); break;
				case "event": EventInterpreter.runEvent(e.getString("event", ""), null); break;
				case "code": {
					MakerHeroCode code = HeroRuntime.code();
					if (code == null) { MakerRuntime.warnOnce("영웅 코드가 게임에 없습니다 — 에디터에서 테스트 플레이를 한 번 하세요"); break; }
					int idx = 0; for (JsonValue x : def.get("effects")) { if (x == e) break; idx++; }
					try { code.effect(def.getString("id", ""), idx, hero, cell, Actor.findChar(cell)); } catch (Throwable t) { GenSupport.error("영웅 " + HeroRuntime.heroId(), "효과 " + def.getString("id", ""), t); }
					break;
				}
				case "heart": {
					Char c = Actor.findChar(cell);
					String ch = e.getString("char", c instanceof MakerNPC ? ((MakerNPC) c).charId : "");
					if (!ch.isEmpty()) HeartSystem.applyAction(ch, e.getString("action", "TALK"));
					break;
				}
			}
		}
	}

	/** 게임 버프 이름(예: Burning, Paralysis, Haste) → 적용 */
	@SuppressWarnings("unchecked")
	public static void addBuff(Char c, String name, float turns) {
		if (name.isEmpty()) return;
		try {
			Class<?> cls = Class.forName("com.shatteredpixel.shatteredpixeldungeon.actors.buffs." + name);
			if (!Buff.class.isAssignableFrom(cls)) return;
			if (FlavourBuff.class.isAssignableFrom(cls)) { Buff.prolong(c, (Class<? extends FlavourBuff>) cls, turns); return; }
			Buff b = Buff.affect(c, (Class<? extends Buff>) cls);
			if (b instanceof com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Burning) ((com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Burning) b).reignite(c, turns);
			else if (b instanceof com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison) ((com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison) b).set(turns);
			else if (b instanceof com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bleeding) ((com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bleeding) b).set(turns);
		} catch (ClassNotFoundException e) {
			MakerRuntime.warnOnce("게임 버프를 찾지 못함: " + name);
		}
	}
}
