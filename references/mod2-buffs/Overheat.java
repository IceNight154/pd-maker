/*
 * Aria - Overheat Core Buff
 * Implements elemental Overheat gauge (0-100) with baseline effects and meltdown trigger.
 * Spec reference: GitHub Issue "아리아 #1" (Sep 4, 2025).
 *
 * This class focuses on clean game-logic and exposes small helper methods
 * so you can hook damage, evasion, and element-switch code from your existing systems.
 *
 * ⚠ Integration notes:
 * - Call onSameElementTurn(hero) once per hero turn if element unchanged.
 * - Call onSkillOrCodexUsed(hero) whenever Aria casts a skill/codex.
 * - Call onElementSwitch(hero, newElement, extraReductionFromTalents) when switching element.
 * - To apply baseline passives, query the helpers (e.g., getOutgoingDamageMultiplier(), getIncomingDamageMultiplier(), getEvasionBonusPct()).
 * - If meltdownTriggered() returns true after act()/tick or adjustments, consumeMeltdown()
 *   to get payload (radius, damage) and then do your AoE externally (dealDamageAround()).
 */
/* (한국어 번역)
 * Aria - 과열(Overheat) 코어 버프
 * 원소 과열 게이지(0~100)와 기본 효과, 멜트다운(과열 폭주) 트리거를 구현합니다.
 * 명세 참조: GitHub 이슈 "아리아 #1" (2025-09-04).
 *
 * 이 클래스는 게임 로직을 간결하게 유지하며, 기존 시스템에 손쉽게 연동할 수 있도록
 * 작은 헬퍼 메서드들을 제공합니다(피해/회피/원소 전환 처리 등).
 *
 * ⚠ 연동 노트:
 * - 같은 원소를 유지한 턴마다 onSameElementTurn(hero) 호출.
 * - 스킬/코덱스 사용 시 onSkillOrCodexUsed(hero) 호출.
 * - 원소 전환 시 onElementSwitch(hero, newElement, extraReductionFromTalents) 호출.
 * - 기본 패시브 적용은 getOutgoingDamageMultiplier(), getIncomingDamageMultiplier(), getEvasionBonusPct() 등으로 조회.
 * - act()/tick 이후 또는 조정 결과 meltdownTriggered()가 true라면, consumeMeltdown()으로
 *   (반경, 피해) 페이로드를 받아 외부에서 광역 처리(dealDamageAround())를 수행하세요.
 */
package com.shatteredpixel.shatteredpixeldungeon.actors.buffs;

import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.watabou.utils.Bundle;
import com.watabou.utils.Random;
/**
 * 원소 상태(FIRE/WATER/WIND/EARTH)에 따라 과열 게이지를 축적/감소시키고,
 * 임계치(100)에 도달하면 멜트다운을 트리거하는 버프입니다.
 * - 게이지 축적: 같은 원소 유지, 스킬/코덱스 사용 시 증가.
 * - 원소 전환: 게이지가 감소하며, EARTH 전환 시 1턴 보호막 비율을 반환(외부에서 적용).
 * - 기본 패시브: FIRE 피해 증가, WATER 피해감소+자연냉각(+선택적 자힐), WIND 회피 보너스,
 *   EARTH 기절 확률 2배 및 전환 시 보호막.
 * - 멜트다운: 임계 도달 시 AoE 피해 페이로드를 노출하고, 게이지/원소를 리셋/변경합니다.
 * - 직렬화: 게이지/원소/코덱스최대피해를 저장/복원합니다.
 */
public class Overheat extends Buff {
    /** 원소 타입 열거형: FIRE, WATER, WIND, EARTH */

    public enum Element {FIRE, WATER, WIND, EARTH}

    public static final int MAX_OVERHEAT = 100;    // 과열 게이지 최대치.
    private static final float TICK = 1f;          // 버프 틱 간격(초/턴). act() 호출 주기.

// 게이지 및 기본 설정

