package com.shatteredpixel.shatteredpixeldungeon.items.bags.grimoire;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria.NewOverHeat;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;

public class GrimoireAria extends Grimoire {

    {
        image = ItemSpriteSheet.GRIMOIRE_ARIA;
    }

    @Override
    public AriaManaBall knockBall(){
        return new AriaManaBall();
    }

    public class AriaManaBall extends ManaBall {
        {
            image = ItemSpriteSheet.MANA_BALL_FIRE;
        }

        @Override
        public int image() {
            if (Dungeon.hero == null) {
                return super.image();
            }
            NewOverHeat buff = NewOverHeat.getBuff(Dungeon.hero);
            switch (buff.getElement()) {
                case FIRE:
                    return ItemSpriteSheet.MANA_BALL_FIRE;
                case WATER:
                    return ItemSpriteSheet.MANA_BALL_WATER;
                case EARTH:
                    return ItemSpriteSheet.MANA_BALL_EARTH;
                case WIND:
                    return ItemSpriteSheet.MANA_BALL_WIND;
                default:
                    return super.image();
            }
        }
    }

    @Override
    public VirtualCodex attackInstance() {
        VirtualCodex codex = new AriaVirtualCodex();
        codex.level(this.buffedLvl());
        return codex;
    }

    public static class AriaVirtualCodex extends VirtualCodex {
        @Override
        public int min(int lvl) {
            return 5+lvl;
        }

        @Override
        public int max(int lvl) {
            return 25+5*lvl;
        }
    }
}