package com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria.ElementArea;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria.NewOverHeat;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ShadowParticle;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfSharpshooting;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.Weapon;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.shatteredpixel.shatteredpixeldungeon.utils.GLog;
import com.watabou.noosa.audio.Sample;
import com.watabou.utils.Bundle;

import java.util.ArrayList;

public class Codex extends Weapon {

    // 당부사항
    // Codex, CastCodex, MeleeCodex, RangedCodex는 일종의 청사진으로, 여기의 값을 바꾸면 하위 코덱스 전체의 값을 조절합니다.
    // 전체가 아니라 개별 조정이 필요한 경우 해당 하위 클래스의 초기화 블럭(아래와 같이 중괄호만 있는 것)에서 변수를 바꾸거나, 메서드를 오버라이드해서 사용해 주세요.
    {
        stackable = true;
        quantity = defaultQuantity();

        bones = true; //무덤파기 가능
    }

    public static final float MAX_DURABILITY = 100;
    protected float durability = MAX_DURABILITY;
    protected float baseUses;

    public int tier;

    // 기본 개수
    public int defaultQuantity() {
        return 3;
    }

    // 힘 요구치
    public int STRReq(int lvl) {
        int req = STRReq(tier, lvl) - 1; //1 less str than normal for their tier
        if (masteryPotionBonus) {
            req -= 2;
        }
        return req;
    }

    public void hitSound() {
        Sample.INSTANCE.play(this);
    }

    @Override
    public ArrayList<String> actions(Hero hero) {
        ArrayList<String> actions = super.actions(hero);
        actions.remove(AC_EQUIP);
        return actions;
    }

    @Override
    public int min(int lvl) {
        return 0;
    }

    @Override
    public int max(int lvl) {
        return 0;
    }

    @Override
    public int proc(Char attacker, Char defender, int damage) {
        int result = super.proc(attacker, defender, damage);
        float dmgMulti = 1f;
        int dmgBonus = 0;

        dmgMulti *= NewOverHeat.codexDamageMultiplier(Dungeon.hero); // 과부하 버프의 코덱스 데미지 피해 배율
        if (attacker instanceof Hero) {
            NewOverHeat.codexProc((Hero) attacker, defender);
        }

        return Math.round(result*dmgMulti) + dmgBonus;
    }

    public void affectElement(ArrayList<Integer> cells) {
        Buff.affect(curUser, ElementArea.class).setup(cells, NewOverHeat.getBuff(curUser).getElement() == null ? NewOverHeat.ElementType.FIRE : NewOverHeat.getBuff(curUser).getElement());
    }

    public void affectElement(int cell) {
        ArrayList<Integer> cells = new ArrayList<>();
        cells.add(cell);
        affectElement(cells);
    }

    // 코덱스 사용 시 사용하는 턴 수입니다.
    protected float castingTurn() {
        return 1f;
    }

    // 코덱스 사용 시 작동하는 코드입니다. 코덱스의 공격이나 작동 등 무언가 하기 이전에 아이템 사용 즉시 작동합니다.
    public void beforeUse() {
        if ((cursed || hasCurseEnchant()) && !cursedKnown) {
            GLog.n(Messages.get(this, "curse_discover"));
        }
        cursedKnown = true;

        // 사용 시 감정
        if (!isIdentified()) this.identify();

        // 힘이 부족할 경우 저주 부여
        if (!cursed && curUser.STR() < STRReq(curItem.trueLevel())) {
            enchantment = Weapon.Enchantment.randomCurse();
            cursed = true;

            CellEmitter.get(curUser.pos).burst(ShadowParticle.UP, 5);
            Sample.INSTANCE.play(Assets.Sounds.CURSED);
            GLog.w(Messages.get(Codex.class, "heavy_cursed"));
        }

        // 오버히트 게이지를 올립니다.
        Buff.affect(curUser, NewOverHeat.class).heat(8);
    }

    // 코덱스 사용 후 작동하는 코드입니다. 코덱스의 공격이나 작동 등 무언가 하고 나서 작동합니다.
    public void afterUse() {
        // 사용 시 턴 소모. 증강 시의 턴 변화를 반영합니다.
        curUser.spendAndNext(augment.delayFactor(castingTurn()));

        Buff.affect(curUser, NewOverHeat.CodexUsed.class, NewOverHeat.CodexUsed.DURATION);
        Buff.affect(curUser, LastCodex.class).set(this);

        // 사용 시 사용 횟수 감소
        decrementDurability();
    }

