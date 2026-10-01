package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria.NewOverHeat;
import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

/**
 * Manaball의 비행 중 속성에 맞는 트레일 파티클 4종(불/물/땅/바람).
 * - 각 파티클은 작은 점/스파크 위주로, 투사체의 이동으로 '선'이 그려지게 설계.
 * - 불(#E24F2E), 물(#05AAD3), 땅(#F5CB3F), 바람(#14EA83)
 * - 사용: projectileSprite.emitter().pour(ManaballElementTrailParticles.FIRE, 0.015f);
 */
public final class ManaballElementTrailParticles {

    // === 외부에서 바로 쓰는 팩토리(싱글턴) ===
    public static final Emitter.Factory FIRE  = new FireTrail.Factory();
    public static final Emitter.Factory WATER = new WaterTrail.Factory();
    public static final Emitter.Factory EARTH = new EarthTrail.Factory();
    public static final Emitter.Factory WIND  = new WindTrail.Factory();

    // (선택) 문자열 매핑 유틸: "fire/water/earth/wind"
    public static Emitter.Factory factory(NewOverHeat.ElementType element){
        if (element == null) return FIRE;
        switch (element){
            case FIRE: default:
                return FIRE;
            case WATER:
                return WATER;
            case EARTH:
                return EARTH;
            case WIND:
                return WIND;
        }
    }

    /* -----------------------------------------------------------
     *  FIRE — 불: 빠른 페이드, 강한 깜빡임, 가산합성
     * ----------------------------------------------------------- */
    public static class FireTrail extends PixelParticle {
        private static final int COLOR = 0xE24F2E; // #e24f2e
        private float baseSize, phase, freq;

        public FireTrail() {
            super();
            color(COLOR);
            am = 0f;
        }

        public void reset(float x, float y){
            revive();
            this.x = x;
            this.y = y;

            left = lifespan = Random.Float(0.16f, 0.26f); // 짧게
            // 아주 작은 산란 속도(투사체 자체 이동으로 선이 그려짐)
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float v   = Random.Float(25f, 55f);
            speed.polar(ang, v);
            // 빠른 소멸 느낌을 위한 강한 감속
            acc.set(-speed.x * 5.5f, -speed.y * 5.5f);

            baseSize = Random.Float(1.2f, 1.9f);
            size(baseSize);

            phase = Random.Float(0f, (float)(Math.PI * 2.0));
            freq  = Random.Float(12f, 18f);
        }

        @Override
        public void update() {
            super.update();
            float p = left / lifespan;      // 1→0
            float age = lifespan - left;

            // 초반 급밝음 → 급감
            float env = (p < 0.12f) ? (p / 0.12f) : Math.max(0f, (1f - p) * 0.9f);
            float flicker = 0.78f + 0.22f * (float)Math.sin(phase + age * freq);
            am = Math.max(0f, Math.min(1f, flicker * env));

            float stretch = 0.95f + 0.45f * (1f - p);
            size(baseSize * stretch);
        }

        public static class Factory extends Emitter.Factory {
            @Override public void emit(Emitter emitter, int index, float x, float y) {
                ((FireTrail) emitter.recycle(FireTrail.class)).reset(x, y);
            }
            @Override public boolean lightMode() { return true; } // 🔥 불빛 강조
        }
    }

    /* -----------------------------------------------------------
     *  WATER — 물: 길게 잔류, 부드러운 트윙클, 약한 파동
     * ----------------------------------------------------------- */
    public static class WaterTrail extends PixelParticle {
        private static final int COLOR = 0x05AAD3; // #05aad3
        private float baseSize, phase, freq, reAimT;

        public WaterTrail() {
            super();
            color(COLOR);
            am = 0f;
        }

        public void reset(float x, float y){
            revive();
            this.x = x;
            this.y = y;

            left = lifespan = Random.Float(0.28f, 0.48f); // 불보다 약간 길게
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float v   = Random.Float(18f, 36f);
            speed.polar(ang, v);
            acc.set(-speed.x * 1.2f, -speed.y * 1.2f); // 천천히 식음

            baseSize = Random.Float(1.0f, 1.6f);
            size(baseSize);

            phase = Random.Float(0f, (float)(Math.PI * 2.0));
            freq  = Random.Float(6f, 9f);
            reAimT = Random.Float(0.22f, 0.40f);
        }

        @Override
        public void update() {
            super.update();
            float p = left / lifespan;      // 1→0
            float age = lifespan - left;

            // 은은한 트윙클 + 부드러운 페이드
            float flicker = 0.45f + 0.25f * (float)Math.sin(phase + age * freq);
            float env;
            if      (p < 0.15f) env = p / 0.15f;
            else if (p > 0.85f) env = (1f - p) / 0.15f;
            else                env = 1f;
            am = Math.max(0f, Math.min(1f, flicker * env));

            // 가끔 아주 약하게 방향을 보정(물결)
            reAimT -= Random.Float(0.015f, 0.030f);
            if (reAimT <= 0f){
                reAimT = Random.Float(0.22f, 0.40f);
                float ang = Random.Float(0f, (float)(Math.PI * 2.0));
                float v   = Random.Float(6f, 12f);
                speed.x = speed.x * 0.90f + (float)Math.cos(ang) * v * 0.10f;
                speed.y = speed.y * 0.90f + (float)Math.sin(ang) * v * 0.10f;
                acc.set(-speed.x * 1.2f, -speed.y * 1.2f);
            }

            // 미세한 호흡
            float pulse = 0.92f + 0.18f * (float)Math.sin(phase + age * (freq * 0.8f));
            size(baseSize * pulse);
        }

