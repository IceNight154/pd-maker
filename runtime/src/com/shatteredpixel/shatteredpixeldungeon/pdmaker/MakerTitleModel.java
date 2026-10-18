/*
 * 타이틀 화면 공통 규칙 (7차) — 편집기 editor/renderer/js/titlemodel.js (PDM.titleModel) 와 같은 함수 · 같은 순서
 *   게임 라이브러리를 쓰지 않는 순수 자바 (값은 Val 로 읽음) → tools/tests/run.js 가 이 파일을 실제로 컴파일 · 실행해 같은 입력의 결과를 편집기 식과 비교
 *   좌표 = 게임 UI 좌표 (논리 화면). 글자 크기를 재는 일만 엔진마다 다름 — 잰 값을 넣어 줌
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MakerTitleModel {

	/** JSON 값 읽기 (런타임 = JsonValue, 검사 = 자체 파서). 없거나 틀린 값 = 기본값 */
	public interface Val {
		boolean has(String k);
		Val get(String k);
		String str(String k, String d);
		/** 숫자 (없음 · 빈 글 · 숫자 아님 = d) */
		double num(String k, double d);
		boolean bool(String k, boolean d);
		int size();
		Val at(int i);
		boolean isObject();
		boolean isArray();
		boolean isString();
		String asString();
	}

	public static final String[] GAME_IDS = { "play", "support", "rankings", "journal", "news", "changes", "settings", "about" };
	public static final String[] STATES = { "normal", "hover", "focus", "pressed", "disabled" };
	public static final List<String> ACTIONS = Arrays.asList("text", "window", "newgame", "continue", "scene", "url", "quit", "close");

	static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
	static double clamp(double v, double lo, double hi) { return Math.min(hi, Math.max(lo, v)); }
	/** JS num(v, def, lo, hi) */
	static double num(Val o, String k, double def, double lo, double hi) { return o == null || !o.has(k) ? def : clamp(o.num(k, def), lo, hi); }
	/** JS it_ (자바 getInt 처럼 소수 버림) */
	static int it(Val o, String k, int def) { if (o == null || !o.has(k)) return def; double v = o.num(k, Double.NaN); return Double.isNaN(v) ? def : (int) v; }
	/** JS fl_ */
	static double fl(Val o, String k, double def) { return o == null || !o.has(k) ? def : o.num(k, def); }

	// ---------------- 버튼 상태 ----------------
	public static class Style {
		public String skin = "GREY_BUTTON_TR", image = "", textColor = "#ffffff";
		public double slice = 4, textAlpha = 1, alpha = 1, scale = 1, bright = 1, dy = 0;
	}
	static void mergeBuiltin(Style o, String s) {
		switch (s) {
			case "focus": o.bright = 1.3; break;
			case "pressed": o.bright = 1.2; break;
			case "disabled": o.textAlpha = 0.3; break;
		}
	}
	static void mergeState(Style o, Val s, Set<String> chrome) {
		if (s == null || !s.isObject()) return;
		String skin = s.str("skin", "");
		if (!skin.isEmpty() && (chrome == null || chrome.contains(skin))) o.skin = skin;
		String img = s.str("image", "");
		if (!img.isEmpty()) o.image = img;
		if (s.has("slice") && !s.str("slice", "x").isEmpty()) o.slice = clamp(s.num("slice", o.slice), 0, 64);
		String tc = s.str("textColor", "");
		if (HEX.matcher(tc).matches()) o.textColor = tc.toLowerCase();
		if (s.has("textAlpha") && !s.str("textAlpha", "x").isEmpty()) o.textAlpha = clamp(s.num("textAlpha", o.textAlpha), 0, 1);
		if (s.has("alpha") && !s.str("alpha", "x").isEmpty()) o.alpha = clamp(s.num("alpha", o.alpha), 0, 1);
		if (s.has("scale") && !s.str("scale", "x").isEmpty()) o.scale = clamp(s.num("scale", o.scale), 0.5, 2);
		if (s.has("bright") && !s.str("bright", "x").isEmpty()) o.bright = clamp(s.num("bright", o.bright), 0, 3);
		if (s.has("dy") && !s.str("dy", "x").isEmpty()) o.dy = clamp(s.num("dy", o.dy), -20, 20);
	}
	/** flags = { hover, focus, pressed, disabled } — 같은 상태 안: 버튼 > 묶음 > 게임 기본, 다른 상태끼리: 우선순위가 높은 상태 */
	public static Style resolveStyle(Val bs, Val item, boolean[] flags, String accent, Set<String> chrome) {
		Style o = new Style();
		String gs0 = bs == null ? "" : bs.str("style", "");
		if (!gs0.isEmpty() && (chrome == null || chrome.contains(gs0))) o.skin = gs0;
		if (accent != null && HEX.matcher(accent).matches()) o.textColor = accent.toLowerCase();
		Val gs = bs == null ? null : bs.get("states"), is = item == null ? null : item.get("states");
		for (int i = 0; i < STATES.length; i++) {
			String s = STATES[i];
			if (i > 0 && (flags == null || !flags[i - 1])) continue;
			if (i > 0) mergeBuiltin(o, s);
			mergeState(o, gs == null ? null : gs.get(s), chrome);
			mergeState(o, is == null ? null : is.get(s), chrome);
		}
		return o;
	}

	// ---------------- 효과 ----------------
	static final List<String> TRIGGERS = Arrays.asList("enter", "always", "hover", "focus", "click");
	static final List<String> FX_TYPES = Arrays.asList("fade", "move", "scale", "bright", "shake");
	static final List<String> EASES = Arrays.asList("linear", "smooth", "inout", "back");

	public static class Fx {
		public String trigger, type, dir, ease;
		public double from, to, duration, delay, freq;
		public int repeat; public boolean yoyo;
	}
	public static Fx fxNorm(Val f) {
		Fx o = new Fx();
		String t = f == null ? "" : f.str("type", "");
		o.type = FX_TYPES.contains(t) ? t : "fade";
		double defFrom = o.type.equals("fade") ? 0 : o.type.equals("scale") ? 0.6 : o.type.equals("bright") ? 1 : o.type.equals("shake") ? 3 : 16;
		double defTo = o.type.equals("fade") || o.type.equals("scale") || o.type.equals("bright") ? 1 : 0;
		String tr = f == null ? "" : f.str("trigger", "");
		o.trigger = TRIGGERS.contains(tr) ? tr : "enter";
		String d = f == null ? "" : f.str("dir", "");
		o.dir = !d.isEmpty() ? d : (o.type.equals("shake") ? "x" : "down");
		o.from = num(f, "from", defFrom, -1000, 1000); o.to = num(f, "to", defTo, -1000, 1000);
		o.duration = num(f, "duration", 0.5, 0.01, 60); o.delay = num(f, "delay", 0, 0, 60);
		o.repeat = (int) Math.round(num(f, "repeat", 0, -1, 1000));
		o.yoyo = f != null && f.bool("yoyo", false);
		String e = f == null ? "" : f.str("ease", "");
		o.ease = EASES.contains(e) ? e : "smooth";
		o.freq = num(f, "freq", 12, 0.1, 60);
		return o;
	}
	public static double ease(String kind, double k) {
		k = clamp(k, 0, 1);
		switch (kind) {
			case "linear": return k;
			case "inout": return k * k * (3 - 2 * k);
			case "back": { double c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
			default: return 1 - (1 - k) * (1 - k) * (1 - k);
		}
	}
	public static double fxProgress(Fx f, double tau) {
		double t = tau - f.delay;
		if (t <= 0) return 0;
		double raw = t / f.duration; long c = (long) Math.floor(raw);
		if (f.repeat >= 0 && c > f.repeat) return f.yoyo && f.repeat % 2 == 1 ? 0 : 1;
		double frac = raw - c;
		return f.yoyo && c % 2 == 1 ? 1 - frac : frac;
	}
	/** { dx, dy, scale, alpha, bright } */
	public static double[] fxValue(Fx f, double tau) {
		double p = fxProgress(f, tau), e = ease(f.ease, p), v = f.from + (f.to - f.from) * e;
		double[] out = { 0, 0, 1, 1, 1 };
		switch (f.type) {
			case "fade": out[3] = clamp(v, 0, 1); break;
			case "scale": out[2] = Math.max(0, v); break;
			case "bright": out[4] = Math.max(0, v); break;
			case "move": {
				int sx = 0, sy = 1;
				switch (f.dir) { case "up": sx = 0; sy = -1; break; case "left": sx = -1; sy = 0; break; case "right": sx = 1; sy = 0; break; default: sx = 0; sy = 1; }
				out[0] = sx * v; out[1] = sy * v; break;
			}
			case "shake": {
				double d = v * Math.sin(Math.PI * 2 * f.freq * f.duration * p);
				if (f.dir.equals("y") || f.dir.equals("up") || f.dir.equals("down")) out[1] = d; else out[0] = d;
				break;
			}
		}
		return out;
	}
	public static double[] fxCombine(List<double[]> list) {
		double[] o = { 0, 0, 1, 1, 1 };
		for (double[] v : list) { o[0] += v[0]; o[1] += v[1]; o[2] *= v[2]; o[3] *= v[3]; o[4] *= v[4]; }
		return o;
	}
	/** "동안" 효과 시간: 켜져 있으면 앞으로, 꺼지면 한 바퀴 안으로 줄인 뒤 0 까지 거꾸로 */
	public static double heldStep(double tau, boolean active, double dt, Fx f) {
		if (active) return tau + dt;
		double end = f.delay + f.duration;
		return Math.max(0, Math.min(tau, end) - dt);
	}
	public static boolean fxDone(Fx f, double tau) { return f.repeat >= 0 && tau - f.delay >= f.duration * (f.repeat + 1); }

	/** 버튼 묶음 등장 · 대기 애니메이션 → { dx, dy, alpha, bw, a, stagger } */
	public static double[] groupAnim(Val an, boolean gateOn, boolean revealed, boolean returning, double returnT, double clock, double t, int i, double bw, double hideK) {
		String enter = an == null ? "" : an.str("enter", ""); if (enter.isEmpty()) enter = gateOn ? "slideUp" : "none";
		double dur = Math.max(0.05, fl(an, "duration", 0.6)), stag = fl(an, "stagger", 0.08), dist = fl(an, "distance", 24);
		String idle = an == null ? "" : an.str("idle", ""); if (idle.isEmpty()) idle = "none";
		double amt = fl(an, "idleAmount", 2), spd = fl(an, "idleSpeed", 1);
		double a;
		if (!revealed && !returning && gateOn) a = 0;
		else if (enter.equals("none")) a = 1;
		else a = Math.max(0, Math.min(1, (clock - i * stag) / dur));
		double out = returning ? returnT : 0;
		double k = ease("smooth", a), dx = 0, dy = 0, w = bw;
		switch (enter) {
			case "slideUp": dy = dist * (1 - k); break;
			case "slideDown": dy = -dist * (1 - k); break;
			case "slideLeft": dx = dist * (1 - k); break;
			case "slideRight": dx = -dist * (1 - k); break;
			case "drop": dy = -dist * (1 - ease("back", a)); k = Math.min(1, a * 2); break;
			case "pop": w = bw * (0.6 + 0.4 * ease("back", a)); k = Math.min(1, a * 2); break;
		}
		dy += dist * 0.5 * out;
		double alpha = (enter.equals("none") ? (a > 0 ? 1 : 0) : k) * (1 - out) * (1 - hideK);
		if (a >= 1 && !returning) {
			double ph = t * spd * 2.5 + i * 0.7;
			if (idle.equals("bob")) dy += Math.sin(ph) * amt;
			else if (idle.equals("sway")) dx += Math.sin(ph) * amt;
			else if (idle.equals("pulse")) alpha *= 0.8 + 0.2 * Math.sin(ph);
		}
		return new double[]{ dx, dy, alpha, w, a, stag };
	}

	// ---------------- 버튼 목록 · 배치 ----------------
	public static class Entry { public String id, action; public Val item; public int gameIndex; public boolean disabled; }
	public static List<Entry> buttonList(Val bs, boolean hasSaves, boolean canQuit) {
		Map<String, Val> byId = new LinkedHashMap<>();
		Val items = bs == null ? null : bs.get("items");
		if (items != null && items.isArray()) for (int i = 0; i < items.size(); i++) { Val it = items.at(i); if (it != null && it.isObject() && it.has("id") && it.get("id").isString() && !byId.containsKey(it.str("id", ""))) byId.put(it.str("id", ""), it); }
		List<String> order = new ArrayList<>(byId.keySet());
		for (String id : GAME_IDS) if (!byId.containsKey(id)) order.add(id);
		List<Entry> out = new ArrayList<>();
		for (String id : order) {
			Val it = byId.get(id); int gi = Arrays.asList(GAME_IDS).indexOf(id);
			if (it != null && !it.bool("visible", true)) continue;
			String action = it == null ? "" : it.str("action", "");
			if (gi < 0 && !(it != null && (it.bool("custom", false) || !action.isEmpty()))) continue;
			boolean disabled = it != null && !it.bool("enabled", true);
			if (action.equals("continue") && !hasSaves) {
				String ns = it.str("noSave", "disable");
				if (ns.equals("hide")) continue;
				if (ns.equals("newgame")) action = "newgame"; else disabled = true;
			}
			if (action.equals("quit") && !canQuit) continue;
			if (action.equals("close")) continue;
			Entry e = new Entry(); e.id = id; e.item = it; e.gameIndex = gi; e.disabled = disabled; e.action = action;
			out.add(e);
		}
		return out;
	}
	/** 버튼 자리 [x, y, w, h] — MakerTitle.Root 가 씀 */
	public static double[][] buttonRects(Val bs, int n, double W, double H, boolean land, double logoY, double logoH, Val gate, Val[] places) {
		String layout = bs == null ? "game" : bs.str("layout", "game"); if (layout.isEmpty()) layout = "game";
		int bh = it(bs, "height", 20), gap = it(bs, "gap", 3);
		double aw = it(bs, "width", 0) > 0 ? it(bs, "width", 0) : (land ? 240 - 6 : 135 - 2);
		aw = Math.min(aw, W - 4);
		double left = (W - aw) / 2 + fl(bs, "offsetX", 0);
		double logoBottom = logoY + logoH;
		boolean center = gate != null && gate.bool("enabled", false) && gate.str("logoAfter", "fade").equals("fade");
		double[][] out = new double[n][];
		if (layout.equals("game")) {
			double topRegion = Math.max(logoBottom - 2, H * 0.45);
			int GAP = (int) (H - topRegion - (land ? 3 : 4) * bh) / 3; GAP /= land ? 3 : 5; GAP = Math.max(GAP, 2);
			double top = fl(bs, "top", 0) > 0 ? fl(bs, "top", 0) * H : (center ? (H - (land ? 3 : 5) * (bh + GAP)) / 2 : topRegion + GAP);
			int[] perRow = land ? new int[]{2, 3, 3} : new int[]{1, 1, 2, 2, 2};
			int i = 0, row = 0; double y = top;
			while (i < n) {
				int cols = row < perRow.length ? perRow[row] : (land ? 3 : 2);
				cols = Math.min(cols, n - i);
				double cw = (aw - (cols - 1) * 2) / cols;
				for (int c = 0; c < cols; c++, i++) out[i] = new double[]{ left + c * (cw + 2), y, cw, bh };
				y += bh + GAP; row++;
			}
			return out;
		}
		boolean free = layout.equals("free");
		int cols = layout.equals("column") || free ? 1 : Math.max(1, it(bs, "columns", land ? 3 : 2));
		boolean firstWide = bs != null && bs.bool("firstWide", false) && cols > 1;
		int rows = firstWide ? 1 + (int) Math.ceil((n - 1) / (double) cols) : (int) Math.ceil(n / (double) cols);
		double blockH = rows * bh + (rows - 1) * gap;
		if ((layout.equals("column") || free) && it(bs, "width", 0) <= 0) { aw = Math.min(120, W - 4); left = (W - aw) / 2 + fl(bs, "offsetX", 0); }
		double top = fl(bs, "top", 0) > 0 ? fl(bs, "top", 0) * H : (center ? (H - blockH) / 2 : Math.max(logoBottom + gap * 2, H * 0.45));
		if (top + blockH > H - 4) top = Math.max(2, H - 4 - blockH);
		double cw = (aw - (cols - 1) * 2) / cols;
		double y = top;
		for (int i = 0; i < n; i++) {
			if (i == 0 && firstWide) { out[i] = new double[]{ left, y, aw, bh }; y += bh + gap; continue; }
			int k = i - (firstWide ? 1 : 0), c = k % cols;
			if (c == 0 && k > 0) y += bh + gap;
			out[i] = new double[]{ left + c * (cw + 2), y, cw, bh };
		}
		if (free && places != null) for (int i = 0; i < n; i++) {
			Val p = i < places.length ? places[i] : null;
			if (p == null || !p.isObject()) continue;
			double w = fl(p, "w", 0) > 0 ? fl(p, "w", 0) : out[i][2], h = fl(p, "h", 0) > 0 ? fl(p, "h", 0) : out[i][3];
			double cx = !p.has("x") || p.str("x", "x").isEmpty() ? out[i][0] + out[i][2] / 2 : fl(p, "x", 0.5) * W;
			double cy = !p.has("y") || p.str("y", "x").isEmpty() ? out[i][1] + out[i][3] / 2 : fl(p, "y", 0.5) * H;
			out[i] = new double[]{ cx - w / 2, cy - h / 2, w, h };
		}
		return out;
	}
	/** 로고 자리 [x, y, w, h] */
	public static double[] logoRect(Val lg, Val gate, double W, double H, double w, double h) {
		double topRegion = Math.max(h - 6, H * 0.45);
		double y0 = fl(lg, "y", 0);
		double cy = y0 > 0 ? y0 * H : (gate != null && gate.bool("enabled", false) ? H / 2 - 8 : 2 + topRegion / 2);
		return new double[]{ (W - w) / 2 + fl(lg, "offsetX", 0), cy - h / 2 + fl(lg, "offsetY", 0), w, h };
	}

	// ---------------- 요소 ----------------
	/** area = [x, y, w, h], (sw, sh) = 잰 크기 → [x, y, w, h, tx] */
	public static double[] elementRect(Val el, double[] area, double sw, double sh) {
		double bw = "text".equals(el.str("type", "")) && fl(el, "w", 0) > 0 ? fl(el, "w", 0) : sw, bh = sh;
		double x = area[0] + fl(el, "x", 0.5) * area[2] - fl(el, "anchorX", 0.5) * bw + fl(el, "offsetX", 0);
		double y = area[1] + fl(el, "y", 0.5) * area[3] - fl(el, "anchorY", 0.5) * bh + fl(el, "offsetY", 0);
		String al = el.str("align", "center");
		double tx = al.equals("left") ? x : al.equals("right") ? x + bw - sw : x + (bw - sw) / 2;
		return new double[]{ x, y, bw, bh, tx };
	}
	public static boolean elementShown(Val el, boolean gateShowing) {
		if (el == null || !el.bool("visible", true)) return false;
		String s = el.str("show", "always"); if (s.isEmpty()) s = "always";
		return s.equals("always") || (s.equals("gate") ? gateShowing : !gateShowing);
	}

	// ---------------- 정보 칸 ----------------
	public static final List<String> BINDS = Arrays.asList("gameName", "author", "version", "versionCode", "saveCount", "lastHero", "lastDepth", "lastLevel", "date");
	static final Pattern TOKEN = Pattern.compile("\\{(\\w+)\\}");
	/** 결과 [0] = 글, 이어서 "missing:이름" · "unknown:이름" */
	public static List<String> bindText(String text, Map<String, String> vals, String fallback) {
		List<String> missing = new ArrayList<>(), unknown = new ArrayList<>();
		Matcher m = TOKEN.matcher(text == null ? "" : text);
		StringBuffer sb = new StringBuffer();
		while (m.find()) {
			String k = m.group(1), rep;
			if (!BINDS.contains(k)) { unknown.add(k); rep = m.group(0); }
			else { String v = vals == null ? null : vals.get(k); if (v == null || v.isEmpty()) { missing.add(k); rep = ""; } else rep = v; }
			m.appendReplacement(sb, Matcher.quoteReplacement(rep));
		}
		m.appendTail(sb);
		List<String> out = new ArrayList<>();
		out.add(!missing.isEmpty() && fallback != null && !fallback.isEmpty() ? fallback : sb.toString());
		for (String k : missing) out.add("missing:" + k);
		for (String k : unknown) out.add("unknown:" + k);
		return out;
	}

	// ---------------- 창 ----------------
	public static double contentHeight(Val c, double measured) {
		switch (c.str("type", "")) {
			case "text": return measured;
			case "image": return measured;
			case "button": return it(c, "h", 18) > 0 ? it(c, "h", 18) : 18;
			case "divider": return Math.max(1, it(c, "thickness", 1));
			case "space": return Math.max(0, it(c, "h", 6));
			case "scroll": return Math.max(12, it(c, "h", 60));
			case "setting": { String k = c.str("key", ""); return k.equals("musicVol") || k.equals("sfxVol") ? 21 : 16; }
			default: return 0;
		}
	}
	public static class WinLayout {
		public double x, y, w, h; public double[] chrome, title, close; public List<double[]> items = new ArrayList<>(); public boolean overflow, tooTall;
	}
	/** safe = [x, y, w, h], margins = [왼, 위, 오른, 아래], sizes[i] = { 잰 높이, 그림 폭 } */
	public static WinLayout windowLayout(Val win, double W, double H, double[] safe, double[] margins, double[][] sizes, double titleH) {
		int w = Math.max(40, it(win, "w", 120)), pad = Math.max(0, it(win, "padding", 4));
		boolean closeBtn = win.bool("closeButton", true);
		Val content = win.get("content");
		int n = content != null && content.isArray() ? content.size() : 0;
		double y = pad;
		double[] title = titleH > 0 ? new double[]{ pad, y, w - pad * 2 - (closeBtn ? 12 : 0), titleH } : null;
		if (title != null) y += titleH + 2;
		else if (closeBtn) y = Math.max(y, 12);
		List<double[]> items = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			Val c = content.at(i);
			double[] s = sizes != null && i < sizes.length && sizes[i] != null ? sizes[i] : new double[]{ 0, 0 };
			if (i > 0 || title != null || closeBtn) y += Math.max(0, it(c, "gap", 2));
			double h = contentHeight(c, s[0]);
			double cw = w - pad * 2, iw = cw;
			String type = c.str("type", "");
			if (type.equals("image")) iw = Math.min(cw, s[1]);
			if (type.equals("button") && it(c, "w", 0) > 0) iw = Math.min(cw, it(c, "w", 0));
			String a = c.str("align", "center");
			double al = a.equals("left") ? 0 : a.equals("right") ? 1 : 0.5;
			items.add(new double[]{ pad + (cw - iw) * al, y, iw, h });
			y += h;
		}
		double auto = Math.ceil(y + pad - 1e-6);
		int want = it(win, "h", 0);
		double h = want > 0 ? Math.max(want, auto) : auto;
		double cwid = w + margins[0] + margins[2], chei = h + margins[1] + margins[3];
		int offX = it(win, "offsetX", 0), offY = it(win, "offsetY", 0);
		double cx = safe[0] + (safe[2] - cwid) / 2 + offX, cy = safe[1] + (safe[3] - chei) / 2 + offY;
		if (offX != 0) { if (cx < 2) cx = 2; else if (cx + cwid > W - 2) cx = W - 2 - cwid; }
		if (offY != 0) { if (cy < 2) cy = 2; else if (cy + chei > H - 2) cy = H - 2 - chei; }
		double ox = cx + margins[0], oy = cy + margins[1];
		WinLayout L = new WinLayout();
		L.x = ox; L.y = oy; L.w = w; L.h = h; L.chrome = new double[]{ cx, cy, cwid, chei };
		for (double[] r : items) L.items.add(new double[]{ ox + r[0], oy + r[1], r[2], r[3] });
		L.title = title == null ? null : new double[]{ ox + title[0], oy + title[1], title[2], title[3] };
		L.close = closeBtn ? new double[]{ ox + w - 11, oy, 11, 11 } : null;
		L.overflow = want > 0 && auto > want; L.tooTall = chei > H - 4;
		return L;
	}
}
