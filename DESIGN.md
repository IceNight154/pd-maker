# 픽셀 던전 메이커 (가제) — 설계서

> 기반: Shattered Pixel Dungeon 4.0.0 (`game/shattered-pixel-dungeon-master`). 3.2.0 계열(mod-2 *Witchling Pixel Tower*)에서도 컴파일된다.
> 참고: era(관계 · 감정 · 엔딩), GameMaker(IDE · 리소스 구조 · 조명 · 플러그인), RPG Maker(대사창 · 이벤트 페이지), Defold(파티클)
>
> 이 문서는 **지금 코드가 하는 일**을 적는다. 사용 안내는 [README.md](README.md).
> 표기: `파일.js` / `Class.method` = 구현 위치, "연결 줄" = 설치기가 게임 원본 코드에 넣는 한 줄(§17.2).

## 목차

0. [개요](#0-개요) · 1. [참고 소스 · 명칭 원칙](#1-참고-소스--명칭-원칙) · 2. [에디터 구조](#2-에디터-구조) · 3. [프로젝트 폴더 형식](#3-프로젝트-폴더-형식)
4. [맵](#4-맵) · 5. [빛 · 화면 연출](#5-빛--화면-연출) · 6. [영웅](#6-영웅) · 7. [캐릭터](#7-캐릭터) · 8. [아이템](#8-아이템) · 9. [사운드](#9-사운드)
10. [타이틀 화면](#10-타이틀-화면) · 11. [대사창](#11-대사창) · 12. [그림 · 픽셀 편집기](#12-그림--픽셀-편집기)
13. [마음 시스템](#13-마음-시스템-heart-system) · 14. [이벤트 · 스토리](#14-이벤트--스토리) · 15. [게임 텍스트 · 업적](#15-게임-텍스트--업적) · 16. [플러그인](#16-플러그인)
17. [게임 런타임](#17-게임-런타임) · 18. [빌드 · 내보내기](#18-빌드--내보내기) · 19. [개발 도구 · 확인](#19-개발-도구--확인) · 20. [현황](#20-현황)

---

## 0. 개요

**에디터(Electron)** 가 프로젝트 폴더에 JSON · PNG · 소리만 저장하고, **게임 저장소(SPD 소스) + pdmaker 런타임(Java 패키지)** 이 그 폴더를 읽어 그대로 실행한다.
런타임은 테스트 플레이 때 설치기가 게임 저장소에 복사하고, 원본 코드에 연결 줄(`// >>> pdmaker`)을 넣는다. 데이터로 부족한 동작은 사용자 Java 코드로 쓰고, 설치기가 `pdmaker/gen/` 클래스로 만들어 함께 컴파일한다.

```
┌──────────── 에디터 (PDMaker · Electron) ─────────────┐          ┌──── 게임 (SPD + pdmaker 런타임 · Java/libGDX) ────┐
│ 리소스 목록 │ 맵 · 영웅 · 캐릭터 · 아이템 · 이벤트 …  │  JSON    │ MakerRuntime    프로젝트 로더 · 텍스처 · 층 입출입    │
│ (GameMaker) │ 인스펙터 · 출력 · 검사 · 확장 기능      │  PNG ──▶ │  ├ WorldGraph / MakerLevel / LevelHooks  맵        │
│             │ ▶ 테스트 플레이 ── runtime-installer ───┼─ 설치 ─▶ │  ├ HeroRuntime · Maker* (주문·특성·전직)  영웅      │
└──────────────────────────────────────────────────────┘  gen/*.java│  ├ EventInterpreter · StoryState · HeartSystem     │
                                                                    │  └ MakerLights · MakerEffect · MakerFilter …  연출 │
                                                                    └───────────────────────────────────────────────────┘
```

---

## 1. 참고 소스 · 명칭 원칙

| 출처 | 가져오는 개념 | PDMaker 에서 |
|---|---|---|
| **era** (eraTW / eraTHYM) | CFLAG · TALENT · ABL · MARK · EXP, SOURCE→PALAM→JUEL, COUNTER, ATTITUDE, 구상(口上), 데일리 · 일기 | 마음 시스템 — §13 |
| **GameMaker** | 리소스 트리, 오브젝트 + 이벤트, 룸 + 레이어, 시퀀스, `.gmplugin`, shdShadow/shdLight 조명 | IDE 레이아웃, 캐릭터 행동 이벤트, 장면, 플러그인, 광원 — §2 · §5 · §16 |
| **RPG Maker** | 대사창 · 이벤트 페이지 · 이동 경로 | §11 · §14 |
| **mod-2** (*Witchling Pixel Tower*) | 아리아(원소 · 과열), 코덱스 · 그리모어, 타이틀 · 파티클 | 영웅 게이지 · 코덱스 아이템 · 샘플 데이터 (mod-2 저장소일 때만 목록에 보임 — `PDM.isMod2()`) |

**NSFW 명칭 원칙**
- 코드 식별자는 모두 중립 영어(`favor`, `trust`, `deference`, `mark.fear` …). era 원래 단어는 코드 · 데이터 어디에도 쓰지 않는다.
- 화면에 보이는 이름은 모두 `terms.json`(용어 사전)에서 가져온다. 에디터 **용어 관리**에서 바꾸고, 게임도 같은 파일을 읽는다 (기본값 `renderer/js/terms.js` `DEFAULT_TERMS` → `tools/data/gen_terms_java.js` → `DefaultTerms.java`).
- 용어마다 `eraRef`(예: `ABL:10`)만 남겨 원본의 어느 자리를 대체했는지 추적한다. 성인 전용 시스템은 구조만 참고하고 기능은 넣지 않는다.

---

## 2. 에디터 구조

```
┌ 메뉴: 파일 · 편집 · 보기 · 프로젝트 · 실행 · 도구 · 플러그인 · 도움말 ───────────────────────────────┐
├ 도구 모음: 새 · 열기 · 저장 · 다른이름 | 내보내기 ▾ | ↶ ↷ ······ 검사 | ▶ 빌드 ▾ ■ | ◐ ⚙ ▾ ┤
├──────────────┬─────────────────────────────────────────────┬──────────────┤
│ 리소스 목록   │ 탭 작업 공간 (편집기 여러 개를 탭으로)         │ 속성          │
│ (검색 · 끌기) │                                             │ (선택한 것)   │
├──────────────┴─────────────────────────────────────────────┴──────────────┤
│ 출력 (빌드 · 게임 로그) / 검사 (끊어진 참조 · 빠진 그림 …)                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 프로세스 · 파일
- **메인 프로세스** `editor/main.js` (+ `preload.js` 의 `window.pdm`): 파일 입출력(`fs:*` IPC), 테스트 플레이 · 게임 내보내기(gradle 실행), Java · WiX · Android SDK 찾기, 게임 저장소 수리(`repairRepo` — 빠진 모듈 build.gradle 채우기), 실패 알림(`notifyFail` → 창이 앞에 없으면 `win.flashFrame`, macOS 는 Dock 튐 · 중지 버튼으로 끝낸 것은 제외), 업데이트(`updater.js`), `.pdmproj` 압축(`zip.js`).
- **렌더러** `editor/renderer/` — 빌드 도구 없는 순수 JS. `bridge.js` 가 `window.pdm` 을 감싸고, Electron 이 없으면 **웹 모드**(메모리 · 브라우저 저장, 개발 · 확인용).

| 파일 | 역할 |
|---|---|
| `app.js` | 메뉴 · 도구 모음 · 리소스 목록(검색 · 끌어 놓기) · 탭 · 인스펙터 · 확장 기능 · 새 프로젝트 · 게임 저장소 찾기 · 테스트 플레이 |
| `store.js` | 프로젝트 데이터(키 → 객체) · 저장 · 실행 취소(`store.edit(key, 설명, fn)` 스냅샷, `transaction` 으로 묶기, 200단계) · 예전 형식 변환 |
| `ui.js` | 입력 칸 묶음 `PDM.ui.F`(text · num · select · bool · ref · sound · icon · cond …) · `section` · `listEditor` · `modal` · `menu` · `soundPicker` |
| `schema.js` · `defaults.js` | 상수(지형 · 테마 · 버프 · 분류 …) · 새 리소스 기본값 |
| `world.js` | 맵 그래프 계산(`PDM.World` — depth/branch · 계단 배정 `ports`) · 새 프로젝트 맵 |
| `assets.js` | 그림 불러오기 · `game:`/`builtin:` 경로 · 게임 그림 바꾸기 · 지형 그리기 |
| `cond.js` · `heart-core.js` | 조건식 · 마음 시스템 계산 (런타임 `Cond` · `HeartSystem` 과 같은 규칙) |
| `codegen.js` | 사용자 Java 코드 → `gen/*.java` (설치기와 "생성될 코드 보기"가 같이 씀) |
| `commands.js` | 이벤트 명령 정의 · 입력 칸 (`route` 이동 경로 편집 포함) |
| `pixel.js` | 픽셀 편집기 (§12.3) |
| `cellpick.js` | 맵에서 칸 고르기 `PDM.pickCell` · 광원 칸 `PDM.lightFields` · 광원 미리보기 `PDM.drawLightPreview` |
| `layout.js` | 대사창 · 타이틀 레이아웃 직접 편집 `PDM.layoutEditor` |
| `levelpreview.js` | 타일셋 실시간 미리보기 |
| `resops.js` | 파일 하나짜리 리소스(캐릭터 · 아이템 · 이벤트 · 맵 오브젝트 · 방 템플릿 · 영웅 — 영웅은 id 바꾸기 · 복제를 자기 방식으로 `o.rename/dup`) 공용 동작 `PDM.resOps` — 이름 바꾸기 · id 바꾸기(맵 오브젝트 · 이벤트 명령 매개변수 · 퀘스트 · 상점 · 드랍 · 영웅 연결 등 쓰는 곳도 고침) · 복제 · 삭제(쓰는 곳 수 표시) · 쓰는 곳 보기. 리소스 목록 메뉴와 편집 화면 맨 위 공용 도구 줄(`app.js render` 가 붙임). 방 템플릿은 맵 편집 화면이라 속성 창 맨 위에 같은 도구 줄 + "방 미리보기" 창의 카드마다 편집 · 복제 · 삭제(오른쪽 클릭 = 같은 메뉴) |
| `clip.js` | 공용 클립보드 `PDM.clip` — Ctrl+C/V. 메모리 + 시스템 클립보드 JSON(다른 프로젝트 · 창에도). kind: `res:<종류>` · `list:<저장 키>` · `nodes` · `mapobj` · `cmds`. 붙여넣기는 지금 탭의 `ctx.copy/paste` → 리소스 · 목록 항목 기본 처리 |
| `tips.js` | 설명문 표시 `PDM.tips` — 모드 hover(기본: 설명문을 숨기고 그 기능에 마우스를 올리면 상자) · inline(항상 펼침) · off(숨김), 보기 메뉴 · `localStorage pdm.hints`. 편집기 코드는 그대로 두고 MutationObserver 로 `p/div/small.hint` · `.lead` 를 찾아 붙일 곳을 정함(입력칸 설명 → `label.field`, 앞 요소, 앞이 여러 칸 묶음이거나 없으면 섹션 제목) → 대상에 `_tipEls`, 설명문에 `.tipped`(CSS 로 숨김), 제목 · 입력칸 이름에 ⓘ. 버튼 · 링크 · 입력칸을 담은 설명, 경고(글자색 · .bad), 테두리 상자, 대화상자 안, 줄 안의 `span.hint` 는 그대로. `title` 속성도 같은 상자로 (브라우저 말풍선 대신) |
| `keys.js` | 단축키 `PDM.keys` — 동작 표(id · 기본 키 · scope global/draw) + 사용자 키(`localStorage pdm.keys`), `e.code` 기준 키 이름, 편집 › 단축키 설정 창 |
| `listops.js` | `{ list: [{id,name}] }` 꼴 리소스의 추가 · 복제 · 복사/붙여넣기 · 삭제 · id 바꾸기 · 쓰는 곳(이벤트 명령 `cmdType`+`cmdKey` · 맵 오브젝트 `objType` · 참조 칸 `fields`) · 순서 `PDM.listOps` — 도구 줄은 resOps 와 같은 모양 |
| `gamescan.js` · `gamehero.js` · `gameinfo.js` | 게임 저장소 소스를 읽어 목록 맞추기 · 원래 값 보여 주기 (§2.5) |
| `javasrc.js` (`window.PDMJava`) | 공용 Java 구조 분석 (주석 · 문자열을 걷은 골격 → 괄호 짝 · 형 · 깊이 · enum · Assets · ItemSpriteSheet · 스프라이트 · gradle) — 편집기 · `editor/repo-analyzer.js` · 테스트가 같이 씀 (§2.5) |
| `editors/repoanalysis.js` | 「게임 저장소 분석」 화면 (§2.5) |
| `editors/repoexplorer.js` | 「게임 저장소 탐색」 화면 — 파일 · 클래스(상속) · 게임 데이터(출처 · 편집 가능) · 번역 검색, 읽기 전용 (§2.5, 11차) |
| `repomaps.js` | 게임 저장소의 맵(`Dungeon.newLevel()`)을 맵 그래프에 — 기본 표시(`autoSync`) · 유형 · 근거 · 사라진 맵 확인 (§2.5) |
| `spd-items.js` · `spd-chars.js` · `spd-rooms.js` · `spd-room-previews.js` · `spd-level-previews.js` | 게임 데이터 (`tools/data` · `tools/playtest` 로 뽑음) |
| `validate.js` | 검사(F7) |
| `theme.js` | 테마 (가장 먼저 실행) |
| `plugin-api.js` | 플러그인 API (§16) |
| `editors/*.js` | 편집기 한 개 = 파일 한 개 (`PDM.registerEditor({ id, title, match, tree, render })`) |

편집기: world(맵 그래프) · nodebulk(노드 한꺼번에 설정) · map(맵 · 방 템플릿) · prop(맵 오브젝트) · gameart(UI 그림 · 맵 그림) · hero · character · item · loot(드랍 테이블) · sound · title · dialogue · texts(게임 텍스트) · badges · sprites(그림 관리) · story · event · quests · effect · filter · textfx · trailer · compose(노드 합성기) · heart · terms · plugins · legacy(Java 코드 생성기) · project.

### 2.2 화면 동작
- **디자인 시스템** (`docs/UI-DESIGN-SYSTEM.md` · 견본 `editor/renderer/styleguide.html`): `css/app.css` 의 토큰(색 · 간격 `--sp-*` · 글자 `--fs-*` · 모서리 `--r-*` · 컨트롤 높이 `--ctl-h*` · 그림자 `--e-*` · 모션) → 컴포넌트(.btn · 입력 칸 · .sec · .badge · 메뉴 · 창) → 유틸리티(.hstack · .gap-4 · .mt-3 …, 예전 인라인 style 459개를 옮김). 아이콘은 `js/icons.js` 한 벌(`PDM.icon` · 편집기의 이모지 아이콘은 `PDM.iconFor` 가 같은 SVG 로). 선택 표시 = 강조색 2px 줄 + `--accent-soft`, 키보드 포커스 고리, 줄임 모션 대응.
- **테마** (`theme.js`): system / light / dark → `html[data-theme]`, 색은 모두 CSS 변수. system 은 `prefers-color-scheme` + Electron `nativeTheme.themeSource`(제목 표시줄 · 대화상자). 강조색 = OS 강조색(`systemPreferences.getAccentColor`) · 기본 청록(4차 — 예전 보라) · 직접, 배경과 구분되도록 밝기 보정. 게임 그림 미리보기 바탕은 테마와 상관없이 어두움(`--stage`).
- **다시 그릴 때 위치 유지**: 편집할 때마다 탭을 다시 그리므로 — 섹션 접힘을 기억(탭 + 제목, `ui.js closedSecs`), 인스펙터는 같은 제목이면 스크롤 유지, 탭 본문은 누르거나 입력 중인 칸(자식 순서 경로)을 기준으로 위치를 맞춤(0 · 30 · 120 · 400ms, 휠을 굴리면 멈춤), 안쪽 스크롤 칸(.sheet-view 등)도 되돌림.
- **리소스 목록** (`app.js drawTree`): 처음엔 모두 접힘(펼친 분류는 `localStorage pdmaker_tree_expanded`). 검색 = 항목 · 분류 이름(분류가 맞으면 그 아래 전부), ☰ 세부 검색(분류 · 세부 종류), "전체"(접힌 분류까지). 끌어 놓기: 노드의 `drag` · `canDrop(끈 것) → ['before','after','into']` · `drop`. 줄의 ▲▼(마우스를 올리면) · 오른쪽 클릭 메뉴.
- **창 닫기 · 복사 · 붙여넣기**: Ctrl+W = 떠 있는 창 · 메뉴 먼저, 없으면 지금 탭(프로그램은 닫지 않음) · Esc = 맨 위 창 · 메뉴. Ctrl+C/V = 고른 것(맵 그래프 노드 · 맵 오브젝트 · 이벤트 명령 · 스프라이트 선택 영역) → 없으면 지금 탭의 리소스 통째로 / 목록 항목(이펙트 등). 입력 칸 안 · 글을 고른 상태면 원래 복사.
- **메뉴 = 도구 모음 (4차)**: 같은 일을 하는 메뉴와 도구 모음 ▾ 는 한 목록 함수(`app.js` `RUN_ITEMS` 실행 · `EXPORT_ITEMS` 내보내기 · `SETTINGS_ITEMS` 설정 · `THEME_ITEMS` 테마)에서 만듦 — 이름 · 단축키 표시 · 비활성 조건이 늘 같음(`PDM.menus`). 실행 메뉴 = 테스트 플레이 · 실행 방식 · 컴파일 확인 · 빌드 정리 · 중지. 켜고 끄는 메뉴 항목은 `checked`, 묶음 제목은 `{ head }`, "삭제…" 항목은 빨간 글자. 확인 창 `PDM.ui.confirm(msg, { title, ok, danger })` — 지우기 · 덮어쓰기는 ⚠ + 빨간 "진행". 알림 `toast(msg, '' | 'ok' | 'warn' | 'bad')` 기호 + 상태 색 줄.
- **묶음 버튼** (`PDM.ui.dropBtn` · 도구 모음 `tbDrop`): 자주 안 쓰는 버튼과 보기 켜고 끄기를 ▾ 메뉴로 — 도구 모음 "내보내기 ▾"(게임 파일 · 프로젝트 내보내기 · 가져오기), 테스트 플레이 옆 "▾"(빌드 방식 · 컴파일 확인 · 빌드 정리), "⚙ ▾"(프로젝트 설정 · build.gradle · 확장 기능 · 단축키), 맵 편집기 "👁 보기 ▾"(격자 · 구역 색 · 계단 번호 · 스폰 구역 · 무작위 칸 · 세부 그림), 영웅 "{ } 코드 보기 ▾".
- **단축키** (`keys.js`): 편집 › "단축키 설정…" 에서 동작마다 키를 여러 개 지정 · 빼기 · 기본값으로(충돌하면 다른 동작에서 옮길지 물음). global = 파일 · 편집 · 탭(닫기 · 다음/이전) · 리소스 검색 · 테스트 플레이 · 중지 · 검사, draw = 맵 편집기 · 스프라이트 편집기 공용 도구(펜 · 지우개 · 채우기 · 스포이드 · 선택 · 올가미 · 마법봉 · 브러쉬 크기 · 선택 해제). 메뉴 · 도구 모음 힌트도 바뀐 키를 보여 줌. 맵 그래프 · 화면 이동 키 등은 고정(창에 참고로 표시).
- **패널 접기 · 상태 줄** (`app.js PDM.panels` · `PDM.status`): 리소스(Ctrl+B) · 속성(Ctrl+Shift+B) · 출력(Ctrl+J) 패널을 접고 펴기(패널 제목 « » ⌄ · 상태 줄 오른쪽 버튼 · 보기 메뉴), 접은 상태와 끈 크기는 `localStorage pdm.layout`(이 PC 설정). 검사 · 빌드 출력은 접힌 출력 창을 폄. 좁은 창(≤1280px) · 낮은 창(≤800px)은 기본 패널 크기를 줄임. 상태 줄: 저장 상태(✓ 저장됨 · ● 저장 안 됨 (n개) · ⟳ 저장 중 · ✕ 저장 실패 — 누르면 다시 저장) · 지금 편집기 상태(맵: 도구 · 레이어 · 확대 · 크기 · 영역 · 선택).
- **이벤트 명령 목록** (`commands.js PDM.commandList`): 명령을 누르면 오른쪽 속성 창에서 바로 고침(0.4초 모아 store.edit 한 번 = 실행 취소 한 번, 입력 중 초점 유지), 실행 순서 번호 · 빈 값 ⚠(`PDM.commandProblems` — 검사 F7 에도), 도구 줄(+ 명령 추가 · 복제 · ▲▼ · 삭제), ↑↓ 고르기 · Alt+↑↓ 옮기기 · Enter 큰 창 · Delete, 명령 넣기 창에 찾기 칸(Enter = 첫 번째). 고른 명령은 탭을 다시 그려도 유지.
- **편집 도우미**: 숫자 칸 휠(Shift ×10, `dec` 로 소수 단위), 아이템 칸 = 검색 · 분류 · 그림 목록(`ui.combo`), 소리 칸 = 목록 · ▶ · 📂 파일(프로젝트 밖이면 `assets/audio/` 로 복사) · ✎ 경로 직접 입력 · 🎚 사운드 편집기로.

### 2.3 확장 기능
`project.extensions[id] === true` 일 때만 켜짐 (새 프로젝트 `{}` = 모두 꺼짐, 설정이 아예 없는 예전 프로젝트는 모두 켬). 도구 모음 "확장 기능" 창에서 켜고 끄며 바로 열기 · 새로 만들기.

| id | 이름 | 내용 |
|---|---|---|
| `story` | 스토리 | 스위치 · 변수 · 루트 · 엔딩 · 입장 문구 · 소개 화면 |
| `event` | 이벤트 | 커먼 이벤트 · 장면 · 이정표 · 층 이벤트 |
| `prop` | 맵 오브젝트 | 오브젝트 리소스 · 맵 편집기 "맵 오브젝트" 종류 (이미 쓰는 프로젝트는 열 때 자동으로 켬, 꺼도 게임 동작은 그대로) |
| `quests` | 퀘스트 | §7.4 |
| `textfx` | 글자 연출 (APNG) | 글자 연출 + 예고편 컷신 |
| `effects` | 이펙트 · 파티클 | §5.5 |
| `compose` | 노드 합성기 | §5.9 |
| `filters` | 화면 필터 | §5.6 |
| `motion` | 모션 랩 | §5.10 |
| `tilecombos` | 조합 타일 · 분리 타일셋 밑그림 | §4.2.2 — **게임에도 적용**: 끄면 런타임도 조합 타일 놓기 · 자동 생성 · 조합 광원 · 밑그림 층 · 기본 "광원 · 효과" 레이어를 쓰지 않음(`MakerRuntime.tileCombos()`), 편집기도 밑그림 · 조합 오브젝트를 숨김. 데이터는 그대로 남음 |
| `sys` | 시스템 | 마음 시스템 · 용어 관리 · 플러그인 · Java 코드 생성기(이전 메이커) |
| `charPortrait` · `charHeart` · `charDialogue` · `charBehavior` | 캐릭터 편집 칸 | 초상화 · 표정 / 마음 시스템 / 상황별 대사 / 행동 이벤트 |

### 2.4 게임 저장소 · Java
- 기준 저장소 = `pd-maker/game/shattered-pixel-dungeon-master` (SPD 4.0.0, `main.js REPO_NAME` · `app.js REPO_NAMES`). 예전 기준(`game/shattered-pixel-dungeon` · `-mod-2`)을 가리키는 프로젝트는 열 때 자동으로 바꿈 (`findRepo`).
- 프로젝트 `gameRepo`(프로젝트 기준 상대 경로)가 틀리면 ① PDMaker 의 `game/` ② 전에 쓴 저장소 ③ 위쪽 폴더 순으로 찾아 고침 (`resolveRepo`). 직접 고른 저장소는 `gameRepoPinned` 로 표시해 자동 변경하지 않음. 바깥 저장소는 프로젝트 설정 "PDMaker 폴더 안으로 옮기기".
- Java 17+ 가 없거나 깨졌으면(`findJavaHome` · `javaOk` — 망가진 Android Studio JBR 등 거름) Temurin 21 을 `userData/jdk` 에 내려받음.
- 안드로이드 SDK 가 없으면 `settings.gradle` 연결 줄이 android 모듈을 건너뜀.

### 2.5 게임 저장소에 맞춘 목록 · 원래 값 보기
- `gamescan.js PDM.gameScan(repo, force)` (`resolveRepo` 에서 호출, `fs:walk`): 저장소의 `items` · `levels/rooms` · `actors/mobs` 를 훑어 내장 목록에서 파일이 없는 것은 빼고, 저장소에만 있는 것은 소스에서 읽어 덧붙임(목록에 ＋). 캐릭터는 지우지 않고 클래스가 없으면 ⚠, 새 몬스터는 캐릭터 › "게임 저장소에서 새로 찾음". 요약 `PDM.GAME_SCAN`. 새 프로젝트에서 저장소를 고르면 `PDM.gameSyncVanilla()` 가 원작 영웅 · 캐릭터를 그 저장소에 맞춤 (프로젝트 설정 "영웅 · 캐릭터를 저장소에 맞추기"로도).
- `gamehero.js`: 바탕 직업이 있는 영웅의 시작 인벤토리 · 전직 · 직업 능력 · 특성 섹션 위에 소스에서 읽은 원래 값을 읽기 전용 상자로 (`HeroClass.initHero` · `HeroSubClass` · `armorAbilities()` · `Talent.initClassTalents` · 코드에서 쓰이는 곳), 지금 게임이 그 값을 쓰는지 / 프로젝트가 대신하는지 배지.
- `gameinfo.js` (`PDM.gameSrc`): 캐릭터 "게임 코드의 실제 값"(체력 · 피해 · 명중 · 회피 · 방어 · 경험치 · 속성 · 전리품, 부모 값 이어받음), 드랍 테이블의 몬스터별 게임 전리품 · 상자류 설명, 스폰이 비었을 때 그 깊이의 `MobSpawner` 목록, 구성 블럭이 비었을 때 지역 Level 의 방 수, 영웅 선택 글 · 해금 글, 아이템 · 캐릭터의 실제 게임 소리.

- **저장소 분석기** (9차, `editor/repo-analyzer.js` — 읽기 전용, Electron 은 `repo:analyze` IPC → worker 스레드, 캐시 `userData/repo-analysis/`): 루트 찾기(모듈 폴더 → 상위, 여러 저장소면 후보) → 안전한 훑기(바깥 · 순환 링크 · 권한 오류 기록) → 모듈 · 빌드 → 게임 모듈(Dungeon.java) → 모든 Java 구조 분석 → 리소스 디코딩(PNG 끝까지 · 나머지 머리 · 확장자와 실제 형식) → 에셋 참조 → 상속 그래프로 게임 객체(몬스터 스프라이트 · 능력치는 부모까지, 출처 표시) → 구조 차이 `features[]`(아이템 시트 격자 · 영웅 시트 switch · 층별 몬스터 클래스 · 글자 폴더 겹침 …) → 지원 범위 `support[]`(항목 × 8단계: 발견 · 읽기 · 구조 · 의미 · 변환 · 표시 · 편집 · 런타임) → 런타임 호환(설치기 compat + 런타임이 부르는 게임 클래스가 있는지). `gamescan` 이 이 결과로 새 몬스터를 만들고 `origin { repo, file, line, extracted[] }` 을 남김. 보고: docs/PROJECT-COMPATIBILITY-ARK-BA-9.md
- **저장소 데이터 정합성** (10차 — 선택한 저장소가 기준): 분석기 VERSION 3 이 맵 슬롯 · 고정 타일(`JS.levelSlots` · `staticLayout`) · 영웅 id/이름 키/별칭 · 몬스터 그림 종류(직접 · 상속 · 동적) · 근거 점수 분류(boss / elite / mob / npc / review + 신뢰도 · 근거) · 업적(`JS.badges`, 저장소 시트 격자 · 키 형식) · 타이틀(`JS.titleScene`) · 프로파일 지문을 냄. 리소스 칸마다 `src.fields[path] = { from: repo|derived|default, v, file, line, key, pending }` (`provenance.js`) — 지금 값 ≠ v 이면 사용자 편집. `reposync.js` 가 계획 → 확인 창 → 적용 (안 고친 칸만 바꿈 · 사용자 값 유지 · 바뀐 원본은 충돌로 보고 · 사라진 항목은 확인 후에만 삭제 · 분석 실패면 아무것도 안 바꿈). `repomaps.js` 가 저장소 층을 그래프로 가져옴: 완전히 정해진 고정 맵 = handmade 노드(원래 타일), 나머지 = `mode: "game"` 노드(`gameLevel` = 저장소 층 클래스 → 런타임이 리플렉션으로 생성, 없으면 테마 생성기). 캐릭터 종류에 `elite` · `unsorted`, 적 판정은 `PDM.isHostile`. 설치기는 런타임이 쓰는 클래스가 없으면 파일을 고치기 전에 거부. 보고: docs/ARK-PROJECT-DATA-FIDELITY-10.md

- **11차 — 영웅 그림 구조 · 맵 기본 표시 · 저장소 탐색** (분석기 VERSION 4, 보고서 `docs/REPOSITORY-EXPLORATION-AND-SPRITE-FIXES-11.md`)
  - 영웅 그림: `javasrc.heroSprite` 가 `HeroSprite.updateArmor()` 의 `new TextureFilm(tiers(), 단계, W, H)` 칸 · `tiers()` 의 갑옷 줄 높이(`rowH`) · 동작(`.frames` · `clone()`) · `scale.set` 을 읽음 (FRAME_* 상수만 보면 ARK 의 36×36 ≠ 실제 칸 36×34). `heroSelectIcons` = `HeroSelectScene.HeroBtn` 아이콘 출처(Icons 상수 / 시트 칸). 저장소 맞추기가 `sprite.frame · rowH · anims · scale` · `select.iconTier` 를 출처와 함께 옮김.
  - 맵: 프로젝트를 열 때 · 저장소를 바꿀 때 · 새 프로젝트에서 분석이 성공하면 `PDM.repoMaps.autoSync()` — 원작에 없는 맵을 가져오기 버튼 없이 그래프에 (원작과 같은 층 클래스는 기본 층 노드가 대신 · 같은 클래스를 쓰는 사용자 노드가 있으면 겹쳐 만들지 않음 · 사용자가 지운 저장소 맵은 `world.repoMaps[프로파일].seen` 으로 기억해 다시 넣지 않음). 노드 `src.mapTypes`(fixed · partial · game-generated · procedural + conditional) · `editable`(tiles | meta) · `evidence`[{kind, file, line, text}]. 연결은 원본 `LevelTransition`(파일:줄) 또는 게임 기본 계단(깊이 순서 — "추정" 표시)만. 저장소에서 사라진 노드는 지우지 않고 목록 · 고른 것만 `sync({ remove })`. 계획(`plan`)을 먼저 만들고 한 번에 적용 — 중간에 실패하면 노드 · 그래프를 전 상태로 되돌림.
  - 탐색 화면(`repoexplorer`): 분석기 `R.index`(모든 파일 경로 · 종류 · 크기 · 그림 크기, 모든 클래스 파일 · 줄 · 부모 · 종류)로 폴더 트리 · 경로 검색 · 종류 거르기 · 그림/소리/글자 미리보기 · 그림을 쓰는 곳, 클래스 상속(부모 사슬 · 자식) · 원본 코드, 게임 데이터(맵 · 영웅 · 몬스터 · 보스 · 아이템 · 배지 · 타이틀 · UI · 소리 · 빌드 모듈 — 원본/추론 · 편집 가능 · 근거 파일 · 편집기 바로가기 · 프로젝트 값의 출처 상태), 번역(messages 키 · 글자 검색 · 언어). 다시 맞추기 버튼은 `reposync.js` · `repomaps.js` 와 같은 규칙. game/ 원본은 고치지 않음.
  - 분석기의 런타임 클래스 검사는 설치기의 적응 결과(`runtime-adapt.js`)로 — ARK 는 "적응 설치 가능"(게임 본체 TomorrowRogueNight 등 적응 5개).

### 2.6 새 프로젝트
- 위치(상위 폴더)를 고르면 그 안에 **프로젝트 이름 폴더**를 만듦 (윈도우에서 못 쓰는 글자는 뺌, 끌 수 있음, 만들 경로 미리 보기, 비어 있지 않은 폴더면 물어봄). 창에서 게임 이름 · 패키지 이름(§18.3), 이어서 게임 저장소 경로.
- 내용 = 원작 그대로: `PDM.World.defaultWorld` 5구역 × 5층(자동 생성, 5 · 10 · 15 · 20 · 25층 보스 — depth 1~25 가 원작과 같음), 영웅 6명(`tools/data/extract_spd_chars.py` 가 `HeroClass.java` 를 읽어 만듦, `SKIP_CLASSES` 의 직업 — 지금 ARIA — 은 뺌), 원작 캐릭터 72명(`spd-chars.js`), 원작 가운데 대사창(`dialogue.mode = window`), 게임 원래 타이틀(`title.enabled = false`), 마음 창 버튼 끔, 확장 기능 모두 꺼짐.
- 영웅마다 원작 시작 아이템(`inventory.items[].fromGame` — 게임이 주므로 표시만; 장착 · 퀵슬롯 · `affix`(부서진 인장 → 갑옷) · `imbue`(마법사 지팡이의 완드) 포함)과 감정된 아이템(`knownItems`), 원작 긴 설명. "목록대로 직접 주기"(`clearDefault: true`)면 fromGame 행도 PDMaker 가 직접 지급.

---

## 3. 프로젝트 폴더 형식

```
MyProject/
├ project.json          프로젝트 설정 — 이름 · 게임 이름(game) · gameRepo · startHero · heroOrder · extensions · settings · itemSubs/itemOrder · roomCats · loot · bannedMobs …
├ terms.json            용어 사전
├ title.json            타이틀 화면 (§10)            ├ dialogue.json     대사창 (§11)
├ texts.json            게임 텍스트 (§15.1)          ├ badges.json       업적 (§15.2)
├ gameitems.json        게임 아이템 그림 · 드랍 · 금지 (§8)
├ effects.json  filters.json  textfx.json  trailers.json  compose.json  quests.json   (확장 기능)
├ maps/world.json       맵 그래프 (§4.1)             ├ maps/nodes/<id>.json   노드 = 맵 하나
├ maps/tilecombos.json  조합 타일 · 분리된 타일셋 밑그림 대응표 (§4.2.2)
├ rooms/<id>.json       방 템플릿                     ├ props/<id>.json        맵 오브젝트
├ heroes/<id>.json      영웅                          ├ characters/<id>.json   NPC · 동료 · 몬스터 · 보스
├ items/<id>.json       아이템                        ├ events/<id>.json       커먼 이벤트 · 장면
├ story/story.json      스토리                        ├ heart/heart.json       마음 시스템 규칙
├ audio/sounds.json     사운드 목록
├ assets/               그림 · 소리 (표준 폴더: docs/FOLDERS.md — sprites/heroes · sprites/characters/<종류> · sprites/items · fx · portraits/<캐릭터> · illustrations · tiles · title · ui · maps · fonts · filters · compose · audio · game)
├ signing/              안드로이드 서명 키 (게임 파일 · APK 에 넣지 않음)
├ .pdmaker-backup/<시각>/  저장 전에 남긴 원본 (변환 · 손상 · 삭제된 파일 — 최근 20번, 게임 · 내보내기에 넣지 않음)
└ plugins/<id>/plugin.json
```

- 단일 파일은 `store.js SINGLES`, 여러 개짜리는 `PREFIX`(node · room · char · hero · item · event · prop)로 읽고 쓴다. 리소스 키는 `<종류>:<id>`(예 `node:f1`, `item:ember_staff`).
- 모든 파일에 `format` · `version`. 예전 형식은 에디터가 열 때 바꿈 (예: 5층 단위 장 → 맵 그래프 §4.1, 스킬 → 주문 §6, `kind:"hero"` 캐릭터 → 영웅, 한 겹 이펙트 → 이미터, 마음의 보석 → 결정).
- **저장 안전장치** (`store.js save`): ① 열 때 바꾼(변환한) 파일 · 손상된 파일 · 지울 파일은 덮어쓰거나 지우기 전에 원본을 `.pdmaker-backup/<시각>/<같은 경로>` 로 복사(처음 한 번, 최근 20개 폴더만 남김) ② 바뀐 파일을 하나씩 쓰기(임시 파일 → 바꿔치기, `main.js fs:writeText`) ③ 다 쓴 뒤에만 지울 파일을 지움. 중간에 실패하면 예외 — 못 쓴 파일 · 못 지운 파일은 "저장 안 됨"으로 남아 다시 저장할 수 있음. 복구: 백업 폴더의 파일을 같은 경로로 되돌려 놓고 다시 열기.
- **검사(F7)** (`validate.js`): ① `PDM.validate` (동기 — 테스트 플레이 전 오류 확인에도 씀) 참조 · 조건식 · 맵 데이터(지형 번호 · 레이어 칸 수 · 없는 레이어 · 없는 사용자 타일 · 오브젝트 종류 · 노드와 방 템플릿 오브젝트의 참조 · 좌표) · 조합 타일(칸 번호 · 레이어 · 오브젝트 · 자동 생성 위치 · 지형 · 테마 · 배치 방식) · `sound:<id>` · 손상된 파일(`store.damaged()`) ② `PDM.validateAssets` (비동기, 이어서 붙임) 모든 리소스 문자열에서 그림 · 소리 경로를 찾아 파일이 있는지 · 대소문자 · 확장자만 다른 파일 · 절대 경로 · 역슬래시 · 프로젝트 밖(../) — 경로마다 한 번 · 폴더 목록은 폴더마다 한 번, 게임 경로는 프로젝트 assets/game 덮어쓰기 우선(assets.js 와 같음), 게임 저장소가 없으면 게임 경로는 건너뛰고 개수만 알림. 결과 `{ level: error | warn | info, where, msg, open, kind, fix, path, cell }` — 누르면 그 탭(맵 칸이면 그 칸을 영역으로 고름 `PDM.mapUtil.focus`). 검사는 데이터 · 파일을 고치지 않음.
- **손상된 파일**(있는데 JSON 으로 읽지 못함): 기본값으로 열고 알림 · 파일은 그대로 둠(저장 대상 아님) — 그 항목을 고쳐 저장하면 손상본을 먼저 백업. `world.json` 이 손상되면 기본 맵 그래프로 열되 `maps/nodes/` 의 노드 파일은 덮지 않음(예전에는 기본 노드로 덮어썼음). `project.json` 은 열기를 멈춤. 여러 개짜리(노드 · 캐릭터 …) 파일은 불러오지 않고 그대로 둠.
- 그림 · 소리 참조: 프로젝트 기준 경로(`assets/…`), 게임 파일 `game:sprites/x.png` · `game:music/x.ogg`, 게임 아이템 시트 `builtin:items`, 소리 목록 `sound:<id>`.

---

## 4. 맵

### 4.1 맵 그래프 (`maps/world.json` · 편집기 `editors/world.js`)

편집자가 **노드(맵 하나)** 를 자유롭게 놓고 **연결(계단)** 로 잇고 **그룹(구역)** 으로 묶는다.

| 조작 | 방법 |
|---|---|
| 화면 이동 / 확대 | Space+끌기 · 가운데/오른쪽 버튼 끌기 / 휠 · F 또는 (아무것도 고르지 않고) Enter = 전체 보기 |
| 노드 이동 · 선택 | 끌기(Alt = 격자 무시) · Shift+클릭 · 빈 곳 끌기(사각형) · Ctrl+A |
| 만들기 | 빈 곳 더블클릭(자동 생성 노드) · 오른쪽 클릭 메뉴(직접 그리기 / 혼합 / 그룹). 몬스터 스폰 여부를 물어봄(`PDM.askSpawn`) |
| 연결 | 노드 네 면의 점을 다른 노드로 끌기: 그냥 = 통로 · Shift = 갈림길 출구 · Alt = 샛길. 빈 곳에 놓으면 새 노드 + 연결. 같은 두 노드 사이에 여러 개 가능 |
| 그룹 | 노드를 그룹 사각형 안에 놓으면 그 그룹으로, 제목을 끌면 그룹째 이동, G = 선택한 노드로 그룹. **제목 더블클릭 = 노드 한꺼번에 설정** |
| 키 | Delete · Ctrl+D 복제 · Ctrl+C/V · 방향키(Shift = 50) · Esc · "자동 정렬" |

```jsonc
{ "start": "n1",
  "groups": [ { "id": "g1", "name": "하수도", "theme": "SEWER", "direction": "", "color": "#5fd6b4", "safe": false,   // safe = 던전 밖(마을): 층 번호 대신 이름, 데일리 없음
                "rooms": [ { "room": "herb_greenhouse", "count": 1, "chance": 100, "cond": "" } ], "blocks": [],      // 그룹의 모든 자동 생성 노드에
                "bgm": "", "bgmExtra": [], "bgmTense": "", "bgmTenseWhen": "", "bgmBoss": "", "filter": "", "terrainLights": [], "autoLights": [] } ],
  "nodes": [ { "id": "n1", "group": "g1", "x": 40, "y": 80 } ],
  "edges": [ { "id": "d1", "from": "n1", "to": "n2", "kind": "door", "exit": 0, "entrance": -1, "cond": "", "fromSide": "r", "toSide": "l" },
             { "id": "e1", "from": "n3", "to": "n4", "kind": "main", "cond": "", "weight": 100 },
             { "id": "e2", "from": "n3", "to": "n9", "kind": "stair", "cond": "switch.ember_seal", "place": "exit", "message": "붉은 계단이 드러났다…" } ],
  "customThemes": [] }
```

**연결 규칙** — 배정은 에디터(`PDM.World.ports`)와 런타임(`WorldGraph.ports`)이 같고, 맵 편집기에 "출1 → 층" · "입2" 로 표시.
- `door` (통로, 기본): 연결마다 **출발 노드의 출구 하나 ↔ 도착 노드의 입구 하나**가 짝 — 그 출구로 가면 짝 입구에, 짝 입구로 돌아가면 그 출구로. `exit`/`entrance` = 출구(>)·입구(<) 타일 번호(맵 순서, 0부터), -1 = 자동(남은 타일 차례로). 타일이 모자라거나 자동 생성 맵이면 첫 통로는 원래 출구/입구, 나머지는 `place`(출구 근처 · 입구 근처 · 아무 방 · 좌표) 에 계단을 새로 놓고 세이브에 저장. `cond` 전에는 그림만 있고 막힘. 도착 계단 = `Level.getTransition` 연결 줄 `WorldGraph.pickArrival`.
- `main` (갈림길 출구): 조건을 통과한 main 연결이 여럿이면 **무게대로 하나를 무작위로**(아이작식) — 맵을 처음 만들 때 정하고 저장(`choice.<노드>`). `exit` 번호를 고정할 수 있음.
- `stair` (샛길): 조건을 만족하면 계단이 하나 더 생김. 들어올 때마다 다시 검사.
- 출구 타일 쓰는 순서: ① 번호를 지정한 통로 ② main(또는 되돌아가기) ③ 자동 통로 ④ stair. 입구 첫 타일은 되돌아가기 용도가 있으면 남김.
- 입구 계단: 노드 `entranceTo` 가 있으면 그곳, 없으면 **온 곳으로 돌아가기**. 시작 노드에 처음 있을 때는 "지상으로 나가기". 연결이 없는 노드(마을 등)는 `entranceTo` · 이벤트 "맵 이동" · 투명 출입구로 감.
- `fromSide`/`toSide`(`r l t b`, 없으면 위치로 자동): 선이 붙는 면 — 그림만 바뀜. 연결 속성에서 방향 뒤집기(면 · 출구/입구도 함께).

**게임 안 번호** (에디터 `world.js` = 런타임 `WorldGraph.java`)
- depth(난이도): 시작 노드 1, 연결을 따라 +1(가장 긴 경로, 되돌아가는 연결 무시). 노드 `depth` 를 1 이상으로 쓰면 고정. branch: 같은 depth 끼리 0, 2, 3 …(1 은 게임의 광산).
- 층 표시: 그룹 안에서 몇 번째 깊이 → "지하 4-2층"(같은 그룹 · 깊이가 여럿이면 -1, -2). 노드 `label` 로 바꿈. 진행 방향 `direction: up`(프로젝트 · 그룹) = 탑 모드(계단 그림 · 층 이름 반전, `MakerRuntime.beforeScene`).

**노드 한꺼번에 설정** (`editors/nodebulk.js` `PDM.nodeBulk(ids, title)`): 그룹 제목 더블클릭 · 그룹/여러 노드 인스펙터 · 오른쪽 클릭 메뉴.
대상 노드 체크(모두 · 방식별) → **바꾸기**(체크한 항목만 같은 값: 생성 방식 · 테마 · 보스 · 몬스터 스폰 · 깊이 · 배경음 · 화면 필터 · 안전구역 · 들어올 때 이벤트) + **추가**(노드마다: 지형 광원 · 자동 광원 — 여러 개, 세부 설정 전부 + 미리보기 / 추가 방 — 자동 생성 · 혼합만 / 스폰 몬스터 — 직접 그리기만, "기존 것 지우고" = 바꿔 넣기). `store.transaction` 으로 실행 취소 한 번.

**예전 형식 변환**: `maps/chapters.json` + `floor_XX` + `extra_*` 프로젝트는 열 때 그래프로 (`PDM.World.fromLegacy` — 장 → 그룹, 층 → 노드(depth 고정), 사이 맵 → 끼운 노드, 샛길형 → stair, 던전 밖 → "던전 밖" 그룹). 장 갈림길(paths)은 연결로 다시 만들어야 함.

### 4.2 노드 (`maps/nodes/<id>.json`)

```jsonc
{ "id": "n1", "mode": "procedural|handmade|hybrid", "name": "", "label": "", "depth": 0, "boss": false, "theme": "",
  "size": { "w": 32, "h": 32 }, "layers": { "terrain": [ … ], "tiles": { "base": [ … ], "grass": [ … ] }, "spawn": [ … ] }, "objects": [ … ],
  "procedural": { "blocks": [], "rooms": [] }, "hybrid": { "placement": "special|random" },
  "noMobs": false, "spawn": { "enabled": true, "mobs": [ { "ref": "spd:Rat", "weight": 1 } ], "initial": 3, "max": 6, "respawn": 50, "minDist": 8 },
  "safe": { "on": false }, "filter": "", "bgm": "", "terrainLights": [], "autoLights": [],
  "paint": { "image": "assets/maps/n1.png", "enabled": false }, "entranceTo": "", "onEnter": "", "note": "" }
```

- **생성 방식**: `procedural` = 테마 생성기(하수도 · 감옥 · 동굴 · 도시 · 전당, `boss` 면 그 테마의 보스 층) · `handmade` = 직접 그린 맵(`MakerLevel`) · `hybrid` = 자동 생성 + 직접 그린 방 하나(`TemplateRoom node:<id>`, 특수 방 또는 일반 방으로).
- **구성 블럭** (`procedural.blocks`, 없으면 그룹 `blocks`, 둘 다 없으면 게임 기본): `layout`(구조 auto · loop · figure8 · line, 통로 default · none · long) · `feeling`(분위기) · `standard`/`special`/`secret`(무작위 방 min~max, 일반 방 `big`) · `room`(방 템플릿/게임 기본 방, count · chance · cond). 런타임: 연결 줄 `RegularLevel.initRooms` → `LevelHooks.addRooms`(입구 · 출구만 남기고 블럭대로 방 목록을 채움) · `builder = builder();` 뒤 `LevelHooks.builder`(구조 · 분위기). 방 위치 · 연결 · 내용은 게임 생성기가 매번 만듦. 편집기 `PDM.mapUtil.blockListEditor`.
- **추가 방** (`procedural.rooms` · 그룹 `rooms`): `{ room, count, chance, cond }` — 방 템플릿 id 또는 `game:<분류>.<클래스>`(게임 기본 방, `LevelHooks.addList` 가 클래스를 만들어 넣음).
- **몬스터 스폰**: `noMobs` 면 `LevelHooks.afterCreate` 가 게임이 놓은 적을 치우고 `onFloorEnter` 가 `MobSpawner` 를 뺌. 직접 그린 노드는 `spawn` — 처음 `initial` 마리, 게임 재생성기가 `max` 까지 `respawn` 턴마다. `layers.spawn` 칸 0 보통 · 1 스폰 구역 · 2 금지 (구역이 있으면 그 안에서만, 영웅 시야 밖 · 입구 위 제외). `mobs` 가 비면 깊이에 맞는 게임 기본 몬스터.
- **안전구역** `safe { on, hunger(허기가 쌓이지 않고 천천히 풀림), feed(들어올 때 허기 해소), cure(해로운 상태 해제), heal(턴마다 회복), msg }` — 방 템플릿에도. 런타임 `MakerSafe.tick`(매 턴, 방 템플릿이 노드보다 먼저), 조건식 `safe`, 용어 `safe.enter/leave`.
- **화면 필터** `filter` (§5.6), **배경음** `bgm` (§9), **광원** `terrainLights` · `autoLights` (§5.4 — 없으면 그룹 것), **들어올 때 이벤트** `onEnter`(처음 한 번).

### 4.2.1 타일 레이어 · 함정 오브젝트

맵 요소를 세 가지로 나눔 — **타일 정의**(무엇: `world.userTiles` 그림 · 칠할 때 지형 · 효과 · 이름) / **타일 레이어**(어디에: 칸 → 타일 id) / **오브젝트 인스턴스**(놓인 것 하나하나: `objects[]` — 위치 · 종류 · 상태).

- **지형** `layers.terrain` = 맨 아래 고정 레이어. 게임 `Level.map` 그대로라 **판정(지나감 · 막힘 · 시야)의 유일한 근거** — 판정 코드는 게임 것 하나뿐(레이어마다 따로 만들지 않음).
- **사용자 타일 레이어** `layers.tiles { <레이어 id>: [칸 → 타일 id ("" = 없음)] }` — 같은 칸에 레이어마다 다른 타일. 레이어 정의는 모든 맵 공통 `world.tileLayers [{ id, name, depth: below|above, visible, solid }]`(없으면 기본: 기본 타일 · 풀 · 식생 · 벽 · 구조물(solid) · 벽 장식 · 광원 · 효과(`blend: add` — 더하기로 그려 발광, 확장 기능 `tilecombos` 를 켰을 때만) · 전경(above)). 배열 순서 = 그리는 순서.
  - 런타임 `MakerTileLayers`(정의 · 읽기 · `putCell`) → `MakerUserTiles.finish` 가 레이어 순서대로 (레이어 · 그림 · 크기) 묶음마다 CustomTilemap 하나를 `customTiles`(below — 지형 위 · 함정 · 아이템 · 캐릭터 아래) / `customWalls`(above — 캐릭터 · 벽 윗면 위)에. 게임 그리기 순서: 물 → 지형 → customTiles → 함정 · 식물 → 아이템 → 캐릭터 → 솟은 지형 · 벽 윗면 → customWalls → 효과 · 가스 · 안개. 타일 자체의 `over` 도 그대로(그 타일만 위로).
  - `visible: false` = 게임에 그리지 않음(효과도, 살펴보기 이름은 남음) · `solid: true` = 층을 만들 때 타일이 있는 칸의 지나갈 수 있는 지형을 게임의 보이지 않는 막힌 장식 `CUSTOM_DECO`(물이면 `CUSTOM_DECO_WTR`)로 — 그림은 그대로, 판정만 막힘.
  - 새 레이어는 데이터만 추가(레이어 설정 창) — 코드 수정 없음. 세이브에는 묶음마다 `pdm_layer` 저장.
- **함정** = 지형이 아니라 오브젝트 `{ type: "trap", ref: "<levels.traps 클래스>", hidden, inactive, at, cond, chance(방 템플릿) }`. 바닥 지형은 그대로 두고, 층을 만들 때 런타임 `MakerTraps.place` 가 게임 함정을 만들어 `Level.setTrap` + 그 칸을 게임 규칙대로 TRAP · SECRET_TRAP · INACTIVE_TRAP — 작동 · 피해 · 애니메이션 · 찾기 · 해제 · 세이브는 게임 코드 그대로. 숨길 수 없는 함정(`canBeHidden = false` — 다트 · 분해 · 낙석 · 음침한)은 숨김을 켜도 보임. 없는 클래스(다른 판)는 경고만. 직접 그린 맵(`MakerLevel.build`) · 방 템플릿 · 혼합 층(`LevelHooks.placeObject`)에서.
  - 그 밖의 특수 요소도 같은 오브젝트 목록: 투명 발판(`plate`) · 맵 오브젝트(`prop` — 스위치 · 문 · 밀기 · 상호작용 · 막힘 상태) · 이벤트 칸 · 광원 · 입구 · 출구, 모두 `cond`(등장 조건).
- **예전 형식 변환** (`PDM.migrateMapData` — 프로젝트를 열 때 노드 · 방 템플릿마다, 저장하면 적용): `layers.utile` → `layers.tiles.base` · 지형에 칠한 함정(17 숨김 · 18 · 19 작동함) → 바닥(1) + 함정 오브젝트(`WornDartTrap` — 예전엔 게임 함정이 만들어지지 않아 보이지도 작동하지도 않았음). 런타임도 변환 전 데이터를 그대로 읽음(`utile` = base, 지형 함정 → `MakerTraps.legacy`).
- 편집기: 팔레트 "타일 레이어"(고른 레이어에 칠함 · 👁 편집기에서만 숨기기 · 칸 수 · "위" "막힘" 표시 · 레이어 설정 창 — 이름 · 높이 · 게임 표시 · 막힘 · 순서 · 추가 · 삭제), 위(above) 레이어는 오브젝트 위에 그림, 지우개 "사용자 타일" = 지금 레이어 · "전부" = 모든 레이어. 오브젝트 "함정"(게임 그림 terrain_features.png 로 고르기 · 그리기, 숨김 = 흐리게 + ?). 지형 팔레트에서 지형 함정은 뺌. 검사(`validate.js tileLayerCheck` — 노드 · 방 템플릿): 레이어 칸 수가 맵 크기와 다름(오류) · 레이어 목록에 없는 레이어 · 없는 사용자 타일(칸 수와 함께 — 런타임은 그리지 않고 넘어감). 헤드리스 `eval:layerinfo` · `eval:presscell`.

### 4.2.2 조합 타일 · 분리된 타일셋 밑그림 (`maps/tilecombos.json`)

**확장 기능 `tilecombos`**(§2.3)를 켠 프로젝트에서만 동작 — 끄면 게임 · 편집기 모두 예전 그대로(밑그림 없음 · 조합을 놓지도 자동 생성하지도 않음 · 기본 레이어에 "광원 · 효과" 없음). 이 파일은 조합을 처음 쓸 때 만들어짐.

`{ format: "pdmaker-tilecombos", legacy: [ { visual, under: [칸] } ], list: [ 조합 ] }` — 편집기 "🧩 조합 타일"(`editors/combos.js`), 런타임 `MakerCombos` · `MakerTileUnderlay`. 예전 이름 `combos` 는 편집기가 열 때 `list` 로 바꾸고, 런타임은 둘 다 읽음.

- **분리된(투명 배경) 타일셋 → 예전 모습 그대로.** 게임은 칸마다 그림 하나(`DungeonTerrainTilemap.getTileVisual`)만 그려서, 풀 · 장식 · 계단 · 조각상 칸의 바닥을 지운 타일셋은 그 자리에 물 층이 비침. `MakerTileUnderlay` = 지형 타일맵 **아래** 밑그림 타일맵(그리는 순서: 물 → 밑그림 → 지형 → customTiles …). 층을 만들 때 타일셋과 같은 크기의 밑그림 텍스처를 한 번 굽고, 칸마다 게임이 그리는 그림 번호를 그대로 물어(변형 · 이음 규칙 그대로) 같은 자리를 그림.
  - 굽는 규칙: 대응표의 칸 v 마다 "지금 타일셋에서는 투명(alpha < 255)한데 원작에서는 불투명한" 픽셀에만 `under[d]` 칸의 같은 픽셀. 원작의 원래 구멍(`HOLES` — 18 우물 물 · 64 / 120 연금술 솥 입구, 원작 5종이 모두 같은 모양)은 비워 둬서 물이 비치는 것도 예전 그대로. 원작 타일셋 · 일체형 사용자 타일셋은 아무것도 그리지 않음(밑그림 층 자체를 안 만듦).
  - 기본 대응표(원작 5종 픽셀 비교): 1 · 2 · 3 · 16 · 18 · 65 · 66 · 67 · 72 · 74 · 121 · 122 · 123 · 128 · 130 → 0(바닥) / 7 · 8 · 9 · 69 · 70 · 125 · 126 → 6(바닥 변형) / 22 · 64 · 73 · 120 · 129 → 4(특수 바닥) / 75 · 131 → 4(원작마다 달라 확인 필요 — 하수도 · 동굴 4, 도시 10, 전당 0). `legacy` 로 칸마다 바꿈(여러 칸 = 아래부터 겹침, `[]` = 없음). 편집기 `PDM.TILE_LEGACY_DEFAULT` · `PDM.TILE_HOLES` · `PDM.assets.withUnderlay` 가 같은 규칙으로 맵 편집기 · 미리보기를 그림.
  - 연결 줄(runtime-installer PATCHES): `GameScene.create`(지형 타일맵을 넣기 직전 `addTo`) · `updateMap()` · `updateMap(cell)`(`refresh`).
- **조합** `{ id, name, sprites: [ { src: tileset | image, tile, image, x, y, size, layer, ox, oy (px, 한 칸 16), alpha, blend: normal | add } ], light: { on, color, k, z, range, ox, oy, shadow, charShadow, pulse, pulseMin }, effect, objects: [ { type: trap | prop, ref, hidden } ], terrain (-2 = 그대로), autogen }`
  - 그림: 스프라이트마다 `MakerUserTiles.put(레이어, 칸, "combo:<id>#<n>")` — 타일 레이어(§4.2.1) 순서대로 그리고, 같은 레이어 안에서는 배열 순서. `src: tileset` 은 그 층 테마 타일셋의 칸(테마를 따라감, 밑그림 없는 원본), `image` 는 그림 파일의 칸. 오프셋 · 불투명도 · 더하기(발광)는 (레이어 · 그림 · 옵션) 묶음마다 타일맵 하나로.
  - 빛: 발광 스프라이트(`blend: add` 또는 레이어 `blend: add`)는 빛무리 그림만, `light` 는 실제 점광원(`MakerLights` — 바닥 · 캐릭터를 밝히고 그림자). 층에 놓인 조합 목록은 보이지 않는 CustomTilemap `MakerCombos`(`pdm_combo_ids` · `pdm_combo_cells`)로 세이브에 남고, 광원은 여기서 다시 만듦.
  - 오브젝트: 조합은 정의만 하고 만드는 것은 오브젝트 시스템(`LevelHooks.placeObject` — 함정은 `MakerTraps`, 게임 규칙 그대로). 바닥 타일은 바뀌지 않음.
  - 놓기: ① 맵 오브젝트 `{ type: "combo", ref }` (직접 그린 맵 · 방 템플릿 · 혼합 층) ② 자동 생성 `autogen { enabled, where: wallFace(아래가 바닥인 벽) | wall | floor | floorNearWall | grass | water | terrain, terrains, chance(칸마다 %), max(0 = 제한 없음), spacing(칸, 체비셰프), themes([] = 모두), handmade }` — `LevelHooks.afterCreate` 끝에서 층 씨앗(`Dungeon.seedCurDepth`)으로 후보 칸을 섞어 확률 · 간격 · 최대대로(같은 층은 늘 같은 자리). 계단 · 함정 · 더미 · 식물 칸, 문 · 맵 가장자리는 피함. 목록 앞의 조합이 먼저 자리를 가짐.
  - **자동 생성 배치 방식** `autogenVersion`: 1(값 없음 — 예전 파일) = 목록 순서대로 처리 · 씨앗 `seedCurDepth×31337 + id.hashCode()×7 + 목록 순번` → 목록 순서를 바꾸면 배치가 바뀜(예전 결과 보존을 위해 그대로) · 2(새로 만드는 파일 기본) = `autogen.priority`(큰 것 먼저) → id 순 · 씨앗에서 순번 뺌 → 목록 순서와 상관없음. 조합 편집기 "자동 생성 배치 방식"에서 바꿈(확인 창 — 새 층 배치가 한 번 바뀜). 헤드리스 확인: 버전 1 단일 조합 결과 = 이전 런타임과 같음, 버전 2 목록 순서 바꿔도 같음.
  - 참조 정책: 맵 · 자동 생성은 id 로만 참조 — 조합을 고치면 다음에 만드는 층부터 반영, 이미 만든 층(세이브)은 그린 결과 그대로 (그림 · 오프셋 · 불투명도는 `MakerUserTiles` 묶음에, 광원 설정은 놓을 때 `pdm_combo_lights` 에 복사 — 복사본이 없는 예전 세이브만 지금 정의에서 광원을 찾음). 조합을 지우거나 자동 생성을 끄면 새 층에 놓이지 않을 뿐 맵 데이터는 남고, 편집기 검사가 없는 id 를 오류로 알려 줌. id 바꾸기는 맵 오브젝트 참조도 함께 고침(`listOps` `objType: combo`).
- 편집기: 목록(● 쓰는 중 = 자동 생성 켜짐 또는 맵에 놓임 / ○ 안 씀) · 새로 만들기(빈 조합 · 벽면 광원 장식 · 바닥 장식 + 함정 · 빛나는 풀) · 복제 · id 바꾸기 · 복사/붙여넣기 · 삭제 · 쓰는 곳, 미리보기(주변 칸 · 테마 타일셋 · 광원), 팔레트(타일셋 칸 · 사용자 타일 · 그림 파일 · 발광 빛무리 그림 `assets/tiles/combo_glow.png`), 스프라이트마다 레이어 · 오프셋 · 불투명도 · 겹치는 방식 · 순서 · 교체 · 복제 · 빼기 · 미리보기에서 숨기기, 광원 · 이펙트 · 지형 · 오브젝트 · 자동 생성, 밑그림 대응표(칸마다 원본 / 밑그림을 깐 모습 비교). 실행 취소는 공용 Ctrl+Z. 맵 편집기 오브젝트 "조합 타일"(팔레트에 조합 그림 · 맵에 3×3 칸으로 그림 · 광원 미리보기). 검사: 없는 조합 id · 빈 조합 · 없는 레이어 · 그림 · 이펙트 · 확률 0. 헤드리스 `eval:layerinfo`(조합 수 · id 별 · 광원 수 · 그림 묶음).

### 4.3 맵 편집기 (`editors/map.js`)

- **그리기**: 펜(B) · 사각형 · 방 · 채우기(G) · 스포이드(I, 빈 칸 오른쪽 클릭) · 선택(M) · 지우개(E — 전부 · 벽 · 바닥 · 오브젝트 · 스폰 구역 · 무작위 칸) · `[` `]` 브러쉬 크기 · Space+끌기 이동 · Z+끌기 · Ctrl+휠 확대(0.25~6배, Enter = 맞춤) · "맵 전체 지우기"(타일만 / 전부).
- **크기**: 네 모서리 손잡이(`resizeRect` → `reshape`), 점선 바깥에 그리면 그 칸까지 넓어짐, "✂ 그린 영역에 맞춰 자르기"(`trimToDrawn`). 타일 `-1` = **빈 칸(그리지 않음)** — 낭떠러지(0, CHASM)와 별개, 런타임에서 벽.
- **입구 · 출구**: 팔레트 "입구 놓기 / 출구 놓기"(여러 개). "⇱ 선택"으로 계단을 고르면 좌표 수정 · 삭제 · **이어질 맵과 짝 계단** 지정(`portPanel` · `assignPort` → 통로 연결의 `exit`/`entrance` 고정, 없으면 통로를 만듦). 계단 타일이 바뀌는 편집은 `withPorts` 가 고정 번호를 다시 맞춤.
- **오브젝트**: 종류 버튼 · 맵 오브젝트 그림 목록. 어느 도구에서든 오브젝트 위 **오른쪽 버튼** — 끌면 이동, 놓으면 메뉴(`objMenu`: 설정 · 이동… · 복제 · 대상 열기 · 삭제). 이동은 `moveObjTo` 하나로.
- **영역 · 여러 오브젝트** (⇱ 선택 도구 — 데이터 연산은 `maparea.js PDM.mapArea`, DOM 없음 · Node 테스트): 빈 곳에서 끌기 = 사각형 영역(방향 상관없음 · 맵 경계로 자름, Alt+끌기 = 오브젝트 칸에서 시작해도 영역, 그냥 누르기 = 선택 해제) · Ctrl+A = 맵 전체 · Shift/Ctrl+클릭 = 오브젝트 여러 개(다시 누르면 뺌) · 고른 것 중 하나를 끌기 = 함께 이동 · 방향키 = 한 칸(Shift 5칸, 하나라도 맵 밖이면 안 옮김) · Delete = 영역 비우기 / 고른 오브젝트 삭제 · Esc · Ctrl+D = 해제.
  - 선택 상태는 화면 상태(`floorUI[key]`: `area` · `selIds` = 오브젝트 id · `sel` = 속성 창 대표)에만 — 맵 데이터 · 실행 취소와 무관. 고치는 것은 모두 `store.edit` 한 번(실행 취소 한 번, 노드 JSON 전체 스냅샷 — 기존 편집과 같은 메모리 비용).
  - **복사(Ctrl+C)** → 클립보드 kind `maparea` `{ format: pdmaker-maparea, w, h, src, terrain, tiles{레이어}, spawn?, rand? + randSets, objects(영역 안 상대 좌표) }` (여러 오브젝트만 고르면 `objectsOnly` — 지형은 모두 빈 칸). 다른 맵 · 방 템플릿 · 다른 PDMaker 창에도.
  - **붙여넣기(Ctrl+V)** = 미리보기(마우스를 따라다니는 지형 · 오브젝트 자리 · 테두리) → 누른 칸이 왼쪽 위, 계속 눌러 반복 배치, 오른쪽 클릭 · Esc = 끝. 규칙: 원본 빈 칸(-1) = 투명(받는 칸의 지형 · 레이어 · 스폰 · 무작위 그대로) · 그 밖의 칸은 원본 그대로(레이어도 원본 칸 값, 레이어끼리 섞이지 않음) · 맵 밖 칸 · 오브젝트는 붙지 않음(맵을 넓히지 않음, 알림) · 오브젝트 = 새 id · 좌표 이동 · 나머지 속성 그대로 · 받는 자리의 기존 오브젝트는 지우지 않음 · 방 템플릿에는 노드 전용(start · 투명 출입구) 제외 · 무작위 칸은 같은 맵에서만(번호가 그 맵의 randSets) · 스폰은 받는 맵에 스폰 레이어가 있을 때만. 계단 번호는 `withPorts` 가 맞춤. 조합 타일 오브젝트는 id 참조 그대로 — 광원은 층을 만들 때 복사(§4.2.2 정책 그대로).
  - **잘라내기(Ctrl+X)** = 복사본이 올바를 때만(`mapArea.valid`) 지움 — 지우개 "전부"와 같은 규칙(지형 빈 칸 · 모든 레이어 · 스폰 · 무작위 칸 · 칸 안 오브젝트). 전역 단축키 `cut`(keys.js) → 지금 탭의 `ctx.cut`.
  - **일괄 수정**(속성 창): 고른 오브젝트 수 · 종류별 개수, 바꾼 칸만 모두에 적용(등장 조건 · 메모, 한 종류면 대상 · 함정 숨김/작동함, 몬스터 · 아이템 개수, 방 템플릿 확률), 여러 값이면 비워 보이거나 체크 상자 중간 상태. 복제… · 삭제.
- **오브젝트 종류** (`OBJECT_TYPES`): npc · mob · item(+ `container` 상자류) · event · prop(맵 오브젝트) · light(광원) · effect(이펙트) · `start`(플레이어 시작 위치) · `exit`/`entrance`(투명 출입구) · `plate`(투명 발판) — 마지막 셋 · start 는 직접 그린 노드만(`nodeOnly`).
  - `start`: `when: start`(게임 시작 때 처음 서는 맵에서 한 번) · `always`(들어올 때마다) · `from`(그 맵에서 넘어올 때), 우선순위 from > start > always. 연결 줄 `Dungeon.switchLevel` → `LevelHooks.heroSpawn`(입구가 없는 맵에서도 자리를 정함, 모두 없으면 가운데 근처). 혼합 노드는 방 위치만큼 옮김(`nodeOffset`). 오르내리기에서만.
  - `exit`/`entrance`: 그림 없이 그 칸을 계단처럼 — `W_.tiles`/`WorldGraph.tiles` 가 계단 타일 뒤에 이 칸을 붙여 같은 번호 체계. 영웅이 걸어서 밟으면 넘어감(`occupyCell` → `activateTransition`, 도착 직후 · 순간 이동은 제외 `warpCells`). 연결 대상은 이미 연결된 노드만.
  - `plate`: `ref` = 이벤트, `once`. 밟으면 발동 방식과 상관없이 실행(`eventCells` 의 `*id` / `!id`).
- **스폰 구역** 도구 "☗"(칠하기 · 사각형 · 방 채우기 / 스폰 · 금지 · 지우개) + 속성의 "몬스터 스폰".
- **맵 세부 그리기** "🖌" (`ui.paintMode`): 탭을 픽셀 편집기 화면으로 — 맵 전체 그림(`paint.image`, 칸당 16px) 저장 · 내보내기 · 타일에서 다시 만들기. 런타임 `MakerPaint`(CustomTilemap)가 켜져 있으면 지형 텍스처를 투명(`pdmaker:blank`)으로 바꿔 그린 그림만 보이고 판정은 타일 그대로.
- 광원은 맵 화면에서 같은 감쇠 · 그림자로 미리보기(§5.4).

### 4.4 방 템플릿 (`rooms/<id>.json`)

- 자동 생성 맵에 끼워 넣는 방 (`TemplateRoom` = 일반 방 · `TemplateSpecialRoom` = 특수 방). 칠할 때 `paintTemplate`, 오브젝트는 `LevelHooks.placeTemplateObjects`.
- `kind`(일반 / 특수) · `cat`(분류 `project.roomCats`, 순서 `project.roomOrder` — 목록에서 끌기) · `auto` · `autoChance` · `autoGroups`(켠 방은 모든 자동 생성 맵에 확률대로, 새 방은 기본 켬) · `keepClean`/`noMobs`(자동 아이템 · 몬스터를 놓지 않음 — `canPlaceCharacter`) · `safe` · `filter` · `previewTheme`.
- 편집 화면: 구역 색(벽 빨강 · 바닥 파랑 · 문 초록), Ctrl+끌기 = 공간 추가 · Alt+끌기 = 공간 빼기, 테마 "자동", 타일 그림 편집(게임 테마면 타일셋을 복사한 사용자 테마를 만듦).
- **변형** — 들어갈 때마다 달라짐: `variation { flipH, flipV, rotate }` → 만들어질 때 층 씨앗으로 `pickVar`(비트 1 좌우 · 2 상하 · 4 90°)를 고르고 `pdm_var` 로 저장. 크기 `vw/vh`, 칠하기 · 문 자리(`doorAllowed`) · 오브젝트 자리가 같은 변환(`src`/`dst`). **무작위 칸**: `layers.rand[칸]`(묶음 번호) + `randSets[{ name, mode: cell | all, opts: [{ t: 지형 | -2(그린 그대로), w: 무게 }] }]`(`resolve`), 오브젝트 `chance`(%). 혼합 맵의 직접 그린 방은 뒤집기 · 돌리기 안 함. 편집기: 팔레트의 무작위 칸 묶음(고른 묶음의 이름 바꾸기 · 복제 · 칠한 칸 지우기 · 삭제, 묶음 버튼 오른쪽 클릭도), 도구 "🎲 무작위 칸", 방 속성 "변형", "🎲 변형 미리보기"(런타임과 같은 계산 6개).
- **게임 기본 방**: 프로젝트 방 아래에 `levels/rooms` 의 172개(`spd-rooms.js` ← `tools/data/extract_spd_rooms.py`)가 분류별로 — 정보 창(설명 · 클래스 · 크기 · 코드 파일), 미리보기는 게임이 실제로 만든 지형 표본(`spd-room-previews.js` ← playtest `eval:roomdump`). ▪ 는 "추가 방"에 넣을 수 있고 ▫(입구 · 출구 · 전용 층 · 바탕 클래스 · 금고)는 보기만.

### 4.5 맵 오브젝트 (`props/<id>.json` · `editors/prop.js` · 런타임 `MakerProp`)

- 층에 CustomTilemap 으로 저장. 그림(`sprite.sheet · frame · scale`(0 = 설치 칸에 맞춤 · 1 = 그림 크기 그대로) · `ox/oy` · `anims { 이름: { frames, fps, loop } }`) + 상태 여러 개(`anim`/`frame`, `solid`, `switch`).
- `foot [가로, 세로]` = 설치(막히는) 칸, 놓은 칸이 왼쪽 아래(`unders` 로 원래 지형 기억). 막힌 칸은 지형 CUSTOM_DECO(23). `sprite.over` = 솟은 윗부분을 `MakerPropTop` 이 벽 층에 그려 뒤의 캐릭터를 가림.
- `pushable`(옆에서 누르면 한 칸 — 여러 칸짜리도 통째로, `goal { terrain, switch, event }`) · `interact` none/next/event(+ event · loop · cond · sound) · `stepOn` none/next/event. 연결 줄 `Hero.actMove` → `LevelHooks.propInteract`, 밟기 `onOccupy`. 코드 `MakerProp.setState(id, n)`.
- `light { on, color, k, z, range, ox, oy, pulse, pulseMin, shadow, charShadow }`(밀면 따라감) · `castShadow`(막힌 상태일 때 다른 빛을 가림, 기본 켬) · 빛 레이어(§5.1).
- 예전 형식(상태의 frames/fps/anim loop · once · pingpong)은 열 때 `sprite.anims` 로 변환, 런타임은 둘 다 읽음.

### 4.6 타일셋 · 사용자 테마 (`editors/gameart.js` "맵 그림")

- 사용자 테마 `customThemes[{ id, name, base, tiles, water, music, light* }]` — 게임 테마 타일셋을 복사해 고침. 16×16칸이면 크기 자유(가로 ÷ 16 = 한 칸 px), "배율 적용"(×0.25~×4). 게임: 연결 줄 3개(`DungeonTilemap` → `LevelHooks.hiresTiles` 가 큰 칸 필름으로, `tileImg` 가 발견 연출 · 정보 창 크기 맞춤).
- **시트 맞춤 검사** (캐릭터 · 영웅 그림, `PDM.sheetFit`): 프레임이 시트보다 크거나 애니메이션 프레임 번호가 시트 밖이면(나누어떨어지지 않는 것은 괜찮음 — 게임 시트는 2의 거듭제곱 크기로 여백을 둠)(예: 원작 영웅을 복제해 새 시트를 넣으면 12×15 · 0~20번이 남음) 경고 + 프레임 크기 후보 버튼 · "번호를 시트 안으로 줄이기" · "애니메이션을 이 시트에 맞게 새로"(영웅은 갑옷 단계 행도 0행). 애니메이션 미리보기는 64px 보다 큰 프레임을 줄여서 그림. 영웅 초상화(저장 슬롯 · 상태 창 · 영웅 창, `HeroRuntime.avatarOf`)도 게임 그림과 같은 배율로 줄임(예: 24×30 → 12×15, 최대 20px) — scale 이 아니라 그림 크기(width · height)를 줄여서, width 로 자리를 잡는 상태 창 등에서도 가운데에 옴.
- **모든 스프라이트의 "배율 적용"** (`rescale.js` `PDM.rescaleControl`, 해상도 ×0.25~×4): 그림을 가장 가까운 픽셀로 다시 만들고(짝 `<그림>_light.png` 도 함께) 설정을 고쳐 게임 화면 크기는 그대로. 게임 · 공용 그림은 먼저 프로젝트로 복사.
  - 캐릭터 · 영웅: `frame` ×f, `scale` = 지금 실제 배율(`PDM.charSpriteScale` — 0 이면 세로 24px 초과 시 15/fh) ÷ f, `res` = 배율.
  - 맵 오브젝트: `frame` ×f, `scale` > 0 이면 ÷ f (0 = 설치 칸에 맞춤이라 그대로).
  - 아이템(PNG 그림): `sprite.res`. 아이템 시트에는 16px 로 줄여 넣고, 런타임 `MakerAssets.hiresItem`(ItemSprite.frame 연결 줄)이 16px 보다 큰 PNG 는 그 그림을 텍스처로 한 칸 크기에 그림(다른 아이템에 다시 쓰이면 시트로 되돌림).
  - 사용자 타일: `size` ×f (흐르는 타일 제외). 이펙트 알갱이 그림: `fw/fh` ×f (알갱이 크기는 px 라 그대로).
  - 제외: UI 그림 · 초상화 · 타이틀 그림.
- **물 그림**: 사용자 테마의 `water` — "물 그림 만들기(바탕 테마 물 복사 → `assets/tiles/<id>_water.png`)" · 편집 · PNG 불러오기 · 바탕 테마 물로, 2×2 이음매 미리보기. 런타임 `MakerLevel.waterTex` → `LevelHooks.customWater`(`pdmaker:water:<id>` 텍스처, 비우면 바탕 테마 물). 게임 물 그림(water0~4)은 "게임 물 그림"에서 고침(그 테마 전체). 편집기 맵 화면도 물 칸을 실제 물 그림으로(`assets.themeWater` — 사용자 테마는 타일셋 사본 캔버스에 물을 묶음).
  "▦ 사용자 타일에서…": 사용자 타일을 이 테마의 **물** 로 — `waterTile`(타일 id) · `waterFxEvery`(효과는 몇 칸마다, 기본 1).
  - 그림: 런타임 `LevelHooks.customTex` 가 그 타일 그림으로 물 텍스처를 만듦(`tileWater` — 흐르는 타일 = 그림 전체, 칸 타일 = 그 칸을 32×32 이상으로 이어 붙임; 타일을 고치면 게임에도 그대로). 편집기는 미리보기용 사본 `assets/tiles/<id>_water.png`("↻ 다시 가져오기").
  - 효과 · 살펴보기 이름: `LevelHooks.afterCreate` → `MakerUserTiles.themeWater` 가 그 층의 물 칸마다 타일 id + `#water`(효과 건너뛰는 칸은 `#waterq`)로 넣음 → `finish` 가 효과(fx · gameFx) · 이름만 붙이고 그림은 덮지 않음(물가 모양 그대로). 맵에 직접 칠한 칸은 그대로.
  - 흐름: 흐르는 타일이면 `GameScene.update` 연결 줄 2개(`waterOfs -= 5 * Game.elapsed` 앞 `waterFlowY` · `water.offsetTo` 뒤 `waterFlowX`)가 그 속도(flowX · flowY)로.
- **사용자 타일** `world.userTiles[{ id, name, image, x, y, size, terrain, over, fx, gameFx, title, desc }]`: 아무 그림(게임 타일셋 · 사용자 테마 · PNG)의 한 칸(`size` px, 기본 16)을 타일로. `terrain` = 칠할 때 지형(-2 = 칠한 칸의 지형 그대로 — 그림만 덮음), `over` = 캐릭터 위에(지붕 · 가지). 맵 그림 화면에서 칸 고르기(그림 격자 클릭) · 그림 고치기 · 새로 그리기 · 복제 · 쓰는 곳. 맵 편집기 팔레트 "사용자 타일"(칠하기 · 사각형 · 채우기 · 지우개, 오른쪽 클릭 = 그 칸의 타일 고르기) → 노드 · 방 템플릿의 타일 레이어 `layers.tiles[레이어][칸] = id`(§4.2.1). 런타임 `MakerUserTiles`: `MakerTileLayers.putCell` 로 모으고 `LevelHooks.afterCreate` 가 `finish` 로 레이어 순서대로 (레이어 · 그림 · 칸 크기) 묶음마다 CustomTilemap 하나(customTiles 또는 customWalls), 칸 배치는 세이브에 저장. 직접 그린 맵 · 혼합 맵 · 방 템플릿에서. 헤드리스 `eval:waterhere`.
- **흐르는 그림 타일** (물 그림을 사용자 타일로): `flow` · `flowX` · `flowY`(px/초, 게임 물 0 · -5) — 그림 고르기에 게임 물(water0~4) · 사용자 테마 물이 있음, "+ 효과 타일"에 "흐르는 물 그림" · "빛나는 물(물 + 치유의 샘)". 런타임 `MakerUserTiles.FlowTiles`(칸마다 SkinnedBlock, 세상 좌표 + 시간으로 오프셋 → 이음매 없이 흐름, 다른 사용자 타일 · 효과 아래). 효과 · 살펴보기 이름도 함께. 편집기는 이어 붙인 멈춘 모습.
- **효과 타일** (희생의 재단 · 연금술 솥 · 하수도 배수구처럼 효과가 붙은 타일): 사용자 타일의 `gameFx`(게임 효과 — sink 배수구 물방울 · torch 감옥 횃불 · vein 광맥 · smoke · greenflame · stream · alchemy 솥 거품 · sacrificial 희생의 불꽃 · healing · flame · sparks) · `fx`(effects.json — `MakerEffect.place`) · `title`/`desc`(살펴보기 창). `image` 를 비우면 그림 없이 지형(칠할 때 지형)의 원래 그림 + 효과. 맵 그림의 "+ 효과 타일 (게임 프리셋)"(재단 · 솥 · 배수구 · 횃불 벽 · 샘 · 연기 벽 · 광맥 · 초록 불꽃). 런타임: `finish` 가 칸마다 효과를 놓음 — `MakerUserTiles.GameFx`(CustomTilemap, 지형 층에 효과 Gizmo 를 붙임): 공개 클래스(PrisonLevel.Torch · CityLevel.Smoke/GreenFlame)는 그대로, 지역 전용 비공개 장식(SewerLevel Sink · CavesLevel Vein · HallsLevel Stream)은 `Level.map` 을 잠깐 그 칸만 해당 지형으로 바꾼 채 `add…Visuals` 를 불러 그 칸 것만 만듦, 솥 · 재단 · 샘 · 불꽃은 게임 입자(Speck.BUBBLE · SacrificialParticle · Speck.HEALING · FlameParticle · SparkParticle)를 `CellEmitter`(영웅이 보는 칸만)로. 이름 · 설명이 있으면 `image()/name()/desc()` 로 살펴보기 창(그림 없는 타일은 지형 그림). 편집기 맵 화면 · 팔레트에 ✦ 표시. 헤드리스 `eval:cellname,x,y`.
- 타일셋 · 물 그림을 픽셀 편집기로 열면 옆에 **실시간 미리보기**(`levelpreview.js` — 게임이 만든 층 표본 `spd-level-previews.js`, 바닥 · 벽 타일 칸 번호까지 담아 벽 이어 붙이기가 게임과 같음).
- 타일 효과(빛) 레이어 · 번짐 → §5.2 · §5.3.

---

## 5. 빛 · 화면 연출

### 5.1 빛 레이어 (스프라이트)
- 스프라이트 시트 옆 `<시트>_light.png`(같은 크기 · 같은 프레임 배치)를 그림 위에 합성 — 맵 오브젝트(`MakerProp.Vis` · `MakerPropTop`)와 캐릭터(`MakerSprite.draw`).
- `sprite.lightMode` add(더하기) · screen · overlay · dodge, `lightPower`(%) · `lightPulse`(초) · `lightPulseMin`(%) → `MakerRuntime.lightTexture / lightAmount / drawLight`. GL 블렌드: screen = ONE_MINUS_DST_COLOR, ONE · dodge = DST_COLOR, ONE(화면 × (1+색) 근사) · overlay = DST_COLOR, SRC_COLOR. add 가 아닌 방식은 색을 미리 손본 텍스처를 씀.
- 편집기: `pixelEditor({ light })` 의 레이어 전환(그림 / 빛 — 되돌리기에 레이어 포함), 어두운 배경 + 캔버스 합성 미리보기, `editPixelsModal(opts.light)` 가 `_light.png` 를 같이 열고 저장.

### 5.2 타일 효과(빛) 레이어
- 사용자 테마 타일셋 옆 `<타일셋>_light.png`(같은 칸 배치) — 그 타일 종류 전체가 빛남(용암 · 수정 · 발광 이끼). 테마의 `lightMode / lightPower / lightPulse / lightPulseMin`.
- 런타임 `MakerTileLight`(CustomTilemap, `beforeScene` 에서 넣고 뺌): `LightMap extends DungeonTerrainTilemap` 이라 지형과 같은 규칙으로 칸마다 타일을 고르고 텍스처만 바꿈, 0.2초마다 지형 변화 확인, 안개 아래. 벽 윗면 · 물은 대상 아님.

### 5.3 번짐 (블룸)
- 빛 레이어를 가우시안으로 흐리게 해 칸보다 넓게 더함. `lightBloom`(반경 px) · `lightBloomPower`(%) — 스프라이트 · 사용자 테마.
- 런타임 `MakerBloom`(여백을 둔 흐린 아틀라스를 낮은 해상도로 만들어 LINEAR 로 늘림, GL_ONE · GL_ONE). 각 그림 바로 위에서 그림 (맨 위 빛 층으로 미루면 자기 그림까지 하얗게 덮어서 되돌림). 영웅이 지금 보는 칸에서만.

### 5.4 광원 (`MakerLights` — GameMaker 조명 방식)

**감쇠식**: `밝기 = k / (sqrt(d² + z²) − z)` (d = 거리 px, z = 높이 — 클수록 넓고 부드럽게, k = 세기). 범위 끝 값을 빼서 0 으로 떨어뜨리고, `1 − e^−x` 로 눌러 0~1 로 만듦(세기를 높여도 흰 덩어리가 되지 않음). 셰이더 · 예전 방식 · `Lit.at` · 편집기 미리보기 모두 같은 식.

**광원 종류**
| 종류 | 데이터 | 설명 |
|---|---|---|
| 광원 오브젝트 | 맵 오브젝트 `light { color, k, z, range(칸), pulse, pulseMin, cond, shadow, charShadow }` | 직접 그리기 · 혼합 노드. `cond` 는 0.5초마다 재검사 |
| 맵 오브젝트의 빛 | prop `light { on, … , ox, oy }` · `castShadow` | 밀면 따라감, 막힌 상태면 다른 빛을 가림 |
| 지형 광원 | 노드(없으면 그룹) `terrainLights [{ terrain, color, k, z, range, pulse, pulseMin }]` | 그 지형 칸마다 칸 가운데에서 빛 (발광 호수 · 용암). 그림자 없음, 한 설정당 한 번에 그림(셰이더 `uMode 3`, 깜빡임은 칸 위치로 박자를 어긋나게). 자동 생성 칸에도 `Level.map` 으로 |
| 자동 광원 | 노드(없으면 그룹) `autoLights [{ terrain, chance, max, spacing, ox, oy, cond, + 광원 설정 }]` | 그 지형 칸에 **점광원**(그림자 있음)을 자동 배치 — `autoCells` 가 `Dungeon.seedCurDepth()` 로 섞고 확률 · 간격 · 최대 개수로 고름 (같은 층이면 같은 자리, 저장 안 함) |
| 아이템의 빛 | 아이템 `light { on, carried, ox, oy, + 광원 설정 }` | 바닥 더미 맨 위면 그 칸, `carried` 면 영웅이 지녔을 때 영웅에서 |
| 이펙트의 빛 | `effects.json` 항목 `light { on, + 광원 설정 }` | `MakerEffect.Sys` → `MakerLights.addFx`(`FxLight`), 가운데를 따라가고 한 번 재생이면 살아 있는 알갱이 수 ÷ 최대치로 어두워짐 |

**그리는 층 · 얹는 방식**
- `MakerLights`(CustomTilemap)는 `customWalls` 맨 끝 — 벽 · 캐릭터 · 맵 오브젝트(윗부분 포함) 위, 안개 아래. 영웅이 지금 못 보는 칸(`heroFOV`)은 빛 지도에서 0 → 다른 방 · 벽 너머에 빛이 남지 않음.
- 빛 지도는 `화면 × (1 + 빛)`(GL_DST_COLOR, GL_ONE) + `빛 × 0.3`(GL_ONE, GL_ONE · `GLOW`) — 맨 위에 있어도 그림이 흰색에 묻히지 않음. 편집기는 반 세기 color-dodge + lighter 0.3 으로 흉내.
- 프로젝트에 빛나는 아이템 · 이펙트가 있으면(`anyDynamic`) 광원이 없는 맵에도 빛 층을 넣음. 테스트 플레이 로그에 `[PDMaker] 광원 v4: 이 맵의 점광원 N개` · `빛 지도 + 그림자 볼륨`.

**그림자 (shdShadow/shdLight 방식)**
- 화면 크기(게임 1px = 2px)의 광원 버퍼(`FrameBuffer` + 깊이 버퍼)에 광원마다 ① **그림자 볼륨** — 빛을 가리는 상자(벽 칸 = `solid && losBlocking`, 막힌 맵 오브젝트 = 설치 칸 2px 안쪽)에서 **광원에서 등진 변**만(벽은 열린 칸 · 맵 바깥과 맞닿은 변만 — `Verts.faces`) 광원 반대쪽으로 늘인 사각형을 깊이에만 씀. 벽 칸 자체는 다 밝고 그 뒤만 어두움 (예전에는 상자의 대각선 두 개를 써서 벽 칸 안쪽 절반이 자기 그림자에 덮여 벽을 따라 마름모 무늬가 생겼음 — 편집기 미리보기 `cellpick.js` 도 같은 방식) ② **빛** — 범위 사각형에 감쇠식(셰이더), 깊이 검사(GL_LESS)로 볼륨 뒤는 빠짐. 광원 i 의 빛 z = 0.9 − 0.008·i, 그림자 z = 빛 z − 0.004 (앞 광원의 그림자가 뒤 광원을 가리지 않음 — 깊이 버퍼는 프레임에 한 번만 지움). 광원이 벽 칸 안이면 그 칸은 뺌.
- 셰이더 `MakerLights.LightScript`(noosa `Script`), 그린 뒤 뷰포트 · 가위 · 텍스처 바인딩 · **GL_BLEND** 를 되돌림. 버퍼를 못 만드는 기기에서는 예전 방식(광선 240개 → 부채꼴 + 구운 빛 그림).
- **캐릭터 그림자**(`charShadow`): 빛 반대쪽으로 늘어진 타원을 같은 깊이 단계에(알파 0.3 미만 버림) → 그 광원의 빛만 빠짐. 캐릭터 몸 자리는 깊이를 되돌려 자기 그림자에 덮이지 않음. 광원에서 보이는지는 CPU 광선(`Reach` · `sees`).

**편집기**: `PDM.lightFields(key, path, o, { area })`(색 · 세기 · 부드러움 · 범위 · 그림자 · 깜빡임 + 미리보기) · `PDM.drawLightPreview(g, cx, cy, o, s, { block })`(`cellpick.js`) — 맵 화면에서 같은 감쇠 + 같은 그림자 볼륨(destination-out). 빛을 가리는 지형 = `PDM.TERRAIN` 의 `blockLight`, 막힌 맵 오브젝트 = 시작 상태 solid + `castShadow`. 이펙트 미리보기도 같은 규칙으로 빛을 그림.

### 5.5 이펙트 · 파티클 (확장 `effects` · `editors/effect.js` · 런타임 `MakerEffect`)
- Defold ParticleFX 구성. `effects.json { list: [{ id, name, sound, light, emitters: [E], modifiers: [M] }] }`.
  - E 이미터 `{ name, x, y, rot, mode once|loop, duration, delay, startOffset, space world|emitter, max, burst, type circle|box|cone, blend alpha|add|mult|screen, orient default|initial|movement, inheritVel, stretchVel, sprite { png, fw, fh, frames, fps, anim none|life|loop|random }, color, colorSp, 이미터 속성 {v, sp, pts}: rate sizeX sizeY life speed size alpha rot0 stretchX stretchY angVel, 수명 속성 {v, pts}: lScale lAlpha lRot lStretchX lStretchY lAngVel, lColor [[t,hex]], modifiers [M] }`
  - M `{ type accel|drag|radial|vortex, mag {v,sp,pts}, x, y, rot, maxDist }`. 곡선 pts = 꺾은선(이미터 속성은 진행 0~1, 수명 속성은 알갱이 수명 0~1).
- 편집기: 이미터 탭, 값 ± 퍼짐 + 곡선, 색 그라데이션, 알갱이 그림(고르기 · 직접 그리기 · 기본 모양 7종 `assets/fx/shapes/` · 노드 합성기로), 미리보기(`Sim` — 런타임과 같은 계산, 끌면 따라옴, 빛 포함).
- 런타임: `Sys`(Group, GameScene effects 층) › `Em`(이미터별, 블렌드) › `P`(Image). 반복 이미터는 맵에 놓았을 때(`Spot`)만 반복.
- 쓰는 곳: ① 맵 오브젝트 `effect` → `MakerEffect.Spot`(시야 안에서만) ② 아이템 `fxUse` · `fxThrow` · `fxEquip` ③ 이벤트 명령 `effect { fx, at: char|xy, target, x, y }`.
- 노드 합성기 연동: 합성기 → "🎇 이펙트 알갱이로…"(`toEffect`, 저장 때마다 `syncEffects`), 이펙트 → "🧩 노드 합성기로…"(`PDM.compose.forEffect`), 합성기 노드 `effect` 가 `PDM.effects.bake`(씨앗 난수로 프레임 굽기).

### 5.6 화면 필터 (확장 `filters` · `editors/filter.js` · 런타임 `MakerFilter`)
- `filters.json { list: [{ id, name, overUI, inType, outType, inSec, outSec, layers }] }`. 층: `tint`(색 · 진하기 · 더하기 · 깜빡임) · `image`(반복 무늬 — 배율 · 흐름 · 튐 · 시트 프레임, `fit: stretch` = 한 장 늘려 덮기) · `vignette`(조리개) · `letterbox`(띠, side tb|lr) · `flash` · `shake` · `code`(JS/CSS 를 편집기가 PNG 시트로 구움 — 게임에서 코드는 실행되지 않음, 여러 프레임이면 `_anim.png` APNG 도).
- 적용 우선순위: 이벤트 명령 `filter`(set/map/off → StoryState `__filter`, 저장됨) → 영웅이 있는 방 템플릿 → 노드 → 그룹 → 테마(`world.themeFilters { "SEWER" | "custom:<id>": 필터 id }` — 맵 그래프 월드 설정 "테마별 화면 필터"). 노드 필터는 맵 화면 설정과 맵 그래프 노드 속성 창 양쪽에서(확장이 꺼져 있으면 "켜기" 링크). 런타임은 UI 아래 · 위 `Host` 두 개, 바뀌면 이전 것을 `leave()` 시키고 새것을 나타냄(fade · dissolve(16단계 점 무늬) · slide · none). 대사창이 UI 를 숨겨도 필터는 그대로.
- 예시: 비 · 폭풍우 · 눈 · 안개 · 밤 · 노을 · 노이즈 · 주사선 · 글리치 · 위험 · 조리개 · 깨진 유리 · 훑는 빛. 기본 그림 `assets/filters/*.png`.

### 5.7 글자 연출 (APNG) (확장 `textfx` · `editors/textfx.js` · 런타임 `MakerTextFx`)
- `textfx.json { list: [{ id, name, text, font, size, color, stroke, glow, w, h, bg, inFx, hold, outFx, loopFx, perChar, stagger, css, fps, loop, apng, sheet … }] }` — 설정으로 HTML/CSS(@keyframes 프리셋 + 직접 CSS)를 만들고, shadow DOM 에서 Web Animations 를 시간별로 멈춰 SVG foreignObject → 캔버스로 프레임을 찍음.
- 탭: 텍스트(서브 텍스트 · 세로쓰기 · 쪽 나누기) · 폰트(`fontFile` → `assets/fonts`) · 움직임(등장 24 · 퇴장 18 · 표시 중 10종) · 장식 · 배경/배치 · CSS. 템플릿 16종.
- 내보내기: APNG(직접 조립 — acTL/fcTL/fdAT, 공용 모션 코어 `PDM.motion.encodeApng` · 프레임 찍기도 `PDM.motion.shoot`) `assets/fx/<id>.png` + **게임용 격자 시트** `<id>_sheet.png`(게임은 APNG 를 못 읽음) · PNG · 연번 PNG(ZIP).
- 게임: `MakerTextFx.show(id, pos, 너비%, 반복, done)`(uiCamera 위), 이벤트 명령 `textfx { fx, pos, width, loops, nowait }`.

### 5.8 예고편 컷신 (확장 `textfx` 에 포함 · `editors/trailer.js` · 런타임 `MakerTrailer`)
- `trailers.json { list: [{ id, name, style simple|band|frame, bg, bgAlpha, text, accent, skippable, fade, scenes }] }`. 장면: `title`(title · sub) · `char`(1~2명: 그림은 정한 그림 → 초상화 → 스프라이트 첫 칸, 이름 · 소개는 비우면 캐릭터 것) · `copy` · `credit`(lines · date · countdown → D-n), 장면마다 `sec`.
- 이벤트 명령 `trailer { id, nowait }`. 영상이 아니라 UI 카메라 위에 실시간으로 그림(화면을 누르면 다음 장면).

### 5.9 노드 합성기 (확장 `compose` · `editors/compose.js` · `compose.json`)
- 숫자 칸(식도 넣을 수 있는 글 칸): 숫자만 들어 있으면 마우스를 올리고 휠로 ±1 (Shift ±10 · Alt ±0.1) — 다른 편집기의 숫자 칸과 같은 손맛. 식이 들어 있으면 휠은 건드리지 않음.
- 노드를 이어 배경 타일 · 오브젝트 스프라이트를 만드는 그림 합성 도구. 그래프 `{ w, h, out, frames, fps, cols, nodes[{id,type,x,y,p}], links[{from,to,port}] }`, 노드마다 출력은 w×h 캔버스. 계산은 편집기에서만, 게임에는 PNG 만.
- 노드: 입력(그림 · 직접 그리기 · 단색 · 그라데이션 · 노이즈 · 도형 · 무늬 · 시트 칸 · 글자 · 파티클 · 이펙트) / 변형(이동 · 회전 · 크기 · 반복 · 뒤집기 · 픽셀화 · 대칭 · 물결 · 밀어내기) / 색(색조 · 채도 · 밝기 · 팔레트 · 색 바꾸기 · 반전 · 외곽선 · 그림자 · 투명도) / 합성(겹치기 · 마스크) / 효과(흐림 · 빛 번짐 · 넓히기/깎기 · 입체감) / 출력.
- 숫자 칸에 식(`t` 0~1 · `frame` · `frames` · `pi` · sin/cos/abs/floor/min/max/rand — 허용한 이름만) → 프레임마다 계산(`evaluateAll`), 여러 프레임이면 시트(`toSheet`) · APNG.
- 연동: 결과를 오브젝트 그림 · 아이템 그림 · 사용자 테마 타일셋 칸 · 이펙트 알갱이 · 화면 필터 층에 바로 넣기, 픽셀 편집기 "🧩 노드 합성기에서 편집"(`PDM.compose.fromImage`). `PDM.compose = { TYPES, evaluate, render, … }`.

### 5.10 모션 랩 · 모션 코어 (확장 `motion` · `editors/motion.js` · 공용 `motioncore.js` · `motion.json`)
CSS 를 쓰던 곳(화면 필터의 코드 층 · 글자 연출)의 굽는 부품을 하나로 모으고, 그 위에 "움직이는 그림을 만들어 여러 곳에 보내는" 편집 화면을 둠. 게임 안에서 코드가 도는 것이 아니라 편집기에서 구운 그림(격자 시트 PNG)이 들어감.
- **모션 코어** `PDM.motion` (motioncore.js — 모든 편집기보다 먼저 실림):
  - `mount(doc, host, zoom)` · `shoot(doc, times)` — HTML · CSS 를 화면 밖 shadow 상자에 올리고 모든 애니메이션(Web Animations)을 멈춘 뒤 시각마다 `currentTime` 을 맞추고, 애니메이션이 바꾸는 속성의 계산된 값을 `[data-k]` 규칙으로 박아 SVG foreignObject 로 찍음 → animation-delay · 글자마다 어긋난 시작 · ::before/::after · CSS 변수까지 그대로 (예전 글자 연출 방식을 공용으로. 예전 필터 코드 층은 모든 요소에 같은 음수 delay 를 덮어써서 어긋난 시작이 사라졌음).
  - `renderSrc(src)` — `src = { lang: css | js, html, code, w, h, frames, fps, seed, pixel }`. CSS 는 html 이 비면 그림 전체를 덮는 `<div class="fx">`(화면 필터 코드 층과 같은 약속), JS 는 `function (g, w, h, t, frame, frames, rand)`.
  - `pixelize(frames, pixel)` 픽셀 아트로 굽기 — `px`(덩어리: 칸 평균색으로 줄임, `keep` 이면 다시 키움) · `alphaCut`(반투명 경계 자르기) · `palette`(편집기 기본 팔레트 `PDM.PALETTE` | 색마다 단계 수 `levels`) · `dither`(4×4 바이어) · `outline`(1칸 외곽선).
  - `sheet(frames)`(가로 2048 이하 격자) · `encodeApng` · `bake(src, png)`(시트 + 옆에 `…_anim.png` APNG) · `exportApng`.
- **모션 랩** `motion.json { list: [{ id, name, lang, html, code, w, h, frames, fps, seed, pixel, out, baked { fw, fh, frames, fps, cols, apng } }] }`:
  - 왼쪽 코드(HTML · CSS 또는 JS) · 크기 · 프레임 · 초당 프레임 · 픽셀 설정, 오른쪽 실시간(코드 그대로 — CSS 는 shadow 상자에서 실제로 돌고 JS 는 프레임을 차례로) · 구운 결과(게임에 들어가는 그림) 재생, 확대 · 배경.
  - 예시 (묶음 메뉴 — 새로 만들기 · "📋 예시로 바꾸기"(지금 항목의 코드 · 크기 · 프레임 · 픽셀 설정을 바꿈, 직접 지은 이름은 그대로) · "🎞 예시 둘러보기"(실제 코드가 도는 갤러리)):
    - 기본(픽셀 게임 움직임): 빈 CSS · 반짝이는 별 · 퍼지는 고리 · 도는 마법진 · 흐르는 물결 무늬(이어 붙임) · 글자가 하나씩 튀어 오름 · 떠오르는 불티(JS) · 일렁이는 불꽃(JS) + 화면 필터 예시(훑는 빛 · 깨진 화면).
    - 웹 모션 24종 (`editors/motion-presets.js` — `PDM.MOTION_WEB_PRESETS` · `PDM.MOTION_PRESET_GROUPS`): 등장 01–08(페이드 인 · 슬라이드 인 · 스태거 · 텍스트 리빌 · 마스크 리빌 · 블러 인 · 타이프라이터 · 카운트업) / 스크롤 연동 09–16(읽기 진행률 · 패럴랙스 · 스크롤 줌 · 이미지 시퀀스 · SVG 라인 드로우 · 텍스트 필 · 배경색 트랜지션 · 마키) / 고정 · 전환 · 내비게이션 17–24(스티키 · 핀 고정 + 스크럽 · 스크롤텔링 · 카드 스택 · 스크롤 스냅 · 가로 스크롤 · 숨김 헤더 · 스크롤스파이). 게임 그림에는 스크롤이 없으므로 시간이 스크롤 대신 진행을 끌고 감. 바깥 그림 없이 그라데이션 · 도형 · 인라인 SVG, `animation-fill-mode: both` + 끝 모습 유지 구간으로 끊김 없이 반복.
  - 코어 약속: `.fx` = 그림 전체 상자, HTML 은 그 안에 들어감(자기 `.stage` 가 있으면 — 글자 연출에서 가져온 것 — 그대로). `@property` 는 문서 전체에 등록(`registerProps` — shadow 상자 안의 @property 는 무시되므로)하고, `@keyframes` 안의 CSS 변수도 프레임마다 박아 넣음(getKeyframes 가 알려 주지 않음) → CSS 변수 애니메이션(카운트업 등)도 그대로 구워짐.
  - 💾 굽고 저장(`out`, 기본 `assets/motion/<id>.png`) · APNG 내보내기.
  - ➜ 보내기 (`lab.SEND` — `targets()` · `apply(모션, 대상)`): 화면 필터 층(`code` 층 + `motion: <id>` — 필터에서 "다시 굽기"하면 모션의 코드 · 크기 · 픽셀 설정을 따름, 새 필터도 만들 수 있음) · 이펙트 알갱이(`sprite { png, fw, fh, frames "0-n", fps, anim loop }`) · 맵 오브젝트(`sprite.sheet · frame` + `anims.motion` · 첫 상태의 anim) · 노드 합성기 그림 노드(첫 장 `…_still.png`) · 아이템 그림(첫 장).
  - ⤓ 가져오기: 화면 필터의 코드 층(모션으로 옮기고 그 층은 `motion` 으로 이어짐) · 글자 연출(`PDM.textfx.build` 결과 HTML · CSS 그대로 — 직접 다듬기용, 등록한 글꼴 · 넘치면 줄이기는 빠짐).
  - `listOps` 의 `fields: ['motion']` — 쓰는 곳 · id 바꾸기가 화면 필터 층의 `motion` 도 따라 고침.
- 화면 필터의 코드 층: "🎞 모션 랩 항목으로 그리기" 고르기(이어지면 코드 칸 대신 "모션 랩에서 열기" · 다시 굽기) · "모션 랩으로 옮기기".

---

## 6. 영웅

원본 `actors/hero` 구조를 데이터로: `HeroClass`(시작 장비) · `Hero`(체력 · 힘) · `HeroSubClass`(전직) · `ArmorAbility`(직업 능력) · `Talent`(특성 1~4단계) · 성직자의 `HolyTome` + `ClericSpell`(주문서 · 주문) + mod-2 `NewOverHeat`(게이지 · 원소). 예전 "스킬 시스템"(skills · signature)은 열 때 주문으로 바꿈.

### 6.1 데이터 (`heroes/<id>.json` · `editors/hero.js`)

```jsonc
{ "id": "aria", "name": "아리아", "enabled": true,
  "baseClass": "",               // 바탕 직업(HeroClass 이름). 비우면 "완전히 새 영웅"(§6.6)
  "character": "aria",           // 대사 화자 · 초상화로 쓸 캐릭터
  "sprite": { "sheet": "assets/sprites/heroes/aria.png", "frame": [48, 60], "scale": 0.25,
              "anims": { "idle": {…}, "run": {…}, "attack": {…}, "zap": {…}, "die": {…}, "dead": {…}, "operate": {…}, "fly": {…}, "read": {…}, "<추가>": {…} },
              "tierRows": [0, 1, 2, 3, 3, 3, 3] },   // 갑옷 단계(0 없음 · 1~5 · 6 직업 갑옷) → 시트 행
  "stats": { "hp": 18, "hpPerLevel": 4, "str": 10, "attackSkill": 10, "accPerLvl": 1, "defenseSkill": 5, "evaPerLvl": 1, "unarmedMin": 1, "unarmedMax": 4, "speed": 1, "viewDistance": 8 },
  "startGold": 30, "knownItems": [],
  "inventory": { "clearDefault": false, "items": [ { "item": "spd:PotionOfHealing", "count": 1, "equip": false, "quickslot": true, "fromGame": false } ] },
  "spellbook": { "enabled": true, "name": "원소의 서", "image": 246, "charges": 3, "rechargeTurns": 35 },
  "spells":     [ { "id": "fire_bolt", "name": "불꽃 화살", "tier": 1, "icon": 19, "cost": 1, "cooldown": 0, "unlockLevel": 1, "requiresTalent": "", "subclass": "", "ability": "", "cond": "",
                    "target": "enemy", "range": 6, "projectile": true, "visual": "fire", "time": 1, "heat": 4, "effects": [ { "type": "damage", "min": 3, "max": 7, "perLevel": 1 } ] } ],
  "subclasses": [ { "id": "overheat", "name": "백열의 마녀", "icon": 17, "base": "", "shortDesc": "…", "desc": "…", "effects": [ { "stat": "codexPct", "value": 15 } ], "active": {…}, "code": {} } ],
  "abilities":  [ { "id": "white_heat", "name": "백열", "icon": 19, "chargeUse": 25, "target": "cell", "range": 6, "effects": [ … ], "code": {} } ],
  "talentTiers": [ { "name": "견습", "unlockLevel": 2, "points": 5 }, …, { "unlockLevel": 13, "requires": "subclass" }, { "unlockLevel": 21, "requires": "ability" } ],
  "talents":    [ { "id": "storm_study", "name": "폭풍 연구", "tier": 2, "maxPoints": 2, "icon": 5, "desc": "…", "pointText": ["+1", "+2"],
                    "requires": "ember_focus", "requiresPoints": 1, "subclass": "", "ability": "", "effects": [ { "type": "unlockSpell", "spell": "storm_lance" } ], "code": {} } ],
  "talentCapRaised": false, "nativeTalents": false,
  "passives":   [ { "name": "고른 호흡", "unlockLevel": 1, "effects": [ { "stat": "regen", "value": 8 } ] } ],
  "select": { "title": "", "desc": "", "info": "", "illust": "", "fit": "right|full", "frameW": 0, "frameH": 0, "frames": "", "fps": 0, "icon": "" },
  "unlock": { "mode": "always|game|badge|global|cond", "badge": "", "key": "", "cond": "", "text": "" },
  "code": { "imports": "", "members": "", "attackProc": "…", "onKill": "…" } }
```

- 적용 시점: 새 게임 `Dungeon.init()` 의 `initHero` 뒤 `HeroRuntime.afterInit`. `project.startHero` 가 있으면 그 영웅, 없으면 선택 화면에서 고른 영웅(`HeroSelect.selected` → `HeroRuntime.pick`).
- 능력치 `stats`: 명중 · 회피는 원래 계산의 배율(무기 · 버프 · 힘)을 두고 기본값 비율만 바꿈. **능력치 보너스**(`HeroRuntime.bonus` = 특성 + 전직 + 게이지 단계 + 원소): hp · accuracy · evasion · damage · armor · speed% · charges · recharge% · regen · damagePct · takenPct · castPct · codexPct. 패시브: hp · str · regen · gold · charges.
- 편집기: 헤더에 "id 바꾸기…"(시작 영웅 · 순서 · 참조도 같이) · "데이터 파일 보기" · "코드 파일 보기"(`gen/H_<id>.java`) · "게임 코드 보기 (HeroClass)". **기본** 칸의 이름 = 선택 화면 제목 = 리소스 목록 이름. 순서 = `project.heroOrder`(목록의 ▲▼).

### 6.2 시전 · 주문 · 전직 · 직업 능력
- **시전 엔진 `MakerCast`** (주문 · 직업 능력 · 코덱스 · 폭주 · 원소 공용): 대상 self · enemy · ally · cell · adjacent, 사거리, 날아가는 효과(`visual`, `projectile`), 효과 damage(min~max + perLevel + 최대 체력 %) · heal · shield · buff · knockback · blink · summon · gauge · event · heart · code, `chance`, on target/self/area. 피해 × (1 + castPct%).
- **주문** (`MakerSpells`): 주문서(퀵슬롯) → 주문 창(`WndClericSpells` 모양, 길게 = 빠른 시전). 배운 것만(레벨 · 특성 · 전직 · 능력 · 조건). 충전은 영웅이 가짐, `rechargeTurns` 마다 1 × (1 + recharge%). 주문서 그림 = 게임 아이템 번호 · 파일 · 그리기.
- **전직** (`MakerAbilities`): 연결 줄 `TengusMask.execute` → `WndMakerSubclass`. `base` 가 있으면 `hero.subClass` 도 그 값(원작 전직 효과 함께). 영웅 창 이름 = 전직 이름(`Hero.className` 연결 줄).
- **전직 액티브** (`subclasses[].active`, `MakerActive`): 조건(kill · hit · damaged · lowHp · always · code)을 `need` 번 채우면 행동 버튼이 켜지고, 누르면 효과 목록. `window` · `cooldown` · `message` · `readySound` · `color`.
- **직업 능력**: 연결 줄 `HeroClass.armorAbilities()` → `MakerArmorAbility` 목록. 원작 왕관 창 · 직업 갑옷 · 갑옷 충전을 그대로, `chargeUse` 만큼 쓰고 발동.
- **아이콘** (전직 · 능력 · 주문 · 원소 · 액티브 · 특성): 숫자 = 게임 시트 칸(hero_icons / talent_icons — mod-2 는 크기 · 칸 수가 달라 에디터가 연결된 시트를 보고 맞춤), `"assets/icons/x.png"` = 한 장, `{ file, size, index }` = 시트의 칸, 또는 직접 그리기. 런타임 `MakerAssets.installHeroIcons` 가 hero_icons 아래에 붙여 번호를 줌, 특성은 `MakerTalentsPane.talentIcon` 이 그림.
- 이벤트 명령: "전직 · 직업 능력 고르기"(가면 · 왕관 없이) · "게이지 · 원소 바꾸기" · "주문서 충전". 조건식 `hero.subclass` · `hero.ability` · `hero.gauge` · `hero.element` · `hero.charge`.

### 6.3 특성
- 포인트: 단계마다 `min(points, 레벨 − unlockLevel + 1)` − 쓴 포인트(원작과 같음). `requires`: 3단계는 전직 뒤, 4단계는 직업 능력 뒤(전직 · 능력이 없는 영웅이면 무시). 특성의 `subclass`/`ability` = 그 전직 · 능력일 때만.
- **최대 포인트는 원작처럼 4** — `talentCapRaised: true` 면 10 까지 (`MakerTalents.maxPts`). 편집기도 한도를 넘는 값에 경고.
- 효과(포인트 × perPoint): `stat` — 위 능력치 + str/gold/view(한 번) · `spell` — 주문 · 능력 · 코덱스 id(`*` = 전부)의 damage · amount · turns · radius · range · cost · chargeUse · cooldown · count · power · `unlockSpell`.
- **게임 화면**: 연결 줄 `WndHero.TalentsTab` → `MakerTalentsPane`. 위 = 전직 · 직업 능력 · 주문 아이콘, 아래 = 단계별 특성(원작처럼 1단계는 레벨 전에도 빈 별로, 아직 열리지 않은 단계는 "레벨 N 이 되면 특성이 더 열립니다." 한 줄). `Hero.talentPointsAvailable` 연결 줄로 초상화 반짝임 · 남은 포인트 알림도 이 포인트. 특성 데이터가 없는 영웅이나 `nativeTalents: true` 는 게임 원래 특성 창.
- 코드: `HeroRuntime.talent("id")` = 포인트, 훅 `onTalentUp`. 저장 `pdm_tal_*`. 편집기: 단계 설정(원작 기본값 버튼) · 열 트리 · 포인트별 설명 · 선행 특성 · 레벨 → 포인트 계산기. 검사: id 중복(주문 · 능력과도), 없는 참조, 단계 범위.

### 6.4 게이지 · 특수 기능
- **특수 기능은 코드로** (`Special`): 영웅만의 시스템(게이지 · 스택 · 충전 · 자세)은 영웅 코드에서 조합 — 값 `Special.get/set/add(key, n[, min, max])`(저장됨), 버프 칸 `Special.show(key, 이름, BuffIndicator 번호, 최대, 설명)` · `color` · `hide`, 행동 버튼 `Special.button(id, 이름, HeroIcon 번호)` · `removeButton`(누르면 훅 `onAction(hero, id)`). 코드 칸 "특수 기능 만들기" 예시 3개(과열식 게이지 · 연속 공격 스택 · 충전 행동 버튼).
- **예전 게이지 데이터** (`gauge` — mod-2 NewOverHeat, `MakerGauge.Buf`): 켜 둔 예전 프로젝트에서만 "예전 기능"으로 보이고 계속 동작. 턴마다 sameElement · afterUse 또는 −idle, 단계 · 원소 능력치, 최대면 `delay` 턴 뒤 폭주 후 `resetTo`, 원소를 바꾸면 −switchCool%. 바탕 직업의 게이지 버프(`replaceNative`)는 뗌.

### 6.5 사용자 Java 코드
에디터의 **코드 (Java)** 칸 → 테스트 플레이 · 런타임 설치 때 `codegen.js` 가 게임 저장소 `…/pdmaker/gen/` 에 클래스를 만들어 함께 컴파일.

| 대상 | 생성 클래스 | 훅 (값을 돌려주는 훅은 `return` 이 없으면 받은 값을 그대로) |
|---|---|---|
| 영웅 | `gen/H_<id> extends MakerHeroCode` | onGameStart · onFloorEnter · onTurn · onLevelUp · onKill · attackSkill · defenseSkill · damageRoll · drRoll · speed · attackProc · defenseProc · onAction · effect(id, n, hero, cell, target) |
| 아이템 misc | `gen/items/<분류>/<세부>/I_<id> extends MakerItem` | onPickUp · desc · 행동 버튼 |
| 근접 / 투척 무기 | `… extends MeleeWeapon / MissileWeapon` | proc · min · max · onEquip · onUnequip · onPickUp · desc · 행동 버튼 |
| 갑옷 | `… extends Armor` | armorProc · drMin · drMax · onEquip · onUnequip · onPickUp · desc · 행동 버튼 |
| 게임 아이템 상속 | `… extends <게임 클래스>` (`kind: "game"`, `base`) | 위 훅 + 추가 멤버(@Override 로 게임 함수 직접 다시 쓰기) |

- **항목별 코드** (전직 · 직업 능력 · 특성 · 패시브의 `code: { 훅: "Java" }`): 훅 = `onGain`(전직할 때 · 고를 때 · 포인트 올릴 때 · 열릴 때) · `onUse`(능력을 쓸 때) + 영웅 훅들. 영웅 클래스에 `_<kind><i>_<id>_<훅>` 메서드로 넣고 켜진 항목만 부름(전직 `subclassId()` · 능력 `abilityId()` · 특성 `talent(id) > 0`(본문에 `int points`) · 패시브 `passive(id)`). 값 훅은 켜진 항목들 → 영웅 코드 순서로 이어 받음.
- 무기 · 갑옷은 원본을 상속하므로 강화 · 마법 부여 · 각인 · 저주 · 감정이 원래대로, 세이브에도 그 클래스로. 수치 식 `기본 + 강화 × 강화당`.
- 아이템 클래스 폴더 = 분류/세부 종류 (`codegen.pkgSeg`). 분류를 옮기면 다음 생성 때 새 폴더로(예전 파일은 설치기가 지움). 런타임은 `gen/GenIndex.java`(`GenSupport.loadIndex/cls`)로 찾고, 예전 위치(`gen.I_<id>`) 세이브는 Bundle 별칭. 모든 프로젝트 아이템에 클래스를 만듦.
- **아이템 만들기 · 주기** (코드에서): `MakerItem.give(hero, "id"[, 개수])` = 만들어 가방에(꽉 차면 발밑). `MakerItem.create(이름)` 은 프로젝트 아이템 id → 생성 클래스 이름(`I_<id>`) → 게임 아이템 이름 순으로 찾음 — 게임 아이템은 `spd:` 없이도 `"Cudgel"` · `"cudgel"` · `"potion_of_healing"` · `"weapon.melee.Cudgel"`(첫 글자 대문자 · snake→CamelCase · items 폴더들 · Generator 목록 대소문자 무시). 생성 파일마다 **모든 프로젝트 아이템 클래스를 import**(`new I_<id>()` 바로 사용)하고, 게임 items 폴더 전부(wands · rings · artifacts · stones · bags · keys · quest · spells · bombs · trinkets · exotic · brews · elixirs · darts …)를 기본 import (SPD 4.0 에서 이름 겹침 없음 확인). 4.0.0 헤드리스에서 7가지 방식 모두 확인.
- 오류: 실행 중 예외는 잡아서 로그 + 화면 경고 한 번. 컴파일 오류에는 `에디터 코드 오류: 아이템 wind_bell · 행동 ring · 6번째 줄` 처럼 위치를 덧붙임(`codegen.locate`). 런타임 바탕: `MakerHeroCode` · `GenSupport`(이름 · 설명 · 그림 · 가격을 데이터에서, `Class.forName`).

### 6.6 완전히 새 영웅 · 선택 화면 · 저장 슬롯
- **완전히 새 영웅** (`baseClass` 빈 값 — 새 영웅의 기본): 안에서는 WARRIOR 로 돌지만 `HeroRuntime.stripClass` 가 직업이 준 것을 모두 걷어 냄(장비 · 가방 · 퀵슬롯 · 감정 · 직업 특성). 특성 창은 항상 영웅 편집기 것, 가면은 전직이 없으면 "전직이 없다", 왕관은 빈 목록.
- **영웅 선택 화면**: 연결 줄 `HeroSelectScene` → `HeroSelect.addButtons` — 게임 직업 대신 프로젝트 영웅(enabled 전부, `startHero` 가 있으면 그것만). 누르면 바탕 직업으로 `setSelectedHero` 후 글자를 영웅 것으로. `select`: illust(그림 한 장 또는 시트 애니메이션) · `fit` right(오른쪽 영역, 작은 도트는 정수 배) / full(화면 높이 가득) · `icon`(버튼 아이콘) · `title`/`desc`/`info`(비우면 영웅 이름 · 설명, 원작 영웅은 게임 글). 새 영웅은 정보 버튼이 영웅 설명 창.
- **해금 조건** `unlock`(`HeroSelect.locked/lockText`): always · game(원작 규칙) · badge · global(전역 스위치) · cond. 정하지 않으면 원작 영웅 = game, 그 밖 = always.
- **영웅 시트**: (11차) 영웅 그림이 저장소에서 옮긴 값 그대로면(`src.fields` 의 `sprite.*` 가 모두 저장소 값과 같음 — `HeroRuntime.nativeSprite`) 게임 `HeroSprite` 코드가 그림 (스킨 · spearForm · Sattack · 초상화). 하나라도 고치면 PDMaker 가 그림: `sprite.rowH`(갑옷 한 줄의 높이 — 칸 높이와 다르면 그 줄 안에서 칸을 자름), 저장소 배율(`scale` 1 = 원래 크기, 0 = 예전 자동 축소). 선택 버튼은 시트를 바꾸지 않은 영웅이면 게임 `HeroBtn` 아이콘 그대로, 바꾼 영웅은 그 시트의 `select.iconTier` 줄. 연결 줄 `HeroSprite.updateArmor` → `HeroRuntime.updateArmor`(갑옷을 바꿔도 영웅 편집기 시트 · 프레임 크기 유지), `sprite.anims.dead`(die 뒤 이어서 반복), 추가 애니메이션은 이벤트 명령 `anim { target, anim }`.
- **초상화 · 저장 슬롯**: `HeroSprite.avatar` → `HeroRuntime.avatar`(상태 창 · 영웅 창). 저장할 때 `GamesInProgress.set` → `setSlot`, 읽을 때 `Dungeon.preview` → `HeroRuntime.preview` → 시작 화면 슬롯 · 이어하기 창이 영웅 그림 · 이름(전직 이름 → 영웅 이름).

---

## 7. 캐릭터

### 7.1 데이터 (`characters/<id>.json` · `editors/character.js`)

```jsonc
{ "id": "mireille", "kind": "npc",            // npc | companion | mob | boss
  "enabled": true,                            // false = 게임에 나오지 않음 (아이템도 같은 칸)
  "name": "미레유", "title": "약초와 독의 연금술사",
  "game": "", "useGame": false,               // 원작 캐릭터: 게임 클래스(예 Rat · npcs.Ghost · Shaman$RedShaman) + 게임 동작 그대로
  "sprite": { "sheet": "assets/sprites/characters/npc/mireille.png", "frame": [12, 15], "scale": 0,
              "anims": { "idle": { "frames": [0,0,0,1], "fps": 1, "loop": true }, "run": {…}, "attack": {…}, "die": {…}, "fly": {…} },
              "lightMode": "add", "lightPower": 100, "lightBloom": 0 },
  "portrait": { "default": "assets/portraits/mireille/default.png", "expressions": [ { "key": "smile", "image": "…" } ],
                "scale": 1, "offsetX": 0, "offsetY": 0, "side": "", "flip": false },
  "stats": { "hp": 20, "attack": [1,4], "defense": 0, "accuracy": 10, "evasion": 5, "speed": 1,
             "infiniteHp": false, "regen": 0, "regenEvery": 1, "regenDelay": 0 },
  "ai": { "mode": "stand|fixed|wander|patrol|follow|schedule|hunt|code", "path": [ … ], "wait": 3, "fixedAttack": false, "code": "", "imports": "" },
  "heart": { "enabled": true, "traits": ["CHEERFUL"], "likes": ["tag:herb"], "dislikes": [], "initial": { "favor": 0, "trust": 0 } },
  "behaviors": { "onSpawn": [], "onInteract": [], "onDamaged": [], "onDeath": [], "onSeeHero": [], "onTurn": [] },
  "dialogue": { /* §13.6 토픽 */ },
  "drops": [ { "item": "potion_x", "chance": 10, "min": 1, "max": 1, "cond": "" } ], "noGameLoot": false, "noSpawn": false,
  "sounds": { "attack": "", "hurt": "", "die": "", "talk": "" }, "voice": "",
  "shop": { "on": false, … } }
```

- **AI 추가 방식 · 체력** (`MakerCharAI` — 데이터 캐릭터 `MakerMob` · `MakerNPC` 와 게임 클래스 캐릭터(`MakerDrops.charOf` — game 이 같은 캐릭터) 모두):
  - `fixed` 제자리에 고정: `rooted` + `Property.IMMOVABLE`(밀치기 · 자리 바꾸기에도 안 밀림, 만들 때 · 맞을 때 · 차례마다 붙잡음). 몬스터는 `fixedAttack` 이면 원래 AI(걷지 못하니 옆에 온 적만 공격), 끄면 PASSIVE 로 가만히.
  - 어느 캐릭터인지: 데이터 캐릭터는 자기 charId, 게임 클래스 캐릭터는 `LevelHooks.gameChar` 가 붙인 표(`MakerCharAI.tag` — Mob 저장 연결 줄로 `pdm_charTag` 저장)라서 원작 캐릭터를 복제한 샌드백(같은 게임 클래스)도 구별. 게임이 스스로 만든 몬스터는 원작 캐릭터(id = 클래스 이름 snake_case)로 (`MakerDrops.charOfClass`).
  - `code` 코드로 직접: 생성 파일 `gen/GenCharAI.java`(`codegen.charAISource` — 캐릭터마다 `case "<id>": { if (true) { 코드 } break; }`), 런타임이 차례마다 `GenCharAI.act(charId, self, ai)` — true = 턴을 씀, null/false = 원래 AI. 도우미 `MakerCharAI.Ctl`: stepTo · stepAway · wander · attack(반사로 Mob.doAttack) · waitTurn · waitTurns · teleport · hunt · say · cell · x · y · dist · sees · near · now. 오류는 경고 한 번 + 원래 AI. 턴을 쓰는 도우미를 한 번 부르면(`Ctl.acted`) return 이 없어도 그 차례는 끝(원래 AI 가 또 움직이지 않음), 공격 동작 중이면 false(게임이 onAttackComplete 로 이어 감).
  - `stats.infiniteHp` 체력 무한(샌드백): `Char.damage` 의 `if (HP < 0) HP = 0;` 앞 연결 줄 `afterDamage` 가 HP = HT 로 되돌림(피해 숫자는 그대로 뜸) + `Mob.die` 맨 앞 `preventDeath`(즉사 효과). 받은 피해(합계 · 횟수 · 평균 · 마지막)를 살펴보기에 붙임(`Mob.info` 연결 줄 — 게임 클래스 캐릭터에도).
  - `stats.regen` 지속 회복: `regenEvery` 턴마다 `regen`, 마지막으로 맞은 뒤 `regenDelay` 턴이 지나야(초록 숫자). 편집기 "🎯 샌드백으로" = fixed + 공격 안 함 + 체력 무한.
  - 연결 줄: `Mob.act` 의 `super.act()` 바로 뒤 · `Char.damage` · `Mob.die` 맨 앞(목록 맨 끝 — 같은 자리의 "몬스터 처치"보다 먼저). `MakerNPC.act` 는 직접 부름(동료일 때는 빼고). 헤드리스 `eval:charai` · `charhit` · `charstat`.
- 원작 캐릭터 72명(`spd-chars.js` ← `tools/data/extract_spd_chars.py`): `useGame: true` 면 맵에 놓거나 소환하면 게임 클래스 그대로(`LevelHooks.gameChar`), 끄면 데이터로 도는 캐릭터(`MakerMob` · `MakerNPC`).
- 스프라이트 `scale`: 0 = 세로 24px 초과 시 15px 높이에 맞춤. 런타임 `MakerSprite`.
- 확장 기능 칸 4종(초상화 · 마음 · 상황별 대사 · 행동 이벤트)은 켜야 편집 화면에 보임.

### 7.2 NPC · 동료
- `MakerNPC`: 말을 걸면 맵 오브젝트의 이벤트 → `onInteract` → 기본 인사(마음 시스템 TALK + greet) 순. 공격받으면 다치지 않고 마음 시스템 "attacked" 반응. 상인 · 퀘스트가 있으면 그 창이 먼저(§7.4).
- **동료** (`party:<id>` 플래그 — 이벤트 명령 party, 조건식 `party.<id>`): 영웅을 따라다니고 층을 옮기면 옆에 다시 나옴. 좁은 칸(지나갈 수 있는 이웃 3칸 이하)에 있거나 영웅이 걸어오던 중이면 **자리를 바꿈**, 넓은 곳에서 누르면 말 걸기.
- **NPC 이주**: 이벤트 명령 `relocate { char, node, x, y }` · 퀘스트 `move`. `MakerHomes` 가 StoryState 문자열 `home.<char>` = `노드|x|y` 로 기억 — 맵에 들어올 때마다 사는 맵이면 그 칸에 세우고 다른 맵의 그 캐릭터는 치움.

### 7.3 드랍 테이블 · 등장 금지 · 테마별 몬스터 (`editors/loot.js` · 런타임 `MakerDrops`)
- 아이템 쪽 `drops [{ src: mob|floor, char, chance, min, max, depthMin, depthMax, groups, cond }]`(게임 아이템은 `gameitems.json`) + 캐릭터 쪽 `drops`. 연결 줄 `Mob.rollToDropLoot` → `MakerDrops.mobDrop`, 층 드랍은 `LevelHooks.afterCreate`.
- 상자류 `project.loot.<chest|locked|crystal|tomb|skeleton> { mode: add|replace, pick: each|one, rows }` — 게임이 만든 상자에만(직접 그린 맵 제외). replace 는 unique · 열쇠를 남기고, 아무것도 안 뽑히면 원래 내용. 맵 오브젝트 item 의 `container` 로 직접 상자에 담기.
- **드랍 테이블 화면** (`editors/loot.js`): 쪽 ▣ 상자류 · ☠ 몬스터 · 🎁 아이템 · 🪙 금화 · 🗺 테마별 몬스터. 아이템 쪽 = 프로젝트 아이템 전부 + 드랍 테이블을 만든 게임 아이템(게임 아이템 추가 칸), 줄마다 그 아이템의 `drops` 편집(`PDM.itemDropsEditor`, 아이템 편집 화면과 같은 칸).
- **금화** `project.loot.gold { mult, noGame, extra { on, chance, min, max, perDepth, boss, cond } }`: `mult` = 게임이 만드는 금화 양 배율(%, 연결 줄 `Gold.random` → `MakerDrops.goldAmount` — 바닥 · 몬스터 · 상자 모두), `noGame` = 몬스터의 게임 금화 전리품 끔(loot 가 금화면 비움), `extra` = 모든 적 몬스터가 죽을 때 확률로 추가 금화(양 = min~max + perDepth×(깊이−1), 보스 ×boss). 화면에 깊이별 미리 계산. 4.0.0 헤드리스 `eval:goldtest` 로 확인.
- **테마별 몬스터** `project.themeMobs.<테마 id> { on, chance(%, 100 = 이 목록만), depthMin, depthMax, mobs [{ ref: 캐릭터 id | spd:<게임 클래스>, weight }] }`: 연결 줄 `Level.createMob` 맨 앞 → `MakerDrops.themeMob(level)` — 지금 맵의 테마(`WorldGraph.theme` = 노드 → 그룹 → 깊이 기본, 그래프가 없으면 깊이 기본)로 목록을 찾고(사용자 테마 `custom:<id>` 는 없으면 `base` 의 목록), 확률을 넘기면 무게대로 뽑아 `LevelHooks.createMob` + 챔피언 굴림. 목록이 없거나 확률에서 빠지면 null → 게임 원래 `MobSpawner` 순서. 직접 그리기 맵은 `MakerLevel.createMob` 의 스폰 목록이 먼저(비면 super → 이 연결 줄). "사용" 끈 캐릭터는 무게 0. 화면의 "게임 목록 가져오기" = 그 테마 깊이(보스 층 제외)의 `MobSpawner` 목록을 합친 무게. 몬스터 고르기 목록은 `PDM.mobRefOptions()`(gameinfo.js — 맵 "몬스터 스폰" · 노드 일괄 설정도 같이 씀). 헤드리스 `eval:themetest` 로 확인.
- **사용 여부** `enabled: false` (영웅 · 캐릭터 · 아이템 편집기 "기본"의 "사용" 체크, 리소스 목록 오른쪽 클릭 `PDM.resOps.useToggle`, 목록에서 흐리게 + "(꺼짐)"): 데이터는 그대로 읽고(대사 화자 · 생성 클래스가 깨지지 않게) 나오는 곳만 막음 — 아이템은 `MakerItem.create` 가 null(드랍 · 상자 · 상점 · 시작 아이템 · 맵 · 이벤트 · 코드) + 도감 제외, 캐릭터는 `LevelHooks.createMob` null · 맵 오브젝트 npc · 이벤트 소환 · 동료 합류 · 이주를 건너뜀, 원작 몬스터 캐릭터면 `bannedMobs` 처럼 `MobSpawner` 목록에서도 뺌. 아이템 생성 클래스는 그대로 만들어 코드가 계속 컴파일됨.
- 등장 금지: 캐릭터 `noSpawn` · `project.bannedMobs[]`(연결 줄 `MobSpawner.getMobRotation` → `filterMobs`, 전부 금지면 무시), 게임 원래 전리품 끔 `noGameLoot`, 게임 아이템 `banned`(Generator 확률 0).

### 7.4 상인 · 퀘스트
- **상인** (npc · companion 의 `shop { on, title, greet, items:[{ item, price(0 = 가치 × priceRate%), stock(-1 무제한) }], priceRate, sell, sellRate, direct }`): `MakerShop.Wnd`(사기 / 팔기 탭). 다른 대화가 있으면 "물건 보기 / 대화하기"(`direct` 면 바로). 팔린 개수 = 변수 `shop.<char>.<n>`. 이벤트 명령 `shop`.
- **퀘스트** (확장 `quests` · `quests.json { list:[{ id, name, desc, giver, turnIn, cond, auto, repeat, remind, objectives:[{ type: kill|collect|reach|talk|cond, target, count, take, cond, text }], rewards:{ gold, exp, items }, acceptEvent, doneEvent, move }] }`): `MakerQuests` — 상태 = 변수 `quest.<id>` 0/1/3 · 진행 `quest.<id>.<n>`, NPC 에게 말을 걸면 보고 → 수주 → 진행 상황 순. 이벤트 명령 `quest`(offer/accept/complete/abandon/reset) · `questLog`, 조건식 `quest.<id>`(2 = 목표 달성) · `.active/.ready/.done`.

---

## 8. 아이템

### 8.1 데이터 (`items/<id>.json` · `editors/item.js` · 런타임 `MakerItem`)

```jsonc
{ "id": "herb_moonleaf", "category": "material", "subtype": "", "tier": 0,
  "name": "달빛 잎", "desc": "…", "sprite": { "sheet": "builtin:items", "index": 12, "name": "…" },   // 또는 { "png": "assets/sprites/items/moonleaf.png" }
  "stackable": true, "price": 30, "unique": false, "tags": ["herb","gift"], "consumable": true, "useLabel": "",
  "stats": { "energy": 0 }, "onUse": [ /* 이벤트 명령 */ ], "giftValue": { "default": 5 },
  "kind": "misc|melee|ranged|missile|armor|bag|codex|grimoire|game", "noSell": false, "noDrop": false, "base": "", "weapon": {…}, "armor": {…}, "codex": {…}, "bag": {…},
  "ranged": { "shootLabel": "", "needEquip": true, "ammo": "none|item", "projectile": "<투척 무기 id>", "proj": { "name", "sprite", "spin", "damage": "bow|own", "min", "max", "minPerLvl", "maxPerLvl", "accuracy", "sound", "hitSound", "castEffect", "hitEffect" } },
  "wandFx": { "on": false, "bolt": "game|none|sprite|magic|fire|frost|…", "sprite", "spin", "sound", "hitSound", "castEffect", "hitEffect" },   // kind game + base wands.*
  "level": 0, "cursed": false, "code": {}, "actions": [ { "id": "ring", "name": "흔들기", "default": true, "consume": false, "time": 1, "code": "…" } ],
  "sound": "", "throwSound": "", "landSound": "", "pickupSound": "", "equipSound": "",
  "fxUse": "", "fxThrow": "", "fxEquip": "", "light": { "on": false }, "groundScale": 1, "catalog": true, "drops": [] }
```

| 분류 (`category`) | 게임 폴더 | 세부 (`subtype`) | 사용 버튼 · 소모 |
|---|---|---|---|
| weapon 무기 | weapon/ | melee · ranged · missile · dart | — (kind 로 무기 상속 — ranged = 쏘기) |
| codex 코덱스 (mod-2) | weapon/codices/ | melee · ranged · cast | — |
| armor 방어구 | armor/ | armor · class | — |
| artifact · ring · wand | artifacts/ · rings/ · wands/ | | 사용 |
| potion 물약 | potions/ (exotic · brews · elixirs) | '' · exotic · brew · elixir | 마시기 · 소모 |
| scroll 주문서 | scrolls/ (exotic) | '' · exotic | 읽기 · 소모 |
| stone · spell · bomb | stones/ · spells/ · bombs/ | | 사용/시전 · 소모 |
| food 음식 | food/ | | 먹기 · 소모 · `stats.energy` 만큼 배고픔 해소 (300 = 한 끼) |
| bag (그리모어 포함) · key · quest · trinket · journal · remains | 같은 이름 폴더 | | 사용 (문서는 읽기) |
| material · gift (PDMaker) · misc | items/ 바로 아래 | | 사용 |

- **목록**: 분류 › 세부 종류 › 아이템. 프로젝트 아이템과 **게임 아이템 282개**(▫ — `spd-items.js` ← `tools/data/extract_spd_items.py`, 저장소에 맞춰 `gamescan`)가 함께. 세부 종류 = 기본 + `project.itemSubs`(이름 바꾸기 · 숨기기 "세부 종류 관리…"), 순서 `itemOrder` · `itemCatOrder` · `itemSubOrder`(끌어 놓기 — 분류도 따라감). 티어로 정렬. 새 아이템 창에서 id · 분류 · 세부 종류.
- **도감**: `MakerCatalog.register` 가 프로젝트 아이템을 게임 아이템 도감 분류에 올림(`catalog: false` 면 안 올림).
- 런타임 `MakerItem`: 분류로 버튼 이름 · 소모 · 소리를 정하고, `spd:짧은이름` 은 게임 폴더들에서 찾음. `groundScale` = 바닥 그림 배율(`ItemSprite.link(Heap)` 연결 줄).

### 8.2 그림
- 편집기: 게임 시트에서 고르기 · **게임 그림 복사해서 고치기** · 직접 그리기 · PNG 파일 고르기. `sprite.name` = ItemSpriteSheet 상수 이름도 저장 → 원작(16px) · mod-2(32px) 시트 어디서나 맞는 그림(`ItemSpriteSheet.class.getField`).
- **PNG 그림**: 게임이 켜질 때 items 시트 아래에 줄을 더해 붙이고 번호 `20000 + n` 으로 등록(`MakerAssets.installItems`).
- **게임 아이템 그림 바꾸기** (`gameitems.json { items: { "spd:<경로>": { sprite, drops, banned } } }`): 게임 아이템 보기 창 → "그림 바꾸기" · "↺ 원래 그림으로". 연결 줄 `Item.image()` → `MakerAssets.itemImage`.
- 게임 아이템 보기 창: 그림 · 설명 · `spd:` id → "프로젝트 아이템으로 복사해서 고치기" · "이 아이템을 바탕으로 코드 작성"(`kind: game` 상속, §6.5) · "게임 코드 파일 보기".

### 8.3 코덱스 · 그리모어 (mod-2 구조, 원작에서도 동작)
- `kind: "codex"` → `MakerCodex`: `codex { type: melee|ranged|cast, tier, min, max, minPerLvl, maxPerLvl, str(0 = 7+2×티어), baseUses, quantity, castTime, range, radius, target, visual, heat, effects }`. 겹쳐 쌓이고 "사용"하면 대상을 골라 명중 굴림 후 피해 + 효과(MakerCast). 쓸 때마다 내구 −100/사용 횟수, 0 이면 하나 사라짐, 강화마다 사용 횟수 ×1.5, 100회 이상 = 닳지 않음. 피해 × (1 + codexPct%), 힘 부족 −33%.
- 연출: `magicImage`(items 칸) — 원거리는 그 그림이 날아감(`visual: item`, `spin`), 근접은 MagicImageAnimator(`anim` alternate · sweep · stab · charge · smash, mod-2 전용) · `hits`/`hitDelay` 연타 · `usesTargeting`(퀵슬롯 자동 조준).
- `kind: "grimoire"` → `MakerCodex.MakerGrimoire`: `bag { capacity: 19, holds: "codex"|"all" }`.

### 8.4 원거리 무기 · 마법봉 · 마법봉 공격 이펙트
- **게임 동작이 있는 분류** (마법봉 · 반지 · 아티팩트 · 장신구 · 가방(그리모어 말고)): 새 아이템 창에서 "바탕 게임 아이템"을 골라 `kind: game` + `base` 로 만듦(`asGameBased` — 마법봉 기본 WandOfMagicMissile) → 충전 · 쏘기 · 장착 · 강화를 게임 그대로 물려받음. "게임 아이템을 프로젝트 아이템으로 복사"도 같은 방식. 예전에 `misc` 로 만든 그런 아이템은 "종류와 수치"에 경고 + "이 게임 아이템을 바탕으로 바꾸기". 무기 · 갑옷은 세부 종류로 kind 를 정함(근거리 melee · 원거리 ranged · 투척 missile · 갑옷 armor).
- **추가 기능 — 한 아이템에 종류 여러 개** (`editors/item.js` "추가 기능" · 런타임 `MakerFacets`, 연결 줄 Item.java 6개(actionName · execute · onThrow · detachAll · store · restore) + MissileWeapon.rangedHit · Actor.init, actions 는 flagActions 에서): 아이템 종류와 상관없이(무기 · 갑옷 · 일반 · 게임 아이템 상속 · gameitems) 덧붙임.
  - `useFx { on, label, consume, time, sound, fx, effects }` — 효과 목록(MakerCast — 대상 = 영웅 칸: 자신 · 범위 안의 적 · **범위 안 모두** `everyone`). 일반 아이템은 "사용(마시기 · 읽기)"에 합쳐짐, 그 밖은 "사용" 버튼(`PDM_FXUSE`).
  - `throwFx { on, consume, fuse, sound, fx, effects, when }` — 연결 줄 `Item.onThrow` 맨 앞: 떨어진 칸에서 효과(물약 깨짐 · 룬석), `fuse` 턴이면 바닥에 놓였다가 `MakerFacets.Fuse`(Actor)로 터짐(주워 가면 안 터짐). 퓨즈는 그 아이템의 저장 묶음에 남은 턴 `pdm_fuse` 로 저장 → 불러온 뒤 `Actor.init` 연결 줄(`reviveFuses` — 바닥 더미를 훑음)이 다시 붙임(층을 떠났다 돌아와도 이어서 탐).
  - 투척 무기(`MissileWeapon`)의 throwFx: 원래 규칙(맞힘 · 박힘 · 내구 · 바닥에 남기)은 그대로 두고 그 칸에서 효과만 더함 — 맞힘은 `MissileWeapon.rangedHit` 연결 줄(`missileHit`), 빗나감 · 바닥은 `Item.onThrow` 연결 줄(when `always` 일 때). consume · fuse 는 안 씀.
  - `bagFx { on, capacity, holds, categories, items, tags, openLabel, putLabel }` — "넣기"(배낭에서 골라 담음) · "열기 (n/칸)"(보통 가방 창 `WndBag(inner)` — 누르면 그 자리에서 사용 · 장착 · 던지기, 또는 "꺼내기" `PDM_BAG_TAKE`). 안에 든 채로 쓸 수 있는 건 `Item.detachAll` 맨 앞 연결 줄(`detachFrom` — 배낭에 없고 가방 기능 안에 있으면 그곳에서 뺌) 덕분. 내용물은 `Item.storeInBundle/restoreFromBundle` 연결 줄로 저장. 주울 때 저절로 들어가지 않음(원래 기능 — 장착 · 퀵슬롯 그대로).
  - 새 아이템 기본값(일반 kind): 물약 = 마시면 회복 15 + 던지면 깨짐, 폭탄 = 퓨즈 2 · 범위 1 모두 8~16, 룬석 = 던지면 범위 마비, 주문서 · 마법 = 사용하면 신속. 헤드리스 `eval:usetest` · `throwfx` · `bagfx` · `baguse` · `heaps`(+ `reload` 로 퓨즈 저장 확인).
- **무기 공격 모션** (`swing.js` — `PDM.SWING_MOTIONS` · `PDM.swingEditor` · 런타임 `MakerSwing`): 영웅이 공격할 때 그 무기의 아이템 그림이 영웅 가운데에서 휘둘러짐. 근접 무기 · 활(들고 때릴 때) · 게임 근접 무기 상속 아이템(아이템 편집기 "⚔ 공격 모션"), 게임 근접 무기(보기 창 → gameitems.json).
  - 그림의 왼쪽 아래 = 손잡이(돌아가는 중심), 오른쪽 위 = 날(그림 안에서 -45°). 방향: θ = φ(영웅 → 대상) + 각도, 왼쪽을 보면(위 · 아래는 영웅 그림이 뒤집혀 있으면) θ = φ − 각도 + 그림도 좌우로(날 -135°, 중심 = 오른쪽 아래).
  - `attackFx { on, motion, keys [[t, 각도, 거리, 크기, 불투명도]], hits [t], dur, dist, speed, scale, behind, trail, trailEvery, hit, hitAt tip|target, sound }` — 모션 버튼을 누르면 그 모션의 keys · hits · dur 를 복사(런타임은 keys 만 재생 — "고급: 키프레임 직접 고치기"로 직접 모션). 구간 보간 smoothstep(편집기 `PDM.swingSample` = 런타임 `MakerSwing.sample`).
  - 모션 10종: 베기 · 찌르기 · 찍기 · 휘두르기 · 치기 · 올려치기/받아치기 · 밀치기 · 회전 베기 · 휩쓸기 · 연타/난무. 파티클: 휘두르는 동안 날 끝에서(`trail` 이펙트를 `trailEvery` 초마다) · 맞는 순간(`hits` 시각에 날 끝 또는 대상 칸). 미리보기는 같은 계산으로(게임 전사 그림 + 아이템 그림, 대상 방향 바꾸기, 파티클 자리 표시).
  - 뒤집기 주의: noosa `Image.flipHorizontal` 은 그림 칸을 다시 정할 때(`updateFrame`)만 반영됨 → `Swing` 은 뒤집은 뒤 `updateFrame()` 을 직접 부름(안 하면 왼쪽을 볼 때 그림은 그대로인데 중심 · 날 방향만 뒤집혀 한 칸 어긋나 꼬임). 헤드리스 `eval:swingcheck,<방향>,<영웅 방향>` — 그림의 날 텍셀이 실제로 놓인 자리와 계산한 날 끝을 비교(모든 방향 오차 0).
  - 연결 줄: `CharSprite.attack(cell, callback)` 의 `play(attack)` 바로 뒤 `MakerSwing.onAttack` — 영웅 · `belongings.attackingWeapon()` 의 설정(프로젝트 아이템 자기 것 → 게임 클래스 사슬 gameitems). `ItemSprite` 를 영웅 그림과 같은 무리에 넣음(`behind` 면 영웅 바로 뒤). 게임의 공격 판정 · 피해 · 영웅 공격 동작은 그대로(그림만 더함). 헤드리스 `eval:swingtest` · `swingdirect` · `swinginfo`.
- **판매 불가 · 버리기 금지** `noSell` · `noDrop`(새 아이템 창 · 기본 칸, 게임 아이템은 보기 창 → gameitems.json): 연결 줄 `Item.actions`(AC_THROW 뒤 → `MakerItem.flagActions` — 버리기 · (투척 무기가 아니면) 던지기 버튼을 뺌) · `Shopkeeper.canSell` 맨 앞(`MakerItem.noSell`). 프로젝트 아이템 → 게임 클래스 사슬 순으로 설정을 찾음.
- **완전히 새 가방** `kind: "bag"`(새 아이템 › 가방 › "완전히 새 가방", 기본) → 생성 클래스가 런타임 `MakerBag`(Bag) 상속: `bag { capacity, holds: all|filter, categories(분류 + missile · seed), items(프로젝트 id · spd:경로 — 상속 포함), tags, tabIcon }`. `canHold` = 설정에 맞고(가방은 안 받음) 게임 규칙(칸 수 · 겹침). 주운 아이템이 먼저 들어가는 것 · 가방 창 탭은 게임 그대로, 탭 아이콘은 연결 줄 `WndBag.icon` · `InventoryPane.bagIcon` → `MakerBag.icon`(가방 그림 또는 게임 가방 아이콘). 헤드리스 `eval:bagtest,<가방>,<아이템>`.
- **마법봉 수치** `wand { charges, min, max, minPerLvl, maxPerLvl }`(kind game + `wands.*`): 코드 생성이 `initialCharges()` · (피해 마법봉 `codegen.DAMAGE_WANDS` 만) `min(lvl)` · `max(lvl)` 을 덮어씀, 비우면 게임 그대로.
- `kind: "ranged"`(무기 › 원거리 무기, 게임 원거리 무기를 복사해도) → 생성 클래스가 런타임 `MakerBow`(MeleeWeapon) 상속 — 영혼의 활과 같은 방식: 행동 "쏘기"(`AC_SHOOT`, 기본 행동, `needEquip`) → 칸 고르기 → 발사체 `cast`. `ammo: none` = 발사체(`MakerBow.Arrow`, 가방에 안 들어가고 땅에 안 떨어짐 — 피해 `bow`(활 수치 · 강화 · 마법 부여 그대로) 또는 `own`(min/max + 활 강화당), 명중 배율, 그림 · 빙글빙글(아니면 `StraightArrow` 를 `MissileSprite.ANGULAR_SPEEDS` 에 0 으로 등록), 소리 · 이펙트), `ammo: item` = 가방의 프로젝트 투척 무기(`projectile`)를 하나씩 cast(그 아이템의 수치 · 그림). 근접 수치 `weapon` 은 들고 때릴 때. 편집기: 종류와 수치 › "쏘기 · 발사체".
- **마법봉 공격 이펙트 코드** `wandFx.bolt = "code"`(`code` · `imports`): 코드 생성이 `gen/GenWandFx.java` 하나에 `fx(key, wand, bolt, done)` 의 switch(key = `item:<id>` · `spd:wands.X` — 프로젝트 마법봉 · 게임 마법봉 같이, `generate(heroes, items, gameitems)`)로 넣음. 쓸 수 있는 것 wand · bolt · cell · hero · done(끝나면 꼭 한 번 — onZap · wandUsed). 런타임 `MakerWand` 가 리플렉션으로 부르고 없거나 오류면 게임 원래 fx(오류는 게임 안 경고). 편집기: 코드 칸 · import · 예시 넣기 · 생성될 코드 보기 · 게임 코드 참고.
- **마법봉 공격 이펙트** `wandFx`: 프로젝트 아이템(kind game + base `wands.*`, 종류와 수치에서) · 게임 마법봉(게임 아이템 보기 창 › "마법봉 공격 이펙트" → `gameitems.json items["spd:wands.X"].wandFx`). 연결 줄 `Wand.zapper` 의 `curWand.fx(` 앞 → `MakerWand.zap`: 설정이 켜져 있으면(프로젝트 → 게임 클래스 사슬 순) `bolt` game(게임 fx + 소리 · 이펙트만) · none · sprite(MissileSprite, 그림 · spin) · 마법 화살 종류(`MagicMissile.boltFromChar`, `MakerCast.missile`)로 날리고, 닿으면 hitSound · hitEffect → `onZap` → `wandUsed` 후 원래 줄을 건너뜀(저주 무작위 효과 · 공명 수지 추가 효과는 그대로/생략). 날아가는 그림 PNG 는 `MakerAssets` 아이템 시트에 함께 붙임. 헤드리스 `eval:shoottest,<id>[,<탄환 id>]` · `eval:mobhp`.

### 8.5 소리 · 이펙트 · 빛
- 프로젝트 아이템 `sound`(쓸 때 — 무기는 공격이 맞을 때 타격음 대신, `KindOfWeapon.hitSound` 연결 줄) · `throwSound`(**던지는 순간** — `Item.cast` 연결 줄 → `MakerAudio.onItemCast`, 던지기 버튼을 누를 때는 소리 없음) · `landSound`(떨어졌을 때 · 맞혔을 때 — `onItemLandHit/Ground`) · `pickupSound` · `equipSound`. 게임 아이템은 `sounds.json gameItems["spd:<경로>"] = { use, throw, land, pickup, equip }`.
- 편집기 소리 칸: 기본 칸에 그 아이템의 **실제 기본 소리**를 게임 코드에서 읽어 표시(`PDM.gameItemSounds` — `extends` 사슬의 hitSound(메이스 = HIT_CRUSH 등) · 물약 DRINK · 주문서 READ · 음식 EAT · 완드 ZAP · doPickUp), 칸마다 🔇(`none`) · ↺(기본으로), "↺ 소리 모두 원래대로".
- 이펙트 `fxUse` · `fxThrow` · `fxEquip`(§5.5), 빛 `light`(§5.4).

---

## 9. 사운드

데이터 `audio/sounds.json` · 편집기 `editors/sound.js` · 런타임 `MakerAudio`.

```jsonc
{ "sounds": [
  { "id": "bell", "name": "바람 방울", "kind": "se", "file": "assets/audio/bell.wav", "volume": 1, "pitch": 1, "loop": false, "synth": { … }, "seed": 1000 },
  { "id": "town_theme", "name": "마녀의 마을", "kind": "bgm", "file": "game:music/theme_2.ogg", "volume": 0.8, "loop": true } ],
  "gameItems": { "spd:weapon.melee.Mace": { "use": "", "throw": "", "land": "", "pickup": "", "equip": "" } } }
```

- 참조: `sound:<id>` · `game:music/x.ogg` · `game:sounds/x.mp3` · `assets/audio/x.wav`. 게임은 ogg · mp3 · wav — **WAV 는 16비트(또는 8비트) PCM · 보통 머리(형식 1)만**(libGDX: 24비트 · 32비트 float · 확장 머리는 "Error reading WAV file"). 채널은 모노 · 스테레오 · 4채널 · **5.1 · 6.1 · 7.1** 재생(libGDX 1.12+ OpenAL, 스피커가 적으면 OpenAL 이 섞음) — 단 libGDX 는 음악을 40960바이트씩 넘겨서 한 프레임이 나누어떨어지지 않는 5.1(12바이트) · 6.1(14바이트)은 OpenAL 이 거부하고 조용히 멈추므로(재생 중 false) 런타임이 7.1 로 넓혀 틂(빈 SL · SR, 소리 자리 그대로). 여러 채널 ogg 는 libGDX jorbis 가 NullPointerException — 편집기가 경고(WAV 로). 편집기가 가져올 때 · 테스트 플레이 · 내보내기 전에 16비트로 바꾸고(`PDM.audio.fixWav` · `PDM.sounds.fixProjectWavs`, 소리 화면에 경고 + "16비트로 바꾸기"), 런타임 `MakerWav.playable` 도 그런 WAV(24 · 32비트 정수, float, 확장 머리)를 샘플레이트 그대로 16비트로 바꾼 임시 파일로 틂(5.1 · 6.1 → 7.1, 3 · 5채널은 스테레오로). 헤드리스 확인은 OpenAL Soft null 장치(`ALSOFT_CONF` drivers=null)로 실제 재생 경로까지(원본 그대로, 배경음 · 효과음). 편집기 검사는 assets/ 밖(예: `audio/x.wav`)의 프로젝트 WAV 도 봄. 타이틀 음악(`title.music.tracks`)은 "이 설정 사용"을 꺼서 게임 원래 타이틀을 써도 적용. 메뉴 화면(타이틀 · 랭킹 · 일지 · 변경 · 환영)은 연결 줄 `MakerAssets.keepMenuMusic` — 정한 프로젝트 곡이 흐르는 중이면 게임 theme 곡을 틀지 않아 끊기지 않음. 여러 프로젝트 곡은 메뉴를 옮겨도 그대로, 곡이 끝나면 다른 곡(`MakerAudio.playNext`). 같은 곡 판단은 isPlaying 이 아니라 플레이어가 그대로인지로(일시정지 중에도 이어짐), 층 페이드아웃은 새 곡에서 초기화. 편집기 소리 칸은 작은 칸(목록)에도 ■ 멈춤. 편집기 미리 듣기(`PDM.audio.resolve`)도 런타임과 같은 순서 — `game:` · 예전 형식 `music/` · `sounds/` 만 게임 파일, 그 밖(`assets/` · `audio/` …)은 프로젝트 파일(예전에는 assets/ 밖을 게임 파일로 찾아 재생 실패). 값 "" = 기본(게임 원래) 소리, `"none"` = 소리 없음.
- `MakerAudio`: 프로젝트 파일을 게임의 `Music`/`Sample` 에 끼워 넣어 게임 설정의 음량 · 음소거를 그대로 따름. 게임 소리는 처음 재생 때 바로 불러옴(원래 `Sample.load` 는 다음 프레임이라 첫 소리가 빠졌음).
- **배경음 우선순위**: 노드 `bgm` → 그룹(`bgm` + `bgmExtra[]` 층마다 무작위 — 전부 게임 곡이면 `Music.playTracks` 로 이어 재생, `bgmTense` + `bgmTenseWhen`, `bgmBoss`) → 사용자 테마 `music` → 게임 기본 테마 음악. "테마 기본 음악으로 채워서 고치기"(`PDM.THEME_MUSIC`).
- **소리는 각 세부 설정에서**: 아이템(§8.5) · 캐릭터(`sounds { attack, hurt, die, talk }` + `voice` = 대사 글자 소리) · 주문 · 직업 능력(쓸 때 · 맞을 때) · 코덱스(쓸 때 · 맞을 때 · 빗나갈 때 · 다 닳을 때) · 대사창 `sounds` · 마음 시스템 `heart.sounds`(up · down · bond · crystal) · 게이지 `gauge.sounds`. 🎚 = 그 소리를 사운드 편집기에서 열기(게임 소리면 프로젝트로 복사).
- **기본 소리 키** (`MakerAudio.SFX`, 편집 화면 없음 — 예전 `sfx` 값은 읽음): codex.melee · codex.meleeHit · codex.ranged · codex.cast · codex.hit · spell.cast · spell.hit · ability.cast · ability.hit · item.eat · item.drink · item.read · item.use · dialogue.open · dialogue.type · dialogue.next · choice.move · choice.select. mod-2 소리가 없으면 원작 소리로.
- 편집기: 가져오기(→ `assets/audio`) · 게임 소리 복사 · 미리 듣기 · 쓰는 곳 목록 · **파형 편집**(구간 선택 · 확대 · 자르기 · 무음 · 페이드 · 음량 · 노멀라이즈 · 뒤집기 · 속도 · 모노 → WAV) · **효과음 합성기**(레이어 최대 4 × 파형 · 음높이 미끄러짐 · 유니즌 · FM · 비브라토 · ADSR · 바이쿼드 필터, 전체 드라이브 · 에코 · 리버브, 시작값 16개, "살짝 바꾸기" seed).
- 코드: `MakerAudio.playSe("sound:bell")` · `playBgm(…)`, 이벤트 명령 "효과음 / 음악".

---

## 10. 타이틀 화면

데이터 `title.json` · 편집기 `editors/title.js` · 런타임 `MakerTitle` · `MakerPages`.

```jsonc
{ "enabled": true,                                             // false = 게임 원래 타이틀 (새 프로젝트)
  "music": { "tracks": [] },                                   // 비우면 게임 곡, "none" = 끄기
  "background": { "archs": true, "archStyle": "game|classic", "archReverse": false, "archDir": "up|down|left|right", "archSpeed": 20, "archImages": { "bg": "", "fg": "" }, "color": "",
                  "gradient": { "enabled": true, "color": "#0b1b3a", "alpha": 0.55, "from": "top" }, "vignette": true,
                  "effect": "none|snow|rain|embers|sparkle|petals|fireflies|mana", "effectDensity": 1, "effectArea": "screen|logo", "effectFront": false },,
                  "ruins": { "on": true, "dir": "up|down|left|right", "speed": 15, "dark": true,
                             "wall": { "show": true, "image": "", "fw": 333, "fh": 100, "cols": 3, "frames": 6 },
                             "layers": [ { "name": "먼 덩어리", "image": "game:splashes/title/back_clusters.png", "fw": 450, "fh": 250, "cols": 1, "frames": 2,
                                           "count": 4, "speed": 1.33, "size": 0.5, "dark": 0.5, "spin": 20, "show": true } ] } },
  "layers": [ { "image": "game:effects/fireball-short.png", "frame": [47, 47], "frames": [], "fps": 24, "fit": "none", "x": 0.12, "y": 0.2, "tile": false,
                "scrollX": 0, "scrollY": 0, "bob": 2, "pulse": 0, "spin": 0, "blend": "light", "front": false, "titleOnly": false } ],
  "menus": { "background": true, "music": true, "layers": true, "effect": false },
  "logo": { "mode": "game|image|text|none", "scale": 1, "offsetY": 0, "glow": true, "anim": "none|float|sway|pulse", … },
  "gate": { "enabled": true, "text": "화면을 누르세요", "logoAfter": "fade|up|stay", "idleReturn": 15 },
  "buttons": { "layout": "game|grid|column", "width": 120, "height": 18, "gap": 4, "hideButton": true,
               "anim": { "enter": "none|fade|slideUp|…|drop|pop", "duration": 0.6, "stagger": 0.08, "idle": "none|bob|sway|pulse" },
               "items": [ { "id": "play", "label": "" }, { "id": "credits", "custom": true, "action": "text", … } ] },
  "version": { "visible": true, "text": "" }, "exit": { "visible": true },
  "layout": { … },                                             // 로고 · 버튼 영역 직접 편집 (§11)
  "pages": { … } }                                             // 하위 페이지 (아래)
```

- 게임: 연결 줄 `TitleScene.create()` 의 `fadeIn()` 앞 `MakerTitle.apply` — 게임의 원래 요소를 모두 숨기고 설정대로 새로 그림.
- 배경 `archStyle`: `game` = 게임 배경 그대로(4.0 은 `ui.TitleBackground` — 리플렉션, 없으면 `Archs`, mod-2 는 title0~9 10겹 시차) · `classic` = 원작 아치를 네 방향 · 속도 · 그림 바꾸기. 레이어도 가로 · 세로 흐름.
- `background.ruins.on` (SPD 4.0 + `game` 일 때만) → `MakerTitle.Ruins` 가 4.0 "떠오르는 폐허"를 직접 그림: 바둑판 벽(`wall`, 칸마다 행·열 해시로 프레임 고정) + 조각 레이어(`layers` — 스프라이트 시트 `fw×fh` · `cols` · `frames` 중 무작위, `count` 개가 `dir` 로 `speed×레이어 speed` 만큼 흐르고 화면 밖으로 나가면 다른 위치 · 프레임 · `±spin` 기울기로 다시 나옴, `dark` 만큼 어둡게). 화면 높이 450 기준 배율, 세로 화면은 ÷1.5 (게임과 같음). `layers` 가 없으면 게임 기본 6겹. 미리보기(title.js)도 같은 규칙. `MakerAssets.customBackground` 는 이때 메뉴 화면 배경도 같이 바꿈.
- **메뉴 화면** `menus` (`MakerAssets.MenuStyler`, PixelScene 연결 줄): 랭킹 · 모험 일지 · 변경 · 소개 화면도 타이틀과 같은 배경 · 음악.
- **기본값 = 지금 저장소의 타이틀**: `PDM.gameTitle4`(저장소에 `splashes/title/archs.png` = SPD 4.0+)에 따라 버튼 순서 · `hideButton` 이 다름. 손대지 않은 기본 타이틀은 `PDM.titleSyncDefaults` 가 맞춤. 빠른 시작: "지금 게임 기본" · "예전 아치 모양" · mod-2 프리셋.
- **하위 페이지** `pages` (`MakerPages`):
  - `updates { mode: game|github|off, repo, page }` — 업데이트 확인을 끄거나 내 GitHub 저장소 Releases 로, 업데이트 버튼이 열 주소.
  - `news { mode: game|feed|custom|off, url, articles[{ title, summary, date, url, icon }] }` — 내 RSS · 직접 쓴 소식(`injectNews` 가 News 목록에 넣음).
  - `about` · `support` · `changes { mode: game|custom, title, blocks[{ title, text, link, linkLabel, color }] }` — custom 이면 화면 첫 프레임에 내용을 블록으로 바꿈(`Replacer`).
  - 서비스 모듈은 이 패키지를 모르므로 System 속성(`pdmaker.updates.*` · `pdmaker.news.*`)으로 넘기고, GitHubUpdates · ShatteredNews 연결 줄(선택 — 파일이 없는 저장소면 건너뜀)이 읽음.
- 에디터: 움직이는 미리보기(`SIZES` 427×267 · 640×360 · 135×292, 탭 전 ↔ 메뉴, 애니메이션 다시 보기), 타이틀 스프라이트(title0~9 · arcs · banners · chrome · icons)를 바로 고치기 · 바꾸기 · 원래대로.

---

## 11. 대사창

데이터 `dialogue.json` · 편집기 `editors/dialogue.js` · 런타임 `MakerDialogue`.
화면 아래 넓은 대사 상자 + 말하는 캐릭터의 스탠딩 일러스트 + 이름표 + ▼ + 한 글자씩 + 선택지 (RPG Maker 식).

```jsonc
{ "mode": "box|window",          // window = 원작 가운데 창 (새 프로젝트)
  "box": { "style": "round|game|image", "color": "#ffffff", "alpha": 0.94, "border": "#b9b4c8", "radius": 5, "textColor": "#3a3448", "fontSize": 8,
           "height": 0.27, "margin": 4, "padding": 8, "image": "", "slice": 6, "highlight": "#d0602a", "align": "left", "hideHud": true },
  "name": { "show": true, "pos": "auto", "color": "#3c3a48", "textColor": "#ffffff", "fontSize": 7, "image": "", "slice": 4 },
  "illust": { "show": true, "side": "left", "height": 0.92, "layer": "front", "avoidText": true, "smooth": "auto" },
  "typing": { "speed": 40, "sound": "" }, "indicator": { "show": true, "image": "", "anim": "bob|blink|none" },
  "choice": { "pos": "middle", "width": 0.42, "image": "", "imageOn": "", "slice": 4 },
  "sounds": { "open": "", "type": "", "next": "", "move": "", "select": "" },
  "text": { "autoScale": true, "scaleMax": 2, "scale": 1, "lineSpacing": 0, "bold": false, "outline": false, "outlineColor": "#000000", "outlineWidth": 0.5,
            "shadow": false, "shadowColor": "#000000", "shadowX": 0.5, "shadowY": 0.5 },
  "layout": { "enabled": false, "box": {…}, "text": {…}, "name": {…}, "illust": {…}, "choices": {…}, "indicator": {…} } }
```

- 크기 단위 = 게임 화면 픽셀(16:9 에서 높이 약 270). 일러스트 높이 = 화면 높이 × `illust.height` × 캐릭터 `portrait.scale`. 큰 그림은 LINEAR 로 부드럽게(`smooth`).
- 화자: 캐릭터 id → 그 캐릭터의 초상화(표정 키 → 표정 그림), `$hero` → 영웅의 `character`. 대사 명령: 화자 · 표정 · 이번만 다른 일러스트 · 위치 · 이름 바꾸기(???) · `_강조_`. "표정 바꾸기" 이후 표정을 적지 않은 대사는 그 표정.
- 대사 바로 뒤의 선택지는 대사창을 띄운 채로. 조작: 누르기 · Enter · Space · Z = 넘김, ↑↓ · 숫자 = 선택지. 캐릭터에게 말을 걸 때의 메뉴(`HeartMenu`)도 같은 방식.
- **글자 크기 · 스타일** (`text`): 글자 배율 = (`autoScale` 이면 min(화면 가로/300, 세로/190) — 세로 화면 150×260 기준, 1 ~ `scaleMax`) × `scale`, 대사 · 이름표 · 선택지 글자 크기에 곱함(런타임 `MakerDialogue.textScale` · 편집기 `textScale` 같은 계산). PC 는 게임이 보통 3배 확대라 큰 창일수록 화면 단위가 넓어져 글자가 작아 보였음 → 1280×720 ×1.26, 1080p ×1.89. `lineSpacing` = 줄마다 더하는 px(`TypeText.layout` 뒤에 줄을 내림). 외곽선(8방향) · 그림자 · 굵게 = 같은 글을 옮겨 겹친 사본(`deco`, 글자 나오기도 함께) — 외곽선 · 그림자 사본은 단색 실루엣(`silhouette`: 곱하기 0 + 더하기 색, 게임 글꼴의 검은 테두리까지 그 색)이라 테두리 바깥에 보임. 거리는 실제 화면 한 픽셀 단위로 맞춤(`px`).
- `hideHud`: 대사창 · 선택지가 떠 있는 동안 게임 UI 를 숨기고 마지막 창이 닫히고 0.15초 뒤 되돌림(화면 필터 · 일러스트 층은 그대로).
- **레이아웃 직접 편집** (`layout.js PDM.layoutEditor`): 미리보기에서 영역을 끌기 · 모서리로 크기 · 새로 그리기 — 화면 비율 0~1. 타이틀의 로고 · 버튼 영역도 같은 방식.
- "일러스트 표시/숨김/움직이기" 명령(번호 1~8 · 왼쪽 · 가운데 · 오른쪽 · 전체 화면 · 페이드 + 크기 % · 불투명도 % · 옮기기 px · 뒤집기 · 대기)은 `MakerStage` 층. 그리는 순서: 게임 화면 < 일러스트(번호가 클수록 앞) < 화면 어둡게(fade) < 대사창. 자리 계산은 편집기 미리보기 `PDM.Dialogue.stageLayout` 과 같은 식(테스트로 확인), 움직이기는 실제 지난 시간(`Game.elapsed`) · 같은 곡선(`ease`). 대사 명령의 `speed`(이 줄만 글자 속도) · `auto`(다 보인 뒤 저절로 넘김, 0.1초), "입력 기다리기"(`MakerDialogue.WaitWnd` — 보이지 않는 창). 자세한 것: `docs/EDITOR-UX-CUTSCENES.md`.
- **화면 크기 · 방향 · 안전 영역 (4차)**: 대사창 · 글 · 이름표 · ▼ · 선택지는 안전 영역(`getSafeInsets(INSET_ALL)` — 노치 · 상태 줄 · 내비게이션 바를 뺀 곳, 데스크톱은 화면 전체) 안에, 레이아웃 비율도 안전 영역 기준. 일러스트 · 페이드는 화면 전체. 일러스트 기본 크기는 화면 높이 90% 이되 폭이 화면 폭을 넘지 않게(세로 화면 · 가로로 긴 그림). 창 크기 · 방향이 바뀌어 같은 층의 게임 화면을 다시 만들면(`Game.resize`) 이벤트가 화면에 붙인 진행(타이머 · 대기 · 이동 · 페이드)을 새 화면으로 옮기고 페이드 판 · 일러스트를 새 크기로 다시 놓고 기다리던 창을 다시 띄움(`EventInterpreter.sceneCreated/rebuild` · `MakerStage.rebuild`). 대사는 글자 단위로 나올 때도 빈칸 없는 긴 낱말 · 한자 · 가나는 어디서든 줄을 바꿈(`TypeText.layout`).
- 에디터: 설정 + 미리보기 · 빠른 시작 4종. 캐릭터 편집기 · 이벤트 장면 미리보기가 모두 같은 계산(`PDM.Dialogue`).

---

## 12. 그림 · 픽셀 편집기

### 12.1 그림 관리 (`editors/sprites.js`)
- 프로젝트의 모든 그림을 폴더별로: 크기 · 쓰는 곳(모든 리소스 JSON 의 같은 경로 문자열) · 편집 · 바꾸기 · 이동/이름 바꾸기(쓰는 곳도 고치고 바로 저장) · 삭제(쓰는 곳이 없을 때만). 그림 칸의 "찾기…"는 리소스에 맞는 표준 폴더로 복사(`PDM.assets.folderFor`).
- 🧹 자동 정리: 쓰는 곳을 보고 표준 폴더로 옮김(미리 보기 후 실행).

### 12.2 게임 그림 바꾸기 · UI 그림
- 프로젝트 `assets/game/<게임 assets 경로>.png`(예 `assets/game/interfaces/title3.png`)가 있으면 게임이 원본 대신 씀 — `MakerAssets.install` 이 `TextureCache` 의 같은 키에 넣음(프로젝트를 불러올 때와 모든 화면 `PixelScene.create` 때). `MakerRuntime.texture("game:…")` 도 이 그림. 에디터 `PDM.assets.resolvePath` 가 프로젝트 파일을 먼저 씀.
- "고치기" = 원본을 그 경로로 복사해 픽셀 편집기로, "원래대로" = 파일 삭제.
- **UI 그림** (`editors/gameart.js` `uiart`): 게임 interfaces 그림을 종류별 한글 이름으로 고치기 · 바꾸기 · 원래대로.
- `MakerRuntime.texture()` 는 캐시한 텍스처가 `TextureCache` 에 남아 있는지 확인하고 지워졌으면 다시 읽음(구역을 옮길 때 캐시가 비워짐).

### 12.3 픽셀 편집기 (`pixel.js`)
- 도구: 브러쉬(B, 크기 1~64 `[` `]`, 브러쉬 · 지우개 크기 따로) · 지우개(E) · 채우기(G) · 스포이드(I) · 사각 선택(M) · 올가미(L) · 마법봉(W) — 선택에 더하기(Shift) / 빼기(Alt), 선택 안에만 칠함. Ctrl+C/X/V · Delete · Ctrl+A · Ctrl+D, 붙여넣은 그림은 끌어서 옮기고 Enter(클립보드는 창끼리 공유).
- 브러쉬 합성: 보통 · 더하기 · 닷지 · 스크린 · 오버레이 · 곱하기, "부드럽게" · "그려진 칸에만"(한 번 긋는 동안 같은 칸이 겹쳐 칠해지지 않음). 불투명도, 최근 색 8칸.
- 보기: Space+끌기 · Z+끌기 · Ctrl+휠 확대, 배율 입력 · 프레임/전체 맞춤, 픽셀 격자 · 칸 격자. 작업 영역 크기(그림 위치 9방향 · +1 프레임 · +1 줄), 다른 이름으로 저장. 단축키는 `e.code` 기준(한글 입력 상태에서도).
- 빛 레이어 전환(§5.1), 타일셋 실시간 미리보기(§4.6), "🧩 노드 합성기에서 편집". 예전 "영역 효과"(발광 · 외곽선을 픽셀로 굽기)는 광원 · 빛 레이어로 대신해서 없앰.

---

## 13. 마음 시스템 (Heart System)

> 목표: **"캐릭터가 살아 있다"** 는 느낌. 플레이어가 한 일이 수치로 남고, 그 수치가 대사 · 행동 · 스토리 분기로 되돌아온다.
> 데이터 `heart/heart.json`, 편집기 `editors/heart.js`(확장 `sys`), 계산 `heart-core.js` = 런타임 `HeartSystem` (같은 규칙 — JS/Java 결과 일치 확인).

### 13.1 흐름 (era 의 SOURCE → PALAM → JUEL → ABL)

```
 플레이어 행동 ──▶ ① 자극(source)  ──▶ ② 감정 게이지(gauge)  ──▶ ③ 마음의 결정(crystal)  ──▶ ④ 관계 능력(ability) 상승
 (대화, 선물,        행동표 × 성격 보정      이번 층/이번 대화 동안        층을 떠날 때 게이지가         결정을 소모해 레벨업
  함께 싸움, 구출 …)  × 능력 보정             누적                          기준치를 넘으면 결정화
                                     ⑤ 호감도 · 신뢰도 · 분노 변화      ⑥ 흔적(mark) ──▶ ⑦ 관계 단계 · 이정표 이벤트 ──▶ ⑧ 스토리 플래그 → 루트 · 엔딩
```

**마음의 결정은 아이템이 아니다.** 캐릭터마다 숫자(`rec.crystals`)로만 쌓이고, 하트 버튼(`project.heartButton`)이나 명령 `showHeart` 로 여는 **마음 창**(`HeartUI`)에서만 보인다.

### 13.2 수치 (전부 `terms.json` 으로 이름 변경 가능)

| 종류 | era 원본 | 내부 키 (예) | 설명 |
|---|---|---|---|
| 관계 수치 | CFLAG/BASE/TALENT | `favor` `trust` `anger` `sulk` `mood` `temper` `displeased` `accept` `stress` `jealousy` `fatigue` | 호감 · 신뢰 · 분노 · 삐짐 · 무드 · 기분 · 언짢음 · 마음 열림 · 스트레스 · 질투 · 대화 피로 |
| 감정 게이지 | PALAM | `gauge.joy` `relief` `tension` `fear` `anger` `shy` `respect` `sorrow` | 한 층(또는 한 대화) 동안만 |
| 마음의 결정 | JUEL | `crystal.joy` … | 게이지가 굳은 영구 재화 (예전 `gem.*` 은 자동 변환 · 조건식에서 계속 읽힘) |
| 관계 능력 | ABL | `abl.intimacy` `deference` `talk` `combat` `cooking` … | 0~10. 결정을 써서 올림 |
| 성격 | TALENT | `CHEERFUL` `PROUD` `HONEST` `REBELLIOUS` … | 자극 보정값 |
| 관계 이정표 | TALENT(관계 비트) | `bond.admire` → `bond.close` → `bond.partner` | 단계 돌파 이벤트로만 |
| 흔적 | MARK | `mark.fear` `resent` `hurt` `joy` `awe` | 0~3, 영구 |
| 경험 횟수 | EXP | `exp.talked` `fought` `saved` `gifted` `ignored` | 조건식에 씀 |

### 13.3 기본 규칙
- 행동표: 행동마다 `favor / trust / anger` 기본값과 자극 벡터. 성격 보정 `favorAdd` · `trustAdd` · `onlyPositive` · `halve`.
- 신뢰 상한(호감이 `capStart` 이상이고 신뢰 × trustRatio 를 넘으면 호감 상승 감소) · 분노가 `angerMax` 면 삐짐(호감 상승 없음, `decayTurns` 마다 풀림) · 신뢰는 `canLowerTrust` 행동일 때만 내려감.
- **태도**: 적대 / 경계 / 무관심 / 우호 / 신뢰 / 헌신 6단계 — 대사 · AI 에 쓰임.

### 13.4 반응 (Counter)
가까이 있는 캐릭터가 플레이어 행동에 즉석 반응 — 체력 30% 이하(걱정 · 친밀 3 이상이면 물약), 적 처치(칭찬/무서워함), 오래 말을 안 검(`exp.ignored`), 선물(좋아함/평범/싫어함 + 표정), 이 캐릭터를 공격(분노 대폭 · `mark.resent`). 계기마다 무게(`weight`, `moodBonus`)로 하나, `needWarm`.

### 13.5 이정표 · 데일리 · 일기 · 기억
- 이정표 이벤트: `favor ≥ X && trust ≥ Y && abl.intimacy ≥ Z` 를 처음 만족하면 실행 → 이정표 획득.
- 층 이벤트(데일리): 들어갈 때 조건 · 확률로 뽑힘. 일기: 층을 떠날 때 가장 컸던 감정으로 한 줄. 기억: "나를 구해줌" 같은 사건 → 대사 조건.

### 13.6 대사 = 구상(口上) 방식
캐릭터마다 **토픽**별 후보를 두고 조건이 가장 구체적인 것을 고르며, 없으면 공용 대사로.
```jsonc
"dialogue": {
  "greet": [ { "when": "bond.partner", "text": "왔어? …기다렸다고는 안 했어.", "face": "shy" },
             { "when": "favor>=600 && temper>0", "text": "오늘 약초가 잘 자랐어!", "face": "smile" },
             { "text": "안녕, 견습 마녀님." } ],
  "gift_liked": [], "low_hp": [], "floor_enter": [], "boss_defeated": [], "stage_up": [], "idle_chatter": [] }
```
토픽은 `heart.json` 에서 늘리고, 명령 "대사 토픽 말하기(캐릭터, 토픽)" 로 어디서든 부름.

### 13.7 세부 규칙 (eraTW / eraTHYM 에서 옮김)
참고: eraTWKR `TRACHECK_호감도상승처리` · `TRACHECK_신뢰도상승처리` · `ATTITUDE` · `COMF300~303` · `COUNTER_SELECT` · `EVENTTURNEND` · `COMMON`, eraTHYMKR `TRAIN_CHECK` · `ABLUP`. 성적인 수치 · 명령 · 대사는 옮기지 않음.

| 규칙 | 여기서 |
|---|---|
| 호감 상승 | 행동 기본 + (친밀+따름)/2 + 기분 + 성격 + Σ 게이지 곡선 `cap·v/(v+k)` /10 − 반발 흔적 |
| 신뢰 한도 | `상승 × 신뢰·K/(호감+신뢰·K)`, K = 20, 이정표에 따라 30/40 (`bondTrustK`) |
| 신뢰 상승 | 성공 판정 + 친밀/5 + 무드 보정 (무드 가득 +2 · 하락 없음) |
| 무드 | (친밀+1) · 좋은 자극/3, √ 완만, 다른 마음 캐릭터가 보면 절반, 층마다 0 |
| 분노 | 행동 분노 × (2·최대−무드)/(2·최대+무드) × 기분 × 성격 `angerMul` |
| 삐짐 | 분노 최대 → 언짢음(남은 층 수) + 기분 −1, 반발 흔적 `resentLock` 단계면 안 풀림. 사과(`calm`)로 해제 · `removeResent` |
| 기분 | 층마다 `temperChance`, 성격 `temperMul` |
| 결과 판정 | `success` · `great`(마음 열림 ±20), `fatigue`/`fatigueMax`, `perFloor` |
| 마음 열림 | `acceptance` 표 → `accept`, `acceptLv`. 부탁(`requests`)은 점수 > need 면 들어줌 |
| 연모 / 사모 · 질투 · 스트레스 | 이정표 `blockedBy` · `replaces` / 시야 안의 이정표 캐릭터가 `jealousy` 누계 / 층을 떠날 때 두려움 · 슬픔으로 쌓이고 단계별 좋은 게이지 ×0.9~0.6 |

게임: 마음 캐릭터에게 말을 걸면 **말 걸기 메뉴**(`HeartMenu` — 대화 · 칭찬 · 위로 · 사과 + 부탁 + 마음 보기). 명령 `heartMenu` · `request` · `action`(`say`). 예전 프로젝트는 "새 규칙 · 행동 · 토픽 가져오기"로 기본 항목만 추가, 런타임은 빠진 규칙을 기본값으로.

---

## 14. 이벤트 · 스토리

### 14.1 이벤트 (`events/<id>.json` · `editors/event.js` · 런타임 `EventInterpreter` · `EventTriggers`)

```jsonc
{ "id": "ev_bridge", "name": "무너진 다리",
  "pages": [ { "conds": { "sw1": "", "sw2": "", "var": "", "varMin": 0, "self": "", "item": "", "hero": "" }, "cond": "",
               "graphic": { "char": "" }, "move": { "type": "fixed|random|approach|custom", "route": [], "repeat": true, "skip": true, "speed": 3, "freq": 3 },
               "opts": { "dirFix": false, "through": false },
               "trigger": "action",       // action(조사) | touch | auto | parallel | floorEnter | turn | heart | itemPickup | mobKilled | bossDefeated
               "commands": [ { "cmd": "text", "speaker": "aria", "face": "think", "text": "다리가 무너졌어…" },
                             { "cmd": "choice", "options": ["건넌다", "돌아간다"], "branches": [ [ … ], [] ] } ] } ] }
```

- **활성 페이지** = 뒤에서부터 조건이 맞는 첫 페이지(`pageOk/pageIndex`). 페이지 새로 만들기 · 복사 · 붙여넣기(다른 이벤트에도) · 삭제 · 비우기.
- 이미지가 있는 페이지를 가진 이벤트를 맵에 "이벤트" 오브젝트로 놓으면 그 캐릭터 그림의 `MakerNPC`(`pageEvent`)로 나타나 자율 이동대로 움직이고, 말을 걸면(부딪히면) 실행. 페이지가 바뀌면 그림이 바뀌고 이미지 없는 페이지면 사라짐(플래그 `evhide:…` 로 기억). 이미지가 없는 이벤트는 보이지 않는 이벤트 칸.
- 트리거 auto · parallel · floorEnter · turn · heart · itemPickup · mobKilled · bossDefeated 는 맵 오브젝트 없이 동작(층마다 넣는 보이지 않는 액터 `Ticker`, `HeroRuntime.onMobDie`, `MakerAudio.onItemPickup`, `onFloorEnter/Leave`).
- 장면(Scene) = 타임라인 트랙이 있는 이벤트(일러스트 · 대사 · 소리 · 화면 효과), 에디터 재생 미리보기.

**명령** (`commands.js` 정의)
| 분류 | 명령 |
|---|---|
| 메시지 | 대사 표시(화자 · 표정 · 일러스트) · 선택지 · 대사 토픽 · 알림 · 두루마리 창 · 글자 연출 · 예고편 컷신 |
| 흐름 | 조건 분기 · 반복/중단 · 이름표/건너뛰기 · 대기 · 커먼 이벤트 · 이벤트 중지 |
| 데이터 | 스위치 · 변수(= + − × ÷ 나머지 · 무작위 · 다른 값 `src`, 문자열 · 참/거짓) · 셀프 스위치 · 전역 스위치 · 마음 수치 · 감정 게이지 · 흔적 · 기억 |
| 연출 | 일러스트 표시(크기 · 불투명도 · 옮기기 · 뒤집기 · 나타날 때까지 대기)/움직이기/숨김 · 화면 흔들림/번쩍임/색조 · 화면 어둡게/밝게(fade) · 효과음 · 배경음 바꾸기/끄기(페이드 아웃) · 애니메이션 재생 · 이펙트 재생 · 화면 필터 · 카메라 |
| 캐릭터 | 이동 경로 설정 · 순간 이동 · 방향 · 표정 · 소환/제거 · 동료 합류/이탈 · NPC 이주 · 상점 · 퀘스트 |
| 영웅 · 월드 | 맵 이동(transfer) · 타일 바꾸기 · 아이템 주기/빼기 · 금화 · 체력 · 상태(buff) · 경험치/레벨/힘/최대 체력 · 전직 · 직업 능력 고르기 · 게이지/원소 · 주문서 충전 · 몬스터 소환 · 문 |
| 스토리 | 루트 · 엔딩 · 게임 오버(부활 없음) · 게임 클리어(victory → 랭킹) · 타이틀로 · 업적 · 업적 목록 |
| 확장 | 플러그인 명령 · 스크립트 |

- **이동 경로** (move, RPG Maker 식): `route: [{op, …}]` + `repeat` · `skip` · `wait`. op: 8방향 · 무작위 · 영웅에게 다가가기/멀어지기 · 앞/뒤 한 걸음 · 뛰어넘기 · 칸으로 걸어가기(goto, 길 찾기) · 대기 · 방향 · 스위치 · 속도 · 방향 고정 · 통과 · 투명 · 불투명도 · 효과음. 편집 칸 `route`(왼쪽 목록 + 오른쪽 버튼). 같은 캐릭터에 새 경로를 주면 앞의 경로는 멈춤.
- 칸 매개변수(`cell`)는 **맵에서 칸 고르기**(`PDM.pickCell`) 창으로 — NPC 이주 · 맵 이동 · 소환 · 순간 이동 · 퀘스트.

### 14.2 스토리 (`story/story.json` · `editors/story.js` · 런타임 `StoryState`)
- **스위치 · 변수**: 이름 · 설명 · 그룹. 스위치 `initial`(처음 상태), 변수 `type` number | string | bool (`StoryState.varTypes`, 문자열은 `strs`). 대사 · 알림 · 선택지 글의 `{이름}` 은 값으로(`StoryState.expand` — `{var.id}` `{gold}` `{hero.lvl}` …). **전역 스위치**: 새 게임에도 남는 값 — 명령 `global`, 조건식 `global.<이름>`(GameSettings 에 저장).
- **스토리 비트 · 루트 · 엔딩**: 비트(노드에 들어오면 한 번), 루트(`when` → 테마 · 보스 · NPC 교체, 자동 진입 조건), 엔딩(조건 + 우선순위, 높은 것부터).
  ```jsonc
  "endings": [ { "id": "true_end", "priority": 100, "when": "cores>=5 && bond.partner(any) && !switch.betrayed", "scene": "sc_true_end" },
               { "id": "fail_end", "priority": 0, "when": "true", "scene": "sc_fail" } ]
  ```
- **입장 문구** `messages { start, descend, back, groups{<id>:{text,window}}, nodes[{node,text,window}] }`: 층에 들어올 때 기록에 나오는 글 — `MakerTexts.get` 이 descend/return 키를 가로채 `MakerRuntime.enterText`(첫 시작 → 맵 → 그룹 → 평소, window 면 `WndStory`, 한 번 본 것은 플래그).
- **잠긴 맵** `locks [{ node, cond, message }]`: 그 맵으로 가는 모든 계단을 조건이 참일 때까지 막음 (`Level.activateTransition` 연결 줄 → `LevelHooks.lockedNode`).
- **소개 화면** `intro { welcome, welcomeButton, vanilla, groups{<id>:{text,image}} }`: 처음 켰을 때(WelcomeScene) 글 · 버튼, 구역에 처음 들어갈 때 로딩 화면(InterlevelScene 연결 줄 2개 — `MakerRuntime.splash` 그룹 그림 · `storyGate` 가 "새로 온 5n+1층" 조건을 맞추거나 어긋나게 해서 글을 띄우거나 막음). 내려갈 때만, 26층보다 깊으면 불가.
- **엔딩 화면 글** `ending { text, exit, stay, surfaceExit }`: 아뮬렛 · 지상 화면 글을 덮어씀.
- 편집기는 '게임 원래 글'을 실제 문장 · 실제 스플래시 그림으로 보여 줌.

### 14.3 조건식 (`Cond` — 에디터 `cond.js` 와 같은 문법)
```
식     := 비교 ( ("&&" | "||") 비교 )*   |  "!" 식  |  "(" 식 ")"
비교   := 값 ( "==" | "!=" | ">=" | "<=" | ">" | "<" ) 값  |  값
값     := 숫자 | '문자열' | true | false | 이름
이름   := switch.X | var.X | self.A | global.X | favor | trust | anger | abl.X | mark.X | exp.X | crystal.X | bond.X | char.<id>.favor …
        | hero.class | hero.id | hero.hp% | hero.x | hero.y | hero.str | hero.maxhp | hero.subclass | hero.ability | hero.gauge | hero.element | hero.charge
        | depth | node | group | turns | choice.<노드> | visited.<노드> | route | item.X(개수) | party.<id> | safe
        | quest.<id>(.active/.ready/.done) | badge.<id> | stat.<Statistics 필드>
```
캐릭터 문맥(대사 조건 등)이 있으면 `favor` = 그 캐릭터 값, 아니면 `char.<id>.favor`. 에디터의 조건 칸(`condEditor`)은 대상 · 비교 · 값을 고르는 줄 ↔ 식 직접 입력(괄호 · && · || 혼합은 직접 입력만).

---

## 15. 게임 텍스트 · 업적

### 15.1 게임 텍스트 (`texts.json` · `editors/texts.js` · 런타임 `MakerTexts`)
- `{ texts: { "<언어 코드>": { 키: 글자 }, "*": { 모든 언어 } } }`. 게임 저장소 `assets/messages/<분류>/<분류>[_언어].properties` 를 읽어 언어 · 분류 · 검색 · 바꾼 것만으로 걸러 보여 주고, 줄마다 바꿀 글자를 적음.
- 연결 줄 `Messages.getFromBundle` 맨 앞 → `MakerTexts.get(key, lang)` (서식 %s 는 그대로). 입장 문구 · 소개 화면 · 엔딩 글 · 원래 배지 이름도 이 경로로 바꿈.

### 15.2 업적 · 배지 (`badges.json` · `editors/badges.js` · 런타임 `MakerBadges`)
- 내 배지 `list:[{ id, name, desc, icon, image, trigger: manual|floorEnter|mobKilled|itemPickup|turn, cond, event, hidden }]` — 얻은 배지는 전역 `badge.<id>`, 명령 `badge` · `badgeList`, 조건식 `badge.<id>`. 그림 = 시트 칸(`icon`) 또는 16×16 파일(`image`), 칸 단위 그림 편집.
- 게임 원래 배지: `Badges.java` + messages 에서 실제 이름 · 설명 · 그림 칸 · **실제 획득 조건 코드**를 읽어 보여 줌. 이름 · 설명은 `texts.json` `*` 에, 그림은 `interfaces/badges.png` 를 고침. `orig { 이름: { mode: off|custom, trigger, cond } }` 로 끄거나 내 조건으로 대체 — 연결 줄 `Badges.displayBadge` → `MakerBadges.blocked`, 대체는 `MakerBadges.giveOrig`(리플렉션).

---

## 16. 플러그인

GameMaker `.gmplugin` 매니페스트 방식 (`editors/plugins.js` · `plugin-api.js` · 런타임 `PluginHost`). 내장 예제: `editor/builtin-plugins/screen-fx`.

```jsonc
// plugins/effect-maker/plugin.json
{ "id": "effect-maker", "name": "이펙트 메이커", "version": "0.1.0", "pdmaker": ">=0.1", "dependencies": [],
  "editor": { "main": "editor.js" },                                                     // 에디터에 편집기 · 패널 · 명령 추가
  "runtime": { "jar": "runtime/effect-maker.jar", "entry": "com.example.EffectPlugin" },  // 게임 쪽 (선택, 데스크톱만)
  "contributes": { "resourceTypes": [ … ], "eventCommands": [ { "id": "effect.play", "name": "이펙트 재생", "params": [ … ] } ] } }
```
- 에디터 API: `pdm.registerEditor` · `registerEventCommand` · `registerResourceType` · `registerMenu` · `onProjectLoad` · `project.read/write`.
- 런타임 API: `PluginHost.MakerPlugin.onLoad()` 에서 `PluginHost.register(id, handler)`. 켜기/끄기 · 순서 = `project.json` 의 `plugins`.

---

## 17. 게임 런타임

패키지 `com.shatteredpixel.shatteredpixeldungeon.pdmaker` (`runtime/src/…/pdmaker/`). 설치기가 게임 저장소 `core/src/main/java/…/pdmaker/` 로 복사한다 (`ChapterPaths.java` 는 쓰지 않는 예전 파일 — 복사하지 않고 남은 것은 지움).

### 17.1 클래스

| 영역 | 클래스 | 역할 |
|---|---|---|
| 바탕 | `MakerRuntime` | 프로젝트 찾기(`findRoot`: `-Dpdmaker.project` → 실행 폴더 `project/` → jar 옆 `project/` · `project.zip`(설치 파일 — `unpackProject`) → `pdmaker-project` 내부 자원(APK)), JSON 로드, 텍스처 · 빛 레이어, 층 입출입(`createLevel` · `beforeScene` · `onFloorEnter/Leave` · `enterText` · `splash` · `storyGate`) |
| | `Cond` · `StoryState` · `DefaultTerms` | 조건식 · 스위치 · 변수 · 루트 · 엔딩 · 플래그 저장(`Bundle`) · 기본 용어 |
| | `GenSupport` · `MakerHeroCode` · `Special` | 사용자 코드 클래스의 바탕 · 도우미 · 특수 기능 도구 (§6.4 · §6.5) |
| 맵 | `WorldGraph` | depth/branch · 계단 배정(`ports` · `pickArrival`) · 갈림길 선택 |
| | `MakerLevel` | 직접 그린 층 (`build` · `createMobs` · 투명 출입구 · 발판) |
| | `LevelHooks` | 자동 생성 층 주입 · 구성 블럭 · 방 넣기 · 오브젝트 배치 · 밟기 · 스폰 위치 · 잠긴 맵 · 큰 타일셋 |
| | `TemplateRoom` · `TemplateSpecialRoom` | 방 템플릿 (변형 · 무작위 칸) |
| | `MakerProp` · `MakerPropTop` · `MakerPaint` · `MakerUserTiles` | 맵 오브젝트 · 솟은 윗부분 · 맵 세부 그리기 · 사용자 타일 |
| | `MakerSafe` · `MakerHomes` | 안전구역 · NPC 이주 |
| 영웅 | `HeroRuntime` · `HeroSelect` | 영웅 적용 · 능력치 · 시트 · 초상화 · 저장 슬롯 · 코드 훅 / 영웅 선택 화면 · 해금 |
| | `MakerCast` · `MakerSpells` · `MakerAbilities` · `MakerActive` · `MakerGauge` | 시전 엔진 · 주문 · 전직/직업 능력 · 전직 액티브 · 예전 게이지 |
| | `MakerTalents` · `MakerTalentsPane` | 특성 포인트 · 효과 / 영웅 정보 창 특성 탭 |
| 캐릭터 · 아이템 | `MakerNPC` · `MakerMob` · `MakerSprite` | 데이터 NPC/동료 · 몬스터 · 스프라이트(빛 레이어 · 번짐) |
| | `MakerItem` · `MakerCodex` · `MakerCatalog` · `MakerDrops` | 데이터 아이템 · 코덱스/그리모어 · 도감 · 드랍/금지/상자 |
| | `MakerBow` · `MakerWand` | 원거리 무기(쏘기 · 발사체) · 마법봉 공격 이펙트 |
| | `MakerShop` · `MakerQuests` | 상인 창 · 퀘스트 |
| 이벤트 · 마음 | `EventInterpreter` · `EventTriggers` | 명령 실행(창이 닫힐 때까지 대기) · 페이지 · 트리거 · `Ticker` |
| | `HeartSystem` · `HeartMenu` · `HeartUI` | 마음 시스템 · 말 걸기 메뉴 · 마음 창/하트 버튼 |
| | `MakerBadges` · `MakerTexts` | 업적 · 게임 텍스트 |
| 화면 · 소리 | `MakerTitle` · `MakerPages` · `MakerAssets` | 타이틀 · 하위 페이지 · 게임 그림 바꾸기/아이템 그림/아이콘/메뉴 화면 |
| | `MakerDialogue` · `MakerStage` | 대사창 · 일러스트 층 |
| | `MakerAudio` | 소리 참조 재생 · 배경음 · 아이템 소리 |
| | `MakerLights` · `MakerTileLight` · `MakerBloom` | 광원 · 타일 효과 레이어 · 번짐 |
| | `MakerEffect` · `MakerFilter` · `MakerTextFx` · `MakerTrailer` | 파티클 · 화면 필터 · 글자 연출 · 예고편 |
| 확장 | `PluginHost` | 플러그인 jar (데스크톱만) |

### 17.2 원본 코드 연결점 (`editor/runtime-installer.js` `PATCHES`)

설치기가 게임 원본 파일에 한 줄씩 넣는다 — 줄 끝에 `// >>> pdmaker` 표시, ▶ 테스트 플레이 · 게임 내보내기 때 자동 갱신, `node runtime-installer.js <저장소> --uninstall` 로 깨끗이 제거. 고칠 파일이 없는 `optional` 연결점(서비스 모듈)은 건너뛴다. 처음 고칠 때 원본을 `*.pdmaker-backup` 으로 남긴다.
설치기는 그 밖에 사용자 코드 생성(`generate` → `pdmaker/gen/` · `GenIndex.java`, 예전 파일 지움)과 게임 이름 적용(`applyGameId`, §18.3)을 한다.

총 **91개** 연결점 · **41개** 파일 (경로는 `core/src/main/java/…/shatteredpixeldungeon/` 기준, services · settings.gradle 은 저장소 기준).

**지원 저장소 · 판 차이** (`runtime-installer.js` `compat()` · 런타임 `MakerCompat`): 설치 전에 패키지(`com.shatteredpixel.shatteredpixeldungeon`) · 체력 형(int) · `LevelTransition.BRANCH_EXIT`(SPD 2.5+) · 연결 줄 위치를 살핌 → 안 되는 것은 설치하지 않고 이유를 알림, 위치를 못 찾은 줄은 경고(그 기능만 꺼짐 · 런타임 상태의 "필요한 줄 수"에서 빼서 매번 다시 설치하지 않음). 판마다 다른 API(GreenFlame · MissileWeapon.setID/spawnedForEffect · BannerSprites 종류 · Music.paused · Wand.wandUsed 접근 · customTiles 목록 형 · Fireball 위치 · MagicMissile.LIGHT_MISSILE)는 `MakerCompat` 반사로. 확인: SPD 2.5.4 · 3.0.2 · 3.3.8 · 4.0.0 · 4.0.2 (설치 · javac 컴파일 · 헤드리스 테스트 플레이).

| 파일 | 연결점 |
|---|---|
| `Dungeon.java` | 새 게임 시작 시 스토리 초기화<br>영웅 편집기의 영웅 적용 (시작 아이템·주문서·능력치) · 시작 층<br>직접 그린 층 · 층 사이 맵으로 바꾸기<br>절차 생성 층에 오브젝트 넣기<br>저장<br>불러오기<br>플레이어 스폰 위치 (맵에 놓은 시작 위치 오브젝트)<br>저장 슬롯: 어떤 영웅인지 읽기 |
| `messages/Messages.java` | 게임 글자 바꾸기 (texts.json) |
| `scenes/GameScene.java` | 층 입장 이벤트<br>진행 방향(탑 모드) 계단 그림<br>테마 물 = 흐르는 사용자 타일: 그 속도로 (세로 · 가로) |
| `levels/RegularLevel.java` | 자동 생성 층에 직접 만든 방 추가<br>구성 블럭: 층 구조·분위기 |
| `scenes/InterlevelScene.java` | 소개 화면: 로딩 배경 그림<br>소개 화면: 구역 이야기 글<br>층을 떠날 때 (감정 결정화·일기) |
| `Badges.java` | 게임 원래 배지의 얻는 조건 끄기 · 바꾸기 |
| `levels/Level.java` | 잠긴 맵 (조건이 맞아야 들어감)<br>칸을 밟았을 때 이벤트<br>통로 연결: 도착 층에서 짝 계단 고르기<br>테마별 몬스터 (드랍 테이블 › 테마별 몬스터) |
| `tiles/DungeonTilemap.java` | 큰 타일셋 (한 칸이 16px 이 아닌 타일셋)<br>큰 타일셋: 발견 연출 타일 크기 |
| `tiles/DungeonTerrainTilemap.java` | 큰 타일셋: 정보 창 타일 크기 |
| `actors/hero/Hero.java` | 맵 오브젝트: 옆에서 누르면 밀기·상호작용<br>영웅 코드: 명중<br>영웅 코드: 회피<br>영웅 코드: 피해<br>영웅 코드: 방어<br>영웅 코드: 속도<br>영웅 코드: 공격 적중<br>영웅 코드: 공격 받음<br>특성 포인트 (영웅 편집기 특성을 쓰면 그 포인트로)<br>전직 이름 (영웅 정보 창) |
| `actors/mobs/Mob.java` | 드랍 테이블: 몬스터가 죽을 때<br>영웅 코드: 몬스터 처치<br>캐릭터 AI: 제자리 고정 · 코드로 직접 · 지속 회복<br>캐릭터 체력 무한: 쓰러지지 않음<br>캐릭터: 어느 프로젝트 캐릭터로 만든 게임 몬스터인지 저장 · 불러오기<br>샌드백: 받은 피해를 살펴보기에 |
| `actors/mobs/MobSpawner.java` | 등장 금지한 몬스터 빼기 |
| `sprites/ItemSprite.java` | 아이템 그림 배율 (바닥에 놓였을 때)<br>세밀한 아이템 그림 (배율 적용으로 키운 PNG — 한 칸 크기로 그림) |
| `windows/WndHero.java` | 영웅 정보 창의 특성 탭 → 영웅 편집기의 특성·주문 |
| `actors/hero/HeroClass.java` | 직업 능력: 왕관으로 고르는 목록 → 영웅 편집기의 직업 능력 |
| `items/TengusMask.java` | 전직: 텐구의 가면 → 영웅 편집기의 전직 |
| `scenes/PixelScene.java` | 게임 그림 바꾸기(assets/game) · 메뉴 화면 배경·음악 |
| `scenes/HeroSelectScene.java` | 영웅 선택 화면: 게임 직업 대신 프로젝트 영웅 버튼 |
| `sprites/HeroSprite.java` | 초상화: 영웅 편집기의 그림 (상태 창 · 영웅 창)<br>영웅 시트: 갑옷을 바꿔도 영웅 편집기의 그림·프레임 크기 유지 |
| `GamesInProgress.java` | 저장 슬롯: 지금 영웅 기억 (저장할 때) |
| `scenes/StartScene.java` | 저장 슬롯 초상화·이름 (시작 화면) |
| `windows/WndGameInProgress.java` | 저장 슬롯 초상화·이름 (이어하기 창) |
| `scenes/TitleScene.java` | 타이틀 화면 (배경·로고·버튼·음악)<br>타이틀 음악 이어 틀기 |
| `scenes/RankingsScene.java` | 타이틀 음악 이어 틀기 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음) |
| `scenes/JournalScene.java` | 타이틀 음악 이어 틀기 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음) |
| `scenes/ChangesScene.java` | 타이틀 음악 이어 틀기 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음) |
| `scenes/WelcomeScene.java` | 타이틀 음악 이어 틀기 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음) |
| `items/wands/Wand.java` | 마법봉 공격 이펙트 (아이템 편집기 › 마법봉 이펙트) |
| `actors/mobs/npcs/Shopkeeper.java` | 판매 불가 (아이템 noSell) |
| `windows/WndBag.java` · `ui/InventoryPane.java` | 새 가방의 탭 아이콘 (아이템 kind bag) |
| `items/Item.java` | 게임 아이템 그림 바꾸기 (gameitems.json)<br>아이템 소리: 행동 버튼 (사용·장착)<br>아이템 소리 · 이펙트: 실제로 던지는 순간 (던지기 버튼을 누를 때가 아니라)<br>아이템 소리: 주울 때 (정한 소리가 있으면 원래 소리 대신)<br>아이템 소리: 던진 것이 적에게 닿을 때<br>아이템 소리: 던진 것이 바닥에 떨어질 때<br>버리기 금지 (아이템 noDrop)<br>아이템 추가 기능: 버튼 이름 · 버튼 동작 · 던져서 떨어졌을 때 · 가방 기능 안에서 빼내기(detachAll) · 저장 · 불러오기 |
| `items/weapon/missiles/MissileWeapon.java` | 아이템 추가 기능: 투척 무기가 맞혔을 때 던지기 효과 |
| `sprites/CharSprite.java` | 무기 공격 모션 (무기 그림이 휘둘러짐) |
| `actors/Char.java` | 캐릭터 체력 무한 (피해 숫자는 뜨고 체력은 그대로) |
| `actors/Actor.java` | 아이템 추가 기능: 불러온 층에서 폭탄 퓨즈 이어서 타기 |
| `items/Gold.java` | 금화 양 배율 (드랍 테이블 › 금화) |
| `items/KindOfWeapon.java` | 아이템 소리: 무기로 공격이 맞을 때 (정한 소리가 있으면 원래 타격음 대신) |
| `services/updates/…/GitHubUpdates.java` | 업데이트 확인: 끄기 (타이틀 하위 페이지) (선택)<br>업데이트 확인: 내 GitHub 저장소 (타이틀 하위 페이지) (선택)<br>업데이트 버튼: 다운로드 페이지 (타이틀 하위 페이지) (선택) |
| `services/news/…/ShatteredNews.java` | 새 소식: 끄기 · 직접 쓴 소식 (타이틀 하위 페이지) (선택)<br>새 소식: 내 RSS 주소 (타이틀 하위 페이지) (선택) |
| `settings.gradle` | 안드로이드 SDK 가 없으면 android 모듈 건너뛰기 (다른 PC 에서 테스트 플레이) |

