package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.ranged;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaExplosionParticle;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Random;

public class MagicMissile extends RangedCodex {
    {
        tier = 3;
        image = ItemSpriteSheet.CODEX_MISSILE;
        magicImage = ItemSpriteSheet.MAGIC_MISSILE;

        baseUses = 10;
    }

    @Override
    public int max(int lvl) {
        return super.max(lvl);
    }

    @Override
    public int min(int lvl) {
        return super.min(lvl);
    }

    public void throwSound() {
        Sample.INSTANCE.play(Assets.Sounds.ATK_GRIMOIRE, 1, Random.Float(0.87f, 1.15f));
    }

    //이펙트
    @Override
    public int proc(Char attacker, Char defender, int damage) {
        int result = super.proc(attacker, defender, damage);
        Sample.INSTANCE.play(Assets.Sounds.HIT_MAGIC, 1, Random.Float(0.87f, 1.15f));

        if (defender != null) {
            // 맞은 위치에서 이펙트
            explodeAt(attacker, defender.pos, result);
        }
        return result;
    }
    private void explodeAt(Char attacker, int center, int baseDamage) {

        // 사운드
        Sample.INSTANCE.play(Assets.Sounds.BLAST);


        int w = Dungeon.level.width();
        int h = Dungeon.level.height();
        int cx = center % w;
        int cy = center / w;

        int c = cx + cy * w;
        CellEmitter.center(c).burst(ManaExplosionParticle.FACTORY, 14);
    }
}