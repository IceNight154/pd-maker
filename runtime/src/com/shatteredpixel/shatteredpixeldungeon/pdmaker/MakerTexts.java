/*
 * 게임 글자 바꾸기 (편집기 "게임 텍스트" — texts.json)
 *   { texts: { "<언어 코드>": { "<키>": "<글자>" }, "*": { … 모든 언어 … } } }
 *   언어 코드는 게임 설정의 언어와 같음 (en · ko · ja · zh · zh-hant · ru · …). 키는 messages/*.properties 의 키 (소문자).
 *   Messages.getFromBundle 맨 앞 연결 줄에서 부름 — 바꾼 글자가 있으면 게임 원래 글자 대신 그것 (%s · %d 같은 서식은 그대로 채워짐)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;

import java.util.HashMap;
import java.util.Map;

public class MakerTexts {

	private static volatile Map<String, Map<String, String>> byLang;   // 언어 코드 → 키 → 글자

	/** MakerRuntime 이 프로젝트를 읽은 뒤 */
	public static void load(JsonValue d) {
		Map<String, Map<String, String>> m = new HashMap<>();
		JsonValue t = d == null ? null : d.get("texts");
		if (t != null) for (JsonValue lang : t) {
			Map<String, String> one = new HashMap<>();
			for (JsonValue v : lang) if (v.isString()) one.put(v.name.toLowerCase(java.util.Locale.ENGLISH), v.asString().replace("\\n", "\n"));
			if (!one.isEmpty()) m.put(lang.name, one);
		}
		byLang = m.isEmpty() ? null : m;
	}

	private static String sub(String sec, String k) {
		JsonValue st = MakerRuntime.story, in = st == null ? null : st.get(sec);
		String v = in == null ? "" : in.getString(k, "");
		return v.isEmpty() ? null : v;
	}
	private static String intro(String k) {
		JsonValue st = MakerRuntime.story, in = st == null ? null : st.get("intro");
		String v = in == null ? "" : in.getString(k, "");
		return v.isEmpty() ? null : v;
	}

	/** 바꾼 글자 (없으면 null) */
	public static String get(String key, Object lang) {
		// 입장 문구 (스토리의 "입장 문구"): 층에 들어올 때 기록에 나오는 글
		if ("scenes.gamescene.descend".equals(key) || "scenes.gamescene.return".equals(key)) {
			try { String t = MakerRuntime.enterText("scenes.gamescene.descend".equals(key)); if (t != null) return t; } catch (Throwable ignored) { }
		}
		// 소개 화면 (스토리의 intro): 처음 켰을 때 글 · 버튼, 구역에 처음 들어갈 때 로딩 화면의 이야기 글
		if (key != null && key.startsWith("journal.document.intros.") && key.endsWith(".body")) {
			try {
				if (key.equals("journal.document.intros.dungeon.body")) { String w = intro("welcome"); if (w != null) return w; }
				else { String p = MakerRuntime.pendingStory; if (p != null) return p; }
			} catch (Throwable ignored) { }
		}
		if (key != null && key.startsWith("scenes.amuletscene.")) { try { String w = sub("ending", key.substring(19)); if (w != null) return w; } catch (Throwable ignored) { } }   // 원래 엔딩(아뮬렛 화면)의 글 · 버튼
		if ("scenes.surfacescene.exit".equals(key)) { try { String w = sub("ending", "surfaceExit"); if (w != null) return w; } catch (Throwable ignored) { } }
		if ("scenes.titlescene.enter".equals(key)) { try { String w = intro("welcomeButton"); if (w != null) return w; } catch (Throwable ignored) { } }
		Map<String, Map<String, String>> m = byLang;
		if (m == null || key == null) return null;
		try {
			String code = lang instanceof com.shatteredpixel.shatteredpixeldungeon.messages.Languages ? ((com.shatteredpixel.shatteredpixeldungeon.messages.Languages) lang).code() : "en";
			Map<String, String> one = m.get(code);
			String v = one == null ? null : one.get(key);
			if (v == null && (one = m.get("*")) != null) v = one.get(key);
			return v;
		} catch (Throwable t) { return null; }
	}
}
