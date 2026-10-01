
package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

/**
 * ManaSlashParticle
 *
 * - MagicImageAnimator에서 요구하는 FACTORY 심볼 제공
 * - 외부 엔진 버전에 따른 Emitter.Factory 시그니처 차이를 흡수하기 위해
 *   @Override 애너테이션을 제거하고, 넓은 호환 메서드를 제공합니다.
 */
public class ManaSlashParticle extends PixelParticle {

    /** MagicImageAnimator에서 참조하는 정적 팩토리 */
    public static final Emitter.Factory FACTORY = new Emitter.Factory() {
        // 기본 시그니처 (대부분의 빌드에서 요구)
        public void emit(Emitter emitter, int index, float x, float y) {
            ManaSlashParticle p = (ManaSlashParticle) emitter.recycle(ManaSlashParticle.class);
            p.reset(x, y);
        }

        // 각도/속도 지정형 시그니처를 사용하는 빌드 대응 (필수는 아님)
        public void emit(Emitter emitter, int index, float x, float y, float angle, float speed) {
            ManaSlashParticle p = (ManaSlashParticle) emitter.recycle(ManaSlashParticle.class);
            p.reset(x, y, angle, speed);
        }

        // 일부 빌드에서 라이트 모드 지원
        public boolean lightMode() { return true; }
    };

    private static final int COLOR = 0xFF38ABAB; // ARGB: 물빛 마나
    private static final float LIFESPAN_MIN = 0.20f;
    private static final float LIFESPAN_MAX = 0.35f;

    public ManaSlashParticle() {
        super();
        color(COLOR);
        size(2);
        lifespan = Random.Float(LIFESPAN_MIN, LIFESPAN_MAX);
    }

    /** 무작위 산포 리셋 */
    public void reset(float x, float y) {
        revive();
        this.x = x;
        this.y = y;

        left = lifespan = Random.Float(LIFESPAN_MIN, LIFESPAN_MAX);
        am = 1f;

        // 약한 원형 산포 속도
        float ang = Random.Float((float)(Math.PI * 2));
        float spd = Random.Float(16f, 32f);
        speed.polar(ang, spd);

        // 살짝 위로 뜨는 느낌 (중력 반대)
        acc.set(0, -20f);
    }

    /** 각도/속도 지정 리셋 */
    public void reset(float x, float y, float angle, float spd) {
        revive();
        this.x = x;
        this.y = y;

        left = lifespan = Random.Float(LIFESPAN_MIN, LIFESPAN_MAX);
        am = 1f;

        speed.polar(angle, spd);
        acc.set(0, -20f);
    }

    @Override
    public void update() {
        super.update();
        // 남은 시간에 비례해 부드럽게 사라짐
        float p = left / lifespan;
        am = p;
        // 끝에서 더 작아지도록
        float s = 1f + (1f - p) * 0.5f;
        size(s * 2f);
    }
}
