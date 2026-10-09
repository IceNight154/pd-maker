# PDMaker 에디터 디자인 시스템

에디터(`editor/renderer`)의 모든 화면이 함께 쓰는 **토큰 · 컴포넌트 · 아이콘** 규칙.
눈으로 보기: `editor/renderer/styleguide.html` (브라우저로 열거나 웹 모드 서버에서 — 어둡게/밝게 전환 가능).

- 성격: **작업 도구(Operate)**. 촘촘하고 줄이 맞는 IDE. 꾸밈보다 "어디에 뭐가 있는지 바로 아는 것"이 먼저.
- 세계관이 빌려주는 것: 보라 강조색 · 픽셀 로고 · 게임 그림 미리보기의 어두운 무대(`--stage`). 컨트롤 모양은 표준 웹 컨트롤 그대로.
- 기준 자료: Impeccable(Operate 모드 · craft floor · extract 절차), UI/UX Pro Max(`--density 8` 데이터 밀집 대시보드 · 포커스 · 대비 · 이모지 아이콘 금지 · 모션 줄이기).

## 1. 파일

| 파일 | 내용 |
|---|---|
| `css/app.css` | 1 토큰 → 2 바탕 → 4 컴포넌트 → 5 셸 → 6 시작 화면 → 7 편집기별 → 8 유틸리티 (맨 위 주석에 순서) |
| `js/icons.js` | 아이콘 한 벌 `PDM.icon(name, cls)` · `PDM.iconFor(이모지·기호)` |
| `js/theme.js` | 테마 모드(system · light · dark) · 강조색 — 그대로 |
| `styleguide.html` | 살아 있는 견본 (토큰 · 버튼 · 입력 칸 · 상자 · 셸 · 아이콘) |

## 2. 토큰

### 색 (테마마다 값이 다름 — `:root` 어두움, `[data-theme=light]` 밝음)

| 토큰 | 쓰는 곳 |
|---|---|
| `--bg` · `--bg2` · `--bg3` · `--bg4` | 표면 4단계: 작업 공간 · 패널/카드 · 입력 칸/버튼 · 강한 hover/선택. 이 순서로만 쌓는다 |
| `--line` · `--line-strong` | 테두리 · hover 테두리 |
| `--fg` · `--mute` · `--dim` | 글자 3단계 (본문 · 보조 · 설명/개수). **모두 패널 바탕에서 4.5:1 이상** (`--dim` 어두움 3.0 → 4.5, 밝음 3.5 → 5.0 으로 올림) |
| `--accent` · `--accent2` · `--accent-soft` · `--accent-line` | 강조(조작 · 선택만) · 눌린 버튼 · 선택 바탕 · hover 테두리 |
| `--good` `--warn` `--bad` `--gold` `--info` (+ `-bg`) | 상태. 뜻이 있을 때만 |
| `--stage` · `--check-a/b` · `--code-*` · `--graph-*` | 게임 그림 무대 · 투명 체크무늬 · 코드 칸 · 맵 그래프 |

### 크기

| 묶음 | 토큰 |
|---|---|
| 간격 | `--sp-1` 2 · `-2` 4 · `-3` 6 · `-4` 8 · `-5` 10 · `-6` 12 · `-7` 16 · `-8` 20 · `-9` 24 · `-10` 32 (px) |
| 글자 | `--fs-2xs` 10 배지 · `--fs-xs` 11 칸 이름/설명/패널 제목 · `--fs-sm` 12 표/목록/작은 버튼 · `--fs-md` 13 본문 · `--fs-lg` 15 섹션 · `--fs-xl` 18 화면 제목 · `--fs-2xl` 24 시작 화면 |
| 줄 간격 · 굵기 | `--lh-tight` 1.25 · `--lh` 1.45 · `--lh-loose` 1.6 · `--fw-med` 500 · `--fw-bold` 600 |
| 모서리 | `--r-xs` 3 · `--r-sm` 4 (컨트롤) · `--r` 6 (상자) · `--r-lg` 8 (카드 · 창) · `--r-pill` |
| 높이 | `--ctl-h` 28 (버튼 · 입력 칸 · 고르기 공통) · `--ctl-h-sm` 24 · `--ctl-h-xs` 20 · `--row-h` 26 (목록 · 메뉴 줄) · `--bar-h` 34 (패널 제목 = 탭 줄 — 세 칸의 윗줄이 맞음) |
| 그림자 | `--e-1` 살짝 · `--e-2` 메뉴/알림/목록 상자 · `--e-3` 창 |
| 모션 | `--dur-fast` .12s · `--dur` .18s · `--ease`. `prefers-reduced-motion` 이면 모두 끔 |

## 3. 컴포넌트

