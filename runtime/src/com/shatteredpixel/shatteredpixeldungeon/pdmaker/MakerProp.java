/*
 * 맵 오브젝트 (props/<id>.json) — 맵 위에 놓는 물건: 상자·바위·레버·문짝 같은 것.
 *   · 그림(표시): sprite { sheet, frame:[w,h], scale(0 = 설치 칸에 맞춤 · 1 = 그림 크기 그대로: 16px 이 한 칸), ox, oy(px 옮김), over(윗부분이 캐릭터를 가림) }
 *       — 설치 칸의 아래 가운데에 맞춰 그림. 그림이 설치 칸보다 크면 위로(옆으로) 솟음 (예: 가로등 = 설치 1칸, 표시 1×2칸)
 *   · 설치 칸: foot [가로, 세로] (기본 1×1) — 놓은 칸이 왼쪽 아래. 막힌 상태면 이 칸들이 모두 막힘 (밀 수 있음이면 통째로 한 칸씩 밀림)
 *   · 상태 여러 개: states[i] { name, frame 또는 anim(sprite.anims { 이름: { frames, fps, loop } } 의 이름 — 예전 형식 frames+fps 도 읽음), solid(막힘), switch(이 상태일 때 켜지는 스위치) }
 *   · 밀기: pushable — 영웅이 옆에서 누르면 반대쪽으로 한 칸 밀림 (막혀 있으면 안 밀림)
 *       goal { terrain, switch, event } — 그 지형 위로 밀어 올리면 스위치 켜짐 · 이벤트
 *   · 상호작용: interact 'next'(다음 상태로) · 'event'(이벤트 실행) · 'none', event, loop, cond
 *   · 밟기: stepOn 'next' · 'event' (지나갈 수 있는 상태일 때 영웅이 올라서면)
 *
 * 게임의 CustomTilemap 으로 층에 저장됩니다 (안개 아래에 그려짐). 막힌 상태의 칸은 지형이 CUSTOM_DECO(막힘) 가 되고,
 * 지나갈 수 있는 상태면 원래 지형으로 돌아갑니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.TextureFilm;
import com.watabou.noosa.Tilemap;
import com.watabou.utils.Bundle;

public class MakerProp extends CustomTilemap {

	public String propId = "";
	public int state = 0;
	/** 이 오브젝트가 놓이기 전의 지형 (밀려 나가거나 지나갈 수 있게 되면 되돌림) */
	public int under = Terrain.EMPTY;

	public MakerProp() { }

	JsonValue def() { return MakerRuntime.props.get(propId); }
	JsonValue st() {
		JsonValue d = def(); JsonValue ss = d == null ? null : d.get("states");
		return ss == null || ss.size == 0 ? null : ss.get(Math.max(0, Math.min(state, ss.size - 1)));
	}
	int states() { JsonValue d = def(); return d == null || d.get("states") == null ? 1 : Math.max(1, d.get("states").size); }
	public boolean solid() { JsonValue s = st(); return s == null || s.getBoolean("solid", true); }
	int cell(Level l) { return tileX + tileY * l.width(); }

	// ------------------------------------------------------------ 그림

	/** 그림 하나를 그리는 타일맵 (게임이 CustomTilemap 에서 Tilemap 을 돌려받으므로 그 모양만 빌림) */
	static class Vis extends Tilemap {
		Image img; int[] frames = {0}; float delay = 0, timer = 0; int cur = 0, step = 0, mode = 0; TextureFilm film;   // mode: 0 반복 · 1 한 번 · 2 왕복
		String key = "";
		Image light; JsonValue lightCfg;   // 빛 레이어 (<시트>_light.png): 그림 위에 덧셈 합성
		Vis(Object tx, int fw, int fh) { super(tx, new TextureFilm(tx, fw, fh)); film = new TextureFilm(tx, fw, fh); img = new Image(tx); }
		MakerBloom bloom; int fw0 = 16, fh0 = 16;
		CustomTilemap tile;   // 이 그림의 맵 오브젝트 (빛 레이어 · 번짐은 영웅이 지금 보는 칸일 때만 — 다른 방에서 빛이 남아 보이지 않게)
		void light(JsonValue sp) { try { Object lt = sp == null ? null : MakerRuntime.lightTexture(sp.getString("sheet", ""), sp.getString("lightMode", "add")); if (lt != null) { light = new Image(lt); lightCfg = sp;
			JsonValue fr = sp.get("frame"); if (fr != null && fr.size >= 2) { fw0 = Math.max(1, fr.getInt(0)); fh0 = Math.max(1, fr.getInt(1)); }
			bloom = MakerBloom.get(sp.getString("sheet", ""), fw0, fh0, MakerBloom.radius(sp)); } } catch (Throwable ignored) { } }
		void show(int[] fr, int fps) { show(fr, fps, 0); }
		/** 같은 애니메이션을 다시 걸면(밀기 · 새로 고침) 처음부터 다시 재생하지 않고 이어감 */
		void show(int[] fr, int fps, int md) {
			int[] f = fr == null || fr.length == 0 ? new int[]{0} : fr;
			String k = java.util.Arrays.toString(f) + "@" + fps + "/" + md;
			if (k.equals(key)) { frame(); return; }
			boolean first = key.isEmpty();
			key = k; frames = f; mode = md; delay = frames.length > 1 && fps > 0 ? 1f / fps : 0; cur = 0; step = 0; timer = 0;
			if (first && mode == 1) { cur = frames.length - 1; delay = 0; }   // 층에 들어올 때(저장 불러오기 포함)는 '한 번만' 애니메이션을 다시 틀지 않고 끝 모습으로
			frame();
		}
		/** part: 0 = 전체 · 1 = 아랫부분만 · 2 = 윗부분만.  cut = 위에서부터 잘리는 자리 (0~1) */
		int part = 0; float cut = 0;
		void frame() { try {
			com.watabou.utils.RectF r = film.get(frames[cur]);
			if (part != 0 && r != null) { float m = r.top + (r.bottom - r.top) * cut; r = part == 2 ? new com.watabou.utils.RectF(r.left, r.top, r.right, m) : new com.watabou.utils.RectF(r.left, m, r.right, r.bottom); }
			img.frame(r);
			if (light != null) light.frame(r);
		} catch (Exception ignored) { } }
		@Override public void update() {
			super.update();
			if (delay > 0 && (timer += Game.elapsed) >= delay) {
				timer -= delay; if (timer > delay) timer = 0; step++;
				int n = frames.length;
				if (mode == 1) { cur = Math.min(n - 1, step); if (step >= n - 1) delay = 0; }
				else if (mode == 2) { int c = step % (2 * n - 2); cur = c < n ? c : 2 * n - 2 - c; }
				else cur = step % n;
				frame();
			}
		}
		@Override public void draw() { if (img != null && visible) { img.camera = camera(); img.draw();
			if (light != null && img.visible && (tile == null || MakerLights.seenCell(tile.tileX, tile.tileY))) { light.camera = img.camera; light.x = img.x; light.y = img.y; light.scale.set(img.scale.x, img.scale.y); MakerRuntime.drawLight(light, MakerRuntime.lightAmount(lightCfg), lightCfg == null ? "add" : lightCfg.getString("lightMode", "add"));
				if (bloom != null && part != 2) { try { bloom.draw(frames[cur], img.x, part == 1 ? img.y - cut * fh0 * img.scale.y : img.y, img.scale.x, MakerRuntime.lightAmount(lightCfg) * MakerBloom.power(lightCfg), img.camera); } finally { MakerBloom.done(); } } } } }
	}

	@Override
	public Tilemap create() {
		if (vis != null && vis.alive) vis.killAndErase();
		vis = null;
		JsonValue d = def(); JsonValue sp = d == null ? null : d.get("sprite");
		Object tx = sp == null ? null : MakerRuntime.texture(sp.getString("sheet", ""));
		int fw = 16, fh = 16;
		if (sp != null && sp.get("frame") != null && sp.get("frame").size >= 2) { fw = Math.max(1, sp.get("frame").getInt(0)); fh = Math.max(1, sp.get("frame").getInt(1)); }
		if (tx == null) tx = com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES;   // 그림이 없으면 게임 지형 그림 첫 칸
		vis = new Vis(tx, fw, fh);
		((Vis) vis).tile = this;
		((Vis) vis).light(sp);
		refresh();
		return vis;
	}
	int[] foot() { JsonValue d = def(), f = d == null ? null : d.get("foot"); return new int[]{ f != null && f.size >= 2 ? Math.max(1, f.getInt(0)) : 1, f != null && f.size >= 2 ? Math.max(1, f.getInt(1)) : 1 }; }
	boolean over() { JsonValue d = def(), sp = d == null ? null : d.get("sprite"); return sp != null && sp.getBoolean("over", false); }
	/** 지금 상태·위치대로 그림 맞추기 */
	void refresh() {
		if (vis instanceof Vis) layout((Vis) vis, over() ? 1 : 0);
		MakerPropTop t = MakerPropTop.of(Dungeon.level, this);
		if (t != null) t.sync(this);
	}
	/** part: 0 전체 · 1 설치 칸 높이까지의 아랫부분 · 2 그 위로 솟은 윗부분 */
	void layout(Vis v, int part) {
		JsonValue d = def(), s = st(), sp = d == null ? null : d.get("sprite");
		int[] fr = null; int fps = 0, md = 0;
		if (s != null) {
			JsonValue an = sp == null || sp.get("anims") == null ? null : sp.get("anims").get(s.getString("anim", ""));
			if (an != null && an.get("frames") != null && an.get("frames").size > 0) { fr = an.get("frames").asIntArray(); fps = an.getInt("fps", 6); md = an.getBoolean("loop", true) ? 0 : 1; }   // sprite.anims 의 이름
			else if (s.get("frames") != null && s.get("frames").size > 0) { fr = s.get("frames").asIntArray(); fps = s.getInt("fps", 6); String a = s.getString("anim", "loop"); md = "once".equals(a) ? 1 : "pingpong".equals(a) ? 2 : 0; }   // 예전 형식
			else fr = new int[]{ s.getInt("frame", 0) };
		}
		int[] ft = foot();
		v.part = 0; v.show(fr, fps, md);
		float fw = v.img.width, fh = v.img.height;
		float sc = sp == null ? 0 : sp.getFloat("scale", 0f);
		if (sc <= 0) sc = Math.min(1f, Math.min(ft[0] * SIZE / fw, ft[1] * SIZE / fh));
		float left = tileX * SIZE + (ft[0] * SIZE - fw * sc) / 2f + (sp == null ? 0 : sp.getFloat("ox", 0)), top = tileY * SIZE + SIZE - fh * sc + (sp == null ? 0 : sp.getFloat("oy", 0));
		float topPx = Math.max(0, fh * sc - ft[1] * SIZE);   // 설치 칸 위로 솟은 높이 (화면 px)
		v.cut = fh * sc <= 0 ? 0 : topPx / (fh * sc);
		v.part = part; v.frame();
		v.img.scale.set(sc);
		v.img.x = left; v.img.y = part == 1 ? top + topPx : top;
		v.img.visible = !(part == 2 && topPx <= 0);
		v.x = tileX * SIZE; v.y = tileY * SIZE;
	}

	@Override public String name(int x, int y) { JsonValue d = def(); return d == null ? null : d.getString("name", propId); }
	@Override public String desc(int x, int y) { JsonValue d = def(); String t = d == null ? "" : d.getString("desc", ""); return t.isEmpty() ? null : t; }

	// ------------------------------------------------------------ 놓기 · 찾기

	public static MakerProp at(Level l, int cell) {
		if (l == null || cell < 0) return null;
		int x = cell % l.width(), y = cell / l.width();
		for (CustomTilemap t : l.customTiles) if (t instanceof MakerProp) {
			MakerProp p = (MakerProp) t; int[] f = p.foot();
			if (x >= p.tileX && x < p.tileX + f[0] && y <= p.tileY && y > p.tileY - f[1]) return p;
		}
		return null;
	}
	/** 설치 칸들 (놓은 칸이 왼쪽 아래) — 층 밖으로 나가는 칸은 뺌 */
	java.util.List<Integer> cells(Level l) {
		java.util.List<Integer> r = new java.util.ArrayList<>(); int[] f = foot();
		for (int j = 0; j < f[1]; j++) for (int i = 0; i < f[0]; i++) { int x = tileX + i, y = tileY - j; if (x >= 0 && y >= 0 && x < l.width() && y < l.height()) r.add(x + y * l.width()); }
		return r;
	}
	/** 설치 칸마다 놓이기 전의 지형 (첫 칸은 under) */
	public int[] unders = null;

	/** 층을 만들 때 놓기 */
	public static MakerProp place(Level l, String id, int cell) {
		JsonValue d = MakerRuntime.props.get(id);
		if (d == null) { MakerRuntime.log("없는 맵 오브젝트: " + id); return null; }
		if (cell < 0 || cell >= l.length() || at(l, cell) != null) return null;
		MakerProp p = new MakerProp();
		p.propId = id; p.state = d.getInt("start", 0);
		p.pos(cell, l);
		p.under = l.map[cell];
		java.util.List<Integer> cs = p.cells(l);
		for (int c : cs) if (c != cell && at(l, c) != null) return null;   // 다른 오브젝트와 겹침
		p.unders = new int[cs.size()];
		for (int i = 0; i < cs.size(); i++) p.unders[i] = l.map[cs.get(i)];
		l.customTiles.add(p);
		if (p.over()) { MakerPropTop t = new MakerPropTop(); t.propId = id; t.pos(cell, l); l.customWalls.add(t); }
		p.applyTerrain(l, false);
		p.applySwitch(-1);
		return p;
	}
	/** 상태에 맞게 칸의 지형 바꾸기 (막힘 = CUSTOM_DECO, 아니면 원래 지형) */
	void applyTerrain(Level l, boolean live) {
		java.util.List<Integer> cs = cells(l);
		for (int i = 0; i < cs.size(); i++) {
			int c = cs.get(i), u = i == 0 || unders == null || i >= unders.length ? under : unders[i];
			Level.set(c, solid() ? Terrain.CUSTOM_DECO : u, l);
			if (live && l == Dungeon.level) GameScene.updateMap(c);
		}
		if (live && l == Dungeon.level) Dungeon.observe();
	}
	/** 상태마다 정한 스위치: 지금 상태 것은 켜고, 앞 상태 것은 끔 */
	void applySwitch(int prev) {
		JsonValue d = def(); if (d == null || d.get("states") == null) return;
		JsonValue ss = d.get("states");
		if (prev >= 0 && prev < ss.size) { String o = ss.get(prev).getString("switch", ""); if (!o.isEmpty()) StoryState.setSw(o, false); }
		JsonValue s = st(); String n = s == null ? "" : s.getString("switch", "");
		if (!n.isEmpty()) StoryState.setSw(n, true);
	}
	/** 상태 바꾸기 (게임 중) */
	public void setState(int n) {
		int prev = state;
		state = Math.max(0, Math.min(n, states() - 1));
		applyTerrain(Dungeon.level, true);
		applySwitch(prev);
		refresh();
	}
	/** 코드·이벤트에서: 지금 층의 그 오브젝트(들)의 상태 바꾸기 */
	public static void setState(String id, int n) {
		if (Dungeon.level == null) return;
		for (CustomTilemap t : Dungeon.level.customTiles) if (t instanceof MakerProp && ((MakerProp) t).propId.equals(id)) ((MakerProp) t).setState(n);
	}

	// ------------------------------------------------------------ 영웅이 건드릴 때

	/** 영웅이 옆에서 눌렀을 때 (Hero.actMove 연결 줄 → LevelHooks.propInteract). true = 한 턴 씀 */
	boolean interact(Hero h, int dst) {
		JsonValue d = def(); if (d == null) return false;
		Level l = Dungeon.level;
		int c = cell(l);
		if (!Cond.eval(d.getString("cond", ""), StoryState.globalResolver())) return false;
		if (d.getBoolean("pushable", false)) {
			// 누른 칸 쪽으로 한 칸: 설치 칸 전체가 옮겨 갈 자리가 모두 비어 있어야 함 (제 칸과 겹치는 자리는 괜찮음)
			int dx = Integer.signum(dst % l.width() - h.pos % l.width()), dy = Integer.signum(dst / l.width() - h.pos / l.width());
			java.util.List<Integer> old = cells(l);
			boolean ok = dx != 0 || dy != 0;
			for (int oc : old) {
				int nx = oc % l.width() + dx, ny = oc / l.width() + dy, t = nx + ny * l.width();
				if (nx < 0 || ny < 0 || nx >= l.width() || ny >= l.height()) { ok = false; break; }
				if (old.contains(t)) continue;
				if (!l.passable[t] || l.solid[t] || Actor.findChar(t) != null || at(l, t) != null || l.heaps.get(t) != null) { ok = false; break; }
			}
			if (!ok) { GLog.i(MakerRuntime.term("prop.stuck", "꿈쩍도 하지 않는다.")); return true; }
			for (int i = 0; i < old.size(); i++) Level.set(old.get(i), i == 0 || unders == null || i >= unders.length ? under : unders[i], l);
			MakerPropTop top = MakerPropTop.of(l, this);
			pos(tileX + dx, tileY + dy);
			if (top != null) top.pos(tileX, tileY);
			java.util.List<Integer> now = cells(l);
			unders = new int[now.size()];
			for (int i = 0; i < now.size(); i++) unders[i] = l.map[now.get(i)];
			under = unders.length > 0 ? unders[0] : under;
			for (int nc : now) Level.set(nc, solid() ? Terrain.CUSTOM_DECO : l.map[nc], l);
			for (int oc : old) GameScene.updateMap(oc);
			for (int nc : now) GameScene.updateMap(nc);
			refresh();
			Dungeon.observe();
			MakerAudio.playSe(d.getString("pushSound", "game:sounds/rocks.mp3"));
			JsonValue g = d.get("goal");
			if (g != null && g.getInt("terrain", -1) >= 0) {
				boolean on = under == g.getInt("terrain", -1);
				String sw = g.getString("switch", "");
				if (!sw.isEmpty()) StoryState.setSw(sw, on);
				if (on && !g.getString("event", "").isEmpty() && !EventInterpreter.busy()) EventInterpreter.runEvent(g.getString("event", ""), null);
			}
			return true;
		}
		String mode = d.getString("interact", "none");
		if (mode.equals("next")) {
			int n = state + 1;
			if (n >= states()) { if (!d.getBoolean("loop", true)) return false; n = 0; }
			setState(n);
			String snd = d.getString("sound", ""); if (!snd.isEmpty()) MakerAudio.playSe(snd);
		} else if (!mode.equals("event")) return false;
		String ev = d.getString("event", "");
		if (!ev.isEmpty() && !EventInterpreter.busy()) EventInterpreter.runEvent(ev, null);
		return true;
	}
	/** 지나갈 수 있는 상태일 때 영웅이 올라섬 (LevelHooks.onOccupy) */
	void stepOn() {
		JsonValue d = def(); if (d == null || solid()) return;
		String mode = d.getString("stepOn", "none");
		if (mode.equals("next")) {
			int n = state + 1;
			if (n >= states()) { if (!d.getBoolean("loop", true)) return; n = 0; }
			JsonValue ns = d.get("states").get(n);
			if (ns.getBoolean("solid", true)) return;   // 올라선 채로 막힌 상태가 되면 갇힘 → 바꾸지 않음
			setState(n);
		} else if (!mode.equals("event")) return;
		String ev = d.getString("stepEvent", "");
		if (!ev.isEmpty() && !EventInterpreter.busy()) EventInterpreter.runEvent(ev, null);
	}

	// ------------------------------------------------------------ 저장

	@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("pdm_prop", propId); b.put("pdm_state", state); b.put("pdm_under", under); if (unders != null) b.put("pdm_unders", unders); }
	@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); propId = b.getString("pdm_prop"); state = b.getInt("pdm_state"); under = b.getInt("pdm_under"); if (b.contains("pdm_unders")) unders = b.getIntArray("pdm_unders"); }
}
