/*
 * PDMaker — 게임 판(버전) 차이 메우기: SPD 2.5 ~ 4.0 처럼 저장소마다 조금씩 다른 것을 반사로 다룸
 *   (새 판에만 있는 클래스 · 필드 · 열거값 — 없으면 대신할 것을 쓰거나 건너뜀). 컴파일은 어느 판에서도 되게.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import java.util.Collection;
import java.util.List;

public class MakerCompat {

	/** 필드 값 넣기 (상속한 필드까지 찾음) — 없으면 false */
	public static boolean setField(Object o, String name, Object v) {
		for (Class<?> c = o.getClass(); c != null; c = c.getSuperclass()) {
			try { java.lang.reflect.Field f = c.getDeclaredField(name); f.setAccessible(true); f.set(o, v); return true; }
			catch (NoSuchFieldException e) { /* 위로 */ }
			catch (Throwable e) { return false; }
		}
		return false;
	}
	/** 필드 값 읽기 (상속한 필드까지) — 없으면 null */
	public static Object getField(Object o, String name) {
		for (Class<?> c = o.getClass(); c != null; c = c.getSuperclass()) {
			try { java.lang.reflect.Field f = c.getDeclaredField(name); f.setAccessible(true); return f.get(o); }
			catch (NoSuchFieldException e) { /* 위로 */ }
			catch (Throwable e) { return null; }
		}
		return null;
	}
	/** boolean 필드 (없으면 false) */
	public static boolean flag(Object o, String name) { return Boolean.TRUE.equals(getField(o, name)); }
	/** 정적 int 상수 (없으면 def) */
	public static int staticInt(Class<?> c, String name, int def) {
		try { java.lang.reflect.Field f = c.getField(name); return f.getInt(null); } catch (Throwable e) { return def; }
	}
	/** 인자 없는 함수 부르기 (protected 여도) — 없으면 false */
	public static boolean call(Object o, String name) {
		for (Class<?> c = o.getClass(); c != null; c = c.getSuperclass()) {
			try { java.lang.reflect.Method m = c.getDeclaredMethod(name); m.setAccessible(true); m.invoke(o); return true; }
			catch (NoSuchMethodException e) { /* 위로 */ }
			catch (Throwable e) { MakerRuntime.log("함수 부르기 실패 " + name + ": " + e); return false; }
		}
		return false;
	}
	/** 위치 정하기: setPos(x, y) 가 있으면 그것(Component), 없으면 x · y 필드(Visual) */
	public static void place(Object o, float x, float y) {
		try { o.getClass().getMethod("setPos", float.class, float.class).invoke(o, x, y); return; } catch (Throwable ignored) { }
		setField(o, "x", x); setField(o, "y", y);
	}
	/** 열거값을 이름으로 — 없으면 대신할 이름들 차례로 (모두 없으면 첫 값) */
	public static <E extends Enum<E>> E enumOf(Class<E> type, String... names) {
		for (String n : names) for (E e : type.getEnumConstants()) if (e.name().equals(n)) return e;
		return type.getEnumConstants()[0];
	}
	/** 클래스 이름으로 만들기 (생성자 인자 int 하나) — 없으면 null */
	public static Object make(String cls, int arg) {
		try { java.lang.reflect.Constructor<?> k = Class.forName(cls).getDeclaredConstructor(int.class); k.setAccessible(true); return k.newInstance(arg); } catch (Throwable e) { return null; }
	}
	/** 목록이면 맨 앞에, 순서 없는 모음(예전 판의 HashSet)이면 그냥 넣음 */
	@SuppressWarnings({"unchecked", "rawtypes"})
	public static void addFirst(Collection c, Object o) {
		if (c instanceof List) ((List) c).add(0, o); else c.add(o);
	}

	/** invoke 가 함수를 못 찾았을 때 돌려주는 값 */
	public static final Object NONE = new Object();
	/** 이름 · 인자로 함수 찾아 부르기 (protected · private 도, 상속한 것까지 — 판마다 공개 범위가 다른 함수용).
	 *  target 이 Class 면 정적 함수. 못 찾으면 NONE (함수 안의 예외는 그대로 던짐) */
	public static Object invoke(Object target, String name, Object... args) {
		Class<?> start = target instanceof Class ? (Class<?>) target : target.getClass();
		Object self = target instanceof Class ? null : target;
		for (Class<?> c = start; c != null; c = c.getSuperclass()) {
			for (java.lang.reflect.Method m : c.getDeclaredMethods()) {
				if (!m.getName().equals(name) || m.getParameterCount() != args.length) continue;
				Class<?>[] pt = m.getParameterTypes(); boolean ok = true;
				for (int i = 0; i < pt.length && ok; i++) ok = args[i] == null ? !pt[i].isPrimitive() : box(pt[i]).isInstance(args[i]);
				if (!ok) continue;
				try { m.setAccessible(true); return m.invoke(self, args); }
				catch (java.lang.reflect.InvocationTargetException e) { Throwable t = e.getCause(); if (t instanceof RuntimeException) throw (RuntimeException) t; if (t instanceof Error) throw (Error) t; throw new RuntimeException(t); }
				catch (IllegalAccessException e) { return NONE; }
			}
		}
		return NONE;
	}
	static Class<?> box(Class<?> c) {
		if (!c.isPrimitive()) return c;
		if (c == int.class) return Integer.class; if (c == float.class) return Float.class; if (c == boolean.class) return Boolean.class;
		if (c == long.class) return Long.class; if (c == double.class) return Double.class; if (c == char.class) return Character.class;
		if (c == byte.class) return Byte.class; if (c == short.class) return Short.class; return Void.class;
	}
	/** 정적 필드 값 (private 여도) — 없으면 def */
	public static Object staticValue(Class<?> c, String name, Object def) {
		try { java.lang.reflect.Field f = c.getDeclaredField(name); f.setAccessible(true); return f.get(null); } catch (Throwable e) { return def; }
	}
	/** 정적 String 상수 (없으면 def) — 예: Assets.Interfaces.HERO_ICONS 가 없는 예전 판 */
	public static String staticStr(Class<?> c, String name, String def) { Object v = staticValue(c, name, null); return v instanceof String ? (String) v : def; }

	// ---------------------------------------------------------------- 11차: 예전 판 · 파생작 (SPD 1.x 기반 등) 과의 차이

	/** 지형 상수 — 판마다 없는 것이 있음 (CUSTOM_DECO · ENTRANCE_SP · CRYSTAL_DOOR …) */
	static int terrain(String name, int def) { return staticInt(com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.class, name, def); }
	/** 막힌 장식 칸 (SPD 의 CUSTOM_DECO — 없는 판은 STATUE: 지나갈 수 없고 시야는 막지 않음) */
	public static final int T_CUSTOM_DECO = terrain("CUSTOM_DECO", com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.STATUE);
	/** 특별 입구 (없는 판은 -1 = 어떤 칸과도 같지 않음) */
	public static final int T_ENTRANCE_SP = terrain("ENTRANCE_SP", -1);
	public static final int T_CRYSTAL_DOOR = terrain("CRYSTAL_DOOR", -1);

	/** 커스텀 타일맵 자리: pos(칸, 층) — 예전 판은 pos(칸) (지금 층 너비 기준) */
	public static void tilePos(Object tm, int cell, com.shatteredpixel.shatteredpixeldungeon.levels.Level l) {
		if (invoke(tm, "pos", cell, l) == NONE) invoke(tm, "pos", cell);
	}
	/** 머리 위 글자 + 아이콘 (예전 판은 아이콘 없이 글자만) — icon = FloatingText 의 상수 이름 (HEALING …) */
	public static void status(com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite s, int color, String text, String icon) {
		Class<?> ft = com.watabou.utils.Reflection.forName("com.shatteredpixel.shatteredpixeldungeon.effects.FloatingText");
		Object ic = ft == null ? null : staticValue(ft, icon, null);
		if (ic != null && invoke(s, "showStatusWithIcon", color, text, ic) != NONE) return;
		s.showStatus(color, text);
	}
	/** 배경음 멈춤 (end · 예전 판 stop) */
	public static void musicStop() {
		if (invoke(com.watabou.noosa.audio.Music.INSTANCE, "end") == NONE) invoke(com.watabou.noosa.audio.Music.INSTANCE, "stop");
	}
	/** 여러 곡 재생 (playTracks — 예전 판은 첫 곡을 반복) */
	public static void musicTracks(String[] files, float[] chances, boolean shuffle) {
		if (files == null || files.length == 0) return;
		if (invoke(com.watabou.noosa.audio.Music.INSTANCE, "playTracks", files, chances, shuffle) == NONE) com.watabou.noosa.audio.Music.INSTANCE.play(files[0], true);
	}
	/** 게임의 기본 타이틀 곡 (mod-2 TITLE · SPD 2.x+ THEME_1 · 2 · 예전 판 THEME) */
	public static String[] titleTracks() {
		Class<?> m = com.shatteredpixel.shatteredpixeldungeon.Assets.Music.class;
		String t = staticStr(m, "TITLE", null); if (t != null) return new String[]{ t };
		String a = staticStr(m, "THEME_1", null), b = staticStr(m, "THEME_2", null);
		if (a != null) return b != null ? new String[]{ a, b } : new String[]{ a };
		t = staticStr(m, "THEME", null); return t != null ? new String[]{ t } : new String[0];
	}
	/** 이 플랫폼에서 게임을 끌 수 있는가 — PC · Android (DeviceCompat.isAndroid 가 없는 판은 PC 만) */
	public static boolean isAndroid() { Object v = invoke(com.watabou.utils.DeviceCompat.class, "isAndroid"); return Boolean.TRUE.equals(v); }
	/** 통로로 넘어가기: Level.activateTransition(영웅, 통로) — 그 함수가 없는 판(영웅이 계단을 직접 처리)은 영웅과 같게
	 *  (잠긴 맵 확인 → 다음 · 이전 층 화면). 넘어가면 true */
	public static boolean takeTransition(com.shatteredpixel.shatteredpixeldungeon.levels.Level l, com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h,
	                                     com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition t) {
		Object r = invoke(l, "activateTransition", h, t);
		if (r != NONE) return Boolean.TRUE.equals(r);
		if (t == null || LevelHooks.lockedNode(t)) return false;
		com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type ty = t.type;
		boolean down = ty == com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type.REGULAR_EXIT || ty == com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type.BRANCH_EXIT;
		com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.curTransition = t;
		com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.mode = down ? com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode.DESCEND : com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode.ASCEND;
		com.watabou.noosa.Game.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.class);
		return true;
	}
	/** 정적 필드에 값 넣기 (없으면 false) */
	public static boolean setStatic(Class<?> c, String name, Object v) {
		try { java.lang.reflect.Field f = c.getDeclaredField(name); f.setAccessible(true); f.set(null, v); return true; } catch (Throwable e) { return false; }
	}
	/** 클래스 이름 (게임 패키지 기준 상대 이름) 으로 새 인스턴스 — 차례로 시도, 모두 없으면 null */
	public static Object newGame(String... rel) {
		for (String n : rel) { Class<?> c = com.watabou.utils.Reflection.forName("com.shatteredpixel.shatteredpixeldungeon." + n); if (c != null) { Object o = com.watabou.utils.Reflection.newInstance(c); if (o != null) return o; } }
		return null;
	}
}
