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
		try { return Class.forName(cls).getConstructor(int.class).newInstance(arg); } catch (Throwable e) { return null; }
	}
	/** 목록이면 맨 앞에, 순서 없는 모음(예전 판의 HashSet)이면 그냥 넣음 */
	@SuppressWarnings({"unchecked", "rawtypes"})
	public static void addFirst(Collection c, Object o) {
		if (c instanceof List) ((List) c).add(0, o); else c.add(o);
	}
}
