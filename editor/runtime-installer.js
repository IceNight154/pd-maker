// ================================================================
//  게임 런타임 설치기 — pdmaker 패키지를 게임 저장소에 넣고, 원본 코드 21개 파일에 연결 줄 43개를 추가합니다.
//  · 추가한 줄에는 모두 "// >>> pdmaker" 표시가 붙어 있어서, 제거(uninstall)하면 깨끗이 되돌아갑니다.
//  · 원본 줄은 고치거나 지우지 않습니다 (줄을 "추가"만 함).
//  사용: node runtime-installer.js <게임저장소> [--uninstall]   또는 main.js 에서 require
// ================================================================
const fs = require('fs');
const path = require('path');

const PKG = 'com.shatteredpixel.shatteredpixeldungeon.pdmaker';
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
    anchor: /\n([ \t]*)Dungeon\.level\.playLevelMusic\(\);[^\n]*\n/, where: 'after', line: `${PKG}.MakerRuntime.beforeScene();` },
  { file: 'scenes/InterlevelScene.java', name: '소개 화면: 로딩 배경 그림',
    anchor: /\n([ \t]*)background = new Image\(\s*loadingAsset\s*\);/, where: 'before', line: `loadingAsset = ${PKG}.MakerRuntime.splash(loadingAsset);` },
  { file: 'scenes/InterlevelScene.java', name: '소개 화면: 구역 이야기 글',
    anchor: /\n([ \t]*)if \(mode == Mode\.DESCEND && lastRegion <= 5/, where: 'before', line: `{ int[] pdmS = ${PKG}.MakerRuntime.storyGate(loadingDepth, lastRegion); loadingDepth = pdmS[0]; lastRegion = pdmS[1]; }` },
  { file: 'Dungeon.java', name: '플레이어 스폰 위치 (맵에 놓은 시작 위치 오브젝트)',
    anchor: /public static void switchLevel\(\s*final Level level,\s*int pos\s*\)\s*\{[^\n]*\n/, where: 'after', line: `pos = ${PKG}.LevelHooks.heroSpawn(level, pos);` },
  { file: 'Badges.java', name: '게임 원래 배지의 얻는 조건 끄기 · 바꾸기',
    anchor: /private static void displayBadge\(\s*Badge badge\s*\)\s*\{[^\n]*\n/, where: 'after', line: `if (badge != null && ${PKG}.MakerBadges.blocked(badge.name())) { local.remove(badge); return; }` },
  { file: 'levels/Level.java', name: '잠긴 맵 (조건이 맞아야 들어감)',
    anchor: /public boolean activateTransition\(\s*Hero hero,\s*LevelTransition transition\s*\)\s*\{[^\n]*\n/, where: 'after', line: `if (${PKG}.LevelHooks.lockedNode(transition)) return false;` },
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
  { file: 'actors/mobs/MobSpawner.java', name: '등장 금지한 몬스터 빼기',
    anchor: /\n([ \t]*)Random\.shuffle\(mobs\);/, where: 'before', line: `${PKG}.MakerDrops.filterMobs(mobs);` },
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
    anchor: /\n([ \t]*)pane = new TalentsPane\(\s*TalentButton\.Mode\.UPGRADE\s*\);[^\n]*\n/, where: 'after',
    line: `{ TalentsPane pdmPane = ${PKG}.MakerTalentsPane.forHero(); if (pdmPane != null) { pane.destroy(); pane = pdmPane; } }` },
  { file: 'actors/hero/Hero.java', name: '특성 포인트 (영웅 편집기 특성을 쓰면 그 포인트로)',
    anchor: /public int talentPointsAvailable\(\s*int tier\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ int pdmT = ${PKG}.MakerTalents.nativeOverride(tier); if (pdmT >= 0) return pdmT; }` },
  // ---- 전직 · 직업 능력 (영웅 편집기의 subclasses · abilities) ----
  { file: 'actors/hero/HeroClass.java', name: '직업 능력: 왕관으로 고르는 목록 → 영웅 편집기의 직업 능력',
    anchor: /public ArmorAbility\[\] armorAbilities\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ ArmorAbility[] pdmA = ${PKG}.MakerAbilities.armorAbilities(this); if (pdmA != null) return pdmA; }` },
  { file: 'items/TengusMask.java', name: '전직: 텐구의 가면 → 영웅 편집기의 전직',
    anchor: /\n([ \t]*)GameScene\.show\(\s*new WndChooseSubclass\(\s*this,\s*hero\s*\)\s*\);/, where: 'before',
    line: `if (${PKG}.MakerAbilities.chooseSubclass(this, hero)) return;` },
  { file: 'actors/hero/Hero.java', name: '전직 이름 (영웅 정보 창)',
    anchor: /public String className\(\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ String pdmN = ${PKG}.MakerAbilities.className(this); if (pdmN != null) return pdmN; }` },
  { file: 'scenes/PixelScene.java', name: '게임 그림 바꾸기(assets/game) · 메뉴 화면 배경·음악',
    anchor: /\n([ \t]*)float minWidth, minHeight, scaleFactor;/, where: 'before', line: `${PKG}.MakerAssets.onSceneCreate(this);` },
  { file: 'scenes/HeroSelectScene.java', name: '영웅 선택 화면: 게임 직업 대신 프로젝트 영웅 버튼',
    anchor: /\n([ \t]*)for \(HeroClass cl : HeroClass\.values\(\)\)\s*\{/, where: 'before',
    line: `if (!${PKG}.HeroSelect.addButtons(this, heroBtns))` },
  // ---- 초상화: 영웅 편집기의 그림 (상태 창 · 영웅 창 · 저장 슬롯) ----
  { file: 'sprites/HeroSprite.java', name: '초상화: 영웅 편집기의 그림 (상태 창 · 영웅 창)',
    anchor: /public static Image avatar\(\s*Hero hero\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `{ Image pdmA = ${PKG}.HeroRuntime.avatar(hero); if (pdmA != null) return pdmA; }` },
  { file: 'Dungeon.java', name: '저장 슬롯: 어떤 영웅인지 읽기',
    anchor: /\n([ \t]*)Statistics\.preview\(\s*info,\s*bundle\s*\);[^\n]*\n/, where: 'after', line: `${PKG}.HeroRuntime.preview(info, bundle);` },
  { file: 'GamesInProgress.java', name: '저장 슬롯: 지금 영웅 기억 (저장할 때)',
    anchor: /public static void set\(\s*int slot\s*\)\s*\{[^\n]*\n/, where: 'after', line: `${PKG}.HeroRuntime.setSlot(slot);` },
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
  { file: 'items/Item.java', name: '아이템 소리: 행동 버튼 (사용·던지기·장착)',
    anchor: /public void execute\(\s*Hero hero,\s*String action\s*\)\s*\{[^\n]*\n/, where: 'after',
    line: `${PKG}.MakerAudio.onItemAction(this, action);` },
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
  // 저장소 최상위 파일 (root: true). 안드로이드 SDK 가 없는 PC 에서도 데스크톱 빌드가 되도록 :android 모듈은 SDK 가 있을 때만 포함
  { file: 'settings.gradle', root: true, name: '안드로이드 SDK 가 없으면 android 모듈 건너뛰기 (다른 PC 에서 테스트 플레이)',
    anchor: /\n([ \t]*)include ':android'/, where: 'before',
    line: `if ({ def s = System.getenv('ANDROID_HOME') ?: System.getenv('ANDROID_SDK_ROOT'); def lp = new File(settingsDir, 'local.properties'); if (!s && lp.exists()) { def pp = new Properties(); lp.withInputStream { pp.load(it) }; s = pp.getProperty('sdk.dir') }; s != null && new File(s.toString()).exists() }())` },
  { file: 'scenes/InterlevelScene.java', name: '층을 떠날 때 (감정 결정화·일기)',
    anchor: /public void create\(\)\s*\{\s*\n([ \t]*)super\.create\(\);[^\n]*\n/, where: 'after',
    line: `if (com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero != null && (mode == Mode.DESCEND || mode == Mode.ASCEND || mode == Mode.FALL || mode == Mode.RETURN)) ${PKG}.MakerRuntime.onFloorLeave();` }
];

function javaDir(repo) { return path.join(repo, ...JAVA_ROOT); }
/** 연결 줄을 넣을 파일의 실제 경로 (root: true 면 저장소 최상위 기준) */
function patchFile(repo, file) { return PATCHES.some(p => p.file === file && p.root) ? path.join(repo, file) : path.join(javaDir(repo), file); }

function applyPatch(src, p) {
  let m = null;
  for (const a of [].concat(p.anchor)) { m = a.exec(src); if (m) break; }
  if (!m) return { src, ok: false };
  // 들여쓰기: 캡처 그룹이 있으면 그것, 없으면 다음 줄 기준 두 탭
  let indent = m[1] !== undefined ? m[1] : '\t\t';
  if (p.where === 'before') {
    const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
    return { src: src.slice(0, at) + `${indent}${p.line} ${MARK}\n` + src.slice(at), ok: true };
  }
  const at = m.index + m[0].length;
  if (m[1] === undefined) { const next = src.slice(at).match(/^[ \t]*/); indent = next && next[0] ? next[0] : '\t\t'; }
  return { src: src.slice(0, at) + `${indent}${p.line} ${MARK}\n` + src.slice(at), ok: true };
}

function uninstall(repo, log = console.log) {
  const jd = javaDir(repo);
  const files = [...new Set(PATCHES.map(p => p.file))];
  for (const f of files) {
    const fp = patchFile(repo, f);
    if (!fs.existsSync(fp)) continue;
    const src = fs.readFileSync(fp, 'utf8');
    const out = src.split('\n').filter(l => !l.includes(MARK)).join('\n');
    if (out !== src) { fs.writeFileSync(fp, out, 'utf8'); log(`연결 줄 제거: ${f}`); }
    if (fs.existsSync(fp + '.pdmaker-backup')) fs.rmSync(fp + '.pdmaker-backup');
  }
  const pkgDir = path.join(jd, 'pdmaker');
  if (fs.existsSync(pkgDir)) { fs.rmSync(pkgDir, { recursive: true }); log('pdmaker 패키지 제거'); }
}

/** 프로젝트의 영웅·아이템 → pdmaker/gen/*.java · 아이템은 gen/items/<분류>/<세부 종류>/ (바뀐 파일만 씀). 돌려줌: 파일 수 */
function generate(repo, projectDir, log = console.log) {
  const codegen = require('./renderer/js/codegen');
  const gen = path.join(javaDir(repo), 'pdmaker', 'gen');
  const readAll = dir => { const d = path.join(projectDir, dir); if (!fs.existsSync(d)) return []; return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { log(`읽기 실패 ${dir}/${f}: ${e.message}`); return null; } }).filter(Boolean); };
  const files = projectDir ? codegen.generate(readAll('heroes'), readAll('items')) : {};
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

function install(repo, runtimeSrc, log = console.log, projectDir = null) {
  const jd = javaDir(repo);
  if (!fs.existsSync(path.join(jd, 'Dungeon.java'))) throw new Error('게임 저장소가 아닙니다 (Dungeon.java 없음): ' + repo);
  // 1) 패키지 복사 (항상 최신으로 덮어씀)
  const from = path.join(runtimeSrc, 'com', 'shatteredpixel', 'shatteredpixeldungeon', 'pdmaker');
  const to = path.join(jd, 'pdmaker');
  fs.mkdirSync(to, { recursive: true });
  // 예전 버전에만 있던 파일은 지움 (남아 있으면 컴파일 오류)
  // 내용이 빈(클래스가 없는) 파일은 "지워진 파일" 표시로 보고 복사하지 않음
  const want = new Set(fs.readdirSync(from).filter(f => f.endsWith('.java') && /\bclass\s/.test(fs.readFileSync(path.join(from, f), 'utf8'))));
  for (const f of fs.readdirSync(to)) if (f.endsWith('.java') && !want.has(f)) { fs.rmSync(path.join(to, f)); log(`예전 파일 지움: ${f}`); }
  let n = 0;
  for (const f of want) { fs.copyFileSync(path.join(from, f), path.join(to, f)); n++; }
  log(`pdmaker 패키지 복사: ${n}개 파일 → ${to}`);
  // 2) 연결 줄 (이미 있으면 건너뜀)
  const results = [];
  const byFile = {};
  for (const p of PATCHES) (byFile[p.file] = byFile[p.file] || []).push(p);
  for (const [f, list] of Object.entries(byFile)) {
    const fp = patchFile(repo, f);
    if (!fs.existsSync(fp)) { list.forEach(p => results.push({ file: f, name: p.name, status: '파일 없음 — INTEGRATION.md 참고' })); continue; }
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

module.exports = { install, uninstall, generate, patchFile, PATCHES, MARK, applyGameId, gameId };

if (require.main === module) {
  const [repo, flag] = process.argv.slice(2);
  if (!repo) { console.log('사용법: node runtime-installer.js <게임저장소> [--uninstall | --install <프로젝트폴더>]'); process.exit(1); }
  if (flag === '--uninstall') uninstall(path.resolve(repo));
  else install(path.resolve(repo), path.join(__dirname, '..', 'runtime', 'src'), console.log, process.argv[4] ? path.resolve(process.argv[4]) : null);
}
