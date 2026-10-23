import com.badlogic.gdx.Gdx;
import com.shatteredpixel.shatteredpixeldungeon.*;
import com.shatteredpixel.shatteredpixeldungeon.actors.*;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.*;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.*;
import com.shatteredpixel.shatteredpixeldungeon.levels.*;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.scenes.*;
import com.shatteredpixel.shatteredpixeldungeon.ui.*;
import com.shatteredpixel.shatteredpixeldungeon.windows.*;
import com.watabou.noosa.*;
import java.util.*;
import java.util.concurrent.*;

/** 자동 플레이 테스트: 새 게임 → 층 스크린샷 → 계단 이동 반복. args: 스크립트 (예: "start:WARRIOR shot:f1 close down shot:f2 ...") */
public class PlayTest {
	static String outDir = System.getProperty("shots", "/tmp/play/shots");
	static void run(Runnable r) throws Exception {
		CountDownLatch l = new CountDownLatch(1);
		Gdx.app.postRunnable(() -> { try { r.run(); } catch (Throwable t) { t.printStackTrace(); } finally { l.countDown(); } });
		l.await(10, TimeUnit.SECONDS);
	}
	static void sleep(double s) { try { Thread.sleep((long)(s*1000)); } catch (Exception e) {} }
	static void shot(String name) throws Exception {
		new ProcessBuilder("import", "-display", System.getenv("DISPLAY"), "-window", "root", outDir + "/" + name + ".png").inheritIO().start().waitFor();
		System.out.println("[TEST] shot " + name);
	}
	static List<Window> windows() {
		List<Window> out = new ArrayList<>();
		Scene s = Game.scene(); if (s == null) return out;
		java.util.ArrayList<Gizmo> mem; try { java.lang.reflect.Field f = Group.class.getDeclaredField("members"); f.setAccessible(true); mem = (java.util.ArrayList<Gizmo>) f.get(s); } catch (Exception e) { return out; }
		for (Gizmo g : mem) if (g instanceof Window && g.exists) out.add((Window) g);
		return out;
	}
	static void closeWindows() throws Exception {
		for (int i = 0; i < 40; i++) {
			final boolean[] any = {false};
			run(() -> {
				List<Window> ws = windows();
				if (ws.isEmpty()) return;
				any[0] = true;
				Window w = ws.get(ws.size() - 1);
				System.out.println("[TEST] close window " + w.getClass().getName());
				if (w instanceof WndOptions) {
					try { java.lang.reflect.Method m = WndOptions.class.getDeclaredMethod("onSelect", int.class); m.setAccessible(true); w.hide(); m.invoke(w, 0); }
					catch (Exception e) { w.hide(); }
				} else w.hide();
			});
			if (!any[0]) return;
			sleep(0.6);
		}
	}
	static void info(String tag) throws Exception {
		run(() -> {
			Level l = Dungeon.level;
			System.out.println("[TEST] " + tag + " node=" + com.shatteredpixel.shatteredpixeldungeon.pdmaker.WorldGraph.current() + " scene=" + Game.scene().getClass().getSimpleName() + " depth=" + Dungeon.depth + " branch=" + Dungeon.branch
				+ " level=" + (l == null ? null : l.getClass().getSimpleName()) + (l == null ? "" : " size=" + l.width() + "x" + l.height() + " tiles=" + l.tilesTex()));
			if (l == null) return;
			System.out.println("[TEST]   hero=" + Dungeon.hero.heroClass + " pos=" + Dungeon.hero.pos + " HP=" + Dungeon.hero.HP + "/" + Dungeon.hero.HT);
			for (LevelTransition t : l.transitions) System.out.println("[TEST]   transition " + t.type + " cell=" + t.cell() + " -> d" + t.destDepth + " b" + t.destBranch + " " + t.destType);
			for (Mob m : l.mobs) System.out.println("[TEST]   mob " + m.getClass().getSimpleName() + " '" + m.name() + "' pos=" + m.pos);
			StringBuilder sb = new StringBuilder();
			for (com.shatteredpixel.shatteredpixeldungeon.items.Item it : Dungeon.hero.belongings) sb.append(it.name()).append(", ");
			System.out.println("[TEST]   inventory: " + sb);
		});
	}
	static void go(LevelTransition.Type type) throws Exception {
		run(() -> {
			LevelTransition t = Dungeon.level.getTransition(type);
			if (t == null) { System.out.println("[TEST] no transition " + type); return; }
			System.out.println("[TEST] take " + type + " -> d" + t.destDepth + " b" + t.destBranch);
			Dungeon.hero.pos = t.cell();
			com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.takeTransition(Dungeon.level, Dungeon.hero, t);
		});
		sleep(5);
	}
	public static void main(String[] args) throws Exception {
		new java.io.File(outDir).mkdirs();
		Thread t = new Thread(() -> {
			try {
				sleep(Double.parseDouble(System.getProperty("bootWait", "8")));
				for (String step : args) {
					String[] p = step.split(":", 2);
					switch (p[0]) {
						case "start": run(() -> {
							GamesInProgress.selectedClass = HeroClass.valueOf(p.length > 1 ? p[1] : "WARRIOR");
							GamesInProgress.curSlot = GamesInProgress.firstEmpty();
							Dungeon.hero = null; com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.setStatic(Dungeon.class, "daily", false); com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.setStatic(Dungeon.class, "dailyReplay", false);
							Dungeon.initSeed(); com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.invoke(ActionIndicator.class, "clearAction");   // 예전 판: clearAction() 없음
							InterlevelScene.mode = InterlevelScene.Mode.DESCEND;
							Game.switchScene(InterlevelScene.class);
						}); sleep(6); break;
						case "startbtn": run(() -> {   // 11차: 영웅 선택 화면의 게임 시작 버튼을 그대로 누름 (게임이 정한 시작 방식 — ARK: ENTER_RHODES)
							try {
								String[] pp = p.length > 1 ? p[1].split(",") : new String[]{"WARRIOR"};
								GamesInProgress.selectedClass = HeroClass.valueOf(pp[0]);
								GamesInProgress.curSlot = GamesInProgress.firstEmpty();
								boolean keepIntro = pp.length > 1 && pp[1].equals("intro");   // startbtn:CLASS,intro = 처음 하는 판처럼 (게임의 소개 화면 그대로)
								if (!keepIntro) try { com.shatteredpixel.shatteredpixeldungeon.SPDSettings.class.getMethod("intro", boolean.class).invoke(null, false); } catch (Exception ignored) { }
								System.out.println("[TEST] intro=" + com.shatteredpixel.shatteredpixeldungeon.SPDSettings.intro());
								Object sc = Game.scene(); java.lang.reflect.Field f = sc.getClass().getDeclaredField("startBtn"); f.setAccessible(true);
								Object b = f.get(sc); java.lang.reflect.Method m = null;
								for (Class<?> c = b.getClass(); c != null && m == null; c = c.getSuperclass()) try { m = c.getDeclaredMethod("onClick"); } catch (NoSuchMethodException ignored) { }
								m.setAccessible(true); m.invoke(b);
								System.out.println("[TEST] startbtn mode=" + InterlevelScene.mode);
							} catch (Exception e) { System.out.println("[TEST] startbtn 실패: " + e); e.printStackTrace(); }
						}); sleep(8); break;
						case "continue": for (int k = 0; k < 20; k++) { final boolean[] c = {false}; run(() -> {
							try {
								java.lang.reflect.Field f = Group.class.getDeclaredField("members"); f.setAccessible(true);
								for (Object g : new ArrayList<>((ArrayList<?>) f.get(Game.scene())))
									if (g instanceof StyledButton && ((Gizmo) g).visible && ((com.shatteredpixel.shatteredpixeldungeon.ui.Button) g).active) {
										java.lang.reflect.Method m = com.shatteredpixel.shatteredpixeldungeon.ui.Button.class.getDeclaredMethod("onClick"); m.setAccessible(true); m.invoke(g);
										System.out.println("[TEST] clicked " + g.getClass().getName()); c[0] = true;
									}
							} catch (Exception e) { e.printStackTrace(); }
						}); if (c[0]) break; sleep(0.5); } sleep(3); break;
						case "reload": run(() -> {
							try { Dungeon.saveAll(); } catch (Exception e) { e.printStackTrace(); }
							System.out.println("[TEST] saved; reloading slot " + GamesInProgress.curSlot);
							Dungeon.hero = null;
							InterlevelScene.mode = InterlevelScene.Mode.CONTINUE;
							Game.switchScene(InterlevelScene.class);
						}); sleep(6); break;
						case "shot": shot(p[1]); break;
						case "info": info(p.length > 1 ? p[1] : ""); break;
						case "close": closeWindows(); break;
						case "scene": { final String sn = p[1]; run(() -> { try { ShatteredPixelDungeon.switchNoFade((Class<? extends PixelScene>) Class.forName("com.shatteredpixel.shatteredpixeldungeon.scenes." + sn)); } catch (Exception e) { e.printStackTrace(); } }); sleep(2); break; }
						case "titlescene": run(() -> ShatteredPixelDungeon.switchNoFade(TitleScene.class)); sleep(2); break;
						case "hide": run(() -> { for (Window w : windows()) w.hide(); }); sleep(0.5); break;
						case "wait": sleep(Double.parseDouble(p[1])); break;
						case "down": go(LevelTransition.Type.REGULAR_EXIT); break;
						case "up": go(LevelTransition.Type.REGULAR_ENTRANCE); break;
						case "side": go(LevelTransition.Type.BRANCH_EXIT); break;
						case "to": { final String target = p[1]; run(() -> {
							int[] w = com.shatteredpixel.shatteredpixeldungeon.pdmaker.WorldGraph.whereOf(target);
							for (LevelTransition tr : Dungeon.level.transitions) if (w != null && tr.destDepth == w[0] && tr.destBranch == w[1]) {
								System.out.println("[TEST] take " + tr.type + " -> " + target + " (d" + tr.destDepth + " b" + tr.destBranch + ")");
								Dungeon.hero.pos = tr.cell(); com.shatteredpixel.shatteredpixeldungeon.pdmaker.MakerCompat.takeTransition(Dungeon.level, Dungeon.hero, tr); return; }
							System.out.println("[TEST] no transition to " + target);
						}); sleep(5); break; }
						case "sideback": go(LevelTransition.Type.BRANCH_ENTRANCE); break;
						case "eval": { final String code = p[1]; run(() -> Hooks.eval(code)); sleep(1.5); break; }
					}
				}
			} catch (Throwable e) { e.printStackTrace(); }
			System.out.println("[TEST] done");
			sleep(1);
			Runtime.getRuntime().halt(0);
		});
		t.setDaemon(true); t.start();
		com.shatteredpixel.shatteredpixeldungeon.desktop.DesktopLauncher.main(new String[0]);
	}
}
