package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaImpactRingSparkParticle extends PixelParticle {

    private static final int COLOR = 0x38ABAB;

    public static final Emitter.Factory FACTORY = new Factory();

    private float baseSize;
    private float phase, freq;

    public ManaImpactRingSparkParticle() {
        super();
        color(COLOR);
        am = 0f;
    }

    public void reset(float cx, float cy){
        revive();

        // 중심에서 약간 바깥에서 시작 → 링 테두리 강조
        float ang = Random.Float(0f, (float)(Math.PI * 2.0));
        float r   = Random.Float(3f, 6f);
        this.x = cx + (float)Math.cos(ang) * r;
        this.y = cy + (float)Math.sin(ang) * r;

        // 링은 좀 더 길게 보이도록
        left = lifespan = Random.Float(0.25f, 0.45f);

        // 바깥 방향으로만 빠르게
        float v = Random.Float(90f, 160f);
        speed.polar(ang, v);

        // 감속은 약하게: 링이 퍼지며 유지되도록
        acc.set(-speed.x * 1.2f, -speed.y * 1.2f);

        baseSize = Random.Float(1.0f, 1.6f);
        size(baseSize);

        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        freq  = Random.Float(9f, 13f);
    }

    @Override
    public void update() {
        super.update();

        float p   = left / lifespan;       // 1→0
        float age = lifespan - left;

        // 초반 밝고 → 중반 유지 → 말미 급감 (링 잔광)
        float env;
        if      (p < 0.10f) env = p / 0.10f;
        else if (p > 0.80f) env = (1f - p) / 0.20f;
        else                env = 1f;

        float flicker = 0.75f + 0.25f * (float)Math.sin(phase + age * freq);
        am = Math.max(0f, Math.min(1f, flicker * env));

        // 살짝 커지며 퍼지는 느낌
        float pulse = 1.0f + (1.0f - p) * 0.35f;
        size(baseSize * pulse);
    }

    public static class Factory extends Emitter.Factory {
        @Override public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaImpactRingSparkParticle) emitter.recycle(ManaImpactRingSparkParticle.class)).reset(x, y);
        }
        @Override public boolean lightMode() { return true; }
    }
}
