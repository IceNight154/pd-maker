package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.Game;
import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

/** 원소 변경 연출 전용 파티클 4종 (Fire/Water/Earth/Wind)
 *  공통 재생 시간/범위 유지: ECfg에서 한 번에 조절 */
public final class ElementChangeParticles {

    /**
     *  공통 설정: 여기 숫자만 고치면 4원소가 모두 같은 톤으로 맞춰짐
     */
    public static final class ECfg {
        public static final float LIFE_MIN = 0.36f;   // 개별 파티클 수명(최소)
        public static final float LIFE_MAX = 0.44f;   // 개별 파티클 수명(최대)
        public static final float TARGET_RADIUS = 22f; // 중심→바깥 도달 목표거리(px)
        public static final float SPAWN_JITTER = 2f;   // 시작 위치 난수(px)
        // 감쇠 보정: v≈R/L로 잡되 마찰 고려 보정치
        public static final float SPEED_BOOST = 1.10f; // 1.0~1.2 권장
    }

    /* ===================== FIRE (타오름) ===================== */

    public static class ElementFireMantleParticle extends PixelParticle {

        public static final Emitter.Factory FACTORY = new Emitter.Factory() {
            @Override
            public void emit(Emitter emitter, int index, float x, float y) {
                ((ElementFireMantleParticle) emitter.recycle(ElementFireMantleParticle.class))
                        .resetAtCenter(x, y);
            }
            @Override
            public boolean lightMode() { // additive 느낌
                return true;
            }
        };

        // 컬러(시작=노랑빛, 끝=불꽃 주황/붉은색)
        private static final int COL_START = 0xE24F2E; // 밝은 노랑
        private static final int COL_END   = 0xE24F2E; // 불꽃 주황/붉은색 (#e24f2e)

        private float baseSize;
        private float phase, wobbleAmp, wobbleFreq;

        // 수직 상승 속도/감쇠 계수 (공통 ECfg와 조화)
        private static final float UPSPEED_MIN = 22f;
        private static final float UPSPEED_MAX = 32f;
        private static final float DRAG        = 1.15f;  // 숫자 올릴수록 몸 주변 링이 커짐

        public void resetAtCenter(float cx, float cy) {
            revive();

            // 캐릭터 몸 가까이에서 시작 (작은 링)
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float r0  = Random.Float(3.5f, 7.5f); // 너무 바깥으로 안 나가게
            this.x = cx + (float)Math.cos(ang) * r0;
            this.y = cy + (float)Math.sin(ang) * r0;

            // 공통 수명 사용(파일 상단 ECfg의 값에 맞춰 동일 톤 유지)
            left = lifespan = Random.Float(ECfg.LIFE_MIN, ECfg.LIFE_MAX);

            // 위로 떠오르는 기본 속도 + 약간의 좌우 무작위
            float vy = -Random.Float(UPSPEED_MIN, UPSPEED_MAX); // 화면 좌표계 기준 위쪽은 보통 -Y
            float vx = Random.Float(-6f, 6f);
            speed.set(vx, vy);

            // 감쇠(마찰) - speed 반대 방향으로 서서히 느려지게
            acc.set(-speed.x * (DRAG - 1f), -speed.y * (DRAG - 1f));

            // 크기/깜빡임 파라미터
            baseSize   = Random.Float(1.5f, 2.4f);
            size(baseSize);
            am = 1.0f;

            wobbleAmp  = Random.Float(2.0f, 5.0f);   // 좌우 요동 폭
            wobbleFreq = Random.Float(7.0f, 11.0f);  // 요동 주기
            phase      = Random.Float(0f, (float)(Math.PI * 2.0));

            // 시작 색은 밝은 노랑
            hardlight(COL_START);
        }

        @Override
        public void update() {
            super.update();

            // 진행도 0→1
            float t = 1f - (left / lifespan);

            // 좌우 요동 (시간에 따라 흔들리게)
            x += (float)Math.sin(Game.timeTotal * wobbleFreq + phase) * Game.elapsed * wobbleAmp;

            // 크기/투명도(불꽃이 위로 가며 수축/사라짐)
            float sz = baseSize * (1.05f - 0.85f * t); // 서서히 작아짐
            size(Math.max(0.75f, sz));
            am = 1.0f - t; // 천천히 페이드아웃

            // 색상 그라데이션: 노랑→주황/붉은색
            hardlight(lerpColor(COL_START, COL_END, t));
        }

        private static int lerpColor(int c1, int c2, float t) {
            t = Math.max(0f, Math.min(1f, t));
            int r1 = (c1 >> 16) & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;
            int r2 = (c2 >> 16) & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = c2 & 0xFF;
            int r = (int)(r1 + (r2 - r1) * t);
            int g = (int)(g1 + (g2 - g1) * t);
            int b = (int)(b1 + (b2 - b1) * t);
            return (r << 16) | (g << 8) | b;
        }
    }

