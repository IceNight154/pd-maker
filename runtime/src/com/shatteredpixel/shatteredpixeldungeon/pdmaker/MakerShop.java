/*
 * PDMaker — 상인 창 (캐릭터의 shop 설정: 사고파는 창을 따로 띄움 — 게임 원래 상점처럼 바닥의 물건을 직접 집는 방식이 아님)
 *   character.shop { on, title, greet, items: [ { item, price(0 = 자동), stock(-1 = 무제한) } ], priceRate(자동 값 = 아이템 가치 × %), sell(영웅이 팔 수 있음), sellRate(파는 값 = 가치 × %) }
 *   팔린 개수: StoryState 변수 shop.<캐릭터>.<번호>.  NPC 에게 말을 걸면(다른 이벤트가 없을 때) 열리고, 이벤트 명령 shop 으로도 엶.
 */
package com.shatteredpixel.shatteredpixeldungeon.pdmaker;

import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.ScrollPane;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.Game;
import com.watabou.noosa.audio.Sample;
import com.watabou.noosa.ui.Component;

import java.util.ArrayList;

public class MakerShop {

	static JsonValue shop(String charId) { JsonValue c = MakerRuntime.character(charId); JsonValue s = c == null ? null : c.get("shop"); return s != null && s.getBoolean("on", false) ? s : null; }
	public static boolean has(String charId) { return shop(charId) != null; }
	/** 말을 걸면 묻지 않고 바로 상인 창 */
	public static boolean direct(String charId) { JsonValue s = shop(charId); return s != null && s.getBoolean("direct", false); }
	static String T(String k, String fb) { return MakerRuntime.term(k, fb); }

	public static void open(final String charId, final Runnable after) {
		if (!has(charId)) { MakerRuntime.warnOnce("상인 기능이 꺼져 있는 캐릭터: " + charId); if (after != null) after.run(); return; }
		Game.runOnRenderThread(() -> {
			try { if (Game.scene() instanceof GameScene) { GameScene.show(new Wnd(charId, after)); return; } } catch (Throwable t) { MakerRuntime.log("상인 창 오류: " + t); }
			if (after != null) after.run();
		});
	}

	static int sold(String c, int i) { return StoryState.var("shop." + c + "." + i); }
	static int buyPrice(JsonValue s, JsonValue e, Item it) { int p = e.getInt("price", 0); return p > 0 ? p : Math.max(1, Math.round(Math.max(1, it.value()) * s.getInt("priceRate", 300) / 100f)); }
	static int sellPrice(JsonValue s, Item it) { return Math.max(1, Math.round(it.value() / (float) Math.max(1, it.quantity()) * s.getInt("sellRate", 50) / 100f)); }
	static boolean sellable(Item it, Hero h) { return it.value() > 0 && !it.unique && !(it instanceof EquipableItem && ((EquipableItem) it).isEquipped(h)) && !(it instanceof com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag); }

	static class Wnd extends Window {
		final String charId; final JsonValue s; final Runnable after; final int W;
		boolean selling; RenderedTextBlock gold; ScrollPane pane; Component content; RedButton bBuy, bSell;
		final ArrayList<float[]> rows = new ArrayList<>(); final ArrayList<Runnable> acts = new ArrayList<>();
		float listTop, listH;

		Wnd(String charId, Runnable after) {
			this.charId = charId; this.after = after; s = shop(charId);
			W = PixelScene.landscape() ? 190 : 126;
			JsonValue c = MakerRuntime.character(charId);
			String ttl = s.getString("title", ""); if (ttl.isEmpty()) ttl = c == null ? "" : c.getString("name", "");
			RenderedTextBlock title = PixelScene.renderTextBlock(StoryState.expand(ttl), 9);
			title.hardlight(MakerTheme.or("accent", 0xFFFF44)); title.setPos(2, 2); add(title);
			gold = PixelScene.renderTextBlock("", 7); gold.hardlight(MakerTheme.or("accent", 0xFFFF44)); add(gold);
			float y = title.bottom() + 3;
			String gr = s.getString("greet", "");
			if (!gr.isEmpty()) { RenderedTextBlock g = PixelScene.renderTextBlock(StoryState.expand(gr), 6); g.maxWidth(W - 4); g.setPos(2, y); add(g); y = g.bottom() + 3; }
			boolean canSell = s.getBoolean("sell", true);
			bBuy = new RedButton(T("shop.buy", "사기"), 7) { @Override protected void onClick() { selling = false; refill(); } };
			bBuy.setRect(0, y, canSell ? W / 2f - 1 : W, 16); add(bBuy);
			if (canSell) { bSell = new RedButton(T("shop.sell", "팔기"), 7) { @Override protected void onClick() { selling = true; refill(); } }; bSell.setRect(W / 2f + 1, y, W / 2f - 1, 16); add(bSell); }
			listTop = y + 18; listH = Math.max(60, Math.min(150, PixelScene.uiCamera.height * 0.8f - listTop - 22));
			content = new Component();
			pane = new ScrollPane(content) {
				@Override public void onClick(float x, float y) { for (int i = 0; i < rows.size(); i++) { float[] r = rows.get(i); if (y >= r[0] && y < r[1]) { acts.get(i).run(); return; } } }
			};
			add(pane);
			RedButton close = new RedButton(T("shop.close", "나가기"), 7) { @Override protected void onClick() { hide(); } };
			close.setRect(0, listTop + listH + 2, W, 16); add(close);
			resize(W, (int) (listTop + listH + 20));
			pane.setRect(0, listTop, W, listH);
			refill();
		}

