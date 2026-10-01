
package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.effects.Pushing;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.SpiritBow;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.watabou.noosa.audio.Sample;

/**
 * MagicRampage — 찌르기 전용 돌진 코덱스
 *
 *  - 전방 5칸 이내에서 하나를 지정해 돌진
 *  - 지정 블록까지 이동하는 경로상의 모든 적에게 피해
 *  - selectCell으로 목표를 지정하면 onCast가 실행
 *  - Ballistica(STOP_TERRAIN)로 경로 계산 후 최대 RANGE만큼 절삭
 *  - 경로에 있는 적에게 순차적으로 피해를 주고, 마지막 유효 지점으로 영웅 이동
 *  - 벽/장애물은 통과하지 않음
 */
public class MagicRampage extends MeleeCodex {
    private CellSelector.Listener rampageSelector = new CellSelector.Listener(){
        @Override
        public void onSelect(Integer cell){
            if (cell == null) return;
            Hero h = (curUser instanceof Hero) ? (Hero)curUser : Dungeon.hero;
            curUser = h;
            onCast(h, cell);
        }
        @Override
        public String prompt(){
            return Messages.get(SpiritBow.class, "prompt");
        }
    };

    public static final String AC_RAMPAGE = "rampage";

    /** 최대 돌진 거리 */
    public static final int RANGE = 5;
    /** 다음 공격 애니메이션을 찌르기로 강제 */
    private boolean nextAnimStab = true;

    {
        tier = 1;
        image = ItemSpriteSheet.CODEX_RAMPAGE;
        magicImage = ItemSpriteSheet.MAGIC_RAMPAGE;
        baseUses = 40;
    }
    public int min(int lvl) {
        return 2 + tier + lvl;
    }
    public int max(int lvl) {
        return 6 * (tier + 1) + lvl * (tier + 1);
    }
    public float castDelay() {
        // 즉발 느낌을 주되 이동 연출 여유 조금
        return 0.2f;
    }
    public String desc() {
        return Messages.get(this, "desc",
                RANGE);
    }
    protected void onCast(Hero hero, int cell) {
        curItem = this;
        beforeUse();

        if (hero == null) return;

        if (curUser == null) curUser = hero;
        // 모든 직선 방향 허용: 브레젠험으로 경로 구성(반지름 RANGE 이내, 차단 지형 앞까지)
        java.util.List<Integer> path = buildLineAnyDir(hero.pos, cell, RANGE);

        if (path.isEmpty()){
            GLog.w(Messages.get(this, "need_line")); // 직선 경로가 필요합니다.
            hero.spendAndNext(0f);
            return;
        }


        // 마법 이미지(검기) 연출: Stab 애니메이션 (MagicSlash와 동일 스타일)
        try {
            int dir8 = dir8For(hero.pos, path.get(0));
            MagicImageAnimator.stab(hero.sprite, ItemSpriteSheet.MAGIC_SLASH, dir8);
        } catch (Throwable ignored) { /* 연출 실패해도 시전은 계속 */ }
        int lastWalkable = hero.pos;

        for (int c : path){
            // 적 타격
            Char ch = Actor.findChar(c);
            if (ch != null && ch != hero && ch.alignment != hero.alignment) {
                dealPathDamage(hero, ch);
            }
            lastWalkable = c;
        }

        // 이동: 밀쳐내기 이펙트로 자연스럽게
        if (lastWalkable != hero.pos) {
            Sample.INSTANCE.play(Assets.Sounds.ATK_SWORD_SLASH1);
            try { Actor.add(new Pushing(hero, hero.pos, lastWalkable)); } catch (Throwable ignored) {}/* 안전 이동: sprite null-safe */
            hero.pos = lastWalkable;
            if (hero.sprite != null) hero.sprite.place(lastWalkable);
            Dungeon.level.occupyCell(hero);
            Dungeon.observe();
            GameScene.updateFog();
        }

        // 찌르기 전용 연출 플래그 (다음 한 번)
        nextAnimStab = true;

        // 소모
        afterUse();
    }

    /**
     * 경로상의 적에게 주는 피해 계산 및 적용.
     * 영웅의 힘/명중을 그대로 쓰기보단 코덱스 고유 피해로 단순화.
     */
    protected void dealPathDamage(Hero hero, Char enemy) {
        // 간단한 피해 공식: 무기 기본 롤 + 영웅 레벨의 일부
        int dmg = damageRoll(hero);
        // 경로 히트는 살짝 감소 (다수 타격 균형)
        dmg = Math.max(1, (int)Math.floor(dmg * 0.85f));

        enemy.damage(dmg, this);

        // 간단한 피격 피드백
        if (enemy.sprite != null) enemy.sprite.flash();
    }

    /**
     * 8방향 직선(가로/세로/대각) 위에 있는지 체크.
     */
    public static boolean isEightDirLine(int from, int to) {
        int w = Dungeon.level.width();
        int fx = from % w, fy = from / w;
        int tx = to % w, ty = to / w;
        int dx = tx - fx, dy = ty - fy;

        // 같은 칸
        if (dx == 0 && dy == 0) return false;

        // 가로/세로
        if (dx == 0 || dy == 0) return true;

        // 대각선 (기울기 절대값 1)
        return Math.abs(dx) == Math.abs(dy);
    }

