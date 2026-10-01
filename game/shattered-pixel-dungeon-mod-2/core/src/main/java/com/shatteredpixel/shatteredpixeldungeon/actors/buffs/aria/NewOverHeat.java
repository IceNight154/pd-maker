package com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FlavourBuff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Paralysis;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.AriaTalents;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.effects.CellEmitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.FloatingText;
import com.shatteredpixel.shatteredpixeldungeon.effects.Speck;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ElementChangeParticles;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.FlameParticle;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaMeltdownParticle;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.codices.Codex;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Blocking;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.HeroIcon;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndTitledMessage;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Image;
import com.watabou.noosa.Visual;
import com.watabou.noosa.audio.Sample;

import com.watabou.noosa.particles.Emitter;
import com.watabou.utils.BArray;
import com.watabou.utils.Bundle;
import com.watabou.utils.PathFinder;
import com.watabou.utils.PointF;
import com.watabou.utils.Random;

public class NewOverHeat extends Buff implements ActionIndicator.Action {

    {
        type = buffType.NEUTRAL; // 버프 타입은 중립으로, NEGATIVE로 할 경우 청정의 물약 등에 제거될 수 있으니 이런 버프의 경우 중립이 낫습니다.

        revivePersists = true; // 죽어도 남아있게 하는 코드입니다.
    }

    public enum ElementType {
        FIRE("fire"), // 불 원소
        WATER("water"), // 물 원소
        EARTH("earth"), // 땅 원소
        WIND("wind"); // 바람 원소

        final String name; // 각 원소의 이름. 일종의 key로 작용합니다.

        ElementType(String name) { // 위의 name변수를 생성자에서 받아서 지정해 주는 것입니다. 건드릴 필요 없어요.
            this.name = name;
        }

        // 각 원소 별 이름 문장을 간단하게 반환해 주는 메서드입니다. ElementType.FIRE.getName()을 호출하면 actors_ko.properties에서 [.element_fire=]에 지정해 준 문장에 따라 "불"이 나와요.
        public String getName() {
            return Messages.get(NewOverHeat.class, "element_"+name);
        }

        public static ElementType getElementByIndex(int index) { // int 숫자로 ElementType을 반환해 주는 메서드입니다. 0번째는 불, 1번째는 물, 2번째는 땅, 3번째는 바람이에요.
            switch (index) {
                case 0: default:
                    return FIRE;
                case 1:
                    return WATER;
                case 2:
                    return EARTH;
                case 3:
                    return WIND;
            }
        }

        public static int getIndexByElement(ElementType type) { // int 숫자로 ElementType을 반환해 주는 메서드입니다. 0번째는 불, 1번째는 물, 2번째는 땅, 3번째는 바람이에요.
            switch (type) {
                case FIRE: default:
                    return 0;
                case WATER:
                    return 1;
                case EARTH:
                    return 2;
                case WIND:
                    return 3;
            }
        }
    }

    private static final int OVERHEAT_MAX = 100; // 오버히트 게이지 최대치
    private static final String TXT_STATUS = "%d/%d"; // 오버히트 게이지 표기 방식. 액션 인디케이터(버튼)에서 사용됩니다.

    private int gauge = 0; // 현재 오버히트 게이지입니다. private이기 때문에 외부에서 접근할 수 없어요. 필요 시 cool()이나 heat()메서드로 조절해 주시면 됩니다.
    private ElementType element = ElementType.FIRE; // 버프 제공 당시 원소는 불로 지정했습니다.
    private ElementType previousElement = element; // 이전 턴의 원소입니다. 원소가 바뀌었는지 확인하는 용도입니다.
    private int meltdownDelay = 4; //멜트다운 시 act()에서 매 턴마다 1씩 감소합니다. 0이 되면 onMeltdown()을 호출합니다.

    public ElementType randomElement() { // 현재 원소를 랜덤한 원소로 바꾸되, 현재 원소와 달라질 때까지 반복하기 때문에 항상 현재 원소와 결과 원소는 같지 않습니다.
        ElementType newElement;
        do {
            switch (Random.Int(4)) {
                case 0: default:
                    newElement = ElementType.FIRE;
                    break;
                case 1:
                    newElement = ElementType.WATER;
                    break;
                case 2:
                    newElement = ElementType.EARTH;
                    break;
                case 3:
                    newElement = ElementType.WIND;
                    break;
            }
        } while (newElement == element);

        element = newElement;
        ActionIndicator.refresh();
        return element; // 바뀐 원소를 반환합니다. 예를 들어 Glog.i()를 사용해 원소를 %s로 바꾸었다. 등의 문구를 출력할 수 있겠네요.
    }

