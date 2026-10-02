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

	/** 바꾼 글자 (없으면 null) */
	public static String get(String key, Object lang) {
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
