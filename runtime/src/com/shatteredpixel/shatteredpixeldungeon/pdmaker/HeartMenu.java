/*
 * 마음 캐릭터에게 말을 걸었을 때의 메뉴 (eraTW 일상 커맨드: 회화·칭찬·위로·사과 + 부탁)
 *   heart.json actions[].menu = true 인 행동 (when 조건, calm 이면 삐졌을 때만), requests[].menu = true 인 부탁
 *   + "마음 보기". 메뉴에 넣을 게 없으면 예전처럼 대화 + 인사.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;

import java.util.ArrayList;
import java.util.List;

public class HeartMenu {

	/** 메뉴를 띄웠으면 true */
	public static boolean show(final MakerNPC npc) {
		JsonValue sys = MakerRuntime.heart;
		if (sys == null || sys.get("actions") == null) return false;
		final String id = npc.charId;
		final HeartSystem.Record r = HeartSystem.rec(id);
		final List<String> keys = new ArrayList<>(), labels = new ArrayList<>();
		Cond.Resolver res = HeartSystem.resolver(id);
		for (JsonValue a : sys.get("actions")) {
			if (!a.getBoolean("menu", false)) continue;
			boolean calm = a.getBoolean("calm", false);
			if (calm && !r.sulk && r.displeased <= 0) continue;
			if (!calm && (r.sulk || r.displeased > 0) && a.getInt("favor", 0) > 0 && !a.getString("key").equals("TALK")) continue;
			String when = a.getString("when", "");
			if (!when.isEmpty() && !Cond.eval(when, res)) continue;
			keys.add("a:" + a.getString("key")); labels.add(a.getString("name", a.getString("key")));
		}
		if (sys.get("requests") != null) for (JsonValue q : sys.get("requests")) {
			if (!q.getBoolean("menu", false)) continue;
			String qw = q.getString("when", "");
			if (!qw.isEmpty() && !Cond.eval(qw, res)) continue;
			keys.add("r:" + q.getString("key")); labels.add("> " + q.getString("name", q.getString("key")));
		}
		if (keys.isEmpty()) return false;
		keys.add("heart"); labels.add(MakerRuntime.term("sys.heartWindow", "마음") + " 보기");
		keys.add("bye"); labels.add("그만두기");
		JsonValue greet = HeartSystem.pickLine(id, r.sulk || r.displeased > 0 ? "sulk" : "greet");
		String msg = greet == null ? "" : greet.getString("text", "");
		final String face = greet == null ? "" : greet.getString("face", "");
		final MakerDialogue.OnChoice pick = index -> {
			String k = keys.get(index);
			if (k.equals("bye")) return;
			if (k.equals("heart")) { HeartUI.show(id); return; }
			if (k.startsWith("a:")) {
				String act = k.substring(2);
				HeartSystem.Result rs = HeartSystem.applyAction(id, act);
				npc.topic(HeartSystem.topicFor(act, rs));
			} else {
				String req = k.substring(2);
				boolean ok = HeartSystem.request(id, req);
				npc.topic(ok ? "request_ok" : "request_no");
				if (ok) for (JsonValue q : MakerRuntime.heart.get("requests"))
					if (req.equals(q.getString("key")) && !q.getString("event", "").isEmpty()) EventInterpreter.runEvent(q.getString("event"), id);
				StoryState.setVar("req_" + id + "_" + req, ok ? 1 : -1);
			}
		};
		// 말 걸기는 게임(actor) 스레드에서 불리므로 창은 화면 스레드에서 만듦 (글자 측정은 화면 스레드에서만 됨)
		com.watabou.noosa.Game.runOnRenderThread(() -> {
			if (!MakerDialogue.classic()) {
				// 대사창 방식: 인사말 + 캐릭터 일러스트 + 선택지(화면 가운데)
				MakerDialogue.Line l = MakerDialogue.line(id, face, null, msg);
				l.choices = labels.toArray(new String[0]);
				GameScene.show(new MakerDialogue.Wnd(l, null, pick));
				return;
			}
			GameScene.show(new WndOptions(npc.sprite(), npc.name(), msg, labels.toArray(new String[0])) {
				@Override protected void onSelect(int index) { pick.pick(index); }
			});
		});
		return true;
	}
}
