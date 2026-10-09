// ================================================================
//  모션 랩 예시 — 웹 모션 24종 (등장 01–08 · 스크롤 연동 09–16 · 고정 · 전환 · 내비게이션 17–24)
//    게임 그림은 스크롤이 없으므로 "스크롤 연동"은 시간이 스크롤 대신 진행을 끌고 감 (같은 움직임을 정해진 길이로 반복).
//    모두 CSS + HTML · 바깥 그림 없이 그라데이션 · 도형으로 그림. 길이 = 프레임 수 ÷ 초당 프레임 = 애니메이션 길이 (끊김 없이 반복).
//    animation-fill-mode both + 끝 모습 유지 구간 → 반복할 때 처음으로 돌아가며 다시 등장.
//    PDM.MOTION_PRESET_GROUPS = [[그룹 이름, [키 …]]] · PDM.MOTION_WEB_PRESETS = { 키: { name, desc, lang, w, h, frames, fps, html, code, pixel } }
// ================================================================
(function () {
  const BG = '.fx{background:#231b3b;font:8px/1.25 monospace;color:#dcd5ef}\n';
  // 그라데이션으로 그린 풍경 (마스크 리빌 · 스크롤 줌 · 패럴랙스의 "이미지")
  const SCENE = 'background:radial-gradient(circle at 72% 34%,#ffe27a 0 6px,#ffd23f55 7px 9px,transparent 10px),radial-gradient(ellipse 60% 40% at 25% 100%,#2c2350 98%,transparent),radial-gradient(ellipse 70% 45% at 85% 100%,#3a2d66 98%,transparent),linear-gradient(#ff9a6b,#ff6f8a 45%,#6a45d6 75%,#231b3b)';
  const lines = (n, cls) => Array.from({ length: n }, (_, i) => `<i class="${cls || 'ln'}" style="--w:${[90, 70, 82, 60, 88, 74, 66, 92, 58, 80][i % 10]}%"></i>`).join('');
  const LN = '.ln{display:block;height:3px;margin:4px 0;width:var(--w);background:#4b3f73;border-radius:1px}\n';
  const P = (name, desc, o) => Object.assign({ name, desc, lang: 'css', w: 96, h: 48, frames: 24, fps: 12, html: '', pixel: {} }, o);

  const W = {
    // ---------------- 1. 등장 애니메이션 (01–08)
    w01: P('01 페이드 인', '부드럽게 나타남', { html: '<div class="card">PDMAKER</div>', code: BG +
`.card{position:absolute;left:12px;top:12px;width:72px;height:24px;background:#4b3f73;border:1px solid #a58bff;color:#ffe27a;font:bold 10px monospace;display:flex;align-items:center;justify-content:center;
  animation:in 2s ease-out infinite both}
@keyframes in{0%{opacity:0}40%,100%{opacity:1}}` }),
    w02: P('02 슬라이드 인', '옆에서 미끄러져 들어옴', { html: '<div class="card">PDMAKER</div>', code: BG +
`.card{position:absolute;left:12px;top:12px;width:72px;height:24px;background:#4b3f73;border:1px solid #a58bff;color:#ffe27a;font:bold 10px monospace;display:flex;align-items:center;justify-content:center;
  animation:in 2s cubic-bezier(.2,.8,.2,1) infinite both}
@keyframes in{0%{transform:translateX(-96px)}40%,100%{transform:none}}` }),
    w03: P('03 스태거', '시간차를 두고 차례로 나타남', { html: [0, 1, 2, 3, 4].map(i => `<i class="it" style="--i:${i}"></i>`).join(''), code: BG +
`.it{position:absolute;left:10px;width:76px;height:5px;background:#a58bff;border-radius:1px;top:calc(5px + var(--i) * 8px);
  animation:in 2s cubic-bezier(.2,.8,.2,1) infinite both;animation-delay:calc(var(--i) * .12s)}
@keyframes in{0%{opacity:0;transform:translateX(-14px)}35%,100%{opacity:1;transform:none}}` }),
    w04: P('04 텍스트 리빌', '한 글자씩 아래에서 밀려 올라옴', { html: '<div class="t">' + 'REVEAL'.split('').map((c, i) => `<span><b style="--i:${i}">${c}</b></span>`).join('') + '</div>', code: BG +
`.t{position:absolute;left:0;right:0;top:15px;text-align:center;font:bold 14px/16px monospace;color:#ffe27a}
.t span{display:inline-block;overflow:hidden;height:16px;vertical-align:top}
.t b{display:inline-block;animation:up 2s cubic-bezier(.2,.8,.2,1) infinite both;animation-delay:calc(var(--i) * .08s)}
@keyframes up{0%{transform:translateY(100%)}35%,100%{transform:none}}` }),
    w05: P('05 마스크 리빌', '막이 열리듯 그림이 드러남', { html: '<div class="img"></div>', code: BG +
`.img{position:absolute;inset:4px;border-radius:2px;${SCENE};animation:open 2s cubic-bezier(.7,0,.2,1) infinite both}
@keyframes open{0%{clip-path:inset(0 50% 0 50%)}45%,100%{clip-path:inset(0 0 0 0)}}` }),
    w06: P('06 블러 인', '흐릿하다가 점점 선명해짐', { html: '<div class="card">FOCUS</div>', code: BG +
`.card{position:absolute;left:12px;top:12px;width:72px;height:24px;background:#4b3f73;border:1px solid #a58bff;color:#ffe27a;font:bold 10px monospace;display:flex;align-items:center;justify-content:center;
  animation:in 2s ease-out infinite both}
@keyframes in{0%{filter:blur(5px);opacity:0;transform:scale(1.1)}45%,100%{filter:blur(0);opacity:1;transform:none}}`, pixel: {} }),
    w07: P('07 타이프라이터', '한 글자씩 타이핑되듯 나타남 (커서 깜빡임)', { html: '<div class="ty">HELLO, PDM!</div>', code: BG +
`.ty{position:absolute;left:10px;top:19px;font:10px/10px monospace;color:#9fe870;white-space:nowrap;overflow:hidden;width:0;border-right:1px solid #9fe870;
  animation:type 2s steps(11) infinite both,caret .5s steps(1) infinite}
@keyframes type{0%{width:0}55%,100%{width:11ch}}
@keyframes caret{50%{border-right-color:transparent}}` }),
    w08: P('08 카운트업', '숫자가 0부터 올라감 (CSS 변수 @property)', { html: '<div class="num"></div><div class="lb">GOLD</div>', code: BG +
`@property --n{syntax:'<integer>';initial-value:0;inherits:false}
.num{position:absolute;left:0;right:0;top:12px;text-align:center;font:bold 16px monospace;color:#ffe27a;counter-reset:n var(--n);
  animation:cnt 2s cubic-bezier(.2,.8,.2,1) infinite both}
.num::after{content:counter(n)}
.lb{position:absolute;left:0;right:0;top:32px;text-align:center;color:#a58bff}
@keyframes cnt{0%{--n:0}60%,100%{--n:999}}` }),

    // ---------------- 2. 스크롤 연동 → 시간으로 (09–16)
    w09: P('09 스크롤 연동 (읽기 진행률)', '내려가는 만큼 위의 진행 막대가 참', { w: 128, h: 72, frames: 36, html: '<div class="page">' + lines(14) + '</div><div class="bar"></div>', code: BG + LN +
`.page{position:absolute;left:10px;right:10px;top:8px;animation:sc 3s linear infinite both}
.bar{position:absolute;left:0;top:0;height:3px;background:#ffe27a;animation:fill 3s linear infinite both}
@keyframes sc{0%{transform:none}90%,100%{transform:translateY(-58px)}}
@keyframes fill{0%{width:0}90%,100%{width:100%}}` }),
    w10: P('10 패럴랙스', '먼 배경 · 중간 · 앞이 다른 속도로 흐름 (이어 붙임)', { w: 128, h: 72, frames: 36, html: '<i class="sky"></i><i class="far"></i><i class="mid"></i><i class="near"></i>', code: BG +
`.fx i{position:absolute;left:0;right:0;bottom:0;display:block}
.sky{top:0;background:radial-gradient(circle at 75% 30%,#ffe27a 0 5px,transparent 6px),linear-gradient(#ff9a6b,#ff6f8a 50%,#6a45d6)}
.far{height:34px;background:radial-gradient(circle at 50% 100%,#4b3f73 0 22px,transparent 23px) 0 100%/64px 34px repeat-x;animation:p1 3s linear infinite}
.mid{height:22px;background:radial-gradient(circle at 50% 100%,#2c2350 0 14px,transparent 15px) 0 100%/32px 22px repeat-x;animation:p2 3s linear infinite}
.near{height:8px;background:repeating-linear-gradient(90deg,#1a1430 0 8px,#241c40 8px 16px);animation:p3 3s linear infinite}
@keyframes p1{to{background-position:-64px 100%}}
@keyframes p2{to{background-position:-128px 100%}}
@keyframes p3{to{background-position:-192px 0}}` }),
    w11: P('11 스크롤 줌', '그림이 커지며 화면 전체를 채움', { w: 128, h: 72, frames: 36, html: '<div class="cap">SCROLL</div><div class="img"></div>', code: BG +
`.cap{position:absolute;left:0;right:0;top:6px;text-align:center;color:#a58bff;animation:cap 3s linear infinite both}
.img{position:absolute;inset:0;${SCENE};border-radius:10px;animation:zoom 3s cubic-bezier(.5,0,.3,1) infinite both}
@keyframes zoom{0%{transform:scale(.35) translateY(18px);border-radius:10px}75%,100%{transform:none;border-radius:0}}
@keyframes cap{0%{opacity:1}30%,100%{opacity:0}}` }),
    w12: P('12 이미지 시퀀스', '연속된 그림을 한 장씩 넘겨 재생 (튀는 공)', { frames: 8, fps: 10, html: '<div class="view"><div class="strip">' + [2, 7, 15, 27, 31, 27, 15, 7].map(y => `<i style="--y:${y}"></i>`).join('') + '</div></div><div class="lb">1 → 8</div>', code: BG +
`.view{position:absolute;left:30px;top:4px;width:36px;height:40px;overflow:hidden;border:1px solid #4b3f73;background:#2c2350}
.strip{display:flex;width:800%;height:100%;animation:seq .8s steps(8) infinite}
.strip i{flex:1;position:relative;display:block}
.strip i::before{content:'';position:absolute;left:14px;top:calc(var(--y) * 1px);width:8px;height:8px;border-radius:50%;background:#ffe27a}
.strip i::after{content:'';position:absolute;left:0;right:0;bottom:0;height:1px;background:#a58bff}
.lb{position:absolute;right:4px;bottom:3px;color:#4b3f73}
@keyframes seq{to{transform:translateX(-100%)}}` }),
    w13: P('13 SVG 라인 드로우', '선이 그려지듯 나타남', { html: '<svg width="96" height="48" viewBox="0 0 96 48"><path class="ln2" pathLength="100" d="M6 40 L22 14 L38 32 L54 8 L70 28 L90 12" fill="none" stroke="#7fd3ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>', code: BG +
`svg{position:absolute;left:0;top:0}
.ln2{stroke-dasharray:100;stroke-dashoffset:100;animation:draw 2s ease-in-out infinite both}
@keyframes draw{0%{stroke-dashoffset:100}60%,100%{stroke-dashoffset:0}}` }),
    w14: P('14 텍스트 필', '읽어 내려가듯 글자에 색이 채워짐', { frames: 36, html: '<div class="tf">READ ME<br>SLOWLY</div>', code: BG +
`.tf{position:absolute;left:0;right:0;top:10px;text-align:center;font:bold 12px/15px monospace;color:transparent;
  background:linear-gradient(90deg,#ffe27a 50%,#4b3f73 50%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;
  animation:fill 3s linear infinite both}
@keyframes fill{0%{background-position:100% 0}80%,100%{background-position:0 0}}` }),
    w15: P('15 배경색 트랜지션', '배경색이 부드럽게 바뀜', { frames: 36, html: '<div class="lb">CHAPTER</div>', code: BG +
`.fx{animation:bg 3s linear infinite}
.lb{position:absolute;left:0;right:0;top:20px;text-align:center;font:bold 10px monospace;color:#dcd5ef}
@keyframes bg{0%,100%{background-color:#231b3b}33%{background-color:#1d3b6a}66%{background-color:#5a1f3c}}` }),
    w16: P('16 마키', '글줄이 계속 흐름 (아래 줄은 두 배 빠르게 · 반대로)', { frames: 36, html: '<div class="mq"><span>★ PDMAKER ★ PIXEL DUNGEON </span><span>★ PDMAKER ★ PIXEL DUNGEON </span></div><div class="mq b"><span>· FAST · FASTER · FASTEST </span><span>· FAST · FASTER · FASTEST </span></div>', code: BG +
`.mq{position:absolute;top:12px;left:0;display:flex;white-space:nowrap;font:bold 10px monospace;color:#ffe27a;animation:mq 3s linear infinite}
.mq.b{top:28px;color:#a58bff;animation-duration:1.5s;animation-direction:reverse}
@keyframes mq{to{transform:translateX(-50%)}}` }),

    // ---------------- 3. 고정 · 전환 · 내비게이션 (17–24)
    w17: P('17 스티키', '제목이 위에 닿으면 붙어서 고정됨', { w: 128, h: 72, frames: 36, html: '<div class="page">' + lines(6) + '<div class="gap"></div>' + lines(10) + '</div><div class="hd">SECTION 2</div>', code: BG + LN +
`.page{position:absolute;left:10px;right:10px;top:4px;animation:sc 3s linear infinite both}
.gap{height:14px}
.hd{position:absolute;left:0;right:0;top:0;height:12px;line-height:12px;padding-left:10px;background:#6a45d6;color:#fff;font-weight:bold;animation:stick 3s linear infinite both}
@keyframes sc{0%{transform:none}100%{transform:translateY(-80px)}}
@keyframes stick{0%{transform:translateY(46px)}57.5%,100%{transform:translateY(0)}}` }),
    w18: P('18 핀 고정 + 스크럽', '화면은 고정되고 안의 장면만 진행됨', { w: 128, h: 72, frames: 48, html: '<div class="track"><i class="s1">1</i><i class="s2">2</i><i class="s3">3</i></div><div class="prog"></div>', code: BG +
`.track{position:absolute;left:0;top:0;height:64px;width:300%;display:flex;animation:scrub 4s cubic-bezier(.6,0,.2,1) infinite both}
.track i{flex:1;display:flex;align-items:center;justify-content:center;font:bold 20px monospace;color:#fff}
.s1{background:#6a45d6}.s2{background:#1d6a5a}.s3{background:#8a3a5a}
.prog{position:absolute;left:0;bottom:0;height:8px;background:#ffe27a;animation:pr 4s linear infinite both}
@keyframes scrub{0%,22%{transform:none}33%,55%{transform:translateX(-33.333%)}66%,100%{transform:translateX(-66.666%)}}
@keyframes pr{0%{width:0}90%,100%{width:100%}}` }),
    w19: P('19 스크롤텔링', '글이 지나가는 데 맞춰 옆의 도표가 바뀜', { w: 128, h: 72, frames: 48, html: '<div class="txt">' + lines(18) + '</div><div class="chart"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>', code: BG +
`.ln{display:block;height:3px;margin:4px 0;width:var(--w);background:#4b3f73}
.txt{position:absolute;left:6px;width:56px;top:6px;animation:sc 4s linear infinite both}
.chart{position:absolute;right:6px;top:10px;width:52px;height:52px;border-left:1px solid #a58bff;border-bottom:1px solid #a58bff;display:flex;align-items:flex-end;gap:4px;padding:0 4px}
.chart i{flex:1;display:block;background:#ffe27a}
.b1{animation:h1 4s cubic-bezier(.2,.8,.2,1) infinite both}.b2{animation:h2 4s cubic-bezier(.2,.8,.2,1) infinite both}.b3{animation:h3 4s cubic-bezier(.2,.8,.2,1) infinite both}
@keyframes sc{0%{transform:none}100%{transform:translateY(-70px)}}
@keyframes h1{0%,30%{height:20%}36%,63%{height:70%}69%,100%{height:40%}}
@keyframes h2{0%,30%{height:50%}36%,63%{height:30%}69%,100%{height:90%}}
@keyframes h3{0%,30%{height:80%}36%,63%{height:55%}69%,100%{height:25%}}` }),
    w20: P('20 카드 스택', '카드가 차례로 올라와 겹쳐 쌓임', { w: 128, h: 72, frames: 36, html: [0, 1, 2].map(i => `<i class="cd c${i}" style="--i:${i}">CARD ${i + 1}</i>`).join(''), code: BG +
`.cd{position:absolute;left:24px;width:80px;height:40px;border-radius:3px;display:flex;align-items:center;justify-content:center;font:bold 9px monospace;color:#fff;
  top:calc(10px + var(--i) * 6px);box-shadow:0 -1px #0005;animation:stack 3s cubic-bezier(.2,.8,.2,1) infinite both;animation-delay:calc(var(--i) * .6s)}
.c0{background:#6a45d6}.c1{background:#1d6a5a}.c2{background:#8a3a5a}
@keyframes stack{0%{transform:translateY(72px)}25%,100%{transform:none}}` }),
    w21: P('21 스크롤 스냅', '한 페이지 단위로 딱 멈춤', { w: 128, h: 72, frames: 48, html: '<div class="pages"><i class="p1">PAGE 1</i><i class="p2">PAGE 2</i><i class="p3">PAGE 3</i></div>', code: BG +
`.pages{position:absolute;left:0;right:0;top:0;animation:snap 4s infinite both}
.pages i{display:flex;height:72px;align-items:center;justify-content:center;font:bold 12px monospace;color:#fff}
.p1{background:#6a45d6}.p2{background:#1d6a5a}.p3{background:#8a3a5a}
@keyframes snap{0%,20%{transform:none;animation-timing-function:cubic-bezier(.2,.9,.3,1.15)}30%,53%{transform:translateY(-72px);animation-timing-function:cubic-bezier(.2,.9,.3,1.15)}63%,88%{transform:translateY(-144px);animation-timing-function:cubic-bezier(.6,0,.4,1)}100%{transform:none}}` }),
    w22: P('22 가로 스크롤', '세로로 내리는 동안 내용이 가로로 지나감', { w: 128, h: 72, frames: 48, html: '<div class="row"><i class="a">A</i><i class="b">B</i><i class="c">C</i></div><div class="sb"><i></i></div>', code: BG +
`.row{position:absolute;left:0;top:8px;height:56px;width:300%;display:flex;gap:0;animation:hx 4s cubic-bezier(.5,0,.5,1) infinite both}
.row i{flex:1;margin:0 8px;border-radius:4px;display:flex;align-items:center;justify-content:center;font:bold 20px monospace;color:#fff}
.a{background:#6a45d6}.b{background:#1d6a5a}.c{background:#8a3a5a}
.sb{position:absolute;right:1px;top:2px;bottom:2px;width:3px;background:#2c2350}
.sb i{position:absolute;left:0;right:0;height:20px;background:#a58bff;display:block;animation:th 4s cubic-bezier(.5,0,.5,1) infinite both}
@keyframes hx{0%,8%{transform:none}92%,100%{transform:translateX(-66.666%)}}
@keyframes th{0%,8%{top:0}92%,100%{top:calc(100% - 20px)}}` }),
    w23: P('23 숨김 헤더', '내릴 때 헤더가 숨고, 올릴 때 다시 나타남', { w: 128, h: 72, frames: 48, html: '<div class="page">' + lines(16) + '</div><div class="hd">≡ MENU</div>', code: BG + LN +
`.page{position:absolute;left:10px;right:10px;top:16px;animation:sc 4s ease-in-out infinite both}
.hd{position:absolute;left:0;right:0;top:0;height:12px;line-height:12px;padding-left:6px;background:#6a45d6;color:#fff;font-weight:bold;animation:hide 4s infinite both}
@keyframes sc{0%{transform:none}45%,55%{transform:translateY(-48px)}100%{transform:none}}
@keyframes hide{0%{transform:none}8%,55%{transform:translateY(-12px)}63%,100%{transform:none}}` }),
    w24: P('24 스크롤스파이', '보고 있는 부분에 맞춰 목차 항목이 강조됨', { w: 128, h: 72, frames: 48, html: '<div class="toc"><i class="hl"></i><b>INTRO</b><b>STORY</b><b>BOSS</b></div><div class="body"><div class="sec">' + lines(4) + '</div><div class="sec">' + lines(4) + '</div><div class="sec">' + lines(4) + '</div></div>', code: BG +
`.toc{position:absolute;left:4px;top:8px;width:36px}
.toc b{display:block;position:relative;height:12px;line-height:12px;padding-left:4px;font-weight:normal;color:#a58bff}
.hl{position:absolute;left:0;width:36px;height:12px;background:#4b3f73;border-left:2px solid #ffe27a;box-sizing:border-box;animation:spy 4s cubic-bezier(.3,0,.2,1) infinite both}
.body{position:absolute;left:46px;right:4px;top:0;animation:sc 4s linear infinite both}
.sec{height:30px;padding-top:4px;border-top:1px solid #4b3f73}
.ln{display:block;height:3px;margin:3px 0;width:var(--w);background:#4b3f73}
@keyframes sc{0%{transform:none}100%{transform:translateY(-62px)}}
@keyframes spy{0%,28%{top:0}36%,62%{top:12px}70%,100%{top:24px}}` })
  };
  PDM.MOTION_WEB_PRESETS = W;
  PDM.MOTION_PRESET_GROUPS = [
    ['등장 애니메이션 (01–08)', ['w01', 'w02', 'w03', 'w04', 'w05', 'w06', 'w07', 'w08']],
    ['스크롤 연동 — 시간으로 재생 (09–16)', ['w09', 'w10', 'w11', 'w12', 'w13', 'w14', 'w15', 'w16']],
    ['고정 · 전환 · 내비게이션 (17–24)', ['w17', 'w18', 'w19', 'w20', 'w21', 'w22', 'w23', 'w24']]];
})();
