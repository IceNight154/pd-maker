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
			if (!pageOk(id, p)) continue;
			if (triggerFilter != null) {
				String t = p.getString("trigger", "action");
				boolean mapTrig = triggerFilter.equals("action") || triggerFilter.equals("touch");
				if (mapTrig ? !(t.equals("action") || t.equals("touch")) : !t.equals(triggerFilter)) return null;
			}
			return p;
		}
		return null;
	}
	/** 페이지 출현 조건: 조건식(cond) + 체크한 조건들(conds: 스위치 2개 · 변수 ≥ 값 · 셀프 스위치 · 아이템 소지 · 영웅) 을 모두 만족 */
	public static boolean pageOk(String eventId, JsonValue p) {
		if (!Cond.eval(p.getString("cond", ""), StoryState.globalResolver(eventId))) return false;
		JsonValue q = p.get("conds");
		if (q == null || !q.isObject()) return true;
		String s;
		if (!(s = q.getString("sw1", "")).isEmpty() && !StoryState.sw(s)) return false;
		if (!(s = q.getString("sw2", "")).isEmpty() && !StoryState.sw(s)) return false;
		if (!(s = q.getString("var", "")).isEmpty()) {
			Object v = StoryState.varValue(s);
			if (v instanceof Boolean ? !((Boolean) v) : v instanceof Number ? ((Number) v).intValue() < q.getInt("varMin", 0) : String.valueOf(v).isEmpty()) return false;
		}
		if (!(s = q.getString("self", "")).isEmpty() && !StoryState.self(eventId, s)) return false;
		if (!(s = q.getString("item", "")).isEmpty() && StoryState.itemCount(s) <= 0) return false;
		if (!(s = q.getString("hero", "")).isEmpty() && !s.equals(HeroRuntime.heroId())) return false;
		return true;
	}
	/** 지금 동작하는 페이지 번호 (없으면 -1) */
	public static int pageIndex(JsonValue ev) {
		JsonValue pages = ev == null ? null : ev.get("pages");
		if (pages == null) return -1;
		String id = ev.getString("id", "");
		for (int i = pages.size - 1; i >= 0; i--) if (pageOk(id, pages.get(i))) return i;
		return -1;
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
	/** 실행 중인 이벤트 id (없으면 "") — 연출 상태 표시(MakerCutscene) */
	public static String currentId() { EventInterpreter c = current; return c == null ? "" : c.eventId; }
	/** 새 게임 · 불러오기 때 (StoryState.reset): 이전 게임의 실행 중·대기 중 이벤트를 모두 버림 */
	public static synchronized void reset() {
		if (current != null) { current.dead = true; MakerCamera.eventEnded(current); }   // 취소 · 멈춤 정리: 그 이벤트의 카메라 연출도 정리 (6차)
		for (EventInterpreter q : queue) q.dead = true;
		current = null;
		queue.clear();
		synchronized (carried) { carried.clear(); }
		MakerDialogue.faces.clear();
	}
	/** 멈춘 명령이 기다리는 창·타이머를 알려 줌 (사라졌는데 이어지지 않으면 막힌 것으로 봄) */
	public static void waitingOn(com.watabou.noosa.Gizmo g) {
		EventInterpreter c = current;
		if (c != null) { c.waitOn = g; c.pauseSeq++; }
	}
	static Thread renderThread;
	/** 상태 한 줄 (자동 테스트 tools/playtest Hooks "cutinfo" · 로그용): 실행 중 · 대기열 · 화면 어둡게 · 일러스트 */
	public static String debugState() {
		EventInterpreter c = current;
		return "busy=" + (c != null) + (c != null ? "(" + c.eventId + ")" : "") + " queue=" + queue.size()
				+ " fade=" + (fadeBlock == null || fadeBlock.parent == null ? "none" : String.format(java.util.Locale.ROOT, "%.2f", fadeBlock.alpha())) + " stage=" + MakerStage.debugState();
	}

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

	void start() { current = this; shownOn = Dungeon.level; step(); }
	void finish() {
		if (dead) return;
		current = null;
		MakerCamera.eventEnded(this);   // 6차: 이 이벤트가 연 카메라 연출 정리 (흔들림 멈춤 · 영웅에게 돌아감)
		EventInterpreter next = queue.poll();
		if (next != null) next.start();
	}
	/** 멈춘 명령(창 닫힘, 대기 끝) 다음부터 이어서 — 플러그인도 비동기 처리가 끝나면 호출 */
	public void resume() { if (dead) return; watch = false; waitOn = null; windowMaker = null; pauseSeq++; step(); }

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
		if (rebuilding) return false;   // 화면을 다시 만든 직후 — 창 · 타이머를 새 화면에 옮기는 중
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
	static final java.util.Set<String> UI_WAITS = new java.util.HashSet<>(java.util.Arrays.asList("text", "topic", "choice", "action", "wait", "move", "fade", "illust", "illustMove", "waitInput", "camMove", "camShake", "camReset"));
	/** 이 이벤트의 "대사 스타일" 명령 값 (없으면 null) — 이벤트가 끝나면 사라짐 (다른 이벤트에 넘어가지 않음) */
	JsonValue style;
	/** 대사 한 줄에 스타일: 명령 칸 → 이벤트 스타일 → (없으면 Line 기본값 = 대사창 설정) */
	void styleLine(MakerDialogue.Line l, JsonValue c) {
		String sp = pick(c, "speed"); l.speed = textSpeed(sp);   // 이 줄만 글자 속도 (비우면 대사창 설정)
		String v;
		if (!(v = pick(c, "tracking")).isEmpty()) l.tracking = num(v, Float.NaN);
		if (!(v = pick(c, "lineGap")).isEmpty()) l.lineGap = num(v, Float.NaN);
		if (!(v = pick(c, "effect")).isEmpty()) l.effect = v;
		if (!(v = pick(c, "fxDur")).isEmpty()) l.fxDur = num(v, Float.NaN) / 10f;      // 0.1초
		if (!(v = pick(c, "fxStrength")).isEmpty()) l.fxStrength = num(v, Float.NaN) / 100f;   // %
		if (!(v = pick(c, "fxScope")).isEmpty()) l.fxScope = v;
		if (!(v = pick(c, "size")).isEmpty()) l.sizePct = num(v, Float.NaN);          // 글자 크기 %
		if (!(v = pick(c, "padding")).isEmpty()) l.padding = num(v, Float.NaN);
		if (!(v = pick(c, "align")).isEmpty()) l.align = v;
		if (!(v = pick(c, "emColor")).isEmpty()) l.emColor = v;
		if (!(v = pick(c, "bold")).isEmpty()) l.bold = v.equals("on") || v.equals("true");   // "" = 설정 그대로 · on · off
	}
	String pick(JsonValue c, String k) {
		String v = c.has(k) ? c.getString(k, "") : "";
		if ((v == null || v.isEmpty()) && style != null && style.has(k)) v = style.getString(k, "");
		return v == null ? "" : v;
	}
	static float num(String v, float d) { try { return Float.parseFloat(v); } catch (Exception e) { return d; } }
	/** 대사 글자 속도 (글자/초): "" = 대사창 설정(-1) · instant = 바로 · slow 20 · normal 40 · fast 80 · veryfast 160 · 숫자 */
	static float textSpeed(String v) {
		switch (v) { case "": return -1; case "instant": return 0; case "slow": return 20; case "normal": return 40; case "fast": return 80; case "veryfast": return 160; }
		try { return Math.max(0, Float.parseFloat(v)); } catch (Exception e) { return -1; }
	}
	/** 화면 스레드에서 start 를 한 번 하고, done 이 참이 될 때까지 (프레임마다 확인) 기다렸다가 이어서 — 연출이 끝날 때까지 대기.
	 *  start 가 false(그림이 없음 등)면 기다리지 않고 바로 이어서. 화면이 바뀌어 사라지면 멈춤 감시가 정리 */
	void waitUntil(java.util.function.BooleanSupplier start, java.util.function.BooleanSupplier done) {
		final EventInterpreter self = this;
		Game.runOnRenderThread(() -> {
			renderThread = Thread.currentThread();
			if (self.dead) return;
			boolean ok;
			try { ok = Game.scene() != null && start.getAsBoolean(); } catch (Throwable t) { MakerRuntime.log("연출 명령 오류 (" + eventId + "): " + t); ok = false; }
			if (!ok) { resume(); return; }
			Gizmo poll = new Gizmo() {
				boolean fired;
				@Override public void update() { super.update(); if (!fired && done.getAsBoolean()) { fired = true; active = false; if (parent != null) parent.remove(this); resume(); } }
			};
			attach(poll);
			if (current == self) waitingOn(poll);
		});
	}
	static com.watabou.noosa.ColorBlock fadeBlock;
	static int fadeColor = 0;

	// ------------------------------------------------------------ 창 크기 · 화면 방향이 바뀔 때 (4차)
	// 게임은 창 크기가 바뀌면(PC 창 크기 조절 · 휴대폰 화면 돌림 · 분할 화면) 같은 층의 게임 화면을 새로 만들고, 인자 없이 만들 수 있는 창만 되살림.
	// 예전에는 대사창 · 입력 기다리기 · 타이머 · 일러스트 · 페이드가 모두 사라지고 이벤트가 "실행 중"인 채로 멈췄음(게임에서 확인).
	// 이제: 이벤트가 화면에 붙인 것(attach)은 새 화면으로 옮기고, 페이드 판 · 일러스트는 새 크기로 다시 만들고, 기다리던 창은 같은 내용으로 다시 띄움.
	// 층이 바뀐 경우(층 이동 · 불러오기)는 예전 그대로 (창은 showWindow 가 다음 게임 화면을 기다렸다가 띄움).
	/** 이벤트가 화면에 붙인 타이머 · 대기 · 이동 · 페이드 진행 */
	static final List<Gizmo> carried = new ArrayList<>();
	static void attach(Gizmo g) {
		Game.scene().add(g);
		synchronized (carried) { carried.removeIf(x -> !x.exists || !x.active); carried.add(g); }
	}
	/** 지금 기다리는 창을 다시 만드는 방법 · 그 창을 띄운 층 */
	volatile java.util.function.Supplier<com.shatteredpixel.shatteredpixeldungeon.ui.Window> windowMaker;
	volatile Level shownOn;
	volatile boolean rebuilding;
	/** PixelScene.create 때 (MakerAssets.onSceneCreate) — 같은 층의 게임 화면이 다시 만들어졌으면 다음 프레임에 연출을 옮김 */
	public static void sceneCreated(com.watabou.noosa.Scene s) {
		final EventInterpreter c = current;
		if (c == null || c.dead || !(s instanceof GameScene) || Dungeon.level == null || c.shownOn != Dungeon.level) return;
		c.rebuilding = true;
		Game.runOnRenderThread(() -> c.rebuild(s));
	}
	void rebuild(com.watabou.noosa.Scene s) {
		renderThread = Thread.currentThread();
		try {
			if (dead || current != this || Game.scene() != s) return;
			int moved = 0;
			synchronized (carried) { for (Gizmo g : new ArrayList<>(carried)) if (g.exists && g.active && g.parent == null) { s.add(g); moved++; } }
			if (fadeBlock != null && fadeBlock.parent == null) {
				float a = fadeBlock.alpha();
				fadeBlock = new com.watabou.noosa.ColorBlock(PixelScene.uiCamera.width, PixelScene.uiCamera.height, 0xFF000000 | fadeColor);
				fadeBlock.camera = PixelScene.uiCamera; fadeBlock.alpha(a);
				s.add(fadeBlock);
			}
			int ills = MakerStage.rebuild();
			com.watabou.noosa.Gizmo w = waitOn;
			boolean reshow = windowMaker != null && w instanceof com.shatteredpixel.shatteredpixeldungeon.ui.Window && (w.parent == null || !w.exists);
			MakerRuntime.log("화면 크기가 바뀌어 연출을 새 화면으로 옮겼습니다 (" + eventId + "): 진행 중 " + moved + " · 일러스트 " + ills + (reshow ? " · 창 다시 띄움" : ""));
			if (reshow && w instanceof MakerDialogue.Wnd) ((MakerDialogue.Wnd) w).carryOver();   // 같은 줄이면 나온 글자 · 연출을 이어받음
			if (reshow) { showWindow(windowMaker); return; }   // rebuilding 은 창을 띄운 뒤 풂
		} catch (Throwable t) { MakerRuntime.log("화면이 바뀐 뒤 연출 옮기기 오류 (" + eventId + "): " + t); }
		rebuilding = false;
	}
	/** 캐릭터마다 지금 돌고 있는 이동 경로 (새 경로를 주면 앞의 것을 멈춤) */
	static final java.util.Map<com.shatteredpixel.shatteredpixeldungeon.actors.Char, Gizmo> routes = new java.util.HashMap<>();
	static int parseColor(String s) { try { return Integer.parseInt(s.replace("#", "").trim(), 16) & 0xFFFFFF; } catch (Exception e) { return 0; } }
	/** 이 맵에 있는 캐릭터 (프로젝트 캐릭터 id) */
	static com.shatteredpixel.shatteredpixeldungeon.actors.Char findChar(String id) {
		if (Dungeon.level == null || id == null) return null;
		JsonValue d = MakerRuntime.character(id); String game = d == null ? "" : d.getString("game", "");
		for (Mob m : Dungeon.level.mobs) {
			if (m instanceof MakerNPC && ((MakerNPC) m).charId.equals(id)) return m;
			if (m instanceof MakerMob && ((MakerMob) m).charId.equals(id)) return m;
			if (!game.isEmpty() && (game.equals(m.getClass().getSimpleName()) || game.endsWith("." + m.getClass().getSimpleName()))) return m;
		}
		return null;
	}
	/** 이벤트로 죽었을 때의 사인 (랭킹 · 사망 창) */
	public static class Death {
		final String text;
		Death(String t) { text = t; }
		@Override public String toString() { return text == null || text.isEmpty() ? "이벤트" : text; }
	}

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
			catch (Throwable t) { MakerRuntime.log("대사·선택지 창을 띄우지 못했습니다 (" + eventId + "): " + t); self.rebuilding = false; self.resume(); return; }
			self.windowMaker = make; self.shownOn = Dungeon.level;
			if (current == self) waitingOn(w);
			self.rebuilding = false;
		});
	}

	/** true = 바로 다음 명령으로, false = 멈춤 (나중에 resume) */
	boolean exec(JsonValue c) {
		String cmd = c.getString("cmd", "");
		switch (cmd) {
			// ---------------- 메시지
			case "text": {
				MakerDialogue.Line l = MakerDialogue.line(c.getString("speaker", ""), c.getString("face", ""), c.getString("illust", ""), StoryState.expand(c.getString("text", "")));
				if (!c.getString("name", "").isEmpty()) l.name = c.getString("name", "");
				if (!c.getString("side", "").isEmpty()) l.side = c.getString("side", "");
				styleLine(l, c);   // 글자 속도 · 간격 · 줄 간격 · 연출: 이 줄 → 이 이벤트의 "대사 스타일" → 대사창 설정 (5차)
				l.auto = Math.max(0, c.getInt("auto", 0)) / 10f;  // 다 보인 뒤 저절로 넘기기 (0.1초, 0 = 입력 기다림)
				showLine(l);
				return false;
			}
			case "textStyle": {   // 대사 스타일 (5차): 이 이벤트의 남은 대사에 — 빈 칸은 대사창 설정 그대로. reset = 대사창 설정으로 되돌림
				if (c.getBoolean("reset", false)) style = null;
				else style = c;   // 명령 자체를 기억 (이벤트 데이터 — 실행하는 동안 그대로)
				return true;
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
				for (int i = 0; i < labels.length; i++) labels[i] = StoryState.expand(opts.get(i).asString());
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
				String t = StoryState.expand(c.getString("text", "")), col = c.getString("color", "normal");
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
					attach(timer);
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
			case "global": MakerDrops.setGlobal(c.getString("key", ""), c.getBoolean("value", true)); return true;
			case "switch": StoryState.setSw(c.getString("id", ""), c.getBoolean("value", false)); return true;
			case "var": {
				String id = c.getString("id", ""); String vt = StoryState.varType(id);
				if (vt.equals("string")) {   // 문자열 변수: = 바꾸기 · += 뒤에 붙이기 ("다른 값"이면 그 값을 글자로)
					String tx = StoryState.expand(c.getString("text", ""));
					if (c.getString("src", "").equals("ref")) { Object o = resolver().get(c.getString("ref", "").trim()); tx = o == null ? "" : String.valueOf(o); }
					else if (tx.isEmpty() && c.has("value") && c.getInt("value", 0) != 0) tx = String.valueOf(c.getInt("value", 0));
					StoryState.setStr(id, c.getString("op", "set").equals("add") ? StoryState.str(id) + tx : tx);
					return true;
				}
				if (vt.equals("bool")) {   // 참/거짓 변수: 켜기 · 끄기 · 뒤집기 ("다른 값"이면 그 값이 참인지)
					String bop = c.getString("op", "set"); boolean nv;
					if (bop.equals("toggle")) nv = StoryState.var(id) == 0;
					else if (c.getString("src", "").equals("ref")) { Object o = resolver().get(c.getString("ref", "").trim()); nv = o instanceof Boolean ? (Boolean) o : o instanceof Number ? ((Number) o).intValue() != 0 : o != null && !String.valueOf(o).isEmpty(); }
					else nv = c.getInt("value", 0) != 0 || "true".equalsIgnoreCase(c.getString("text", ""));
					StoryState.setVar(id, nv ? 1 : 0);
					return true;
				}
				int v = StoryState.var(id), x = c.getInt("value", 0);
				String src = c.getString("src", "");
				if (src.equals("rand")) x = com.watabou.utils.Random.IntRange(Math.min(c.getInt("min", 0), x), Math.max(c.getInt("min", 0), x));
				else if (src.equals("ref")) { Object o = resolver().get(c.getString("ref", "").trim()); x = o instanceof Number ? ((Number) o).intValue() : o instanceof Boolean ? ((Boolean) o ? 1 : 0) : 0; }
				switch (c.getString("op", "set")) {
					case "add": v += x; break; case "sub": v -= x; break; case "mul": v *= x; break;
					case "div": if (x != 0) v /= x; break; case "mod": if (x != 0) v %= x; break; default: v = x;
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
			case "effect": {   // 이펙트 재생 (MakerEffect): at = char(대상 캐릭터 위치) | xy(칸 좌표)
				String fid = c.getString("fx", "");
				if ("xy".equals(c.getString("at", "char"))) { if (Dungeon.level != null) MakerEffect.playAt(fid, c.getInt("x", 0) + c.getInt("y", 0) * Dungeon.level.width()); return true; }
				String tg = c.getString("target", "$hero");
				if (tg.isEmpty() || tg.equals("$hero")) { MakerEffect.playOn(fid, Dungeon.hero); return true; }
				String ch = charArg(c, "target");
				if (Dungeon.level != null) for (Mob m : Dungeon.level.mobs) {
					String id = m instanceof MakerNPC ? ((MakerNPC) m).charId : m instanceof MakerMob ? ((MakerMob) m).charId : null;
					if (ch.equals(id)) { MakerEffect.playOn(fid, m); break; }
				}
				return true;
			}
			case "textfx": {   // 글자 연출 표시 (MakerTextFx)
				final String fid = c.getString("fx", ""), fpos = c.getString("pos", "center");
				final float fwid = c.getFloat("width", 80f); final int floops = c.getInt("loops", 1);
				final boolean fwait = !c.getBoolean("nowait", false);
				final EventInterpreter self = this;
				Game.runOnRenderThread(() -> {
					renderThread = Thread.currentThread();
					MakerTextFx g = MakerTextFx.show(fid, fpos, fwid, floops, fwait ? () -> resume() : null);
					if (!fwait) return;
					if (g == null) resume(); else if (current == self) waitingOn(g);
				});
				return !fwait;
			}
			case "quest": {   // 퀘스트: 수주 창 · 바로 수락 · 완료 처리 · 포기
				final String qid = c.getString("id", ""); String op = c.getString("op", "offer");
				if (op.equals("accept")) { MakerQuests.accept(qid); return true; }
				if (op.equals("complete")) { MakerQuests.complete(qid); return true; }
				if (op.equals("abandon")) { MakerQuests.abandon(qid); return true; }
				if (op.equals("reset")) { MakerQuests.setState(qid, 0); return true; }
				MakerQuests.offer(qid, this::resume);
				return false;
			}
			case "questLog": MakerQuests.showLog(); return true;
			case "shop": {   // 상인 창 열기 (닫을 때까지 기다림)
				String sc = c.getString("char", ""); if (sc.isEmpty() || sc.equals("$this")) sc = ctxChar == null ? "" : ctxChar;
				MakerShop.open(sc, this::resume);
				return false;
			}
			case "badge": MakerBadges.give(c.getString("id", "")); return true;   // 배지 주기
			case "badgeList": MakerBadges.showList(); return true;                 // 내 배지 목록 창
			case "trailer": {   // 예고편 컷신 재생 (MakerTrailer)
				final String tid = c.getString("id", ""); final boolean twait = !c.getBoolean("nowait", false);
				final EventInterpreter self = this;
				Game.runOnRenderThread(() -> {
					renderThread = Thread.currentThread();
					MakerTrailer g = MakerTrailer.show(tid, twait ? () -> resume() : null);
					if (!twait) return;
					if (g == null) resume(); else if (current == self) waitingOn(g);
				});
				return !twait;
			}
			case "filter": { String m = c.getString("mode", "set"); MakerFilter.set(m.equals("map") ? "" : m.equals("off") ? "-" : c.getString("id", "")); return true; }   // 화면 필터: id · "" = 맵 설정대로 · "-" = 끄기
			case "shake": if (MakerCompat.invoke(PixelScene.class, "shake", c.getInt("power", 3), c.getInt("time", 5) / 10f) == MakerCompat.NONE && com.watabou.noosa.Camera.main != null) com.watabou.noosa.Camera.main.shake(c.getInt("power", 3), c.getInt("time", 5) / 10f); return true;
			case "flash": {
				String hex = c.getString("color", "#ffffff").replace("#", "");
				int col; try { col = Integer.parseInt(hex, 16); } catch (Exception e) { col = 0xFFFFFF; }
				final int fc = col;
				Game.runOnRenderThread(() -> GameScene.flash(fc));
				return true;
			}
			case "sound": {
				String kind = c.getString("kind", "se");
				if ("bgmStop".equals(kind)) { final float sec = Math.max(0, c.getInt("fade", 0)) / 10f; Game.runOnRenderThread(() -> MakerAudio.stopBgm(sec)); return true; }   // 배경음 끄기 (페이드 아웃)
				String file = c.getString("file", "");
				if (file.isEmpty()) { MakerRuntime.log("효과음/음악: 소리를 고르지 않아 건너뜀 (" + eventId + ")"); return true; }
				if ("bgm".equals(kind)) MakerAudio.playBgm(file);
				else MakerAudio.playSe(file);
				return true;
			}
			case "illust": {   // 일러스트 표시: 번호 · 그림 · 위치 · 페이드 + 크기 % · 불투명도 % · 옮기기 px · 뒤집기 · 끝날 때까지 대기
				final int slot = c.getInt("slot", 1); final String img = c.getString("image", ""), pos = c.getString("pos", "center");
				final float fade = c.getInt("fade", 3) / 10f, scale = c.getFloat("scale", 100) / 100f, alpha = c.getFloat("alpha", 100) / 100f;
				final float ox = c.getFloat("ox", 0), oy = c.getFloat("oy", 0); final boolean flip = c.getBoolean("flip", false), wait = c.getBoolean("wait", false);
				if (!wait) { Game.runOnRenderThread(() -> MakerStage.show(slot, img, pos, fade, scale, alpha, ox, oy, flip)); return true; }
				waitUntil(() -> MakerStage.show(slot, img, pos, fade, scale, alpha, ox, oy, flip), () -> MakerStage.idle(slot));
				return false;
			}
			case "illustMove": {   // 일러스트 움직이기: 그 번호의 그림을 time 동안 목표 자리 · 크기 · 불투명도로 (비운 값은 그대로)
				final int slot = c.getInt("slot", 1); final String pos = c.getString("pos", "");
				final float sec = Math.max(0, c.getInt("time", 5)) / 10f;
				final float scale = c.getFloat("scale", 0) > 0 ? c.getFloat("scale", 0) / 100f : -1f;                      // 0 · 없음 = 크기 그대로
				final float alpha = c.has("alpha") && c.get("alpha").isNumber() ? c.getFloat("alpha") / 100f : -1f;         // 없음 = 불투명도 그대로 (0 = 안 보이게)
				final float ox = c.getFloat("ox", 0), oy = c.getFloat("oy", 0); final boolean wait = c.getBoolean("wait", true);
				if (!wait) { Game.runOnRenderThread(() -> MakerStage.move(slot, pos, ox, oy, scale, alpha, sec)); return true; }
				waitUntil(() -> MakerStage.move(slot, pos, ox, oy, scale, alpha, sec), () -> MakerStage.idle(slot));
				return false;
			}
			case "camMove": case "camFollow": case "camShake": case "camReset": {   // 스크린 · 카메라 연출 (6차 — MakerCamera)
				final JsonValue cc = c; final EventInterpreter self = this;
				final java.util.function.BooleanSupplier[] done = new java.util.function.BooleanSupplier[1];
				boolean wait = c.getBoolean("wait", true) && !cmd.equals("camFollow");
				if (!wait) { Game.runOnRenderThread(() -> { if (!self.dead) MakerCamera.exec(self, cc); }); return true; }
				waitUntil(() -> { done[0] = MakerCamera.exec(self, cc); return done[0] != null; }, () -> done[0] == null || done[0].getAsBoolean());
				return false;
			}
			case "waitInput": {   // 입력 기다리기: 화면을 누르거나 확인 키 (보이는 창 없음)
				showWindow(() -> new MakerDialogue.WaitWnd(this::resume));
				return false;
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
				if (MakerRuntime.character(ch) == null || Dungeon.level == null || MakerRuntime.charOff(ch)) return true;
				int cell = c.getInt("x", 0) + c.getInt("y", 0) * Dungeon.level.width();
				final Mob gm = LevelHooks.gameChar(ch);
				if (gm != null) { gm.pos = cell; Game.runOnRenderThread(() -> GameScene.add(gm)); return true; }
				final MakerNPC npc = MakerNPC.create(ch);
				npc.pos = cell;
				Game.runOnRenderThread(() -> GameScene.add(npc));
				return true;
			}
			case "relocate": {   // NPC 이주: 지정한 맵의 지정한 칸에서 살게 함 (맵을 비우면 사라짐)
				String rc = c.getString("char", ""); if (rc.isEmpty() || rc.equals("$this")) rc = ctxChar == null ? "" : ctxChar;
				MakerHomes.move(rc, c.getString("node", ""), c.getInt("x", -1), c.getInt("y", -1));
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
			case "party": { String ch = charArg(c, "char"); EventTriggers.setParty(ch, c.getBoolean("join", true)); return true; }
			case "move": {   // 이동 경로 설정 (RPG Maker 식): route = [{op, …}] 를 차례로. 예전 방식 path = "3,4 5,4" (칸 좌표로 걸어가기)도 됨
				String who = c.getString("char", "$hero");
				final com.shatteredpixel.shatteredpixeldungeon.actors.Char ch = who.isEmpty() || who.equals("$hero") ? Dungeon.hero : findChar(who);
				if (ch == null || Dungeon.level == null) { MakerRuntime.log("이동 경로: 이 맵에 없는 캐릭터 " + who); return true; }
				final ArrayList<JsonValue> ops = new ArrayList<>();
				if (c.get("route") != null) for (JsonValue o : c.get("route")) ops.add(o);
				for (String pt : c.getString("path", "").trim().split("\\s+")) {
					String[] xy = pt.split(",");
					if (xy.length != 2) continue;
					try { JsonValue o = new JsonValue(JsonValue.ValueType.object); o.addChild("op", new JsonValue("goto")); o.addChild("x", new JsonValue(Long.parseLong(xy[0].trim()))); o.addChild("y", new JsonValue(Long.parseLong(xy[1].trim()))); ops.add(o); } catch (NumberFormatException ignored) { }
				}
				if (ops.isEmpty()) return true;
				final boolean repeat = c.getBoolean("repeat", false), skip = c.getBoolean("skip", false);
				final boolean wait = !repeat && c.getBoolean("wait", true);
				final EventInterpreter self = this;
				Game.runOnRenderThread(() -> {
					renderThread = Thread.currentThread();
					if (Game.scene() == null) { if (wait) resume(); return; }
					Gizmo old = routes.remove(ch);   // 같은 캐릭터의 앞선 (반복) 경로는 멈춤
					if (old != null) { old.active = false; if (old.parent != null) old.parent.remove(old); }
					Gizmo walker = new Gizmo() {
						int idx = 0, stuck = 0, dx = 0, dy = 1; float left = 0, step = 0.13f; boolean done, through, dirFix;
						void end() { if (done) return; done = true; active = false; routes.remove(ch, this); if (parent != null) parent.remove(this); if (wait) resume(); }
						boolean free(int cell) {
							return cell >= 0 && cell < Dungeon.level.length() && (through || Dungeon.level.passable[cell]) && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(cell) == null;
						}
						void go(int dest) {
							int oldPos = ch.pos, w = Dungeon.level.width();
							int ndx = Integer.signum(dest % w - oldPos % w), ndy = Integer.signum(dest / w - oldPos / w);
							if (ndx != 0 || ndy != 0) { dx = ndx; dy = ndy; }
							boolean flip = ch.sprite != null && ch.sprite.flipHorizontal;
							ch.move(dest);
							if (ch.sprite != null) { ch.sprite.move(oldPos, ch.pos); if (dirFix) ch.sprite.flipHorizontal = flip; }
							if (ch == Dungeon.hero) { Dungeon.observe(); GameScene.updateFog(); }
						}
						/** 한 걸음. true = 이 명령 끝 (다음으로) */
						boolean tryStep(int ddx, int ddy) {
							int w = Dungeon.level.width(), x = ch.pos % w + ddx, y = ch.pos / w + ddy;
							int dest = x < 0 || x >= w ? -1 : x + y * w;
							if (free(dest)) { stuck = 0; go(dest); return true; }
							if (skip || ++stuck > 25) { stuck = 0; return true; }   // 못 가면: 건너뛰기 옵션이면 바로, 아니면 잠깐 기다렸다가 넘어감
							return false;
						}
						void face(int ddx) { if (ddx != 0 && ch.sprite != null && !dirFix) ch.sprite.flipHorizontal = ddx < 0; if (ddx != 0) dx = ddx; }
						@Override public void update() {
							super.update();
							left -= Game.elapsed; if (left > 0 || done) return;
							left = step;
							try {
								if (!ch.isAlive() || Dungeon.level == null || (ch != Dungeon.hero && !Dungeon.level.mobs.contains(ch))) { end(); return; }
								for (int guard = 0; guard < 60; guard++) {
									if (idx >= ops.size()) { if (repeat) { idx = 0; return; } end(); return; }
									JsonValue o = ops.get(idx);
									String op = o.getString("op", "");
									int w = Dungeon.level.width(), hx = Dungeon.hero.pos % w - ch.pos % w, hy = Dungeon.hero.pos / w - ch.pos / w;
									switch (op) {
										// ---- 이동 (한 걸음 걷고 다음 틱으로)
										case "down": if (tryStep(0, 1)) idx++; return;
										case "up": if (tryStep(0, -1)) idx++; return;
										case "left": if (tryStep(-1, 0)) idx++; return;
										case "right": if (tryStep(1, 0)) idx++; return;
										case "dl": if (tryStep(-1, 1)) idx++; return;
										case "dr": if (tryStep(1, 1)) idx++; return;
										case "ul": if (tryStep(-1, -1)) idx++; return;
										case "ur": if (tryStep(1, -1)) idx++; return;
										case "random": { int[] d = com.watabou.utils.PathFinder.NEIGHBOURS8; int o2 = d[com.watabou.utils.Random.Int(d.length)]; int nx = (ch.pos + o2) % w - ch.pos % w, ny = (ch.pos + o2) / w - ch.pos / w; if (Math.abs(nx) > 1) { idx++; return; } if (tryStep(nx, ny) || true) idx++; stuck = 0; return; }
										case "toward": if (ch == Dungeon.hero || (Math.abs(hx) <= 1 && Math.abs(hy) <= 1) || tryStep(Integer.signum(hx), Integer.signum(hy))) idx++; return;
										case "away": if (ch == Dungeon.hero || tryStep(-Integer.signum(hx), -Integer.signum(hy))) idx++; return;
										case "forward": if (tryStep(dx, dy)) idx++; return;
										case "backward": { int kx = dx, ky = dy; boolean ok = tryStep(-dx, -dy); dx = kx; dy = ky; if (ok) idx++; return; }
										case "goto": {   // 칸 좌표까지 길을 찾아 걸어감 (여러 걸음)
											int target = o.getInt("x", 0) + o.getInt("y", 0) * w;
											if (ch.pos == target || target < 0 || target >= Dungeon.level.length()) { idx++; stuck = 0; continue; }
											boolean[] all = new boolean[Dungeon.level.length()]; java.util.Arrays.fill(all, true);
											int st = Dungeon.findStep(ch, target, Dungeon.level.passable, all, true);
											if (st == -1) { if (skip || ++stuck > 8) { idx++; stuck = 0; } return; }
											stuck = 0; go(st); return;
										}
										case "jump": {   // 지금 자리에서 (x, y) 만큼 뛰어 넘음
											int x = ch.pos % w + o.getInt("x", 0), y = ch.pos / w + o.getInt("y", 0), dest = x < 0 || x >= w ? -1 : x + y * w;
											idx++;
											if (dest != ch.pos && free(dest)) {
												int oldPos = ch.pos; ch.pos = dest; Dungeon.level.occupyCell(ch);
												if (ch.sprite != null) ch.sprite.jump(oldPos, dest, () -> { });
												if (ch == Dungeon.hero) { Dungeon.observe(); GameScene.updateFog(); }
												left = 0.3f;
											}
											return;
										}
										case "wait": idx++; left = Math.max(0.01f, o.getInt("n", 10) / 10f); return;
										// ---- 방향 (그림은 왼쪽/오른쪽만 뒤집힘)
										case "turnLeft": face(-1); dy = 0; break;
										case "turnRight": face(1); dy = 0; break;
										case "turnDown": dx = 0; dy = 1; break;
										case "turnUp": dx = 0; dy = -1; break;
										case "turn180": face(-dx); dy = -dy; break;
										case "turnR90": { int t = dx; dx = -dy; dy = t; face(dx); break; }
										case "turnL90": { int t = dx; dx = dy; dy = -t; face(dx); break; }
										case "turnRandom": face(com.watabou.utils.Random.Int(2) == 0 ? -1 : 1); break;
										case "turnToward": if (ch != Dungeon.hero) { dy = Integer.signum(hy); if (hx != 0) face(Integer.signum(hx)); else dx = 0; } break;
										case "turnAway": if (ch != Dungeon.hero) { dy = -Integer.signum(hy); if (hx != 0) face(-Integer.signum(hx)); else dx = 0; } break;
										// ---- 설정
										case "switchOn": StoryState.setSw(o.getString("id", ""), true); break;
										case "switchOff": StoryState.setSw(o.getString("id", ""), false); break;
										case "speed": { float[] sp = { 0.5f, 0.32f, 0.2f, 0.13f, 0.08f, 0.04f }; step = sp[Math.max(1, Math.min(6, o.getInt("n", 4))) - 1]; break; }
										case "throughOn": through = true; break;
										case "throughOff": through = false; break;
										case "dirFixOn": dirFix = true; break;
										case "dirFixOff": dirFix = false; break;
										case "transparentOn": if (ch.sprite != null) ch.sprite.alpha(0f); break;
										case "transparentOff": if (ch.sprite != null) ch.sprite.alpha(1f); break;
										case "opacity": if (ch.sprite != null) ch.sprite.alpha(Math.max(0, Math.min(255, o.getInt("n", 255))) / 255f); break;
										case "se": MakerAudio.playSe(o.getString("file", "")); break;
										default: break;
									}
									idx++;   // 시간이 들지 않는 명령은 바로 다음으로
								}
							} catch (Throwable t) { MakerRuntime.log("이동 경로 오류: " + t); end(); }
						}
					};
					attach(walker);
					routes.put(ch, walker);
					if (wait && current == self) waitingOn(walker);
				});
				return !wait;
			}
			case "teleport": {   // 같은 맵 안에서 순간 이동 (영웅 또는 캐릭터)
				String who = c.getString("char", "$hero");
				final com.shatteredpixel.shatteredpixeldungeon.actors.Char ch = who.isEmpty() || who.equals("$hero") ? Dungeon.hero : findChar(who);
				if (ch == null || Dungeon.level == null) return true;
				final int cell = c.getInt("x", 0) + c.getInt("y", 0) * Dungeon.level.width();
				if (cell < 0 || cell >= Dungeon.level.length() || com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(cell) != null) return true;
				Game.runOnRenderThread(() -> {
					try {
						com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfTeleportation.appear(ch, cell);
						Dungeon.level.occupyCell(ch);
						if (ch == Dungeon.hero) { Dungeon.observe(); GameScene.updateFog(); }
					} catch (Throwable t) { MakerRuntime.log("순간 이동 오류: " + t); }
				});
				return true;
			}
			// ---------------- 영웅 상태 (RPG Maker 의 소지금 · HP · 상태 · 경험치)
			case "gold": {
				int n = c.getInt("value", 0);
				Dungeon.gold = Math.max(0, Dungeon.gold + n);
				if (n != 0 && !c.getBoolean("quiet", false)) GLog.i("금화 " + (n > 0 ? "+" : "") + n);
				return true;
			}
			case "hp": {
				com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hr = Dungeon.hero;
				if (hr == null) return true;
				String op = c.getString("op", "add"); int v = c.getInt("value", 0);
				if (op.equals("full")) v = hr.HT; else if (op.equals("pct")) v = Math.round(hr.HT * v / 100f);
				int hp = op.equals("set") ? v : hr.HP + v;
				if (hp <= 0 && c.getBoolean("kill", false)) { hr.HP = 0; stack.clear(); com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero.reallyDie(new Death(c.getString("text", ""))); return true; }
				final int nv = Math.max(1, Math.min(hr.HT, hp)), diff = nv - hr.HP;
				hr.HP = nv;
				Game.runOnRenderThread(() -> { if (hr.sprite != null && diff != 0) hr.sprite.showStatus(diff > 0 ? com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite.POSITIVE : com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite.NEGATIVE, (diff > 0 ? "+" : "") + diff); });
				return true;
			}
			case "buff": {
				String who = c.getString("char", "$hero");
				com.shatteredpixel.shatteredpixeldungeon.actors.Char ch = who.isEmpty() || who.equals("$hero") ? Dungeon.hero : findChar(who);
				if (ch == null) return true;
				String name = c.getString("buff", "");
				if (c.getBoolean("remove", false)) {
					for (com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff b : ch.buffs().toArray(new com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff[0]))
						if (b.getClass().getSimpleName().equalsIgnoreCase(name)) b.detach();
				} else MakerCast.addBuff(ch, name, Math.max(1, c.getInt("turns", 5)));
				return true;
			}
			case "exp": {
				com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hr = Dungeon.hero;
				if (hr == null) return true;
				String op = c.getString("op", "exp"); int v = c.getInt("value", 0);
				if (op.equals("level")) { for (int i = 0; i < v && hr.lvl < 30; i++) hr.earnExp(hr.maxExp() - hr.exp, getClass()); }
				else if (op.equals("str")) { hr.STR = Math.max(1, hr.STR + v); GLog.p("힘 " + (v >= 0 ? "+" : "") + v); }
				else if (op.equals("maxhp")) { hr.HT = Math.max(1, hr.HT + v); hr.HP = Math.max(1, Math.min(hr.HT, hr.HP + Math.max(0, v))); }
				else if (v > 0) hr.earnExp(v, getClass());
				return true;
			}
			// ---------------- 흐름: 이름표로 건너뛰기
			case "label": return true;
			case "jump": {
				String name = c.getString("name", "");
				java.util.Iterator<Frame> it = stack.iterator();
				int depth = 0;
				while (it.hasNext()) {
					Frame f = it.next();
					if (f.list != null) for (int i = 0; i < f.list.size; i++) {
						JsonValue x = f.list.get(i);
						if ("label".equals(x.getString("cmd", "")) && name.equals(x.getString("name", ""))) {
							for (int k = 0; k < depth; k++) stack.pop();
							f.i = i + 1;
							return true;
						}
					}
					depth++;
				}
				MakerRuntime.log("건너뛰기: 이름표 「" + name + "」 을 찾지 못했습니다 (" + eventId + ")");
				return true;
			}
			// ---------------- 화면 어둡게 / 밝게
			case "fade": {
				final boolean out = !c.getString("op", "out").equals("in");
				final float sec = Math.max(0.01f, c.getInt("time", 5) / 10f);
				final int color = parseColor(c.getString("color", "#000000"));
				final boolean wait = c.getBoolean("wait", true);
				final EventInterpreter self = this;
				Game.runOnRenderThread(() -> {
					renderThread = Thread.currentThread();
					if (Game.scene() == null) { if (wait) resume(); return; }
					if (fadeBlock == null || fadeBlock.parent != Game.scene()) {
						if (!out) { if (wait) resume(); return; }   // 어둡게 한 적이 없으면 밝게 할 것도 없음
						fadeColor = color;
						fadeBlock = new com.watabou.noosa.ColorBlock(PixelScene.uiCamera.width, PixelScene.uiCamera.height, 0xFF000000 | color);
						fadeBlock.camera = PixelScene.uiCamera; fadeBlock.alpha(0);
						Game.scene().add(fadeBlock);
					}
					final com.watabou.noosa.ColorBlock blk = fadeBlock;
					final float from = blk.alpha();
					Gizmo tw = new Gizmo() {
						float t = 0; boolean done;
						@Override public void update() {
							super.update(); if (done) return;
							t += Game.elapsed; float k = Math.min(1f, t / sec);
							// 창 크기가 바뀌어 화면을 다시 만들면 페이드 판도 새로 만들어짐(rebuild) — 지금 판을 씀
							com.watabou.noosa.ColorBlock b = fadeBlock != null && fadeBlock.parent != null ? fadeBlock : blk;
							b.alpha(out ? from + (1f - from) * k : from * (1f - k));
							if (k >= 1f) { done = true; active = false; if (!out) { b.killAndErase(); if (fadeBlock == b) fadeBlock = null; } if (parent != null) parent.remove(this); if (wait) resume(); }
						}
					};
					attach(tw);
					if (wait && current == self) waitingOn(tw);
				});
				return !wait;
			}
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
			case "gameOver": {   // 영웅 사망 처리 (부활 없이) → 게임의 사망 화면
				String text = c.getString("text", "");
				if (!text.isEmpty()) GLog.n(text);
				stack.clear();
				if (Dungeon.hero != null) { Dungeon.hero.HP = 0; com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero.reallyDie(new Death(text)); }
				return true;
			}
			case "title": {   // 타이틀로 (저장하고 나가기 — 이어 하기 가능)
				stack.clear();
				Game.runOnRenderThread(() -> {
					try { Dungeon.saveAll(); } catch (Throwable t) { MakerRuntime.log("저장 실패: " + t); }
					Game.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.TitleScene.class);
				});
				return true;
			}
			case "victory": {   // 게임 클리어: 승리 기록을 남기고 랭킹 화면으로 (세이브는 지워짐)
				stack.clear();
				Game.runOnRenderThread(() -> {
					try {
						Dungeon.win(com.shatteredpixel.shatteredpixeldungeon.items.Amulet.class);
						Dungeon.deleteGame(com.shatteredpixel.shatteredpixeldungeon.GamesInProgress.curSlot, true);
					} catch (Throwable t) { MakerRuntime.log("승리 처리 오류: " + t); }
					Game.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.RankingsScene.class);
				});
				return true;
			}
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
			else if (l.speaker.equals("$hero") && Dungeon.hero != null) icon = heroAvatar();
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
	/** 영웅 얼굴 (HeroSprite.avatar(Hero) — 예전 판은 avatar(직업, 갑옷 단계)) */
	public static Image heroAvatar() {
		Object v = MakerCompat.invoke(com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite.class, "avatar", Dungeon.hero);
		if (v == MakerCompat.NONE) v = MakerCompat.invoke(com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite.class, "avatar", Dungeon.hero.heroClass, Dungeon.hero.tier());
		return v instanceof Image ? (Image) v : null;
	}
}