---

## 18. 빌드 · 내보내기

### 18.1 테스트 플레이 (`main.js game:run`)
- 순서: 게임 저장소 확인(`repairRepo`) → Java 확인 · 내려받기 → 런타임이 없거나 오래됐으면 설치(`runtimeState` — 필요한 연결점만 셈) → 사용자 코드 생성 → 게임 이름 적용 → gradle.
- `project.settings.playTask`: `debug`(기본 — 게임 원래 `desktop:debug`, 버전 -INDEV, init 스크립트가 `pdmaker.project` 를 넘김) | `playtest`(init 스크립트의 `desktop:pdmakerPlaytest`, -PLAYTEST, 세이브 폴더 분리). 컴파일만 = `core:compileJava`.
- 출력 창에 gradle · 게임 로그, 생성 코드의 컴파일 오류에는 에디터 위치를 덧붙임. 실패하면 작업 표시줄 알림(§2.1).

### 18.2 게임 파일 내보내기 (`main.js game:export`)
저장 → 검사 → 런타임 설치 · 코드 생성 → gradle → `<출력 폴더>/<게임 이름>/`.

| kind | gradle | 결과 |
|---|---|---|
| `jar` | `desktop:release` | jar + bat/sh + `project/` |
| `image` | `desktop:jpackageImage` | Java 포함 실행 파일 폴더(.exe) + `project/` |
| `installer` (Windows) | `desktop:jpackageImage` → `jpackage --type exe --app-image …` | `<이름> 설치.exe` 하나 — 프로젝트는 `app/project.zip` 으로(WiX 가 코드 페이지 1252 라 한글 파일 이름이면 light.exe 311 로 실패하므로 zip 하나로 넣음, 런타임 `unpackProject` 가 처음 실행할 때 `~/.pdmaker-games/<해시>-<크기>-<날짜>/` 에 풀고 같은 zip 이면 다시 풀지 않음). `--win-per-user-install --win-shortcut --win-menu --win-dir-chooser`, 패키지 이름에서 만든 고정 `--win-upgrade-uuid`(새 설치 파일이 예전 것을 덮어씀). jpackage 는 저장소의 데스크톱 JDK 또는 PDMaker 의 JDK, WiX 3 은 PATH · Program Files 에 없으면 `userData/wix3` 에 내려받음(`ensureWix`) |
| `apk` | `android:assembleRelease` | `prepareApk`: SDK 찾기(ANDROID_HOME · ANDROID_SDK_ROOT · local.properties · 흔한 위치) → 서명 키(내 키스토어 또는 `signing/release.jks` 를 keytool 로 처음 한 번, 비밀번호 `signing/keystore.json`) → init 스크립트(`-I`)로 release 서명 + R8 keep(`pdmaker.**`), 비밀번호는 `ORG_GRADLE_PROJECT_*` 환경 변수 → 프로젝트를 `core/src/main/assets/pdmaker-project` 에 넣고 빌드 후 지움. `signing/` 은 게임 파일 · APK 에 넣지 않음 |