    public ElementType setElement(ElementType element) { // 원소를 매개변수에 들어온 값으로 변경하고 그 결과를 반환합니다.
        this.element = element;
        ActionIndicator.refresh();
        return element;
    }

    public ElementType getElement() { // 현재 원소를 반환합니다.
        return element;
    }

    // 원소를 매개변수에 들어온 값으로 변경하고 그 결과를 반환합니다.
    // 다만 이 메서드는 어느 클래스에서든 사용할 수 있습니다. Dungeon.hero.buff(NewOverHeat.class)등을 통해 따로 버프 인스턴스를 찾을 필요가 없어요.
    public static ElementType changeElement(Char target, ElementType element) {
        return Buff.affect(target, NewOverHeat.class).setElement(element);
    }

    public static NewOverHeat getBuff(Hero hero) {
        return hero.buff(NewOverHeat.class);
    }

    public static void onChangeElement(ElementType resultElement) { //원소 변경 시 작동하는 코드입니다.
        //TODO: 원소 변경 시 나타나야 하는 이펙트, 사운드 출력 등을 추가해 주세요.
        Hero hero = Dungeon.hero;
        if (hero == null) return;

        AriaTalents.onElementSwitch(getBuff(hero));

        if (resultElement == ElementType.EARTH) {
            Blocking.BlockBuff b = Buff.affect(hero, Blocking.BlockBuff.class);
            int shield = Math.round(hero.HT * 0.05f);
            b.setShield(shield);
            hero.sprite.showStatusWithIcon(CharSprite.POSITIVE, Integer.toString(shield), FloatingText.SHIELDING);
            hero.sprite.emitter().burst(Speck.factory(Speck.LIGHT), 5);
        }

        onChangeElementEffect(hero);
    }

    public void heat(int amount) { // 게이지를 지정한 양만큼 늘리는 메서드입니다. 최대치 이상으로 늘어나지 않습니다.
        gauge = Math.min(OVERHEAT_MAX, gauge + amount);
        ActionIndicator.refresh();

        if (isMeltdown()) {
            target.sprite.showStatus(CharSprite.WARNING, Messages.get(this, "meltdown"));
        }
    }

    public void cool(int amount) { // 게이지를 지정한 양만큼 줄이는 메서드입니다. 최소치 이하로 감소하지 않습니다.
        gauge = Math.max(0, gauge - amount);
        ActionIndicator.refresh();
    }

    public void onMeltdown() {
        Sample.INSTANCE.play(Assets.Sounds.ATK_MELTDOWN);

        PathFinder.buildDistanceMap( target.pos, BArray.not( Dungeon.level.solid, null ), 3 );
        for (int i = 0; i < PathFinder.distance.length; i++) {
            if (PathFinder.distance[i] < Integer.MAX_VALUE) {
                CellEmitter.get(i).burst(FlameParticle.FACTORY, 5);
                Char ch = Actor.findChar(i);
                if (ch instanceof Mob && target.buff(Codex.LastCodex.class) != null) {
                    ch.damage(target.buff(Codex.LastCodex.class).getCodex().max(), this);
                }
                if (ch instanceof Hero) {
                    ch.damage(Math.round(ch.HT*0.25f), this);
                }
            }

            // TODO: 멜트다운 시 이펙트 추가
        }

        randomElement();

        // 멜트다운 이펙트 범위를 더 크게(1.6배), 강도를 약간 올려(1.2배) 0.25초 분사
        Emitter.Factory MELTDOWN = new ManaMeltdownParticle.Factory(1.3f, 1.2f);
        final int count = 12 + Random.Int(8); // 12~19개 정도로 분사
        CellEmitter.center(target.pos).burst(MELTDOWN, count);
        //각종 이펙트 및 데미지 입히기, 버프 주기 등. target은 NewOverHeat 버프를 가진 Char 인스턴스를 의미합니다.
        Buff.affect(target, Paralysis.class, 1f);

        resetMeltdown();
    }

