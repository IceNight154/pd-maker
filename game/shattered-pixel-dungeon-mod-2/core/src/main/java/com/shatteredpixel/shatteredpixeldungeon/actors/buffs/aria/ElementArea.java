package com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Blob;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfBlastWave;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.GeyserTrap;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.noosa.audio.Sample;
import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Bundle;
import com.watabou.utils.PathFinder;
import com.watabou.utils.Random;

import java.util.ArrayList;

public class ElementArea extends Buff {
    private final ArrayList<Integer> areaPositions = new ArrayList<>();
    private final ArrayList<Emitter> areaEmitters = new ArrayList<>();

    private static final float DURATION = 3;
    int left = 0;

    {
        type = buffType.NEUTRAL;
    }

    NewOverHeat.ElementType element;

    public void setup(ArrayList<Integer> cells, NewOverHeat.ElementType type) {
        for (int cell : cells) {
            if (areaPositions.contains(cell)) {
                interaction(cell, type);
            }
        }

        this.element = type;

        areaPositions.clear();
        areaPositions.addAll(cells);

        if (target != null) {
            fx(false);
            fx(true);
        }

        left = (int) DURATION;
    }

    public void switchTerrain(int cell, NewOverHeat.ElementType prevType, NewOverHeat.ElementType currType) {
        int prevTerrain;
        switch (prevType) {
            case FIRE:
            default:
                prevTerrain = Terrain.EMBERS;
                break;
            case WATER:
                prevTerrain = Terrain.WATER;
                break;
            case WIND:
                prevTerrain = Terrain.EMPTY;
                break;
            case EARTH:
                prevTerrain = Terrain.GRASS;
                break;
        }

        int currTerrain;
        switch (currType) {
            case FIRE:
            default:
                currTerrain = Terrain.EMBERS;
                break;
            case WATER:
                currTerrain = Terrain.WATER;
                break;
            case WIND:
                currTerrain = Terrain.EMPTY;
                break;
            case EARTH:
                currTerrain = Terrain.GRASS;
                break;
        }

        if (Dungeon.level.map[cell] == prevTerrain) {
            Level.set(cell, currTerrain);
            //TODO: 타일 전환 시 이펙트
            GameScene.updateMap(cell);
        }
    }

    public void interaction(int center, NewOverHeat.ElementType type) {
        for (int i : PathFinder.NEIGHBOURS9) {
            int cell = center + i;
            if (element == type) {
                switch (element) {
                    case FIRE: default:
                        boolean burnt = false;
                        if (Dungeon.level.map[cell] == Terrain.EMBERS) {
                            Level.set(cell, Terrain.EMPTY);
                            GameScene.add(Blob.seed(cell, 2, Fire.class));
                            GameScene.updateMap(cell);
                            burnt = true;
                        }
                        if (burnt) Sample.INSTANCE.play(Assets.Sounds.BURNING);
                        break;
                    case WATER:
                        if (Dungeon.level.map[center] == Terrain.WATER) {
                            GeyserTrap geyser = new GeyserTrap();
                            geyser.pos = center;
                            geyser.source = this;

                            int userPos = target == null ? center : target.pos;
                            if (userPos != center){
                                Ballistica aim = new Ballistica(userPos, center, Ballistica.STOP_TARGET);
                                if (aim.path.size() > aim.dist+1) {
                                    geyser.centerKnockBackDirection = aim.path.get(aim.dist + 1);
                                }
                            }
                            geyser.activate();
                        }
                        break;
                    case WIND:
                        int centerTerrain = Dungeon.level.map[center];
                        if (Dungeon.level.map[cell] != Terrain.EMBERS
                                && Dungeon.level.map[cell] != Terrain.WATER
                                && Dungeon.level.map[cell] != Terrain.EMPTY
                                && Dungeon.level.map[cell] != Terrain.GRASS) {
                            break;
                        }
                        if (Dungeon.level.map[cell] == Terrain.EMBERS
                                || Dungeon.level.map[cell] == Terrain.WATER
                                || Dungeon.level.map[cell] == Terrain.EMPTY
                                || Dungeon.level.map[cell] == Terrain.GRASS) {
                            Level.set(cell, centerTerrain);
                        }
                        break;
                    case EARTH:
                        if (Dungeon.level.map[cell] == Terrain.GRASS) {
                            Level.set(cell, Terrain.HIGH_GRASS);
                            GameScene.updateMap(cell);
                        }
                        break;
                }
            } else {
                switchTerrain(cell, element, type);
            }
        }
    }

