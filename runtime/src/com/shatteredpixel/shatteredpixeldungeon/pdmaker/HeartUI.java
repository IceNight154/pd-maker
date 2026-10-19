/*
 * 마음 창 — 마음의 결정(era JUEL)은 아이템이 아니라 숫자로만 존재하며, 이 창에서만 보입니다.
 *   · 게임 화면 오른쪽 위의 하트 버튼 (프로젝트에 마음 시스템이 켜진 캐릭터가 있을 때)
 *   · NPC 에게 말 걸기 → "마음 보기"
 *   · 이벤트 명령 showHeart
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.ScrollPane;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.watabou.gltextures.SmartTexture;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.shatteredpixel.shatteredpixeldungeon.ui.Button;
import com.watabou.noosa.ui.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class HeartUI {

	private static SmartTexture heartTex;
	/** 9x8 분홍 하트를 코드로 그림 (게임 에셋을 건드리지 않기 위해) */
	static SmartTexture heartTexture() {
		if (heartTex == null) {
			String[] rows = { ".##...##.", "#oo#.#oo#", "#ooo#ooo#", "#ooooooo#", ".#ooooo#.", "..#ooo#..", "...#o#...", "....#...." };
			Pixmap p = new Pixmap(9, 8, Pixmap.Format.RGBA8888);
			for (int y = 0; y < rows.length; y++) for (int x = 0; x < 9; x++) {
				char c = rows[y].charAt(x);
				if (c == '#') p.drawPixel(x, y, 0x7a1f3dff);
				else if (c == 'o') p.drawPixel(x, y, (y < 2 && x % 4 == 1) ? 0xffd0e0ff : 0xf2587fff);
			}
			heartTex = new SmartTexture(p);
		}
		return heartTex;
	}

	/** 마음 시스템을 쓰는 캐릭터가 하나라도 있는지 */
	static boolean used() {
		if (MakerRuntime.heart == null) return false;
		for (JsonValue c : MakerRuntime.chars.values())
			if (c.get("heart") != null && c.get("heart").getBoolean("enabled", false)) return true;
		return false;
	}

	/** GameScene 이 만들어질 때(층 입장) 하트 버튼을 붙임 */
	public static void attach() {
		if (!used() || !(Game.scene() instanceof GameScene)) return;
		if (MakerRuntime.project != null && !MakerRuntime.project.getBoolean("heartButton", true)) return;
		HeartButton b = new HeartButton();
		b.camera = PixelScene.uiCamera;
		b.setPos(PixelScene.uiCamera.width - b.width() - 1, 44);
		Game.scene().addToFront(b);
	}

	public static class HeartButton extends Button {
		private Image icon;
		@Override protected void createChildren() {
			super.createChildren();
			icon = new Image(heartTexture());
			add(icon);
			width = 16; height = 16;
		}
		@Override protected void layout() {
			super.layout();
			icon.x = x + (width - icon.width()) / 2f;
			icon.y = y + (height - icon.height()) / 2f;
			PixelScene.align(icon);
		}
		@Override protected void onClick() { show(null); }
		@Override protected String hoverText() { return MakerRuntime.term("sys.heartWindow", "마음"); }
	}

	/** 마음 창 열기 (charId 가 null 이면 가장 최근에 만난 캐릭터) */
	public static void show(String charId) {
		// 이벤트·말 걸기(게임 스레드)에서도 부르므로 창은 화면 스레드에서
		final String want = charId;
		com.watabou.noosa.Game.runOnRenderThread(() -> showNow(want));
	}
	static void showNow(String charId) {
		List<String> ids = known();
		if (ids.isEmpty()) {
			GameScene.show(new WndMakerSimple(MakerRuntime.term("sys.heartWindow", "마음"), "아직 마음을 나눈 사람이 없습니다."));
			return;
		}
		if (charId == null || !ids.contains(charId)) charId = ids.get(ids.size() - 1);
		GameScene.show(new WndHeart(ids, charId));
	}

	/** 마음 기록이 있는(만난) 캐릭터 */
	static List<String> known() {
		List<String> out = new ArrayList<>();
		for (String id : HeartSystem.knownIds()) if (HeartSystem.enabled(id)) out.add(id);
		return out;
	}

	static String name(String charId) {
		JsonValue c = MakerRuntime.character(charId);
		return c == null ? charId : c.getString("name", charId);
	}

	// ------------------------------------------------------------ 창

	public static class WndHeart extends Window {
		private static final int W = 140, H = 170;

		WndHeart(List<String> ids, String sel) {
			super();
			resize(W, H);
			float y = 0;
			RenderedTextBlock title = PixelScene.renderTextBlock(MakerRuntime.term("sys.heartWindow", "마음"), 9);
			title.hardlight(MakerTheme.or("accent", 0xFFFF44));
			title.setPos((W - title.width()) / 2f, 1);
			add(title);
			y = title.bottom() + 3;
			// 캐릭터 고르기 (여러 명이면 버튼 줄)
			if (ids.size() > 1) {
				float x = 0;
				for (String id : ids) {
					final String cid = id;
					RedButton b = new RedButton(name(id), 7) {
						@Override protected void onClick() { hide(); GameScene.show(new WndHeart(ids, cid)); }
					};
					b.setSize(Math.min(W, b.reqWidth() + 4), 14);
					if (x + b.width() > W) { x = 0; y += 15; }
					b.setPos(x, y);
					if (id.equals(sel)) b.textColor(MakerTheme.or("accent", 0xFFFF44));
					add(b);
					x += b.width() + 2;
				}
				y += 17;
			}
			ScrollPane pane = new ScrollPane(new Component());
			add(pane);
			pane.setRect(0, y, W, H - y);
			Component content = pane.content();
			RenderedTextBlock body = PixelScene.renderTextBlock(describe(sel), 6);
			body.maxWidth(W - 4);
			body.setPos(2, 0);
			content.add(body);
			content.setSize(W, body.height() + 4);
			pane.scrollTo(0, 0);
		}
	}

	/** 한 캐릭터의 마음 상태를 글로 (_밑줄_ 은 강조색) */
	static String describe(String id) {
		HeartSystem.Record r = HeartSystem.rec(id);
		JsonValue sys = MakerRuntime.heart;
		StringBuilder sb = new StringBuilder();
		sb.append("_").append(name(id)).append("_  ·  ").append(HeartSystem.stageName(r)).append("\n");
		sb.append(MakerRuntime.term("rel.attitude")).append(": ").append(MakerRuntime.term(HeartSystem.attitude(id)));
		if (r.sulk) sb.append("  (").append(MakerRuntime.term("rel.sulk")).append(")");
		sb.append("\n");
		sb.append(MakerRuntime.term("rel.favor")).append(" ").append(r.favor)
		  .append("   ").append(MakerRuntime.term("rel.trust")).append(" ").append(r.trust);
		if (r.anger > 0) sb.append("   ").append(MakerRuntime.term("rel.anger")).append(" ").append(r.anger);
		sb.append("\n");
		// eraTW: 무드 · 기분 · 마음 열림 · 언짢음 · 스트레스 · 질투
		sb.append(MakerRuntime.term("rel.mood")).append(" ").append(r.mood).append("/").append(HeartSystem.moodMax())
		  .append("   ").append(MakerRuntime.term("rel.temper")).append(" ")
		  .append(MakerRuntime.term(r.temper > 0 ? "temper.good" : r.temper < 0 ? "temper.bad" : "temper.normal")).append("\n");
		int lv = HeartSystem.acceptLevel(r);
		sb.append(MakerRuntime.term("rel.accept")).append(" ").append(HeartSystem.acceptance(r)).append("  (").append(lv).append("/3)\n");
		if (r.displeased > 0) sb.append("_").append(MakerRuntime.term("rel.displeased")).append("_ (").append(r.displeased).append(")\n");
		if (HeartSystem.stressTier(r) >= 2) sb.append(MakerRuntime.term("rel.stress")).append(" ").append(r.stress).append("\n");
		if (r.jealousy > 0) sb.append(MakerRuntime.term("rel.jealousy")).append(" ").append(r.jealousy).append("\n");
		sb.append("\n");

		sb.append("_").append(MakerRuntime.term("sys.crystal")).append("_\n");
		boolean any = false;
		for (String k : HeartSystem.crystalList()) {
			int v = r.get(r.crystals, k);
			if (v <= 0) continue;
			sb.append(MakerRuntime.term(k)).append("  ").append(v).append("\n"); any = true;
		}
		if (!any) sb.append("(아직 없음)\n");

		any = false;
		StringBuilder gs = new StringBuilder();
		for (JsonValue g : sys.get("gauges")) {
			String k = g.getString("key"); int v = r.get(r.gauges, k);
			if (v <= 0) continue;
			gs.append(MakerRuntime.term(k)).append(" ").append(v).append("   "); any = true;
		}
		if (any) sb.append("\n_").append(MakerRuntime.term("sys.gauge")).append("_\n").append(gs.toString().trim()).append("\n");

		any = false;
		StringBuilder ab = new StringBuilder();
		for (JsonValue a : sys.get("abilities")) {
			String k = a.getString("key"); int v = r.get(r.abl, k);
			if (v <= 0) continue;
			ab.append(MakerRuntime.term(k)).append(" Lv").append(v).append("   "); any = true;
		}
		if (any) sb.append("\n_").append(MakerRuntime.term("sys.ability")).append("_\n").append(ab.toString().trim()).append("\n");

		any = false;
		StringBuilder mk = new StringBuilder();
		for (Map.Entry<String, Integer> e : r.marks.entrySet()) {
			if (e.getValue() <= 0) continue;
			mk.append(MakerRuntime.term(e.getKey())).append(" ").append(e.getValue()).append("   "); any = true;
		}
		if (any) sb.append("\n_").append(MakerRuntime.term("sys.mark")).append("_\n").append(mk.toString().trim()).append("\n");

		if (!r.bonds.isEmpty()) {
			sb.append("\n_").append(MakerRuntime.term("sys.bond")).append("_\n");
			for (String b : r.bonds) sb.append(MakerRuntime.term(b)).append("  ");
			sb.append("\n");
		}
		return sb.toString();
	}

	/** 제목 + 글만 있는 간단한 창 */
	public static class WndMakerSimple extends Window {
		WndMakerSimple(String title, String text) {
			super();
			int w = 120;
			RenderedTextBlock t = PixelScene.renderTextBlock(title, 9);
			t.hardlight(MakerTheme.or("accent", 0xFFFF44)); t.setPos((w - t.width()) / 2f, 1); add(t);
			RenderedTextBlock b = PixelScene.renderTextBlock(text, 6);
			b.maxWidth(w); b.setPos(0, t.bottom() + 4); add(b);
			resize(w, (int) b.bottom() + 2);
		}
	}
}
