/*
 * PDMaker — 타이틀 화면의 하위 페이지 (편집기 "타이틀 화면" › 하위 페이지 — title.json 의 pages)
 *   pages.updates : { mode: game | github | off, repo: "owner/repo", page: "다운로드 페이지 주소" }
 *       github = 그 저장소의 GitHub Releases 로 업데이트 확인 (릴리스 본문에 "internal version number: <버전 코드>" — 게임 GitHubUpdates 와 같은 규칙)
 *       page   = 업데이트 버튼을 눌렀을 때 열 주소 (비우면 그 릴리스 페이지)
 *   pages.news    : { mode: game | feed | custom | off, url: RSS 주소, articles: [{ title, summary, date: "YYYY-MM-DD", url, icon }] }
 *   pages.about · pages.support · pages.changes : { mode: game | custom, title, blocks: [{ title, text, link, linkLabel, color }] }
 *       custom = 게임 화면을 다 만든 뒤 내용을 이 블록들로 바꿈 (뒤로 가기 · 배경은 그대로)
 * 업데이트 · 소식 서비스 모듈은 이 패키지를 모르므로 System 속성으로 넘기고, 설치기가 넣은 연결 줄(GitHubUpdates · ShatteredNews)이 읽음.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.Archs;
import com.shatteredpixel.shatteredpixeldungeon.ui.ExitButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.ScrollPane;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Game;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.ui.Component;

import java.util.ArrayList;

public class MakerPages {

	static JsonValue page(String id) {
		JsonValue t = MakerRuntime.title, p = t == null ? null : t.get("pages");
		return p == null ? null : p.get(id);
	}
	static String mode(String id) { JsonValue p = page(id); return p == null ? "game" : p.getString("mode", "game"); }

	/** 프로젝트를 읽은 뒤: 업데이트 · 소식 설정을 System 속성으로 (서비스 모듈의 연결 줄이 읽음) */
	public static void applyServices() {
		try {
			for (String k : new String[]{ "pdmaker.updates.off", "pdmaker.updates.url", "pdmaker.updates.page", "pdmaker.news.off", "pdmaker.news.url" }) System.clearProperty(k);
			JsonValue u = page("updates");
			String um = mode("updates");
			if ("off".equals(um)) System.setProperty("pdmaker.updates.off", "1");
			else if ("github".equals(um) && u != null) {
				String repo = u.getString("repo", "").trim().replaceAll("^https?://github\\.com/", "").replaceAll("/+$", "");
				if (!repo.isEmpty()) System.setProperty("pdmaker.updates.url", "https://api.github.com/repos/" + repo + "/releases");
			}
			if (u != null && !u.getString("page", "").trim().isEmpty() && !"off".equals(um)) System.setProperty("pdmaker.updates.page", u.getString("page", "").trim());
			JsonValue n = page("news");
			String nm = mode("news");
			if ("off".equals(nm) || "custom".equals(nm)) System.setProperty("pdmaker.news.off", "1");   // 직접 쓴 소식이면 인터넷에서 받지 않음
			else if ("feed".equals(nm) && n != null && !n.getString("url", "").trim().isEmpty()) System.setProperty("pdmaker.news.url", n.getString("url", "").trim());
		} catch (Throwable t) { MakerRuntime.log("하위 페이지 설정 오류: " + t); }
	}

	/** 직접 쓴 소식 → 게임 News 목록 (새 소식 화면 · 타이틀의 안 읽은 소식 수가 이것을 씀) */
	static void injectNews() {
		if (!"custom".equals(mode("news"))) return;
		try {
			JsonValue n = page("news"), list = n == null ? null : n.get("articles");
			ArrayList<com.shatteredpixel.shatteredpixeldungeon.services.news.NewsArticle> out = new ArrayList<>();
			if (list != null) for (JsonValue a : list) {
				com.shatteredpixel.shatteredpixeldungeon.services.news.NewsArticle x = new com.shatteredpixel.shatteredpixeldungeon.services.news.NewsArticle();
				x.title = a.getString("title", "");
				x.summary = a.getString("summary", "").replace("\\n", "\n");
				x.URL = a.getString("url", "");
				x.icon = a.getString("icon", "ICON: NEWS");
				try { x.date = new java.text.SimpleDateFormat("yyyy-MM-dd").parse(a.getString("date", "2024-01-01")); } catch (Exception e) { x.date = new java.util.Date(); }
				out.add(x);
			}
			java.lang.reflect.Field fa = com.shatteredpixel.shatteredpixeldungeon.services.news.News.class.getDeclaredField("articles"); fa.setAccessible(true); fa.set(null, out);
			java.lang.reflect.Field fl = com.shatteredpixel.shatteredpixeldungeon.services.news.News.class.getDeclaredField("lastCheck"); fl.setAccessible(true); fl.set(null, new java.util.Date());
		} catch (Throwable t) { MakerRuntime.log("직접 쓴 소식 넣기 오류: " + t); }
	}

	/** 화면을 만들 때 (MakerAssets.onSceneCreate): 소식 넣기 · 바꿀 하위 페이지면 첫 프레임에 내용을 바꿈 */
	public static void onSceneCreate(PixelScene scene) {
		injectNews();
		String n = scene.getClass().getSimpleName();
		String id = n.equals("AboutScene") ? "about" : n.equals("SupporterScene") ? "support" : n.equals("ChangesScene") ? "changes" : null;
		if (id != null && "custom".equals(mode(id))) scene.add(new Replacer(scene, page(id)));
	}

	/** 게임이 화면을 다 만든 뒤(첫 프레임) 내용을 우리 블록으로 바꿈 */
	static class Replacer extends Gizmo {
		final PixelScene scene; final JsonValue p; boolean done;
		Replacer(PixelScene scene, JsonValue p) { this.scene = scene; this.p = p; }
		@Override public void update() {
			if (done) return;
			done = true;
			try { build(); } catch (Throwable t) { MakerRuntime.log("하위 페이지 오류: " + t); }
		}
		void build() {
			scene.clear();
			int w = Camera().width, h = Camera().height;
			Archs archs = new Archs(); archs.setSize(w, h); scene.add(archs);
			ExitButton btnExit = new ExitButton(); btnExit.setPos(w - btnExit.width(), 0); scene.add(btnExit);
			RenderedTextBlock title = PixelScene.renderTextBlock(p.getString("title", ""), 9);
			title.hardlight(MakerTheme.or("accent", 0xFFFF44));
			title.setPos((w - title.width()) / 2f, (20 - title.height()) / 2f + 2);
			PixelScene.align(title); scene.add(title);
			int pw = Math.min(w - 16, PixelScene.landscape() ? 220 : 150);
			Component content = new Component();
			float y = 2;
			JsonValue bl = p.get("blocks");
			if (bl != null) for (JsonValue b : bl) {
				int col = 0xFFFF44; try { col = Integer.parseInt(b.getString("color", "#ffff44").replace("#", ""), 16); } catch (Exception ignored) { }
				String bt = b.getString("title", "");
				if (!bt.isEmpty()) {
					RenderedTextBlock t = PixelScene.renderTextBlock(bt, 8); t.hardlight(col); t.maxWidth(pw);
					t.setPos((pw - t.width()) / 2f, y); content.add(t); y = t.bottom() + 3;
				}
				String tx = b.getString("text", "").replace("\\n", "\n");
				if (!tx.isEmpty()) {
					RenderedTextBlock t = PixelScene.renderTextBlock(tx, 6); t.maxWidth(pw);
					t.setPos((pw - t.width()) / 2f, y); content.add(t); y = t.bottom() + 3;
				}
				final String link = b.getString("link", "").trim();
				if (!link.isEmpty()) {
					RedButton btn = new RedButton(b.getString("linkLabel", "").isEmpty() ? link.replaceAll("^https?://", "") : b.getString("linkLabel", ""), 6) {
						@Override protected void onClick() { Game.platform.openURI(link); }
					};
					btn.setSize(Math.min(pw, btn.reqWidth() + 8), 16);
					btn.setPos((pw - btn.width()) / 2f, y); content.add(btn); y = btn.bottom() + 3;
				}
				ColorBlock sep = new ColorBlock(pw, 1, 0x33FFFFFF); sep.x = 0; sep.y = y + 4; content.add(sep);
				y += 10;
			}
			content.setSize(pw, y);
			ScrollPane list = new ScrollPane(content);
			scene.add(list);
			list.setRect((w - pw) / 2f, 22, pw, h - 26);
			list.scrollTo(0, 0);
		}
		com.watabou.noosa.Camera Camera() { return com.watabou.noosa.Camera.main; }
	}
}
