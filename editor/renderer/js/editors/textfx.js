// ================================================================
//  글자 연출 (APNG) — CSS 로 움직이는 글자 그림을 만들어 APNG 로 저장 · 게임에서 표시
//    데이터: textfx.json { list: [ { id, name, text, sub, … css, fps, loop, sheet } ] }  (칸 목록은 아래 DEF)
//    구조: .stage › .bg(배경) · .anchor(배치) › .fit(넘치면 축소) › .page(쪽) › .wrap(표시 중 효과) › .block(장식 틀) › [.sub] .text › .glowbox(그림자·광채) › .line › .ch › .chi
//    만들기: 화면 밖에서 실제 CSS 애니메이션을 시간별로 멈춰 놓고(Web Animations) → SVG foreignObject 로 캔버스에 찍음
//      → assets/fx/<파일 이름>.png (APNG) · _sheet.png (게임용 프레임 격자 — 런타임 MakerTextFx · 이벤트 명령 "글자 연출 표시")
//      → PNG 정지 이미지 · 연번 PNG(ZIP)
// ================================================================
(function () {
  const { h, store } = PDM;
  const K = 'textfx';
  const FONTS = [['sans-serif', '고딕 (기본)'], ['serif', '명조'], ['monospace', '고정폭'], ["'Malgun Gothic'", '맑은 고딕'], ["'Batang'", '바탕'], ["'Gungsuh'", '궁서'], ["'Gulim'", '굴림'], ["'Dotum'", '돋움'],
    ["'Yu Gothic'", 'Yu Gothic'], ["'Yu Mincho'", 'Yu Mincho'], ["'Meiryo'", 'Meiryo'], ["Impact, sans-serif", 'Impact'], ["Georgia, serif", 'Georgia'], ["'Times New Roman', serif", 'Times New Roman'], ["'Arial Black', sans-serif", 'Arial Black'],
    ["'Courier New', monospace", 'Courier New'], ["'Comic Sans MS', cursive", 'Comic Sans'], ['game', '게임 픽셀 글꼴 (영문·숫자)'], ['file', '등록한 글꼴 파일 (TTF · OTF · WOFF)']];
  const FLOW = { char: '한 글자씩', line: '한 줄씩', all: '전체를 동시에', scroll: '스크롤 (아래에서 위로)' };
  const IN = { none: '없음', fade: '페이드', rise: '떠오르기', drop: '내려오기', split: '위아래에서 합류', slide: '슬라이드', track: '자간이 좁혀짐', expand: '중앙에서 좌우로 펼쳐짐', blur: '흐림 해제', pop: '팝',
    shrink: '크게 시작해 축소', rotate: '회전', flip: '넘겨지기', bounce: '낙하 바운드', gather: '집합', type: '타자기', flicker: '명멸',
    slam: '내리치기 (전체)', approach: '다가오기 (전체)', depth: '안쪽에서 나타나기 (전체)', wipe: '와이프 (전체)', unfold: '펼치기 (전체)', glitch: '글리치 (전체)', flash: '섬광 (전체)' };
  const OUT = { none: '없음', fade: '페이드', up: '위로 사라짐', down: '아래로 가라앉음', split: '위아래로 갈라짐', slide: '슬라이드', track: '자간이 넓어짐', blur: '흐려짐', swell: '부풀며 사라짐', shrink: '줄어들며 사라짐',
    scatter: '흩어짐', erase: '한 글자씩 지우기', flicker: '명멸', approach: '다가오며 사라짐 (전체)', recede: '멀어짐 (전체)', wipe: '와이프 (전체)', close: '닫기 (전체)', glitch: '글리치 (전체)' };
  const WHOLE_IN = new Set(['slam', 'approach', 'depth', 'wipe', 'unfold', 'glitch', 'flash']), WHOLE_OUT = new Set(['approach', 'recede', 'wipe', 'close', 'glitch']);
  const LOOP = { none: '없음', float: '둥실둥실', wave: '물결', pulse: '고동', shake: '떨림', glow: '발광 명멸', flicker: '깜박거림', blink: '점멸', noise: '가끔 노이즈', hue: '색 돌기' };
  const ORDER = { first: '처음부터', last: '끝에서부터', center: '중앙에서부터', edges: '양 끝에서부터', random: '랜덤' };
  const EASE = { auto: '자동', decel: '감속', strong: '강한 감속', smooth: '부드럽게', back: '지나쳤다 돌아옴', spring: '스프링', bounce: '바운드', linear: '일정', accel: '가속' };
  const EASE_CSS = { decel: 'ease-out', strong: 'cubic-bezier(.05,.9,.1,1)', smooth: 'ease-in-out', back: 'cubic-bezier(.34,1.56,.64,1)', spring: 'cubic-bezier(.3,2.1,.5,.75)', bounce: 'cubic-bezier(.3,1.7,.6,1)', linear: 'linear', accel: 'ease-in' };
  const DIRS = { left: '왼쪽에서 / 왼쪽으로', right: '오른쪽에서 / 오른쪽으로', up: '위에서 / 위로', down: '아래에서 / 아래로' };
  const SUBIN = { same: '메인과 같이 (페이드)', fade: '페이드', rise: '떠오르기', blur: '흐림 해제', track: '자간이 좁혀짐', type: '타자기', slide: '슬라이드' };
  const DECO = { none: '없음', band: '띠', tape: '경고 테이프', box: '박스', title: '타이틀 틀', lines: '위아래 라인', underline: '밑줄', sides: '사이드 라인', accent: '악센트 바', corner: '코너 틀' };
  const BGM = { none: '없음 (투명)', solid: '단색', vignette: '비네트', bottom: '아래에서 그라데이션', top: '위에서 그라데이션' };
  const SIZES = [[1920, 1080, '16:9 FHD'], [1280, 720, '16:9 HD'], [960, 540, '16:9 경량'], [1280, 360, '가로로 긴 띠'], [1024, 256, '자막 띠'], [640, 180, '작은 띠 (게임용 추천)'], [480, 270, '작은 화면 (게임용)'], [1080, 1080, '정사각형'], [720, 1280, '세로 9:16']];
  const DEF = { name: '새 글자 연출', text: '전투 개시', sub: '', subPos: 'below', vertical: false, align: 'center', wrap: 0, shrink: true, pages: true,
    font: 'sans-serif', fontFile: '', weight: 700, italic: false, size: 72, spacing: 4, lineH: 1.2,
    subFont: '', subWeight: 400, subItalic: false, subColorOn: false, subColor: '#ffffff', subSize: 0.3, subSpacing: 6, subGap: 0.25,
    flow: 'all', inFx: 'shrink', inDir: 'left', inDur: 0.4, stagger: 0.06, order: 'first', ease: 'auto', inStr: 1,
    hold: 1.2, loopFx: 'none', loopStr: 1, loopDur: 1,
    outOn: true, outFx: 'fade', outDir: 'right', outDur: 0.4, outStagger: 0, outOrder: 'first', outEase: 'auto', outStr: 1,
    subIn: 'same', subDelay: -0.1, pre: 0.1, post: 0.3, scrollSpeed: 90, edgeFade: true,
    fill: 'solid', color: '#ffffff', color2: '#ffd76a', color3: '', gradDir: 'v', fillOp: 1,
    strokeOn: true, stroke: '#1a1030', strokeW: 5, stroke2On: false, stroke2: '#ffffff', stroke2W: 4,
    shadowOn: false, shadowColor: '#000000', shadowOp: 0.35, shadowBlur: 10, shadowX: 0, shadowY: 3,
    glowOn: true, glow: '#7a5cff', glowSpread: 24, glowStr: 1, noise1: '#ff285a', noise2: '#28e6ff',
    deco: 'none', decoFill: '#000000', decoLine: '#ffffff', decoTape: '#f5c400', decoStripe: '#151515', decoFillOp: 0.5, decoBorder: 3, decoPad: 0.28, decoRadius: 0.2, decoAnim: 'stretch', decoDur: 0.6, tapeW: 22, tapeSpeed: 90,
    bgMode: 'none', bgColor: '#000000', bgOp: 0.45, bgFade: true,
    w: 640, h: 180, anchor: 4, padX: 24, padY: 16, offX: 0, offY: 0,
    css: '', fps: 20, loop: 1, crop: true, fileName: '' };
  const make = id => Object.assign({ id }, PDM.clone(DEF));
  /** 빠진 칸을 기본값으로 채우고, 예전(첫 판) 칸 이름을 지금 것으로 */
  function norm(fx) {
    const o = Object.assign({}, DEF, fx);
    if (fx.weight === undefined && fx.bold !== undefined) o.weight = fx.bold ? 700 : 400;
    if (fx.flow === undefined && fx.perChar !== undefined) o.flow = fx.perChar ? 'char' : 'all';
    if (fx.fill === undefined && fx.id !== undefined && 'bold' in fx) o.fill = fx.color2 ? 'grad' : 'solid';
    if (fx.strokeOn === undefined && 'bold' in fx) o.strokeOn = +fx.strokeW > 0;
    if (fx.glowOn === undefined && 'bold' in fx) { o.glowOn = !!fx.glow && +fx.glowW > 0; o.glowSpread = (+fx.glowW || 12) * 2; }
    if (fx.shadowOn === undefined && 'bold' in fx) { o.shadowOn = !!fx.shadow; o.shadowOp = 0.6; o.shadowBlur = 0; o.shadowX = o.shadowY = Math.max(2, o.size / 16); }
    if (fx.bgMode === undefined && fx.bg) { o.bgMode = 'solid'; o.bgColor = fx.bg; o.bgOp = 1; o.bgFade = false; }
    const mi = { left: ['slide', 'left'], right: ['slide', 'right'], up: ['rise'], down: ['drop'], zoom: ['shrink'], spin: ['rotate'] }[o.inFx]; if (mi) { o.inFx = mi[0]; if (mi[1]) o.inDir = mi[1]; }
    const mo = { left: ['slide', 'left'], right: ['slide', 'right'], zoom: ['swell'] }[o.outFx]; if (mo) { o.outFx = mo[0]; if (mo[1]) o.outDir = mo[1]; }
    if (o.loopFx === 'blink' && 'bold' in fx && fx.loopStr === undefined) o.loopFx = 'glow';
    return o;
  }
  const list = () => (store.get(K) || {}).list || [];
  const num = (v, d) => (isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const v = m ? parseInt(m[1], 16) : 0; return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${Math.max(0, Math.min(1, a))})`; };
  const r3 = x => +(+x).toFixed(3);

  // ---------------- 등장 · 퇴장 · 표시 중 keyframes (세기 s, 거리 d(px), 방향)
  const vec = dir => ({ left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir] || [-1, 0]);
  const clipFrom = dir => ({ left: 'inset(-60% 100% -60% -60%)', right: 'inset(-60% -60% -60% 100%)', up: 'inset(-60% -60% 100% -60%)', down: 'inset(100% -60% -60% -60%)' }[dir] || 'inset(-60% 100% -60% -60%)');
  function kfIn(f, s, d, dir, o) {
    const [vx, vy] = vec(dir), n1 = o.noise1, n2 = o.noise2;
    switch (f) {
      case 'fade': return 'from{opacity:0}';
      case 'rise': return `from{opacity:0;transform:translateY(${d}px)}`;
      case 'drop': return `from{opacity:0;transform:translateY(${-d}px)}`;
      case 'split': return `from{opacity:0;transform:translateY(calc(var(--sgn) * ${d}px))}`;
      case 'slide': return `from{opacity:0;transform:translate(${vx * d * 2.5}px,${vy * d * 2.5}px)}`;
      case 'track': return `from{opacity:0;transform:translateX(calc(var(--c) * ${r3(d * 0.9)}px))}`;
      case 'expand': return `from{opacity:0;transform:translateX(calc(var(--c) * -0.85em)) scaleX(.2)}`;
      case 'blur': return `from{opacity:0;filter:blur(${r3(d * 0.4)}px)}`;
      case 'pop': return `0%{opacity:0;transform:scale(.2)}70%{opacity:1;transform:scale(${r3(1 + 0.2 * s)})}100%{transform:scale(1)}`;
      case 'shrink': return `from{opacity:0;transform:scale(${r3(1 + 1.6 * s)})}`;
      case 'rotate': return `from{opacity:0;transform:rotate(${-180 * s}deg) scale(.3)}`;
      case 'flip': return 'from{opacity:0;transform:perspective(400px) rotateX(90deg)}';
      case 'bounce': return `0%{opacity:0;transform:translateY(${-d * 3}px)}55%{opacity:1;transform:translateY(0)}70%{transform:translateY(${-d * 0.6}px)}85%{transform:translateY(0)}93%{transform:translateY(${-d * 0.18}px)}100%{transform:translateY(0)}`;
      case 'gather': return `from{opacity:0;transform:translate(calc(var(--rx) * ${r3(d * 4)}px),calc(var(--ry) * ${r3(d * 4)}px)) rotate(calc(var(--rx) * ${120 * s}deg))}`;
      case 'type': return 'from{opacity:0}';
      case 'flicker': return '0%{opacity:0}10%{opacity:1}20%{opacity:0}35%{opacity:1}50%{opacity:.2}70%{opacity:1}80%{opacity:.4}100%{opacity:1}';
      case 'slam': return `0%{opacity:0;transform:scale(${r3(1 + 2.4 * s)})}55%{opacity:1;transform:scale(.94)}75%{transform:scale(${r3(1 + 0.05 * s)})}100%{transform:scale(1)}`;
      case 'approach': return 'from{opacity:0;transform:scale(.25)}';
      case 'depth': return `from{opacity:0;transform:scale(.6);filter:blur(${r3(d * 0.3)}px)}`;
      case 'wipe': return `from{clip-path:${clipFrom(dir)}}to{clip-path:inset(-60%)}`;
      case 'unfold': return vx ? 'from{opacity:0;transform:scaleX(0)}' : 'from{opacity:0;transform:scaleY(0)}';
      case 'glitch': return `0%{opacity:0}8%{opacity:1;transform:translate(${-10 * s}px,3px) skewX(${18 * s}deg);text-shadow:${6 * s}px 0 ${n1},${-6 * s}px 0 ${n2}}22%{transform:translate(${8 * s}px,-2px) skewX(${-12 * s}deg);clip-path:inset(20% -20% 45% -20%)}36%{transform:translate(${-5 * s}px,1px);clip-path:inset(55% -20% 10% -20%);text-shadow:${-4 * s}px 0 ${n1},${4 * s}px 0 ${n2}}55%{transform:translate(${4 * s}px,0);clip-path:inset(-60%)}70%{transform:none;text-shadow:${2 * s}px 0 ${n1},${-2 * s}px 0 ${n2}}100%{transform:none;text-shadow:0 0 transparent,0 0 transparent;clip-path:inset(-60%)}`;
      case 'flash': return `0%{opacity:0;filter:brightness(${4 + 4 * s}) blur(${r3(d * 0.4)}px)}30%{opacity:1;filter:brightness(${3 + 3 * s}) blur(${r3(d * 0.15)}px)}100%{filter:brightness(1) blur(0)}`;
    }
    return '';
  }
  function kfOut(f, s, d, dir, o) {
    const [vx, vy] = vec(dir), n1 = o.noise1, n2 = o.noise2;
    switch (f) {
      case 'fade': return 'to{opacity:0}';
      case 'up': return `to{opacity:0;transform:translateY(${-d}px)}`;
      case 'down': return `to{opacity:0;transform:translateY(${d}px)}`;
      case 'split': return `to{opacity:0;transform:translateY(calc(var(--sgn) * ${d}px))}`;
      case 'slide': return `to{opacity:0;transform:translate(${vx * d * 2.5}px,${vy * d * 2.5}px)}`;
      case 'track': return `to{opacity:0;transform:translateX(calc(var(--c) * ${r3(d * 0.9)}px))}`;
      case 'blur': return `to{opacity:0;filter:blur(${r3(d * 0.4)}px)}`;
      case 'swell': return `to{opacity:0;transform:scale(${r3(1 + 1.2 * s)})}`;
      case 'shrink': return 'to{opacity:0;transform:scale(.2)}';
      case 'scatter': return `to{opacity:0;transform:translate(calc(var(--rx) * ${r3(d * 4)}px),calc(var(--ry) * ${r3(d * 4)}px)) rotate(calc(var(--rx) * ${120 * s}deg))}`;
      case 'erase': return 'to{opacity:0}';
      case 'flicker': return '0%{opacity:1}15%{opacity:.3}30%{opacity:1}50%{opacity:.1}65%{opacity:.8}80%{opacity:.1}100%{opacity:0}';
      case 'approach': return `to{opacity:0;transform:scale(${r3(1 + 2.4 * s)})}`;
      case 'recede': return 'to{opacity:0;transform:scale(.25)}';
      case 'wipe': return `from{clip-path:inset(-60%)}to{clip-path:${clipFrom(dir)}}`;
      case 'close': return vx ? 'to{opacity:0;transform:scaleX(0)}' : 'to{opacity:0;transform:scaleY(0)}';
      case 'glitch': return `0%{transform:none}15%{transform:translate(${6 * s}px,0) skewX(${-14 * s}deg);text-shadow:${5 * s}px 0 ${n1},${-5 * s}px 0 ${n2}}35%{transform:translate(${-9 * s}px,2px);clip-path:inset(50% -20% 15% -20%)}55%{transform:translate(${7 * s}px,-2px) skewX(${16 * s}deg);clip-path:inset(15% -20% 55% -20%);opacity:1}80%{opacity:.6;clip-path:inset(40% -20% 40% -20%)}100%{opacity:0;clip-path:inset(50% -20% 50% -20%)}`;
    }
    return '';
  }
  function kfLoop(f, s, o) {
    switch (f) {
      case 'float': return `50%{transform:translateY(${-6 * s}%)}`;
      case 'wave': return `50%{transform:translateY(${-18 * s}%)}`;
      case 'pulse': return `50%{transform:scale(${r3(1 + 0.07 * s)})}`;
      case 'shake': return `20%{transform:translate(${-3 * s}px,${2 * s}px)}40%{transform:translate(${3 * s}px,${-2 * s}px)}60%{transform:translate(${-2 * s}px,${-3 * s}px)}80%{transform:translate(${2 * s}px,${3 * s}px)}`;
      case 'glow': return `50%{filter:brightness(${r3(1 + 0.6 * s)}) drop-shadow(0 0 ${8 * s}px ${o.glow})}`;
      case 'flicker': return `0%,100%{opacity:1}42%{opacity:1}45%{opacity:${r3(Math.max(0, 1 - 0.7 * s))}}48%{opacity:1}71%{opacity:1}73%{opacity:${r3(Math.max(0, 1 - 0.5 * s))}}77%{opacity:1}`;
      case 'blink': return '0%,49%{opacity:1}50%,100%{opacity:0}';
      case 'noise': return `0%,86%,100%{transform:none;text-shadow:0 0 transparent,0 0 transparent;clip-path:inset(-60%)}88%{transform:translate(${-5 * s}px,0) skewX(${12 * s}deg);text-shadow:${4 * s}px 0 ${o.noise1},${-4 * s}px 0 ${o.noise2}}92%{transform:translate(${5 * s}px,1px);clip-path:inset(30% -20% 40% -20%)}96%{transform:translate(${-2 * s}px,0);text-shadow:${-3 * s}px 0 ${o.noise1},${3 * s}px 0 ${o.noise2};clip-path:inset(-60%)}`;
      case 'hue': return 'to{filter:hue-rotate(360deg)}';
    }
    return '';
  }

  /** 줄 나누기: 자동 줄바꿈(wrap 글자) · 빈 줄에서 쪽 나누기 */
  function pagesOf(o) {
    const wrapLine = l => { const n = Math.round(num(o.wrap, 0)), cs = [...l]; if (n <= 0 || cs.length <= n) return [l]; const out = []; for (let i = 0; i < cs.length; i += n) out.push(cs.slice(i, i + n).join('')); return out; };
    const raw = String(o.text || ' ').replace(/\r/g, '');
    const blocks = o.pages && o.flow !== 'scroll' ? raw.split(/\n[ \t]*\n+/) : [raw];
    return blocks.map(b => b.split('\n').flatMap(wrapLine)).filter(p => p.length);
  }
  /** 순서대로 매긴 등수 (0 = 가장 먼저) */
  function ranks(n, order, seed) {
    const out = []; let s = seed || 1; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    if (order === 'random') { const idx = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } idx.forEach((v, r) => { out[v] = r; }); return out; }
    for (let i = 0; i < n; i++) out.push(order === 'last' ? n - 1 - i : order === 'center' ? Math.floor(Math.abs(i - (n - 1) / 2)) : order === 'edges' ? Math.min(i, n - 1 - i) : i);
    return out;
  }
  const hash = s => { let v = 7; for (const c of String(s)) v = (v * 31 + c.charCodeAt(0)) & 0x7fffffff; return v || 1; };

  /** 연출 하나의 HTML · CSS · 전체 길이(초) · 정지 이미지 시각 */
  function build(fx, fontCss) {
    const o = norm(fx), size = Math.max(6, num(o.size, 72)), W = Math.max(16, num(o.w, 640)), H = Math.max(16, num(o.h, 180));
    const pages = pagesOf(o), scroll = o.flow === 'scroll';
    const inFx = scroll ? 'none' : o.inFx, lastOut = !scroll && o.outOn && o.outFx !== 'none';
    const inUnit = WHOLE_IN.has(inFx) ? 'all' : o.flow === 'scroll' ? 'all' : o.flow;
    const inD = inFx === 'none' ? 0 : Math.max(0.02, num(o.inDur, 0.4)), st = Math.max(0, num(o.stagger, 0)), ost = Math.max(0, num(o.outStagger, 0));
    const hold = Math.max(0, num(o.hold, 1)), pre = Math.max(0, num(o.pre, 0)), post = Math.max(0, num(o.post, 0));
    const sIn = num(o.inStr, 1), sOut = num(o.outStr, 1), dIn = size * 0.6 * sIn, dOut = size * 0.6 * sOut;
    let t = pre, still = pre, html = '', lastOutStart = 0, lastEnd = 0, gi = 0, seed = hash(o.id || o.text);
    const subHtml = pi => o.sub ? `<div class="sub" style="--d:${r3(0)}s" data-p="${pi}">${esc(o.sub)}</div>` : '';
    const pageCss = [];
    pages.forEach((lines, pi) => {
      const last = pi === pages.length - 1, doOut = scroll ? false : last ? lastOut : true;
      const outFx = !doOut ? 'none' : o.outFx === 'none' || !o.outOn ? 'fade' : o.outFx;
      const outUnit = WHOLE_OUT.has(outFx) ? 'all' : inUnit === 'all' && o.flow === 'all' ? 'all' : o.flow === 'scroll' ? 'all' : o.flow;
      const outD = !doOut ? 0 : Math.max(0.02, o.outFx === 'none' || !o.outOn ? 0.3 : num(o.outDur, 0.4));
      const chars = lines.map(l => [...l]), nCh = Math.max(1, chars.reduce((a, l) => a + l.length, 0)), nLn = lines.length;
      const nIn = inUnit === 'char' ? nCh : inUnit === 'line' ? nLn : 1, nOut = outUnit === 'char' ? nCh : outUnit === 'line' ? nLn : 1;
      const rIn = ranks(nIn, o.order, seed + pi), rOut = ranks(nOut, o.outOrder, seed + pi + 99);
      const inTotal = inD ? inD + Math.max(0, ...rIn) * st : 0, outTotal = outD ? outD + Math.max(0, ...rOut) * ost : 0;
      let dur = inTotal + hold + outTotal;
      if (scroll) dur = (H + nLn * size * num(o.lineH, 1.2) + 20) / Math.max(5, num(o.scrollSpeed, 90));
      const t0 = t, outStart = t0 + inTotal + hold;
      const cls = (unit, idx) => { const a = inD && inUnit === unit, b = outD && outUnit === unit; if (!a && !b) return ['', ''];
        const c = unit === 'all' ? 0 : idx - ((unit === 'char' ? nCh : nLn) - 1) / 2, k = seed + idx * 7919 + pi;
        return [(a ? ' ai' : '') + (b ? ' ao' : ''), `--d:${r3(t0 + (a ? rIn[idx] * st : 0))}s;--o:${r3(outStart + (b ? rOut[idx] * ost : 0))}s;--sgn:${idx % 2 ? 1 : -1};--c:${r3(c)};--rx:${r3(((k * 9301 + 49297) % 233280) / 116640 - 1)};--ry:${r3(((k * 4621 + 7919) % 233280) / 116640 - 1)}`]; };
      let ci = 0;
      const body = chars.map((l, li) => { const [lc, ls] = cls('line', li);
        return `<div class="line${lc}" style="${ls}">${l.map(c => { const [cc, cs] = cls('char', ci); const g = c === ' ' ? '&#160;' : esc(c), q = g.replace(/"/g, '&quot;'); const out = `<span class="ch${cc}" data-c="${q}" style="--i:${ci};--n:${l.length};${cs}"><span class="chi" data-c="${q}">${g}</span></span>`; ci++; gi++; return out; }).join('') || '&#160;'}</div>`; }).join('');
      const [tc, ts] = cls('all', 0);
      const sub = o.sub ? `<div class="sub" style="--d:${r3(Math.max(t0, t0 + inTotal + num(o.subDelay, 0)))}s;--o:${r3(outStart)}s">${esc(o.sub)}</div>` : '';
      html += `<div class="page p${pi}${doOut ? ' pout' : ''}" style="--t0:${r3(t0)}s;--o:${r3(outStart)}s;--oe:${r3(Math.max(0.05, outTotal))}s"><div class="wrap"><div class="block">${o.subPos === 'above' ? sub : ''}<div class="text${tc}${scroll ? ' scroll' : ''}" style="${ts};--sd:${r3(dur)}s"><div class="glowbox">${body}</div></div>${o.subPos !== 'above' ? sub : ''}</div></div></div>`;
      if (last) { still = scroll ? t0 + dur / 2 : t0 + inTotal + Math.min(hold / 2, 0.15); lastOutStart = outStart; lastEnd = t0 + dur; }
      t += dur;
    });
    const total = Math.max(0.05, t + post);
    const easeIn = o.ease === 'auto' ? 'cubic-bezier(.2,.8,.2,1)' : EASE_CSS[o.ease] || 'ease-out', easeOut = o.outEase === 'auto' ? 'ease-in' : EASE_CSS[o.outEase] || 'ease-in';
    const tfIn = inFx === 'type' ? 'steps(1,end)' : easeIn, tfOut = o.outFx === 'erase' ? 'steps(1,end)' : easeOut;
    const outName = o.outOn && o.outFx !== 'none' ? o.outFx : 'fade', outDurCss = Math.max(0.02, o.outOn && o.outFx !== 'none' ? num(o.outDur, 0.4) : 0.3);
    // ---- 글자 겹: 바깥 테두리(.ch::before) · 테두리(.chi::before) · 속(.chi) · 그라데이션(.chi::after)
    const sw = o.strokeOn ? Math.max(0, num(o.strokeW, 0)) : 0, s2 = o.stroke2On ? Math.max(0, num(o.stroke2W, 0)) : 0, fop = Math.max(0, Math.min(1, num(o.fillOp, 1)));
    const layer = 'content:attr(data-c);position:absolute;left:0;top:0;text-shadow:none;';
    const cols = [o.color, o.color2, o.color3].filter(c => /^#[0-9a-f]{6}$/i.test(c || ''));
    const gdir = o.gradDir === 'h' ? '90deg' : o.gradDir === 'd' ? '135deg' : '180deg';
    const filters = [];
    if (o.shadowOn) filters.push(`drop-shadow(${num(o.shadowX, 0)}px ${num(o.shadowY, 3)}px ${Math.max(0, num(o.shadowBlur, 0))}px ${rgba(o.shadowColor, num(o.shadowOp, 0.35))})`);
    if (o.glowOn) { const n = Math.max(1, Math.round(num(o.glowStr, 1) * 2)); for (let i = 0; i < Math.min(6, n); i++) filters.push(`drop-shadow(0 0 ${r3(num(o.glowSpread, 24) / (i % 2 ? 2 : 4))}px ${o.glow})`); }
    const family = f => f === 'game' ? "'pdmGameFont', monospace" : f === 'file' ? `'pdmFile_${hash(o.fontFile)}', sans-serif` : (f || 'sans-serif');
    const ax = ['start', 'center', 'end'][num(o.anchor, 4) % 3], ay = ['start', 'center', 'end'][Math.floor(num(o.anchor, 4) / 3)];
    const al = o.align === 'start' ? 'flex-start' : o.align === 'end' ? 'flex-end' : 'center', ta = o.align === 'start' ? 'left' : o.align === 'end' ? 'right' : 'center';
    // ---- 장식
    const pad = r3(num(o.decoPad, 0.28) * size), bw = Math.max(0, num(o.decoBorder, 3)), dfill = rgba(o.decoFill, num(o.decoFillOp, 0)), ln = o.decoLine, rad = r3(num(o.decoRadius, 0.2) * size * 0.5);
    const tapeT = Math.max(4, num(o.tapeW, 22)), tapeL = r3(tapeT * 2 * 1.41421), tapeG = `repeating-linear-gradient(-45deg,${o.decoTape} 0 ${tapeT}px,${o.decoStripe} ${tapeT}px ${tapeT * 2}px)`;
    const L = r3(size * 0.45);
    const decoBox = { band: `left:-4000px;right:-4000px;top:${-pad}px;bottom:${-pad}px;background:${dfill};border-top:${bw}px solid ${ln};border-bottom:${bw}px solid ${ln}`,
      tape: `left:-4000px;right:-4000px;top:${-pad - tapeT}px;bottom:${-pad - tapeT}px;background:${tapeG} 0 top/auto ${tapeT}px repeat-x,${tapeG} 0 bottom/auto ${tapeT}px repeat-x,linear-gradient(${dfill},${dfill})`,
      box: `inset:${-pad}px ${-pad * 1.6}px;background:${dfill};border:${bw}px solid ${ln};border-radius:${rad}px`,
      title: `inset:${-pad}px ${-pad * 1.6}px;background:${dfill};border:${bw}px solid ${ln};border-radius:${rad}px;outline:1px solid ${ln};outline-offset:${Math.max(3, bw + 2)}px`,
      lines: `inset:${-pad}px ${-pad * 1.6}px;background:${dfill};border-top:${bw}px solid ${ln};border-bottom:${bw}px solid ${ln}`,
      underline: `inset:${-pad}px ${-pad * 0.5}px;background:${dfill};border-bottom:${bw}px solid ${ln}`,
      sides: `inset:${-pad}px ${-pad * 1.6}px;background:${dfill};border-left:${bw}px solid ${ln};border-right:${bw}px solid ${ln}`,
      accent: `inset:${-pad}px ${-pad * 1.6}px;background:${dfill};border-left:${bw * 3}px solid ${ln}`,
      corner: `inset:${-pad}px ${-pad * 1.6}px;background:${['left top', 'right top', 'left bottom', 'right bottom'].map(p => `linear-gradient(${ln},${ln}) ${p}/${L}px ${bw}px no-repeat,linear-gradient(${ln},${ln}) ${p}/${bw}px ${L}px no-repeat`).join(',')},linear-gradient(${dfill},${dfill})` }[o.deco];
    const dDur = Math.max(0.05, num(o.decoDur, 0.6));
    const decoAnims = [o.decoAnim === 'stretch' ? `dstretch ${dDur}s cubic-bezier(.2,.8,.2,1) var(--t0) both` : o.decoAnim === 'fade' ? `dfade ${dDur}s ease-out var(--t0) both` : `pshow .001s steps(1) var(--t0) both`,
      o.deco === 'tape' && num(o.tapeSpeed, 0) > 0 ? `dtape ${r3(tapeL / num(o.tapeSpeed, 90))}s linear infinite` : null].filter(Boolean);
    // ---- 배경
    const bgc = rgba(o.bgColor, num(o.bgOp, 0.45));
    const bgCss = { solid: bgc, vignette: `radial-gradient(ellipse at center,transparent 35%,${bgc} 100%)`, bottom: `linear-gradient(to top,${bgc},transparent 75%)`, top: `linear-gradient(to bottom,${bgc},transparent 75%)` }[o.bgMode];
    const bgFadeOut = lastOut && o.bgFade;
    const loopOn = o.loopFx && o.loopFx !== 'none', lpDur = Math.max(0.1, num(o.loopDur, 1) * (o.loopFx === 'noise' ? 2.5 : 1));
    const subIn = { same: 'from{opacity:0}', fade: 'from{opacity:0}', rise: `from{opacity:0;transform:translateY(${r3(size * 0.2)}px)}`, blur: 'from{opacity:0;filter:blur(6px)}', track: 'from{opacity:0;letter-spacing:1.2em}', type: 'from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}', slide: `from{opacity:0;transform:translateX(${r3(-size * 0.5)}px)}` }[o.subIn] || 'from{opacity:0}';
    const css = `${fontCss || ''}
*{box-sizing:border-box;margin:0;padding:0}
.stage{--t:${r3(total)}s;width:${W}px;height:${H}px;position:relative;overflow:hidden}
${bgCss ? `.bg{position:absolute;inset:0;background:${bgCss};${o.bgFade ? `animation:bgin .35s ease-out ${r3(pre)}s both${bgFadeOut ? `,bgout ${r3(Math.max(0.1, lastEnd - lastOutStart))}s ease-in ${r3(lastOutStart)}s forwards` : ''}` : ''}}` : ''}
.anchor{position:absolute;inset:0;display:grid;place-items:${ay} ${ax};padding:${num(o.padY, 16)}px ${num(o.padX, 24)}px;transform:translate(${num(o.offX, 0)}px,${num(o.offY, 0)}px)${scroll && o.edgeFade ? ';-webkit-mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent)' : ''}}
.fit{grid-area:1/1;display:grid;place-items:${ay} ${ax};transform-origin:${{ start: 'left', center: 'center', end: 'right' }[ax]} ${{ start: 'top', center: 'center', end: 'bottom' }[ay]}}
.page{grid-area:1/1;animation:pshow .001s steps(1) var(--t0) both}
.wrap{display:inline-block;${loopOn && o.loopFx !== 'wave' ? `animation:lp ${lpDur}s ${o.loopFx === 'blink' ? 'steps(1)' : 'ease-in-out'} infinite;` : ''}}
.block{position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:${al}}
${decoBox ? `.block::before{content:"";position:absolute;z-index:-1;${decoBox};animation:${decoAnims.join(',')}}\n.pout .block::before{animation:${decoAnims.concat(`dout var(--oe) ease-in var(--o) forwards`).join(',')}}` : ''}
.text{display:inline-block;text-align:${ta};white-space:pre;font:${o.italic ? 'italic ' : ''}${num(o.weight, 700)} ${size}px/${num(o.lineH, 1.2)} ${family(o.font)};letter-spacing:${num(o.spacing, 0)}px;${o.vertical ? 'writing-mode:vertical-rl;' : ''}}
.text.scroll{animation:tscroll var(--sd) linear var(--t0) both;align-self:start}
.glowbox{${filters.length ? `filter:${filters.join(' ')}` : ''}}
.line{display:block}
.ch{display:inline-block;position:relative;isolation:isolate;white-space:pre}
.chi{display:inline-block;position:relative;color:${cols.length > 1 && o.fill === 'grad' ? 'transparent' : rgba(o.color, fop)};${loopOn && o.loopFx === 'wave' ? `animation:lp ${lpDur}s ease-in-out infinite;animation-delay:calc(var(--i) * -0.12s);` : ''}}
${sw > 0 ? `.chi::before{${layer}z-index:-1;-webkit-text-stroke:${sw * 2}px ${o.stroke};${fop < 1 ? '-webkit-text-fill-color:transparent' : `color:${o.stroke}`}}` : ''}
${s2 > 0 ? `.ch::before{${layer}z-index:-2;-webkit-text-stroke:${(sw + s2) * 2}px ${o.stroke2};${fop < 1 ? '-webkit-text-fill-color:transparent' : `color:${o.stroke2}`}}` : ''}
${o.fill === 'grad' && cols.length > 1 ? `.chi::after{${layer}background:linear-gradient(${gdir},${cols.join(',')})${o.gradDir === 'v' ? '' : ` calc(var(--i) * -1em) 0/calc(var(--n) * 1em) 100%`};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;opacity:${fop}}` : ''}
.sub{display:block;white-space:pre;font:${o.subItalic ? 'italic ' : ''}${num(o.subWeight, 400)} ${r3(size * num(o.subSize, 0.3))}px/1.3 ${family(o.subFont || o.font)};letter-spacing:${num(o.subSpacing, 6)}px;color:${o.subColorOn ? o.subColor : o.color};margin:${o.subPos === 'above' ? `0 0 ${r3(num(o.subGap, 0.25) * size)}px` : `${r3(num(o.subGap, 0.25) * size)}px 0 0`};${filters.length ? `filter:${filters.join(' ')};` : ''}animation:subin .45s ease-out var(--d) both}
.pout .sub{animation:subin .45s ease-out var(--d) both,subout var(--oe) ease-in var(--o) forwards}
.ai{animation:tin ${inD || 0.02}s ${tfIn} var(--d) both}
.ao{animation:tout ${outDurCss}s ${tfOut} var(--o) forwards}
.ai.ao{animation:tin ${inD || 0.02}s ${tfIn} var(--d) both,tout ${outDurCss}s ${tfOut} var(--o) forwards}
@keyframes pshow{from{visibility:hidden}to{visibility:visible}}
@keyframes tin{${kfIn(inFx, sIn, dIn, o.inDir, o)}}
@keyframes tout{${kfOut(outName, sOut, dOut, o.outDir, o)}}
@keyframes subin{${subIn}}
@keyframes subout{to{opacity:0}}
@keyframes tscroll{from{transform:translateY(${H}px)}to{transform:translateY(-100%)}}
@keyframes bgin{from{opacity:0}}
@keyframes bgout{to{opacity:0}}
@keyframes dstretch{from{transform:scaleX(0);opacity:0}}
@keyframes dfade{from{opacity:0}}
@keyframes dout{to{opacity:0}}
@keyframes dtape{to{background-position:${tapeL}px top,${-tapeL}px bottom,0 0}}
${loopOn ? `@keyframes lp{${kfLoop(o.loopFx, num(o.loopStr, 1), o)}}` : ''}
${o.css || ''}`;
    return { html: `<div class="stage">${bgCss ? '<div class="bg"></div>' : ''}<div class="anchor"><div class="fit">${html}</div></div></div>`, css: css.replace(/\n{2,}/g, '\n'), total, still, o, W, H };
  }

  // ---------------- 글꼴 (게임 픽셀 글꼴 · 등록한 글꼴 파일) — 미리보기용으로 document.fonts 에 넣고, 찍을 때는 @font-face 를 같이 넣음
  const fontCache = {};
  async function fontCssOf(fx) {
    const o = norm(fx), out = [];
    const add = async (name, path, key) => {
      if (fontCache[key] === undefined) {
        try { const d = (await pdm.readDataURL(path)).replace(/^data:[^;,]*/, 'data:font/ttf'); fontCache[key] = d;
          try { const f = new FontFace(name, `url(${d})`); await f.load(); document.fonts.add(f); } catch (_) { /* 기본 글꼴 */ } } catch (_) { fontCache[key] = ''; }
      }
      if (fontCache[key]) out.push(`@font-face{font-family:'${name}';src:url(${fontCache[key]})}`);
    };
    if (o.font === 'game' || o.subFont === 'game') { const repo = await PDM.app.resolveRepo(true); await add('pdmGameFont', pdm.join(repo, 'core', 'src', 'main', 'assets', 'fonts', 'pixel_font.ttf'), 'game:' + repo); }
    if ((o.font === 'file' || o.subFont === 'file') && o.fontFile) await add(`pdmFile_${hash(o.fontFile)}`, pdm.join(store.root, o.fontFile), 'file:' + o.fontFile);
    return out.join('\n');
  }

  /** 연출을 host 에 올리고 모든 애니메이션을 멈춘 채 돌려줌 → { stage, anims, b, seek(초) } (공용 모션 코어 PDM.motion.mount) */
  async function mount(fx, host, zoom) {
    const fontCss = await fontCssOf(fx), b = build(fx, fontCss);
    const m = await PDM.motion.mount({ html: b.html, css: b.css, W: b.W, H: b.H, prepare: root => {
      const fit = root.querySelector('.fit');
      if (b.o.shrink && b.o.flow !== 'scroll' && fit) {   // 넘치면 줄이기
        const aw = b.W - 2 * num(b.o.padX, 24), ah = b.H - 2 * num(b.o.padY, 16), k = Math.min(1, aw / Math.max(1, fit.offsetWidth), ah / Math.max(1, fit.offsetHeight));
        if (k < 0.999) fit.style.transform = `scale(${r3(Math.max(0.05, k))})`;
      } } }, host, zoom);
    return Object.assign(m, { b, fontCss });
  }

  // ---------------- 프레임 찍기 (공용 모션 코어 PDM.motion.shoot)
  /** times(초 목록)의 프레임을 캔버스 배열로. onProgress(0~1) */
  async function shoot(fx, times, onProgress, cancel) {
    const fontCss = await fontCssOf(fx), b = build(fx, fontCss);
    const prepare = root => {
      const fit = root.querySelector('.fit');
      if (b.o.shrink && b.o.flow !== 'scroll' && fit) {
        const aw = b.W - 2 * num(b.o.padX, 24), ah = b.H - 2 * num(b.o.padY, 16), k = Math.min(1, aw / Math.max(1, fit.offsetWidth), ah / Math.max(1, fit.offsetHeight));
        if (k < 0.999) fit.style.transform = `scale(${r3(Math.max(0.05, k))})`;
      } };
    const frames = await PDM.motion.shoot({ html: b.html, css: b.css, W: b.W, H: b.H, prepare }, times, onProgress, cancel);
    return { frames, b };
  }
  async function capture(fx, onProgress, cancel) {
    const b0 = build(fx, ''), fps = Math.max(1, Math.min(60, num(fx.fps, 20))), count = Math.max(1, Math.min(900, Math.round(b0.total * fps)));
    const r = await shoot(fx, [...Array(count).keys()].map(i => (i + 0.5) / fps), onProgress, cancel);
    return { frames: r.frames, fps, total: b0.total };
  }
  function crop(frames) {
    const w = frames[0].width, hh = frames[0].height; let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    frames.forEach(cv => { const d = cv.getContext('2d').getImageData(0, 0, w, hh).data;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } });
    if (x1 < 0) return frames;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(hh - 1, y1 + 2);
    return frames.map(cv => { const c = h('canvas', { width: x1 - x0 + 1, height: y1 - y0 + 1 }); c.getContext('2d').drawImage(cv, -x0, -y0); return c; });
  }

  // ---------------- APNG 만들기 — 공용 모션 코어 (PDM.motion.encodeApng)
  const { encodeApng, crc32 } = PDM.motion;
  const toDataURL = bytes => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(new Blob([bytes], { type: 'image/png' })); });
  /** ZIP (압축 없이 묶기) — files: [{ name, bytes(Uint8Array) }] */
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const u16 = v => [v & 255, v >> 8 & 255], u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255];
    files.forEach(f => { const nm = enc.encode(f.name), crc = crc32(f.bytes), sz = f.bytes.length;
      const head = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), 0, 0]);
      parts.push(head, nm, f.bytes);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), nm);
      off += head.length + nm.length + sz; });
    const csz = central.reduce((a, p) => a + p.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(csz), ...u32(off), 0, 0]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, p) => a + p.length, 0)); let o = 0; all.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  const canvasBytes = cv => new Promise(ok => cv.toBlob(async bl => ok(new Uint8Array(await bl.arrayBuffer())), 'image/png'));
  const bytesURL = (bytes, type) => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(new Blob([bytes], { type: type || 'image/png' })); });
  const fileBase = fx => (String(fx.fileName || '').trim().replace(/[\\/:*?"<>|]/g, '_') || fx.id);

  /** 만들기: APNG + 게임용 시트를 프로젝트 assets/fx 에 저장하고 sheet 정보를 적음 */
  async function generate(fx, onProgress, cancel) {
    let { frames, fps } = await capture(fx, onProgress, cancel);
    const o = norm(fx);
    if (o.crop !== false && o.bgMode === 'none') frames = crop(frames);
    const w = frames[0].width, hh = frames[0].height, n = frames.length;
    const apng = await encodeApng(frames, fps, num(fx.loop, 1), onProgress);
    const base = fileBase(fx), apngRel = `assets/fx/${base}.png`, sheetRel = `assets/fx/${base}_sheet.png`;
    await pdm.writeDataURL(pdm.join(store.root, apngRel), await toDataURL(apng));
    // 게임용 시트: 한 변 4096 을 넘지 않게 격자로
    const MAX = 4096; let cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * hh / w)))); cols = Math.min(cols, Math.max(1, Math.floor(MAX / w)));
    const rows = Math.ceil(n / cols);
    let sheet = null, warn = '';
    if (w > MAX || rows * hh > MAX) warn = `게임용 시트가 너무 큽니다 (${cols * w}×${rows * hh}px > ${MAX}). 이미지 크기·길이·fps 를 줄이면 게임에서도 쓸 수 있습니다. APNG 만 저장했습니다.`;
    else {
      const cv = h('canvas', { width: cols * w, height: rows * hh }), g = cv.getContext('2d');
      frames.forEach((f, i) => g.drawImage(f, (i % cols) * w, Math.floor(i / cols) * hh));
      await pdm.writeDataURL(pdm.join(store.root, sheetRel), cv.toDataURL('image/png'));
      sheet = { png: sheetRel, cols, frames: n, w, h: hh, fps };
    }
    store.edit(K, '글자 연출 만들기', r => { const e = (r.list || []).find(x => x.id === fx.id); if (e) { e.apng = apngRel; if (sheet) e.sheet = sheet; else delete e.sheet; } }, { silent: true });
    if (PDM.assets && PDM.assets.clear) PDM.assets.clear();
    return { apng, rel: apngRel, sheet, warn, w, h: hh, n, bytes: apng.length, url: URL.createObjectURL(new Blob([apng], { type: 'image/png' })) };
  }
  /** PNG 정지 이미지 (다 나타난 순간) */
  async function exportStill(fx) {
    const b0 = build(fx, ''); let { frames } = await shoot(fx, [b0.still]);
    const o = norm(fx); if (o.crop !== false && o.bgMode === 'none') frames = crop(frames);
    const rel = `assets/fx/${fileBase(fx)}_still.png`;
    await pdm.writeDataURL(pdm.join(store.root, rel), frames[0].toDataURL('image/png'));
    return { rel, w: frames[0].width, h: frames[0].height, n: 1, url: frames[0].toDataURL('image/png') };
  }
  /** 연번 PNG (ZIP) */
  async function exportZip(fx, onProgress, cancel) {
    let { frames } = await capture(fx, onProgress, cancel);
    const o = norm(fx); if (o.crop !== false && o.bgMode === 'none') frames = crop(frames);
    const files = []; for (let i = 0; i < frames.length; i++) { files.push({ name: `${fileBase(fx)}_${String(i + 1).padStart(4, '0')}.png`, bytes: await canvasBytes(frames[i]) }); onProgress && onProgress(0.7 + (i + 1) / frames.length * 0.3); }
    const zip = zipStore(files), rel = `assets/fx/${fileBase(fx)}_frames.zip`;
    await pdm.writeDataURL(pdm.join(store.root, rel), await bytesURL(zip, 'application/zip'));
    return { rel, w: frames[0].width, h: frames[0].height, n: frames.length, bytes: zip.length };
  }

  // ---------------- 템플릿 · 꾸밈 프리셋
  const T = (name, o) => [name, o];
  const TEMPLATES = {
    '컷인': [
      T('전투 개시', { text: '전투 개시', sub: 'BATTLE START', flow: 'char', inFx: 'drop', stagger: 0.08, inDur: 0.45, ease: 'back', hold: 1.4, outFx: 'fade', deco: 'band', decoFillOp: 0.55, decoAnim: 'stretch', fill: 'grad', color: '#ffffff', color2: '#ffd76a', strokeOn: true, stroke: '#1b1b1f', strokeW: 5, glowOn: false, shadowOn: true, size: 72, w: 640, h: 200 }),
      T('전투 종료', { text: '전투 종료', sub: 'BATTLE END', flow: 'all', inFx: 'blur', inDur: 0.6, hold: 1.4, outFx: 'blur', deco: 'lines', decoFillOp: 0, fill: 'solid', color: '#ffffff', strokeOn: true, stroke: '#1b1b1f', strokeW: 4, glowOn: false, shadowOn: true, w: 640, h: 200 }),
      T('OPEN COMBAT', { text: 'OPEN COMBAT', sub: '', flow: 'all', inFx: 'slam', inDur: 0.5, hold: 1.2, outFx: 'approach', outDur: 0.35, deco: 'tape', decoFillOp: 0.7, font: 'Impact, sans-serif', weight: 400, italic: true, fill: 'solid', color: '#ffffff', strokeOn: true, stroke: '#000000', strokeW: 5, glowOn: false, spacing: 6, w: 640, h: 220 }),
      T('라운드', { text: 'ROUND 1', sub: '', flow: 'char', inFx: 'pop', stagger: 0.05, hold: 1, outFx: 'shrink', outStagger: 0.03, deco: 'none', font: 'Impact, sans-serif', weight: 400, fill: 'grad', color: '#fff3b0', color2: '#ff7a1f', strokeOn: true, stroke: '#3a1200', strokeW: 5, glowOn: true, glow: '#ff7a1f', glowSpread: 20, w: 520, h: 160 }),
      T('승리', { text: '승리', sub: 'VICTORY', flow: 'char', inFx: 'rise', stagger: 0.12, ease: 'spring', hold: 1.6, loopFx: 'glow', outFx: 'fade', fill: 'grad', color: '#fffbe0', color2: '#f2b233', color3: '#a8690a', strokeOn: true, stroke: '#3b2500', strokeW: 5, glowOn: true, glow: '#ffd76a', glowSpread: 28, deco: 'lines', decoLine: '#ffd76a', decoFillOp: 0, w: 640, h: 220 }),
      T('패배', { text: '패배', sub: 'DEFEAT', flow: 'all', inFx: 'fade', inDur: 1.2, hold: 1.6, loopFx: 'flicker', outFx: 'down', outDur: 0.8, fill: 'grad', color: '#d8d8d8', color2: '#6b0f0f', strokeOn: true, stroke: '#000000', strokeW: 5, glowOn: true, glow: '#7a0000', glowSpread: 26, bgMode: 'vignette', bgOp: 0.7, deco: 'none', w: 640, h: 220 }),
      T('경고', { text: 'WARNING', sub: '강적 출현', flow: 'all', inFx: 'glitch', inDur: 0.6, hold: 1.5, loopFx: 'blink', loopDur: 0.6, outFx: 'glitch', deco: 'tape', decoFillOp: 0.75, font: 'Impact, sans-serif', weight: 400, fill: 'solid', color: '#ffe14a', strokeOn: true, stroke: '#1a1a1a', strokeW: 4, glowOn: false, w: 640, h: 220 })],
    '판정': [
      T('크리티컬', { text: 'CRITICAL!', sub: '', flow: 'char', inFx: 'bounce', stagger: 0.04, hold: 0.9, loopFx: 'shake', outFx: 'scatter', outStagger: 0.02, font: 'Impact, sans-serif', weight: 400, italic: true, fill: 'grad', color: '#ffffff', color2: '#ff3d6e', strokeOn: true, stroke: '#3a0015', strokeW: 5, glowOn: true, glow: '#ff3d6e', deco: 'none', w: 560, h: 170 }),
      T('성공', { text: '성공', sub: 'SUCCESS', flow: 'all', inFx: 'pop', hold: 1, outFx: 'fade', fill: 'grad', color: '#e8fff0', color2: '#2fbf71', strokeOn: true, stroke: '#073a20', strokeW: 5, glowOn: true, glow: '#2fbf71', deco: 'underline', decoLine: '#2fbf71', w: 480, h: 190 }),
      T('실패', { text: '실패', sub: 'FAILURE', flow: 'all', inFx: 'drop', ease: 'bounce', hold: 1, outFx: 'down', fill: 'grad', color: '#e6e9f5', color2: '#5a6a9a', strokeOn: true, stroke: '#10152a', strokeW: 5, glowOn: false, shadowOn: true, deco: 'underline', decoLine: '#5a6a9a', w: 480, h: 190 })],
      '장소 · 시간': [
      T('장소 이름', { text: '하수도', sub: 'Depth 1', subPos: 'above', flow: 'char', inFx: 'fade', stagger: 0.1, inDur: 0.7, hold: 2, outFx: 'fade', outDur: 0.8, font: 'serif', weight: 400, spacing: 14, fill: 'solid', color: '#ffffff', strokeOn: false, glowOn: false, shadowOn: true, shadowBlur: 8, deco: 'lines', decoLine: '#ffffff', decoBorder: 1, decoFillOp: 0, decoPad: 0.35, bgMode: 'none', size: 56, w: 640, h: 200 }),
      T('시간 자막', { text: '3일 후', sub: '', flow: 'all', inFx: 'track', inDur: 1, ease: 'strong', hold: 1.8, outFx: 'track', outDur: 0.8, font: 'serif', weight: 400, spacing: 10, fill: 'solid', color: '#f0e9d8', strokeOn: false, glowOn: false, shadowOn: true, deco: 'none', bgMode: 'solid', bgColor: '#000000', bgOp: 0.6, size: 48, w: 640, h: 160, crop: false }),
      T('장 제목', { text: '제1장\n잊혀진 지하', sub: '', flow: 'line', inFx: 'rise', stagger: 0.5, inDur: 0.8, hold: 2.2, outFx: 'blur', outDur: 0.8, font: 'serif', weight: 700, fill: 'grad', color: '#ffffff', color2: '#c9b27a', strokeOn: false, glowOn: false, shadowOn: true, deco: 'corner', decoLine: '#c9b27a', decoFillOp: 0.35, lineH: 1.4, size: 46, w: 640, h: 260 })],
    '트레일러': [
      T('타자기 문장', { text: '그날, 던전의 문이 열렸다.', sub: '', flow: 'char', inFx: 'type', stagger: 0.07, hold: 1.6, outFx: 'fade', font: 'serif', weight: 400, fill: 'solid', color: '#ffffff', strokeOn: false, glowOn: false, shadowOn: true, deco: 'none', size: 34, spacing: 2, w: 720, h: 140 }),
      T('여러 쪽 문장', { text: '어둠은 깊고\n길은 멀다.\n\n그래도\n누군가는 내려간다.', sub: '', pages: true, flow: 'line', inFx: 'blur', stagger: 0.7, inDur: 0.8, hold: 1.4, outFx: 'blur', outDur: 0.6, font: 'serif', weight: 400, fill: 'solid', color: '#ffffff', strokeOn: false, glowOn: false, shadowOn: true, lineH: 1.6, size: 34, w: 720, h: 220 }),
      T('스크롤 크레딧', { text: 'STAFF\n\n기획  ○○○\n그림  ○○○\n음악  ○○○\n\nTHANK YOU FOR PLAYING', sub: '', flow: 'scroll', scrollSpeed: 60, font: 'sans-serif', weight: 400, fill: 'solid', color: '#ffffff', strokeOn: false, glowOn: false, shadowOn: false, lineH: 1.7, size: 26, w: 480, h: 270, fps: 15, crop: false })]
  };
  const STYLES = {
    '흰색 + 검은 테두리': { fill: 'solid', color: '#ffffff', fillOp: 1, strokeOn: true, stroke: '#1b1b1f', strokeW: 5, stroke2On: false, glowOn: false, shadowOn: true, shadowColor: '#000000', shadowOp: 0.35 },
    '금색': { fill: 'grad', gradDir: 'v', color: '#fffbe0', color2: '#f2b233', color3: '#a8690a', fillOp: 1, strokeOn: true, stroke: '#3b2500', strokeW: 4, stroke2On: false, glowOn: true, glow: '#ffd76a', glowSpread: 18, glowStr: 0.6, shadowOn: true },
    '은색': { fill: 'grad', gradDir: 'v', color: '#ffffff', color2: '#b9c2cf', color3: '#6b7686', fillOp: 1, strokeOn: true, stroke: '#1d232c', strokeW: 4, stroke2On: false, glowOn: false, shadowOn: true },
    '피': { fill: 'grad', gradDir: 'v', color: '#ff5a4a', color2: '#7a0606', color3: '', fillOp: 1, strokeOn: true, stroke: '#1a0000', strokeW: 4, stroke2On: false, glowOn: true, glow: '#b30000', glowSpread: 22, glowStr: 1, shadowOn: true },
    '네온': { fill: 'solid', color: '#ffffff', fillOp: 1, strokeOn: true, stroke: '#19e6ff', strokeW: 2, stroke2On: false, glowOn: true, glow: '#19e6ff', glowSpread: 30, glowStr: 2, shadowOn: false },
    '수상한 보라': { fill: 'grad', gradDir: 'v', color: '#f1d9ff', color2: '#8a3ffc', color3: '', fillOp: 1, strokeOn: true, stroke: '#1a0630', strokeW: 4, stroke2On: false, glowOn: true, glow: '#8a3ffc', glowSpread: 26, glowStr: 1.2, shadowOn: false },
    '팝': { fill: 'grad', gradDir: 'h', color: '#ff5fa2', color2: '#ffd23f', color3: '#3fd0ff', fillOp: 1, strokeOn: true, stroke: '#ffffff', strokeW: 4, stroke2On: true, stroke2: '#2a2a3a', stroke2W: 4, glowOn: false, shadowOn: true, shadowOp: 0.5, shadowBlur: 0, shadowX: 4, shadowY: 4 },
    '고스트': { fill: 'solid', color: '#dff6ff', fillOp: 0.35, strokeOn: true, stroke: '#bfeaff', strokeW: 1.5, stroke2On: false, glowOn: true, glow: '#9fdcff', glowSpread: 30, glowStr: 1.5, shadowOn: false },
    '먹 (밝은 배경용)': { fill: 'solid', color: '#16161a', fillOp: 1, strokeOn: false, stroke2On: false, glowOn: false, shadowOn: true, shadowColor: '#000000', shadowOp: 0.25, shadowBlur: 6, shadowX: 0, shadowY: 2 },
    '속이 빈 글자': { fill: 'solid', color: '#ffffff', fillOp: 0, strokeOn: true, stroke: '#ffffff', strokeW: 1.5, stroke2On: false, glowOn: false, shadowOn: true }
  };

  const ops = PDM.listOps({ K, label: '글자 연출', title: '글자 연출 (APNG)', icon: '✨', prefix: 'text', make, clean: c => { delete c.sheet; delete c.apng; }, itemIcon: x => (x.sheet ? '' : '·'), cmdType: 'textfx' });
  PDM.textfx = { build, mount, capture, shoot, encodeApng, generate, exportStill, exportZip, make, norm, ops, TEMPLATES, STYLES };

  // ---------------- 편집 화면
  const BGS = { check: '투명', '#000000': '검정', '#ffffff': '흰색', '#808080': '회색', image: '이미지…' };
  const CHECK = 'repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 0 0 / 16px 16px';
  PDM.registerEditor({
    id: K, icon: '✨', title: () => '글자 연출 (APNG)',
    match: k => k === K,
    tree: () => store.isOpen ? [ops.treeNode(56)] : [],
    render(key, ctx) {
      const { F, row } = PDM.ui;
      const st = ctx.state = ctx.state || { bg: 'check', tab: 'text', play: true, repeat: true, tg: Object.keys(TEMPLATES)[0] };
      const all = list();
      ops.take(st);
      if (!all.some(x => x.id === st.id)) st.id = (all[0] || {}).id;
      const idx = all.findIndex(x => x.id === st.id), raw = all[idx], p = ['list', idx];
      const head = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' } },
        all.map(x => h('button', { class: 'btn sm' + (x.id === st.id ? ' pri' : ''), onclick: () => { st.id = x.id; ctx.refresh(); } }, `${x.name || x.id}${x.sheet ? '' : ' ·'}`)));
      if (!raw) return h('div', { class: 'editor' }, h('h2', {}, '글자 연출 (APNG)'),
        h('p', { class: 'hint' }, '"전투 개시" 같은 컷인 글자, 장소·시간 자막, 예고편 글자를 CSS 애니메이션으로 만들어 APNG 로 저장합니다. 이벤트 명령 "글자 연출 표시"로 게임 화면에 띄울 수 있습니다.'), ops.bar(null));
      const fx = norm(raw);
      const patch = (label, o) => store.edit(K, label, r => { Object.assign(r.list[idx], o); });
      // ---- 입력 칸 (값이 없으면 기본값을 보여 줌 · 바꾸면 미리보기를 다시 그림)
      const R = { rerender: true };
      const N = (f, label, min, max, step, hint) => F.num(K, [...p, f], Object.assign({ label, min, max, step, def: DEF[f], hint }, R));
      const S = (f, label, opts) => { const s = h('select', { onchange: () => patch(label, { [f]: /^(true|false)$/.test(s.value) ? s.value === 'true' : isFinite(+s.value) && s.value !== '' && typeof DEF[f] === 'number' ? +s.value : s.value }) }, (Array.isArray(opts) ? opts : Object.entries(opts)).map(([v, t]) => h('option', { value: v }, t))); s.value = String(fx[f]); return PDM.ui.field(label, s); };
      const B = (f, label) => { const c = h('input', { type: 'checkbox', checked: !!fx[f], onchange: () => patch(label, { [f]: c.checked }) }); return h('label', { class: 'check', style: { alignSelf: 'flex-end', marginBottom: '6px' } }, c, label); };
      const C = (f, label, allowNone) => { const cur = fx[f] || '', c = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000', style: { width: '40px', padding: 0 } }); c.addEventListener('change', () => patch(label, { [f]: c.value }));
        return PDM.ui.field(label, h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, c, h('code', { style: { fontSize: '11px' } }, cur || '안 씀'), allowNone && cur ? h('button', { class: 'ib', title: '안 쓰기', onclick: () => patch(label, { [f]: '' }) }, '✕') : null)); };
      const seg = (f, label, opts) => PDM.ui.field(label, h('div', { style: { display: 'flex', gap: '2px', flexWrap: 'wrap' } }, Object.entries(opts).map(([v, t]) => h('button', { class: 'btn xs' + (String(fx[f]) === v ? ' pri' : ''), onclick: () => patch(label, { [f]: /^(true|false)$/.test(v) ? v === 'true' : v }) }, t))));
      const chips = (f, label, opts) => h('div', { style: { margin: '4px 0 8px' } }, h('div', { class: 'fl' }, label), h('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '3px' } }, Object.entries(opts).map(([v, t]) => h('button', { class: 'btn xs' + (fx[f] === v ? ' pri' : ''), onclick: () => patch(label, { [f]: v }) }, t))));
      const H3 = t => h('h4', { style: { margin: '12px 0 4px', borderBottom: '1px solid var(--line)', paddingBottom: '2px' } }, t);

      // ---- 미리보기 (멈춘 애니메이션을 직접 시각으로 돌림 → 일시 정지 · 타임라인)
      const pv = h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', overflow: 'hidden', maxWidth: '100%', display: 'inline-block', lineHeight: 0,
        background: st.bg === 'check' ? CHECK : st.bg === 'image' ? `center/cover url(${st.bgImg || ''})` : st.bg } });
      const info = h('span', { class: 'hint' }), tl = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0, style: { flex: '1 1 160px' } }), tlab = h('span', { class: 'hint mono', style: { minWidth: '86px', textAlign: 'right' } });
      const playBtn = h('button', { class: 'btn sm', style: { minWidth: '34px' }, onclick: () => { st.play = !st.play; playBtn.textContent = st.play ? '❚❚' : '▶'; } }, st.play ? '❚❚' : '▶');
      let m = null, t = 0, lastNow = 0, raf = 0, token = (st.token = (st.token || 0) + 1);
      const tick = now => {
        if (!pv.isConnected || st.token !== token) return;
        raf = requestAnimationFrame(tick);
        if (!m) return;
        const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
        const end = m.b.total;
        if (st.play && !st.drag) { t += dt; if (t >= end) { if (st.repeat) t = 0; else { t = end; } } }
        m.seek(Math.min(t, end - 0.001)); tl.value = t / end; tlab.textContent = `${t.toFixed(2)} / ${end.toFixed(2)}초`;
      };
      tl.addEventListener('input', () => { if (m) t = +tl.value * m.b.total; });
      tl.addEventListener('mousedown', () => { st.drag = true; }); tl.addEventListener('mouseup', () => { st.drag = false; }); tl.addEventListener('change', () => { st.drag = false; });
      setTimeout(async () => {
        const avail = Math.max(240, (pv.parentElement ? pv.parentElement.clientWidth : 700) - 4);
        try { m = await mount(raw, pv, Math.min(1, avail / fx.w)); } catch (e) { info.textContent = '미리보기 오류: ' + e.message; return; }
        info.textContent = `길이 ${m.b.total.toFixed(2)}초 · ${Math.round(m.b.total * num(fx.fps, 20))}프레임 · ${fx.w}×${fx.h}px`;
        lastNow = performance.now(); raf = requestAnimationFrame(tick);
      }, 0);
      const bar = h('div', { style: { height: '4px', background: 'var(--line)', borderRadius: '2px', marginTop: '6px', display: 'none' } }, h('div', { style: { height: '100%', width: '0', background: 'var(--accent, #7a5cff)', borderRadius: '2px' } }));
      const result = h('div', { class: 'hint', style: { marginTop: '6px' } }, raw.sheet ? `게임용 시트: ${raw.sheet.png} (${raw.sheet.frames}프레임 · ${raw.sheet.w}×${raw.sheet.h}px) · APNG: ${raw.apng || ''}` : '아직 게임용으로 만들지 않았습니다 — "APNG 내보내기"를 눌러야 게임에서 쓸 수 있습니다. 설정을 바꾼 뒤에도 다시 눌러 주세요.');
      const out = h('div', { style: { marginTop: '6px' } });
      let cancelled = false;
      const run = async (fn, btns) => {
        btns.forEach(b => { b.disabled = true; }); bar.style.display = ''; cancelled = false; stopBtn.style.display = '';
        try {
          const r = await fn(raw, f => { bar.firstChild.style.width = Math.round(f * 100) + '%'; }, () => cancelled);
          out.replaceChildren(h('div', { class: 'hint' }, `저장했습니다 — ${r.n}프레임 · ${r.w}×${r.h}px${r.bytes ? ' · ' + (r.bytes / 1024).toFixed(0) + 'KB' : ''} → ${r.rel}`), r.warn ? h('div', { class: 'hint', style: { color: 'var(--bad)' } }, r.warn) : '',
            r.url ? h('img', { src: r.url, style: { maxWidth: '100%', marginTop: '4px', background: st.bg === 'check' ? CHECK : st.bg === 'image' ? '#222' : st.bg } }) : '',
            pdm.showInFolder ? h('div', {}, h('button', { class: 'btn sm', style: { marginTop: '4px' }, onclick: () => pdm.showInFolder(pdm.join(store.root, r.rel)).catch(e => PDM.log(e.message, 'err')) }, '파일 위치 열기')) : '');
          PDM.log && PDM.log(`글자 연출 「${fx.name}」 저장: ${r.rel}` + (r.sheet ? ` · ${r.sheet.png}` : ''), r.warn ? 'err' : 'ok');
          if (r.sheet) result.textContent = `게임용 시트: ${r.sheet.png} (${r.sheet.frames}프레임 · ${r.sheet.w}×${r.sheet.h}px) · APNG: ${r.rel}`;
        } catch (e) { out.replaceChildren(h('div', { class: 'hint', style: { color: 'var(--bad)' } }, '만들지 못했습니다: ' + e.message)); console.error(e); }
        btns.forEach(b => { b.disabled = false; }); bar.style.display = 'none'; stopBtn.style.display = 'none';
      };
      const stopBtn = h('button', { class: 'btn sm', style: { display: 'none' }, onclick: () => { cancelled = true; } }, '중지');
      const bApng = h('button', { class: 'btn pri', onclick: () => run(generate, eb) }, 'APNG 내보내기 (+ 게임용 시트)'), bStill = h('button', { class: 'btn sm', onclick: () => run(exportStill, eb) }, 'PNG 정지 이미지'), bZip = h('button', { class: 'btn sm', onclick: () => run(exportZip, eb) }, '연번 PNG (ZIP)');
      const eb = [bApng, bStill, bZip];

      // ---- 탭
      const TABS = { text: '텍스트', font: '폰트', motion: '움직임', style: '장식', layout: '배경 · 배치', css: 'CSS' };
      const tabBar = h('div', { style: { display: 'flex', gap: '2px', borderBottom: '2px solid var(--line)', margin: '10px 0 8px' } }, Object.entries(TABS).map(([k, t]) => h('button', { class: 'btn sm' + (st.tab === k ? ' pri' : ''), style: { borderRadius: '6px 6px 0 0' }, onclick: () => { st.tab = k; ctx.refresh(); } }, t)));
      const sizeKey = SIZES.find(z => z[0] === fx.w && z[1] === fx.h);
      const panel = {
        text: () => h('div', {},
          row(F.text(K, [...p, 'name'], Object.assign({ label: '이름' }, R)), PDM.ui.field('id (이벤트 명령에서 고름)', h('input', { type: 'text', value: fx.id, disabled: true }))),
          F.textarea(K, [...p, 'text'], Object.assign({ label: '메인 텍스트 (여러 줄 · 빈 줄 = 다음 쪽)', rows: 3 }, R)),
          row(F.text(K, [...p, 'sub'], Object.assign({ label: '서브 텍스트 (선택)' }, R)), seg('subPos', '서브 위치', { above: '위', below: '아래' })),
          row(seg('vertical', '쓰기 방향', { false: '가로쓰기', true: '세로쓰기' }), seg('align', '정렬', { start: '왼쪽', center: '중앙', end: '오른쪽' })),
          row(N('wrap', '자동 줄바꿈 (한 줄 최대 글자 수, 0 = 안 함)', 0, 60, 1), B('pages', '빈 줄에서 쪽 나누기'), B('shrink', '넘칠 경우 자동으로 축소'))),
        font: () => h('div', {},
          row(S('font', '글꼴', FONTS), S('weight', '굵기', [[400, '400 (Regular)'], [700, '700 (Bold)'], [900, '900 (Black)']]), B('italic', '기울임꼴')),
          fx.font === 'file' || fx.subFont === 'file' ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '4px 0 8px' } },
            h('button', { class: 'btn sm', onclick: async () => { const src = await pdm.openFile('글꼴 파일 선택', ['ttf', 'otf', 'woff', 'woff2']); if (!src) return; const rel = 'assets/fonts/' + pdm.basename(src); try { await pdm.copy(src, pdm.join(store.root, rel)); patch('글꼴 파일', { fontFile: rel }); } catch (e) { PDM.log(e.message, 'err'); } } }, '＋ 글꼴 파일 등록 (TTF / OTF / WOFF)…'),
            h('span', { class: 'hint' }, fx.fontFile || '아직 고르지 않았습니다 — 쓸 수 있는 글꼴 파일인지 라이선스를 확인하세요')) : null,
          row(N('size', '글자 크기 (px)', 12, 400, 1), N('spacing', '자간 (px)', -20, 120, 1), N('lineH', '행간', 0.9, 3.2, 0.05)),
          h('p', { class: 'hint' }, 'PC 에 설치된 글꼴만 고를 수 있습니다 (웹 글꼴은 그림으로 찍을 때 불러올 수 없음). 다른 글꼴은 "등록한 글꼴 파일"로 파일을 넣으세요.'),
          H3('서브 텍스트'),
          row(S('subFont', '서브 폰트', [['', '메인과 같음'], ...FONTS]), S('subWeight', '서브 굵기', [[400, '400 (Regular)'], [700, '700 (Bold)'], [900, '900 (Black)']]), B('subItalic', '기울임꼴')),
          row(N('subSize', '서브 크기 (메인 대비)', 0.1, 0.9, 0.01), N('subSpacing', '서브 자간 (px)', -20, 150, 1), N('subGap', '메인과의 간격 (글자 크기 대비)', 0, 1.5, 0.01)),
          row(B('subColorOn', '서브 텍스트를 다른 색으로'), fx.subColorOn ? C('subColor', '서브 색') : null)),
        motion: () => h('div', {},
          chips('flow', '표시 흐름', FLOW),
          fx.flow === 'scroll' ? row(N('scrollSpeed', '스크롤 속도 (px/초)', 10, 400, 5), B('edgeFade', '화면 끝에서 페이드')) : h('div', {},
            H3('등장'), chips('inFx', '', IN),
            row(S('inDir', '방향 (슬라이드 · 와이프 · 펼치기)', DIRS), N('inDur', '시간 (초)', 0.05, 4, 0.05), N('stagger', fx.flow === 'line' ? '줄마다의 시간차 (초)' : '글자마다의 시간차 (초)', 0, 2, 0.01)),
            row(S('order', '순서', ORDER), S('ease', '움직임 곡선', EASE), N('inStr', '강도', 0.2, 2.5, 0.05)),
            H3('표시 중'),
            row(N('hold', '표시 시간 (초)', 0, 10, 0.1), N('loopStr', '강도', 0.2, 3, 0.05), N('loopDur', '주기 (초)', 0.1, 5, 0.1)), chips('loopFx', '', LOOP),
            H3('퇴장'),
            row(B('outOn', '퇴장 있음')), fx.outOn ? h('div', {}, chips('outFx', '', OUT),
              row(S('outDir', '방향', DIRS), N('outDur', '시간 (초)', 0.05, 4, 0.05), N('outStagger', '글자마다의 시간차 (초)', 0, 0.6, 0.01)),
              row(S('outOrder', '순서', ORDER), S('outEase', '움직임 곡선', EASE), N('outStr', '강도', 0.2, 2.5, 0.05))) : null),
          H3('타이밍'),
          row(S('subIn', '서브 텍스트 등장', SUBIN), N('subDelay', '서브 등장 (메인 등장 완료 후 시간차)', -2, 2, 0.05), N('pre', '시작 전 공백 (초)', 0, 3, 0.05), N('post', '종료 후 공백 (초)', 0, 5, 0.05)),
          h('p', { class: 'hint' }, '"(전체)"가 붙은 등장·퇴장은 글자 전체가 한 덩어리로 움직입니다. 쪽이 여러 개면 쪽마다 등장 → 표시 → 퇴장을 차례로 합니다.')),
        style: () => h('div', {},
          h('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '6px' } }, h('span', { class: 'hint', style: { alignSelf: 'center' } }, '프리셋:'), Object.entries(STYLES).map(([n, o]) => h('button', { class: 'btn xs', onclick: () => patch('꾸밈 프리셋: ' + n, o) }, n))),
          H3('글자 채우기'),
          row(seg('fill', '채우기', { solid: '단색', grad: '그라데이션' }), C('color', '색'), fx.fill === 'grad' ? C('color2', '색 2') : null, fx.fill === 'grad' ? C('color3', '색 3', true) : null,
            fx.fill === 'grad' ? seg('gradDir', '방향', { v: '세로 (한 줄마다)', h: '가로 (전체)', d: '대각선 (전체)' }) : null, N('fillOp', '채우기 불투명도', 0, 1, 0.01)),
          H3('테두리'),
          row(B('strokeOn', '테두리'), fx.strokeOn ? C('stroke', '색') : null, fx.strokeOn ? N('strokeW', '굵기', 0.5, 30, 0.5) : null, B('stroke2On', '바깥 테두리'), fx.stroke2On ? C('stroke2', '색') : null, fx.stroke2On ? N('stroke2W', '굵기', 0.5, 40, 0.5) : null),
          H3('그림자 · 광채'),
          row(B('shadowOn', '그림자'), fx.shadowOn ? C('shadowColor', '색') : null, fx.shadowOn ? N('shadowOp', '농도', 0, 1, 0.01) : null, fx.shadowOn ? N('shadowBlur', '흐림', 0, 80, 1) : null, fx.shadowOn ? N('shadowX', '가로 어긋남', -60, 60, 1) : null, fx.shadowOn ? N('shadowY', '세로 어긋남', -60, 60, 1) : null),
          row(B('glowOn', '광채 (글로우)'), fx.glowOn ? C('glow', '색') : null, fx.glowOn ? N('glowSpread', '퍼짐', 2, 150, 1) : null, fx.glowOn ? N('glowStr', '강도', 0.2, 3, 0.05) : null),
          row(C('noise1', '노이즈 색 1 (글리치)'), C('noise2', '노이즈 색 2'))),
        layout: () => h('div', {},
          chips('deco', '장식', DECO),
          fx.deco !== 'none' ? h('div', {},
            row(C('decoFill', '채우기'), N('decoFillOp', '채우기 농도', 0, 1, 0.01), C('decoLine', '선'), N('decoBorder', '테두리 굵기 (0 = 없음)', 0, 16, 0.5), N('decoPad', '글자와의 여백', 0, 2, 0.01), N('decoRadius', '모서리 둥글기', 0, 1, 0.01)),
            fx.deco === 'tape' ? row(C('decoTape', '테이프'), C('decoStripe', '줄무늬'), N('tapeW', '테이프 굵기', 4, 120, 1), N('tapeSpeed', '테이프가 흐르는 속도 (0 = 멈춤)', 0, 400, 5)) : null,
            row(seg('decoAnim', '장식 등장', { stretch: '늘어나기', fade: '페이드', none: '없음' }), N('decoDur', '장식 애니메이션 시간', 0.1, 2.5, 0.05))) : null,
          H3('배경 (이미지 전체)'), chips('bgMode', '', BGM),
          fx.bgMode !== 'none' ? row(C('bgColor', '색'), N('bgOp', '농도', 0, 1, 0.01), B('bgFade', '글자의 등장·퇴장에 맞춰 페이드')) : null,
          H3('이미지 크기'),
          row(PDM.ui.field('크기', (() => { const s = h('select', { onchange: () => { if (s.value) { const [w, hh] = s.value.split('x').map(Number); patch('이미지 크기', { w, h: hh }); } } }, SIZES.map(z => h('option', { value: z[0] + 'x' + z[1] }, `${z[0]} × ${z[1]} (${z[2]})`)), h('option', { value: '' }, '사용자 지정')); s.value = sizeKey ? sizeKey[0] + 'x' + sizeKey[1] : ''; return s; })()),
            N('w', '너비 (px)', 32, 3840, 1), N('h', '높이 (px)', 32, 3840, 1)),
          h('p', { class: 'hint' }, '게임에서 쓰려면 작게(예: 640 × 180) 만드세요. 게임은 화면 너비 %로 맞춰 띄우고, 프레임을 한 장에 모은 시트가 한 변 4096px 를 넘으면 APNG 만 저장됩니다.'),
          H3('배치'),
          row(PDM.ui.field('위치', h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: '2px' } }, [...Array(9).keys()].map(i => h('button', { class: 'btn xs' + (num(fx.anchor, 4) === i ? ' pri' : ''), style: { width: '22px', height: '22px', padding: 0 }, onclick: () => patch('배치', { anchor: i }) }, '·')))),
            N('padX', '좌우 여백', 0, 400, 1), N('padY', '상하 여백', 0, 400, 1), N('offX', '가로 미세 조정', -800, 800, 1), N('offY', '세로 미세 조정', -800, 800, 1))),
        css: () => h('div', {},
          h('p', { class: 'hint' }, '위 설정으로 만든 CSS 뒤에 덧붙습니다. 구조: .stage › .bg · .anchor › .fit › .page › .wrap(표시 중 효과) › .block(장식 = ::before) › .sub · .text › .glowbox › .line › .ch(글자 하나, --i 순번 · --n 그 줄 글자 수) › .chi. 전체 길이 var(--t). @keyframes 와 ::before/::after 도 쓸 수 있고, 바깥 그림·웹 글꼴(url)은 쓸 수 없습니다.'),
          (() => { const ta = h('textarea', { rows: 8, class: 'mono', style: { width: '100%' }, placeholder: '예)\n.chi{animation:wv 0.8s ease-in-out infinite;animation-delay:calc(var(--i) * 0.08s)}\n@keyframes wv{50%{transform:translateY(-18%)}}' });
            ta.value = fx.css || ''; ta.addEventListener('change', () => PDM.ui.commit(K, [...p, 'css'], ta.value, 'CSS', true)); return ta; })(),
          h('details', {}, h('summary', { class: 'hint' }, '지금 만들어진 CSS · HTML 보기'), h('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '11px', wordBreak: 'break-all' } }, (() => { const b = build(raw, ''); return b.css.trim() + '\n\n' + b.html; })())))
      };
      return h('div', { class: 'editor' },
        h('h2', {}, '글자 연출 (APNG)'), head, ops.bar(raw),
        h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', marginBottom: '8px' } },
          h('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' } }, h('b', { style: { fontSize: '12px', marginRight: '4px' } }, '템플릿'),
            Object.keys(TEMPLATES).map(g => h('button', { class: 'btn xs' + (st.tg === g ? ' pri' : ''), onclick: () => { st.tg = g; ctx.refresh(); } }, g)),
            h('button', { class: 'btn xs', style: { marginLeft: 'auto' }, title: '이름·id 만 남기고 모든 설정을 처음 값으로', onclick: async () => { if (await PDM.ui.confirm('이 글자 연출의 설정을 처음 값으로 되돌릴까요?')) store.edit(K, '초기화', r => { const c = r.list[idx]; r.list[idx] = Object.assign(make(c.id), { name: c.name }); }); } }, '↺ 초기화')),
          h('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '4px' } }, (TEMPLATES[st.tg] || []).map(([n, o]) => h('button', { class: 'btn sm', title: '지금 연출에 이 템플릿을 적용', onclick: () => store.edit(K, '템플릿: ' + n, r => { const c = r.list[idx]; r.list[idx] = Object.assign(make(c.id), o, { name: /^새 글자 연출/.test(c.name || '') ? n : c.name, fileName: c.fileName || '' }); }) }, n)))),
        h('div', {}, pv),
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' } },
          playBtn, h('button', { class: 'btn sm', title: '처음부터', onclick: () => { t = 0; st.play = true; playBtn.textContent = '❚❚'; } }, '⟲'), tl, tlab,
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.repeat !== false, onchange: e => { st.repeat = e.target.checked; } }), '반복 재생'),
          (() => { const s = h('select', { onchange: async () => { if (s.value === 'image') { const f = await pdm.openFile('미리보기 배경 이미지', ['png', 'jpg', 'jpeg', 'webp']); if (!f) { s.value = st.bg; return; } try { st.bgImg = await pdm.readDataURL(f); } catch (e) { PDM.log(e.message, 'err'); return; } } st.bg = s.value; ctx.refresh(); } }, Object.entries(BGS).map(([v, tt]) => h('option', { value: v }, '배경: ' + tt))); s.value = st.bg; return s; })(),
          info),
        tabBar, panel[st.tab] ? panel[st.tab]() : panel.text(),
        h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 10px', marginTop: '14px' } },
          h('b', {}, '내보내기'),
          row(S('fps', 'FPS', [12, 15, 20, 24, 30, 60].map(v => [v, String(v)])),
            PDM.ui.field('루프', (() => { const s = h('select', { onchange: () => patch('루프', { loop: s.value === 'once' ? 1 : s.value === 'inf' ? 0 : Math.max(2, num(fx.loop, 3) > 1 ? fx.loop : 3) }) }, [['once', '1회 재생 (마지막 상태에서 정지)'], ['inf', '계속 반복'], ['count', '횟수 지정']].map(([v, tt]) => h('option', { value: v }, tt))); s.value = num(fx.loop, 1) === 0 ? 'inf' : num(fx.loop, 1) === 1 ? 'once' : 'count'; return s; })()),
            num(fx.loop, 1) > 1 ? N('loop', '횟수', 2, 999, 1) : null,
            F.text(K, [...p, 'fileName'], { label: '파일 이름 (비우면 id)', placeholder: fx.id }), B('crop', '투명한 여백을 자동으로 잘라내기')),
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' } }, bApng, bStill, bZip, stopBtn),
          h('p', { class: 'hint' }, '파일은 프로젝트의 assets/fx 폴더에 저장됩니다. 게임에서는 이벤트 명령 "글자 연출 표시"로 한 번 재생하고 사라집니다 (게임은 APNG 대신 함께 저장되는 프레임 시트를 씁니다). 배경을 넣었거나 여백 자르기를 끄면 이미지 전체 크기로 저장됩니다.'),
          bar, result, out));
    }
  });
})();
