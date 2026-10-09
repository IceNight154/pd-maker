/** 테스트 스크립트용 명령 (eval:<name>) */
public class Hooks {
	/** 대상이 있는 시전이면 가장 가까운 적 옆으로 순간이동하고 그 적의 칸을 돌려줌 */
	static int nearEnemy(com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h, String target) {
		if (target.equals("self")) return h.pos;
		com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob best = null;
		for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) if (m.alignment == com.shatteredpixel.shatteredpixeldungeon.actors.Char.Alignment.ENEMY && !(m instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.NPC)) { best = m; break; }
		if (best == null) { System.out.println("[TEST] no enemy"); return h.pos; }
		for (int o : com.watabou.utils.PathFinder.NEIGHBOURS8) { int c2 = best.pos + o; if (com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.passable[c2] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c2) == null) { com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfTeleportation.appear(h, c2); break; } }
		com.shatteredpixel.shatteredpixeldungeon.Dungeon.observe();
		System.out.println("[TEST] target " + best.name() + " HP " + best.HP);
		return best.pos;
	}
	static void walk(com.watabou.noosa.Gizmo g, java.util.List<com.watabou.noosa.Gizmo> out) {
		if (g == null || !g.exists) return;
		out.add(g);
		if (g instanceof com.watabou.noosa.Group) try {
			java.lang.reflect.Field f = com.watabou.noosa.Group.class.getDeclaredField("members"); f.setAccessible(true);
			for (Object o : new java.util.ArrayList<>((java.util.List<?>) f.get(g))) if (o instanceof com.watabou.noosa.Gizmo) walk((com.watabou.noosa.Gizmo) o, out);
		} catch (Exception e) { e.printStackTrace(); }
	}
	static void eval(final String code) {
		try {
			if (code.startsWith("event:")) { com.shatteredpixel.shatteredpixeldungeon.pdmaker.EventInterpreter.run(new com.badlogic.gdx.utils.JsonReader().parse(code.substring(6).replace(";", ",")), null, null); return; }
			String[] p = code.split(",");
			switch (p[0]) {
				case "interact": { // interact,<캐릭터id>[,menu] — 게임(actor) 스레드처럼 다른 스레드에서 말 걸기
					for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs)
						if (m instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC && ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) m).charId.equals(p[1])) {
							final com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob mm = m;
							Thread t = new Thread(() -> { try { if (p.length > 2) System.out.println("[TEST] heartMenu " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartMenu.show((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) mm)); else mm.interact(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero); System.out.println("[TEST] interact ok " + p[1]); } catch (Throwable e) { System.out.println("[TEST] interact FAIL " + e); } });
							t.start(); t.join();
						}
					break;
				}
				case "press": case "slot": { // press,<글자 일부> — 화면·창의 버튼 누르기 / slot,<n> — 저장 슬롯 누르기
					java.util.List<com.watabou.noosa.Gizmo> all = new java.util.ArrayList<>();
					walk(com.watabou.noosa.Game.scene(), all);
					int si = 0;
					for (com.watabou.noosa.Gizmo g : all) {
						if (!(g instanceof com.shatteredpixel.shatteredpixeldungeon.ui.Button) || !g.visible || !((com.shatteredpixel.shatteredpixeldungeon.ui.Button) g).active) continue;
						String label = g instanceof com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton ? String.valueOf(((com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton) g).text()) : g.getClass().getSimpleName();
						boolean hit = p[0].equals("slot") ? g.getClass().getSimpleName().equals("SaveSlotButton") && ++si == Integer.parseInt(p[1]) : (label + " " + g.getClass().getName()).contains(p[1]);
						if (!hit) continue;
						System.out.println("[TEST] press " + g.getClass().getName() + " '" + label + "'");
						java.lang.reflect.Method m = com.shatteredpixel.shatteredpixeldungeon.ui.Button.class.getDeclaredMethod("onClick"); m.setAccessible(true); m.invoke(g);
						break;
					}
					break;
				}
				case "buttons": { // 보이는 버튼 목록
					java.util.List<com.watabou.noosa.Gizmo> all = new java.util.ArrayList<>();
					walk(com.watabou.noosa.Game.scene(), all);
					for (com.watabou.noosa.Gizmo g : all) if (g instanceof com.shatteredpixel.shatteredpixeldungeon.ui.Button && g.visible)
						System.out.println("[TEST] button " + g.getClass().getName() + (g instanceof com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton ? " '" + ((com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton) g).text() + "'" : ""));
					break;
				}
				case "savetitle": // 게임 메뉴의 "메인 메뉴"처럼: 저장하고 타이틀로
					com.shatteredpixel.shatteredpixeldungeon.Dungeon.saveAll();
					com.watabou.noosa.Game.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.TitleScene.class);
					break;
				case "leavetalk": { // 층을 떠나는 순간 대사 이벤트 (층 이동 화면에서 창이 뜨려는 경우 확인)
					com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition t = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getTransition(com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type.REGULAR_EXIT);
					if (t == null) t = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getTransition(com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition.Type.REGULAR_ENTRANCE);
					com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos = t.cell();
					com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.activateTransition(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero, t);
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.EventInterpreter.run(new com.badlogic.gdx.utils.JsonReader().parse("[{\"cmd\":\"text\",\"speaker\":\"mireille\",\"text\":\"층을 옮기는 중에 나온 대사\"}]"), null, null);
					System.out.println("[TEST] leavetalk scene=" + com.watabou.noosa.Game.scene().getClass().getSimpleName());
					break;
				}
				case "touch": { // touch,<화면x>,<화면y> — 진짜 마우스 누르기처럼 (입력 처리기로 보냄)
					int x = Integer.parseInt(p[1]), y = Integer.parseInt(p[2]);
					com.badlogic.gdx.InputProcessor ip = com.badlogic.gdx.Gdx.input.getInputProcessor();
					ip.touchDown(x, y, 0, 0); ip.touchUp(x, y, 0, 0);
					System.out.println("[TEST] touch " + x + "," + y);
					break;
				}
				case "wnds": { // 떠 있는 창 정보 (보이는지 · 카메라 위치)
					java.util.List<com.watabou.noosa.Gizmo> all = new java.util.ArrayList<>();
					walk(com.watabou.noosa.Game.scene(), all);
					for (com.watabou.noosa.Gizmo g : all) if (g instanceof com.shatteredpixel.shatteredpixeldungeon.ui.Window) {
						com.watabou.noosa.Camera c = g.camera;
						System.out.println("[TEST] wnd " + g.getClass().getName() + " visible=" + g.visible + " alive=" + g.alive + " cam=" + (c == null ? null : c.x + "," + c.y + " " + c.width + "x" + c.height + " z" + c.zoom + " vis=" + c.visible));
					}
					java.lang.reflect.Field cf = com.watabou.noosa.Camera.class.getDeclaredField("all"); cf.setAccessible(true);
					java.util.List<?> cams = (java.util.List<?>) cf.get(null);
					for (Object o : cams) { com.watabou.noosa.Camera c = (com.watabou.noosa.Camera) o; System.out.println("[TEST] camera " + c.x + "," + c.y + " " + c.width + "x" + c.height + " z" + c.zoom + " vis=" + c.visible); }
					java.lang.reflect.Field mf = com.watabou.noosa.Group.class.getDeclaredField("members"); mf.setAccessible(true);
					for (Object o : (java.util.List<?>) mf.get(com.watabou.noosa.Game.scene())) if (o != null) System.out.println("[TEST] member " + o.getClass().getName() + " vis=" + ((com.watabou.noosa.Gizmo) o).visible + " cam=" + (((com.watabou.noosa.Gizmo) o).camera == null ? "-" : ((com.watabou.noosa.Gizmo) o).camera.x + "," + ((com.watabou.noosa.Gizmo) o).camera.y));
					System.out.println("[TEST] scene=" + com.watabou.noosa.Game.scene().getClass().getSimpleName());
					break;
				}
				case "stair": { // stair,<칸> — 그 칸의 계단으로 층 이동 (밟은 것처럼)
					com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition t = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getTransition(Integer.parseInt(p[1]));
					if (t == null) { System.out.println("[TEST] no stair at " + p[1]); break; }
					System.out.println("[TEST] take stair " + p[1] + " " + t.type + " -> d" + t.destDepth + " b" + t.destBranch);
					com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos = t.cell();
					com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.activateTransition(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero, t);
					break;
				}
				case "door": { // door,<연결id>,<out|in> — 현재 층에서 그 통로 계단으로 이동
					int c = com.shatteredpixel.shatteredpixeldungeon.pdmaker.WorldGraph.portCell(com.shatteredpixel.shatteredpixeldungeon.Dungeon.level, p[1], p[2]);
					System.out.println("[TEST] door " + p[1] + " " + p[2] + " cell=" + c);
					if (c >= 0) eval("stair," + c);
					break;
				}
				case "itemimg": { // 가방 아이템들의 그림 번호 · 시트 칸
					com.watabou.noosa.TextureFilm film = com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.film;
					com.watabou.gltextures.SmartTexture tx = com.watabou.gltextures.TextureCache.get(com.shatteredpixel.shatteredpixeldungeon.Assets.Sprites.ITEMS);
					System.out.println("[TEST] items tex " + tx.width + "x" + tx.height);
					for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.belongings) {
						com.watabou.utils.RectF r = film.get(it.image());
						System.out.println("[TEST] item " + it.getClass().getSimpleName() + " '" + it.name() + "' img=" + it.image() + " rect=" + (r == null ? null : r.left * tx.width + "," + r.top * tx.height + " " + film.width(r) + "x" + film.height(r)));
					}
					com.shatteredpixel.shatteredpixeldungeon.items.Item f = new com.shatteredpixel.shatteredpixeldungeon.items.food.Food();
					System.out.println("[TEST] Food img=" + f.image() + " rect=" + film.get(f.image()));
					com.watabou.utils.RectF r0 = film.get(com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet.SEED_SUNGRASS);
					System.out.println("[TEST] sungrass rect=" + r0.left * tx.width + "," + r0.top * tx.height + " " + film.width(r0) + "x" + film.height(r0));
					break;
				}
				case "dropitems": { // 영웅 옆에 아이템 떨어뜨리기: dropitems,<id>,<id>… (프로젝트 id 또는 spd:경로)
					int base = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos, w = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width();
					int[] offs = {1, -1, w, -w, w + 1, w - 1, -w + 1, -w - 1};
					for (int i = 1; i < p.length; i++) {
						com.shatteredpixel.shatteredpixeldungeon.items.Item it = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[i]);
						if (it == null) continue;
						final com.shatteredpixel.shatteredpixeldungeon.items.Item fit = it; final int c = base + offs[(i - 1) % offs.length];
						com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.drop(fit, c).sprite.drop(c);
					}
					break;
				}
				case "buffs": { System.out.println("[TEST] buffs " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.buffs() + " action=" + com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator.action + " ready=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerActive.isReady()); break; }
				case "iconidx": { // 직접 지정한 아이콘 번호 · hero_icons 크기
					com.watabou.gltextures.SmartTexture tx = com.watabou.gltextures.TextureCache.get(com.shatteredpixel.shatteredpixeldungeon.Assets.Interfaces.HERO_ICONS);
					com.badlogic.gdx.utils.JsonValue hd = com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.data();
					System.out.println("[TEST] heroicons " + tx.width + "x" + tx.height + " sub0=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.iconOf(hd.get("subclasses").get(0), 0) + " active=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.iconOf(hd.get("subclasses").get(0).get("active"), 0) + " abil0=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.iconOf(hd.get("abilities").get(0), 0));
					break;
				}
				case "herospr": { // 영웅 스프라이트 크기
					com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite sp = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.sprite;
					System.out.println("[TEST] herospr tier=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.tier() + " tex=" + sp.texture.width + "x" + sp.texture.height + " frame=" + sp.frame() + " w=" + sp.width + " h=" + sp.height + " scale=" + sp.scale.x + " flying=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.flying);
					break;
				}
				case "wear": { // wear,<갑옷 클래스 armor.PlateArmor> — 갑옷 입기 (updateArmor 확인)
					try {
						com.shatteredpixel.shatteredpixeldungeon.items.armor.Armor a = (com.shatteredpixel.shatteredpixeldungeon.items.armor.Armor) Class.forName("com.shatteredpixel.shatteredpixeldungeon.items." + p[1]).getDeclaredConstructor().newInstance();
						a.identify(); a.collect(); a.doEquip(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero);
						System.out.println("[TEST] wore " + p[1]);
					} catch (Exception e) { System.out.println("[TEST] wear FAIL " + e); }
					break;
				}
				case "hud": { // uiCamera 로 그리는 것들의 보임 여부
					java.lang.reflect.Field mf = com.watabou.noosa.Group.class.getDeclaredField("members"); mf.setAccessible(true);
					int vis = 0, hid = 0; StringBuilder sb = new StringBuilder();
					for (Object o : (java.util.List<?>) mf.get(com.watabou.noosa.Game.scene())) if (o != null && ((com.watabou.noosa.Gizmo) o).camera == com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene.uiCamera) {
						if (((com.watabou.noosa.Gizmo) o).visible) { vis++; sb.append(o.getClass().getSimpleName()).append(' '); } else { hid++; sb.append('!').append(o.getClass().getSimpleName()).append(' '); }
					}
					System.out.println("[TEST] hud visible=" + vis + " hidden=" + hid + " : " + sb);
					break;
				}
				case "spawn": { // 몬스터 스폰 정보
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					int n = 0; StringBuilder sb = new StringBuilder();
					for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : l.mobs) if (!(m instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.NPC)) { n++; sb.append(m.name()).append('@').append(m.pos % l.width()).append(',').append(m.pos / l.width()).append(' '); }
					System.out.println("[TEST] spawn limit=" + l.mobLimit() + " cooldown=" + l.respawnCooldown() + " mobs=" + n + " : " + sb);
					if (p.length > 1) for (int i = 0; i < Integer.parseInt(p[1]); i++) { int c = l.randomRespawnCell(null); System.out.print((c < 0 ? "-" : (c % l.width()) + "," + (c / l.width())) + " "); }
					System.out.println();
					if (p.length > 2) for (int i = 0; i < Integer.parseInt(p[2]); i++) System.out.println("[TEST] spawnMob " + l.spawnMob(0));
					break;
				}
				case "itemsnd": { // itemsnd,<게임 아이템 경로 wands.WandOfX 또는 프로젝트 id>,<행동>
					com.shatteredpixel.shatteredpixeldungeon.items.Item it;
					try { it = (com.shatteredpixel.shatteredpixeldungeon.items.Item) Class.forName("com.shatteredpixel.shatteredpixeldungeon.items." + p[1]).getDeclaredConstructor().newInstance(); }
					catch (Exception e) { it = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]); }
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe = "";
					if (p[2].equals("HIT")) { ((com.shatteredpixel.shatteredpixeldungeon.items.KindOfWeapon) it).hitSound(1f); }
					else if (p[2].equals("LAND")) { com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.onItemLandGround(it, 0); }
					else if (p[2].equals("LANDHIT")) { com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.onItemLandHit(it, 0); com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe += "+"; ((com.shatteredpixel.shatteredpixeldungeon.items.KindOfWeapon) it).hitSound(1f); }
					else 					if (p[2].equals("PICKUP")) System.out.println("[TEST] pickup replaced=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.onItemPickup(it));
					else com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.onItemAction(it, p[2]);
					System.out.println("[TEST] itemsnd " + p[1] + " " + p[2] + " -> '" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe + "'");
					break;
				}
				case "avatar": { com.watabou.noosa.Image a = com.shatteredpixel.shatteredpixeldungeon.sprites.HeroSprite.avatar(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero); System.out.println("[TEST] avatar tex=" + a.texture.width + "x" + a.texture.height + " w=" + a.width + " h=" + a.height); break; }
				case "catalog": { for (com.shatteredpixel.shatteredpixeldungeon.journal.Catalog c : com.shatteredpixel.shatteredpixeldungeon.journal.Catalog.values()) for (Class<?> k : c.items()) if (k.getName().contains(".pdmaker.gen.")) System.out.println("[TEST] catalog " + c + " " + k.getSimpleName() + " seen=" + com.shatteredpixel.shatteredpixeldungeon.journal.Catalog.isSeen(k)); break; }
				case "throwtest": { // throwtest — 다트에 "던지는 순간" 소리를 정하고: 던지기 버튼(execute) 때는 조용, 실제로 던질 때(cast) 남
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.items.Item d = new com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.darts.Dart();
					d.collect(h.belongings.backpack);
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe = "";
					d.execute(h, "THROW");
					System.out.println("[TEST] after THROW button: '" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe + "'");
					com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.handleCell(-1);
					d.cast(h, h.pos + 2);
					System.out.println("[TEST] after cast: '" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe + "'");
					break;
				}
				case "tplvar": { // tplvar,<n> — 지금 깊이의 하수도 층을 n번 만들어 방 템플릿(TemplateRoom)의 변형 번호와 실제 지형을 출력
					int n = Integer.parseInt(p[1]);
					for (int k = 0; k < n; k++) {
						com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel l = new com.shatteredpixel.shatteredpixeldungeon.levels.SewerLevel();
						long seed0 = com.shatteredpixel.shatteredpixeldungeon.Dungeon.seed;
						com.shatteredpixel.shatteredpixeldungeon.Dungeon.seed = seed0 + 7919L * (k + 1);   // 판마다 다른 씨앗 (같은 씨앗이면 같은 층)
						try { l.create(); } finally { com.shatteredpixel.shatteredpixeldungeon.Dungeon.seed = seed0; }
						for (com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room r : l.rooms()) {
							int var; String key;
							if (r instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.TemplateRoom) { var = ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.TemplateRoom) r).var; key = ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.TemplateRoom) r).templateKey; }
							else if (r instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.TemplateSpecialRoom) { var = ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.TemplateSpecialRoom) r).var; key = ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.TemplateSpecialRoom) r).templateKey; }
							else continue;
							StringBuilder sb = new StringBuilder("[TEST] tpl " + key + " var=" + var + " " + r.width() + "x" + r.height() + "\n");
							for (int y = r.top; y <= r.bottom; y++) { for (int x = r.left; x <= r.right; x++) { int t = l.map[x + y * l.width()]; sb.append(t == 4 ? '#' : t == 29 ? '~' : t == 2 ? '"' : t == 1 ? '.' : t == 5 || t == 6 ? 'D' : t == 25 ? 'S' : t == 14 ? '_' : '?'); } sb.append('\n'); }
							System.out.print(sb);
						}
					}
					break;
				}
				case "roomtest": { // roomtest,<id 목록 파일> — 게임 기본 방을 하나씩 "추가 방"으로 넣어 층을 만들어 봄
					com.badlogic.gdx.utils.JsonValue f = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerRuntime.here();
					if (f.get("procedural") == null) f.addChild("procedural", new com.badlogic.gdx.utils.JsonValue(com.badlogic.gdx.utils.JsonValue.ValueType.object));
					int ok = 0, bad = 0;
					for (String id : new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(p[1])), "UTF-8").split("\n")) {
						id = id.trim(); if (id.isEmpty()) continue;
						f.get("procedural").remove("rooms");
						f.get("procedural").addChild("rooms", new com.badlogic.gdx.utils.JsonReader().parse("[{\"room\":\"game:" + id + "\",\"count\":1,\"chance\":100,\"cond\":\"\"}]"));
						for (int tries = 0; tries < 30; tries++) try {
							com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getClass().getDeclaredConstructor().newInstance();
							l.create();
							boolean found = false; String cn = id.substring(id.lastIndexOf('.') + 1);
							for (com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room r : ((com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel) l).rooms()) if (r.getClass().getSimpleName().equals(cn)) found = true;
							if (found) ok++; else { bad++; System.out.println("[TEST] room MISSING " + id); }
							break;
						} catch (Throwable t) {
							if (tries < 29 && t.getStackTrace().length > 1 && t.getStackTrace()[1].getClassName().endsWith("GameScene")) continue;   // 화면 갱신(함정) — 테스트에서만 생김
							bad++; System.out.println("[TEST] room FAIL " + id + " " + t); t.printStackTrace(System.out); break; }
					}
					System.out.println("[TEST] roomtest ok=" + ok + " bad=" + bad + " level=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getClass().getSimpleName());
					break; }
				case "roomdump": { // roomdump,<쓸 수 있는 방 id 목록 파일>,<출력 파일> — 게임 기본 방을 실제로 만들어 지형을 뽑음 (편집기 미리보기용, 게임 화면 밖에서 실행)
					final String PK = "com.shatteredpixel.shatteredpixeldungeon.levels.";
					String[][] LV = { { "SewerLevel", "SEWER", "2" }, { "PrisonLevel", "PRISON", "7" }, { "CavesLevel", "CAVES", "12" }, { "CityLevel", "CITY", "17" }, { "HallsLevel", "HALLS", "22" }, { "SewerBossLevel", "SEWER", "5" } };
					java.util.Map<String, java.util.List<String>> got = new java.util.LinkedHashMap<>();
					java.util.Map<String, java.util.Set<String>> sizes = new java.util.HashMap<>();
					com.badlogic.gdx.utils.JsonValue f = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerRuntime.here();
					if (f.get("procedural") == null) f.addChild("procedural", new com.badlogic.gdx.utils.JsonValue(com.badlogic.gdx.utils.JsonValue.ValueType.object));
					java.util.List<String> ids = new java.util.ArrayList<>();
					for (String id : new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(p[1])), "UTF-8").split("\n")) if (!id.trim().isEmpty()) ids.add(id.trim());
					int depth0 = com.shatteredpixel.shatteredpixeldungeon.Dungeon.depth, fails = 0;
					// pass 0: 자연 생성 (지역마다 40번) · pass 1: 아직 표본이 모자란 방을 지역을 돌려 가며 강제로 추가
					for (int pass = 0; pass < 2; pass++) {
						int rounds = pass == 0 ? LV.length * 40 : ids.size() * 5;
						for (int n = 0; n < rounds; n++) {
							String[] lv = pass == 0 ? LV[n / 40] : LV[n % 5];
							f.get("procedural").remove("rooms");
							if (pass == 1) {
								String id = ids.get(n / 5);
								if (got.containsKey(id) && got.get(id).size() >= 3) continue;
								if (n % 5 == 0) { System.out.println("[TEST] force " + id); java.nio.file.Files.write(java.nio.file.Paths.get(p[2] + ".now"), id.getBytes("UTF-8")); }
								f.get("procedural").addChild("rooms", new com.badlogic.gdx.utils.JsonReader().parse("[{\"room\":\"game:" + id + "\",\"count\":1,\"chance\":100,\"cond\":\"\"}]"));
							}
							try {
								com.shatteredpixel.shatteredpixeldungeon.Dungeon.depth = pass == 0 ? Integer.parseInt(lv[2]) : depth0;   // 강제 추가는 지금 노드의 "추가 방"으로 (깊이를 바꾸면 다른 노드가 됨)
								com.shatteredpixel.shatteredpixeldungeon.levels.Level l = (com.shatteredpixel.shatteredpixeldungeon.levels.Level) Class.forName(PK + lv[0]).getDeclaredConstructor().newInstance();
								l.create();
								for (com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room r : ((com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel) l).rooms()) {
									String id = r.getClass().getName(); if (!id.startsWith(PK + "rooms.") || id.contains("$")) continue;
									id = id.substring((PK + "rooms.").length());
									java.util.List<String> g = got.computeIfAbsent(id, k -> new java.util.ArrayList<>());
									String sz = r.width() + "x" + r.height() + lv[1];
									if (g.size() >= 3 || !sizes.computeIfAbsent(id, k -> new java.util.HashSet<>()).add(g.size() < 1 ? "first" : sz)) continue;
									sizes.get(id).add(sz);
									StringBuilder sb = new StringBuilder("{\"id\":\"" + id + "\",\"theme\":\"" + lv[1] + "\",\"w\":" + r.width() + ",\"h\":" + r.height() + ",\"t\":[");
									for (int y = r.top; y <= r.bottom; y++) for (int x = r.left; x <= r.right; x++) sb.append(y == r.top && x == r.left ? "" : ",").append(l.map[x + y * l.width()]);
									sb.append("],\"o\":[");
									boolean first = true;
									for (com.shatteredpixel.shatteredpixeldungeon.items.Heap hp : l.heaps.valueList()) { int x = hp.pos % l.width(), y = hp.pos / l.width(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { sb.append(first ? "" : ",").append("[\"item\",").append(x - r.left).append(",").append(y - r.top).append("]"); first = false; } }
									for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : l.mobs) { int x = m.pos % l.width(), y = m.pos / l.width(); if (!(m instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.NPC) && pass == 0) continue; if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { sb.append(first ? "" : ",").append("[\"" + (m instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.NPC ? "npc" : "mob") + "\",").append(x - r.left).append(",").append(y - r.top).append("]"); first = false; } }
									g.add(sb.append("]}").toString());
									java.nio.file.Files.write(java.nio.file.Paths.get(p[2]), (g.get(g.size() - 1) + "\n").getBytes("UTF-8"), java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
								}
							} catch (Throwable t) { if (fails++ < 8) { System.out.println("[TEST] roomdump fail " + lv[0] + " " + t); t.printStackTrace(System.out); } }
						}
					}
					com.shatteredpixel.shatteredpixeldungeon.Dungeon.depth = depth0; f.get("procedural").remove("rooms");
					StringBuilder out = new StringBuilder(); int cnt = 0;
					for (java.util.List<String> g : got.values()) for (String s : g) { out.append(s).append("\n"); cnt++; }
					System.out.println("[TEST] roomdump rooms=" + got.size() + " samples=" + cnt + " fails=" + fails);
					break; }
				case "blocktest": { // blocktest,<파일: 줄마다 구성 블럭 JSON 배열> — 그 구성으로 층을 5번씩 만들어 방 종류를 셈 (게임 화면 밖에서)
					com.badlogic.gdx.utils.JsonValue f = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerRuntime.here();
					if (f.get("procedural") == null) f.addChild("procedural", new com.badlogic.gdx.utils.JsonValue(com.badlogic.gdx.utils.JsonValue.ValueType.object));
					for (String line : new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(p[1])), "UTF-8").split("\n")) {
						if (line.trim().isEmpty()) continue;
						f.get("procedural").remove("blocks");
						f.get("procedural").addChild("blocks", new com.badlogic.gdx.utils.JsonReader().parse(line));
						for (int n = 0; n < 5; n++) try {
							com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel l = (com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel) com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getClass().getDeclaredConstructor().newInstance();
							l.create();
							int std = 0, spc = 0, sec = 0, con = 0, oth = 0; StringBuilder names = new StringBuilder();
							for (com.shatteredpixel.shatteredpixeldungeon.levels.rooms.Room r : l.rooms()) {
								if (r instanceof com.shatteredpixel.shatteredpixeldungeon.levels.rooms.secret.SecretRoom) sec++;
								else if (r instanceof com.shatteredpixel.shatteredpixeldungeon.levels.rooms.special.SpecialRoom) { spc++; names.append(r.getClass().getSimpleName()).append(' '); }
								else if (r instanceof com.shatteredpixel.shatteredpixeldungeon.levels.rooms.connection.ConnectionRoom) con++;
								else if (r.getClass().getSimpleName().startsWith("Template")) { int ch = 0; for (int y = r.top; y <= r.bottom; y++) for (int x = r.left; x <= r.right; x++) if (l.map[x + y * l.width()] == 0) ch++; names.append("TPL(" + r.width() + "x" + r.height() + ",chasm=" + ch + ") "); }
								else if (r instanceof com.shatteredpixel.shatteredpixeldungeon.levels.rooms.standard.StandardRoom) std += ((com.shatteredpixel.shatteredpixeldungeon.levels.rooms.standard.StandardRoom) r).sizeFactor();
								else oth++;
							}
							java.lang.reflect.Field bf = com.shatteredpixel.shatteredpixeldungeon.levels.RegularLevel.class.getDeclaredField("builder"); bf.setAccessible(true);
							System.out.println("[TEST] blocks " + bf.get(l).getClass().getSimpleName() + " feeling=" + l.feeling + " std(칸)=" + std + " special=" + spc + " secret=" + sec + " tunnel=" + con + " other=" + oth + " " + l.width() + "x" + l.height() + " | " + names);
						} catch (Throwable t) { System.out.println("[TEST] blocks FAIL " + t); t.printStackTrace(System.out); }
					}
					f.get("procedural").remove("blocks");
					System.out.println("[TEST] blocktest done");
					break; }
				case "killhero": { com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.HP = 0; com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.die(null); break; }
				case "heroanim": { java.lang.reflect.Field f = com.watabou.noosa.MovieClip.class.getDeclaredField("curAnim"); f.setAccessible(true); com.watabou.noosa.MovieClip.Animation an = (com.watabou.noosa.MovieClip.Animation) f.get(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.sprite);
					System.out.println("[TEST] heroanim listener=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.sprite.listener.getClass().getName() + " active=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.sprite.active + " alive=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.sprite.alive + " paused=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.sprite.paused + " parent=" + (com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.sprite.parent != null) + " frames=" + an.frames.length + " looped=" + an.looped + " alive=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.isAlive()); break; }
				case "proptest": { // proptest,<propId> — 영웅 오른쪽 칸에 맵 오브젝트를 놓고, 그 칸을 눌러 봄 (밀기·상호작용)
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level; int hp = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos;
					int c = -1; for (int d : new int[]{1, -1, l.width(), -l.width()}) if (l.passable[hp + d] && l.passable[hp + 2 * d] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(hp + d) == null && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(hp + 2 * d) == null) { c = hp + d; break; }
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerProp pr = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerProp.place(l, p[1], c);
					com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(pr, false); com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.updateMap(c);
					System.out.println("[TEST] prop placed " + p[1] + " at " + c + " hero " + hp + " terrain " + l.map[c] + " passable " + l.passable[c]);
					break; }
				case "propinfo": { com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					for (com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap t : l.customTiles) if (t instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerProp) { com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerProp m = (com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerProp) t; int c = t.tileX + t.tileY * l.width();
						System.out.println("[TEST] prop " + m.propId + " cell " + c + " state " + m.state + " terrain " + l.map[c] + " passable " + l.passable[c] + " under " + m.under + " hero " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos); }
					break; }
				case "tapcell": { // tapcell,<칸> 또는 tapcell,prop — 맵 칸을 누른 것처럼 (영웅 행동)
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level; int c = -1;
					if (p[1].equals("prop")) { for (com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap t : l.customTiles) if (t instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerProp) c = t.tileX + t.tileY * l.width(); } else c = Integer.parseInt(p[1]);
					if (com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.handle(c)) com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.next();
					break; }
				case "droptest": { // 드랍 테이블 · 등장 금지 확인
					final String P = "com.shatteredpixel.shatteredpixeldungeon.";
					StringBuilder rot = new StringBuilder(); for (Class<?> c : com.shatteredpixel.shatteredpixeldungeon.actors.mobs.MobSpawner.getMobRotation(1)) rot.append(c.getSimpleName()).append(' ');
					System.out.println("[TEST] rotation d1: " + rot);
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level; int pots = 0;
					for (com.shatteredpixel.shatteredpixeldungeon.items.Heap hp : l.heaps.valueList()) for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : hp.items) if (it instanceof com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing) pots++;
					System.out.println("[TEST] healing potions on floor: " + pots);
					for (com.shatteredpixel.shatteredpixeldungeon.items.Heap hp : l.heaps.valueList()) if (hp.type != com.shatteredpixel.shatteredpixeldungeon.items.Heap.Type.HEAP) System.out.println("[TEST] container " + hp.type + ": " + hp.items);
					com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob g = (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) Class.forName(P + "actors.mobs.Gnoll").getDeclaredConstructor().newInstance();
					g.pos = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos + 1; g.rollToDropLoot();
					com.shatteredpixel.shatteredpixeldungeon.items.Heap hh = l.heaps.get(g.pos);
					System.out.println("[TEST] gnoll drop: " + (hh == null ? "none" : hh.items.toString()));
					for (com.shatteredpixel.shatteredpixeldungeon.items.Generator.Category cat : com.shatteredpixel.shatteredpixeldungeon.items.Generator.Category.values()) if (cat.classes != null) for (int i = 0; i < cat.classes.length; i++) if (cat.classes[i].getSimpleName().equals("Dagger")) System.out.println("[TEST] Dagger prob in " + cat + " = " + cat.probs[i] + " / default " + (cat.defaultProbs == null ? "-" : "" + cat.defaultProbs[i]));
					break; }
				case "goldtest": { // 드랍 테이블 › 금화 확인 — 게임 금화 양 배율 · 추가 금화 · 게임 금화 끄기
					final String P = "com.shatteredpixel.shatteredpixeldungeon.";
					System.out.println("[TEST] gold random qty (depth " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.depth + "): " + new com.shatteredpixel.shatteredpixeldungeon.items.Gold().random().quantity());
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					for (int k = 0; k < 3; k++) {
						com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob g = (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) Class.forName(P + "actors.mobs.Gnoll").getDeclaredConstructor().newInstance();
						g.pos = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos + 1 + k * l.width(); g.rollToDropLoot();
						com.shatteredpixel.shatteredpixeldungeon.items.Heap hh = l.heaps.get(g.pos);
						System.out.println("[TEST] gnoll " + k + " drop: " + (hh == null ? "none" : hh.items.toString() + " qty " + hh.items.peek().quantity()));
					}
					break; }
				case "textfx": System.out.println("[TEST] textfx " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTextFx.show(p[1], p.length > 2 ? p[2] : "center", 80f, p.length > 3 ? Integer.parseInt(p[3]) : 1, () -> System.out.println("[TEST] textfx done"))); break;
				case "effect": com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerEffect.playOn(p[1], com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero); System.out.println("[TEST] effect " + p[1]); break;
				case "fxspot": com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerEffect.place(com.shatteredpixel.shatteredpixeldungeon.Dungeon.level, p[1], com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos + 2); { com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap last = null; for (com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap t : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.customTiles) last = t; if (last != null) com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(last, false); } System.out.println("[TEST] fxspot"); break;
				case "fxdump": System.out.println("[TEST] fxdump " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerEffect.debug()); break;
				case "mobcount": { int en = 0; for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) if (m.alignment == com.shatteredpixel.shatteredpixeldungeon.actors.Char.Alignment.ENEMY) en++; int sp = 0; for (com.shatteredpixel.shatteredpixeldungeon.actors.Actor a : com.shatteredpixel.shatteredpixeldungeon.actors.Actor.all()) if (a instanceof com.shatteredpixel.shatteredpixeldungeon.actors.mobs.MobSpawner) sp++; System.out.println("[TEST] mobcount enemies=" + en + " spawners=" + sp + " level=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getClass().getSimpleName()); break; }
				case "themetest": { // themetest,<아이템 id>,<캐릭터 id> — 테마별 몬스터(Level.createMob 20번) · 사용 안 함 아이템/캐릭터
					java.util.Map<String, Integer> cnt = new java.util.TreeMap<>();
					for (int i = 0; i < 20; i++) { com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.createMob(); String n = m == null ? "null" : m instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerMob ? "maker:" + ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerMob) m).charId : m.getClass().getSimpleName(); cnt.merge(n, 1, Integer::sum); }
					System.out.println("[TEST] themetest depth=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.depth + " node=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.WorldGraph.current() + " level=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.getClass().getSimpleName() + " mobs=" + cnt);
					if (p.length > 1) System.out.println("[TEST] themetest item " + p[1] + " = " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]));
					if (p.length > 2) System.out.println("[TEST] themetest char " + p[2] + " = " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.LevelHooks.createMob(p[2]));
					break; }
				case "waterhere": { // waterhere,<반지름> — 영웅 둘레 바닥 칸을 물로 (지형 광원 · 벽 경계 확인)
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level; int w = l.width(), hp = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos, r = Integer.parseInt(p[1]);
					for (int i = 0; i < l.length(); i++) if (l.distance(i, hp) <= r && (com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.flags[l.map[i]] & com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.SOLID) == 0 && l.map[i] != com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.DOOR && l.map[i] != com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.OPEN_DOOR) com.shatteredpixel.shatteredpixeldungeon.levels.Level.set(i, com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.WATER, l);
					com.watabou.noosa.Game.runOnRenderThread(() -> { com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.updateMap(); });
					System.out.println("[TEST] waterhere"); break; }
				case "shoottest": { // shoottest,<아이템 id 또는 spd:경로> — 활(MakerBow)이나 마법봉을 들려 주고 3칸 앞 쥐에게 쏨 (원거리 무기 · 마법봉 이펙트)
					final String P = "com.shatteredpixel.shatteredpixeldungeon.";
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					com.shatteredpixel.shatteredpixeldungeon.items.Item it = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]);
					if (it == null) { System.out.println("[TEST] shoottest no item"); break; }
					it.identify(); it.collect();
					if (it instanceof com.shatteredpixel.shatteredpixeldungeon.items.weapon.Weapon) ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).doEquip(hero);
					if (p.length > 2) { com.shatteredpixel.shatteredpixeldungeon.items.Item am = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[2]); if (am != null) { am.quantity(5); am.collect(); } }
					int tgt = -1; for (int d : new int[]{3, -3, 3 * l.width(), -3 * l.width(), 2, -2}) { int c = hero.pos + d; if (c > 0 && c < l.length() && l.passable[c] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c) == null) { tgt = c; break; } }
					com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob rat = (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) Class.forName(P + "actors.mobs.Rat").getDeclaredConstructor().newInstance();
					rat.HP = rat.HT = 500; rat.pos = tgt; com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(rat); com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff.affect(rat, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Paralysis.class, 50f); com.shatteredpixel.shatteredpixeldungeon.Dungeon.observe();
					java.lang.reflect.Field cu = com.shatteredpixel.shatteredpixeldungeon.items.Item.class.getDeclaredField("curUser"), ci = com.shatteredpixel.shatteredpixeldungeon.items.Item.class.getDeclaredField("curItem"); cu.setAccessible(true); ci.setAccessible(true);
					cu.set(null, hero); ci.set(null, it);
					java.lang.reflect.Field lf = it instanceof com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand ? com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand.class.getDeclaredField("zapper") : com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerBow.class.getDeclaredField("shooter");
					lf.setAccessible(true);
					System.out.println("[TEST] shoottest " + it.getClass().getSimpleName() + " " + it.name() + " → rat HP " + rat.HP + " at " + tgt + " actions=" + it.actions(hero) + " charges=" + (it instanceof com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand ? ((com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand) it).curCharges + "/" + ((com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand) it).maxCharges : "-"));
					((com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector.Listener) lf.get(null)).onSelect(tgt);
					break; }
				case "mobhp": { for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) if (m.alignment == com.shatteredpixel.shatteredpixeldungeon.actors.Char.Alignment.ENEMY) System.out.println("[TEST] mobhp " + m.name() + " " + m.HP + "/" + m.HT); break; }
				case "cellname": { int c = Integer.parseInt(p[1]) + Integer.parseInt(p[2]) * com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width(); System.out.println("[TEST] cellname " + com.shatteredpixel.shatteredpixeldungeon.windows.WndInfoCell.cellName(c) + " | terrain " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.map[c]); break; }   // cellname,x,y — 살펴보기 이름
				case "bagtest": { // bagtest,<가방 id>,<판매·버리기 금지 아이템 id> — 새 가방(MakerBag) · noSell · noDrop
					final String P = "com.shatteredpixel.shatteredpixeldungeon.items.";
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.items.Item bag = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]); bag.collect();
					for (String c : new String[]{"potions.PotionOfHealing", "potions.PotionOfStrength", "potions.PotionOfMindVision", "potions.PotionOfHaste", "scrolls.ScrollOfIdentify"}) ((com.shatteredpixel.shatteredpixeldungeon.items.Item) Class.forName(P + c).getDeclaredConstructor().newInstance()).collect();
					com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag b = (com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag) bag;
					StringBuilder sb = new StringBuilder(); for (com.shatteredpixel.shatteredpixeldungeon.items.Item i : b.items) sb.append(i.getClass().getSimpleName()).append(' ');
					System.out.println("[TEST] bagtest " + bag.getClass().getSimpleName() + " " + bag.name() + " cap=" + b.capacity() + " in bag: " + sb);
					if (p.length > 2) { com.shatteredpixel.shatteredpixeldungeon.items.Item k = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[2]); k.collect();
						System.out.println("[TEST] flags " + p[2] + " actions=" + k.actions(hero) + " canSell=" + com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Shopkeeper.canSell(k)); }
					break; }
				case "throwfx": { // throwfx,<아이템 id> — 3칸 앞 쥐(마비) 칸에 던짐 (던지기 효과 · 폭탄 퓨즈)
					final String P = "com.shatteredpixel.shatteredpixeldungeon.";
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					com.shatteredpixel.shatteredpixeldungeon.items.Item it = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]); it.collect();
					int tgt = -1; for (int d : new int[]{3, -3, 3 * l.width(), -3 * l.width(), 2, -2}) { int c = hero.pos + d; if (c > 0 && c < l.length() && l.passable[c] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c) == null) { tgt = c; break; } }
					com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob rat = (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) Class.forName(P + "actors.mobs.Rat").getDeclaredConstructor().newInstance();
					rat.HP = rat.HT = 500; rat.pos = tgt; com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(rat); com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff.affect(rat, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Paralysis.class, 50f);
					System.out.println("[TEST] throwfx " + it.name() + " actions=" + it.actions(hero) + " → rat at " + tgt);
					it.cast(hero, tgt);
					break; }
				case "usetest": { // usetest,<아이템 id> — 체력을 깎고 기본 행동(사용)
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.items.Item it = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]); it.collect();
					hero.HP = Math.max(1, hero.HP - 15); int before = hero.HP; String act = p.length > 2 ? p[2] : it.defaultAction();
					System.out.println("[TEST] usetest " + it.name() + " actions=" + it.actions(hero) + " do " + act + " (" + it.actionName(act, hero) + ") HP " + before);
					it.execute(hero, act);
					System.out.println("[TEST] usetest after HP " + hero.HP + " count " + (hero.belongings.getItem(it.getClass()) == null ? 0 : hero.belongings.getItem(it.getClass()).quantity()));
					break; }
				case "bagfx": { // bagfx,<아이템 id> — 가방 기능: 넣기 · 버튼 이름
					final String P = "com.shatteredpixel.shatteredpixeldungeon.items.";
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.items.Item it = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]); it.identify(); it.collect();
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerFacets.Inner in = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerFacets.inner(it);
					for (String c : new String[]{"potions.PotionOfHealing", "scrolls.ScrollOfIdentify"}) { com.shatteredpixel.shatteredpixeldungeon.items.Item x = (com.shatteredpixel.shatteredpixeldungeon.items.Item) Class.forName(P + c).getDeclaredConstructor().newInstance(); System.out.println("[TEST] bagfx canHold " + c + " " + in.canHold(x) + " put " + (in.canHold(x) && x.collect(in))); }
					StringBuilder sb = new StringBuilder(); for (String a2 : it.actions(hero)) sb.append(a2).append('=').append(it.actionName(a2, hero)).append(' ');
					System.out.println("[TEST] bagfx " + it.getClass().getSimpleName() + " actions: " + sb + " inner=" + in.items.size());
					com.watabou.utils.Bundle bd = new com.watabou.utils.Bundle(); it.storeInBundle(bd);
					com.shatteredpixel.shatteredpixeldungeon.items.Item copy = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]); copy.restoreFromBundle(bd);
					System.out.println("[TEST] bagfx saved/restored inner=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerFacets.inner(copy).items.size());
					break; }
				case "baguse": { // baguse,<가방 기능 아이템 id>,<넣을 아이템 id> — 가방 기능 안에 든 채로 기본 행동(사용) · 꺼내기
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.items.Item host = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]); host.identify(); host.collect();
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerFacets.Inner in = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerFacets.inner(host);
					com.shatteredpixel.shatteredpixeldungeon.items.Item x = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[2]); x.quantity(2); x.collect(in);
					hero.HP = Math.max(1, hero.HP - 15); int before = hero.HP;
					System.out.println("[TEST] baguse inner=" + in.items.size() + " qty=" + x.quantity() + " actions=" + x.actions(hero) + " HP " + before);
					x.execute(hero, x.defaultAction());
					System.out.println("[TEST] baguse after use HP " + hero.HP + " qty=" + x.quantity() + " inner=" + in.items.size());
					x.execute(hero, com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerFacets.AC_BAG_TAKE);
					System.out.println("[TEST] baguse after take inner=" + in.items.size() + " inBackpack=" + hero.belongings.backpack.items.contains(x));
					break; }
				case "heaps": { for (com.shatteredpixel.shatteredpixeldungeon.items.Heap h : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.heaps.valueList()) System.out.println("[TEST] heap " + h.pos + " " + h.items); break; }
				case "charai": { // charai,<캐릭터 id>,<거리> — 영웅 옆 거리 칸에 소환 (캐릭터 AI · 체력 무한 · 지속 회복)
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					int dd = p.length > 2 ? Integer.parseInt(p[2]) : 2, tgt = -1;
					for (int d : new int[]{dd, -dd, dd * l.width(), -dd * l.width()}) { int c = hero.pos + d; if (c > 0 && c < l.length() && l.passable[c] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c) == null) { tgt = c; break; } }
					com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m = com.shatteredpixel.shatteredpixeldungeon.pdmaker.LevelHooks.createMob(p[1]);
					m.pos = tgt; com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(m);
					System.out.println("[TEST] charai " + p[1] + " " + m.getClass().getSimpleName() + " at " + tgt + " HP " + m.HP + "/" + m.HT);
					break; }
				case "charhit": { // charhit,<캐릭터 id>,<피해> — 그 캐릭터에게 피해 · 밀치기
					for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs.toArray(new com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob[0])) {
						if (!p[1].equals(com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCharAI.charId(m))) continue;
						m.damage(Integer.parseInt(p[2]), com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero);
						int before = m.pos;
						com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica tr = new com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica(m.pos, m.pos + 2, com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica.MAGIC_BOLT);
						com.shatteredpixel.shatteredpixeldungeon.items.wands.WandOfBlastWave.throwChar(m, tr, 2, false, false, com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero);
						System.out.println("[TEST] charhit " + p[1] + " HP " + m.HP + "/" + m.HT + " alive " + m.isAlive() + " pos " + before + "->" + m.pos + " desc:" + m.info().replace("\n", " "));
					}
					break; }
				case "charclick": { // charclick,<캐릭터 id> — 그 캐릭터 칸을 사람이 누른 것처럼 (공격 · 말 걸기)
					for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs)
						if (p[1].equals(com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCharAI.charId(m))) { System.out.println("[TEST] charclick " + p[1] + " at " + m.pos + " HP " + m.HP + "/" + m.HT + " state " + m.state.getClass().getSimpleName() + " hero " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos); com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.handleCell(m.pos); break; }
					break; }
				case "charstat": { for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) { String id = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCharAI.charId(m); if (id != null && !id.equals("moss_rat")) System.out.println("[TEST] charstat " + id + " pos " + m.pos + " HP " + m.HP + "/" + m.HT + " alive " + m.isAlive() + " heroDist " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.distance(m.pos, com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos)); } break; }
				case "waterfx": { // 테마 물 타일: 물 칸 수 · 효과 타일 수 · 첫 물 칸의 살펴보기 이름
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					int water = 0, first = -1; for (int i = 0; i < l.length(); i++) if (l.map[i] == com.shatteredpixel.shatteredpixeldungeon.levels.Terrain.WATER) { water++; if (first < 0) first = i; }
					java.util.Map<String, Integer> kinds = new java.util.TreeMap<>(); for (Object t : l.customTiles) kinds.merge(t.getClass().getSimpleName(), 1, Integer::sum);
					System.out.println("[TEST] waterfx water=" + water + " tiles=" + kinds + " waterTex=" + l.waterTex() + (first >= 0 ? " name@" + first + "=" + com.shatteredpixel.shatteredpixeldungeon.windows.WndInfoCell.cellName(first) : ""));
					break; }
				case "actors": { StringBuilder sb = new StringBuilder("[TEST] actors now=" + com.shatteredpixel.shatteredpixeldungeon.actors.Actor.now() + " hero.ready=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.ready);
					for (com.shatteredpixel.shatteredpixeldungeon.actors.Actor x : com.shatteredpixel.shatteredpixeldungeon.actors.Actor.all()) sb.append(" | ").append(x.getClass().getSimpleName()).append('=').append(x.cooldown());
					System.out.println(sb); break; }
				case "swingtest": { // swingtest,<아이템 id 또는 spd:경로>,<방향 r|l|u|d> — 들려 주고 그쪽 옆 칸 쥐(마비)를 사람이 누른 것처럼 공격 (무기 공격 모션)
					final String P = "com.shatteredpixel.shatteredpixeldungeon.";
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.levels.Level l = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					com.shatteredpixel.shatteredpixeldungeon.items.Item it = p[1].startsWith("spd:") ? (com.shatteredpixel.shatteredpixeldungeon.items.Item) Class.forName(P + "items." + p[1].substring(4)).getDeclaredConstructor().newInstance() : com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]);
					Object cur = hero.belongings.weapon;
					if (cur == null || !cur.getClass().equals(it.getClass())) { it.identify(); it.collect(); ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).doEquip(hero); System.out.println("[TEST] swingtest equipped " + it.name() + " — 다시 부르면 공격"); break; }
					String dir = p.length > 2 ? p[2] : "r"; int d = dir.equals("l") ? -1 : dir.equals("u") ? -l.width() : dir.equals("d") ? l.width() : 1;
					int tgt = hero.pos + d;
					com.shatteredpixel.shatteredpixeldungeon.actors.Char ex = com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(tgt);
					if (ex == null) { if (!l.passable[tgt]) { System.out.println("[TEST] swingtest blocked " + dir); break; }
						com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob rat = (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob) Class.forName(P + "actors.mobs.Rat").getDeclaredConstructor().newInstance();
						rat.HP = rat.HT = 500; rat.pos = tgt; com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(rat); com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff.affect(rat, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Paralysis.class, 50f); com.shatteredpixel.shatteredpixeldungeon.Dungeon.observe(); }
					int before = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.spawned;
					if (hero.handle(tgt)) hero.next();   // 기본 칸 누르기와 같음 (DefaultCellListener)
					System.out.println("[TEST] swingtest " + it.name() + " curAction=" + hero.curAction + " tgtChar=" + com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(tgt) + " fov=" + l.heroFOV[tgt] + " dir=" + dir + " weapon=" + hero.belongings.weapon + " ready=" + hero.ready + " spawnedBefore=" + before);
					break; }
				case "swingdirect": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hh = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero; int d = p.length > 1 && p[1].equals("l") ? -1 : p.length > 1 && p[1].equals("u") ? -com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width() : p.length > 1 && p[1].equals("d") ? com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width() : 1;
					com.shatteredpixel.shatteredpixeldungeon.actors.Char en = com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(hh.pos + d);
					System.out.println("[TEST] swingdirect canAttack=" + (en != null && hh.canAttack(en)) + " weapon=" + hh.belongings.attackingWeapon()); hh.sprite.attack(hh.pos + d); System.out.println("[TEST] swingdirect spawned=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.spawned); break; }
				case "swinginfo": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hh = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					Object m = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.getField(hh.sprite.parent, "members"); StringBuilder sb = new StringBuilder("[TEST] swinginfo heroCenter=" + hh.sprite.center() + " heroXY=" + hh.sprite.x + "," + hh.sprite.y);
					if (m instanceof java.util.List) for (Object o : (java.util.List<?>) m) if (o instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.Swing) { com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.Swing sw = (com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.Swing) o; sb.append(" | swing xy=").append(sw.x).append(',').append(sw.y).append(" wh=").append(sw.width).append('x').append(sw.height).append(" ang=").append(sw.angle).append(" a=").append(sw.alpha()).append(" vis=").append(sw.visible).append(" alive=").append(sw.alive).append(" frame=").append(sw.frame()); }
					System.out.println(sb); break; }
				case "swingcheck": { // swingcheck,<방향 r|l|u|d|ul|ur|dl|dr>,<영웅 방향 r|l> — 휘두르는 그림의 실제 날 끝(그림 칸의 오른쪽 위 픽셀이 화면에 놓인 자리)과 계산한 날 끝을 비교
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hh = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero; int W = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width();
					String dr = p[1]; int d = (dr.contains("l") ? -1 : dr.contains("r") ? 1 : 0) + (dr.contains("u") ? -W : dr.contains("d") ? W : 0);
					hh.sprite.flipHorizontal = p.length > 2 && p[2].equals("l");
					hh.sprite.attack(hh.pos + d);
					Object m = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.getField(hh.sprite.parent, "members");
					for (Object o : (java.util.List<?>) m) if (o instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.Swing) { com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.Swing sw = (com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.Swing) o; if (!sw.alive) continue;
						for (float t : new float[]{0f, 0.3f, 0.6f, 1f}) {
							java.lang.reflect.Method pm = sw.getClass().getDeclaredMethod("pose", float.class); pm.setAccessible(true); com.watabou.utils.PointF tip = (com.watabou.utils.PointF) pm.invoke(sw, t);
							float[] v = (float[]) com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.getField(sw, "vertices");
							// 날 = 그림의 오른쪽 위 텍셀 (u 가장 큼 · v 가장 작음) 이 붙은 꼭짓점
							int best = 0; for (int k = 1; k < 4; k++) { if (v[k * 4 + 2] > v[best * 4 + 2] + 1e-6 || (Math.abs(v[k * 4 + 2] - v[best * 4 + 2]) < 1e-6 && v[k * 4 + 3] < v[best * 4 + 3])) best = k; }
							float lx = v[best * 4] - sw.origin.x, ly = v[best * 4 + 1] - sw.origin.y; double a = Math.toRadians(sw.angle);
							float wx = sw.x + sw.origin.x + (float) (Math.cos(a) * lx * sw.scale.x - Math.sin(a) * ly * sw.scale.y), wy = sw.y + sw.origin.y + (float) (Math.sin(a) * lx * sw.scale.x + Math.cos(a) * ly * sw.scale.y);
							System.out.println(String.format("[TEST] swingcheck dir=%s hero=%s t=%.1f expected=(%.1f,%.1f) actual=(%.1f,%.1f) err=%.2f flip=%s", dr, p.length > 2 ? p[2] : "r", t, tip.x, tip.y, wx, wy, Math.hypot(wx - tip.x, wy - tip.y), sw.flipHorizontal));
						}
						sw.killAndErase(); }
					break; }
				case "swingcount": System.out.println("[TEST] swingcount " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSwing.spawned + " blocking=" + com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.interfaceBlockingHero() + " wnds=" + PlayTest.windows() + " curAction=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.curAction + " ready=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.ready + " para=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.paralysed); break;
				case "itemsprite": { // itemsprite,<아이템 id> — 그 아이템의 ItemSprite 가 어떤 그림(텍스처) · 크기로 그려지는지 (세밀한 아이템 그림)
					com.shatteredpixel.shatteredpixeldungeon.items.Item it = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem.create(p[1]);
					com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite sp = new com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite(it);
					System.out.println("[TEST] itemsprite " + p[1] + " image=" + it.image() + " tex=" + sp.texture.width + "x" + sp.texture.height + " size=" + sp.width + "x" + sp.height + " uv=" + sp.frame().left + "," + sp.frame().top + "-" + sp.frame().right + "," + sp.frame().bottom);
					sp.view(new com.shatteredpixel.shatteredpixeldungeon.items.food.Food());   // 같은 그림 객체를 다른(보통) 아이템으로 다시 쓰면 아이템 시트로 돌아오는지
					System.out.println("[TEST] itemsprite reuse→food tex=" + sp.texture.width + "x" + sp.texture.height + " size=" + sp.width + "x" + sp.height);
					break; }
				case "closewnds": for (com.shatteredpixel.shatteredpixeldungeon.ui.Window w : PlayTest.windows()) w.hide(); break;
				case "msg": System.out.println("[TEST] msg " + p[1] + " = " + com.shatteredpixel.shatteredpixeldungeon.messages.Messages.get(Class.forName("com.shatteredpixel.shatteredpixeldungeon.scenes." + p[1]), p[2])); break;
				case "global": com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerDrops.setGlobal(p[1], p.length < 3 || !p[2].equals("0")); System.out.println("[TEST] global " + p[1]); break;
				case "ev": com.shatteredpixel.shatteredpixeldungeon.pdmaker.EventInterpreter.runEvent(p[1], null); break;   // ev,<이벤트 id> — 이벤트 실행
				case "evstate": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hh = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero; StringBuilder sb = new StringBuilder("[TEST] evstate");
					for (String v : p.length > 1 ? p[1].split("/") : new String[0]) sb.append(' ').append(v).append('=').append(com.shatteredpixel.shatteredpixeldungeon.pdmaker.StoryState.resolveGlobal(v, null));
					sb.append(" buffs=").append(hh.buffs().size()).append(" busy=").append(com.shatteredpixel.shatteredpixeldungeon.pdmaker.EventInterpreter.busy()).append(" alive=").append(hh.isAlive()).append(" scene=").append(com.watabou.noosa.Game.scene().getClass().getSimpleName());
					int n = 0; for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) if (m instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) { n++; sb.append(" npcDist=").append(com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.distance(m.pos, hh.pos)); }
					System.out.println(sb.append(" npcs=").append(n)); break; }
				case "killmob": { for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs.toArray(new com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob[0])) if (m.alignment == com.shatteredpixel.shatteredpixeldungeon.actors.Char.Alignment.ENEMY) { m.die(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero); break; } break; }
				case "pickgold": new com.shatteredpixel.shatteredpixeldungeon.items.food.Food().doPickUp(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero); break;
				case "winsize": { // winsize,<가로>,<세로> — 창 크기 바꾸기 (세로 화면 = 모바일 흉내)
					com.badlogic.gdx.Gdx.graphics.setWindowedMode(Integer.parseInt(p[1]), Integer.parseInt(p[2])); break; }
				case "godepth": { // godepth,<깊이> — 원작 던전의 그 깊이로
					com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.mode = com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.Mode.RETURN;
					com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.returnDepth = Integer.parseInt(p[1]);
					com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.returnBranch = 0;
					com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.returnPos = -1;
					com.watabou.noosa.Game.switchScene(com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene.class); break; }
				case "leveldump": { // leveldump,<파일>,<테마> — 지금 층의 지형 + 게임이 고른 타일 그림 번호 (바닥 층 · 벽 층) 한 줄 추가
					com.shatteredpixel.shatteredpixeldungeon.levels.Level lv = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level;
					Object sc = com.watabou.noosa.Game.scene();
					StringBuilder sb = new StringBuilder("{\"theme\":\"" + p[2] + "\",\"depth\":" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.depth + ",\"w\":" + lv.width() + ",\"h\":" + lv.height());
					sb.append(",\"water\":").append(com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTileSheet.WATER);
					sb.append(",\"hero\":").append(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos);
					sb.append(",\"map\":["); for (int i = 0; i < lv.length(); i++) sb.append(i > 0 ? "," : "").append(lv.map[i]); sb.append("]");
					for (String fn : new String[]{ "tiles", "walls" }) {
						java.lang.reflect.Field f = com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.class.getDeclaredField(fn); f.setAccessible(true);
						Object tm = f.get(sc);
						java.lang.reflect.Field df = com.watabou.noosa.Tilemap.class.getDeclaredField("data"); df.setAccessible(true);
						int[] d = (int[]) df.get(tm);
						sb.append(",\"").append(fn).append("\":["); for (int i = 0; i < d.length; i++) sb.append(i > 0 ? "," : "").append(d[i]); sb.append("]");
					}
					sb.append("}\n");
					java.nio.file.Files.write(java.nio.file.Paths.get(p[1]), sb.toString().getBytes("UTF-8"), java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
					System.out.println("[TEST] leveldump " + lv.width() + "x" + lv.height() + " " + lv.getClass().getSimpleName()); break; }
				case "evplace": com.shatteredpixel.shatteredpixeldungeon.pdmaker.EventTriggers.hide(p[1], Integer.parseInt(p[2])); break;   // evplace,<이벤트 id>,<칸> — 이미지가 있는 이벤트를 그 칸에 (다음 턴에 나타남)
				case "npcs": { StringBuilder sb = new StringBuilder("[TEST] npcs"); int w = com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width();
					for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) if (m instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) { com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC n = (com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) m; sb.append(' ').append(n.charId).append(n.pageEvent ? "*" : "").append('@').append(m.pos % w).append(',').append(m.pos / w); }
					System.out.println(sb); break; }
				case "nointro": com.shatteredpixel.shatteredpixeldungeon.SPDSettings.intro(false); break;
				case "lastse": System.out.println("[TEST] lastse '" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe + "'"); com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.lastSe = ""; break;
				case "sfx": // 게임 효과음 설정이 실제로 어떤 파일로 풀리는지
					for (String[] k : com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.SFX) System.out.println("[TEST] sfx " + k[0] + " -> " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.sfxRef(k[0]));
					break;
				case "click": { // click,<x>,<y> 또는 click,<캐릭터id> — 맵 칸 누르기 (사람이 누른 것처럼)
					int cell = -1;
					if (p.length > 2) cell = Integer.parseInt(p[1]) + Integer.parseInt(p[2]) * com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width();
					else for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs)
						if (m instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC && ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) m).charId.equals(p[1])) cell = m.pos;
					System.out.println("[TEST] click " + cell + " hero=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos + " busy=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.EventInterpreter.busy() + " ready=" + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.ready);
					com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.handleCell(cell);
					break;
				}
				case "adv": case "pick": { // 대사창: 다음(글자 다 보이기 → 선택지 → 닫기) · pick,<n> 선택지 고르기
					for (com.shatteredpixel.shatteredpixeldungeon.ui.Window w : PlayTest.windows()) if (w instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerDialogue.Wnd) {
						com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerDialogue.Wnd d = (com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerDialogue.Wnd) w;
						System.out.println("[TEST] dialogue '" + d.line.name + "' " + d.line.text + " illust=" + d.line.illust);
						if (p[0].equals("pick")) d.choose(Integer.parseInt(p[1])); else d.advance();
					}
					break;
				}
				case "switch": com.shatteredpixel.shatteredpixeldungeon.pdmaker.StoryState.setSw(p[1], true); System.out.println("[TEST] switch " + p[1]); break;
				case "heart": com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartUI.show(null); break;
				case "spells": {
					com.shatteredpixel.shatteredpixeldungeon.items.Item s = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.belongings.getItem(com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.MakerSpellbook.class);
					System.out.println("[TEST] spellbook " + (s == null ? null : s.name() + " " + s.status()) + " learned " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.learned(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero).size());
					com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.show(new com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.WndMakerSpells((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.MakerSpellbook) s, com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero, false));
					break;
				}
				case "cast": { // cast,<spellIndex>
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					final com.badlogic.gdx.utils.JsonValue sk = com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.data().get("spells").get(Integer.parseInt(p[1]));
					int cell = nearEnemy(h, sk.getString("target", "self"));
					System.out.println("[TEST] cast " + sk.getString("id", "") + " blocked=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.blocked(h, sk) + " charge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.charge + " gauge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.value());
					final java.lang.reflect.Method om = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.class.getDeclaredMethod("onSpellCast", com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero.class, com.badlogic.gdx.utils.JsonValue.class); om.setAccessible(true);
					final com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hh = h;
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCast.perform(h, sk, cell, c -> { try { om.invoke(null, hh, sk); } catch (Exception e) { e.printStackTrace(); } });
					System.out.println("[TEST] after cast charge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.charge + " cd " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerSpells.cooldowns + " gauge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.value());
					break;
				}
				case "subclass": { // subclass,<id>  (가면 없이 바로 고르기)
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.badlogic.gdx.utils.JsonValue sc = null;
					for (com.badlogic.gdx.utils.JsonValue x : com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.data().get("subclasses")) if (x.getString("id", "").equals(p[1])) sc = x;
					java.lang.reflect.Method cm = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAbilities.class.getDeclaredMethod("choose", com.shatteredpixel.shatteredpixeldungeon.items.TengusMask.class, com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero.class, com.badlogic.gdx.utils.JsonValue.class); cm.setAccessible(true);
					cm.invoke(null, null, h, sc);
					System.out.println("[TEST] subclass " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAbilities.subclassId() + " native " + h.subClass + " className " + h.className() + " castPct " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.bonus("castPct") + " codexPct " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.bonus("codexPct") + " tier3avail " + h.talentPointsAvailable(3));
					break;
				}
				case "subwin": { com.shatteredpixel.shatteredpixeldungeon.items.TengusMask m = new com.shatteredpixel.shatteredpixeldungeon.items.TengusMask(); m.collect(); m.execute(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero, "WEAR"); break; }
				case "abiwin": { com.shatteredpixel.shatteredpixeldungeon.items.KingsCrown k = new com.shatteredpixel.shatteredpixeldungeon.items.KingsCrown(); k.collect(); k.execute(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero, "WEAR"); break; }
				case "ability": { // ability,<id>  (왕관으로 고른 것처럼)
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					new com.shatteredpixel.shatteredpixeldungeon.items.KingsCrown().upgradeArmor(h, h.belongings.armor(), new com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAbilities.MakerArmorAbility(p[1]));
					System.out.println("[TEST] ability " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAbilities.abilityId() + " armor " + h.belongings.armor() + " name " + h.armorAbility.name() + " tier4avail " + h.talentPointsAvailable(4));
					break;
				}
				case "useab": {
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor ca = (com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor) h.belongings.armor();
					ca.charge = 100;
					com.badlogic.gdx.utils.JsonValue d = null;
					for (com.badlogic.gdx.utils.JsonValue x : com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.data().get("abilities")) if (x.getString("id", "").equals(com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAbilities.abilityId())) d = x;
					int cell = nearEnemy(h, d.getString("target", "self"));
					java.lang.reflect.Method am = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAbilities.MakerArmorAbility.class.getDeclaredMethod("activate", com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor.class, com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero.class, Integer.class); am.setAccessible(true);
					am.invoke(h.armorAbility, ca, h, cell);
					System.out.println("[TEST] useab charge " + ca.charge + " gauge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.value());
					break;
				}
				case "codex": { // codex,<itemId>
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCodex cx = null;
					for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : h.belongings) if (it instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCodex && ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCodex) it).makerId.equals(p[1])) cx = (com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCodex) it;
					if (cx == null) { System.out.println("[TEST] codex not found " + p[1]); break; }
					java.lang.reflect.Method dm = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCodex.class.getDeclaredMethod("castDef", com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero.class); dm.setAccessible(true);
					com.badlogic.gdx.utils.JsonValue d = (com.badlogic.gdx.utils.JsonValue) dm.invoke(cx, h);
					int cell = nearEnemy(h, d.getString("target", "self"));
					final java.lang.reflect.Method um = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCodex.class.getDeclaredMethod("afterUse"); um.setAccessible(true);
					final com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCodex fc = cx;
					System.out.println("[TEST] codex targeting=" + cx.usesTargeting + " " + cx.name() + " qty " + cx.quantity() + " uses " + cx.usesLeft() + " in " + (h.belongings.backpack.items.contains(cx) ? "backpack" : "bag") + " def " + d.toJson(com.badlogic.gdx.utils.JsonWriter.OutputType.minimal));
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCast.perform(h, d, cell, c -> { try { um.invoke(fc); } catch (Exception e) { e.printStackTrace(); } });
					System.out.println("[TEST] after codex qty " + cx.quantity() + " uses " + cx.usesLeft() + " gauge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.value());
					break;
				}
				case "gauge": { if (p.length > 1) com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.add(Integer.parseInt(p[1]));
					System.out.println("[TEST] gauge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.value() + " element " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.element() + " codexPct " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.bonus("codexPct") + " takenPct " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.bonus("takenPct") + " action " + com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator.action); break; }
				case "element": { System.out.println("[TEST] element set " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.setElement(p[1]) + " -> " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerGauge.element() + " takenPct " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.bonus("takenPct")); break; }
				case "abinfo": { com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.show(new com.shatteredpixel.shatteredpixeldungeon.windows.WndInfoArmorAbility(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.heroClass, com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.heroClass.armorAbilities()[1])); break; }
				case "rest": { com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.rest(false); break; }
				case "elemwin": { ((com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator.Action) com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator.action).doAction(); break; }
				case "eat": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger hg = h.buff(com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger.class);
					hg.affectHunger(-250); System.out.println("[TEST] hunger before " + hg.hunger());
					for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : h.belongings.backpack.items) if (it instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem && ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerItem) it).makerId.equals(p[1])) {
						System.out.println("[TEST] actions " + it.actions(h) + " name " + it.actionName("USE", h) + " qty " + it.quantity());
						it.execute(h, "USE"); System.out.println("[TEST] hunger after " + hg.hunger() + " qty " + it.quantity()); break; }
					break; }
				case "herowin": com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.openHeroWindow(); break;
				case "action": System.out.println("[TEST] action " + com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator.action); break;
				case "title": System.out.println("[TEST] title buttons " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitle.describe()); break;
				case "tap": com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTitle.tap(); break;
				case "talk": for (int i = 0; i < 12; i++) com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.applyAction(p[1], "TALK");
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.onFloorLeave(com.shatteredpixel.shatteredpixeldungeon.Dungeon.depth);
					for (int i = 0; i < 5; i++) com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.applyAction(p[1], "TALK");
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartUI.show(p[1]); break;
				case "hp": for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) System.out.println("[TEST] mob " + m.name() + " HP " + m.HP + " buffs " + m.buffs()); break;
				case "tp": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					int c = Integer.parseInt(p[1]); com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfTeleportation.appear(h, c); com.shatteredpixel.shatteredpixeldungeon.Dungeon.observe(); break; }
				case "inv": {
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.items.KindOfWeapon w = h.belongings.weapon();
					System.out.println("[TEST] weapon " + (w == null ? null : w.getClass().getSimpleName() + " '" + w.name() + "' " + w.min() + "-" + w.max() + " img " + w.image));
					com.shatteredpixel.shatteredpixeldungeon.items.armor.Armor a = h.belongings.armor();
					System.out.println("[TEST] armor " + (a == null ? null : a.getClass().getSimpleName() + " '" + a.name() + "' DR " + a.DRMin() + "-" + a.DRMax()));
					System.out.println("[TEST] acc " + h.attackSkill(null) + " eva " + h.defenseSkill(null) + " lvl " + h.lvl + " HP " + h.HP + "/" + h.HT + " speed " + h.speed());
					for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : h.belongings.backpack.items) System.out.println("[TEST]   bag " + it.getClass().getSimpleName() + " '" + it.name() + "' x" + it.quantity() + " actions " + it.actions(h));
					if (w != null) System.out.println("[TEST] weapon desc: " + w.desc().replace("\n", " / "));
					break;
				}
				case "equip": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : h.belongings.backpack.items.toArray(new com.shatteredpixel.shatteredpixeldungeon.items.Item[0]))
						if (it instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.GenSupport.Coded && ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.GenSupport.Coded) it).makerId().equals(p[1]))
							System.out.println("[TEST] equip " + p[1] + " -> " + ((com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem) it).doEquip(h));
					break; }
				case "act": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : h.belongings.backpack.items.toArray(new com.shatteredpixel.shatteredpixeldungeon.items.Item[0]))
						if (it instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.GenSupport.Coded && ((com.shatteredpixel.shatteredpixeldungeon.pdmaker.GenSupport.Coded) it).makerId().equals(p[1])) { it.execute(h, p[2]); System.out.println("[TEST] act " + p[2] + " default " + it.defaultAction()); }
					break; }
				case "fight": { // fight,<마리수> : 옆에 쥐를 놓고 영웅이 직접 때림
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					int n = Integer.parseInt(p[1]);
					for (int k = 0; k < n; k++) {
						com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat r = new com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat();
						int c = -1; for (int o : com.watabou.utils.PathFinder.NEIGHBOURS8) { int c2 = h.pos + o; if (com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.passable[c2] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c2) == null) { c = c2; break; } }
						if (c < 0) break;
						r.pos = c; r.HP = r.HT = 12; com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(r);
						int hits = 0;
						while (r.isAlive() && hits < 40) { hits++; int before = r.HP; h.attack(r); if (r.isAlive() && r.buff(com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Burning.class) != null) System.out.println("[TEST]   burning!"); }
						System.out.println("[TEST] rat " + k + " dead=" + !r.isAlive() + " hits " + hits + " heroHP " + h.HP + "/" + h.HT);
					}
					break; }
				case "hit": { // hit,<횟수> : 쥐가 영웅을 때림 (갑옷 proc)
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat r = new com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat();
					for (int o : com.watabou.utils.PathFinder.NEIGHBOURS8) { int c2 = h.pos + o; if (com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.passable[c2] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c2) == null) { r.pos = c2; break; } }
					r.HP = r.HT = 999; com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(r);
					int roots = 0; for (int k = 0; k < Integer.parseInt(p[1]); k++) { r.attack(h); if (r.buff(com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Roots.class) != null) roots++; h.HP = h.HT; }
					System.out.println("[TEST] rat rooted " + roots + " times"); r.die(null); break; }
				case "hs": { com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.Record r = com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.rec(p[1]);
					System.out.println("[TEST] heart " + p[1] + " favor " + r.favor + " trust " + r.trust + " mood " + r.mood + " anger " + r.anger + " sulk " + r.sulk + " displeased " + r.displeased + " temper " + r.temper + " fatigue " + r.fatigue + " jealousy " + r.jealousy + " accept " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.acceptance(r) + " lv " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.acceptLevel(r) + " att " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.attitude(p[1]) + " bonds " + r.bonds + " stress " + r.stress);
					break; }
				case "hact": { com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.Result rs = com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.applyAction(p[1], p[2], p.length > 3 ? Integer.parseInt(p[3]) : -1);
					System.out.println("[TEST] hact " + p[2] + " -> " + (rs == null ? null : rs.outcome + " fav " + rs.fav + " tru " + rs.tru + " mood " + rs.mood + " anger " + rs.anger + " sulk " + rs.gotSulk + " calmed " + rs.calmed + " jealous " + rs.jealous + " topic " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.topicFor(p[2], rs)));
					break; }
				case "req": System.out.println("[TEST] req " + p[2] + " -> " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeartSystem.request(p[1], p[2])); break;
				case "npcnear": { // npcnear,<char> : 그 NPC 를 영웅 옆으로
					com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC n = null;
					for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) if (m instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC && (((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) m).charId.equals(p[1]))) n = (com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) m;
					if (n == null) { n = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC.create(p[1]); n.pos = -1; }
					for (int o : com.watabou.utils.PathFinder.NEIGHBOURS8) { int c2 = h.pos + o; if (com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.passable[c2] && com.shatteredpixel.shatteredpixeldungeon.actors.Actor.findChar(c2) == null) {
						if (n.pos == -1) { n.pos = c2; com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene.add(n); } else { n.pos = c2; n.sprite.place(c2); } break; } }
					com.shatteredpixel.shatteredpixeldungeon.Dungeon.observe(); System.out.println("[TEST] npcnear " + p[1] + " at " + n.pos + " fov " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.heroFOV[n.pos]);
					break; }
				case "menu": { for (com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob m : com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.mobs) if (m instanceof com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC && (((com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerNPC) m).charId.equals(p[1]))) m.interact(com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero); break; }
				case "music": { try { java.lang.reflect.Field f = com.watabou.noosa.audio.Music.class.getDeclaredField("player"); f.setAccessible(true); Object pl = f.get(com.watabou.noosa.audio.Music.INSTANCE);
					java.lang.reflect.Field lp = com.watabou.noosa.audio.Music.class.getDeclaredField("lastPlayed"); lp.setAccessible(true);
					System.out.println("[TEST] music player=" + (pl == null ? null : pl.getClass().getSimpleName()) + " playing=" + com.watabou.noosa.audio.Music.INSTANCE.isPlaying() + " last=" + lp.get(com.watabou.noosa.audio.Music.INSTANCE) + " audio=" + com.badlogic.gdx.Gdx.audio.getClass().getSimpleName());
					} catch (Exception e) { e.printStackTrace(); } break; }
				case "se": com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerAudio.playSe(p[1]); System.out.println("[TEST] se " + p[1]); break;
				case "sethp": com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.HP = Integer.parseInt(p[1]); break;
				case "herohp": System.out.println("[TEST] herohp pos " + (com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos % com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width()) + "," + (com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.pos / com.shatteredpixel.shatteredpixeldungeon.Dungeon.level.width()) + " hp " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.HP + " hunger " + com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero.buff(com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger.class).hunger()); break;
				case "tal": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					System.out.println("[TEST] talents lvl " + h.lvl + " avail " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.availableAll(h) + " HT " + h.HT + " armor " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.stat("armor") + " recharge " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.stat("recharge"));
					com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.show(h); break; }
				case "talup": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					java.lang.reflect.Method tm = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.class.getDeclaredMethod("talent", String.class); tm.setAccessible(true);
					Object t = tm.invoke(null, p[1]);
					java.lang.reflect.Method um = com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.class.getDeclaredMethod("upgrade", com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero.class, com.badlogic.gdx.utils.JsonValue.class); um.setAccessible(true);
					um.invoke(null, h, t);
					System.out.println("[TEST] talup " + p[1] + " -> " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.get(p[1]) + " HT " + h.HT + " fire dmg+ " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.mod("fire_bolt", "damage") + " storm cd+ " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerTalents.mod("storm_lance", "cooldown") + " code " + com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.talent(p[1]));
					break; }
				case "lvl": { com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero h = com.shatteredpixel.shatteredpixeldungeon.Dungeon.hero;
					h.earnExp(h.maxExp(), null); System.out.println("[TEST] lvl -> " + h.lvl); break; }
				default: System.out.println("[TEST] unknown eval " + code);
			}
		} catch (Throwable t) { t.printStackTrace(); }
	}
}
