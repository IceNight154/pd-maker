# 12차: 공개 파생작 불러오기 · 원본과 비교 · 다른 저장소 기능 가져오기

요청:
1. 소스가 공개된 다른 Pixel Dungeon 프로젝트(포크 · 많이 쓰이는 파생작)도 PDMaker 가 원본과 차이 없이 불러오고 편집할 수 있는지 확인
2. `game/` 안의 서로 다른 저장소의 서로 다른 기능을 찾아 가져올 수 있게 (예: ARK 의 계단 자동 이동 · Blue Archive 의 총기)

원칙은 11차와 같습니다.
- `game/` 의 저장소는 읽기만 합니다.
- 설치 · 제거 · 기능 넣기 시험은 임시 사본에서만 합니다.
- 실행하지 않은 것은 미검증으로 적습니다.
- 시험의 기대값을 느슨하게 하지 않습니다.

## 1. 확인한 저장소

GitHub API 가 이 환경에서 막혀 있어(별 수를 읽지 못함), 별 수를 직접 세지는 못했습니다. 그래서 Pixel Dungeon 커뮤니티에서 널리 알려진 공개 파생작을 골랐습니다. 저장소는 `git clone` 으로 `game/` 에 받았고, `.git/info/exclude` 로 PDMaker 저장소에는 들어가지 않게 했습니다.

| 저장소 | 커밋 | 패키지 · 구조 | gdx |
|---|---|---|---|
| shattered-pixel-dungeon-master (기준, 기존) | — | SPD | 1.14.0 |
| ARK_PD-main (Rogue Nights, 기존) | — | SPD 패키지 · Lombok | 1.13.5 |
| New-Blue-Archive-Pixel-Dungeon-main (기존) | — | SPD 패키지 · 글자 폴더 `new_messages` 추가 | 1.14.0 |
| Re-ARranged-Pixel-Dungeon (Hoto-Mocha) | 84f341d | SPD 패키지 · 안전 영역 API 없음 | 1.12.1 |
| Shorter-Pixel-Dungeon (TrashboxBobylev) | f343fd7 | SPD 패키지 · 안전 영역 API 없음 | 1.13.6-SNAPSHOT |
| rkpd2 (Zrp200) | 27ef1ee | **패키지 `com.zrp200.rkpd2`** | 1.12.1 |
| Rat-King-Adventure (TrashboxBobylev) | e14ac82 | **패키지 `com.zrp200.rkpd2`** | 1.14.0 |
| Experienced-Pixel-Dungeon-Redone (TrashboxBobylev) | 7a71df6 | **체력 · 피해 `long`** | 1.12.1 |
| Summoning-Pixel-Dungeon (TrashboxBobylev) | 5ac5fcd | SPD 2.5 이전 (`LevelTransition` 없음) | 1.10.0 |
| powered-pixel-dungeon (Smujb) | f93991c | 패키지 `com.shatteredpixel.yasd.general` · SPD 2.5 이전 | 1.9.10 |
| pixel-dungeon (watabou, 원작) | ca458a2 | `com.watabou.pixeldungeon` · **gradle 없는 Eclipse · Ant 프로젝트** | (내장 jar) |

## 2. 처음 상태 (고치기 전)

- **바로 됨** (설치 가능 · 연결 줄 모두 찾음): SPD · ARK · BA
- **분석은 되지만 런타임 설치 거부**:
  - rkpd2 · Rat King Adventure — "패키지를 바꾼 파생작은 지원하지 않습니다"
  - Experienced — "체력이 long"
  - Summoning · Powered — SPD 2.5 이전
- **분석 오류**: 원작 Pixel Dungeon — "Gradle 저장소를 찾지 못했습니다"
- **설치 가능하다고 했지만 실제 컴파일 실패**: Re-ARranged · Shorter
  - 런타임 `MakerDialogue` 가 쓰는 `PlatformSupport.INSET_ALL` 이 없음.
  - 클래스 단위 검사로는 드러나지 않던 멤버 단위 차이입니다.

## 3. 원본과의 비교 방법 (`tools/playtest/parity.sh`)

같은 저장소를 두 판으로 컴파일해 같은 단계로 실행하고 결과를 비교합니다.

