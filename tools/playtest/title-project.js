#!/usr/bin/env node
// ================================================================
//  타이틀 화면 검사용 프로젝트 만들기 (tools/playtest/title-check.sh 가 씀) — 7차
//    사용: node tools/playtest/title-project.js <만들 폴더> [base|full]   (폴더를 지우고 새로 만듦 — 이름에 title-proj 가 들어간 폴더만)
//    base = 타이틀 설정을 켜기만 한 것 (예전 모양 그대로 · 호환 확인)
//    broken = 손상된 값 (형이 틀린 칸 · 없는 창 · 모르는 종류) — 게임이 멈추지 않는지
//    full = 7차 기능: 글 · 그림 · 정보 요소, 버튼 상태 · 효과, 자유 배치, 팝업 창(글 · 스크롤 · 버튼 · 설정 · 정보), 이어하기(저장 없음)
// ================================================================
const fs = require('fs'), path = require('path');
const env = require(path.join(__dirname, '..', 'tests', 'editor-env.js'));
(async () => {
  const dir = process.argv[2], kind = process.argv[3] || 'full';
  if (!dir) { console.log('사용: title-project.js <폴더> [base|full]'); process.exit(2); }
  if (fs.existsSync(path.join(dir, 'project.json')) && !/title-proj/.test(dir)) { console.log('이미 프로젝트가 있는 폴더입니다 (이름에 title-proj 가 들어간 폴더만 지움): ' + dir); process.exit(2); }
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { PDM } = env.load(), S = PDM.store;
  await S.createNew(dir, 'title-check');
  S.edit('project', '정보', p => { p.name = '타이틀 검사'; p.author = '검사팀'; p.gameRepo = path.relative(dir, path.join(__dirname, '..', '..', 'game', 'shattered-pixel-dungeon-master')); });
  S.edit('title', '켜기', t => { t.enabled = true; });
  if (kind === 'full' && PDM.titleModel) S.edit('title', '7차 예시', t => PDM.titleModel.sample(t));
  // broken = 손상된 값 (사람이 손으로 고친 파일 · 다른 판에서 온 파일) — 게임이 멈추지 않고 쓸 수 있는 것만 쓰는지
  if (kind === 'broken') S.edit('title', '손상', t => {
    t.elements = [null, 5, { id: 'e1', type: 'text', text: { a: 1 }, size: 'big', x: 'a', effects: 'x' }, { id: 'e2', type: 'image', image: 'assets/없는그림.png' }, { id: 'e3', type: 'video' }];
    t.windows = [{ id: 'w', w: 'wide', content: [null, { type: 'button', action: 'window', window: 'missing' }, { type: 'setting', key: 'nope' }, { type: 'zzz' }], anim: 5 }, 'x'];
    t.buttons.layout = 'free';
    t.buttons.states = { hover: 'x', focus: { skin: 'NOPE', textColor: 'red', alpha: '9' }, weird: {} };
    t.buttons.items = [{ id: 'play', effects: [{ type: 'bogus', duration: -1, repeat: 'x' }, null], place: 'x' }, { id: 5 }, null, { id: 'c', custom: true, action: 'window', window: 'missing' }];
  });
  await S.save();
  console.log('ok ' + dir);
})();
