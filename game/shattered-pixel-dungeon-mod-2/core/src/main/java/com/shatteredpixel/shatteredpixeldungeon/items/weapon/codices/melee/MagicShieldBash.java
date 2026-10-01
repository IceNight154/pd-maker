
package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Paralysis;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfBlastWave;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee.MagicImageAnimator;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.watabou.noosa.audio.Sample;
import com.watabou.noosa.particles.Emitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaBackShockwaveParticle;

/**
 * MagicSheildBash
 * - 1턴 1회 타격
 * - 공격 범위: 전방 1타일 이내(주 대상 1명만 타격)
 * - 히트 시 전방 2타일 내 모든 적을 2타일 동시 넉백 + 스턴(1턴)
 * - 모션/파티클: MagicImageAnimator.stab 유지
 * - 넉백: WandOfBlastWave.throwChar 로 처리
 * - 연출상 ‘맞고 → 밀림’이 아니라 ‘밀리기 시작하면서 데미지’가 보이도록
 *   넉백을 먼저 시작하고, 데미지는 다음 프레임에 적용
 */
public class MagicShieldBash extends MeleeCodex {

    {
        tier = 1;
        image = ItemSpriteSheet.CODEX_SHIELD_S;
        magicImage = ItemSpriteSheet.MAGIC_SHIELD_S;
        baseUses = 50;
    }

    @Override public int min(int lvl) { return tier + lvl; }
    @Override public int max(int lvl) { return 4 * (tier + 1) + lvl * (tier + 1); }

    /** 기본 공격 완료 훅 */
    @Override
    protected void onAttackComplete(Char enemy, int cell, boolean hit) {
        // 방향 계산
        final int dir8 = direction8(curUser.pos, cell);

        // MagicRampage 스타일: 전방 기준 magicImage 찌르기 연출
        try { MagicImageAnimator.stab(curUser.sprite, magicImage, dir8); } catch (Throwable ignored) {}

        // 전방 1~2칸 대상 수집
        final int step1 = stepFrom(curUser.pos, dir8, 1);
        final int step2 = stepFrom(curUser.pos, dir8, 2);
        Char t1 = getEnemyAt(step1);
        Char t2 = getEnemyAt(step2);

        // 주 대상 히트 처리: 넉백 "즉시 시작" + 다음 프레임에 데미지
        if (hit && enemy != null) {
            // 스턴 먼저
            Buff.affect(enemy, Paralysis.class, 1f);

            // 넉백을 먼저 시작(2칸, 충돌피해/추가피해 없음)
            startKnockback(enemy, dir8, 2, false);

            // 다음 프레임에서 피해를 적용하여, 시각적으로 넉백이 이미 시작된 상태에서 대미지가 뜨도록
            Actor.add(new Actor() {
                @Override protected boolean act() {
                    boolean h = curUser.codexAttack(enemy, MagicShieldBash.this);
                    if (h) {
                        Sample.INSTANCE.play(Assets.Sounds.ATK_SHIELD, 0.9f, 1.15f);
                        spawnBackShock(enemy.pos, dir8, 8);
                    } else {
                        Sample.INSTANCE.play(Assets.Sounds.MISS, 0.9f, 1.0f);
                    }
                    Actor.remove(this);
                    return true;
                }
            });
        }

        // 보조 대상들(전방 1~2칸) 동시 넉백 + 스턴 (추가 피해 없음)
        if (t1 != null && t1 != enemy) {
            Buff.affect(t1, Paralysis.class, 1f);
            startKnockback(t1, dir8, 2, false);
        }
        if (t2 != null && t2 != enemy && t2 != t1) {
            Buff.affect(t2, Paralysis.class, 1f);
            startKnockback(t2, dir8, 2, false);
        }
    }

    /** WandOfBlastWave 방식의 넉백 시작(즉시 애니메이션이 재생되도록) */
    private void startKnockback(Char ch, int dir8, int dist, boolean collideDmg) {
        if (ch == null || dist <= 0) return;
        int vec = neighbour(dir8);
        Ballistica traj = new Ballistica(ch.pos, ch.pos + vec * dist, Ballistica.MAGIC_BOLT);
        // collideDmg=false, stun=false, source=this
        try {
            WandOfBlastWave.throwChar(ch, traj, dist, collideDmg, false, this);
        } catch (Throwable t) {
            // 구버전 대응: 직접 위치 갱신(애니메이션 없이 즉시 이동)
            pushFallback(ch, dir8, dist);
        }
    }

