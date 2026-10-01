package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.Game;
import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaStormParticle extends PixelParticle {

    // 푸른 마나(#38ABAB)
    private static final int COLOR = 0x38ABAB;

    // 기본 팩토리(싱글턴)
    public static final Emitter.Factory FACTORY = new Factory();
    public static Emitter.Factory factory(){ return FACTORY; }

    // 스폰 반경 기본값(폭풍 크기)
    private static final float SPAWN_R_MIN = 20f;
    private static final float SPAWN_R_MAX = 40f;

    // 기본 강도(회전/흡인 속도: px/sec)
    private static final float SWIRL_MIN = 90f;
    private static final float SWIRL_MAX = 160f;
    private static final float PULL_MIN  = 50f;
    private static final float PULL_MAX  = 90f;

    // 조향(목표 속도로 붙는 가속도 계수; 높을수록 사납게 빨려듦)
    private static final float STEER_ACC_MIN = 6f;
    private static final float STEER_ACC_MAX = 10f;

    // 중심에서 너무 가까우면 밖으로 약하게 밀어 ‘눈’이 막히지 않도록
    private static final float CORE_RADIUS   = 6f;
    private static final float CORE_PUSH     = 0.5f;

    // 개별 파티클 상태
    private float cx, cy;        // 폭풍 중심
    private float spawnR;        // 초기 반경
    private float swirlSpd;      // 회전 목표 속도
    private float pullSpd;       // 중심 흡인 속도(가까워질수록 약해짐)
    private float steerK;        // 조향 가속 계수
    private int   dir;           // 회전 방향(+1: CCW, -1: CW)

    private float baseSize;
    private float phase, flickerFreq;

    // 파라미터 배수(팩토리에서 설정)
    private float radiusMul = 1f;
    private float intensity = 1f;

    public ManaStormParticle() {
        super();
        color(COLOR);
        am = 0f; // 알파는 update에서 제어
    }

    public void reset(float x, float y){
        resetWithParams(x, y, 1f, 1f, 0);
    }

    /**
     * @param x,y       폭풍 중심
     * @param rMul      반경 배수(폭풍 크기)
     * @param inten     강도 배수(회전/흡인/조향)
     * @param fixedDir  0이면 랜덤, +1(CCW) / -1(CW) 고정
     */
    public void resetWithParams(float x, float y, float rMul, float inten, int fixedDir) {
        revive();

        this.cx = x;
        this.cy = y;

        this.radiusMul = Math.max(0.5f, rMul);
        this.intensity = Math.max(0.5f, inten);

        // 소용돌이 방향
        this.dir = (fixedDir == 0) ? (Random.Int(2) == 0 ? +1 : -1) : (fixedDir > 0 ? +1 : -1);

        // 큰 반경에서 시작해서 소용돌이로 말려들어감
        this.spawnR = Random.Float(SPAWN_R_MIN * radiusMul, SPAWN_R_MAX * radiusMul);
        float ang = Random.Float(0f, (float)(Math.PI * 2.0));
        this.x = cx + (float)Math.cos(ang) * spawnR;
        this.y = cy + (float)Math.sin(ang) * spawnR;

        // 수명: 짧게(지속 효과는 pour/start로 유지)
        left = lifespan = Random.Float(0.60f, 1.00f);

        // 크게 보이는 파편
        baseSize = Random.Float(2.2f, 3.6f) * (0.85f + 0.3f * intensity);
        size(baseSize);

        // 목표 속도 파라미터
        swirlSpd = Random.Float(SWIRL_MIN, SWIRL_MAX) * intensity;
        pullSpd  = Random.Float(PULL_MIN,  PULL_MAX)  * intensity;
        steerK   = Random.Float(STEER_ACC_MIN, STEER_ACC_MAX) * intensity;

        // 초기 속도: 접선 방향 위주로 시작
        float nx = (cx - x), ny = (cy - y);
        float inv = 1f / (float)Math.max(1e-4, Math.sqrt(nx*nx + ny*ny));
        nx *= inv; ny *= inv;
        float tx = -ny * dir, ty = nx * dir; // 접선 방향(회전)

        speed.set(tx * swirlSpd * 0.8f + nx * pullSpd * 0.1f,
                ty * swirlSpd * 0.8f + ny * pullSpd * 0.1f);

        // 깜빡임 파라미터
        phase      = Random.Float(0f, (float)(Math.PI * 2.0));
        flickerFreq= Random.Float(8f, 14f);
    }

    @Override
    public void update() {
        // --- 방향장(벡터 필드) 기반으로 목표 속도 생성 후 조향 ---
        float dt = Game.elapsed;

        // 중심 방향/반경
        float dx = cx - x, dy = cy - y;
        float r  = (float)Math.sqrt(dx*dx + dy*dy);
        if (r < 1e-4f) r = 1e-4f;
        float nx = dx / r, ny = dy / r;
        float tx = -ny * dir, ty = nx * dir; // 접선 방향(회전)

        // 반경에 따른 속도 보정(바깥일수록 더 사납게, 중심에선 과도 흡입 방지)
        float swirl = swirlSpd * (0.6f + 0.4f * Math.min(1f, r / (spawnR + 1f)));
        float pull  = (r > CORE_RADIUS) ? pullSpd : -pullSpd * CORE_PUSH;

        // 목표 속도(회전 + 흡인) + 약간의 난류
        float noise = (float)Math.sin(phase + (lifespan - left) * (flickerFreq * 1.15f));
        float jitter = 8f * intensity * noise;

        float vxTarget = tx * swirl + nx * pull + jitter * Random.Float(-1f, 1f);
        float vyTarget = ty * swirl + ny * pull + jitter * Random.Float(-1f, 1f);

        // 조향 가속도: 현재 속도를 목표 속도로 끌어당김
        acc.set((vxTarget - speed.x) * steerK, (vyTarget - speed.y) * steerK);

        // 위치/수명 갱신
        super.update();

        // 시각(밝기/크기) — 사납게 깜빡이며 페이드 인/아웃
        float age = lifespan - left;       // 경과
        float p   = left / lifespan;       // 잔여(1→0)

        // 빠른 등장/퇴장
        float envelope;
        if (p > 0.85f)      envelope = (p - 0.70f) / 0.15f;   // 마지막 15% 감쇠
        else if (p < 0.10f) envelope = p / 0.10f;             // 처음 10% 상승
        else                envelope = 1f;

        float flicker = 0.65f + 0.35f * (float)Math.sin(phase + age * flickerFreq);
        am = Math.max(0f, Math.min(1f, flicker * envelope));

        // 크기 펄스(폭풍의 숨)
        float pulse = 0.9f + 0.25f * (float)Math.sin(phase + age * (flickerFreq * 0.7f));
        size(baseSize * pulse);
    }

    /** 기본 팩토리 */
    public static class Factory extends Emitter.Factory {
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaStormParticle) emitter.recycle(ManaStormParticle.class)).reset(x, y);
        }
        @Override public boolean lightMode() { return true; }
    }

    /** 범위/강도/방향을 조절할 수 있는 파라미터 팩토리 */
    public static class ParamFactory extends Emitter.Factory {
        private final float rMul;
        private final float intensity;
        private final int   fixedDir; // 0 랜덤, +1 CCW, -1 CW
        public ParamFactory(float rangeMul, float intensity, int fixedDir) {
            this.rMul = Math.max(0.4f, rangeMul);
            this.intensity = Math.max(0.4f, intensity);
            this.fixedDir = fixedDir;
        }
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ManaStormParticle p = (ManaStormParticle) emitter.recycle(ManaStormParticle.class);
            p.resetWithParams(x, y, rMul, intensity, fixedDir);
        }
        @Override public boolean lightMode() { return true; }
    }
}
