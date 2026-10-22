/*
 * 플레이어블 영웅 (heroes/<id>.json) — 에디터의 "영웅 편집기"에서 만든 데이터를 게임에 적용합니다.
 *
 *   baseClass    : 바탕이 되는 게임 직업 (WARRIOR, MAGE … 또는 모드의 직업 이름). 이 직업을 골라 새 게임을 시작하면 적용
 *                  (project.json 의 startHero 가 있으면 어떤 직업을 고르든 그 영웅)
 *   stats        : hp / hpPerLevel / str
 *   sprite       : 영웅 시트 (행 = 갑옷 단계, 열 = 프레임) + anims
 *   inventory    : clearDefault(원래 시작 아이템 비우기) + items[{item, count, level, equip, quickslot, identify}]
 *   spellbook · spells : 성직자식 주문서 + 단계별 주문 (MakerSpells)
 *   subclasses · abilities : 전직 · 직업 능력 (MakerAbilities)
 *   gauge        : 과열식 게이지 · 원소 (MakerGauge)
 *   talentTiers · talents : 특성 (MakerTalents · MakerTalentsPane)
 *   passives     : 레벨에 따라 열리는 지속 효과 (최대 체력, 힘, 재생, 골드, 최대 충전)
 *
 * 게임 연결: Dungeon.init() 의 initHero 바로 다음 줄에서 afterInit(hero)
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
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.KindOfWeapon;
import com.shatteredpixel.shatteredpixeldungeon.items.KindofMisc;
import com.shatteredpixel.shatteredpixeldungeon.items.armor.Armor;
import com.shatteredpixel.shatteredpixeldungeon.items.artifacts.Artifact;
import com.shatteredpixel.shatteredpixeldungeon.items.rings.Ring;
import com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfTeleportation;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.watabou.noosa.MovieClip;
import com.watabou.noosa.TextureFilm;
import com.watabou.utils.Bundle;
import com.watabou.utils.Callback;
import com.watabou.utils.PathFinder;
import com.watabou.utils.Random;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class HeroRuntime {

	/** 이번 게임의 영웅 id ("" = 게임 기본 영웅) */
	private static String heroId = "";
	/** 영웅 데이터가 HTBoost 에 더해 둔 양 (다른 효과와 섞이지 않게 따로 기록) */
	private static int hpApplied = 0;
	/** 한 번만 적용되는 패시브(힘·골드 등) 중 이미 적용한 것 */
	private static final Set<String> unlocked = new HashSet<>();

	/** 이 영웅의 사용자 코드 (gen/H_<id>, 없으면 null) */
	private static MakerHeroCode code = null;
	/** 레벨업 감지용 */
	private static int lastLvl = 1;

	public static String heroId() { return heroId; }
	public static MakerHeroCode code() { return code; }
	/** 코드에서: 특성 포인트 수 */
	public static int talent(String id) { return MakerTalents.get(id); }
	public static JsonValue data() { return heroId.isEmpty() ? null : MakerRuntime.heroes.get(heroId); }
	/** 완전히 새 영웅 (바탕 직업 없음): 게임 직업에서 아무것도 물려받지 않음 — 시작 아이템·감정·특성·전직·직업 능력 모두 영웅 편집기 것만.
	 *  게임은 직업이 꼭 있어야 하므로 안에서는 WARRIOR 로 돌지만 그 직업 것은 모두 걷어 냄 */
	public static boolean zeroBase() { return zeroBase(data()); }
	/** 코드에서: 이 패시브가 열렸는지 */
	public static boolean passive(String id) { return unlocked.contains(id); }
	/** 전직·직업 능력·특성·패시브를 얻었을 때 → 항목 코드 onGain */
	public static void gain(String kind, String id) {
		if (code == null || !code.overrides(MakerHeroCode.GAIN) || Dungeon.hero == null) return;
		try { code.onGain(kind, id, Dungeon.hero); } catch (Throwable t) { GenSupport.error("영웅 " + heroId + " · " + kind + " " + id, "onGain", t); }
	}
	/** 직업 능력을 쓸 때 → 항목 코드 onUse */
	public static void use(String kind, String id, Hero hero, int cell) {
		if (code == null || !code.overrides(MakerHeroCode.USE)) return;
		try { code.onUse(kind, id, hero, cell, Actor.findChar(cell)); } catch (Throwable t) { GenSupport.error("영웅 " + heroId + " · " + kind + " " + id, "onUse", t); }
	}
	static String lastAbility = "";

	// ------------------------------------------------------------ 초상화 (상태 창 · 영웅 창 · 저장 슬롯)

	/** HeroSprite.avatar(hero) 첫 줄: 영웅 편집기의 그림이면 그 그림의 첫 프레임 (갑옷 단계 줄) */
	public static com.watabou.noosa.Image avatar(Hero hero) {
		try { return MakerRuntime.isActive() && hero == Dungeon.hero ? avatarOf(data(), hero.tier()) : null; }
		catch (Throwable t) { MakerRuntime.log("초상화 오류: " + t); return null; }
	}
	public static com.watabou.noosa.Image avatarOf(JsonValue h, int tier) {
		if (h == null || h.get("sprite") == null) return null;
		JsonValue sp = h.get("sprite");
		String sheet = sp.getString("sheet", "");
		if (sheet.isEmpty()) return null;
		Object tx = MakerRuntime.texture(sheet);
		if (tx == null) return null;
		com.watabou.noosa.Image img = new com.watabou.noosa.Image(tx);
		int fw = 12, fh = 15;
		JsonValue fr = sp.get("frame");
		if (fr != null && fr.size >= 2) { fw = fr.getInt(0); fh = fr.getInt(1); }
		int cols = Math.max(1, img.texture.width / fw), rows = Math.max(1, img.texture.height / fh);
		int f = 0;
		JsonValue idle = sp.get("anims") == null ? null : sp.get("anims").get("idle");
		if (idle != null && idle.get("frames") != null && idle.get("frames").size > 0) f = Math.max(0, idle.get("frames").getInt(0));
		int cell = sp.getBoolean("armorRows", true) ? rowFor(sp, tier, rows) * cols + Math.min(f, cols - 1) : f;
		img.frame((cell % cols) * fw, (cell / cols) * fh, fw, fh);
		// 큰 프레임(예: 24×30) 시트: 게임 그림과 같은 배율로 줄여 원작 초상화 칸(12×15)에 맞춤.
		// scale 이 아니라 그림 크기(width · height) 자체를 줄임 — 게임 코드(상태 창 등)가 width · height 로 자리를 잡으므로 (scale 로 줄이면 왼쪽 위로 치우침)
		float k = sp.getFloat("scale", 0f);
		if (k <= 0f) k = fh > 24 ? 15f / fh : 1f;
		k = Math.min(k, Math.min(20f / fh, 20f / fw));   // 그래도 칸 밖으로 나가지 않게 (20px 안)
		if (k != 1f) {
			img.width = fw * k; img.height = fh * k;
			try {
				java.lang.reflect.Method m = com.watabou.noosa.Image.class.getDeclaredMethod("updateVertices");
				m.setAccessible(true); m.invoke(img);
			} catch (Exception e) { img.scale.set(k); }   // 못 하면 예전처럼 배율로
		}
		return img;
	}
	/** 저장 슬롯 → 영웅 id · 전직 id (Dungeon.preview 에서 저장 파일을 읽을 때) */
	static final java.util.Map<Integer, String[]> slotHero = new java.util.HashMap<>();
	public static void preview(com.shatteredpixel.shatteredpixeldungeon.GamesInProgress.Info info, Bundle bundle) {
		try {
			Bundle st = bundle.contains("pdmaker_story") ? bundle.getBundle("pdmaker_story") : null;
			if (st == null || !st.contains("pdm_hero")) { slotHero.remove(info.slot); return; }
			slotHero.put(info.slot, new String[]{ st.getString("pdm_hero"), st.contains("pdm_subclass") ? st.getString("pdm_subclass") : "" });
		} catch (Throwable t) { MakerRuntime.log("저장 슬롯 읽기 오류: " + t); }
	}
	/** GamesInProgress.set(slot) 첫 줄: 지금 게임을 저장하는 슬롯 = 지금 영웅 */
	public static void setSlot(int slot) {
		if (heroId.isEmpty()) slotHero.remove(slot);
		else slotHero.put(slot, new String[]{ heroId, MakerAbilities.subclassId() });
	}
	static JsonValue slotData(com.shatteredpixel.shatteredpixeldungeon.GamesInProgress.Info info) {
		if (info == null || !MakerRuntime.isActive()) return null;
		String[] s = slotHero.get(info.slot);
		return s == null || s[0].isEmpty() ? null : MakerRuntime.heroes.get(s[0]);
	}
	/** 저장 슬롯의 초상화 (시작 화면 · 이어하기 창) */
	public static com.watabou.noosa.Image slotAvatar(com.shatteredpixel.shatteredpixeldungeon.GamesInProgress.Info info) {
		try { return avatarOf(slotData(info), info.armorTier); } catch (Throwable t) { MakerRuntime.log("저장 슬롯 초상화 오류: " + t); return null; }
	}
	/** 저장 슬롯의 이름: 영웅 편집기의 전직 이름 → 영웅 이름 (원작 영웅이면 null = 게임 그대로) */
	public static String slotName(com.shatteredpixel.shatteredpixeldungeon.GamesInProgress.Info info) {
		JsonValue h = slotData(info);
		if (h == null) return null;
		String[] s = slotHero.get(info.slot);
		if (s != null && !s[1].isEmpty() && h.get("subclasses") != null)
			for (JsonValue x : h.get("subclasses")) if (s[1].equals(x.getString("id", ""))) return x.getString("name", s[1]);
		String st = HeroSelect.sel(h, "title");
		if (!st.trim().isEmpty()) return st;
		if (!zeroBase(h) && h.getString("id", "").equalsIgnoreCase(h.getString("baseClass", ""))) return null;
		String n = h.getString("name", "");
		return n.isEmpty() ? null : n;
	}
	static boolean restoredAbility = false;
	public static boolean zeroBase(JsonValue h) { return h != null && h.getString("baseClass", "").trim().isEmpty(); }

	// ------------------------------------------------------------ 새 게임

	/** Dungeon.init() 에서 직업 기본 장비를 준 직후 */
	public static void afterInit(Hero hero) {
		heroId = ""; hpApplied = 0; unlocked.clear(); code = null; lastAbility = ""; restoredAbility = false; lastLvl = 1; MakerTalents.reset(); MakerAbilities.reset(); MakerSpells.reset();
		if (!MakerRuntime.isActive()) return;
		// 시작 노드 (맵 그래프의 start → depth/branch)
		int[] sw = WorldGraph.whereOf(WorldGraph.start);
		if (sw != null) { Dungeon.depth = sw[0]; Dungeon.branch = sw[1]; }

		JsonValue h = pick(hero);
		if (h == null) return;
		heroId = h.getString("id", "");
		MakerRuntime.log("영웅 적용: " + h.getString("name", heroId) + (zeroBase(h) ? " (새 영웅 — 바탕 직업 없음)" : " (바탕 직업 " + hero.heroClass.name() + ")"));
		if (zeroBase(h)) stripClass(hero);

		code = GenSupport.hero(heroId);
		JsonValue st = h.get("stats");
		if (st != null && st.has("str")) hero.STR = st.getInt("str", hero.STR);
		if (st != null && st.getInt("viewDistance", 0) > 0) hero.viewDistance = st.getInt("viewDistance", 8);
		lastLvl = hero.lvl;
		MakerTalents.notifiedLevel = hero.lvl;
		syncHP(hero, true);

		// 시작 아이템
		JsonValue inv = h.get("inventory");
		boolean clear = zeroBase(h) || (inv != null && inv.getBoolean("clearDefault", false));
		if (clear) clearInventory(hero);
		int slot = 0;
		if (inv != null && inv.get("items") != null) {
			for (JsonValue e : inv.get("items")) {
				// fromGame: 바탕 직업이 이미 주는 원작 시작 아이템 (목록에 보여 주기만) — 게임 기본을 비운 경우에만 이 목록대로 줌
				if (!clear && e.getBoolean("fromGame", false)) { if (e.getBoolean("quickslot", false)) slot++; continue; }
				Item it = MakerItem.create(e.getString("item", ""));
				if (it == null) continue;
				// 마법사 지팡이에 넣은 마법봉 (원작: 마탄의 마법봉)
				String imbue = e.getString("imbue", "");
				if (!imbue.isEmpty() && it instanceof com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.MagesStaff) {
					Item w = MakerItem.create("spd:" + imbue);
					if (w instanceof com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand) it = new com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.MagesStaff((com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand) w);
				}
				// 갑옷에 붙이기 (전사의 부러진 인장)
				if (e.getBoolean("affix", false) && it instanceof com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal && hero.belongings.armor != null) {
					hero.belongings.armor.affixSeal((com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal) it);
					continue;
				}
				if (it.stackable) it.quantity(Math.max(1, e.getInt("count", 1)));
				if (e.getInt("level", 0) > 0 && it.isUpgradable()) it.upgrade(e.getInt("level", 0));
				if (e.getBoolean("identify", true)) it.identify();
				if (e.getBoolean("equip", false) && equip(hero, it)) { /* 장착 */ }
				else it.collect(hero.belongings.backpack);
				if (e.getBoolean("quickslot", false)) Dungeon.quickslot.setSlot(slot++, it);
			}
		}
		// 주문서 (주문이 있으면 — 성직자의 성서처럼 처음부터 가짐)
		MakerSpells.fill();
		JsonValue book = h.get("spellbook");
		if (MakerSpells.any() && (book == null || book.getBoolean("enabled", true))) {
			MakerSpells.MakerSpellbook s = new MakerSpells.MakerSpellbook();
			s.collect(hero.belongings.backpack);
			Dungeon.quickslot.setSlot(Math.min(slot, 5), s);
		}
		MakerGauge.attach(hero);
		int gold = h.getInt("startGold", 0);
		if (gold > 0) Dungeon.gold += gold;
		// 처음부터 알고 있는 아이템 (감정됨)
		JsonValue known = h.get("knownItems");
		if (known != null) for (JsonValue k : known) { Item it = MakerItem.create(k.asString()); if (it != null) it.identify(); }
		unlockPassives(hero);
		if (code != null && code.overrides(MakerHeroCode.GAME_START)) {
			try { code.onGameStart(hero); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "onGameStart", t); }
		}
	}

	// ------------------------------------------------------------ 영웅 코드 훅 (Hero.java / Mob.java 연결 줄에서 부름)

	private static final boolean[] busy = new boolean[16];
	static JsonValue stats() { JsonValue h = data(); return h == null ? null : h.get("stats"); }
	/** 데이터 설정만으로 바꾸는 훅 (코드가 없어도) */
	static boolean dataHook(int h) {
		if (talentHook(h)) return true;
		JsonValue st = stats(); if (st == null) return false;
		if (h == MakerHeroCode.DAMAGE_ROLL) return st.getInt("unarmedMax", 0) > 0;
		if (h == MakerHeroCode.SPEED) return st.getFloat("speed", 1f) != 1f && st.getFloat("speed", 1f) > 0;
		if (h == MakerHeroCode.ATTACK_SKILL) return st.getInt("attackSkill", 10) != 10 || st.getInt("accPerLvl", 1) != 1;
		if (h == MakerHeroCode.DEFENSE_SKILL) return st.getInt("defenseSkill", 5) != 5 || st.getInt("evaPerLvl", 1) != 1;
		return false;
	}
	/** 특성·전직·게이지 능력치 합 (주문·코덱스 배율 castPct/codexPct, 공격/받는 피해 damagePct/takenPct 포함) */
	public static int bonus(String stat) {
		if (heroId.isEmpty()) return 0;
		return MakerTalents.stat(stat) + MakerAbilities.subclassStat(stat) + MakerGauge.stat(stat);
	}
	/** 능력치가 붙어 있으면 그 훅을 켬 */
	static boolean talentHook(int h) {
		switch (h) {
			case MakerHeroCode.ATTACK_SKILL: return bonus("accuracy") != 0;
			case MakerHeroCode.DEFENSE_SKILL: return bonus("evasion") != 0;
			case MakerHeroCode.DAMAGE_ROLL: return bonus("damage") != 0;
			case MakerHeroCode.DR_ROLL: return bonus("armor") != 0;
			case MakerHeroCode.SPEED: return bonus("speed") != 0;
		}
		return false;
	}
	/** Hero 의 명중/회피 기본값(10/5, 레벨당 +1)을 데이터 값으로 바꾼 비율 — 원래 계산의 배율(무기·버프)은 그대로 둠 */
	static int scaleSkill(Hero hero, int v, String key, int base, String perKey) {
		JsonValue st = stats(); if (st == null) return v;
		int lv = Math.max(0, hero.lvl - 1);
		int want = st.getInt(key, base) + st.getInt(perKey, 1) * lv, orig = base + lv;
		return want == orig || orig <= 0 ? v : Math.round(v * (float) want / orig);
	}
	/** 연결 줄: if (wrap(n)) return 훅(원래 메서드()) — 원래 메서드 안에서 다시 불리면 false (한 번만 감쌈) */
	public static boolean wrap(int h) {
		if (h < 0 || h >= busy.length || busy[h] || heroId.isEmpty()) return false;
		if (!((code != null && code.overrides(h)) || dataHook(h))) return false;
		busy[h] = true;
		return true;
	}
	public static int attackSkill(Hero hero, Char target, int v) {
		busy[MakerHeroCode.ATTACK_SKILL] = false;
		v = scaleSkill(hero, v, "attackSkill", 10, "accPerLvl") + bonus("accuracy");
		try { return code == null ? v : code.attackSkill(hero, target, v); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "attackSkill", t); return v; }
	}
	public static int defenseSkill(Hero hero, Char enemy, int v) {
		busy[MakerHeroCode.DEFENSE_SKILL] = false;
		v = scaleSkill(hero, v, "defenseSkill", 5, "evaPerLvl") + bonus("evasion");
		try { return code == null ? v : code.defenseSkill(hero, enemy, v); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "defenseSkill", t); return v; }
	}
	public static int damageRoll(Hero hero, int v) {
		busy[MakerHeroCode.DAMAGE_ROLL] = false;
		JsonValue st = stats();
		if (st != null && st.getInt("unarmedMax", 0) > 0 && hero.belongings.weapon() == null)
			{ int lo = st.getInt("unarmedMin", 1), hi = Math.max(lo, st.getInt("unarmedMax", 4)); Object r = MakerCompat.invoke(Hero.class, "heroDamageIntRange", lo, hi); v = r instanceof Integer ? (Integer) r : com.watabou.utils.Random.NormalIntRange(lo, hi); }   // 예전 판: 보통 범위
		v = Math.max(0, v + bonus("damage"));
		try { return code == null || !code.overrides(MakerHeroCode.DAMAGE_ROLL) ? v : code.damageRoll(hero, v); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "damageRoll", t); return v; }
	}
	public static int drRoll(Hero hero, int v) {
		busy[MakerHeroCode.DR_ROLL] = false;
		v = Math.max(0, v + bonus("armor"));
		try { return code == null ? v : code.drRoll(hero, v); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "drRoll", t); return v; }
	}
	public static float speed(Hero hero, float v) {
		busy[MakerHeroCode.SPEED] = false;
		JsonValue st = stats();
		if (st != null && st.getFloat("speed", 1f) > 0) v *= st.getFloat("speed", 1f);
		int ts = bonus("speed"); if (ts != 0) v *= Math.max(0.1f, 1f + ts / 100f);
		try { return code == null || !code.overrides(MakerHeroCode.SPEED) ? v : code.speed(hero, v); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "speed", t); return v; }
	}
	public static int attackProc(Hero hero, Char enemy, int damage) {
		MakerActive.trigger("hit");
		int pct = bonus("damagePct"); if (pct != 0) damage = Math.max(0, Math.round(damage * (1f + pct / 100f)));
		if (code == null || !code.overrides(MakerHeroCode.ATTACK_PROC)) return damage;
		try { return code.attackProc(hero, enemy, damage); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "attackProc", t); return damage; }
	}
	public static int defenseProc(Hero hero, Char enemy, int damage) {
		if (damage > 0) MakerActive.trigger("damaged");
		int pct = bonus("takenPct"); if (pct != 0) damage = Math.max(0, Math.round(damage * (1f + pct / 100f)));
		if (code == null || !code.overrides(MakerHeroCode.DEFENSE_PROC)) return damage;
		try { return code.defenseProc(hero, enemy, damage); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "defenseProc", t); return damage; }
	}
	/** Mob.die() 첫 줄 */
	public static void onMobDie(Mob mob, Object cause) {
		try { EventTriggers.onMobDie(mob, cause); } catch (Throwable t) { MakerRuntime.log("몬스터 처치 트리거 오류: " + t); }
		try { MakerActive.onKill(mob, cause); } catch (Throwable t) { MakerRuntime.log("전직 액티브 오류: " + t); }
		if (code == null || !code.overrides(MakerHeroCode.KILL) || Dungeon.hero == null) return;
		if (cause != Dungeon.hero && !(cause instanceof Item) && !(cause instanceof com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand)) return;
		if (mob.alignment != Char.Alignment.ENEMY) return;
		try { code.onKill(Dungeon.hero, mob); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "onKill", t); }
	}
	/** 레벨업(데이터: 레벨당 명중/회피 추가) + 코드 */
	static void checkLevel(Hero hero) {
		while (lastLvl < hero.lvl) {
			lastLvl++;
			if (code != null && code.overrides(MakerHeroCode.LEVEL_UP)) {
				try { code.onLevelUp(hero, lastLvl); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "onLevelUp", t); }
			}
		}
	}

	private static JsonValue pick(Hero hero) {
		String forced = MakerRuntime.project.getString("startHero", "");
		if (!forced.isEmpty()) {
			JsonValue h = MakerRuntime.heroes.get(forced);
			if (h != null) return h;
			MakerRuntime.log("시작 영웅을 찾지 못함: " + forced);
		}
		// 영웅 선택 화면에서 고른 영웅 (같은 직업을 바탕으로 한 영웅이 여럿일 때 구분)
		if (HeroSelect.selected != null) {
			JsonValue h = MakerRuntime.heroes.get(HeroSelect.selected);
			if (h != null && HeroSelect.classOf(h) == hero.heroClass) return h;
		}
		for (JsonValue h : MakerRuntime.heroes.values()) {
			if (!h.getBoolean("enabled", true)) continue;
			if (HeroSelect.classOf(h) == hero.heroClass) return h;   // baseClass 가 비면 WARRIOR
		}
		return null;
	}

	/** 새 영웅: 게임 직업(WARRIOR)이 준 것 걷어 내기 — 장비·가방·퀵슬롯, 감정해 둔 아이템, 직업 특성 */
	private static void stripClass(Hero hero) {
		clearInventory(hero);
		// 직업이 감정해 둔 물약·주문서 (initHero + initWarrior) 를 모르는 상태로
		forget(com.shatteredpixel.shatteredpixeldungeon.items.potions.Potion.class, com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing.class);
		forget(com.shatteredpixel.shatteredpixeldungeon.items.scrolls.Scroll.class, com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRage.class);
		forget(com.shatteredpixel.shatteredpixeldungeon.items.scrolls.Scroll.class, com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify.class);
		// 직업 버프 (전사의 인장 보호막 등)
		for (Buff b : hero.buffs()) if (b instanceof com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal.WarriorShield) b.detach();
		// 직업 특성 (Talent.initClassTalents) 비우기 — 특성은 영웅 편집기의 특성만
		for (java.util.LinkedHashMap<com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent, Integer> tier : hero.talents) tier.clear();
	}
	@SuppressWarnings("unchecked")
	static void forget(Class<?> base, Class<?> item) {
		try {
			java.lang.reflect.Field hf = base.getDeclaredField("handler"); hf.setAccessible(true);
			Object handler = hf.get(null); if (handler == null) return;
			java.lang.reflect.Field kf = handler.getClass().getDeclaredField("known"); kf.setAccessible(true);
			((java.util.Set<Object>) kf.get(handler)).remove(item);
		} catch (Throwable t) { MakerRuntime.log("감정 되돌리기 실패: " + item.getSimpleName() + " " + t); }
	}

	private static void clearInventory(Hero hero) {
		hero.belongings.weapon = null;
		hero.belongings.armor = null;
		hero.belongings.artifact = null;
		hero.belongings.misc = null;
		hero.belongings.ring = null;
		hero.belongings.backpack.items.clear();
		for (int i = 0; i < 6; i++) Dungeon.quickslot.clearSlot(i);
	}

	private static boolean equip(Hero hero, Item it) {
		// 무기·갑옷은 원래 시작 장비가 있으면 가방으로 옮기고 바꿔 낌
		if (it instanceof KindOfWeapon && hero.belongings.weapon != null) { KindOfWeapon o = hero.belongings.weapon; hero.belongings.weapon = null; o.collect(hero.belongings.backpack); }
		if (it instanceof Armor && hero.belongings.armor != null) { Armor o = hero.belongings.armor; hero.belongings.armor = null; o.collect(hero.belongings.backpack); }
		if (it instanceof KindOfWeapon && hero.belongings.weapon == null) { hero.belongings.weapon = (KindOfWeapon) it; ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).activate(hero); return true; }
		if (it instanceof Armor && hero.belongings.armor == null) { hero.belongings.armor = (Armor) it; ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).activate(hero); return true; }
		if (it instanceof Artifact && hero.belongings.artifact == null) { hero.belongings.artifact = (Artifact) it; ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).activate(hero); return true; }
		if (it instanceof Ring && hero.belongings.ring == null) { hero.belongings.ring = (Ring) it; ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).activate(hero); return true; }
		if (it instanceof KindofMisc && hero.belongings.misc == null) { hero.belongings.misc = (KindofMisc) it; ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).activate(hero); return true; }
		return false;
	}

	// ------------------------------------------------------------ 능력치 · 패시브

	/** 최대 체력: 기본 hp / 레벨당 hp / 패시브 */
	static void syncHP(Hero hero, boolean fill) {
		JsonValue h = data(); if (h == null) return;
		JsonValue st = h.get("stats");
		int base = st == null ? 20 : st.getInt("hp", 20), per = st == null ? 5 : st.getInt("hpPerLevel", 5);
		int want = (base - 20) + (per - 5) * (hero.lvl - 1) + passiveSum(hero, "hp");
		if (want != hpApplied) {
			hero.HTBoost += want - hpApplied;
			hpApplied = want;
			hero.updateHT(fill);
			if (fill) hero.HP = hero.HT;
		}
	}

	static boolean passiveOn(Hero hero, JsonValue p) {
		return hero.lvl >= p.getInt("unlockLevel", 1) && Cond.eval(p.getString("cond", ""), StoryState.globalResolver());
	}
	/** 켜진 패시브들의 해당 능력치 합 */
	static int passiveSum(Hero hero, String stat) {
		JsonValue h = data(); if (h == null) return 0;
		int sum = bonus(stat);
		if (h.get("passives") != null) for (JsonValue p : h.get("passives")) {
			if (!passiveOn(hero, p) || p.get("effects") == null) continue;
			for (JsonValue e : p.get("effects")) if (stat.equals(e.getString("stat", ""))) sum += e.getInt("value", 0);
		}
		return sum;
	}
	/** 한 번만 적용되는 효과 (힘·골드) + 열렸다는 알림 */
	static void unlockPassives(Hero hero) {
		JsonValue h = data(); if (h == null || h.get("passives") == null) return;
		for (JsonValue p : h.get("passives")) {
			String id = p.getString("id", p.getString("name", ""));
			if (unlocked.contains(id) || !passiveOn(hero, p)) continue;
			unlocked.add(id);
			gain("passive", id);
			if (p.get("effects") != null) for (JsonValue e : p.get("effects")) {
				switch (e.getString("stat", "")) {
					case "str":  hero.STR += e.getInt("value", 0); break;
					case "gold": Dungeon.gold += e.getInt("value", 0); break;
				}
			}
			if (p.getInt("unlockLevel", 1) > 1 && hero.sprite != null) GLog.p("[" + p.getString("name", id) + "] 을(를) 익혔다!");
		}
	}

	// ------------------------------------------------------------ 층 입장 · 스프라이트

	public static void onFloorEnter() {
		Hero hero = Dungeon.hero;
		if (hero == null || data() == null) return;
		if (hero.buff(Tracker.class) == null) Buff.affect(hero, Tracker.class);
		java.util.Arrays.fill(busy, false);
		applySprite(hero);
		try { MakerGauge.attach(hero); } catch (Throwable t) { MakerRuntime.log("게이지 오류: " + t); }
		try { MakerActive.attach(hero); } catch (Throwable t) { MakerRuntime.log("게이지 오류: " + t); }
		if (code != null && code.overrides(MakerHeroCode.FLOOR_ENTER)) {
			try { code.onFloorEnter(hero); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "onFloorEnter", t); }
		}
	}

	private static Object heroTex;
	/** 영웅 시트의 추가 애니메이션 (기본 8종 밖의 이름) — 이벤트 명령 "애니메이션 재생"에서 씀 */
	static final Map<String, MovieClip.Animation> heroExtra = new HashMap<>();
	static final String[] STD_ANIMS = { "idle", "run", "attack", "zap", "operate", "die", "dead", "fly", "read" };

	/** 영웅 시트로 그림 바꾸기 (행 = 갑옷 단계 → tierRows 로 바꿀 수 있음) */
	static void applySprite(Hero hero) {
		if (hero != null && hero.sprite != null) applySprite(hero, hero.sprite, true);
	}
	/** HeroSprite.updateArmor() 맨 앞 (연결 줄): 영웅 편집기의 시트가 있으면 게임 그림 대신 이것으로 — true 면 게임 코드는 건너뜀.
	 *  (예전에는 갑옷을 바꿀 때 게임이 자기 프레임 크기(원작 12×15 / mod-2 48×60)로 다시 잘라서 그림이 잘려 보였음) */
	public static boolean updateArmor(CharSprite s) {
		try {
			if (!MakerRuntime.isActive() || Dungeon.hero == null || data() == null) return false;
			return applySprite(Dungeon.hero, s, false);
		} catch (Throwable t) { MakerRuntime.log("영웅 그림 적용 실패: " + t); return false; }
	}
	static boolean applySprite(Hero hero, CharSprite s, boolean place) {
		JsonValue h = data();
		if (h == null || s == null || h.get("sprite") == null) return false;
		JsonValue sp = h.get("sprite");
		String sheet = sp.getString("sheet", "");
		if (sheet.isEmpty()) return false;
		Object tx = MakerRuntime.texture(sheet);
		if (tx == null) return false;
		s.texture(tx);
		int fw = 12, fh = 15;
		JsonValue fr = sp.get("frame");
		if (fr != null && fr.size >= 2) { fw = fr.getInt(0); fh = fr.getInt(1); }
		TextureFilm film = new TextureFilm(s.texture, fw, fh);
		int cols = Math.max(1, s.texture.width / fw);
		int rows = Math.max(1, s.texture.height / fh);
		// armorRows=false (RPG Maker 시트 등): 프레임 번호를 시트 전체 기준으로 씀, 갑옷 단계 무시
		boolean armorRows = sp.getBoolean("armorRows", true);
		int row = armorRows ? rowFor(sp, hero.tier(), rows) : -1;
		JsonValue anims = sp.get("anims");
		try {
			MovieClip.Animation idle = anim(anims, "idle", film, cols, row, new int[]{0, 0, 0, 1, 0, 0, 1, 1}, 1, true);
			setAnim(s, "idle", idle);
			setAnim(s, "run", anim(anims, "run", film, cols, row, new int[]{2, 3, 4, 5, 6, 7}, 20, true));
			MovieClip.Animation attack = anim(anims, "attack", film, cols, row, new int[]{13, 14, 15, 0}, 15, false);
			setAnim(s, "attack", attack);
			setAnim(s, "zap", has(anims, "zap") ? anim(anims, "zap", film, cols, row, null, 15, false) : attack.clone());
			MovieClip.Animation operate = anim(anims, "operate", film, cols, row, new int[]{16, 17, 16, 17}, 8, false);
			setAnim(s, "operate", operate);
			final MovieClip.Animation dieA = anim(anims, "die", film, cols, row, new int[]{8, 9, 10, 11, 12, 11}, 20, false);
			setAnim(s, "die", dieA);
			// dead (선택): 쓰러짐(die)이 끝나면 이어서 반복하는 동작 — 완료 알림을 가로채서 이어 틂
			final MovieClip.Animation deadA = has(anims, "dead") ? anim(anims, "dead", film, cols, row, null, 5, true) : null;
			final CharSprite fs = s;
			s.listener = deadA == null ? s : new MovieClip.Listener() {
				@Override public void onComplete(MovieClip.Animation a) { fs.onComplete(a); if (a == dieA) fs.play(deadA, true); }   // CharSprite.play(anim) 은 die 중에는 무시하므로 force
			};
			// 날기(공중부양·점프 중) · 읽기(주문서) — 게임 HeroSprite 의 private 필드. 없으면 가만히 / 조작 동작으로
			setAnim(s, "fly", has(anims, "fly") ? anim(anims, "fly", film, cols, row, null, 5, true) : idle.clone());
			setAnim(s, "read", has(anims, "read") ? anim(anims, "read", film, cols, row, null, 20, false) : operate.clone());
			heroExtra.clear();
			if (anims != null) for (JsonValue a : anims) {
				if (java.util.Arrays.asList(STD_ANIMS).contains(a.name)) continue;
				if (a.get("frames") == null || a.get("frames").size == 0) continue;
				heroExtra.put(a.name, anim(anims, a.name, film, cols, row, null, 10, false));
			}
		} catch (Exception e) { MakerRuntime.log("영웅 그림 적용 실패: " + e); return false; }
		float sc = sp.getFloat("scale", 0f);
		if (sc <= 0f) sc = fh > 24 ? 15f / fh : 1f;
		s.scale.set(sc);
		heroTex = tx;
		if (hero.isAlive()) s.idle(); else s.die();
		if (place) s.place(hero.pos);
		return true;
	}
	/** 갑옷 단계(hero.tier(): 0 없음 · 1~5 갑옷 · 6 직업 갑옷) → 시트 행. sprite.tierRows = [0단계 행, 1단계 행, …] */
	static int rowFor(JsonValue sp, int tier, int rows) {
		JsonValue tr = sp.get("tierRows");
		if (tr != null && tr.size > 0) {
			int r = tr.getInt(Math.max(0, Math.min(tier, tr.size - 1)));
			return Math.max(0, Math.min(rows - 1, r));
		}
		return Math.max(0, Math.min(rows - 1, tier));
	}
	private static boolean has(JsonValue anims, String key) {
		JsonValue a = anims == null ? null : anims.get(key);
		return a != null && a.get("frames") != null && a.get("frames").size > 0;
	}
	private static int textureWidth(Object tx, CharSprite s) {
		return tx instanceof com.watabou.gltextures.SmartTexture ? ((com.watabou.gltextures.SmartTexture) tx).width : s.texture.width;
	}
	private static MovieClip.Animation anim(JsonValue anims, String key, TextureFilm film, int cols, int row, int[] def, int defFps, boolean loop) {
		JsonValue a = anims == null ? null : anims.get(key);
		int[] fr = def == null ? new int[]{0} : def; int fps = defFps;
		if (a != null && a.get("frames") != null && a.get("frames").size > 0) { fr = a.get("frames").asIntArray(); fps = a.getInt("fps", defFps); loop = a.getBoolean("loop", loop); }
		Object[] frames = new Object[fr.length];
		for (int i = 0; i < fr.length; i++) frames[i] = row < 0 ? Math.max(0, fr[i]) : row * cols + Math.max(0, Math.min(fr[i], cols - 1));
		MovieClip.Animation x = new MovieClip.Animation(Math.max(1, fps), loop);
		x.frames(film, frames);
		return x;
	}
	/** CharSprite(idle·run…) 또는 HeroSprite(fly·read) 의 애니메이션 필드 바꾸기. 없는 필드는 건너뜀 */
	private static void setAnim(CharSprite s, String name, MovieClip.Animation a) throws Exception {
		for (Class<?> c = s.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
			try { Field f = c.getDeclaredField(name); f.setAccessible(true); f.set(s, a); return; }
			catch (NoSuchFieldException ignored) { }
		}
	}
	/** 이름으로 애니메이션 찾기 (이벤트 명령 "애니메이션 재생") */
	static MovieClip.Animation animOf(CharSprite s, String name) {
		if (s == null || name == null || name.isEmpty()) return null;
		if (s instanceof MakerSprite) { MovieClip.Animation a = ((MakerSprite) s).extra.get(name); if (a != null) return a; }
		else if (Dungeon.hero != null && s == Dungeon.hero.sprite) { MovieClip.Animation a = heroExtra.get(name); if (a != null) return a; }
		for (Class<?> c = s.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
			try { Field f = c.getDeclaredField(name); f.setAccessible(true); Object v = f.get(s); if (v instanceof MovieClip.Animation) return (MovieClip.Animation) v; }
			catch (Exception ignored) { }
		}
		return null;
	}

	/** 영웅에게 붙어 있는 보이지 않는 버프: 충전 · 재사용 대기 · 재생 · 레벨업 패시브 · 그림 유지 */
	public static class Tracker extends Buff {
		{ revivePersists = true; }
		int regenLeft = 0;
		@Override public boolean act() {
			Hero hero = Dungeon.hero;
			if (hero != null && target == hero && data() != null) {
				MakerSpells.tick(hero);
				String ab = MakerAbilities.abilityId();
				if (restoredAbility) { lastAbility = ab; restoredAbility = false; }
				if (!ab.equals(lastAbility)) { lastAbility = ab; if (!ab.isEmpty()) gain("ability", ab); }
				checkLevel(hero);
				MakerTalents.checkNew(hero);
				syncHP(hero, false);
				unlockPassives(hero);
				if (code != null && code.overrides(MakerHeroCode.TURN)) {
					try { code.onTurn(hero); } catch (Throwable t) { GenSupport.error("영웅 " + heroId, "onTurn", t); }
				}
				int regen = passiveSum(hero, "regen");
				if (regen > 0 && hero.HP < hero.HT && --regenLeft <= 0) { hero.HP++; regenLeft = regen; }
				if (hero.sprite != null && heroTex != null && hero.sprite.texture != null && textureWidth(heroTex, hero.sprite) != hero.sprite.texture.width) applySprite(hero);
			}
			spend(TICK);
			return true;
		}
		@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("regenLeft", regenLeft); }
		@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); regenLeft = b.getInt("regenLeft"); }
	}

	/** 예전 저장 파일의 전용 아이템 → 주문서로 */
	public static class MakerSignature extends MakerSpells.MakerSpellbook { }

	/** 이번 불러오기에서 주문 충전 저장값을 읽었는지 (예전 전용 아이템의 충전 값보다 우선) */
	static boolean restoredSpells = false;

	// ------------------------------------------------------------ 저장

	static void store(Bundle b) {
		b.put("pdm_hero", heroId);
		b.put("pdm_hero_hp", hpApplied);
		b.put("pdm_hero_unlocked", unlocked.toArray(new String[0]));
		b.put("pdm_hero_lvl", lastLvl);
		MakerTalents.store(b);
		MakerSpells.store(b);
		MakerAbilities.store(b);
	}
	static void restore(Bundle b) {
		heroId = b.contains("pdm_hero") ? b.getString("pdm_hero") : "";
		hpApplied = b.getInt("pdm_hero_hp");
		unlocked.clear();
		String[] u = b.getStringArray("pdm_hero_unlocked");
		if (u != null) for (String s : u) unlocked.add(s);
		heroTex = null;
		lastLvl = b.contains("pdm_hero_lvl") ? b.getInt("pdm_hero_lvl") : 1;
		code = heroId.isEmpty() ? null : GenSupport.hero(heroId);
		MakerTalents.restore(b);
		MakerAbilities.restore(b);
		lastAbility = "";   // 첫 턴에 지금 능력으로 맞춤 (불러온 능력은 다시 "얻음" 처리하지 않도록 아래에서)
		restoredAbility = true;
		restoredSpells = MakerSpells.restore(b);
	}
}
