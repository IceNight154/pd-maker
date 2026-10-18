# PDMaker 에디터 디자인 시스템

에디터(`editor/renderer`)의 모든 화면이 함께 쓰는 **토큰 · 컴포넌트 · 아이콘** 규칙.
눈으로 보기: `editor/renderer/styleguide.html` (브라우저로 열거나 웹 모드 서버에서 — 어둡게/밝게 전환 가능).

- 성격: **작업 도구(Operate)**. 촘촘하고 줄이 맞는 IDE. 꾸밈보다 "어디에 뭐가 있는지 바로 아는 것"이 먼저.
- 세계관이 빌려주는 것: 픽셀 로고 · 게임 그림 미리보기의 어두운 무대(`--stage`). 컨트롤 모양은 표준 웹 컨트롤 그대로.
- 색 (4차 개편): **중성 차콜 표면 + 청록 강조색 하나**. 예전 보라 기운의 바탕 · 보라 강조색을 바꿈 — 맵 타일 · 게임 그림이 UI 색에 묻히지 않게 바탕은 채도 없이, 강조색은 "주요 동작 · 선택 · 포커스"에만. 근거 · 전후 화면: `docs/UI-UNIFICATION-AND-PLATFORM-TESTS.md`.
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
| `--accent` · `--accent2` · `--accent-hover` · `--accent-soft` · `--accent-line` | 강조색(선택 테두리 · 링크 · 아이콘) · 주요 버튼 바탕(흰 글자 4.5:1 이상) · 주요 버튼 hover · 선택 바탕 · hover 테두리 |
| `--focus-ring` (+ `--focus` 그림자) | 키보드 포커스 고리 |
| `--good` `--warn` `--bad` `--gold` `--info` (+ `-bg`) | 상태. **뜻이 있을 때만** (장식 금지) |
| `--cat-1` ~ `--cat-6` | 분류 색 (이벤트 명령 묶음 등) — 상태 색과 겹치지 않음. 예전엔 "스토리" 명령이 빨강(오류색) · "영웅" 명령이 주황(경고색)이라 ⚠ 빈 값 표시와 헷갈렸음 |
| `--map-sel` · `--map-area` | 맵 캔버스 위 선택 · 영역 표시 (JS 가 `PDM.cssVar` 로 읽음) |
| `--stage` · `--check-a/b` · `--code-*` · `--graph-*` | 게임 그림 무대 · 투명 체크무늬 · 코드 칸 · 맵 그래프 |

**역할 이름 대응표** (4차 지시서의 역할 이름 → 이미 있던 토큰. 같은 뜻의 토큰을 새로 만들지 않음)

| 역할 | 토큰 | 어두움 | 밝음 |
|---|---|---|---|
| app-bg (작업 공간) | `--bg` | `#131518` | `#f1f3f5` |
| panel-bg | `--bg2` | `#1a1d21` | `#ffffff` |
| panel-bg-raised · input-bg | `--bg3` | `#23272c` | `#eef0f3` |
| (강한 hover · 눌림) | `--bg4` | `#2e333a` | `#e0e4e9` |
| border-subtle · border-strong | `--line` · `--line-strong` | `#2f343b` · `#454c56` | `#d6dbe0` · `#b5bdc6` |
| text-primary · secondary · muted | `--fg` · `--mute` · `--dim` | 14.6 · 8.0 · 6.0 : 1 (작업 공간 바탕) | 14.9 · 7.4 · 5.1 : 1 |
| accent | `--accent` | `#3cc2b1` | `#0b7468` |
| accent-hover | `--accent-hover` | | |
| accent-selected | `--accent-soft` (+ 강조색 줄/테두리) | | |
| focus-ring | `--focus-ring` | | |
| status-success · warning · error | `--good` · `--warn` · `--bad` | | |
| disabled | `--disabled-opacity` (.4) · 버튼 .45 · 입력 칸 .55 | | |
| 간격 · 모서리 · 전환 시간 | `--sp-*` · `--r-*` · `--dur-fast` `--dur` | | |

