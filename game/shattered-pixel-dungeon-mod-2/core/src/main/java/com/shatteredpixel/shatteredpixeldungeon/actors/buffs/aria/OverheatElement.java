package com.shatteredpixel.shatteredpixeldungeon.actors.buffs.aria;

import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.watabou.utils.Random;

/**
 * Element definition for Aria's Overheat system.
 *
 * All element-specific logic (numbers, passive text, icon mapping) lives here,
 * so Overheat.java remains a pure "gauge manager".
 */
public enum OverheatElement {
    FIRE,
    WATER,
    WIND,
    EARTH;

    /** Short localized display name for UI. Replace with Messages.get if desired. */
    public String displayName(){
        switch (this){
            case FIRE:  return "Fire";
            case WATER: return "Water";
            case WIND:  return "Wind";
            case EARTH: return "Earth";
            default:    return name();
        }
    }

    /** Passive description for tooltip; tweak to your design spec. */
    public String passiveDesc(){
        switch (this){
            case FIRE:  return "Deal +10% damage; Overheat gain +15%.";
            case WATER: return "Heal 1 HP/turn; -8% damage taken.";
            case WIND:  return "+8% evasion.";
            case EARTH: return "Stun chance +100%; on switch gain shield (5% Max HP, 1 turn).";
            default:    return "";
        }
    }

    /** Icon index on the BuffIndicator sheet for this element (optional). */
    public int buffIconIndex(){
        switch (this){
            case FIRE:  return BuffIndicator.OVERHEAT_FIRE;
            case WATER: return BuffIndicator.OVERHEAT_WATER;
            case WIND:  return BuffIndicator.OVERHEAT_WIND;
            case EARTH: return BuffIndicator.OVERHEAT_EARTH;
            default:    return BuffIndicator.NONE;
        }
    }

    /** Outgoing damage multiplier from passive. (FIRE: +10%) */
    public float outgoingDamageMultiplier(){ return this == FIRE ? 1.10f : 1.00f; }

    /** Incoming damage multiplier from passive. (WATER: -8% incoming) */
    public float incomingDamageMultiplier(){ return this == WATER ? 0.92f : 1.00f; }

    /** Evasion bonus (additive, in percentage points). (WIND: +8%) */
    public int evasionBonusPct(){ return this == WIND ? 8 : 0; }

    /** Additional accumulation factor that applies to *positive* overheat deltas. (FIRE: +15%) */
    public float positiveOverheatAccumFactor(){ return this == FIRE ? 1.15f : 1.00f; }

    /** Natural cooling delta each turn. (WATER: -2/turn) */
    public int naturalCoolingDeltaPerTurn(){ return this == WATER ? -2 : 0; }

    /** On switch, grant a 1T shield equal to % of Max HP. (EARTH: 5%) */
    public float onSwitchShieldPercent(){ return this == EARTH ? 0.05f : 0f; }

    /** Optional: per-element icon fallback when tiered Overheat icons are not present. */
    public int buffIconId(){
        // If you have custom per-element icons in BuffIndicator, map them here.
        // Otherwise return a single generic Overheat icon and let text overlay show the gauge.
        try {
            // Prefer a generic Overheat icon if one exists in your BuffIndicator.
            return (int) BuffIndicator.class.getField("OVERHEAT").get(null);
        } catch (Throwable t){
            return BuffIndicator.NONE;
        }
    }

    /** One-line passive summary for tooltips/debug strings. */
    public String passiveSummary(){
        switch (this){
            case FIRE:  return "Passive: +10% outgoing damage, +15% overheat accumulation.";
            case WATER: return "Passive: -8% incoming damage, heal 1/turn, -2 natural cooling.";
            case WIND:  return "Passive: +8% evasion.";
            case EARTH: return "Passive: +100% stun chance; on switch, 1T shield = 5% MaxHP.";
        }
        return "";
    }

    /** Pick a random element that is different from current. */
    public static OverheatElement randomDifferent(OverheatElement current){
        OverheatElement[] vals = values();
        if (current == null) return vals[Random.Int(vals.length)];
        OverheatElement pick;
        do {
            pick = vals[Random.Int(vals.length)];
        } while (pick == current && vals.length > 1);
        return pick;
    }

    /** Serialization helper. */
    public static String serialize(OverheatElement e){ return e == null ? "FIRE" : e.name(); }

    /** Deserialization helper. */
    public static OverheatElement deserialize(String s){
        if (s == null) return FIRE;
        try {
            return OverheatElement.valueOf(s);
        } catch (IllegalArgumentException iae){
            return FIRE;
        }
    }
}
