
package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.watabou.noosa.audio.Sample;
import com.watabou.noosa.tweeners.Tweener;

/**
 * Magic Slash (instant, short‑range Codex)
 * - 즉발형(instant): castDelay() == 0
 * - 전방 2타: 선택한 방향으로 1칸/2칸 순서로 최대 2회 공격
 *   * 1칸에 적이 있으면 먼저 타격, 2칸에도 적이 있으면 이어서 타격
 *   * 1칸에만 적이 있으면 같은 대상에게 2번째 타를 한번 더 시도
 * - 근거리 전용: 원거리 투척/발사 대신 onThrow()에서 인접/직선 2칸만 처리
 */
public class MagicSlash extends MeleeCodex {

    /** 다음 1회 공격 애니메이션을 찌르기(stab)로 강제할지 여부 */
    private boolean nextAnimStab = false;

    {
        tier = 1;
        image = ItemSpriteSheet.CODEX_SLASH;
        magicImage = ItemSpriteSheet.MAGIC_SLASH;
        baseUses = 50;
    }

    private static final String SFX_HIT_SWEEP = Assets.Sounds.ATK_SWORD_SLASH2;
    private static final String SFX_HIT_STAB  = Assets.Sounds.ATK_SWORD_SWEEP;

    @Override
    public int min(int lvl) {
        return tier + lvl;
    }

    @Override
    public int max(int lvl) {
        return 5 * (tier+1)
                + lvl * (tier+1);
    }

    @Override
    protected void onAttackComplete(Char enemy, int cell, boolean hit) {
        super.onAttackComplete(enemy, cell, hit);

        final boolean wasStab = nextAnimStab;

        // 마법 베기 애니메이션 (MAGIC_BLADE)
        // 마법 베기/찌르기 애니메이션 (MAGIC_BLADE)
        try {
            int dir8 = dir8For(curUser.pos, cell);
            if (nextAnimStab) {
                // 두번째 타격: 찌르기(stab)
                MagicImageAnimator.stab(curUser.sprite, ItemSpriteSheet.MAGIC_SLASH, dir8);
            } else {
                // 첫번째 타격: 베기(sweep)
                MagicImageAnimator.sweep(curUser.sprite, ItemSpriteSheet.MAGIC_SLASH, dir8);
            }
        } catch (Throwable ignored) { /* 애니메이션 실패해도 전투는 진행 */ }
        finally {
            // 한 번 소비 후 항상 초기화
            nextAnimStab = false;
        }
        if (hit) {
            Sample.INSTANCE.play(wasStab ? SFX_HIT_STAB : SFX_HIT_SWEEP, 0.87f, 1.2f);
        } else {
            Sample.INSTANCE.play(Assets.Sounds.MISS, 0.87f, 1.2f);
        } }

    @Override
    protected void onCodexAttack(Char enemy, int cell) {
        beforeUse();
        // 먼저 처음에 지정한 대상에게 1타를 구사합니다.
        onAttackComplete(enemy, cell, curUser.codexAttack(enemy, this));
        affectElement(cell);

        // 더 나은 이펙트를 위해 0.1초의 딜레이를 가지고 두번째 적을 공격합니다.
        curUser.busy(); //이 딜레이 동안 영웅은 움직일 수 없습니다.
        curUser.sprite.parent.add(new Tweener(curUser.sprite.parent, 0.1f) {
            @Override
            protected void updateValues(float progress) {} // 인터페이스의 메서드를 구현하기 위해 넣은 코드입니다. 시간이 지남에 따른 아무런 작동도 필요로 하지 않기 때문에 공백.

            @Override
            protected void onComplete() { // interval 값으로 넣은 0.1초가 흐른 후에 실행되는 함수입니다.
                super.onComplete();

                // 두번째 타격은 찌르기(stab) 애니메이션을 사용하도록 플래그 설정
                nextAnimStab = true;
// 공격자의 위치 → 피격자의 위치 방향으로 단단한 지형 앞에서 멈추는 직선 경로를 만듭니다.
                Ballistica path = new Ballistica(curUser.pos, enemy.pos, Ballistica.STOP_SOLID);

                // 두번째 적을 공격했는지를 확인하는 변수입니다.
                boolean isAttackedSecond = false;

                // 위에서 만든 직선 경로 path의 2번째 타일부터 2번째 타일까지의 모든 타일에 대해서 반복문을 수행합니다. 사실상 하나의 타일이죠.
                // 참고로 0번째 타일은 curUser.pos입니다.
                // 1번째 타일은 enemy.pos겠죠?
                // 2번째 타일은 공격자의 위치 → 피격자의 위치 방향으로 직선 경로를 따라 피격자의 위치 뒤입니다. 즉, 처음에 공격한 적 뒤에 있는 타일을 찾는 겁니다.
                for (int c : path.subPath(2, 2)) {
                    Char ch = Actor.findChar(c);
                    if (ch != null) { // 만약 해당 타일에 캐릭터가 있는데...
                        if (ch.alignment != Char.Alignment.ENEMY) continue; // 그 캐릭터가 적이 아니라면 그냥 넘어갑니다.
                        onAttackComplete(ch, c, curUser.codexAttack(ch, MagicSlash.this)); // 적이라면 해당 캐릭터에게 코덱스 공격을 합니다.
                        isAttackedSecond = true; // 이제 두번째 적을 공격했네요.
                    }
                }

                if (!isAttackedSecond && enemy.isAlive()) { // 두번째 적을 공격하지 않았는데, 원래 적이 살아있다면...
                    nextAnimStab = true;
                    onAttackComplete(enemy, enemy.pos, curUser.codexAttack(enemy, MagicSlash.this)); // 원래의 적인 enemy에게 한번 더 코덱스 공격을 합니다.
                }

                // 모든 게 끝났으면 onUse()를 호출합니다.
                // onComplete() 바깥에서 onUse()를 호출하면 spendAndNext()를 먼저 호출하게 되어,
                // 앞서 curUser.busy()를 호출해 영웅을 움직이지 못하게 했던 것이 딜레이가 다 지나기 전에 풀려버립니다.
                afterUse();
            }
        });
    }

    @Override
    public float accuracyFactor(Char owner, Char target) {
        // 명중률 보정을 넣어 두셨길래 똑같이 추가했습니다.
        return 1.25f * super.accuracyFactor(owner, target);
    }

    /** curUser.pos -> targetPos 를 8방향(0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW) 인덱스로 변환 */
    private static int dir8For(int fromPos, int toPos){
        int w = Dungeon.level.width();
        int fx = fromPos % w, fy = fromPos / w;
        int tx = toPos % w, ty = toPos / w;
        int dx = Integer.signum(tx - fx);
        int dy = Integer.signum(ty - fy);
        if (dx ==  0 && dy == -1)  return 0;  // N
        if (dx ==  1 && dy == -1)  return 1;  // NE
        if (dx ==  1 && dy ==  0)  return 2;  // E
        if (dx ==  1 && dy ==  1)  return 3;  // SE
        if (dx ==  0 && dy ==  1)  return 4;  // S
        if (dx == -1 && dy ==  1)  return 5;  // SW
        if (dx == -1 && dy ==  0)  return 6;  // W
        if (dx == -1 && dy == -1)  return 7;  // NW
        return 2; // 제자리거나 예외면 E로
    }
}