    /* ===================== WATER (물결 스파크) ===================== */

    public static class ElementWaterRippleParticle extends PixelParticle {
        private static final int COLOR = 0x05AAD3;
        public static final Emitter.Factory FACTORY = new Factory();

        private float baseSize, phase, freq;

        public ElementWaterRippleParticle() {
            super();
            color(COLOR);
            am = 0f;
        }

        public void reset(float cx, float cy) {
            revive();

            // 링 느낌을 살짝 주되, 통일 범위로 맞춤
            float ang = Random.Float(0f, (float) (Math.PI * 2.0));
            float r0 = Random.Float(1f, 3f);
            this.x = cx + (float) Math.cos(ang) * r0;
            this.y = cy + (float) Math.sin(ang) * r0;

            left = lifespan = Random.Float(ECfg.LIFE_MIN, ECfg.LIFE_MAX);

            float vOut = (ECfg.TARGET_RADIUS / left) * (ECfg.SPEED_BOOST * 0.9f);
            speed.polar(ang, vOut);
            // 물: 살짝 위로 떠오름
            speed.y -= vOut * 0.20f;

            // 물: 유지감(감쇠 약)
            acc.set(-speed.x * 1.4f, -speed.y * 1.4f);

            baseSize = Random.Float(1.0f, 1.7f);
            size(baseSize);
            phase = Random.Float(0f, (float) (Math.PI * 2.0));
            freq = Random.Float(6f, 9f);
        }

        @Override
        public void update() {
            super.update();
            float p = left / lifespan, age = lifespan - left;
            float env = (p < 0.15f) ? (p / 0.15f) : (p > 0.85f ? (1f - p) / 0.15f : 1f);
            float flicker = 0.45f + 0.25f * (float) Math.sin(phase + age * freq);
            am = Math.min(1f, flicker * env);
            float pulse = 0.92f + 0.22f * (float) Math.sin(phase + age * (freq * 0.8f));
            size(baseSize * pulse);
        }

        public static class Factory extends Emitter.Factory {
            @Override
            public void emit(Emitter emitter, int index, float x, float y) {
                ((ElementWaterRippleParticle) emitter.recycle(ElementWaterRippleParticle.class)).reset(x, y);
            }

            @Override
            public boolean lightMode() {
                return true;
            }
        }
    }

    /* ===================== EARTH (파편/먼지) ===================== */

    public static class ElementEarthChunkParticle extends PixelParticle {

        private static final int COLOR = 0xF5CB3F; // EARTH 베이스 컬러
        private static final float SIZE_MIN = 1.0f;     // 덩어리 최소 픽셀 크기
        private static final float SIZE_MAX = 2.0f;     // 덩어리 최대 픽셀 크기
        private static final float UP_V_MIN = -24f;     // 초기 상승 속도 y (음수=위로)
        private static final float UP_V_MAX = -36f;
        private static final float OUT_V_MIN = 4f;     // 바깥으로 퍼지는 속도
        private static final float OUT_V_MAX = 10f;
        private static final float GRAVITY_MIN = 140f;  // 중력 가속도(아래로 +)
        private static final float GRAVITY_MAX = 200f;

        // 덩어리 수명: 공통 톤에 맞추되, 후반부에 "부서짐"을 연출하려고 살짝 길게
        private static final float LIFE_MIN = ECfg.LIFE_MIN + 0.08f;
        private static final float LIFE_MAX = ECfg.LIFE_MAX + 0.10f;

        private float baseSize;
        private boolean shattered = false;
        private Emitter owner;
        private static final float DEG2RAD = (float)(Math.PI / 180f);


        // 중심을 기준으로 리셋 (캐릭터 중심에서 살짝 퍼지게)
        public void resetAtCenter(float cx, float cy, Emitter owner) {
            revive();

            this.owner = owner;
            this.color(COLOR);
            this.am = 0.9f;

            // 시작 위치: 중심에서 짧은 반지름 링 범위
            float r = Random.Float(ECfg.TARGET_RADIUS * 0.28f, ECfg.TARGET_RADIUS * 0.48f);
            float a = Random.Float(0f, 360f);
            float rad = (float)Math.toRadians(a);
            this.x = cx + (float)Math.cos(rad) * r;
            this.y = cy + (float)Math.sin(rad) * r;

            // 크고 작은 조각 섞이도록 사이즈 랜덤
            baseSize = Random.Float(SIZE_MIN, SIZE_MAX);
            size(baseSize);

            // 수명
            lifespan = Random.Float(LIFE_MIN, LIFE_MAX);
            left = lifespan;

            // 바깥으로 살짝 + 위로 상승
            float out = Random.Float(OUT_V_MIN, OUT_V_MAX);
            speed.polar(a, out);
            speed.y += Random.Float(UP_V_MIN, UP_V_MAX);

            // 중력
            acc.set(0f, -Random.Float(20f, 45f));
        }