**두 판**
- **PDMaker 판**: `repo-project.js` 로 만든 저장소 기준 프로젝트 + 런타임 설치.
- **원본 판**: `build.sh` 의 `PRISTINE=1`.
  - 복사본에서 PDMaker 연결 줄을 걷어 냅니다. 기준 SPD 처럼 저장소에 이미 연결 줄이 있는 경우를 위해서입니다 — 예전에는 이것 때문에 "원본" 판에서도 PDMaker 가 동작했습니다.
  - 검사 도구가 부르는 pdmaker 패키지만 넣습니다.

**실행 조건**
- 버전은 내보낸 게임과 같은 `-PLAYTEST` 입니다. 디버그(INDEV) 는 게임 동작을 바꾸므로 쓰지 않습니다.
- jar 는 그 저장소의 gdx 판에 맞춥니다. 1.12.x 는 1.12.1 jar 를 씁니다 — Experienced 의 `StringBuilder.appendLine` 이 1.13 에서 없어졌기 때문입니다.

**비교하는 것**
- 영웅 선택 아이콘 (클래스 · 텍스처 · 칸 · 그린 크기)
- 시작 층 (깊이 · 갈래 · 층 클래스 · 계단 종류)
- 영웅 그림 (텍스처 · 줄 · 크기 · 초상화)
- 화면 글자 (소개 · 층 입장 문구)
- 타이틀 그림 목록

**정규화** (판마다 달라도 되는 것)
- 무작위 층 모양에 따른 칸 번호
- 타이틀의 무작위 장식 크기 · 위치 (그림 종류 · 크기 · 텍스처만 모아 비교)
- 가만히 있는 동작의 몇째 칸인지
- 계단 목록 순서

검사 줄이 없으면 "실행 실패"로 표시합니다. 예전에는 둘 다 0줄이면 "같음"으로 보였습니다.

## 4. 찾은 문제와 고친 것 (구조 기반 — 특정 저장소 숫자를 박지 않음)

| 문제 | 원인 | 고친 것 |
|---|---|---|
| rkpd2 · RKA 설치 거부 | 설치기 · 적응기가 SPD 패키지 폴더 · 이름을 고정해서 씀 | `runtime-adapt.gamePackage` · `gameJavaDir` (Dungeon + levels/Level + actors/hero/Hero 가 함께 있는 패키지). 비교는 SPD 이름 기준, 사본 · 연결 줄 · 생성 코드는 마지막에 그 패키지 이름으로 (`toGamePkg`). `services/…` 연결 줄 파일 경로도. 편집기의 저장소 읽기(`gamescan` · `gamehero` · `gameinfo` · 아이템 · 배지 · 타이틀 미리보기 · 맵 그래프 코드 보기)는 `PDM.javaRoot(repo)` → `repo:javaRel`. APK 의 R8 keep 규칙도 그 패키지 |
| rkpd2 · RKA 컴파일 오류 | 런타임의 덮어쓰는 함수가 `protected`, 게임 쪽은 `public` (`RenderedTextBlock.layout()` · `MissileWeapon.onThrow`) · `WndChooseAbility` 생성자 인자 수가 다름 | `widenOverrides`: 그 형이 실제로 물려받는 게임 클래스 선언(상속을 따라 올라감)의 공개 범위로. `WndChooseAbility` 는 `//#if re:` 블록 |
| rkpd2 · RKA 연결 줄 5개 못 찾음 | 같은 기능의 코드 모양이 다름 | 대안 자리 추가 — `CharSprite.attack(int)` · `Gold.random()` 의 `Random.round(…IntRange)` · `Dungeon.IntRange` · 던지기 소리(`Item.this.detach(…).onThrow(cell)` 한 줄) · `if (HP < 0 && …) HP = 0;`. 모든 저장소에서 못 찾은 연결 줄 0 |
| Experienced 설치 거부 · 컴파일 오류 40개 | 체력 · 피해 · 수량 · 강화 수치가 `long` | 덮어쓰는 함수의 반환형 · 인자를 게임 선언에 맞춤 (`damageRoll()` · `drRoll()` · `attackProc(Char,long)` · `damage(long,Object)` · `Item.value()` · `proc` …). 런타임 소스는 체력을 int 로 읽는 곳에 `(int)` (SPD 에서도 같은 뜻). 연결 줄도 `(int)` · `(?:int|long)` 자리. 특성이 없는 게임은 특성 탭 연결 줄을 "해당 없음"으로 · 예전 판 저장 슬롯 자리 |
| Re-ARranged · Shorter · Experienced 컴파일 오류 | 안전 영역 API(`PlatformSupport.INSET_ALL`) 없음 | `//#if field:com.watabou.utils.PlatformSupport#INSET_ALL` (없으면 화면 전체). 검사 도구(Hooks · PlayTest)도 같은 방식으로 판마다 다른 API 를 조건 블록 · 반사로 |
| ARK · BA 영웅 선택 화면이 원본과 다름 | PDMaker 가 늘 자기 선택 화면(한 줄)을 띄움. ARK 원본은 6명씩 넘기는 화면, BA 원본은 감춘 직업 6개 | `HeroSelect.nativeLineup`: 프로젝트 영웅이 게임 직업 그대로(순서 · 이름 · 그림 · 설명 · 해금 · 선택 화면 글자를 고치지 않음, 저장소가 감춘 직업은 그대로 감춤)면 게임의 선택 화면을 씀. 영웅을 고치거나 더하면 PDMaker 선택 화면 |
| rkpd2 · RKA 영웅 7번째(RAT_KING)가 프로젝트에 없음 | 시험 환경(`editor-env.js`)에 `gameJavaRel` 이 없어 편집기가 SPD 폴더에서 HeroClass 를 찾음 (실제 편집기는 preload 에 있음) | 시험 환경에도 `gameJavaRel` |
| 원작 Pixel Dungeon 분석 오류 | gradle 이 없는 Eclipse · Ant 프로젝트 · `Assets.WARRIOR` 처럼 안쪽 클래스 없는 상수 | 분석기: `AndroidManifest.xml` + `src/` 를 저장소로 (모듈 하나 — src · assets · res). `javasrc.assets` 가 바깥 형 상수도 · `texture(Assets.X)` · `return Assets.X`. 적응기 `sourceRoots` 도 `src/` |