대비는 `tools/tests/run.js` 의 "색 체계" 테스트가 css 를 읽어 계산합니다 (두 테마 모두: 글자 · 상태 색 · 분류 색 4.5:1 이상, 주요 버튼 글자 4.5:1, 강조 테두리 3:1, 바탕이 중성색인지, 코드가 쓰는 `var(--…)` 가 모두 정의돼 있는지).

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
| 셸 배치 | `--tree-w` 250 · `--insp-w` 300 · `--bottom-h` 170 (좁은 창 200 · 250 / 낮은 창 96) · `--status-h` 24 · `--split` 4 — 사용자가 끈 크기는 `--treeW` · `--inspW` · `--bottomH`(app.js 가 기억) |
| 비활성 | `--disabled-opacity` .4 (도구 모음 · 상태 줄 패널 버튼) |

## 3. 컴포넌트

| 이름 | 클래스 | 규칙 |
|---|---|---|
| 버튼 | `.btn` + `.pri` `.ghost` `.danger` (`.solid`) `.add` `.on` · 크기 `.sm` `.xs` | 높이는 입력 칸과 같음. 한 화면에 `.pri` 는 하나 |
| 도구 버튼 | `.tool` (= `.btn` 모양) · 도구 모음 `.tb` (`.icon` `.play` `.stop`) · 아이콘 버튼 `.ib` | 아이콘만 있는 버튼은 `title`(+ `aria-label`) 필수 |
| 칩 | `.chips > .chip(.on)` | 고르기 · 필터. 켜짐 = 바탕 + 안쪽 아래 줄 (5차: ✓ 글자 · 굵기를 더하던 방식은 폭이 바뀌어 옆 칩이 밀려 없앰) |
| 입력 칸 | `input` `select` `textarea` · `.field > .fl + 칸 + .hint` · `.row` (가로 묶음) · `.check` | 포커스 = 강조색 테두리 + `--accent-soft` 고리 |
| 섹션 | `.sec > .sec-head + .sec-body` (`.closed`) | 편집 화면의 기본 묶음 |
| 상자 | `.box` · `.res-bar` · `.card` | |
| 목록 | `.listed > .li(.compact) > .li-body + .li-tools` | |
| 배지 | `.badge` + `accent` `good` `warn` `bad` `gold` `info` | |
| 표 | `table.grid` (머리 고정 · 줄 hover) · `table.tbl` | |
| 메뉴 · 창 · 알림 | `.ctx` `.ctx-i` (`.chk` 켜고 끄기 ✓ · `.danger` · `.ctx-h` 묶음 제목) · `.modal-bg > .modal > .modal-head/.modal-body/.modal-foot` · `#toast` | 창은 살짝 떠오르며 나타남 · 버튼 순서는 언제나 [취소] [확인/진행] · 켜고 끄는 메뉴 항목은 `checked` 하나로 (글자 앞 ✓ 를 직접 붙이지 않음) |
| 고르는 카드 | `.selcard(.compact)(.on)` | 퀘스트 · 업적 · 트레일러 장면 · 조합 타일 목록 (예전: 편집기마다 인라인 style) |
| 단축키 | `<kbd>` | |
| 접는 묶음 (5차) | `.pg(.closed) > .pg-head(aria-expanded) + .pg-sub + .pg-body` | 맵 팔레트. 접힘 상태는 `localStorage` 에 (다시 열어도 그대로) |
| 도구 묶음 (5차) | `.tool-grp[role=group][aria-label]` | 맵 도구 줄: 그리기 \| 선택 · 놓기 \| 구역 · 모드. 쓸 수 없는 도구는 `disabled` + 이유를 툴팁에 |
| 레이어 줄 (5차) | `.layer-list > .lay-row(.on)[aria-pressed]` (`.lay-name` `.lay-n`) | 위 → 아래 순서. 편집 대상 = 테두리 + 굵은 이름 + 위 「칠할 곳」 표시 |
| 명령 탭 (5차) | `.tabs-cmd > .chip(.on)[role=tab]` · 미리보기 `.dlg-stage.cmd-pv` | 대사 · 대사 스타일 명령의 내용 · 글꼴 · 출력 · 연출 · 미리보기 |
| 실행 환경 단추 (5차) | `.tb.env-btn` | 고정 폭 11.5em (이름이 바뀌어도 옆 단추가 밀리지 않게, 긴 이름은 … · 전체는 툴팁) |