    public void resetMeltdown() {
        meltdownDelay = 4;
        gauge = 60;
    }

    public int heatLevel() { // 현재 게이지에 따른 오버히트 레벨을 반환합니다.
        if (gauge == 0) { //0
            return 0;
        } else if (gauge < 25) { //1~24
            return 1;
        } else if (gauge < 50) { //25~49
            return 2;
        } else if (gauge < 75) { //50~74
            return 3;
        } else if (gauge < 100) { //75~99
            return 4;
        } else { //100
            return 5;
        }
    }

    public boolean isMeltdown() { // 현재 버프가 멜트다운인지 여부를 반환합니다.
        return heatLevel() == 5;
    }

    @Override
    public boolean attachTo(Char target) { // 버프가 붙을 때 호출
        ActionIndicator.setAction(this); // 원소 변경 버튼을 생성합니다.
        return super.attachTo(target);
    }

    @Override
    public void detach() { // 버프가 제거될 때 호출, 그러나 여기에서 딱히 쓰일 일은 없음
        ActionIndicator.clearAction(); // 원소 변경 버튼을 제거합니다.
        super.detach();
    }

    @Override
    public boolean act() {
        spend(TICK); //이게 없으면 무한로딩이 생기니 주의하세요.
        if (isMeltdown()) {
            meltdownDelay--;
            if (meltdownDelay <= 0) {
                onMeltdown();
                return true;
            }
            target.sprite.showStatusWithIcon(CharSprite.WARNING, Integer.toString(meltdownDelay), FloatingText.TIME);
        } else {
            actionPerTurn();

            ActionIndicator.refresh();
            previousElement = element; // 이전 턴의 원소를 이번 턴의 원소로 바꾸고 턴을 넘깁니다.
        }
        return true;
    }

    public void actionPerTurn() { // 멜트다운이 아닐 경우 매 턴마다 작동하는 코드
        int amount = 0;
        if (previousElement == element) { // 이전 턴의 원소와 현재 원소가 같을 경우
            amount += 1; // +1/턴
        }

        if (element == ElementType.WATER) { // 현재 원소가 물일 경우
            amount -= 2; // -2/턴
        } else if (element == ElementType.FIRE) { // 현재 원소가 불일 경우
            amount += 1; // +1/턴
            amount += (int)(gauge * 0.15f); // +현재 게이지의 15%/턴 (소수점 버림)
        } else { // 현재 원소가 그 이외의 것일 경우
            amount += 1; // +1/턴
        }

        if (target.buff(CodexUsed.class) != null) { // 코덱스 사용 후(3턴) 버프가 남아 있는 경우
            amount += 2; // +2/턴
        } else { // 코덱스 사용 후 3턴이 지난 경우
            amount -= 1; // -1/턴
        }

        if (amount > 0) {
            heat(amount);
        } else {
            cool(-amount);
        }

        if (element == ElementType.WATER) {
            target.heal(1);
        }
    }

    @Override
    public int icon() { // 버프의 아이콘을 지정합니다.
        switch (heatLevel()) { // 오버히트 레벨에 따라 다른 아이콘을 지정합니다.
            case 0: default:
                return BuffIndicator.OVERHEAT_0;
            case 1:
                return BuffIndicator.OVERHEAT_25;
            case 2:
                return BuffIndicator.OVERHEAT_50;
            case 3:
                return BuffIndicator.OVERHEAT_75;
            case 4:
                return BuffIndicator.OVERHEAT_100;
            case 5:
                return BuffIndicator.OVERHEAT_MELTDOWN;
        }
    }

    @Override
    public void tintIcon(Image icon) { //버프 아이콘 색상을 물들이는 메서드. 이미 아이콘 색상이 결정되어 있기 때문에 딱히 쓸 일은 없으니 변경하지 않습니다.
        super.tintIcon(icon);
    }

    @Override
    public String name() { // 버프의 이름입니다.
        if (isMeltdown()) { // 멜트다운일 경우 다른 이름을 적용합니다.
            return Messages.get(this, "name_meltDown", element.getName());
        } else { // 멜트다운이 아닐 경우 레벨에 따른 공통 이름을 적용합니다.
            return Messages.get(this, "name", heatLevel(), element.getName());
        }
    }

