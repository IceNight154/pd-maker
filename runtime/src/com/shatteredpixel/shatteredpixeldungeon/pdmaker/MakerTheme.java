/*
 * 게임 UI 테마 (6차) — 프로젝트의 theme.json (편집기 → 게임 UI 테마). PDMaker 가 게임에 더하거나 바꾸는 UI 가 같은 색 · 모양을 씀.
 *
 *   우선순위: ① UI 요소에 직접 지정한 값(예: 대사 한 줄의 강조 색) → ② 그 UI 묶음 설정(dialogue.json 등, 빈 칸 "" = 테마를 따름)
 *            → ③ 프로젝트 테마(theme.json) → ④ 런타임 기본 테마(DEF — 4차까지 코드에 직접 쓰던 값과 같음: 예전 프로젝트는 그대로 보임)
 *   토큰: bg panel border text textDim accent button buttonOn disabled warn error good shadow · shape(game · round · square) radius padding fontScale
 *   실행 중 다시 읽기: theme.json 이 바뀌면(1초마다 수정 시각 확인) version 이 올라가고, 다음에 그리는 창 · 배속 표시줄부터 새 값.
 *   원작 게임 창(원작이 직접 띄우는 가방 · 설정 · 기본 대화 상자)은 바꾸지 않음 — Window.TITLE_COLOR 는 원작에 상수로 박혀 있음.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Group;

public class MakerTheme {

	/** 런타임 기본 테마 = 원작 · 4차까지의 직접 쓴 색 (TITLE_COLOR 0xFFFF44 · 회색 0x888888 · 경고 0xCC6666 …) — 편집기 PDM.gameTheme.DEFAULT 와 같음 */
	static final String[][] DEF = {
		{ "bg", "#1d1e20" }, { "panel", "#2a2a2a" }, { "border", "#8c7f65" }, { "text", "#ffffff" }, { "textDim", "#888888" },
		{ "accent", "#ffff44" }, { "button", "#4a3a6a" }, { "buttonOn", "#8a6d1f" }, { "disabled", "#666666" },
		{ "warn", "#ff8800" }, { "error", "#cc6666" }, { "good", "#44ff44" }, { "shadow", "#000000" } };
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
			if (m != 0) MakerRuntime.log("게임 UI 테마: " + (data == null ? "기본" : data.getString("name", "프로젝트 테마")));
		} catch (Throwable t) { MakerRuntime.log("게임 UI 테마(theme.json)를 읽지 못했습니다 — 기본 테마로: " + t); data = null; stamp = 0; }
	}
	/** 프로젝트에 테마가 있는지 (없으면 모든 값 = 런타임 기본 = 예전 모습) */
	public static boolean present() { refresh(); return data != null; }

	/** 색 토큰 (0xRRGGBB) */
	public static int c(String token) {
		refresh();
		String def = "#ffffff";
		for (String[] d : DEF) if (d[0].equals(token)) { def = d[1]; break; }
		JsonValue col = data == null ? null : data.get("colors");
		String v = col != null ? col.getString(token, "") : "";
		return MakerTitle.color(v.isEmpty() ? def : v, MakerTitle.color(def, 0xFFFFFF));
	}
	/** 테마가 있으면 그 토큰, 없으면 그 자리에서 예전에 쓰던 색 그대로 (예전 프로젝트의 모습이 조금도 바뀌지 않게) */
	public static int or(String token, int legacy) { return present() ? c(token) : legacy; }
	/** 색 토큰 "#rrggbb" (dialogue.json 의 빈 칸이 테마를 따를 때) */
	public static String hex(String token) { return String.format("#%06x", c(token)); }
	/** 모양: game(원작 창 테두리) · round · square */
	public static String shape() { refresh(); return data == null ? "game" : data.getString("shape", "game"); }
	public static float radius() { refresh(); return data == null ? 3 : Math.max(0, Math.min(12, data.getFloat("radius", 3))); }
	public static float padding() { refresh(); return data == null ? 4 : Math.max(0, Math.min(24, data.getFloat("padding", 4))); }
	public static float fontScale() { refresh(); return data == null ? 1 : Math.max(0.5f, Math.min(2f, data.getFloat("fontScale", 1))); }

	/** PDMaker 가 띄우는 원작 모양 창(WndOptions 등): 제목(첫 글) = 강조색, 버튼 글자 = 본문색. 테마가 없으면 아무것도 바꾸지 않음 (예전 그대로) */
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
	/** GameScene.show 맨 앞 (설치기 패치): PDMaker 가 띄우는 원작 모양 창(WndOptions · WndTitledMessage 를 pdmaker 안에서 만든 것)만 테마로.
	 *  원작이 직접 띄우는 창 · PDMaker 가 직접 그리는 창(대사창 · 마음 · 퀘스트 …은 만들 때 테마 색)은 그대로 */
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
		StringBuilder b = new StringBuilder("present=" + present() + " v=" + version + " shape=" + shape());
		for (String[] d : DEF) b.append(' ').append(d[0]).append('=').append(hex(d[0]));
		return b.toString();
	}
}