**세 상태를 구분** (4차): 
- **주요 동작** `.btn.pri` — 꽉 찬 강조색(`--accent2`) + 흰 글자. 한 화면에 하나.
- **선택 · 켜짐** — `--accent-soft` 바탕 + 강조색 줄/테두리 (색만으로 구분하지 않음): 리소스 목록 `.tn.sel`(왼쪽 줄) · 이벤트 명령 `.cmd.sel` · 도구 `.btn.on` `.tool.on`(아래 2px 줄) · 칩 `.chip.on`(✓) · 고르는 카드 `.selcard.on`(왼쪽 줄) · 메뉴 hover(왼쪽 줄) · 탭 `.tab.on`(위쪽 줄). 예전엔 켜진 도구 · 칩 · 메뉴 hover 가 주요 버튼과 같은 꽉 찬 보라라 "누를 버튼"과 "지금 상태"가 구분되지 않았음.
- **위험** `.btn.danger` · 메뉴의 "삭제…" — 평소에도 빨간 글자, hover 때 빨간 바탕. 확인 창(`PDM.ui.confirm`)은 지우기 · 덮어쓰기 글이면 ⚠ + 빨간 "진행" 버튼.
- **알림** `#toast` — 왼쪽 3px 상태 색 줄 + 기호(i ✓ ! ✕). 실패는 5초 · `role=alert`.
**포커스**: 키보드로 옮길 때만 `:focus-visible` 고리(강조색 2px). 마우스로 누를 때는 안 보임.

**밀리지 않는 화면** (5차 — `tools/tests/ui-stability.js` 가 검사):
- 상태에 따라 글이 바뀌는 칸은 **폭 고정**: 상태 줄 `#stDirty` `#stAssets`(15em), 확대 숫자 · 브러쉬 크기 `.tb-num`, 실행 환경 단추. 높이가 내용에 따라 바뀌는 줄은 **높이 고정 + 한 줄 + …** (`.map-info`).
- 켜짐 · 고름 표시는 **폭을 바꾸지 않는 방법**으로(바탕 · 안쪽 줄 · 테두리) — 글자를 더하거나 굵기를 바꾸지 않음.
- 스크롤 칸은 `scrollbar-gutter: stable` (스크롤 막대가 생겨도 폭 그대로).
- 숨김은 `hidden` 속성 — `[hidden] { display: none !important }` 가 `.row` · `.flex` 같은 display 규칙보다 앞섬.
- 탭을 바꿀 때 안쪽 스크롤은 `activate()` 가 기억했다가 되돌림 (새 스크롤 칸은 `INNER` 목록에 추가).
- 밀림을 임시 오프셋 · 강제 새로고침으로 감추지 않음.

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
- 4차: 색 대비 · 토큰 정의 자동 검사(`run.js`), 메뉴 묶음 · 확인 창 · 알림 · 선택/주요 구분 · 좁은 창 이벤트 화면(`ui-editor.js`), 전후 화면을 같은 창 크기로 촬영(`ui-shots.js`, `docs/images/ux4/`).
- 5차: 동작 전후 자리 · 크기 · 스크롤 · 넘침 · 처리기 수(`ui-stability.js` 18), 대사 탭 · 실행 환경(`ui-dialogue.js` 8), 전후 화면 `docs/images/ux5/`.
- 실제 Electron 창(제목 표시줄 · OS 강조색)은 아직 손으로 확인하지 않음. Electron 은 기본값이 "시스템 강조색"이라 Windows · macOS 에서는 OS 강조색이 청록 대신 쓰일 수 있음(보기 → 강조색 → PDMaker 기본).
