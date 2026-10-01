package com.shatteredpixel.shatteredpixeldungeon.items.bags.grimoire;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria.ElementArea;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria.NewOverHeat;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaballElementTrailParticles;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.Recipe;
import com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.SpiritBow;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Bundle;
import com.watabou.utils.Random;

import java.util.ArrayList;

public class Grimoire extends Bag {

    public static final String AC_USE = "USE";

    {
        defaultAction = AC_USE;

        usesTargeting = false;
        levelKnown = true;
    }

    @Override
    public ArrayList<String> actions(Hero hero) {
        ArrayList<String> actions = super.actions(hero);
        actions.add(AC_USE);
        return actions;
    }

    @Override
    public void execute(Hero hero, String action) {

        super.execute(hero, action);

        if (action.equals(AC_USE)) {

            curUser = hero;
            curItem = this;
            usesTargeting = true;
            GameScene.selectCell( shooter );

        }
    }

    @Override
    public boolean canHold( Item item ) {
        if (item instanceof Codex){
            return super.canHold(item);
        } else {
            return false;
        }
    }

    @Override
    public String info() {
        String desc = super.info();

        VirtualCodex codex = attackInstance();

        desc += "\n\n" + Messages.get(Grimoire.class, "stats", codex.min(), codex.max(), codex.STRReq(), capacity());

        return desc;
    }

    public int capacity(){
        return 5+level();
    }

    @Override
    public void onDetach( ) {
        super.onDetach();
    }

    @Override
    public int value() {
        return 40;
    }

    @Override
    public int level() { //영웅 레벨에 따라 강화수치 증가
        return Dungeon.hero == null ? 0 : Dungeon.hero.lvl/5;
    }

    @Override
    public int visiblyUpgraded() {
        return level();
    }

    @Override
    public int buffedVisiblyUpgraded() {
        return buffedLvl();
    }

    @Override
    public int buffedLvl() {
        return level();
    }

    public ManaBall knockBall(){
        return new ManaBall();
    }

    public class ManaBall extends Item {
        @Override
        protected void onThrow(int cell) {
            Char ch = Actor.findChar(cell);
            if (ch != null && ch != Dungeon.hero) {
                Dungeon.hero.codexAttack(ch, attackInstance());
            }

            attackInstance().affectElement(cell);

            Buff.affect(Dungeon.hero, NewOverHeat.class).heat(2);

            usesTargeting = false;
        }

        @Override
        public void cast(Hero user, int dst) {
            super.cast(user, dst);
            leaveEffect(user.pos, throwPos( user, dst ), user);
        }

        @Override
        public void throwSound() {
            Sample.INSTANCE.play( Assets.Sounds.ATK_GRIMOIRE, 1, Random.Float(0.87f, 1.15f) );
        }
    }

    CellSelector.Listener shooter = new CellSelector.Listener() {

        @Override
        public void onSelect(Integer cell) {
            if (cell == null) {
                return;
            }

            if (cell == curUser.pos) {
                execute(curUser, AC_OPEN);
                return;
            }

            knockBall().cast(Dungeon.hero, cell);
        }

        @Override
        public String prompt() {
            return Messages.get(SpiritBow.class, "prompt");
        }
    };

    public void leaveEffect(int from, int to, Hero hero) {
        NewOverHeat buff = NewOverHeat.getBuff(hero);
        if (buff == null) return;

        Ballistica path = new Ballistica(from, to, Ballistica.STOP_TARGET);
        for (int cell : path.subPath(0, path.dist)) {
            int particles = Math.max(0, 6-Math.round(0.5f*Dungeon.level.distance(from, cell)));
            if (particles == 0) continue;
            CellEmitter.center(cell).burst(ManaballElementTrailParticles.factory(buff.getElement()), particles);
        }
    }

    public VirtualCodex attackInstance() {
        VirtualCodex codex = new VirtualCodex();
        codex.level(this.buffedLvl());
        return codex;
    }

    public static class VirtualCodex extends Codex {
        {
            tier = 1;
        }

        @Override
        public int defaultQuantity() {
            return 1;
        }

        @Override
        public int STRReq(int lvl) {
            return 0;
        }

        @Override
        public void hitSound() {
            Sample.INSTANCE.play(Assets.Sounds.HIT);
        }
    }
}