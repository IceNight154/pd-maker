package com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria;

import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.watabou.utils.Bundle;
/**
 * 대상에게 '브랜드(낙인)'를 부여하여 받는 모든 피해를 증가시키는 디버프입니다.
 * - 중첩 가능: 적용 시 stacks가 1 증가하며, 최대 maxStacks까지 누적됩니다.
 * - 시간 경과/감소: 각 중첩은 duration 동안 유지되며, 시간이 다하면 중첩이 1 감소합니다.
 * - 만료 시 보호막 훅: 버프가 완전히 만료될 때 남은 중첩당 onExpireShieldPctPerStack만큼
 *   시전자(applierId)에게 보호막을 부여할 수 있도록 값을 노출합니다(외부 로직에서 소비).
 * - 피해 배율: allDamageIncreasePerStack(기본 0.03=3%) * stacks 만큼 추가 피해를 받습니다.
 */

public class Brand extends Buff {
// 버프 틱 간격(초). act()가 이 간격으로 호출되어 시간/중첩을 갱신합니다.

    private static final float TICK = 1f;
// 현재 브랜드(낙인) 중첩 수.

    private int stacks = 0;
    // 허용되는 최대 중첩 수. (기본 3)
    private int maxStacks = 3;
    // 한 번 적용 시 지속시간(초). 중첩이 감소할 때마다 이 시간으로 재설정됩니다.
    private float duration = 6f;
    // 현재 중첩의 남은 시간(초).
    private float timeLeft = 0f;

    // 대상이 받는 *모든* 피해를 증가시킵니다 (기본: 중첩당 +3%).
// 중첩 1개당 받는 피해 증가율. (기본 0.03 = 3%)
    private float allDamageIncreasePerStack = 0.03f;

    // 만료 시 남은 중첩을 '시전자(applier)'의 보호막으로 전환합니다 (외부 로직에서 처리).
// 버프 만료 시 시전자에게 부여할 보호막 비율(중첩당). (외부 처리)
    private float onExpireShieldPctPerStack = 0f;
// 브랜드를 건 시전자(Char)의 ID. 보호막 귀속을 위해 저장됩니다.

    private int applierId = 0; // 보호막 귀속 대상을 지정하고 싶다면 호출 측에서 설정하세요.

    public static Brand get(Char ch) {
        return ch == null ? null : ch.buff(Brand.class);
    }

    /** Apply/stack the brand and refresh its timer. */
    public void apply(Char applier) {
        stacks = Math.min(maxStacks, stacks + 1);
        timeLeft = duration;
        applierId = applier != null ? applier.id() : 0;
        BuffIndicator.refresh(target);
    }

    /** Returns the damage multiplier to apply to ANY incoming damage on this target. */
    public float allDamageTakenMultiplier() {
        return 1f + allDamageIncreasePerStack * stacks;
    }

    /** Returns shield fraction to grant to the applier when this buff fully expires. */
    public float consumeExpireShieldPct() {
        float pct = onExpireShieldPctPerStack * stacks;
        onExpireShieldPctPerStack = 0f;
        return pct;
    }

    @Override
    public boolean act() {
        if (stacks <= 0) {
            detach();
            return true;
        }
        timeLeft -= TICK;
        if (timeLeft <= 0f) {
            stacks--;
            timeLeft = stacks > 0 ? duration : 0f;
            if (stacks <= 0) {
                detach();
            }
            BuffIndicator.refresh(target);
        }
        spend(TICK);
        return true;
    }

    @Override
    public void detach() {
        super.detach();
        BuffIndicator.refresh(target);
    }

    // ==== 직렬화(Serialization) ====
    // 직렬화 키: stacks
    private static final String ST = "st";
    // 직렬화 키: maxStacks
    private static final String MS = "ms";
    // 직렬화 키: duration
    private static final String DU = "du";
    // 직렬화 키: timeLeft
    private static final String TL = "tl";
    // 직렬화 키: allDamageIncreasePerStack
    private static final String AD = "ad";
    // 직렬화 키: onExpireShieldPctPerStack
    private static final String SH = "sh";
    // 직렬화 키: applierId
    private static final String AP = "ap";

    @Override
    public void storeInBundle(Bundle b) {
        super.storeInBundle(b);
        b.put(ST, stacks);
        b.put(MS, maxStacks);
        b.put(DU, duration);
        b.put(TL, timeLeft);
        b.put(AD, allDamageIncreasePerStack);
        b.put(SH, onExpireShieldPctPerStack);
        b.put(AP, applierId);
    }

    @Override
    public void restoreFromBundle(Bundle b) {
        super.restoreFromBundle(b);
        stacks = b.getInt(ST);
        maxStacks = b.getInt(MS);
        duration = b.getFloat(DU);
        timeLeft = b.getFloat(TL);
        allDamageIncreasePerStack = b.getFloat(AD);
        onExpireShieldPctPerStack = b.getFloat(SH);
        applierId = b.getInt(AP);
    }

    // ==== UI ====
    @Override
    public int icon() {
        return BuffIndicator.NONE;
    }

    @Override
    public float iconFadePercent() {
        if (maxStacks <= 0) return 0f;
        return stacks / (float) maxStacks;
    }

    @Override
    public String toString() {
        return "Brand x" + stacks;
    }

    // ==== 튜닝 파라미터(Tuners) ====
    public void setMaxStacks(int v) { maxStacks = v; }
    public void setDuration(float v) { duration = v; }
    public void setAllDamageIncreasePerStack(float v) { allDamageIncreasePerStack = v; }
    public void setOnExpireShieldPctPerStack(float v) { onExpireShieldPctPerStack = v; }
    public void setApplierId(int id) { applierId = id; }
    // 브랜드를 건 시전자(Char)의 ID. 보호막 귀속을 위해 저장됩니다.
    public int applierId() { return applierId; }
}
