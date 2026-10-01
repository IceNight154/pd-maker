/*
 * 게임 쪽 플러그인 — 프로젝트 plugins/<id>/plugin.json 의 "runtime": { "jar", "entry" }
 *   entry 클래스는 MakerPlugin 을 구현하고, onLoad 에서 이벤트 명령을 등록합니다.
 *     public class EffectPlugin implements PluginHost.MakerPlugin {
 *       public void onLoad() { PluginHost.register("fx.weather", (cmd, it) -> { ...; return true; }); }
 *     }
 *   jar 는 데스크톱에서만 불러옵니다 (안드로이드는 게임에 직접 넣어 빌드).
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;

import java.net.URL;
import java.net.URLClassLoader;
import java.util.HashMap;
import java.util.Map;

public class PluginHost {

	public interface MakerPlugin { void onLoad(); }

	/** 명령 처리기. true = 바로 다음 명령으로, false = 멈춤 (처리가 끝나면 it.resume() 호출) */
	public interface CommandHandler { boolean run(JsonValue cmd, EventInterpreter it); }

	private static final Map<String, CommandHandler> handlers = new HashMap<>();

	public static void register(String commandId, CommandHandler h) { handlers.put(commandId, h); }
	public static boolean has(String commandId) { return handlers.containsKey(commandId); }

	static boolean execute(String commandId, JsonValue cmd, EventInterpreter it) {
		CommandHandler h = handlers.get(commandId);
		if (h == null) { MakerRuntime.log("플러그인 명령 처리기가 없음: " + commandId + " (플러그인 runtime jar 확인)"); return true; }
		try { return h.run(cmd, it); }
		catch (Exception e) { MakerRuntime.log("플러그인 명령 오류 " + commandId + ": " + e); return true; }
	}

	static void loadAll(FileHandle root) {
		// 내장 예제: screen-fx 의 날씨 명령 (게임 쪽 효과는 아직 없음 → 알림만)
		register("fx.weather", (cmd, it) -> { GLog.i("(날씨: " + cmd.getString("kind", "none") + ")"); return true; });

		JsonValue list = MakerRuntime.project.get("plugins");
		if (list == null) return;
		for (JsonValue idv : list) {
			String id = idv.asString();
			FileHandle dir = root.child("plugins").child(id);
			if (!dir.child("plugin.json").exists()) continue;
			try {
				JsonValue m = new JsonReader().parse(dir.child("plugin.json"));
				JsonValue rt = m.get("runtime");
				if (rt == null) continue;
				FileHandle jar = dir.child(rt.getString("jar", ""));
				if (!jar.exists()) { MakerRuntime.log("플러그인 " + id + ": jar 없음 (" + jar.path() + ")"); continue; }
				URLClassLoader cl = new URLClassLoader(new URL[]{ jar.file().toURI().toURL() }, PluginHost.class.getClassLoader());
				Object p = cl.loadClass(rt.getString("entry")).getDeclaredConstructor().newInstance();
				if (p instanceof MakerPlugin) { ((MakerPlugin) p).onLoad(); MakerRuntime.log("플러그인 불러옴: " + id); }
			} catch (Throwable e) {
				MakerRuntime.log("플러그인 " + id + " 불러오기 실패: " + e);
			}
		}
	}
}
