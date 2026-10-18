#!/usr/bin/env node
// ================================================================
//  테스트 플레이 실행 환경 · 대사 연출 검사용 프로젝트 만들기 (tools/playtest/testenv-check.sh 가 씀)
//    사용: node tools/playtest/testenv-project.js <만들 폴더>   (폴더를 지우고 새로 만듦 — 실제 프로젝트 폴더를 주지 마세요)
//    이벤트: sp = 긴 대사 4줄(글자 5자/초 — 배속 측정) · sk = 대사 → 선택지 → 입력 기다리기 → 대사 (스킵이 멈추는지)
//            fx = 대사 스타일(rise · 자간) → 대사 2줄 → 되돌리기 · ty = 줄마다 글자 크기 · 굵게 · 정렬 · 강조 색 · 여백
// ================================================================
const fs = require('fs'), path = require('path');
const env = require(path.join(__dirname, '..', 'tests', 'editor-env.js'));
(async () => {
  const dir = process.argv[2];
  if (!dir) { console.log('사용: testenv-project.js <폴더>'); process.exit(2); }
  if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'project.json')) && !/pdm-testenv|testenv-proj/.test(dir)) { console.log('이미 프로젝트가 있는 폴더입니다 (이름에 testenv-proj 가 들어간 폴더만 지움): ' + dir); process.exit(2); }
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { PDM } = env.load(), S = PDM.store;
  await S.createNew(dir, 'testenv-check');
  S.edit('project', '확장', p => { p.extensions = { event: true, story: true }; });
  S.edit('dialogue', '대사창', d => { d.mode = 'box'; });
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
  await S.save();
  console.log('ok ' + dir);
})();
