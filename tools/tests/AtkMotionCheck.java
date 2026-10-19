// 아이템 공격 모션 공통 규칙 검사 (8차) — 런타임 MakerAtkMotion 을 실제로 실행해 편집기 PDM.atkMotion 과 같은 입력의 결과를 냄
//   표준 입력 = [{ fn: sample|event|windows|judge|validate, fx, ... }] JSON, 표준 출력 = 결과 JSON 배열 (JSON 읽기 · 쓰기 = TitleModelCheck)
import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAtkMotion;
import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitleModel.Val;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class AtkMotionCheck {
	public static void main(String[] args) throws Exception {
		ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int r; while ((r = System.in.read(buf)) > 0) bo.write(buf, 0, r);
		@SuppressWarnings("unchecked") List<Object> cases = (List<Object>) TitleModelCheck.parse(bo.toString(StandardCharsets.UTF_8.name()));
		List<Object> res = new ArrayList<>();
		for (Object co : cases) {
			TitleModelCheck.J c = new TitleModelCheck.J(co); String fn = c.str("fn", ""); Val fx = c.get("fx");
			switch (fn) {
				case "sample": {
					List<List<MakerAtkMotion.Key>> T = MakerAtkMotion.tracksOf(fx); Val ts = c.get("ts"); List<Object> l = new ArrayList<>();
					for (int i = 0; i < ts.size(); i++) l.add(MakerAtkMotion.sample(T, Double.parseDouble(ts.at(i).asString())));
					res.add(l); break;
				}
				case "event": {
					List<MakerAtkMotion.Ev> evs = MakerAtkMotion.eventsOf(fx); Val ts = c.get("ts"); double D = MakerAtkMotion.durOf(fx); List<Object> l = new ArrayList<>();
					for (MakerAtkMotion.Ev e : evs) for (int i = 0; i < ts.size(); i++) l.add(MakerAtkMotion.eventState(e, D, Double.parseDouble(ts.at(i).asString())));
					res.add(l); break;
				}
				case "windows": { List<Object> l = new ArrayList<>(); for (double[] w : MakerAtkMotion.windowsOf(fx)) l.add(w); Map<String, Object> m = new LinkedHashMap<>(); m.put("w", l); m.put("hits", MakerAtkMotion.hitsOf(fx)); m.put("dur", MakerAtkMotion.durOf(fx)); res.add(m); break; }
				case "judge": { Map<String, Object> m = new LinkedHashMap<>(); m.put("judge", MakerAtkMotion.judgeSec(fx, c.num("anim", Double.NaN))); m.put("delay", MakerAtkMotion.syncDelay(fx, (int) c.num("frames", 4))); res.add(m); break; }
				case "validate": { List<Object> l = new ArrayList<>(); for (String[] i : MakerAtkMotion.validate(fx, c.num("anim", Double.NaN))) l.add(Arrays.asList(i)); res.add(l); break; }
				default: res.add("unknown fn " + fn);
			}
		}
		StringBuilder b = new StringBuilder(); TitleModelCheck.out(b, res); new java.io.PrintStream(System.out, true, "UTF-8").println(b);
	}
}
