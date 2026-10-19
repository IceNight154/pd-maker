/*
 * PDMaker — 함정 오브젝트: 지형 타일이 아니라 맵 오브젝트(objects[] type "trap")로 놓고, 게임의 함정(levels.traps.*)을 그대로 만듦
 *   { type: "trap", ref: "PoisonDartTrap" (levels.traps 의 클래스 이름), hidden (숨겨진 함정 — 찾기 전엔 안 보임), inactive (이미 작동한 함정), at, cond, chance(방 템플릿) }
 *   바닥 지형(layers.terrain)은 따로 그대로 두고, 층을 만들 때 Level.setTrap + 그 칸 지형을 게임 규칙대로 TRAP · SECRET_TRAP · INACTIVE_TRAP 로 —
 *   그래서 밟기 · 찾기 · 피해 · 애니메이션 · 해제(disarm)는 게임 코드 그대로. 그림은 게임 TerrainFeaturesTilemap 이 함정 목록(level.traps)으로 그림.
 *   예전 데이터(지형에 직접 칠한 함정 17 · 18 · 19)는 함정 오브젝트가 없어서 아무 일도 안 일어났음 → legacy 가 기본 함정(WornDartTrap)으로 살림
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;

public class MakerTraps {

	static final String PKG = "com.shatteredpixel.shatteredpixeldungeon.levels.traps.";
	/** 예전 데이터의 지형 함정에 쓰는 기본 함정 */
	static final String LEGACY = "WornDartTrap";

	/** "PoisonDartTrap" → 새 함정 (없는 클래스면 null — 다른 판의 저장소) */
	static Trap create(String ref) {
		if (ref == null || ref.isEmpty()) ref = LEGACY;
		try {
			Class<?> c = Class.forName(ref.contains(".") ? ref : PKG + ref);
			if (!Trap.class.isAssignableFrom(c)) return null;
			return (Trap) c.getDeclaredConstructor().newInstance();
		} catch (Throwable t) { MakerRuntime.warnOnce("없는 함정: " + ref); return null; }
	}

	/** 함정 오브젝트를 칸에 놓음 (층 만들기 중 · 방 템플릿) */
	public static boolean place(Level level, JsonValue o, int cell) {
		if (level == null || cell < 0 || cell >= level.length()) return false;
		Trap t = create(o.getString("ref", ""));
		if (t == null) return false;
		return set(level, t, cell, o.getBoolean("hidden", false), o.getBoolean("inactive", false));
	}
	static boolean set(Level level, Trap t, int cell, boolean hidden, boolean inactive) {
		try {
			if (hidden) t.hide(); else t.reveal();   // 숨길 수 없는 함정은 hide() 가 그냥 보이게 둠
			if (inactive) t.active = false;
			level.setTrap(t, cell);
			Level.set(cell, inactive ? Terrain.INACTIVE_TRAP : t.visible ? Terrain.TRAP : Terrain.SECRET_TRAP, level);
			return true;
		} catch (Throwable e) { StackTraceElement[] st = e.getStackTrace(); MakerRuntime.log("함정 놓기 오류: " + e + (st.length > 0 ? " @ " + st[0] + (st.length > 1 ? " ← " + st[1] : "") : "")); return false; }
	}

	/** 지형에 직접 칠한 함정(예전 형식) — 그 칸에 함정 오브젝트가 없으면 기본 함정으로 */
	public static void legacy(Level level, int cell) {
		if (level.traps.get(cell) != null) return;
		int v = level.map[cell];
		if (v != Terrain.TRAP && v != Terrain.SECRET_TRAP && v != Terrain.INACTIVE_TRAP) return;
		Trap t = create(LEGACY);
		if (t != null) set(level, t, cell, v == Terrain.SECRET_TRAP, v == Terrain.INACTIVE_TRAP);
	}
}
