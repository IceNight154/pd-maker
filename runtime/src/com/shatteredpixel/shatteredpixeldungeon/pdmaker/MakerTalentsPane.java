/*
 * 영웅 정보 창(WndHero)의 "특성" 탭을 영웅 편집기의 특성으로 바꿈 — 원작의 TalentsPane 과 같은 모양
 *   위: 전직 · 직업 능력 한 줄, 배운 주문 (아이콘 버튼 → 정보 · 시전)   아래: 단계별 특성 (별 = 남은/쓴 포인트, 버튼 → 설명 · 올리기)
 *   3단계는 전직 뒤, 4단계는 직업 능력 뒤에 열림 (원작 Hero.talentPointsAvailable)
 *   연결: WndHero.TalentsTab 의 pane = new TalentsPane(...) 다음 줄 (자동 설치기)
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.effects.Speck;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.Button;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.TalentButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.TalentIcon;
import com.shatteredpixel.shatteredpixeldungeon.ui.TalentsPane;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndHero;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Image;
import com.watabou.noosa.PointerArea;
import com.watabou.noosa.ui.Component;

import java.util.ArrayList;
import java.util.List;

public class MakerTalentsPane extends TalentsPane {

	/** WndHero 연결 줄: 영웅 편집기의 스킬·특성이 있으면 이 창으로 (없으면 null → 게임 원래 특성) */
	public static TalentsPane forHero() {
		try {
			JsonValue h = HeroRuntime.data();
			if (h == null || Dungeon.hero == null) return null;
			if (!MakerTalents.replacesNative()) return null;
			if (h.getBoolean("nativeTalents", false)) return null;
			return new MakerTalentsPane();
		} catch (Throwable t) { MakerRuntime.log("특성 창 오류: " + t); return null; }
	}

	RenderedTextBlock skillTitle, chargeText, pathText;
	final List<SkillBtn> skillBtns = new ArrayList<>();
	final List<TierPane> tiers = new ArrayList<>();
	final List<ColorBlock> seps = new ArrayList<>();

	MakerTalentsPane() {
		super(TalentButton.Mode.UPGRADE, new ArrayList<>());
		Hero hero = Dungeon.hero;
		if (MakerAbilities.anySubclass() || MakerAbilities.anyAbility()) {
			StringBuilder sb = new StringBuilder();
			if (MakerAbilities.anySubclass()) sb.append("전직: ").append(MakerAbilities.subclassId().isEmpty() ? "아직 (텐구의 가면)" : "_" + MakerAbilities.subclassName(MakerAbilities.subclassId()) + "_");
			if (MakerAbilities.anyAbility()) {
				if (sb.length() > 0) sb.append("\n");
				String ab = MakerAbilities.abilityId();
				sb.append("직업 능력: ").append(ab.isEmpty() ? "아직 (왕의 왕관)" : "_" + MakerAbilities.abilityName(ab) + "_");
				if (!ab.isEmpty() && hero.belongings.armor() instanceof com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor)
					sb.append(" (갑옷 충전 ").append((int) ((com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor) hero.belongings.armor()).charge).append("%)");
			}
			pathText = PixelScene.renderTextBlock(sb.toString(), 6);
			content.add(pathText);
		}
		if (MakerSpells.any()) {
			skillTitle = PixelScene.renderTextBlock("주문", 9);
			skillTitle.hardlight(Window.TITLE_COLOR);
			content.add(skillTitle);
			chargeText = PixelScene.renderTextBlock("충전 " + MakerSpells.charge + "/" + MakerSpells.maxCharge(), 6);
			content.add(chargeText);
			for (int t = 1; t <= MakerSpells.MAX_TIERS; t++) for (JsonValue sk : MakerSpells.all()) {
				if (MakerSpells.tierOf(sk) != t) continue;
				// 이미 다른 전직·능력을 골랐으면 그쪽 전용 주문은 숨김
				String sub = sk.getString("subclass", ""), ab = sk.getString("ability", "");
				if (!sub.isEmpty() && !MakerAbilities.subclassId().isEmpty() && !sub.equals(MakerAbilities.subclassId())) continue;
				if (!ab.isEmpty() && !MakerAbilities.abilityId().isEmpty() && !ab.equals(MakerAbilities.abilityId())) continue;
				SkillBtn b = new SkillBtn(hero, sk); skillBtns.add(b); content.add(b);
			}
		}
		if (pathText != null || skillTitle != null) { ColorBlock s = new ColorBlock(0, 1, 0xFF000000); seps.add(s); content.add(s); }
		if (MakerTalents.any()) {
			JsonValue ts = MakerTalents.tiers();
			for (int i = 1; i <= ts.size; i++) {
				TierPane p = new TierPane(hero, i, ts.get(i - 1));
				if (p.total == 0 || (p.buttons.isEmpty() && p.open)) { p.destroy(); continue; }
				tiers.add(p); content.add(p);
				ColorBlock s = new ColorBlock(0, 1, 0xFF000000); seps.add(s); content.add(s);
			}
		}
	}

	boolean scrolled = false;
	/** WndHero 는 처음에 맨 아래로 스크롤함 → 우리 창은 맨 위(스킬)부터 */
	@Override
	public void scrollTo(float x, float y) {
		if (!scrolled) { scrolled = true; super.scrollTo(0, 0); return; }
		super.scrollTo(x, y);
	}

	@Override
	protected void layout() {
		super.layout();
		float top = 2;
		int si = 0;
		if (pathText != null) {
			pathText.maxWidth((int) width - 4);
			pathText.setPos(x + (width - pathText.width()) / 2f, top);
			top = pathText.bottom() + 4;
		}
		if (skillTitle != null) {
			skillTitle.setPos(x + (width - skillTitle.width() - chargeText.width() - 4) / 2f, top);
			chargeText.setPos(skillTitle.right() + 4, skillTitle.top() + (skillTitle.height() - chargeText.height()) / 2f);
			top = skillTitle.bottom() + 4;
			int perRow = Math.max(1, (int) ((width + 2) / (SkillBtn.SIZE + 4)));
			int n = skillBtns.size();
			for (int row = 0; row * perRow < n; row++) {
				int cnt = Math.min(perRow, n - row * perRow);
				float gap = (width - cnt * SkillBtn.SIZE) / (cnt + 1);
				float left = x + gap;
				for (int k = 0; k < cnt; k++) {
					SkillBtn b = skillBtns.get(row * perRow + k);
					b.setPos(left, top); PixelScene.align(b);
					left += SkillBtn.SIZE + gap;
				}
				top += SkillBtn.SIZE + 3;
			}
		}
		if (pathText != null || skillTitle != null) {
			ColorBlock s = seps.get(si++); s.x = 0; s.y = top + 1; s.size(width, 1);
			top += 4;
		}
		for (TierPane p : tiers) {
			p.setRect(x, top, width, 0);
			top = p.bottom();
			ColorBlock s = seps.get(si++); s.x = 0; s.y = top + 2; s.size(width, 1);
			top += 5;
		}
		content.setSize(width, Math.max(height, top));
	}

	/** 다시 그리기: 영웅 창을 닫고 특성 탭으로 다시 엶 */
	static void reopen() {
		closeWindows();
		MakerTalents.openHeroWindow();
	}

	static void closeWindows() {
		try {
			com.watabou.noosa.Scene sc = com.watabou.noosa.Game.scene();
			java.lang.reflect.Field f = com.watabou.noosa.Group.class.getDeclaredField("members");
			f.setAccessible(true);
			for (Object o : new ArrayList<>((ArrayList<?>) f.get(sc))) if (o instanceof Window) ((Window) o).hide();
		} catch (Exception ignored) { }
	}

	// ------------------------------------------------------------ 주문 버튼

	static class SkillBtn extends Button {
		static final int SIZE = 20;
		final Hero hero; final JsonValue sk;
		Image icon; ColorBlock bg, cd;
		SkillBtn(Hero hero, JsonValue sk) {
			super();
			this.hero = hero; this.sk = sk;
			hotArea.blockLevel = PointerArea.NEVER_BLOCK;
			boolean locked = MakerSpells.lockReason(hero, sk) != null;
			bg = new ColorBlock(SIZE, SIZE, locked ? 0xFF2A2A2A : 0xFF4A3A6A); add(bg);
			icon = MakerSpells.icon(sk); add(icon);
			if (locked) icon.tint(0, 0, 0, 0.7f);
			Integer c = MakerSpells.cooldowns.get(sk.getString("id", ""));
			if (c != null && !locked) { cd = new ColorBlock(SIZE - 4, 3, 0xFFCC6666); add(cd); }
		}
		@Override protected void layout() {
			width = SIZE; height = SIZE;
			super.layout();
			bg.x = x; bg.y = y;
			icon.x = x + 2; icon.y = y + 2; PixelScene.align(icon);
			if (cd != null) { cd.x = x + 2; cd.y = y + SIZE - 4; }
		}
		@Override protected void onClick() {
			super.onClick();
			GameScene.show(new MakerSpells.WndSpellInfo(hero, sk, true));
		}
	}

	// ------------------------------------------------------------ 특성 단계

	static class TierPane extends Component {
		final int tier; final Hero hero; final JsonValue def;
		RenderedTextBlock title, lock;
		final List<TalBtn> buttons = new ArrayList<>();
		final List<Image> stars = new ArrayList<>();
		boolean open; int total = 0;

		TierPane(Hero hero, int tier, JsonValue def) {
			super();
			this.hero = hero; this.tier = tier; this.def = def;
			String why = MakerTalents.tierLock(tier, hero);
			open = why == null;
			title = PixelScene.renderTextBlock(def.getString("name", tier + "단계"), 9);
			title.hardlight(open ? Window.TITLE_COLOR : 0x888888);
			add(title);
			if (open) {
				int tot = def.getInt("points", 5), avail = Math.max(0, MakerTalents.available(tier, hero)), used = MakerTalents.spent(tier);
				for (int i = 0; i < tot; i++) {
					Image im = new Speck().image(Speck.STAR);
					if (i >= avail && i < avail + used) im.tint(0.75f, 0.75f, 0.75f, 0.9f);
					else if (i >= avail + used) im.tint(0f, 0f, 0f, 0.9f);
					stars.add(im); add(im);
				}
			} else {
				lock = PixelScene.renderTextBlock(why, 6);
				lock.hardlight(0x888888); add(lock);
			}
			JsonValue h = HeroRuntime.data();
			for (JsonValue t : h.get("talents")) if (t.getInt("tier", 1) == tier) total++;
			for (JsonValue t : h.get("talents")) if (t.getInt("tier", 1) == tier && MakerTalents.visible(t)) { TalBtn b = new TalBtn(hero, t, open); buttons.add(b); add(b); }
		}

		@Override protected void layout() {
			super.layout();
			float titleWidth = title.width() + 2 + Math.min(stars.size(), 10) * 6;
			if (lock != null) titleWidth = title.width() + 4 + lock.width();
			title.setPos(x + (width - titleWidth) / 2f, y);
			float left = title.right() + 2, starTop = title.top() + (stars.size() > 10 ? -2 : 1);
			int k = 0;
			for (Image s : stars) {
				s.x = left; s.y = starTop; PixelScene.align(s);
				left += 6;
				if (++k == 10) { starTop += 6; left = title.right() + 2; }
			}
			if (lock != null) lock.setPos(title.right() + 4, title.top() + (title.height() - lock.height()) / 2f);
			int perRow = Math.max(1, (int) (width / (TalentButton.WIDTH + 2)));
			float top = title.bottom() + 4;
			for (int row = 0; row * perRow < buttons.size(); row++) {
				int cnt = Math.min(perRow, buttons.size() - row * perRow);
				float gap = (width - cnt * TalentButton.WIDTH) / (cnt + 1);
				float l = x + gap;
				for (int i = 0; i < cnt; i++) {
					TalBtn b = buttons.get(row * perRow + i);
					b.setPos(l, top); PixelScene.align(b);
					l += TalentButton.WIDTH + gap;
				}
				top += TalentButton.HEIGHT + 2;
			}
			height = top - y;
		}
	}

	/** 원작 TalentButton 과 같은 그림 (talent_button.png + talent_icons.png) */
	static class TalBtn extends Button {
		final Hero hero; final JsonValue t; final boolean open;
		Image bg; TalentIcon icon; ColorBlock fill;
		TalBtn(Hero hero, JsonValue t, boolean open) {
			super();
			this.hero = hero; this.t = t; this.open = open;
			hotArea.blockLevel = PointerArea.NEVER_BLOCK;
			int max = Math.max(1, Math.min(6, t.getInt("maxPoints", 2)));
			fill = new ColorBlock(0, 4, 0xFFFFFF44); add(fill);
			bg = new Image(Assets.Interfaces.TALENT_BUTTON); add(bg);
			bg.frame(20 * (max - 1), 0, TalentButton.WIDTH, TalentButton.HEIGHT);
			icon = new TalentIcon(Math.max(0, t.getInt("icon", 0))); add(icon);
			if (!open) { icon.tint(0, 0, 0, 0.6f); bg.tint(0, 0, 0, 0.4f); }
		}
		@Override protected void layout() {
			width = TalentButton.WIDTH; height = TalentButton.HEIGHT;
			super.layout();
			int max = Math.max(1, t.getInt("maxPoints", 2));
			fill.x = x + 2; fill.y = y + TalentButton.WIDTH - 1;
			fill.size(Math.min(1f, MakerTalents.get(t.getString("id", "")) / (float) max) * (TalentButton.WIDTH - 4), 5);
			bg.x = x; bg.y = y;
			icon.x = x + 2; icon.y = y + 2; PixelScene.align(icon);
		}
		@Override protected void onClick() {
			super.onClick();
			GameScene.show(new WndTalent(hero, t));
		}
	}

	/** 특성 설명 + 올리기 (원작 WndInfoTalent 모양) */
	static class WndTalent extends Window {
		WndTalent(final Hero hero, final JsonValue t) {
			int w = 120;
			TalentIcon ic = new TalentIcon(Math.max(0, t.getInt("icon", 0))); ic.x = 0; ic.y = 0; add(ic);
			String id = t.getString("id", "");
			RenderedTextBlock title = PixelScene.renderTextBlock(t.getString("name", id) + "  " + MakerTalents.get(id) + "/" + t.getInt("maxPoints", 2), 9);
			title.hardlight(TITLE_COLOR); title.setPos(20, (16 - title.height()) / 2f); add(title);
			RenderedTextBlock b = PixelScene.renderTextBlock(MakerTalents.desc(t), 6);
			b.maxWidth(w); b.setPos(0, 20); add(b);
			float y = b.bottom() + 4;
			final String why = MakerTalents.blocked(t, hero);
			if (why != null && !why.equals("이 단계의 포인트가 없음")) {
				RenderedTextBlock r = PixelScene.renderTextBlock("(" + why + ")", 6);
				r.hardlight(0xCC6666); r.setPos(0, y); add(r); y = r.bottom() + 4;
			}
			if (why == null) {
				RedButton up = new RedButton("올리기") {
					@Override protected void onClick() {
						hide();
						MakerTalents.upgrade(hero, t);
						reopen();
					}
				};
				up.icon(new Speck().image(Speck.STAR));
				up.setRect(0, y, w, 18); add(up); y += 20;
			}
			resize(w, (int) y);
		}
	}
}
