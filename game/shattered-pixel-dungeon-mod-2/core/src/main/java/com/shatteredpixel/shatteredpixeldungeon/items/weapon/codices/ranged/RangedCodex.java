package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.ranged;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfSharpshooting;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.Weapon;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.curses.Explosive;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Projecting;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.shatteredpixel.shatteredpixeldungeon.ui.InventoryPane;
import com.shatteredpixel.shatteredpixeldungeon.ui.QuickSlotButton;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Bundle;

import java.util.ArrayList;

//원거리형 코덱스 상위 클래스입니다.
public class RangedCodex extends Codex {

    {
        defaultAction = AC_THROW;
        usesTargeting = true;

        casting = false;

        // 원거리형 코덱스의 기본 사용 횟수입니다. 따로 지정하지 않아도 이만큼의 사용 횟수를 가집니다.
        baseUses = 8;
    }

    public RangedCodex parent;

    //투사체 이미지입니다. 해당 클래스의 초기화 블럭에서 다시 지정해 주셔야 합니다.
    public int magicImage = this.image;

    public boolean casting;

    @Override
    public void hitSound() {
        Sample.INSTANCE.play(Assets.Sounds.BLAST);
    }

    @Override
    protected int usesToID() {
        return 1;
    }

    @Override
    public ArrayList<String> actions(Hero hero) {
        ArrayList<String> actions = super.actions(hero);
        actions.remove(AC_EQUIP);
        return actions;
    }
    
    @Override
    public int min() {
        if (Dungeon.hero != null) {
            return Math.max(0, min(buffedLvl() + RingOfSharpshooting.levelDamageBonus(Dungeon.hero)));
        } else {
            return Math.max(0, min(buffedLvl()));
        }
    }

    @Override
    public int min(int lvl) {
        // 원거리형 코덱스의 최소 피해량입니다. 필요한 경우 오버라이딩하시면 됩니다.
        return 2 * tier + //base
                lvl;      //level scaling
    }

    @Override
    public int max() {
        if (Dungeon.hero != null) {
            return Math.max(0, max(buffedLvl() + RingOfSharpshooting.levelDamageBonus(Dungeon.hero)));
        } else {
            return Math.max(0, max(buffedLvl()));
        }
    }

    @Override
    public int max(int lvl) {
        // 원거리형 코덱스의 최대 피해량입니다.
        return 5 * tier +   //base
                tier * lvl; //level scaling
    }

    public int buffedLvl() {
        if (parent != null) {
            return parent.buffedLvl();
        } else {
            return super.buffedLvl();
        }
    }

    public Item upgrade(boolean enchant) {
        if (!bundleRestoring) {
            durability = MAX_DURABILITY;
            extraThrownLeft = false;
            quantity = defaultQuantity();
        }
        //thrown weapons don't get curse weakened
        boolean wasCursed = cursed;
        super.upgrade(enchant);
        if (wasCursed && hasCurseEnchant()) {
            cursed = wasCursed;
        }
        return this;
    }

    @Override
    public Item upgrade() {
        if (!bundleRestoring) {
            durability = MAX_DURABILITY;
            extraThrownLeft = false;
            quantity = defaultQuantity();
        }
        return super.upgrade();
    }

    public boolean isSimilar(Item item) {
        return trueLevel() == item.trueLevel() && getClass() == item.getClass();
    }

    @Override
    public int throwPos(Hero user, int dst) {

        int projecting = 0;
        if (hasEnchant(Projecting.class, user)) {
            projecting += 4;
        }

        if (projecting > 0
                && (Dungeon.level.passable[dst] || Dungeon.level.avoid[dst] || Actor.findChar(dst) != null)
                && Dungeon.level.distance(user.pos, dst) <= Math.round(projecting * Weapon.Enchantment.genericProcChanceMultiplier(user))) {
            return dst;
        } else {
            return super.throwPos(user, dst);
        }
    }

    // 정확성 배율입니다.
    @Override
    public float accuracyFactor(Char owner, Char target) {
        float accFactor = super.accuracyFactor(owner, target);

        accFactor *= adjacentAccFactor(owner, target);

        return accFactor;
    }

    //근접 시 정확성 배율입니다.
    protected float adjacentAccFactor(Char owner, Char target) {
        if (Dungeon.level.adjacent(owner.pos, target.pos)) {
            return 0.5f;
        } else {
            return 1f;
        }
    }

    @Override
    public void doThrow(Hero hero) {
        parent = null; //reset parent before throwing, just in case
        if (((levelKnown && level() > 0) || hasGoodEnchant() || masteryPotionBonus || enchantHardened)
                && !extraThrownLeft && quantity() == 1 && durabilityLeft() <= durabilityPerUse()) {
            GameScene.show(new WndOptions(new ItemSprite(this), Messages.titleCase(title()),
                    Messages.get(MissileWeapon.class, "break_upgraded_warn_desc"),
                    Messages.get(MissileWeapon.class, "break_upgraded_warn_yes"),
                    Messages.get(MissileWeapon.class, "break_upgraded_warn_no")) {
                @Override
                protected void onSelect(int index) {
                    if (index == 0) {
                        RangedCodex.super.doThrow(hero);
                    } else {
                        QuickSlotButton.cancel();
                        InventoryPane.cancelTargeting();
                    }
                }

                @Override
                public void onBackPressed() {
                    super.onBackPressed();
                    QuickSlotButton.cancel();
                    InventoryPane.cancelTargeting();
                }
            });

        } else {
            super.doThrow(hero);
        }
    }

