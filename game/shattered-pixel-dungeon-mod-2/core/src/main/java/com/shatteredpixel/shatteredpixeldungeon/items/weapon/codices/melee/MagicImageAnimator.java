package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.melee;

import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.noosa.Group;
import com.watabou.noosa.Image;
import com.watabou.noosa.Game;
import com.watabou.utils.PointF;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaSlashParticle;
import com.watabou.noosa.particles.Emitter;

import java.lang.reflect.Method;

/**
 * MagicImageAnimator
 *
 * - 물리적으로 아이템 이미지를 캐릭터 스프라이트 위에서 회전/이동시키는 유틸.
 * - sweep(베기), stab(찌르기)에 더해 charge(뒤로 젖힘+떨림), smash(큰 호로 내려찍기) 포함.
 * - 이번 수정: SMASH는 **스윙 속도는 원래대로**, **사라짐은 더 천천히**, **항상 화면 위→아래로** 보이도록 경로 선택 고정.
 */
public class MagicImageAnimator extends Group {

    public static final float DEFAULT_DURATION = 0.25f;      // sweep/stab 기본
    private static final float BASE_DIAGONAL_DEG = 45f;      // 리소스 기본 기울기 보정(NE)
    private static final boolean FLIP_FACING = false;        // 좌우 반전 필요시 true

    // 이미지 내부 피벗(손잡이 지점)에 대한 기본 비율(0..1)
    private static final float DEFAULT_ORIGIN_FRACTION_X = 0.08f;
    private static final float DEFAULT_ORIGIN_FRACTION_Y = 0.92f;

    // 찌르기(STAB)
    private static final float STAB_BACK_RATIO  = 0.5f;
    private static final float STAB_FADE_START  = 0.90f;

    // 차징(CHARGE)
    private static final float DEFAULT_CHARGE_DURATION = 0.7f;
    private static final float CHARGE_TILT_DEG = 32f;
    private static final float CHARGE_SHAKE_PX = 1.25f;

    // 스매시(SMASH)
    // 전체 duration 은 **스윙(원래 속도~0.5s) + 잔상/페이드 테일**의 합으로 구성
    private static final float DEFAULT_SMASH_DURATION =  0.35f;
    private static final float SMASH_START_OFFSET_DEG = -110f;
    private static final float SMASH_END_OFFSET_DEG   =   30f;
    private static final float SMASH_SWING_FRAC       = 0.56f;        // 총 시간 중 스윙 구간 비율(≈0.5/0.9)
    private static final float SMASH_WINDUP_FRAC      = 0.45f;        // (스윙 내부 비율) 준비 동작
    private static final float SMASH_IMPACT_FRAC      = 0.92f;        // (스윙 내부 비율) 타격 시점
    private static final float SMASH_FADE_START_FRAC  = 0.62f;        // 총 시간 비율, 이 뒤로 서서히 사라짐

    // --- 모드(애니메이션 종류) ---
    private enum Mode { SWEEP, STAB, CHARGE, SMASH }

    /* === 참조/상태 === */
    private final CharSprite owner;
    private final Image img;
    private final int magicImageIndex;
    private final Mode mode;

    // 공통 진행/시간
    private float elapsed = 0f;
    private final float duration;

    // 공통: 피벗 위치 보정(캐릭터 중심 대비, 픽셀)
    private final float pivotAdjustX;
    private final float pivotAdjustY;

    // 공통: 바라보는 각도(보정 전)
    private final float faceDeg;

    // --- SWEEP 전용 ---
    private float startDeg;
    private float endDeg;
    private boolean topToBottom;

    // --- STAB 전용 ---
    private float stabMaxDist;      // 최대 전진 거리(픽셀)
    private float stabRetractBias;  // 0.0~1.0

    // --- CHARGE 전용 ---
    private float chargeTiltDeg;
    private float chargeShakePx;