## 5. 결과 — 원본과 비교 (Linux · javac · Xvfb)

| 저장소 | 런타임 설치 | 컴파일 | PDMaker 판 = 원본 판 |
|---|---|---|---|
| shattered-pixel-dungeon-master | 됨 | 오류 0 | **같음** (12줄) |
| ARK_PD-main | 됨 | 오류 0 | **같음** (13줄) |
| New-Blue-Archive-Pixel-Dungeon-main | 됨 | 오류 0 | **같음** (17줄) |
| Re-ARranged-Pixel-Dungeon | 됨 | 오류 0 | **같음** (18줄) |
| Shorter-Pixel-Dungeon | 됨 | 오류 0 | **같음** (12줄) |
| rkpd2 | 됨 (패키지 이름 바꿈) | 오류 0 | **같음** (13줄) |
| Rat-King-Adventure | 됨 (패키지 이름 바꿈) | 오류 0 | **같음** (14줄) |
| Experienced-Pixel-Dungeon-Redone | 됨 (long 맞춤) | 오류 0 | **같음** (12줄) |
| Summoning-Pixel-Dungeon | 거부 (이유: SPD 2.5 이전) | — | 분석 · 탐색 · 프로젝트 만들기만 |
| powered-pixel-dungeon | 거부 (이유: SPD 2.5 이전) | — | 분석 · 탐색 · 프로젝트 만들기만 |
| pixel-dungeon (원작) | 거부 (이유: 원작 구조 · gradle 없음) | — | 분석 · 탐색 · 프로젝트 만들기만 (영웅 4 · 캐릭터 41 · 층 25 · 리소스 131/131) |

- 마지막 전체 실행 결과는 §11 에 붙였습니다.
- 비교한 범위는 §3 의 항목(타이틀 → 영웅 선택 → 첫 층) 입니다. 게임 전체를 끝까지 비교한 것은 아닙니다.

## 6. 다른 저장소 기능 가져오기

**화면**: 편집기 › 프로젝트 › 다른 저장소 기능 가져오기. 게임 저장소 탐색 화면의 버튼으로도 엽니다 (`renderer/js/editors/features.js`). 엔진은 `editor/repo-features.js` 입니다.

### 6-1. 찾기