    // 공격형 코덱스의 공격 후 작동하는 코드입니다. 오버라이드해서 사용하시면 됩니다. hit가 true면 명중 시, false면 회피 시입니다.
    protected void onAttackComplete(Char enemy, int cell, boolean hit) {}

    @Override
    public int damageRoll(Char owner) {
        // min()~max() 사이의 랜덤 값을 반환합니다. 증강 시의 공격력 변화를 반영합니다.
        int damage = augment.damageFactor(super.damageRoll(owner));

        if (owner instanceof Hero) {
            int exStr = ((Hero) owner).STR() - STRReq();
            if (exStr > 0) {
                damage += Hero.heroDamageIntRange(0, exStr);
            }
        }
        
        return damage;
    }

    // 코덱스 사용 횟수 회복 메서드입니다. amount만큼 회복됩니다.
    public void repair(float amount) {
        durability += amount;
        durability = Math.min(durability, MAX_DURABILITY);
    }

    // 코덱스 사용 횟수 감소 메서드입니다. amount만큼 감소합니다.
    public void damage(float amount) {
        durability -= amount;
        durability = Math.max(durability, 1); //cannot break from doing this
    }

    // 건드릴 필요 없습니다.
    public final float durabilityPerUse() {
        return durabilityPerUse(level());
    }

    //classes that add steps onto durabilityPerUse can turn rounding off, to do their own rounding after more logic
    protected boolean useRoundingInDurabilityCalc = true;

    // 사용 횟수 감소량입니다. 예를 들어 특성 등으로 추가 사용 횟수를 얻었다면, usages에 그 배율을 곱해 주세요.
    public float durabilityPerUse(int level) {
        // 강화 시 기본 사용 횟수가 1.5배씩 증가합니다.
        float usages = baseUses * (float) (Math.pow(1.5f, level));

        // 속도 증강 시 +50%의 사용 횟수를 가지며, 공격력 증강 시 -33%의 사용 횟수를 가집니다.
        usages /= augment.delayFactor(1f);

        // 저격의 반지 효과입니다.
        if (Dungeon.hero != null) usages *= RingOfSharpshooting.durabilityMultiplier(Dungeon.hero);

        // 사용 횟수가 100회가 넘어가면 무한이 됩니다.
        if (usages >= 100f) return 0;

        // 건드릴 필요 없습니다.
        if (useRoundingInDurabilityCalc) {
            usages = Math.round(usages);
            //add a tiny amount to account for rounding error for calculations like 1/3
            return (MAX_DURABILITY / usages) + 0.001f;
        } else {
            //rounding can be disabled for classes that override durability per use
            return MAX_DURABILITY / usages;
        }
    }

    // 사용 횟수 감소 로직입니다. 건드릴 필요 없습니다.
    protected void decrementDurability() {
        durability -= durabilityPerUse();
        if (durability > 0 && durability <= durabilityPerUse()) {
            GLog.w(Messages.get(this, "about_to_break"));
        } else if (durabilityPerUse() < 100f && durability <= 0) {
            GLog.n(Messages.get(this, "has_broken"));
            detach(curUser.belongings.backpack);
            durability = MAX_DURABILITY;
        }
    }

    // 남은 사용 횟수를 반환합니다.
    public float durabilityLeft() {
        return durability;
    }

    // 건드릴 필요 없습니다.
    @Override
    public void reset() {
        super.reset();
        durability = MAX_DURABILITY;
    }

