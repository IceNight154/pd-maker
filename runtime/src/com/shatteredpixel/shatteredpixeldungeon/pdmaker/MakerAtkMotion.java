/*
 * PDMaker — 아이템 공격 모션 · 이펙트 타임라인 규칙 (8차). 편집기 editor/renderer/js/atkmotion.js (PDM.atkMotion) 와 같은 규칙 — 같은 입력이면 같은 결과
 *   (tools/tests/run.js 가 이 파일을 javac 로 실행해 비교: tools/tests/AtkMotionCheck.java). 형식은 atkmotion.js 머리말
 *   게임 라이브러리를 쓰지 않음 (MakerTitleModel.Val 로 읽음) — MakerSwing 이 그림 자리 · 이펙트 시각을 여기서 얻음
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitleModel.Val;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MakerAtkMotion {

	public static final List<String> EASES = Arrays.asList("smooth", "linear", "in", "out", "inout", "step", "back");
	public static final String[] PROPS = { "angle", "dist", "scale", "alpha", "ox", "oy" };
	static final double[] DEF = { 0, 0, 1, 1, 0, 0 };
	public static final List<String> TYPES = Arrays.asList("effect", "flash", "shake", "sound", "trail", "shock", "image", "projectile");
	public static final List<String> ANCHORS = Arrays.asList("tip", "hero", "target");
	public static final double HERO_ATTACK_SEC = 4.0 / 15.0;

	static double clamp(double v, double lo, double hi) { return Math.min(hi, Math.max(lo, v)); }
	static boolean fin(double v) { return !Double.isNaN(v) && !Double.isInfinite(v); }
	static double num(Val o, String k, double d) { return o == null || !o.isObject() ? d : o.num(k, d); }
	static String str(Val o, String k, String d) { if (o == null || !o.isObject() || !o.has(k)) return d; Val v = o.get(k); return v != null && v.isString() ? v.asString() : d; }
	static String pick(Val o, String k, List<String> list, String d) { String v = str(o, k, d); return list.contains(v) ? v : d; }
	/** 배열 원소가 숫자인지 · 그 값 (Val 에는 원소 숫자 읽기가 없어 글로 바꿔 읽음 — 글(문자열) 원소는 숫자 아님) */
	static double el(Val a, int i) {
		if (a == null || !a.isArray() || i >= a.size()) return Double.NaN;
		Val x = a.at(i); if (x == null || x.isString() || x.isObject() || x.isArray()) return Double.NaN;
		try { return Double.parseDouble(x.asString()); } catch (Exception e) { return Double.NaN; }
	}
	static String elStr(Val a, int i) { if (a == null || !a.isArray() || i >= a.size()) return null; Val x = a.at(i); return x != null && x.isString() ? x.asString() : null; }

	public static double ease(String name, double u) {
		u = clamp(u, 0, 1);
		switch (name) {
			case "linear": return u;
			case "in": return u * u;
			case "out": return 1 - (1 - u) * (1 - u);
			case "inout": return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
			case "step": return u < 1 ? 0 : 1;
			case "back": { double c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
			default: return u * u * (3 - 2 * u);
		}
	}
	/** 키프레임 하나 { t, v, 이징 } */
	public static final class Key { public final double t, v; public final String e; Key(double t, double v, String e) { this.t = t; this.v = v; this.e = e; } }
	static List<Key> normTrack(Val a) {
		List<Key> out = new ArrayList<>();
		if (a == null || !a.isArray()) return out;
		for (int i = 0; i < a.size(); i++) {
			Val k = a.at(i);
			if (k == null || !k.isArray() || k.size() < 2) continue;
			double t = el(k, 0), v = el(k, 1);
			if (!fin(t) || !fin(v) || t < 0 || t > 1) continue;
			String e = elStr(k, 2);
			out.add(new Key(t, v, e != null && EASES.contains(e) ? e : "smooth"));
		}
		out.sort((x, y) -> Double.compare(x.t, y.t));   // 안정 정렬 (JS 와 같음)
		return out;
	}
	/** 트랙들 (PROPS 순서) — 2판 tracks, 없으면 1판 keys */
	public static List<List<Key>> tracksOf(Val fx) {
		List<List<Key>> out = new ArrayList<>();
		Val t = fx == null || !fx.isObject() ? null : fx.get("tracks");
		if (t != null && t.isObject()) { for (String p : PROPS) out.add(normTrack(t.get(p))); return out; }
		Val keys = fx == null || !fx.isObject() ? null : fx.get("keys");
		List<double[]> ks = new ArrayList<>();
		if (keys != null && keys.isArray()) for (int i = 0; i < keys.size(); i++) {
			Val k = keys.at(i);
			if (k == null || !k.isArray() || k.size() < 5) continue;
			double[] r = new double[5]; boolean ok = true;
			for (int j = 0; j < 5; j++) { r[j] = el(k, j); ok &= fin(r[j]); }
			if (ok) ks.add(r);
		}
		for (int p = 0; p < PROPS.length; p++) {
			List<Key> tr = new ArrayList<>();
			if (p < 4) for (double[] r : ks) tr.add(new Key(r[0], r[p + 1], "smooth"));
			out.add(tr);
		}
		return out;
	}
	static double sampleTrack(List<Key> tr, double t, double d) {
		if (tr.isEmpty()) return d;
		if (t <= tr.get(0).t) return tr.get(0).v;
		for (int i = 1; i < tr.size(); i++) {
			Key a = tr.get(i - 1), b = tr.get(i);
			if (t <= b.t) { double u = (t - a.t) / Math.max(1e-6, b.t - a.t); return a.v + (b.v - a.v) * ease(a.e, u); }
		}
		return tr.get(tr.size() - 1).v;
	}
	/** t 에서 [angle, dist, scale, alpha, ox, oy] */
	public static double[] sample(List<List<Key>> tracks, double t) {
		double[] o = new double[PROPS.length];
		for (int i = 0; i < PROPS.length; i++) o[i] = sampleTrack(tracks.get(i), t, DEF[i]);
		return o;
	}
	public static double durOf(Val fx) { return Math.max(0.05, num(fx, "dur", 0.3) / Math.max(0.1, num(fx, "speed", 1))); }
	public static double[] hitsOf(Val fx) {
		Val h = fx == null || !fx.isObject() ? null : fx.get("hits");
		List<Double> l = new ArrayList<>();
		if (h != null && h.isArray()) for (int i = 0; i < h.size(); i++) { double v = el(h, i); if (fin(v) && v >= 0 && v <= 1) l.add(v); }
		l.sort(Double::compare);
		double[] o = new double[l.size()]; for (int i = 0; i < o.length; i++) o[i] = l.get(i); return o;
	}
	public static List<double[]> windowsOf(Val fx) {
		Val w = fx == null || !fx.isObject() ? null : fx.get("hitWindows");
		List<double[]> out = new ArrayList<>();
		if (w != null && w.isArray()) for (int i = 0; i < w.size(); i++) {
			Val x = w.at(i); if (x == null || !x.isArray() || x.size() < 2) continue;
			double a = el(x, 0), b = el(x, 1); if (!fin(a) || !fin(b)) continue;
			out.add(new double[]{ clamp(Math.min(a, b), 0, 1), clamp(Math.max(a, b), 0, 1) });
		}
		if (!out.isEmpty()) { out.sort((x, y) -> Double.compare(x[0], y[0])); return out; }
		for (double hh : hitsOf(fx)) out.add(new double[]{ hh, hh });
		return out;
	}
	/** 이펙트 하나 (정리된 값) */
	public static final class Ev {
		public String id, type, anchor, ease, ref, color, role; public double t, dur, dir, size, alpha, every, power, grow;
	}
	static Ev normEvent(Val e) {
		Ev o = new Ev();
		o.id = str(e, "id", ""); o.type = pick(e, "type", TYPES, "effect"); o.t = clamp(num(e, "t", 0), 0, 1); o.dur = clamp(num(e, "dur", 0), 0, 10);
		o.anchor = pick(e, "anchor", ANCHORS, "tip"); o.dir = num(e, "dir", 0); o.size = clamp(num(e, "size", 1), 0, 20); o.alpha = clamp(num(e, "alpha", 1), 0, 1);
		o.ease = pick(e, "ease", EASES, "linear"); o.ref = str(e, "ref", ""); o.every = clamp(num(e, "every", 0.03), 0.01, 1); o.power = clamp(num(e, "power", 3), 0, 64);
		o.color = str(e, "color", "#ffffff"); o.grow = clamp(num(e, "grow", 0), -1, 10); o.role = pick(e, "role", Arrays.asList("", "hit"), "");
		return o;
	}
	public static List<Ev> eventsOf(Val fx) {
		List<Ev> out = new ArrayList<>();
		Val a = fx == null || !fx.isObject() ? null : fx.get("events");
		if (a != null && a.isArray()) for (int i = 0; i < a.size(); i++) { Val e = a.at(i); if (e != null && e.isObject()) out.add(normEvent(e)); }
		return out;
	}
	/** { phase(0 전 · 1 진행 · 2 끝 · 3 순간), u, p, alpha, size } */
	public static double[] eventState(Ev ev, double D, double sec) {
		double s = ev.t * D, e = s + ev.dur;
		if (sec < s) return new double[]{ 0, 0, 0, ev.alpha, ev.size };
		if (ev.dur <= 0) return new double[]{ 3, 1, 1, ev.alpha, ev.size };
		if (sec > e) return new double[]{ 2, 1, 1, 0, ev.size * (1 + ev.grow) };
		double u = (sec - s) / ev.dur, p = ease(ev.ease, u);
		return new double[]{ 1, u, p, ev.alpha * (1 - p), ev.size * (1 + ev.grow * p) };
	}
	public static double judgeSec(Val fx, double animSec) {
		double D = durOf(fx); double[] h = hitsOf(fx);
		return "hit".equals(str(fx, "sync", "game")) && h.length > 0 ? h[0] * D : (fin(animSec) ? animSec : HERO_ATTACK_SEC);
	}
	/** sync 'hit' 일 때 게임 공격 동작의 한 칸 시간 (초) — 아니면 -1 */
	public static double syncDelay(Val fx, int frames) { double[] h = hitsOf(fx); return "hit".equals(str(fx, "sync", "game")) && h.length > 0 ? Math.max(0.01, h[0] * durOf(fx)) / Math.max(1, frames) : -1; }

	// ------------------------------------------------------------ 검사 (atkmotion.js validate 와 같은 코드 · 경로)
	public static List<String[]> validate(Val fx, double animSec) {
		List<String[]> out = new ArrayList<>();
		if (fx == null || !fx.isObject()) return out;
		double D = durOf(fx); List<List<Key>> T = tracksOf(fx);
		Val tracks = fx.get("tracks");
		if (tracks != null && tracks.isObject()) {
			boolean any = false;
			for (int i = 0; i < PROPS.length; i++) {
				String p = PROPS[i]; Val raw = tracks.get(p);
				if (raw != null && !raw.isArray()) out.add(new String[]{ "error", "track", "tracks." + p });
				if (raw != null && raw.isArray()) { boolean bad = false; for (int j = 0; j < raw.size(); j++) { Val k = raw.at(j); double t = k == null || !k.isArray() ? Double.NaN : el(k, 0), v = k == null || !k.isArray() ? Double.NaN : el(k, 1); if (!fin(t) || !fin(v) || t < 0 || t > 1) bad = true; } if (bad) out.add(new String[]{ "warn", "keyRange", "tracks." + p }); }
				any |= !T.get(i).isEmpty();
			}
			if (!any) out.add(new String[]{ "error", "noKeys", "tracks" });
		} else { Val k = fx.get("keys"); if (k == null || !k.isArray() || k.size() < 2) out.add(new String[]{ "error", "noKeys", "keys" }); }
		if (num(fx, "dur", 0.3) <= 0) out.add(new String[]{ "error", "negative", "dur" });
		if (num(fx, "speed", 1) <= 0) out.add(new String[]{ "error", "negative", "speed" });
		double[] hits = hitsOf(fx); List<double[]> wins = windowsOf(fx); String sync = str(fx, "sync", "game");
		Val rh = fx.get("hits");
		if (rh != null && rh.isArray()) { boolean bad = false; for (int i = 0; i < rh.size(); i++) { double v = el(rh, i); if (!fin(v) || v < 0 || v > 1) bad = true; } if (bad) out.add(new String[]{ "warn", "hitRange", "hits" }); }
		Val rw = fx.get("hitWindows");
		if (rw != null && rw.isArray()) { boolean bad = false; for (int i = 0; i < rw.size(); i++) { Val w = rw.at(i); if (w == null || !w.isArray() || w.size() < 2 || !fin(el(w, 0)) || !fin(el(w, 1))) bad = true; } if (bad) out.add(new String[]{ "warn", "windowRange", "hitWindows" }); }
		if (hits.length == 0 && wins.isEmpty()) out.add(new String[]{ "warn", "noHit", "hits" });
		List<Ev> evs = eventsOf(fx); double jt = judgeSec(fx, animSec) / D;
		if (hits.length > 1) out.add(new String[]{ "warn", "multiHitVisual", "hits" });
		for (int i = 0; i < evs.size(); i++) {
			Ev e = evs.get(i); if (!"hit".equals(e.role)) continue;
			boolean in = false; for (double[] w : wins) if (e.t >= w[0] - 1e-6 && e.t <= w[1] + 1e-6) in = true;
			if (!in) out.add(new String[]{ "warn", "visualNoJudge", "events." + i });
		}
		if ("game".equals(sync) && hits.length > 0 && Math.abs(hits[0] - jt) * D > 0.06) out.add(new String[]{ "warn", "desync", "sync" });
		if ("hit".equals(sync) && hits.length == 0) out.add(new String[]{ "warn", "syncNoHit", "sync" });
		if (jt > 1 + 1e-6) out.add(new String[]{ "warn", "judgeAfterEnd", "dur" });
		for (int i = 0; i < evs.size(); i++) {
			Ev e = evs.get(i);
			if (Arrays.asList("effect", "trail", "image", "sound").contains(e.type) && e.ref.isEmpty()) out.add(new String[]{ "warn", "noRef", "events." + i + ".ref" });
			if (e.t * D + e.dur > D + 2) out.add(new String[]{ "warn", "eventLong", "events." + i + ".dur" });
		}
		return out;
	}
	/** 디버그용 한 줄 */
	static Map<String, Object> debug(Val fx) { Map<String, Object> m = new LinkedHashMap<>(); m.put("dur", durOf(fx)); m.put("hits", hitsOf(fx).length); m.put("events", eventsOf(fx).size()); return m; }
}
