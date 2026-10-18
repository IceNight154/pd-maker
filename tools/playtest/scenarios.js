// ================================================================
//  화면 환경별 연출 시나리오 (tools/playtest/run.sh 의 단계 목록) — node scenarios.js <환경> → 한 줄에 하나
//    환경: pc 1280×800 · pc-narrow 960×600 · phone-land 1170×540 · phone-port 540×1170 (휴대폰 비율 · 데스크톱 판 창)
//          뒤에 -insets (노치 · 상태 줄 · 내비게이션 바 흉내) · -rot (대사 · 입력 기다리기 도중 창을 돌림) · pc-rotfade (페이드 도중)
//    내용: 페이드 → 전체 일러스트 → 왼쪽 일러스트 → 긴 한국어 대사 → 일러스트 움직이기 → 빈칸 없는 일본어 대사 → 저절로 넘김 → 입력 기다리기(터치)
//          → 효과음 → 일러스트 숨김 → 마지막 대사 → 끝. 단계마다 eval:cutinfo · eval:layout(잘림 검사) · eval:wshot(창 캡처)
//    실제 휴대폰이 아님: 데스크톱(LWJGL3) 판을 휴대폰 비율 창으로 띄운 것 — docs/UI-UNIFICATION-AND-PLATFORM-TESTS.md
// ================================================================
const env = process.argv[2] || 'pc';
const sp = s => s;
const ev = cmds => 'eval:event:' + JSON.stringify(cmds).replace(/,/g, ';');
const LONG = sp('이곳은 오래전에 버려진 하수도입니다. 벽을 따라 흐르는 물소리가 멀리까지 울리고 어둠 속 어딘가에서 무언가가 당신을 지켜보고 있습니다.');
const A = [
  { cmd: 'fade', op: 'out', time: 4, wait: true },
  { cmd: 'illust', slot: 1, image: 'game:splashes/sewers.jpg', pos: 'full', fade: 1, alpha: 60 },
  { cmd: 'fade', op: 'in', time: 4, wait: true },
  { cmd: 'illust', slot: 2, image: 'game:splashes/mage.jpg', pos: 'left', fade: 3, wait: true },
  { cmd: 'text', name: sp('안내자'), text: LONG },
  { cmd: 'illustMove', slot: 2, pos: 'right', time: 4, wait: true },
  { cmd: 'text', name: sp('案内'), text: 'この先は古い下水道です。水の音が遠くまで響き、暗闇の中で何かがあなたを見ています。' },   // 빈칸 없는 긴 대사 (줄바꿈 검사)
  { cmd: 'text', name: sp('안내자'), text: sp('잠시 기다려 주세요.'), auto: 15 },   // 저절로 넘김
  { cmd: 'waitInput' },
  { cmd: 'sound', kind: 'se', file: 'game:sounds/item.mp3' },
  { cmd: 'illustHide', slot: 0, fade: 3 },
  { cmd: 'text', name: sp('안내자'), text: sp('행운을 빕니다.') }];
