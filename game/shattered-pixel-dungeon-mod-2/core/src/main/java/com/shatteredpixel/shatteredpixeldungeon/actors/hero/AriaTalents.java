package com.shatteredpixel.shatteredpixeldungeon.actors.hero;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FlavourBuff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria.NewOverHeat;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.watabou.noosa.Image;

// 아리아의 특성 효과들을 모아놓은 클래스입니다.
// 이 클래스는 인스턴스를 생성해서 사용하는 게 아니라, static으로 선언한 코드들을 전역에서 호출해서 사용하는 용도입니다.
public class AriaTalents {

    private static final Hero hero = Dungeon.hero;

    // 1-1
    public static void onElementSwitch(NewOverHeat buff) {
        if (hero.buff(QuickSwitchCooldown.class) == null) { //쿨타임이 있으면 작동하지 않음
            buff.cool(4+hero.pointsInTalent(Talent.QUICK_SWITCH)); //5/6/7/8만큼 과부하 감소
            Buff.affect(hero, Haste.class, hero.pointsInTalent(Talent.QUICK_SWITCH) == 4 ? 2f : 1f); // 1/1/1/2턴의 신속 버프 제공
            Buff.affect(hero, QuickSwitchCooldown.class, 9f-Math.min(hero.pointsInTalent(Talent.QUICK_SWITCH), 3)); // 8/7/6/6턴의 쿨타임 버프 제공
        }
    }
    
    // 1-1 쿨타임 버프
    public static class QuickSwitchCooldown extends FlavourBuff {
        {
            type = buffType.NEUTRAL;

            announced = false;
        }

        public static final float DURATION = 8f; // 최대 시간

        @Override
        public int icon() {
            return BuffIndicator.TIME;
        } // 시계 모양 버프 아이콘

        @Override
        public void tintIcon(Image icon) {
            icon.hardlight(1, 1, 1);
        } // TODO: 필요시 아이콘 염색

        @Override
        public float iconFadePercent() {
            return Math.max(0, (DURATION - visualcooldown()) / DURATION);
        }
    }
}