    // 설명문을 작성하는 메서드입니다.
    @Override
    public String info() {
        String info = super.info();

        if (levelKnown) {
            info += "\n\n" + Messages.get(this, "stats_known", tier, augment.damageFactor(min()), augment.damageFactor(max()), STRReq());
            if (Dungeon.hero != null) {
                if (STRReq() > Dungeon.hero.STR()) {
                    info += " " + Messages.get(this, "too_heavy");
                } else if (Dungeon.hero.STR() > STRReq()) {
                    info += " " + Messages.get(this, "excess_str", Dungeon.hero.STR() - STRReq());
                }
            }
        } else {
            info += "\n\n" + Messages.get(this, "stats_unknown", tier, min(0), max(0), STRReq(0));
            if (Dungeon.hero != null && STRReq(0) > Dungeon.hero.STR()) {
                info += " " + Messages.get(this, "probably_too_heavy");
            }
        }

        if (enchantment != null && (cursedKnown || !enchantment.curse())) {
            info += "\n\n" + Messages.get(this, "enchanted", enchantment.name());
            if (enchantHardened) info += " " + Messages.get(this, "enchant_hardened");
            info += " " + enchantment.desc();
        } else if (enchantHardened) {
            info += "\n\n" + Messages.get(this, "hardened_no_enchant");
        }

        if (cursedKnown && cursed) {
            info += "\n\n" + Messages.get(this, "cursed");
        } else if (!isIdentified() && cursedKnown) {
            info += "\n\n" + Messages.get(this, "not_cursed");
        }

        info += "\n\n";
        String statsInfo = Messages.get(this, "stats_desc");
        if (!statsInfo.isEmpty()) info += statsInfo + " ";

        switch (augment) {
            case SPEED:
                info += " " + Messages.get(this, "faster");
                break;
            case DAMAGE:
                info += " " + Messages.get(this, "stronger");
                break;
            case NONE:
        }

        if (levelKnown) {
            if (durabilityPerUse() > 0) {
                info += "\n\n" + Messages.get(this, "uses_left",
                        (int) Math.ceil(durability / durabilityPerUse()),
                        (int) Math.ceil(MAX_DURABILITY / durabilityPerUse()));
            } else {
                info += "\n\n" + Messages.get(this, "unlimited_uses");
            }
        } else {
            if (durabilityPerUse(0) > 0) {
                info += "\n\n" + Messages.get(this, "unknown_uses", (int) Math.ceil(MAX_DURABILITY / durabilityPerUse(0)));
            } else {
                info += "\n\n" + Messages.get(this, "unlimited_uses");
            }
        }

        return info;
    }

    // 코덱스의 가격을 결정하는 메서드입니다. -1로 설정하는 경우 팔 수 없게 됩니다.
    @Override
    public int value() {
        int price = 5 * tier * quantity;
        if (hasGoodEnchant()) {
            price *= 1.5;
        }
        if (cursedKnown && (cursed || hasCurseEnchant())) {
            price /= 2;
        }
        if (levelKnown && level() > 0) {
            price *= (level() + 1);
        }
        if (price < 1) {
            price = 1;
        }
        return price;
    }

    // 오른쪽 위에 나오는 숫자 혹은 문자입니다. 현재는 코덱스의 개수를 보여 줍니다.
    @Override
    public String status() {
        //show quantity even when it is 1
        return Integer.toString(quantity);
    }

    private static final String DURABILITY = "durability";

    // 게임 세이브/로드 시 변수를 저장하고 불러오는 메서드입니다.
    @Override
    public void storeInBundle(Bundle bundle) {
        super.storeInBundle(bundle);
        bundle.put(DURABILITY, durability);
    }

    @Override
    public void restoreFromBundle(Bundle bundle) {
        super.restoreFromBundle(bundle);
        durability = bundle.getFloat(DURABILITY);
    }

    // 플레이스홀더란 해당 아이템의 종류를 나타내는 대표 이미지로, 검은색 외곽선만 있는 스프라이트로 묘사됩니다. 필요한 경우 SOMETHING을 수정하시면 됩니다.
    public static class PlaceHolder extends Item {

        {
            image = ItemSpriteSheet.SOMETHING;
        }

        @Override
        public boolean isSimilar(Item item) {
            //yes, even though it uses a dart outline
            return item instanceof Codex;
        }

        @Override
        public String status() {
            return null;
        }

        @Override
        public String info() {
            return "";
        }
    }

    public static class LastCodex extends Buff {
        {
            type = buffType.NEUTRAL;
            revivePersists = true;
        }

        Codex codex = null;

        public void set(Codex codex) {
            this.codex = codex;
        }

        public Codex getCodex() {
            return codex;
        }

        private static final String CODEX = "codex";

        @Override
        public void storeInBundle(Bundle bundle) {
            super.storeInBundle(bundle);

            bundle.put(CODEX, codex);
        }

        @Override
        public void restoreFromBundle(Bundle bundle) {
            super.restoreFromBundle(bundle);

            codex = (Codex) bundle.get(CODEX);
        }
    }
}
