package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.ranged;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaExplosionParticle;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaStormParticle;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.watabou.noosa.Camera;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Random;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaFieldParticle;

public class MagicSingularity extends RangedCodex {
    {
        tier = 5;
        image = ItemSpriteSheet.CODEX_SINGULARITY;
        magicImage = ItemSpriteSheet.MAGIC_SINGULARITY;

        baseUses = 10;
    }

    private static boolean isEnemyMob(Char ch) {
        return ch instanceof Mob
                && ((Mob) ch).alignment == Char.Alignment.ENEMY;
    }

    private int lastAimCell = -1;


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

        int cell = (defender != null) ? defender.pos : lastAimCell;

        if (cell < 0) cell = attacker.pos;

        explodeAt(attacker, cell, result);
        return result;
    }

    // 예시: 지면에 닿았을 때도 발동
    @Override
    protected void onThrow(int cell) {
        lastAimCell = cell;                // 마지막 겨냥 칸 기록
        explodeAt(Dungeon.hero, cell, 0);  // 빈 칸이라도 무조건 발동
        super.onThrow(cell);               // 원래 로직 유지 시
    }

    public void onMiss(Char attacker, Char defender) {
        // 미스 시에도 동일하게 폭발
        int cell = (defender != null) ? defender.pos : lastAimCell;
        if (cell < 0) cell = attacker.pos;
        explodeAt(attacker, cell, 0); // 데미지 기반이 필요 없으면 0 또는 고정값
    }


    private void explodeAt(Char attacker, int center, int baseDamage) {
        // 화면 흔들림 & 사운드
        Camera.main.shake(3, 0.25f);
        Sample.INSTANCE.play(Assets.Sounds.BLAST);

        int w = Dungeon.level.width();
        int h = Dungeon.level.height();
        int cx = center % w;
        int cy = center / w;

        // 7x7(반경 3) 원형 폭발
        final int radius = 3;
        final int r2 = radius * radius;
        for (int dy = -radius; dy <= radius; dy++) {
            for (int dx = -radius; dx <= radius; dx++) {
                if (dx*dx + dy*dy > r2) continue;
                int x = cx + dx;
                int y = cy + dy;
                if (x < 0 || y < 0 || x >= w || y >= h) continue;

                int c = x + y * w;

                int count = (dx == 0 && dy == 0) ? 14 : 8;
                CellEmitter.center(c).burst(ManaExplosionParticle.FACTORY, count);

                // 추가 연출: ManaStormParticle 대형 분출
                int countStorm = (dx == 0 && dy == 0) ? 24 : 12;
                CellEmitter.center(c).burst(ManaStormParticle.FACTORY, countStorm);

                // 해당 칸에 캐릭터가 있으면 주변 피해
                Char ch = Actor.findChar(c);
                if (ch != null && ch != attacker) {
                    int aoe = Math.max(1, baseDamage / 2 + Random.NormalIntRange(-2, 2));
                    ch.damage(aoe, this);
                }
            }
        }

        // 폭발 이후 5턴 동안 중력장 전개
        spawnGravityWell(center, baseDamage);
    }
    /** 7x7(반경 3) 중력장: 5턴 지속, 매턴 데미지 + 중심으로 끌어당김 */
    private static void spawnGravityWell(int center, int baseDamage) {
        final int radius = 3;
        final int duration = 5;
        final int perTurnDamage = Math.max(1, Math.round(baseDamage * 0.40f));
        com.shatteredpixel.shatteredpixeldungeon.actors.Actor.add(new GravityWellActor(center, radius, duration, perTurnDamage));
    }

    private static class GravityWellActor extends com.shatteredpixel.shatteredpixeldungeon.actors.Actor {
        private final int center;
        private final int radius;
        private int remainingTurns;
        private final int damagePerTurn;

        private final java.util.HashMap<Integer, com.watabou.noosa.particles.Emitter> emitters = new java.util.HashMap<>();
        private final int width;

        GravityWellActor(int center, int radius, int duration, int damagePerTurn) {
            this.center = center;
            this.radius = radius;
            this.remainingTurns = duration;
            this.damagePerTurn = damagePerTurn;
            this.width = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width();

            for (int c : areaCells(center, radius)) {
                com.watabou.noosa.particles.Emitter e =
                        com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter.get(c);
                e.pour(ManaFieldParticle.FACTORY, 0.08f);
                emitters.put(c, e);
            }
        }

        @Override
        protected boolean act() {
            // 1) 데미지
            for (int c : areaCells(center, radius)) {
                com.shatteredpixel.shatteredpixeldungeon.actors.Char ch =
                        com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c);
                if (ch != null && ch.isAlive()
                        && isEnemyMob(ch)) {
                    int dmg = com.watabou.utils.Random.NormalIntRange(
                            Math.max(1, Math.round(damagePerTurn * 0.8f)),
                            Math.max(1, Math.round(damagePerTurn * 1.2f))
                    );
                    ch.damage(dmg, this);
                }
            }

            // 2) 끌어당김
            pullTargetsTowardCenter();

            // 3) 지속 처리
            remainingTurns--;
            if (remainingTurns <= 0) {
                stopAllEmitters();
                com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter.center(center)
                        .burst(ManaFieldParticle.FACTORY, 12);
                Actor.remove(this);
                return true;
            }

            spend(TICK);
            return true;
        }


        private void stopAllEmitters() {
            for (com.watabou.noosa.particles.Emitter e : emitters.values()) {
                if (e != null) e.on = false; // pour 중단
            }
            emitters.clear();
        }

        /** 한 턴에 1칸씩 중심 쪽으로 이동 */
        private void pullTargetsTowardCenter() {
            for (int c : areaCells(center, radius)) {
                com.shatteredpixel.shatteredpixeldungeon.actors.Char ch =
                        com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c);
                if (ch == null || !ch.isAlive()
                        || !isEnemyMob(ch)) continue;
                if (ch.pos == center) continue;

                int newPos = stepToward(ch.pos, center);
                if (newPos != ch.pos && isWalkable(newPos)
                        && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(newPos) == null) {

                    int old = ch.pos;
                    ch.pos = newPos;
                    ch.sprite.move(old, newPos);
                    com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.occupyCell(ch);
                }
            }
        }

        private int stepToward(int from, int to) {
            int best = from;
            float bestDist = distSq(from, to);
            final int[] dirs = { -1, +1, -width, +width, -width-1, -width+1, +width-1, +width+1 };
            for (int d : dirs) {
                int n = from + d;
                if (!inBounds(n)) continue;
                if (!isWalkable(n)) continue;
                float nd = distSq(n, to);
                if (nd < bestDist) {
                    bestDist = nd;
                    best = n;
                }
            }
            return best;
        }

        private boolean inBounds(int p) {
            return p >= 0 && p < com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.length();
        }

        private boolean isWalkable(int p) {
            return com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.passable[p];
        }

        private float distSq(int a, int b) {
            int ax = a % width, ay = a / width;
            int bx = b % width, by = b / width;
            int dx = ax - bx, dy = ay - by;
            return dx*dx + dy*dy;
        }

        private java.util.ArrayList<Integer> areaCells(int c, int r) {
            java.util.ArrayList<Integer> out = new java.util.ArrayList<>();
            int cx = c % width, cy = c / width;
            int h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.height();
            int r2 = r * r;
            for (int dy = -r; dy <= r; dy++) {
                for (int dx = -r; dx <= r; dx++) {
                    int x = cx + dx, y = cy + dy;
                    if (x < 0 || x >= width || y < 0 || y >= h) continue;
                    if (dx*dx + dy*dy <= r2) {
                        out.add(y * width + x);
                    }
                }
            }
            return out;
        }
    }

}

