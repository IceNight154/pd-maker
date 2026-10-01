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

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.HeroDisguise;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.gltextures.SmartTexture;
import com.watabou.gltextures.TextureCache;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.TextureFilm;
import com.watabou.utils.Callback;
import com.watabou.utils.PointF;
import com.watabou.utils.RectF;

public class HeroSprite extends CharSprite {
	
	public static final int FRAME_WIDTH		= 48;
	public static final int FRAME_HEIGHT	= 60;

	private static final int RUN_FRAMERATE	= 20;
	
	private static TextureFilm tiers;
	
	private Animation fly;
	private Animation read;

	public HeroSprite() {
		super();
		this.scale.set(0.35f, 0.35f);
		
		texture( Dungeon.hero.heroClass.spritesheet() );
		updateArmor();
		
		link( Dungeon.hero );

		if (ch.isAlive())
			idle();
		else
			die();
	}

	public void disguise(HeroClass cls){
		texture( cls.spritesheet() );
		updateArmor();
	}
	
	public void updateArmor() {
		if (com.shatteredpixel.shatteredpixeldungeon.pdmaker.HeroRuntime.updateArmor(this)) return; // >>> pdmaker

		TextureFilm film = new TextureFilm( tiers(), Dungeon.hero.tier(), FRAME_WIDTH, FRAME_HEIGHT );

		idle = new Animation( 7, true );
		idle.frames( film, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 3, 4, 5, 4, 3 );
		
		run = new Animation( RUN_FRAMERATE, true );
		run.frames( film, 6, 7, 8, 9, 10, 11 );
		
		die = new Animation( 20, false );
		die.frames( film, 12, 13, 14, 15, 16 );
		die = new Animation( 10, true );
		die.frames( film, 17, 18, 19, 16 );


		attack = new Animation( 16, false );
		attack.frames( film, 20 , 21, 22, 23, 22, 21, 20, 0 );
		
		zap = attack.clone();
		
		operate = new Animation( 8, false );
		operate.frames( film, 24, 25, 24, 25 );
		
		fly = new Animation( 5, true );
		fly.frames( film, 26, 28, 26, 27 );

		read = new Animation( 20, false );
		read.frames( film, 22, 23, 23, 23, 23, 23, 23, 23, 23, 22 );
		/*
		idle = new Animation( 1, true );
		idle.frames( film, 0, 0, 0, 1, 0, 0, 1, 1 );

		run = new Animation( RUN_FRAMERATE, true );
		run.frames( film, 2, 3, 4, 5, 6, 7 );

		die = new Animation( 20, false );
		die.frames( film, 8, 9, 10, 11, 12, 11 );

		attack = new Animation( 15, false );
		attack.frames( film, 13, 14, 15, 0 );

		zap = attack.clone();

		operate = new Animation( 8, false );
		operate.frames( film, 21, 22, 21, 22 );

		fly = new Animation( 1, true );
		fly.frames( film, 23 );

		read = new Animation( 20, false );
		read.frames( film, 24, 25, 25, 25, 25, 25, 25, 25, 25, 24 );

		 */
		
		if (Dungeon.hero.isAlive())
			idle();
		else
			die();
	}
	
	@Override
	public void place( int p ) {
		super.place( p );
		if (Game.scene() instanceof GameScene) Camera.main.panFollow(this, 5f);
	}

	@Override
	public void move( int from, int to ) {
		super.move( from, to );
		if (ch != null && ch.flying) {
			play( fly );
		}
		Camera.main.panFollow(this, 20f);
	}

	@Override
	public void idle() {
		super.idle();
		if (ch != null && ch.flying) {
			play( fly );
		}
	}

	@Override
	public void jump( int from, int to, float height, float duration,  Callback callback ) {
		super.jump( from, to, height, duration, callback );
		play( fly );
		Camera.main.panFollow(this, 20f);
	}

	public synchronized void read() {
		animCallback = new Callback() {
			@Override
			public void call() {
				idle();
				ch.onOperateComplete();
			}
		};
		play( read );
	}

	@Override
	public void bloodBurstA(PointF from, int damage) {
		//Does nothing.

		/*
		 * This is both for visual clarity, and also for content ratings regarding violence
		 * towards human characters. The heroes are the only human or human-like characters which
		 * participate in combat, so removing all blood associated with them is a simple way to
		 * reduce the violence rating of the game.
		 */
	}

	@Override
	public void update() {
		sleeping = ch.isAlive() && ((Hero)ch).resting;
		
		super.update();
	}

	public void sprint( float speed ) {
		run.delay = 1f / speed / RUN_FRAMERATE;
	}

public static TextureFilm tiers() {
		if (tiers == null) {
			SmartTexture texture = TextureCache.get( Assets.Sprites.ARIA );
			tiers = new TextureFilm( texture, texture.width, FRAME_HEIGHT );
		}

		return tiers;
	}



	public static Image avatar( Hero hero ){
		if (hero.buff(HeroDisguise.class) != null){
			return avatar(hero.buff(HeroDisguise.class).getDisguise(), hero.tier());
		} else {
			Image image = avatar(hero.heroClass, hero.tier());
			image.scale.set(0.35f, 0.35f);
			return image;
		}
	}
	
	public static Image avatar( HeroClass cl, int armorTier ) {
		
		RectF patch = tiers().get( armorTier );
		Image avatar = new Image( cl.spritesheet() );
		RectF frame = avatar.texture.uvRect( 1, 0, FRAME_WIDTH, FRAME_HEIGHT );
		frame.shift( patch.left, patch.top );
		avatar.frame( frame );
		
		return avatar;
	}
}
