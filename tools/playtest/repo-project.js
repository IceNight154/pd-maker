#!/usr/bin/env node
// ================================================================
//  11차: 선택한 게임 저장소로 PDMaker 프로젝트 만들기 (편집기와 같은 과정 — 분석 → 저장소 맞추기 → 저장)
//    사용: node tools/playtest/repo-project.js <게임 저장소> <만들 폴더>   (폴더 이름에 repo-proj 가 있어야 지움 — 실제 프로젝트를 주지 마세요)
//    게임 저장소는 읽기만 함. 결과 = 영웅 · 캐릭터 · 맵 노드가 그 저장소 기준인 프로젝트 (테스트 플레이 검사용)
// ================================================================
const fs = require('fs'), path = require('path'), os = require('os');
const env = require(path.join(__dirname, '..', 'tests', 'editor-env.js'));
(async () => {
  const [repo, dir] = process.argv.slice(2);
  if (!repo || !dir || !/repo-proj/.test(dir)) { console.log('사용: repo-project.js <게임 저장소> <폴더 — 이름에 repo-proj>'); process.exit(2); }
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const ctx = env.load({ analyzer: true, analysisCache: fs.mkdtempSync(path.join(os.tmpdir(), 'pdm-rp-')) }), P = ctx.PDM; P.log = () => { };
  await P.store.createNew(dir, 'repo-' + path.basename(repo));
  await P.gameScan(path.resolve(repo), true);
  await P.gameSyncVanilla(false, { remove: 'untouched' });
  if (P.repoMaps && P.REPO_ANALYSIS) P.repoMaps.autoSync();   // 편집기의 새 프로젝트와 같게: 저장소 맵을 맵 그래프에
  P.store.edit('project', '게임 저장소', p => { p.gameRepo = path.resolve(repo); });
  await P.store.save();
  const heroes = P.store.all('hero').map(h => ({ id: h.id, name: h.name, sheet: (h.sprite || {}).sheet, frame: (h.sprite || {}).frame, rowH: (h.sprite || {}).rowH, scale: (h.sprite || {}).scale, iconTier: (h.select || {}).iconTier, anims: Object.keys((h.sprite || {}).anims || {}).join(','), idle: (((h.sprite || {}).anims || {}).idle || {}).frames }));
  const W = P.World.compute(P.store.get('world')), w = P.store.get('world');
  const at = id => `${id}@${W.depth[id]}/${W.branch[id]}${P.repoMaps && P.repoMaps.isNative(P.store.get('node:' + id)) ? '*' : ''}`;
  console.log(JSON.stringify({ dir, heroes, start: at(w.start), nodes: w.nodes.slice(0, 40).map(n => at(n.id)), all: w.nodes.map(n => at(n.id)).sort() }, null, 0));
})().catch(e => { console.error(e); process.exit(1); });
