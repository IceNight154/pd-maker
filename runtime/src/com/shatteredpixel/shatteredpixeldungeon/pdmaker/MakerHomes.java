/*
 * PDMaker — NPC 이주 (이벤트 명령 relocate · 퀘스트의 "완료하면 이주")
 *   캐릭터가 사는 곳을 StoryState 문자열 변수 home.<캐릭터> = "<노드>|<x>|<y>" 로 기억 (저장 파일에 포함).
 *   맵에 들어올 때마다: 이 맵이 사는 곳이면 그 칸에 세우고(없을 때만), 다른 맵이면 원래 놓여 있던 그 캐릭터를 치움 — 이미 만들어진 맵에도 적용됨.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.noosa.Game;

public class MakerHomes {

	static final String PRE = "home.";

	/** 이주: node 가 비면 "어디에도 없음"(사라짐) */
	public static void move(String charId, String node, int x, int y) {
		if (charId == null || charId.isEmpty() || MakerRuntime.character(charId) == null) { MakerRuntime.warnOnce("이주: 없는 캐릭터 " + charId); return; }
		if (node != null && !node.isEmpty() && WorldGraph.node(node) == null) { MakerRuntime.warnOnce("이주: 없는 맵 " + node); return; }
		StoryState.setStr(PRE + charId, (node == null ? "" : node) + "|" + x + "|" + y);
		if (EventTriggers.inParty(charId)) EventTriggers.setParty(charId, false);
		MakerRuntime.log("이주: " + charId + " → " + (node == null || node.isEmpty() ? "(사라짐)" : node + " " + x + "," + y));
		apply(charId);
	}
	public static void onFloorEnter() {
		try { for (String k : StoryState.strKeys(PRE)) apply(k.substring(PRE.length())); } catch (Throwable t) { MakerRuntime.log("이주 오류: " + t); }
	}

	/** 지금 맵에 대해 이 캐릭터를 맞춤 */
	static void apply(final String charId) {
		final Level l = Dungeon.level; if (l == null) return;
		String v = StoryState.str(PRE + charId); if (v.isEmpty()) return;
		String[] p = v.split("\\|", -1); if (p.length < 3) return;
		String here = WorldGraph.current();
		boolean home = !p[0].isEmpty() && p[0].equals(here);
		Mob found = null;
		for (Mob m : l.mobs.toArray(new Mob[0])) {
			if (!(m instanceof MakerNPC) || !((MakerNPC) m).charId.equals(charId) || ((MakerNPC) m).pageEvent) continue;
			if (EventTriggers.inParty(charId)) return;   // 동료로 따라다니는 중이면 건드리지 않음
			if (home && found == null) { found = m; continue; }
			final Mob mm = m;   // 사는 곳이 아닌 맵에 남아 있는 것(원래 놓여 있던 것) · 겹친 것은 치움
			l.mobs.remove(mm); Actor.remove(mm);
			Game.runOnRenderThread(() -> { try { mm.destroy(); if (mm.sprite != null) mm.sprite.killAndErase(); } catch (Throwable ignored) { } });
		}
		if (!home) return;
		int x = 0, y = 0; try { x = Integer.parseInt(p[1]); y = Integer.parseInt(p[2]); } catch (NumberFormatException ignored) { x = -1; }
		int[] off = LevelHooks.nodeOffset(l, here);
		int cell = x < 0 || y < 0 || off == null ? -1 : (off[0] + x) + (off[1] + y) * l.width();
		if (cell < 0 || cell >= l.length() || !l.passable[cell]) cell = -1;
		if (found != null) {   // 이미 이 맵에 있음: 자리가 다르면 옮김
			if (cell >= 0 && found.pos != cell && Actor.findChar(cell) == null) { final Mob f = found; final int c = cell; f.pos = c; Game.runOnRenderThread(() -> { try { if (f.sprite != null) f.sprite.place(c); } catch (Throwable ignored) { } }); }
			return;
		}
		if (cell >= 0 && Actor.findChar(cell) != null) cell = LevelHooks.freeNeighbour(l, cell);
		if (cell < 0) { int base = l.entrance(); cell = base > 0 ? LevelHooks.freeNeighbour(l, base) : -1; MakerRuntime.warnOnce("이주: " + charId + " 을(를) 세울 칸이 맞지 않아 입구 근처에 세웠습니다 (" + here + " " + p[1] + "," + p[2] + ")"); }
		if (cell < 0) return;
		if (MakerRuntime.charOff(charId)) return;
		final MakerNPC n = MakerNPC.create(charId); n.pos = cell;
		Game.runOnRenderThread(() -> { try { if (Game.scene() instanceof GameScene) GameScene.add(n); else l.mobs.add(n); } catch (Throwable t) { MakerRuntime.log("이주 오류: " + t); } });
	}
}
