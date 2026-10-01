package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Roots;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaImpactDustParticle;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaImpactRingSparkParticle;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaImpactShardParticle;
import com.watabou.noosa.Camera;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Random;

import java.util.ArrayList;

/**
 * MagicGavel – 8방향 CHARGE/SMASH 통합 + AoE 파편 파티클
 *
 * - Codex.beforeUse()/afterUse() 컨텍스트 보장
 * - 차징 중 이동불가
 * - 스매시 시 3x3 범위에 Dust/Shard/RingSpark 파티클 방출
 * - 모든 "차징 시작" 경로에서 반드시 CHARGE 애니메이션 + ATK_CHARGE 사운드 재생
 */
public class MagicGavel extends MeleeCodex {

    public static final String AC_CHARGE = "CHARGE";

    {
        tier = 1;
        image = ItemSpriteSheet.CODEX_GAVEL;
        magicImage = ItemSpriteSheet.MAGIC_GAVEL;
        baseUses = 50;
    }

    @Override
    public ArrayList<String> actions(Hero hero) {
        ArrayList<String> base = super.actions(hero);
        ArrayList<String> out = new ArrayList<>();
        for (String a : base) if (AC_DROP.equals(a) || AC_THROW.equals(a)) out.add(a);
        out.add(AC_CHARGE);
        return out;
    }

    @Override public String defaultAction() { return AC_CHARGE; }

    @Override
    public void execute(final Hero hero, String action) {
        if (!AC_CHARGE.equals(action)) { super.execute(hero, action); return; }

        final ChargedSmash buff = hero.buff(ChargedSmash.class);

        // 차징 시작: 버프 부여 + 1턴 소모
        // 애니메이션/사운드는 Buff.attachTo()에서 일괄 처리하여 어떤 경로든 보장
        if (buff == null) {
            Buff.affect(hero, ChargedSmash.class);
            hero.spendAndNext(1f);
            return;
        }

        // 차징 해제(발동): 방향 선택 → SMASH 처리
        if (buff.turns >= 1) {
            GameScene.selectCell(new CellSelector.Listener() {
                @Override public String prompt()  {
                    return Messages.get(MagicGavel.this, "prompt");
                }
                @Override
                public void onSelect(Integer cell) {
                    if (cell == null) {
                        // 선택 취소: 아무 것도 하지 않음(컨텍스트도 건드리지 않음)
                        return;
                    }

                    int center = frontCellFor(hero.pos, cell);

                    // === 실제 사용 구간: Codex 컨텍스트를 정확히 세팅 후 실행 ===
                    withCodexContext(hero, new Runnable() {
                        @Override public void run() {
                            playSmashAnim(hero, center);
                            doSmashAoE(hero, center, buff.turns);
                            spawnImpactParticles(center, buff.turns);
                            buff.detach();
                        }
                    });
                }
            });
            return;
        }

        super.execute(hero, action);
    }

    /** Codex 컨텍스트 안전 호출자: curUser/curItem 세팅→beforeUse→body→afterUse→정리 */
    private void withCodexContext(Hero hero, Runnable body){
        try {
            Codex.curUser = hero;
            Codex.curItem = this;
            beforeUse();
            if (body != null) body.run();
        } finally {
            try { afterUse(); } catch (Throwable ignore) {}
            Codex.curUser = null;
            Codex.curItem = null;
        }
    }

    /** hero.pos -> toPos 방향의 바로 앞 1칸을 반환 */
    private static int frontCellFor(int fromPos, int toPos){
        int w = Dungeon.level.width();
        int fx = fromPos % w, fy = fromPos / w;
        int tx = toPos % w, ty = toPos / w;
        int dx = Integer.signum(tx - fx);
        int dy = Integer.signum(ty - fy);
        int nx = fx + dx, ny = fy + dy;
        int cell = nx + ny * w;
        return Dungeon.level.insideMap(cell) ? cell : fromPos;
    }

    /** 3x3 AoE: center = 전방 1칸 */
    private void doSmashAoE(Hero hero, int center, int chargeTurns){
        int base = 2 + 2 * tier;
        float mult = 1f + 0.5f * Math.max(0, Math.min(5, chargeTurns) - 1); // 1~5턴 → x1.0~x3.0
        float usesFactor = 1f + (Math.max(0, baseUses) / 200f);             // 50→+0.25, 100→+0.5
        int dmg = Math.round(base * mult * usesFactor);

        int w = Dungeon.level.width();
        int cx = center % w, cy = center / w;
        boolean hit = false;

        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
            int x = cx + dx, y = cy + dy, cell = x + y * w;
            if (!Dungeon.level.insideMap(cell)) continue;
            Char ch = Actor.findChar(cell);
            if (ch != null && ch.alignment == Char.Alignment.ENEMY){
                ch.damage(dmg, this);
                hit = true;
            }
        }

