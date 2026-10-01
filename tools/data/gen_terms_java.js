// 에디터의 기본 용어(terms.js)를 게임 런타임용 DefaultTerms.java 로 만듭니다.
//   node tools/gen_terms_java.js   (terms.js 를 고친 뒤 실행)
const fs = require('fs'), path = require('path');
const PDM = {}; global.PDM = PDM;
new Function('PDM', fs.readFileSync(path.join(__dirname, '../../editor/renderer/js/terms.js'), 'utf8').replace(/PDM\.T\s*=[\s\S]*$/, ''))(PDM);
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const lines = Object.entries(PDM.DEFAULT_TERMS).map(([k, v]) => `\t\tM.put("${esc(k)}", "${esc(v.label)}");`);
const out = `/* 자동 생성 파일 — tools/gen_terms_java.js 로 만듭니다. 직접 고치지 마세요.
 * 에디터 기본 용어(terms.js). 프로젝트의 terms.json 에 같은 키가 있으면 그쪽이 우선입니다. */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import java.util.HashMap;
import java.util.Map;

final class DefaultTerms {
\tstatic final Map<String, String> M = new HashMap<>();
\tstatic {
${lines.join('\n')}
\t}
\tprivate DefaultTerms() { }
}
`;
fs.writeFileSync(path.join(__dirname, '../../runtime/src/com/shatteredpixel/shatteredpixeldungeon/pdmaker/DefaultTerms.java'), out, 'utf8');
console.log('DefaultTerms.java: ' + lines.length + ' terms');
