/*
 * PDMaker — 내 배지 (편집기 확장 기능 "업적 (배지)" — badges.json)
 *   { list: [ { id, name, desc, icon(배지 그림 시트 interfaces/badges.png 의 칸 번호 — 16px 칸, 한 줄 8칸),
 *               trigger(manual | floorEnter | mobKilled | itemPickup | turn), cond(조건식), event(얻었을 때 실행할 이벤트), hidden(얻기 전에는 이름·설명 숨김) } ] }
 *   얻은 배지는 전역 스위치 "badge.<id>" 로 저장 (새 게임에도 유지). 조건식에서 badge.<id> 로 확인.
 *   이벤트 명령: "배지 주기" (badge { id }) · "배지 목록 창" (badgeList)
 *   게임 원래 배지의 이름·설명은 게임 텍스트(texts.json)로, 그림은 interfaces/badges.png 를 바꿔서 고침 (원래 배지의 조건은 게임 코드에 있음)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.effects.BadgeBanner;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.Camera;
import com.shatteredpixel.shatteredpixeldungeon.Badges;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.Scene;
import com.watabou.noosa.audio.Sample;

public class MakerBadges {

	static JsonValue list() { return MakerRuntime.badges == null ? null : MakerRuntime.badges.get("list"); }
	static JsonValue def(String id) {
		JsonValue l = list();
		if (l != null && id != null) for (JsonValue b : l) if (id.equals(b.getString("id", ""))) return b;
		return null;
	}
	/** 배지가 따로 쓰는 그림 (image: 프로젝트 경로) — 없으면 null (배지 그림 시트의 칸을 씀) */
	static Object img(JsonValue d) { String p = d.getString("image", ""); try { return p.isEmpty() ? null : MakerRuntime.texture(p); } catch (Throwable t) { return null; } }
	public static boolean has(String id) {
		if (def(id) == null) { try { return Badges.isUnlocked(Badges.Badge.valueOf(id.toUpperCase())); } catch (Throwable t) { /* 원래 배지 이름이 아님 */ } }
		return MakerDrops.global("badge." + id);
	}

	// ---------------- 게임 원래 배지의 얻는 조건 바꾸기: badges.json 의 orig { 배지이름: { mode: "off" | "custom", trigger, cond } }
	static boolean forcing;
	static JsonValue orig(String name) { JsonValue o = MakerRuntime.badges == null ? null : MakerRuntime.badges.get("orig"); return o == null ? null : o.get(name); }
	/** Badges.displayBadge 의 첫 줄에서 부름 — 원래 조건을 끄거나 바꾼 배지면 게임 원래 조건으로는 얻지 못하게 막음 */
	public static boolean blocked(String name) {
		if (forcing || !MakerRuntime.isActive()) return false;
		JsonValue o = orig(name); if (o == null) return false;
		String m = o.getString("mode", "");
		return "off".equals(m) || "custom".equals(m);
	}
	@SuppressWarnings("unchecked")
	static void giveOrig(String name) {
		try {
			Badges.Badge b = Badges.Badge.valueOf(name);
			java.lang.reflect.Field lf = Badges.class.getDeclaredField("local"); lf.setAccessible(true);
			java.util.HashSet<Badges.Badge> local = (java.util.HashSet<Badges.Badge>) lf.get(null);
			if (local.contains(b)) return;                 // 이번 판에 이미 얻음
			java.lang.reflect.Method dm = Badges.class.getDeclaredMethod("displayBadge", Badges.Badge.class); dm.setAccessible(true);
			local.add(b);
			forcing = true;
			try { dm.invoke(null, b); } finally { forcing = false; }
		} catch (Throwable t) { MakerRuntime.warnOnce("원래 배지를 줄 수 없음: " + name + " (" + t + ")"); }
	}
	/** 게임 통계 값 (Statistics 의 static 필드) — 조건식 stat.<이름> */
	public static Object stat(String f) {
		try {
			Object v = com.shatteredpixel.shatteredpixeldungeon.Statistics.class.getField(f).get(null);
			if (v instanceof Number || v instanceof Boolean) return v;
		} catch (Throwable t) { MakerRuntime.warnOnce("없는 통계 값: stat." + f); }
		return 0;
	}

	/** 배지 주기 (이미 있으면 아무 일도 없음) */
	public static void give(String id) {
		final JsonValue d = def(id);
		if (d == null) { MakerRuntime.warnOnce("없는 배지: " + id); return; }
		if (has(id)) return;
		MakerDrops.setGlobal("badge." + id, true);
		final String name = StoryState.expand(d.getString("name", id));
		GLog.h(MakerRuntime.term("badge.get", "배지 획득: %s").replace("%s", name));
		final int icon = d.getInt("icon", 0);
		Game.runOnRenderThread(() -> {
			try {
				Scene s = Game.scene();
				if (s == null) return;
				Sample.INSTANCE.play(Assets.Sounds.BADGE);
				BadgeBanner banner = BadgeBanner.show(icon);
				Object own = img(d);
				if (own != null) banner.texture(own);   // 따로 저장한 배지 그림 (16×16)
				s.add(banner);
				float offset = Camera.main == null ? 0 : Camera.main.centerOffset.y;
//#if field:effects.BadgeBanner#showing @ 배지 띠 여러 개 늘어놓기 (없으면 가운데 하나)
				int left = PixelScene.uiCamera.width / 2 - BadgeBanner.SIZE / 2;
				left -= (BadgeBanner.SIZE * BadgeBanner.DEFAULT_SCALE * (BadgeBanner.showing.size() - 1)) / 2;
				for (int i = 0; i < BadgeBanner.showing.size(); i++) {
					BadgeBanner b = BadgeBanner.showing.get(i);
					b.camera = PixelScene.uiCamera;
					b.x = PixelScene.align(b.camera, left);
					b.y = PixelScene.align(PixelScene.uiCamera, (PixelScene.uiCamera.height - b.height) / 2 - b.height / 2 - 16 - offset);
					left += BadgeBanner.SIZE * BadgeBanner.DEFAULT_SCALE;
				}
//#else
				//#| // 예전 판: 여러 띠를 늘어놓는 목록(showing)이 없음 — 화면 가운데에 하나
				//#| banner.camera = PixelScene.uiCamera;
				//#| banner.x = PixelScene.align(banner.camera, (PixelScene.uiCamera.width - banner.width) / 2);
				//#| banner.y = PixelScene.align(PixelScene.uiCamera, (PixelScene.uiCamera.height - banner.height) / 2 - banner.height / 2 - 16 - offset);
//#endif
			} catch (Throwable t) { MakerRuntime.log("배지 띠 오류: " + t); }
		});
		String ev = d.getString("event", "");
		if (!ev.isEmpty() && !EventInterpreter.busy()) EventInterpreter.runEvent(ev, null);
	}

	/** 때가 됐을 때(층 입장 · 몬스터 처치 · 아이템 획득 · 턴) 조건이 맞는 배지를 줌 */
	public static void check(String trigger) {
		JsonValue l = list();
		if (l == null || !MakerRuntime.isActive()) return;
		try {
			for (JsonValue b : l) {
				if (!trigger.equals(b.getString("trigger", "manual"))) continue;
				String id = b.getString("id", ""), cond = b.getString("cond", "").trim();
				if (id.isEmpty() || cond.isEmpty() || has(id)) continue;
				if (Cond.eval(cond, StoryState.globalResolver())) give(id);
			}
			JsonValue o = MakerRuntime.badges.get("orig");
			if (o != null) for (JsonValue b : o) {
				if (!"custom".equals(b.getString("mode", "")) || !trigger.equals(b.getString("trigger", "turn"))) continue;
				String cond = b.getString("cond", "").trim();
				if (!cond.isEmpty() && Cond.eval(cond, StoryState.globalResolver())) giveOrig(b.name);
			}
		} catch (Throwable t) { MakerRuntime.log("배지 조건 오류: " + t); }
	}

	/** 내 배지 목록 창 */
	public static void showList() {
		Game.runOnRenderThread(() -> { try { if (Game.scene() instanceof GameScene) GameScene.show(new Wnd()); } catch (Throwable t) { MakerRuntime.log("배지 목록 창 오류: " + t); } });
	}

	static class Wnd extends Window {
		Wnd() {
			int w = PixelScene.landscape() ? 200 : 126;
			RenderedTextBlock title = PixelScene.renderTextBlock(MakerRuntime.term("badge.list", "배지"), 9);
			title.hardlight(MakerTheme.or("accent", 0xFFFF44)); title.setPos(2, 2); add(title);
			float y = title.bottom() + 4; int n = 0, got = 0;
			JsonValue l = list();
			if (l != null) for (JsonValue b : l) {
				boolean on = has(b.getString("id", "")), hid = b.getBoolean("hidden", false) && !on;
				if (y > PixelScene.uiCamera.height * 0.8f - 24) break;
				Object own = img(b);
				Image im = own != null ? new Image(own) : BadgeBanner.image(b.getInt("icon", 0));
				if (own != null && im.width > 0) im.scale.set(16f / im.width);
				im.x = 2; im.y = y; if (!on) { im.brightness(0.25f); }
				add(im);
				RenderedTextBlock nm = PixelScene.renderTextBlock(hid ? "???" : StoryState.expand(b.getString("name", "")), 7);
				if (on) nm.hardlight(MakerTheme.or("accent", 0xFFFF44)); nm.maxWidth(w - 22); nm.setPos(20, y); add(nm);
				RenderedTextBlock ds = PixelScene.renderTextBlock(hid ? MakerRuntime.term("badge.hidden", "아직 얻지 못한 배지") : StoryState.expand(b.getString("desc", "")), 6);
				ds.maxWidth(w - 22); ds.setPos(20, nm.bottom() + 1); if (!on) ds.alpha(0.6f); add(ds);
				y = Math.max(y + 18, ds.bottom() + 4); n++; if (on) got++;
			}
			if (n == 0) { RenderedTextBlock e = PixelScene.renderTextBlock(MakerRuntime.term("badge.none", "배지가 없습니다."), 6); e.setPos(2, y); add(e); y = e.bottom() + 4; }
			resize(w, (int) y);
		}
	}
}