    /**
     * 다음 1회 공격 연출이 "찌르기"가 되도록 신호.
     * (베이스가 onAttackComplete를 후킹한다는 가정)
     */

    // 필요 시 방향 0~7 계산 유틸
    public static int dir8For(int fromPos, int toPos) {
        int w = Dungeon.level.width();

        int fx = fromPos % w, fy = fromPos / w;
        int tx = toPos % w, ty = toPos / w;
        int dx = Integer.signum(tx - fx);
        int dy = Integer.signum(ty - fy);

        if (dx == 0 && dy == -1) return 0;   // N
        if (dx == 1 && dy == -1)  return 1;  // NE
        if (dx == 1 && dy == 0)   return 2;  // E
        if (dx == 1 && dy == 1)   return 3;  // SE
        if (dx == 0 && dy == 1)   return 4;  // S
        if (dx == -1 && dy == 1)  return 5;  // SW
        if (dx == -1 && dy == 0)  return 6;  // W
        if (dx == -1 && dy == -1) return 7;  // NW
        return 2; // fallback: E
    }

    @Override
    protected boolean allowNonAdjacentTarget(int from, int to){
        int w = Dungeon.level.width();
        int fx = from % w, fy = from / w;
        int tx = to % w, ty = to / w;
        int dx = Integer.signum(tx - fx);
        int dy = Integer.signum(ty - fy);

        // 8방향 직선 위 대상만 허용
        boolean onLine = (dx == 0 || dy == 0) || (Math.abs(tx - fx) == Math.abs(ty - fy));
        if (!onLine) return false;

        int steps = Math.max(Math.abs(tx - fx), Math.abs(ty - fy));
        if (steps > RANGE) return false;

        int x = fx, y = fy;
        for (int i = 0; i < steps; i++) {
            x += dx; y += dy;
            int c = x + y * w;
            if (!Dungeon.level.passable[c] && !Dungeon.level.avoid[c]) return false;
            if (c == to) break;
        }
        return true;
    }
    public java.util.ArrayList<String> actions(Hero hero){
        java.util.ArrayList<String> src = super.actions(hero);
        java.util.ArrayList<String> a = new java.util.ArrayList<>();
        // keep only standard non-activate actions
        if (src.contains(Item.AC_DROP)) a.add(Item.AC_DROP);
        if (src.contains(Item.AC_THROW)) a.add(Item.AC_THROW);
        // our single activate action
        if (!a.contains(AC_RAMPAGE)) a.add(AC_RAMPAGE);
        return a;
    }@Override
    public String defaultAction(){
        return AC_RAMPAGE;
    }
    /** 기본 근거리 코덱스 공격(주로 인접 대상 선택) 경로도 램페이지로 전환 */
    protected void onCodexAttack(Char enemy, int cell){
        Hero h = (curUser instanceof Hero) ? (Hero)curUser : Dungeon.hero;
        onCast(h, cell);
    }
    @Override
    public void execute(Hero hero, String action){
        if (AC_RAMPAGE.equals(action)){
// 전용 셀 선택: 빈 칸도 허용
            GameScene.selectCell(rampageSelector);
            return;
        }
        super.execute(hero, action);
    }

    /**
     * from->to를 향해 '모든 직선 방향'으로 브레젠험(Bresenham) 라인을 만든 뒤,
     * 지형 차단을 만나기 전까지, 그리고 반지름 maxRadius(유클리드) 이내까지만
     * 진행한 경로를 반환한다. 시작 칸(from)은 포함하지 않는다.
     */
    /** [ADD] 모든 직선 방향(임의 각도) 브레젠험 라인 빌더. 반지름 maxRadius 이내에서 차단 앞까지 진행. */
    private java.util.List<Integer> buildLineAnyDir(int from, int to, int maxRadius){
        java.util.ArrayList<Integer> path = new java.util.ArrayList<>();
        Level level = Dungeon.level;
        int w = level.width();

        int fx = from % w, fy = from / w;
        int tx = to   % w, ty = to   / w;

        int dx = tx - fx;
        int dy = ty - fy;
        if (dx == 0 && dy == 0) return path;

        int r2 = maxRadius * maxRadius;
        int d2 = dx*dx + dy*dy;
        if (d2 > r2){
            float len = (float)Math.sqrt(d2);
            float ux = dx / len;
            float uy = dy / len;
            tx = Math.round(fx + ux * maxRadius);
            ty = Math.round(fy + uy * maxRadius);
        }

        int x0 = fx, y0 = fy;
        int x1 = tx, y1 = ty;
        int adx = Math.abs(x1 - x0);
        int ady = Math.abs(y1 - y0);
        int sx = x0 < x1 ? 1 : -1;
        int sy = y0 < y1 ? 1 : -1;
        int err = adx - ady;

        while (true){
            if (x0 == x1 && y0 == y1) break;
            int e2 = err << 1;
            if (e2 > -ady){ err -= ady; x0 += sx; }
            if (e2 <  adx){ err += adx; y0 += sy; }

            int c = x0 + y0 * w;
            if (!level.passable[c] && !level.avoid[c]) break; // 차단
            path.add(c);
        }
        return path;
    }
}