const SIZES = { pc: [1280, 800], 'pc-narrow': [960, 600], 'phone-land': [1170, 540], 'phone-port': [540, 1170] };
if (env === 'regress') {   // 예전 동작 회귀: 이벤트 둘 = 차례로 · 한 번 누르면 한 줄 · 대사 중 맵을 눌러도 영웅이 안 움직임 · 이벤트 중 저장 → 불러오기 = 깨끗한 상태
  const T = t => ({ cmd: 'text', name: '시험', text: t, speed: 'instant' });
  console.log(['start:WARRIOR', 'wait:2', 'close', 'eval:winsize,1280,800', 'wait:2', 'eval:uisize,2', 'wait:2',
    ev([T('A1'), T('A2')]), ev([T('B1')]), 'wait:2', 'eval:cutinfo',
    'eval:touch,640,300', 'wait:1', 'eval:cutinfo',          // 한 번 누름 → A2 (A1 → A2, 두 줄 넘어가지 않음)
    'eval:touch,100,100', 'wait:2', 'eval:cutinfo',          // A2 닫힘 → 다음 이벤트 B1 (대기열에서)
    'eval:touch,1200,700', 'wait:2', 'eval:cutinfo', 'info',  // 끝 · 영웅 자리
    ev([{ cmd: 'fade', op: 'out', time: 3, wait: true }, { cmd: 'illust', slot: 3, image: 'game:splashes/rogue.jpg', pos: 'center', fade: 1 }, T('저장 전')]), 'wait:3', 'eval:cutinfo',
    'reload', 'wait:2', 'eval:cutinfo', 'info'].join('\n'));
  process.exit(0);
}
const [W, H] = SIZES[env.replace(/-insets$|-rot$|-rotfade$/, '')];
if (env.endsWith('-rotfade')) {   // 화면 어둡게(4초) 도중에 창 크기 바꿈 → 페이드 · 다음 대사가 이어지는지
  const B = [{ cmd: 'fade', op: 'out', time: 100, wait: true }, { cmd: 'wait', turns: 30 }, { cmd: 'text', name: '안내자', text: '어둠이 걷힙니다.' }, { cmd: 'fade', op: 'in', time: 5, wait: true }, { cmd: 'text', name: '안내자', text: '끝.' }];
  console.log(['start:WARRIOR', 'wait:2', 'close', `eval:winsize,${W},${H}`, 'wait:2', 'eval:uisize,2', 'wait:2', ev(B), 'wait:1', 'eval:cutinfo', `eval:winsize,${H},${W}`, 'wait:1', 'eval:cutinfo', 'eval:wshot,' + env + '-mid', 'wait:1', 'eval:cutinfo', 'wait:9', 'eval:cutinfo', 'eval:cutinfo', 'eval:layout', 'eval:wshot,' + env + '-text', 'eval:adv', 'eval:adv', 'wait:2', 'eval:cutinfo', 'eval:adv', 'eval:adv', 'wait:2', 'eval:cutinfo', 'eval:wshot,' + env + '-end'].join('\n'));
  process.exit(0);
}
const steps = ['start:WARRIOR', 'wait:2', 'close', `eval:winsize,${W},${H}`, 'wait:2'];
// 인터페이스 크기: 휴대폰 기본 0 · 데스크톱 기본 2 (설정은 작업 폴더의 home 에 남으므로 환경마다 정함)
steps.push('eval:uisize,' + (env.startsWith('phone') ? 0 : 2), 'wait:2');
if (env.endsWith('-insets')) steps.push(W > H ? 'eval:insets,90,0,90,48' : 'eval:insets,0,96,0,72', 'wait:2');
steps.push('eval:cutinfo', 'eval:wshot,' + env + '-0-map', 'wait:1', ev(A), 'wait:3',
  'eval:cutinfo', 'eval:layout', 'eval:wshot,' + env + '-1-dialogue', 'wait:1');
if (env.endsWith('-rot')) steps.push(`eval:winsize,${H},${W}`, 'wait:3', 'eval:cutinfo', 'eval:layout', 'eval:wshot,' + env + '-1b-rotated', 'wait:1');
steps.push('eval:adv', 'wait:2', 'eval:cutinfo', 'eval:layout', 'eval:wshot,' + env + '-2-moved-cjk', 'wait:1', 'eval:adv', 'wait:5',
  'eval:cutinfo', 'eval:layout',   // 저절로 넘김 뒤 → 입력 기다리기
  ...(env.endsWith('-rot') ? [`eval:winsize,${W},${H}`, 'wait:3', 'eval:cutinfo', 'eval:layout'] : []),   // 입력 기다리는 중에 다시 돌림
  `eval:touch,${Math.round(W / 2)},${Math.round(H / 3)}`, 'wait:5', 'eval:cutinfo', 'eval:layout', 'eval:wshot,' + env + '-3-end', 'wait:1',
  'eval:adv', 'eval:adv', 'wait:2', 'eval:cutinfo', 'info', 'eval:wshot,' + env + '-4-after', 'wait:1');
console.log(steps.join('\n'));
