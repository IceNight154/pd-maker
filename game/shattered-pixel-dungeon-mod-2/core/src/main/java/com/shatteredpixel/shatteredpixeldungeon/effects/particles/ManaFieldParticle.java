package com.shatteredpixel.shatteredpixeldungeon.effects.particles;

import com.watabou.noosa.particles.Emitter;
import com.watabou.noosa.particles.PixelParticle;
import com.watabou.utils.Random;

public class ManaFieldParticle extends PixelParticle {

    // 은은한 물빛 마나(#38ABAB)
    private static final int COLOR = 0x38ABAB;

    // 외부에서 바로 쓸 싱글턴 팩토리
    public static final Emitter.Factory FACTORY = new Factory();

    // 내부 파라미터
    private float baseSize;
    private float phase;      // 파형 위상(깜빡임/펄스)
    private float freq;       // 깜빡임 주파수
    private float reAimT;     // 천천히 방향 재조정 타이머

    public ManaFieldParticle() {
        super();
        color(COLOR);
        am = 0f;  // 알파는 update에서 제어
    }

    public void reset(float x, float y){
        revive();

        // 타일 중심 근처에서 약간 퍼져 시작(바닥에서 피어오르는 느낌)
        this.x = x + Random.Float(-5f, 5f);
        this.y = y + Random.Float(2f, 6f);

        // 비교적 긴 수명으로 은은히 유지
        left = lifespan = Random.Float(1.0f, 1.8f);

        // 아주 작은 입자(반딧불 톤)
        baseSize = Random.Float(0.8f, 1.4f);
        size(baseSize);

        // 위로 천천히 떠오르며 약한 수평 흔들림
        float vx = Random.Float(-6f, 6f);
        float vy = Random.Float(-12f, -6f);   // 화면 좌표가 ↓가 +라면 음수로 '상향'
        speed.set(vx, vy);

        // 가벼운 감속(너무 빨리 멈추지 않게 약하게만)
        acc.set(-speed.x * 0.6f, -speed.y * 0.25f);

        // 부드러운 깜빡임/맥동
        phase = Random.Float(0f, (float)(Math.PI * 2.0));
        freq  = Random.Float(4.5f, 7.5f);

        // 드물게 방향을 살짝 새로 잡아 ‘살랑’ 느낌
        reAimT = Random.Float(0.25f, 0.45f);
    }

    @Override
    public void update() {
        super.update();

        float p   = left / lifespan;          // 1 -> 0 (잔여 비율)
        float age = lifespan - left;

        // 은은한 깜빡임 + 페이드 인/아웃(처음/끝만 살짝)
        float flicker   = 0.35f + 0.25f * (float)Math.sin(phase + age * freq);
        float envelope; // 부드러운 등장/퇴장
        if (p > 0.85f) {
            // 마지막 15%에서 서서히 사그라짐
            envelope = (p - 0.70f) / 0.15f; // 0.15 구간에서 1→0로 내려가도록(아래 clamp)
        } else if (p < 0.15f) {
            // 처음 15%에서 서서히 밝아짐
            envelope = p / 0.15f;           // 0→1
        } else {
            envelope = 1f;
        }
        envelope = Math.max(0f, Math.min(1f, envelope));
        am = Math.max(0f, Math.min(1f, flicker * envelope));

        // 호흡하듯 크기 변화(작은 폭)
        float pulse = 0.90f + 0.20f * (float)Math.sin(phase + age * (freq * 0.8f));
        size(baseSize * pulse);

        // 가끔 아주 미세하게 방향을 재조정(랜덤 워크)
        reAimT -= Random.Float(0.015f, 0.030f);
        if (reAimT <= 0f) {
            reAimT = Random.Float(0.25f, 0.45f);
            float ang = Random.Float(0f, (float)(Math.PI * 2.0));
            float v   = Random.Float(4f, 8f);           // 미세한 보정량
            speed.x = speed.x * 0.90f + (float)Math.cos(ang) * v * 0.10f;
            speed.y = speed.y * 0.90f + (float)Math.sin(ang) * v * 0.10f;
            acc.set(-speed.x * 0.6f, -speed.y * 0.25f);
        }
    }

    /** Emitter에서 사용할 팩토리 */
    public static class Factory extends Emitter.Factory {
        @Override
        public void emit(Emitter emitter, int index, float x, float y) {
            ((ManaFieldParticle) emitter.recycle(ManaFieldParticle.class)).reset(x, y);
        }
        @Override
        public boolean lightMode() {
            // 가산합성: 바닥에서 올라오는 휘광을 은은하게 살림(알파는 낮게 유지)
            return true;
        }
    }
}
