package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaBackShockwaveParticle extends PixelParticle {

    // 푸른 마나 색
    private static final int COLOR = 0x38ABAB;

    // (선택) 랜덤 방향 기본 팩토리
    public static final Emitter.Factory FACTORY = new Factory();

    private float baseSize;
    private float phase, freq;

    public ManaBackShockwaveParticle() {
        super();
        color(COLOR);
        am = 0f; // 알파는 update에서 제어
    }

    /** dirAngle(라디안) 중심 각 + 반각 spreadHalf(라디안)로 콘 방향으로 분출 */
    public void resetCone(float cx, float cy, float dirAngle, float spreadHalf, float pushDist, float vMin, float vMax) {
        revive();

        // 피격자 중심에서 뒤쪽으로 약간 밀려난 시작점 + 약간의 두께(법선 방향) 흔들림
        float nx = (float)Math.cos(dirAngle);
        float ny = (float)Math.sin(dirAngle);
        float px = -ny; // 법선(좌우 두께)
        float py =  nx;

        float thickness = Random.Float(-3f, 3f);
        this.x = cx + nx * Random.Float(pushDist * 0.6f, pushDist) + px * thickness;
        this.y = cy + ny * Random.Float(pushDist * 0.6f, pushDist) + py * thickness;

        // 짧고 강하게
        left = lifespan = Random.Float(0.18f, 0.30f);

        // 콘 범위로 방향을 살짝 흩뿌리기
        float ang = dirAngle + Random.Float(-spreadHalf, spreadHalf);
        float v   = Random.Float(vMin, vMax);
        speed.polar(ang, v);

        // 빠르게 감속(잔상 줄며 사그라짐)
        acc.set(-speed.x * 6.5f, -speed.y * 6.5f);

        // 작은 파편
        baseSize = Random.Float(1.2f, 2.2f);
        size(baseSize);

        // 미세한 깜빡임
        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        freq  = Random.Float(10f, 16f);
    }

    @Override
    public void update() {
        super.update();

        float p   = left / lifespan;      // 1 → 0
        float age = lifespan - left;      // 경과

        // 충격파: 시작부터 밝고, 짧게 급감
        float t = 1f - p;
        float envelope = Math.max(0f, 1f - t * 1.4f);     // 선형 급감(0.18~0.30s 기준)
        float flicker  = 0.75f + 0.25f * (float)Math.sin(phase + age * freq);
        am = Math.max(0f, Math.min(1f, flicker * envelope));

        // 바깥으로 나가며 살짝 커졌다가 줄어드는 느낌
        float stretch = 0.9f + 0.4f * (1f - p);
        size(baseSize * stretch);
    }

    /** 랜덤 방향(테스트용) */
    public static class Factory extends Emitter.Factory {
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            ((ManaBackShockwaveParticle) emitter.recycle(ManaBackShockwaveParticle.class))
                    .resetCone(x, y, ang, (float)Math.toRadians(25f), 6f, 140f, 220f);
        }
        @Override public boolean lightMode() { return true; }
    }

    public static class ConeFactory extends Emitter.Factory {
        private final float dirAngle, spreadHalf, pushDist, vMin, vMax;
        public ConeFactory(float dirAngle, float spreadDeg, float pushDist, float vMin, float vMax) {
            this.dirAngle  = dirAngle;
            this.spreadHalf= (float)Math.toRadians(Math.max(0f, spreadDeg) * 0.5f);
            this.pushDist  = Math.max(0f, pushDist);
            this.vMin      = Math.min(vMin, vMax);
            this.vMax      = Math.max(vMin, vMax);
        }
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaBackShockwaveParticle) emitter.recycle(ManaBackShockwaveParticle.class))
                    .resetCone(x, y, dirAngle, spreadHalf, pushDist, vMin, vMax);
        }
        @Override public boolean lightMode() { return true; }
    }
}
