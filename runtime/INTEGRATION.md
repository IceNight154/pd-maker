# 게임 런타임 연결 방법

`runtime/src/.../pdmaker/` 패키지를 게임 저장소(`pd-maker/game/shattered-pixel-dungeon-mod-2`)에 넣고,
원본 코드 15개 파일에 **줄 32개를 추가**하면 에디터에서 만든 프로젝트가 게임에 반영됩니다.

## 자동 설치 (권장)

에디터의 **▶ 테스트 플레이**를 누르면 런타임이 없거나 예전 것일 때 자동으로 설치·갱신합니다.
직접 하려면 에디터 → **프로젝트 설정 → 게임 런타임 → 설치 / 업데이트**

또는 명령줄:

```
cd pd-maker\editor
node runtime-installer.js ..\game\shattered-pixel-dungeon-mod-2          (설치)
node runtime-installer.js ..\game\shattered-pixel-dungeon-mod-2 --uninstall   (제거)
```

- 원본 줄은 고치거나 지우지 않고 **추가만** 합니다. 추가한 줄 끝에는 `// >>> pdmaker` 표시가 붙습니다.
- 처음 설치할 때 바뀌는 파일은 `*.pdmaker-backup` 으로 백업하고, 제거하면 백업도 지웁니다.
- 에디터를 업데이트했다면 다시 **설치 / 업데이트** 를 누르세요. 패키지 파일을 덮어쓰고, 예전에 넣은 연결 줄은 지운 뒤 새 위치에 다시 넣습니다.

## 수동 설치 (자동 설치가 "위치를 찾지 못함" 이라고 할 때)

`P` = `com.shatteredpixel.shatteredpixeldungeon.pdmaker`

