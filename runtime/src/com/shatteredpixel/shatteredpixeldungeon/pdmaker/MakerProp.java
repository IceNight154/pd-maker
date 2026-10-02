/*
 * 맵 오브젝트 (props/<id>.json) — 맵 위에 놓는 물건: 상자·바위·레버·문짝 같은 것.
 *   · 그림: sprite { sheet, frame:[w,h], scale(0 = 한 칸에 맞춤) } — 칸 아래 가운데에 맞춰 그림
 *   · 상태 여러 개: states[i] { name, frame 또는 frames+fps, solid(막힘), switch(이 상태일 때 켜지는 스위치) }
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
		Image img; int[] frames = {0}; float delay = 0, timer = 0; int cur = 0; TextureFilm film;
		Vis(Object tx, int fw, int fh) { super(tx, new TextureFilm(tx, fw, fh)); film = new TextureFilm(tx, fw, fh); img = new Image(tx); }
		void show(int[] fr, int fps) { frames = fr == null || fr.length == 0 ? new int[]{0} : fr; delay = frames.length > 1 && fps > 0 ? 1f / fps : 0; cur = 0; timer = 0; frame(); }
		void frame() { try { img.frame(film.get(frames[cur])); } catch (Exception ignored) { } }
		@Override public void update() {
			super.update();
			if (delay > 0 && (timer += Game.elapsed) >= delay) { timer -= delay; cur = (cur + 1) % frames.length; frame(); }
		}
		@Override public void draw() { if (img != null && visible) { img.camera = camera(); img.draw(); } }
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
		refresh();
		return vis;
	}
	/** 지금 상태·위치대로 그림 맞추기 */
	void refresh() {
		if (!(vis instanceof Vis)) return;
		Vis v = (Vis) vis;
		JsonValue d = def(), s = st(), sp = d == null ? null : d.get("sprite");
		int[] fr = null; int fps = 0;
		if (s != null) {
			if (s.get("frames") != null && s.get("frames").size > 0) { fr = s.get("frames").asIntArray(); fps = s.getInt("fps", 6); }
			else fr = new int[]{ s.getInt("frame", 0) };
		}
		v.show(fr, fps);
		float fw = v.img.width, fh = v.img.height;
		float sc = sp == null ? 0 : sp.getFloat("scale", 0f);
		if (sc <= 0) sc = Math.min(1f, Math.min(SIZE / fw, SIZE / fh));
		v.img.scale.set(sc);
		v.img.x = tileX * SIZE + (SIZE - fw * sc) / 2f;
		v.img.y = tileY * SIZE + SIZE - fh * sc;
		v.x = tileX * SIZE; v.y = tileY * SIZE;
	}

	@Override public String name(int x, int y) { JsonValue d = def(); return d == null ? null : d.getString("name", propId); }
	@Override public String desc(int x, int y) { JsonValue d = def(); String t = d == null ? "" : d.getString("desc", ""); return t.isEmpty() ? null : t; }

	// ------------------------------------------------------------ 놓기 · 찾기

	public static MakerProp at(Level l, int cell) {
		if (l == null || cell < 0) return null;
		int x = cell % l.width(), y = cell / l.width();
		for (CustomTilemap t : l.customTiles) if (t instanceof MakerProp && t.tileX == x && t.tileY == y) return (MakerProp) t;
		return null;
	}
	/** 층을 만들 때 놓기 */
	public static MakerProp place(Level l, String id, int cell) {
		JsonValue d = MakerRuntime.props.get(id);
		if (d == null) { MakerRuntime.log("없는 맵 오브젝트: " + id); return null; }
		if (cell < 0 || cell >= l.length() || at(l, cell) != null) return null;
		MakerProp p = new MakerProp();
		p.propId = id; p.state = d.getInt("start", 0);
		p.pos(cell, l);
		p.under = l.map[cell];
		l.customTiles.add(p);
		p.applyTerrain(l, false);
		p.applySwitch(-1);
		return p;
	}
	/** 상태에 맞게 칸의 지형 바꾸기 (막힘 = CUSTOM_DECO, 아니면 원래 지형) */
	void applyTerrain(Level l, boolean live) {
		int c = cell(l);
		Level.set(c, solid() ? Terrain.CUSTOM_DECO : under, l);
		if (live && l == Dungeon.level) { GameScene.updateMap(c); Dungeon.observe(); }
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
	boolean interact(Hero h) {
		JsonValue d = def(); if (d == null) return false;
		Level l = Dungeon.level;
		int c = cell(l);
		if (!Cond.eval(d.getString("cond", ""), StoryState.globalResolver())) return false;
		if (d.getBoolean("pushable", false)) {
			int dx = c % l.width() - h.pos % l.width(), dy = c / l.width() - h.pos / l.width();
			int tx = tileX + dx, ty = tileY + dy, t = tx + ty * l.width();
			boolean ok = tx >= 0 && ty >= 0 && tx < l.width() && ty < l.height() && l.passable[t] && !l.solid[t]
					&& Actor.findChar(t) == null && at(l, t) == null && l.heaps.get(t) == null;
			if (!ok) { GLog.i(MakerRuntime.term("prop.stuck", "꿈쩍도 하지 않는다.")); return true; }
			Level.set(c, under, l);
			under = l.map[t];
			pos(t, l);
			Level.set(t, solid() ? Terrain.CUSTOM_DECO : under, l);
			GameScene.updateMap(c); GameScene.updateMap(t);
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

	@Override public void storeInBundle(Bundle b) { super.storeInBundle(b); b.put("pdm_prop", propId); b.put("pdm_state", state); b.put("pdm_under", under); }
	@Override public void restoreFromBundle(Bundle b) { super.restoreFromBundle(b); propId = b.getString("pdm_prop"); state = b.getInt("pdm_state"); under = b.getInt("pdm_under"); }
}
