# 픽셀 던전 메이커 (가제) — 설계서 v0.1

> 기반: Shattered Pixel Dungeon v3.2 계열 (`shattered-pixel-dungeon-mod-2`, 앱 이름 *Witchling Pixel Tower*)
> 참고: era(관계·감정·엔딩), GameMaker(엔진·리소스 구조·플러그인)

---

## 0. 한 줄 요약

**에디터(Electron exe)** 가 프로젝트 폴더에 JSON + PNG 만 저장하고,
**게임 런타임(SPD 포크, Java exe)** 이 그 폴더를 읽어서 그대로 실행한다. 컴파일 없이 바로 테스트 플레이.

```
┌──────────── 에디터 (PDMaker.exe · Electron) ────────────┐        ┌──── 게임 (WitchlingTower.exe · Java/libGDX) ────┐
│ 리소스 트리 │ 맵 · 캐릭터 · 아이템 · 이벤트 · 스토리 편집기 │  JSON  │ MakerRuntime  ─ 프로젝트 로더                    │
│ (GameMaker) │ 인스펙터 · 로그 · 플러그인 · 용어 관리       │ ─────▶ │  ├ MakerLevel      (손으로 그린 층)             │
│             │ 테스트 플레이 버튼 ──────────────────────────┼─ 실행 ▶│  ├ LevelHooks      (절차 생성 층에 오브젝트 주입)│
└─────────────────────────────────────────────────────────┘  PNG   │  ├ EventInterpreter (이벤트 명령 실행)     │
                                                                    │  ├ HeartSystem     (era 식 감정·관계)            │
                                                                    │  ├ StoryState      (스위치·변수·루트·엔딩)       │
                                                                    │  └ PluginHost      (추가 명령·효과)              │
                                                                    └─────────────────────────────────────────────────┘
```

기존 `pixel-dungeon-maker`(HTML + Java 코드 생성)는 버리지 않는다.
- 데이터(호감도·시나리오·스프라이트)는 **가져오기(Import)** 로 새 프로젝트 형식으로 옮긴다.
- 코드 생성 탭(코덱스·버프·스탠스·특수능력·영웅·특성)은 **"고급: Java 코드 생성기"** 패널로 에디터 안에 그대로 띄운다.
  데이터 구동으로 표현하기 어려운 전투 메커니즘은 당분간 이쪽으로 만든다 (혼합 전략).

---

## 1. 참고 소스에서 가져오는 것

| 출처 | 가져오는 개념 | 메이커에서의 모습 |
|---|---|---|
| **era** (eraTW / eraTHYM) | CFLAG(캐릭터별 수치), TALENT(소질), ABL(능력 레벨), MARK(각인), EXP(경험 횟수), SOURCE→PALAM→JUEL 파이프라인, COUNTER(반응), ATTITUDE(태도), 구상(캐릭터별 대사 덮어쓰기), 데일리·외출 이벤트, 일기, 관계 단계 이벤트 | **마음 시스템(Heart System)** — §4 |
| **GameMaker** | 리소스 트리, 오브젝트 + 이벤트(Create/Step/Collision…), 룸 + 레이어, 시퀀스(타임라인), 부모 상속, `.gmplugin` 매니페스트 | IDE 레이아웃, 캐릭터의 "행동 이벤트", 층 레이어, 장면(Scene) 타임라인, 플러그인 매니페스트 — §2, §7 |
| **mod-2 (내 작업)** | 아리아(원소 전환·과부하), 코덱스 무기군, 그리모어, 커스텀 타이틀·파티클, 4인 견습 마녀 스토리 | 샘플 프로젝트의 기본 데이터, 레거시 코드 생성기 |

### 1.1 NSFW 명칭 처리 원칙

- **코드 식별자는 전부 중립 영어** (`favor`, `trust`, `deference`, `mark.fear` …). era 원래 단어는 코드·데이터 어디에도 쓰지 않는다.
- **화면에 보이는 이름은 모두 `terms.json`(용어 사전)** 에서 가져온다. 에디터의 **도구 → 용어 관리** 에서 언제든 이름을 바꿀 수 있고, 게임도 같은 파일을 읽는다.
- 각 용어에는 `eraRef`(예: `ABL:10`, `MARK:9`) 만 남겨서 원본 시스템의 어느 자리를 대체했는지 추적할 수 있게 한다.
- 원본에서 성인 전용이던 시스템(조교 커맨드, 신체 관련 수치 등)은 **구조만** 참고하고 기능 자체는 넣지 않는다.

---

## 2. 에디터 구조 (GameMaker 식 IDE)

```
┌ 메뉴: 파일 · 편집 · 보기 · 프로젝트 · 도구 · 플러그인 · 도움말 ─────────────────────────────┐
├ 툴바: [새로][열기][저장][다른 이름] | [프로젝트 내보내기][가져오기][게임 파일 내보내기] | [↶][↷] | [검사][정리] [▶ 테스트 플레이][■] [◐][⚙] ┤
├────────────┬─────────────────────────────────────────────┬──────────────┤
│ 리소스 트리 │  탭 작업공간 (여러 편집기를 탭으로 동시에 열기)   │ 인스펙터     │
│ ▸ 맵        │                                             │ (선택한 것의 │
│   ▸ 1장 하수도 │                                           │  속성)       │
│ ▸ 캐릭터    │                                             │              │
│ ▸ 아이템    │                                             │              │
│ ▸ 이벤트    │                                             │              │
│ ▸ 스토리    │                                             │              │
│ ▸ 마음 시스템│                                            │              │
│ ▸ 그림 관리│                                             │              │
│ ▸ 플러그인  │                                             │              │
├────────────┴─────────────────────────────────────────────┴──────────────┤
│ 출력 / 로그 / 검사 결과 (끊어진 참조, 빠진 스프라이트 등)                        │
└──────────────────────────────────────────────────────────────────────────┘
```

- **테마**: `renderer/js/theme.js`(가장 먼저 실행) — 모드 system/light/dark → `html[data-theme]`, 색은 모두 CSS 변수(`:root` 어두운 값 / `[data-theme=light]` 밝은 값).
  system 은 `prefers-color-scheme` 을 따르고, Electron `nativeTheme.themeSource` 도 같은 값(제목 표시줄·대화상자·스크롤바). 강조색 = `systemPreferences.getAccentColor()`(OS) · 기본 보라 · 직접 — 배경과 구분되도록 밝기 자동 보정. `--accent2`·`--accent-soft` 는 `color-mix` 로 강조색에서 계산.
  게임 그림 미리보기(맵 썸네일·타이틀·장면)는 테마와 상관없이 어두운 바탕(`--stage`).
- **도구 모음** (GameMaker 식): 새로·열기·저장·다른 이름으로 저장 | 프로젝트 내보내기(.pdmproj = ZIP, `editor/zip.js`)·가져오기·게임 파일 내보내기 | 실행 취소·다시 | 검사·빌드 정리 | 테스트 플레이·중지 | 테마·설정.
  게임 파일 내보내기 = `game:export`: 런타임 설치·코드 생성 → `gradlew desktop:release`(jar + bat/sh) 또는 `desktop:jpackageImage`(Java 포함 실행 파일) → `<출력>/<이름>/` + `project/`. 런타임 `MakerRuntime.findRoot` 가 jar(또는 실행 파일) 옆 `project/` 를 찾음.
- **Electron 메인 프로세스**: 파일 입출력, 프로젝트 폴더 감시, 게임 실행(`gradlew desktop:debug -Dpdmaker.project=…`), 플러그인 폴더 검색.
- **렌더러**: 순수 JS(빌드 도구 없음 — 기존 메이커와 같은 방식이라 직접 고치기 쉬움). `window.pdm` 으로 메인 기능 호출.
- **실행 취소/다시 실행**: 모든 편집은 `store.edit(설명, fn)` 을 거쳐 스냅샷 기록.
- **웹 모드**: Electron 없이 브라우저로 열어도 동작(파일 대신 메모리/브라우저 저장). 개발·검증용.

---

## 3. 프로젝트 폴더 형식

```
MyProject/
├ project.json          프로젝트 설정 (이름, 게임 저장소 경로, 시작 영웅, 사용 플러그인)
├ terms.json            용어 사전 (화면 표시 이름 전부)
├ title.json            타이틀 화면 (§3.7)
├ dialogue.json         대사창 모양 (§3.9)
├ maps/
│  ├ world.json         맵 그래프: 그룹(구역) · 노드 위치 · 연결(계단) · 시작 노드 · 사용자 테마
│  └ nodes/<id>.json    노드 한 개의 맵 (생성 방식, 타일, 오브젝트, 추가 방, 테마, 보스, 입장 이벤트)
├ rooms/<id>.json       방 템플릿
├ heroes/<id>.json      플레이어블 영웅 (영웅 편집기)
├ characters/<id>.json  NPC·동료·몬스터·보스
├ items/<id>.json
├ events/<id>.json      커먼 이벤트 · 장면(Scene)
├ story/story.json      스위치·변수 정의, 장 흐름, 루트, 엔딩
├ heart/heart.json      마음 시스템 규칙 (era 식)
├ assets/
│  ├ sprites/  tiles/  illust/  portraits/  anim/  audio/
└ plugins/<id>/plugin.json …
```

모든 파일은 `"format"`, `"version"` 필드를 가진다 → 버전이 올라가면 에디터가 자동 변환(migrate).

### 3.1 맵 그래프 (maps/world.json + maps/nodes/)

예전의 "5층 단위 장" 대신, 편집자가 **노드(맵)** 를 자유롭게 놓고 **연결(계단)** 로 잇고 **그룹(구역)** 으로 묶습니다.
에디터의 맵 그래프 화면은 노드 편집기 방식입니다.

| 조작 | 방법 |
|---|---|
| 화면 이동 / 확대 | Space+끌기, 가운데·오른쪽 버튼 끌기 / 휠 |
| 노드 이동 · 여러 개 선택 | 끌기(Alt = 격자 무시) · Shift+클릭 · 빈 곳 끌기(사각형) |
| 연결 | 노드 오른쪽 점을 다른 노드로 끌기 (그냥 = 통로 · Shift = 갈림길 출구 · Alt = 샛길 계단). 빈 곳에 놓으면 새 노드를 만들며 연결. 같은 두 노드 사이에 여러 번 끌면 통로가 여러 개 |
| 만들기 | 빈 곳 더블클릭(자동 생성 노드) · 오른쪽 클릭 메뉴(직접 그리기 / 혼합 / 그룹) |
| 그룹 | 노드를 그룹 사각형 안에 놓으면 그 그룹으로 이동, 제목을 끌면 그룹째 이동, G = 선택한 노드로 그룹 |
| 키 | Delete · Ctrl+D 복제 · Ctrl+C/V · Ctrl+A · F 전체 보기 · 방향키 · "자동 정렬" 버튼 |

```jsonc
// maps/world.json
{ "start": "f1",
  "groups": [ { "id": "g1", "name": "1구역", "theme": "SEWER", "direction": "", "color": "#5fd6b4",
                "rooms": [ { "room": "herb_greenhouse", "count": 1, "chance": 100, "cond": "" } ],
                "safe": false } ],                // safe = 던전 밖(마을): 층 번호 대신 이름, 데일리 이벤트 없음
  "nodes": [ { "id": "f1", "group": "g1", "x": 60, "y": 330 } ],
  "edges": [ { "id": "d1", "from": "f1", "to": "f2",  "kind": "door",  "exit": 0, "entrance": -1, "cond": "" },   // 통로: 출구 타일 0번 ↔ 입구 자동
             { "id": "e1", "from": "f3", "to": "f4a", "kind": "main",  "cond": "", "weight": 100 },
             { "id": "e2", "from": "f3", "to": "f4b", "kind": "stair", "cond": "switch.ember_seal",
               "place": "exit", "message": "붉은 계단이 드러났다…" } ],
  "customThemes": [] }

// maps/nodes/f1.json — 예전 floor_XX.json 과 같은 내용 + 아래 필드
{ "id": "f1", "mode": "handmade", "name": "시험장 입구", "label": "", "depth": 0, "boss": false, "entranceTo": "town", … }
```

**연결 규칙**
- `door` (통로, 새 연결의 기본): 연결마다 **출발 노드의 출구 하나 ↔ 도착 노드의 입구 하나**가 짝. 그 출구로 가면 짝 입구에 도착하고, 짝 입구로 돌아가면 그 출구로 돌아옴.
  같은 두 노드 사이에 여러 개를 만들 수 있고 연결마다 다른 출구·입구를 씀. `exit`/`entrance` = 직접 그린 맵의 출구(>)·입구(<) 타일 번호(맵 순서, 0부터), -1 = 자동(남은 타일 차례로).
  타일이 모자라거나 자동 생성 맵이면: 첫 통로는 원래 출구/입구(다른 용도가 없을 때), 나머지는 출구·입구 근처(`place`)에 계단을 새로 놓고 세이브에 저장.
  입구 첫 타일은 시작 노드·`entranceTo`·통로가 아닌 들어오는 연결이 있으면 원래 용도(되돌아가기)로 남김. `cond` 전에는 출구 그림만 있고 막힘.
  배정 규칙은 에디터(`PDM.World.ports`)와 런타임(`WorldGraph.ports`)이 같고, 맵 편집기에 "출1 → 층" · "입2" 번호로 표시. 도착 계단은 `Level.getTransition` 맨 앞의 `WorldGraph.pickArrival`.
- `main` (갈림길 출구): 이 맵의 출구가 그 노드로. 조건을 통과한 main 연결이 여러 개면 **무게대로 하나를 무작위로**(아이작식) — 맵을 처음 만들 때 한 번 정하고 세이브에 저장 (`choice.<노드>`).
- `stair` (샛길 계단): 조건을 만족하면 계단이 하나 더 생김. 층에 들어올 때마다 다시 검사하므로 나중에 조건을 만족해도 생김(아이작의 비밀 문).
  직접 그린 맵의 출구 타일(>)은 ① 번호를 지정한 통로 ② main(또는 되돌아가기) ③ 자동 통로 ④ stair 연결 순서로 쓰입니다.
- 입구 계단: 노드의 `entranceTo` 가 있으면 그곳, 없으면 **온 곳으로 돌아가기**(마지막으로 앞에서 들어온 노드, 없으면 들어오는 연결의 출발 노드). 시작 노드에 처음 있을 때는 원래대로 "지상으로 나가기".
- 연결이 없는 노드(마을 등)는 `entranceTo` 나 이벤트 명령 "맵 이동"(`transfer { node }`)으로 갑니다.

**게임 안 번호 (depth · branch)** — 에디터(world.js)와 런타임(WorldGraph.java)이 같은 규칙으로 계산합니다.
- depth(난이도): 시작 노드 1, 연결을 따라 +1 (가장 긴 경로, 되돌아가는 연결은 무시). 노드의 `depth` 를 1 이상으로 쓰면 고정.
- branch: 같은 depth 의 노드끼리 0, 2, 3 … (1 은 게임의 광산).
- 층 표시: 그룹 안에서 몇 번째 깊이인지 → "지하 4-2층" (같은 그룹·같은 깊이가 여럿이면 -1, -2 …). 노드의 `label` 로 바꿀 수 있음.
- 자동 생성 노드는 테마의 생성기(하수도·감옥·동굴·도시·전당)로 만들고, `boss` 면 그 테마의 보스 층.

**몬스터 스폰** (직접 그린 노드): `spawn = { enabled, mobs:[{ref, weight}], initial, max, respawn, minDist }` + `layers.spawn`(칸마다 0 보통 · 1 스폰 구역 · 2 스폰 금지).
켜면 처음 `initial` 마리를 놓고 게임의 재생성(MobSpawner)이 `max` 마리까지 `respawn` 턴마다 채움. 스폰 구역이 있으면 그 안에서만, 없으면 금지 구역을 뺀 곳(영웅 시야 밖, 입구 위 제외).
`mobs` 가 비면 깊이에 맞는 게임 기본 몬스터. 맵 편집기: 도구 "☗ 스폰 구역"(칠하기·사각형·방 채우기 / 스폰 구역·스폰 금지·지우개) + 속성의 "몬스터 스폰".

**새 프로젝트**는 기준 저장소(`game/shattered-pixel-dungeon` — 원작 3.2.0 + 아리아 직업)처럼 채워서 만듦. 영웅·시작 아이템·감정된 아이템은 `extract_spd_chars.py` 가 그 저장소의 `HeroClass.java`(직업 목록, initHero + init<직업>)를 읽어 만듦(`SKIP_CLASSES` 의 직업은 뺌 — 지금 ARIA) — 직업이 늘면 다시 실행: 하수도·감옥·동굴·드워프 도시·악마의 전당 5구역 × 5층(자동 생성, 5·10·15·20·25층 보스 — depth 1~25 가 원작과 같음),
원작 가운데 대사창(`dialogue.mode = window`), 마음 창 버튼 끔.
타이틀은 `title.enabled = false`(게임 원래 타이틀 화면·영웅 선택 화면). 영웅마다 원작 시작 아이템(`inventory.items[].fromGame` — 게임이 주므로 표시만, 장착·퀵슬롯·`affix`(부서진 인장 → 갑옷)·`imbue`(마법사 지팡이에 넣을 완드) 포함)과 원작 감정된 아이템(`knownItems`), 원작 긴 설명.
편집기 "목록대로 직접 주기" → `clearDefault: true`, 이때 fromGame 행도 PDMaker 가 직접 지급(HeroRuntime) — 게임 기본으로 되돌리기 가능.
영웅 6명(전사·마법사·도적·사냥꾼·결투가·성직자 — 저장소에 있는 아리아는 `SKIP_CLASSES` 로 뺌, 바탕 직업만, 그림·특성·전직·직업 능력은 비워서 게임 원래 것) + 원작 캐릭터 73명(몬스터 60 · 보스 5 · NPC 8)을
`tools/data/extract_spd_chars.py`(원작 소스의 이름·설명·능력치·스프라이트·애니메이션 → `spd-chars.js`)로 채움.
원작 캐릭터는 `game`(게임 클래스, 예 `Rat` · `npcs.Ghost` · `Shaman$RedShaman`) + `useGame: true` → 맵에 놓거나 이벤트로 소환하면 게임 클래스 그대로(`LevelHooks.gameChar`),
끄면 데이터(능력치·그림·AI·대사)로 도는 PDMaker 캐릭터. 아이템은 게임 아이템(▫)이 트리에 그대로 나오고, 방 템플릿은 프로젝트가 직접 그린 것 아래에 **게임 기본 방**(`levels/rooms` 의 모든 클래스 145개, `spd-rooms.js` ← `tools/data/extract_spd_rooms.py`)이 분류별(일반·입구·출구·특수·비밀·연결 통로·퀘스트·하수도 보스·바탕 클래스)로 나옴. 누르면 정보 창(설명·클래스·크기·코드 파일 보기). ▪ 82개는 그룹·노드의 "추가 방"에서 `game:<분류>.<클래스>` 로 고를 수 있고(런타임 `LevelHooks.addList` 가 클래스를 만들어 방 목록에 넣음), ▫ (입구·출구·전용 층·바탕 클래스)는 보기만. **미리보기**: `spd-room-previews.js` 에 게임이 실제로 만든 방 지형 표본(방마다 최대 3개, 지역 테마·아이템/몬스터 위치 포함 — `tools/playtest` 의 `eval:roomdump` 로 뽑음)이 있어, 정보 창에 타일로 그려 주고 [▦ 방 미리보기]로 프로젝트 방 템플릿 + 게임 기본 방 전체를 모아 봄. 표본이 없는 입구·출구 변형은 바탕 방 모양을 빌려 보여 줌.

**진행 방향**: 프로젝트 `direction` 또는 그룹 `direction` 이 `up` 이면 탑 모드(계단 그림·층 이름 반전).

**예전 형식 변환**: `maps/chapters.json` + `floor_XX` + `extra_*` 가 있는 프로젝트를 열면 자동으로 그래프로 바꿉니다
(장 → 그룹, 층 → 노드(depth 고정), 통과형 사이 맵 → 사이에 끼운 노드, 샛길형 → stair 연결, 던전 밖 맵 → "던전 밖" 그룹).
장 갈림길(paths)은 연결로 다시 만들어야 합니다. 이벤트의 층 이동, NPC 경로 층, 스토리 비트도 노드로 바뀝니다.

### 3.2 캐릭터 (characters/)

```jsonc
{ "id": "mireille", "kind": "npc",            // npc | companion | mob | boss  (플레이어블은 §3.3 영웅)
  "name": "미레유", "title": "약초와 독의 연금술사",
  "sprite": { "sheet": "assets/sprites/mireille.png", "frame": [12, 15],
              "anims": { "idle": { "frames": [0,0,0,1], "fps": 1, "loop": true },
                         "run":  { "frames": [2,3,4,5], "fps": 20, "loop": true },
                         "attack": { "frames": [6,7,8], "fps": 15 }, "die": { "frames": [9,10,11], "fps": 12 } } },
  "portrait": { "default": "assets/portraits/mireille/default.png",       // 대사창 스탠딩 일러스트 (§3.9)
                "expressions": [ { "key": "smile", "image": "…/smile.png" }, { "key": "angry", "image": "…/angry.png" } ],
                "scale": 1, "offsetX": 0, "offsetY": 0,   // 크기 배율 · 안쪽/아래로 이동(화면 높이 %)
                "side": "", "flip": false },              // 서는 쪽(left·right, 비우면 대사창 설정) · 좌우 뒤집기
  "stats": { "hp": 20, "attack": [1,4], "defense": 0, "accuracy": 10, "evasion": 5, "speed": 1 },
  "ai": { "mode": "schedule", "path": [ {"x":5,"y":5}, {"x":10,"y":5} ], "wait": 3 },   // stand | wander | patrol | follow | schedule
  "heart": { "enabled": true, "traits": ["CHEERFUL","CURIOUS"], "likes": ["tag:herb","potion_healing"], "dislikes": ["tag:undead"],
             "initial": { "favor": 0, "trust": 0 } },
  "behaviors": { "onSpawn": [], "onInteract": [], "onDamaged": [], "onDeath": [], "onSeeHero": [], "onTurn": [] },  // GameMaker 식 이벤트
  "dialogue": { /* §4.6 대사 토픽 */ }
}
```
- 스프라이트 `scale`: 큰 시트(예: 48×60 = 12×15 의 4배)는 0.25. 0 이면 세로 24px 초과 시 자동으로 15px 높이에 맞춤.
- 예전 형식의 `kind: "hero"` 캐릭터는 프로젝트를 열 때 영웅 편집기(`heroes/`)로 옮겨집니다.