    // --- SMASH 전용 ---
    private float smashStartDeg;
    private float smashEndDeg;
    private float smashImpactFracAbs;   // 절대시간 기준 임팩트 시점(0..1)
    private boolean smashImpactTriggered = false;

    // 이펙트(선택적)
    private Emitter manaEmitter;
    private float afterImageCooldown = 0f;
    private float particleCooldown  = 0f;

    /* **********************************************************************
     * 정적 헬퍼: 8방향 베기
     ********************************************************************** */
    public static void sweep(CharSprite owner, int magicImageIndex, int dir8) {
        float faceDeg = dir8ToDeg(dir8);
        float adjX = -6f * owner.scale.x;
        float adjY = -8f * owner.scale.y;
        sweepAngle(owner, magicImageIndex, faceDeg, DEFAULT_DURATION,
                adjX, adjY, DEFAULT_ORIGIN_FRACTION_X, DEFAULT_ORIGIN_FRACTION_Y,
                0f, true);
    }

    public static void sweepVector(CharSprite owner, int magicImageIndex, int dx, int dy, boolean snapTo8) {
        float face = (float)Math.toDegrees(Math.atan2(dy, dx));
        if (snapTo8) face = Math.round(face / 45f) * 45f;
        float adjX = -6f * owner.scale.x;
        float adjY = -8f * owner.scale.y;
        sweepAngle(owner, magicImageIndex, face, DEFAULT_DURATION,
                adjX, adjY, DEFAULT_ORIGIN_FRACTION_X, DEFAULT_ORIGIN_FRACTION_Y,
                0f, true);
    }

    public static void sweepAngle(CharSprite owner, int magicImageIndex, float faceDeg,
                                  float duration, float pivotAdjustX, float pivotAdjustY,
                                  float originFracX, float originFracY,
                                  float angleOffsetDeg, boolean topToBottom) {
        MagicImageAnimator fx = new MagicImageAnimator(
                owner, magicImageIndex, Mode.SWEEP, faceDeg, duration,
                pivotAdjustX, pivotAdjustY, originFracX, originFracY,
                angleOffsetDeg, topToBottom,
                /* stab params */ 0f, 0.5f,
                /* charge */ CHARGE_TILT_DEG, CHARGE_SHAKE_PX,
                /* smash  */ 0f, 0f
        );
        owner.parent.add(fx);
        fx.attachEmitterIfPossible();
    }

    /* **********************************************************************
     * 정적 헬퍼: 8방향 찌르기
     ********************************************************************** */
    public static void stab(CharSprite owner, int magicImageIndex, int dir8) {
        float dx = -6f * owner.scale.x;
        float dy = -8f * owner.scale.y;
        float faceDeg = dir8ToDeg(dir8);
        float maxDist = 48f * owner.scale.x;  // 기본 전진 거리
        stabAngle(owner, magicImageIndex, faceDeg, DEFAULT_DURATION,
                dx, dy, DEFAULT_ORIGIN_FRACTION_X, DEFAULT_ORIGIN_FRACTION_Y,
                maxDist, 0.25f);
    }

    public static void stabVector(CharSprite owner, int magicImageIndex, int dx, int dy, boolean snapTo8) {
        float face = (float)Math.toDegrees(Math.atan2(dy, dx));
        if (snapTo8) face = Math.round(face / 45f) * 45f;
        float adjX = -6f * owner.scale.x;
        float adjY = -8f * owner.scale.y;
        float maxDist = 48f * owner.scale.x;
        stabAngle(owner, magicImageIndex, face, DEFAULT_DURATION,
                adjX, adjY, DEFAULT_ORIGIN_FRACTION_X, DEFAULT_ORIGIN_FRACTION_Y,
                maxDist, 0.25f);
    }