가져올 저장소(`game/` 안의 다른 저장소)를 지금 게임 저장소와 클래스 · 멤버 단위로 비교합니다.
- 멤버 = 함수 · 필드 · enum 상수 하나하나 · 안쪽 형 · 초기화 블록.
- 이름은 SPD 패키지 기준으로 맞춰 비교하므로, 패키지 이름이 다른 저장소끼리도 비교됩니다.

결과는 세 종류입니다.
- **새 패키지**: 예) BA `items.weapon.melee.gun` 62개 클래스
- **새 클래스**
- **바뀐 · 새 멤버**: 예) ARK `actors.hero.Hero · handle(int)`

ARK ↔ SPD 는 바뀐 멤버가 수천 개입니다. 대부분 SPD 판 차이라서 찾기 칸으로 좁힙니다.

### 6-2. 필요한 것 (고르면 바로 미리보기)

source 에만 있는 것을 따라갑니다.
- 이름 · import · 같은 패키지로 쓰는 새 클래스는 통째로.
- 두 저장소에 다 있는 클래스는 source 에만 있는 멤버 중 코드가 쓰는 것만.

관계없는 것을 끌어오지 않도록 다음 규칙을 둡니다 (실제로 겪은 잘못 — 시험 있음).
- `.이름` 으로 부른 것은 target 에 그 이름이 아예 없을 때만.
  - 겪은 일: BA 총기가 `.image` · `.update` 때문에 `VaultFinalRoom` 문 클래스까지 끌어옴.
- 안쪽 형의 멤버는 그 형 이름을 코드가 쓸 때만.
  - 겪은 일: ARK `act()` 가 `buff` 라는 이름 때문에 `BuffIndicator.BuffIcon` 까지 끌어옴.
- 생성자는 `new X(…)` · `super(…)` · enum 상수 `NAME(…)` 의 인자 수가 맞을 때만.

함께 따라가는 것:
- 접근 범위만 넓힌 선언
- 새 필드 · 상수를 쓰는 초기화 블록 (`ItemSpriteSheet` 의 `static { assignItemRect(…) }`)
- 새 안쪽 형을 다루는 바뀐 함수 — 새 행동 `HeroAction.Descend` 를 처리하는 `Hero.act()`
- `Assets` 상수 · 리소스 파일 · 번역
  - 번역 키 = 클래스 경로 · 안쪽 형 · enum 상수.
  - BA 의 `new_messages` 처럼 모드가 더 쓰는 글자 폴더도 게임의 `messages` 로 옮깁니다.

**이름 겹침**: 새 안쪽 형이 그 파일이 이미 쓰는 클래스 이름과 같으면 알립니다. 넣으면 원래 코드가 다른 형을 가리키게 되기 때문입니다.

**바꾸는 멤버**는 따로 보여 줍니다. 이 게임의 원래 코드를 가져온 저장소의 것으로 바꾸는 멤버입니다.

### 6-3. 꾸러미 · 설치 · 제거

**꾸러미** — 프로젝트 `features/<id>/`
- `feature.json`:
  - 새 클래스 목록
  - 멤버 원문 · 바꾸기 전 해시 · source 에서 바로 앞 멤버
  - import
  - Assets 상수 · 번역 · 리소스
- `files/`: 클래스 원문 · 리소스. 원본 저장소가 없어도 다시 설치할 수 있습니다.

**설치** — 테스트 플레이 · 내보내기
- 설치기가 연결 줄보다 먼저 넣습니다.
- 새 멤버는 source 의 원래 순서대로 넣습니다 (정적 필드 앞쪽 참조 오류 방지).
- import 는 그 게임에 있는 것만 더합니다.
- 게임 쪽 그 멤버가 꾸러미를 만들 때와 다르면 덮어쓰지 않고 알립니다.

**제거 · 기능 끄기** → 바이트까지 원래 파일로 돌아갑니다.
- 새 파일은 `.pdmaker-feature-new` 표시로 지웁니다.
- 고친 파일은 `.pdmaker-feature-backup` 으로 되돌립니다.

**다시 설치**: 켠 기능의 서명(`pdmaker/features.sig`) 이 프로젝트와 다르면 다음 테스트 플레이 때 다시 설치합니다.

### 6-4. 확인한 것

