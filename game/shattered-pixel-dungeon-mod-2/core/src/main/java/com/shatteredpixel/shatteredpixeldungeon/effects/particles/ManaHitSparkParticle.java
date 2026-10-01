package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaHitSparkParticle extends PixelParticle {

    // #38abab
    private static final int COLOR = 0x38ABAB;

    // 외부에서 바로 쓸 수 있는 팩토리(싱글턴)
    public static final Emitter.Factory FACTORY = new Factory();

    public static Emitter.Factory factory() { return FACTORY; }

    private float baseSize;

    public ManaHitSparkParticle() {
        super();
        color(COLOR);
        am = 0f; // 알파는 update에서 제어
    }

    public void reset(float x, float y) {
        revive();

        this.x = x;
        this.y = y;

        // 아주 짧은 수명: 피격 스파크 느낌
        left = lifespan = Random.Float(0.18f, 0.28f);

        // 강하게 흩뿌려짐: 초기 속도 큼 + 강한 감속
        float angle = Random.Float(0f, (float)(Math.PI * 2.0));
        float vel   = Random.Float(70f, 140f);
        speed.polar(angle, vel);

        // 빠르게 감속해 초반에만 멀리 튀고 곧 사그라짐
        acc.set(-speed.x * 8f, -speed.y * 8f);

        // 더 작게: 1~2px 정도
        baseSize = Random.Float(1.0f, 2.0f);
        size(baseSize);
    }

    @Override
    public void update() {
        super.update();

        // 남은 비율: 1 -> 0
        float p = left / lifespan;

        // 빠른 페이드-인(첫 10%), 이후 가속 페이드-아웃
        float t = 1f - p; // 경과 비율
        if (t < 0.1f) {
            am = t / 0.1f;       // 0→1로 급히 밝아짐
        } else {
            am = p * p;          // 곡선형으로 빠르게 어두워짐
        }

        // 살짝 줄어드는 크기(초반이 조금 더 큼)
        size(baseSize * (0.7f + 0.3f * p));
    }

    /** Emitter용 팩토리 */
    public static class Factory extends Emitter.Factory {
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaHitSparkParticle) emitter.recycle(ManaHitSparkParticle.class)).reset(x, y);
        }

        @Override
        public boolean lightMode() {
            // 가산합성: 푸른 마나 스파크가 번쩍이는 느낌
            return true;
        }
    }
}