    public static void stabAngle(CharSprite owner, int magicImageIndex, float faceDeg,
                                 float duration, float pivotAdjustX, float pivotAdjustY,
                                 float originFracX, float originFracY,
                                 float stabMaxDist, float retractBias01) {
        MagicImageAnimator fx = new MagicImageAnimator(
                owner, magicImageIndex, Mode.STAB, faceDeg, duration,
                pivotAdjustX, pivotAdjustY, originFracX, originFracY,
                /* angleOffset/topToBottom for sweep (ignored) */ 0f, true,
                /* stab params */ stabMaxDist, clamp01(retractBias01),
                /* charge */ CHARGE_TILT_DEG, CHARGE_SHAKE_PX,
                /* smash  */ 0f, 0f
        );
        owner.parent.add(fx);
        fx.attachEmitterIfPossible();
    }

    /* **********************************************************************
     * 정적 헬퍼: 차징(뒤로 젖히고 떨림)
     ********************************************************************** */
    public static void charge(CharSprite owner, int magicImageIndex, int dir8) {
        float faceDeg = dir8ToDeg(dir8);
        float adjX = -6f * owner.scale.x;
        float adjY = -10f * owner.scale.y;
        chargeAngle(owner, magicImageIndex, faceDeg, DEFAULT_CHARGE_DURATION,
                adjX, adjY, DEFAULT_ORIGIN_FRACTION_X, DEFAULT_ORIGIN_FRACTION_Y,
                CHARGE_TILT_DEG, CHARGE_SHAKE_PX);
    }

    public static void chargeAngle(CharSprite owner, int magicImageIndex, float faceDeg,
                                   float duration, float pivotAdjustX, float pivotAdjustY,
                                   float originFracX, float originFracY,
                                   float tiltDeg, float shakePx) {
        MagicImageAnimator fx = new MagicImageAnimator(
                owner, magicImageIndex, Mode.CHARGE, faceDeg, duration,
                pivotAdjustX, pivotAdjustY, originFracX, originFracY,
                /* sweep params (unused) */ 0f, true,
                /* stab params (unused)  */ 0f, 0.5f,
                /* charge */ tiltDeg, shakePx,
                /* smash */ 0f, 0f
        );
        owner.parent.add(fx);
        fx.attachEmitterIfPossible();
    }

    /* **********************************************************************
     * 정적 헬퍼: 스매시(큰 호로 내려찍기)
     ********************************************************************** */
    public static void smash(CharSprite owner, int magicImageIndex, int dir8) {
        float faceDeg = dir8ToDeg(dir8);
        float adjX = -6f * owner.scale.x;
        float adjY = -8f * owner.scale.y;
        smashAngle(owner, magicImageIndex, faceDeg, DEFAULT_SMASH_DURATION,
                adjX, adjY, DEFAULT_ORIGIN_FRACTION_X, DEFAULT_ORIGIN_FRACTION_Y,
                SMASH_START_OFFSET_DEG, SMASH_END_OFFSET_DEG);
    }

    public static void smashAngle(CharSprite owner, int magicImageIndex, float faceDeg,
                                  float duration, float pivotAdjustX, float pivotAdjustY,
                                  float originFracX, float originFracY,
                                  float startOffsetDeg, float endOffsetDeg) {
        MagicImageAnimator fx = new MagicImageAnimator(
                owner, magicImageIndex, Mode.SMASH, faceDeg, duration,
                pivotAdjustX, pivotAdjustY, originFracX, originFracY,
                /* sweep params (unused) */ 0f, true,
                /* stab params (unused)  */ 0f, 0.5f,
                /* charge */ CHARGE_TILT_DEG, CHARGE_SHAKE_PX,
                /* smash  */ startOffsetDeg, endOffsetDeg
        );
        owner.parent.add(fx);
        fx.attachEmitterIfPossible();
    }

