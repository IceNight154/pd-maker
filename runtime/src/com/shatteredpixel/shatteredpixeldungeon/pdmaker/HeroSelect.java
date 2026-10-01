/*
 * 영웅 선택 화면 (HeroSelectScene) — 게임 직업 대신 프로젝트의 영웅(heroes/<id>.json)을 버튼으로 보여줌.
 *
 *   · 보이는 영웅: enabled 인 영웅 전부 (project.json 의 startHero 가 있으면 그 영웅 하나만)
 *   · 영웅이 하나도 없으면 게임 원래 화면 그대로
 *   · 버튼을 누르면 바탕 직업(baseClass, 비면 WARRIOR)으로 선택하고, 이름·설명은 영웅 데이터로
 *   · 원작 영웅(id 가 직업 이름과 같음 — 새 프로젝트의 warrior 등)은 원작처럼 잠금·직업 정보 창을 따름
 *   · 고른 영웅은 HeroRuntime.pick 이 새 게임에 적용
 *
 * 게임 연결: HeroSelectScene.create() 의 직업 버튼 반복문 앞 줄
 *   if (!HeroSelect.addButtons(this, heroBtns)) for (HeroClass cl : HeroClass.values()) { … }
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.GamesInProgress;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.scenes.HeroSelectScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndHeroInfo;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndMessage;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndTitledMessage;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Image;
import com.watabou.noosa.ui.Component;

import java.util.ArrayList;
import java.util.List;

public class HeroSelect {

	/** 영웅 선택 화면에서 고른 영웅 id (새 게임을 시작할 때 HeroRuntime.pick 이 씀) */
	public static String selected = null;
	static Object scene;          // 지금 화면 (처음 한 번 고르기용)
	static boolean initDone;

	/** 화면에 보일 영웅 목록 */
	static List<JsonValue> entries() {
		List<JsonValue> out = new ArrayList<>();
		if (!MakerRuntime.isActive()) return out;
		String forced = MakerRuntime.project == null ? "" : MakerRuntime.project.getString("startHero", "");
		if (!forced.isEmpty() && MakerRuntime.heroes.get(forced) != null) { out.add(MakerRuntime.heroes.get(forced)); return out; }
		for (JsonValue h : MakerRuntime.heroes.values()) if (h.getBoolean("enabled", true)) out.add(h);
		// 순서: project.json 의 heroOrder (에디터 리소스 목록에서 ▲▼ 로 정함), 없는 영웅은 뒤에
		JsonValue ord = MakerRuntime.project == null ? null : MakerRuntime.project.get("heroOrder");
		if (ord != null && ord.size > 0) {
			final List<String> ids = new ArrayList<>();
			for (JsonValue o : ord) ids.add(o.asString());
			final List<JsonValue> orig = new ArrayList<>(out);
			java.util.Collections.sort(out, (a, b) -> {
				int ia = ids.indexOf(a.getString("id", "")), ib = ids.indexOf(b.getString("id", ""));
				if (ia < 0) ia = 1000 + orig.indexOf(a); if (ib < 0) ib = 1000 + orig.indexOf(b);
				return Integer.compare(ia, ib);
			});
		}
		return out;
	}

	/** 영웅의 바탕 직업 (비었거나 게임에 없는 직업이면 WARRIOR) */
	public static HeroClass classOf(JsonValue h) {
		String b = h == null ? "" : h.getString("baseClass", "");
		if (b != null && !b.isEmpty()) {
			try { return HeroClass.valueOf(b.trim().toUpperCase()); } catch (Throwable ignored) { MakerRuntime.log("게임에 없는 직업: " + b + " → WARRIOR"); }
		}
		return HeroClass.WARRIOR;
	}
	/** 원작 영웅 (id 가 직업 이름) — 원작처럼 잠금·정보 창 */
	static boolean vanilla(JsonValue h) { return !HeroRuntime.zeroBase(h) && h.getString("id", "").equalsIgnoreCase(classOf(h).name()); }

	/** 직업 버튼 대신 영웅 버튼을 넣음. 넣었으면 true (게임의 직업 버튼은 만들지 않음) */
	public static boolean addButtons(PixelScene sc, ArrayList<StyledButton> list) {
		try {
			List<JsonValue> es = entries();
			if (es.isEmpty()) return false;
			selected = null; scene = sc; initDone = false; big = null; myInfo = null;
			for (JsonValue h : es) {
				HeroBtn b = new HeroBtn(sc, h);
				sc.add(b);
				list.add(b);
			}
			return true;
		} catch (Throwable t) { MakerRuntime.log("영웅 선택 화면 오류: " + t); return false; }
	}

	/** 영웅 편집기 "캐릭터 선택 화면"의 글자 (select.title · desc · info) — 비면 "" */
	static String sel(JsonValue h, String k) {
		JsonValue s = h.get("select");
		return s == null ? "" : s.getString(k, "").replace("\\n", "\n");
	}
	static String name(JsonValue h) {
		if (!sel(h, "title").trim().isEmpty()) return sel(h, "title");
		String n = h.getString("name", "");
		return n.isEmpty() ? Messages.titleCase(classOf(h).title()) : n;
	}
	static String desc(JsonValue h) {
		if (!sel(h, "desc").trim().isEmpty()) return sel(h, "desc");
		if (vanilla(h)) return classOf(h).shortDesc();
		String d = h.getString("desc", "").replace("\\n", "\n");
		if (d.trim().isEmpty()) d = h.getString("title", "");
		if (d.trim().isEmpty()) d = " ";          // 빈 글자는 바뀌지 않아 직업 설명이 남음
		return d.length() > 300 ? d.substring(0, 300) + "…" : d;
	}

	/** 영웅 그림의 첫 프레임 (그림이 없으면 바탕 직업 그림) */
	static Image icon(JsonValue h) {
		try {
			JsonValue sel = h.get("select");
			String ic = sel == null ? "" : sel.getString("icon", "");
			if (!ic.isEmpty()) {
				Object t = MakerRuntime.texture(ic);
				if (t != null) { Image im = new Image(t); float k = Math.min(1f, 20f / Math.max(im.width, im.height)); im.scale.set(k); return im; }
			}
			JsonValue sp = h.get("sprite");
			String sheet = sp == null ? "" : sp.getString("sheet", "");
			if (!sheet.isEmpty()) {
				Object tx = MakerRuntime.texture(sheet);
				if (tx != null) {
					int fw = 12, fh = 15;
					JsonValue fr = sp.get("frame");
					if (fr != null && fr.size >= 2) { fw = fr.getInt(0); fh = fr.getInt(1); }
					int f = 0;
					JsonValue a = sp.get("anims") == null ? null : sp.get("anims").get("idle");
					if (a != null && a.get("frames") != null && a.get("frames").size > 0) f = a.get("frames").getInt(0);
					Image probe = new Image(tx);
					int cols = Math.max(1, (int) (probe.width / fw));
					Image img = new Image(tx, (f % cols) * fw, (f / cols) * fh, fw, fh);
					if (fh > 20) img.scale.set(20f / fh);
					return img;
				}
			}
		} catch (Throwable t) { MakerRuntime.log("영웅 선택 그림 오류: " + t); }
		return new Image(classOf(h).spritesheet(), 0, 90, 12, 15);
	}

	/** 게임의 setSelectedHero(직업) 를 부른 뒤 이름·설명을 영웅 것으로 */
	static void select(Object sc, JsonValue h) {
		try {
			selected = h.getString("id", "");
			java.lang.reflect.Method m = HeroSelectScene.class.getDeclaredMethod("setSelectedHero", HeroClass.class);
			m.setAccessible(true);
			m.invoke(sc, classOf(h));
			labels(sc, h);
			portrait(sc, h);
			infoButton(sc, h);
		} catch (Throwable t) { MakerRuntime.log("영웅 선택 오류: " + t); }
	}

	static Image big;   // 배경 위에 그린 일러스트 또는 영웅 그림
	/** 캐릭터 선택 일러스트 (영웅 편집기의 "캐릭터 선택 화면" — select.illust, 시트면 frameW·frameH·frames·fps 로 움직임) */
	static Image illust(JsonValue h) {
		JsonValue s = h.get("select");
		String p = s == null ? "" : s.getString("illust", "");
		if (p.isEmpty()) return null;
		Object tx = MakerRuntime.texture(p);
		if (tx == null) return null;
		int fw = s.getInt("frameW", 0), fh = s.getInt("frameH", 0);
		if (fw <= 0 || fh <= 0) return new Image(tx);
		com.watabou.noosa.MovieClip mc = new com.watabou.noosa.MovieClip(tx);
		com.watabou.noosa.TextureFilm film = new com.watabou.noosa.TextureFilm(mc.texture, fw, fh);
		List<Object> fr = new ArrayList<>();
		for (String t : s.getString("frames", "").split("[,\\s]+")) { try { if (!t.isEmpty()) fr.add(Integer.parseInt(t.trim())); } catch (NumberFormatException ignored) { } }
		if (fr.isEmpty()) { int n = Math.max(1, (mc.texture.width / fw) * (mc.texture.height / fh)); for (int i = 0; i < n; i++) fr.add(i); }
		com.watabou.noosa.MovieClip.Animation an = new com.watabou.noosa.MovieClip.Animation(Math.max(1, s.getInt("fps", 8)), true);
		an.frames(film, fr.toArray());
		mc.frame(film.get(fr.get(0)));
		mc.play(an);
		return mc;
	}
	/** 배경: 일러스트가 있으면 그것, 원작 영웅이 아니면 어두운 배경 + 영웅 그림을 크게 (원작 영웅은 게임 그림 그대로) */
	static void portrait(Object sc, JsonValue h) throws Exception {
		if (big != null) { if (big.parent != null) big.parent.remove(big); big = null; }
		Image bg = (Image) field(sc, "background");
		if (bg == null) return;
		Image ill = illust(h);
		if (ill == null && vanilla(h)) return;
		if (!PixelScene.landscape()) return;          // 세로 화면은 게임도 배경을 숨김
		JsonValue s = h.get("select");
		String fit = s == null ? "right" : s.getString("fit", "right");
		float left = Math.max(100, Camera.main.width / 3f);
		Image img;
		if (ill != null && fit.equals("full")) {
			// 화면 높이에 맞춰 가운데 (원작 일러스트처럼 — 왼쪽은 글자 쪽 그늘에 가려짐)
			img = ill;
			float k = Camera.main.height / img.height;
			img.scale.set(k);
			img.x = (Camera.main.width - img.width * k) / 2f;
			img.y = 0;
		} else {
			img = ill != null ? ill : icon(h);
			if (ill == null) img.scale.set(1);
			float room = Math.min((Camera.main.height * (ill != null ? 0.9f : 0.6f)) / img.height, ((Camera.main.width - left) * (ill != null ? 0.9f : 0.6f)) / img.width);
			// 작은 도트 그림은 정수 배로 (흐려지지 않게)
			float k = img.width <= 160 && img.height <= 160 ? Math.max(1, (int) room) : room;
			img.scale.set(k);
			img.x = left + (Camera.main.width - left - img.width * k) / 2f;
			img.y = (Camera.main.height - img.height * k) / 2f;
		}
		bg.texture(com.watabou.gltextures.TextureCache.createSolid(0xFF1d1e20));
		bg.frame(0, 0, 800, 450);
		bg.resetColor();
		PixelScene.align(img);
		((PixelScene) sc).addToBack(img);
		((PixelScene) sc).addToBack(bg);    // 배경이 맨 뒤
		big = img;
	}

	static Object field(Object o, String n) throws Exception {
		java.lang.reflect.Field f = HeroSelectScene.class.getDeclaredField(n);
		f.setAccessible(true);
		return f.get(o);
	}

	static com.shatteredpixel.shatteredpixeldungeon.ui.IconButton myInfo;   // 새 영웅의 정보 버튼 (게임 버튼은 직업 정보 창을 엶)
	static void infoButton(Object sc, JsonValue h) throws Exception {
		if (myInfo != null) { if (myInfo.parent != null) myInfo.parent.remove(myInfo); myInfo = null; }
		Component info = (Component) field(sc, "infoButton");
		if (info == null || (vanilla(h) && sel(h, "info").trim().isEmpty())) return;   // 원작 영웅은 게임 정보 창 (정보 글자를 정하면 그것)
		final JsonValue hh = h;
		myInfo = new com.shatteredpixel.shatteredpixeldungeon.ui.IconButton(com.shatteredpixel.shatteredpixeldungeon.ui.Icons.get(com.shatteredpixel.shatteredpixeldungeon.ui.Icons.INFO)) {
			@Override protected void onClick() {
				super.onClick();
				Window w = new WndTitledMessage(HeroSelect.icon(hh), name(hh), fullDesc(hh));
				if (PixelScene.landscape()) w.offset(Camera.main.width / 6, 0);
				ShatteredPixelDungeon.scene().addToFront(w);
			}
		};
		myInfo.setRect(info.left(), info.top(), info.width(), info.height());
		info.visible = info.active = false;
		((PixelScene) sc).add(myInfo);
	}
	static String fullDesc(JsonValue h) {
		if (!sel(h, "info").trim().isEmpty()) return sel(h, "info");
		String d = h.getString("desc", "").replace("\\n", "\n");
		return d.trim().isEmpty() ? h.getString("title", " ") : d;
	}

	static void labels(Object sc, JsonValue h) throws Exception {
		String name = name(h);
		if (PixelScene.landscape()) {
			RenderedTextBlock heroName = (RenderedTextBlock) field(sc, "heroName");
			RenderedTextBlock heroDesc = (RenderedTextBlock) field(sc, "heroDesc");
			Component info = (Component) field(sc, "infoButton");
			StyledButton start = (StyledButton) field(sc, "startBtn");
			float leftPortion = Math.max(100, Camera.main.width / 3f);
			if (heroName != null) {
				heroName.text(name);
				heroName.hardlight(Window.TITLE_COLOR);
				heroName.setPos((leftPortion - heroName.width() - 20) / 2f, heroName.top());
				PixelScene.align(heroName);
			}
			if (heroDesc != null && heroName != null) {
				heroDesc.text(desc(h));
				heroDesc.maxWidth(80);
				heroDesc.setPos((leftPortion - heroDesc.width()) / 2f, heroName.bottom() + 5);
				while (start != null && start.top() < heroDesc.bottom() && heroDesc.maxWidth() < leftPortion) {
					heroDesc.maxWidth(heroDesc.maxWidth() + 10);
					heroDesc.setPos(Math.max(0, (leftPortion - heroDesc.width()) / 2f), heroName.bottom() + 5);
				}
				PixelScene.align(heroDesc);
			}
			if (info != null && heroName != null) {
				info.setPos(heroName.right(), heroName.top() + (heroName.height() - info.height()) / 2f);
				PixelScene.align(info);
			}
		} else {
			StyledButton start = (StyledButton) field(sc, "startBtn");
			Component info = (Component) field(sc, "infoButton");
			Component opts = (Component) field(sc, "btnOptions");
			if (start != null) {
				start.text(name);
				start.setSize(start.reqWidth() + 8, 21);
				start.setPos((Camera.main.width - start.width()) / 2f, start.top());
				PixelScene.align(start);
				if (info != null) info.setPos(start.right(), start.top());
				if (opts != null) opts.setPos(start.left() - opts.width(), start.top());
			}
		}
	}

	/** 영웅 버튼 (게임의 HeroBtn 과 같은 모양) */
	static class HeroBtn extends StyledButton {
		final Object sc; final JsonValue h; final String id; final HeroClass cl;
		HeroBtn(Object sc, JsonValue h) {
			super(Chrome.Type.GREY_BUTTON_TR, "");
			this.sc = sc; this.h = h; this.id = h.getString("id", ""); this.cl = classOf(h);
			icon(HeroSelect.icon(h));
		}
		boolean locked() { return vanilla(h) && !cl.isUnlocked(); }
		@Override public void update() {
			super.update();
			// 전에 고른 직업으로 화면이 열리면 → 그 직업의 영웅 (없으면 첫 영웅) 으로 다시 고름
			if (!initDone && sc == scene) {
				initDone = true;
				if (GamesInProgress.selectedClass != null) {
					JsonValue pickH = null;
					for (JsonValue e : entries()) if (classOf(e) == GamesInProgress.selectedClass) { pickH = e; break; }
					if (pickH == null) pickH = entries().get(0);
					select(sc, pickH);
				}
			}
			if (icon != null) icon.brightness(id.equals(selected) && cl == GamesInProgress.selectedClass ? 1f : locked() ? 0.1f : 0.6f);
		}
		@Override protected void onClick() {
			super.onClick();
			if (locked()) { ShatteredPixelDungeon.scene().addToFront(new WndMessage(cl.unlockMsg())); return; }
			if (id.equals(selected) && GamesInProgress.selectedClass == cl) {
				Window w = vanilla(h) && sel(h, "info").trim().isEmpty() ? new WndHeroInfo(cl) : new WndTitledMessage(HeroSelect.icon(h), name(h), fullDesc(h));
				if (PixelScene.landscape()) w.offset(Camera.main.width / 6, 0);
				ShatteredPixelDungeon.scene().addToFront(w);
			} else select(sc, h);
		}
	}
}