| 확인 | 결과 |
|---|---|
| BA 총기 패키지 → SPD 임시 사본 (`feature-check.sh`) | 새 클래스 176 · 멤버 431 · 번역 3665줄 · 리소스 1 — **javac 컴파일 오류 0** · 뺀 뒤 원본과 **바이트까지 같음** |
| ARK 계단 `Hero.handle(int)` → SPD 임시 사본 | 멤버 12 (`handle` · `act` · `interrupt` 바꿈, `HeroAction.Descend/Ascend` · `actDescend/actAscend` · `Heap.priceOverride` · `InterlevelScene.Mode` 상수 … 더함) — **컴파일 오류 0** · 뺀 뒤 **바이트까지 같음** |
| 게임 안 동작 (헤드리스 SPD 3.3.8 판, eval `stairswithenemy`) | 영웅 옆에 몬스터를 두고 멀리 있는 아래 계단을 누름: **SPD 원본 `Move`** (적이 보이면 계단으로 가지 않음) → **ARK 계단을 가져온 SPD `Descend`** = **ARK 원본도 `Descend`** (가는 도중 적이 붙으면 셋 다 멈춤) |
| 설치기 (`repo-features.js` 시험) | 설치 때 기능 + 연결 줄 · 서명 기록 · 기능을 끄면 다시 설치가 필요하다고 판단 · 제거하면 바이트까지 원래대로 |
| 화면 (`ui-features.js`) | 저장소 고르기 → 비교 → 찾기 → 체크 → 함께 들어갈 것 → 가져오기 → 끄기 → 지우기, 밝음 · 어두움 · 좁은 화면 넘침 없음 · 페이지 오류 없음 |

### 6-5. 한계 (그대로 적음)

- **"기능"의 경계는 코드 의존 관계로 정합니다.**
  - BA 총기는 BA 영웅 · 특성과 얽혀 있어 클래스 176개(약 1.7만 줄)가 함께 들어갑니다.
  - BA 영웅 직업 상수(`HeroClass.SHIROKO` …)도 함께 들어갑니다.
  - 컴파일은 되지만, 총이 상점 · 드롭에 나오는지는 시험하지 않았습니다. 게임 안 동작은 미검증입니다.
- **바뀐 멤버는 그 저장소의 판으로 통째로 바뀝니다.**
  - ARK 계단을 가져오면 SPD 의 `Hero.act()` · `interrupt()` 가 ARK 판이 됩니다.
  - 화면에 "바꾸는 멤버" 로 보여 줍니다.
  - 함수 안 일부만 섞는 3-way 병합은 하지 않습니다. 공통 조상 판이 없어서입니다.
- **두 게임에 다 있는 리소스 파일은 가져오지 않습니다** (예: `items.png`).
  - 가져온 아이템의 그림 번호가 이 게임의 다른 그림을 가리킬 수 있습니다.
  - 아이템 편집기에서 그림을 바꿔야 합니다.
- **컴파일 확인은 이 환경의 javac 로 했습니다.** 편집기 안에서는 테스트 플레이(gradle) 때 확인됩니다.

## 7. 시험 명령과 결과

| 명령 | 결과 |
|---|---|
| `node tools/tests/run.js` | 60 통과 · 0 실패 |
| `node tools/tests/repo-compat.js` | 19 통과 · 0 실패 |
| `node tools/tests/repo-fidelity.js` | 23 통과 · 0 실패 |
| `node tools/tests/repo-features.js` (새로) | 12 통과 · 0 실패 |
| `NODE_PATH=$(npm root -g) node tools/tests/ui-features.js` (새로) | 5 통과 · 0 실패 |
| `NODE_PATH=$(npm root -g) node tools/tests/ui-repofidelity.js` | 10 통과 · 0 실패 |
| `NODE_PATH=$(npm root -g) node tools/tests/ui-editor.js` | 19 통과 · 0 실패 |
| `tools/playtest/parity.sh` × 8 저장소 | 8개 모두 같음 (§5 · §11) |
| `tools/playtest/feature-check.sh` (BA 총기 · ARK 계단) | 컴파일 오류 0 · 되돌림 바이트 같음 |

시험을 고친 것 (기대값을 느슨하게 하지 않음):
- `parity.sh` 는 검사 줄이 없으면 실패로 봅니다. 예전에는 "같음" 으로 보였습니다.
- 검사 도구의 새 eval 은 몬스터 클래스(`Rat`)를 박지 않고 `level.createMob()` 을 씁니다. ARK 에는 `Rat` 이 없습니다.

