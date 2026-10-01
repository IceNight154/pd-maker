/*
 * 조건식 — 에디터의 cond.js 와 같은 문법.
 *   favor>=600 && temper>0
 *   switch.bridge_fixed && !(var.gold < 100)
 * 이름이 없으면 0. 빈 식은 true. 해석 오류는 false.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Cond {

	/** 이름 → 값 (Integer, Boolean, String, 또는 null) */
	public interface Resolver { Object get(String name); }

	private static final Map<String, Node> cache = new HashMap<>();

	public static boolean eval(String src, Resolver r) {
		if (src == null || src.trim().isEmpty()) return true;
		try {
			Node n = cache.get(src);
			if (n == null) { n = new Parser(tokenize(src)).parse(); cache.put(src, n); }
			return truthy(n.eval(r));
		} catch (Exception e) {
			MakerRuntime.log("조건식 오류 \"" + src + "\": " + e.getMessage());
			return false;
		}
	}

	/** 조건에 쓴 이름 개수 (대사 고르기에서 '구체적인 정도') */
	public static int specificity(String src) {
		if (src == null || src.trim().isEmpty()) return 0;
		try {
			int n = 0;
			for (Tok t : tokenize(src)) if (t.type == 'n') n++;
			return n;
		} catch (Exception e) { return 0; }
	}

	static boolean truthy(Object v) {
		if (v == null) return false;
		if (v instanceof Boolean) return (Boolean) v;
		if (v instanceof Number) return ((Number) v).doubleValue() != 0;
		return !v.toString().isEmpty();
	}
	static double num(Object v) {
		if (v == null) return 0;
		if (v instanceof Boolean) return ((Boolean) v) ? 1 : 0;
		if (v instanceof Number) return ((Number) v).doubleValue();
		try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 0; }
	}
	static String str(Object v) {
		if (v == null) return "0";
		if (v instanceof Boolean) return ((Boolean) v) ? "1" : "0";
		if (v instanceof Double || v instanceof Float) {
			double d = ((Number) v).doubleValue();
			return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
		}
		return v.toString();
	}

	// ------------------------------------------------------------ 토큰

	static class Tok { char type; String s; double d; Tok(char t, String s) { type = t; this.s = s; } }
	// type: o=연산자, n=이름, s=문자열, d=숫자, b=불리언

	static List<Tok> tokenize(String src) {
		List<Tok> out = new ArrayList<>();
		int i = 0;
		while (i < src.length()) {
			char c = src.charAt(i);
			if (Character.isWhitespace(c)) { i++; continue; }
			String two = i + 1 < src.length() ? src.substring(i, i + 2) : "";
			if (two.equals("&&") || two.equals("||") || two.equals("==") || two.equals("!=") || two.equals(">=") || two.equals("<=")) {
				out.add(new Tok('o', two)); i += 2; continue;
			}
			if ("!()<>".indexOf(c) >= 0) { out.add(new Tok('o', String.valueOf(c))); i++; continue; }
			if (c == '=') { out.add(new Tok('o', "==")); i++; continue; }
			if (c == '\'' || c == '"') {
				int j = src.indexOf(c, i + 1);
				if (j < 0) throw new RuntimeException("따옴표가 닫히지 않았습니다");
				out.add(new Tok('s', src.substring(i + 1, j))); i = j + 1; continue;
			}
			if (Character.isDigit(c) || (c == '-' && i + 1 < src.length() && Character.isDigit(src.charAt(i + 1)))) {
				int j = i + 1; while (j < src.length() && (Character.isDigit(src.charAt(j)) || src.charAt(j) == '.')) j++;
				Tok t = new Tok('d', src.substring(i, j)); t.d = Double.parseDouble(t.s); out.add(t); i = j; continue;
			}
			if (Character.isLetter(c) || c == '_') {
				int j = i + 1;
				while (j < src.length()) { char k = src.charAt(j); if (Character.isLetterOrDigit(k) || k == '_' || k == '.' || k == '%' || k == ':') j++; else break; }
				String w = src.substring(i, j);
				if (w.equals("true") || w.equals("false")) out.add(new Tok('b', w));
				else if (w.equals("and")) out.add(new Tok('o', "&&"));
				else if (w.equals("or")) out.add(new Tok('o', "||"));
				else if (w.equals("not")) out.add(new Tok('o', "!"));
				else out.add(new Tok('n', w));
				i = j; continue;
			}
			throw new RuntimeException("알 수 없는 글자 '" + c + "'");
		}
		return out;
	}

	// ------------------------------------------------------------ 구문 트리

	interface Node { Object eval(Resolver r); }

	static class Parser {
		final List<Tok> tk; int p = 0;
		Parser(List<Tok> tk) { this.tk = tk; }
		boolean isOp(String v) { return p < tk.size() && tk.get(p).type == 'o' && tk.get(p).s.equals(v); }
		Node parse() { Node n = or(); if (p < tk.size()) throw new RuntimeException("'" + tk.get(p).s + "' 뒤를 해석할 수 없습니다"); return n; }
		Node or() {
			Node l = and();
			while (isOp("||")) { p++; final Node a = l, b = and(); l = r -> truthy(a.eval(r)) || truthy(b.eval(r)); }
			return l;
		}
		Node and() {
			Node l = not();
			while (isOp("&&")) { p++; final Node a = l, b = not(); l = r -> truthy(a.eval(r)) && truthy(b.eval(r)); }
			return l;
		}
		Node not() {
			if (isOp("!")) { p++; final Node e = not(); return r -> !truthy(e.eval(r)); }
			return cmp();
		}
		Node cmp() {
			final Node l = prim();
			if (p < tk.size() && tk.get(p).type == 'o') {
				final String op = tk.get(p).s;
				if (op.equals("==") || op.equals("!=") || op.equals(">=") || op.equals("<=") || op.equals(">") || op.equals("<")) {
					p++;
					final Node rr = prim();
					return r -> {
						Object a = l.eval(r), b = rr.eval(r);
						switch (op) {
							case "==": return str(a).equals(str(b));
							case "!=": return !str(a).equals(str(b));
							case ">=": return num(a) >= num(b);
							case "<=": return num(a) <= num(b);
							case ">":  return num(a) > num(b);
							default:   return num(a) < num(b);
						}
					};
				}
			}
			return l;
		}
		Node prim() {
			if (p >= tk.size()) throw new RuntimeException("식이 중간에 끝났습니다");
			final Tok t = tk.get(p++);
			switch (t.type) {
				case 'o':
					if (t.s.equals("(")) { Node e = or(); if (!isOp(")")) throw new RuntimeException("')' 가 없습니다"); p++; return e; }
					throw new RuntimeException("여기에 '" + t.s + "' 는 올 수 없습니다");
				case 'd': { final double d = t.d; return r -> d; }
				case 's': { final String s = t.s; return r -> s; }
				case 'b': { final boolean b = t.s.equals("true"); return r -> b; }
				default: { final String name = t.s; return r -> { Object v = r == null ? null : r.get(name); return v == null ? 0 : v; }; }
			}
		}
	}
}
