/*
 * PDMaker — 맵 세부 그림: 직접 그린 맵 전체를 한 장의 그림으로 덮음
 *   노드 데이터  paint { image: "assets/maps/<id>.png", enabled }   (칸당 16px, 가로×세로 = 맵 크기×16)
 *   켜져 있으면 타일셋·물 그림은 투명한 그림으로 바뀌고(지형 판정은 그대로), 이 그림만 보임
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Tilemap;

import java.lang.reflect.Field;
import java.util.Map;

public class MakerPaint extends CustomTilemap {

	static boolean on(JsonValue f) {
		if (f == null || f.get("paint") == null) return false;
		JsonValue p = f.get("paint");
		String img = p.getString("image", "");
		return p.getBoolean("enabled", true) && !img.isEmpty() && MakerRuntime.root().child(img).exists();
	}

	/** 완전히 투명한 256×256 그림 (타일셋·물 자리에 대신 씀) */
	@SuppressWarnings("unchecked")
	static String blank() {
		String key = "pdmaker:blank";
		try {
			Field fd = TextureCache.class.getDeclaredField("all");
			fd.setAccessible(true);
			Map<Object, SmartTexture> all = (Map<Object, SmartTexture>) fd.get(null);
			if (!all.containsKey(key)) all.put(key, new SmartTexture(new Pixmap(256, 256, Pixmap.Format.RGBA8888)));
		} catch (Throwable t) { MakerRuntime.log("빈 그림 준비 실패: " + t); }
		return key;
	}

	@Override
	public Tilemap create() {
		JsonValue f = Dungeon.level instanceof MakerLevel ? ((MakerLevel) Dungeon.level).data() : null;
		Object tx = f == null || f.get("paint") == null ? null : MakerRuntime.texture(f.get("paint").getString("image", ""));
		texture = tx == null ? blank() : tx;
		Tilemap v = super.create();
		v.map(mapSimpleImage(0, 0, Math.max(SIZE, TextureCache.get(texture).width)), tileW);
		return v;
	}
}