    private int gauge = 0;                     // 현재 과열 게이지(0~MAX_OVERHEAT).
    private Element element = Element.FIRE;    // 현재 원소 상태(FIRE/WATER/WIND/EARTH).

// 스펙 훅(특성에 의해 조정 가능)
    private int sameElementPerTurn = 12;       // 같은 원소 유지 시 턴당 증가량(기본 +12).
    private int perSkillUse = 8;               // 스킬/코덱스 사용 시 증가량(기본 +8).
    private int onSwitchReduction = 25;        // 원소 전환 시 감소량(기본 -25). 특성 보너스로 추가 감소.
    private int resetOnMeltdown = 60;          // 멜트다운 후 게이지를 이 값으로 재설정.
    private int meltdownRadius = 2;            // 멜트다운 광역 반경.
    private int codexMaxDamage = 0;            // 코덱스 최대 피해(멜트다운 피해 계산에 사용). 외부에서 설정.


// 원소별 기본 패시브(명세: FIRE +10% 피해, WATER 피해감소 8%/턴당 자힐+1, WIND 회피 +8%, EARTH 기절 2배 & 전환 시 5% 보호막)
    private float fireDamageBonus = 0.10f;          // FIRE: 아리아의 가하는 피해 증가율(+10% 기본).
    private float waterDamageReduction = 0.08f;     // WATER: 받는 피해 감소율(-8% 기본).
    private int waterHealPerTurn = 1;               // WATER: 자동 회복량(턴당, 기본 +1). 외부에서 실제 회복 처리 가능.
    private float windEvasionBonus = 0.08f;         // WIND: 회피 보너스(+8% 기본).
    private float earthSwitchShieldPct = 0.05f;     // EARTH: 원소 전환 시 1턴 보호막 비율(최대체력의 %).


// 외부 시스템에 멜트다운 정보를 전달하기 위한 내부 상태
    private boolean meltdownPending = false;        // 멜트다운 페이로드 준비 상태 플래그.
    private int meltdownDamageCached = 0;           // 멜트다운 피해 캐시값(외부 광역에 전달할 값).

// ==== 공개 진입점 ====

    public static Overheat get(Char ch) {
        return ch == null ? null : ch.buff(Overheat.class);
    }

    public void onSameElementTurn(Hero hero) {
        addGauge(hero, sameElementPerTurn);
    }

    public void onSkillOrCodexUsed(Hero hero) {
        addGauge(hero, perSkillUse);
    }

    public float onElementSwitch(Hero hero, Element newElement, int extraReductionFromTalents) {
        // 기본 -25에 특성으로 인한 추가 감소를 합산
        int totalReduction = onSwitchReduction + Math.max(0, extraReductionFromTalents);
        addGauge(hero, -totalReduction);

        float shieldPct = 0f;
        // EARTH: 전환 시 최대 체력 5% 보호막 1턴(외부 적용)
        if (newElement == Element.EARTH) {
            shieldPct = earthSwitchShieldPct;
        }
        this.element = newElement;
        BuffIndicator.refreshHero();
        return shieldPct;
    }

    public void setCodexMaxDamage(int maxDamage) {
        codexMaxDamage = Math.max(0, maxDamage);
    }

    public float getOutgoingDamageMultiplier() {
        if (element == Element.FIRE) {
            return 1f + fireDamageBonus;
        }
        return 1f;
    }

    public float getIncomingDamageMultiplier() {
        if (element == Element.WATER) {
            return 1f - waterDamageReduction;
        }
        return 1f;
    }

    public float getEvasionBonusPct() {
        return element == Element.WIND ? windEvasionBonus : 0f;
    }

    public boolean doubleStunChance() {
        return element == Element.EARTH;
    }

    private int applyFireGainModifier(int delta) {
        if (element == Element.FIRE && delta > 0) {
            float mod = 1.15f;
            return Math.round(delta * mod);
        }
        return delta;
    }