### 18.3 게임 이름 · 세이브 위치
- `project.game { appName, appPackageName }` (새 프로젝트 창 · 프로젝트 설정). 테스트 플레이 · 내보내기 때 `applyGameId` 가 저장소 `build.gradle` 의 `appName` · `appPackageName` 을 고침 → 데스크톱 세이브 `%APPDATA%\.<패키지 둘째 마디>\<appName>\` 이 원작과 갈라짐. appName 이 비었고 저장소가 원작 이름이면 프로젝트 이름(영문) 또는 `PDMaker <폴더 이름>`.

### 18.4 PDMaker 배포 · 업데이트
- `build-exe.bat` → electron-builder 포터블 `editor/dist/PDMaker x.y.z.exe`(런타임 소스 포함). `make-release.bat` → `pd-maker-release.zip`(game/ · Electron 포함, .git · build · .gradle 제외).
- 업데이트 (`updater.js` · IPC `update:check/apply/restart`): 도움말 메뉴 + 시작 4초 뒤 조용한 확인, GitHub `IceNight154/pd-maker` main 과 비교. git 폴더면 `fetch` → `pull --ff-only`(실패하면 ZIP 방식을 물음), 아니면 main ZIP 을 받아 덮어씀(`game/` · `node_modules` · `.git` 은 그대로, 받은 커밋은 `.pdmaker-update.json`). 끝나면 다시 시작. 실행 파일로 묶은 판은 확인만.

---

## 19. 개발 도구 · 확인

- **자동 플레이 테스트** (`tools/playtest` — Linux 개발용, `README.md`): 게임 저장소 + 런타임을 헤드리스(Xvfb)로 컴파일 · 실행하고 `Hooks.java` 의 eval 명령으로 상태를 확인 · 덤프 — `godepth` · `leveldump`(타일셋 미리보기 표본) · `roomdump`(방 미리보기 표본) · `droptest` · `goldtest` · `themetest`(테마별 몬스터 · 사용 안 함) · `waterhere` · `shoottest` · `mobhp` · `cellname` · `bagtest` · `usetest` · `throwfx` · `bagfx` · `effect` · `fxspot` · `fxdump` · `textfx` · `tplvar`(방 템플릿 변형) · `throwtest` · `winsize`(세로 화면 점검) 등.
- **게임 데이터 뽑기** (`tools/data`): `extract_spd_items.py` → `spd-items.js` · `extract_spd_chars.py` → `spd-chars.js`(+ 영웅) · `extract_spd_rooms.py` → `spd-rooms.js` · `gen_terms_java.js` → `DefaultTerms.java`.
- **샘플** (`tools/sample`): `make_sample.py` · `make_heart.js` · `make_sounds.js` · `make_portraits.py` — mod-2 기준 샘플 프로젝트(아리아 · 미레유 …)를 만드는 스크립트. 시작 화면의 "샘플 열기"는 없앰.
- **편집기 셸 · 이벤트 UI 테스트** (`tools/tests/ui-editor.js`): 패널 접기 · 기억 · 좁은 창 · 입력 중 단축키 · 상태 줄 · 저장 상태 · 이벤트 명령 속성 창 편집과 실행 취소 · 번호 · ⚠ · 명령 찾기 · 미리보기 · 탭 전환 뒤 창 이벤트 수. **화면 캡처** (`tools/tests/ui-shots.js <폴더> [접두어]`): 시작 · 맵 · 영역 선택 · 이벤트 · 대사창을 넓은 창 · 좁은 창으로 (개선 전후 비교). **게임 안 연출 확인**: 헤드리스 플레이 `eval:event:[…]` + `eval:cutinfo`(이벤트 실행 중 · 페이드 · 일러스트 번호마다 불투명도 · 크기 · 자리 · 떠 있는 창 · 영웅 자리).
- **맵 편집기 UI 테스트** (`tools/tests/ui-map.js` — 웹 모드 + Playwright · Chromium, `NODE_PATH=$(npm root -g)`): 실제 마우스 · 키보드로 영역 고르기 · 복사 · 붙여넣기 · 잘라내기 · 실행 취소, 여러 오브젝트 이동 · 일괄 수정 · 삭제 · 방향키, 검사 결과에서 칸으로 이동, 다시 그릴 때 창 이벤트가 쌓이지 않는지, 80×80 맵 그리기 시간.
- **저장소 호환 테스트** (`tools/tests/repo-compat.js`, 9차): 합성 저장소(손상 파일 · 링크 · 캐시 · worker) + `game/` 의 실제 저장소 세 개 — 원본 ↔ 변환 결과 비교 · 중복 없음 · 원본 그대로 · 기준 저장소 회귀. 없는 저장소는 "실행하지 못함"(실패). 화면은 `ui-repoanalysis.js`
- **11차 시험**: `repo-compat.js` 세 저장소 영웅 시트를 실제 픽셀로 칸 · 줄 검사(ARK 2352/2352 · 원작 882/882 · BA 231/231) · 프로젝트에 옮긴 값 · ARK 적응 설치. `repo-fidelity.js` 런타임 설치기 시험은 **임시 사본에서만** 설치 · 제거 후 바이트 비교 (예전 시험은 원본 `game/ARK_PD-main` 에 설치했음) · 맵 기본 표시 · 탐색 자료. `ui-repofidelity.js` ⑦ 탐색 화면. 게임: `tools/playtest/repo-project.js <저장소> <폴더>` 로 저장소 기준 프로젝트를 만들고 `eval:herosprite` · `selicons` · `imgstat` · `changeclick,<n>` 로 원본 게임과 비교 (Lombok 쓰는 저장소는 `$JARS/lombok.jar`).
- **저장소 정합성 테스트** (`tools/tests/repo-fidelity.js`, 10차): 정답을 분석기와 따로 소스에서 계산 — 맵 클래스 · 고정 맵 타일 재현 · 영웅 이름 · 몬스터 이름/그림/상속 · BOSS 속성 → 보스 · 수동 분류 유지 · 업적 · 타이틀 · 재분석 충돌 · 분석 실패 · 저장소 전환 · 설치 거부. 화면은 `ui-repofidelity.js` (타이틀 버튼 자리 = 원본 setRect 계산, 오차 0 px)
- **회귀 테스트** (`tools/tests/run.js` — Node 만 있으면 됨): 편집기 스크립트를 Node `vm` 에 불러(`editor-env.js`, 파일 기능은 임시 폴더) 확인 — 편집기 ↔ 런타임 ↔ 게임 소스 표 일치(밑그림 대응표 · 보존 타일 번호 29종 · 구멍 · 기본 레이어 · 함정), 맵 변환, 저장/불러오기 · 실행 취소, 손상 파일 · 쓰기 실패 · 백업, 검사. `node tools/tests/run.js [이름 일부]`.
- **화면 환경별 연출 검사** (`tools/playtest/platform-matrix.sh` · `scenarios.js`, 4차): 데스크톱 판 게임을 PC · 휴대폰 가로/세로 비율 창 · 안전 영역 흉내(`eval:insets`) · 실행 중 창 돌림(`eval:winsize`)으로 띄워 같은 연출을 돌리고, `eval:layout` 이 대사창 · 글 · 이름표 · 선택지 · 일러스트의 화면/안전 영역 밖 여부를 판정. 실제 휴대폰 검증은 아님 — `docs/UI-UNIFICATION-AND-PLATFORM-TESTS.md`.
- **웹 모드 검증**: `editor/renderer/index.html?project=<경로>` 를 웹 서버로 열어 편집기 동작 · 미리보기를 브라우저(Playwright)로 확인.

---

## 20. 현황

- **확인 방법**: 기능마다 플레이 테스트 하네스(실제 게임 4.0.0 · 3.2.0 컴파일 · 헤드리스 실행) 또는 웹 모드에서 확인. 실제 Electron 창에서만 되는 것(파일 대화상자 · 작업 표시줄 알림 · 내보내기 · 업데이트)은 Windows 에서 직접 확인이 필요하다.
- **처음 계획에서 이룬 것**: 맵 그래프(5층 단위 폐지 — 던전 밖 맵 · 사이 맵 · 샛길 · 갈림길을 모두 연결로), 직접 그린 맵 · 방 템플릿 · 혼합 층 · 구성 블럭, 영웅 편집기(원작 구조 — 주문 · 전직 · 직업 능력 · 특성 · 선택 화면), 사용자 Java 코드, 마음 시스템 · 대사창 · 이벤트 페이지 · 스토리(루트 · 엔딩 · 입장 문구 · 소개 화면), 캐릭터 · 아이템 데이터 구동, 플러그인, 게임 파일 내보내기(jar · exe · 설치 파일 · apk), 조명 · 파티클 · 화면 필터 · 글자 연출.
- **남은 것 / 제약**
  - 마음 시스템 반응(Counter)의 영웅 쪽 연결(피격 · 회복 지점)은 아직 없음.
  - 화면 필터 코드 층 · 글자 연출은 편집기에서 구운 그림만 게임에 들어감(게임에서 코드 · APNG 를 실행하지 않음).
  - 광원 버퍼를 못 만드는 기기는 예전 방식(그림자 품질 낮음, 지형 광원 없음).
  - 혼합 맵의 직접 그린 방은 뒤집기 · 돌리기를 하지 않음.
