/*
 * 소리 — 프로젝트 사운드 목록(audio/sounds.json) + 맵 그룹/노드 배경음
 *   참조 형식:  sound:<id>        사운드 편집기에 등록한 소리 (파일·볼륨·반복·음높이)
 *              game:music/x.ogg  게임에 들어 있는 파일
 *              assets/audio/x.ogg 프로젝트 폴더의 파일
 *              music/x.ogg       (예전 형식) 게임 파일
 *   프로젝트 파일은 게임의 Music/Sample 안에 끼워 넣어서, 게임 설정의 음량·음소거·일시정지를 그대로 따릅니다.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.utils.JsonValue;
import com.watabou.noosa.audio.Music;
import com.watabou.noosa.audio.Sample;

import java.lang.reflect.Field;
import java.util.Map;

public class MakerAudio {

	static class Ref { String file = ""; boolean game; float volume = 1f, pitch = 1f; boolean loop = true; }

	static JsonValue entry(String id) {
		JsonValue s = MakerRuntime.sounds;
		if (s == null || s.get("sounds") == null) return null;
		for (JsonValue e : s.get("sounds")) if (id.equals(e.getString("id", ""))) return e;
		return null;
	}

	static Ref resolve(String ref) {
		if (ref == null || ref.isEmpty()) return null;
		Ref r = new Ref();
		String file = ref;
		if (ref.startsWith("sound:")) {
			JsonValue e = entry(ref.substring(6));
			if (e == null) { MakerRuntime.warnOnce("사운드 목록에 없는 소리: " + ref); return null; }
			file = e.getString("file", "");
			r.volume = e.getFloat("volume", 1f);
			r.pitch = e.getFloat("pitch", 1f);
			r.loop = e.getBoolean("loop", true);
		}
		if (file.startsWith("game:")) { r.game = true; file = file.substring(5); }
		else if (!file.startsWith("assets/") && Gdx.files.internal(file).exists()) r.game = true;
		r.file = file;
		if (r.game && !Gdx.files.internal(file).exists()) { MakerRuntime.warnOnce("게임에 없는 소리 파일: " + file); return null; }
		if (!r.game && (MakerRuntime.root() == null || !MakerRuntime.root().child(file).exists())) { MakerRuntime.warnOnce("프로젝트에 없는 소리 파일: " + file); return null; }
		return r;
	}

	// ------------------------------------------------------------ 배경음

	private static String current = "";

	/** ref: 참조 / "none" = 끄기 */
	public static void playBgm(String ref) { playBgm(ref, null); }
	/** onEnd != null: 반복하지 않고 끝나면 onEnd (여러 곡 목록의 다음 곡) */
	static void playBgm(String ref, Runnable onEnd) {
		if (ref == null || ref.isEmpty()) return;
		if (ref.equals("none")) { Music.INSTANCE.end(); current = ""; MakerRuntime.log("배경음: 끔"); return; }
		Ref r = resolve(ref);
		if (r == null) { MakerRuntime.log("배경음: " + ref + " — 파일을 찾지 못해 틀지 않음"); return; }
		if (r.game) {
			Music.INSTANCE.play(r.file, r.loop);
			scaleVolume(r.volume);
			if (!ref.equals(current)) MakerRuntime.log("배경음: " + ref + " (게임 파일 " + r.file + ")" + state());
			current = ref;
			return;
		}
		try {
			// 같은 곡이 아직 우리 플레이어로 걸려 있으면 그대로 (isPlaying 만 보면 일시정지 중 화면을 옮길 때 처음부터 다시 틀었음)
			if (ref.equals(current) && ourPlayer != null && get(Music.INSTANCE, "player") == ourPlayer && "pdm".equals(tag)) return;
			Music.INSTANCE.stop();
			set(Music.INSTANCE, "fadeTime", -1f); set(Music.INSTANCE, "fadeTotal", -1f);   // 층에서 하던 페이드아웃이 새 곡까지 줄이지 않게
			set(Music.INSTANCE, "lastPlayed", null);   // 설정에서 음악을 다시 켜도 게임 파일로 착각하지 않게
			set(Music.INSTANCE, "trackList", null);
			set(Music.INSTANCE, "looping", r.loop);
			if (!Music.INSTANCE.isEnabled()) { current = ref; MakerRuntime.log("배경음: " + ref + " — 게임 설정에서 음악이 꺼져 있어 틀지 않음"); return; }
			com.badlogic.gdx.audio.Music m = Gdx.audio.newMusic(MakerWav.playable(MakerRuntime.root().child(r.file)));
			m.setLooping(onEnd == null && r.loop);
			if (onEnd != null) m.setOnCompletionListener(x -> { if (curPlayer() == x) Gdx.app.postRunnable(onEnd); });
			float vol = (Float) get(Music.INSTANCE, "volume");
			m.setVolume(Math.min(1f, vol * r.volume));
			set(Music.INSTANCE, "player", m);
			if (!Boolean.TRUE.equals(get(Music.INSTANCE, "paused"))) m.play();   // paused() 는 SPD 3.x 부터 — 필드로 (예전 판도)
			current = ref; tag = "pdm"; ourPlayer = m;
			MakerRuntime.log("배경음: " + ref + " → " + MakerRuntime.root().child(r.file).path() + state());
		} catch (Exception e) {
			MakerRuntime.log("배경음 재생 실패 " + ref + ": " + e + (r.file.toLowerCase().endsWith(".wav") ? " — 게임은 16비트(또는 8비트) PCM WAV 만 읽고, 24비트 · float · 여러 채널은 자동으로 바꿔 쓰는데 그것도 실패함 (편집기 소리 화면의 \"16비트로 바꾸기\" 또는 ogg 로 저장해 보세요)" : ""));
		}
	}
	private static String tag = "";
	private static Object ourPlayer;
	/** 로그용: 음량 · 음악 켜짐 · 일시정지 · 실제 재생 여부 */
	static String state() {
		try {
			Object p = curPlayer();
			return " · 음량 " + get(Music.INSTANCE, "volume") + " · 음악 " + (Music.INSTANCE.isEnabled() ? "켜짐" : "꺼짐") + (Boolean.TRUE.equals(get(Music.INSTANCE, "paused")) ? " · 일시정지(창이 비활성)" : "")
					+ " · 재생 중 " + (p instanceof com.badlogic.gdx.audio.Music && ((com.badlogic.gdx.audio.Music) p).isPlaying());
		} catch (Exception e) { return ""; }
	}
	/** 이 목록의 프로젝트 곡이 지금 우리 플레이어로 흐르는 중인지 */
	static boolean holds(java.util.List<String> refs) { return !refs.isEmpty() && refs.contains(current) && ourPlayer != null && curPlayer() == ourPlayer && "pdm".equals(tag); }
	/** 게임 Music 이 지금 쥔 플레이어 (못 읽으면 null) */
	static Object curPlayer() { try { return get(Music.INSTANCE, "player"); } catch (Exception e) { return null; } }

	private static void scaleVolume(float mul) {
		if (mul == 1f) return;
		try {
			Object p = get(Music.INSTANCE, "player");
			float vol = (Float) get(Music.INSTANCE, "volume");
			if (p != null) ((com.badlogic.gdx.audio.Music) p).setVolume(Math.min(1f, vol * mul));
		} catch (Exception ignored) { }
	}

	/** 층 입장 (GameScene 이 게임 기본 음악을 튼 직후).
	 *  노드 bgm → 그룹 음악(보스 층이면 bgmBoss, 긴장 조건이면 bgmTense, 아니면 bgm + bgmExtra 중 무작위) → 사용자 테마 음악 → 게임 기본 */
	public static void floorBgm() {
		String id = WorldGraph.current();
		JsonValue n = WorldGraph.node(id), g = WorldGraph.group(id);
		String ref = n == null ? "" : n.getString("bgm", "");
		tag = "";
		if (ref.isEmpty() && g != null) {
			boolean boss = n != null && n.getBoolean("boss", false);
			String tense = g.getString("bgmTense", ""), when = g.getString("bgmTenseWhen", "");
			if (boss && !g.getString("bgmBoss", "").isEmpty()) ref = g.getString("bgmBoss");
			else if (!tense.isEmpty() && !when.isEmpty() && Cond.eval(when, StoryState.globalResolver())) ref = tense;
			else {
				java.util.List<String> tracks = new java.util.ArrayList<>();
				if (!g.getString("bgm", "").isEmpty()) tracks.add(g.getString("bgm"));
				if (g.get("bgmExtra") != null) for (JsonValue t : g.get("bgmExtra")) if (!t.asString().isEmpty()) tracks.add(t.asString());
				if (tracks.size() > 1) { playList(tracks); return; }
				if (tracks.size() == 1) ref = tracks.get(0);
			}
		}
		// 사용자 테마의 음악
		String th = WorldGraph.theme(id);
		if (ref.isEmpty() && th != null && th.startsWith("custom:") && WorldGraph.world != null && WorldGraph.world.get("customThemes") != null)
			for (JsonValue t : WorldGraph.world.get("customThemes"))
				if (th.substring(7).equals(t.getString("id", ""))) ref = t.getString("music", "");
		if (!ref.isEmpty()) playBgm(ref);
		else current = "";
	}

	/** 여러 곡: 모두 게임 파일이면 게임 방식(차례로 무작위 재생), 아니면 한 곡을 골라 반복 */
	static void playList(java.util.List<String> refs) {
		java.util.List<String> files = new java.util.ArrayList<>();
		for (String r : refs) { Ref x = resolve(r); if (x == null) continue; if (!x.game) { files = null; break; } files.add(x.file); }
		if (files != null && !files.isEmpty()) {
			float[] ch = new float[files.size()]; java.util.Arrays.fill(ch, 1f);
			Music.INSTANCE.playTracks(files.toArray(new String[0]), ch, true);
			current = String.join("|", refs);
			return;
		}
		// 프로젝트 곡이 섞인 목록: 지금 그 목록의 곡이 걸려 있으면 그대로 (메뉴를 옮길 때마다 곡이 바뀌지 않게), 아니면 무작위 한 곡 → 끝나면 다른 곡
		if (holds(refs)) return;
		playNext(new java.util.ArrayList<>(refs), "");
	}
	private static void playNext(java.util.List<String> refs, String last) {
		java.util.List<String> pool = new java.util.ArrayList<>(refs);
		if (pool.size() > 1) pool.remove(last);
		String pick = com.watabou.utils.Random.element(pool);
		Ref r = resolve(pick);
		if (r != null && r.game) { playBgm(pick); return; }   // 게임 곡 하나만 고른 경우 — 게임 방식대로 반복
		playBgm(pick, refs.size() > 1 ? () -> { if (pick.equals(current)) { current = ""; playNext(refs, pick); } } : null);
	}

	// ------------------------------------------------------------ 효과음

	// ------------------------------------------------------------ 게임 효과음 설정 (audio/sounds.json 의 sfx)
	//   값: "" = 기본 소리 · "none" = 소리 없음 · 그 밖 = 참조(sound:id · game:… · assets/…)
	//   기본 소리는 앞에서부터 게임에 있는 파일 (mod-2 전용 소리가 없으면 원작 소리)
	public static final String[][] SFX = {
		{"codex.melee",    "game:sounds/atk_sword_slash1.mp3|game:sounds/hit_slash.mp3"},
		{"codex.meleeHit", "game:sounds/hit_slash.mp3"},
		{"codex.ranged",   "game:sounds/atk_grimoire.mp3|game:sounds/zap.mp3"},
		{"codex.cast",     "game:sounds/read.mp3"},
		{"codex.hit",      "game:sounds/hit_magic.mp3"},
		{"codex.miss",     "game:sounds/miss.mp3"},
		{"codex.break",    ""},
		{"spell.cast",     "game:sounds/read.mp3"},
		{"spell.hit",      "game:sounds/hit_magic.mp3"},
		{"ability.cast",   "game:sounds/chargeup.mp3"},
		{"ability.hit",    "game:sounds/hit_magic.mp3"},
		{"item.eat",       "game:sounds/eat.mp3"},
		{"item.drink",     "game:sounds/drink.mp3"},
		{"item.read",      "game:sounds/read.mp3"},
		{"item.use",       ""},
		{"dialogue.open",  ""},
		{"dialogue.type",  ""},
		{"dialogue.next",  ""},
		{"choice.move",    ""},
		{"choice.select",  "game:sounds/click.mp3"},
		{"heart.up",       ""},
		{"heart.down",     ""},
		{"heart.bond",     "game:sounds/levelup.mp3"},
		{"heart.crystal",  ""},
		{"gauge.overflow", "game:sounds/blast.mp3"},
		{"gauge.switch",   "game:sounds/meld.mp3"},
	};
	static String sfxDefault(String key) {
		for (String[] s : SFX) if (s[0].equals(key)) {
			for (String c : s[1].split("\\|")) if (!c.isEmpty() && Gdx.files.internal(c.substring(5)).exists()) return c;
			return "";
		}
		return "";
	}
	/** 설정된 효과음 참조 (없으면 기본, 소리 없음이면 "") */
	public static String sfxRef(String key) {
		JsonValue s = MakerRuntime.sounds;
		JsonValue m = s == null ? null : s.get("sfx");
		String v = m == null ? "" : m.getString(key, "");
		if (v.equals("none")) return "";
		if (!v.isEmpty()) return v;
		return sfxDefault(key);
	}
	/** 시스템별 소리: 그 시스템 설정(sounds 객체)의 local 키 → 비었으면 게임 효과음 설정의 global 키. "none" = 소리 없음 */
	public static void sysSfx(JsonValue sounds, String local, String global) {
		String v = sounds == null ? "" : sounds.getString(local, "");
		if (v.equals("none")) return;
		if (!v.isEmpty()) { playSe(v); return; }
		sfx(global);
	}
	/** 게임 효과음 설정대로 재생 */
	public static void sfx(String key) {
		String r = sfxRef(key);
		if (!r.isEmpty()) playSe(r);
	}

	// ------------------------------------------------------------ 아이템 · 캐릭터마다 정한 소리
	//   프로젝트 아이템 : 아이템 데이터의 sound(사용 · 무기는 공격이 맞을 때) · throwSound · landSound(던진 것이 닿을 때) · pickupSound · equipSound
	//   게임 아이템     : audio/sounds.json 의 gameItems["spd:<경로>"] = { use, throw, pickup, equip }
	//   캐릭터         : 캐릭터 데이터의 sounds = { attack, hurt, die, talk }
	//   값: "" = 게임 원래 소리만 · "none" = 소리 없음(줍기는 원래 소리도 끔) · 그 밖 = 참조

	static final String ITEMS_PKG = "com.shatteredpixel.shatteredpixeldungeon.items.";

	/** 아이템의 프로젝트 id (프로젝트 아이템이 아니면 null) */
	static String projectItemId(com.shatteredpixel.shatteredpixeldungeon.items.Item it) {
		if (it instanceof MakerItem) return ((MakerItem) it).makerId;
		if (it instanceof GenSupport.Coded) return ((GenSupport.Coded) it).makerId();
		return null;
	}
	/** key: use · throw · pickup · equip */
	public static String itemSound(com.shatteredpixel.shatteredpixeldungeon.items.Item it, String key) {
		String pid = projectItemId(it);
		if (pid != null) {
			JsonValue d = MakerRuntime.item(pid);
			if (d == null) return "";
			return d.getString(key.equals("use") ? "sound" : key + "Sound", "");
		}
		JsonValue s = MakerRuntime.sounds;
		JsonValue g = s == null ? null : s.get("gameItems");
		if (g == null) return "";
		String cn = it.getClass().getName();
		// 익명·내부 클래스는 바깥 클래스 이름으로
		int dollar = cn.indexOf('$'); if (dollar > 0) cn = cn.substring(0, dollar);
		if (!cn.startsWith(ITEMS_PKG)) return "";
		JsonValue e = g.get("spd:" + cn.substring(ITEMS_PKG.length()));
		return e == null ? "" : e.getString(key, "");
	}
	/** Item.execute 맨 앞 (행동 버튼) */
	public static void onItemAction(com.shatteredpixel.shatteredpixeldungeon.items.Item it, String action) {
		if (!MakerRuntime.isActive() || it == null || action == null) return;
		try {
			// 던지기는 버튼을 누를 때가 아니라 목표를 고르고 실제로 던질 때 (onItemCast)
			String key = action.equals("THROW") || action.equals("DROP") ? null : action.equals("EQUIP") || action.equals("UNEQUIP") ? "equip" : "use";
			if (key == null) return;
			MakerEffect.itemAction(it, key);   // 아이템 이펙트 (fxUse · fxThrow · fxEquip)
			if (key.equals("use") && it instanceof MakerItem) return;   // 프로젝트 아이템(기타·코덱스 등)은 사용할 때 스스로 냄
			String r = itemSound(it, key);
			if (!r.isEmpty() && !r.equals("none")) playSe(r);
		} catch (Throwable t) { MakerRuntime.log("아이템 소리 실패: " + t); }
	}
	/** Item.cast 맨 앞 — 목표를 고르고 실제로 던지는 순간 (던지기 이펙트 fxThrow · "던지는 순간" 소리) */
	public static void onItemCast(com.shatteredpixel.shatteredpixeldungeon.items.Item it) {
		if (!MakerRuntime.isActive() || it == null) return;
		try {
			MakerEffect.itemAction(it, "throw");
			String r = itemSound(it, "throw");
			if (!r.isEmpty() && !r.equals("none")) playSe(r);
		} catch (Throwable t) { MakerRuntime.log("아이템 소리 실패: " + t); }
	}
	// 던진 아이템이 닿을 때 (Item.cast 의 onThrow 직전) — key "land": 떨어졌을 때 · 맞혔을 때
	static com.shatteredpixel.shatteredpixeldungeon.items.Item landed;   // 방금 떨어지는 소리를 낸 아이템 (던진 무기의 타격음을 한 번 건너뜀)
	public static void onItemLandHit(com.shatteredpixel.shatteredpixeldungeon.items.Item it, int cell) { land(it); }
	public static void onItemLandGround(com.shatteredpixel.shatteredpixeldungeon.items.Item it, int cell) { land(it); }
	static void land(com.shatteredpixel.shatteredpixeldungeon.items.Item it) {
		landed = null;
		if (!MakerRuntime.isActive() || it == null) return;
		try {
			String r = itemSound(it, "land");
			if (r.isEmpty()) return;
			landed = it;
			if (!r.equals("none")) playSe(r);
		} catch (Throwable t) { MakerRuntime.log("아이템 소리 실패: " + t); }
	}
	/** KindOfWeapon.hitSound 맨 앞 — 무기로 공격이 맞을 때. true 면 게임의 타격음을 내지 않음.
	 *  던진 무기에 "떨어졌을 때" 소리가 있으면 그것이 이미 났으므로 조용히, 아니면 "사용할 때" 소리를 타격음 대신 */
	public static boolean onWeaponHit(com.shatteredpixel.shatteredpixeldungeon.items.Item w) {
		if (!MakerRuntime.isActive() || w == null) return false;
		try {
			if (landed == w) { landed = null; return true; }
			String r = itemSound(w, "use");
			if (r.isEmpty()) return false;
			if (!r.equals("none")) playSe(r);
			return true;
		} catch (Throwable t) { return false; }
	}
	/** Item.doPickUp 의 줍는 소리 대신 — true 면 원래 소리를 내지 않음 */
	public static boolean onItemPickup(com.shatteredpixel.shatteredpixeldungeon.items.Item it) {
		if (!MakerRuntime.isActive() || it == null) return false;
		try { EventTriggers.onItemPickup(it); } catch (Throwable t) { MakerRuntime.log("아이템 줍기 트리거 오류: " + t); }
		try {
			String r = itemSound(it, "pickup");
			if (r.isEmpty()) return false;
			if (!r.equals("none")) playSe(r);
			return true;
		} catch (Throwable t) { return false; }
	}
	/** 캐릭터 소리 (key: attack · hurt · die · talk) */
	public static void charSound(String charId, String key) {
		JsonValue d = MakerRuntime.character(charId);
		JsonValue s = d == null ? null : d.get("sounds");
		String r = s == null ? "" : s.getString(key, "");
		if (!r.isEmpty() && !r.equals("none")) playSe(r);
	}

	/** 마지막으로 낸 효과음 참조 (자동 테스트 확인용) */
	public static String lastSe = "";

	@SuppressWarnings("unchecked")
	public static void playSe(String ref) {
		if (ref != null && ref.startsWith("sfx:")) { sfx(ref.substring(4)); return; }
		lastSe = ref == null ? "" : ref;
		if ("none".equals(ref)) return;
		Ref r = resolve(ref);
		if (r == null) return;
		if (r.game) {
			// Sample.load 는 다음 프레임에 불러오므로(비동기) 처음 한 번은 소리가 안 남 → 없으면 바로 불러 둠
			try {
				Map<Object, Sound> ids = (Map<Object, Sound>) get(Sample.INSTANCE, "ids");
				synchronized (Sample.INSTANCE) {
					if (!ids.containsKey(r.file)) ids.put(r.file, Gdx.audio.newSound(Gdx.files.internal(r.file)));
				}
			} catch (Exception e) { Sample.INSTANCE.load(r.file); }
			Sample.INSTANCE.play(r.file, r.volume, r.volume, r.pitch);
			return;
		}
		String key = "pdm:" + r.file;
		try {
			Map<Object, Sound> ids = (Map<Object, Sound>) get(Sample.INSTANCE, "ids");
			synchronized (Sample.INSTANCE) {
				if (!ids.containsKey(key)) ids.put(key, Gdx.audio.newSound(MakerWav.playable(MakerRuntime.root().child(r.file))));
			}
			Sample.INSTANCE.play(key, r.volume, r.volume, r.pitch);
		} catch (Exception e) {
			MakerRuntime.log("효과음 재생 실패 " + ref + ": " + e);
		}
	}

	// ------------------------------------------------------------ 도우미

	private static Field field(Class<?> c, String name) throws NoSuchFieldException {
		Field f = c.getDeclaredField(name); f.setAccessible(true); return f;
	}
	private static Object get(Object o, String name) throws Exception { return field(o.getClass(), name).get(o); }
	private static void set(Object o, String name, Object v) throws Exception { field(o.getClass(), name).set(o, v); }
}