    public void extend( float duration ) {
        left += duration;
    }

    @Override
    public boolean act() {
        left--;
        if (left <= 0){
            detach();
        }

        spend(TICK);
        return true;
    }

    @Override
    public void fx(boolean on) {
        if (on){
            for (int i : areaPositions){
                Emitter e = CellEmitter.get(i);
                switch (element) {
                    case FIRE: default:
                        e.pour(FireElementParticle.FACTORY, 0.05f);
                        break;
                    case WATER:
                        e.pour(WaterElementParticle.FACTORY, 0.05f);
                        break;
                    case WIND:
                        e.pour(WindElementParticle.FACTORY, 0.05f);
                        break;
                    case EARTH:
                        e.pour(EarthElementParticle.FACTORY, 0.05f);
                        break;
                }
                areaEmitters.add(e);
            }
        } else {
            for (Emitter e : areaEmitters){
                e.on = false;
            }
            areaEmitters.clear();
        }
    }

    private static final String ARENA_POSITIONS = "arena_positions";
    private static final String LEFT = "left";
    private static final String ELEMENT = "element";

    @Override
    public void storeInBundle(Bundle bundle) {
        super.storeInBundle(bundle);

        int[] values = new int[areaPositions.size()];
        for (int i = 0; i < values.length; i ++)
            values[i] = areaPositions.get(i);
        bundle.put(ARENA_POSITIONS, values);

        bundle.put(LEFT, left);
        bundle.put(ELEMENT, NewOverHeat.ElementType.getIndexByElement(element));
    }

    @Override
    public void restoreFromBundle(Bundle bundle) {
        super.restoreFromBundle(bundle);

        int[] values = bundle.getIntArray( ARENA_POSITIONS );
        for (int value : values) {
            areaPositions.add(value);
        }

        left = bundle.getInt(LEFT);
        element = NewOverHeat.ElementType.getElementByIndex(bundle.getInt(ELEMENT));
    }

    public static class ElementParticle extends PixelParticle.Shrinking {

        public ElementParticle() {
            super();

            lifespan = 0.6f;
        }

        public void reset( float x, float y){
            revive();

            this.x = x;
            this.y = y;

            left = lifespan;
            size = 8;

            speed.set( Random.Float( -8, +8 ), Random.Float( -16, -32 ) );
        }

        @Override
        public void update() {
            super.update();

            am = 1 - left / lifespan;
        }

    }

    public static class FireElementParticle extends ElementParticle {

        public static final Emitter.Factory FACTORY = new Emitter.Factory() {
            @Override
            public void emit( Emitter emitter, int index, float x, float y ) {
                ((FireElementParticle)emitter.recycle( FireElementParticle.class )).reset( x, y );
            }
            @Override
            public boolean lightMode() {
                return false;
            }
        };

        public FireElementParticle() {
            super();

            color(0xFF0000);
        }
    }

    public static class WaterElementParticle extends ElementParticle {

        public static final Emitter.Factory FACTORY = new Emitter.Factory() {
            @Override
            public void emit( Emitter emitter, int index, float x, float y ) {
                ((WaterElementParticle)emitter.recycle( WaterElementParticle.class )).reset( x, y );
            }
            @Override
            public boolean lightMode() {
                return false;
            }
        };

        public WaterElementParticle() {
            super();

            color(0x0000FF);
        }
    }

    public static class WindElementParticle extends ElementParticle {

        public static final Emitter.Factory FACTORY = new Emitter.Factory() {
            @Override
            public void emit( Emitter emitter, int index, float x, float y ) {
                ((WindElementParticle)emitter.recycle( WindElementParticle.class )).reset( x, y );
            }
            @Override
            public boolean lightMode() {
                return false;
            }
        };

        public WindElementParticle() {
            super();

            color(0xFFFFFF);
        }
    }

    public static class EarthElementParticle extends ElementParticle {

        public static final Emitter.Factory FACTORY = new Emitter.Factory() {
            @Override
            public void emit( Emitter emitter, int index, float x, float y ) {
                ((EarthElementParticle)emitter.recycle( EarthElementParticle.class )).reset( x, y );
            }
            @Override
            public boolean lightMode() {
                return false;
            }
        };

        public EarthElementParticle() {
            super();

            color(0x29CC29);
        }
    }
}