    @Override
    public String desc() { // 버프의 설명문입니다.
        if (isMeltdown()) {
            return Messages.get(this, "desc_meltdown", element.getName(), meltdownDelay);
        } else {
            return Messages.get(this, "desc", heatLevel(), element.getName());
        }
    }

    @Override
    public String iconTextDisplay() { // 버프에 현재 게이지를 표시합니다.
        return Integer.toString(gauge);
    }

    //TODO: 필요한 경우 현재 게이지/최대 게이지 비율에 따른 iconFadePercent()를 구현해 주세요. 이건 모바일 화면에서의 버프 아이콘이 작기 때문에 현재 게이지 상태를 간접적으로 표현해 주는 역할을 합니다.

    private static final String GAUGE = "gauge";
    private static final String ELEMENT = "element";
    private static final String PREVIOUS_ELEMENT = "previousElement";
    private static final String MELTDOWN_DELAY = "meltdownDelay";

    @Override
    public void storeInBundle(Bundle bundle) { // 변수들을 저장하는 메서드입니다.
        super.storeInBundle(bundle);

        bundle.put(GAUGE, gauge);
        bundle.put(ELEMENT, element);
        bundle.put(PREVIOUS_ELEMENT, previousElement);
        bundle.put(MELTDOWN_DELAY, meltdownDelay);
    }

    @Override
    public void restoreFromBundle(Bundle bundle) { // 세이브 로드 시 변수들을 불러오는 메서드입니다. 버튼도 다시 생성해 줍니다.
        super.restoreFromBundle(bundle);

        gauge = bundle.getInt(GAUGE);
        element = bundle.getEnum(ELEMENT, ElementType.class);
        previousElement = bundle.getEnum(PREVIOUS_ELEMENT, ElementType.class);
        meltdownDelay = bundle.getInt(MELTDOWN_DELAY);

        ActionIndicator.setAction(this);
    }

    // 액션 인디케이터 관련 구현

    @Override
    public String actionName() { // 버튼의 이름입니다.
        return Messages.get(this, "action_name");
    }

    @Override
    public int actionIcon() { // 버튼의 아이콘입니다. 현재 원소에 따라 다른 아이콘을 적용합니다.
        switch (element) {
            case FIRE: default:
                return HeroIcon.OVERHEAT_FIRE;
            case WATER:
                return HeroIcon.OVERHEAT_WATER;
            case EARTH:
                return HeroIcon.OVERHEAT_EARTH;
            case WIND:
                return HeroIcon.OVERHEAT_WIND;
        }
    }

    @Override
    public Visual secondaryVisual() { // 버프 아이콘과 함께 현재 게이지/최대 게이지를 문자열로 표시해 줍니다.
        BitmapText txt = new BitmapText(PixelScene.pixelFont);
        txt.text(Messages.format(TXT_STATUS, gauge, OVERHEAT_MAX));
        switch (heatLevel()) {
            case 0: default:
                txt.hardlight(0x4DE1BC);
                break;
            case 1:
                txt.hardlight(0x4CD040);
                break;
            case 2:
                txt.hardlight(0xD8DF46);
                break;
            case 3:
                txt.hardlight(0xD08340);
                break;
            case 4:
                txt.hardlight(0xD04540);
                break;
            case 5:
                txt.hardlight(0xEA265D);
                break;
        }

        txt.scale = new PointF(0.75f, 0.75f); // 문자열 비주얼의 가로, 세로 스케일을 조정합니다.
        txt.measure();
        return txt;
    }

    @Override
    public int indicatorColor() { // 버튼을 물들이는 배경색입니다.
        switch (element) {
            case FIRE: default:
                return 0xE24F2E;
            case WATER:
                return 0x05AAD3;
            case EARTH:
                return 0xF5CB3F;
            case WIND:
                return 0x14EA83;
        }
    }

    @Override
    public void doAction() { // 버튼을 누를 시 작동하는 메서드입니다. 여기에서는 원소 변경 선택 화면을 엽니다.
        GameScene.show(new WndElementSelect());
    }

    public static class WndElementSelect extends WndOptions { // 원소 변경 선택 클래스입니다.

