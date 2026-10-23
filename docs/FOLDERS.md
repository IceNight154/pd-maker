# 폴더 구조 안내

## 1. `Pixel Dungeon modding` 폴더 전체

```
Pixel Dungeon modding/
├─ pd-maker/                  ← PDMaker (이 폴더). 에디터·런타임·샘플·도구·문서 + 게임 저장소(game/)가 모두 여기에 있음
│  └─ game/shattered-pixel-dungeon-master/   Shattered Pixel Dungeon 원작 (게임 저장소 — 테스트 플레이 때 pdmaker 런타임이 설치되는 곳)
├─ git-hub/
│  └─ shattered-pixel-dungeon/          원작 SPD 저장소 (참고)
├─ era/                      시스템 참고 자료
└─ Claude outputs/           이전 작업 결과 그림
```

게임 저장소는 **`pd-maker/game/shattered-pixel-dungeon-master`** 에 둡니다. 그래야 PDMaker 폴더만 다른 PC 로 옮겨도 테스트 플레이·게임 내보내기가 됩니다.
- 새 프로젝트는 `gameRepo` 를 비워 두면 에디터가 찾아 채웁니다. 예전 기준 저장소(`game/shattered-pixel-dungeon`)를 가리키던 프로젝트는 열 때 자동으로 바뀝니다.
- 프로젝트의 경로가 틀리면 에디터가 ① PDMaker 폴더 안의 game/ ② 전에 쓴 저장소 ③ 프로젝트 위쪽 폴더들을 찾아 고칩니다.
- 바깥에 있는 저장소는 프로젝트 설정 → "게임 저장소를 PDMaker 폴더 안으로 옮기기" 로 옮깁니다 (같은 드라이브면 통째로 이동, 아니면 복사).
- 다른 PC 에 필요한 것: Node.js(에디터 실행, `start-editor.bat` 가 Electron 을 내려받음) · 인터넷(처음 빌드 때 Gradle·라이브러리 내려받기).
  Java(JDK 17+)가 없으면 에디터가 Eclipse Temurin 21 을 내려받아 씁니다. 안드로이드 SDK 가 없으면 android 모듈은 건너뜁니다 (settings.gradle 연결 줄).
- **`make-release.bat`**: 옆에 `pd-maker-release.zip` 을 만듦 (game/ 포함, .git·build·.gradle·node_modules 제외) — 다른 사람에게 줄 때 이 zip 을 씁니다.

## 2. `pd-maker/`

| 폴더 | 내용 | 고칠 때 |
|---|---|---|
| `editor/` | 에디터(Electron) | 화면은 `renderer/js/editors/<편집기>.js`(저장소 분석 `repoanalysis.js` · 저장소 탐색 `repoexplorer.js`), 공용 부품은 `renderer/js/*.js`, 스타일은 `renderer/css/app.css`, 저장소 분석기 `repo-analyzer.js` |
| `editor/runtime-installer.js` | 게임 저장소에 런타임을 넣거나 빼는 스크립트. 저장소 구조에 맞춰 적응한 런타임을 복사하고 원본 코드에 연결 줄을 넣음 (목록 · 개수: DESIGN.md §17.2) | 새 연결 줄을 추가할 때 |
| `runtime/src/…/pdmaker/` | 게임 쪽 Java 패키지(53개 파일) | 게임 동작을 바꿀 때. 설치하면 게임 저장소로 복사됨 |
| `tools/sample/` | mod-2 기준 샘플 프로젝트(`sample-project/`, 저장소에는 없음)를 만드는 스크립트 | `python tools/sample/make_sample.py && node tools/sample/make_heart.js && node tools/sample/make_sounds.js && python tools/sample/make_portraits.py` |
| `tools/data/` | 게임 소스에서 에디터 데이터를 뽑는 스크립트 | `python tools/data/extract_spd_items.py [mod-2] [원작]` → `spd-items.js`, `node tools/data/gen_terms_java.js` → `DefaultTerms.java` |
| `tools/playtest/` | 자동 플레이 테스트(Linux 개발용). `repo-project.js` = 게임 저장소 기준 프로젝트 만들기(11차 — 편집기의 새 프로젝트와 같은 과정) | `tools/playtest/README.md` 참고 |
| `tools/tests/` | 회귀 · 저장소 · 화면 시험 (`run.js` · `repo-compat.js` · `repo-fidelity.js` · `ui-*.js`) | 설치 · 제거 시험은 임시 사본에서만 (원본 `game/` 저장소를 고치지 않음) |
| `game/` | 게임 저장소(기준 SPD · 파생작). **읽기 전용으로 다룸** — 편집기 · 분석기 · 탐색 화면은 읽기만, 테스트 플레이 런타임은 설치기가 넣고 뺌 | 직접 고치지 않음 (파생작 원본은 그 저장소의 것) |
| `references/` | 참고용 원본 코드(mod2-buffs: Brand·InkMark·Overheat) | 읽기만 함 |
| `docs/` | 이 안내 | |

## 3. 프로젝트 폴더

```
project.json  title.json  dialogue.json  terms.json
maps/world.json · maps/nodes/<노드>.json   rooms/<방>.json
heroes/<영웅>.json  characters/<캐릭터>.json  items/<아이템>.json  events/<이벤트>.json
story/story.json  heart/heart.json  audio/sounds.json
props/<오브젝트>.json  gameitems.json  texts.json  badges.json  (확장 기능: effects · filters · textfx · trailers · compose · quests .json)
assets/                                 ← 그림·소리 (아래 표준 폴더)
```

### 그림 표준 폴더 (`assets/` 아래)

| 폴더 | 넣는 것 | 에디터에서 새 그림을 고르면 |
|---|---|---|
| `sprites/heroes/` | 영웅 스프라이트 시트 | 영웅 편집기 → 스프라이트 시트 |
| `sprites/characters/npc/` · `companion/` · `monster/` · `boss/` | 캐릭터 시트(종류별) | 캐릭터 편집기 → 스프라이트 시트(캐릭터 종류에 따라) |
| `sprites/items/` | 아이템 PNG | 아이템 편집기 → PNG |
| `sprites/effects/` | 효과·입자 그림 | 그림 관리에서 가져오기 |
| `portraits/<캐릭터id>/` | 초상화·표정 | 캐릭터 편집기 → 초상화/표정 |
| `illustrations/` | 이벤트 그림·일러스트 | 이벤트 "그림 보이기" |
| `tiles/` | 사용자 테마 타일셋(256×256) | 맵 그래프 → 사용자 테마 |
| `title/` | 타이틀 레이어·로고·아치 그림 | 타이틀 화면 편집기 |
| `ui/` | 그 밖의 화면 그림 | 그림 관리에서 가져오기 |
| `game/<게임 경로>` | **게임 그림 바꾸기.** 예: `game/interfaces/title3.png`, `game/sprites/items.png` | 그림 관리 → 게임 그림 바꾸기, 타이틀 → 타이틀 스프라이트 |
| `audio/` | 소리 파일 | 사운드 편집기 |

- **🖼 그림 관리 → 🧹 자동 정리**를 누르면, 이미 쓰고 있는 그림이 위 폴더로 옮겨집니다. 쓰는 곳의 경로도 함께 고쳐지고 바로 저장됩니다.
- **게임 그림 바꾸기**
  - 게임(pdmaker 런타임)은 시작할 때와 화면이 바뀔 때마다 `assets/game/` 아래 PNG를 같은 이름의 게임 그림 대신 씁니다(`MakerAssets`).
  - 에디터 미리보기도 같은 규칙을 따릅니다.
  - 지우면 원래 그림으로 돌아갑니다.