        @Override
        public void update() {
            super.update();

            // 진행도 0→1
            float t = 1f - (left / lifespan);

            // 덩어리 점차 작아지며 마찰감(질량감) 표현
            // 초반에는 거의 유지, 후반으로 갈수록 40~60% 정도까지 축소
            float shrink = 1f - 0.6f * t;
            size(Math.max(0.6f, baseSize * shrink));

            // 거의 끝나갈 때 한 번만 "부서짐" 판정
            if (!shattered && left <= lifespan * 0.20f) {
                shattered = true;
                if (owner != null) {
                    owner.burst(ElementEarthDustParticle.FACTORY, Random.IntRange(6, 10));
                }
            }
        }

        @Override
        public void kill() {
            // 혹시 못 터졌다면 여기서라도 모래를 생성
            if (!shattered && owner != null) {
                owner.burst(ElementEarthDustParticle.FACTORY, Random.IntRange(4, 7));
            }
            super.kill();
        }

        public static final Emitter.Factory FACTORY = new Emitter.Factory() {
            @Override
            public void emit(Emitter emitter, int index, float x, float y) {
                ((ElementEarthChunkParticle) emitter.recycle(ElementEarthChunkParticle.class))
                        .resetAtCenter(x, y, emitter);
            }

            @Override
            public boolean lightMode() {
                return false;
            }
        };
    }

    public static class ElementEarthDustParticle extends PixelParticle {

        // 모래는 본색보다 어둡고 밝은 톤을 섞어서 질감
        private static final int[] PALETTE = new int[]{
                0xBEA044, 0xCFAF4C, 0xA98E3B, 0x8F7D33
        };

        private static final float SIZE_MIN = 1.0f;
        private static final float SIZE_MAX = 2.0f;
        private static final float LIFE_MIN = ECfg.LIFE_MIN * 0.65f;
        private static final float LIFE_MAX = ECfg.LIFE_MAX * 0.80f;

        // 미세한 확산 + 약한 중력, 빠른 페이드아웃 느낌
        private static final float OUT_V_MIN = 4f;
        private static final float OUT_V_MAX = 10f;
        private static final float GRAVITY = -18f;

        @Override
        public void update() {
            super.update();
            // 아주 약간의 감속으로 공기 저항감
            speed.scale(0.985f);
        }


        public void resetAroundCenter(float cx, float cy) {
            revive();

            this.color(PALETTE[Random.Int(PALETTE.length)]);
            this.am = 1f;

            // 시작 위치: 캐릭터 주변의 링(고리)에서 생성되도록
            float r = Random.Float(ECfg.TARGET_RADIUS * 0.32f, ECfg.TARGET_RADIUS * 0.55f);
            float a = Random.Float(0f, 360f);
            float rad = (float)Math.toRadians(a);
            this.x = cx + (float)Math.cos(rad) * r;
            this.y = cy + (float)Math.sin(rad) * r;

            size(Random.Float(SIZE_MIN, SIZE_MAX));
            lifespan = Random.Float(LIFE_MIN, LIFE_MAX);
            left = lifespan;

            // 은은히 바깥쪽 + 위로 떠오르는 초깃속도
            float v = Random.Float(OUT_V_MIN, OUT_V_MAX);
            speed.polar(a, v);
            speed.y += Random.Float(ElementEarthChunkParticle.UP_V_MIN, ElementEarthChunkParticle.UP_V_MAX);

            // 아주 약한 '상승 감쇠/부력' 가속
            acc.set(0f, GRAVITY);
        }

        public void resetAtPoint(float x, float y) {

            revive();

            this.color(PALETTE[Random.Int(PALETTE.length)]);
            this.am = 1f;

            this.x = x;
            this.y = y;

            size(Random.Float(SIZE_MIN, SIZE_MAX));
            lifespan = Random.Float(LIFE_MIN, LIFE_MAX);
            left = lifespan;

            // 사방으로 흩뿌려지되 수평 확산 비중 ↑
            float a = Random.Float(0f, 360f);
            float v = Random.Float(OUT_V_MIN, OUT_V_MAX);
            speed.polar(a, v);

            // 약한 중력으로 아래로 가라앉음
            acc.set(0f, GRAVITY);
        }

        public static final Emitter.Factory FACTORY = new Emitter.Factory() {
            @Override
            public void emit(Emitter emitter, int index, float x, float y) {
                ((ElementEarthDustParticle) emitter.recycle(ElementEarthDustParticle.class))
                        .resetAroundCenter(x, y);
            }

            @Override
            public boolean lightMode() {
                return false;
            }
        };
    }

