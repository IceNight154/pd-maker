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
      (() => {
        const bm = p.bannedMobs || [], gi = Object.entries((PDM.store.get('gameitems') || {}).items || {}).filter(([, v]) => v.banned).map(([k]) => k);
        const noSp = PDM.store.all('char').filter(c => c.noSpawn);
        if (!bm.length && !gi.length && !noSp.length) return null;
        const chip = (t, run, title) => h('button', { class: 'chip', title: title || '눌러서 금지 풀기', onclick: run }, t + ' ✕');
        return section('등장 금지 목록',
          h('p', { class: 'hint' }, '게임에 원래 있지만 이 프로젝트에서는 나오지 않게 한 것들입니다. 누르면 다시 나오게 됩니다.'),
          bm.length ? h('div', { class: 'mb-3' }, h('b', {}, '삭제한 원작 몬스터: '), bm.map(n => chip(n, () => PDM.store.edit('project', '등장 금지 풀기', o => { o.bannedMobs = (o.bannedMobs || []).filter(x => x !== n); })))) : null,
          noSp.length ? h('div', { class: 'mb-3' }, h('b', {}, '등장 금지한 몬스터: '), noSp.map(c => chip(c.name, () => PDM.store.edit('char:' + c.id, '등장 금지 풀기', o => { o.noSpawn = false; })))) : null,
          gi.length ? h('div', {}, h('b', {}, '등장 금지한 게임 아이템: '), gi.map(k => chip(k.slice(4), () => PDM.store.edit('gameitems', '등장 금지 풀기', r => { delete r.items[k].banned; if (!Object.keys(r.items[k]).length) delete r.items[k]; })))) : null);
      })(),
      section('게임 저장소 연결',
        h('p', { class: 'hint' }, 'PDMaker 는 Shattered Pixel Dungeon 의 소스 코드(게임 저장소) 위에 프로젝트를 얹어 실행합니다. 원작 소스(', h('a', { href: '#', onclick: e => { e.preventDefault(); pdm.openExternal && pdm.openExternal(PDM.SPD_REPO_URL); } }, PDM.SPD_REPO_URL), ')나 원래 작업하던 픽셀 던전 소스 폴더(gradlew 가 있는 맨 위 폴더)를 넣어야 테스트 플레이·게임 내보내기가 됩니다.'),
        F.text(key, ['gameRepo'], { onchange: v => PDM.store.edit('project', '게임 저장소 고정', r => { if (v) r.gameRepoPinned = true; else delete r.gameRepoPinned; }, { silent: true }), label: '게임 저장소 경로', hint: '프로젝트 폴더 기준 상대 경로 또는 절대 경로. 비우면 PDMaker 폴더 안의 game/shattered-pixel-dungeon-master 을 씁니다', rerender: true, onchange: () => PDM.assets.clear() }),
        (() => { const box = h('div', { class: 'hstack wrap m-0 mt-2 mb-3' });
          PDM.app.listRepos().then(list => { const cur = String(PDM.store.abs(p.gameRepo || '.')).replace(/[\\/]+$/, '').toLowerCase();
            box.append(h('span', { class: 'hint' }, 'game 폴더의 저장소:'), ...list.map(r => h('button', { class: 'btn sm' + (String(r.dir).replace(/[\\/]+$/, '').toLowerCase() === cur ? ' pri' : ''), title: r.dir, onclick: () => PDM.app.setRepo(r.dir) }, r.name)),
              h('button', { class: 'btn sm', onclick: async () => { const f = await pdm.openFolder('게임 저장소 폴더 선택 (gradlew 가 들어 있는 폴더)'); if (f) PDM.app.setRepo(f); } }, '다른 폴더 찾기…')); }).catch(() => { });
          return box; })(),
        status,
        (() => { const g = PDM.GAME_SCAN; const part = (n, x) => `${n} ${x.total}개` + (x.added.length ? ` (+${x.added.length})` : '') + (x.removed.length ? ` (−${x.removed.length})` : '');
          const an = g && g.analysis && g.analysis.summary;
          return h('div', { class: 'hint mt-3' }, g ? `리소스 목록을 이 저장소의 파일에 맞췄습니다 — ${part('게임 아이템', g.items)}, ${part('게임 방', g.rooms)}${g.newMobs.length ? ', 새 몬스터 ' + g.newMobs.length : ''}. ` + (an ? `분석: 소스 ${an.sourceOk}/${an.sourceFound} · 리소스 ${an.resourcesDecoded}/${an.resourcesFound} · 게임 객체 ${an.recognized} (오류 ${an.errors}${g.analysis.features.length ? ' · 구조 차이 ' + g.analysis.features.length : ''}). ` : '') : '리소스 목록의 게임 기본 항목은 묶여 있는 기준 목록입니다 (저장소를 찾으면 그 파일에 맞춥니다). ',
            h('button', { class: 'btn xs', onclick: async () => { const r = await PDM.app.resolveRepo(true); if (PDM.gameScan && r) { await PDM.gameScan(r, true); PDM.app.redraw(); PDM.tabs.refresh('project'); } } }, '게임 저장소 다시 읽기'),
            h('button', { class: 'btn xs ml-2', title: '저장소 구조 · 소스 · 그림 · 게임 객체를 읽어 PDMaker 가 어디까지 이해하는지 보여 줍니다 (읽기 전용)', onclick: () => PDM.tabs.open('repoanalysis') }, '저장소 분석 보고서'),
            h('button', { class: 'btn xs ml-2', title: '저장소의 파일 · 클래스 · 게임 데이터 · 번역을 찾아봄 (읽기 전용)', onclick: () => PDM.tabs.open('repoexplorer') }, '저장소 탐색'),
            h('button', { class: 'btn xs ml-2', title: '저장소의 이름 · 그림 · 능력치 · 분류로 맞춥니다. 사용자가 고친 칸은 그대로 두고, 저장소에 없는 것은 고른 것만 지웁니다 (먼저 보여 줌)', onclick: async () => { const r0 = await PDM.app.resolveRepo(true); if (PDM.gameScan && r0) await PDM.gameScan(r0, true); const r = await PDM.repoSync.dialog(); if (r) PDM.app.redraw(); } }, '영웅·캐릭터를 저장소에 맞추기')); })(),
        (() => {
          const box = h('div', { class: 'mt-3' });
          if (!pdm.paths || !pdm.repoBundle) return box;
          pdm.paths().then(async P => {
            const repo = PDM.store.abs(p.gameRepo || '.');
            const valid = p.gameRepo && ((await pdm.exists(pdm.join(repo, 'gradlew.bat'))) || (await pdm.exists(pdm.join(repo, 'gradlew'))));
            if (P.gameRepo) {
              const same = valid && pdm.relative(repo, P.gameRepo) === '';
              box.append(h('div', { class: 'hint c-good' }, '✓ PDMaker 폴더 안에 게임 저장소가 있습니다: ' + P.gameRepo + (same ? '' : ' (이 프로젝트는 다른 경로를 씀)')),
                same ? null : h('button', { class: 'btn sm mt-2', onclick: async () => { PDM.store.edit('project', '게임 저장소 경로', o => { o.gameRepo = pdm.relative(PDM.store.root, P.gameRepo).replace(/\\/g, '/'); }); await PDM.store.save(); PDM.assets.clear(); PDM.tabs.refresh('project'); } }, 'PDMaker 폴더 안의 저장소 쓰기'));
            } else if (valid) {
              box.append(h('p', { class: 'hint' }, 'PDMaker 폴더 밖의 게임 저장소를 쓰고 있습니다. 다른 PC 로 PDMaker 를 옮기면 찾지 못하므로, PDMaker 폴더 안(game/)으로 옮겨 두는 것을 권장합니다.'),
                h('button', { class: 'btn sm pri', onclick: () => PDM.app.bundleRepo(repo) }, '게임 저장소를 PDMaker 폴더 안으로 옮기기'));
            } else box.append(h('p', { class: 'hint c-bad' }, '게임 저장소가 없습니다. shattered-pixel-dungeon-master 폴더를 PDMaker 폴더의 game/ 안에 넣거나 위 경로를 지정하세요: ' + P.gameRepoDefault));
          }).catch(() => { });
          return box;
        })(),
        PDM.extensions.on('sys') ? h('details', { class: 'mt-4' }, h('summary', { class: 'hint' }, '고급: 이전 메이커 경로 (게임 저장소가 아님)'), F.text(key, ['legacyMaker'], { label: '이전 메이커(pixel-dungeon-maker) 경로', hint: 'Java 코드 생성기 탭에서만 씁니다. 게임 저장소 경로는 위의 "게임 저장소 경로" 칸입니다.' })) : null),
      section('게임 런타임 (pdmaker 패키지)', (() => {
        const st = h('div', { class: 'hint' }, '상태 확인 중…');
        const repo = PDM.store.abs(p.gameRepo);
        const cmp = h('div', { class: 'hint mt-2' });
        const refresh = () => pdm.runtimeStatus(repo).then(s => {
          const c = s.compat;
          const ad = s.adapt, rs = s.state, cantMiss = ad && ad.missing && ad.missing.length;
          const need = rs && rs.need != null ? rs.need : s.total - ((c && c.missing.length) || 0);
          st.textContent = s.web ? '웹 모드에서는 확인할 수 없습니다' : c && !c.ok ? '✕ 이 게임 저장소에는 설치할 수 없습니다' : cantMiss ? `✕ 이 저장소에 없는 게임 클래스 ${ad.missing.length}개 — 설치하지 않습니다` : s.pkg ? (rs && !rs.upToDate ? `△ 설치됨 — 갱신 필요 (${rs.reason})` : `✓ 설치됨 — 연결 줄 ${s.hooks}/${need}`) : '✕ 설치 안 됨 — 테스트 플레이 전에 설치하세요 (▶ 테스트 플레이가 자동으로 설치)';
          st.style.color = (c && !c.ok) || cantMiss ? 'var(--bad)' : s.pkg && (!rs || rs.upToDate) ? 'var(--good)' : 'var(--warn)';
          cmp.innerHTML = '';
          if (c) {
            cmp.append(h('div', {}, `게임: ${c.game || '(이름 없음)'}${c.version ? ' ' + c.version : ''} · 패키지 ${c.pkg || '?'} — Shattered Pixel Dungeon 계열 (판 · 파생작마다 다른 부분은 설치할 때 이 저장소 구조에 맞춤)`));
            c.problems.forEach(x => cmp.append(h('div', { class: 'c-bad' }, '✕ ' + x)));
            c.warnings.forEach(x => cmp.append(h('div', { class: 'c-warn' }, '⚠ ' + x)));
          }
          // 11차: 이 저장소에 맞춘 것 (게임 본체 · 옮겨진 클래스 · 다른 방식으로 동작하는 기능 · 붙일 구조가 없는 기능)
          if (ad && !ad.error) {
            const off = (ad.features || []).filter(f => !f.on);
            const pt = s.patches || [], na = pt.filter(x => x.state === 'na'), alt = pt.filter(x => x.state === 'alt'), miss = pt.filter(x => x.state === 'missing' || x.state === 'nofile');
            const rows = [];
            if (ad.mainGame && ad.mainGame !== 'ShatteredPixelDungeon') rows.push(h('div', { class: 'ra-row' }, h('span', { class: 'badge info' }, '맞춤'), `게임 본체 클래스 ${ad.mainGame} — 런타임 사본의 이름을 이것으로`));
            (ad.relocations || []).forEach(r => rows.push(h('div', { class: 'ra-row' }, h('span', { class: 'badge info' }, '맞춤'), `${r.from.split('.').slice(-2).join('.')} → ${r.to} (${r.note})`)));
            off.forEach(f => rows.push(h('div', { class: 'ra-row', title: f.cond + '\n' + f.where.join('\n') }, h('span', { class: 'badge ' + (/^직업 능력/.test(f.label) ? 'warn' : 'info') }, /^직업 능력/.test(f.label) ? '안 됨' : '다른 방식'), f.label || f.cond)));
            na.forEach(x => rows.push(h('div', { class: 'ra-row' }, h('span', { class: 'badge warn' }, '구조 없음'), `${x.name} (${x.file})`)));
            if (alt.length) rows.push(h('div', { class: 'ra-note' }, `같은 기능을 이 저장소의 다른 자리에 넣는 연결 줄 ${alt.length}개 (예: 텐구의 가면 대신 숙련의 서 · MobSpawner 대신 MobRotation)`));
            if (cantMiss) ad.missing.forEach(m => rows.push(h('div', { class: 'ra-row' }, h('span', { class: 'badge bad' }, '없음'), `${m.cls} (${m.uses.join(', ')})`)));
            if (miss.length) rows.push(h('details', {}, h('summary', {}, `위치를 찾지 못한 연결 줄 ${miss.length}개 — 그 기능만 동작하지 않음`), ...miss.map(x => h('div', {}, '· ' + x.file + ' — ' + x.name))));
            if (rows.length) cmp.append(h('details', { class: 'ra-grp mt-2', open: !!cantMiss }, h('summary', { class: 'pointer' }, h('b', {}, '이 게임 저장소에 맞춤'), ' ', h('span', { class: 'ra-note' }, `다른 방식 ${off.length} · 구조 없음 ${na.length} · 다른 자리 ${alt.length}` + (cantMiss ? ` · 없는 클래스 ${ad.missing.length}` : ''))), ...rows));
          }
        }).catch(e => { st.textContent = e.message; });
        refresh();
        return h('div', {},
          h('p', { class: 'hint' }, '게임 저장소에 pdmaker 패키지와 영웅·아이템 코드(pdmaker/gen)를 넣고, 원본 코드에 연결 줄을 "추가"합니다 (서비스 모듈은 파일이 있을 때만). 추가한 줄에는 // >>> pdmaker 표시가 붙고, 제거하면 원래대로 돌아갑니다. 에디터를 업데이트한 뒤에는 다시 설치하세요.'),
          st, cmp,
          h('div', { class: 'flex gap-3 mt-4' },
            h('button', { class: 'btn pri', onclick: async () => { try { await pdm.runtimeInstall(repo, PDM.store.root); toast('런타임 설치 완료'); refresh(); PDM.app.showBottom('log'); } catch (e) { toast(e.message, 'bad'); } } }, '설치 / 업데이트'),
            h('button', { class: 'btn danger', onclick: async () => { if (!(await PDM.ui.confirm('게임 저장소에서 pdmaker 런타임을 제거할까요?'))) return; try { await pdm.runtimeUninstall(repo); toast('제거했습니다'); refresh(); } catch (e) { toast(e.message, 'bad'); } } }, '제거')));
      })()),
      section('게임 이름 · 세이브 위치 (build.gradle)',
        (() => { const { F, row } = PDM.ui, g = p.game || {}, pkg = PDM.validPackage(g.appPackageName) ? g.appPackageName : 'com.shatteredpixel.shatteredpixeldungeon', nm = g.appName || (/^[\x20-\x7e]+$/.test(p.name || '') ? p.name : 'PDMaker ' + (pdm.basename(PDM.store.root || '').replace(/[^\x20-\x7e]/g, '').trim() || 'Game'));
          return h('div', {},
            row(F.text('project', ['game', 'appName'], { label: '게임 이름 (appName)', placeholder: '비우면 프로젝트 이름 (한글이면 PDMaker + 폴더 이름)', rerender: true, hint: '게임 창 제목 · 세이브 폴더 이름. 영문을 권합니다.' }),
              F.text('project', ['game', 'appPackageName'], { label: '패키지 이름 (appPackageName)', placeholder: '비우면 게임 저장소 그대로', rerender: true, hint: g.appPackageName && !PDM.validPackage(g.appPackageName) ? '⚠ 영문 소문자·숫자를 점으로 이은 꼴이어야 적용됩니다 (예: com.myname.mygame)' : '예: com.myname.mygame' })),
            h('p', { class: 'hint' }, '테스트 플레이·게임 내보내기 때 게임 저장소 맨 위 build.gradle 의 appName · appPackageName 에 적습니다 (처음 고칠 때 build.gradle.pdmaker-backup 을 남김).'),
            h('p', { class: 'hint' }, '세이브 데이터 위치 (Windows): ', h('code', {}, `%APPDATA%\\.${pkg.split('.')[1]}\\${nm}\\`), ' — 원작은 ', h('code', {}, '%APPDATA%\\.shatteredpixel\\Shattered Pixel Dungeon\\'), '. 게임 이름이나 패키지 이름을 바꾸면 세이브가 다른 폴더에 저장되어 원작·다른 프로젝트와 섞이지 않습니다. (이름을 바꾸면 이전 세이브는 예전 폴더에 남습니다.)')); })()),
      section('테스트 플레이',
        PDM.ui.F.select('project', ['settings', 'playTask'], [['debug', 'gradle desktop:debug (기본 — 게임 원래 실행 작업 · 버전 -INDEV · 세이브는 위 게임 이름 폴더)'], ['playtest', 'PDMaker 테스트 실행 (버전 -PLAYTEST · 세이브는 "PDMaker Playtest" 폴더)']],
          { label: '▶ 테스트 플레이 빌드 방식', hint: '두 방식 모두 이 프로젝트를 게임에 넘겨줍니다. debug 는 내보낸 게임과 같은 세이브 폴더를 쓰고, PDMaker 테스트 실행은 세이브를 따로 둡니다.' }),
        h('p', { class: 'hint' }, '▶ 테스트 플레이는 게임 저장소에서 gradle 로 게임을 실행하면서 이 프로젝트 폴더를 넘겨줍니다 (-Dpdmaker.project=…).',
          h('br'), '게임 쪽에 pdmaker 런타임 패키지가 들어가 있어야 프로젝트 데이터가 반영됩니다 (runtime/INTEGRATION.md 참고).'),
        h('p', { class: 'hint' }, '▶ 테스트 플레이를 누르면 런타임이 없거나 예전 것일 때 자동으로 설치·갱신합니다.')));
  }
});
