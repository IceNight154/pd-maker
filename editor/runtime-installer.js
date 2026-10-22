// ================================================================
//  게임 런타임 설치기 — pdmaker 패키지를 게임 저장소에 넣고, 원본 코드에 연결 줄을 추가합니다 (목록: 아래 PATCHES · DESIGN.md §17.2).
//  · 지원하는 게임: Shattered Pixel Dungeon 계열 (패키지 com.shatteredpixel.shatteredpixeldungeon) — 확인한 판 SPD 2.5.4 · 3.0.2 · 3.3.8 · 4.0.0 · 4.0.2.
//    compat() 가 설치 전에 저장소를 살펴서 지원하지 않는 게임(원작 Pixel Dungeon · 패키지를 바꾼 파생작 · 체력이 long 인 파생작 …)은 이유와 함께 알려 줌.
//  · 추가한 줄에는 모두 "// >>> pdmaker" 표시가 붙어 있어서, 제거(uninstall)하면 깨끗이 되돌아갑니다.
//  · 원본 줄은 고치거나 지우지 않습니다 (줄을 "추가"만 함).
//  사용: node runtime-installer.js <게임저장소> [--uninstall]   또는 main.js 에서 require
// ================================================================
const fs = require('fs');
const path = require('path');

const PKG = 'com.shatteredpixel.shatteredpixeldungeon.pdmaker';
const adapt = require('./runtime-adapt');
const MARK = '// >>> pdmaker';
const JAVA_ROOT = ['core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon'];