    /* ===================== WIND (소용돌이) ===================== */

    public static class ElementWindSwirlParticle extends PixelParticle {
        private static final int COLOR = 0x14EA83;
        public static final Emitter.Factory FACTORY_CCW = new ParamFactory(+1);
        public static final Emitter.Factory FACTORY_CW = new ParamFactory(-1);

        // 🔽 범위 축소 핵심 파라미터
        // 기존: TARGET_RADIUS * 0.65~0.90  →  축소: 0.45~0.65
        private static final float R_MIN_FRAC = 0.15f;
        private static final float R_MAX_FRAC = 0.15f;

        // 반경 유지(스프링) 세기: 값↑ → 원형 궤도에 더 바짝 붙음
        private static final float R_HOLD_VEL = 6.0f;   // 반경 오차에 비례한 ‘목표 반径속도’
        private static final float STEER_K = 7.5f;  // 목표 속도에 붙는 조향 가속 계수

        private float cx, cy, rTarget;
        private int dir; // +1: CCW, -1: CW
        private float swirlSpd;
        private float baseSize, phase, freq;

        public ElementWindSwirlParticle() {
            super();
            color(COLOR);
            am = 0f;
        }

        public void resetAtCenter(float cx, float cy, int dir) {
            revive();
            this.cx = cx;
            this.cy = cy;
            this.dir = (dir >= 0 ? +1 : -1);

            // 🔽 작은 고정 반경에서 시작
            float r0 = Random.Float(ECfg.TARGET_RADIUS * R_MIN_FRAC, ECfg.TARGET_RADIUS * R_MAX_FRAC);
            this.rTarget = r0;

            float ang = Random.Float(0f, (float) (Math.PI * 2.0));
            this.x = cx + (float) Math.cos(ang) * r0;
            this.y = cy + (float) Math.sin(ang) * r0;

            // 공통 수명 유지
            left = lifespan = Random.Float(ECfg.LIFE_MIN, ECfg.LIFE_MAX);

            // 한 바퀴 근사(작은 반경용) — 반경이 작아졌으니 자연스레 속도도 약간 낮춤
            this.swirlSpd = (float) ((2 * Math.PI * r0) / left) * 0.90f;

            // 접선 초기 속도
            float nx = (cx - x), ny = (cy - y);
            float inv = 1f / (float) Math.max(1e-4, Math.sqrt(nx * nx + ny * ny));
            nx *= inv;
            ny *= inv;
            float tx = -ny * this.dir, ty = nx * this.dir;
            speed.set(tx * swirlSpd, ty * swirlSpd);

            baseSize = Random.Float(1.1f, 1.8f);
            size(baseSize);
            phase = Random.Float(0f, (float) (Math.PI * 2.0));
            freq = Random.Float(8f, 12f);
        }

        @Override
        public void update() {
            // 현재 반경/방향
            float dx = cx - x, dy = cy - y;
            float r = (float) Math.sqrt(dx * dx + dy * dy);
            if (r < 1e-4f) r = 1e-4f;
            float nx = dx / r, ny = dy / r;
            float tx = -ny * dir, ty = nx * dir;

            // 🔽 반경 유지: 반경 오차에 비례한 ‘목표 반径속도’(안쪽/바깥쪽 보정)
            float rErr = r - rTarget;              // +면 과대, -면 과소
            float vRad = -rErr * R_HOLD_VEL;       // rErr>0 → 안쪽으로, rErr<0 → 바깥으로

            // 목표 속도 = 접선 회전 + 반径 보정
            float vxTarget = tx * swirlSpd + nx * vRad;
            float vyTarget = ty * swirlSpd + ny * vRad;

            // 목표 속도에 붙도록 조향
            acc.set((vxTarget - speed.x) * STEER_K, (vyTarget - speed.y) * STEER_K);

            super.update();

            float p = left / lifespan, age = lifespan - left;
            float env = (p < 0.12f) ? (p / 0.12f) : (p > 0.85f ? (1f - p) / 0.15f : 1f);
            float flicker = 0.55f + 0.35f * (float) Math.sin(phase + age * freq);
            am = Math.min(1f, flicker * env);
            size(baseSize * (0.95f + 0.22f * (1f - p)));
        }

        private static class ParamFactory extends Emitter.Factory {
            private final int dir;

            private ParamFactory(int dir) {
                this.dir = dir >= 0 ? +1 : -1;
            }

            @Override
            public void emit(Emitter emitter, int index, float x, float y) {
                ((ElementWindSwirlParticle) emitter.recycle(ElementWindSwirlParticle.class))
                        .resetAtCenter(x, y, dir);
            }

            @Override
            public boolean lightMode() {
                return true;
            }
        }
    }
}