| 파일 | 위치 | 추가할 줄 |
|---|---|---|
| `settings.gradle` (저장소 최상위) | `include ':android'` 바로 앞 | `if ({ …ANDROID_HOME · local.properties 의 sdk.dir 이 있는지… }())` (안드로이드 SDK 가 없는 PC 에서는 android 모듈 건너뛰기) |
| `Dungeon.java` | `public static void init() {` 바로 다음 | `P.StoryState.reset();` |
| `Dungeon.java` | `init()` 의 `GamesInProgress.selectedClass.initHero( hero );` 바로 다음 | `P.HeroRuntime.afterInit(hero);` (영웅 편집기의 영웅 · 시작 층) |
| `Dungeon.java` | `newLevel()` 안의 `//dead end levels get cleared` 주석 바로 앞 (없으면 `level.create();` 앞) | `{ Level pdmLevel = P.MakerRuntime.createLevel(depth, branch); if (pdmLevel != null) level = pdmLevel; }` |
| `Dungeon.java` | 같은 `level.create();` 바로 다음 | `P.LevelHooks.afterCreate(level);` |
| `Dungeon.java` | `saveGame()` 의 `FileUtils.bundleToFile( GamesInProgress.gameFile(save), bundle);` 바로 앞 | `P.StoryState.store(bundle);` |
| `Dungeon.java` | `loadGame()` 의 `Bundle bundle = FileUtils.bundleFromFile( GamesInProgress.gameFile( save ) );` 바로 다음 | `P.StoryState.restore(bundle);` |
| `scenes/GameScene.java` | `create()` 앞부분의 `Dungeon.level.playLevelMusic();` 바로 다음 | `P.MakerRuntime.beforeScene();` (탑 모드 계단 그림) |
| `scenes/GameScene.java` | `create()` 끝부분의 `fadeIn();` 바로 다음 | `P.MakerRuntime.onFloorEnter();` |
| `levels/RegularLevel.java` | `initRooms()` 의 `return initRooms;` 바로 앞 | `P.LevelHooks.addRooms(this, initRooms);` (직접 만든 방 추가) |
| `levels/Level.java` | `public void occupyCell( Char ch ){` 바로 다음 | `P.LevelHooks.onOccupy(this, ch);` |
| `actors/hero/Hero.java` | `public int attackSkill( Char target ) {` 다음 | `if (P.HeroRuntime.wrap(1)) return P.HeroRuntime.attackSkill(this, target, attackSkill(target));` |
| `actors/hero/Hero.java` | `public int defenseSkill( Char enemy ) {` 다음 | `if (P.HeroRuntime.wrap(2)) return P.HeroRuntime.defenseSkill(this, enemy, defenseSkill(enemy));` |
| `actors/hero/Hero.java` | `public int damageRoll() {` 다음 | `if (P.HeroRuntime.wrap(3)) return P.HeroRuntime.damageRoll(this, damageRoll());` |
| `actors/hero/Hero.java` | `public int drRoll() {` 다음 | `if (P.HeroRuntime.wrap(4)) return P.HeroRuntime.drRoll(this, drRoll());` |
| `actors/hero/Hero.java` | `public float speed() {` 다음 | `if (P.HeroRuntime.wrap(5)) return P.HeroRuntime.speed(this, speed());` |
| `actors/hero/Hero.java` | `public int attackProc( final Char enemy, int damage ) {` 다음 | `damage = P.HeroRuntime.attackProc(this, enemy, damage);` |
| `actors/hero/Hero.java` | `public int defenseProc( Char enemy, int damage ) {` 다음 | `damage = P.HeroRuntime.defenseProc(this, enemy, damage);` |
| `actors/mobs/Mob.java` | `public void die( Object cause ) {` 다음 | `P.HeroRuntime.onMobDie(this, cause);` |
| `windows/WndHero.java` | `TalentsTab` 의 `pane = new TalentsPane(TalentButton.Mode.UPGRADE);` 바로 다음 | `{ TalentsPane pdmPane = P.MakerTalentsPane.forHero(); if (pdmPane != null) { pane.destroy(); pane = pdmPane; } }` (특성 탭 → 영웅 편집기의 스킬·특성) |
| `actors/hero/Hero.java` | `public int talentPointsAvailable(int tier){` 다음 | `{ int pdmT = P.MakerTalents.nativeOverride(tier); if (pdmT >= 0) return pdmT; }` |
| `actors/hero/HeroClass.java` | `public ArmorAbility[] armorAbilities(){` 다음 | `{ ArmorAbility[] pdmA = P.MakerAbilities.armorAbilities(this); if (pdmA != null) return pdmA; }` (왕관 → 영웅 편집기의 직업 능력) |
| `items/TengusMask.java` | `execute` 의 `GameScene.show( new WndChooseSubclass( this, hero ) );` 바로 앞 | `if (P.MakerAbilities.chooseSubclass(this, hero)) return;` (가면 → 전직) |
| `actors/hero/Hero.java` | `public String className() {` 다음 | `{ String pdmN = P.MakerAbilities.className(this); if (pdmN != null) return pdmN; }` (전직 이름) |
| `scenes/TitleScene.java` | `create()` 끝의 `fadeIn();` 바로 앞 | `P.MakerTitle.apply(this);` (타이틀 화면) |
| `scenes/PixelScene.java` | `create()` 의 `float minWidth, minHeight, scaleFactor;` 바로 앞 | `P.MakerAssets.onSceneCreate(this);` (게임 그림 바꾸기 · 메뉴 화면 배경·음악) |
| `items/Item.java` | `public int image() {` 다음 | `{ int pdmI = P.MakerAssets.itemImage(this); if (pdmI >= 0) return pdmI; }` (게임 아이템 그림 바꾸기) |
| `sprites/HeroSprite.java` | `public void updateArmor() {` 다음 | `if (P.HeroRuntime.updateArmor(this)) return;` (영웅 편집기 시트 — 갑옷을 바꿔도 그림·프레임 크기 유지) |
| `items/Item.java` | `public void execute( Hero hero, String action ) {` 다음 | `P.MakerAudio.onItemAction(this, action);` (아이템 소리: 사용·던지기·장착) |
| `items/Item.java` | `doPickUp` 의 `Sample.INSTANCE.play( Assets.Sounds.ITEM );` 바로 앞 | `if (!P.MakerAudio.onItemPickup(this))` (줍는 소리를 정했으면 원래 소리 대신) |
| `levels/Level.java` | `public LevelTransition getTransition(LevelTransition.Type type){` 다음 | `{ LevelTransition pdmT = P.WorldGraph.pickArrival(this, type); if (pdmT != null) return pdmT; }` (통로 연결: 짝 계단에 도착) |
| `scenes/InterlevelScene.java` | `create()` 의 `super.create();` 바로 다음 | `if (Dungeon.hero != null && (mode == Mode.DESCEND \|\| mode == Mode.ASCEND \|\| mode == Mode.FALL \|\| mode == Mode.RETURN)) P.MakerRuntime.onFloorLeave();` |

## 프로젝트 폴더를 찾는 순서

1. `-Dpdmaker.project=경로` — 에디터의 ▶ 테스트 플레이가 자동으로 넘겨줍니다.
2. 실행 폴더의 `project/` — 배포용 exe 옆에 프로젝트 폴더를 `project` 로 복사해 두면 됩니다.
3. 게임 assets 안의 `pdmaker-project/` — 안드로이드 등 내장 배포용.

프로젝트를 찾지 못하면 런타임은 아무것도 하지 않고, 게임은 원래대로 동작합니다.

## 지금 동작하는 것