### 3.3 영웅 (heroes/) — 영웅 편집기

원본 `actors/hero` 의 구조를 데이터로 옮긴 것: `HeroClass`(시작 장비) · `Hero`(체력/힘) · `HeroSubClass`(전직) · `ArmorAbility`(직업 능력) ·
`Talent`(특성 1~4단계) · 성직자의 `ClericSpell`+`HolyTome`(주문서·주문) + mod-2 아리아의 `NewOverHeat`(과열 게이지·원소)와 `Codex`(코덱스, §3.4).
**2026-09-25: 예전 "스킬 시스템"(skills · signature · 화면 오른쪽 스킬 버튼)을 없애고 이 구조로 바꿈.** 예전 파일은 에디터가 열 때 자동으로 바꿈
(skills → spells(배우는 레벨로 단계 추측), signature → spellbook, 특성 효과 skill/unlockSkill → spell/unlockSpell). 런타임도 예전 필드를 읽음.

```jsonc
{ "id": "aria", "name": "아리아", "enabled": true,
  "baseClass": "ARIA",          // 바탕 직업(HeroClass 이름). 전투 방식·직업 갑옷 모양·(비워 둔 경우) 원래 전직/능력은 이 직업 것
  "character": "aria",          // 대사 화자·초상화로 쓸 캐릭터 (선택)
  "sprite": { "sheet": "assets/sprites/heroes/aria.png", "frame": [48, 60], "scale": 0.25, "anims": {…},   // 행 = 갑옷 단계
              "tierRows": [0, 1, 2, 3, 3, 3, 3] },   // 갑옷 단계(0 없음·1~5·6 직업 갑옷) → 시트 행. 없으면 단계 = 행 (넘치면 마지막 행)
  "stats": { "hp": 18, "hpPerLevel": 4, "str": 10 }, "startGold": 30,
  "inventory": { "clearDefault": false, "items": [ { "item": "spd:PotionOfHealing", "count": 1, "equip": false, "quickslot": true } ] },
  // 주문 — HolyTome + ClericSpell
  "spellbook": { "enabled": true, "name": "원소의 서", "image": 246, "charges": 3, "rechargeTurns": 35 },
  "spells": [ { "id": "fire_bolt", "name": "불꽃 화살", "tier": 1, "icon": 19, "cost": 1, "cooldown": 0,
                "unlockLevel": 1, "requiresTalent": "", "subclass": "", "ability": "", "cond": "",      // 배우는 조건
                "target": "enemy", "range": 6, "projectile": true, "visual": "fire", "time": 1, "heat": 4,
                "effects": [ { "type": "damage", "min": 3, "max": 7, "perLevel": 1 }, { "type": "buff", "buff": "Burning", "turns": 3 } ] } ],
  // 전직 — HeroSubClass (텐구의 가면)
  "subclasses": [ { "id": "overheat", "name": "백열의 마녀", "icon": 17, "base": "ARIA_OVERHEAT", "shortDesc": "…", "desc": "…",
                    "effects": [ { "stat": "codexPct", "value": 15 } ] } ],
  // 직업 능력 — ArmorAbility (왕의 왕관 → 직업 갑옷, 갑옷 충전 %)
  "abilities": [ { "id": "white_heat", "name": "백열", "icon": 19, "chargeUse": 25, "shortDesc": "…", "target": "cell", "range": 6, "heat": 25, "effects": […] } ],
  // 게이지·원소 — mod-2 NewOverHeat
  "gauge": { "enabled": true, "name": "과열", "max": 100, "sameElement": 2, "afterUse": 2, "idle": 1, "recentTurns": 3,
             "levels": [ { "at": 25, "name": "2단계", "effects": [ { "stat": "codexPct", "value": 10 } ] } ],
             "overflow": { "enabled": true, "delay": 4, "resetTo": 60, "effects": […] },
             "elements": [ { "id": "fire", "name": "불", "color": "#E24F2E", "icon": 19, "effects": […], "onSwitch": […] } ],
             "switchCool": 25, "replaceNative": ["NewOverHeat"] },
  "passives": [ { "name": "고른 호흡", "unlockLevel": 1, "effects": [ { "stat": "regen", "value": 8 } ] } ] }
```
- 적용 시점: 새 게임의 `Dungeon.init()` 직후(`HeroRuntime.afterInit`). `project.startHero` 가 있으면 어떤 직업을 고르든 그 영웅, 없으면 `baseClass` 가 맞는 영웅.
- **시전 엔진 `MakerCast`** (주문·직업 능력·코덱스·폭주·원소 공용): 대상 self · enemy · ally · cell · adjacent(옆 칸 적), 사거리, 날아가는 효과(`visual`, `projectile`),
  효과 damage(min~max + perLevel + 최대 체력 percent) · heal · shield · buff(게임 버프 이름) · knockback · blink · summon · gauge · event · heart · code, `chance`(%),
  on: target / self / area(반경). 피해 × (1 + castPct%). `heat` = 게이지 변화. 코드 효과 → 생성 클래스의 `effect(id, effectIndex, hero, cell, target)`.
- **주문 (`MakerSpells`)**: 주문서(`MakerSpellbook`, 퀵슬롯) → 주문 창(`WndMakerSpells` = WndClericSpells 모양: 단계마다 한 줄, 누르면 시전, 길게 = 빠른 시전(주문서 기본 동작)).
  배운 것만 나옴(레벨·특성·전직·능력·조건). 충전은 영웅이 가짐(`pdm_sp_*`), `rechargeTurns` 마다 1 × (1 + recharge%). 영웅 정보 창 특성 탭 위쪽에도 나옴.
- **전직 (`MakerAbilities`)**: `TengusMask.execute` 연결 줄 → `WndMakerSubclass`(WndChooseSubclass 모양). 고르면 `pdm_subclass` 저장, `base` 가 있으면 `hero.subClass` 도 그 값
  (+ `Talent.initSubclassTalents`) — 원작/mod-2 전직 효과가 함께 켜짐(원작에 없는 이름이면 로그만). 전직 효과 `effects` 는 능력치. `Hero.className()` 연결 줄로 영웅 창 이름 = 전직 이름.
- **직업 능력**: `HeroClass.armorAbilities()` 연결 줄 → `MakerArmorAbility`(ArmorAbility 상속, id 를 Bundle 에 저장) 목록. 원작 왕관 창(`WndChooseAbility`)·직업 갑옷(`ClassArmor`)·
  갑옷 충전(0~100%, 약 500턴)을 그대로 씀. `chargeUse` 만큼 쓰고 발동.
- **게이지·원소 (`MakerGauge.Buf`)**: 영웅 버프 + `ActionIndicator` 행동 버튼(원소 색·아이콘·"게이지/최대"). 턴마다 perTurn + sameElement(원소 유지) + afterUse(최근 사용) 또는 −idle.
  단계(`levels`)·원소(`elements`)의 능력치가 붙고, 최대가 되면 `delay` 턴 뒤 폭주(`overflow.effects`) 후 `resetTo`. 원소를 바꾸면 게이지 −switchCool%, `onSwitch` 효과.
  바탕 직업이 이미 가진 게이지 버프(`replaceNative`, 기본 NewOverHeat)는 뗌.
- **능력치(stat)** — `HeroRuntime.bonus` = 특성 + 전직 + 게이지 단계 + 원소: hp · accuracy · evasion · damage · armor · speed% · charges · recharge% · regen ·
  damagePct(공격 피해 %, attackProc) · takenPct(받는 피해 %, defenseProc) · castPct(주문·능력 피해 %) · codexPct(코덱스 피해 %).
- 이벤트 명령(영웅): "전직 · 직업 능력 고르기"(가면·왕관 없이), "게이지 · 원소 바꾸기", "주문서 충전". 조건식: `hero.subclass` · `hero.ability` · `hero.gauge` · `hero.element` · `hero.charge`.
- 패시브 stat: hp · str(한 번) · regen(N턴마다 1) · gold(한 번) · charges.
- 세부 능력치(`stats`): `attackSkill`(명중, 기본 10) · `accPerLvl` · `defenseSkill`(회피, 기본 5) · `evaPerLvl` · `unarmedMin/Max`(맨손 피해) · `speed`(이동 배율) · `viewDistance`(시야). 명중·회피는 원래 계산의 배율(무기·버프·힘 부족)을 그대로 두고 기본값 비율만 바꿈. `knownItems`: 처음부터 감정된 아이템.
- 아직 안 되는 것: 직업 선택 화면/영웅 이름 표시.

#### 3.3.2 특성 (Talent) — SPD 특성 트리를 데이터로
```jsonc
"talentTiers": [ { "name": "견습", "unlockLevel": 2, "points": 5 }, …, { "name": "대가", "unlockLevel": 13, "points": 8, "requires": "subclass" },
                 { "name": "원소의 서기", "unlockLevel": 21, "points": 10, "requires": "ability" } ],
"talents": [ { "id": "storm_study", "name": "폭풍 연구", "tier": 2, "maxPoints": 2, "desc": "…", "pointText": ["+1 설명", "+2 설명"],
               "requires": "ember_focus", "requiresPoints": 1, "subclass": "", "ability": "",
               "effects": [ { "type": "unlockSpell", "spell": "storm_lance" },
                            { "type": "spell", "spell": "storm_lance", "field": "cooldown", "perPoint": -2 } ] } ]
```
- 포인트: 단계마다 `min(points, 레벨 − unlockLevel + 1)` − 그 단계에 쓴 포인트 (원작과 같음). `requires`: 원작 `Hero.talentPointsAvailable` 처럼
  3단계는 전직 뒤, 4단계는 직업 능력 뒤 (기본값. 영웅에게 전직·능력이 없으면 그 조건은 무시). 특성의 `subclass`/`ability` = 그 전직·능력일 때만 보임(원작 3·4단계 전용 특성).
- **게임에서 (원작 방식)**: 영웅 정보 창(왼쪽 위 초상화) → **특성 탭**이 `MakerTalentsPane` 으로 바뀜.
  위: 전직·직업 능력(갑옷 충전 %) 한 줄 + 주문 아이콘(hero_icons.png — 누르면 정보·시전, 못 배운 것은 어둡게, 다른 전직·능력 전용은 숨김),
  아래: 단계별 특성 버튼(talent_button + talent_icons.png, 별 = 남은/쓴 포인트, 잠긴 단계는 "전직하면 열림" 등).
  `Hero.talentPointsAvailable` 연결 줄로 초상화 반짝임·"남은 특성 포인트" 알림도 이 포인트를 따름. `nativeTalents: true` 면 게임 원래 특성 창.
- 아이콘: 주문·능력·전직·원소 `icon` = hero_icons.png 번호(16px, 한 줄 8칸), 특성 `icon` = talent_icons.png 번호 — **mod-2 는 32px·한 줄 33칸**(원작 16px·32칸)이라 번호가 다름. 에디터는 연결된 게임 시트 크기를 보고 맞춰서 고름.
- 효과(포인트 × perPoint): `stat` — hp · str/gold/view(올릴 때 한 번) · accuracy · evasion · damage · armor · speed(%) · charges · recharge(%) · regen · damagePct · takenPct · castPct · codexPct,
  `spell` — 주문·직업 능력·코덱스 id(`*` = 전부)의 damage · amount · turns · radius · range · cost · chargeUse · cooldown · count · power, `unlockSpell` — 1포인트 이상이면 그 주문을 배움.
- 코드: `HeroRuntime.talent("id")` = 포인트 수, 훅 `onTalentUp(hero, talent, points)`. 저장: `pdm_tal_k/v/n`.
- 에디터: 단계 설정(열리는 조건 포함, 원작 기본값 버튼) · 단계별 열 트리(카드 클릭 → 세부, 전직/능력 전용 표시) · 포인트별 설명 · 선행 특성 · 효과 목록 · 레벨 → 포인트 계산기.
  검사: id 중복(주문·능력 id 도 겹치면 안 됨), 없는 선행 특성·주문·전직·능력, 단계 범위.

### 3.3.1 영웅·아이템 코드 (사용자 Java 코드)

데이터로 부족한 동작은 에디터의 **코드 (Java)** 칸에 Java 를 직접 씁니다. ▶ 테스트 플레이 / 런타임 설치 때 `editor/renderer/js/codegen.js` 가
게임 저장소의 `core/src/main/java/.../pdmaker/gen/` 에 클래스를 만들고, 게임과 함께 컴파일됩니다 (에디터 화면의 "생성될 코드 보기" 와 같은 생성기).

```jsonc
// heroes/aria.json
"code": { "imports": "", "members": "private int kills = 0;",
          "attackProc": "if (Random.Int(5) == 0) Buff.affect(enemy, Burning.class).reignite(enemy);",
          "onKill": "kills++; if (kills % 3 == 0) hero.HP = Math.min(hero.HT, hero.HP + 1);" }
// items/ember_staff.json
"kind": "melee",                       // misc | melee | missile | armor
"weapon": { "tier": 2, "min": 2, "max": 12, "minPerLvl": 1, "maxPerLvl": 3, "str": 12, "delay": 1, "reach": 1, "accuracy": 1.1 },
"code": { "proc": "if (Random.Int(4) == 0) Buff.affect(defender, Burning.class).reignite(defender);" },
"actions": [ { "id": "ring", "name": "흔들기", "cond": "", "default": true, "consume": false, "time": 1, "code": "GLog.i(\"딸랑\");" } ]
```

| 대상 | 생성 클래스 | 훅 (값을 돌려주는 훅은 `return` 을 안 쓰면 받은 값을 그대로 돌려줌) |
|---|---|---|
| 영웅 | `H_<id> extends MakerHeroCode` | onGameStart · onFloorEnter · onTurn · onLevelUp(lvl) · onKill(mob) · attackSkill · defenseSkill · damageRoll · drRoll · speed · attackProc · defenseProc · 코드 스킬 |
| 아이템 misc | `I_<id> extends MakerItem` | onPickUp · desc · 행동 버튼 |
| 근접/투척 무기 | `I_<id> extends MeleeWeapon / MissileWeapon` | proc · min · max · onEquip · onUnequip(근접) · onPickUp · desc · 행동 버튼 |
| 갑옷 | `I_<id> extends Armor` | armorProc · drMin · drMax · onEquip · onUnequip · onPickUp · desc · 행동 버튼 |

- 무기·갑옷은 원본 클래스를 상속하므로 강화·마법 부여·각인·저주·감정이 원래대로 동작하고, 저장 파일에도 그 클래스로 들어갑니다.
- 수치 식: `기본 + 강화 × 강화당` (갑옷 최대 방어는 + augment 보정). 필요 힘 0 = 티어 기본.
- 코드 오류: 실행 중 예외는 잡아서 로그 + 화면 경고 한 번(게임은 계속). 컴파일 오류는 로그에 `에디터 코드 오류: 아이템 wind_bell · 행동 ring · 6번째 줄` 처럼 에디터 위치가 덧붙음. 에디터 검사는 괄호 짝·문자열만 미리 봄.
- 런타임: `MakerHeroCode`(훅 기본 구현), `GenSupport`(이름·설명·그림·가격을 프로젝트 데이터에서, 오류 보고, `Class.forName` 으로 gen 클래스 찾기). `MakerItem.create(id)` 는 gen 클래스가 있으면 그것을 만듦.

**전직 액티브** (`subclasses[].active`, 런타임 `MakerActive`): 조건(kill 적 처치 · hit 공격 적중 · damaged 피격 · lowHp 체력 % 이하 · always · code)을 `need` 번 채우면
게임 화면 오른쪽 행동 버튼(ActionIndicator)이 켜지고, 누르면 주문·직업 능력과 같은 효과 목록(버프·피해·소환·코드 …)이 나감. `window`(켜진 뒤 쓸 수 있는 턴) · `cooldown` · `message` · `readySound` · `color`.
코드 효과는 영웅 코드 클래스의 `case "active_<전직 id>#n"`. 영웅 코드에서 `MakerActive.ready()` · `add(n)` · `isReady()` · `use()`. 버튼을 쓰면 게이지(원소 바꾸기) 버튼으로 돌아감.

**아이콘 파일 지정** (전직·직업 능력·주문·원소·전직 액티브의 `icon`): 숫자 = 게임 hero_icons.png 칸, `"assets/icons/x.png"` = 그림 한 장, `{ "file", "size", "index" }` = 시트의 칸.
런타임은 영웅 데이터의 아이콘 파일들을 hero_icons.png 아래에 16×16 으로 붙이고 번호를 줌(`MakerAssets.installHeroIcons` → HeroIcon·행동 버튼이 그대로 그림).

**영웅 시트 애니메이션**: idle · run · attack · zap · die · operate + **fly**(공중부양·점프 — 게임 HeroSprite.fly) · **read**(주문서 읽기) + 이름을 붙인 추가 애니메이션
(이벤트 명령 "애니메이션 재생" `{ cmd: "anim", target: "$hero"|캐릭터 id, anim }` — 한 번 재생이면 끝나고 가만히로). 캐릭터 시트도 fly(날개·떠 있을 때) · 추가 애니메이션.
게임은 갑옷을 바꿀 때 `HeroSprite.updateArmor()` 에서 자기 프레임 크기(원작 12×15 · mod-2 48×60)로 다시 잘라서, 직접 만든 시트(다른 프레임 크기)가 잘려 보였음 →
연결 줄로 `HeroRuntime.updateArmor(this)` 가 영웅 편집기 시트로 다시 만들고 게임 코드는 건너뜀. 에디터 미리보기는 실제 흐른 시간으로 프레임을 넘김(fps 1 단위로 반영).
픽셀 편집기: 작업 영역 크기(가로·세로 + 그림 위치 9방향, 16/32/48/64, ×2, +1 프레임, +1 줄) · Ctrl+휠 확대. 숫자 칸은 마우스를 올리고 휠(Shift ×10)로 조절. 아이템 칸은 검색·분류·그림이 있는 목록(스크롤바).

### 3.4 아이템 (items/)

```jsonc
{ "id": "herb_moonleaf", "category": "material", "subtype": "",   // 분류: 아래 표 (게임 items 폴더 구조)
  "name": "달빛 잎", "desc": "…", "sprite": { "sheet": "builtin:items", "index": 12 },  // 또는 { "png": "assets/sprites/moonleaf.png" }
  "stackable": true, "price": 30, "unique": false, "tags": ["herb","gift"],
  "stats": {}, "onUse": [ /* 이벤트 명령 */ ], "giftValue": { "default": 5 },
  "kind": "misc", "level": 0, "cursed": false, "code": {}, "actions": [],   // kind·code·actions → §3.3.1
  "consumable": true, "useLabel": "먹기" }   // 비우면 분류 기본값
```

| 분류 (`category`) | 게임 폴더 | 세부 (`subtype`) | 사용 버튼 · 소모 |
|---|---|---|---|
| weapon 무기 | weapon/ | melee · missile · dart · bow | — (kind 로 무기 상속) |
| codex 코덱스 (mod-2) | weapon/codices/ | melee · ranged · cast | — |
| armor 방어구 | armor/ | armor · class | — |
| artifact 아티팩트 · ring 반지 · wand 마법봉 | artifacts/ · rings/ · wands/ | | 사용 |
| potion 물약 | potions/ (exotic · brews · elixirs) | '' · exotic · brew · elixir | 마시기 · 소모 |
| scroll 주문서 | scrolls/ (exotic) | '' · exotic | 읽기 · 소모 |
| stone 룬석 · spell 마법(연금) · bomb 폭탄 | stones/ · spells/ · bombs/ | | 사용/시전 · 소모 |
| food 음식 | food/ | | 먹기 · 소모 · `stats.energy` 만큼 배고픔 해소 (300 = 한 끼) |
| bag 가방 (mod-2 그리모어 포함) · key 열쇠 · quest 퀘스트 · trinket 장신구 · journal 문서 · remains 유품 | 같은 이름 폴더 | | 사용 (문서는 읽기) |
| material 재료 · gift 선물 (PDMaker) · misc 기타 (items/ 바로 아래: 앙크·이슬·횃불 등) | | | 사용 |

- 에디터 아이템 트리: **분류 › 세부 종류 › 아이템** (예: 무기 › 근거리 무기 / 원거리 무기 / 투척 무기 / 다트). 프로젝트 아이템과 **게임 아이템 292개 전부**(▫, 한국어 이름·티어, ◆ = mod-2 추가)가 함께 나옴.
  게임 아이템을 누르면 보기 창(그림·설명·`spd:` id) → "프로젝트 아이템으로 복사해서 고치기"(이름·설명·그림·분류·티어 수치 복사).
  목록은 `tools/data/extract_spd_items.py <mod-2 저장소> <원작 저장소>` 로 게임 소스(items 폴더·ItemSpriteSheet·items_ko.properties)에서 만듦 → `spd-items.js`.
- **PNG 아이템 그림** (`sprite.png`): 게임이 켜질 때 프로젝트 아이템·게임 아이템 그림 바꾸기의 PNG 를 items 시트 아래에 줄을 더해 붙이고
  `ItemSpriteSheet.film` 에 번호 `20000 + n` 으로 등록(`MakerAssets.installItems` — 기존 칸의 세로 비율도 고침). 칸보다 크면 줄이고 16px 그림은 mod-2(32px)에서 두 배.
  편집기: 게임 시트에서 고르기 · **게임 그림 복사해서 고치기**(그 칸을 PNG 로 복사 → 픽셀 편집기) · 직접 그리기 · PNG 파일 고르기.