    @Override
    public boolean act() {
        if (target instanceof Hero) {
            Hero hero = (Hero) target;
            if (element == Element.WATER) {
                // WATER 상태에서 수동 냉각
                addGauge(hero, -2);
                // (선택) 자힐 +1 (일부 코드베이스에서 외부 처리)
                onWaterAutoHeal(hero, waterHealPerTurn);
            }
        }
        spend(TICK);
        return true;
    }

    protected void onWaterAutoHeal(Hero hero, int amount) {
        // 의도적으로 비워둠 – 필요 시 영웅 틱 로직에 통합
    }

    // ==== 게이지 코어 ====

    private void addGauge(Hero hero, int deltaRaw) {
        int delta = applyFireGainModifier(deltaRaw);
        int before = gauge;
        gauge = clamp(gauge + delta, 0, MAX_OVERHEAT);

        if (before < MAX_OVERHEAT && gauge >= MAX_OVERHEAT) {
            triggerMeltdown(hero);
        }
        BuffIndicator.refreshHero();
    }

    private void triggerMeltdown(Hero hero) {
        // 멜트다운 시 원소를 무작위로 변경
        Element[] vals = Element.values();
        element = vals[Random.Int(vals.length)];

        // 광역 페이로드: codexMaxDamage의 25%를 반경 2에 적용(외부 처리)
        meltdownDamageCached = Math.max(1, Math.round(codexMaxDamage * 0.25f));
        meltdownPending = true;

        // 코드베이스가 지원한다면 외부에서 탈진(Exhaust) 1턴을 적용
        // 게이지 재설정
        gauge = clamp(resetOnMeltdown, 0, MAX_OVERHEAT);
    }

    public boolean meltdownTriggered() {
        return meltdownPending;
    }

    public int[] consumeMeltdown() {
        meltdownPending = false;
        return new int[]{meltdownRadius, meltdownDamageCached};
    }

    // ==== 직렬화(Serialization) ====
// 직렬화 키: gauge

    private static final String GA = "ga";
    // 직렬화 키: element
    private static final String EL = "el";
    // 직렬화 키: codexMaxDamage
    private static final String CM = "cm";

    @Override
    public void storeInBundle(Bundle bundle) {
        super.storeInBundle(bundle);
        bundle.put(GA, gauge);
        bundle.put(EL, element.name());
        bundle.put(CM, codexMaxDamage);
    }

    @Override
    public void restoreFromBundle(Bundle bundle) {
        super.restoreFromBundle(bundle);
        gauge = bundle.getInt(GA);
        try {
            element = Element.valueOf(bundle.getString(EL));
        } catch (Throwable ignored) {}
        codexMaxDamage = bundle.getInt(CM);
    }

    // ==== UI ====

    @Override
    public int icon() {
        return BuffIndicator.NONE; // 프로젝트의 실제 아이콘 ID로 교체
    }

    @Override
    public float iconFadePercent() {
        return gauge / (float) MAX_OVERHEAT;
    }

    @Override
    public String toString() {
        return "Overheat (" + element + ") " + gauge + "/" + MAX_OVERHEAT;
    }
// 현재 원소 상태(FIRE/WATER/WIND/EARTH).

    public Element element() { return element; }
    // 현재 과열 게이지(0~MAX_OVERHEAT).
    public int gauge() { return gauge; }

    // ==== 특성(Talent) 튜너 ====

    public void setSameElementPerTurn(int v) { sameElementPerTurn = v; }
    public void setPerSkillUse(int v) { perSkillUse = v; }
    public void setOnSwitchReduction(int v) { onSwitchReduction = v; }
    public void setResetOnMeltdown(int v) { resetOnMeltdown = v; }
    public void setMeltdownRadius(int r) { meltdownRadius = r; }
    public void setFireDamageBonus(float v) { fireDamageBonus = v; }
    public void setWaterDamageReduction(float v) { waterDamageReduction = v; }
    public void setWaterHealPerTurn(int v) { waterHealPerTurn = v; }
    public void setWindEvasionBonus(float v) { windEvasionBonus = v; }
    public void setEarthSwitchShieldPct(float v) { earthSwitchShieldPct = v; }

    // ==== 유틸리티 ====

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
