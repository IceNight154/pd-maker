/*
 * PDMaker — 게임(libGDX)이 못 읽는 WAV 를 읽을 수 있게: libGDX 의 WAV 읽기는 16비트(또는 8비트) PCM · 보통 머리(형식 1)만 읽음.
 *   24비트 · 32비트 정수 · 32/64비트 float · 확장 머리(WAVE_FORMAT_EXTENSIBLE — 24비트 · 5.1 파일은 보통 이것)는 "Error reading WAV file".
 *   그런 파일은 한 번 16비트 PCM(보통 머리)으로 바꿔 임시 폴더에 두고 그것을 씀 (원본 파일은 그대로).
 *   채널은 그대로 둠 — OpenAL 이 모노 · 스테레오 · 4채널 · 5.1 · 6.1 · 7.1 을 재생 (스피커가 적으면 OpenAL 이 알아서 섞음).
 *   그 밖의 채널 수(3 · 5 …)만 스테레오로 섞음.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.files.FileHandle;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.HashMap;
import java.util.Map;

public class MakerWav {

	private static final Map<String, FileHandle> cache = new HashMap<>();

	/** 이 파일을 그대로 쓸 수 있으면 그대로, 못 읽는 WAV 면 바꾼 임시 파일 (실패하면 원본 — 게임이 원래대로 오류를 냄) */
	public static FileHandle playable(FileHandle f) {
		if (f == null || !f.extension().equalsIgnoreCase("wav") || !f.exists()) return f;
		String key = f.path() + "|" + f.lastModified() + "|" + f.length();
		FileHandle c = cache.get(key);
		if (c != null && c.exists()) return c;
		try {
			byte[] src = f.readBytes();
			byte[] out = convert(src);
			if (out == null) return f;   // 이미 읽을 수 있는 형식
			java.io.File tmp = java.io.File.createTempFile("pdmaker_wav_", ".wav");
			tmp.deleteOnExit();
			FileHandle t = Gdx.files.absolute(tmp.getAbsolutePath());
			t.writeBytes(out, false);
			cache.put(key, t);
			MakerRuntime.log("WAV 를 16비트로 바꿔 씀 (게임이 원래 형식을 못 읽음): " + f.name());
			return t;
		} catch (Throwable e) {
			MakerRuntime.log("WAV 변환 실패 " + f.name() + ": " + e);
			return f;
		}
	}

	/** 바꿀 필요가 없으면 null, 아니면 16비트 PCM WAV 바이트 */
	static byte[] convert(byte[] b) {
		ByteBuffer in = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN);
		if (b.length < 12 || !str(b, 0).equals("RIFF") || !str(b, 8).equals("WAVE")) return null;
		int fmt = -1, ch = 0, rate = 0, bits = 0, dataOff = -1, dataLen = 0;
		for (int o = 12; o + 8 <= b.length; ) {
			String id = str(b, o); int size = in.getInt(o + 4);
			if (size < 0) break;
			if (id.equals("fmt ")) {
				fmt = in.getShort(o + 8) & 0xFFFF; ch = in.getShort(o + 10) & 0xFFFF; rate = in.getInt(o + 12); bits = in.getShort(o + 22) & 0xFFFF;
				if (fmt == 0xFFFE && size >= 40) fmt = in.getShort(o + 8 + 24) & 0xFFFF;   // 확장 형식: 하위 형식 GUID 의 앞 2바이트 (1 = PCM, 3 = float)
				else if (fmt == 0xFFFE) fmt = 1;
				if ((in.getShort(o + 8) & 0xFFFF) == 1 && (bits == 8 || bits == 16) && keepable(ch)) return null;   // 그대로 읽힘
			} else if (id.equals("data")) { dataOff = o + 8; dataLen = Math.min(size, b.length - dataOff); break; }
			o += 8 + size + (size & 1);
		}
		if (fmt < 0 || dataOff < 0 || ch <= 0 || bits <= 0) return null;
		if (fmt != 1 && fmt != 3) return null;   // ADPCM 등은 모름 — 원본 그대로 (게임이 오류를 냄)
		int bps = bits / 8, frames = dataLen / (bps * ch), outCh = keepable(ch) ? ch : 2;
		float[] fr = new float[ch];
		ByteBuffer out = ByteBuffer.allocate(44 + frames * outCh * 2).order(ByteOrder.LITTLE_ENDIAN);
		out.put("RIFF".getBytes()).putInt(36 + frames * outCh * 2).put("WAVE".getBytes()).put("fmt ".getBytes()).putInt(16)
				.putShort((short) 1).putShort((short) outCh).putInt(rate).putInt(rate * outCh * 2).putShort((short) (outCh * 2)).putShort((short) 16)
				.put("data".getBytes()).putInt(frames * outCh * 2);
		for (int i = 0; i < frames; i++) {
			int base = dataOff + i * bps * ch;
			for (int c = 0; c < ch; c++) fr[c] = sample(in, b, base + c * bps, bits, fmt);
			if (outCh == ch) { for (int c = 0; c < ch; c++) out.putShort(s16(fr[c])); continue; }   // 채널 그대로
			// OpenAL 이 못 트는 채널 수 → 스테레오 (FL FR FC … — 가운데 · 나머지는 0.707)
			float l = fr[0], r = ch > 1 ? fr[1] : fr[0];
			for (int c = 2; c < ch; c++) { float v = fr[c] * 0.707f; if (c == 2) { l += v; r += v; } else if (c % 2 == 0) l += v; else r += v; }
			float k = 1f / (1f + 0.707f * (ch - 2) / 2f + 0.707f);
			out.putShort(s16(l * k)); out.putShort(s16(r * k));
		}
		return out.array();
	}
	private static float sample(ByteBuffer in, byte[] b, int o, int bits, int fmt) {
		if (fmt == 3) return bits == 64 ? (float) in.getDouble(o) : in.getFloat(o);
		switch (bits) {
			case 8: return ((b[o] & 0xFF) - 128) / 128f;
			case 16: return in.getShort(o) / 32768f;
			case 24: return ((b[o] & 0xFF) | ((b[o + 1] & 0xFF) << 8) | (b[o + 2] << 16)) / 8388608f;
			case 32: return in.getInt(o) / 2147483648f;
			default: return 0f;
		}
	}
	/** OpenAL(libGDX 1.12+) 이 그대로 트는 채널 수: 모노 · 스테레오 · 4채널 · 5.1 · 6.1 · 7.1 */
	static boolean keepable(int ch) { return ch == 1 || ch == 2 || ch == 4 || ch == 6 || ch == 7 || ch == 8; }
	private static short s16(float v) { v = Math.max(-1f, Math.min(1f, v)); return (short) (v < 0 ? v * 32768 : v * 32767); }
	private static String str(byte[] b, int o) { return o + 4 <= b.length ? new String(b, o, 4, java.nio.charset.StandardCharsets.ISO_8859_1) : ""; }
}
