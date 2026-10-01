package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaImpactDustParticle extends PixelParticle {

    private static final int COLOR = 0x38ABAB;

    public static final Emitter.Factory FACTORY = new Factory();

    private float baseSize;
    private float phase, freq;
    private float reAimT;

    public ManaImpactDustParticle() {
        super();
        color(COLOR);
        am = 0f;
    }

    public void reset(float x, float y){
        revive();

        // 바닥에서 낮게 번지는 느낌
        this.x = x + Random.Float(-4f, 4f);
        this.y = y + Random.Float(-2f, 2f);

        // 더 길게 남아 ‘먼지 링’ 보정
        left = lifespan = Random.Float(0.60f, 1.00f);

        float ang = Random.Float(0f, (float)(Math.PI * 2.0));
        float v   = Random.Float(20f, 45f);
        speed.polar(ang, v);

        // 약한 감속
        acc.set(-speed.x * 0.8f, -speed.y * 0.8f);

        baseSize = Random.Float(1.0f, 1.8f);
        size(baseSize);

        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        freq  = Random.Float(5f, 8f);
        reAimT = Random.Float(0.20f, 0.40f);
    }

    @Override
    public void update() {
        super.update();

        float p   = left / lifespan; // 1→0
        float age = lifespan - left;

        // 은은한 깜빡임 + 부드러운 등장/퇴장
        float flicker = 0.35f + 0.25f * (float)Math.sin(phase + age * freq);
        float env;
        if      (p < 0.12f) env = p / 0.12f;
        else if (p > 0.85f) env = (1f - p) / 0.15f;
        else                env = 1f;
        am = Math.max(0f, Math.min(1f, flicker * env));

        // 드물게 방향 미세 보정(과도한 회전 방지)
        reAimT -= Random.Float(0.015f, 0.030f);
        if (reAimT <= 0f) {
            reAimT = Random.Float(0.20f, 0.40f);
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float v   = Random.Float(6f, 12f);
            speed.x = speed.x * 0.90f + (float)Math.cos(ang) * v * 0.10f;
            speed.y = speed.y * 0.90f + (float)Math.sin(ang) * v * 0.10f;
            acc.set(-speed.x * 0.8f, -speed.y * 0.8f);
        }
    }

    public static class Factory extends Emitter.Factory {
        @Override public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaImpactDustParticle) emitter.recycle(ManaImpactDustParticle.class)).reset(x, y);
        }
        @Override public boolean lightMode() { return true; }
    }
}
