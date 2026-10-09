// ================================================================
//  그림 배율 적용 (맵 그림 › 사용자 테마 타일셋의 "배율 적용"과 같은 기능을 모든 스프라이트에)
//    그림(PNG)을 더 많은 픽셀로 다시 만들어(가장 가까운 픽셀로 키움 — 흐려지지 않음) 세밀하게 덧그릴 수 있게 하고,
//    그 스프라이트의 설정(프레임 크기 · 게임 배율 · 칸 크기 …)을 함께 고쳐 게임 화면에서의 크기는 그대로 둠.
//    PDM.rescaleControl({
//      png()          지금 그림 경로 (game: 이면 ensureOwn 으로 먼저 프로젝트에 복사)
//      cur(img)       지금 배율 (1 = 기본, img = 불러온 그림)
//      ensureOwn()    (선택) game: · 공용 그림이면 프로젝트 사본 경로를 만들어 돌려줌 (null = 취소)
//      apply(f, k, path)   데이터 고치기 — f = 바꾸는 비율(새 배율 ÷ 지금 배율), k = 새 배율, path = 그림 경로
//      what           확인 창에 쓸 이름 · shared(선택) 같은 그림을 쓰는 다른 곳 경고
//    })
//    "<그림>_light.png"(효과 레이어 짝)가 있으면 같이 키움
// ================================================================
(function () {
  const { h, store, toast } = PDM;
  const SCALES = [[0.25, '×0.25'], [0.5, '×0.5'], [1, '×1 (기본)'], [2, '×2'], [3, '×3'], [4, '×4']];

  async function resizeFile(rel, f) {
    const img = await PDM.assets.load(rel).catch(() => null); if (!img) return null;
    const o = h('canvas', { width: Math.max(1, Math.round(img.width * f)), height: Math.max(1, Math.round(img.height * f)) }), g = o.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, o.width, o.height);
    await pdm.writeDataURL(store.abs(rel), o.toDataURL('image/png'));
    PDM.assets.invalidate(rel);
    return [img.width, img.height, o.width, o.height];
  }
  const lightOf = rel => String(rel).replace(/\.png$/i, '') + '_light.png';

  PDM.rescaleControl = function (o) {
    const sel = h('select', {}, SCALES.map(([v, t]) => h('option', { value: v }, t)));
    const info = h('span', { class: 'hint' }, '');
    const path0 = o.png();
    if (path0) PDM.assets.load(path0).then(img => { if (!img) return; const k = +(o.cur(img) || 1); info.textContent = `지금 ×${+k.toFixed(2)} · 그림 ${img.width}×${img.height}px`; sel.value = String(SCALES.some(x => x[0] === k) ? k : 1); }).catch(() => { });
    const run = async () => {
      let rel = o.png();
      if (!rel) { toast('먼저 그림을 정하세요', 'bad'); return; }
      const img0 = await PDM.assets.load(rel).catch(() => null); if (!img0) { toast('그림을 불러오지 못했습니다: ' + rel, 'bad'); return; }
      const cur = +(o.cur(img0) || 1), k = +sel.value, f = k / cur;
      if (Math.abs(f - 1) < 1e-6) { toast('이미 그 배율입니다'); return; }
      if (!(await PDM.ui.confirm(`${o.what || '그림'}을(를) ×${k} 로 다시 만듭니다 (지금 ×${+cur.toFixed(2)} → 그림 ${Math.round(img0.width * f)}×${Math.round(img0.height * f)}px).\n게임 화면에서의 크기는 그대로이고, 그림만 더 세밀하게(또는 거칠게) 보입니다.` +
        (f < 1 ? '\n줄이면 지금의 세밀한 그림은 뭉개집니다 (그림 파일은 되돌릴 수 없음).' : '\n지금 그림을 그대로 키운 뒤, 늘어난 픽셀에 세밀하게 덧그리세요.') + (o.shared ? '\n' + o.shared : '')))) return;
      if (/^(game|builtin):/.test(rel) || o.ensureOwn) { const own = o.ensureOwn ? await o.ensureOwn(rel) : null; if (o.ensureOwn && !own) return; if (own) rel = own; }
      if (/^(game|builtin):/.test(rel)) { toast('게임 그림은 직접 키울 수 없습니다 — 먼저 프로젝트로 복사하세요', 'bad'); return; }
      try {
        const r = await resizeFile(rel, f); if (!r) { toast('그림을 불러오지 못했습니다', 'bad'); return; }
        if (await pdm.exists(store.abs(lightOf(rel))).catch(() => false)) await resizeFile(lightOf(rel), f);   // 효과 레이어 짝
        o.apply(f, k, rel);
        PDM.assets.clear();
        PDM.log && PDM.log(`그림 배율: ${rel} → ×${k} (${r[0]}×${r[1]} → ${r[2]}×${r[3]})`, 'ok');
        toast(`×${k} 로 다시 만들었습니다 — 게임에서의 크기는 그대로`, 'ok');
        PDM.tabs.refresh && PDM.tabs.refresh();
      } catch (err) { toast('배율 적용 실패: ' + (err.message || err), 'bad'); }
    };
    return h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }, title: '한 픽셀을 더 많은 픽셀로 그려 세밀하게 (게임에서도 적용 — 화면에서의 크기는 그대로)' },
      h('span', { class: 'hint' }, '해상도'), sel, h('button', { class: 'btn sm', onclick: run }, '배율 적용'), info);
  };
  /** 캐릭터 · 영웅 스프라이트의 지금 게임 배율 (런타임 MakerSprite · HeroRuntime 과 같은 계산: 0 이면 세로 24px 초과 시 15px 높이에 맞춤) */
  PDM.charSpriteScale = sp => { const fh = +((sp && sp.frame) || [])[1] || 16, s = +(sp && sp.scale) || 0; return s > 0 ? s : (fh > 24 ? 15 / fh : 1); };
})();
