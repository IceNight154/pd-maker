package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaBuffFireflyParticle extends PixelParticle {

    // 푸른 마나 (#38ABAB)
    private static final int COLOR = 0x38ABAB;

    // 기본 팩토리(싱글턴)
    public static final Emitter.Factory FACTORY = new Factory();
    public static Emitter.Factory factory() { return FACTORY; }

    // --- 범위·감도 기본값(필요하면 숫자만 손봐도 OK) ---
    private static final float SPAWN_RADIUS_MIN = 12f;  // ⬅ 중심에서 시작 반경 (기존보다 ↑)
    private static final float SPAWN_RADIUS_MAX = 20f;

    private static final float VEL_MIN = 16f;           // ⬅ 부유 속도 (기존 8~18 → 16~32)
    private static final float VEL_MAX = 32f;

    private static final float LIFESPAN_MIN = 1.4f;     // ⬅ 수명 (기존 0.9~1.6 → 1.4~2.4)
    private static final float LIFESPAN_MAX = 2.4f;

    private static final float FRICTION_K = 1.2f;       // 감속 계수(낮을수록 오래 미끄럼)
    private static final float OUTWARD_BIAS = 0.35f;    // 방사 방향 가중치(0~1; 0이면 완전 랜덤)

    // --------------------------------------------------

    private float baseSize;
    private float sizeMul = 1f;
    private float phase;     // 개별 파티클 위상(깜빡임/펄스)
    private float freq;      // 깜빡임 주파수
    private float reAimT;    // 부드러운 방향 재설정 타이머

    public ManaBuffFireflyParticle() {
        super();
        color(COLOR);
        am = 0f; // 알파는 update에서 제어
    }

    // 기본 reset → 범위 배수 1.0
    public void reset(float x, float y) {
        resetWithRange(x, y, 1f);
    }
    // reset with range and custom size multiplier (for layered parallax usage)
    public void resetWithParams(float x, float y, float rangeMul, float sizeMul) {
        this.sizeMul = Math.max(0.25f, sizeMul);
        resetWithRange(x, y, rangeMul);
    }


    // 범위 배수(rangeMul)로 간편 조절 가능한 reset
    public void resetWithRange(float x, float y, float rangeMul) {
        revive();

        // 중심 기록
        float ox = x;
        float oy = y;

        // 시작 지점을 중심에서 살짝 떨어뜨려 배치(스폰 반경)
        float r = Random.Float(SPAWN_RADIUS_MIN * rangeMul, SPAWN_RADIUS_MAX * rangeMul);
        float ang = Random.Float(0f, (float)(Math.PI * 2.0));
        this.x = ox + (float)Math.cos(ang) * r;
        this.y = oy + (float)Math.sin(ang) * r;

        // 수명: 길게 유지 (넓은 영역 유영)
        left = lifespan = Random.Float(LIFESPAN_MIN, LIFESPAN_MAX) * (0.85f + 0.3f * rangeMul);

        // 아주 작은 크기(더 작게)
        baseSize = Random.Float(0.9f, 1.4f) * sizeMul;
        size(baseSize);

        // 부유 속도: 방사 방향 가중 + 약간의 랜덤성
        float angVel = ang;
        float randAng = Random.Float(0f, (float)(Math.PI * 2.0));
        float v = Random.Float(VEL_MIN, VEL_MAX) * (0.85f + 0.3f * rangeMul);

        float vx = (float)Math.cos(angVel) * v * OUTWARD_BIAS + (float)Math.cos(randAng) * v * (1f - OUTWARD_BIAS);
        float vy = (float)Math.sin(angVel) * v * OUTWARD_BIAS + (float)Math.sin(randAng) * v * (1f - OUTWARD_BIAS);
        speed.set(vx, vy);

        // 감속: 너무 금방 멈추지 않게 살짝만 (FRICTION_K가 작을수록 오래 미끄러짐)
        acc.set(-speed.x * FRICTION_K, -speed.y * FRICTION_K);

        // 깜빡임 파라미터
        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        freq  = Random.Float(6f, 10f);

        // 방향 재조정 주기(더 드문 빈도로 방향 살짝 변경 → 넓게 퍼짐 유지)
        reAimT = Random.Float(0.35f, 0.60f);
    }

    @Override
    public void update() {
        super.update();

        // 경과/잔여 비율
        float p   = left / lifespan;     // 1 → 0
        float age = lifespan - left;

        // 은은한 깜빡임 + 약한 페이드
        float flicker = 0.40f + 0.15f * (float)Math.sin(phase + age * freq);
        am = Math.max(0f, Math.min(1f, flicker * (0.7f + 0.3f * p)));

        // 호흡하듯 펄스
        float pulse = 0.90f + 0.20f * (float)Math.sin(phase + age * (freq * 0.8f));
        size(baseSize * pulse);

        // 드문 빈도로 새 방향을 아주 약하게 섞어줌(과도한 회전을 방지)
        reAimT -= Random.Float(0.015f, 0.030f);
        if (reAimT <= 0f) {
            reAimT = Random.Float(0.35f, 0.60f);
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float v   = Random.Float(VEL_MIN, VEL_MAX) * 0.35f; // 기존 속도에 살짝만 가미
            speed.x = speed.x * 0.90f + (float)Math.cos(ang) * v * 0.10f;
            speed.y = speed.y * 0.90f + (float)Math.sin(ang) * v * 0.10f;
            acc.set(-speed.x * FRICTION_K, -speed.y * FRICTION_K);
        }
    }

    /** Emitter에서 쓰기 위한 기본 팩토리 */
    public static class Factory extends Emitter.Factory {
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaBuffFireflyParticle) emitter.recycle(ManaBuffFireflyParticle.class)).reset(x, y);
        }
        @Override
        public boolean lightMode() { return true; } // 가산합성
    }

    /** 범위를 더 키우거나 줄이고 싶을 때 쓰는 파라미터 팩토리 */
    public static class ParamFactory extends Emitter.Factory {
        private final float rangeMul;
        public ParamFactory(float rangeMul){ this.rangeMul = Math.max(0.5f, rangeMul); }
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ManaBuffFireflyParticle p = (ManaBuffFireflyParticle) emitter.recycle(ManaBuffFireflyParticle.class);
            p.resetWithRange(x, y, rangeMul);
        }
        @Override
        public boolean lightMode() { return true; }
    }
    /** Layer-specific factory to control range & size per parallax layer */
    public static class LayerFactory extends Emitter.Factory {
        private final float rangeMul;
        private final float sizeMul;
        public LayerFactory(float rangeMul, float sizeMul){
            this.rangeMul = rangeMul;
            this.sizeMul  = sizeMul;
        }
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ManaBuffFireflyParticle p = (ManaBuffFireflyParticle) emitter.recycle(ManaBuffFireflyParticle.class);
            p.resetWithParams(x, y, rangeMul, sizeMul);
        }
        @Override
        public boolean lightMode() { return true; }
    }

}
