/*
 * PDMaker — 타일 효과(빛) 레이어: 사용자 테마 타일셋과 같은 이름의 _light.png (같은 칸 배치)를 지형 위에 겹쳐 그림.
 *   용암 · 수정 · 발광 이끼처럼 "그 타일 종류 전체"가 빛남. 합성 방식 · 세기 · 깜빡임은 테마의 lightMode / lightPower / lightPulse / lightPulseMin.
 *   지형 그림과 같은 규칙(DungeonTerrainTilemap)으로 칸마다 타일 번호를 고르므로 타일셋에 칠한 그대로 나오고, 안개(시야) 아래에 그려짐.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTerrainTilemap;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.Tilemap;

public class MakerTileLight extends CustomTilemap {

	public MakerTileLight() { }

	static JsonValue cfg() {
		String t = WorldGraph.theme(WorldGraph.current());
		return t != null && t.startsWith("custom:") ? LevelHooks.customTheme(t.substring(7)) : null;
	}
	static Object tex(JsonValue c) { return c == null ? null : MakerRuntime.lightTexture(c.getString("tiles", ""), c.getString("lightMode", "add")); }

	/** 게임 화면을 만들기 직전: 이 맵의 테마에 효과 레이어가 있으면 하나 넣고, 없으면 뺌 */
	public static void ensure(Level l) {
		try {
			if (l == null || l.customTiles == null) return;
			for (CustomTilemap t : l.customTiles.toArray(new CustomTilemap[0])) if (t instanceof MakerTileLight) l.customTiles.remove(t);
			if (!MakerRuntime.isActive() || tex(cfg()) == null) return;
			MakerTileLight t = new MakerTileLight();
			t.tileX = 0; t.tileY = 0; t.tileW = l.width(); t.tileH = l.height();
			l.customTiles.add(t);
		} catch (Throwable e) { MakerRuntime.log("타일 효과 레이어 오류: " + e); }
	}

	@Override public Tilemap create() {
		try {
			JsonValue c = cfg(); Object tx = tex(c);
			if (tx != null) { vis = LightMap.make(tx, c); vis.x = 0; vis.y = 0; return vis; }
		} catch (Throwable e) { MakerRuntime.log("타일 효과 레이어 오류: " + e); }
		vis = new Tilemap(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, new com.watabou.noosa.TextureFilm(com.shatteredpixel.shatteredpixeldungeon.Assets.Environment.TERRAIN_FEATURES, 16, 16));
		vis.visible = false;
		return vis;
	}
	// 칸 정보 창(살펴보기)에는 끼어들지 않음
	@Override public Image image(int tileX, int tileY) { return null; }
	@Override public String name(int tileX, int tileY) { return null; }
	@Override public String desc(int tileX, int tileY) { return null; }

	static class LightMap extends DungeonTerrainTilemap {
		JsonValue cfg; String mode = "add"; int[] last; float wait; MakerBloom bloom; float unit = 1;
		static LightMap make(Object tx, JsonValue cfg) throws Exception {
			java.lang.reflect.Field f = DungeonTerrainTilemap.class.getDeclaredField("instance"); f.setAccessible(true);
			Object prev = f.get(null);   // 게임이 "지형 그림"으로 기억하는 것을 바꾸지 않게 되돌려 놓음
			LightMap m;
			try { m = new LightMap(); } finally { f.set(null, prev); }
			m.cfg = cfg; m.mode = cfg == null ? "add" : cfg.getString("lightMode", "add");
			m.texture = tx instanceof SmartTexture ? (SmartTexture) tx : TextureCache.get(tx);
			m.last = Dungeon.level.map.clone();
			try { int tc = Math.max(1, m.texture.width / 16); m.unit = 16f / tc;   // 타일셋 1px 의 화면 크기 (한 칸 = 16)
				m.bloom = cfg == null ? null : MakerBloom.get(cfg.getString("tiles", ""), tc, tc, MakerBloom.radius(cfg) * tc / 16f); } catch (Throwable ignored) { }
			return m;
		}
		@Override public void update() {
			super.update();
			if ((wait -= Game.elapsed) > 0 || Dungeon.level == null || last == null) return;
			wait = 0.2f;
			int[] map = Dungeon.level.map; int w = Dungeon.level.width();
			if (map.length != last.length) return;
			for (int i = 0; i < map.length; i++) if (map[i] != last[i]) {   // 문이 열림 · 타일 바꾸기 → 그 칸과 이웃을 다시 고름
				last[i] = map[i];
				for (int d : new int[]{0, -1, 1, -w, w}) { int c = i + d; if (c >= 0 && c < map.length) try { updateMapCell(c); } catch (Throwable ignored) { } }
			}
		}
		@Override public void draw() {
			float amount = MakerRuntime.lightAmount(cfg);
			if (amount <= 0.01f) return;
			try {
				float left = amount; int n = 0;
				while (left > 0.01f && n++ < 3) { float k = Math.min(1f, left); left -= 1f; MakerRuntime.lightBlend(this, k, mode); super.draw(); }
			} finally { com.watabou.glwrap.Blending.setNormalMode(); }
			if (bloom == null || data == null) return;
			try {   // 번짐: 화면에 보이는 칸(+둘레) 가운데 빛이 있는 타일마다
				com.watabou.noosa.Camera c = camera(); if (c == null) return;
				float am = amount * MakerBloom.power(cfg);
				int mg = 3, x0 = Math.max(0, (int) Math.floor(c.scroll.x / SIZE) - mg), y0 = Math.max(0, (int) Math.floor(c.scroll.y / SIZE) - mg);
				int x1 = Math.min(mapWidth - 1, (int) Math.ceil((c.scroll.x + c.width) / SIZE) + mg), y1 = Math.min(mapHeight - 1, (int) Math.ceil((c.scroll.y + c.height) / SIZE) + mg);
				for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) { int v = data[y * mapWidth + x]; if (bloom.has(v) && MakerLights.seenCell(x, y)) bloom.draw(v, x * SIZE, y * SIZE, unit, am, c); }   // 지금 보는 칸만
			} catch (Throwable ignored) { } finally { MakerBloom.done(); }
		}
	}
}
