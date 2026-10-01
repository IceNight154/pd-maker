package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.SpiritBow;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.audio.Sample;

import java.util.ArrayList;

//근거리형 코덱스 상위 클래스입니다.
public class MeleeCodex extends Codex {

    {
        defaultAction = AC_CAST;
    }

    protected static final String AC_CAST = "cast";

    // RangedCodex와 동일한 방식으로, 시전(캐스팅) 중에 교체 표시될 이미지 인덱스입니다.
    // 각 근접 코덱스 서브클래스에서 적절한 스프라이트 인덱스로 재지정하세요.
    public int magicImage = this.image;

    // 현재 코덱스를 사용(캐스팅)하는 중인지 여부.
    private boolean casting = false;

    @Override
    public void hitSound() {
        Sample.INSTANCE.play(Assets.Sounds.ATK_SWORD_SLASH2);
    }


    @Override
    public ArrayList<String> actions(Hero hero) {
        ArrayList<String> actions = super.actions(hero);
        actions.add(AC_CAST);
        return actions;
    }

    @Override
    public void execute(Hero hero, String action) {
        super.execute(hero, action);

        if (action.equals(AC_CAST)) {

            curUser = hero;
            curItem = this;
            usesTargeting = true;
            GameScene.selectCell( selector );

        }
    }


    @Override
    public int image() {
        // 캐스팅 중에는 magicImage를 보여주고, 아니면 기본 이미지를 보여줍니다.
        return casting ? magicImage : image;
    }

    // 코덱스 공격 시 작동하는 메서드입니다.
    protected void onCodexAttack(Char enemy, int cell) {
        beforeUse();
        onAttackComplete(enemy, cell, curUser.codexAttack(enemy, this));
        affectElement(cell);
        afterUse();
    }

    // 상위 클래스의 메서드를 참고하세요.
    @Override
    protected void onAttackComplete(Char enemy, int cell, boolean hit) {
        // 사용 후 타겟팅을 비활성화합니다.
        usesTargeting = false;
    }

    // 일부 코덱스가 비인접 타겟을 허용할 수 있도록 하는 훅.
    // 기본은 false이며, 서브클래스에서 필요 시 override 하세요.
    protected boolean allowNonAdjacentTarget(int from, int to){
        return false;
    }


    private CellSelector.Listener selector = new CellSelector.Listener() {
        @Override
        public void onSelect( Integer target ) {
            // 지정한 좌표가 없거나 좌표가 영웅의 위치라면 아무것도 하지 않습니다.
            if (target == null || target == curUser.pos) return;

            // 지정한 좌표의 캐릭터를 찾습니다.
            Char enemy = Actor.findChar(target);

            // 캐릭터가 없다면 다음 문구를 출력하고 마칩니다.
            if (enemy == null) {
                GLog.w(Messages.get(MeleeCodex.class, "no_target"));
                return;
            }

            // 캐릭터가 적이 아니라면 다음 문구를 출력하고 마칩니다.
            if (enemy.alignment != Char.Alignment.ENEMY) {
                GLog.w(Messages.get(MeleeCodex.class, "no_enemy"));
                return;
            }


            // 영웅의 위치와 캐릭터의 위치가 근접하지 않았다면, 서브클래스 훅으로 허용 여부를 판정합니다.
            if (!Dungeon.level.adjacent(curUser.pos, enemy.pos)) {
                if (!allowNonAdjacentTarget(curUser.pos, enemy.pos)){
                    GLog.w(Messages.get(MeleeCodex.class, "not_adjacent"));
                    return;
                }
            }

            beforeUse();

            // 적 캐릭터에 대해서 코덱스 공격을 수행합니다.
            casting = true;
            onCodexAttack(enemy, target);

            // 영웅의 공격(휘두르기/참격) 연출을 출력합니다.
            curUser.sprite.zap(target);
            casting = false;
        }
        @Override
        public String prompt() {
            return Messages.get(SpiritBow.class, "prompt");
        }
    };
}