		void row(float y, Item it, String label, String price, boolean dim, Runnable act) {
			ColorBlock bg = new ColorBlock(W, 19, rows.size() % 2 == 0 ? 0x22FFFFFF : 0x11FFFFFF); bg.y = y; content.add(bg);
			ItemSprite sp = new ItemSprite(it); sp.x = 2 + (16 - sp.width()) / 2f; sp.y = y + 1.5f + (16 - sp.height()) / 2f; content.add(sp);
			RenderedTextBlock pr = PixelScene.renderTextBlock(price, 7); pr.hardlight(dim ? MakerTheme.or("error", 0xFF6666) : MakerTheme.or("accent", 0xFFFF44)); pr.setPos(W - pr.width() - 3, y + (19 - pr.height()) / 2f); content.add(pr);
			RenderedTextBlock nm = PixelScene.renderTextBlock(label, 7); nm.maxWidth((int) (W - 26 - pr.width() - 4)); nm.setPos(21, y + (19 - nm.height()) / 2f); if (dim) nm.alpha(0.5f); content.add(nm);
			rows.add(new float[]{ y, y + 19 }); acts.add(act);
		}

		void refill() {
			content.clear(); rows.clear(); acts.clear();
			gold.text(T("shop.gold", "금화") + " " + Dungeon.gold); gold.setPos(W - gold.width() - 2, 3);
			bBuy.textColor(selling ? MakerTheme.or("text", 0xFFFFFF) : MakerTheme.or("accent", 0xFFFF44)); if (bSell != null) bSell.textColor(selling ? MakerTheme.or("accent", 0xFFFF44) : MakerTheme.or("text", 0xFFFFFF));
			float y = 0; final Hero h = Dungeon.hero;
			if (!selling) {
				JsonValue its = s.get("items"); int i = 0;
				if (its != null) for (final JsonValue e : its) {
					final int idx = i++;
					Item it0 = null; try { it0 = MakerItem.create(e.getString("item", "")); } catch (Throwable ignored) { }
					if (it0 == null) continue;
					final Item it = it0; it.identify(false);
					final int stock = e.getInt("stock", -1), left = stock < 0 ? -1 : Math.max(0, stock - sold(charId, idx)), price = buyPrice(s, e, it);
					final boolean out = left == 0, poor = Dungeon.gold < price;
					row(y, it, it.name() + (left > 0 ? "  (" + left + ")" : out ? "  (" + T("shop.soldout", "품절") + ")" : ""), String.valueOf(price), out || poor, () -> {
						if (out) return;
						GameScene.show(new WndOptions(new ItemSprite(it), it.name(), it.info(), poor ? T("shop.poor", "금화가 모자란다") : T("shop.buyFor", "사기 — %d 금화").replace("%d", String.valueOf(price)), T("shop.cancel", "취소")) {
							@Override protected boolean enabled(int index) { return index != 0 || !poor; }
							@Override protected void onSelect(int index) {
								if (index != 0 || Dungeon.gold < price) return;
								Item got = MakerItem.create(e.getString("item", "")); if (got == null) return;
								got.identify(false);
								Dungeon.gold -= price;
								if (stock >= 0) StoryState.setVar("shop." + charId + "." + idx, sold(charId, idx) + 1);
								if (!got.collect()) Dungeon.level.drop(got, h.pos).sprite.drop();
								Sample.INSTANCE.play(Assets.Sounds.GOLD);
								GLog.i(T("shop.bought", "%s 을(를) 샀다.").replace("%s", got.name()));
								refill();
							}
						});
					});
					y += 20;
				}
				if (rows.isEmpty()) { RenderedTextBlock t = PixelScene.renderTextBlock(T("shop.empty", "파는 물건이 없습니다."), 6); t.setPos(2, 2); content.add(t); y = 14; }
			} else {
				for (final Item it : new ArrayList<>(h.belongings.backpack.items)) {
					if (!sellable(it, h)) continue;
					final int price = sellPrice(s, it);
					row(y, it, it.name() + (it.quantity() > 1 ? " ×" + it.quantity() : ""), String.valueOf(price), false, () ->
						GameScene.show(new WndOptions(new ItemSprite(it), it.name(), it.info(), T("shop.sellFor", "팔기 — %d 금화").replace("%d", String.valueOf(price)), T("shop.cancel", "취소")) {
							@Override protected void onSelect(int index) {
								if (index != 0 || !h.belongings.backpack.items.contains(it)) return;
								Item one = it.detach(h.belongings.backpack); if (one == null) return;
								Dungeon.gold += price;
								Sample.INSTANCE.play(Assets.Sounds.GOLD);
								GLog.i(T("shop.sold", "%s 을(를) 팔았다.").replace("%s", one.name()));
								refill();
							}
						}));
					y += 20;
				}
				if (rows.isEmpty()) { RenderedTextBlock t = PixelScene.renderTextBlock(T("shop.nothing", "팔 수 있는 물건이 없습니다."), 6); t.setPos(2, 2); content.add(t); y = 14; }
			}
			content.setSize(W, Math.max(y, 1));
			pane.setRect(0, listTop, W, listH);
			pane.scrollTo(0, 0);
		}

		boolean closed;
		@Override public void hide() { super.hide(); if (!closed) { closed = true; if (after != null) after.run(); } }
	}
}
