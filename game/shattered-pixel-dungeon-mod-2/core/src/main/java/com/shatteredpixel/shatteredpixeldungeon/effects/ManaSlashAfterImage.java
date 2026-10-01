package com.shatteredpixel.shatteredpixeldungeon.effects;

import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.watabou.noosa.Group;
import com.watabou.noosa.tweeners.AlphaTweener;

public class ManaSlashAfterImage {

    private static final int TEAL = 0x38ABAB;

    /**
     * 칼 스프라이트의 잔상을 parent 그룹에 즉시 1장 추가.
     * @param parent   보통 owner.parent
     * @param itemIdx  MagicImageAnimator에 넘기는 magicImageIndex와 동일
     * @param x,y      원본 이미지의 (x,y)
     * @param angle    원본 이미지의 angle(도)
     * @param ox,oy    원본 이미지의 origin
     * @param sx,sy    원본 이미지의 scale
     * @param life     잔상이 사라지는 시간(초)
     * @param alpha    시작 알파(0~1)
     */
    public static void spawn(Group parent, int itemIdx,
                             float x, float y,
                             float angle,
                             float ox, float oy,
                             float sx, float sy,
                             float life,
                             float alpha) {

        ItemSprite ghost = new ItemSprite(itemIdx);
        ghost.x = x;
        ghost.y = y;
        ghost.angle = angle;
        ghost.origin.set(ox, oy);
        ghost.scale.set(sx, sy);

        // 푸른 마나 컬러 & 반투명
        ghost.hardlight(TEAL);
        ghost.am = alpha;

        parent.add(ghost);

        // life 동안 알파 0까지 페이드 후 제거
        parent.add(new AlphaTweener(ghost, 0f, Math.max(0.01f, life)) {
            @Override
            protected void onComplete() {
                ghost.killAndErase();
            }
        });
    }

    // 기본 프리셋(추천값)
    public static void spawn(Group parent, int itemIdx,
                             float x, float y,
                             float angle,
                             float ox, float oy,
                             float sx, float sy) {
        spawn(parent, itemIdx, x, y, angle, ox, oy, sx, sy,
                0.18f + (float)Math.random() * 0.04f, // 0.18~0.22s
                0.42f);                                // 시작 알파
    }
}
