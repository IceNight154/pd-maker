package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.ranged;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Random;
import com.watabou.noosa.Camera;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaExplosionParticle;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;

public class MagicCannon extends RangedCodex {
    {
        tier = 4;
        image = ItemSpriteSheet.CODEX_CANNON;
        magicImage = ItemSpriteSheet.MAGIC_CANNON;

        baseUses = 10;
    }

    @Override
    public int max(int lvl) { return super.max(lvl); }

    @Override
    public int min(int lvl) { return super.min(lvl); }

    public void throwSound() {
        Sample.INSTANCE.play(Assets.Sounds.ATK_GRIMOIRE, 1, Random.Float(0.87f, 1.15f));
    }

    //이펙트
    @Override
    public int proc(Char attacker, Char defender, int damage) {
        int result = super.proc(attacker, defender, damage);
        Sample.INSTANCE.play(Assets.Sounds.HIT_MAGIC, 1, Random.Float(0.87f, 1.15f));

        if (defender != null) {
            // 맞은 위치에서 폭발 이펙트
            explodeAt(attacker, defender.pos, result);
        }
        return result;
    }

    private void explodeAt(Char attacker, int center, int baseDamage) {
        // 화면 흔들림 & 사운드
        Camera.main.shake(3, 0.25f);
        Sample.INSTANCE.play(Assets.Sounds.BLAST);


        int w = Dungeon.level.width();
        int h = Dungeon.level.height();
        int cx = center % w;
        int cy = center / w;

        //데미지 범위
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                int x = cx + dx;
                int y = cy + dy;
                if (x < 0 || y < 0 || x >= w || y >= h) continue;

                int c = x + y * w;

                int count = (dx == 0 && dy == 0) ? 14 : 8;
                CellEmitter.center(c).burst(ManaExplosionParticle.FACTORY, count);

                // 해당 칸에 캐릭터가 있으면 데미지
                Char ch = Actor.findChar(c);
                if (ch != null && ch != attacker) {
                    // 기본타의 절반 정도를 주변피해로 (원하면 수치 조절)
                    int aoe = Math.max(1, baseDamage / 2 + Random.NormalIntRange(-2, 2));
                    ch.damage(aoe, this);
                }
            }
        }
    }
}
