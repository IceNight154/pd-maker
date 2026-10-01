package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.cast;

import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite;

import java.util.ArrayList;

// 캐스팅(발동형) 코덱스 상위 클래스입니다.
public class CastCodex extends Codex {
    {
        defaultAction = AC_CAST;

        // 캐스팅 코덱스의 기본 사용 횟수입니다. 따로 지정하지 않아도 이만큼의 사용 횟수를 가집니다.
        baseUses = 10;
    }

    @Override
    public int defaultQuantity() {
        // 일반적인 코덱스와는 달리 캐스팅 코덱스는 기본 개수가 1개입니다.
        return 1;
    }

    protected static final String AC_CAST = "cast";

    @Override
    public ArrayList<String> actions(Hero hero) {
        ArrayList<String> actions = super.actions(hero);
        actions.remove(AC_EQUIP);
        actions.remove(AC_THROW);
        actions.add(AC_CAST);
        return actions;
    }

    @Override
    public void execute(Hero hero, String action) {
        super.execute(hero, action);

        if (action.equals(AC_CAST)) {

            beforeUse();
            curUser = hero;
            curItem = this;
            afterUse();
            ((HeroSprite)hero.sprite).read();
        }
    }

    @Override
    protected float castingTurn() {
        // 캐스팅 코덱스는 즉발형으로 만드신 게 확인되어 사용에 0턴이 소모되도록 해 두었습니다.
        return 0;
    }
}
