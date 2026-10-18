// ================================================================
//  대사창 편집기 — dialogue.json  (+ 공용 미리보기 PDM.Dialogue: 이벤트 미리보기 · 캐릭터 편집기도 씀)
//   RPG Maker 식: 화면 아래 넓은 대사 상자 · 캐릭터 스탠딩 일러스트 · 이름표 · ▼ · 한 글자씩 · 선택지
//   게임: MakerDialogue (같은 계산 — 단위는 게임 화면 픽셀, 높이 약 270)
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const K = 'dialogue';
  const UI_H = 270;                      // 게임 화면 높이(게임 픽셀). 1080p 에서 4배 확대 기준

  const STYLES = { round: '둥근 상자 (색 지정)', game: '게임 창 (원작 창 테두리)', image: '내 그림 (9조각)' };
  const NAME_POS = { auto: '일러스트 반대편 (자동)', right: '오른쪽 위', left: '왼쪽 위', text: '글 시작 위치' };
  const SIDES = { left: '왼쪽', right: '오른쪽' };
  const LAYERS = { front: '대사 상자 앞 (겹쳐 보임)', back: '대사 상자 뒤' };
  const SMOOTH = { auto: '자동 (큰 그림을 줄이면 부드럽게)', on: '항상 부드럽게', off: '도트 그대로' };
  const CHOICE_POS = { middle: '화면 가운데', center: '가운데 (대사창 바로 위)', right: '오른쪽 (대사창 바로 위)', left: '왼쪽 (대사창 바로 위)' };
  const ALIGNS = { left: '왼쪽 정렬', center: '가운데 정렬' };
  const ANIMS = { bob: '위아래로 통통', blink: '깜빡임', none: '움직이지 않음' };

  const PRESETS = {
    light: ['밝은 둥근 상자 (기본)', () => PDM.defaults.dialogue()],
    dark: ['어두운 반투명', () => { const d = PDM.defaults.dialogue(); Object.assign(d.box, { color: '#15121e', alpha: 0.86, border: '#6a5a8a', textColor: '#f2eefa' }); Object.assign(d.name, { color: '#e6b95c', textColor: '#1a1522' }); d.indicator.color = '#e6b95c'; return d; }],
    game: ['게임 창 느낌', () => { const d = PDM.defaults.dialogue(); Object.assign(d.box, { style: 'game', textColor: '#ffffff', height: 0.25 }); Object.assign(d.name, { color: '#2b2b2b', textColor: '#ffff44' }); d.indicator.color = '#ffff44'; return d; }],
    classic: ['원작 가운데 창 (일러스트 없음)', () => { const d = PDM.defaults.dialogue(); d.mode = 'window'; return d; }]
  };

  // ---------------- 설정 읽기 (없는 값은 기본값) ----------------
  function cfg(over) {
    const d = PDM.defaults.dialogue(), c = over || store.get(K) || {};
    const out = { mode: c.mode || d.mode };
    ['box', 'name', 'illust', 'typing', 'indicator', 'choice', 'sounds', 'text', 'fx', 'layout'].forEach(g => { out[g] = Object.assign({}, d[g], c[g] || {}); });
    return out;
  }

  /** 화자(캐릭터 id · $hero) · 표정 · 직접 고른 그림 → 한 줄 (게임 MakerDialogue.line 과 같음) */
  function line(speaker, face, illust, text, faces) {
    const l = { speaker: speaker || '', name: '', text: text || '', illust: null, side: null, scale: 1, offX: 0, offY: 0, flip: false };
    let ch = null;
    if (speaker === '$hero') {
      const pj = store.get('project') || {};
      const hero = store.get('hero:' + (pj.startHero || '')) || store.all('hero')[0];
      if (hero && hero.character) ch = store.get('char:' + hero.character);
      l.name = (hero && hero.name) || (ch && ch.name) || '주인공';
    } else if (speaker) {
      ch = store.get('char:' + speaker);
      l.name = ch ? ch.name : speaker;
    }
    const p = ch && ch.portrait;
    if (p) {
      const f = face || (faces && faces[ch.id]) || '';
      let img = p.default || '';
      const ex = (Array.isArray(p.expressions) ? p.expressions : Object.entries(p.expressions || {}).map(([key, image]) => ({ key, image }))).find(e => e.key === f);
      if (ex && ex.image) img = ex.image;
      if (img) l.illust = img;
      l.scale = p.scale || 1; l.offX = p.offsetX || 0; l.offY = p.offsetY || 0; l.flip = !!p.flip;
      if (p.side) l.side = p.side;
    }
    if (illust) l.illust = illust;
    return l;
  }

  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex || '#fff'; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  /** 게임 글자처럼 검은 테두리 */
  const outline = k => { const o = Math.max(0.5, k * 0.33).toFixed(2); return `${o}px 0 #000,-${o}px 0 #000,0 ${o}px #000,0 -${o}px #000`; };

  /** 글자 크기 배율 — 런타임 MakerDialogue.textScale 과 같은 계산 (W·H = 게임 화면 단위) */
  function textScale(T, W, H) {
    let k = 1;
    if (T.autoScale !== false) { const land = W >= H, rw = land ? 300 : 150, rh = land ? 190 : 260; k = Math.max(1, Math.min(Math.max(1, +T.scaleMax || 2), Math.min(W / rw, H / rh))); }
    return k * ((+T.scale || 0) > 0 ? +T.scale : 1);
  }
  /** PC 창 크기 → 그 창에서의 배율 (게임은 PC 에서 보통 3배 확대) */
  const scaleAt = (T, w, h) => textScale(T, w / 3, h / 3);
  /** 대사 글 꾸밈 (CSS) — 게임 글꼴의 검은 테두리 + 외곽선 + 그림자 */
  function textDeco(T, k) {
    const o = Math.max(0.5, k * 0.33), sh = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sh.push(`${(dx * o).toFixed(2)}px ${(dy * o).toFixed(2)}px #000`);
    if (T.outline) { const w = o + Math.max(1 / 3, +T.outlineWidth || 0.5) * k; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) sh.push(`${(dx * w).toFixed(2)}px ${(dy * w).toFixed(2)}px ${T.outlineColor || '#000'}`); }
    if (T.shadow) sh.push(`${((+T.shadowX || 0) * k + o).toFixed(2)}px ${((+T.shadowY || 0) * k + o).toFixed(2)}px ${T.shadowColor || '#000'}`);
    return sh.join(',');
  }

  /** 사람이 보는 한 글자 단위 (결합 문자 · 이모지 조합을 쪼개지 않음 — 런타임 BreakIterator.getCharacterInstance 와 같음) */
  const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
  const graphemes = t => SEG ? [...SEG.segment(t)].map(x => x.segment) : Array.from(t);
  /** 한중일 글자 (런타임 TypeText.cjk — 글자마다 줄을 바꿀 수 있음. 그 밖의 글자는 빈칸까지 한 낱말) */
  const CJK = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
  /** 글 → 글자별 span (**강조** · _강조_ 는 강조 색 — 게임과 같음). o: { emFs(강조 글자 크기 px) } → 노드들 (span.dataset.em = 강조) */
  function chars(text, color, hiColor, o = {}) {
    const out = []; let hi = false, word = null;
    const parts = String(text).split(/(\*\*|_)/);
    for (const part of parts) {
      if (part === '_' || part === '**') { hi = !hi; continue; }
      for (const ch of graphemes(part)) {
        if (ch === '\n') { word = null; out.push(h('br')); continue; }
        if (ch === ' ') { word = null; out.push(document.createTextNode(' ')); continue; }
        const sp = h('span', { class: 'dlg-ch', style: { color: hi ? (hiColor || '#ffff44') : color, fontSize: hi && o.emFs ? o.emFs : '' } }, ch);
        if (hi) sp.dataset.em = '1';
        if (CJK.test(ch)) { word = null; out.push(sp); continue; }
        if (!word) { word = h('span', { class: 'dlg-word' }); out.push(word); }   // 영문 · 숫자 낱말은 줄을 바꾸지 않음
        word.append(sp);
      }
    }
    return out;
  }
  /** 런타임 TypeText.fx 와 같은 식 — 글자 하나의 { dx, dy (게임 px), sc, a }. t = 나타난 뒤 지난 초, now = 창 시계(초), k = 글자 번호 */
  function fxAt(effect, t, now, k, dur, strength) {
    const p = Math.max(0, Math.min(1, t / Math.max(0.01, dur))), e = p * p * (3 - 2 * p);
    let dx = 0, dy = 0, sc = 1, a = 1;
    switch (effect) {
      case 'fade': a = e; break;
      case 'rise': dy = 3 * strength * (1 - e); a = e; break;
      case 'drop': dy = -3 * strength * (1 - e); a = e; break;
      case 'pop': sc = 1 + 0.8 * strength * (1 - e); a = Math.min(1, e * 2); break;
      case 'shake': dx = 0.7 * strength * Math.sin(now * 40 + k * 2.3); dy = 0.7 * strength * Math.cos(now * 33 + k * 1.7); break;
      case 'wave': dy = 1.2 * strength * Math.sin(now * 6 + k * 0.6); break;
    }
    return { dx, dy, sc, a };
  }
  /** 대사 스타일 (5차) — 런타임 EventInterpreter.styleLine 과 같은 순서 · 단위: 명령 칸 → 이벤트 "대사 스타일"(textStyle) → (없으면 대사창 설정)
   *  fxDur 0.1초 · fxStrength % · size % · bold on/off */
  const SPEEDS = { instant: 0, slow: 20, normal: 40, fast: 80, veryfast: 160 };
  const textSpeed = v => v === '' ? -1 : v in SPEEDS ? SPEEDS[v] : Number.isFinite(parseFloat(v)) ? Math.max(0, parseFloat(v)) : -1;
  function styleLine(l, c, style) {
    const pick = k => { let v = c && c[k] != null ? String(c[k]) : ''; if (v === '' && style && style[k] != null) v = String(style[k]); return v; };
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
    l.speed = textSpeed(pick('speed'));
    let v;
    if ((v = pick('tracking')) !== '') l.tracking = num(v);
    if ((v = pick('lineGap')) !== '') l.lineGap = num(v);
    if ((v = pick('effect')) !== '') l.effect = v;
    if ((v = pick('fxDur')) !== '') l.fxDur = num(v) / 10;
    if ((v = pick('fxStrength')) !== '') l.fxStrength = num(v) / 100;
    if ((v = pick('fxScope')) !== '') l.fxScope = v;
    if ((v = pick('size')) !== '') l.sizePct = num(v);
    if ((v = pick('padding')) !== '') l.padding = num(v);
    if ((v = pick('align')) !== '') l.align = v;
    if ((v = pick('emColor')) !== '') l.emColor = v;
    if ((v = pick('bold')) !== '') l.bold = v === 'on' || v === 'true';
    return l;
  }
  /** 이 줄에 실제로 쓰일 값 (미리보기 아래 설명 · 테스트) — render 와 같은 규칙 */
  function lineStyle(l, over) {
    const c = cfg(over), B = c.box, T = c.text || {}, F = c.fx || {};
    const fin = (v, d) => Number.isFinite(v) ? v : d, numd = (v, d) => Number.isFinite(+v) && v !== '' && v != null ? +v : d;
    return {
      speed: l.speed >= 0 ? l.speed : (+c.typing.speed || 0),
      sizeK: Number.isFinite(l.sizePct) ? Math.max(0.5, Math.min(3, l.sizePct / 100)) : 1,
      pad: Number.isFinite(l.padding) ? Math.max(0, Math.min(40, l.padding)) : (+B.padding || 0),
      bold: l.bold != null ? !!l.bold : !!T.bold, center: (l.align || B.align) === 'center', hi: /^#[0-9a-f]{6}$/i.test(l.emColor || '') ? l.emColor : B.highlight,
      tracking: fin(l.tracking, +T.tracking || 0), lineGap: fin(l.lineGap, +T.lineSpacing || 0),
      effect: l.effect || F.effect || 'none', dur: fin(l.fxDur, numd(F.dur, 0.25)), strength: fin(l.fxStrength, numd(F.strength, 1)),
      emOnly: (l.fxScope || F.scope) === 'em', emScale: Math.max(0.5, Math.min(2, numd(F.emScale, 1)))
    };
  }
  const EFFECT_NAMES = { none: '연출 없음', fade: '흐리게', rise: '올라옴', drop: '내려옴', pop: '튀어나옴', shake: '떨림', wave: '물결' };
  const describeLine = (l, over) => { const s = lineStyle(l, over); return `글자 ${s.speed > 0 ? s.speed + '자/초' : '바로'} · 크기 ${Math.round(s.sizeK * 100)}% · 자간 ${s.tracking} · 행간 ${s.lineGap} · 여백 ${s.pad}${s.bold ? ' · 굵게' : ''}${s.center ? ' · 가운데' : ''} · ${EFFECT_NAMES[s.effect] || s.effect}${s.effect !== 'none' ? ` ${s.dur}초 ${Math.round(s.strength * 100)}%${s.emOnly ? ' (강조만)' : ''}` : ''}`; };

  /**
   * 대사창 그리기. stage: position:relative 인 상자 (가로·세로 아무 크기 — 높이 기준으로 맞춤)
   * opts: { choices:[..], typing:true, onChoice(i), static:true(글자 바로 다 보이기) }
   * 반환: { el, finish(), typing(), select(i) }
   */
  async function render(stage, l, opts = {}, over) {
    const c = cfg(over);
    const Hp = stage.clientHeight || 360, Wp = stage.clientWidth || 640;
    const k = Hp / UI_H, W = Wp / k, H = UI_H;
    const B = c.box, N = c.name, I = c.illust;
    const el = h('div', { class: 'dlg' });
    stage.append(el);   // 먼저 붙여야 이름표 너비를 잴 수 있음
    const px = v => (v * k) + 'px';
    const hasText = !!(l.text && l.text.length);
    const T = c.text || {}, tk = textScale(T, W, H);   // 화면 크기에 맞춘 글자 배율 (미리보기 = 1080p 화면)
    const S = lineStyle(l, over);   // 이 줄의 스타일 (대사 → 이벤트 스타일 → 대사창 설정)
    const margin = +B.margin || 0, pad = S.pad, fs = Math.max(5, Math.round((+B.fontSize || 8) * S.sizeK * tk));
    let bh = Math.max(fs * 3 + pad * 2, H * (+B.height || 0.27));
    let bx = margin, bw = W - margin * 2, by = H - margin - bh;
    // 직접 그린 레이아웃 (layout.enabled — 좌표는 화면의 비율 0~1)
    const L = c.layout && c.layout.enabled ? c.layout : null;
    const LR = k2 => L && L[k2] && typeof L[k2].x === 'number' ? L[k2] : null;
    if (LR('box')) { const r = LR('box'); bx = r.x * W; by = r.y * H; bw = Math.max(20, r.w * W); bh = Math.max(12, r.h * H); }
    const geo = {};

    // 일러스트
    let ill = null, iw = 0, ix = 0;
    const side = l.side === 'left' || l.side === 'right' ? l.side : I.side;
    if (I.show && l.illust && l.side !== 'none') {
      const img = await PDM.assets.load(l.illust);
      if (img) {
        const Li = LR('illust');
        let th = H * (Li ? Li.h : (+I.height || 0.92)) * (l.scale > 0 ? l.scale : 1);
        if (!Li) th = Math.min(th, W * img.height / img.width);   // 화면보다 넓어지지 않게 (런타임과 같음 — 세로 화면)
        iw = th * img.width / img.height;
        const baseX = Li ? Li.x * W : bx;                 // 왼쪽 기준 (오른쪽에 서면 좌우 대칭)
        ix = side === 'right' ? W - baseX - iw - l.offX * H / 100 : baseX + l.offX * H / 100;
        const itop = (Li ? Li.y * H : H) - th + l.offY * H / 100;
        geo.illust = { x: ix / W, y: itop / H, w: iw / W, h: th / H, side };
        const smooth = I.smooth === 'on' || (I.smooth !== 'off' && img.height > th * 4 * 1.2);
        ill = h('img', { src: img.src, class: 'dlg-ill', style: { left: px(ix), top: px(itop), height: px(th), transform: l.flip ? 'scaleX(-1)' : '', imageRendering: smooth ? 'auto' : 'pixelated' } });
      }
    }
    const front = I.layer !== 'back';
    if (ill && !front) el.append(ill);

    // 상자
    let box = null;
    const boxCss = (x, y, w, hh, fill, alpha, border, rad) => ({ left: px(x), top: px(y), width: px(w), height: px(hh), background: hexA(fill, alpha), border: `${Math.max(1, k)}px solid ${border}`, borderRadius: px(rad) });
    const boxStyle = (x, y, w, hh) => {
      if (B.style === 'game') return { left: px(x), top: px(y), width: px(w), height: px(hh), background: '#3a3a3a', border: `${Math.max(2, k * 2)}px solid #8c7f65`, boxShadow: `inset 0 0 0 ${Math.max(1, k)}px #1c1c1c`, borderRadius: px(2) };
      if (B.style === 'image' && B.image) {
        const s = +B.slice || 6, abs = PDM.assets.resolvePath && PDM.assets.resolvePath(B.image);
        return { left: px(x), top: px(y), width: px(w), height: px(hh), borderStyle: 'solid', borderWidth: px(s), borderImage: `url("${el._imgUrl || ''}") ${s} fill / ${px(s)} stretch`, imageRendering: 'pixelated', _abs: abs };
      }
      return boxCss(x, y, w, hh, B.color, +B.alpha, B.border, +B.radius || 0);
    };
    if (B.style === 'image' && B.image) { const bi = await PDM.assets.load(B.image); el._imgUrl = bi ? bi.src : ''; }
    // 그림(스프라이트) — 이름표 · 선택지 · ▼
    const Ch = c.choice, IN = c.indicator;
    const urlOf = async r => { if (!r) return ''; const im = await PDM.assets.load(r); return im ? im.src : ''; };
    const nameUrl = await urlOf(N.image), chUrl = await urlOf(Ch.image), chOnUrl = (await urlOf(Ch.imageOn)) || chUrl, arrowUrl = await urlOf(IN.image);
    const sliceCss = (url, sl) => ({ background: 'none', border: 'none', borderStyle: 'solid', borderWidth: px(sl), borderImage: `url("${url}") ${sl} fill / ${px(sl)} stretch`, imageRendering: 'pixelated', borderRadius: 0 });
    const mkBox = (x, y, w, hh, cls) => { const st = boxStyle(x, y, w, hh); delete st._abs; return h('div', { class: cls, style: st }); };
    if (hasText) { box = mkBox(bx, by, bw, bh, 'dlg-box'); el.append(box); }
    if (ill && front) el.append(ill);

    // 글 자리 (일러스트를 피해서)
    let tx = bx + pad, tr = bx + bw - pad, ty = by + pad;
    if (ill && I.avoidText) {
      if (side === 'right') tr = Math.min(tr, Math.max(bx + bw * 0.5, ix - pad));
      else tx = Math.max(tx, Math.min(bx + bw * 0.5, ix + iw + pad));
    }
    let spans = [], textEl = null, arrow = null;
    if (hasText) {
      if (LR('text')) { const r = LR('text'); tx = r.x * W; tr = (r.x + r.w) * W; ty = r.y * H; }
      geo.text = { x: tx / W, y: ty / H, w: (tr - tx) / W, h: Math.max(fs + 4, (LR('text') ? LR('text').h * H : by + bh - pad - ty)) / H };
      textEl = h('div', { class: 'dlg-text', style: { left: px(tx), top: px(ty), width: px(tr - tx), fontSize: px(fs), lineHeight: px(fs + 3 + S.lineGap), letterSpacing: S.tracking ? px(S.tracking) : '', textShadow: textDeco(T, k), fontWeight: S.bold ? '700' : '' } },
        chars(l.text, B.textColor, S.hi, { emFs: S.emScale !== 1 ? px(fs * S.emScale) : '' }));
      if (S.center) textEl.style.textAlign = 'center';
      spans = [...textEl.querySelectorAll('.dlg-ch')];
      el.append(textEl);
      if (N.show && l.name) {
        const nfs = Math.max(5, Math.round((+N.fontSize || 7) * tk));
        const plate = h('div', { class: 'dlg-name', style: Object.assign({ fontSize: px(nfs), color: N.textColor, background: N.color, borderRadius: px(Math.max(2, Math.min(4, +B.radius || 0))), padding: `${px(2.5)} ${px(5)}`, textShadow: outline(k) },
          nameUrl ? Object.assign(sliceCss(nameUrl, +N.slice || 4), { padding: `${px(Math.max(0, 2.5 - (+N.slice || 4)))} ${px(Math.max(0, 5 - (+N.slice || 4)))}` }) : {}) }, l.name);
        let np = N.pos || 'auto'; if (np === 'auto') np = ill && side === 'right' ? 'left' : 'right';
        el.append(plate);
        const pw = plate.offsetWidth / k || 40, ph = nfs + 5 + 2;   // 대략
        const pwu = Math.max(20, plate.offsetWidth / k || l.name.length * nfs + 10);
        let plx = np === 'left' ? bx + pad : np === 'text' ? tx : bx + bw - pad - pwu, ply = by - ph + 2;
        if (LR('name')) { plx = LR('name').x * W; ply = LR('name').y * H; }
        plate.style.top = px(ply); plate.style.left = px(plx);
        geo.name = { x: plx / W, y: ply / H, w: pwu / W, h: ph / H };
        void pw;
      }
      if (IN.show) {
        const ax = LR('indicator') ? LR('indicator').x * W : bx + bw / 2 - 3.5, ay = LR('indicator') ? LR('indicator').y * H : by + bh - 7;
        geo.indicator = { x: ax / W, y: ay / H, w: 7 / W, h: 5 / H };
        const anim = IN.anim === 'none' ? 'none' : IN.anim === 'blink' ? 'dlgBlink 1s ease-in-out infinite' : '';
        arrow = arrowUrl
          ? h('img', { src: arrowUrl, class: 'dlg-arrow-img', style: { left: px(ax - 2.5), top: px(ay - 8), height: px(12), animation: anim || 'dlgBob 1s ease-in-out infinite' } })
          : h('div', { class: 'dlg-arrow', style: { left: px(ax), top: px(ay), borderWidth: `${px(4)} ${px(3.5)} 0 ${px(3.5)}`, borderColor: `${IN.color} transparent transparent transparent`, animation: anim || undefined } });
        el.append(arrow);
      }
    }
    // 선택지
    const choiceEls = [];
    let sel = 0;
    const select = i => {
      if (!choiceEls.length) return; sel = (i + choiceEls.length) % choiceEls.length;
      choiceEls.forEach((e, j) => { e.classList.toggle('on', j === sel); if (e.dataset.imgOn) e.style.borderImageSource = `url("${j === sel ? e.dataset.imgOn : e.dataset.img}")`; });
    };
    if (opts.choices && opts.choices.length) {
      const cfs = +Ch.fontSize > 0 ? Math.max(5, Math.round(+Ch.fontSize * tk)) : fs;
      const ch = cfs + 8, gap = 2;
      const total = opts.choices.length * ch + (opts.choices.length - 1) * gap;
      const bottom = hasText ? by - (N.show && l.name ? 14 : 4) : H - margin;
      const contentW = opts.choices.reduce((m, s) => Math.max(m, String(s).length * cfs * 0.95), 0) + pad * 2 + 6;
      let cw = Math.min(W - margin * 2, Math.max(contentW, W * (+Ch.width > 0 ? +Ch.width : 0.22)));
      const rightEdge = ill && side === 'right' ? Math.max(bx + cw, ix - 4) : bx + bw;   // 오른쪽 일러스트를 가리지 않게
      const pos = Ch.pos || 'middle', centered = pos === 'center' || pos === 'middle';
      let cx = pos === 'left' ? bx : centered ? (W - cw) / 2 : rightEdge - cw;
      let cy0 = pos === 'middle' ? Math.max(margin, Math.min(bottom - total, (bottom - total) / 2)) : bottom - total;
      if (LR('choices')) { const r = LR('choices'); cx = r.x * W; cy0 = r.y * H; cw = Math.min(W - cx, Math.max(contentW, r.w * W)); }
      geo.choices = { x: cx / W, y: cy0 / H, w: cw / W, h: total / H };
      const fg = Ch.textColor || B.textColor, fgOn = Ch.textOnColor || N.textColor;
      opts.choices.forEach((s, i) => {
        const e = mkBox(cx, cy0 + i * (ch + gap), cw, ch, 'dlg-choice');
        if (chUrl) Object.assign(e.style, sliceCss(chUrl, +Ch.slice || 4));
        e.style.setProperty('--on-bg', chOnUrl ? 'none' : N.color); e.style.setProperty('--on-fg', fgOn); e.style.setProperty('--on-line', IN.color);
        if (chOnUrl) { e.dataset.img = chUrl; e.dataset.imgOn = chOnUrl; e.dataset.sl = +Ch.slice || 4; }
        if (centered) e.style.justifyContent = 'center';
        e.append(h('span', { style: { paddingLeft: centered ? 0 : px(pad), fontSize: px(cfs), color: fg, textShadow: outline(k) } }, s));
        e.onmouseenter = () => select(i);
        e.onclick = ev => { ev.stopPropagation(); if (opts.onChoice) opts.onChoice(i); };
        e.hidden = hasText;
        choiceEls.push(e); el.append(e);
      });
      if (!hasText) select(0);
    }

    // 한 글자씩 · 글자 연출 — 시계 하나(requestAnimationFrame): 글자마다 나타난 때(t0)부터 런타임 TypeText.fx 와 같은 식. 미리보기가 화면에서 빠지면 스스로 멈춤
    let raf = 0, n = 0, isTyping = false, stopped = false;
    const t0 = new Array(spans.length).fill(Infinity), start = performance.now(), sec = () => (performance.now() - start) / 1000;
    const reveal = upto => { const now = sec(); while (n < upto && n < spans.length) { spans[n].style.visibility = ''; t0[n] = now; n++; } };
    const showChoices = () => { if (!choiceEls.length) return; choiceEls.forEach(e => { e.hidden = false; }); select(0); if (arrow) arrow.hidden = true; };
    const finish = () => { isTyping = false; reveal(spans.length); if (arrow) arrow.hidden = !!choiceEls.length; showChoices(); };
    const speed = S.speed;   // 이 줄만 글자 속도 (런타임 Line.speed 와 같음)
    const fxOn = S.effect !== 'none';
    const loop = () => {
      raf = 0;
      if (stopped || !el.isConnected) return;
      const now = sec();
      if (isTyping) { reveal(Math.floor(now * speed)); if (n >= spans.length) finish(); }
      if (fxOn) spans.forEach((sp, i) => {
        if (i >= n || (S.emOnly && !sp.dataset.em)) return;
        const f = fxAt(S.effect, now - t0[i], now, i, S.dur, S.strength);
        sp.style.transform = f.dx || f.dy || f.sc !== 1 ? `translate(${(f.dx * k).toFixed(2)}px, ${(f.dy * k).toFixed(2)}px) scale(${f.sc.toFixed(3)})` : '';
        sp.style.opacity = f.a < 1 ? f.a.toFixed(3) : '';
      });
      const busy = isTyping || (fxOn && (S.effect === 'shake' || S.effect === 'wave' || t0.some(t => now - t < S.dur)));
      if (busy) raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && !stopped) raf = requestAnimationFrame(loop); };
    if (hasText && speed > 0 && !opts.static) {
      isTyping = true; spans.forEach(s => { s.style.visibility = 'hidden'; }); if (arrow) arrow.hidden = true;
    } else if (hasText) finish();
    kick();
    const finishAndKick = () => { finish(); kick(); };
    geo.box = { x: bx / W, y: by / H, w: bw / W, h: bh / H };
    return { el, geo, finish: finishAndKick, typing: () => isTyping, select, get sel() { return sel; }, hasChoices: choiceEls.length > 0, stop: () => { stopped = true; if (raf) cancelAnimationFrame(raf); raf = 0; }, debug: () => ({ shown: n, total: spans.length, style: S }) };
  }

  /** 클릭해서 넘기며 재생: 글자가 나오는 중이면 다 보이기 → (선택지면 고름) → 닫기. 결과: 고른 번호 또는 undefined */
  function play(stage, l, choices, over) {
    return new Promise(async resolve => {
      let r = null, autoT = null, ended = false;
      const done = v => { if (ended) return; ended = true; clearInterval(autoT); stage.removeEventListener('click', onClick); if (r) { r.stop(); r.el.remove(); } resolve(v); };
      r = await render(stage, l, { choices, onChoice: i => done(i) }, over);
      // 저절로 넘기기 (런타임 Wnd.update 와 같음: 글자가 다 나온 뒤 l.auto 초, 선택지가 있으면 쓰지 않음)
      if (l.auto > 0 && !choices) { let since = null; autoT = setInterval(() => { if (r.typing()) return; since = since || performance.now(); if (performance.now() - since >= l.auto * 1000) done(undefined); }, 30); }
      function onClick() {
        if (r.typing()) { r.finish(); return; }
        if (r.hasChoices) return;
        done(undefined);
      }
      stage.addEventListener('click', onClick);
    });
  }

  /** 이벤트 일러스트 자리 — 런타임 MakerStage.show/place 와 같은 계산 (게임 화면 단위 W×H, 그림 원래 크기 iw×ih).
   *  pos: left · center · right · full / o: { scale(1 = 100%), ox, oy, flip } → { x, y, w, h, flip } (보이는 사각형 — 왼쪽 위 · 크기) */
  function stageLayout(pos, W, H, iw, ih, o = {}) {
    const full = pos === 'full', th = full ? H : Math.min(H * 0.9, W * ih / iw);   // 화면보다 넓어지지 않게 (세로 화면 · 가로로 긴 그림)
    let baseSc, baseX, baseY;
    if (full) { baseSc = Math.max(W / iw, H / ih); baseX = (W - iw * baseSc) / 2; baseY = (H - ih * baseSc) / 2; }
    else { baseSc = th / ih; const w0 = iw * baseSc; baseX = pos === 'left' ? W * 0.04 : pos === 'right' ? W * 0.96 - w0 : (W - w0) / 2; baseY = th < H * 0.9 - 0.5 ? (H - th) / 2 : H - th; }   // 폭 때문에 줄면 세로 가운데 (런타임과 같음)
    const scale = o.scale > 0 ? o.scale : 1, sc = baseSc * scale, w0 = iw * baseSc, h0 = ih * baseSc, w = iw * sc, h = ih * sc;
    return { x: baseX + (+o.ox || 0) + (w0 - w) / 2, y: baseY + (+o.oy || 0) + (h0 - h), w, h, flip: !!o.flip, baseX, baseSc };
  }
  /** 런타임 MakerStage.ease 와 같은 곡선 (움직이기) */
  const ease = k => k * k * (3 - 2 * k);
  PDM.Dialogue = { cfg, line, render, play, stageLayout, ease, UI_H, styleLine, lineStyle, describeLine, fxAt, graphemes, textSpeed, SPEEDS, classic: () => cfg().mode === 'window' };

  // ---------------- 편집기 ----------------
  function previewBox(ctx, st) {
    const stage = h('div', { class: 'scene-prev dlg-stage' });
    const tools = h('div', {});
    let lay = null;
    const REG = [
      ['box', '대사 상자', '#4fa3ff', 'both'], ['text', '글 영역', '#46d38a', 'both'], ['name', '이름표', '#ff9f43', 'none'],
      ['illust', '일러스트', '#c77dff', 'both'], ['choices', '선택지', '#ffd23f', 'w'], ['indicator', '▼', '#ff5d8f', 'none']];
    /** 미리보기 영역(비율) → dialogue.json layout 값 */
    function toLayout(id, rect, geo, l) {
      if (id === 'box' || id === 'text') return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      if (id === 'name' || id === 'indicator') return { x: rect.x, y: rect.y };
      if (id === 'choices') return { x: rect.x, y: rect.y, w: rect.w };
      if (id === 'illust') {
        const right = geo.illust && geo.illust.side === 'right', sc = l.scale > 0 ? l.scale : 1;
        return { x: right ? 1 - rect.x - rect.w : rect.x, y: rect.y + rect.h, h: rect.h / sc };
      }
      return rect;
    }
    const draw = async (animate) => {
      if (lay) { lay.destroy(); lay = null; }
      stage.replaceChildren();
      const l = line(st.speaker || '', st.face || '', '', st.text || '');
      const choices = st.choices || st.layoutEdit ? ['같이 가자', '혼자 갈래'] : null;
      const r = await render(stage, l, { choices, static: !animate || st.layoutEdit, onChoice: () => {} });
      stage.onclick = () => { if (r.typing()) r.finish(); };
      tools.replaceChildren();
      if (!st.layoutEdit) return;
      const geo = r.geo;
      const save = (id, rect) => store.edit(K, '대사창 레이아웃: ' + (REG.find(x => x[0] === id) || [id, id])[1], o => {
        o.layout = o.layout || {};
        if (!o.layout.enabled) {           // 처음 켤 때: 지금 자동 배치를 그대로 옮겨 적음
          REG.forEach(([k2]) => { if (geo[k2]) o.layout[k2] = toLayout(k2, geo[k2], geo, l); });
          o.layout.enabled = true;
        }
        o.layout[id] = toLayout(id, rect, geo, l);
      });
      lay = PDM.layoutEditor({ stage,
        regions: REG.filter(([k2]) => geo[k2]).map(([id, label, color, resize]) => ({ id, label, color, resize, rect: geo[id] })),
        tools: REG.filter(([id]) => id !== 'indicator').map(([id, label]) => ({ id, label })),
        onChange: save });
      tools.append(lay.el);
    };
    requestAnimationFrame(() => draw(false));
    return { el: stage, draw, tools };
  }

  PDM.registerEditor({
    id: 'dialogue', icon: () => '💬', title: () => '대사창',
    match: k => k === K,
    watch: ck => ck === K || ck.startsWith('char:') || ck.startsWith('hero:'),
    tree() {
      if (!store.isOpen) return [];
      return [{ id: 'dialogue', label: '대사창', icon: '💬', order: 4, open: K }];
    },
    render(key, ctx) {
      const { F, section, row } = PDM.ui;
      const c = cfg();
      const st = ctx.state = ctx.state || { speaker: '', face: '', text: '안녕? 대사창은 이렇게 보여요. 글자는 한 글자씩 나오고, 다 나오면 ▼ 가 깜빡여요. _강조_ 도 됩니다.', choices: false };
      if (!st.speaker) { const withP = store.all('char').find(ch => ch.portrait && ch.portrait.default); st.speaker = withP ? withP.id : '$hero'; }
      const pv = previewBox(ctx, st);
      const chars = [['$hero', '주인공 (영웅과 연결된 캐릭터)'], ...store.all('char').map(ch => [ch.id, `${ch.name} (${ch.id})${ch.portrait && ch.portrait.default ? '' : ' — 일러스트 없음'}`]), ['', '(화자 없음 — 설명문)']];
      const spSel = h('select', { onchange: () => { st.speaker = spSel.value; st.face = ''; ctx.refresh(); } }, chars.map(([v, t]) => h('option', { value: v, selected: v === st.speaker }, t)));
      const cur = st.speaker && st.speaker !== '$hero' ? store.get('char:' + st.speaker) : null;
      const faces = cur && cur.portrait ? (cur.portrait.expressions || []).map(e => e.key) : [];
      const faceSel = h('select', { onchange: () => { st.face = faceSel.value; pv.draw(false); } }, h('option', { value: '' }, '기본 표정'), faces.map(f => h('option', { value: f, selected: f === st.face }, f)));
      const txt = h('textarea', { rows: 2, oninput: () => { st.text = txt.value; pv.draw(false); } }); txt.value = st.text;
      const chk = h('input', { type: 'checkbox', checked: st.choices, onchange: () => { st.choices = chk.checked; pv.draw(false); } });
      const preset = (id) => h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const [label, make] = PRESETS[id]; if (await PDM.ui.confirm(`대사창을 "${label}" 모양으로 바꿀까요? (되돌리기로 복구할 수 있습니다)`)) store.edit(K, '대사창 모양: ' + label, o => { const p = make(); Object.keys(o).forEach(k2 => delete o[k2]); Object.assign(o, p); }); } }, PRESETS[id][0]);
      const classic = c.mode === 'window';
      const col = (g, k2, label) => F.color(K, [g, k2], { label, rerender: true, def: (c[g] || {})[k2] });
      return h('div', { class: 'page' },
        h('h1', {}, '💬 대사창'),
        h('p', { class: 'lead' }, '이벤트의 "대사 표시"·선택지가 게임에서 어떻게 보일지 정합니다. 화면 아래에 넓은 대사 상자가 뜨고, 말하는 캐릭터의 일러스트(캐릭터 편집기 → 초상화/일러스트)가 옆에 섭니다. 주인공이 말할 때는 영웅과 연결된 캐릭터의 일러스트를 씁니다.'),
        row(F.select(K, ['mode'], { box: '아래 대사창 + 일러스트 (RPG Maker 식)', window: '원작 가운데 창 (작은 그림 + 이름)' }, { label: '방식', rerender: true }),
          h('div', { class: 'hstack wrap' }, h('span', { class: 'hint' }, '빠른 시작:'), ...Object.keys(PRESETS).map(preset))),
        classic ? h('p', { class: 'hint' }, '원작 가운데 창은 캐릭터의 스프라이트를 작은 그림으로 보여 줍니다. 아래 설정은 쓰이지 않습니다.') : h('div', {},
          h('div', { class: 'dlg-prev-wrap' }, pv.el,
            h('div', { class: 'dlg-prev-ctl' },
              PDM.ui.field('화자', spSel), PDM.ui.field('표정', faceSel), PDM.ui.field('미리보기 대사', txt),
              h('label', { class: 'check' }, chk, h('span', {}, '선택지도 보기')),
              h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); pv.draw(true); } }, '▶ 글자 나오기 보기'),
              h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.layoutEdit, onchange: e => { st.layoutEdit = e.target.checked; pv.draw(false); } }), h('span', {}, '레이아웃 직접 편집 (영역을 끌고 · 모서리로 크기 · 그리기)')),
              pv.tools,
              (c.layout || {}).enabled ? h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); store.edit(K, '대사창 레이아웃: 자동 배치', o => { o.layout = { enabled: false }; }); } }, '↺ 자동 배치로 되돌리기') : null,
              (c.layout || {}).enabled ? h('p', { class: 'hint' }, '직접 그린 레이아웃을 씁니다. 일러스트는 왼쪽에 선 캐릭터 기준이고, 오른쪽에 서면 좌우 대칭으로 놓입니다. 글 영역을 직접 정하면 일러스트를 피하지 않습니다.') : null,
              h('p', { class: 'hint' }, '게임 화면(가로 16:9)을 줄여 보여 줍니다. 실제 크기는 창 크기·확대 설정에 따라 조금 다를 수 있어요.'))),
          section('대사 상자',
            row(F.select(K, ['box', 'style'], STYLES, { label: '모양', rerender: true }),
              F.num(K, ['box', 'height'], { label: '높이 (화면의 비율)', step: 0.01, min: 0.12, max: 0.6, def: 0.27, rerender: true }),
              F.num(K, ['box', 'margin'], { label: '화면 가장자리와 간격', step: 1, min: 0, def: 4, rerender: true }),
              F.num(K, ['box', 'padding'], { label: '안쪽 여백', step: 1, min: 0, def: 8, rerender: true })),
            c.box.style === 'round' ? row(col('box', 'color', '배경색'), F.num(K, ['box', 'alpha'], { label: '불투명도', step: 0.02, min: 0, max: 1, def: 0.94, rerender: true }),
              col('box', 'border', '테두리색'), F.num(K, ['box', 'radius'], { label: '모서리 둥글기', int: true, min: 0, max: 12, def: 5, rerender: true })) : null,
            c.box.style === 'image' ? row(F.image(K, ['box', 'image'], { label: '상자 그림 (9조각으로 늘림)', sub: 'ui', rerender: true }), F.num(K, ['box', 'slice'], { label: '가장자리 두께 (px)', int: true, min: 0, def: 6, rerender: true })) : null,
            F.bool(K, ['box', 'hideHud'], { label: '대사창·선택지가 떠 있는 동안 다른 UI 숨기기 (상태창·도구 막대·기록·버튼)', def: true, hint: '대화가 끝나면 다시 보입니다. 일러스트와 대사창만 남습니다.' })),
          section('글자 모양',
            row(col('box', 'textColor', '글자색'), F.num(K, ['box', 'fontSize'], { label: '글자 크기', int: true, min: 5, max: 16, def: 8, rerender: true }),
              col('box', 'highlight', '_강조_ 글자색'), F.select(K, ['box', 'align'], ALIGNS, { label: '정렬', rerender: true })),
            h('p', { class: 'hint' }, '대사에서 _이렇게_ 밑줄로 감싼 부분은 강조색으로 나옵니다. 게임 글꼴은 글자마다 검은 테두리가 있어서, 밝은 상자에는 진한 글자색이 잘 보입니다.')),
          section('글자 크기 · 스타일',
            row(F.bool(K, ['text', 'autoScale'], { label: '화면 크기에 맞춰 글자 키우기', def: true, rerender: true, hint: '큰 창 · 고해상도 화면일수록 글자가 커집니다 (작은 화면 · 휴대폰 세로는 그대로)' }),
              c.text.autoScale !== false ? F.num(K, ['text', 'scaleMax'], { label: '최대 배율', step: 0.1, min: 1, max: 4, def: 2, rerender: true }) : null,
              F.num(K, ['text', 'scale'], { label: '글자 크기 배율 (전체)', step: 0.05, min: 0.5, max: 3, def: 1, rerender: true, hint: '대사 · 이름표 · 선택지 글자에 모두 곱함' })),
            h('p', { class: 'hint' }, `지금 설정의 배율 — PC 창 1280×720: ×${scaleAt(c.text, 1280, 720).toFixed(2)} · 1920×1080: ×${scaleAt(c.text, 1920, 1080).toFixed(2)} · 2560×1440: ×${scaleAt(c.text, 2560, 1440).toFixed(2)} (대사 글자 ${Math.round((+c.box.fontSize || 8) * scaleAt(c.text, 1920, 1080))} — 1080p). 미리보기는 1080p 화면 비율.`),
            row(F.num(K, ['text', 'lineSpacing'], { label: '줄 간격 더하기 (px)', step: 0.5, min: -2, max: 12, def: 0, rerender: true }), F.num(K, ['text', 'tracking'], { label: '글자 간격 더하기 (px)', step: 0.5, min: -1, max: 6, def: 0, rerender: true }), F.bool(K, ['text', 'bold'], { label: '굵게', rerender: true })),
            row(F.bool(K, ['text', 'outline'], { label: '외곽선', rerender: true }),
              c.text.outline ? col('text', 'outlineColor', '외곽선 색') : null,
              c.text.outline ? F.num(K, ['text', 'outlineWidth'], { label: '외곽선 두께 (px)', step: 0.25, min: 0.25, max: 3, def: 0.5, rerender: true }) : null),
            row(F.bool(K, ['text', 'shadow'], { label: '그림자', rerender: true }),
              c.text.shadow ? col('text', 'shadowColor', '그림자 색') : null,
              c.text.shadow ? F.num(K, ['text', 'shadowX'], { label: '그림자 가로 (px)', step: 0.25, min: -4, max: 4, def: 0.5, rerender: true }) : null,
              c.text.shadow ? F.num(K, ['text', 'shadowY'], { label: '그림자 세로 (px)', step: 0.25, min: -4, max: 4, def: 0.5, rerender: true }) : null),
            h('p', { class: 'hint' }, '외곽선 · 그림자는 게임 글꼴의 검은 테두리 바깥에 그려집니다. px 는 게임 화면 픽셀(PC 에서 실제 화면 약 3픽셀).')),
          section('이름표',
            row(F.bool(K, ['name', 'show'], { label: '이름 보이기', def: true, rerender: true }),
              F.select(K, ['name', 'pos'], NAME_POS, { label: '위치', rerender: true }),
              col('name', 'color', '배경색'), col('name', 'textColor', '글자색'),
              F.num(K, ['name', 'fontSize'], { label: '글자 크기', int: true, min: 5, max: 16, def: 7, rerender: true })),
            row(F.image(K, ['name', 'image'], { label: '이름표 그림 (비우면 배경색 상자, 9조각)', sub: 'ui', rerender: true }),
              F.num(K, ['name', 'slice'], { label: '가장자리 두께 (px)', int: true, min: 0, def: 4, rerender: true }))),
          section('일러스트',
            h('p', { class: 'hint' }, '캐릭터마다 크기·위치·방향은 캐릭터 편집기의 "초상화 / 일러스트"에서 따로 고칠 수 있습니다. 대사 명령에서 "일러스트(선택)"를 고르면 그 대사만 다른 그림을 씁니다.'),
            row(F.bool(K, ['illust', 'show'], { label: '일러스트 보이기', def: true, rerender: true }),
              F.select(K, ['illust', 'side'], SIDES, { label: '기본 위치', rerender: true }),
              F.num(K, ['illust', 'height'], { label: '높이 (화면의 비율)', step: 0.02, min: 0.2, max: 1.5, def: 0.92, rerender: true }),
              F.select(K, ['illust', 'layer'], LAYERS, { label: '겹치는 순서', rerender: true })),
            row(F.bool(K, ['illust', 'avoidText'], { label: '글이 일러스트를 피해서 시작', def: true, rerender: true }),
              F.select(K, ['illust', 'smooth'], SMOOTH, { label: '줄일 때', rerender: true }))),
          section('선택지',
            row(F.select(K, ['choice', 'pos'], CHOICE_POS, { label: '위치', rerender: true }),
              F.num(K, ['choice', 'width'], { label: '최소 너비 (화면의 비율)', step: 0.02, min: 0.1, max: 1, def: 0.42, rerender: true }),
              F.num(K, ['choice', 'fontSize'], { label: '글자 크기 (0 = 대사와 같음)', int: true, min: 0, max: 16, def: 0, rerender: true })),
            row(col('choice', 'textColor', '글자색 (비우면 대사 글자색)'), col('choice', 'textOnColor', '고른 것 글자색 (비우면 이름표 글자색)')),
            row(F.image(K, ['choice', 'image'], { label: '선택지 그림 (비우면 대사 상자 모양)', sub: 'ui', rerender: true }),
              F.image(K, ['choice', 'imageOn'], { label: '고른 선택지 그림 (비우면 이름표 색)', sub: 'ui', rerender: true }),
              F.num(K, ['choice', 'slice'], { label: '가장자리 두께 (px)', int: true, min: 0, def: 4, rerender: true })),
            h('p', { class: 'hint' }, '대사 바로 뒤에 "선택지" 명령이 있으면 대사창을 띄운 채로 선택지가 나옵니다. 캐릭터에게 말을 걸 때 나오는 메뉴(대화·부탁·마음 보기)도 이 선택지로 나옵니다. 게임에서: 누르기·Enter·Space 로 넘김, ↑↓ 와 숫자 키로 고르기.')),
          section('글자 연출 (5차)',
            row(F.select(K, ['fx', 'effect'], { none: '없음', fade: '흐리게 → 또렷이', rise: '아래에서 올라옴', drop: '위에서 내려옴', pop: '크게 → 제자리', shake: '떨림 (계속)', wave: '물결 (계속)' }, { label: '글자가 나타날 때', rerender: true }),
              F.num(K, ['fx', 'dur'], { label: '시간 (초)', step: 0.05, min: 0.05, max: 3, def: 0.25, rerender: true }),
              F.num(K, ['fx', 'strength'], { label: '세기 (1 = 보통)', step: 0.1, min: 0.1, max: 3, def: 1, rerender: true })),
            row(F.select(K, ['fx', 'scope'], { all: '모든 글자', em: '강조(**…**) 글자만' }, { label: '연출할 글자', rerender: true }),
              F.num(K, ['fx', 'emScale'], { label: '강조 글자 크기 배율', step: 0.1, min: 0.5, max: 2, def: 1, rerender: true })),
            h('p', { class: 'hint' }, '프로젝트 전체의 기본값입니다. 이벤트에서 "대사 스타일" 명령 · 대사 명령의 글꼴 · 출력 · 연출 탭으로 바꿀 수 있습니다 (우선순위: 대사 > 대사 스타일 > 여기 > 기본값). 시간은 게임 배속(테스트 플레이 2 · 4 · 16배)을 따릅니다.')),
          section('글자 나오기 · ▼ · 소리',
            row(F.num(K, ['typing', 'speed'], { label: '글자 속도 (글자/초, 0 = 한 번에)', int: true, min: 0, max: 400, def: 40, rerender: true }),
              F.sound(K, ['typing', 'sound'], { kind: 'se', label: '글자 소리 (예전 칸 — 아래 "글자 나올 때"와 같음)' })),
            row(F.bool(K, ['indicator', 'show'], { label: '다 나오면 ▼ 표시', def: true, rerender: true }), col('indicator', 'color', '▼ · 고른 선택지 테두리 색'),
              F.select(K, ['indicator', 'anim'], ANIMS, { label: '▼ 움직임', rerender: true }),
              F.image(K, ['indicator', 'image'], { label: '▼ 대신 쓸 그림', sub: 'ui', rerender: true })),
            h('div', { class: 'fl m-0 mt-4 mb-1' }, '대사창 소리 (비우면 기본 소리 · 🎚 로 편집 · 캐릭터마다 목소리는 캐릭터 편집기에서)'),
            row(F.sysSound(K, ['sounds', 'open'], 'dialogue.open', { label: '열 때' }), F.sysSound(K, ['sounds', 'type'], 'dialogue.type', { label: '글자 나올 때 (세 글자마다)' }),
              F.sysSound(K, ['sounds', 'next'], 'dialogue.next', { label: '넘길 때' })),
            row(F.sysSound(K, ['sounds', 'move'], 'choice.move', { label: '선택지 옮길 때' }), F.sysSound(K, ['sounds', 'select'], 'choice.select', { label: '선택지 고를 때' })))));
    }
  });
})();
