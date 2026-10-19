// 타이틀 공통 규칙 검사 (7차) — 런타임 MakerTitleModel 을 실제로 실행해 편집기 PDM.titleModel 과 같은 입력의 결과를 냄
//   tools/tests/run.js 가 컴파일 · 실행: 표준 입력 = [{ fn, ...입력 }] JSON, 표준 출력 = 결과 JSON 배열
//   게임 라이브러리 없이 돎 (자체 JSON 읽기 · 쓰기)
import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitleModel;
import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitleModel.Val;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class TitleModelCheck {
	// ---------------- 작은 JSON ----------------
	static final class J implements Val, com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAIModel.KeyList {
		final Object v; J(Object v) { this.v = v; }
		public List<String> keys() { return m() == null ? new ArrayList<>() : new ArrayList<>(m().keySet()); }
		@SuppressWarnings("unchecked") Map<String, Object> m() { return v instanceof Map ? (Map<String, Object>) v : null; }
		@SuppressWarnings("unchecked") List<Object> l() { return v instanceof List ? (List<Object>) v : null; }
		public boolean has(String k) { return m() != null && m().containsKey(k) && m().get(k) != null; }
		public Val get(String k) { return has(k) ? new J(m().get(k)) : null; }
		public String str(String k, String d) { if (!has(k)) return d; Object o = m().get(k); if (o instanceof Map || o instanceof List) return d; return o instanceof Double ? fmt((Double) o) : String.valueOf(o); }
		public double num(String k, double d) { if (!has(k)) return d; Object o = m().get(k); if (o instanceof Double) return (Double) o; if (o instanceof String) { try { String s = ((String) o).trim(); return s.isEmpty() ? d : Double.parseDouble(s); } catch (Exception e) { return d; } } return d; }
		public boolean bool(String k, boolean d) { if (!has(k)) return d; Object o = m().get(k); return o instanceof Boolean ? (Boolean) o : d; }
		public int size() { return l() != null ? l().size() : m() != null ? m().size() : 0; }
		public Val at(int i) { Object o = l().get(i); return o == null ? null : new J(o); }
		public boolean isObject() { return m() != null; }
		public boolean isArray() { return l() != null; }
		public boolean isString() { return v instanceof String; }
		public String asString() { return String.valueOf(v); }
	}
	static String fmt(double d) { return d == Math.rint(d) && Math.abs(d) < 1e15 ? String.valueOf((long) d) : String.valueOf(d); }
	static int p; static String s;
	static Object parse(String src) { s = src; p = 0; return val(); }
	static void ws() { while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++; }
	static Object val() {
		ws(); char c = s.charAt(p);
		if (c == '{') { p++; Map<String, Object> m = new LinkedHashMap<>(); ws(); if (s.charAt(p) == '}') { p++; return m; } while (true) { ws(); String k = (String) val(); ws(); p++; m.put(k, val()); ws(); if (s.charAt(p++) == '}') return m; } }
		if (c == '[') { p++; List<Object> l = new ArrayList<>(); ws(); if (s.charAt(p) == ']') { p++; return l; } while (true) { l.add(val()); ws(); if (s.charAt(p++) == ']') return l; } }
		if (c == '"') { p++; StringBuilder b = new StringBuilder(); while (s.charAt(p) != '"') { char ch = s.charAt(p++); if (ch == '\\') { char e = s.charAt(p++); switch (e) { case 'n': b.append('\n'); break; case 't': b.append('\t'); break; case 'u': b.append((char) Integer.parseInt(s.substring(p, p + 4), 16)); p += 4; break; default: b.append(e); } } else b.append(ch); } p++; return b.toString(); }
		if (s.startsWith("true", p)) { p += 4; return true; }
		if (s.startsWith("false", p)) { p += 5; return false; }
		if (s.startsWith("null", p)) { p += 4; return null; }
		int st = p; while (p < s.length() && "+-0123456789.eE".indexOf(s.charAt(p)) >= 0) p++;
		return Double.parseDouble(s.substring(st, p));
	}
	static void out(StringBuilder b, Object o) {
		if (o == null) b.append("null");
		else if (o instanceof String) { b.append('"'); for (char c : ((String) o).toCharArray()) { if (c == '"' || c == '\\') b.append('\\').append(c); else if (c == '\n') b.append("\\n"); else if (c < 32) b.append(String.format("\\u%04x", (int) c)); else b.append(c); } b.append('"'); }
		else if (o instanceof Double || o instanceof Float) { double d = ((Number) o).doubleValue(); b.append(Double.isFinite(d) ? fmt(d) : "null"); }
		else if (o instanceof Number || o instanceof Boolean) b.append(o);
		else if (o instanceof double[]) { b.append('['); double[] a = (double[]) o; for (int i = 0; i < a.length; i++) { if (i > 0) b.append(','); out(b, a[i]); } b.append(']'); }
		else if (o instanceof Map) { b.append('{'); boolean f = true; for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) { if (!f) b.append(','); f = false; out(b, String.valueOf(e.getKey())); b.append(':'); out(b, e.getValue()); } b.append('}'); }
		else if (o instanceof Collection) { b.append('['); boolean f = true; for (Object x : (Collection<?>) o) { if (!f) b.append(','); f = false; out(b, x); } b.append(']'); }
		else out(b, String.valueOf(o));
	}
	static double[] arr(Val v) { double[] a = new double[v.size()]; for (int i = 0; i < a.length; i++) a[i] = ((Double) ((J) v.at(i)).v); return a; }

	public static void main(String[] args) throws Exception {
		InputStream in = System.in; ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int r; while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
		@SuppressWarnings("unchecked") List<Object> cases = (List<Object>) parse(bo.toString(StandardCharsets.UTF_8.name()));
		List<Object> res = new ArrayList<>();
		Set<String> chrome = new HashSet<>(Arrays.asList("WINDOW", "WINDOW_SILVER", "TOAST", "TOAST_TR", "GREY_BUTTON_TR", "TOAST_TR_HEAVY", "TOAST_WHITE", "RED_BUTTON", "GREY_BUTTON", "TAG", "GEM", "SCROLL", "TAB_SET", "TAB_SELECTED", "TAB_UNSELECTED"));
		for (Object co : cases) {
			J c = new J(co); String fn = c.str("fn", "");
			switch (fn) {
				case "style": {
					Val f = c.get("flags"); boolean[] fl = new boolean[4]; String[] ks = { "hover", "focus", "pressed", "disabled" };
					for (int i = 0; i < 4; i++) fl[i] = f != null && f.bool(ks[i], false);
					MakerTitleModel.Style st = MakerTitleModel.resolveStyle(c.get("bs"), c.get("item"), fl, c.str("accent", null), chrome);
					Map<String, Object> m = new LinkedHashMap<>(); m.put("skin", st.skin); m.put("image", st.image); m.put("slice", st.slice); m.put("textColor", st.textColor); m.put("textAlpha", st.textAlpha); m.put("alpha", st.alpha); m.put("scale", st.scale); m.put("bright", st.bright); m.put("dy", st.dy);
					res.add(m); break;
				}
				case "fx": res.add(MakerTitleModel.fxValue(MakerTitleModel.fxNorm(c.get("fx")), c.num("tau", 0))); break;
				case "held": res.add(MakerTitleModel.heldStep(c.num("tau", 0), c.bool("active", false), c.num("dt", 0), MakerTitleModel.fxNorm(c.get("fx")))); break;
				case "list": {
					List<Object> l = new ArrayList<>();
					for (MakerTitleModel.Entry e : MakerTitleModel.buttonList(c.get("bs"), c.bool("hasSaves", false), c.bool("canQuit", true))) { Map<String, Object> m = new LinkedHashMap<>(); m.put("id", e.id); m.put("gameIndex", e.gameIndex); m.put("disabled", e.disabled); m.put("action", e.action); l.add(m); }
					res.add(l); break;
				}
				case "rects": {
					Val pl = c.get("places"); Val[] places = null;
					if (pl != null) { places = new Val[pl.size()]; for (int i = 0; i < places.length; i++) places[i] = pl.at(i); }
					Val lg = c.get("logo");
					res.add(Arrays.asList(MakerTitleModel.buttonRects(c.get("bs"), (int) c.num("n", 0), c.num("W", 0), c.num("H", 0), c.bool("land", true), lg.num("y", 0), lg.num("h", 0), c.get("gate"), places)));
					break;
				}
				case "logo": { Val sz = c.get("size"); res.add(MakerTitleModel.logoRect(c.get("lg"), c.get("gate"), c.num("W", 0), c.num("H", 0), sz.num("w", 0), sz.num("h", 0))); break; }
				case "el": { Val sz = c.get("size"); res.add(MakerTitleModel.elementRect(c.get("el"), arr(c.get("area")), sz.num("w", 0), sz.num("h", 0))); break; }
				case "shown": res.add(MakerTitleModel.elementShown(c.get("el"), c.bool("gate", false))); break;
				case "bind": {
					Map<String, String> vals = new HashMap<>(); Val v = c.get("vals");
					if (v != null) for (String k : ((J) v).m().keySet()) { String x = v.str(k, null); if (x != null) vals.put(k, x); }
					res.add(MakerTitleModel.bindText(c.str("text", ""), vals, c.str("fallback", ""))); break;
				}
				case "win": {
					Val sz = c.get("sizes"); double[][] sizes = new double[sz.size()][];
					for (int i = 0; i < sizes.length; i++) sizes[i] = arr(sz.at(i));
					MakerTitleModel.WinLayout L = MakerTitleModel.windowLayout(c.get("win"), c.num("W", 0), c.num("H", 0), arr(c.get("safe")), arr(c.get("margins")), sizes, c.num("titleH", 0));
					Map<String, Object> m = new LinkedHashMap<>(); m.put("x", L.x); m.put("y", L.y); m.put("w", L.w); m.put("h", L.h); m.put("chrome", L.chrome); m.put("items", L.items); m.put("title", L.title); m.put("close", L.close); m.put("overflow", L.overflow); m.put("tooTall", L.tooTall);
					res.add(m); break;
				}
				default: res.add("unknown fn " + fn);
			}
		}
		StringBuilder b = new StringBuilder(); out(b, res); new java.io.PrintStream(System.out, true, "UTF-8").println(b);
	}
}
