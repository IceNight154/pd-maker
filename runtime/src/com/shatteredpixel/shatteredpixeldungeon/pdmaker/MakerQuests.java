/*
 * PDMaker — 퀘스트 (편집기 확장 기능 "퀘스트" — quests.json)
 *   { list: [ { id, name, desc, giver(주는 캐릭터), turnIn(보고할 캐릭터 — 비우면 giver), cond(받을 수 있는 조건), auto(목표를 채우면 바로 완료), repeat(다시 받을 수 있음), remind,
 *       objectives: [ { type: kill | collect | reach | talk | cond, target, count, take(collect: 보고할 때 가져감), cond, text } ],
 *       rewards: { gold, exp, items: [ { item, count } ] }, acceptEvent, doneEvent } ] }
 *   상태: StoryState 변수 quest.<id> (0 없음 · 1 진행 중 · 3 완료), 목표 진행도 quest.<id>.<번호>
 *   NPC 에게 말을 걸면(MakerNPC.interact) 줄 퀘스트 · 보고할 퀘스트가 있을 때 창이 뜸. 이벤트 명령 quest · questLog, 조건식 quest.<id> / quest.<id>.active|ready|done
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.watabou.noosa.Game;

public class MakerQuests {

	static JsonValue list() { return MakerRuntime.quests == null ? null : MakerRuntime.quests.get("list"); }
	static JsonValue def(String id) {
		JsonValue l = list();
		if (l != null && id != null) for (JsonValue q : l) if (id.equals(q.getString("id", ""))) return q;
		return null;
	}
	public static int state(String id) { return StoryState.var("quest." + id); }
	static void setState(String id, int v) { StoryState.setVar("quest." + id, v); }
	static int prog(String id, int i) { return StoryState.var("quest." + id + "." + i); }
	static void setProg(String id, int i, int v) { StoryState.setVar("quest." + id + "." + i, v); }
	static String name(JsonValue q) { return StoryState.expand(q.getString("name", q.getString("id", ""))); }
	static String T(String k, String fb) { return MakerRuntime.term(k, fb); }

	// ------------------------------------------------------------ 목표

	static int need(JsonValue o) { String t = o.getString("type", "kill"); return t.equals("kill") || t.equals("collect") ? Math.max(1, o.getInt("count", 1)) : 1; }
	static int have(String id, int i, JsonValue o) {
		switch (o.getString("type", "kill")) {
			case "collect": return Math.min(need(o), StoryState.itemCount(o.getString("target", "")));
			case "cond": { try { return Cond.eval(o.getString("cond", ""), StoryState.globalResolver()) ? 1 : 0; } catch (Throwable t) { return 0; } }
			case "reach": if (o.getString("target", "").equals(WorldGraph.current())) return 1;   // 지금 그 맵에 있음
			default: return Math.min(need(o), prog(id, i));
		}
	}
	public static boolean ready(String id) {
		JsonValue q = def(id); if (q == null || state(id) != 1) return false;
		JsonValue os = q.get("objectives"); int i = 0;
		if (os != null) for (JsonValue o : os) { if (have(id, i, o) < need(o)) return false; i++; }
		return true;
	}
	static String objText(JsonValue o) {
		String tx = o.getString("text", "");
		if (!tx.isEmpty()) return StoryState.expand(tx);
		String tg = o.getString("target", "");
		switch (o.getString("type", "kill")) {
			case "kill": { JsonValue c = MakerRuntime.character(tg); return (c != null ? c.getString("name", tg) : tg) + " " + T("quest.kill", "처치"); }
			case "collect": { String n = tg; try { Item it = MakerItem.create(tg); if (it != null) n = it.name(); } catch (Throwable ignored) { } return n + " " + T("quest.collect", "모으기"); }
			case "reach": { JsonValue n = WorldGraph.node(tg); return (n != null && !n.getString("name", "").isEmpty() ? n.getString("name", tg) : tg) + " " + T("quest.reach", "도착"); }
			case "talk": { JsonValue c = MakerRuntime.character(tg); return (c != null ? c.getString("name", tg) : tg) + T("quest.talk", "와(과) 대화"); }
			default: return T("quest.cond", "조건 달성");
		}
	}
	static String objLines(String id, JsonValue q, boolean progress) {
		StringBuilder sb = new StringBuilder(); JsonValue os = q.get("objectives"); int i = 0;
		if (os != null) for (JsonValue o : os) {
			int n = need(o), hv = progress ? have(id, i, o) : 0;
			sb.append(progress && hv >= n ? "_[v]_ " : "- ").append(objText(o));
			if (n > 1) sb.append(progress ? " (" + hv + "/" + n + ")" : " ×" + n);
			sb.append('\n'); i++;
		}
		return sb.toString();
	}
	static String rewardLines(JsonValue q) {
		JsonValue r = q.get("rewards"); if (r == null) return "";
		StringBuilder sb = new StringBuilder();
		if (r.getInt("gold", 0) > 0) sb.append(T("quest.gold", "금화")).append(" ").append(r.getInt("gold", 0)).append("  ");
		if (r.getInt("exp", 0) > 0) sb.append(T("quest.exp", "경험치")).append(" ").append(r.getInt("exp", 0)).append("  ");
		JsonValue its = r.get("items");
		if (its != null) for (JsonValue e : its) { try { Item it = MakerItem.create(e.getString("item", "")); if (it != null) sb.append(it.name()).append(e.getInt("count", 1) > 1 ? " ×" + e.getInt("count", 1) : "").append("  "); } catch (Throwable ignored) { } }
		return sb.length() == 0 ? "" : "\n" + T("quest.reward", "보상") + ": " + sb.toString().trim();
	}

	// ------------------------------------------------------------ 진행

	static boolean available(JsonValue q) {
		String id = q.getString("id", ""); int st = state(id);
		if (st == 1 || (st == 3 && !q.getBoolean("repeat", false))) return false;
		String c = q.getString("cond", "").trim();
		try { return c.isEmpty() || Cond.eval(c, StoryState.globalResolver()); } catch (Throwable t) { return false; }
	}
	public static void accept(String id) {
		JsonValue q = def(id); if (q == null) { MakerRuntime.warnOnce("없는 퀘스트: " + id); return; }
		if (state(id) == 1) return;
		setState(id, 1);
		JsonValue os = q.get("objectives"); int n = os == null ? 0 : os.size;
		for (int i = 0; i < n; i++) setProg(id, i, 0);
		StoryState.setFlag("questready_" + id, false);
		GLog.p(T("quest.accepted", "퀘스트 수락: %s").replace("%s", name(q)));
		String ev = q.getString("acceptEvent", "");
		if (!ev.isEmpty()) EventInterpreter.runEvent(ev, null);
		tick();
	}
	public static void abandon(String id) { if (state(id) == 1) { setState(id, 0); JsonValue q = def(id); if (q != null) GLog.w(T("quest.abandoned", "퀘스트 포기: %s").replace("%s", name(q))); } }
	/** 보상을 주고 완료 처리 (목표를 채웠는지는 부르는 쪽이 확인 — 이벤트 명령 "완료 처리"는 강제) */
	public static void complete(String id) {
		JsonValue q = def(id); if (q == null) { MakerRuntime.warnOnce("없는 퀘스트: " + id); return; }
		JsonValue os = q.get("objectives");
		if (os != null) for (JsonValue o : os) if (o.getString("type", "").equals("collect") && o.getBoolean("take", true)) EventInterpreter.removeItems(o.getString("target", ""), need(o));
		setState(id, 3);
		GLog.p(T("quest.completed", "퀘스트 완료: %s").replace("%s", name(q)));
		JsonValue r = q.get("rewards");
		if (r != null && Dungeon.hero != null) {
			int g = r.getInt("gold", 0); if (g > 0) { Dungeon.gold += g; GLog.i(T("quest.gold", "금화") + " +" + g); }
			int x = r.getInt("exp", 0); if (x > 0) Dungeon.hero.earnExp(x, MakerQuests.class);
			JsonValue its = r.get("items");
			if (its != null) for (JsonValue e : its) {
				try { Item it = MakerItem.create(e.getString("item", "")); if (it == null) continue; int n = Math.max(1, e.getInt("count", 1)); it.quantity(n);
					GLog.i(it.name() + (n > 1 ? " ×" + n : "") + " " + T("quest.got", "획득"));
					if (!it.collect()) Dungeon.level.drop(it, Dungeon.hero.pos).sprite.drop();
				} catch (Throwable t) { MakerRuntime.log("퀘스트 보상 오류: " + t); }
			}
		}
		JsonValue mv = q.get("move");   // 완료하면 이주
		if (mv != null && mv.getBoolean("on", false)) { String mc = mv.getString("char", ""); if (mc.isEmpty()) mc = q.getString("giver", ""); MakerHomes.move(mc, mv.getString("node", ""), mv.getInt("x", -1), mv.getInt("y", -1)); }
		String ev = q.getString("doneEvent", "");
		if (!ev.isEmpty()) EventInterpreter.runEvent(ev, null);
	}

	static void bump(String type, String ref) {
		JsonValue l = list(); if (l == null) return;
		String[] refs = ref == null ? new String[0] : ref.split("\\|");
		for (JsonValue q : l) {
			String id = q.getString("id", ""); if (state(id) != 1) continue;
			JsonValue os = q.get("objectives"); if (os == null) continue;
			int i = 0;
			for (JsonValue o : os) {
				if (o.getString("type", "kill").equals(type) && prog(id, i) < need(o)) {
					String tg = o.getString("target", ""); if (tg.startsWith("spd:")) tg = tg.substring(tg.lastIndexOf('.') < 0 ? 4 : tg.lastIndexOf('.') + 1);
					boolean hit = tg.isEmpty() && type.equals("kill");
					for (String r : refs) if (r.equals(tg)) hit = true;
					if (hit) { setProg(id, i, prog(id, i) + 1); GLog.i(name(q) + ": " + objText(o) + (need(o) > 1 ? " (" + prog(id, i) + "/" + need(o) + ")" : " " + T("quest.ok", "달성"))); }
				}
				i++;
			}
		}
		tick();
	}
	public static void onMobDie(String ref) { try { bump("kill", ref); } catch (Throwable t) { MakerRuntime.log("퀘스트 오류: " + t); } }
	public static void onFloorEnter(String node) { try { bump("reach", node); } catch (Throwable t) { MakerRuntime.log("퀘스트 오류: " + t); } }
	/** 매 턴: 목표를 다 채웠으면 알림 한 번 · auto 면 바로 완료 */
	public static void tick() {
		JsonValue l = list(); if (l == null || !MakerRuntime.isActive()) return;
		try {
			for (JsonValue q : l) {
				String id = q.getString("id", ""); if (state(id) != 1) continue;
				boolean rd = ready(id), told = StoryState.flag("questready_" + id);
				if (rd && q.getBoolean("auto", false)) { if (!EventInterpreter.busy()) complete(id); continue; }
				if (rd && !told) { StoryState.setFlag("questready_" + id, true); GLog.p(T("quest.ready", "퀘스트 목표 달성: %s").replace("%s", name(q))); }
				else if (!rd && told) StoryState.setFlag("questready_" + id, false);
			}
		} catch (Throwable t) { MakerRuntime.log("퀘스트 오류: " + t); }
	}

	// ------------------------------------------------------------ NPC 에게 말 걸기

	/** 이 캐릭터가 줄 · 받을 퀘스트 창을 띄웠으면 true (그러면 평소 대화는 하지 않음) */
	public static boolean onTalk(String charId) {
		JsonValue l = list(); if (l == null || charId == null || charId.isEmpty() || !MakerRuntime.isActive()) return false;
		try {
			bump("talk", charId);
			for (JsonValue q : l) {   // ① 보고
				String id = q.getString("id", ""), ti = q.getString("turnIn", ""); if (ti.isEmpty()) ti = q.getString("giver", "");
				if (charId.equals(ti) && state(id) == 1 && ready(id) && !q.getBoolean("auto", false)) { showTurnIn(id, null); return true; }
			}
			for (JsonValue q : l) if (charId.equals(q.getString("giver", "")) && available(q)) { offer(q.getString("id", ""), null); return true; }   // ② 수주
			for (JsonValue q : l) {   // ③ 진행 중 — 얼마나 했는지
				String id = q.getString("id", "");
				if (charId.equals(q.getString("giver", "")) && state(id) == 1 && q.getBoolean("remind", true)) { show(() -> new WndOptions(name(q), T("quest.progress", "아직 진행 중이다.") + "\n\n" + objLines(id, q, true), T("quest.close", "닫기"))); return true; }
			}
		} catch (Throwable t) { MakerRuntime.log("퀘스트 오류: " + t); }
		return false;
	}
	static void show(final java.util.function.Supplier<Window> w) { Game.runOnRenderThread(() -> { try { if (Game.scene() instanceof GameScene) GameScene.show(w.get()); } catch (Throwable t) { MakerRuntime.log("퀘스트 창 오류: " + t); } }); }

	/** 수주 창 (수락 / 거절). after = 창이 닫힌 뒤 (이벤트 이어가기) */
	public static void offer(final String id, final Runnable after) {
		final JsonValue q = def(id);
		if (q == null) { MakerRuntime.warnOnce("없는 퀘스트: " + id); if (after != null) after.run(); return; }
		final String msg = StoryState.expand(q.getString("desc", "")) + "\n\n" + objLines(id, q, false) + rewardLines(q);
		show(() -> new WndOptions(name(q), msg, T("quest.accept", "수락"), T("quest.decline", "거절")) {
			boolean done;
			@Override protected void onSelect(int index) { done = true; if (index == 0) accept(id); if (after != null) after.run(); }
			@Override public void hide() { super.hide(); if (!done && after != null) { done = true; after.run(); } }
		});
	}
	static void showTurnIn(final String id, final Runnable after) {
		final JsonValue q = def(id);
		final String msg = T("quest.turnin", "목표를 모두 달성했다!") + "\n\n" + objLines(id, q, true) + rewardLines(q);
		show(() -> new WndOptions(name(q), msg, T("quest.claim", "보상 받기"), T("quest.later", "나중에")) {
			boolean done;
			@Override protected void onSelect(int index) { done = true; if (index == 0) complete(id); if (after != null) after.run(); }
			@Override public void hide() { super.hide(); if (!done && after != null) { done = true; after.run(); } }
		});
	}

	// ------------------------------------------------------------ 퀘스트 목록 창

	public static void showLog() { show(Log::new); }
	static class Log extends Window {
		Log() {
			int w = PixelScene.landscape() ? 200 : 126;
			RenderedTextBlock title = PixelScene.renderTextBlock(T("quest.log", "퀘스트"), 9);
			title.hardlight(MakerTheme.or("accent", 0xFFFF44)); title.setPos(2, 2); add(title);
			float y = title.bottom() + 4; int n = 0, done = 0;
			JsonValue l = list();
			if (l != null) for (JsonValue q : l) {
				String id = q.getString("id", ""); int st = state(id);
				if (st == 3) { done++; continue; }
				if (st != 1) continue;
				if (y > PixelScene.uiCamera.height * 0.8f - 30) break;
				RenderedTextBlock nm = PixelScene.renderTextBlock(name(q) + (ready(id) ? "  (" + T("quest.ok", "달성") + ")" : ""), 7);
				nm.hardlight(ready(id) ? MakerTheme.or("good", 0x44FF44) : MakerTheme.or("accent", 0xFFFF44)); nm.maxWidth(w - 4); nm.setPos(2, y); add(nm);
				RenderedTextBlock ds = PixelScene.renderTextBlock(objLines(id, q, true).trim(), 6);
				ds.maxWidth(w - 8); ds.setPos(6, nm.bottom() + 1); add(ds);
				y = ds.bottom() + 5; n++;
			}
			RenderedTextBlock e = PixelScene.renderTextBlock(n == 0 ? T("quest.none", "진행 중인 퀘스트가 없습니다.") + (done > 0 ? "  (" + T("quest.doneCount", "완료") + " " + done + ")" : "") : T("quest.doneCount", "완료") + " " + done, 6);
			e.alpha(0.7f); e.setPos(2, y); add(e); y = e.bottom() + 3;
			resize(w, (int) y);
		}
	}

	/** 조건식 quest.<id> (0 없음 · 1 진행 중 · 2 목표 달성 · 3 완료) / quest.<id>.none|active|ready|done */
	public static Object resolve(String rest) {
		String[] sfx = { ".none", ".active", ".ready", ".done" };
		for (String s : sfx) if (rest.endsWith(s) && def(rest) == null) {
			String id = rest.substring(0, rest.length() - s.length()); int st = state(id);
			switch (s) { case ".none": return st == 0; case ".active": return st == 1; case ".ready": return ready(id); default: return st == 3; }
		}
		int st = state(rest);
		return st == 1 && ready(rest) ? 2 : st;
	}
}
