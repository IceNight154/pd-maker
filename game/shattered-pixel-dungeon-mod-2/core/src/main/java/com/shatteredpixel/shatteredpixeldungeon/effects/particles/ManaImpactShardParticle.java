package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaImpactShardParticle extends PixelParticle {

    private static final int COLOR = 0x38ABAB;

    public static final Emitter.Factory FACTORY = new Factory();

    private float baseSize;
    private float phase, freq;

    public ManaImpactShardParticle() {
        super();
        color(COLOR);
        am = 0f;
    }

    public void reset(float x, float y){
        revive();

        // 임팩트 중앙에서 아주 소량 오프셋
        this.x = x + Random.Float(-2f, 2f);
        this.y = y + Random.Float(-2f, 2f);

        // 짧고 강하게 튀었다가 사그라짐
        left = lifespan = Random.Float(0.22f, 0.36f);

        float ang = Random.Float(0f, (float)(Math.PI * 2.0));
        float v   = Random.Float(140f, 220f);
        speed.polar(ang, v);

        // 강한 마찰(빠르게 감속)
        acc.set(-speed.x * 7f, -speed.y * 7f);

        baseSize = Random.Float(1.2f, 2.2f);
        size(baseSize);

        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        freq  = Random.Float(10f, 16f);
    }

    @Override
    public void update() {
        super.update();

        float p   = left / lifespan; // 1→0
        float age = lifespan - left;

        // 시작 매우 밝음 → 급히 감소 (파편 느낌)
        float t = 1f - p;
        float env = Math.max(0f, 1f - t * 1.6f);

        float flicker = 0.8f + 0.2f * (float)Math.sin(phase + age * freq);
        am = Math.max(0f, Math.min(1f, flicker * env));

        // 살짝 커졌다가 줄어드는 꼬리
        float stretch = 0.9f + 0.4f * (1f - p);
        size(baseSize * stretch);
    }

    public static class Factory extends Emitter.Factory {
        @Override public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaImpactShardParticle) emitter.recycle(ManaImpactShardParticle.class)).reset(x, y);
        }
        @Override public boolean lightMode() { return true; }
    }
}
