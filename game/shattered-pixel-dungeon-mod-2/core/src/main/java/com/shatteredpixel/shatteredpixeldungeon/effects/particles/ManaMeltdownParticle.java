package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.Game;
import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaMeltdownParticle extends PixelParticle {

    // 색상
    private static final int COLOR_GATHER = 0x38ABAB; // 수렴(물빛 마나)
    private static final int COLOR_SURGE  = 0xE93769; // 폭주(불길한 마나)

    public static final Emitter.Factory FACTORY = new Factory();

    // ===== 파라미터 =====
    private static final float SPAWN_R_MIN = 10f;
    private static final float SPAWN_R_MAX = 20f;

    // 전체 수명(빠르게)
    private static final float LIFE_MIN = 0.80f;
    private static final float LIFE_MAX = 1.10f;

    // 수렴 비율(폭발 시점까지의 구간)
    private static final float GATHER_FRAC = 0.58f;

    // 수렴(중심으로 천천히 → 점점 빠르게)
    private static final float G_PULL_MIN  = 26f;
    private static final float G_PULL_MAX  = 45f;
    private static final float G_STEER_MIN = 7.0f;
    private static final float G_STEER_MAX = 10.0f;

    // === 폭발(한 번에 터짐) 전용 파라미터 ===
    // 폭발 순간(Detonation) 잔여 수명: 아주 짧게
    private static final float DET_DUR_MIN = 0.14f;
    private static final float DET_DUR_MAX = 0.22f;

    // 폭발 순간 속도(즉시 부여) — 매우 큼
    private static final float DET_SPEED_MIN = 300f;
    private static final float DET_SPEED_MAX = 460f;

    // 폭발 각도 확산(±deg) — 너무 넓지 않게
    private static final float DET_SPREAD_HALF_DEG = 12f;

    // 폭발 후 급감 마찰(빠르게 죽는 꼬리)
    private static final float DET_DECEL = 7.5f;

    // 난류(폭발 직후 미세 떨림)
    private static final float DET_JITTER = 10f;

    // 알파 상한(폭발은 진하게 시작)
    private static final float DET_ALPHA_CAP = 0.90f;

    // ======================================

    // 유틸
    private static float clamp(float v, float a, float b){ return v < a ? a : (v > b ? b : v); }
    private static int lerpColor(int c1, int c2, float t){
        t = clamp(t, 0f, 1f);
        int r1=(c1>>16)&0xFF, g1=(c1>>8)&0xFF, b1=c1&0xFF;
        int r2=(c2>>16)&0xFF, g2=(c2>>8)&0xFF, b2=c2&0xFF;
        int r = (int)(r1 + (r2 - r1)*t + 0.5f);
        int g = (int)(g1 + (g2 - g1)*t + 0.5f);
        int b = (int)(b1 + (b2 - b1)*t + 0.5f);
        return (r<<16)|(g<<8)|b;
    }

    // 상태
    private float cx, cy, spawnR;
    private float gPull, gSteer;
    private float baseSize, phase, flickerFreq;
    private float intensity = 1f;

    // 폭발 상태
    private boolean detonated = false;
    private float detTotal = 0.18f; // 폭발 잔여 수명(고정)
    private float detAlphaPeak = DET_ALPHA_CAP;

    public void resetWithParams(float centerX, float centerY, float rangeMul, float intensity){
        revive();

        this.cx = centerX;
        this.cy = centerY;
        this.intensity = Math.max(0.5f, intensity);
        this.detonated = false;

        // 원주에서 시작
        this.spawnR = Random.Float(SPAWN_R_MIN * rangeMul, SPAWN_R_MAX * rangeMul);
        float ang = Random.Float(0f, (float)(Math.PI * 2.0));
        this.x = cx + (float)Math.cos(ang) * spawnR;
        this.y = cy + (float)Math.sin(ang) * spawnR;

        // 전체 수명
        left = lifespan = Random.Float(LIFE_MIN, LIFE_MAX);

        // 초기 거의 정지
        speed.set(Random.Float(-6f, 6f), Random.Float(-6f, 6f));
        acc.set(0, 0);

        // 수렴 파라미터
        gPull  = Random.Float(G_PULL_MIN,  G_PULL_MAX)  * this.intensity;
        gSteer = Random.Float(G_STEER_MIN, G_STEER_MAX) * this.intensity;

        // 크기/트윙클
        baseSize = Random.Float(1.0f, 1.9f);
        size(baseSize);
        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        flickerFreq = Random.Float(7f, 11f);

        // 시작색/밝기
        color(COLOR_GATHER);
        am = 0f;
    }

    @Override
    public void update() {
        float age = lifespan - left;
        float t   = age / lifespan;

        boolean surgePhase = (t >= GATHER_FRAC);

        float dx = cx - x, dy = cy - y;
        float r  = (float)Math.sqrt(dx*dx + dy*dy);
        if (r < 1e-4f) r = 1e-4f;
        float nx = dx / r, ny = dy / r; // inward
        float ox = -nx,    oy = -ny;    // outward

        if (!surgePhase) {
            // ===== 수렴(물빛) =====
            float pull = gPull * (0.65f + 0.35f * clamp(r / (spawnR + 1f), 0f, 1f));
            float jitter = 3.5f * intensity * (float)Math.sin(phase + age * (flickerFreq * 0.7f));

            float vxTarget = nx * pull + jitter * 0.5f;
            float vyTarget = ny * pull + jitter * 0.3f;
            acc.set((vxTarget - speed.x) * gSteer, (vyTarget - speed.y) * gSteer);

            // 은은한 밝아짐
            float gatherEnv = clamp(t / (GATHER_FRAC * 0.7f), 0f, 1f);
            float flicker = 0.42f + 0.26f * (float)Math.sin(phase + age * flickerFreq);
            am = clamp(flicker * (0.70f + 0.30f * gatherEnv), 0f, 0.88f);

            // 크기 호흡
            float pulse = 0.90f + 0.20f * (float)Math.sin(phase + age * (flickerFreq * 0.8f));
            size(baseSize * pulse);

            color(COLOR_GATHER);

        } else {
            // ===== 폭발(한 번에 터짐) =====
            if (!detonated) {
                // 1) 잔여 수명 매우 짧게 설정
                detTotal = Random.Float(DET_DUR_MIN, DET_DUR_MAX);
                left = Math.min(left, detTotal);

                // 2) 즉시 고속으로 바깥 방향 부여(±12° 내 소폭 확산)
                float baseAng = (float)Math.atan2(oy, ox);
                float ang = baseAng + (float)Math.toRadians(Random.Float(-DET_SPREAD_HALF_DEG, DET_SPREAD_HALF_DEG));
                float spd = Random.Float(DET_SPEED_MIN, DET_SPEED_MAX) * intensity;
                speed.x = (float)Math.cos(ang) * spd;
                speed.y = (float)Math.sin(ang) * spd;

                // 3) 마찰로 급감 → 꼬리 짧게
                acc.set(-speed.x * DET_DECEL, -speed.y * DET_DECEL);

                // 4) 즉시 붉은색으로 전환(한 프레임에 체감)
                color(COLOR_SURGE);

                // 5) 시작 순간 밝기 피크(진하게)
                detAlphaPeak = DET_ALPHA_CAP;

                detonated = true;
            }

            // det 진행도 (0→1). left는 카운트다운이라 역으로 계산
            float detT = 1f - (left / detTotal);

            // 밝기: 시작 강하게 → 짧게 급감 (가산합성 과포화 방지)
            float spike = 0.85f + 0.15f * (float)Math.sin(phase + age * (flickerFreq * 1.3f));
            am = clamp(detAlphaPeak * (1f - detT) * spike, 0f, 1f);

            // 약간의 난류로 터지는 느낌 강화
            float noise = (float)Math.sin(phase + age * (flickerFreq * 1.4f));
            speed.x += Random.Float(-1f, 1f) * DET_JITTER * noise * Game.elapsed;
            speed.y += Random.Float(-1f, 1f) * DET_JITTER * noise * Game.elapsed;

            // 크기: 폭발 직후 커졌다가 바로 줄어듦
            float stretch = 1.05f + 0.55f * (1f - detT);
            size(baseSize * stretch);
        }

        super.update();
    }

    /** 기본 팩토리 */
    public static class Factory extends Emitter.Factory {
        private final float rangeMul;
        private final float intensity;
        public Factory() { this(1f, 1f); }
        public Factory(float rangeMul, float intensity){
            this.rangeMul = Math.max(0.4f, rangeMul);
            this.intensity= Math.max(0.4f, intensity);
        }
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaMeltdownParticle) emitter.recycle(ManaMeltdownParticle.class))
                    .resetWithParams(x, y, rangeMul, intensity);
        }
        @Override public boolean lightMode() { return true; }
    }
}
