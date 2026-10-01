// ================================================================
//  프로젝트 설정
// ================================================================
PDM.registerEditor({
  id: 'project', icon: '⚙', title: () => '프로젝트 설정',
  match: k => k === 'project',
  tree: () => PDM.store.isOpen ? [{ id: 'project', label: '프로젝트 설정', icon: '⚙', open: 'project', order: 1 }] : [],
  render(key) {
    const { h } = PDM, { F, section, row } = PDM.ui;
    const p = PDM.store.get('project');
    const heroes = PDM.store.all('hero').map(c => [c.id, c.name]);
    const status = h('div', { class: 'hint' }, '확인 중…');
    PDM.assets.checkGameAssets().then(a => { status.textContent = a.ok ? '✓ 게임 에셋 연결됨: ' + a.dir : '✕ ' + a.reason; status.style.color = a.ok ? 'var(--good)' : 'var(--bad)'; });
    return h('div', { class: 'page' },
      h('h1', {}, '프로젝트 설정'),
      h('p', { class: 'lead' }, '프로젝트 폴더: ', h('span', { class: 'mono' }, PDM.store.root)),
      section('기본',
        row(F.text(key, ['name'], { label: '게임 이름' }), F.text(key, ['author'], { label: '만든 사람' })),
        row(F.select(key, ['startHero'], heroes, { label: '시작 영웅', empty: '(직업 선택 화면에서 고름)', hint: '비우면 영웅 편집기의 "바탕 직업"이 맞는 영웅이 적용됩니다' }),
          h('div', { class: 'field' }, h('span', { class: 'fl' }, '시작 맵'), h('div', {}, PDM.refName('node', (PDM.store.get('world') || {}).start), ' ', h('span', { class: 'hint' }, '(맵 그래프에서 노드 오른쪽 클릭 → 시작 노드로)')))),
        F.bool(key, ['heartButton'], { label: '게임 화면에 마음 창 버튼(하트) 표시' })),
      section('게임 저장소 연결',
        F.text(key, ['rpgMakerDir'], { label: 'RPG Maker MZ 설치 폴더 (리소스 가져오기)', hint: '비우면 프로젝트 위쪽 폴더에서 "RPG Maker MZ" 를 찾습니다. newdata 가 들어 있는 폴더' }),
        F.text(key, ['gameRepo'], { label: '게임 저장소 경로', hint: '프로젝트 폴더 기준 상대 경로 또는 절대 경로. 비우면 PDMaker 폴더 안의 game/shattered-pixel-dungeon-mod-2 를 씁니다', rerender: true, onchange: () => PDM.assets.clear() }),
        status,
        (() => {
          const box = h('div', { style: { marginTop: '6px' } });
          if (!pdm.paths || !pdm.repoBundle) return box;
          pdm.paths().then(async P => {
            const repo = PDM.store.abs(p.gameRepo || '.');
            const valid = p.gameRepo && ((await pdm.exists(pdm.join(repo, 'gradlew.bat'))) || (await pdm.exists(pdm.join(repo, 'gradlew'))));
            if (P.gameRepo) {
              const same = valid && pdm.relative(repo, P.gameRepo) === '';
              box.append(h('div', { class: 'hint', style: { color: 'var(--good)' } }, '✓ PDMaker 폴더 안에 게임 저장소가 있습니다: ' + P.gameRepo + (same ? '' : ' (이 프로젝트는 다른 경로를 씀)')),
                same ? null : h('button', { class: 'btn sm', style: { marginTop: '4px' }, onclick: async () => { PDM.store.edit('project', '게임 저장소 경로', o => { o.gameRepo = pdm.relative(PDM.store.root, P.gameRepo).replace(/\\/g, '/'); }); await PDM.store.save(); PDM.assets.clear(); PDM.tabs.refresh('project'); } }, 'PDMaker 폴더 안의 저장소 쓰기'));
            } else if (valid) {
              box.append(h('p', { class: 'hint' }, 'PDMaker 폴더 밖의 게임 저장소를 쓰고 있습니다. 다른 PC 로 PDMaker 를 옮기면 찾지 못하므로, PDMaker 폴더 안(game/)으로 옮겨 두는 것을 권장합니다.'),
                h('button', { class: 'btn sm pri', onclick: () => PDM.app.bundleRepo(repo) }, '게임 저장소를 PDMaker 폴더 안으로 옮기기'));
            } else box.append(h('p', { class: 'hint', style: { color: 'var(--bad)' } }, '게임 저장소가 없습니다. shattered-pixel-dungeon-mod-2 폴더를 PDMaker 폴더의 game/ 안에 넣거나 위 경로를 지정하세요: ' + P.gameRepoDefault));
          }).catch(() => { });
          return box;
        })(),
        F.text(key, ['legacyMaker'], { label: '이전 메이커(pixel-dungeon-maker) 경로', hint: '고급: Java 코드 생성기 탭에서 사용' })),
      section('게임 런타임 (pdmaker 패키지)', (() => {
        const st = h('div', { class: 'hint' }, '상태 확인 중…');
        const repo = PDM.store.abs(p.gameRepo);
        const refresh = () => pdm.runtimeStatus(repo).then(s => {
          st.textContent = s.web ? '웹 모드에서는 확인할 수 없습니다' : s.pkg ? `✓ 설치됨 — 연결 줄 ${s.hooks}/${s.total}` : '✕ 설치 안 됨 — 테스트 플레이 전에 설치하세요';
          st.style.color = s.pkg && s.hooks >= s.total ? 'var(--good)' : 'var(--warn)';
        }).catch(e => { st.textContent = e.message; });
        refresh();
        return h('div', {},
          h('p', { class: 'hint' }, '게임 저장소에 pdmaker 패키지와 영웅·아이템 코드(pdmaker/gen)를 넣고, 원본 코드 15개 파일에 연결 줄 32개를 "추가"합니다. 추가한 줄에는 // >>> pdmaker 표시가 붙고, 제거하면 원래대로 돌아갑니다. 에디터를 업데이트한 뒤에는 다시 설치하세요.'),
          st,
          h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
            h('button', { class: 'btn pri', onclick: async () => { try { await pdm.runtimeInstall(repo, PDM.store.root); toast('런타임 설치 완료'); refresh(); PDM.app.showBottom('log'); } catch (e) { toast(e.message, 'bad'); } } }, '설치 / 업데이트'),
            h('button', { class: 'btn danger', onclick: async () => { if (!(await PDM.ui.confirm('게임 저장소에서 pdmaker 런타임을 제거할까요?'))) return; try { await pdm.runtimeUninstall(repo); toast('제거했습니다'); refresh(); } catch (e) { toast(e.message, 'bad'); } } }, '제거')));
      })()),
      section('테스트 플레이',
        h('p', { class: 'hint' }, '▶ 테스트 플레이는 게임 저장소에서 gradle 로 게임을 실행하면서 이 프로젝트 폴더를 넘겨줍니다 (-Dpdmaker.project=…).',
          h('br'), '게임 쪽에 pdmaker 런타임 패키지가 들어가 있어야 프로젝트 데이터가 반영됩니다 (runtime/INTEGRATION.md 참고).'),
        h('p', { class: 'hint' }, '▶ 테스트 플레이를 누르면 런타임이 없거나 예전 것일 때 자동으로 설치·갱신합니다.'),
        h('p', { class: 'hint' }, '저장 폴더는 "PDMaker Playtest" 로 분리되어 실제 세이브와 섞이지 않습니다.')));
  }
});
