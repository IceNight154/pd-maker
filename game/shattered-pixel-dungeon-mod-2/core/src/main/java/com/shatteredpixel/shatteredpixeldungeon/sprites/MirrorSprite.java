/*
 * Pixel Dungeon
 * Copyright (C) 2012-2015 Oleg Dolya
 *
 * Shattered Pixel Dungeon
 * Copyright (C) 2014-2025 Evan Debenham
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 */

package com.shatteredpixel.shatteredpixeldungeon.sprites;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.MirrorImage;
import com.watabou.noosa.TextureFilm;
import com.watabou.utils.PointF;

public class MirrorSprite extends MobSprite {
	
	private static final int FRAME_WIDTH	= 48;
	private static final int FRAME_HEIGHT	= 60;
	
	public MirrorSprite() {
		super();
		this.scale.set(0.35f, 0.35f);
		
		texture( Dungeon.hero != null ? Dungeon.hero.heroClass.spritesheet() : HeroClass.ARIA.spritesheet() );
		updateArmor( 0 );
		idle();
	}
	
	@Override
	public void link( Char ch ) {
		super.link( ch );
		updateArmor();
	}

	@Override
	public void bloodBurstA(PointF from, int damage) {
		//do nothing
	}

	public void updateArmor(){
		updateArmor( ((MirrorImage)ch).armTier );
	}
	
	public void updateArmor( int tier ) {
		TextureFilm film = new TextureFilm( HeroSprite.tiers(), tier, FRAME_WIDTH, FRAME_HEIGHT );

		idle = new Animation( 7, true );
		idle.frames( film, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 3, 4, 5, 4, 3 );

		run = new Animation( 20, true );
		run.frames( film, 6, 7, 8, 9, 10, 11 );

		die = new Animation( 20, false );
		die.frames( film, 12, 13, 14, 15, 16 );
		die = new Animation( 10, true );
		die.frames( film, 17, 18, 19, 16 );


		attack = new Animation( 16, false );
		attack.frames( film, 20 , 21, 22, 23, 22, 21, 20, 0 );
		
		idle();
	}
}