    /** 구버전 호환용: 통과 지형만큼 즉시 위치 이동 */
    private void pushFallback(Char ch, int dir8, int dist) {
        int cur = ch.pos;
        for (int i = 0; i < dist; i++) {
            int next = stepFrom(cur, dir8, 1);
            if (next < 0 || !inside(next) || !Dungeon.level.passable[next]) break;
            cur = next;
        }
        if (cur != ch.pos) {
            int old = ch.pos;
            ch.move(cur);
            Dungeon.level.occupyCell(ch);
            if (ch.sprite != null) ch.sprite.move(old, cur);
        }
    }

    /** 뒤로 터지는 마나 충격파 파티클(연출 유지) */
    /** 뒤로 터지는 마나 충격파 파티클(시전 방향 반대쪽으로 콘 형태 분출) */
    private void spawnBackShock(int cell, int dir8, int n) {
        try {
            if (cell < 0 || !inside(cell)) return;

            // dir8 기준 각도(라디안) 계산: E=0, S=+π/2, W=π, N=-π/2
            float dirAngle = angleOfDir8Rad(dir8);

            // "뒤로" 터져나오므로 반대 방향으로 180° 보정
            float backAngle = dirAngle + (float)Math.PI;

            // 콘 형태로 분출 (반각 25°, 시작 오프셋 6px, 속도 범위 140~220)
            com.watabou.noosa.particles.Emitter e = CellEmitter.center(cell);
            e.burst(new ManaBackShockwaveParticle.ConeFactory(backAngle, 25f, 6f, 140f, 220f), n);

        } catch (Exception ignored) {}
    }


    // === 유틸 ===

    private Char getEnemyAt(int cell) {
        if (cell < 0) return null;
        Char c = Actor.findChar(cell);
        if (c == null) return null;
        if (c.alignment == Char.Alignment.ALLY || c.alignment == Char.Alignment.NEUTRAL) return null;
        return c;
    }

    private int stepFrom(int from, int dir8, int dist) {
        int w = Dungeon.level.width();
        int x = from % w, y = from / w;
        x += dirDx(dir8) * dist;
        y += dirDy(dir8) * dist;
        int to = y * w + x;
        return inside(to) ? to : -1;
    }

    private boolean inside(int cell) {
        return cell >= 0 && cell < Dungeon.level.length();
    }

    private static int neighbour(int dir8) {
        switch (dir8 & 7) {
            case 0: return -Dungeon.level.width();         // N
            case 1: return -Dungeon.level.width() + 1;     // NE
            case 2: return 1;                               // E
            case 3: return Dungeon.level.width() + 1;      // SE
            case 4: return Dungeon.level.width();          // S
            case 5: return Dungeon.level.width() - 1;      // SW
            case 6: return -1;                             // W
            case 7: return -Dungeon.level.width() - 1;     // NW
            default: return 0;
        }
    }

    private static int dirDx(int dir8){
        switch (dir8 & 7){
            case 0: case 1: case 7: return 0; // N/NE/NW
            case 2: case 3: return 1;         // E/SE
            case 5: case 6: return -1;        // SW/W
            case 4: default: return 0;        // S
        }
    }
    private static int dirDy(int dir8){
        switch (dir8 & 7){
            case 0: case 1: case 7: return -1; // N/NE/NW
            case 4: case 5: return 1;          // S/SW
            case 2: case 6: default: return 0; // E/W
        }
    }


    /** dir8(0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW) -> 라디안 각도
     *  화면 좌표계 기준: 오른쪽=0, 아래=+π/2, 왼쪽=π, 위=-π/2
     */
    private static float angleOfDir8Rad(int dir8){
        switch (dir8 & 7){
            case 0: return -(float)Math.PI * 0.5f; // N
            case 1: return -(float)Math.PI * 0.25f; // NE
            case 2: return 0f;                      // E
            case 3: return  (float)Math.PI * 0.25f; // SE
            case 4: return  (float)Math.PI * 0.5f;  // S
            case 5: return  (float)Math.PI * 0.75f; // SW
            case 6: return  (float)Math.PI;         // W
            case 7: default: return -(float)Math.PI * 0.75f; // NW
        }
    }




    private static int direction8(int from, int to){
        int w = Dungeon.level.width();
        int fx = from % w, fy = from / w;
        int tx = to % w, ty = to / w;
        int dx = Integer.compare(tx, fx);
        int dy = Integer.compare(ty, fy);
        if (dy < 0 && dx == 0) return 0;  // N
        if (dy < 0 && dx > 0)  return 1;  // NE
        if (dy == 0 && dx > 0) return 2;  // E
        if (dy > 0 && dx > 0)  return 3;  // SE
        if (dy > 0 && dx == 0) return 4;  // S
        if (dy > 0 && dx < 0)  return 5;  // SW
        if (dy == 0 && dx < 0) return 6;  // W
        if (dy < 0 && dx < 0)  return 7;  // NW
        return 2; // default E
    }


}