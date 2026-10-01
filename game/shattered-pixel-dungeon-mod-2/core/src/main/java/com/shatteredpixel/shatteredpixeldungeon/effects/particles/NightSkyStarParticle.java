package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class NightSkyStarParticle extends PixelParticle {

    // 별 색상: 하양 (밤하늘 위라 가산합성 권장)
    private static final int COLOR = 0xFFFFFF;

    // 기본 팩토리(소규모 영역용)
    public static final Emitter.Factory FACTORY = new Factory();
    public static Emitter.Factory factory(){ return FACTORY; }

    // 개별 파티클 파라미터
    private float baseSize;     // 1~2px (가끔 3px)
    private float phase;        // 트윙클 위상
    private float freq;         // 트윙클 주파수
    private float minA, maxA;   // 밝기 범위
    private float blinkT;       // 간헐적 번쩍임 타이머
    private float driftVX, driftVY; // 미세한 표류(정지감 방지)

    public NightSkyStarParticle() {
        super();
        color(COLOR);
        am = 0f; // 알파는 update에서 제어
    }

    public void reset(float x, float y){
        revive();

        // 스폰 위치
        this.x = x + Random.Float(-2f, 2f);
        this.y = y + Random.Float(-2f, 2f);

        // 비교적 긴 수명(계속 pour하면 별무리 유지)
        left = lifespan = Random.Float(2.5f, 4.5f);

        // 작고 선명한 점광
        // 10% 확률로 더 밝고 약간 큰 '유난히 눈에 띄는 별'
        boolean bright = Random.Float() < 0.10f;
        baseSize = bright ? Random.Float(1.6f, 2.6f) : Random.Float(1.0f, 1.6f);
        size(baseSize);

        // 트윙클 파라미터: 별마다 위상/속도/밝기 범위 다르게
        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        freq  = Random.Float(2.0f, 3.6f); // 너무 빨라보이지 않게 낮게
        minA  = bright ? 0.55f : 0.35f;
        maxA  = bright ? 1.00f : 0.75f;

        // 간헐 번쩍임(아주 가끔 짧게 치고 올라옴)
        blinkT = Random.Float(0.8f, 2.0f);

        // 미세한 표류(거의 정지에 가까움) - 시차 느낌
        driftVX = Random.Float(-3f, 3f);
        driftVY = Random.Float(-2f, 2f);

        // 감속(점점 표류가 더 느려지도록 아주 약하게)
        acc.set(-driftVX * 0.15f, -driftVY * 0.15f);
        speed.set(driftVX, driftVY);
    }

    @Override
    public void update() {
        super.update();

        float p   = left / lifespan;       // 잔여(1→0)
        float age = lifespan - left;       // 경과

        // 기본 트윙클: sin 곡선으로 minA~maxA 사이를 오가며 명멸
        float s = 0.5f + 0.5f * (float)Math.sin(phase + age * freq);
        float twinkle = minA + (maxA - minA) * s;

        // 간헐 번쩍임(짧고 드물게 상한을 살짝 넘어섬)
        blinkT -= Random.Float(0.015f, 0.030f);
        if (blinkT <= 0f) {
            blinkT = Random.Float(0.8f, 2.0f);
            twinkle = Math.min(1.0f, twinkle + Random.Float(0.10f, 0.25f));
            // 번쩍일 때 살짝 커졌다가 줄어들도록
            size(baseSize * Random.Float(1.05f, 1.20f));
        } else {
            // 서서히 원래 크기로 보정
            size( baseSize * (0.98f + 0.02f * s) );
        }

        // 초/말 부드러운 등장·퇴장
        float envelope;
        if      (p < 0.12f) envelope = p / 0.12f;            // 초반 페이드-인
        else if (p > 0.88f) envelope = (1.0f - p) / 0.12f;   // 말미 페이드-아웃
        else                envelope = 1f;

        am = twinkle * envelope;
    }

    /** 소규모 영역용 기본 팩토리(emit 좌표 근처로 산란) */
    public static class Factory extends Emitter.Factory {
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((NightSkyStarParticle) emitter.recycle(NightSkyStarParticle.class)).reset(x, y);
        }
        @Override public boolean lightMode() { return true; } // 밤하늘 위에선 가산합성이 별빛을 잘 살림
    }

    /**
     * 넓은 밤하늘 스프라이트를 가득 채우는 전용 팩토리.
     * emit(x,y)에서 (x,y)를 '좌상단' 기준으로 보고, 가로/세로 영역 내 무작위 위치에 별을 생성.
     */
    public static class RectFactory extends Emitter.Factory {
        private final float width, height;
        private final boolean additive;
        public RectFactory(float width, float height, boolean additiveLight) {
            this.width  = Math.max(4f, width);
            this.height = Math.max(4f, height);
            this.additive = additiveLight;
        }
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            NightSkyStarParticle p = (NightSkyStarParticle) emitter.recycle(NightSkyStarParticle.class);
            // (x,y)를 좌상단으로 가정
            p.reset(x + Random.Float(0f, width), y + Random.Float(0f, height));
        }
        @Override public boolean lightMode() { return additive; }
    }
}
