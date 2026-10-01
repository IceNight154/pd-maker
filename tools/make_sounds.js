// 샘플 프로젝트의 소리: 효과음(WAV)을 audio.js 의 합성기로 만들고 audio/sounds.json 을 씁니다.
const fs = require('fs'), path = require('path');
global.window = global; global.PDM = {};
eval(fs.readFileSync(path.join(__dirname, '../editor/renderer/js/audio.js'), 'utf8'));
const out = path.join(__dirname, '../sample-project');
function wav(data, rate) {
  const n = data.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, data[i])); b.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2); }
  return b;
}
const A = PDM.audio;
const sfx = [
  { id: 'bell', name: '바람 방울', p: A.SYNTH_PRESETS.bell() },
  { id: 'seal_open', name: '봉인 풀림', p: A.SYNTH_PRESETS.magic() },
  { id: 'heart_up', name: '마음 상승', p: A.SYNTH_PRESETS.sparkle() }
];
const list = [];
fs.mkdirSync(path.join(out, 'assets/audio'), { recursive: true });
sfx.forEach((s, i) => {
  const P = A.makeSynth(s.p), seed = 1000 + i;
  fs.writeFileSync(path.join(out, 'assets/audio', s.id + '.wav'), wav(A.synth(P, seed), A.RATE));
  list.push({ id: s.id, name: s.name, kind: 'se', file: `assets/audio/${s.id}.wav`, volume: 1, pitch: 1, loop: false, note: '효과음 만들기로 만든 소리 (샘플)', synth: P, seed });
});
list.push({ id: 'town_theme', name: '마녀의 마을', kind: 'bgm', file: 'game:music/theme_2.ogg', volume: 0.8, pitch: 1, loop: true, note: '게임 음악을 이름 붙여 등록한 예 (파일 복사 없음)' });
fs.mkdirSync(path.join(out, 'audio'), { recursive: true });
fs.writeFileSync(path.join(out, 'audio/sounds.json'), JSON.stringify({ format: 'pdmaker-sounds', version: 1, sounds: list }, null, 2) + '\n');
console.log('sounds ok', list.length);
