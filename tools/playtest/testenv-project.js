#!/usr/bin/env node
// ================================================================
//  테스트 플레이 실행 환경 · 대사 연출 검사용 프로젝트 만들기 (tools/playtest/testenv-check.sh 가 씀)
//    사용: node tools/playtest/testenv-project.js <만들 폴더> [big|small]   (폴더를 지우고 새로 만듦 — 실제 프로젝트 폴더를 주지 마세요)
//    6차: 첫 맵 = 직접 그린 맵 (big 40×30칸 = 640×480 게임 픽셀 — 모든 시험 화면보다 큼 / small 10×8칸 = 160×128 — PC 화면보다 작음)
//         카메라 · 연출 이벤트 cm(이동 · 멈춤) cmshake(흔들기 두 번) cmlong(3초 이동 — 배속) cmcancel(긴 흔들기 — 취소) cmfollow nest/inner(중첩) err(오류 명령)
//    이벤트: sp = 긴 대사 4줄(글자 5자/초 — 배속 측정) · sk = 대사 → 선택지 → 입력 기다리기 → 대사 (스킵이 멈추는지)
//            fx = 대사 스타일(rise · 자간) → 대사 2줄 → 되돌리기 · ty = 줄마다 글자 크기 · 굵게 · 정렬 · 강조 색 · 여백
// ================================================================
const fs = require('fs'), path = require('path');
const env = require(path.join(__dirname, '..', 'tests', 'editor-env.js'));
(async () => {
  const dir = process.argv[2], size = process.argv[3] === 'small' ? [10, 8] : [40, 30];
  if (!dir) { console.log('사용: testenv-project.js <폴더>'); process.exit(2); }
  if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'project.json')) && !/pdm-testenv|testenv-proj/.test(dir)) { console.log('이미 프로젝트가 있는 폴더입니다 (이름에 testenv-proj 가 들어간 폴더만 지움): ' + dir); process.exit(2); }
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { PDM } = env.load(), S = PDM.store;
  await S.createNew(dir, 'testenv-check');
  S.edit('project', '확장', p => { p.extensions = { event: true, story: true }; });
  S.edit('dialogue', '대사창', d => { d.mode = 'box'; });
  // 첫 맵: 직접 그린 맵 (벽 테두리 · 바닥 · 입구 7 · 출구 8)
  const [W, H] = size, T = new Array(W * H).fill(1);
  for (let x = 0; x < W; x++) { T[x] = 4; T[(H - 1) * W + x] = 4; } for (let y = 0; y < H; y++) { T[y * W] = 4; T[y * W + W - 1] = 4; }
  T[2 * W + 3] = 7; T[(H - 3) * W + W - 4] = 8;
  const node = S.keys('node')[0];
  S.edit(node, '맵', r => { r.mode = 'handmade'; r.size = { w: W, h: H }; r.layers = { terrain: T }; r.objects = []; });
  const L = '가나다라마바사아자차카타파하'.repeat(30);
  const ev = (id, commands) => S.add('event:' + id, { format: 'pdmaker-event', version: 1, id, name: id, pages: [{ trigger: 'action', conds: {}, cond: '', commands }] });
  ev('sp', [1, 2, 3, 4].map(n => ({ cmd: 'text', name: 'A', text: n + '번 ' + L, speed: '5' })));
  ev('sk', [{ cmd: 'text', name: 'A', text: '첫 줄 ' + L }, { cmd: 'text', name: 'A', text: '둘째 줄' },
    { cmd: 'choice', options: ['가', '나'], branches: [[{ cmd: 'text', name: 'A', text: '가 고름' }], [{ cmd: 'text', name: 'A', text: '나 고름' }]] },
    { cmd: 'text', name: 'A', text: '선택 뒤' }, { cmd: 'waitInput' }, { cmd: 'text', name: 'A', text: '입력 뒤 마지막' }]);
  ev('fx', [{ cmd: 'textStyle', effect: 'rise', tracking: 2, fxDur: 20, fxStrength: 150 },
    { cmd: 'text', name: 'A', text: '글자 **강조** 효과 _밑줄강조_ 가나다라마바사 English words 123 한글과 영어가 섞인 긴 줄은 자간을 넣어도 칸 안에서 줄을 바꿔야 합니다', speed: '8' },
    { cmd: 'text', name: 'A', text: '흔들기 **강조만** 보통 글자', effect: 'shake', fxScope: 'em' },
    { cmd: 'textStyle', reset: true }, { cmd: 'text', name: 'A', text: '기본으로 돌아옴' }]);
  ev('ty', [{ cmd: 'text', name: 'A', text: '크게 가운데 **강조 파랑** 굵게', size: 150, align: 'center', bold: 'on', emColor: '#3060ff', padding: 16, lineGap: 4, speed: 'instant' },
    { cmd: 'text', name: 'A', text: '기본 대사 **강조**', speed: 'instant' }]);
  const cam = (cmd, o) => Object.assign({ cmd }, o);
  ev('cm', [cam('camMove', { target: 'tile', x: 0, y: 0, time: 10, ease: 'smooth', wait: true }), { cmd: 'wait', turns: 200 }]);
  ev('cmshake', [{ cmd: 'wait', turns: 10 }, cam('camShake', { power: 6, time: 15, freq: 12, decay: 'linear', axis: 'both', wait: true }), cam('camShake', { power: 6, time: 15, freq: 20, decay: 'smooth', axis: 'x', wait: true }), { cmd: 'wait', turns: 10 }]);
  ev('cmlong', [cam('camMove', { target: 'tile', x: W - 1, y: H - 1, time: 30, ease: 'linear', wait: true }), { cmd: 'wait', turns: 20 }]);
  ev('cmcancel', [cam('camMove', { target: 'tile', x: 0, y: 0, time: 40, wait: false }), cam('camShake', { power: 8, time: 100, wait: false }), { cmd: 'wait', turns: 100 }]);
  ev('cmfollow', [cam('camMove', { target: 'tile', x: 0, y: 0, time: 0 }), cam('camFollow', { kind: 'char', ref: '$hero', start: 'pan', smooth: true, speed: 5 }), { cmd: 'wait', turns: 30 }, cam('camFollow', { kind: 'char', ref: 'nobody_here' }), cam('camReset', { mode: 'smooth', time: 5, follow: true, wait: true }), { cmd: 'wait', turns: 10 }]);
  ev('inner', [cam('camShake', { power: 5, time: 40, wait: false }), { cmd: 'text', name: 'B', text: '안쪽 공통 이벤트 대사', speed: 'instant' }]);
  ev('nest', [{ cmd: 'text', name: 'A', text: '바깥 대사 1', speed: 'instant' }, { cmd: 'call', event: 'inner' }, { cmd: 'wait', turns: 30 }, { cmd: 'text', name: 'A', text: '바깥 대사 2', speed: 'instant' }]);
  ev('dl', [{ cmd: 'text', name: 'A', text: '대사 중 배속 표시줄 확인 — 가나다라마바사아자차카타파하 가나다라마바사', speed: '5' }, { cmd: 'text', name: 'A', text: '둘째 줄', speed: '5' }]);
  ev('err', [{ cmd: 'wait', turns: 'abc' }, cam('camMove', { target: 'char', ref: 'nobody', time: 10 }), { cmd: 'wait', turns: 10 }]);
  await S.save();
  console.log('ok ' + dir);
})();
