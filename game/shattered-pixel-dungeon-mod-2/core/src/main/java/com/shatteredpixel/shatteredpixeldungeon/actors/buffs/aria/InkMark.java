package com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria;

import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.watabou.utils.Bundle;
/**
 *
 * 코덱스(Codex) 공격에 반응하여 중첩되는 디버프입니다.
 * - 중첩/갱신: 코덱스 적중 시 stacks+1(최대 maxStacks), duration으로 타이머 갱신.
 * - 피해 증폭: codexAmpPerStack(기본 0.02=2%) × stacks 만큼 코덱스 피해가 증가합니다.
 * - 이동 둔화(선택): moveSlowPerStack × stacks 만큼 이동속도를 감속(최솟값 0.1 배율 보정, 상한은 외부 제한).
 * - 만료 보호막 훅(선택): 만료 시 각 중첩을 onExpireShieldPctPerStack만큼 보호막으로 전환할 수 있도록 값 제공(외부 로직).
 * - 직렬화: 모든 주요 상태를 Bundle로 저장/복원.
 */
public class InkMark extends Buff {
// 버프 틱 간격(초). 주기적 act() 호출과 시간 갱신 기준(기본 1초/턴).

    private static final float TICK = 1f;
// 현재 잉크 마크 중첩 수.

    private int stacks = 0;
    // 허용되는 최대 중첩 수(기본 3).
    private int maxStacks = 3;
    // 적용 시 지속시간(초/턴). 중첩이 갱신될 때마다 이 시간으로 재설정(기본 6).
    private float duration = 6f;
    // 현재 유지 중인 중첩의 남은 시간.
    private float timeLeft = 0f;

// 코덱스에 대한 피해 증폭: 중첩당 +2%(기본값).
// 코덱스 피해 증폭량(중첩당). 기본 0.02 = +2%.
    private float codexAmpPerStack = 0.02f;

// (선택) 딥 잉크(Deep Ink)로부터의 둔화: 중첩당 적용, 상한선은 외부 로직에서 제한.
// 이동속도 감속량(중첩당). 예: 0.06 ⇒ -6%/중첩. 상한은 외부에서 제한.
    private float moveSlowPerStack = 0f; // 예) 0.06f ⇒ 중첩당 -6% 이동속도.

// (선택) 만료 시 각 중첩을 시전자에게 부여할 보호막으로 전환(외부 로직에서 처리).
// 만료 시 시전자에게 부여할 보호막 비율(중첩당). 실제 부여는 외부 로직에서 처리.
    private float onExpireShieldPctPerStack = 0f;

// ==== 공개 API ====

    public static InkMark get(Char ch) {
        return ch == null ? null : ch.buff(InkMark.class);
    }

    public void onCodexHit(Char source) {
        stacks = Math.min(maxStacks, stacks + 1);
        timeLeft = duration;
        BuffIndicator.refresh(target);
    }

    public float codexDamageTakenMultiplier() {
        return 1f + codexAmpPerStack * stacks;
    }

    public float speedMultiplier() {
        float slow = moveSlowPerStack * stacks;
// -X% 속도를 곱셈 배율(1 - X)로 변환.
        return Math.max(0.1f, 1f - slow);
    }

    public float consumeExpireShieldPct() {
        float pct = onExpireShieldPctPerStack * stacks;
        onExpireShieldPctPerStack = 0f;
        return pct;
    }

// ==== 버프 수명주기(lifecycle) ====

    @Override
    public boolean act() {
        if (stacks <= 0) {
            detach();
            return true;
        }
        timeLeft -= TICK;
        if (timeLeft <= 0f) {
// 중첩이 1 감소.
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
    // 직렬화 키: codexAmpPerStack
    private static final String CP = "cp";
    // 직렬화 키: moveSlowPerStack
    private static final String SL = "sl";
    // 직렬화 키: onExpireShieldPctPerStack
    private static final String SH = "sh";

    @Override
    public void storeInBundle(Bundle b) {
        super.storeInBundle(b);
        b.put(ST, stacks);
        b.put(MS, maxStacks);
        b.put(DU, duration);
        b.put(TL, timeLeft);
        b.put(CP, codexAmpPerStack);
        b.put(SL, moveSlowPerStack);
        b.put(SH, onExpireShieldPctPerStack);
    }

    @Override
    public void restoreFromBundle(Bundle b) {
        super.restoreFromBundle(b);
        stacks = b.getInt(ST);
        maxStacks = b.getInt(MS);
        duration = b.getFloat(DU);
        timeLeft = b.getFloat(TL);
        codexAmpPerStack = b.getFloat(CP);
        moveSlowPerStack = b.getFloat(SL);
        onExpireShieldPctPerStack = b.getFloat(SH);
    }

// ==== UI ====
    @Override
    public int icon() {
        return BuffIndicator.NONE;// 실제 아이콘 ID로 교체 필요.
    }

    @Override
    public float iconFadePercent() {
        if (maxStacks <= 0) return 0f;
        return stacks / (float) maxStacks;
    }

    @Override
    public String toString() {
        return "Ink Mark x" + stacks;
    }

    // ==== 튜닝 파라미터(Tuners) ====
    public void setMaxStacks(int v) { maxStacks = v; }
    public void setDuration(float v) { duration = v; }
    public void setCodexAmpPerStack(float v) { codexAmpPerStack = v; }
    public void setMoveSlowPerStack(float v) { moveSlowPerStack = v; }
    public void setOnExpireShieldPctPerStack(float v) { onExpireShieldPctPerStack = v; }
}