- **게임 아이템 그림 바꾸기** (`gameitems.json`: `{ items: { "spd:<경로>": { sprite: { png } | { name, index } } } }`): 게임 아이템 보기 창 → "그림 바꾸기". `Item.image()` 연결 줄.
- **게임 아이템 상속** (`kind: "game"`, `base: "wands.WandOfFireblast"`): 게임 클래스를 그대로 상속한 `gen/I_<id>` — 이름(바꿨을 때)·설명(적었을 때)·그림·가격만 데이터로,
  훅(무기·갑옷이면 proc·min·max…, 공통 onPickUp·desc)·행동 버튼·추가 멤버(@Override 로 게임 함수 직접 다시 쓰기)로 고침. 게임 아이템 보기 창 → "이 아이템을 바탕으로 코드 작성".
- 아이템 그림: `sprite.name` = ItemSpriteSheet 상수 이름(예: `RATION`)을 같이 저장 → 원작(16px, 한 줄 16)·mod-2(32px, 번호 한 줄 32) 시트 어디서나 맞는 그림. 런타임은 `ItemSpriteSheet.class.getField(name)` 으로 번호를 찾음.
- 런타임 `MakerItem`: 분류로 버튼 이름·소모·소리(먹기/마시기/읽기)를 정하고, `spd:짧은이름` 은 이 폴더들(코덱스·그리모어 포함)에서 찾음.
- **코덱스 (`kind: "codex"` → `MakerCodex`)** — mod-2 `items/weapon/codices`(Codex · MeleeCodex · RangedCodex · CastCodex)를 데이터로:
  ```jsonc
  "codex": { "type": "melee|ranged|cast", "tier": 1, "min": 2, "max": 7, "minPerLvl": 1, "maxPerLvl": 2, "str": 0 /* 0 = 7+2×티어 */,
             "baseUses": 10, "quantity": 3, "castTime": 1, "range": 6, "radius": 0, "target": "cell", "visual": "magic", "heat": 8, "effects": [] }
  ```
  겹쳐 쌓이고 "사용"하면 대상을 골라(근접 = 옆 칸 적, 원거리 = 날아가 맞힘, 시전 = 칸·자신·적) 원작처럼 명중 굴림 후 피해 + 추가 효과(MakerCast).
  쓸 때마다 내구 −100/사용 횟수, 0 이 되면 하나가 사라짐(`Codex.decrementDurability`), 강화마다 사용 횟수 ×1.5·피해 +, 100회 이상 = 닳지 않음.
  피해 × (1 + codexPct%), 힘이 모자라면 −33%. 쓰면 게이지 `heat` + 최근 사용 표시(과열의 afterUse). 원작·mod-2 모두에서 동작.
- **그리모어 (`kind: "grimoire"` → `MakerCodex.MakerGrimoire`)**: `bag: { capacity: 19, holds: "codex"|"all" }` — 코덱스(PDMaker·mod-2 모두)를 담는 가방.


### 3.5 사운드 (audio/sounds.json + assets/audio/) — 사운드 편집기

```jsonc
{ "sounds": [
  { "id": "bell", "name": "바람 방울", "kind": "se", "file": "assets/audio/bell.wav", "volume": 1, "pitch": 1, "loop": false,
    "synth": { "layers": [ … ], "reverb": 0.3, … }, "seed": 1000 },   // 합성으로 만든 소리는 설정을 같이 저장 → "다시 만들기"
  { "id": "town_theme", "name": "마녀의 마을", "kind": "bgm", "file": "game:music/theme_2.ogg", "volume": 0.8, "loop": true } ] }
```
- 참조: `sound:<id>` (목록), `game:music/x.ogg` · `game:sounds/x.mp3` (게임 파일 그대로), `assets/audio/x.wav` (프로젝트 파일). 게임은 ogg·mp3·wav 재생.
- 배경음 우선순위: **노드 `bgm`** → **그룹**(맵 편집기 그룹 인스펙터 "음악") → 사용자 테마 `music` → 게임 기본 테마 음악. `"none"` = 음악 끄기.
  그룹 필드: `bgm`(탐험) + `bgmExtra[]`(같이 돌려 틀 곡 — 층마다 무작위, 전부 게임 곡이면 `Music.playTracks` 로 게임처럼 이어 재생),
  `bgmTense` + `bgmTenseWhen`(조건식이 참이면 긴장 곡), `bgmBoss`(노드 "보스 층"). "테마 기본 음악으로 채워서 고치기" 버튼은 테마의 기본 곡들(`PDM.THEME_MUSIC`)을 채워 넣음.
- 이벤트 명령 "효과음/음악"의 소리 칸, 코드에서는 `MakerAudio.playSe("sound:bell")` / `MakerAudio.playBgm(…)`.
- 편집기: 가져오기(ogg/mp3/wav → assets/audio 로 복사), 게임 소리 복사해 오기, 미리 듣기, 음량·음높이·반복, 쓰는 곳 목록,
  파형 편집(구간 선택·확대, 선택만 남기기·지우기·무음·페이드 인/아웃·음량·노멀라이즈·뒤집기·속도·끝에 무음·모노, 되돌리기 → WAV 저장),
  효과음 합성기(8비트 방식은 삭제): 레이어 최대 4개 × (사인/삼각/톱니(polyBLEP)/사각/잡음, 음높이 미끄러짐, 유니즌·디튠, FM, 비브라토,
  ADSR, 바이쿼드 필터 lp/hp/bp + 컷오프 이동), 전체 음높이·길이·밝기·드라이브·에코·리버브, 시작값 16개(종·차임·반짝임·회복·줍기·타격·베기·폭발·문·발소리·
  물방울·바람·마법·저주·경고·UI), "살짝 바꾸기"(seed).

**소리는 각 세부 설정에서** (사운드 편집기의 "게임 효과음" 칸은 없앰 — 🎚 버튼이 그 소리를 사운드 편집기에서 열고, 게임 소리면 프로젝트로 복사해서 편집):
- 프로젝트 아이템: `sound`(쓸 때) · `throwSound` · `pickupSound`(게임의 줍는 소리 대신) · `equipSound`, 코덱스는 쓸 때·맞을 때·빗나갈 때·다 닳을 때.
- 게임 아이템(아이템 트리의 ▫ 페이지 → "소리"): `sounds.json` 의 `gameItems["spd:<경로>"] = { use, throw, pickup, equip }` (`Item.execute` · `Item.doPickUp` 연결 줄).
- 캐릭터: `sounds = { attack, hurt, die }`(몬스터) · `{ talk }`(NPC) + `voice`(대사 글자).
- 주문·직업 능력(쓸 때·맞을 때) · 대사창 · 마음 시스템(heart.json `sounds`: up·down·bond·crystal) · 게이지(`gauge.sounds`: overflow·switch).
- 값: "" = 기본 소리(아래 표) 또는 게임 원래 소리, "none" = 소리 없음. 사운드 편집기의 "쓰는 곳"은 프로젝트 전체에서 `sound:<id>` 를 찾음.

**코덱스 연출** (mod-2 codices): `magicImage`(items.png 칸) — 원거리: 그 그림이 날아감(`visual: item`, MissileSprite, `spin`), 근접: MagicImageAnimator(`anim`: alternate·sweep·stab·charge·smash, mod-2 전용) · `hits`/`hitDelay` 연타 · 대상을 고르는 코덱스는 `usesTargeting`(퀵슬롯 자동 조준).

**기본 소리** (`MakerAudio.SFX` — 예전 프로젝트의 `sounds.json` `sfx` 값은 그대로 읽음, 편집 화면은 없앰): 키 → 참조.
codex.melee · codex.meleeHit · codex.ranged · codex.cast · codex.hit · spell.cast · spell.hit · ability.cast · ability.hit · item.eat · item.drink · item.read · item.use · dialogue.open · dialogue.type · dialogue.next · choice.move · choice.select.
아이템·주문·코덱스에 직접 고른 소리(sound·hitSound)가 있으면 그것이 먼저. 기본값은 mod-2 소리(atk_grimoire 등)가 없으면 원작 소리로 (`MakerAudio.SFX`).
게임 소리는 처음 재생 때 바로 불러옴 (원래 `Sample.load` 는 다음 프레임에 불러와 첫 소리가 빠졌음).

### 3.7 타이틀 화면 (title.json) — 에디터 "🏰 타이틀 화면"

```jsonc
{ "enabled": true,
  "music": { "tracks": [] },                                   // 비우면 게임이 트는 곡 (원작 theme_1·2 / mod-2 title.mp3), "none" = 끄기
  "background": { "archs": true, "archStyle": "game|classic", "archReverse": false,            // archs=false → 없음
                  "archDir": "up|down|left|right", "archSpeed": 20, "archImages": { "bg": "", "fg": "" }, "color": "",   // classic 에서만
                  "gradient": { "enabled": true, "color": "#0b1b3a", "alpha": 0.55, "from": "top|bottom|left|right" },
                  "vignette": true, "effect": "none|snow|rain|embers|sparkle|petals|fireflies|mana", "effectDensity": 1, "effectArea": "screen|logo", "effectFront": false },
  "layers": [ { "image": "game:effects/fireball-short.png", "frame": [47, 47], "frames": [0,1,…], "fps": 24, "fit": "none", "x": 0.12, "y": 0.2,
                "tile": false, "scrollX": 0, "scrollY": 0,      // 가로(−왼쪽 +오른쪽)·세로(−위 +아래) 흐름 — 화면 밖으로 나가면 반대편에서 다시 들어옴
                "bob": 2, "pulse": 0, "spin": 0, "blend": "light", "front": false, "titleOnly": false } ],   // titleOnly = 메뉴 화면엔 안 그림
  "menus": { "background": true, "music": true, "layers": true, "effect": false },   // 메뉴 화면(랭킹·일지·변경·소개…)도 타이틀과 같은 배경·음악
  "logo": { "mode": "game|image|text|none", "scale": 1, "y": 0, "offsetY": 0, "glow": true, "torches": false, "anim": "none|float|sway|pulse", … },
  "gate": { "enabled": true, "text": "화면을 누르세요", "logoAfter": "fade|up|stay", "idleReturn": 15 },          // mod-2 방식
  "buttons": { "layout": "game|grid|column", "width": 120, "height": 18, "gap": 4, "style": "",
               "anim": { "enter": "none|fade|slideUp|slideDown|slideLeft|slideRight|drop|pop", "duration": 0.6, "stagger": 0.08, "distance": 24,
                         "idle": "none|bob|sway|pulse", "idleAmount": 2, "idleSpeed": 1 },
               "items": [ { "id": "play", "label": "탑에 오르기" }, { "id": "credits", "custom": true, "action": "text", … } ] },
  "version": { "visible": true, "text": "" }, "exit": { "visible": true } }
```
- 게임: `TitleScene.create()` 끝 `fadeIn()` 앞의 `MakerTitle.apply(this)` 가 **게임의 원래 화면을 모두 숨기고(입력 영역 제거) 설정대로 새로 그림**.
  mod-2 의 TitleScene 은 원작과 구조가 완전히 다르므로(탭 → 메뉴, 버튼이 menuLayer 안에서 매 프레임 이동, 마나 반딧불, 남색 그라데이션) 원래 요소를 고치는 대신 새로 만듦.
- 배경 방식 `archStyle`:
  - `game` (기본) = 게임의 `ui/Archs` 를 그대로 씀 — mod-2 는 interfaces/title0~9.png 10겹 가로 시차 배경(밤하늘·달·숲·탑 + 반딧불·물빛 그라데이션), 원작은 아치. `archReverse` 로 반대 방향. **메뉴 화면과 똑같은 배경**이 됨.
  - `classic` = 원작 아치 그림(arcs1 뒤·arcs2 앞, 앞이 2배 빠름)을 **위·아래·왼쪽·오른쪽** 어느 방향으로도, 속도 조절, 그림 바꾸기(`archImages`).
  - 레이어도 가로·세로 흐름.
- 메뉴 화면 `menus` (`MakerAssets.MenuStyler`, PixelScene.create 연결): mod-2 는 랭킹·모험 일지·변경 화면에서 음악을 theme_1/2 로 바꾸고, 타이틀(원래 PDMaker 는 원작 아치)과 메뉴(10겹 Archs)의 배경이 달랐음 → 
  이제 기본이 `game` 이라 같고, `menus.music` 이 메뉴 화면에서도 타이틀 곡을 이어 틀며, 타이틀 배경을 바꿨으면(`classic`·색·그라데이션·레이어) 메뉴 화면의 Archs 를 숨기고 같은 배경을 그림.
- 타이틀 스프라이트: 에디터에서 타이틀이 쓰는 게임 그림(title0~9 · arcs · banners · chrome · icons)을 바로 고치기/바꾸기/원래대로 (§3.8 게임 그림 바꾸기).
- 버튼 애니메이션: 나타날 때(서서히·슬라이드 4방향·떨어지며 튕김·가로로 튀어나옴, 시간·버튼 사이 간격·거리) + 나타난 뒤 계속(둥실·살랑·깜빡임).
- "화면을 누르세요": 처음엔 로고+안내, 누르면 로고가 사라지거나 올라가고 버튼이 나옴, 가만히 두면 돌아감. 다른 화면(랭킹 등)에서 돌아오면 바로 메뉴.
- 에디터: 움직이는 미리보기(누르면 탭 전 ↔ 메뉴, ▶ 애니메이션 다시 보기), 빠른 시작 "원작(SPD) 기본"·"mod-2(위츨링) 기본".

### 3.8 그림 관리 · 게임 그림 바꾸기 — 에디터 "🖼 그림 관리"

- 프로젝트 `assets/` 표준 폴더: `sprites/heroes` · `sprites/characters/{npc,companion,monster,boss}` · `sprites/items` · `sprites/effects` · `portraits/<캐릭터>` · `illustrations` · `tiles` · `title` · `ui` · `game` · `audio` (docs/FOLDERS.md).
  그림 칸의 "찾기…" 는 리소스에 맞는 표준 폴더로 복사 (`PDM.assets.folderFor(key, what)`).
- 그림마다 크기 · 쓰는 곳(모든 리소스 JSON 에서 같은 경로 문자열) · 편집 · 바꾸기 · 이동/이름 바꾸기(파일 복사+삭제 후 모든 리소스의 같은 문자열을 새 경로로, 바로 저장) · 삭제(쓰는 곳이 없을 때만).
- 🧹 자동 정리: 영웅 시트 → sprites/heroes, 캐릭터 시트 → sprites/characters/<종류>, 초상화 → portraits/<id>, 아이템 PNG → sprites/items, 타이틀 그림 → title, 사용자 테마 → tiles, 이벤트·스토리 그림 → illustrations. 미리 보기 후 실행.
- **게임 그림 바꾸기**: 프로젝트 `assets/game/<게임 assets 경로>.png` (예 `assets/game/interfaces/title3.png`, `assets/game/sprites/items.png`) 가 있으면
  - 게임: `MakerAssets.install()` 이 `TextureCache.all` 의 같은 키("interfaces/title3.png")에 그 그림을 넣음 — 프로젝트 불러올 때와 모든 화면 `PixelScene.create()` 때(메뉴로 돌아오면 캐시가 비워지므로 다시). `MakerRuntime.texture("game:…")` 도 이 그림을 돌려줌.
  - 에디터: `PDM.assets.resolvePath('game:…' | 'builtin:…')` 가 프로젝트 파일을 먼저 씀 (`resolvePath(ref, true)` = 원본). 프로젝트를 열 때 `scanOverrides()`.
  - "고치기" = 원본을 그 경로로 복사해 픽셀 편집기로 엶, "원래대로" = 파일 삭제.

### 3.9 대사창 (dialogue.json) — 에디터 "💬 대사창"

대사창: 화면 아래 넓은 대사 상자 + 말하는 캐릭터의 스탠딩 일러스트(상자와 겹쳐 위로 솟음) + 이름표 + ▼ + 한 글자씩 + 선택지.

```jsonc
{ "mode": "box",                 // box(아래 대사창) | window(원작 가운데 창: 작은 스프라이트 + 이름)
  "box": { "style": "round", "color": "#ffffff", "alpha": 0.94, "border": "#b9b4c8", "radius": 5,   // round · game(원작 창 테두리) · image(9조각 그림)
           "textColor": "#3a3448", "fontSize": 8, "height": 0.27, "margin": 4, "padding": 8, "image": "", "slice": 6,
           "highlight": "#d0602a", "align": "left", "hideHud": true },                   // _강조_ 색 · 정렬 · 대사 중 다른 UI 숨기기
  "name": { "show": true, "pos": "auto", "color": "#3c3a48", "textColor": "#ffffff", "fontSize": 7, "image": "", "slice": 4 },  // auto = 일러스트 반대편 · 이름표 그림
  "illust": { "show": true, "side": "left", "height": 0.92, "layer": "front", "avoidText": true, "smooth": "auto" },
  "typing": { "speed": 40, "sound": "" },              // 글자/초 (0 = 한 번에) · 글자 소리
  "indicator": { "show": true, "color": "#8a82a8", "image": "", "anim": "bob" },          // ▼ 대신 그림 · bob·blink·none
  "choice": { "pos": "middle", "width": 0.42, "fontSize": 0, "textColor": "", "textOnColor": "",
              "image": "", "imageOn": "", "slice": 4 } }                               // middle = 화면 가운데 · 그림 9조각
```
- 크기 단위는 게임 화면 픽셀(가로 16:9 에서 높이 약 270). 일러스트 높이 = 화면 높이 × `illust.height` × 캐릭터 `portrait.scale`.
- 화자: 캐릭터 id → 그 캐릭터의 초상화(표정 키 → 표정 그림, 없으면 기본). `$hero` → 영웅의 `character`(연결된 캐릭터) 일러스트, 이름은 영웅 이름.
- 대사 명령: 화자·표정·일러스트(이번 대사만 다른 그림)·일러스트 위치(왼쪽·오른쪽·이번엔 숨김)·이름 바꾸기(예: ???)·대사. `_강조_` 는 노란 글자.
- "표정 바꾸기" 명령: 그 뒤로 표정을 적지 않은 대사는 바꾼 표정으로.
- 대사 바로 뒤의 "선택지"는 대사창을 띄운 채로 나옴 (대사 없이 선택지만 있으면 선택지만).
- 게임 조작: 누르기·Enter·Space·Z = 넘김(글자가 나오는 중이면 다 보이기), ↑↓·숫자 키 = 선택지.
- 큰 그림(1000px 등)은 게임에서 LINEAR 필터로 부드럽게 줄임 (`smooth`: auto·on·off).
- 에디터: 대사창 편집기(설정 + 미리보기 · 빠른 시작 4종), 캐릭터 편집기(일러스트 크기·위치·방향 + 작은 미리보기), 이벤트 장면 미리보기가 모두 같은 계산(`PDM.Dialogue`)을 씀.
- **레이아웃 직접 편집** (`layout`, 대사창 편집기 미리보기에서 영역을 끌기·모서리로 크기·도구로 새로 그리기, js/layout.js `PDM.layoutEditor`):
  `{ enabled, box:{x,y,w,h}, text:{x,y,w,h}, name:{x,y}, illust:{x,y(발 위치),h}, choices:{x,y,w}, indicator:{x,y} }` — 화면 비율 0~1.
  일러스트는 왼쪽에 선 캐릭터 기준(오른쪽이면 좌우 대칭). 글 영역을 정하면 일러스트를 피하지 않음. 타이틀 화면도 같은 방식으로 로고(위치·배율)·버튼 영역(위쪽·너비·좌우) 편집.
- 소리: 대사창 `sounds`{open,type,next,move,select} → 비면 게임 효과음. 캐릭터 `voice` = 그 캐릭터 대사의 글자 소리(가장 먼저).
- `box.hideHud`(기본 켬): 대사창·선택지가 떠 있는 동안 uiCamera 로 그리는 게임 UI(상태창·도구 막대·기록·버튼·마음 버튼)를 숨기고, 마지막 창이 닫히고 0.15초 뒤 되돌림(대사가 이어질 때 깜빡이지 않게). 일러스트 층은 그대로.
- 캐릭터에게 말을 걸 때의 메뉴(대화·부탁·마음 보기, `HeartMenu`)도 대사창 + 화면 가운데 선택지로 나옴 (mode window 면 예전 창).
- 소리: 대사창 열기·넘기기·글자·선택지 옮기기/고르기는 게임 효과음 설정(§3.5)의 dialogue.* · choice.*.
- "일러스트 표시/숨김" 명령(번호 1~8 · 왼쪽·가운데·오른쪽·전체 화면 · 페이드)은 게임 화면 위, 대사창 아래 층(`MakerStage`)에 그림.

- 런타임 `MakerAudio`: 프로젝트 파일을 게임의 `Music`/`Sample` 안에 끼워 넣어 게임 설정의 음량·음소거·일시정지를 그대로 따름.

---

## 4. 마음 시스템 (Heart System) — era 방식의 핵심

> 목표: **"캐릭터가 살아 있다"** 는 느낌. 플레이어가 한 일 하나하나가 수치로 남고, 그 수치가 대사·행동·스토리 분기로 되돌아온다.

### 4.1 흐름 (era 의 SOURCE → PALAM → JUEL → ABL 을 옮김)

```
 플레이어 행동 ──▶ ① 자극(source)  ──▶ ② 감정 게이지(gauge)  ──▶ ③ 마음의 결정(crystal)  ──▶ ④ 관계 능력(ability) 상승
 (대화, 선물,        행동표 × 성격 보정      이번 층/이번 대화 동안        층을 떠날 때 게이지가         결정을 소모해 레벨업
  함께 싸움, 구출,    × 능력 보정             누적 (기쁨, 안심, 긴장…)       기준치를 넘으면 결정화        (친밀, 따름, 협력 …)
  무시, 공격 …)                                                                   │
                                     ⑤ 호감도·신뢰도·분노 변화 (era 호감도/신뢰도 처리)         ▼
                                     ⑥ 흔적(mark) 획득 — 강한 감정이 오래 남음 ──────▶ ⑦ 관계 단계·이정표 이벤트 ──▶ ⑧ 스토리 플래그 → 루트·엔딩
```

