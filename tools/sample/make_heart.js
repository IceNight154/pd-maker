// defaults.js 의 기본 마음 시스템으로 sample-project/heart/heart.json 을 만듭니다.
const fs = require('fs'), path = require('path');
global.window = global; global.PDM = { THEMES: {}, FORMAT_VERSION: 1 };
eval(fs.readFileSync(path.join(__dirname, '../../editor/renderer/js/defaults.js'), 'utf8'));
const h = PDM.defaults.heart();
h.milestones.find(m => m.key === 'bond.close').event = 'ev_mireille_close';
const out = path.join(__dirname, '../../sample-project/heart/heart.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(h, null, 2) + '\n');
console.log('heart ok');
