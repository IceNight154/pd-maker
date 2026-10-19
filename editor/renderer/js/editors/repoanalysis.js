// ================================================================
//  게임 저장소 분석 보고서 (9차) — editor/repo-analyzer.js 의 결과를 보여 줌 (읽기 전용 · 원본 파일은 바꾸지 않음)
//    탭 키: 'repoanalysis'  ·  열기: 프로젝트 설정 › 게임 저장소 연결 › "저장소 분석 보고서" · 메뉴 프로젝트 › 게임 저장소 분석
//    요약 · 구조 차이(어댑터) · 지원 범위(단계별) · 게임 객체 · 문제 목록(누르면 파일 경로 · 원인 · 코드) · 런타임 설치 가능 여부
//    표의 값 · 근거 · "없음" 같은 내용은 .ra-note (tips.js 가 .hint 를 ⓘ 말풍선으로 숨기므로 — 설명문만 .hint)
//    결과는 분석기 캐시(사용자 설정 폴더)에 남아서 프로젝트를 닫았다 열어도 그대로 — 저장소 파일이 바뀌면 다시 분석
// ================================================================
(function () {
  const h = PDM.h;
  const STAGES = [['found', '파일 발견'], ['read', '읽기'], ['structure', '구조 분석'], ['semantic', '의미 분석'], ['model', '내부 모델 변환'], ['display', '편집기 표시'], ['edit', '편집 · 저장'], ['runtime', '게임 런타임']];
  const LVL = { ok: ['good', '지원'], partial: ['warn', '일부'], no: ['bad', '미지원'], unknown: ['info', '미확인'], na: ['', '해당 없음'] };
  const fmtN = n => n == null ? '–' : String(n);
  const badge = (s, txt, title) => { const [c, l] = LVL[s] || LVL.unknown; return h('span', { class: 'badge ' + c, title: title || '' }, txt || l); };

  /** 분석 실행 (같은 저장소면 캐시) → ctx.state.rep */
  async function run(ctx, opts = {}) {
    const st = ctx.state;
    if (!pdm.analyzeRepo) { st.err = '이 실행 환경(웹 모드)에는 저장소 분석기가 없습니다 — Electron 편집기에서 여세요.'; ctx.refresh(); return; }
    st.loading = true; st.err = ''; ctx.refresh();
    try {
      const dir = opts.dir || st.dir || await PDM.app.resolveRepo(true);
      if (!dir) throw new Error('게임 저장소를 찾지 못했습니다 (프로젝트 설정 › 게임 저장소 경로)');
      st.dir = dir;
      const rep = await pdm.analyzeRepo(dir, { force: !!opts.force });
      st.rep = rep;
      // 프로젝트의 게임 저장소를 다시 분석했으면 리소스 목록도 같은 결과로 (중복 없이 다시 맞춤)
      if (opts.rescan && PDM.gameScan && PDM.GAME_SCAN && rep.root && String(PDM.GAME_SCAN.repo).replace(/[\\/]+$/, '').toLowerCase() === String(rep.root).replace(/[\\/]+$/, '').toLowerCase()) { await PDM.gameScan(PDM.GAME_SCAN.repo, true); PDM.app.redraw(); }
      PDM.log(`저장소 분석 ${rep.cached ? '(바뀐 파일 없음 — 저장된 결과)' : '완료'}: ${rep.name || dir} — 오류 ${rep.errors.length} · 경고 ${rep.warnings.length}`, rep.errors.length ? 'err' : 'ok');
    } catch (e) { st.err = String(e && e.message || e); PDM.log('저장소 분석 실패: ' + st.err, 'err'); }
    st.loading = false; ctx.refresh();
  }

  /** 문제 하나 자세히: 파일 경로 · 원인 · 줄 · 코드 일부 · 폴더에서 보기 */
  async function showItem(rep, it, title) {
    const abs = it.file ? pdm.join(rep.root, ...String(it.file).split('/')) : '';
    const body = h('div', { class: 'vstack gap-4' },
      h('div', { class: 'kv' },
        h('b', {}, '파일'), h('span', { class: 'mono', style: { userSelect: 'text', wordBreak: 'break-all' } }, abs || '(파일 없음)'),
        it.line ? h('b', {}, '줄') : null, it.line ? h('span', {}, String(it.line)) : null,
        h('b', {}, '원인'), h('span', { class: 'pre-wrap', style: { userSelect: 'text' } }, it.reason || it.reasons || '(원인 없음)'),
        it.extra ? h('b', {}, '자세히') : null, it.extra ? h('span', { class: 'pre-wrap', style: { userSelect: 'text' } }, it.extra) : null));
    if (abs && /\.(java|kt|gradle|properties|json|txt|xml|md)$/i.test(abs)) {
      try {
        const src = await pdm.readText(abs), lines = src.split(/\r?\n/), at = Math.max(1, (it.line || 1) - 6), to = Math.min(lines.length, (it.line || 1) + 10);
        body.append(PDM.gameSrc && PDM.gameSrc.codeView ? PDM.gameSrc.codeView(lines.slice(at - 1, to).join('\n'), at, it.line) : h('pre', {}, lines.slice(at - 1, to).join('\n')));
      } catch (e) { body.append(h('div', { class: 'hint c-bad' }, '파일을 읽지 못했습니다: ' + e.message)); }
    }
    const btns = [['닫기', false]];
    if (abs && pdm.showInFolder) btns.unshift(['폴더에서 보기', 'show']);
    const r = await PDM.ui.modal(title || '분석 결과', body, btns);
    if (r === 'show') pdm.showInFolder(abs);
  }

  /** 줄 목록 (처음 n개 + 더 보기) */
  function list(rep, items, map, opts = {}) {
    const n0 = opts.n || 40, box = h('div', { class: 'vstack gap-1' });
    let shown = 0;
    const more = h('button', { class: 'btn xs mt-2', onclick: () => draw(shown + 200) });
    const draw = upto => {
      const from = shown; shown = Math.min(items.length, upto);
      for (let i = from; i < shown; i++) { const it = map(items[i]);
        box.insertBefore(h('div', { class: 'ra-row pointer', tabindex: 0, title: '눌러서 파일 경로 · 원인 보기', onclick: () => showItem(rep, it, opts.title),
          onkeydown: e => { if (e.key === 'Enter') showItem(rep, it, opts.title); } },
          it.badge || null, h('span', { class: 'mono truncate', style: { maxWidth: '46%' } }, (it.file || it.label || '') + (it.line ? ':' + it.line : '')), h('span', { class: 'c-mute truncate grow' }, it.reason || '')), more); }
      more.textContent = `더 보기 (${items.length - shown}개 남음)`; more.style.display = shown < items.length ? '' : 'none';
    };
    box.append(more); draw(n0);
    if (opts.total && opts.total > items.length) box.append(h('div', { class: 'ra-note' }, `보고서에는 ${items.length}개까지만 담겼습니다 (전체 ${opts.total}개).`));
    return items.length ? box : h('div', { class: 'ra-note' }, opts.empty || '없음');
  }

  function render(key, ctx) {
    const st = ctx.state = ctx.state || {};
    const { section } = PDM.ui;
    if (!st.rep && !st.loading && !st.err && !st.started) {
      st.started = true;
      // 리소스 목록을 맞출 때 이미 분석했으면 그 결과부터 (캐시) — 없으면 지금 분석
      if (PDM.REPO_ANALYSIS && PDM.GAME_SCAN && PDM.REPO_ANALYSIS.root) { st.rep = PDM.REPO_ANALYSIS; st.dir = PDM.GAME_SCAN.repo; }
      else setTimeout(() => run(ctx), 0);
    }
    const rep = st.rep;
    const page = h('div', { class: 'page ra' },
      h('h1', {}, '게임 저장소 분석'),
      h('p', { class: 'lead' }, '게임 저장소의 구조 · 소스 · 그림 · 소리 · 게임 객체를 읽기만 해서, PDMaker 가 무엇을 어디까지 이해하고 편집할 수 있는지 보여 줍니다. 원본 파일은 바꾸지 않습니다.'),
      h('div', { class: 'hstack wrap mb-5' },
        h('button', { class: 'btn pri', disabled: st.loading, onclick: () => run(ctx, { force: true, rescan: true }) }, st.loading ? '분석 중…' : '다시 분석'),
        h('button', { class: 'btn', disabled: st.loading, title: '프로젝트의 게임 저장소는 그대로 두고 다른 폴더를 분석만 합니다', onclick: async () => { const f = await pdm.openFolder('분석할 게임 저장소 폴더 (settings.gradle 이 있는 폴더 또는 그 위)'); if (f) run(ctx, { dir: f }); } }, '다른 폴더 분석…'),
        rep && pdm.saveFile ? h('button', { class: 'btn', onclick: async () => { const f = await pdm.saveFile('분석 보고서 저장', (rep.name || 'repo') + '-analysis.json', ['json']); if (f) { await pdm.writeText(f, JSON.stringify(rep, null, 1)); PDM.log('분석 보고서를 저장했습니다: ' + f, 'ok'); } } }, '보고서 저장 (JSON)…') : null,
        rep ? h('span', { class: 'hint' }, `${rep.cached ? '저장된 결과 (저장소 파일이 그대로)' : '방금 분석'} · ${new Date(rep.generatedAt).toLocaleString()} · ${rep.durationMs}ms`) : null));
    if (st.err) page.append(h('div', { class: 'box c-bad mb-5' }, st.err));
    if (!rep) { page.append(h('div', { class: 'empty' }, st.loading ? '저장소를 읽는 중입니다… (큰 저장소는 처음 한 번 오래 걸릴 수 있음)' : '아직 분석하지 않았습니다')); return page; }

    // ---- 루트를 못 정했을 때: 후보
    if (!rep.root) {
      page.append(section('저장소를 고르세요', h('p', { class: 'ra-note' }, (rep.errors[0] || {}).reason || '게임 저장소를 찾지 못했습니다.'),
        ...(rep.candidates || []).map(c => h('div', { class: 'hstack my-1' }, h('span', { class: 'mono' }, c), h('button', { class: 'btn sm', onclick: () => run(ctx, { dir: c }) }, '이 저장소 분석')))));
      return page;
    }
    const S = rep.summary || {}, B = rep.build || {}, src = rep.source || {}, O = rep.objects || {};
    const kvs = (pairs) => h('div', { class: 'kv' }, ...pairs.filter(p => p[1] != null && p[1] !== '').flatMap(([k, v]) => [h('b', {}, k), typeof v === 'string' ? h('span', { style: { userSelect: 'text', wordBreak: 'break-all' } }, v) : v]));

    page.append(section('요약',
      kvs([['이름', rep.name], ['저장소 루트', rep.root], ['루트로 고른 이유', rep.rootReason], ['게임 모듈', `${src.gameModule || '(없음)'} — ${src.javaRoot || ''}`], ['패키지', src.pkg ? `${src.pkg}${src.pkgFamily === 'renamed' ? '  (패키지를 바꾼 파생작 — 런타임 설치 불가)' : ''}` : null],
        ['시작 클래스', (src.entry && src.entry.game || []).map(g => `${g.cls} (${g.file}:${g.line})`).join(', ')],
        ['빌드', [B.appVersionName && '판 ' + B.appVersionName, B.appPackageName, B.gdxVersion && 'libGDX ' + B.gdxVersion, B.javaCompat, B.gradleVersion && 'Gradle ' + B.gradleVersion].filter(Boolean).join(' · ')],
        ['모듈', h('span', { class: 'hstack wrap gap-2' }, ...(rep.modules || []).map(m => h('span', { class: 'badge' + (m.exists ? '' : ' bad'), title: [m.java.length ? 'java: ' + m.java.join(', ') : '', m.assets.length ? 'assets: ' + m.assets.join(', ') : '', m.manifest ? 'AndroidManifest' : ''].filter(Boolean).join('\n') || '소스 없음' }, m.name)))],
        ['PDMaker 런타임', src.pdmakerRuntime ? `이미 설치됨 (${src.pdmakerRuntime}개 파일 — 분석에서 뺌)` : '설치 안 됨']]),
      h('table', { class: 'grid mt-5 ra-sum' },
        h('thead', {}, h('tr', {}, h('th', {}, '측정 항목'), h('th', {}, '값'))),
        h('tbody', {}, ...[
          ['소스 파일 (Java)', `${fmtN(S.sourceFound)} 발견 · ${fmtN(S.sourceOk)} 분석 성공 · ${fmtN(S.sourcePartial)} 부분 · ${fmtN(S.sourceFailed)} 실패`],
          ['리소스 파일', `${fmtN(S.resourcesFound)} 발견 · ${fmtN(S.resourcesDecoded)} 디코딩 성공 · ${fmtN(S.resourcesFailed)} 실패 · ${fmtN(S.resourcesUnsupported)} 미지원/무시`],
          ['게임 객체', `${fmtN(S.recognized)} 인식 · ${fmtN(S.converted)} PDMaker 목록으로 변환 · ${fmtN(S.unsupported)} 원본 참조만 보존`],
          ['영웅 · 몬스터 · 아이템', `영웅 ${fmtN(S.heroes)} · 몬스터/NPC ${fmtN(S.mobs)} (그림 연결 ${fmtN(S.mobsWithSprite)}) · 아이템 ${fmtN(S.items)} (그림 번호 ${fmtN(S.itemsWithImage)})`],
          ['오류 · 경고', `${fmtN(S.errors)} · ${fmtN(S.warnings)}`]].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))));

    // ---- 구조 차이 (어댑터)
    page.append(section(`이 저장소의 구조 차이 (${(rep.features || []).length})`,
      h('p', { class: 'hint' }, '폴더 이름이 아니라 소스 구조에서 찾은 차이입니다. PDMaker 는 차이마다 맞는 방식(어댑터)으로 읽습니다.'),
      ...(rep.features || []).map(f => h('div', { class: 'ra-feat' }, h('b', {}, f.label), h('div', { class: 'ra-note' }, '근거: ', h('span', { class: 'mono' }, f.evidence)), f.effect ? h('div', { class: 'ra-note' }, '처리: ' + f.effect) : null)),
      (rep.features || []).length ? null : h('div', { class: 'ra-note' }, '기준 저장소(Shattered Pixel Dungeon)와 같은 구조입니다 — 따로 맞출 차이가 없습니다.')));

    // ---- 지원 범위
    page.append(section('지원 범위 (단계별)',
      h('p', { class: 'hint' }, '파일이 있다는 것과 PDMaker 가 그 뜻을 이해한다는 것은 다릅니다. 칸에 마우스를 올리면 설명이 나옵니다. "미확인" = 이번 분석으로는 확인하지 못함 (실패로 보지 않음).'),
      h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'grid ra-support' },
        h('thead', {}, h('tr', {}, h('th', {}, '항목'), ...STAGES.map(s => h('th', {}, s[1])))),
        h('tbody', {}, ...(rep.support || []).map(r => h('tr', {}, h('td', { title: r.note || '' }, r.area, r.note ? h('div', { class: 'ra-note' }, r.note) : null),
          ...STAGES.map(([k]) => { const c = r.stages[k] || { s: 'unknown' }; return h('td', {}, badge(c.s, c.n ? `${(LVL[c.s] || LVL.unknown)[1]} ${c.n}` : null, c.note || '')); }))))))));

    // ---- 게임 객체
    const objTabs = [['heroes', '영웅'], ['mobs', '몬스터 · NPC'], ['items', '아이템'], ['rooms', '방'], ['levels', '층'], ['buffs', '버프'], ['plants', '식물'], ['traps', '함정'], ['blobs', 'Blob']].filter(([k]) => (O[k] || []).length);
    st.obj = st.obj || 'heroes';
    const objBody = h('div', {});
    const drawObj = () => {
      objBody.textContent = '';
      const L = O[st.obj] || [];
      const rows = L.map(x => {
        let s = 'ok', reason = '';
        if (st.obj === 'heroes') { s = x.sheetFound ? 'ok' : 'no'; reason = `${x.name || ''} · 그림 ${x.sheet || '(못 찾음)'}${x.hidden ? ' · 영웅 선택 화면에서 감춤' : ''}`; }
        else if (st.obj === 'mobs') { s = x.abstract || x.base ? 'na' : x.convertible && x.spriteOk ? 'ok' : x.convertible ? 'partial' : 'no'; reason = [x.name, x.sprite && x.sprite.sheet ? '그림 ' + x.sprite.sheet + (x.sprite.frame ? ` (${x.sprite.frame.join('×')})` : '') : '', ...(x.reasons || [])].filter(Boolean).join(' · '); }
        else if (st.obj === 'items') { s = x.abstract || x.base ? 'na' : x.convertible && x.index !== undefined && x.inSheet !== false ? 'ok' : x.convertible ? 'partial' : 'no'; reason = [x.name, x.image ? `${x.image}${x.index !== undefined ? ' #' + x.index : ''}` : '', ...(x.reasons || [])].filter(Boolean).join(' · '); }
        else { s = x.abstract ? 'na' : 'ok'; reason = (x.parent ? 'extends ' + x.parent : '') + (x.abstract ? ' · 추상' : ''); }
        return { file: x.file, line: x.line, label: x.cls, reason: `${x.cls} — ${reason}`, badge: badge(s), reasons: reason, extra: st.obj === 'mobs' && x.sprite ? `스프라이트: ${x.sprite.ref}${x.sprite.from ? ' (' + x.sprite.from + ' 에서 이어받음)' : ''} → ${x.sprite.file || '?'}\n체력 ${fmtN(x.stats.hp)} · 회피 ${fmtN(x.stats.evasion)} · 경험치 ${fmtN(x.stats.exp)}` : st.obj === 'items' && x.imageFrom ? `그림 상수는 ${x.imageFrom} 에서 이어받음` : '' };
      });
      objBody.append(list(rep, rows, r => r, { title: '게임 객체', n: 60 }));
    };
    page.append(section('게임 객체',
      h('div', { class: 'chips mb-4' }, ...objTabs.map(([k, l]) => h('button', { class: 'chip' + (st.obj === k ? ' on' : ''), onclick: e => { st.obj = k; e.target.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === e.target)); drawObj(); } }, `${l} ${(O[k] || []).length}`))),
      O.heroFrame ? h('div', { class: 'ra-note mb-2' }, `영웅 그림 한 칸: ${O.heroFrame.join('×')} · 특성 ${O.talents || 0}개 · 전직 ${(O.subclasses || []).length}개` + (O.mobRotation ? ` · 층별 몬스터 목록: ${O.mobRotation.rel}` : ' · 층별 몬스터 목록을 찾지 못함') + (rep.itemSheet ? ` · 아이템 시트 ${rep.itemSheet.cell}px × 한 줄 ${rep.itemSheet.cols}칸` : '')) : null,
      objBody));
    drawObj();

    // ---- 문제 목록
    const R = rep.resources || {}, F = rep.refs || {}, J = src.java || {}, M = rep.messages || {};
    const groups = [
      ['분석 오류', rep.errors.map(e => ({ file: e.file, reason: `[${e.phase}] ${e.reason}` })), rep.errors.length, 'bad'],
      ['소스 분석 실패 · 부분', ((J.problems || {}).list || []).map(p => ({ file: p.file, line: p.line, reason: (p.partial ? '부분: ' : '실패: ') + p.reason })), (J.problems || {}).total, 'bad'],
      ['리소스 디코딩 실패', ((R.failed || {}).list || []).map(p => ({ file: p.file, reason: p.reason })), (R.failed || {}).total, 'bad'],
      ['참조했는데 없는 파일', ((F.missing || {}).list || []).map(p => ({ file: (p.from || '').split(':')[0], line: +(p.from || '').split(':')[1] || 0, reason: `${p.key} → ${p.path}` })), (F.missing || {}).total, 'bad'],
      ['파일 이름 대소문자 다름', ((F.caseMismatch || {}).list || []).map(p => ({ file: p.actual, reason: `코드: ${p.path} (${p.from}) — 안드로이드 · 리눅스에서는 못 찾음` })), (F.caseMismatch || {}).total, 'warn'],
      ['경고', rep.warnings.map(e => ({ file: e.file, reason: `[${e.phase}] ${e.reason}` })), rep.warnings.length, 'warn'],
      ['미지원 파일 (경로만 보존)', ((R.unsupported || {}).list || []).map(p => ({ file: p.file, reason: p.reason })), (R.unsupported || {}).total, 'info'],
      ['게임이 읽지 않는 파일 (백업 · 이름 규칙 밖)', [...((R.ignored || {}).list || []), ...((M.other || {}).list || [])].map(p => ({ file: p.file, reason: p.reason })), ((R.ignored || {}).total || 0) + ((M.other || {}).total || 0), 'info'],
      ['해석하지 못한 동적 경로', ((F.dynamic || {}).list || []).map(p => ({ file: (p.from || '').split(':')[0], line: +(p.from || '').split(':')[1] || 0, reason: '코드가 이어 붙여 만드는 경로: ' + p.expr })), (F.dynamic || {}).total, 'info'],
      ['추정 미사용 리소스', [...((F.maybeDynamic || {}).list || []), ...((F.unreferenced || {}).list || [])].map(p => ({ file: p.file, reason: p.reason || '소스의 상수 · 문자열 경로에 없음 (추정)' })), ((F.unreferenced || {}).total || 0) + ((F.maybeDynamic || {}).total || 0), ''],
      ['같은 내용의 파일', ((R.duplicates || {}).list || []).map(d => ({ file: d[0], reason: '같은 내용: ' + d.slice(1).join(', ') })), (R.duplicates || {}).total, ''],
      ['훑지 않은 폴더 · 링크', (((rep.walk || {}).skipped || {}).list || []).filter(x => !/빌드 결과/.test(x.reason)).map(p => ({ file: p.rel, reason: p.reason })), null, '']];
    page.append(section('문제 목록 (누르면 파일 경로 · 원인)',
      F.note ? h('p', { class: 'hint' }, F.note) : null,
      ...groups.map(([t, items, total, c]) => h('details', { class: 'ra-grp', open: !!(c === 'bad' && items.length) },
        h('summary', { class: 'pointer' }, h('b', {}, t), ' ', h('span', { class: 'badge ' + (items.length ? c : '') }, String(total != null ? total : items.length))),
        list(rep, items, x => Object.assign({ badge: null }, x), { title: t, total }))) ));

    // ---- 런타임 설치
    const rt = rep.runtime;
    if (rt) page.append(section('게임 런타임 설치 (테스트 플레이)',
      h('div', {}, !rt.ok ? badge('no', '설치 불가') : rt.classCheck && rt.classCheck.missing && rt.classCheck.missing.length ? badge('no', '설치는 되지만 컴파일 안 됨') : badge('ok', '설치 가능'), ' ', h('span', { class: 'hint' }, '설치 가능 여부만 봅니다 — 실제 빌드 · 실행은 테스트 플레이(F5)에서 확인됩니다.')),
      ...(rt.problems || []).map(p => h('div', { class: 'c-bad my-1' }, '✕ ' + p)),
      // 런타임이 이름으로 부르는 게임 클래스 (없으면 설치해도 컴파일되지 않음)
      rt.classCheck && rt.classCheck.checked ? (rt.classCheck.missing.length
        ? h('div', { class: 'my-1' }, h('div', { class: 'c-bad' }, `✕ 런타임이 쓰는 게임 클래스 ${rt.classCheck.missing.length}개가 이 저장소에 없습니다 — 설치하면 컴파일되지 않습니다 (확인한 클래스 ${rt.classCheck.refs}개)`),
          ...rt.classCheck.missing.map(m => h('div', { class: 'ra-note mono my-1' }, `${m.cls}  ←  ${m.uses.join(', ')}`)))
        : h('div', { class: 'ra-note my-1' }, `✓ 런타임이 쓰는 게임 클래스 ${rt.classCheck.refs}개가 모두 있습니다 (클래스 이름만 확인 — 메서드 모양은 빌드에서 확인)`))
        : rt.classCheck && rt.classCheck.reason ? h('div', { class: 'ra-note my-1' }, '런타임 클래스 확인 못 함: ' + rt.classCheck.reason) : null,
      ...(rt.warnings || []).map(p => h('div', { class: 'c-warn my-1' }, '⚠ ' + p)),
      (rt.missing || []).length ? h('details', {}, h('summary', { class: 'pointer' }, `연결 줄을 넣을 곳을 찾지 못한 기능 ${rt.missing.length}개 (그 기능만 동작하지 않음)`), ...rt.missing.map(m => h('div', { class: 'hint mono my-1' }, m))) : null));
    return page;
  }

  PDM.registerEditor({
    id: 'repoanalysis', icon: '⚙', title: () => '게임 저장소 분석',
    match: k => k === 'repoanalysis', needsResource: false, watch: () => false,
    render
  });
  PDM.repoAnalysis = { run, showItem };
})();
