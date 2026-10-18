/*
 * 게임 UI 테마 = 프로젝트의 인게임 UI 스프라이트 스킨 (6차 — 사용자 요청: chrome.png · status_pane.png 같은 게임 UI 그림)
 *
 *   스킨 그림: 프로젝트의 assets/game/interfaces/*.png (편집기 「UI 그림」에서 바꿈 — MakerAssets 가 게임 그림 자리에 넣음).
 *     없으면 원작 그림. 원작 창 · 버튼 · 도구 모음 · 상태 판은 원래 이 그림을 씀.
 *   PDMaker 가 더하는 UI 도 같은 스킨으로: 대사창 · 이름표 · 선택지 · 연출 배속 표시줄이 chrome.png 의 9조각(Chrome.Type)으로 그려짐.
 *     어느 조각을 쓸지 = theme.json "skin" (UI 마다, 비우면 아래 기본). 예전 프로젝트(theme.json 없음 · 대사창 값이 들어 있음)는 그대로.
 *   우선순위: ① UI 요소에 직접 정한 값(대사 한 줄의 강조 색 · 대사창의 "그림" 모양) → ② UI 묶음 설정(dialogue.json — 빈 칸 = 테마)
 *            → ③ 테마(theme.json: 쓸 조각 · 글자 색) → ④ 원작 스프라이트 · 원작 글자 색
 *   글자 색(스프라이트로 정할 수 없는 것만): text textDim accent warn error good shadow — 기본 = 원작 값.
 *   실행 중 다시 읽기: theme.json 이 바뀌면(1초마다 수정 시각) version 이 올라가고 다음에 그리는 창 · 배속 표시줄부터 새 값.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Group;
import com.watabou.noosa.NinePatch;

public class MakerTheme {

	/** 글자 색 기본 = 원작 (Window.TITLE_COLOR 0xFFFF44 · 회색 0x888888 · 경고 0xCC6666 …) — 편집기 PDM.gameTheme.DEFAULT.colors 와 같음 */
	static final String[][] DEF = {
		{ "text", "#ffffff" }, { "textDim", "#888888" }, { "accent", "#ffff44" },
		{ "warn", "#ff8800" }, { "error", "#cc6666" }, { "good", "#44ff44" }, { "shadow", "#000000" } };
	/** UI 마다 쓸 chrome.png 조각 기본 — 편집기 PDM.gameTheme.DEFAULT.skin 과 같음 */
	static final String[][] SKIN = {
		{ "box", "WINDOW" }, { "name", "TOAST_TR" }, { "choice", "GREY_BUTTON_TR" }, { "choiceOn", "RED_BUTTON" },
		{ "bar", "TOAST_TR" }, { "barBtn", "GREY_BUTTON_TR" }, { "barBtnOn", "RED_BUTTON" } };
	static JsonValue data;
	static long stamp = -1, checkedAt;
	public static int version;

	/** theme.json 을 (바뀌었으면) 다시 읽음 — 실제 시간 1초에 한 번만 파일 시각을 봄 */
	static void refresh() {
		long now = System.currentTimeMillis();
		if (stamp != -1 && now - checkedAt < 1000) return;
		checkedAt = now;
		try {
			FileHandle f = MakerRuntime.projectFile("theme.json");
			long m = f != null && f.exists() ? f.lastModified() : 0;
			if (m == stamp) return;
			stamp = m;
			data = m == 0 ? null : new JsonReader().parse(f);
			version++;
			if (m != 0) MakerRuntime.log("게임 UI 테마: " + (data == null ? "기본" : data.getString("name", "프로젝트 스킨")));
		} catch (Throwable t) { MakerRuntime.log("게임 UI 테마(theme.json)를 읽지 못했습니다 — 원작 그대로: " + t); data = null; stamp = 0; }
	}
	/** 프로젝트에 테마 파일이 있는지 (없으면 글자 색 = 원작 · 예전 모습) */
	public static boolean present() { refresh(); return data != null; }

	/** 글자 색 토큰 (0xRRGGBB) */
	public static int c(String token) {
		refresh();
		String def = "#ffffff";
		for (String[] d : DEF) if (d[0].equals(token)) { def = d[1]; break; }
		JsonValue col = data == null ? null : data.get("colors");
		String v = col != null ? col.getString(token, "") : "";
		return MakerTitle.color(v.isEmpty() ? def : v, MakerTitle.color(def, 0xFFFFFF));
	}
	/** 테마가 있으면 그 글자 색, 없으면 그 자리에서 예전에 쓰던 색 그대로 */
	public static int or(String token, int legacy) { return present() ? c(token) : legacy; }
	public static String hex(String token) { return String.format("#%06x", c(token)); }

	/** UI 에 쓸 chrome.png 조각 (잘못된 이름이면 기본) */
	public static Chrome.Type skin(String ui) {
		refresh();
		String def = "WINDOW";
		for (String[] d : SKIN) if (d[0].equals(ui)) { def = d[1]; break; }
		JsonValue s = data == null ? null : data.get("skin");
		String v = s != null ? s.getString(ui, "") : "";
		try { return Chrome.Type.valueOf(v.isEmpty() ? def : v); } catch (Exception e) { return Chrome.Type.valueOf(def); }
	}
	/** 그 UI 의 9조각 — 프로젝트가 바꾼 chrome.png 가 있으면 그 그림 (MakerAssets) */
	public static NinePatch patch(String ui) { return Chrome.get(skin(ui)); }

	/** PDMaker 가 띄우는 원작 모양 창(WndOptions 등): 제목(첫 글) = 강조색, 버튼 글자 = 본문색. 테마 파일이 없으면 아무것도 바꾸지 않음 */
	public static <W extends Window> W style(W w) {
		if (w == null || !present()) return w;
		boolean[] first = { true };
		walk(w, g -> {
			if (g instanceof StyledButton) { ((StyledButton) g).textColor(c("text")); return false; }
			if (g instanceof RenderedTextBlock && first[0]) { first[0] = false; ((RenderedTextBlock) g).hardlight(c("accent")); }
			return true;
		});
		return w;
	}
	/** GameScene.show 맨 앞 (설치기 패치): PDMaker 안에서 만든 원작 모양 창(WndOptions · WndTitledMessage)만. 창 틀 · 버튼 그림은 원래 스킨(chrome.png) */
	public static void onShow(Window w) {
		if (w == null || !w.getClass().getName().startsWith("com.shatteredpixel.shatteredpixeldungeon.pdmaker.")) return;
		if (w instanceof com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions || w instanceof com.shatteredpixel.shatteredpixeldungeon.windows.WndTitledMessage) style(w);
	}
	static void walk(Group g, java.util.function.Predicate<Gizmo> f) {
		for (int i = 0; i < g.length; i++) {
			Gizmo m = MakerDialogue.HudHider.member(g, i);
			if (m == null) continue;
			if (f.test(m) && m instanceof Group && !(m instanceof RenderedTextBlock)) walk((Group) m, f);
		}
	}
	/** 디버그 · 자동 테스트 */
	public static String debugState() {
		StringBuilder b = new StringBuilder("present=" + present() + " v=" + version);
		for (String[] d : SKIN) b.append(' ').append(d[0]).append('=').append(skin(d[0]));
		for (String[] d : DEF) b.append(' ').append(d[0]).append('=').append(hex(d[0]));
		b.append(" chrome=").append(MakerAssets.has("interfaces/chrome.png") ? "project" : "game");
		return b.toString();
	}
}