| 이름 | 클래스 | 규칙 |
|---|---|---|
| 버튼 | `.btn` + `.pri` `.ghost` `.danger` (`.solid`) `.add` `.on` · 크기 `.sm` `.xs` | 높이는 입력 칸과 같음. 한 화면에 `.pri` 는 하나 |
| 도구 버튼 | `.tool` (= `.btn` 모양) · 도구 모음 `.tb` (`.icon` `.play` `.stop`) · 아이콘 버튼 `.ib` | 아이콘만 있는 버튼은 `title`(+ `aria-label`) 필수 |
| 칩 | `.chips > .chip(.on)` | 고르기 · 필터 |
| 입력 칸 | `input` `select` `textarea` · `.field > .fl + 칸 + .hint` · `.row` (가로 묶음) · `.check` | 포커스 = 강조색 테두리 + `--accent-soft` 고리 |
| 섹션 | `.sec > .sec-head + .sec-body` (`.closed`) | 편집 화면의 기본 묶음 |
| 상자 | `.box` · `.res-bar` · `.card` | |
| 목록 | `.listed > .li(.compact) > .li-body + .li-tools` | |
| 배지 | `.badge` + `accent` `good` `warn` `bad` `gold` `info` | |
| 표 | `table.grid` (머리 고정 · 줄 hover) · `table.tbl` | |
| 메뉴 · 창 · 알림 | `.ctx` `.ctx-i` · `.modal-bg > .modal > .modal-head/.modal-body/.modal-foot` · `#toast` | 창은 살짝 떠오르며 나타남 |
| 단축키 | `<kbd>` | |

**선택 표시는 한 가지**: 강조색 2px 줄(rail) + `--accent-soft` 바탕 — 리소스 목록(`.tn.sel`) · 이벤트 명령(`.cmd.sel`) · 최근 프로젝트 hover. 탭은 위쪽 줄(`.tab.on`).
**포커스**: 키보드로 옮길 때만 `:focus-visible` 고리(강조색 2px). 마우스로 누를 때는 안 보임.

## 4. 유틸리티 (편집기 코드의 짧은 배치)

편집기 코드가 `h('div', { style: { display: 'flex', gap: '6px' … } })` 처럼 쓰던 인라인 style 을 클래스로 옮겼다 (831개 중 459개 — 너비 · 위치처럼 그 화면에만 맞는 값은 그대로 둠).

| 종류 | 클래스 |
|---|---|
| 배치 | `.flex` · `.hstack` (가로 + 가운데 + 간격 6) · `.vstack` · `.wrap` · `.items-*` · `.justify-between` · `.grow` · `.min-0` · `.flex-none` · `.self-*` |
| 간격 | `.gap-0~7` · `.mt-1~8` · `.mb-1~7` · `.ml-1~6` `.ml-auto` · `.mr-2~4` · `.my-1~4` · `.m-0` · `.p-0` `.p-4` `.p-5` (숫자 = `--sp-N`) |
| 글자 | `.fs-2xs~lg` · `.fw-bold` · `.c-mute` `.c-dim` `.c-bad` `.c-warn` `.c-good` `.c-gold` `.c-accent` · `.nowrap` `.pre-wrap` `.truncate` · `.ta-*` |
| 기타 | `.pointer` · `.pixelated` · `.w-full` · `.sr-only` |

- 유틸리티는 CSS **맨 끝**. 간격 · 글자 크기 · 배치 보조는 `!important` (예전 인라인 style 과 같은 힘 — 컴포넌트 규칙보다 앞섬).
  `display`(.flex/.hstack) · 색 · 커서 · 너비는 코드가 `el.style` 로 바꾸는 곳이 있어 `!important` 없음.
- 새 코드: **간격 · 색 · 글자 크기는 클래스로**, 그 화면에만 의미 있는 크기(`width: '70px'` 등)만 인라인으로.

## 5. 아이콘

- 24×24 선 그림 한 벌: 도구 모음 전용 그림(예전 `app.js ICON`) + [Lucide](https://lucide.dev) 일부(ISC 라이선스). 굵기 1.8, 글자색을 따름.
- `PDM.icon('gift')` → `<svg class="ico">` (`.lg` 20 · `.xl` 28). 도구 모음은 `PDM.icon(name, 'tbi')`.
- 리소스 목록 · 탭 · 그림 관리 옆 칸의 아이콘은 **편집기가 적어 둔 이모지 · 기호(🎁 ⚙ ▦ ★ …)를 `PDM.iconFor` 가 같은 SVG 로 바꿔 그림** (`GLYPH` 표). 편집기 코드는 그대로이고, 표에 없는 글자(게임 그림 칸 ▫ ▪ 등)는 글자 그대로.
- 새 아이콘: `js/icons.js` 의 `LUCIDE` 에 Lucide SVG 안쪽을 붙이고, 이모지로 쓰는 곳이 있으면 `GLYPH` 에 짝을 더함.

## 6. 시작 화면 (대시보드)

프로젝트를 열기 전의 첫 화면: 로고 + 한 줄 소개 · 웹 모드 알림 · 왼쪽 "시작하기"(새 프로젝트(주요) · 열기 · 가져오기, 단축키 표시) + "자주 쓰는 단축키"(사용자가 바꾼 키를 그대로 보여 줌) · 오른쪽 "최근 프로젝트"(폴더 아이콘 · 이름 · 경로, 줄에 마우스를 올리면 위로/이름/경로/삭제, Enter 로 열기, 폴더가 없어진 항목 표시) · 비었을 때 안내. 860px 보다 좁으면 한 줄.

## 7. 확인

- 웹 모드 + Playwright: 시작 화면 · 프로젝트 설정 · 맵 그래프 · 영웅 · 아이템 · 맵 그리기 · 이벤트 · 대사창을 어두움/밝음 두 방식으로 보고, 리소스 75개 편집 화면을 모두 열어 오류 0.
- 실제 Electron 창(제목 표시줄 · OS 강조색)은 아직 손으로 확인하지 않음.