    private MagicImageAnimator(CharSprite owner,
                               int magicImageIndex,
                               Mode mode,
                               float faceDeg,
                               float duration,
                               float pivotAdjustX,
                               float pivotAdjustY,
                               float originFracX,
                               float originFracY,
                               float angleOffsetDeg,
                               boolean topToBottom,
                               float stabMaxDist,
                               float stabRetractBias,
                               float chargeTiltDeg,
                               float chargeShakePx,
                               float smashStartOffsetDeg,
                               float smashEndOffsetDeg) {
        this.owner = owner;
        this.magicImageIndex = magicImageIndex;
        this.mode = mode;
        this.faceDeg = faceDeg;
        this.duration = Math.max(0.02f, duration);
        this.pivotAdjustX = pivotAdjustX;
        this.pivotAdjustY = pivotAdjustY;
        this.stabMaxDist = Math.max(0f, stabMaxDist);
        this.stabRetractBias = clamp01(stabRetractBias);

        // CHARGE
        this.chargeTiltDeg = chargeTiltDeg;
        this.chargeShakePx = chargeShakePx;

        this.img = new ItemSprite(magicImageIndex);
        add(img);

        // 이미지 내부 피벗(origin) 세팅
        float ox = img.width  * clamp01(originFracX);
        float oy = img.height * clamp01(originFracY);
        img.origin.set(ox, oy);

        // 초기 각도/세팅
        float base = (FLIP_FACING ? -faceDeg : faceDeg) - BASE_DIAGONAL_DEG;

        if (mode == Mode.SWEEP) {
            float sweepBase = base + angleOffsetDeg;
            if (topToBottom) {
                this.startDeg = sweepBase - 90f;
                this.endDeg   = sweepBase + 90f;
            } else {
                this.startDeg = sweepBase + 90f;
                this.endDeg   = sweepBase - 90f;
            }
            this.topToBottom = topToBottom;
            img.angle = startDeg;

        } else if (mode == Mode.STAB) {
            img.angle = base;

        } else if (mode == Mode.CHARGE) {
            img.angle = base - this.chargeTiltDeg;

        } else { // Mode.SMASH
            // s: 등 뒤, eRaw: 목표 내려찍기 각도 (기본계)
            float s = base + smashStartOffsetDeg;
            float eRaw = base + smashEndOffsetDeg;

            // 바라보는 방향의 수직 성분을 기준으로 스윙 방향 고정(항상 화면 위→아래)
            float rad = (float)Math.toRadians(FLIP_FACING ? -faceDeg : faceDeg);
            float facingY = (float)-Math.cos(rad); // Noosa 좌표: 아래로 +
            // inlined: facingY >= 0f for swing direction

            if (facingY >= 0f) {
                this.smashStartDeg = s;
                this.smashEndDeg   = unwrapForward(s, eRaw);
            } else {
                this.smashStartDeg = s;
                this.smashEndDeg   = unwrapBackward(s, eRaw);
            }
            // 임팩트 절대 시점(총 시간 비율) = 스윙 구간 내 0.92 지점
            this.smashImpactFracAbs = SMASH_SWING_FRAC * SMASH_IMPACT_FRAC;
            img.angle = this.smashStartDeg;
        }

        // 최초 위치 동기화
        syncToOwner(0f);
    }

    private void attachEmitterIfPossible() {
        try {
            manaEmitter = new Emitter();
            if (owner != null && owner.parent != null) {
                owner.parent.add(manaEmitter);
            } else {
                add(manaEmitter);
            }
        } catch (Throwable t) {
            manaEmitter = null;
        }
    }

    @Override
    public void update() {
        super.update();

        if (owner == null || !owner.visible) {
            dispose();
            return;
        }

        float dt = Game.elapsed;
        elapsed += dt;
        float t = elapsed / duration;
        if (t >= 1f) {
            syncToOwner(1f);
            dispose();
            return;
        }

        syncToOwner(t);
        spawnEffects(dt, t);
    }