**마음의 결정은 아이템이 아닙니다.** 가방에 들어가거나 버리거나 쓸 수 없고 캐릭터마다 숫자(`rec.crystals`)로만 쌓입니다.
게임 화면 오른쪽 위의 하트 버튼(끌 수 있음: `project.heartButton`)이나 이벤트 명령 `showHeart` 로 여는 **마음 창**에서만 보입니다
(관계 단계·태도·호감/신뢰/분노·결정·게이지·능력·흔적·이정표).

### 4.2 수치 목록 (전부 terms.json 으로 이름 변경 가능)

| 종류 | era 원본 위치 | 내부 키 (예) | 설명 |
|---|---|---|---|
| 관계 수치 | CFLAG/BASE/TALENT | `favor`, `trust`, `anger`, `sulk`, `mood`, `temper`, `displeased`, `accept`, `stress`, `jealousy`, `fatigue` | 호감도·신뢰도·분노·삐짐·무드·기분·언짢음·마음 열림·스트레스·질투·대화 피로 (§4.7) |
| 감정 게이지 | PALAM | `gauge.joy`, `gauge.relief`, `gauge.tension`, `gauge.fear`, `gauge.anger`, `gauge.shy`, `gauge.respect`, `gauge.sorrow` | 한 층(또는 한 대화) 동안만 쌓이는 일시 수치 |
| 마음의 결정 | JUEL | `crystal.joy` … 감정 게이지마다 1종 (기쁨의 결정 · 안심의 결정 …) | 게이지가 굳은 영구 재화. 예전 이름(마음의 보석, `gem.<광물>`)은 열 때 자동 변환, 조건식 `gem.*` 도 계속 읽힘 |
| 관계 능력 | ABL | `abl.intimacy`, `abl.deference`, `abl.talk`, `abl.combat`, `abl.cooking`, … | 0~10 레벨. 결정을 써서 올림 (친밀 ← 기쁨·수줍음, 따름 ← 존경·안심, 대화술 ← 기쁨·안심, 전투 협력 ← 긴장·존경) |
| 성격 | TALENT | `CHEERFUL`, `PROUD`, `HONEST`, `REBELLIOUS`, … | 고정 성격. 자극 보정값 |
| 관계 이정표 | TALENT(관계 비트) | `bond.admire` → `bond.close` → `bond.partner` | 단계 돌파 이벤트로만 얻음 |
| 흔적 | MARK | `mark.fear`, `mark.resent`, `mark.hurt`, `mark.joy`, `mark.awe` | 0~3 단계. 강한 경험이 영구히 남음 |
| 경험 횟수 | EXP | `exp.talked`, `exp.fought`, `exp.saved`, `exp.gifted`, `exp.ignored` | 조건식에 씀 |

### 4.3 기본 규칙 (기존 메이커 호감도 탭 규칙 계승)

- 행동표: 행동마다 `favor / trust / anger` 기본값과 **자극(source) 벡터** 를 가진다.
- 성격 보정: `favorAdd`, `trustAdd`, `onlyPositive`, `halve` (era TRACHECK 규칙).
- **신뢰 상한**: 호감도가 `capStart` 이상이고 `신뢰도 × trustRatio` 를 넘으면 호감 상승량 감소.
- **분노**: `angerMax` 에 닿으면 "삐짐" → 호감 상승 없음, `decayTurns` 마다 `angerDecay` 씩 풀림.
- 신뢰도는 `canLowerTrust` 행동일 때만 내려감.
- **태도(Attitude)**: 수치 조합으로 6단계 도출 — 적대 / 경계 / 무관심 / 우호 / 신뢰 / 헌신. 대사·AI 행동에 쓰임.

### 4.4 반응(Counter) — 행동에 즉시 반응

era 의 COUNTER 처럼, 가까이 있는 캐릭터가 플레이어 행동에 **즉석 반응** 한다.

| 계기 | 예시 반응 |
|---|---|
| 플레이어 체력 30% 이하 | 걱정 대사, (친밀 3 이상) 회복 물약 건네기 |
| 플레이어가 적을 처치 | 칭찬 / 무서워함 (성격에 따라) |
| 오랫동안 말을 안 검 | `exp.ignored` 증가, 서운함 대사 |
| 선물을 받음 | 좋아함/평범/싫어함 반응 + 표정 변경 |
| 플레이어가 이 캐릭터를 공격 | 분노 대폭 상승, `mark.resent` |

### 4.5 이정표·데일리·일기

- **이정표 이벤트**: `favor ≥ X && trust ≥ Y && abl.intimacy ≥ Z` 같은 조건을 처음 만족하면 이벤트(고백, 약속, 갈등) 실행 → 관계 이정표 획득.
- **층 이벤트(데일리)**: 층에 들어갈 때 조건·확률로 뽑히는 짧은 이벤트 (era 데일리/외출 이벤트).
- **일기**: 층을 떠날 때, 그 층에서 가장 컸던 감정으로 캐릭터가 한 줄 일기를 씀 → 저널에서 볼 수 있음.
- **기억(Memory)**: "나를 구해줌", "선물을 버림" 같은 사건을 기록 → 나중 대사 조건으로 사용.

### 4.6 대사 = 구상(口上) 방식

캐릭터마다 **토픽(상황)** 별 대사 후보를 여러 개 두고, 조건이 가장 구체적인 것을 고른다.
없으면 공용 대사로 떨어진다 (era 의 구상 덮어쓰기와 같은 구조).

```jsonc
"dialogue": {
  "greet": [
    { "when": "bond.partner",                 "text": "왔어? …기다렸다고는 안 했어.", "face": "shy" },
    { "when": "favor>=600 && temper>0",    "text": "오늘 약초가 잘 자랐어! 같이 볼래?", "face": "smile" },
    { "when": "anger>=500",                    "text": "…흥.", "face": "angry" },
    { "text": "안녕, 견습 마녀님." }
  ],
  "gift_liked": [...], "gift_disliked": [...], "low_hp": [...], "floor_enter": [...], "boss_defeated": [...],
  "stage_up": [...], "idle_chatter": [...]
}
```

토픽 목록은 `heart.json` 에서 늘릴 수 있고, 이벤트 명령 `대사 토픽 말하기(캐릭터, 토픽)` 로 어디서든 부를 수 있다.

### 4.7 마음 시스템 2 — eraTW / eraTHYM 에서 옮긴 세부 규칙 (2026-09-25)

참고: `era/eraTWKR-4.956` 의 `TRACHECK_호감도상승처리`, `TRACHECK_신뢰도상승처리`, `ATTITUDE`(합의판정·REJECT_CHECK), `COMF300~303`(회화·스킨십·사과),
`COUNTER_SELECT/TYPE`, `EVENTTURNEND`(언짢음·연모/사모 취득 조건), `COMMON`(GET_REVISION·GET_ANGRY·KIGEN_CHANGE), `BEFORETRAIN/AFTERTRA`(하루 초기화)
과 `eraTHYMKR` 의 `TRAIN_CHECK`(스트레스·질투도), `ABLUP`(구슬로 능력 상승). 성적인 수치·명령·대사는 옮기지 않고 시스템 구조만 중립 이름으로 옮김.

| 규칙 | era 원본 | 여기서 |
|---|---|---|
| 호감 상승 | 기본(친밀+순종)/2 + 소질 + 기분 + Σ(상한 − 계수/(SOURCE+c))/10 | 행동 기본 + (친밀+따름)/2 + 기분 + 성격 + Σ 게이지 곡선 `cap·v/(v+k)` /10 − 반발 흔적 (좋은 행동은 −흔적 아래로 안 내려감) |
| 신뢰 한도 | 호감 > 신뢰×4 → GET_REVISION(신뢰×20/30/40) | `상승 × 신뢰·K/(호감+신뢰·K)`, K = 20, 이정표에 따라 30/40 (`bondTrustK`) |
| 신뢰 상승 | 성공 판정 + 친밀/5 + 무드 보정, 실패일 때만 하락 | 같음. 무드 가득 +2·하락 없음, 80% 이상 +1·하락 절반 |
| 무드 | (친밀+1)·좋은 자극/3, √ 완만, 모브가 있으면 절반, 하루마다 0 | 같음 (층마다 0, 다른 마음 캐릭터가 보고 있으면 절반) |
| 분노 | 반감 × (2000−무드)/(2000+무드) × 기분(0.7/1.5) | 행동 분노 × (2·최대−무드)/(2·최대+무드) × 기분 × 성격 `angerMul` |
| 삐짐 | 분노 최대 → 빡침 + 언짢음 + 기분 −1 (+반발각인) | 같음. 언짢음 = 남은 층 수, 반발 흔적 `resentLock` 단계면 안 풀림 |
| 사과 | 삐졌을 때만, 성공 → 해제·분노 절반, 대성공 → 0 | `calm` 행동 (APOLOGIZE), `removeResent` 로 흔적 지우기 |
| 기분 | 매일 0 으로 돌아온 뒤 10% 확률 ±1, 감정결여 ½ | 층마다, `temperChance`, 성격 `temperMul` (기분파 ×3) |
| 결과 판정 | 대성공/성공/실패, 회화 누적치 초과 시 실패 | `success`·`great`(마음 열림으로 ±20 보정), `fatigue`/`fatigueMax`, `perFloor` |
| 마음 열림 | 합의판정 = 호감 단계 + 신뢰 단계 + 연모/사모 + 친밀·욕망 + 무드/25 … → 태도 0~3 | `acceptance` 표 → `accept`, `acceptLv`. 부탁(`requests`)은 점수 > need 면 들어줌 |
| 연모/사모 | 호감·신뢰·친밀 조건, 반발각인이면 불가, 연모가 사모를 대신 | 이정표 `blockedBy`, `replaces` |
| 질투 | 같은 방의 연모 캐릭터가 다른 캐릭터와 무드를 올리면 분노 (파루파루) | 시야 안의 이정표/호감 캐릭터가 분노·`jealousy` 누계, 성격 `jealousMul`, 토픽 `jealous` |
| 스트레스 | (THYM) 스트레스 단계별로 좋은 자극 감소 | 층을 떠날 때 두려움·슬픔으로 쌓임, 쉬는 곳에서 회복, 단계별 좋은 게이지 ×0.9~0.6 |
| 반응 선택 | 후보 중 무게로 하나 (COUNTER_SELECT), 친해져야 발생 | 계기마다 무게(`weight`, `moodBonus`)로 하나, `needWarm` |

게임: 마음 캐릭터에게 말을 걸면 **말 걸기 메뉴** (`menu` 행동 — 대화·칭찬·위로·사과 + 부탁 + 마음 보기). 이벤트 명령 `heartMenu`(메뉴 열기),
`request`(부탁하기 → 들어주면/거절하면), `action` 의 `say`(결과 대사). 새 토픽: talk_tired, praise, comforted, apology_ok/fail, jealous, request_ok/no, good/bad_temper.
예전 프로젝트는 마음 시스템 편집기의 "새 규칙·행동·토픽 가져오기" 버튼으로 새 기본 항목만 추가할 수 있고, 게임 런타임은 빠진 규칙을 기본값으로 계산.

---

## 5. 이벤트 시스템

### 5.1 이벤트 구조

```jsonc
{ "id": "ev_collapsed_bridge", "name": "무너진 다리",
  "pages": [
    { "conditions": [ { "switch": "bridge_fixed", "is": false } ],
      "trigger": "action",            // action(조사) | touch(밟음) | auto | parallel | floorEnter | turn | heart | itemPickup | mobKilled | bossDefeated
      "graphic": { "tile": 12 },
      "commands": [
        { "cmd": "text", "speaker": "aria", "face": "think", "text": "다리가 무너졌어…" },
        { "cmd": "choice", "options": ["물의 원소로 건넌다", "돌아간다"], "branches": [
            [ { "cmd": "if", "cond": "hero.element=='water'", "then": [ { "cmd": "switch", "id": "bridge_fixed", "value": true } ],
                "else": [ { "cmd": "text", "text": "지금 원소로는 무리야." } ] } ],
            [] ] }
      ] },
    { "conditions": [ { "switch": "bridge_fixed", "is": true } ], "trigger": "none", "commands": [] }
  ] }
```

페이지는 **아래쪽부터** 조건을 검사해 처음 만족하는 페이지가 활성.

### 5.2 명령 목록 (v0.1)

| 분류 | 명령 |
|---|---|
| 메시지 | 대사 표시(화자·표정·일러스트), 선택지, 대사 토픽 말하기, 알림 문구, 두루마리 창 |
| 흐름 | 조건 분기, 반복/중단, 라벨/점프, 대기, 커먼 이벤트 호출, 이벤트 중지 |
| 데이터 | 스위치, 변수(연산), 셀프 스위치, 마음 수치 변경, 감정 게이지, 흔적 부여, 기억 기록 |
| 연출 | 일러스트 표시/이동/숨김, 화면 흔들림/번쩍임/색조, 애니메이션 재생, 파티클(플러그인), 카메라 이동 |
| 캐릭터 | 이동 경로 설정, 방향 전환, 표정 변경, 소환/제거, 동료로 합류/이탈 |
| 월드 | 층 이동, 타일 바꾸기, 아이템 주기/빼기, 몬스터 소환, 문 열기/잠그기 |
| 스토리 | 루트 설정, 장 테마 교체, 엔딩 실행, 게임 오버, 저장 지점 |
| 확장 | 플러그인 명령, 스크립트(고급) |

### 5.3 장면(Scene) — 일러스트 + 애니메이션 연출

장면 = **타임라인 트랙이 있는 이벤트** (GameMaker 시퀀스 + 그림 표시).
트랙: 일러스트 레이어(최대 8), 대사, 효과음/음악, 화면 효과. 에디터에서 재생 미리보기.

---

## 6. 스토리 편집기

- **변수 사전**: 스위치/변수를 이름·설명·그룹으로 관리 (이벤트에서 이름으로 선택).
- **장 흐름도**: 장(5층) → 스토리 비트(필수 이벤트) → 분기 노드 → 엔딩. 노드 그래프로 표시.
- **루트**: `when` 조건 → 다음 장의 테마/보스/등장 NPC 교체.
- **엔딩**: 조건 + 우선순위. 게임 클리어(또는 특정 트리거) 시 우선순위가 높은 것부터 검사.

```jsonc
"endings": [
  { "id": "true_end",   "priority": 100, "when": "cores>=5 && bond.partner(any) && !switch.betrayed", "scene": "sc_true_end" },
  { "id": "lonely_end", "priority": 10,  "when": "cores>=5", "scene": "sc_lonely_end" },
  { "id": "fail_end",   "priority": 0,   "when": "true", "scene": "sc_fail" }
]
```

조건식 문법은 에디터·런타임 공통 (`Cond` — §8.3).

---

## 7. 플러그인

GameMaker `.gmplugin` 매니페스트에 `@param` 주석 방식을 합친다.

```jsonc
// plugins/effect-maker/plugin.json
{ "id": "effect-maker", "name": "이펙트 메이커", "version": "0.1.0", "author": "",
  "pdmaker": ">=0.1",
  "dependencies": [],
  "editor": { "main": "editor.js" },                 // 에디터에 편집기·패널·명령 추가
  "runtime": { "jar": "runtime/effect-maker.jar", "entry": "com.example.EffectPlugin" },  // 게임 쪽 (선택)
  "contributes": {
    "resourceTypes": [ { "id": "effect", "name": "이펙트", "folder": "effects" } ],
    "eventCommands": [ { "id": "effect.play", "name": "이펙트 재생",
                         "params": [ { "key": "effect", "type": "resource:effect" }, { "key": "target", "type": "target" } ] } ]
  } }
```

- 에디터 API: `pdm.registerEditor`, `registerEventCommand`, `registerResourceType`, `registerMenu`, `onProjectLoad`, `project.read/write`.
- 런타임 API (Java): `MakerPlugin.onLoad(MakerRuntime)`, `registerCommand(id, handler)`.
- 플러그인 켜기/끄기, 순서는 `project.json` 의 `plugins` 배열.

---

## 8. 게임 런타임 (mod-2 에 붙는 Java 패키지)

패키지: `com.shatteredpixel.shatteredpixeldungeon.pdmaker`

| 클래스 | 역할 |
|---|---|
| `MakerRuntime` | 프로젝트 폴더 찾기(`-Dpdmaker.project`, 또는 exe 옆 `project/`), JSON 로드, 전체 상태 보관 |
| `MakerJson` | libGDX `JsonReader` 래퍼 |
| `Cond` | 조건식 파서/평가기 (에디터 JS 와 같은 문법) |
| `StoryState` | 스위치·변수·셀프 스위치·루트·엔딩 기록, `Bundle` 저장/복원 |
| `HeartSystem` | §4 전체 — 행동 적용, 게이지→결정, 흔적, 태도, 대사 선택 |
| `EventInterpreter` | 명령 리스트 실행 (코루틴식: 창이 닫힐 때까지 대기) |
| `MakerLevel` | `handmade` 층 (DeadEndLevel 처럼 `build()` 에서 map 채움) |
| `LevelHooks` | `procedural/hybrid` 층에 오브젝트·NPC·이벤트 주입 |
| `MakerNPC` | 데이터로 정의되는 NPC (`interact()` → 이벤트/대사) |
| `MakerSprite` | 프로젝트 PNG 로 만든 `MobSprite` |
| `PluginHost` | 플러그인 jar 로드 (데스크톱만) |
| `WorldGraph` | 맵 그래프 — 노드 depth/branch 계산, 계단 연결(출구 무작위 선택 · 조건 샛길 계단 · 온 곳으로 돌아가기) |
| `HeroRuntime` | 영웅 편집기의 영웅 적용 — 능력치(`bonus`), 시작 인벤토리, 영웅 시트, 주문서·패시브(`Tracker` 버프), 영웅 코드 훅 호출 |
| `HeartMenu` | 마음 캐릭터 말 걸기 메뉴 (행동·부탁) |
| `MakerAudio` | 사운드 참조(sound:/game:/assets) 재생, 그룹·노드 배경음 |
| `MakerHeroCode` / `GenSupport` | 사용자 코드로 만든 `gen/H_*`·`gen/I_*` 클래스의 바탕과 도우미 (§3.3.1) |
| `HeartUI` | 마음 창(`WndHeart`)과 하트 버튼 |
| `DefaultTerms` | 에디터 기본 용어 (tools/data/gen_terms_java.js 로 생성) |
| `TemplateRoom` / `TemplateSpecialRoom` | 방 템플릿을 자동 생성 층에 끼워 넣는 방 |
| `MakerTitle` | 타이틀 화면 (§3.7) — 배경은 메뉴 화면과 공용 `addBackground` |
| `MakerAssets` | 게임 그림 바꾸기(`assets/game/…` → TextureCache) · 메뉴 화면 배경·음악 맞추기 (§3.8) |
| `MakerCast` | 시전 엔진 — 대상 고르기·날아가는 효과·효과 목록 (주문·직업 능력·코덱스·폭주·원소 공용, §3.3) |
| `MakerSpells` | 주문서(HolyTome)·주문(ClericSpell)·주문 창(WndClericSpells) |
| `MakerAbilities` | 전직(HeroSubClass·TengusMask)·직업 능력(ArmorAbility·KingsCrown) |
| `MakerGauge` | 게이지·원소 버프 + 행동 버튼 (mod-2 NewOverHeat) |
| `MakerCodex` | 코덱스(mod-2 Codex)·그리모어 가방 (§3.4) |
| `MakerTalents` / `MakerTalentsPane` | 특성 포인트·효과 / 영웅 정보 창 특성 탭 |
| `MakerDialogue` | 대사창 (§3.9) — 아래 대사 상자·스탠딩 일러스트·이름표·▼·한 글자씩·선택지 |
| `MakerStage` | "일러스트 표시/숨김" 명령의 그림 층 (번호 1~8, 페이드) |

### 8.1 원본 코드에 넣는 연결점 (21개 파일, 줄 43개 — 자동 설치기가 추가/제거, ▶ 테스트 플레이 때 자동 갱신)

