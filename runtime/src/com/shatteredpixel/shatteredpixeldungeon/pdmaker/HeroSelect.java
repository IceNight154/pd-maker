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

	/** 게임 직업을 바탕으로 한 영웅(원작 영웅의 사본 등)에서, 프로젝트의 그 원작 영웅 데이터 (없으면 null) */
	static JsonValue baseHero(JsonValue h) {
		if (h == null || HeroRuntime.zeroBase(h)) return null;
		String cn = classOf(h).name();
		for (JsonValue o : MakerRuntime.heroes.values()) if (o != h && o.getString("id", "").equalsIgnoreCase(cn)) return o;
		return null;
	}
	/** 설명을 따로 쓰지 않은 영웅 — 원작 영웅이거나, 바탕 직업의 설명을 그대로 둔 사본 → 선택 화면에 게임의 짧은 직업 설명을 씀 */
	static boolean stockDesc(JsonValue h) {
		if (vanilla(h)) return true;
		if (HeroRuntime.zeroBase(h)) return false;
		String d = h.getString("desc", "").trim();
		if (d.isEmpty()) return true;
		JsonValue b = baseHero(h);
		if (b != null && d.equals(b.getString("desc", "").trim())) return true;
		try { return d.equals(classOf(h).desc().trim()); } catch (Throwable t) { return false; }
	}
	/** 그림을 바꾸지 않은 영웅 — 원작 영웅이거나, 바탕 직업의 시트를 그대로 쓰는 사본 → 선택 화면에 게임의 직업 일러스트를 그대로 둠 */
	static boolean stockArt(JsonValue h) {
		if (vanilla(h)) return true;
		if (HeroRuntime.zeroBase(h)) return false;
		JsonValue sp = h.get("sprite"); String sheet = sp == null ? "" : sp.getString("sheet", "");
		if (sheet.isEmpty()) return true;
		JsonValue b = baseHero(h); JsonValue bs = b == null ? null : b.get("sprite");
		if (bs != null && sheet.equals(bs.getString("sheet", ""))) return true;
		return sheet.equals("game:" + classOf(h).spritesheet());
	}

	/** 해금 조건 (영웅 편집기 unlock { mode, badge, key, cond, text }) — 잠겨 있으면 true.
	 *  mode: always(항상) · game(바탕 직업의 게임 규칙) · badge(게임 배지: 보스 처치·승리 등) · global(전역 스위치) · cond(조건식 — global.<이름> 등)
	 *  정하지 않았으면 원작 영웅은 game, 그 밖은 always */
	static boolean locked(JsonValue h) {
		try {
			JsonValue u = h.get("unlock");
			String mode = u == null ? "" : u.getString("mode", "");
			if (mode.isEmpty()) mode = vanilla(h) ? "game" : "always";
			switch (mode) {
				case "game": return !HeroRuntime.zeroBase(h) && !classOf(h).isUnlocked();
				case "badge": return !com.shatteredpixel.shatteredpixeldungeon.Badges.isUnlocked(com.shatteredpixel.shatteredpixeldungeon.Badges.Badge.valueOf(u.getString("badge", "VICTORY")));
				case "global": return !MakerDrops.global(u.getString("key", ""));
				case "cond": return !Cond.eval(u.getString("cond", ""), StoryState.globalResolver());
				default: return false;
			}
		} catch (Throwable t) { MakerRuntime.log("해금 조건 오류 (" + h.getString("id", "") + "): " + t); return false; }
	}
	static String lockText(JsonValue h) {
		JsonValue u = h.get("unlock");
		String t = u == null ? "" : u.getString("text", "").replace("\\n", "\n");
		if (!t.trim().isEmpty()) return t;
		String mode = u == null ? "game" : u.getString("mode", "game");
		if (mode.equals("game") || mode.isEmpty()) return classOf(h).unlockMsg();
		return name(h) + "\n\n" + MakerRuntime.term("hero.locked", "아직 잠겨 있습니다.");
	}

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
		if (stockDesc(h)) return classOf(h).shortDesc();
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
			// 영웅 시트의 가장 좋은 갑옷 줄(원작 선택 화면처럼), 가만히 있는 첫 프레임
			Image img = HeroRuntime.avatarOf(h, 6);
			if (img != null) { if (img.height > 20) img.scale.set(20f / img.height); return img; }
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
		if (ill == null && stockArt(h)) return;
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
		if (info == null || (vanilla(h) && gameInfo(h))) return;   // 원작 영웅은 게임 정보 창 (정보 글자·줄을 정하면 그것)
		final JsonValue hh = h;
		myInfo = new com.shatteredpixel.shatteredpixeldungeon.ui.IconButton(com.shatteredpixel.shatteredpixeldungeon.ui.Icons.get(com.shatteredpixel.shatteredpixeldungeon.ui.Icons.INFO)) {
			@Override protected void onClick() {
				super.onClick();
				Window w = infoWindow(hh);
				if (PixelScene.landscape()) w.offset(Camera.main.width / 6, 0);
				ShatteredPixelDungeon.scene().addToFront(w);
			}
		};
		myInfo.setRect(info.left(), info.top(), info.width(), info.height());
		info.visible = info.active = false;
		((PixelScene) sc).add(myInfo);
	}
	// ------------------------------------------------------------ 영웅 정보 창

	/** 정보 창의 줄: select.infoRows [{ icon(아이템 id · spd:게임 아이템), text }] → 없으면 select.info / 영웅 설명을 빈 줄마다 나눔 (아이콘 없음) */
	static boolean hasRows(JsonValue h) { JsonValue s = h.get("select"); return s != null && s.get("infoRows") != null && s.get("infoRows").size > 0; }
	/** 게임의 직업 정보 창을 그대로 쓰는 영웅: 원작 영웅 + 설명을 손대지 않은 사본 (정보 글자·줄을 정하지 않았을 때) */
	static boolean gameInfo(JsonValue h) { return stockDesc(h) && !hasRows(h) && sel(h, "info").trim().isEmpty(); }
	/** 영웅 정보 창 열기 */
	static Window infoWindow(JsonValue h) {
		if (gameInfo(h)) {
			WndHeroInfo w = new WndHeroInfo(classOf(h));
			if (!vanilla(h)) try {   // 사본: 제목만 영웅 이름으로
				java.lang.reflect.Field f = WndHeroInfo.class.getDeclaredField("heroInfo"); f.setAccessible(true);
				Object tab = f.get(w);
				java.lang.reflect.Field t = tab.getClass().getDeclaredField("title"); t.setAccessible(true);
				com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock tb = (com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock) t.get(tab);
				tb.text(name(h)); tb.setPos((120 - tb.width()) / 2f, tb.top());
			} catch (Throwable ignored) { }
			return w;
		}
		return new InfoWnd(h);
	}
	/** 게임의 직업 정보 창 첫 탭과 같은 모양: 제목 + (아이콘 · 글) 줄. 글의 _밑줄_ 은 노란 강조 */
	static class InfoWnd extends Window {
		static final int W = 120, M = 2;
		InfoWnd(JsonValue h) {
			com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock title = PixelScene.renderTextBlock(name(h), 9);
			title.hardlight(TITLE_COLOR);
			add(title);
			title.setPos((W - title.width()) / 2f, M);
			List<String> texts = new ArrayList<>(); List<Image> icons = new ArrayList<>();
			if (hasRows(h)) {
				for (JsonValue r : h.get("select").get("infoRows")) {
					String t = r.getString("text", "").replace("\\n", "\n");
					if (t.trim().isEmpty()) continue;
					texts.add(t); icons.add(rowIcon(r.getString("icon", "")));
				}
			} else {
				for (String t : fullDesc(h).split("\n\\s*\n")) if (!t.trim().isEmpty()) { texts.add(t.trim()); icons.add(null); }
			}
			boolean anyIcon = false; for (Image im : icons) if (im != null) anyIcon = true;
			float left = anyIcon ? 20 : M, pos = title.bottom() + 4 * M;
			for (int i = 0; i < texts.size(); i++) {
				com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock tb = PixelScene.renderTextBlock(texts.get(i), 6);
				tb.maxWidth((int) (W - left - M));
				tb.setPos(left, pos);
				add(tb);
				Image im = icons.get(i);
				if (im != null) {
					if (im.height() > 16 || im.width() > 16) im.scale.set(16f / Math.max(im.width, im.height));
					im.x = (20 - im.width()) / 2f; im.y = tb.top() + (tb.height() - im.height()) / 2f;
					PixelScene.align(im); add(im);
					if (im.height() > tb.height()) pos += (im.height() - tb.height());
				}
				pos = tb.bottom() + 4 * M;
			}
			resize(W, (int) Math.max(40, pos - 2 * M));
		}
		/** 줄 아이콘: 프로젝트 아이템 id · spd:게임 아이템 · 그림 파일(assets/… · game:…) */
		static Image rowIcon(String ref) {
			if (ref == null || ref.trim().isEmpty()) return null;
			try {
				if (ref.startsWith("assets/") || ref.startsWith("game:")) { Object t = MakerRuntime.texture(ref); return t == null ? null : new Image(t); }
				com.shatteredpixel.shatteredpixeldungeon.items.Item it = MakerItem.create(ref);
				return it == null ? null : new com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite(it.image(), null);
			} catch (Throwable t) { MakerRuntime.log("영웅 정보 아이콘 오류 (" + ref + "): " + t); return null; }
		}
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
		boolean locked() { return HeroSelect.locked(h); }
		@Override public void update() {
			super.update();
			// 전에 고른 직업으로 화면이 열리면 → 그 직업의 영웅 (없으면 첫 영웅) 으로 다시 고름
			if (!initDone && sc == scene) {
				initDone = true;
				if (GamesInProgress.selectedClass != null) {
					JsonValue pickH = null;
					for (JsonValue e : entries()) if (classOf(e) == GamesInProgress.selectedClass && !HeroSelect.locked(e)) { pickH = e; break; }
					if (pickH == null) for (JsonValue e : entries()) if (!HeroSelect.locked(e)) { pickH = e; break; }
					if (pickH == null) pickH = entries().get(0);
					select(sc, pickH);
				}
			}
			if (icon != null) icon.brightness(id.equals(selected) && cl == GamesInProgress.selectedClass ? 1f : locked() ? 0.1f : 0.6f);
		}
		@Override protected void onClick() {
			super.onClick();
			if (locked()) { ShatteredPixelDungeon.scene().addToFront(new WndMessage(lockText(h))); return; }
			if (id.equals(selected) && GamesInProgress.selectedClass == cl) {
				Window w = infoWindow(h);
				if (PixelScene.landscape()) w.offset(Camera.main.width / 6, 0);
				ShatteredPixelDungeon.scene().addToFront(w);
			} else select(sc, h);
		}
	}
}
