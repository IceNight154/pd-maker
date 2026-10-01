package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaExplosionParticle extends PixelParticle {

    // #38abab
    private static final int COLOR = 0x38ABAB;

    // 외부에서 바로 쓰는 정적 팩토리(싱글턴)
    public static final Emitter.Factory FACTORY = new Factory();
    // (선택) 게터
    public static Emitter.Factory factory() { return FACTORY; }

    public ManaExplosionParticle() {
        super();
        color(COLOR);
        am = 0f; // 알파는 update에서 제어
    }

    public void reset(float x, float y) {
        revive();

        this.x = x;
        this.y = y;

        // 수명: 짧고 강하게
        left = lifespan = Random.Float(0.35f, 0.6f);

        // 사방으로 강하게 퍼짐
        float angle = Random.Float(0f, (float)(Math.PI * 2.0));
        float vel   = Random.Float(40f, 90f);
        speed.polar(angle, vel);

        // 점차 감속(마찰 느낌)
        acc.set(-speed.x * 3f, -speed.y * 3f);

        // 크기 약간 랜덤
        size(Random.IntRange(2, 5));
    }

    @Override
    public void update() {
        super.update();

        float p = left / lifespan; // 남은 비율 1→0

        // 초반 급히 밝아지고 이후 서서히 사그라듦
        if (p > 0.8f) {
            am = (1f - p) * 5f;     // 페이드-인
        } else {
            am = p * 0.9f;          // 페이드-아웃
        }

        // 살짝 커졌다가 줄어드는 느낌
        size((0.5f + p * 0.5f) * 6f);
    }

    /** Emitter에서 쓰기 위한 팩토리 */
    public static class Factory extends Emitter.Factory {
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaExplosionParticle) emitter.recycle(ManaExplosionParticle.class)).reset(x, y);
        }

        @Override
        public boolean lightMode() {
            // 가산합성으로 휘황한 마나 느낌
            return true;
        }
    }
}