    private void syncToOwner(float t) {
        PointF c = owner.center();
        float px = c.x + pivotAdjustX;
        float py = c.y + pivotAdjustY;

        float baseFacing = (FLIP_FACING ? -faceDeg : faceDeg) - BASE_DIAGONAL_DEG;

        if (mode == Mode.SWEEP) {
            float a = lerp(startDeg, endDeg, t);
            img.angle = a;
            img.x = px - img.origin.x;
            img.y = py - img.origin.y;

        } else if (mode == Mode.STAB) {
            float tb = clamp01(stabRetractBias);
            float back = stabMaxDist * STAB_BACK_RATIO; // 뒤로 빠질 거리
            float d;
            if (t <= tb) {
                float tt = t / Math.max(0.0001f, tb);
                d = -easeOutCubic(tt) * back;
            } else {
                float tt = (t - tb) / Math.max(0.0001f, (1f - tb));
                d = -back + easeInCubic(tt) * (stabMaxDist + back);
            }

            float rad = (float)Math.toRadians(FLIP_FACING ? -faceDeg : faceDeg);
            float dx = (float)Math.sin(rad) * d;
            float dy = (float)-Math.cos(rad) * d;

            img.x = px - img.origin.x + dx;
            img.y = py - img.origin.y + dy;
            img.angle = baseFacing;

            if (t >= STAB_FADE_START) {
                float ft = (t - STAB_FADE_START) / Math.max(0.0001f, (1f - STAB_FADE_START));
                float fade = 1f - easeInCubic(clamp01(ft));
                try { img.alpha(fade); } catch (Throwable ignore) {}
            }

        } else if (mode == Mode.CHARGE) {
            float amp = chargeShakePx * (0.6f + 0.4f * clamp01(t));
            float jx = (float)(Math.sin(elapsed * 45.0) + Math.sin(elapsed * 87.0)) * 0.5f * amp;
            float jy = (float)(Math.cos(elapsed * 52.0) + Math.sin(elapsed * 73.0)) * 0.5f * amp;

            img.x = px - img.origin.x + jx;
            img.y = py - img.origin.y + jy;

            float wobble = (float)Math.sin(elapsed * 8.0) * 2f;
            img.angle = (baseFacing - this.chargeTiltDeg) + wobble;

            try { img.alpha(0.9f + 0.1f * (float)Math.sin(elapsed * 10.0)); } catch (Throwable ignore) {}

        } else { // Mode.SMASH
            float swingPortion = SMASH_SWING_FRAC;
            float tSwing = clamp01(t / Math.max(0.0001f, swingPortion));

            float a;
            if (tSwing <= SMASH_WINDUP_FRAC) {
                float wt = clamp01(tSwing / Math.max(0.0001f, SMASH_WINDUP_FRAC));
                a = lerp(smashStartDeg, smashStartDeg + (smashEndDeg - smashStartDeg) * 0.15f, easeOutCubic(wt));
            } else {
                float dt2 = (tSwing - SMASH_WINDUP_FRAC) / Math.max(0.0001f, (1f - SMASH_WINDUP_FRAC));
                a = lerp(smashStartDeg, smashEndDeg, easeInCubic(clamp01(dt2)));
            }
            img.angle = a;
            img.x = px - img.origin.x;
            img.y = py - img.origin.y;

            // 임팩트 연출 (스윙 진행 내부 92% 시점)
            if (!smashImpactTriggered && t >= smashImpactFracAbs) {
                smashImpactTriggered = true;
                try { img.scale.set(1.15f, 1.15f); } catch (Throwable ignore) {}
                try {
                    if (manaEmitter != null) {
                        manaEmitter.pos(img.x, img.y, img.width, img.height);
                        manaEmitter.burst(ManaSlashParticle.FACTORY, 8);
                    }
                } catch (Throwable ignore) {}
                trySpawnAfterImage(1.0f);
            } else if (smashImpactTriggered) {
                // scale 복귀
                try {
                    // 스윙이 끝난 이후에도 약간의 여운을 주며 복귀
                    float k = clamp01((t - smashImpactFracAbs) / 0.08f);
                    float s = 1.0f + (1.15f - 1.0f) * (1f - k);
                    img.scale.set(s, s);
                } catch (Throwable ignore) {}
            }

            // 페이드 아웃: 스윙이 끝난 뒤부터 서서히 사라지게
            if (t >= SMASH_FADE_START_FRAC) {
                float ft = (t - SMASH_FADE_START_FRAC) / Math.max(0.0001f, (1f - SMASH_FADE_START_FRAC));
                float fade = 1f - easeInCubic(clamp01(ft));
                try { img.alpha(fade); } catch (Throwable ignore) {}
            }
        }
    }