        public WndElementSelect() { // 생성자입니다. 아이콘, 제목, 설명, 버튼, 버튼, 버튼... 순서로 구성되어 있습니다.
            super(Icons.get(Icons.ELEMENT),
                    Messages.titleCase(Messages.get(WndElementSelect.class, "title")),
                    Messages.get(WndElementSelect.class, "desc"),
                    ElementType.FIRE.getName(),
                    ElementType.WATER.getName(),
                    ElementType.EARTH.getName(),
                    ElementType.WIND.getName(),
                    Messages.get(WndElementSelect.class, "cancel"));
        }

        @Override
        protected void onSelect(int index) {
            if (index < 4) { // 취소 버튼 이외의 버튼을 누를 경우 이하 코드가 작동합니다.
                if (Dungeon.hero == null) return;
                ElementType elementType;

                switch (index) { // 누른 버튼의 인덱스에 따라 다른 동작을 수행합니다.
                    case 0: default:
                        elementType = NewOverHeat.changeElement(Dungeon.hero, ElementType.FIRE);
                        break;
                    case 1:
                        elementType = NewOverHeat.changeElement(Dungeon.hero, ElementType.WATER);
                        break;
                    case 2:
                        elementType = NewOverHeat.changeElement(Dungeon.hero, ElementType.EARTH);
                        break;
                    case 3:
                        elementType = NewOverHeat.changeElement(Dungeon.hero, ElementType.WIND);
                        break;
                }

                onChangeElement(elementType);

                BuffIndicator.refresh(Dungeon.hero); // 버프창을 새로고침합니다.
                ActionIndicator.refresh(); // 액션 버튼을 새로고침합니다.

                hide(); // 윈도우를 숨깁니다.
            } else {
                hide(); // 취소 버튼 선택 시 다른 동작을 하지 않고 윈도우를 숨깁니다.
            }
        }

        @Override
        protected boolean enabled(int index) { // 버튼의 인덱스에 따른 활성화 여부입니다.
            if (index == 4) return true; // 취소 버튼은 항상 활성화합니다.
            if (Dungeon.hero == null) return true; // 윈도우 특성 상 영웅은 항상 있으나, 그래도 체크해 줍니다. 영웅이 없을 경우 버튼을 비활성화하지 않습니다.
            NewOverHeat buff = Dungeon.hero.buff(NewOverHeat.class); // 영웅이 가진 버프의 인스턴스를 가져옵니다.
            if (buff == null) return true; // 윈도우 특성 상 오버히트 버프 또한 항상 가지고 있을 것이나, 그래도 체크해 줍니다. 버프를 가지지 않을 경우 버튼을 비활성화하지 않습니다.
            return buff.getElement() != ElementType.getElementByIndex(index); // 버프의 원소가 선택한 원소와 같지 않을 경우 버튼을 활성화합니다. 다시 말해, 현재 이미 지정되어 있는 원소로 바꾸는 버튼을 비활성화합니다.
        }

        @Override
        protected boolean hasInfo(int index) { // 취소 버튼을 제외한 모든 버튼에 인포 버튼을 달아 줍니다.
            return index < 4;
        }

        @Override
        protected void onInfo( int index ) { // 인포 버튼 클릭 시 인덱스에 따라 작동하는 메서드입니다.
            GameScene.show(new WndTitledMessage(
                    Icons.get(Icons.INFO), // 설명 윈도우의 아이콘입니다.
                    Messages.titleCase(Messages.get(WndElementSelect.class, "info_title", ElementType.getElementByIndex(index).getName())), // 설명 윈도우의 제목입니다.
                    Messages.get(WndElementSelect.class, "info_"+ElementType.getElementByIndex(index).name))); // 설명 윈도우의 각 원소에 따른 설명문입니다.
        }
    }

    public static class CodexUsed extends FlavourBuff {
        public static final float DURATION = 3f;
    }

    public static float codexDamageMultiplier(Hero hero) {
        NewOverHeat buff = getBuff(hero);
        if (buff == null) return 1f;

        float multi = 1f;

        if (buff.element == ElementType.FIRE) {
            multi += 0.1f;
        }

        return multi;
    }

    public static void codexProc(Hero hero, Char enemy) {
        NewOverHeat buff = getBuff(hero);
        if (buff == null) return;

        if (buff.getElement() == ElementType.EARTH && Random.Float() < 0.25f) { // 땅 원소 중 공격 시 25% 확률로 기절 1턴
            Buff.affect(enemy, Paralysis.class, 1f);
        }
    }

