/*
 * 영웅 코드의 바탕 클래스 — 에디터의 영웅 편집기 "코드" 칸에 쓴 Java 코드는
 * gen/H_<영웅id>.java 로 만들어져 이 클래스를 상속합니다 (editor/codegen.js).
 * 쓰지 않은 훅은 여기의 기본 동작(값을 그대로 돌려줌)을 씁니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;

public class MakerHeroCode {

	// 훅 번호 (codegen.js 의 HERO_HOOKS 와 같음)
	public static final int GAME_START = 0, ATTACK_SKILL = 1, DEFENSE_SKILL = 2, DAMAGE_ROLL = 3, DR_ROLL = 4, SPEED = 5,
			FLOOR_ENTER = 6, TURN = 7, LEVEL_UP = 8, ATTACK_PROC = 9, DEFENSE_PROC = 10, KILL = 11, TALENT_UP = 12;

	/** 이 훅에 사용자 코드가 있는지 */
	public boolean overrides(int hook) { return false; }

	public void onGameStart(Hero hero) { }
	public void onFloorEnter(Hero hero) { }
	public void onTurn(Hero hero) { }
	public void onLevelUp(Hero hero, int lvl) { }
	public int attackSkill(Hero hero, Char target, int value) { return value; }
	public int defenseSkill(Hero hero, Char enemy, int value) { return value; }
	public int damageRoll(Hero hero, int value) { return value; }
	public int drRoll(Hero hero, int value) { return value; }
	public float speed(Hero hero, float value) { return value; }
	public int attackProc(Hero hero, Char enemy, int damage) { return damage; }
	public int defenseProc(Hero hero, Char enemy, int damage) { return damage; }
	public void onKill(Hero hero, Mob mob) { }
	/** 특성 포인트를 올렸을 때 (points = 올린 뒤 포인트) */
	public void onTalentUp(Hero hero, String talent, int points) { }
	/** 주문 · 직업 능력 효과 "코드" (id = 주문/능력 id, effectIndex = 효과 순서) */
	public void effect(String id, int effectIndex, Hero hero, int cell, Char target) { }
}
