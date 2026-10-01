package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.cast;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bless;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.Speck;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.watabou.noosa.audio.Sample;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaBuffFireflyParticle;
import com.watabou.noosa.particles.Emitter;

public class SanctuaryManaField extends CastCodex {
    // 코드에 관한 내용
    // 녹픽던에서 보통 범위 효과를 만들 때에는 PathFinder.NEIGHBOURS[숫자]나, PathFinder.buildDistanceMap()를 사용합니다.
    // PathFinder.NEIGHBOURS4 = 주변 상하좌우 타일
    // PathFinder.NEIGHBOURS8 = 중심을 제외한 주변 8타일
    // PathFinder.NEIGHBOURS9 = 중심을 포함한 주변 8타일
    // PathFinder.buildDistanceMap()은 간략하게 설명드리자면 어떤 지점으로부터 n타일 내로 떨어진 모든 타일을 찾는 것입니다.
    // 예시 코드입니다.

    /*
    // 층의 모든 타일의 좌표를 담는 배열을 만들어 cell과 distance타일 이내로 떨어진 모든 타일에 대해서만 도달 거리를 만듭니다.
    // 이 때 BArray.not( Dungeon.level.solid, null )를 사용했기 때문에, 추가로 해당 타일이 solid가 아니어야 한다는 조건을 추가합니다.
    PathFinder.buildDistanceMap( cell, BArray.not( Dungeon.level.solid, null ), distance );
		for (int i = 0; i < PathFinder.distance.length; i++) { // 위에서 찾은 모든 타일에 대해서 반복문을 시작합니다.
			if (PathFinder.distance[i] < Integer.MAX_VALUE) { // 만약 해당 타일로 도달하는 거리가 존재할 경우, 반대로 말하면 만약 해당 타일에 대한 도달 거리가 무한일 경우, 해당 타일이 solid거나 distance 거리 이상 떨어진 경우 해당 타일에 대해서는 따로 무언가를 하지 않습니다.
				// 해당 타일 좌표 i를 가지고 무언가를 실행합니다.
			}
		}
    */

    // 위 예시 코드를 정리하면, cell을 중심으로 solid인 타일을 피해서 distance타일 떨어진, 모든 타일에 대해서 특정 작업을 수행하는 것입니다.
    // 꽤나 복잡하지만, PathFinder.buildDistanceMap()의 사용 예시를 찾아보시면 그나마 이해하기 쉬우리라 생각합니다.
    // 아니면 저한테 조건을 얘기해 주시면 이걸로 예시 코드를 만들어 드릴게요.

    // 효과 범위(타일)
    private static final int RADIUS = 2;

    {
        image = ItemSpriteSheet.CODEX_MANAFIELD;
        tier = 5;
    }

    @Override
    public int min(int lvl) {
        // 최소 공격력(마력)을 최대 공격력(마력)과 같게 해 뒀습니다.
        return max(lvl);
    }

    @Override
    public int max(int lvl) {
        return 5*(tier)
                + lvl*(tier);
    }

    @Override
    public void afterUse() {
        super.afterUse();

        // 연출
        Sample.INSTANCE.play(Assets.Sounds.READ);
        curUser.sprite.centerEmitter().burst(Speck.factory(Speck.LIGHT), 12);
        CellEmitter.center(curUser.pos).burst(Speck.factory(Speck.HEALING), 6);

        // 범위 내 아군에게 버프 적용
        for (Char ch : Actor.chars()) {
            if (ch == null || !isAlly(ch)) continue;
            if (!inRange(curUser.pos, ch.pos, RADIUS)) continue;

            // 버프들을 부여합니다. 턴 수 혹은 양은 공격력(마력)에 영향을 받습니다.
            Buff.affect(ch, Barrier.class).setShield(this.damageRoll(curUser)*2);
            Buff.prolong(ch, Bless.class, this.damageRoll(curUser));
            Buff.prolong(ch, Haste.class, this.damageRoll(curUser)/4f);

            // 파티클
            Emitter em = ch.sprite.centerEmitter();                // 대상 중심 2미터
            Emitter.Factory WIDEST = new ManaBuffFireflyParticle.ParamFactory(2.5f);
            em.start(ManaBuffFireflyParticle.FACTORY, 1f, 14);  // 흩뿌림 시간
            // 한 번 더 순간 터뜨리는 느낌
            em.burst(ManaBuffFireflyParticle.FACTORY, 6);
        }
    }

    private boolean isAlly(Char ch) {
        // 참고: 영웅의 alignment는 Char.Alignment.ALLY입니다.
        return ch.alignment == Char.Alignment.ALLY;
    }

    private boolean inRange(int from, int to, int r) {
        int w = Dungeon.level.width();
        int fx = from % w, fy = from / w;
        int tx = to % w, ty = to / w;
        int dx = fx - tx, dy = fy - ty;
        return dx*dx + dy*dy <= r*r;
    }
}
