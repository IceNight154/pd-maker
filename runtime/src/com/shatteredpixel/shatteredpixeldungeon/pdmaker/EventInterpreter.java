/*
 * 이벤트 인터프리터 — RPG Maker 식 명령 목록을 차례로 실행합니다.
 *   · 대사/선택지/대기 명령에서 멈췄다가 창이 닫히면 이어서 실행 (한 번에 이벤트 하나)
 *   · 블록: if(then/else), choice(branches), loop(body)
 *   · 이 버전(M0)에서 동작하지 않는 명령은 로그만 남기고 넘어갑니다 (INTEGRATION.md 의 단계표 참고)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.IconTitle;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndTitledMessage;
import com.watabou.noosa.Game;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Image;
import com.watabou.noosa.audio.Music;
import com.watabou.noosa.audio.Sample;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public class EventInterpreter {

	// ------------------------------------------------------------ 시작하기

	private static volatile EventInterpreter current = null;
	private static final Deque<EventInterpreter> queue = new ArrayDeque<>();

	/** 이벤트 실행. 활성 페이지(뒤에서부터 조건 검사)의 명령을 실행합니다. ctxChar = 말을 건 캐릭터(없으면 null) */
	public static boolean runEvent(String eventId, String ctxChar) { return runEvent(eventId, ctxChar, null); }
	public static boolean runEvent(String eventId, String ctxChar, String triggerFilter) {
		JsonValue ev = MakerRuntime.event(eventId);
		if (ev == null) { MakerRuntime.log("없는 이벤트: " + eventId); return false; }
		JsonValue page = activePage(ev, triggerFilter);
		if (page == null) return false;
		run(page.get("commands"), eventId, ctxChar);
		return true;
	}
	public static JsonValue activePage(JsonValue ev, String triggerFilter) {
		JsonValue pages = ev.get("pages");
		if (pages == null) return null;
		String id = ev.getString("id", "");
		for (int i = pages.size - 1; i >= 0; i--) {
			JsonValue p = pages.get(i);
			if (!Cond.eval(p.getString("cond", ""), StoryState.globalResolver(id))) continue;
			if (triggerFilter != null) {
				String t = p.getString("trigger", "action");
				boolean mapTrig = triggerFilter.equals("action") || triggerFilter.equals("touch");
				if (mapTrig ? !(t.equals("action") || t.equals("touch")) : !t.equals(triggerFilter)) return null;
			}
			return p;
		}
		return null;
	}
	/** 명령 목록 실행 (캐릭터 행동 이벤트, 아이템 사용 등) */
	public static void run(JsonValue commands, String eventId, String ctxChar) {
		if (commands == null || commands.size == 0) return;
		EventInterpreter it = new EventInterpreter(eventId, ctxChar);
		it.stack.push(new Frame(commands, "list", 0));
		if (current == null) it.start(); else queue.add(it);
	}
	/** 이벤트가 실행 중인지. 기다리던 창·타이머가 이어지지 않고 사라졌으면(화면 전환·오류) 막힌 이벤트를 정리하고 false */
	public static boolean busy() {
		EventInterpreter c = current;
		if (c != null && c.stuck()) {
			MakerRuntime.log("이벤트가 멈춘 채 남아 있어 정리했습니다: " + c.eventId);
			reset();
		}
		return current != null;
	}
	/** 새 게임 · 불러오기 때 (StoryState.reset): 이전 게임의 실행 중·대기 중 이벤트를 모두 버림 */
	public static synchronized void reset() {
		if (current != null) current.dead = true;
		for (EventInterpreter q : queue) q.dead = true;
		current = null;
		queue.clear();
		MakerDialogue.faces.clear();
	}
	/** 멈춘 명령이 기다리는 창·타이머를 알려 줌 (사라졌는데 이어지지 않으면 막힌 것으로 봄) */
	public static void waitingOn(com.watabou.noosa.Gizmo g) {
		EventInterpreter c = current;
		if (c != null) { c.waitOn = g; c.pauseSeq++; }
	}
	static Thread renderThread;

	// ------------------------------------------------------------ 실행기

	static class Frame {
		final JsonValue list; final String kind; int i = 0; final int times; int count = 0;
		Frame(JsonValue list, String kind, int times) { this.list = list; this.kind = kind; this.times = times; }
	}
	final Deque<Frame> stack = new ArrayDeque<>();
	final String eventId, ctxChar;
	// 멈춤 감시: 창·타이머로 멈춘 경우만 (플러그인의 비동기 명령은 감시하지 않음)
	volatile boolean dead = false, watch = false;
	volatile com.watabou.noosa.Gizmo waitOn;
	volatile long pausedAt;
	volatile int pauseSeq;

	EventInterpreter(String eventId, String ctxChar) { this.eventId = eventId; this.ctxChar = ctxChar; }

	void start() { current = this; step(); }
	void finish() {
		if (dead) return;
		current = null;
		EventInterpreter next = queue.poll();
		if (next != null) next.start();
	}
	/** 멈춘 명령(창 닫힘, 대기 끝) 다음부터 이어서 — 플러그인도 비동기 처리가 끝나면 호출 */
	public void resume() { if (dead) return; watch = false; waitOn = null; pauseSeq++; step(); }

	/** 기다리던 것이 사라졌는데(창이 화면에서 없어짐 · 창을 만들지 못함) 이어지지 않았는가 */
	boolean stuck() {
		if (dead || !watch) return false;
		int seq = pauseSeq;
		if (!gone()) return false;
		// 창을 닫는 것과 이어 실행하는 것 사이의 아주 짧은 틈일 수 있으므로, 화면 스레드가 아니면 잠깐 기다렸다가 다시 확인
		if (Thread.currentThread() != renderThread) {
			try { Thread.sleep(80); } catch (InterruptedException ignored) { }
			return !dead && watch && seq == pauseSeq && gone();
		}
		return true;
	}
	private boolean gone() {
		com.watabou.noosa.Gizmo g = waitOn;
		if (g == null) return System.currentTimeMillis() - pausedAt > 4000;   // 창이 4초 넘게 안 뜸 (만들다 오류)
		return g.parent == null || !g.exists;
	}

	void step() {
		while (true) {
			if (stack.isEmpty()) { finish(); return; }
			Frame f = stack.peek();
			if (f.list == null || f.i >= f.list.size) {
				if (f.kind.equals("loop") && (f.times <= 0 || ++f.count < f.times) && f.list != null && f.list.size > 0) { f.i = 0; continue; }
				stack.pop(); continue;
			}
			JsonValue c = f.list.get(f.i++);
			boolean keepGoing;
			if (dead) return;
			String cmd = c.getString("cmd", "");
			watch = false; waitOn = null;
			try { keepGoing = exec(c); }
			catch (Exception e) { MakerRuntime.log("명령 실행 오류 (" + cmd + " @ " + eventId + "): " + e); keepGoing = true; }
			if (!keepGoing) {   // 창/대기가 끝나면 resume() 이 불림
				if (UI_WAITS.contains(cmd)) { pausedAt = System.currentTimeMillis(); watch = true; }
				return;
			}
		}
	}

	Cond.Resolver resolver() {
		final Cond.Resolver g = StoryState.globalResolver(eventId);
		if (ctxChar == null) return g;
		final Cond.Resolver h = HeartSystem.resolver(ctxChar);
		return name -> { Object v = g.get(name); return v != null ? v : h.get(name); };
	}
	String charArg(JsonValue c, String key) {
		String v = c.getString(key, "");
		return v.isEmpty() ? ctxChar : v;
	}

	/** 창·타이머로 멈추는 명령 (멈춤 감시 대상) */
	static final java.util.Set<String> UI_WAITS = new java.util.HashSet<>(java.util.Arrays.asList("text", "topic", "choice", "action", "wait"));

	/** 창 띄우기 — 화면 스레드에서, 만들다 오류가 나면 기록하고 이어서 실행 (이벤트가 멈추지 않게) */
	void showWindow(java.util.function.Supplier<com.shatteredpixel.shatteredpixeldungeon.ui.Window> make) { showWindow(make, 0); }
	void showWindow(java.util.function.Supplier<com.shatteredpixel.shatteredpixeldungeon.ui.Window> make, int tries) {
		final EventInterpreter self = this;
		Game.runOnRenderThread(() -> {
			renderThread = Thread.currentThread();
			if (self.dead) return;
			// 층 이동 중(InterlevelScene)·타이틀 등 게임 화면이 아니면 GameScene.show 가 창을 버리므로, 게임 화면이 뜰 때까지 미룸
			if (!(Game.scene() instanceof GameScene)) {
				if (!(Game.scene() instanceof InterlevelScene) || tries > 60 * 60) {   // 타이틀로 나감 · 너무 오래 걸림 → 이 이벤트는 버림
					MakerRuntime.log("게임 화면이 아니라서 이벤트를 멈췄습니다 (" + eventId + ")");
					if (current == self) reset(); else self.dead = true;
					return;
				}
				self.pausedAt = System.currentTimeMillis();
				showWindow(make, tries + 1);
				return;
			}
			com.shatteredpixel.shatteredpixeldungeon.ui.Window w;
			try { w = make.get(); GameScene.show(w); }
			catch (Throwable t) { MakerRuntime.log("대사·선택지 창을 띄우지 못했습니다 (" + eventId + "): " + t); self.resume(); return; }
			if (current == self) waitingOn(w);
		});
	}

	/** true = 바로 다음 명령으로, false = 멈춤 (나중에 resume) */
	boolean exec(JsonValue c) {
		String cmd = c.getString("cmd", "");
		switch (cmd) {
			// ---------------- 메시지
			case "text": {
				MakerDialogue.Line l = MakerDialogue.line(c.getString("speaker", ""), c.getString("face", ""), c.getString("illust", ""), c.getString("text", ""));
				if (!c.getString("name", "").isEmpty()) l.name = c.getString("name", "");
				if (!c.getString("side", "").isEmpty()) l.side = c.getString("side", "");
				showLine(l);
				return false;
			}
			case "topic": {
				String ch = charArg(c, "char");
				JsonValue line = ch == null ? null : HeartSystem.pickLine(ch, c.getString("topic", "greet"));
				if (line == null) return true;
				showLine(MakerDialogue.line(ch, line.getString("face", ""), null, line.getString("text", "")));
				return false;
			}
			case "choice": {
				final JsonValue opts = c.get("options"), branches = c.get("branches");
				if (opts == null || opts.size == 0) return true;
				final String[] labels = new String[opts.size];
				for (int i = 0; i < labels.length; i++) labels[i] = opts.get(i).asString();
				if (!MakerDialogue.classic()) {   // 대사창 스타일 선택지 (대사 없이)
					final MakerDialogue.Line l = new MakerDialogue.Line();
					l.choices = labels;
					showWindow(() -> new MakerDialogue.Wnd(l, this::resume, index -> {
						if (branches != null && index < branches.size) stack.push(new Frame(branches.get(index), "list", 0));
						resume();
					}));
					return false;
				}
				showWindow(() -> new WndOptions("", "", labels) {
					@Override protected void onSelect(int index) {
						if (branches != null && index < branches.size) stack.push(new Frame(branches.get(index), "list", 0));
						resume();
					}
					@Override public void onBackPressed() { /* 선택지는 반드시 골라야 함 */ }
				});
				return false;
			}
			case "notice": {
				String t = c.getString("text", ""), col = c.getString("color", "normal");
				if (col.equals("good")) GLog.p(t); else if (col.equals("bad")) GLog.n(t); else if (col.equals("warn")) GLog.w(t); else GLog.i(t);
				return true;
			}
			// ---------------- 흐름
			case "if": {
				boolean ok = Cond.eval(c.getString("cond", ""), resolver());
				stack.push(new Frame(c.get(ok ? "then" : "else"), "list", 0));
				return true;
			}
			case "loop": stack.push(new Frame(c.get("body"), "loop", c.getInt("times", 0))); return true;
			case "break": {
				while (!stack.isEmpty()) { Frame f = stack.pop(); if (f.kind.equals("loop")) break; }
				return true;
			}
			case "stop": stack.clear(); return true;
			case "wait": {
				final float sec = c.getInt("turns", 5) / 10f;
				final EventInterpreter self = this;
				Game.runOnRenderThread(() -> {
					renderThread = Thread.currentThread();
					if (Game.scene() == null) { resume(); return; }
					Gizmo timer = new Gizmo() {
						float left = sec; boolean fired;
						@Override public void update() { super.update(); left -= Game.elapsed; if (left <= 0 && !fired) { fired = true; active = false; resume(); if (parent != null) parent.remove(this); } }
					};
					Game.scene().add(timer);
					if (current == self) waitingOn(timer);
				});
				return false;
			}
			case "call": {
				JsonValue ev = MakerRuntime.event(c.getString("event", ""));
				JsonValue page = ev == null ? null : activePage(ev, null);
				if (page != null) stack.push(new Frame(page.get("commands"), "list", 0));
				return true;
			}
			case "comment": return true;
			// ---------------- 데이터
			case "switch": StoryState.setSw(c.getString("id", ""), c.getBoolean("value", false)); return true;
			case "var": {
				String id = c.getString("id", ""); int v = StoryState.var(id), x = c.getInt("value", 0);
				switch (c.getString("op", "set")) {
					case "add": v += x; break; case "sub": v -= x; break; case "mul": v *= x; break; default: v = x;
				}
				StoryState.setVar(id, v); return true;
			}
			case "self": StoryState.setSelf(eventId, c.getString("key", "A"), c.getBoolean("value", false)); return true;
			// ---------------- 마음
			case "heart": { String ch = charArg(c, "char"); if (ch != null) HeartSystem.addStat(ch, c.getString("stat", "rel.favor"), c.getInt("value", 0)); return true; }
			case "action": {
				String ch = charArg(c, "char"); if (ch == null) return true;
				String act = c.getString("action", "TALK");
				HeartSystem.Result rs = HeartSystem.applyAction(ch, act);
				if (c.getBoolean("say", false)) {
					String t = HeartSystem.topicFor(act, rs);
					JsonValue line = t == null ? null : HeartSystem.pickLine(ch, t);
					if (line != null) { showLine(MakerDialogue.line(ch, line.getString("face", ""), null, line.getString("text", ""))); return false; }
				}
				return true;
			}
			case "heartMenu": {   // 말 걸기 메뉴 (행동표 menu 행동 + 부탁) — 이벤트의 마지막에 두세요
				String ch = charArg(c, "char"); if (ch == null) return true;
				for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs)
					if (m instanceof MakerNPC && ((MakerNPC) m).charId.equals(ch)) {
						final MakerNPC npc = (MakerNPC) m;
						Game.runOnRenderThread(() -> { if (!HeartMenu.show(npc)) { HeartSystem.applyAction(npc.charId, "TALK"); npc.topic("greet"); } });
						break;
					}
				return true;
			}
			case "request": {   // 부탁 판정 → then / else
				String ch = charArg(c, "char");
				boolean ok = ch != null && HeartSystem.request(ch, c.getString("request", ""));
				JsonValue br = c.get(ok ? "then" : "else");
				if (br != null) stack.push(new Frame(br, "list", 0));
				return true;
			}
			case "showHeart": {   // 마음 창 열기 (창을 닫으면 다음 명령)
				String ch = charArg(c, "char");
				HeartUI.show(ch);
				return true;
			}
			case "memory": { String ch = charArg(c, "char"); if (ch != null) HeartSystem.remember(ch, c.getString("key", "")); return true; }
			// ---------------- 연출
			case "shake": PixelScene.shake(c.getInt("power", 3), c.getInt("time", 5) / 10f); return true;
			case "flash": {
				String hex = c.getString("color", "#ffffff").replace("#", "");
				int col; try { col = Integer.parseInt(hex, 16); } catch (Exception e) { col = 0xFFFFFF; }
				final int fc = col;
				Game.runOnRenderThread(() -> GameScene.flash(fc));
				return true;
			}
			case "sound": {
				String file = c.getString("file", "");
				if (file.isEmpty()) return true;
				if ("bgm".equals(c.getString("kind", "se"))) MakerAudio.playBgm(file);
				else MakerAudio.playSe(file);
				return true;
			}
			case "illust": {
				final int slot = c.getInt("slot", 1); final String img = c.getString("image", ""), pos = c.getString("pos", "center");
				final float fade = c.getInt("fade", 3) / 10f;
				Game.runOnRenderThread(() -> MakerStage.show(slot, img, pos, fade));
				return true;
			}
			case "illustHide": {
				final int slot = c.getInt("slot", 0); final float fade = c.getInt("fade", 3) / 10f;
				Game.runOnRenderThread(() -> MakerStage.hide(slot, fade));
				return true;
			}
			case "anim": {   // 애니메이션 재생: target = $hero 또는 캐릭터 id, anim = 이름 (기본 동작 또는 시트에서 만든 추가 애니메이션)
				String tg = c.getString("target", "$hero"), an = c.getString("anim", "");
				com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite spr = null;
				if (tg.isEmpty() || tg.equals("$hero")) spr = Dungeon.hero == null ? null : Dungeon.hero.sprite;
				else { String ch = charArg(c, "target"); for (Mob m : Dungeon.level.mobs) {
					String id = m instanceof MakerNPC ? ((MakerNPC) m).charId : m instanceof MakerMob ? ((MakerMob) m).charId : null;
					if (ch.equals(id)) { spr = m.sprite; break; } } }
				final com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite fs = spr;
				final com.watabou.noosa.MovieClip.Animation a = HeroRuntime.animOf(spr, an);
				if (fs == null || a == null) { MakerRuntime.log("애니메이션 재생: 찾지 못함 " + tg + " / " + an); return true; }
				Game.runOnRenderThread(() -> {
					// 한 번 재생하는 동작이면 끝난 뒤 가만히로 (animCallback 은 protected → 리플렉션)
					if (!a.looped) try {
						java.lang.reflect.Field f = com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite.class.getDeclaredField("animCallback");
						f.setAccessible(true); f.set(fs, (com.watabou.utils.Callback) fs::idle);
					} catch (Exception ignored) { }
					fs.play(a, true);
				});
				return true;
			}
			case "face": MakerDialogue.setFace(charArg(c, "char"), c.getString("face", "")); return true;
			// ---------------- 캐릭터
			case "spawn": {
				String ch = c.getString("char", "");
				if (MakerRuntime.character(ch) == null || Dungeon.level == null) return true;
				int cell = c.getInt("x", 0) + c.getInt("y", 0) * Dungeon.level.width();
				final Mob gm = LevelHooks.gameChar(ch);
				if (gm != null) { gm.pos = cell; Game.runOnRenderThread(() -> GameScene.add(gm)); return true; }
				final MakerNPC npc = MakerNPC.create(ch);
				npc.pos = cell;
				Game.runOnRenderThread(() -> GameScene.add(npc));
				return true;
			}
			case "despawn": {
				String ch = charArg(c, "char");
				for (Mob m : Dungeon.level.mobs.toArray(new Mob[0])) {
					if (m instanceof MakerNPC && ((MakerNPC) m).charId.equals(ch)) {
						final Mob mm = m;
						Game.runOnRenderThread(() -> { mm.destroy(); if (mm.sprite != null) mm.sprite.killAndErase(); });
					}
				}
				return true;
			}
			case "move": case "party":
				MakerRuntime.log("(M1/M4 예정) " + cmd);
				return true;
			// ---------------- 월드
			case "heroPath": {   // 전직·직업 능력 고르기 창 (텐구의 가면·왕관 없이)
				if (c.getString("what", "subclass").equals("ability")) MakerAbilities.openAbility(); else MakerAbilities.openSubclass();
				return true;
			}
			case "heroGauge": {
				String op = c.getString("op", "add");
				if (op.equals("element")) MakerGauge.setElement(c.getString("element", ""));
				else if (op.equals("set")) MakerGauge.set(c.getInt("value", 0));
				else MakerGauge.add(c.getInt("value", 0));
				return true;
			}
			case "spellCharge": {
				MakerSpells.charge = Math.max(0, Math.min(MakerSpells.maxCharge(), MakerSpells.charge + c.getInt("value", 0)));
				com.shatteredpixel.shatteredpixeldungeon.items.Item.updateQuickslot();
				return true;
			}
			case "giveItem": {
				String id = c.getString("item", ""); int n = c.getInt("count", 1);
				if (n > 0) {
					Item it = MakerItem.create(id);
					if (it == null) return true;
					it.quantity(n);
					if (!it.collect()) Dungeon.level.drop(it, Dungeon.hero.pos);
					GLog.i(it.name() + (n > 1 ? " ×" + n : "") + " 획득");
				} else if (n < 0) removeItems(id, -n);
				return true;
			}
			case "tile": {
				final int cell = c.getInt("x", 0) + c.getInt("y", 0) * Dungeon.level.width();
				Level.set(cell, c.getInt("terrain", 1));
				Game.runOnRenderThread(() -> GameScene.updateMap(cell));
				return true;
			}
			case "transfer": {
				int x = c.getInt("x", -1), y = c.getInt("y", -1);
				String nid = c.getString("node", c.getString("extra", ""));
				if (nid.isEmpty() && c.has("depth")) nid = WorldGraph.at(c.getInt("depth", 1), 0);
				int[] w = WorldGraph.whereOf(nid);
				if (w == null) { MakerRuntime.log("맵 이동: 없는 노드 " + nid); return true; }
				int depth = w[0], branch = w[1];
				JsonValue tf = WorldGraph.node(nid);
				InterlevelScene.mode = InterlevelScene.Mode.RETURN;
				InterlevelScene.returnDepth = depth;
				InterlevelScene.returnBranch = branch;
				// 좌표는 직접 그린 맵일 때만 (절차 생성 층은 크기를 미리 모르므로 입구로)
				boolean hand = tf != null && "handmade".equals(tf.getString("mode", ""));
				InterlevelScene.returnPos = (hand && x >= 0 && y >= 0) ? x + y * tf.get("size").getInt("w", 32) : -1;
				Game.switchScene(InterlevelScene.class);
				stack.clear();
				return true;
			}
			// ---------------- 스토리
			case "route": StoryState.route = c.getString("route", "main"); return true;
			case "ending": {
				String id = c.getString("ending", "");
				JsonValue end = id.isEmpty() ? decideEnding() : findEnding(id);
				if (end == null) return true;
				StoryState.ending = end.getString("id", "");
				GLog.h("— " + end.getString("name", "엔딩") + " —");
				JsonValue ev = MakerRuntime.event(end.getString("scene", ""));
				JsonValue page = ev == null ? null : activePage(ev, null);
				stack.clear();
				if (page != null) stack.push(new Frame(page.get("commands"), "list", 0));
				return true;
			}
			case "gameOver": GLog.n(c.getString("text", "")); MakerRuntime.log("(M3 예정) gameOver"); return true;
			case "plugin": return PluginHost.execute(c.getString("command", ""), c, this);
			default:
				if (PluginHost.has(cmd)) return PluginHost.execute(cmd, c, this);
				MakerRuntime.log("알 수 없는 명령: " + cmd);
				return true;
		}
	}

	// ------------------------------------------------------------ 도우미

	/** 대사 보이기. 바로 다음 명령이 선택지면 대사창에 이어서 선택지를 띄움 (RPG Maker 처럼) */
	void showLine(final MakerDialogue.Line l) {
		if (MakerDialogue.classic()) { showClassic(l); return; }
		Frame f = stack.peek();
		JsonValue next = f != null && f.list != null && f.i < f.list.size ? f.list.get(f.i) : null;
		if (next != null && "choice".equals(next.getString("cmd", "")) && next.get("options") != null && next.get("options").size > 0) {
			final JsonValue opts = next.get("options"), branches = next.get("branches");
			f.i++;   // 선택지 명령은 여기서 처리
			l.choices = new String[opts.size];
			for (int i = 0; i < opts.size; i++) l.choices[i] = opts.get(i).asString();
			showWindow(() -> new MakerDialogue.Wnd(l, this::resume, index -> {
				if (branches != null && index < branches.size) stack.push(new Frame(branches.get(index), "list", 0));
				resume();
			}));
			return;
		}
		showWindow(() -> new MakerDialogue.Wnd(l, this::resume, null));
	}
	/** 원작 가운데 창 (대사창 설정 mode = window) */
	void showClassic(final MakerDialogue.Line l) {
		showWindow(() -> {
			Image icon = null;
			JsonValue ch = MakerRuntime.character(l.speaker);
			if (ch != null) icon = new MakerSprite(ch);
			else if (l.speaker.equals("$hero") && Dungeon.hero != null) icon = com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite.avatar(Dungeon.hero);
			return new WndMakerText(icon, l.name, l.text, this::resume);
		});
	}

	static JsonValue findEnding(String id) {
		if (MakerRuntime.story == null || MakerRuntime.story.get("endings") == null) return null;
		for (JsonValue e : MakerRuntime.story.get("endings")) if (id.equals(e.getString("id"))) return e;
		return null;
	}
	/** 우선순위 높은 것부터 조건 검사 */
	static JsonValue decideEnding() {
		if (MakerRuntime.story == null || MakerRuntime.story.get("endings") == null) return null;
		List<JsonValue> list = new ArrayList<>();
		for (JsonValue e : MakerRuntime.story.get("endings")) list.add(e);
		list.sort((a, b) -> b.getInt("priority", 0) - a.getInt("priority", 0));
		for (JsonValue e : list) if (Cond.eval(e.getString("when", ""), StoryState.globalResolver())) return e;
		return null;
	}

	static void removeItems(String id, int n) {
		for (Item it : Dungeon.hero.belongings.backpack.items.toArray(new Item[0])) {
			if (n <= 0) break;
			boolean match = (it instanceof MakerItem && id.equals(((MakerItem) it).makerId))
					|| (id.startsWith("spd:") && it.getClass().getSimpleName().equals(id.substring(4)));
			if (!match) continue;
			int take = Math.min(n, it.quantity());
			for (int i = 0; i < take; i++) it.detach(Dungeon.hero.belongings.backpack);
			n -= take;
		}
	}

	/** 대사 창 — 닫히면 이벤트를 이어서 실행 */
	public static class WndMakerText extends WndTitledMessage {
		private Runnable onClose;
		public WndMakerText(Image icon, String title, String text, Runnable onClose) {
			super(new IconTitle(icon, title), text);
			this.onClose = onClose;
		}
		@Override public void hide() {
			Runnable r = onClose; onClose = null;
			if (r != null) r.run();   // 다음 명령의 창은 다음 프레임에 뜨므로 먼저 이어도 됨
			super.hide();
		}
	}
}
