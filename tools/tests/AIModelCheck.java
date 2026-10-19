// 캐릭터 AI 공통 규칙 검사 (8차) — 런타임 MakerAIModel 을 실제로 실행해 편집기 PDM.aiModel 과 같은 입력의 결과를 냄
//   tools/tests/run.js 가 컴파일 · 실행: 표준 입력 = [{ fn: decide|after|turns|validate, ... }] JSON, 표준 출력 = 결과 JSON 배열
//   JSON 읽기 · 쓰기는 TitleModelCheck 의 것을 씀 (같이 컴파일)
import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAIModel;
import com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitleModel.Val;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class AIModelCheck {
	public static void main(String[] args) throws Exception {
		ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int r; while ((r = System.in.read(buf)) > 0) bo.write(buf, 0, r);
		@SuppressWarnings("unchecked") List<Object> cases = (List<Object>) TitleModelCheck.parse(bo.toString(StandardCharsets.UTF_8.name()));
		List<Object> res = new ArrayList<>();
		for (Object co : cases) {
			TitleModelCheck.J c = new TitleModelCheck.J(co); String fn = c.str("fn", "");
			MakerAIModel.Profile P = MakerAIModel.normalize(c.get("profile"));
			switch (fn) {
				case "decide": {
					MakerAIModel.Result R = MakerAIModel.decide(P, MakerAIModel.readSit(c.get("sit")));
					Map<String, Object> m = new LinkedHashMap<>(); m.put("id", R.id); m.put("action", R.action); m.put("attack", R.attack); m.put("target", R.target); m.put("reason", R.reason);
					List<Object> tr = new ArrayList<>(); for (String[] t : R.trace) tr.add(Arrays.asList(t[0], t[1])); m.put("trace", tr); m.put("rolls", (double) R.rolls);
					res.add(m); break;
				}
				case "after": {
					MakerAIModel.Sit s = MakerAIModel.readSit(c.get("sit"));
					MakerAIModel.after(P, s, c.str("id", null), c.bool("ok", true));
					Map<String, Object> m = new LinkedHashMap<>(); m.put("cd", new TreeMap<>(s.cd)); m.put("next", s.next); res.add(m); break;
				}
				case "turns": res.add(MakerAIModel.turns(P, c.str("id", null))); break;
				case "validate": {
					List<Object> l = new ArrayList<>(); for (MakerAIModel.Issue i : MakerAIModel.validate(c.get("raw"))) l.add(Arrays.asList(i.level, i.code, i.path)); res.add(l); break;
				}
				default: res.add("unknown fn " + fn);
			}
		}
		StringBuilder b = new StringBuilder(); TitleModelCheck.out(b, res); new java.io.PrintStream(System.out, true, "UTF-8").println(b);
	}
}
