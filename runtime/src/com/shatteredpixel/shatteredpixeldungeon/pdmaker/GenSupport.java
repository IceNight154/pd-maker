/*
 * 생성된 코드(gen/*.java)가 쓰는 도우미 — 이름·설명·그림·가격을 프로젝트 데이터에서 읽고, 코드 오류를 알림.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.watabou.utils.Reflection;

import java.util.HashSet;
import java.util.Set;

public class GenSupport {

	/** 생성된 아이템 클래스가 구현 — 프로젝트 아이템 id */
	public interface Coded { String makerId(); }

	public static final String GEN = "com.shatteredpixel.shatteredpixeldungeon.pdmaker.gen.";

	static JsonValue data(String id) { return MakerRuntime.item(id); }
	public static String name(String id) { JsonValue d = data(id); return d == null ? id : d.getString("name", id); }
	public static String desc(String id) { JsonValue d = data(id); return d == null ? "" : d.getString("desc", ""); }
	public static int image(String id, int def) {
		JsonValue d = data(id);
		JsonValue sp = d == null ? null : d.get("sprite");
		if (sp != null && !sp.getString("png", "").isEmpty()) return MakerAssets.customItemImage(sp.getString("png"), def);
		return spriteIndex(sp, def);
	}
	/** sprite.name(ItemSpriteSheet 상수 이름)이 있으면 지금 게임의 번호로 — 원작(16px)·mod-2(32px) 시트 모두 맞음. 없으면 index */
	public static int spriteIndex(JsonValue sp, int def) {
		if (sp == null) return def;
		String n = sp.getString("name", "");
		if (!n.isEmpty()) {
			try { return com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.class.getField(n).getInt(null); }
			catch (Exception e) { MakerRuntime.warnOnce("게임에 없는 아이템 그림 이름: " + n); }
		}
		int idx = sp.has("index") ? sp.getInt("index", def) : def;
		// 다른 게임(예: mod-2 번호를 원작에서)의 번호라 시트에 없으면 기본 그림
		try { if (com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.film.get(idx) == null) return def; } catch (Throwable ignored) { }
		return idx;
	}
	public static int price(String id, int superValue, int quantity) {
		JsonValue d = data(id);
		int p = d == null ? 0 : d.getInt("price", 0);
		return p > 0 ? p * Math.max(1, quantity) : superValue;
	}
	public static boolean cond(String c) { return Cond.eval(c, StoryState.globalResolver()); }

	private static final Set<String> reported = new HashSet<>();
	/** 사용자 코드에서 난 오류: 게임은 계속, 로그 + 화면 경고 한 번 */
	public static void error(String owner, String where, Throwable e) {
		String key = owner + "/" + where + "/" + e;
		MakerRuntime.log("코드 오류 [" + owner + " · " + where + "] " + e);
		e.printStackTrace();
		if (reported.add(key)) MakerRuntime.warnOnce("코드 오류: " + owner + " · " + where + " — " + e.getClass().getSimpleName());
	}

	// 아이템 클래스는 분류/세부 종류 폴더에 있음 (gen/items/<분류>/<세부 종류>/I_<id>) — 생성된 GenIndex 표로 찾음
	private static java.util.Map<String, String> index;
	/** 표 읽기 + 예전 위치(gen 바로 아래)로 저장된 세이브가 읽히도록 별칭 등록. MakerRuntime.init 에서 한 번 */
	public static synchronized void loadIndex() {
		index = new java.util.HashMap<>();
		try {
			String[][] items = (String[][]) Class.forName(GEN + "GenIndex").getField("ITEMS").get(null);
			for (String[] e : items) {
				index.put(e[0], e[1]);
				try { com.watabou.utils.Bundle.addAlias(Class.forName(GEN + e[1]), GEN + e[0]); } catch (Throwable ignored) { }
			}
		} catch (Throwable ignored) { /* 생성 코드가 아직 없음 */ }
	}
	/** gen 클래스 (없으면 null) */
	public static Class<?> cls(String simpleName) {
		if (index == null) loadIndex();
		String rel = index.get(simpleName);
		try { return Class.forName(GEN + (rel == null ? simpleName : rel)); } catch (ClassNotFoundException e) { return null; }
	}

	/** gen 클래스 인스턴스 (없으면 null) */
	@SuppressWarnings("unchecked")
	static <T> T instance(String simpleName, Class<T> type) {
		try {
			Class<?> c = cls(simpleName);
			if (c == null || !type.isAssignableFrom(c)) return null;
			return (T) Reflection.newInstance(c);
		} catch (Throwable t) {
			MakerRuntime.log("생성 코드를 만들지 못함: " + simpleName + " " + t);
			return null;
		}
	}
	static String safe(String id) { return id.replaceAll("[^A-Za-z0-9_]", "_"); }
	/** 프로젝트 아이템 id → 생성된 아이템 클래스 (없으면 null) */
	public static Item item(String id) { return instance("I_" + safe(id), Item.class); }
	/** 프로젝트 영웅 id → 영웅 코드 (없으면 null) */
	public static MakerHeroCode hero(String id) { return instance("H_" + safe(id), MakerHeroCode.class); }
}