    @Override
    protected void onThrow(int cell) {
        Char enemy = Actor.findChar(cell);

        if (enemy == null || enemy == curUser) {
            parent = null;
        } else {
            onAttackComplete(enemy, cell, curUser.codexAttack(enemy, this));
        }

        affectElement(cell);

        afterUse();

        if (durabilityLeft() > 0) {
            this.collect();
        }
        updateQuickslot();
    }

    @Override
    public void cast(Hero user, int dst) {
        beforeUse();
        this.casting = true;
        super.cast(user, dst);
        this.casting = false;
    }

    @Override
    protected void decrementDurability() {
        if (parent != null) {
            if (parent.durability <= parent.durabilityPerUse()) {
                durability = 0;
                parent.durability = MAX_DURABILITY;
                parent.extraThrownLeft = false;
                if (parent.durabilityPerUse() < 100f) {
                    GLog.n(Messages.get(this, "has_broken"));
                }
            } else {
                parent.durability -= parent.durabilityPerUse();
                if (parent.durability > 0 && parent.durability <= parent.durabilityPerUse()) {
                    GLog.w(Messages.get(this, "about_to_break"));
                }
            }
            parent = null;
        } else {
            super.decrementDurability();
        }
    }

    @Override
    public Item split(int amount) {
        bundleRestoring = true;
        Item split = super.split(amount);
        bundleRestoring = false;

        if (split != null) {
            RangedCodex m = (RangedCodex) split;
            m.durability = MAX_DURABILITY;
            m.parent = this;
            extraThrownLeft = m.extraThrownLeft = true;
        }

        return split;
    }

    @Override
    public Item merge(Item other) {
        super.merge(other);
        if (isSimilar(other)) {
            extraThrownLeft = false;

            durability += ((RangedCodex) other).durability;
            durability -= MAX_DURABILITY;
            while (durability <= 0) {
                quantity -= 1;
                durability += MAX_DURABILITY;
            }

            masteryPotionBonus = masteryPotionBonus || ((RangedCodex) other).masteryPotionBonus;
            levelKnown = levelKnown || other.levelKnown;
            cursedKnown = cursedKnown || other.cursedKnown;
            enchantHardened = enchantHardened || ((RangedCodex) other).enchantHardened;

            //if other has a curse/enchant status that's a higher priority, copy it. in the following order:
            //curse infused
            if (!curseInfusionBonus && ((RangedCodex) other).curseInfusionBonus && ((RangedCodex) other).hasCurseEnchant()) {
                enchantment = ((RangedCodex) other).enchantment;
                curseInfusionBonus = true;
                cursed = cursed || other.cursed;
                //enchanted
            } else if (!curseInfusionBonus && !hasGoodEnchant() && ((RangedCodex) other).hasGoodEnchant()) {
                enchantment = ((RangedCodex) other).enchantment;
                cursed = other.cursed;
                //nothing
            } else if (!curseInfusionBonus && hasCurseEnchant() && !((RangedCodex) other).hasCurseEnchant()) {
                enchantment = ((RangedCodex) other).enchantment;
                cursed = other.cursed;
            }
            //cursed (no copy as other cannot have a higher priority status)

            //special case for explosive, as it tracks a variable
            if (((RangedCodex) other).enchantment instanceof Explosive
                    && enchantment instanceof Explosive) {
                ((Explosive) enchantment).merge((Explosive) ((RangedCodex) other).enchantment);
            }
        }
        return this;
    }

    public boolean extraThrownLeft = false;

    @Override
    public float castDelay(Char user, int cell) {
        // onUse()에서 이미 castingTurn()만큼의 턴을 소모하기 때문에, 아이템 투척 자체로는 턴을 소모하지 않습니다.
        // 사용에 필요한 턴 수정이 필요한 경우 해당 코덱스 클래스에서 castingTurn()을 오버라이딩해 주세요.
        return 0;
    }


    @Override
    protected void onAttackComplete(Char enemy, int cell, boolean hit) {
        parent = null;
    }



    @Override
    public void afterUse() {
        super.afterUse();
        if (parent != null) parent.cursedKnown = true;
    }

    @Override
    public int image() {
        if (casting) return magicImage;
        else return image;
    }

    private static final String EXTRA_LEFT = "extra_left";

    @Override
    public void storeInBundle(Bundle bundle) {
        super.storeInBundle(bundle);
        bundle.put(EXTRA_LEFT, extraThrownLeft);
    }

    private static boolean bundleRestoring = false;

    @Override
    public void restoreFromBundle(Bundle bundle) {
        bundleRestoring = true;
        super.restoreFromBundle(bundle);
        bundleRestoring = false;
        extraThrownLeft = bundle.getBoolean(EXTRA_LEFT);
    }
}
