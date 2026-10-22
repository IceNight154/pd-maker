/*
 * 데이터로 정의되는 몬스터 (캐릭터 종류 mob / boss). SPD 기본 몬스터 AI(돌아다님·추격)를 그대로 씁니다.
 *   stats: hp, attackMin, attackMax, defense, accuracy, evasion, speed
 *   behaviors.onDeath: 쓰러질 때 실행할 이벤트 명령 (예: 아이템 떨어뜨리기)
 *   ai.mode fixed · code, stats.infiniteHp · regen 은 MakerCharAI (게임 캐릭터에도 같은 연결 줄로)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.utils.Bundle;
import com.watabou.utils.Random;

public class MakerMob extends Mob {

	public String charId = "";

	{
		spriteClass = MakerSprite.class;
		state = WANDERING;
	}

	public static MakerMob create(String charId) {
		MakerMob m = new MakerMob();
		m.charId = charId;
		m.applyData();
		m.HP = m.HT;
		return m;
	}
	JsonValue data() { return MakerRuntime.character(charId); }
	JsonValue stats() { JsonValue d = data(); return d == null ? null : d.get("stats"); }
	void applyData() {
		JsonValue s = stats();
		HT = s == null ? 10 : Math.max(1, s.getInt("hp", 10));
		defenseSkill = s == null ? 2 : s.getInt("evasion", 2);
		baseSpeed = s == null ? 1 : s.getFloat("speed", 1);
		EXP = Math.max(1, HT / 5);
		maxLvl = Math.max(5, Dungeon.depth + 4);
		JsonValue d = data();
		if (d != null && "boss".equals(d.getString("kind", ""))) properties.add(Property.BOSS);
		else if (d != null && "elite".equals(d.getString("kind", ""))) properties.add(Property.MINIBOSS);   // 10차: 엘리트 · 미니보스
	}

	@Override public CharSprite sprite() { return new MakerSprite(data()); }
	@Override public String name() { JsonValue d = data(); return d == null ? "?" : d.getString("name", charId); }
	@Override public String description() { JsonValue d = data(); return d == null ? "" : d.getString("desc", ""); }   // 받은 피해는 Mob.info 연결 줄이 붙임

	@Override public int damageRoll() { JsonValue s = stats(); return s == null ? Random.NormalIntRange(1, 4) : Random.NormalIntRange(s.getInt("attackMin", 1), s.getInt("attackMax", 4)); }
	@Override public int attackSkill(Char target) { JsonValue s = stats(); return s == null ? 8 : s.getInt("accuracy", 8); }
	@Override public int drRoll() { JsonValue s = stats(); return super.drRoll() + Random.NormalIntRange(0, s == null ? 1 : s.getInt("defense", 1)); }

	@Override public int attackProc(Char enemy, int damage) {
		MakerAudio.charSound(charId, "attack");
		return super.attackProc(enemy, damage);
	}
	@Override public void damage(int dmg, Object src) {
		boolean was = isAlive();
		super.damage(dmg, src);
		if (was && isAlive() && dmg > 0) MakerAudio.charSound(charId, "hurt");
	}

	@Override public void die(Object cause) {
		if (MakerCharAI.preventDeath(this)) return;   // 체력 무한 (샌드백)
		MakerAudio.charSound(charId, "die");
		super.die(cause);
		JsonValue d = data();
		JsonValue on = d == null || d.get("behaviors") == null ? null : d.get("behaviors").get("onDeath");
		if (on != null && on.size > 0) EventInterpreter.run(on, null, null);
		if (cause == Dungeon.hero) HeartSystem.counter(properties.contains(Property.BOSS) ? "bossDefeated" : "heroKill");
	}

	@Override public void storeInBundle(Bundle bundle) { super.storeInBundle(bundle); bundle.put("pdm_char", charId); }
	@Override public void restoreFromBundle(Bundle bundle) {
		charId = bundle.getString("pdm_char");
		applyData();
		super.restoreFromBundle(bundle);
	}
}