1. `Dungeon.init()`: `StoryState.reset()`, 그리고 `initHero(hero)` 뒤 `HeroRuntime.afterInit(hero)` (영웅·시작 층)
2. `Dungeon.newLevel()` 의 `level.create()` 앞: `MakerRuntime.createLevel(depth, branch)` 가 null 이 아니면 그 층으로 교체
3. 같은 곳 뒤: `LevelHooks.afterCreate(level)` (절차 생성 층에 오브젝트 주입)
4. `Dungeon.saveGame / loadGame`: `StoryState.store/restore(bundle)` (마음 상태 포함)
5. `GameScene.create()` 의 `fadeIn()` 뒤: `MakerRuntime.onFloorEnter()` (시작·입장 이벤트, 데일리)
6. `Level.occupyCell()`: `LevelHooks.onOccupy()` (이벤트 칸 밟기)
7. `InterlevelScene.create()`: `MakerRuntime.onFloorLeave()` (감정 결정화·일기·떠난 계단 기록)
- **구성 블럭** (자동 생성 층의 구성을 블럭을 쌓아 정함): `<노드>.procedural.blocks` (없으면 `<그룹>.blocks`, 둘 다 없으면 게임 기본 구성). 블럭 = `layout`(구조: auto·loop·figure8·line, 통로 default·none·long) · `feeling`(분위기) · `standard`/`special`/`secret`(무작위 방 min~max, 일반 방은 `big`) · `room`(방 템플릿/게임 기본 방, count·chance·cond). 런타임: `LevelHooks.addRooms` 가 입구·출구만 남기고 블럭대로 방 목록을 다시 채우고, `RegularLevel.build()` 의 `builder = builder();` 뒤 `LevelHooks.builder()` 가 구조·분위기를 적용. 방 위치·연결·내용은 게임 생성기가 매번 만듦. 편집기: 노드 속성·그룹 속성의 "구성 블럭" (`PDM.mapUtil.blockListEditor`). 예전 "절차 생성" 칸(크기 배율·일반/특수 방 수·몬스터 수·분위기)은 런타임에서 쓰이지 않던 값이라 없앰. BranchesBuilder 는 출구를 잇지 않아 쓰지 않음.
- **아이템 생성 코드의 폴더 = 분류/세부 종류**: `pdmaker/gen/items/<분류>/<세부 종류>/I_<id>.java` (패키지 `…pdmaker.gen.items.<분류>.<세부 종류>`, 이름 조각은 `codegen.pkgSeg` — 영문 소문자·숫자·_). 리소스 목록에서 아이템을 다른 분류로 옮기면 다음 코드 생성 때 파일이 새 폴더로 가고 package 줄도 바뀜 (예전 파일·빈 폴더는 설치기가 지움). 런타임은 생성된 `gen/GenIndex.java` 표(`GenSupport.loadIndex/cls`)로 클래스를 찾고, 예전 위치(`gen.I_<id>`) 세이브는 Bundle 별칭으로 읽음. 영웅(`H_<id>`)은 gen 바로 아래 그대로. 프로젝트의 `items/<id>.json` 은 옮기지 않음.
- **소리 칸의 다른 파일**: 소리 고르기(`ui.soundPicker`)에 📂(파일 고르기 — 프로젝트 밖이면 `assets/audio/` 로 복사) 와 "✎ 파일 경로 직접 입력…" 추가. 값은 프로젝트 기준 경로(`assets/audio/x.ogg`)로 저장 (런타임 `MakerAudio.resolve` 가 원래 경로 참조를 받음).
- **영웅 `dead` 애니메이션 (선택)**: `sprite.anims.dead` 가 있으면 `die` 가 끝난 뒤 이어서 반복 재생 (`HeroRuntime.applySprite` 가 스프라이트의 완료 알림을 가로채 `play(dead, true)` — CharSprite.play 는 die 중 무시하므로 force).
- **기준 게임 저장소 = `pd-maker/game/shattered-pixel-dungeon-master` (SPD 4.0.0)**: `main.js REPO_NAME`, `app.js REPO_NAMES` (없으면 예전 기준 `game/shattered-pixel-dungeon`). 예전 기준 저장소(같은 game 폴더의 `shattered-pixel-dungeon` · `-mod-2`)를 가리키는 프로젝트는 열 때 master 로 자동 변경 (`findRepo`). mod-2 저장소 연결과 시작 화면·메뉴의 "샘플 열기"는 없앰 (폴더는 남아 있음, exe·release zip 에도 안 넣음). `spd-items/chars/rooms(.previews).js` 는 4.0.0 기준으로 다시 만듦 — 방 172개 (금고 방 23개 = 금고 층 전용, 보기만).
- **맵 오브젝트** (`prop:<id>` → `props/<id>.json`, 편집기 `editors/prop.js`, 런타임 `MakerProp` = 게임 CustomTilemap 으로 층에 저장): 그림(sheet·frame·scale, 0 = 한 칸에 맞춤) · 상태 여러 개(frame 또는 frames+fps, solid, switch) · `pushable`(옆에서 누르면 반대쪽으로 한 칸, `goal{terrain,switch,event}`) · `interact` none/next/event(+event·loop·cond·sound) · `stepOn` none/next/event. 막힌 상태의 칸은 지형 CUSTOM_DECO(23), 아니면 원래 지형. 맵·방 템플릿 오브젝트 종류 `prop`. 연결 줄: `Hero.actMove` 맨 앞 `LevelHooks.propInteract`, 밟기는 `LevelHooks.onOccupy`. 코드에서 `MakerProp.setState(id, n)`.
- **UI 그림 · 맵 그림 페이지** (`editors/gameart.js`): `uiart` = 게임 interfaces 그림을 종류별 한글 이름으로 (고치기·바꾸기·원래대로 = assets/game 덮어쓰기), `mapart` = 사용자 테마 만들기·편집 + 게임 테마 타일셋·물·지형 그림.
- **픽셀 편집기**: 불투명도(0~100%, 칸을 그 색·투명도로 바꿈), 표시 배율 숫자 입력·프레임 하나에 맞춤·전체 맞춤, 모서리 ◢ 끌기, 다른 이름으로 저장. **아이템 `groundScale`**: 바닥에 놓였을 때 그림 배율 (`ItemSprite.link(Heap)` 연결 줄 → `MakerItem.heapScale`).
- **타이틀 화면 기본값 = 지금 게임 저장소의 타이틀**: `app.resolveRepo` 가 `PDM.gameTitle4` (저장소에 `assets/splashes/title/archs.png` 가 있음 = SPD 4.0 이상)를 정하고, `defaults.title(style)` 이 그에 맞춤 — 4.0: 버튼 순서 …news, settings, changes, about · `hideButton: true`, 그 전: …news, changes, settings, about. 손대지 않은 기본 타이틀은 `PDM.titleSyncDefaults()` 가 저장소에 맞게 자동으로 바꿈 (고친 타이틀은 그대로). 런타임 `MakerTitle`: 배경 "game" 은 타이틀에서 `ui.TitleBackground`(있으면, 리플렉션) → 없으면 Archs · `hideButton`(아래 화살표 — 로고·버튼 감추기, 기본 = TitleBackground 가 있을 때) · 지원 버튼 글자 노랑. 편집기 미리보기도 4.0 배경(아치 벽 + 떠오르는 폐허)을 흉내. 빠른 시작: "지금 게임 기본" · "예전 아치 모양".
- **영웅 해금 조건** `hero.unlock { mode: always|game|badge|global|cond, badge, key, cond, text }` (`HeroSelect.locked/lockText`; 정하지 않으면 원작 영웅 = game, 그 밖 = always). **전역 스위치**: 새 게임에도 남는 값 — 이벤트 명령 `global {key, value}`, 조건식 `global.<이름>` (`MakerDrops.global/setGlobal`, GameSettings 에 저장).
- **드랍 테이블 · 등장 금지** (`MakerDrops`): 아이템의 `drops [{ src: mob|floor, char, chance, min, max, depthMin, depthMax, groups, cond }]` (게임 아이템은 `gameitems.json` 의 `items["spd:…"].drops`), 캐릭터 `noGameLoot`(게임 원래 전리품 끔) · `noSpawn`(등장 금지) · `project.bannedMobs[]`(삭제한 원작 몬스터), 게임 아이템 `banned`(Generator 확률 0 — 무작위 생성에서만 빠짐). 연결 줄: `Mob.rollToDropLoot` 맨 앞 `MakerDrops.mobDrop`, `MobSpawner.getMobRotation` 의 shuffle 앞 `MakerDrops.filterMobs` (전부 금지하면 무시), 층 드랍은 `LevelHooks.afterCreate`.
- **드랍 테이블 화면** (`editors/loot.js`, 탭 `loot`, 런타임 `MakerDrops.chestLoot`/`roll`): 출처 쪽에서 편집. 캐릭터 `drops [{ item, chance, min, max, cond }]` (캐릭터 편집기 "등장 · 전리품"과 드랍 테이블 화면의 몬스터 표 — 아이템 쪽 `drops` 와 함께 적용). 상자류 `project.loot.<chest|locked|crystal|tomb|skeleton> { mode: add|replace, pick: each|one, rows: [{ item, chance, min, max, depthMin, depthMax, cond }] }` — each = 줄마다 확률, one = chance 를 가중치로 하나만. `LevelHooks.afterCreate` 에서 게임이 만든 상자에만 적용(직접 그린 맵 `MakerLevel` 제외, 오브젝트 배치보다 먼저). replace 는 unique·열쇠를 남기고, 아무것도 안 뽑히면 원래 내용물 유지. 맵 오브젝트 `item` 의 `container`(chest/locked/crystal/tomb/skeleton)로 직접 상자에 담아 놓기 (`MakerDrops.heapType`). 4.0.0 헤드리스에서 확인(`eval:droptest`), 실제 PDMaker 창은 미확인.
- **리소스 검색** (`app.js` `filterTree`/`drawTreeSearch`, `#treeSearch`): 이름 검색(항목·분류 이름, 분류 이름이 맞으면 그 아래 전부), 세부 검색(☰ — 분류 root · 세부 종류 group 으로 좁히기), 전체 체크(켜면 접힌 분류까지, 끄면 펼쳐 놓은 분류 안에서만). 드랍 확률은 0.1% 단위 (`F.num` 의 `dec`).
- **게임 저장소에 맞춘 목록** (`gamescan.js` `PDM.gameScan(repo, force)`, `app.resolveRepo` 에서 호출, `fs:walk`): 저장소의 `items` · `levels/rooms` · `actors/mobs` 를 훑어 묶여 있는 `SPD_ITEM_GROUPS`/`SPD_ROOMS` 에서 파일이 없는 것은 빼고, 저장소에만 있는 것은 소스(분류·`image`·`tier`·messages 이름)에서 읽어 덧붙임(`added`, 목록에 ＋). 캐릭터는 프로젝트 리소스라 지우지 않고 `game` 클래스 파일이 없으면 ⚠ 표시, 저장소에만 있는 몬스터는 캐릭터 › "게임 저장소에서 새로 찾음"에서 눌러 추가. 요약 `PDM.GAME_SCAN`, 프로젝트 설정에 "게임 저장소 다시 읽기". 웹 모드에서만 확인.
- **글자 연출 (APNG)** (`editors/textfx.js`, 탭·확장 기능 `textfx`, 데이터 `textfx.json { list: [{ id, name, text, font, size, color, color2, stroke, strokeW, glow, glowW, w, h, bg, inFx, inDur, hold, outFx, outDur, loopFx, loopDur, perChar, stagger, css, fps, loop, crop, apng, sheet }] }`): 설정으로 HTML(.stage › .wrap › .text › .line › .ch)과 CSS(@keyframes 프리셋 + 직접 쓴 CSS)를 만들고, 화면 밖 shadow DOM 에서 Web Animations 로 시간별로 멈춘 뒤 애니메이션이 바꾸는 속성의 계산값만 박아 SVG foreignObject → 캔버스로 프레임을 찍음. APNG 는 직접 조립(acTL/fcTL/fdAT, `CompressionStream('deflate')`) → `assets/fx/<id>.png`, 게임용 격자 시트 → `assets/fx/<id>_sheet.png` (`sheet { png, cols, frames, w, h, fps }`, 한 변 4096 까지). 게임은 APNG 를 못 읽으므로 시트를 씀: 런타임 `MakerTextFx.show(id, pos, 너비%, 반복, done)` (uiCamera 위 Image, LINEAR 필터), 이벤트 명령 `textfx { fx, pos, width, loops, nowait }`. 웹 모드 + 4.0.0 헤드리스(`eval:textfx,<id>`)에서 확인.
  - (2판) 확장: 탭 텍스트(서브 텍스트 · 세로쓰기 · 정렬 · 자동 줄바꿈 · 빈 줄 = 쪽 나누기 · 넘치면 축소) / 폰트(굵기·자간·행간 · 글꼴 파일 등록 `fontFile` → `assets/fonts`, @font-face data URL · 서브 폰트) / 움직임(표시 흐름 char·line·all·scroll, 등장 24종, 퇴장 18종, 표시 중 10종, 방향 · 시간차 · 순서 · 곡선 · 강도, 서브 등장, 앞뒤 공백) / 장식(프리셋 10종, 그라데이션 3색·방향, 테두리 · 바깥 테두리, 그림자, 광채, 노이즈 색) / 배경·배치(장식 틀 10종 + 등장, 배경 4종, 크기 프리셋, 3×3 배치 · 여백 · 미세 조정) / CSS. 템플릿 16종. 미리보기는 멈춘 애니메이션을 시각으로 돌려서(일시 정지 · 타임라인 · 배경 이미지). 내보내기: APNG(+게임용 시트) · PNG 정지 이미지 · 연번 PNG(ZIP, 무압축) · FPS · 루프(1회/무한/횟수) · 파일 이름 · 여백 자르기. 칸 기본값은 `DEF`, 예전 칸은 `norm()` 이 읽을 때 바꿈. 글자 겹: `.ch::before` 바깥 테두리 · `.chi::before` 테두리 · `.chi` 속 · `.chi::after` 그라데이션. 256색 저장 · 웹 글꼴 목록 · 입력 커서는 없음.