        Sample.INSTANCE.play(hit ? Assets.Sounds.ATK_SMASH : Assets.Sounds.MISS, 1f, 1f);
        screenShakeOnImpact(hit, chargeTurns);
    }

    /**
     * 스매시 임팩트 시, 3x3 범위에 파편 파티클 방출
     * - Dust: 바닥에서 피어오르는 가루
     * - Shard: 마나 조각 파편
     * - RingSpark: 중심 링 스파크 (센터 1회 크게)
     */
    private void spawnImpactParticles(int center, int chargeTurns){
        try {
            int w = Dungeon.level.width();
            int cx = center % w, cy = center / w;

            // 센터 링 스파크: 차징 길수록 조금 더 풍성하게
            int ringN = 10 + 3 * Math.min(5, Math.max(1, chargeTurns));
            CellEmitter.center(center).burst(ManaImpactRingSparkParticle.FACTORY, ringN);

            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++){
                int x = cx + dx, y = cy + dy, cell = x + y * w;
                if (!Dungeon.level.insideMap(cell)) continue;

                int dust = Random.Int(3, 5) + chargeTurns;   // 4~10개 정도
                int shard = Random.Int(1, 2) + (chargeTurns >= 3 ? 1 : 0); // 1~3개 정도

                CellEmitter.center(cell).burst(ManaImpactDustParticle.FACTORY, dust);
                CellEmitter.center(cell).burst(ManaImpactShardParticle.FACTORY, shard);
            }
        } catch (Throwable ignore) {
            // 파티클 클래스/팩토리 부재 시 조용히 무시
        }
    }

    /** 화면 흔들림(카메라 쉐이크): 명중 시 강하게, 빗나감 시 약하게. 차징 길수록 강도/지속 증가 */
    private void screenShakeOnImpact(boolean hit, int chargeTurns){
        try {
            int lv = Math.min(5, Math.max(1, chargeTurns));
            float intensityBase = hit ? 1.2f : 0.6f;           // 기본 강도
            float intensity = Math.min(intensityBase + 0.25f*(lv-1), 2.2f); // 최대치 클램프
            float duration  = 0.07f + 0.02f*(lv-1);            // 0.07 ~ 0.15초
            Camera.main.shake(intensity, duration);
        } catch (Throwable ignore) {}
    }

    /** 차징 버프: 1~5까지 누적, 붙어있는 동안 이동불가 유지 */
    public static class ChargedSmash extends Buff {
        public int turns = 0;
        @Override public boolean attachTo(Char target) {
            if (!super.attachTo(target)) return false;
            Buff.prolong(target, Roots.class, TICK + 0.01f);
            // 어떤 경로로든 차징 버프가 붙는 순간: 애니메이션 + 사운드 보장
            if (target instanceof Hero){
                playChargeStart((Hero)target);
            } else {
                try { Sample.INSTANCE.play(Assets.Sounds.ATK_CHARGE, 1f, 1f); } catch (Throwable ignore) {}
            }
            return true;
        }
        @Override public boolean act() {
            spend(TICK);
            if (turns < 5) turns++;
            Buff.prolong(target, Roots.class, TICK + 0.01f);
            return true;
        }
        @Override public int icon() { return BuffIndicator.CHARGE; }
        @Override public float iconFadePercent() { return 1f - (Math.min(5, Math.max(0, turns)) / 5f); }
        @Override public String iconTextDisplay() { return Integer.toString(Math.min(5, Math.max(1, turns))); }
        @Override public void detach(){ Buff.detach(target, Roots.class); super.detach(); }
    }

    /* ========================= 애니메이션 유틸 ========================= */
    /** 모든 차징 시작 지점에서 공통 사용: CHARGE 모션 + ATK_CHARGE 사운드 */
    private static void playChargeStart(Hero hero){
        try {
            int dir8 = calcDir8TowardNearestEnemy(hero, 4); // 기본 남쪽
            MagicImageAnimator.charge(hero.sprite, ItemSpriteSheet.MAGIC_GAVEL, dir8);
        } catch (Throwable ignore) {}
        try { Sample.INSTANCE.play(Assets.Sounds.ATK_CHARGE, 1f, 1f); } catch (Throwable ignore) {}
    }

    private static int calcDir8TowardNearestEnemy(Hero hero, int fallback){
        try {
            int w = Dungeon.level.width();
            Char nearest = null; int best = 1<<30;
            for (Char c : Dungeon.level.mobs.toArray(new Char[0])){
                if (c.alignment != Char.Alignment.ENEMY) continue;
                int dx = (c.pos % w) - (hero.pos % w);
                int dy = (c.pos / w) - (hero.pos / w);
                int d = dx*dx + dy*dy;
                if (d < best){ best = d; nearest = c; }
            }
            if (nearest != null){
                int dx = Integer.signum((nearest.pos % w) - (hero.pos % w));
                int dy = Integer.signum((nearest.pos / w) - (hero.pos / w));
                return dir8FromDelta(dx, dy);
            }
        } catch (Throwable ignore) {}
        return fallback;
    }

    private void playSmashAnim(Hero hero, int center){
        try {
            int w = Dungeon.level.width();
            int hx = hero.pos % w, hy = hero.pos / w;
            int cx = center % w, cy = center / w;
            int dx = Integer.signum(cx - hx);
            int dy = Integer.signum(cy - hy);
            if (dx == 0 && dy == 0) dy = 1; // 방어적 기본값
            int dir8_ = dir8FromDelta(dx, dy);
            MagicImageAnimator.smash(hero.sprite, magicImage, dir8_);
        } catch (Throwable ignore) {}
    }

    /** dx,dy(-1..1) → 8방향 인덱스(0:N,1:NE,2:E,3:SE,4:S,5:SW,6:W,7:NW) */
    private static int dir8FromDelta(int dx, int dy){
        if (dx==0 && dy==0) return 4;
        if (dx>0 && dy<0) return 1;
        if (dx>0 && dy==0) return 2;
        if (dx>0 && dy>0) return 3;
        if (dx==0 && dy>0) return 4;
        if (dx<0 && dy>0) return 5;
        if (dx<0 && dy==0) return 6;
        if (dx<0 && dy<0) return 7;
        return 4;
    }
}