## 8. 검증하지 못한 것

- **gradle 빌드 · 실제 Electron 창 · Windows · 안드로이드 기기 · APK**
  - 이 환경에서 `dl.google.com` 이 막혀(403) 안드로이드 플러그인이 있는 gradle 빌드를 돌리지 못했습니다.
  - 모든 컴파일 · 실행은 javac + 데스크톱 lwjgl3 · Xvfb 입니다.
- **편집기 화면** — 웹 모드(Playwright) 에서 `pdm.feature*` 를 같은 Node 모듈에 이어서 확인했습니다. Electron IPC(`features:*`) 자체는 실행하지 않았습니다 (`node --check` 만).
- **가져온 총기의 게임 안 동작** (상점 · 드롭 · 쏘기) · 가져온 기능이 있는 프로젝트의 내보내기(JAR · APK)
- **별 수 기준 선정** — GitHub API 를 쓰지 못했습니다.

## 9. 남은 일

- 기능 가져오기에서 "함수 안 일부만" 가져오기. 공통 조상 판(그 모드가 바탕으로 한 SPD 판)을 받아 3-way 병합하는 방식이 필요합니다.
- 공유 리소스(아이템 시트) 칸을 새 시트로 옮기는 그림 가져오기.
- SPD 2.5 이전 파생작(Summoning · Powered) 의 런타임 지원. 층 이동 구조가 달라 맵 그래프 연결 줄을 새로 짜야 합니다.
- 원작 Pixel Dungeon 의 런타임 지원. gradle 이 없어 빌드 방법부터 필요합니다.

## 10. 바뀐 파일

**editor/**
- `runtime-adapt.js` — 게임 패키지 · 폴더 · 덮어쓰기 함수 모양 · Eclipse 소스 루트
- `runtime-installer.js` — 패키지 이름 바꾸기 · 대안 자리 · long · 거부 조건 · 기능 넣기/빼기 · 서명
- `repo-features.js` (새로)
- `repo-analyzer.js` — Eclipse 구조
- `main.js` — `repo:javaRel` · `features:*` · keep 규칙 · 생성 코드 위치
- `preload.js`
- `renderer/js/util.js` — `PDM.javaRoot`
- `renderer/js/javasrc.js` — 바깥 Assets 상수
- `renderer/js/gamescan.js` · `gamehero.js` · `app.js` · `repomaps.js` · `titlepreview.js`
- `renderer/js/editors/item.js` · `badges.js` · `repoexplorer.js` · `features.js` (새로)
- `renderer/css/app.css` · `renderer/index.html`

**runtime/** — `MakerDialogue` · `MakerAbilities` · `HeroSelect` · `EventInterpreter` · `MakerCharAI` · `MakerCodex` · `MakerCast` · `MakerBow` · `MakerCombat`

**tools/playtest/** — `build.sh` · `parity.sh` (새로) · `feature-check.sh` (새로) · `Hooks.java` · `PlayTest.java`

**tools/tests/** — `repo-features.js` (새로) · `ui-features.js` (새로) · `editor-env.js`

**문서** — `DESIGN.md` §17.3 · §19 · `runtime/INTEGRATION.md` · `docs/FOLDERS.md` · 이 문서

## 11. 마지막 전체 비교 실행 (커밋 직전)

커밋 직전 8개 저장소 연속 실행 (`par3`):

- **7개 같음**: SPD 12줄 · ARK 13 · BA 17 · Re-ARranged 18 · Shorter 12 · rkpd2 13 · RKA 14.
- **Experienced 는 타이틀 그림 목록 한 항목만 다름**: 원본 쪽에만 `Shrinking 1×1` 입자 하나.
  - 바로 다시 실행하니 **같음** (12줄) 이었습니다.
  - 이 입자는 ARK 에서도 한 번 원본 쪽에만 나왔다가 다음 실행에서 같아졌습니다.
  - 그래서 타이틀 화면 효과가 캡처 순간에 있었는지의 차이로 봅니다.
  - 다만 여러 번 돌려 확률로 확인한 것은 아니므로 "타이밍 차이로 추정" 으로 둡니다.