    public static float evasionMultiplier(Hero hero) {
        NewOverHeat overHeat = NewOverHeat.getBuff(hero);
        if (overHeat == null) return 1;

        float multi = 1f;

        if (overHeat.getElement() == ElementType.WIND) {
            multi += 0.08f;
        }

        return multi;
    }

    public static float damageMultiplier(Hero hero) {
        NewOverHeat overHeat = NewOverHeat.getBuff(hero);
        if (overHeat == null) return 1;

        float multi = 1f;

        if (overHeat.getElement() == ElementType.EARTH) {
            multi -= 0.08f;
        }

        return multi;
    }

    public static void onChangeElementEffect(Hero hero) {
        final int centerCell = hero.pos;

        // Determine current element from the active NewOverHeat buff
        ElementType elem = ElementType.FIRE;
        NewOverHeat oh = hero.buff(NewOverHeat.class);
        if (oh != null) {
            elem = oh.getElement();
        }

        // Helper that tries different Emitter.start signatures at runtime,
        // and falls back to burst(factory, count) when not available.
        final Emitter em = CellEmitter.center(centerCell);

        switch (elem) {
            case FIRE: {
                Sample.INSTANCE.play(Assets.Sounds.ELEMENTAL_FIRE);
                CellEmitter.center(centerCell)
                        .burst(
                                ElementChangeParticles.ElementFireMantleParticle.FACTORY,
                                28
                        );
            } break;

            case WATER: {
                Sample.INSTANCE.play(Assets.Sounds.ELEMENTAL_WATER);
                Emitter.Factory factory =
                        ElementChangeParticles.ElementWaterRippleParticle.FACTORY;
                try {
                    // Try: start(Factory, float interval, int count)
                    try {
                        em.getClass().getMethod(
                                "start",
                                Emitter.Factory.class,
                                float.class, int.class
                        ).invoke(em, factory, 0.015f, 20);
                    } catch (NoSuchMethodException e1) {
                        // Try: start(Factory, float interval, float durationSec)
                        try {
                            em.getClass().getMethod(
                                    "start",
                                    Emitter.Factory.class,
                                    float.class, float.class
                            ).invoke(em, factory, 0.015f, 0.30f);
                        } catch (NoSuchMethodException e2) {
                            // Fallback: burst
                            em.getClass().getMethod(
                                    "burst",
                                    Emitter.Factory.class,
                                    int.class
                            ).invoke(em, factory, 20);
                        }
                    }
                } catch (Throwable ignored) {}
            } break;

            case EARTH: {
                Sample.INSTANCE.play(Assets.Sounds.ELEMENTAL_EARTH);
                CellEmitter.center(centerCell)
                        .burst(
                                ElementChangeParticles.ElementEarthChunkParticle.FACTORY,
                                22
                        );
            } break;

            case WIND: {
                Sample.INSTANCE.play(Assets.Sounds.ELEMENTAL_WIND);
                boolean ccw = com.watabou.utils.Random.Int(2) == 0;
                Emitter.Factory factory = ccw
                        ? ElementChangeParticles.ElementWindSwirlParticle.FACTORY_CCW
                        : ElementChangeParticles.ElementWindSwirlParticle.FACTORY_CW;

                try {
                    // Try: start(Factory, float interval, int count)
                    try {
                        em.getClass().getMethod(
                                "start",
                                Emitter.Factory.class,
                                float.class, int.class
                        ).invoke(em, factory, 0.015f, 24);
                    } catch (NoSuchMethodException e1) {
                        // Try: start(Factory, float interval, float durationSec)
                        try {
                            em.getClass().getMethod(
                                    "start",
                                    Emitter.Factory.class,
                                    float.class, float.class
                            ).invoke(em, factory, 0.015f, 0.30f);
                        } catch (NoSuchMethodException e2) {
                            // Fallback: burst
                            em.getClass().getMethod(
                                    "burst",
                                    Emitter.Factory.class,
                                    int.class
                            ).invoke(em, factory, 24);
                        }
                    }
                } catch (Throwable ignored) {}
            } break;

            default:
                // no-op
                break;
        }
    }

}