    private void spawnEffects(float dt, float t) {
        // 잔상
        afterImageCooldown -= dt;
        if (afterImageCooldown <= 0f) {
            afterImageCooldown = 0.03f;
            trySpawnAfterImage(0.65f);
        }

        // 파티클
        particleCooldown -= dt;
        if (particleCooldown <= 0f) {
            particleCooldown = 0.02f;
            try {
                if (manaEmitter != null) {
                    manaEmitter.pos(img.x, img.y, img.width, img.height);
                    manaEmitter.burst(ManaSlashParticle.FACTORY, 1);
                }
            } catch (Throwable ignore) {}
        }
    }

    private void trySpawnAfterImage(float alpha) {
        try {
            Class<?> cls = Class.forName("com.shatteredpixel.shatteredpixeldungeon.effects.ManaSlashAfterImage");
            Method[] methods = cls.getMethods();
            Group parentGroup = (owner != null && owner.parent != null) ? owner.parent : this;

            for (Method m : methods) {
                if (!"spawn".equals(m.getName())) continue;
                Class<?>[] ps = m.getParameterTypes();
                if (ps.length == 12 && Group.class.isAssignableFrom(ps[0]) && ps[1] == int.class) {
                    m.invoke(null,
                            parentGroup, 1,
                            img.x, img.y,
                            img.width, img.height,
                            img.origin.x, img.origin.y,
                            img.angle,
                            1f,
                            alpha,
                            0f, 0f
                    );
                    return;
                }
            }
            for (Method m : methods) {
                if (!"spawn".equals(m.getName())) continue;
                Class<?>[] ps = m.getParameterTypes();
                if (ps.length == 10 && Group.class.isAssignableFrom(ps[0]) && ps[1] == int.class) {
                    m.invoke(null,
                            parentGroup, 1,
                            img.x, img.y,
                            img.width, img.height,
                            img.angle,
                            1f,
                            alpha
                    );
                    return;
                }
            }
        } catch (Throwable ignore) {
        }
    }

    private void dispose() {
        if (parent != null) parent.remove(this);
        kill();
        if (manaEmitter != null) {
            try {
                manaEmitter.kill();
                if (manaEmitter.parent != null) manaEmitter.parent.remove(manaEmitter);
            } catch (Throwable ignore) {}
            manaEmitter = null;
        }
    }

    private static float dir8ToDeg(int dir8) {
        switch (dir8 & 7) {
            case 0:  return   0f;   // N
            case 1:  return  45f;   // NE
            case 2:  return  90f;   // E
            case 3:  return 135f;   // SE
            case 4:  return 180f;   // S
            case 5:  return-135f;   // SW
            case 6:  return -90f;   // W
            case 7:  return -45f;   // NW
            default: return   0f;
        }
    }

    private static float lerp(float a, float b, float t) {
        if (t <= 0f) return a;
        if (t >= 1f) return b;
        return a + (b - a) * t;
    }

    private static float clamp01(float v) {
        return v < 0f ? 0f : (v > 1f ? 1f : v);
    }

    private static float easeOutCubic(float x) {
        float f = 1f - x;
        return 1f - f*f*f;
    }

    private static float easeInCubic(float x) {
        return x*x*x;
    }

    private static float unwrapForward(float s, float e) {
        float d = e - s;
        while (d <= 0f) d += 360f;
        return s + d;
    }

    private static float unwrapBackward(float s, float e) {
        float d = e - s;
        while (d >= 0f) d -= 360f;
        return s + d;
    }
}