/** anchor(정규식) 을 찾아 그 앞/뒤에 줄을 넣습니다. indent 는 anchor 줄의 들여쓰기를 따름 */
const PATCHES = [
  { file: 'Dungeon.java', name: '새 게임 시작 시 스토리 초기화',
    anchor: /public static void init\(\)\s*\{[^\n]*\n/, where: 'after', line: `${PKG}.StoryState.reset();` },
  { file: 'Dungeon.java', name: '영웅 편집기의 영웅 적용 (시작 아이템·주문서·능력치) · 시작 층',
    anchor: /\n([ \t]*)GamesInProgress\.selectedClass\.initHero\(\s*hero\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.HeroRuntime.afterInit(hero);` },
  { file: 'Dungeon.java', name: '직접 그린 층 · 층 사이 맵으로 바꾸기',
    // 층 기록(generatedLevels) 전에 바꿔야 사이 맵이 "생성된 층"으로 기억됨. 못 찾으면 level.create() 앞
    anchor: [/\n([ \t]*)\/\/dead end levels get cleared/, /\n([ \t]*)level\.create\(\);/], where: 'before',
    line: `{ Level pdmLevel = ${PKG}.MakerRuntime.createLevel(depth, branch); if (pdmLevel != null) level = pdmLevel; }` },
  { file: 'Dungeon.java', name: '절차 생성 층에 오브젝트 넣기',
    anchor: /\n([ \t]*)level\.create\(\);[^\n]*\n/, where: 'after', line: `${PKG}.LevelHooks.afterCreate(level);` },
  { file: 'Dungeon.java', name: '저장',
    anchor: /\n([ \t]*)FileUtils\.bundleToFile\(\s*GamesInProgress\.gameFile\(\s*save\s*\),\s*bundle\s*\);/, where: 'before', line: `${PKG}.StoryState.store(bundle);` },
  { file: 'Dungeon.java', name: '불러오기',
    anchor: /\n([ \t]*)Bundle bundle = FileUtils\.bundleFromFile\(\s*GamesInProgress\.gameFile\(\s*save\s*\)\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.StoryState.restore(bundle);` },
  { file: 'messages/Messages.java', name: '게임 글자 바꾸기 (texts.json)',
    anchor: /private static String getFromBundle\(\s*String key\s*\)\s*\{[^\n]*\n/, where: 'after', line: `{ String pdmT = ${PKG}.MakerTexts.get(key, lang); if (pdmT != null) return pdmT; }` },
  { file: 'scenes/GameScene.java', name: '층 입장 이벤트',
    anchor: /\n([ \t]*)fadeIn\(\);[^\n]*\n/, where: 'after', line: `${PKG}.MakerRuntime.onFloorEnter();` },
  { file: 'levels/RegularLevel.java', name: '자동 생성 층에 직접 만든 방 추가',
    anchor: /\n([ \t]*)return initRooms;/, where: 'before', line: `${PKG}.LevelHooks.addRooms(this, initRooms);` },
  { file: 'levels/RegularLevel.java', name: '구성 블럭: 층 구조·분위기',
    anchor: /\n([ \t]*)builder = builder\(\);[^\n]*\n/, where: 'after', line: `builder = ${PKG}.LevelHooks.builder(this, builder);` },
  { file: 'scenes/GameScene.java', name: '진행 방향(탑 모드) 계단 그림',
    // 11차: 음악 고르는 함수가 없는 판(예전 SPD · 파생작)은 create() 의 super.create() 바로 다음 (지형을 그리기 전)
    anchor: [/\n([ \t]*)Dungeon\.level\.playLevelMusic\(\);[^\n]*\n/, /public void create\(\)\s*\{[\s\S]*?\n([ \t]*)super\.create\(\);[^\n]*\n/], where: 'after', line: `${PKG}.MakerRuntime.beforeScene();` },
  { file: 'scenes/InterlevelScene.java', name: '소개 화면: 로딩 배경 그림',
    anchor: [/\n([ \t]*)background = new Image\(\s*loadingAsset\s*\);/, /\n([ \t]*)[\w.<>]+ \w+ = new \w+\([^;\n]*\bloadingAsset\b/], where: 'before', line: `loadingAsset = ${PKG}.MakerRuntime.splash(loadingAsset);` },
  { file: 'scenes/InterlevelScene.java', name: '소개 화면: 구역 이야기 글',
    needs: /\blastRegion\b/, anchor: /\n([ \t]*)if \(mode == Mode\.DESCEND && lastRegion <= 5/, where: 'before', line: `{ int[] pdmS = ${PKG}.MakerRuntime.storyGate(loadingDepth, lastRegion); loadingDepth = pdmS[0]; lastRegion = pdmS[1]; }` },
  { file: 'Dungeon.java', name: '플레이어 스폰 위치 (맵에 놓은 시작 위치 오브젝트)',
    anchor: /public static void switchLevel\(\s*final Level level,\s*int pos\s*\)\s*\{[^\n]*\n/, where: 'after', line: `pos = ${PKG}.LevelHooks.heroSpawn(level, pos);` },
  { file: 'Badges.java', name: '게임 원래 배지의 얻는 조건 끄기 · 바꾸기',
    anchor: /private static void displayBadge\(\s*Badge badge\s*\)\s*\{[^\n]*\n/, where: 'after', line: `if (badge != null && ${PKG}.MakerBadges.blocked(badge.name())) { local.remove(badge); return; }` },
  { file: 'levels/Level.java', name: '잠긴 맵 (조건이 맞아야 들어감)', group: 'lock', variant: 'level',
    anchor: /public boolean activateTransition\(\s*Hero hero,\s*LevelTransition transition\s*\)\s*\{[^\n]*\n/, where: 'after', line: `if (${PKG}.LevelHooks.lockedNode(transition)) return false;` },
  // 11차: 층에 activateTransition 이 없는 판 — 영웅이 계단을 직접 처리 (내려가기 · 올라가기 두 곳)
  { file: 'actors/hero/Hero.java', name: '잠긴 맵 (조건이 맞아야 들어감) — 내려갈 때', group: 'lock', variant: 'hero',
    anchor: /\n[ \t]*LevelTransition transition = Dungeon\.level\.getTransition\(\s*pos\s*\);[^\n]*\n(?=([ \t]*)InterlevelScene\.curTransition = transition;[^\n]*\n[ \t]*InterlevelScene\.mode = InterlevelScene\.Mode\.DESCEND;)/, where: 'after',
    line: `if (${PKG}.LevelHooks.lockedNode(transition)) { ready(); return false; }` },
  { file: 'actors/hero/Hero.java', name: '잠긴 맵 (조건이 맞아야 들어감) — 올라갈 때', group: 'lock', variant: 'hero',
    anchor: /private boolean actAscend\([\s\S]*?\n[ \t]*LevelTransition transition = Dungeon\.level\.getTransition\(\s*pos\s*\);[^\n]*\n(?=([ \t]*))/, where: 'after',
    line: `if (${PKG}.LevelHooks.lockedNode(transition)) { ready(); return false; }` },
  { file: 'tiles/DungeonTilemap.java', name: '큰 타일셋 (한 칸이 16px 이 아닌 타일셋)',
    anchor: /\n([ \t]*)super\(\s*tex,\s*new TextureFilm\(\s*tex,\s*SIZE,\s*SIZE\s*\)\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.LevelHooks.hiresTiles(this, tex);` },
  { file: 'tiles/DungeonTilemap.java', name: '큰 타일셋: 발견 연출 타일 크기',
    anchor: /\n([ \t]*)tile\.point\(\s*tileToWorld\(\s*pos\s*\)\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.LevelHooks.tileImg(tile);` },
  { file: 'tiles/DungeonTerrainTilemap.java', name: '큰 타일셋: 정보 창 타일 크기',
    anchor: /\n([ \t]*)img\.frame\(\s*instance\.tileset\.get\(\s*instance\.getTileVisual\(\s*pos,\s*tile,\s*true\s*\)\s*\)\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.LevelHooks.tileImg(img);` },
  { file: 'levels/Level.java', name: '칸을 밟았을 때 이벤트',
    anchor: /public void occupyCell\(\s*Char ch\s*\)\s*\{[^\n]*\n/, where: 'after', line: `${PKG}.LevelHooks.onOccupy(this, ch);` },
  { file: 'actors/hero/Hero.java', name: '맵 오브젝트: 옆에서 누르면 밀기·상호작용',
    anchor: /private boolean actMove\(\s*HeroAction\.Move action\s*\)\s*\{[^\n]*\n/, where: 'after', line: `if (${PKG}.LevelHooks.propInteract(this, action.dst)) return false;` },
  { file: 'actors/mobs/Mob.java', name: '드랍 테이블: 몬스터가 죽을 때',
    anchor: /public void rollToDropLoot\(\)\s*\{[^\n]*\n/, where: 'after', line: `if (${PKG}.MakerDrops.mobDrop(this)) return;` },
  { file: 'actors/mobs/MobSpawner.java', name: '등장 금지한 몬스터 빼기', group: 'mobs', variant: 'spawner',
    anchor: /\n([ \t]*)Random\.shuffle\(mobs\);/, where: 'before', line: `${PKG}.MakerDrops.filterMobs(mobs);` },
  // 11차: 층별 몬스터 목록 클래스 이름이 MobRotation 인 판 (같은 getMobRotation 구조)
  { file: 'actors/mobs/MobRotation.java', name: '등장 금지한 몬스터 빼기', group: 'mobs', variant: 'rotation',
    anchor: /\n([ \t]*)Random\.shuffle\(mobs\);/, where: 'before', line: `${PKG}.MakerDrops.filterMobs(mobs);` },
  { file: 'levels/Level.java', name: '테마별 몬스터 (드랍 테이블 › 테마별 몬스터)',
    anchor: /public Mob createMob\(\)\s*\{[^\n]*\n/, where: 'after', line: `{ Mob pdmTm = ${PKG}.MakerDrops.themeMob(this); if (pdmTm != null) return pdmTm; }` },
  { file: 'items/wands/Wand.java', name: '마법봉 공격 이펙트 (아이템 편집기 › 마법봉 이펙트)',
    anchor: /\n([ \t]*)curWand\.fx\(\s*shot\s*,\s*new Callback\(\)\s*\{/, where: 'before', line: `if (${PKG}.MakerWand.zap(curWand, shot)) return;` },
  { file: 'items/Item.java', name: '버리기 금지 (아이템 noDrop)',
    anchor: /\n([ \t]*)actions\.add\(\s*AC_THROW\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.MakerItem.flagActions(this, actions);` },
  { file: 'actors/mobs/npcs/Shopkeeper.java', name: '판매 불가 (아이템 noSell)',
    anchor: [/public static boolean canSell\(\s*Item item\s*\)\s*\{[^\n]*\n/, /public static boolean willBuyItem\(\s*Item item\s*\)\s*\{[^\n]*\n/], where: 'after', line: `if (${PKG}.MakerItem.noSell(item)) return false;` },   // 예전 판: willBuyItem
  { file: 'windows/WndBag.java', name: '새 가방의 탭 아이콘 (아이템 kind bag)',
    anchor: /private Image icon\(\s*Bag bag\s*\)\s*\{[^\n]*\n/, where: 'after', line: `{ Image pdmI = ${PKG}.MakerBag.icon(bag); if (pdmI != null) return pdmI; }` },
  { file: 'ui/InventoryPane.java', name: '새 가방의 탭 아이콘 (아이템 kind bag)',
    anchor: /private Image bagIcon\(\s*Bag bag\s*\)\s*\{[^\n]*\n/, where: 'after', line: `{ Image pdmI = ${PKG}.MakerBag.icon(bag); if (pdmI != null) return pdmI; }` },
  // ---- 아이템 추가 기능 (MakerFacets — 사용 효과 · 던지기 효과 · 가방 기능, 한 아이템에 종류 여러 개) ----
  { file: 'items/Item.java', name: '아이템 추가 기능: 버튼 이름', anchor: /public String actionName\(\s*String action\s*,\s*Hero hero\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ String pdmN = ${PKG}.MakerFacets.actionName(this, action); if (pdmN != null) return pdmN; }` },
  { file: 'items/Item.java', name: '아이템 추가 기능: 버튼 동작', anchor: /public void execute\(\s*Hero hero\s*,\s*String action\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.MakerFacets.execute(this, hero, action)) return;` },
  { file: 'items/Item.java', name: '아이템 추가 기능: 던져서 떨어졌을 때 (물약 · 폭탄 · 룬석)', anchor: /protected void onThrow\(\s*int cell\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.MakerFacets.onThrow(this, cell)) return;` },
  { file: 'items/Item.java', name: '아이템 추가 기능: 저장 (가방 기능의 내용물)', anchor: /public void storeInBundle\(\s*Bundle bundle\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerFacets.store(this, bundle);` },
  { file: 'items/Item.java', name: '아이템 추가 기능: 불러오기 (가방 기능의 내용물)', anchor: /public void restoreFromBundle\(\s*Bundle bundle\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerFacets.restore(this, bundle);` },
  { file: 'items/Item.java', name: '아이템 추가 기능: 가방 기능 안에 든 아이템을 그 자리에서 쓰기 (빼낼 곳)', anchor: /public final Item detachAll\(\s*Bag container\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `container = ${PKG}.MakerFacets.detachFrom(this, container);` },
  { file: 'items/weapon/missiles/MissileWeapon.java', name: '아이템 추가 기능: 투척 무기가 맞혔을 때 던지기 효과', anchor: /protected void rangedHit\(\s*Char enemy,\s*int cell\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerFacets.missileHit(this, cell);` },
  { file: 'actors/Actor.java', name: '아이템 추가 기능: 불러온 층에서 폭탄 퓨즈 이어서 타기', anchor: /\n([ \t]*)for \(\s*Blob blob : Dungeon\.level\.blobs\.values\(\)\s*\) \{\s*add\(\s*blob\s*\);\s*\}[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerFacets.reviveFuses();` },
  // ---- 캐릭터 AI · 체력 (MakerCharAI — 제자리 고정 · 코드로 직접 · 체력 무한 · 지속 회복) ----
  { file: 'actors/mobs/Mob.java', name: '캐릭터 AI: 제자리 고정 · 코드로 직접 · 지속 회복', anchor: /protected boolean act\(\)\s*\{\s*\n\s*super\.act\(\);[^\n]*\n/, where: 'after',
    line: `{ Boolean pdmAi = ${PKG}.MakerCharAI.act(this); if (pdmAi != null) return pdmAi; }` },
  { file: 'actors/Char.java', name: '캐릭터 체력 무한 (피해 숫자는 뜨고 체력은 그대로)', anchor: /\n([ \t]*)if \(HP < 0\) HP = 0;/, where: 'before',
    line: `${PKG}.MakerCharAI.afterDamage(this, dmg + shielded);` },
  { file: 'scenes/GameScene.java', name: '테마 물 = 흐르는 사용자 타일: 그 속도로 (세로)', needs: /\bwaterOfs\b/, anchor: /\n([ \t]*)waterOfs -= 5 \* Game\.elapsed;/, where: 'before',
    line: `waterOfs = ${PKG}.LevelHooks.waterFlowY(waterOfs);` },
  { file: 'scenes/GameScene.java', name: '테마 물 = 흐르는 사용자 타일: 그 속도로 (가로)', needs: /\bwaterOfs\b/, anchor: /\n([ \t]*)water\.offsetTo\(\s*0,\s*waterOfs\s*\);[^\n]*\n/, where: 'after',
    line: `${PKG}.LevelHooks.waterFlowX(water);` },
  { file: 'actors/mobs/Mob.java', name: '캐릭터: 어느 프로젝트 캐릭터로 만든 게임 몬스터인지 저장', anchor: /public void storeInBundle\(\s*Bundle bundle\s*\)\s*\{\s*\n\s*super\.storeInBundle\(\s*bundle\s*\);[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerCharAI.store(this, bundle);` },
  { file: 'actors/mobs/Mob.java', name: '캐릭터: 어느 프로젝트 캐릭터로 만든 게임 몬스터인지 불러오기', anchor: /public void restoreFromBundle\(\s*Bundle bundle\s*\)\s*\{\s*\n\s*super\.restoreFromBundle\(\s*bundle\s*\);[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerCharAI.restore(this, bundle);` },
  { file: 'actors/mobs/Mob.java', name: '샌드백: 받은 피해를 살펴보기에', anchor: /public String info\(\)\s*\{\s*\n\s*String desc = description\(\);[^\n]*\n/, where: 'after',
    line: `desc += ${PKG}.MakerCharAI.damageInfo(this);` },
  { file: 'sprites/CharSprite.java', name: '무기 공격 모션 (무기 그림이 휘둘러짐 — 아이템 편집기 › 공격 모션)', anchor: /public (?:synchronized )?void attack\(\s*int cell,\s*Callback callback\s*\)\s*\{[^}]*?play\(\s*attack\s*\);[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerSwing.onAttack(this, cell);` },
  { file: 'sprites/ItemSprite.java', name: '세밀한 아이템 그림 (배율 적용으로 키운 PNG — 한 칸 크기로 그림)', anchor: /public void frame\(\s*int image\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.MakerAssets.hiresItem(this, image)) return;` },
  { file: 'items/Gold.java', name: '금화 양 배율 (드랍 테이블 › 금화)',
    anchor: /public Item random\(\)\s*\{[^\n]*\n[^\n]*quantity\s*=\s*Random\.(?:IntRange|Int)\b[^\n]*\n/, where: 'after', line: `quantity = ${PKG}.MakerDrops.goldAmount(quantity);` },
  { file: 'sprites/ItemSprite.java', name: '아이템 그림 배율 (바닥에 놓였을 때)',
    anchor: /public void link\(\s*Heap heap\s*\)\s*\{[^\n]*\n/, where: 'after', line: `${PKG}.MakerItem.heapScale(this, heap);` },
  // ---- 영웅 코드 (영웅 편집기의 "코드" 칸 · 세부 능력치) ----
  { file: 'actors/hero/Hero.java', name: '영웅 코드: 명중', anchor: /public int attackSkill\(\s*Char target\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.HeroRuntime.wrap(1)) return ${PKG}.HeroRuntime.attackSkill(this, target, attackSkill(target));` },
  { file: 'actors/hero/Hero.java', name: '영웅 코드: 회피', anchor: /public int defenseSkill\(\s*Char enemy\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.HeroRuntime.wrap(2)) return ${PKG}.HeroRuntime.defenseSkill(this, enemy, defenseSkill(enemy));` },
  { file: 'actors/hero/Hero.java', name: '영웅 코드: 피해', anchor: /public int damageRoll\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.HeroRuntime.wrap(3)) return ${PKG}.HeroRuntime.damageRoll(this, damageRoll());` },
  { file: 'actors/hero/Hero.java', name: '영웅 코드: 방어', anchor: /public int drRoll\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.HeroRuntime.wrap(4)) return ${PKG}.HeroRuntime.drRoll(this, drRoll());` },
  { file: 'actors/hero/Hero.java', name: '영웅 코드: 속도', anchor: /public float speed\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.HeroRuntime.wrap(5)) return ${PKG}.HeroRuntime.speed(this, speed());` },
  { file: 'actors/hero/Hero.java', name: '영웅 코드: 공격 적중', anchor: /public int attackProc\(\s*final Char enemy,\s*int damage\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `damage = ${PKG}.HeroRuntime.attackProc(this, enemy, damage);` },
  { file: 'actors/hero/Hero.java', name: '영웅 코드: 공격 받음', anchor: /public int defenseProc\(\s*Char enemy,\s*int damage\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `damage = ${PKG}.HeroRuntime.defenseProc(this, enemy, damage);` },
  { file: 'actors/mobs/Mob.java', name: '영웅 코드: 몬스터 처치', anchor: /public void die\(\s*Object cause\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `${PKG}.HeroRuntime.onMobDie(this, cause);` },
  { file: 'windows/WndHero.java', name: '영웅 정보 창의 특성 탭 → 영웅 편집기의 특성·주문',
    anchor: [/\n([ \t]*)pane = new TalentsPane\(\s*TalentButton\.Mode\.UPGRADE\s*\);[^\n]*\n/, /\n([ \t]*)pane = new TalentsPane\(\s*true\s*\);[^\n]*\n/], where: 'after',   // 예전 판: TalentsPane(true)
    line: `{ TalentsPane pdmPane = ${PKG}.MakerTalentsPane.forHero(); if (pdmPane != null) { pane.destroy(); pane = pdmPane; } }` },
  { file: 'actors/hero/Hero.java', name: '특성 포인트 (영웅 편집기 특성을 쓰면 그 포인트로)',
    anchor: /public int talentPointsAvailable\(\s*int tier\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ int pdmT = ${PKG}.MakerTalents.nativeOverride(tier); if (pdmT >= 0) return pdmT; }` },
  // ---- 전직 · 직업 능력 (영웅 편집기의 subclasses · abilities) ----
  { file: 'actors/hero/HeroClass.java', name: '직업 능력: 왕관으로 고르는 목록 → 영웅 편집기의 직업 능력', needs: /\barmorAbilities\s*\(/,
    anchor: /public ArmorAbility\[\] armorAbilities\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ ArmorAbility[] pdmA = ${PKG}.MakerAbilities.armorAbilities(this); if (pdmA != null) return pdmA; }` },
  { file: 'items/TengusMask.java', name: '전직: 텐구의 가면 → 영웅 편집기의 전직', group: 'subclass', variant: 'mask',
    anchor: /\n([ \t]*)GameScene\.show\(\s*new WndChooseSubclass\(\s*this,\s*hero\s*\)\s*\);/, where: 'before',
    line: `if (${PKG}.MakerAbilities.chooseSubclass(this, hero)) return;` },
  // 11차: 전직 아이템이 숙련의 서(TomeOfMastery)인 판 — 같은 자리(전직 고르기 창을 띄우기 직전)
  { file: 'items/TomeOfMastery.java', name: '전직: 숙련의 서 → 영웅 편집기의 전직', group: 'subclass', variant: 'tome',
    anchor: /\n([ \t]*)GameScene\.show\(\s*new WndChooseSubclass\(\s*this,\s*(?:Dungeon\.)?hero\s*\)\s*\);/, where: 'before',
    line: `if (${PKG}.MakerAbilities.chooseSubclass(this, hero)) return;` },
  { file: 'actors/hero/Hero.java', name: '전직 이름 (영웅 정보 창)',
    anchor: /public String className\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ String pdmN = ${PKG}.MakerAbilities.className(this); if (pdmN != null) return pdmN; }` },
  { file: 'scenes/PixelScene.java', name: '게임 그림 바꾸기(assets/game) · 메뉴 화면 배경·음악',
    anchor: /\n([ \t]*)float minWidth, minHeight(?:, scaleFactor)?;/, where: 'before', line: `${PKG}.MakerAssets.onSceneCreate(this);` },
  { file: 'scenes/PixelScene.java', name: '스크린 · 카메라 연출 (6차): 카메라 기본 위치 · 흔들림 오프셋 (이벤트 camMove · camFollow · camShake · camReset)',
    anchor: /\n([ \t]*)@Override\s*\n[ \t]*protected void updateMatrix\(\) \{\s*\n[ \t]*float sx = align\( this, scroll\.x \+ shakeX \);/, where: 'before',
    line: `@Override public synchronized void update() { ${PKG}.MakerCamera.before(this); super.update(); if (${PKG}.MakerCamera.offX != 0 || ${PKG}.MakerCamera.offY != 0) { shakeX += ${PKG}.MakerCamera.offX; shakeY += ${PKG}.MakerCamera.offY; updateMatrix(); } }` },
  { file: 'scenes/GameScene.java', name: '게임 UI 테마 (6차): PDMaker 가 띄우는 원작 모양 창(선택지 · 확인 창)의 제목 · 버튼 글자 색',
    anchor: /public static void show\(\s*Window wnd\s*\)\s*\{[^\n]*\n/, where: 'after', line: `${PKG}.MakerTheme.onShow(wnd);` },
  { file: 'scenes/TitleScene.java', optional: true, name: '타이틀 음악 이어 틀기: 타이틀 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음)',
    anchor: /\n([ \t]*)Music\.INSTANCE\.play(?:Tracks)?\(/, where: 'before', line: `if (!${PKG}.MakerAssets.keepMenuMusic(this))` },
  { file: 'scenes/RankingsScene.java', optional: true, needs: /Music\.INSTANCE/, name: '타이틀 음악 이어 틀기: 랭킹 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음)',
    anchor: /\n([ \t]*)Music\.INSTANCE\.play(?:Tracks)?\(/, where: 'before', line: `if (!${PKG}.MakerAssets.keepMenuMusic(this))` },
  { file: 'scenes/JournalScene.java', optional: true, needs: /Music\.INSTANCE/, name: '타이틀 음악 이어 틀기: 모험 일지 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음)',
    anchor: /\n([ \t]*)Music\.INSTANCE\.play(?:Tracks)?\(/, where: 'before', line: `if (!${PKG}.MakerAssets.keepMenuMusic(this))` },
  { file: 'scenes/ChangesScene.java', optional: true, needs: /Music\.INSTANCE/, name: '타이틀 음악 이어 틀기: 변경 사항 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음)',
    anchor: /\n([ \t]*)Music\.INSTANCE\.play(?:Tracks)?\(/, where: 'before', line: `if (!${PKG}.MakerAssets.keepMenuMusic(this))` },
  { file: 'scenes/WelcomeScene.java', optional: true, needs: /Music\.INSTANCE/, name: '타이틀 음악 이어 틀기: 환영 (프로젝트 곡이 흐르는 중이면 게임 곡으로 바꾸지 않음)',
    anchor: /\n([ \t]*)Music\.INSTANCE\.play(?:Tracks)?\(/, where: 'before', line: `if (!${PKG}.MakerAssets.keepMenuMusic(this))` },
  // ---- 분리된(투명 배경) 타일셋: 지형 아래 밑그림 (MakerTileUnderlay) ----
  { file: 'scenes/GameScene.java', name: '분리 타일셋 밑그림: 지형 타일맵 아래에 넣기',
    anchor: /\n([ \t]*)terrain\.add\(\s*tiles\s*\);/, where: 'before', line: `${PKG}.MakerTileUnderlay.addTo(terrain, tiles);` },
  { file: 'scenes/GameScene.java', name: '분리 타일셋 밑그림: 맵 전체 다시 그리기',
    anchor: /\n([ \t]*)scene\.tiles\.updateMap\(\);[^\n]*\n/, where: 'after', line: `${PKG}.MakerTileUnderlay.refresh(-1);` },
  { file: 'scenes/GameScene.java', name: '분리 타일셋 밑그림: 칸 하나 다시 그리기',
    anchor: /\n([ \t]*)scene\.tiles\.updateMapCell\(\s*cell\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.MakerTileUnderlay.refresh(cell);` },
  { file: 'scenes/HeroSelectScene.java', name: '영웅 선택 화면: 게임 직업 대신 프로젝트 영웅 버튼',
    anchor: /\n([ \t]*)for \(HeroClass cl : (?:HeroClass\.values\(\)|\w+)\)\s*\{/, where: 'before',   // 예전 판 · 파생작: 직업 배열을 변수에 담아 돎
    line: `if (!${PKG}.HeroSelect.addButtons(this, heroBtns))` },
  // ---- 초상화: 영웅 편집기의 그림 (상태 창 · 영웅 창 · 저장 슬롯) ----
  { file: 'sprites/HeroSprite.java', name: '초상화: 영웅 편집기의 그림 (상태 창 · 영웅 창)', group: 'avatar', variant: 'hero',
    anchor: /public static Image avatar\(\s*Hero hero\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ Image pdmA = ${PKG}.HeroRuntime.avatar(hero); if (pdmA != null) return pdmA; }` },
  // 11차: 초상화 함수가 (직업, 갑옷 단계) 를 받는 판 — 지금 영웅의 직업이면 영웅 편집기의 그림
  { file: 'sprites/HeroSprite.java', name: '초상화: 영웅 편집기의 그림 (상태 창 · 영웅 창)', group: 'avatar', variant: 'class',
    anchor: /public static Image avatar\(\s*HeroClass \w+,\s*int \w+\s*\)\s*\{[^\n]*\n/, where: 'after', argsFrom: /avatar\(\s*HeroClass (\w+)/,
    line: `{ com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero pdmH = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero; Image pdmA = pdmH != null && pdmH.heroClass == $1 ? ${PKG}.HeroRuntime.avatar(pdmH) : null; if (pdmA != null) return pdmA; }` },
  { file: 'Dungeon.java', name: '저장 슬롯: 어떤 영웅인지 읽기',
    anchor: /\n([ \t]*)Statistics\.preview\(\s*info,\s*bundle\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.HeroRuntime.preview(info, bundle);` },
  { file: 'GamesInProgress.java', name: '저장 슬롯: 지금 영웅 기억 (저장할 때)',
    anchor: /public static void set\(\s*int slot\b[^)]*\)\s*\{[^\n]*\n/, where: 'after', line: `${PKG}.HeroRuntime.setSlot(slot);` },   // 예전 판: set(slot, depth, challenges, hero)
  { file: 'scenes/StartScene.java', name: '저장 슬롯 초상화·이름 (시작 화면)',
    anchor: /\n([ \t]*)long diff = Game\.realTime - info\.lastPlayed;/, where: 'before',
    line: `{ com.watabou.noosa.Image pdmA = ${PKG}.HeroRuntime.slotAvatar(info); if (pdmA != null && hero != null) hero.copy(pdmA); String pdmN = ${PKG}.HeroRuntime.slotName(info); if (pdmN != null) name.text(Messages.titleCase(pdmN)); }` },
  { file: 'windows/WndGameInProgress.java', name: '저장 슬롯 초상화·이름 (이어하기 창)',
    anchor: /\n([ \t]*)title\.label\(/, where: 'before',
    line: `{ com.watabou.noosa.Image pdmA = ${PKG}.HeroRuntime.slotAvatar(info); if (pdmA != null) title.icon(pdmA); String pdmN = ${PKG}.HeroRuntime.slotName(info); if (pdmN != null) className = pdmN; }` },
  { file: 'scenes/TitleScene.java', name: '타이틀 화면 (배경·로고·버튼·음악)',
    anchor: /\n([ \t]*)fadeIn\(\);/, where: 'before', line: `${PKG}.MakerTitle.apply(this);` },
  { file: 'sprites/HeroSprite.java', name: '영웅 시트: 갑옷을 바꿔도 영웅 편집기의 그림·프레임 크기 유지',
    anchor: /public void updateArmor\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.HeroRuntime.updateArmor(this)) return;` },
  { file: 'items/Item.java', name: '게임 아이템 그림 바꾸기 (gameitems.json)',
    anchor: /public int image\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ int pdmI = ${PKG}.MakerAssets.itemImage(this); if (pdmI >= 0) return pdmI; }` },
  { file: 'items/Item.java', name: '아이템 소리: 행동 버튼 (사용·장착)',
    anchor: /public void execute\(\s*Hero hero,\s*String action\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerAudio.onItemAction(this, action);` },
  { file: 'items/Item.java', name: '아이템 소리 · 이펙트: 실제로 던지는 순간 (던지기 버튼을 누를 때가 아니라)',
    anchor: /public void cast\(\s*final Hero user,\s*final int dst\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerAudio.onItemCast(this);` },
  { file: 'items/Item.java', name: '아이템 소리: 주울 때 (정한 소리가 있으면 원래 소리 대신)',
    anchor: /\n([ \t]*)Sample\.INSTANCE\.play\(\s*Assets\.Sounds\.ITEM\s*\);/, where: 'before',
    line: `if (!${PKG}.MakerAudio.onItemPickup(this))` },
  { file: 'items/Item.java', name: '아이템 소리: 던진 것이 적에게 닿을 때',
    anchor: /\n([ \t]*)if \(i != null\) i\.onThrow\(\s*cell\s*\);(?=[\s\S]*if \(i != null\) i\.onThrow\(\s*cell\s*\);)/, where: 'before',
    line: `if (i != null) ${PKG}.MakerAudio.onItemLandHit(i, cell);` },
  { file: 'items/Item.java', name: '아이템 소리: 던진 것이 바닥에 떨어질 때',
    anchor: /\n([ \t]*)if \(i != null\) i\.onThrow\(\s*cell\s*\);(?![\s\S]*if \(i != null\) i\.onThrow\(\s*cell\s*\);)/, where: 'before',
    line: `if (i != null) ${PKG}.MakerAudio.onItemLandGround(i, cell);` },
  { file: 'items/KindOfWeapon.java', name: '아이템 소리: 무기로 공격이 맞을 때 (정한 소리가 있으면 원래 타격음 대신)',
    anchor: /public void hitSound\(\s*float pitch\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.MakerAudio.onWeaponHit(this)) return;` },
  { file: 'levels/Level.java', name: '통로 연결: 도착 층에서 짝 계단 고르기',
    anchor: /public LevelTransition getTransition\(\s*LevelTransition\.Type type\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ LevelTransition pdmT = ${PKG}.WorldGraph.pickArrival(this, type); if (pdmT != null) return pdmT; }` },
  // 타이틀 하위 페이지: 업데이트 확인 · 소식 (서비스 모듈 — 저장소에 없으면 건너뜀 · optional). System 속성은 런타임 MakerPages.applyServices 가 넣음
  { file: 'services/updates/githubUpdates/src/main/java/com/shatteredpixel/shatteredpixeldungeon/services/updates/GitHubUpdates.java', root: true, optional: true, name: '업데이트 확인: 끄기 (타이틀 하위 페이지)',
    anchor: /public void checkForUpdate\([^)]*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (System.getProperty("pdmaker.updates.off") != null) { callback.onNoUpdateFound(); return; }` },
  { file: 'services/updates/githubUpdates/src/main/java/com/shatteredpixel/shatteredpixeldungeon/services/updates/GitHubUpdates.java', root: true, optional: true, name: '업데이트 확인: 내 GitHub 저장소 (타이틀 하위 페이지)',
    anchor: /\n([ \t]*)httpGet\.setHeader\(\s*"Accept"/, where: 'before',
    line: `{ String pdmU = System.getProperty("pdmaker.updates.url"); if (pdmU != null) httpGet.setUrl(pdmU); }` },
  { file: 'services/updates/githubUpdates/src/main/java/com/shatteredpixel/shatteredpixeldungeon/services/updates/GitHubUpdates.java', root: true, optional: true, name: '업데이트 버튼: 다운로드 페이지 (타이틀 하위 페이지)',
    anchor: /public void initializeUpdate\([^)]*\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ String pdmP = System.getProperty("pdmaker.updates.page"); if (pdmP != null) update.URL = pdmP; }` },
  { file: 'services/news/shatteredNews/src/main/java/com/shatteredpixel/shatteredpixeldungeon/services/news/ShatteredNews.java', root: true, optional: true, name: '새 소식: 끄기 · 직접 쓴 소식 (타이틀 하위 페이지)',
    anchor: /public void checkForArticles\([^)]*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (System.getProperty("pdmaker.news.off") != null) { callback.onConnectionFailed(); return; }` },
  { file: 'services/news/shatteredNews/src/main/java/com/shatteredpixel/shatteredpixeldungeon/services/news/ShatteredNews.java', root: true, optional: true, name: '새 소식: 내 RSS 주소 (타이틀 하위 페이지)',
    anchor: /\n([ \t]*)Gdx\.net\.sendHttpRequest\(\s*httpGet/, where: 'before',
    line: `{ String pdmN = System.getProperty("pdmaker.news.url"); if (pdmN != null) httpGet.setUrl(pdmN); }` },
  // 저장소 최상위 파일 (root: true). 안드로이드 SDK 가 없는 PC 에서도 데스크톱 빌드가 되도록 :android 모듈은 SDK 가 있을 때만 포함
  { file: 'settings.gradle', root: true, name: '안드로이드 SDK 가 없으면 android 모듈 건너뛰기 (다른 PC 에서 테스트 플레이)', group: 'android', variant: 'line',
    anchor: /\n([ \t]*)include ':android'\s*(?:\n|$)/, where: 'before',
    line: `if ({ def s = System.getenv('ANDROID_HOME') ?: System.getenv('ANDROID_SDK_ROOT'); def lp = new File(settingsDir, 'local.properties'); if (!s && lp.exists()) { def pp = new Properties(); lp.withInputStream { pp.load(it) }; s = pp.getProperty('sdk.dir') }; s != null && new File(s.toString()).exists() }())` },
  // 11차: 여러 모듈을 한 include 에 적은 저장소 (원본 줄은 고치지 않음 — 파일 끝에서 SDK 가 없으면 :android 를 설정에서 뺌. Gradle 8.14 에서 확인)
  { file: 'settings.gradle', root: true, name: '안드로이드 SDK 가 없으면 android 모듈 건너뛰기 (다른 PC 에서 테스트 플레이)', group: 'android', variant: 'list',
    needs: /include\b[^\n]*':android'|,\s*':android'/, anchor: /(?![\s\S])/, where: 'after', indent: '',
    line: `if (!({ def s = System.getenv('ANDROID_HOME') ?: System.getenv('ANDROID_SDK_ROOT'); def lp = new File(settingsDir, 'local.properties'); if (!s && lp.exists()) { def pp = new Properties(); lp.withInputStream { pp.load(it) }; s = pp.getProperty('sdk.dir') }; s != null && new File(s.toString()).exists() }())) { def pdmA = findProject(':android'); if (pdmA != null) { rootProject.children.remove(pdmA); try { settings.projectDescriptorRegistry.removeProject(':android') } catch (Throwable ignored) { } } }` },
  { file: 'scenes/InterlevelScene.java', name: '층을 떠날 때 (감정 결정화·일기)',
    anchor: /public void create\(\)\s*\{\s*\n([ \t]*)super\.create\(\);[^\n]*\n/, where: 'after',
    line: `if (com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero != null && (mode == Mode.DESCEND || mode == Mode.ASCEND || mode == Mode.FALL || mode == Mode.RETURN)) ${PKG}.MakerRuntime.onFloorLeave();` },
  // (맨 끝: 같은 자리의 다른 줄보다 먼저 오게 — 나중에 넣은 줄이 바로 아래에 붙음)
  { file: 'actors/mobs/Mob.java', name: '캐릭터 체력 무한: 쓰러지지 않음', anchor: /public void die\(\s*Object cause\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `if (${PKG}.MakerCharAI.preventDeath(this)) return;` },
];

function javaDir(repo) { return path.join(repo, ...JAVA_ROOT); }
/** 연결 줄을 넣을 파일의 실제 경로 (root: true 면 저장소 최상위 기준) */
function patchFile(repo, file) { return PATCHES.some(p => p.file === file && p.root) ? path.join(repo, file) : path.join(javaDir(repo), file); }

function findAnchor(src, p) {
  for (const a of [].concat(p.anchor)) { a.lastIndex = 0; const m = a.exec(src); if (m) return m; }
  return null;
}
function applyPatch(src, p) {
  const m = findAnchor(src, p);
  if (!m) return { src, ok: false };
  // 넣을 줄: argsFrom 이 있으면 찾은 자리에서 이름을 읽어 $1 에 (예: 함수 인자 이름이 판마다 다름)
  let line = p.line;
  if (p.argsFrom) { const a = p.argsFrom.exec(m[0]); if (a) line = line.replace(/\$1/g, a[1]); }
  // 들여쓰기: indent 를 정했으면 그것, 캡처 그룹이 있으면 그것, 없으면 다음 줄 기준 두 탭
  let indent = p.indent !== undefined ? p.indent : m[1] !== undefined ? m[1] : '\t\t';
  if (p.where === 'before') {
    const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
    return { src: src.slice(0, at) + `${indent}${line} ${MARK}\n` + src.slice(at), ok: true };
  }
  const at = m.index + m[0].length;
  if (p.indent === undefined && m[1] === undefined) { const next = src.slice(at).match(/^[ \t]*/); indent = next && next[0] ? next[0] : '\t\t'; }
  const nl = at > 0 && src[at - 1] !== '\n' ? '\n' : '';   // 파일 끝 (마지막 줄에 줄바꿈이 없을 때)
  return { src: src.slice(0, at) + `${nl}${indent}${line} ${MARK}\n` + src.slice(at), ok: true };
}
const cleanOf = src => src.split('\n').filter(l => !l.includes(MARK)).join('\n');
/** 이 저장소에서 연결 줄마다 어떻게 할지 → Map(patch → { state, why })
 *  state: apply(넣을 수 있음) · missing(파일은 있는데 자리를 못 찾음) · nofile(파일 없음) · optional(없어도 되는 파일이 없음)
 *         · na(이 게임에 그 구조가 없음 — needs) · alt(같은 기능을 다른 방식으로 넣음 — group/variant)
 *  group/variant: 같은 group 에서 넣을 수 있는 줄이 하나라도 있는 첫 variant 만 씀 (예: settings.gradle 한 줄 include / 여러 모듈 include) */
function planPatches(repo) {
  const out = new Map(), cache = new Map();
  const read = f => { if (!cache.has(f)) { const fp = patchFile(repo, f); cache.set(f, fs.existsSync(fp) ? cleanOf(fs.readFileSync(fp, 'utf8')) : null); } return cache.get(f); };
  for (const p of PATCHES) {
    const src = read(p.file);
    if (src == null) { out.set(p, { state: p.optional || p.group ? 'optional' : 'nofile' }); continue; }
    if (p.needs && !p.needs.test(src)) { out.set(p, { state: 'na', why: '이 게임에는 이 기능이 붙을 구조가 없음' }); continue; }
    out.set(p, { state: findAnchor(src, p) ? 'apply' : 'missing' });
  }
  const groups = new Map();
  for (const p of PATCHES) if (p.group) (groups.get(p.group) || groups.set(p.group, []).get(p.group)).push(p);
  for (const [, list] of groups) {
    const variants = [...new Set(list.map(p => p.variant || ''))];
    const chosen = variants.find(v => list.some(p => (p.variant || '') === v && out.get(p).state === 'apply'));
    const anyFile = list.some(p => out.get(p).state !== 'optional');
    for (const p of list) {
      const st = out.get(p);
      if (chosen === undefined) { if (!anyFile && st.state === 'optional') out.set(p, { state: list[0].optional ? 'optional' : 'nofile' }); continue; }
      if ((p.variant || '') !== chosen) out.set(p, { state: 'alt', why: '같은 기능을 이 저장소 구조에 맞는 다른 자리에 넣음' });
    }
    if (chosen === undefined && anyFile) {   // 어느 방식도 자리를 못 찾음 — 파일이 있는 첫 줄만 "못 찾음", 나머지는 대안
      let first = true;
      for (const p of list) { const st = out.get(p); if (st.state === 'na') continue; if (first && st.state !== 'optional') { out.set(p, { state: 'missing' }); first = false; } else out.set(p, { state: 'alt', why: '같은 기능의 다른 방식' }); }
    }
  }
  return out;
}

function uninstall(repo, log = console.log) {
  const jd = javaDir(repo);
  const files = [...new Set(PATCHES.map(p => p.file))];
  for (const f of files) {
    const fp = patchFile(repo, f);
    if (!fs.existsSync(fp)) continue;
    const src = fs.readFileSync(fp, 'utf8');
    let out = src.split('\n').filter(l => !l.includes(MARK)).join('\n');
    const bak = fp + '.pdmaker-backup';
    // 백업과 (줄 끝 차이만 빼고) 같으면 백업 그대로 — 파일 끝에 붙였던 줄의 줄바꿈까지 원래대로
    if (fs.existsSync(bak)) { const b = fs.readFileSync(bak, 'utf8'); if (b.replace(/\s+$/, '') === out.replace(/\s+$/, '')) out = b; }
    if (out !== src) { fs.writeFileSync(fp, out, 'utf8'); log(`연결 줄 제거: ${f}`); }
    if (fs.existsSync(bak)) fs.rmSync(bak);
  }
  // 게임 이름 · 패키지 (applyGameId) 를 바꿨으면 원래대로
  const bg = path.join(repo, 'build.gradle'), bgb = bg + '.pdmaker-backup';
  if (fs.existsSync(bgb)) { fs.copyFileSync(bgb, bg); fs.rmSync(bgb); log('build.gradle: 원래 게임 이름 · 패키지로 되돌림'); }
  const pkgDir = path.join(jd, 'pdmaker');
  if (fs.existsSync(pkgDir)) { fs.rmSync(pkgDir, { recursive: true }); log('pdmaker 패키지 제거'); }
}

/** 프로젝트의 영웅·아이템 → pdmaker/gen/*.java · 아이템은 gen/items/<분류>/<세부 종류>/ (바뀐 파일만 씀). 돌려줌: 파일 수 */
function generate(repo, projectDir, log = console.log) {
  const codegen = require('./renderer/js/codegen');
  const gen = path.join(javaDir(repo), 'pdmaker', 'gen');
  const readAll = dir => { const d = path.join(projectDir, dir); if (!fs.existsSync(d)) return []; return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { log(`읽기 실패 ${dir}/${f}: ${e.message}`); return null; } }).filter(Boolean); };
  const readOne = rel => { const f = path.join(projectDir, rel); try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } catch (e) { log(`읽기 실패 ${rel}: ${e.message}`); return null; } };
  const files = projectDir ? codegen.generate(readAll('heroes'), readAll('items'), readOne('gameitems.json'), readAll('characters')) : {};
  fs.mkdirSync(gen, { recursive: true });
  // 이제 안 쓰는 파일 지우기 (분류를 옮기면 예전 폴더의 파일) + 빈 폴더 정리
  const sweep = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name, fp = path.join(dir, e.name);
      if (e.isDirectory()) { sweep(fp, r); if (!fs.readdirSync(fp).length) fs.rmdirSync(fp); }
      else if (e.name.endsWith('.java') && !files[r]) fs.rmSync(fp);
    }
  };
  sweep(gen, '');
  // 11차: 생성 코드도 이 저장소 구조에 맞춤 (게임 본체 이름 · 옮겨진 클래스 · 없는 import)
  const env = adapt.environment(repo);
  for (const f of Object.keys(files)) files[f] = adapt.adaptSource(files[f], env, 'gen/' + f, { generated: true }).src;
  let changed = 0;
  for (const [f, src] of Object.entries(files)) {
    const fp = path.join(gen, ...f.split('/'));
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    if (fs.existsSync(fp) && fs.readFileSync(fp, 'utf8') === src) continue;
    fs.writeFileSync(fp, src, 'utf8'); changed++;
  }
  log(`코드 생성: ${Object.keys(files).length}개 파일 (${changed}개 바뀜) → pdmaker/gen`);
  return Object.keys(files).length;
}

/** 게임 저장소 살펴보기 — { ok, game, version, pkg, problems[], warnings[], missing[] }. problems 가 있으면 설치하지 않음 */
function compat(repo) {
  const out = { ok: false, game: '', version: '', pkg: '', problems: [], warnings: [], missing: [] };
  if (!repo || !fs.existsSync(repo)) { out.problems.push('폴더가 없습니다: ' + repo); return out; }
  try {   // 이름 · 판: build.gradle 의 appName · appVersionName
    const g = fs.readFileSync(path.join(repo, 'build.gradle'), 'utf8');
    out.game = (/appName\s*=\s*['"]([^'"]*)['"]/.exec(g) || [])[1] || '';
    out.version = (/appVersionName\s*=\s*['"]([^'"]*)['"]/.exec(g) || [])[1] || '';
  } catch (_) { /* 없음 */ }
  const jd = javaDir(repo);
  if (!fs.existsSync(path.join(jd, 'Dungeon.java'))) {
    // 다른 패키지의 Dungeon.java 를 찾아 어떤 게임인지 알려 줌
    let found = null;
    const walk = (d, depth) => { if (found || depth > 9) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) { if (found) return; if (e.isDirectory()) { if (!/^(\.git|build|\.gradle|node_modules|assets|res)$/.test(e.name)) walk(path.join(d, e.name), depth + 1); } else if (e.name === 'Dungeon.java') found = path.join(d, e.name); } };
    walk(repo, 0);
    if (found) {
      const pk = (/^\s*package\s+([\w.]+)\s*;/m.exec(fs.readFileSync(found, 'utf8')) || [])[1] || '?';
      out.pkg = pk;
      out.problems.push(`이 게임의 패키지는 ${pk} 입니다. PDMaker 는 Shattered Pixel Dungeon 계열(패키지 com.shatteredpixel.shatteredpixeldungeon — SPD 와 그 패키지를 그대로 쓰는 모드)만 지원합니다.` +
        (/^com\.watabou\.pixeldungeon/.test(pk) ? ' (원작 Pixel Dungeon 은 구조가 달라 지원하지 않습니다)' : ' (패키지 이름을 바꾼 파생작은 지원하지 않습니다)'));
    } else out.problems.push('게임 저장소가 아닙니다 (Dungeon.java 를 찾지 못함): ' + repo);
    return out;
  }
  out.pkg = 'com.shatteredpixel.shatteredpixeldungeon';
  const read = rel => { try { return fs.readFileSync(path.join(jd, rel), 'utf8'); } catch (_) { return ''; } };
  // 런타임이 기대하는 게임 구조 (없으면 컴파일이 안 됨)
  const ch = read('actors/Char.java');
  if (/public\s+long\s+HP\b/.test(ch)) out.problems.push('이 게임은 체력(HP)이 long 형입니다 (Experienced Pixel Dungeon 계열). PDMaker 런타임은 int 체력(원작 SPD)에 맞춰져 있어 컴파일되지 않습니다.');
  if (!/BRANCH_EXIT/.test(read('levels/features/LevelTransition.java'))) out.problems.push('층 이동 · 갈림길(LevelTransition.BRANCH_EXIT)이 없는 예전 판입니다' + (out.version ? ' (' + out.version + ')' : '') + ' — SPD 2.5 이상이 필요합니다.');
  if (!fs.existsSync(path.join(repo, 'SPD-classes'))) out.warnings.push('SPD-classes 모듈이 없습니다 — 빌드 구조가 원작과 다를 수 있습니다.');
  // 연결 줄: 파일은 있는데 넣을 위치를 못 찾는 것 (그 기능만 동작하지 않음)
  out.notApplicable = [];
  for (const [p, st] of planPatches(repo)) {
    if (st.state === 'nofile') out.missing.push(`${p.file} (파일 없음) — ${p.name}`);
    else if (st.state === 'missing') out.missing.push(`${p.file} — ${p.name}`);
    else if (st.state === 'na') out.notApplicable.push(`${p.file} — ${p.name}`);
  }
  if (out.missing.length) out.warnings.push(`연결 줄 ${out.missing.length}개의 위치를 찾지 못했습니다 — 그 기능만 동작하지 않습니다 (runtime/INTEGRATION.md 를 보고 직접 넣을 수 있음).`);
  out.ok = !out.problems.length;
  return out;
}

/** 런타임(pdmaker 패키지)이 이름으로 부르는 게임 클래스 중 저장소에 없는 것 [{ cls, uses: ['파일:줄'] }]
 *  11차: 이 저장소에 맞춰 적응한 뒤(게임 본체 이름 · 옮겨진 클래스 · 기능 조건 블록)에도 남는 것만 — 주석 · 문자열 · 꺼진 갈래는 뺌 */
function missingClasses(repo, runtimeSrc) {
  const rdir = path.join(runtimeSrc || path.join(__dirname, '..', 'runtime', 'src'), ...JAVA_ROOT.slice(-3), 'pdmaker');
  if (!fs.existsSync(rdir)) return [];
  return adapt.adaptRuntime(repo, rdir).missing;
}
/** 설치하면 무엇이 어떻게 맞춰지는지 (파일을 고치지 않음) → { ok, compat, adapt: { mainGame, relocations, features, missing, changes } } */
function plan(repo, runtimeSrc) {
  const cp = compat(repo);
  const rdir = path.join(runtimeSrc || path.join(__dirname, '..', 'runtime', 'src'), ...JAVA_ROOT.slice(-3), 'pdmaker');
  if (!cp.ok || !fs.existsSync(rdir)) return { ok: false, compat: cp, adapt: null };
  const a = adapt.adaptRuntime(repo, rdir);
  return { ok: !a.missing.length, compat: cp, adapt: { mainGame: a.env.mainGame, relocations: a.env.relocations, features: a.features, missing: a.missing, changes: a.changes, files: a.files } };
}

function install(repo, runtimeSrc, log = console.log, projectDir = null) {
  const jd = javaDir(repo);
  const cp = compat(repo);
  log(`게임 저장소: ${cp.game || '(이름 없음)'}${cp.version ? ' ' + cp.version : ''} — ${cp.pkg || '?'}`);
  if (!cp.ok) throw new Error('이 게임 저장소에는 설치할 수 없습니다:\n· ' + cp.problems.join('\n· '));
  // 10차: 런타임이 이름으로 부르는 게임 클래스가 없으면 설치해도 컴파일되지 않음 → 원본 파일을 고치기 전에 멈춤 (예: ARK 에는 MobSpawner · TengusMask … 가 없음)
  //      11차: 먼저 런타임을 이 저장소 구조에 맞춰 메모리에서 적응 → 그래도 남는 클래스가 있을 때만 멈춤
  const from = path.join(runtimeSrc, 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'pdmaker');
  const ad = adapt.adaptRuntime(repo, from);
  const miss = ad.missing;
  if (miss.length) throw new Error(`이 게임 저장소에는 PDMaker 런타임이 쓰는 게임 클래스 ${miss.length}개가 없어 설치해도 컴파일되지 않습니다 — 원본 파일은 고치지 않았습니다:\n· ` + miss.slice(0, 12).map(m => `${m.cls} (${m.uses[0]})`).join('\n· ') + (miss.length > 12 ? `\n· … 외 ${miss.length - 12}` : '') + '\n(편집기의 "게임 저장소 분석" 화면에서 전체 목록을 볼 수 있습니다)');
  cp.warnings.forEach(w => log('⚠ ' + w));
  if (ad.env.mainGame && ad.env.mainGame !== 'ShatteredPixelDungeon') log(`게임 본체 클래스: ${ad.env.mainGame} (런타임 사본의 ShatteredPixelDungeon 이름을 이것으로)`);
  ad.env.relocations.forEach(r => log(`옮겨진 클래스: ${r.from.slice(adapt.GAME_PKG.length + 1)} → ${r.to} (${r.note})`));
  ad.features.filter(f => !f.on).forEach(f => log(`이 게임 구조에 맞춤: ${f.label || f.cond} — ${f.where.join(', ')}`));
  // 1) 패키지 복사 (항상 최신으로 덮어씀 — 적응한 사본)
  const to = path.join(jd, 'pdmaker');
  fs.mkdirSync(to, { recursive: true });
  // 예전 버전에만 있던 파일은 지움 (남아 있으면 컴파일 오류)
  // 내용이 빈(클래스가 없는) 파일은 "지워진 파일" 표시로 보고 복사하지 않음
  const want = new Set(Object.keys(ad.files).filter(f => !f.includes('/')));
  for (const f of fs.readdirSync(to)) if (f.endsWith('.java') && !want.has(f)) { fs.rmSync(path.join(to, f)); log(`예전 파일 지움: ${f}`); }
  let n = 0;
  for (const f of want) { const fp = path.join(to, f); if (!fs.existsSync(fp) || fs.readFileSync(fp, 'utf8') !== ad.files[f]) fs.writeFileSync(fp, ad.files[f], 'utf8'); n++; }
  log(`pdmaker 패키지 복사: ${n}개 파일 → ${to}`);
  // 2) 연결 줄 (이미 있으면 건너뜀)
  const results = [];
  const byFile = {};
  for (const p of PATCHES) (byFile[p.file] = byFile[p.file] || []).push(p);
  const pp = planPatches(repo);
  for (const [f, all] of Object.entries(byFile)) {
    const fp = patchFile(repo, f);
    for (const p of all) {
      const st = pp.get(p).state;
      if (st === 'optional') results.push({ file: f, name: p.name, status: '건너뜀 — 이 저장소에 없는 파일 (선택)' });
      else if (st === 'nofile') results.push({ file: f, name: p.name, status: '파일 없음 — INTEGRATION.md 참고' });
      else if (st === 'na') results.push({ file: f, name: p.name, status: '해당 없음 — 이 게임에는 이 기능이 붙을 구조가 없음' });
      else if (st === 'alt') results.push({ file: f, name: p.name, status: '대안 — 같은 기능을 다른 자리에 넣음' });
    }
    const list = all.filter(p => ['apply', 'missing'].includes(pp.get(p).state));
    if (!fs.existsSync(fp) || !list.length) continue;
    const before = fs.readFileSync(fp, 'utf8');
    // 예전에 넣은 연결 줄은 지우고 새 위치에 다시 넣음 (에디터 업데이트 시 위치가 바뀔 수 있음)
    let src = before.split('\n').filter(l => !l.includes(MARK)).join('\n');
    let changed = src !== before;
    for (const p of list) {
      const had = before.includes(p.line);
      const r = applyPatch(src, p);
      if (r.ok) { src = r.src; changed = true; results.push({ file: f, name: p.name, status: had ? '갱신함' : '추가함' }); }
      else results.push({ file: f, name: p.name, status: '위치를 찾지 못함 — INTEGRATION.md 를 보고 직접 추가하세요' });
    }
    if (changed && src !== before) {
      if (!fs.existsSync(fp + '.pdmaker-backup')) fs.writeFileSync(fp + '.pdmaker-backup', before.split('\n').filter(l => !l.includes(MARK)).join('\n'), 'utf8');
      fs.writeFileSync(fp, src, 'utf8');
    }
  }
  results.forEach(r => log(`  [${r.status}] ${r.file} — ${r.name}`));
  if (projectDir) generate(repo, projectDir, log);
  return results;
}

/** 설치된 런타임이 이 에디터 · 이 저장소에 맞춘 것과 같은지 → { pkg, upToDate, reason, hooks, need }
 *  11차: 비교 기준은 "이 저장소에 맞춰 적응한 사본" (판마다 런타임 사본이 원본과 다를 수 있음) · 연결 줄은 이 저장소에서 넣을 수 있는 것만 셈 */
function state(repo, runtimeSrc) {
  const pkgDir = path.join(javaDir(repo), 'pdmaker');
  const from = path.join(runtimeSrc || path.join(__dirname, '..', 'runtime', 'src'), ...JAVA_ROOT.slice(-3), 'pdmaker');
  if (!fs.existsSync(pkgDir)) return { pkg: false, upToDate: false, reason: 'pdmaker 패키지 없음' };
  const ad = adapt.adaptRuntime(repo, from);
  const want = Object.keys(ad.files).filter(f => !f.includes('/'));
  if (fs.readdirSync(pkgDir).some(f => f.endsWith('.java') && !want.includes(f))) return { pkg: true, upToDate: false, reason: '예전 파일이 남아 있음' };
  for (const f of want) {
    const t = path.join(pkgDir, f);
    if (!fs.existsSync(t) || fs.readFileSync(t, 'utf8') !== ad.files[f]) return { pkg: true, upToDate: false, reason: f + ' 이(가) 예전 것' };
  }
  let hooks = 0;
  for (const f of [...new Set(PATCHES.map(p => p.file))]) { const fp = patchFile(repo, f); if (fs.existsSync(fp)) hooks += fs.readFileSync(fp, 'utf8').split(MARK).length - 1; }
  const need = [...planPatches(repo).values()].filter(v => v.state === 'apply').length;
  if (hooks < need) return { pkg: true, upToDate: false, reason: `연결 줄 ${hooks}/${need}`, hooks, need };
  return { pkg: true, upToDate: true, hooks, need };
}

/** 게임 이름 · 패키지 이름 (프로젝트 설정 project.game) → 게임 저장소 맨 위 build.gradle 의 appName · appPackageName.
 *  데스크톱 세이브 폴더가 이 둘로 정해짐: %APPDATA%\.<패키지 둘째 마디>\<게임 이름>\  (DesktopLauncher 의 basePath)
 *  게임 이름을 따로 정하지 않았고 저장소가 원작 이름 그대로면 프로젝트 이름을 써서 원작 세이브와 섞이지 않게 함. 처음 고칠 때 build.gradle.pdmaker-backup 을 남김 */
const ORIGINAL_APP = 'Shattered Pixel Dungeon';
function gameId(projectDir) {
  let p = {}; try { p = JSON.parse(fs.readFileSync(path.join(projectDir, 'project.json'), 'utf8')); } catch (_) { /* 없음 */ }
  const g = p.game || {};
  const clean = s => String(s || '').replace(/['"\\\r\n]/g, '').replace(/[<>:/|?*]/g, ' ').trim();
  const pkg = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(String(g.appPackageName || '').trim()) ? g.appPackageName.trim() : '';
  // 따로 정하지 않았을 때 쓸 이름: 프로젝트 이름이 영문이면 그대로, 아니면 "PDMaker <폴더 이름>" (build.gradle 에 한글을 넣으면 PC 에 따라 깨질 수 있음)
  const ascii = s => /^[\x20-\x7e]+$/.test(s);
  const folder = path.basename(projectDir).replace(/[^\x20-\x7e]/g, '').replace(/['"\\<>:/|?*]/g, ' ').trim();
  return { appName: clean(g.appName), appPackageName: pkg, projectName: ascii(clean(p.name)) ? clean(p.name) : 'PDMaker ' + (folder || 'Game') };
}
function applyGameId(repo, projectDir, log = console.log) {
  const fp = path.join(repo, 'build.gradle');
  if (!projectDir || !fs.existsSync(fp)) return null;
  const want = gameId(projectDir), before = fs.readFileSync(fp, 'utf8');
  const cur = { appName: (/appName\s*=\s*'([^']*)'/.exec(before) || [])[1], appPackageName: (/appPackageName\s*=\s*'([^']*)'/.exec(before) || [])[1] };
  const name = want.appName || (cur.appName === ORIGINAL_APP && want.projectName && want.projectName !== ORIGINAL_APP ? want.projectName : '');
  let s = before;
  if (name && cur.appName !== undefined && name !== cur.appName) s = s.replace(/(appName\s*=\s*')[^']*(')/, (m, a, b) => a + name + b);
  if (want.appPackageName && cur.appPackageName !== undefined && want.appPackageName !== cur.appPackageName) s = s.replace(/(appPackageName\s*=\s*')[^']*(')/, (m, a, b) => a + want.appPackageName + b);
  if (s !== before) {
    if (!fs.existsSync(fp + '.pdmaker-backup')) fs.writeFileSync(fp + '.pdmaker-backup', before, 'utf8');
    fs.writeFileSync(fp, s, 'utf8');
    log(`build.gradle: 게임 이름 '${name || cur.appName}' · 패키지 '${want.appPackageName || cur.appPackageName}' (세이브 폴더가 이 이름으로 따로 생깁니다)`);
  }
  return { appName: name || cur.appName, appPackageName: want.appPackageName || cur.appPackageName };
}

module.exports = { install, uninstall, generate, patchFile, PATCHES, MARK, applyGameId, gameId, compat, missingClasses, plan, planPatches, state };

if (require.main === module) {
  const [repo, flag] = process.argv.slice(2);
  if (!repo) { console.log('사용법: node runtime-installer.js <게임저장소> [--uninstall | --install <프로젝트폴더>]'); process.exit(1); }
  if (flag === '--uninstall') uninstall(path.resolve(repo));
  else install(path.resolve(repo), path.join(__dirname, '..', 'runtime', 'src'), console.log, process.argv[4] ? path.resolve(process.argv[4]) : null);
}
