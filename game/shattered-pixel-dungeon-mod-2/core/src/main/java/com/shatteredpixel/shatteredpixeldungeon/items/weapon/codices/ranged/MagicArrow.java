package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.ranged;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.audio.Sample;
import com.watabou.noosa.tweeners.Tweener;
import com.watabou.utils.Random;

/**
 * MagicBullet – 한 턴 3연타(동기 실행)
 *
 * - 같은 대상에게 최대 3번 연속 타격(지연/트위너/busy 없음)
 * - 각 타마다 throwSound + 히트/미스 사운드 재생
 * - 필수 필드 사용: tier, image=ItemSpriteSheet.*, magicImage, baseUses
 * - MagicImageAnimator 미사용
 */
public class MagicArrow extends RangedCodex {

    {
        tier = 2;
        image = ItemSpriteSheet.CODEX_ARROW;
        magicImage = ItemSpriteSheet.MAGIC_ARROW;
        baseUses = 30;
    }

    @Override
    public int min(int lvl) { return (tier + 1) + lvl; }

    @Override
    public int max(int lvl) { return 5 * (tier + 1) + lvl * (tier + 1); }

    public void throwSound() {
        Sample.INSTANCE.play(Assets.Sounds.ATK_GRIMOIRE, 1f, Random.Float(0.87f, 1.15f));
    }

    @Override
    protected void onThrow(final int cell) {
        final Char enemy = Actor.findChar(cell);

        if (enemy == null || enemy == curUser) {
            beforeUse();
            parent = null;

            afterUse(); // 상위 클래스는 이 블록을 벗어나서 afterUse()를 실행하지만, 여기에서는 afterUse() 가 특수한 조건에서 작동하므로 여기서 실행합니다.
        } else {
            beforeUse();
            onAttackComplete(enemy, cell, curUser.codexAttack(enemy, this));

            final float DELAY = 0.05f; // 각 공격 간의 딜레이입니다.
            final int HITS = 5; // 총 공격 횟수입니다.

            // 앞서 한 번 공격했으니 이후 공격 횟수는 총 공격 횟수-1입니다. 이것만큼 트위너(실제 시간 기반 딜레이)를 반복해서 추가합니다.
            for (int hit = 1; hit <= HITS-1; hit++) {
                boolean isLast = hit == HITS-1;
                curUser.sprite.parent.add(new Tweener(curUser.sprite.parent, DELAY*hit) { // 기본 딜레이에 반복 횟수를 곱합니다. 0.05초 다음에는 0.1초, 이런 식입니다.
                    @Override
                    protected void updateValues(float progress) {
                        if (!enemy.isAlive()) { // 적이 이미 죽은 상태면 트위너를 즉시 종료합니다.
                            curUser.next(); // 움직일 수 없는 상태를 해제합니다.
                            kill();
                            return;
                        }
                        curUser.busy(); // 트위너가 지속되는 한 시전자는 움직일 수 없습니다.
                    }

                    @Override
                    protected void onComplete() {
                        super.onComplete();
                        if (enemy.isAlive()) {
                            curUser.codexAttack(enemy, MagicArrow.this); // 여기에서 적을 공격합니다.
                        }

                        if (isLast) { // 마지막 트위너일 경우 턴 소모 등 코덱스 사용 후 작업을 수행합니다.
                            curUser.next();
                            afterUse();
                        }
                    }
                });
            }
        }

        if (durabilityLeft() > 0) {
            MagicArrow.this.collect();
        }

        updateQuickslot();
    }
}