        public static class Factory extends Emitter.Factory {
            @Override public void emit(Emitter emitter, int index, float x, float y) {
                ((WaterTrail) emitter.recycle(WaterTrail.class)).reset(x, y);
            }
            @Override public boolean lightMode() { return true; } // 💧 물빛 광택
        }
    }

    /* -----------------------------------------------------------
     *  EARTH — 땅: 입자감(먼지/모래), 불투명한 느낌(가산합성 X)
     * ----------------------------------------------------------- */
    public static class EarthTrail extends PixelParticle {
        private static final int COLOR = 0xF5CB3F; // #f5cb3f
        private float baseSize, phase, freq;

        public EarthTrail() {
            super();
            color(COLOR);
            am = 0f;
        }

        public void reset(float x, float y){
            revive();
            this.x = x;
            this.y = y;

            left = lifespan = Random.Float(0.34f, 0.58f); // 좀 더 오래
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float v   = Random.Float(16f, 34f);
            speed.polar(ang, v);
            // 모래가 '푹' 가라앉는 듯 감속을 크게
            acc.set(-speed.x * 3.2f, -speed.y * 3.2f);

            baseSize = Random.Float(1.0f, 1.8f);
            size(baseSize);

            phase = Random.Float(0f, (float)(Math.PI * 2.0));
            freq  = Random.Float(5f, 8f);
        }

        @Override
        public void update() {
            super.update();
            float p = left / lifespan;      // 1→0
            float age = lifespan - left;

            // 더 불투명/무거운 감: 중간 구간 유지, 말미 급감
            float env;
            if      (p < 0.12f) env = p / 0.12f;
            else if (p > 0.80f) env = (1f - p) / 0.20f;
            else                env = 1f;

            float grain = 0.55f + 0.15f * (float)Math.sin(phase + age * freq);
            am = Math.max(0f, Math.min(1f, grain * env));

            // 살짝 커졌다 줄어드는 질감
            float pulse = 0.96f + 0.22f * (1f - p);
            size(baseSize * pulse);
        }

        public static class Factory extends Emitter.Factory {
            @Override public void emit(Emitter emitter, int index, float x, float y) {
                ((EarthTrail) emitter.recycle(EarthTrail.class)).reset(x, y);
            }
            @Override public boolean lightMode() { return false; } // 🌾 불투명/입자감
        }
    }

    /* -----------------------------------------------------------
     *  WIND — 바람: 얇은 휘몰림, 가벼운 소용돌이 감
     * ----------------------------------------------------------- */
    public static class WindTrail extends PixelParticle {
        private static final int COLOR = 0x14EA83; // #14ea83
        private float baseSize, phase, freq, swirlT;

        public WindTrail() {
            super();
            color(COLOR);
            am = 0f;
        }

        public void reset(float x, float y){
            revive();
            this.x = x;
            this.y = y;

            left = lifespan = Random.Float(0.22f, 0.40f);
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float v   = Random.Float(22f, 42f);
            speed.polar(ang, v);
            // 너무 빨리 죽지 않게 적당한 감속
            acc.set(-speed.x * 1.6f, -speed.y * 1.6f);

            baseSize = Random.Float(1.0f, 1.6f);
            size(baseSize);

            phase = Random.Float(0f, (float)(Math.PI * 2.0));
            freq  = Random.Float(10f, 14f);
            swirlT = Random.Float(0.09f, 0.16f); // 소용돌이 주기
        }

        @Override
        public void update() {
            super.update();
            float p = left / lifespan;      // 1→0
            float age = lifespan - left;

            // 얇은 휘몰림: 현재 속도에 직교 방향을 주기적으로 가미
            swirlT -= Random.Float(0.015f, 0.030f);
            if (swirlT <= 0f) {
                swirlT = Random.Float(0.09f, 0.16f);
                float vx = speed.x, vy = speed.y;
                float len = (float)Math.max(1e-4, Math.sqrt(vx*vx + vy*vy));
                // 직교(접선) 방향
                float tx = -vy / len, ty = vx / len;
                float s  = Random.Float(-14f, 14f); // 살짝 좌우로 흔들리듯
                speed.x += tx * s;
                speed.y += ty * s;
                acc.set(-speed.x * 1.6f, -speed.y * 1.6f);
            }

            // 가벼운 점멸
            float flicker = 0.65f + 0.25f * (float)Math.sin(phase + age * freq);
            am = Math.max(0f, Math.min(1f, flicker * (0.6f + 0.4f * p)));

            // 길게 늘어지는 실루엣
            float stretch = 0.95f + 0.35f * (1f - p);
            size(baseSize * stretch);
        }

        public static class Factory extends Emitter.Factory {
            @Override public void emit(Emitter emitter, int index, float x, float y) {
                ((WindTrail) emitter.recycle(WindTrail.class)).reset(x, y);
            }
            @Override public boolean lightMode() { return true; } // 🌬️ 가벼운 광택
        }
    }

    private ManaballElementTrailParticles() {}
}