| 기능 | 상태 |
|---|---|
| **맵 그래프**(maps/world.json + maps/nodes/): 노드마다 depth/branch 자동 계산, 직접 그린 노드(MakerLevel) · 자동 생성 노드(테마 생성기, 보스) · 혼합 노드 | ✓ |
| 연결: 출구 계단(main, 여러 개면 무게로 무작위 · 저장), 샛길 계단(stair, 조건 만족 시 생김 · 다시 검사), 입구 = 온 곳으로 돌아가기 / entranceTo | ✓ |
| 그룹: 테마 · 진행 방향(탑 모드) · 그룹 전체 추가 방 · 던전 밖(safe) | ✓ |
| 방 템플릿(그룹/노드의 추가 방), 사용자 테마 타일셋 | ✓ |
| 오브젝트: NPC(MakerNPC), 몬스터(MakerMob / `spd:Rat` 같은 게임 몬스터), 아이템(MakerItem), 이벤트 칸(밟으면 실행) | ✓ |
| 절차 생성 층에 오브젝트 넣기 (아무 방 / 입구 근처 / 출구 근처) | ✓ |
| NPC: 말 걸기 → 이벤트 / onInteract / 인사 대사, 경로 순찰, 공격받으면 반응 | ✓ |
| 이벤트 명령: 대사·선택지·대사 토픽·알림·조건 분기·반복·대기·커먼 이벤트·스위치·변수·셀프 스위치·마음 수치·행동 적용·기억·마음 창 열기·화면 흔들림·번쩍임·효과음/배경음·소환/제거·아이템 주기/빼기·타일 바꾸기·층 이동·루트·엔딩 | ✓ |
| 마음 시스템: 행동표, 성격 보정, 신뢰 상한, 분노/삐짐, 게이지→결정(마음의 결정), 흔적, 능력 자동 상승, 태도, 이정표 이벤트, 반응, 구상 대사, 일기, 선물하기 | ✓ |
| **마음 창**: 마음의 결정은 아이템이 아니라 숫자로만 존재. 화면 오른쪽 위 하트 버튼 / 이벤트 명령으로 열기 | ✓ |
| 스위치/변수/마음 상태/출구 선택/온 곳 기억/샛길 계단 위치/영웅 상태 저장·불러오기 | ✓ |
| **영웅 편집기의 영웅**: 바탕 직업, 체력/레벨당 체력/힘, 시작 골드, 시작 인벤토리(비우기·장착·퀵슬롯), 영웅 시트(갑옷 단계별 행), 전용 아이템(충전·재충전) + 데이터 스킬(피해·회복·보호막·상태 효과·밀쳐내기·순간 이동·소환·이벤트·마음 행동), 레벨별 패시브(최대 체력·힘·재생·골드·최대 충전) | ✓ |
| **영웅·아이템 코드**: 세부 능력치(명중·회피·레벨당·맨손 피해·속도·시야), 처음부터 아는 아이템, 영웅 코드 훅 12종 + 코드 스킬, 아이템 종류(근접·투척·갑옷 = 원본 클래스 상속) + 수치 + 코드 훅 + 행동 버튼 → `pdmaker/gen/*.java` 자동 생성·컴파일 | ✓ |
| **사운드**: sound:<id> 목록(audio/sounds.json), 맵 그룹·노드 배경음, 프로젝트 ogg/mp3/wav 재생(게임 음량 설정 따름) | ✓ |
| 영웅 이름/직업 선택 화면 표시, 특성(Talent) 트리 데이터화 | 다음 단계 (지금은 바탕 직업의 것) |
| **대사창**(아래 대사 상자 + 스탠딩 일러스트 + 이름표 + 한 글자씩 + 선택지), 일러스트 표시/숨김, 표정 바꾸기 | ✓ |
| 장면 타임라인 | M2 |
| 탑 모드의 로딩 문구, 장 소개 글(원본 하수도 소개가 나옴) | messages 직접 수정 / 다음 단계 |
| 이동 경로 명령, 동료 합류 | M1 / M4 |
| 게임 오버 명령, 엔딩 후 타이틀 복귀 | M3 |

## 검증

이 패키지는 SPD v3.2.0(mod-2 의 바탕 버전, versionCode 859) 소스에 설치해서 전체 컴파일을 확인했고,
실제 데스크톱 게임을 띄워(가상 화면) 샘플 프로젝트로 1층 → 마을 → 1층 → 2층 → 계단참 → 3층(비밀 서고 샛길, 조건을 만족한 뒤 생긴 잿불 갈림길 계단)
→ 4-2층 → 5-2층(도시 보스) → 2-2구역, 되돌아가기(같은 계단으로 도착), 2-1구역 3층의 무작위 출구, 저장→불러오기,
마음 창, 주문(불꽃 화살 → 피해·불붙음)·코덱스(그리모어 안에서 사용·내구)·전직(가면 창·게임 전직 효과)·직업 능력(왕관 창·직업 갑옷 충전)·과열(단계·원소·폭주)·저장/불러오기를 자동 플레이로 확인했습니다.
마음 시스템 계산은 에디터 시뮬레이터(heart-core.js)와 같은 결과가 나오는 것을 확인했습니다.
mod-2 는 원본에서 바뀐 파일이 있으므로, 설치 후 Android Studio 또는 에디터의 **프로젝트 → 게임 코드 컴파일 확인** 으로 한 번 더 확인하세요.
