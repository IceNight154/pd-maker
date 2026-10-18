#!/usr/bin/env node
// ================================================================
//  타이틀 화면 검사용 프로젝트 만들기 (tools/playtest/title-check.sh 가 씀) — 7차
//    사용: node tools/playtest/title-project.js <만들 폴더> [base|full]   (폴더를 지우고 새로 만듦 — 이름에 title-proj 가 들어간 폴더만)
//    base = 타이틀 설정을 켜기만 한 것 (예전 모양 그대로 · 호환 확인)
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
  await S.save();
  console.log('ok ' + dir);
})();