- **이펙트 · 파티클** (`editors/effect.js`, 탭·확장 기능 `effects`, 런타임 `MakerEffect`) — Defold ParticleFX 와 같은 구성. 데이터 `effects.json { list: [{ id, name, sound, emitters: [E], modifiers: [M] }] }`. E 이미터 `{ name, x, y, rot, mode once|loop, duration, delay, startOffset, space world|emitter, max, burst, type circle|box|cone, blend alpha|add|mult|screen, orient default|initial|movement, inheritVel, stretchVel, sprite { png, fw, fh, frames, fps, anim none|life|loop|random }, color, colorSp, 이미터 속성 {v, sp, pts}: rate sizeX sizeY life speed size alpha rot0 stretchX stretchY angVel, 수명 속성 {v, pts}: lScale lAlpha lRot lStretchX lStretchY lAngVel, lColor [[t,hex]], modifiers [M] }`, M `{ type accel|drag|radial|vortex, mag {v,sp,pts}, x, y, rot, maxDist }`. 곡선 pts 는 꺾은선(이미터 속성 = 이미터 진행 0~1, 수명 속성 = 알갱이 수명 0~1). 편집기: 이미터 탭, 값±퍼짐+곡선 편집기, 색 그라데이션, 알갱이 그림(고르기 · `editPixelsModal` 로 직접 그리기 · 기본 모양 7종을 `assets/fx/shapes/` 에 생성 · `game:` 경로), 미리보기(`Sim` — 런타임과 같은 계산, 끌어서 따라오게). 런타임: `Sys`(Group, GameScene 의 effects 층에 빈 Visual `host` 로 붙음) › `Em`(이미터별 Group, 블렌드) › `P`(Image). 반복 이미터는 맵에 놓았을 때(`Spot`, loopAll)만 반복하고 한 번 재생에서는 길이만큼만. 예전 한 겹 형식은 편집기가 프로젝트를 열 때 `migrate` 로 바꿈(저장 필요). 쓰는 곳: ① 맵 오브젝트 `effect` → `MakerEffect.Spot`(CustomTilemap, 시야 안에서만) ② 아이템 `fxUse`·`fxThrow`·`fxEquip`(영웅에 붙어서) ③ 이벤트 명령 `effect { fx, at: char|xy, target, x, y }`. 4.0.0 헤드리스에서 `eval:effect,<id>` · `eval:fxspot,<id>` · `eval:fxdump` 로 확인 (곱하기·스크린 블렌드, 프레임 애니메이션, 아이템 칸·이벤트 명령, 저장 후 불러오기는 게임에서 미확인).
- **게임 텍스트** (`editors/texts.js`, 탭 `texts`, 데이터 `texts.json { texts: { "<언어 코드>": { 키: 글자 }, "*": { 모든 언어 } } }`, 런타임 `MakerTexts`): 게임 저장소 `assets/messages/<분류>/<분류>[_언어].properties` 를 읽어 언어(저장소에 파일이 있는 것 — 게임 설정의 언어와 같음)·분류·검색·바꾼 것만으로 걸러 보여 주고, 줄마다 바꿀 글자를 적음(대상: 고른 언어만 / 모든 언어). 연결 줄: `Messages.getFromBundle` 맨 앞 `MakerTexts.get(key, lang)` (바꾼 글자가 있으면 그것, 서식 %s 는 그대로 채워짐). 4.0.0 헤드리스 타이틀 화면에서 확인.
- **확장 기능 기본값 · 리소스 목록**: 확장 기능(`story` 스토리 추가 · event · textfx · effects · sys · 캐릭터 칸 4종)은 `project.extensions[id] === true` 일 때만 켜짐 (새 프로젝트 `{}` · 설정이 없는 프로젝트 = 모두 꺼짐). 리소스 목록은 처음에 모두 접혀 있고 펼친 분류는 `localStorage pdmaker_tree_expanded` 에 기억.
- **몬스터 스폰 여부** : 노드를 만들 때(`world.js addNodeAsk` → `PDM.askSpawn`)와 방 템플릿을 만들 때(`map.js newRoom`) 묻고, 노드 인스펙터 · 방 속성의 "몬스터 스폰" 체크로 바꿈. 노드 `noMobs` (직접 그리기 맵은 `spawn.enabled` 도 함께): 런타임 `LevelHooks.afterCreate` 가 게임이 놓은 적 몬스터를 치우고 `MakerRuntime.onFloorEnter` 가 `MobSpawner` 를 뺌(4.0.0 헤드리스 확인: 적 8 → 0, 재생성기 1 → 0). 방 템플릿 `noMobs` (없으면 `keepClean` 을 따름): `TemplateRoom`/`TemplateSpecialRoom.canPlaceCharacter`. 맵 그래프: 아무것도 고르지 않고 Enter = 전체 보기(`fit`).
- **listOps** (`js/listops.js` `PDM.listOps`): `{ list: [{ id, name }] }` 꼴 리소스(이펙트 · 글자 연출)의 추가 · 복제 · 삭제 · id 바꾸기(쓰는 곳 — 이벤트 명령 `fx` · 맵 오브젝트 `ref` · 아이템 `fxUse` 등 — 도 함께 고침) · 순서. 리소스 목록의 하위 항목과 오른쪽 클릭 메뉴, 편집 화면 맨 위 도구 줄(`ops.bar`).
- **게임 이름 · 세이브 위치**: `project.game { appName, appPackageName }` (새 프로젝트 창에서 입력, 프로젝트 설정에서 수정). 테스트 플레이·게임 내보내기 때 `runtime-installer.js applyGameId` 가 게임 저장소 맨 위 `build.gradle` 의 `appName`·`appPackageName` 을 고침(처음에 `build.gradle.pdmaker-backup`). 데스크톱 세이브 폴더 = `%APPDATA%\.<패키지 둘째 마디>\<appName>\` 이라 원작과 갈라짐. appName 을 비웠고 저장소가 원작 이름이면 프로젝트 이름(영문) 또는 `PDMaker <폴더 이름>`. 테스트 플레이 빌드 기본값은 `debug`(gradle desktop:debug), `playtest` 는 선택.
- **다른 게임 저장소로 만든 프로젝트**: 직접 고른 저장소는 `project.gameRepoPinned` 로 표시해 기준 저장소(-master)로 자동 변경하지 않음. 새 프로젝트에서 저장소를 고르면 `PDM.gameSyncVanilla()`(gamescan.js) 가 방금 채운 원작 영웅·캐릭터를 그 저장소에 맞춤 — 없는 클래스는 빼고, 저장소에만 있는 몬스터(`newMobs`)·직업(`HeroClass.java` enum → `GAME_SCAN.heroes`)은 더함. 프로젝트 설정의 "영웅·캐릭터를 저장소에 맞추기" 버튼으로도 실행.
- **영웅의 게임 원래 설정 보기** (`gamehero.js` `PDM.gameHero(cls)` · `PDM.gameUsages(token)` · `PDM.gameHeroBox(c, kind, used, st)`): 바탕 직업이 있는 영웅의 시작 인벤토리 · 전직 · 직업 능력 · 특성 섹션 맨 위에 저장소 소스에서 읽은 값을 읽기 전용 상자로 보여 줌. `HeroClass.initHero`+`init직업()`(아이템 · 장착 · 개수 · 강화 · 퀵슬롯 · 감정만, 디버그 전용 따로), enum 의 `HeroSubClass`(아이콘 · 글자 · 전직 특성), `armorAbilities()`(능력 파일 전체 코드 · `baseChargeUse` · `talents()`), `Talent.initClassTalents`(단계별 · 최대 포인트 · 아이콘 칸 · 글자), 그리고 각 특성·전직이 코드에서 쓰이는 곳 검색(저장소 java 전체를 한 번 읽어 둠). 상자의 배지로 지금 게임이 그 값을 쓰는지 / 프로젝트 설정이 대신하는지 표시. 웹 모드에서만 확인.
- **"게임 원래" 대신 실제 값** (`gameinfo.js`, 도우미는 `PDM.gameSrc`): 저장소 소스에서 읽어 보여 줌 — 캐릭터 "게임 코드의 실제 값" 상자(`PDM.gameMob`/`gameMobBox`: 체력 · 피해 · 명중 · 회피 · 방어 · 경험치 · 속성 · 그림 · 전리품 · 코드, 부모 몬스터 값 이어받음), 드랍 테이블의 몬스터별 게임 전리품(`gameMobLoot`) · 상자류 설명과 `Heap.Type` 쓰는 곳(`gameHeapBox`), 맵 몬스터 스폰이 비었을 때 그 깊이의 `MobSpawner` 목록 · 희귀 몬스터 · 변종(`gameSpawnBox`), 구성 블럭이 비었을 때 지역 Level 의 방 수(`gameLevelBox`), 영웅 선택 글자 · 해금 글(`gameHeroText`), 아이템 · 캐릭터 소리의 실제 게임 소리 이름. 웹 모드에서만 확인.
- **맵 그래프의 네 방향 연결**: 노드 네 면(위 · 오른쪽 · 아래 · 왼쪽)에 연결 점. 끌기 시작한 면 → 놓은 쪽에서 가장 가까운 면에 붙고 `edge.fromSide`/`toSide`(`r l t b`, 없으면 두 노드 위치로 자동)에 저장 — 그림만 바뀌고 게임 동작(from → to)은 그대로. 연결 속성에서 방향(A→B / B→A)과 붙는 면을 고침. 뒤집으면 면 · 출구/입구도 함께 바뀜.
- **이벤트 트리거 · 명령 보강** (`EventTriggers.java`, `EventInterpreter`): 페이지 트리거 auto(조건이 맞으면 한 번) · parallel(매 턴) · floorEnter · turn(N 턴) · heart · itemPickup · mobKilled · bossDefeated 가 맵 오브젝트 없이 동작 — 층마다 넣는 보이지 않는 액터 `Ticker`, `HeroRuntime.onMobDie`, `MakerAudio.onItemPickup`, `MakerRuntime.onFloorEnter/Leave` 에서 호출(연결 줄 추가 없음). 활성 페이지 = 뒤에서부터 조건이 맞는 첫 페이지. 스토리 비트(노드에 들어오면 한 번) · 루트 자동 진입 조건도 여기서. 명령: 이동 경로(move, 길 찾아 걷기) · 순간 이동(teleport) · 동료 합류/이탈(party — `party:<id>` 플래그, 영웅을 따라다니고 층을 옮기면 옆에 다시 나옴, 조건식 `party.<id>`) · 게임 오버(부활 없는 사망) · 게임 클리어(victory → 랭킹) · 타이틀로(title) · 금화(gold) · 체력(hp) · 상태(buff) · 경험치/레벨/힘/최대 체력(exp) · 이름표/건너뛰기(label/jump) · 화면 어둡게/밝게(fade) · 변수 ÷ · 나머지 · 무작위 · 다른 값(`src`). 조건식 이름 추가: `turns` `hero.x` `hero.y` `hero.str` `hero.maxhp`. 플레이 테스트(원작 4.0 · 3.2.0 컴파일)로 확인.
- **타일셋 실시간 미리보기** (`levelpreview.js` · `spd-level-previews.js` · `pixel.js` 의 `onDraw`): 타일셋(256×256) · 물 그림을 픽셀 편집기로 열면 옆에 게임이 실제로 만든 층(테마마다 2개 표본)을 지금 그리는 그림으로 바로 그려 줌. 표본은 `tools/playtest` 의 `eval:godepth,<깊이>` + `eval:leveldump,<파일>,<테마>` 로 뽑은 것 — 지형과 함께 게임이 고른 타일 칸 번호(바닥 층 `tiles` · 벽 층 `walls`)를 담아서 벽 이어 붙이기 · 입체 벽 · 문 · 장식이 게임과 같음. 사용자 테마는 바탕 테마의 표본(`opts.tilePreview`).
- **동료와 자리 바꾸기** (`MakerNPC.interact`): 동료가 좁은 칸(둘레 8칸 중 지나갈 수 있는 칸 3개 이하 — 복도 · 문)에 있거나 영웅이 방금 걸어오던 중(`EventTriggers.heroWalking`)이면 자리를 바꾸고, 넓은 곳에서 멈춰 서서 누르면 말 걸기.
- **스프라이트(픽셀) 편집기 도구** (`pixel.js`): 브러쉬 크기(1~64, `[` 작게 · `]` 크게, 브러쉬와 지우개 크기는 따로 기억, 빨리 그어도 사이를 이음) · 최근 사용 색 8칸(`PDM._pixRecent`, 칠할 때 갱신) · 올가미(L) · 마법봉(W, 이어진 같은 색) · 사각 선택(M) · 선택에 더하기(Shift+조작) / 빼기(Alt+조작) · 브러쉬(B) · 지우개(E) · 채우기(G) · 스포이드(I) · Ctrl+Z / Ctrl+Shift+Z(또는 Ctrl+Y) · Ctrl+D 선택 해제 · Space+끌기 이동 · Z+끌기 확대(보기 창 가운데에서 바깥으로)/축소(안쪽으로). 선택은 사각형 또는 칸 단위 mask(`sel.mask`), 선택이 있으면 칠하기 · 채우기는 그 안에만. 단축키는 `e.code` 기준이라 한글 입력 상태에서도 동작.
- **스토리 스위치 · 변수 형식 / 이동 경로 설정**: 스위치에 `initial`(처음 상태 켬/끔 — `StoryState.reset` 에서 켬, 불러오기는 저장된 상태로 덮어씀). 변수 `type` = number | string | bool (`StoryState.varTypes` · 문자열은 `strs` 에 따로 저장, `varValue` 가 형식에 맞는 값). 명령 "변수": 문자열은 `text`(= 바꾸기 · += 뒤에 붙이기), 참/거짓은 1/0 · 뒤집기(`toggle`), "다른 값"(`src: ref`)도 형식에 맞게. 대사 · 알림 · 선택지 글의 `{이름}` 은 값으로 바뀜(`StoryState.expand` — `{var.id}` `{gold}` `{hero.lvl}` …). 명령 "이동 경로 설정"(move)은 RPG Maker 식 — `route: [{op, …}]` + `repeat` · `skip` · `wait` (`PDM.ROUTE_OPS`, 편집은 `commands.js` 의 `route` 입력칸: 왼쪽 목록 + 오른쪽 명령 버튼). op: 8방향 이동 · 무작위 · 영웅에게 다가가기/멀어지기 · 앞/뒤 한 걸음 · 뛰어넘기 · 칸으로 걸어가기(goto, 길 찾기) · 대기 · 방향(그림은 좌우만 뒤집힘) · 스위치 켜기/끄기 · 속도 · 방향 고정 · 통과 · 투명 · 불투명도 · 효과음. 예전 `path` 문자열은 goto 로 읽음. 같은 캐릭터에 새 경로를 주면 앞의 (반복) 경로는 멈춤.
- **이벤트 페이지 조립** (`event.js` · `EventInterpreter.pageOk/pageIndex` · `EventTriggers.placeEvent/showHidden` · `MakerNPC.actPageEvent`): 페이지마다 ① 출현 조건 `conds` {sw1, sw2, var + varMin, self, item, hero} (체크한 것 모두 + 조건식 `cond`) ② 이미지 `graphic.char` (캐릭터 그림) ③ 자율 이동 `move` {type fixed|random|approach|custom, route, repeat, skip, speed 1~6, freq 1~5} ④ 옵션 `opts` {dirFix, through} ⑤ 발동(trigger) ⑥ 실행 내용. 페이지 새로 만들기 · 복사하기 · 붙여넣기(`PDM._pageClip`, 다른 이벤트에도) · 삭제하기 · 비우기. 이미지가 있는 페이지를 가진 이벤트를 맵에 "이벤트" 오브젝트로 놓으면 그 캐릭터 그림의 `MakerNPC`(`pageEvent`)로 나타나 페이지의 자율 이동대로 움직이고, 말을 걸면(부딪히면) 실행 내용이 돌며, 페이지가 바뀌면 그림이 바뀌고 이미지 없는 페이지에서는 사라짐(자리는 플래그 `evhide:깊이:가지:칸:이벤트` 로 기억 → 다시 이미지 있는 페이지가 되면 나타남). 이미지가 하나도 없는 이벤트는 전처럼 보이지 않는 이벤트 칸. 우선권(아래/위)은 없음 — 나타난 이벤트는 캐릭터처럼 칸을 차지.
- **노드 합성기** (확장 기능 `compose` · `editors/compose.js` · `compose.json`): 노드를 이어 배경 타일 · 오브젝트 스프라이트를 만드는 그림 합성 도구 (1단계 — 정지 그림). 그래프 = { w, h, out, nodes[{id,type,x,y,p}], links[{from,to,port}] }, 노드마다 출력은 w×h 캔버스 한 장. 노드: 입력(그림 파일 · 직접 그리기 · 단색 · 그라데이션 · 노이즈 · 도형 · 무늬) / 변형(이동·회전·크기 · 줄여서 반복 · 뒤집기 · 픽셀화) / 색(색조·채도·밝기 · 밝기에 색 입히기 · 팔레트로 줄이기 · 색 바꾸기 · 반전 · 밝기로 자르기 · 외곽선 · 그림자) / 합성(겹치기 · 마스크) / 효과(흐림 · 빛 번짐) / 출력. 예시 그래프 4종(돌벽 · 바닥 타일 · 하늘 · 오브젝트). 미리보기는 고른 노드 또는 결과, "이어 붙여 보기"(3×3). 결과는 PNG 로 저장(`assets/compose/<id>.png` 또는 정한 경로) — 계산은 편집기에서만 하고 게임에는 PNG 만 들어감. `PDM.compose = { TYPES, evaluate, render }`. 2단계: 그래프에 `frames` · `fps` · `cols`, 숫자 칸에 식(`t` 0~1 · `frame` · `frames` · `pi` · sin/cos/abs/floor/min/max/rand — 허용한 이름만) → 프레임마다 계산(`evaluateAll`), 프레임이 여럿이면 스프라이트 시트(`toSheet`)로 저장 · APNG(`PDM.textfx.encodeApng`). 추가 노드: 시트의 한 칸 · 글자 · 파티클(한 바퀴가 끊김 없이 이어짐) · 여러 개 뿌리기 · 대칭 · 투명도 · 물결 · 밀어내기 · 넓히기/깎기 · 입체감. 예시: 분수 · 일렁이는 물. 연동: 결과를 오브젝트 그림(sprite.sheet + frame) · 아이템 그림(sprite.png) · 사용자 테마 타일셋의 칸에 바로 넣기, 픽셀 편집기 창의 "🧩 노드 합성기에서 편집"(`PDM.compose.fromImage` — 원본을 `assets/compose/src_*.png` 로 복사해 그림 노드에 넣고 저장 경로는 원래 파일). 그래프 Ctrl+휠 확대 · Delete 로 노드 삭제 · 재생/프레임 슬라이더.
- **아이템 소리 보강**: "사용할 때" 소리는 `Item.execute`(행동 버튼)에서만 났기 때문에 무기 공격에는 나지 않았음 → `KindOfWeapon.hitSound` 연결 줄(`MakerAudio.onWeaponHit`)로 그 무기의 공격이 맞을 때 "사용할 때" 소리를 게임 타격음 대신 냄. 새 칸 "떨어졌을 때 · 맞혔을 때"(프로젝트 아이템 `landSound` · 게임 아이템 `land`) — `Item.cast` 의 `onThrow` 직전 두 곳에 연결 줄(`onItemLandHit` · `onItemLandGround`). 던진 무기에 이 소리가 있으면 타격음은 한 번 건너뜀.
- **맵 편집기 크기·빈 칸** (`editors/map.js`): 맵 크기는 네 모서리 손잡이를 끌어 조절(`resizeRect` → `reshape`, Ctrl/Alt+끌기는 없앰), 점선 바깥에 펜·사각형·방 도구로 그리면 그 칸까지 넓어짐, 「✂ 그린 영역에 맞춰 자르기」(`trimToDrawn` — 가장자리가 지나갈 수 있는 칸·낭떠러지면 한 칸 여유). 타일 값 `-1` = **빈 칸(그리지 않음)** — 낭떠러지(`0`, CHASM)와 별개이며 새로 생긴 칸의 기본값, 런타임(`MakerLevel.build`·`TemplateRoom.paintTemplate`)에서 벽으로 바뀜. 팔레트에 「입구 놓기 / 출구 놓기」(개수 표시, 여러 개 가능 — 연결은 맵 그래프), 오브젝트 종류 버튼 · 맵 오브젝트 그림 목록 · 「새 맵 오브젝트 만들기」.
- **맵 편집기 확대·지우개·계단 편집** (`editors/map.js`): Ctrl+휠 확대/축소(`zoomStep`, 0.25~6배), Enter = 화면에 맞춤(`zoomFit`). 「⌫ 지우개」 도구(`ui.eraseKind`: 전부·벽·바닥·오브젝트·스폰 구역, 끌어서 지우고 한 번에 커밋)와 「맵 전체 지우기」(타일만 / 타일+오브젝트+스폰). 「⇱ 선택」으로 입구·출구 계단을 고르면(`ui.port` = 칸) 인스펙터에서 좌표 수정 · 삭제(Delete) · 이어질 맵 지정, 끌어서 이동. 맵 지정은 `assignPort` 가 world 의 통로(door) 연결의 `exit`/`entrance` 번호를 고정(없으면 통로를 새로 만듦). 계단 타일이 바뀌는 편집은 `withPorts` 가 고정된 번호를 같은 계단을 가리키도록 다시 맞춤.
- **투명 출구·입구 오브젝트 · 계단 연결 패널**: 오브젝트 종류 `exit` / `entrance` (`OBJECT_TYPES`, `nodeOnly` — 직접 그린 노드에서만). 그림 없이 그 칸을 계단처럼 쓰며, 에디터 `W_.tiles` 와 런타임 `WorldGraph.tiles` 가 계단 타일 뒤에(놓은 순서대로) 이 오브젝트 칸을 붙여 같은 번호 체계로 배정하고, `MakerLevel.build` 가 투명 입구의 전환을 만든다. 맵 편집기 `portPanel(cell, isExit)`: 계단 타일(펜으로 놓으면 바로 선택됨)·투명 오브젝트 공통으로 「이어질 맵(노드)」과 「그 맵의 짝 계단(도착 입구/출발 출구)」을 고름 — 통로(door) 연결의 `exit`/`entrance` 를 고정.
- **투명 발판 · 밟아서 넘어가는 투명 출입구**: 오브젝트 종류 `plate`(투명 발판, `ref` = 이벤트, `once`). `MakerLevel.createMobs` 가 `eventCells` 에 `"*"+id`(매번) / `"!"+id`(한 번만)로 넣고 `occupyCell` 에서 영웅이 밟으면 발동 방식 필터 없이 실행. 투명 출구·입구(`exit`/`entrance` 오브젝트)는 `occupyCell` 에서 영웅이 걸어서(`HeroAction.Move`) 밟으면 `activateTransition` — 도착 직후나 순간이동으로 놓였을 때는 넘어가지 않음 (`warpCells`).
- **맵 세부 그리기 · 맵 편집 단축키 · 출구 연결 고정**: 노드 데이터 `paint { image, enabled }` (기본 `assets/maps/<id>.png`, 칸당 16px). 맵 편집기 「🖌 맵 세부 그리기」(`ui.paintMode`)는 탭을 스프라이트 편집기만 있는 화면으로 바꿈 — 저장 · 다른 이름으로 저장 · 스프라이트 내보내기(`pdm.saveFile`) · 타일에서 다시 만들기. 런타임 `MakerPaint`(CustomTilemap, `MakerLevel.build` 가 `customTiles` 에 추가): 켜져 있으면 `tilesTex`/`waterTex` 가 투명 그림(`pdmaker:blank`)을 돌려줘 그린 그림만 보이고 지형 판정은 타일 그대로. 맵 편집 단축키는 스프라이트 편집과 같게: B 펜 · E 지우개 · G 채우기 · I 스포이드 · M 선택 · `[` `]` 브러쉬 크기(`ui.brush`, 펜·지우개) · Ctrl+D 선택 해제 · Space+끌기 이동 · Z+끌기 확대/축소. 출구 연결(main)도 `exit` 번호를 고정할 수 있음(`W_.ports` · `WorldGraph.ports` 의 mainTile). 투명 출입구의 연결 대상은 그래프에서 이미 연결된 노드만(`portPanel(..., linkedOnly)`).
- **이펙트 파티클 ↔ 노드 합성기 연동**: ① 합성기 → 이펙트: 「🎇 이펙트 알갱이로…」(`toEffect`)가 저장 후 이미터 `sprite`(png·fw·fh·frames·fps·anim)를 채움. 이후 합성기에서 저장할 때마다 `syncEffects` 가 그 파일을 쓰는 이미터의 프레임 설정을 맞추고 `PDM.effects.invalidate` 로 미리보기 캐시를 비움. ② 이펙트 → 합성기: 알갱이 그림 옆 「🧩 노드 합성기로…」(`PDM.compose.forEffect(fx, em)`) — 그 파일을 만드는 그래프가 있으면 열고, 그림이 있으면 그 그림에서, 없으면 흰 동그라미+빛 번짐 그래프를 새로 만들어 연결. ③ 합성기 노드 `effect`(입력 · 이펙트 (파티클)): `PDM.effects.bake(fx, {w,h,frames,fps,x,y,scale,warm,loop,seed})` 가 이펙트를 씨앗 난수로 프레임별 그림으로 구움(같은 값이면 같은 그림, 캐시) → 발광·흐림 등을 얹어 시트로 저장. 미리보기와 굽기는 `drawSim` 을 같이 씀.
- **화면 필터** (확장 기능 `filters`, `filters.json`, `editors/filter.js` · 런타임 `MakerFilter`): `{ list: [ { id, name, overUI, layers } ] }`. 층 종류 — `tint`(색·진하기·보통/더하기·깜빡임), `image`(그림을 화면 가득 반복: 진하기·배율·흐름 vx/vy·튐 jitter·시트 프레임 fw/frames/fps), `flash`(가끔 번쩍), `shake`(가끔 흔들림). 예시: 비·폭풍우·눈·안개·밤·노을·노이즈·주사선·글리치·위험. 기본 그림은 `assets/filters/*.png`(64×64, `makeTex`). 적용 우선순위: 이벤트 명령 `filter`(mode set/map/off → `StoryState` 문자열 `__filter`, 저장됨) → 영웅이 있는 방 템플릿의 `filter` → 맵 노드의 `filter` → 그룹의 `filter`. 런타임은 `onFloorEnter` 에서 UI 아래·위 두 개의 `Host` 를 붙이고 매 프레임 보여야 할 필터가 바뀌면 다시 만듦. 노드 합성기 연계: 그림 층의 「노드 합성기로…」(`PDM.compose.forFilter`), 합성기의 「화면 필터 층으로…」(`toFilter`), 저장 시 `syncFilters` 가 시트 프레임 설정을 맞춤.
- **화면 필터: 조리개 · 코드 층 · 늘려 덮기**: 층 `vignette`(color·alpha·size·soft·pulse — 런타임 `MakerFilter.Vignette` 가 64px 방사형 그림을 만들어 부드럽게 늘림), 그림 층 `fit: stretch`(한 장을 화면에 맞게 — `Stretch`), 층 `code`(lang js|css, code, w, h, frames, fps): 편집기 `bake()` 가 코드를 PNG 시트(`assets/filters/<id>_<n>_code.png`)로 구워 저장하고 런타임은 그림 층과 똑같이 다룸(게임에서 코드가 실행되지는 않음). JS 는 `new Function('g','w','h','t','frame','frames','rand', code)`, CSS 는 `.fx` 요소를 SVG foreignObject 로 찍으며 애니메이션은 `animation-delay:-t` + paused 로 프레임별 굽기. 예시: 조리개, 좁은 시야, 깨진 유리(JS), 찢김 글리치(JS 8프레임), 훑는 빛(CSS).
- **화면 필터 코드 층: 격자 시트 + APNG**: `bake()` 가 프레임(최대 120)을 한 변 2048 이하의 격자 시트로 저장(게임용 — 런타임 `frames()` 가 가로 칸 수 = 시트 너비 ÷ fw 로 읽음)하고, 여러 프레임이면 옆에 `<이름>_anim.png` APNG(미리 보기 · 공유용, `PDM.textfx.encodeApng`)도 저장. 「APNG 로 내보내기」(`exportApng`)는 프로젝트 밖으로. 게임은 APNG 를 읽지 않음(글자 연출과 같은 규칙).
- **화면 필터: 레터박스 · 나타남/사라짐**: 층 `letterbox`(color·alpha·size 띠 두께 %·side tb|lr). 필터마다 `inType`/`outType`(fade | dissolve | slide | none)와 `inSec`/`outSec`. 런타임 `Host` 는 필터가 바뀌면 보이던 `Shown` 을 `leave()` 시키고 새 `Shown` 을 추가(앞의 것은 사라지며 새것이 나타남), 층은 `Lay.trans(k, mode)` 로 반영 — dissolve 는 `Fill`(색 덮기 · 레터박스)이 16단계 점 무늬 텍스처(`dither`)로, slide 는 레터박스 띠 두께 × k, 그 밖의 층은 알파 × k. 화면이 새로 만들어졌을 뿐 같은 필터가 이어지면(`last`) 연출 없이 바로 보임. 편집기 미리보기의 「나타남 · 사라짐 미리보기」가 같은 계산(`ditherFill`)을 씀.
- **세로 화면(모바일) 점검**: 플레이 테스트 훅 `winsize,<가로>,<세로>`(창 크기 바꾸기)로 450×800 에서 화면 필터(색 덮기·그림·조리개·코드 층·레터박스 위아래/좌우·번쩍임·흔들림, UI 위/아래), 글자 연출, 이펙트, 대사창을 확인. 고친 것: 대사창이 뜰 때 UI 를 숨기는 `MakerDialogue.HudHider.sweep` 이 화면 필터(`MakerFilter.Host`)까지 숨기던 문제 → 필터는 대사 중에도 그대로.
- **예고편 컷신** (확장 기능 「글자 연출」에 포함, `trailers.json`, `editors/trailer.js` · 런타임 `MakerTrailer`): `{ list: [ { id, name, style(simple|band|frame), bg, bgAlpha, text, accent, skippable, fade, scenes } ] }`. 장면 — `title`(title·sub), `char`(chars 1~2명: char·image·name·line — 그림은 정한 그림 → 초상화 → 스프라이트 첫 칸, 이름·소개를 비우면 캐릭터의 이름·칭호), `copy`(text), `credit`(lines·date·countdown YYYY-MM-DD → D-n), 장면마다 `sec`. 이벤트 명령 `trailer { id, nowait }`. 영상이 아니라 런타임이 UI 카메라 위에 실시간으로 그림(글자는 게임 글꼴, 화면 폭에 따라 1~1.6배, 화면을 누르면 다음 장면). 리소스 목록에는 「글자 연출」 확장이 켜져 있을 때만 보임. 틀·배치는 자체 구현.
- **타일셋 배율 · 오브젝트 설치/표시 칸**: ① 사용자 테마 타일셋은 16×16칸이면 크기가 자유(가로 ÷ 16 = 한 칸 px). 「맵 그림 (타일셋)」의 배율(×0.25~×4) 「배율 적용」이 PNG 를 다시 만듦. 편집기(`assets.drawTerrain` · `levelpreview` · 맵의 타일 한 칸 편집 · 합성기 「타일셋 칸에」)는 한 칸 px 를 그림에서 읽음. 게임은 연결 줄 3개(`tiles/DungeonTilemap` 생성자 → `LevelHooks.hiresTiles` 가 `Tilemap.tileset` 을 큰 칸 필름으로 바꿈 — 화면의 한 칸은 그대로 16, `tileImg` 가 발견 연출 · 정보 창 타일 크기 맞춤). ② 맵 오브젝트: `foot [가로, 세로]`(설치 = 막히는 칸, 놓은 칸이 왼쪽 아래 · `unders` 로 칸마다 원래 지형 기억 · `pushable` 이면 여러 칸짜리도 누른 방향으로 통째로 한 칸 밀림 — `interact(h, dst)`), 새 오브젝트 창에서 id · 이름 · 「이동 가능 오브젝트」를 바로 정함, `sprite.scale`(0 = 설치 칸에 맞춤 · 1 = 그림 크기 그대로 → 설치 칸 위로 솟음), `sprite.ox/oy`, `sprite.over`(솟은 윗부분을 `MakerPropTop` 이 벽 층 customWalls 에 그려 뒤에 선 캐릭터를 가림 — `Vis.part/cut` 으로 위·아래를 나눠 그림).
- **맵 오브젝트 = 확장 기능 `prop`**: 새 프로젝트에서는 꺼져 있음(리소스 목록의 「맵 오브젝트」와 맵 편집기 「오브젝트 놓기」의 「맵 오브젝트」 종류가 숨겨짐 — `typeOn`). 이미 오브젝트가 있는 프로젝트는 불러올 때 값이 없으면 자동으로 켬. 꺼도 데이터와 게임 동작은 그대로, 맵에 이미 놓은 것이 있으면 그 맵의 팔레트에는 보임.
- **입장 문구 · 잠긴 맵** (스토리): `story.messages { start{text,window}, descend, back, groups{<그룹id>:{text,window}}, nodes[{node,text,window}] }` — 층에 들어올 때 기록에 나오는 글. `MakerTexts.get` 이 `scenes.gamescene.descend/return` 키를 가로채 `MakerRuntime.enterText` 를 부름 (우선순위: 첫 시작 → 맵 → 그룹 → 평소. `{depth}` · `{변수}` · window 면 `WndStory` 로도. 한 번 본 것은 `__startmsg`/`nodemsg_`/`grpmsg_` 플래그). `story.locks [{node, cond, message}]` — 그 맵으로 가는 모든 계단을 조건이 참이 될 때까지 막음: 연결 줄 `Level.activateTransition` 맨 앞 → `LevelHooks.lockedNode`.
- **소개 화면** (스토리 `story.intro { welcome, welcomeButton, vanilla, groups{<그룹id>:{text,image}} }`): ① 처음 켰을 때(WelcomeScene) 소개 글 = 메시지 키 `journal.document.intros.dungeon.body`, 버튼 = `scenes.titlescene.enter` 를 `MakerTexts.get` 이 바꿔 줌. ② 구역에 처음 들어갈 때의 로딩 화면(InterlevelScene): 연결 줄 2개 — `MakerRuntime.splash(loadingAsset)`(가는 맵의 그룹 그림을 `pdmaker:splash:` 텍스처로) · `storyGate(loadingDepth, lastRegion)`(게임의 "새로 온 5n+1층" 조건을 값으로 맞추거나 어긋나게 해서 글을 띄우거나 막음, 글은 `pendingStory` 를 `journal.document.intros.*.body` 로 돌려줌). 그룹을 본 표시는 `grpstory_<id>` 플래그(`onFloorEnter`). 내려가는 이동(DESCEND)에서만, 26층보다 깊으면 불가. `vanilla` 를 끄면 글을 비운 그룹은 글 없이 넘어감.
- **업적(배지) · 원래 글 표기 · 엔딩 화면**: 기본 기능(확장 아님) — `badges.json { list:[{id,name,desc,icon,trigger(manual/floorEnter/mobKilled/itemPickup/turn),cond,event,hidden}] }`, 런타임 `MakerBadges`(얻은 배지는 전역 `badge.<id>`, 이벤트 명령 `badge` · `badgeList`, 조건식 `badge.<id>`). 게임 원래 배지는 `Badges.java` + messages 에서 실제 이름 · 설명 · 그림 칸을 읽어 표로 보여 주고, 고친 이름 · 설명은 `texts.json` 의 `*` 에 저장, 그림은 `interfaces/badges.png` 를 고침; 원래 배지의 획득 조건은 Badges.java 의 실제 조건 줄 · 메서드 전체를 보여 주고 `badges.json` 의 `orig { 이름: { mode: off|custom, trigger, cond } }` 로 끄거나 내 조건식으로 대체 — 설치기 패치 1줄(`Badges.displayBadge` 첫 줄 `MakerBadges.blocked`), 대체 조건은 `MakerBadges.giveOrig`(리플렉션), 조건식 `stat.<Statistics 필드>` · `badge.<원래 배지 이름>` 추가. 배지 그림: 내 배지는 시트 칸(`icon`) 또는 따로 저장한 16×16 파일(`image`)을 쓰고, 칸 단위 그림 편집(저장 = 시트 칸 / 다른 이름으로 저장 = 새 파일) · 불러오기 지원. 얻는 조건은 조건 편집 칸(`condEditor`: 대상 · 비교 · 값을 고르는 줄 ↔ 식 직접 입력, 괄호나 &&·|| 혼합 식은 직접 입력만). 스토리 화면의 소개 · 입장 문구 칸은 '게임 원래 글'을 실제 문장과 실제 스플래시 그림으로 표기. `story.ending { text, exit, stay, surfaceExit }` 로 아뮬렛 화면 · 지상 화면 글을 덮어씀(`MakerTexts`).
- **맵 오브젝트 애니메이션**: 캐릭터 스프라이트와 같은 구성 — `sprite.anims { 이름: { frames, fps, loop } }`, 상태는 `anim` 으로 이름을 고름(없으면 `frame` 하나). 편집기: "그림" 섹션의 시트 아래 애니메이션 목록(72px 미리보기 · 프레임 번호 · fps · 반복 · 삭제 · "+ 새 애니메이션 추가"), 애니메이션을 고르고 시트를 누르면 프레임 추가. 예전 형식(상태의 frames/fps/anim: loop·once·pingpong)은 열 때 `sprite.anims` 로 자동 변환(왕복은 프레임을 펼침), 런타임은 두 형식 모두 읽음. `MakerProp.Vis`: 같은 애니메이션이면 밀기 · 새로 고침 때 이어서 재생, 반복 끔은 층에 들어올 때 다시 틀지 않음.
- **안전구역**: 맵 노드 · 방 템플릿의 `safe { on, hunger(허기가 쌓이지 않고 천천히 풀림), feed(들어올 때 허기 모두 풂), cure(해로운 상태이상 해제), heal(턴마다 체력 회복), msg(들어올 때 · 나갈 때 알림) }`. 런타임 `MakerSafe.tick`(매 턴, `EventTriggers.tick`) — 영웅이 있는 방 템플릿이 맵 노드보다 먼저. 조건식 `safe`(지금 안전구역 안인지). 용어 `safe.enter` · `safe.leave`.
- **퀘스트 · 상인 창**: 확장 기능 `quests`(기본 꺼짐) — `quests.json { list:[{ id, name, desc, giver, turnIn, cond, auto, repeat, remind, objectives:[{ type: kill|collect|reach|talk|cond, target, count, take, cond, text }], rewards:{ gold, exp, items }, acceptEvent, doneEvent }] }`, 런타임 `MakerQuests`(상태 = StoryState 변수 `quest.<id>` 0/1/3 · 목표 진행 `quest.<id>.<n>`; `MakerNPC.interact` 에서 보고 → 수주 → 진행 상황 순으로 창; 이벤트 명령 `quest`(offer/accept/complete/abandon/reset) · `questLog`; 조건식 `quest.<id>`(2 = 목표 달성) · `.active/.ready/.done`). 상인: 캐릭터(npc · companion)의 `shop { on, title, greet, items:[{ item, price(0 = 가치 × priceRate%), stock(-1 무제한) }], priceRate, sell, sellRate, direct }`, 런타임 `MakerShop.Wnd`(사기 / 팔기 탭, 스크롤 목록, 확인 창; 팔린 개수 = 변수 `shop.<char>.<n>`), 말을 걸면 다른 대화가 있을 때 "물건 보기 / 대화하기" 선택(`direct` 면 바로), 이벤트 명령 `shop`.
- **플레이어 스폰 위치**: 맵 오브젝트 종류 `start`(이름 "플레이어 스폰 위치") — `when: start`(게임을 시작할 때, 시작 맵에서 한 번) · `always`(이 맵에 들어올 때마다) · `from` + `from: <노드>`(그 맵에서 넘어올 때). 런타임 `LevelHooks.heroSpawn`(설치기 패치: `Dungeon.switchLevel` 첫 줄 — 입구가 없는 맵에서 게임이 `getTransition(null)` 로 멈추기 전에 자리를 정함; 스폰 · 입구 · 출구가 모두 없으면 `safePos` 로 가운데 근처 빈 칸). `start` 는 이번 판에서 처음 서는 맵에서 한 번(시작 맵이 아니어도). 혼합(hybrid) 노드는 오브젝트 좌표가 '직접 그린 방' 안의 좌표이므로, 층에 놓인 그 방(TemplateRoom `node:<id>`)의 left/top 만큼 옮겨서 계산(자동 생성 노드는 좌표가 없어 대상 아님) — 오르내리기(DESCEND/ASCEND)일 때만, 저장 불러오기 · 추락은 그대로. 우선순위 from > start > always.
- **NPC 이주**: 이벤트 명령 `relocate { char, node, x, y }`(맵을 비우면 사라짐) · 퀘스트의 `move { on, char(비우면 giver), node, x, y }`(완료 순간). 런타임 `MakerHomes` — 사는 곳을 StoryState 문자열 `home.<char>` = `노드|x|y` 로 기억, 맵에 들어올 때마다(`EventTriggers.onFloorEnter`) 사는 맵이면 그 칸에 세우고(없을 때만 · 자리가 다르면 옮김) 다른 맵에 남아 있는 그 캐릭터는 치움 → 이미 만들어진 맵에도 적용. 동료 중이면 이탈시킴. 혼합 맵 좌표는 `LevelHooks.nodeOffset`.
- **맵에서 칸 고르기**: `PDM.pickCell({ node, x, y, title })`(`cellpick.js`) — 맵 노드의 타일 · 놓인 오브젝트를 보면서 칸을 눌러 좌표를 정하는 창(맵 바꾸기 · 가리키는 칸의 타일/오브젝트 이름 · 지나갈 수 없는 칸 경고; 자동 생성 맵은 좌표 없음, 혼합 맵은 직접 그린 방). 이벤트 명령 매개변수 종류 `cell`(`yk`, `nodeKey`)로 NPC 이주 · 맵 이동 · 캐릭터 소환 · 순간 이동에 적용, 퀘스트의 "완료하면 NPC 이주"에도 버튼.
- **그림 편집기 영역 효과**: `pixel.js` 의 "✨ 영역 효과" — 고른 영역(사각 · 올가미 · 마법봉, 없으면 그림 전체) 안의 그려진 칸을 근원으로 발광(바깥 번짐) · 안쪽 발광 · 빛나는 영역 · 외곽선 · 그림자 · 밝기 조절. 색 · 번짐(px) · 세기 · "빈 칸에만" · 그림자 옮김. 미리보기는 `fx.base`(효과 전 그림)에서 매번 다시 계산하고 "적용"하면 되돌리기 한 단계(`fxCommit` — 다른 도구 · 저장 때 자동 적용). 효과는 PNG 픽셀로 구워짐(게임 실행 중에 움직이는 빛은 아님 — 프레임마다 세기를 달리해 애니메이션으로).
- **빛 레이어 (라이팅)**: 스프라이트 시트와 같은 이름의 `<시트>_light.png`(같은 크기 · 같은 프레임 배치)를 게임에서 그림 위에 덧셈 합성(`Blending.setLightMode`)으로 그림 — 맵 오브젝트(`MakerProp.Vis` · `MakerPropTop`)와 캐릭터(`MakerSprite.draw`). `sprite.lightPower`(%) · `lightPulse`(초 주기) · `lightPulseMin`(%) → `MakerRuntime.lightTexture / lightAmount / drawLight`. 편집기: `pixelEditor({ light })` 의 레이어 전환(그림 / 빛 레이어 — 두 캔버스 내용을 맞바꾸는 방식, 되돌리기 기록에 레이어 포함), 어두운 배경 + lighter 합성 미리보기, 영역 효과의 "빛 레이어에 넣기"(근원은 그림 레이어에서 찾고 결과는 빛 레이어에), `editPixelsModal(opts.light)` 가 _light.png 를 같이 열고 저장. 합성 방식 `sprite.lightMode`: add 발광(더하기) · screen · overlay · dodge — 편집기 미리보기는 캔버스 합성(lighter / screen / overlay / color-dodge), 런타임 `drawLight(light, amount, mode)` 는 GL 블렌드로 구현(screen = ONE_MINUS_DST_COLOR, ONE 정확 · dodge = DST_COLOR, ONE → 화면×(1+색) 근사 · overlay = DST_COLOR, SRC_COLOR → 화면×색×2 근사)하고, add 가 아닌 방식은 `lightTexture(sheet, mode)` 가 색을 미리 손본 텍스처(알파 곱 / 투명 = 회색)를 만듦. 그림 편집기 격자는 "픽셀 격자" · "칸 격자" 따로 켜고 끔.
- **브러쉬 합성 방식**: 그림 편집기 브러쉬에 합성 모드 — 보통 · 발광(더하기) · 발광 닷지(색상 닷지) · 스크린 · 오버레이 · 곱하기, "부드럽게"(가장자리로 갈수록 옅게) · "그려진 칸에만"(알파 잠금). `setPx` 가 긋기 전 그림(`stroke.base`)과 칸별 최대 덮임(`stroke.mask`)으로 다시 계산해서 한 번 긋는 동안 같은 칸이 겹쳐 칠해지지 않음. 결과는 픽셀로 구워짐(효과 레이어 위에 칠하면 게임에서 레이어 합성도 함께 적용).
- **타일 효과(빛) 레이어**: 사용자 테마 타일셋과 같은 이름의 `<타일셋>_light.png`(같은 칸 배치)를 지형 위에 겹쳐 그림 — 그 타일 종류 전체가 빛남(용암 · 수정 · 발광 이끼). 테마의 `lightMode / lightPower / lightPulse / lightPulseMin`. 런타임 `MakerTileLight`(CustomTilemap, `MakerRuntime.beforeScene` 에서 `ensure` 로 넣고 뺌; `LightMap extends DungeonTerrainTilemap` 이라 지형과 같은 규칙으로 칸마다 타일 번호를 고르고 텍스처만 효과 그림으로 바꿈, `instance` 는 리플렉션으로 되돌림, 0.2초마다 지형 변화를 확인해 갱신, 살펴보기 창에는 끼어들지 않음), 안개 아래에 그려짐. 합성은 `MakerRuntime.lightBlend`. 편집기: 타일셋 편집 3곳(`editPixelsModal` opts.light)에서 효과 레이어, 맵 화면의 사용자 테마 칸에 합성 방식 · 세기 · 깜빡임. 벽 윗면(raised) · 물 그림(흐르는 텍스처)은 대상 아님.
- **번짐(블룸) — 은은한 빛**: 효과 레이어를 가우시안으로 흐리게 한 그림을 칸(타일 · 프레임)보다 넓게 더해 그림. 설정 `lightBloom`(반경 px, 타일은 한 칸 16 기준) · `lightBloomPower`(%) — 오브젝트/캐릭터의 sprite, 사용자 테마. 런타임 `MakerBloom`(칸마다 여백을 둔 흐린 아틀라스를 낮은 해상도로 만들어 LINEAR 로 늘림, GL_ONE·GL_ONE 덧셈; `MakerProp.Vis` · `MakerSprite.draw` · `MakerTileLight.LightMap.draw`(보이는 칸만)). 번짐은 각 그림 바로 위에서 그림 (맨 위 빛 층으로 미뤘더니 자기 그림 · 윗부분(MakerPropTop)까지 하얗게 덮어서 되돌림). 편집기: 레이어 줄의 "번짐" 슬라이더(캔버스 blur 필터로 미리보기), 실시간 미리보기(`levelPreview.draw`)가 효과 레이어 · 합성 방식 · 번짐을 함께 그림.
- **광원 (점광원)**: 사용자가 준 GameMaker 조명 코드를 그대로 옮김. 감쇠식 `밝기 = k / (sqrt(d² + z²) − z)` (d = 거리 px, z = 높이 — 클수록 넓고 부드럽게, k = 세기; 범위 끝 값을 빼서 0 으로 떨어뜨림). 맵 오브젝트 종류 `light { color, k, z, range(칸), pulse, pulseMin, cond, shadow, charShadow }`(직접 그리기 · 혼합 노드, cond 는 0.5초마다 재검사) + 맵 오브젝트의 `light { on, color, k, z, range, ox, oy, pulse, pulseMin, shadow, charShadow }`(밀면 따라감) · 맵 오브젝트의 `castShadow`(막힌 상태일 때 다른 광원의 빛을 가림, 기본 켬).
  - **그리는 층**: 런타임 `MakerLights`(CustomTilemap, `beforeScene` 에서 ensure)는 **`customWalls` 맨 끝**에 들어가 벽 · 캐릭터 · 맵 오브젝트(윗부분 포함) 위, 안개 아래에 그려짐 — 빛이 캐릭터와 물건에도 덧셈으로 더해짐(예전처럼 바닥 층에 깔려 캐릭터 뒤에서 빛나지 않음). 그래서 `MakerSprite` 의 "가까운 광원 빛 받기"(litAt 로 한 번 더 그리기)는 없앰. 예전 세이브의 customTiles 쪽 MakerLights 는 ensure 가 지움. 영웅이 지금 못 보는 칸(`heroFOV`)은 빛 지도에서 0 으로 지움 — 다른 방 · 벽 너머 · 기억만 하는 칸에 빛이 남지 않음(예전 방식은 광원 칸이 안 보이면 그 광원을 건너뜀). 테스트 플레이(`-Dpdmaker.project`)에서는 처음 그릴 때 게임 로그에 층에 들어올 때 `[PDMaker] 광원 v4: 이 맵의 점광원 N개`(없으면 "점광원이 없습니다 — 광원 오브젝트나 광원 켜기로 생김"), 처음 그릴 때 `광원 v4: 빛 지도 + 그림자 볼륨` 을 한 번 보여 줌(런타임이 새것인지 확인용). 맵 오브젝트의 효과 레이어 · 번짐과 타일 효과 번짐도 영웅이 지금 보는 칸에서만 그림.
  - **밝기 곡선 · 얹는 방식**: 감쇠식 값(끝 값을 뺀 것)을 `1 − e^−x` 로 눌러 0~1 로 만듦 — 세기(k)를 높여도 가운데가 평평한 흰 덩어리가 되지 않고 멀어질수록 서서히 줄어듦(셰이더 · 예전 방식의 구운 그림 · `Lit.at` · 편집기 미리보기 모두 같음). 빛 지도는 화면에 `화면 × (1 + 빛)`(GL_DST_COLOR, GL_ONE) + `빛 × 0.3`(GL_ONE, GL_ONE · `GLOW`)으로 얹어서 맨 위에 있어도 캐릭터 · 물건 그림이 흰색에 묻히지 않음. 편집기는 반 세기 color-dodge + lighter 0.3 으로 흉내.
  - **그림자 (GameMaker shdShadow/shdLight 방식)**: 화면 크기(게임 1px 당 2px)의 광원 버퍼(`FrameBuffer`, 깊이 버퍼 포함)에 광원마다 ① 그림자 볼륨 — 빛을 가리는 상자(벽 칸 = `solid && losBlocking` 중 열린 칸과 맞닿은 칸, 막힌 맵 오브젝트 = 설치 칸에서 2px 안쪽)의 대각선 두 개를 광원 반대쪽으로 100000px 늘인 사각형을 깊이에만 씀(`Quad()` 와 같은 정점: z=1 인 점만 늘어남) ② 빛 — 범위 사각형에 감쇠식을 셰이더로 계산해 덧셈, 깊이 검사(GL_LESS)로 그림자 볼륨 뒤는 빠짐. 광원 i 의 빛 z = 0.9 − 0.008·i, 그림자 z = 빛 z − 0.004 (GameMaker 의 `_z--` · `u_z − 0.5`: 앞 광원의 그림자는 뒤 광원을 가리지 않으므로 깊이 버퍼는 한 프레임에 한 번만 지움). 광원이 벽 칸 안에 있으면 그 칸은 빼고 안쪽 벽도 모두 가림. 셰이더 `MakerLights.LightScript`(noosa `Script` — `Script.use` 로 바꿔 끼우므로 다음 그림은 NoosaScript 가 다시 잡음), 그린 뒤 뷰포트 · 가위 · 텍스처 바인딩(`Texture.clear`)을 되돌리고 버퍼를 화면에 GL_ONE·GL_ONE 으로 덧셈. 버퍼를 못 만드는 기기에서는 예전 방식(각도별 광선 240개 → 부채꼴 + 구운 빛 그림)으로 그림.
  - **캐릭터 그림자**(`charShadow`): 빛 반대쪽으로 늘어진 타원 그림을 같은 깊이 단계에 씀(알파 0.3 미만은 버림) → 그 광원의 빛만 빠짐. 캐릭터 몸 자리는 깊이를 되돌려(GL_ALWAYS, z 0.99) 자기 그림자에 덮이지 않음. 벽 그림자 볼륨은 그 뒤에 그려서 벽 그림자 속 캐릭터는 그대로 어두움. 광원에서 보이는지는 CPU 광선(`Reach` · `sees`)으로 판단.
  - **지형 광원** (`terrainLights` — 맵(노드) 속성, 없으면 그룹의 같은 칸): `[{ terrain(지형 번호), color, k, z, range, pulse, pulseMin }]` — 그 지형 칸마다 칸 가운데에서 같은 감쇠식의 빛 (발광 호수 · 용암 · 잿불). 칸이 많아서 그림자 볼륨은 쓰지 않고, 한 설정당 한 번에 그림(셰이더 `uMode 3`: 정점 zw = 칸 가운데, 깜빡임은 `uPulse(주기, 최저, 시간)` 에 칸 위치로 박자를 어긋나게 해서 일렁임). 못 보는 칸 지우기는 똑같이 적용. 직접 그린 칸 · 자동 생성 칸 모두 `Level.map` 으로 찾음. 예전 방식(광원 버퍼 없음)에서는 그리지 않음. 편집기: 맵 속성의 "지형 광원" 칸(지형 · `PDM.lightFields(…, { area: true })` — 그림자 칸 없음, 작은 호수 미리보기), 맵 그리기 화면에도 그 지형 칸마다 미리보기.
  - **자동 광원** (`autoLights` — 맵(노드) 속성, 없으면 그룹의 같은 칸): `[{ terrain, chance(%), max(0 = 제한 없음), spacing(칸), ox, oy, cond, + 광원 설정 }]` — 그 지형 칸에 겹치도록 **점광원**(그림자 있음)을 놓음. 자동 생성 · 혼합 층에서도 됨. 자리는 `MakerLights.autoCells`: 그 지형 칸을 `Dungeon.seedCurDepth()` 로 섞고 칸마다 확률 · 이미 고른 광원과의 거리(spacing) · 최대 개수로 고름 → 층 씨앗이 같으니 다시 들어오거나 불러와도 같은 자리(저장 안 함). 고른 자리는 광원 오브젝트와 같은 `Spot` 이 되어 cond(0.5초마다) · 깜빡임 · 그림자 모두 같음. 편집기: 맵 속성의 "자동 광원" 칸(놓을 지형 · 확률 · 최대 개수 · 최소 간격 · 위치 옮김 · 조건 + `PDM.lightFields`).
  - **편집기**: `PDM.lightFields` · `PDM.drawLightPreview(g, cx, cy, o, s, { block })`(cellpick.js) — 맵 그리기 화면에서 같은 감쇠 + 같은 그림자 볼륨(빛을 따로 그린 캔버스에서 destination-out 으로 지움)으로 미리보기. 빛을 가리는 지형은 `PDM.TERRAIN` 의 `blockLight`(벽 · 장식 벽 · 책장 · 문 · 잠긴 문 · 숨겨진 문 · 바리케이드), 막힌 맵 오브젝트는 시작 상태의 solid + `castShadow`. 맵 오브젝트 편집기의 "광원" 칸에 "그림자 드리움".
- **PDMaker 업데이트** (`editor/updater.js` · IPC `update:check`/`update:apply`/`update:restart` · `app.js checkUpdate`): 도움말 › "PDMaker 업데이트 확인…" 과 시작 4초 뒤 조용한 확인. GitHub `IceNight154/pd-maker` 의 main 과 비교. pd-maker 폴더가 그 저장소의 git 이면 `fetch` → `pull --ff-only`, 아니면 main ZIP 을 받아 덮어씀(`game/` · `editor/node_modules` · `.git` 은 그대로, 받은 커밋은 `.pdmaker-update.json`). pull 이 실패하면 ZIP 방식으로 넘어갈지 물음. 끝나면 `app.relaunch()`. 실행 파일로 묶은 판은 확인만.
- **타이틀 미리보기 크기**: 게임 화면 단위 = 창 크기 ÷ 배율(PC 3, 휴대폰 세로 8) → `SIZES` 427×267 · 640×360 · 135×292. 4.0 배경 겹의 크기·밝기·속도는 `ui/TitleBackground` 값, 버튼은 회색 반투명 틀 모양. (아이콘·실제 글꼴은 그리지 않음)
- **확장 기능의 편집 화면 칸**: `charPortrait`·`charHeart`·`charDialogue`·`charBehavior` — 체크해야 캐릭터 편집 화면에 그 칸이 보임 (extensions 가 아예 없는 예전 프로젝트는 모두 보임).
- **픽셀 편집기 영역 선택**: ⬚ 영역 선택 도구 (끌어서 선택, 빈 곳 클릭·Esc = 해제, 선택 안쪽을 끌면 옮김), Ctrl+C/X/V · Delete · Ctrl+A, 붙여넣은 그림은 끌어서 옮기고 Enter(또는 해제·저장)로 놓음. 클립보드는 편집 창끼리 공유 (`PDM._pixClip`).
- **방 템플릿 추가 기능**: `auto`·`autoChance`·`autoGroups` (자동 생성 — 켠 방은 `LevelHooks.addRooms` 가 모든 자동 생성 맵에 확률대로 넣음, 그룹 제한 가능, 이미 들어간 것은 중복 안 함. 새 방은 기본 켜짐) · `cat` (분류: `project.roomCats`, 순서 `project.roomOrder` — 리소스 목록에서 끌어 놓기) · 편집 화면: 빈 타일(낭떠러지 = CHASM 0) 버튼, 구역 색(벽 빨강·바닥 파랑·문 초록), Ctrl+끌기 = 공간 추가(끈 영역 바닥 + 둘레 벽이 되도록 맵을 넓힘)·Alt+끌기 = 공간 빼기(벽으로 메우고 벽만 남은 바깥 줄을 잘라냄), 테마 "자동"(방을 쓰는 그룹·노드의 테마), 타일 그림 편집(고른 타일 16×16 / 타일셋 전체 / PNG 불러오기 — 게임 기본 테마면 타일셋을 복사한 사용자 테마를 만들어 고침).
- `RegularLevel.initRooms()`: `LevelHooks.addRooms()` (방 템플릿), `GameScene.create()` 앞부분: `MakerRuntime.beforeScene()` (탑 모드 계단 그림)
8. `Hero.attackSkill/defenseSkill/damageRoll/drRoll/speed` 첫 줄: `if (HeroRuntime.wrap(n)) return HeroRuntime.x(this, …, x(…));` (원래 값을 계산한 뒤 영웅 코드/세부 능력치로 바꿈), `attackProc/defenseProc`: `damage = HeroRuntime.attackProc(this, enemy, damage);`
9. `Mob.die(cause)` 첫 줄: `HeroRuntime.onMobDie(this, cause)` (영웅 코드 onKill)
10. `WndHero.TalentsTab` 의 `pane = new TalentsPane(…)` 다음: `MakerTalentsPane.forHero()` 가 있으면 교체 (특성 탭 = 영웅 편집기의 전직·능력·주문·특성)
- `HeroClass.armorAbilities()` 첫 줄: `MakerAbilities.armorAbilities(this)` (왕관 → 영웅 편집기의 직업 능력), `TengusMask.execute` 의 WndChooseSubclass 앞: `MakerAbilities.chooseSubclass(this, hero)` (가면 → 전직), `Hero.className()` 첫 줄: 전직 이름
11. `Hero.talentPointsAvailable(tier)` 첫 줄: `MakerTalents.nativeOverride(tier)` (초상화 반짝임·남은 포인트 알림)
12. `TitleScene.create()` 의 `fadeIn()` 앞: `MakerTitle.apply(this)` (타이틀 화면)
- `PixelScene.create()` 의 `float minWidth, minHeight, scaleFactor;` 앞: `MakerAssets.onSceneCreate(this)` (게임 그림 바꾸기 · 메뉴 화면 배경·음악)
- `Item.execute(hero, action)` 첫 줄: `MakerAudio.onItemAction(this, action)` · `Item.doPickUp` 의 줍는 소리 앞: `if (!MakerAudio.onItemPickup(this))` (아이템마다 소리)
- `Item.image()` 첫 줄: `MakerAssets.itemImage(this)` (게임 아이템 그림 바꾸기) · `HeroSprite.updateArmor()` 첫 줄: `if (HeroRuntime.updateArmor(this)) return;` (영웅 시트 유지)
- `HeroSelectScene.create()` 의 직업 버튼 반복문 앞: `if (!HeroSelect.addButtons(this, heroBtns))` — 영웅 선택 화면에 게임 직업 대신 **프로젝트 영웅** 버튼(enabled 영웅 전부, `startHero` 가 있으면 그 영웅만, 영웅이 없으면 게임 그대로). 누르면 바탕 직업(`baseClass`, 비면 WARRIOR)으로 `setSelectedHero` 를 부른 뒤 이름·설명을 영웅 것으로, 원작 영웅(id = 직업 이름)이 아니면 배경 대신 영웅 그림을 크게. 고른 id 는 `HeroSelect.selected` → `HeroRuntime.pick` (같은 직업 바탕 영웅이 여럿이어도 구분). 원작 영웅은 원작처럼 잠금·직업 정보 창
- `Level.getTransition(type)` 첫 줄: `WorldGraph.pickArrival(this, type)` (통로 연결 — 짝 계단에 도착)
- `settings.gradle`(저장소 최상위) `include ':android'` 앞: 안드로이드 SDK(ANDROID_HOME · local.properties)가 없으면 android 모듈을 건너뜀 → SDK 없는 PC 에서도 데스크톱 테스트 플레이

**완전히 새 영웅** (`baseClass` 가 빈 값 — 새 영웅의 기본): 게임은 직업(HeroClass)이 꼭 있어야 해서 안에서는 WARRIOR 로 돌지만, `HeroRuntime.afterInit` 의 `stripClass` 가 직업이 준 것을 모두 걷어 냄 — 장비·가방·퀵슬롯, 감정해 둔 물약·주문서(`Potion/Scroll.handler.known` 에서 제거), 직업 특성(`hero.talents` 비움). 이후 영웅 편집기의 시작 아이템·`knownItems` 만 줌.
특성 창은 항상 영웅 편집기 것(`MakerTalents.replacesNative`), 텐구 가면은 전직이 없으면 "전직이 없다"(게임 전직 안 줌), 왕관 직업 능력은 없으면 빈 목록, 영웅 창 이름은 영웅 이름(`MakerAbilities.className`). 그림이 비었을 때만 전사 그림.
**캐릭터 선택 화면** (`heroes/<id>.json` 의 `select = { illust, fit: right|full, frameW, frameH, frames: "0,1,2", fps, icon }`): `HeroSelect.portrait` — illust 가 있으면 그 그림(프레임 크기를 정하면 `MovieClip` 애니메이션), `right` = 오른쪽 영역에 맞춤(160px 이하 도트는 정수 배), `full` = 화면 높이 가득 가운데(원작 일러스트처럼). 없으면 원작 영웅은 게임 일러스트, 새 영웅은 영웅 그림 첫 프레임을 크게. `icon` = 선택 버튼 아이콘(20px 안으로). 새 영웅은 이름 옆 정보 버튼이 영웅 설명 창(게임 버튼은 숨김).

**특수 기능은 코드로** (`Special`): 영웅 편집기에서 게이지·원소 데이터 편집 칸은 뺐음(예전 프로젝트에서 켜 둔 경우만 "예전 기능"으로 보이고 계속 동작). 영웅만의 시스템(게이지·스택·충전·자세)은 영웅 코드에서 `Special` 도구로 조합:
값 `Special.get/set/add(key, n[, min, max])`(Store 버프 — 저장됨), 버프 칸 표시 `Special.show(key, 이름, BuffIndicator 번호, 최대, 설명)` · `color` · `hide`(Bar 버프 — 아이콘 위 숫자, 최대가 있으면 차오름),
행동 버튼 `Special.button(id, 이름, HeroIcon 번호)` · `removeButton`(Btn 버프 — 누르면 영웅 코드 훅 `onAction(hero, id)`, 불러오면 버튼 복원). 코드 칸의 "특수 기능 만들기"에 예시 3개(과열식 게이지 · 연속 공격 스택 · 충전 행동 버튼)를 넣는 버튼. 생성 코드 import 에 `ui.BuffIndicator`·`ui.HeroIcon` 추가.

**항목별 코드** (전직·직업 능력·특성·패시브의 `code: { 훅: "Java" }`): 각 항목 편집 칸의 "코드 (세부 동작)". 훅 = `onGain`(전직할 때 · 왕관으로 고를 때 · 특성 포인트 올릴 때 · 패시브 열릴 때) · `onUse`(직업 능력을 쓸 때, 효과 뒤) · onTurn · onKill · onLevelUp · attackSkill · defenseSkill · damageRoll · drRoll · speed · attackProc · defenseProc.
codegen 이 영웅 코드 클래스(H_<id>)에 `_<kind><i>_<id>_<훅>` 메서드로 넣고, 영웅 훅 메서드에서 켜진 항목만 부름 — 조건: 전직 `MakerAbilities.subclassId()`, 능력 `abilityId()`, 특성 `HeroRuntime.talent(id) > 0`(본문에 `int points`), 패시브 `HeroRuntime.passive(id)`.
값 훅은 켜진 항목들 → 영웅 코드 순서로 값을 이어 받음. onGain/onUse 는 `kind:id` switch. 런타임: `HeroRuntime.gain(kind, id)`(MakerAbilities.choose · MakerTalents.upgrade · unlockPassives · Tracker 가 능력 바뀜 감지), `HeroRuntime.use("ability", id, hero, cell)`(MakerArmorAbility.activate). 훅 번호 GAIN 14 · USE 15.
값 훅 본문: 마지막 줄이 return 이 아니면 `return value;` 를 붙임(예전엔 중간에만 return 이 있으면 컴파일 오류).
**주문서 그림**: `spellbook.image` = 게임 아이템 번호 또는 "assets/items/…png"(아이템 시트에 붙여 씀 — MakerAssets.customItemRefs), 없으면 게임의 마스터리 책. 편집기는 F.icon(item 시트: 게임 그림 고르기 · 파일 지정 · 그리기).

**초상화** (영웅 편집기의 그림): `HeroSprite.avatar(hero)` 첫 줄 → `HeroRuntime.avatar` (상태 창 · 영웅 창 — 시트의 갑옷 단계 줄, idle 첫 프레임). 저장 슬롯은 어떤 영웅인지 기억: 저장할 때 `GamesInProgress.set(slot)` 첫 줄 `HeroRuntime.setSlot`, 파일에서 읽을 때 `Dungeon.preview` 뒤 `HeroRuntime.preview`(pdmaker_story 의 pdm_hero · pdm_subclass) → 시작 화면 슬롯(`StartScene` 의 `long diff = …` 앞)과 이어하기 창(`WndGameInProgress` 의 `title.label(` 앞)이 영웅 그림·이름(전직 이름 → 영웅 이름, 원작 영웅은 게임 그대로).

**영웅 순서** (`project.heroOrder`): 리소스 목록 영웅 줄의 ▲▼(마우스를 올리면 보임)·우클릭 "위로/아래로" → 게임 영웅 선택 화면의 버튼 순서(`HeroSelect.entries`). 새 프로젝트는 원작 순서.
**선택 화면 글자** (`select.title · desc · info`): 영웅 편집기 "캐릭터 선택 화면" — 이름(선택 화면·시작 버튼·저장 슬롯), 짧은 설명, 정보 창 설명. 비우면 영웅 이름·설명(원작 영웅은 게임 글자·직업 정보 창).
**테스트 플레이 빌드** (`project.settings.playTask`): 'playtest'(기본, init 스크립트의 desktop:pdmakerPlaytest — -PLAYTEST, 저장 폴더 분리) | 'debug'(게임 원래 desktop:debug — -INDEV, init 스크립트가 pdmaker.project 를 넘겨줌). 프로젝트 메뉴에 둘 다 바로 실행하는 항목.
**확장 기능** (도구 모음 "확장 기능"): 리소스 목록의 이벤트·시스템을 켜고 끔(`project.extensions.event · sys`, 없으면 켜짐 — 새 프로젝트는 꺼짐). 창에서 바로 열기·새로 만들기.
**아이템**: 새 아이템 창에서 id(소문자로 바뀌는 것을 바로 보여 줌 — 이름도 같은 값)·분류·세부 종류를 고름. 세부 종류는 기본 + `project.itemSubs[분류][키] = 이름`(null = 숨김, "세부 종류 관리…"). 티어는 무기·갑옷·코덱스는 수치의 tier, 그 밖은 `tier`(목록 정렬·표시). "코드 파일 보기"(게임 저장소의 gen 파일 — 없으면 만들 코드) · 게임 아이템은 "게임 코드 파일 보기"(items/…java).
모든 프로젝트 아이템에 클래스(gen/I_<id>)를 만들고(`itemNeedsClass` 항상), `MakerCatalog.register`(MakerRuntime.init 끝)가 아이템 도감 분류(무기·갑옷·물약·반지 …)에 올림(`catalog: false` 면 안 올림).
게임 아이템 목록(`spd-items.js`)은 기준 저장소(game/shattered-pixel-dungeon)의 이름·설명·그림 — mod-2 전용은 ◆(mod-2 저장소일 때만 보임). `PDM.isMod2()`(PDM.gameMod2) 가 아니면 코덱스·그리모어 분류·종류, 아리아 직업·전직, mod-2 소리·타이틀 프리셋·마나 입자를 목록에서 뺌.

**리소스 목록 끌어 놓기** (app.js drawTree): 노드의 `drag`(끄는 것) · `canDrop(끈 것)` → ['before','after','into'] · `drop(끈 것, 위치)`. 아이템 목록: 아이템을 다른 아이템 앞/뒤로(분류·세부 종류도 따라감 — `project.itemOrder`), 분류·세부 종류 줄에 놓으면 그 안으로, 분류 줄끼리(`project.itemCatOrder`)·세부 종류 줄끼리(`project.itemSubOrder[분류]`) 순서 바꾸기. 줄의 ▲▼·우클릭 "위로/아래로/다른 분류로 옮기기…"도 같음.
**다시 그릴 때 스크롤**: 탭을 다시 그릴 때 페이지 스크롤뿐 아니라 안쪽 스크롤 칸(.sheet-view 아이템 시트 고르기 등)의 위치도 되돌림 — 스프라이트를 누르면 위로 밀리던 문제.

**프로젝트 그림 텍스처**: `MakerRuntime.texture()` 는 캐시한 텍스처가 아직 `TextureCache` 에 있는지 확인 — 게임이 구역을 옮길 때(`InterlevelScene`) `TextureCache.clear()` 로 지우므로, 지워졌으면 다시 읽음(영웅 선택 화면에서 읽은 영웅 그림이 게임에서 검게 나오던 문제).

**게임 저장소 위치**: 기준은 `pd-maker/game/shattered-pixel-dungeon` (없으면 `game/shattered-pixel-dungeon-mod-2`, PDMaker 폴더만 옮겨도 동작). 새 프로젝트의 `gameRepo` 는 기준 저장소. mod-2 전용 게임 아이템(코덱스 등 ◆)은 프로젝트 저장소가 mod-2 일 때만 목록에 보임(`PDM.gameMod2`). 빌드 전 모듈 build.gradle 이 빠졌으면 원작 저장소에서 채움(`repairRepo`). 에디터가 경로가 틀린 프로젝트를 자동으로 고치고(PDMaker 안 → 전에 쓴 곳 → 위쪽 폴더), 바깥 저장소는 프로젝트 설정의 "PDMaker 폴더 안으로 옮기기"로 옮김. Java 17+ 가 없으면 Temurin 21 을 userData/jdk 에 내려받음. 배포 zip: `make-release.bat`.
13. (M1) `Hero` 피격·회복 지점: `HeartSystem.counter("heroLowHp")` 등 — 반응(Counter) 확장

추가한 줄에는 `// >>> pdmaker` 표시가 붙고 `runtime-installer.js --uninstall` 로 깨끗이 제거됩니다. 자세한 내용은 `runtime/INTEGRATION.md`.

### 8.2 exe 만들기

- 게임: `gradlew desktop:release` → `jpackage --type app-image` (JRE 포함 exe). 프로젝트 폴더를 `project/` 로 같이 넣음.
- 에디터: `electron-builder --win portable` → `PDMaker.exe`.

### 8.3 조건식 문법 (Cond)

```
식     := 비교 ( ("&&" | "||") 비교 )*   |  "!" 식  |  "(" 식 ")"
비교   := 값 ( "==" | "!=" | ">=" | "<=" | ">" | "<" ) 값  |  값
값     := 숫자 | '문자열' | true | false | 이름
이름   := switch.X | var.X | self.A | favor | trust | anger | abl.X | mark.X | exp.X | crystal.X | bond.X
        | hero.class | hero.id | hero.hp% | depth | node | group | choice.<노드> | visited.<노드> | route | item.X(개수) | char.<id>.favor …
```

대사 조건처럼 **캐릭터 문맥** 이 있으면 `favor` = 그 캐릭터 값, 아니면 `char.<id>.favor` 로 지정.

---

## 9. 개발 단계

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **M0 (완료)** | 설계서, 에디터 셸 + 6개 편집기 + 마음 시스템·용어·플러그인·레거시 흡수, 프로젝트 저장/불러오기/실행 취소, 검사(F7), 런타임(로더·Cond·StoryState·HeartSystem·EventInterpreter·MakerLevel·MakerNPC·MakerMob·MakerItem·LevelHooks·PluginHost) + 자동 설치기 | 에디터 동작 확인, SPD 3.2.0 에 설치해 전체 컴파일, JS/Java 마음 계산 일치 |
| M1 (진행 중) | ✓ 진행 방향 반전(탑 모드), ✓ 방 템플릿, ✓ 층 사이 맵(통과형·샛길형), ✓ 혼합 층 방 끼워 넣기, ✓ 맵 그래프(노드·연결·그룹, 5층 단위 폐지) — 던전 밖 맵·사이 맵·샛길·아이작식 갈림길을 모두 연결로 표현, ✓ 영웅 편집기(시작 인벤토리·전용 아이템·스킬·패시브), ✓ 마음 창(결정은 숫자만), ✓ 자동 생성 층에 장 테마 반영, ✓ 테스트 플레이 전 런타임 자동 설치, ✓ 실제 게임 자동 플레이 확인 / 남은 것: 이동 경로 명령, Hero 쪽 반응 연결, 영웅 선택 화면 표시, 장 소개 글 | 샘플: 1층 → 마을 → 2층 → 사이 맵 → 4층 갈림길 → 6층(잿불 회랑) |
| M2 | 일러스트/표정 창, 장면 타임라인, 층 입장 이벤트, 일기 | 스토리 장면 1개 재생 |
| M3 | 스토리 루트 → 장 테마 교체, 엔딩 3종 | 분기별 엔딩 도달 |
| M4 | 캐릭터 편집기: 애니메이션 편집·경로(스케줄), 반응(Counter) | NPC 가 경로 따라 움직이며 반응 |
| M5 | 레거시 코드 생성기 흡수 완료, 특성(Talent) 트리 데이터화, 아이템 데이터 구동 | 아리아의 특성까지 데이터로 정의 |
| M6 | 플러그인 런타임(jar), 이펙트 메이커 | 플러그인 명령으로 이펙트 재생 |
| M7 | exe 패키징 (에디터·게임) | 두 exe 배포 |
