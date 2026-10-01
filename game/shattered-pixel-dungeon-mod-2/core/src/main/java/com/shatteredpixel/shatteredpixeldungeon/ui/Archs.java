package com.shatteredpixel.shatteredpixeldungeon.ui;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.ColorBlock;
import com.watabou.noosa.ui.Component;
import com.watabou.noosa.particles.Emitter;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.ManaBuffFireflyParticle;
import com.shatteredpixel.shatteredpixeldungeon.effects.particles.NightSkyStarParticle;

/**
 * Archs — background with 10 parallax sprite layers.
 *
 * This implementation explicitly inserts a particle emitter *between* every sprite layer
 * so particles are visible with proper depth/occlusion. It avoids Emitter#onDetach()
 * (which doesn't exist in some Noosa versions) and cleans up safely in destroy().
 *
 * How it draws (front-to-back):
 *  L9 image  -> fireflies[9] -> L8 image -> fireflies[8] -> ... -> L0 image -> fireflies[0]
 *
 * Notes:
 * - Uses TITLE_0..TITLE_9 textures for the 10 layers.
 * - Parallax speed increases with layer index (higher index = closer to camera).
 * - Each emitter spawns from a horizontal band near the bottom, drifting upward.
 * - Farther layers spawn smaller/rarer particles via LayerFactory scale multiplier.
 */
public class Archs extends Component {

	private static final int LAYER_COUNT = 10;

	// Parallax scroll speeds (px/sec) from far -> near.
	private static final float[] SPEEDS = new float[]{
			2f,   // 0 (farthest)
			4f,   // 1
			7f,   // 2
			11f,  // 3
			16f,  // 4
			22f,  // 5
			30f,  // 6
			40f,  // 7
			52f,  // 8
			66f   // 9 (nearest)
	};

	// How strongly each layer participates in parallax; 1 = full, 0 = static.
	private static final float[] PARALLAX = new float[]{
			0.10f, 0.14f, 0.18f, 0.22f, 0.28f,
			0.34f, 0.42f, 0.52f, 0.66f, 0.82f
	};

	private final Image[] layers = new Image[LAYER_COUNT];
	private final Image[] tilesB = new Image[LAYER_COUNT]; // 2nd tile for gapless wrap
	private final Emitter[] fireflyEmitters = new Emitter[LAYER_COUNT];

	private final float[] scrollX = new float[LAYER_COUNT];
	// Top dark-blue multiply-like gradient overlay (stacked strips emulate a vertical gradient)
	private ColorBlock gradTopA; // lightest (bottom of the gradient band)
	private ColorBlock gradTopB; // mid
	private ColorBlock gradTopC; // darkest (very top)
	private boolean topGradientEnabled = true;
	private static final int WATER_RGB = 0x38ABAB; // water-blue tint (top, lighter)
	private static final int DEEP_RGB  = 0x0B1F3A; // deep navy (bottom, darker)
	private static final float TOP_GRADIENT_FRACTION = 0.4f; // cover top 60%% of the component
	private static final int TOP_GRADIENT_RGB = 0x38ABAB; // 물빛(위쪽 틴트)


	private boolean parallaxEnabled = true;
	private boolean firefliesEnabled = true;

	public boolean reversed = false;

	// Cached size
	private float cw, ch;

	public Archs() {
		// We want L9 at the front (drawn last), so we add from back (0) to front (9).
		// "image -> particles -> next image -> particles ..." so particles sit between layers.
		for (int i = 0; i < LAYER_COUNT; i++) {
			// We want L9 at the front (drawn last), so we add from front to back.
			final int layer = i;

			Image a = new Image(textureFor(layer));
			Image b = new Image(textureFor(layer));

			layers[layer] = a;
			tilesB[layer] = b;

			// Add image A
			add(a);

			// Add the emitter *after* the layer image so particles appear on top of that layer
			Emitter e = new Emitter();
			e.autoKill = false;
			e.on = firefliesEnabled;
			fireflyEmitters[layer] = e;
			add(e);

			// Add image B (second tile) AFTER the emitter so the next deeper layer will still appear behind
			add(b);
		}
		// --- Top gradient overlay (added last so it draws on top) ---
		gradTopA = new ColorBlock(1, 1, withAlpha(TOP_GRADIENT_RGB, 0x15)); // ~22%%
		gradTopB = new ColorBlock(1, 1, withAlpha(TOP_GRADIENT_RGB, 0x20)); // ~33%%
		gradTopC = new ColorBlock(1, 1, withAlpha(TOP_GRADIENT_RGB, 0x25)); // ~50%%
		gradTopA.visible = topGradientEnabled;
		gradTopB.visible = topGradientEnabled;
		gradTopC.visible = topGradientEnabled;
		add(gradTopA);
		add(gradTopB);
		add(gradTopC);
		// If your Noosa build supports multiply blending, you can enable true multiply like this:
		// try { gradTopA.blend(com.watabou.glwrap.Blending.MULTIPLY); } catch (Throwable ignored) {}
		// try { gradTopB.blend(com.watabou.glwrap.Blending.MULTIPLY); } catch (Throwable ignored) {}
		// try { gradTopC.blend(com.watabou.glwrap.Blending.MULTIPLY); } catch (Throwable ignored) {}

	}

	/**
	 * Toggle parallax panning.
	 */
	public void setParallaxEnabled(boolean enabled) {
		this.parallaxEnabled = enabled;
	}

	/**
	 * Toggle layered fireflies.
	 */
	public void setFirefliesEnabled(boolean enabled) {
		this.firefliesEnabled = enabled;
		for (int i = 0; i < fireflyEmitters.length; i++) {
			if (fireflyEmitters[i] != null) {
				fireflyEmitters[i].on = enabled;
			}
		}
	}

	@Override
	protected void layout() {
		// Use our current rectangle to place and scale tiles.
		float x = this.x;
		float y = this.y;
		float w = this.width;
		float h = this.height;

		cw = w;
		ch = h;

		for (int i = 0; i < LAYER_COUNT; i++) {
			Image a = layers[i];
			Image b = tilesB[i];
			if (a == null || b == null) continue;

			// Scale images to fit height while preserving aspect; tile horizontally.
			float scale = ch / a.height;
			a.scale.set(scale);
			b.scale.set(scale);

			float tileW = a.width * scale;
			// Place first tile at our left bound, second tile right after it.
			a.x = x + wrapOffset(scrollX[i], tileW);
			a.y = y;

			b.x = a.x + tileW;
			b.y = y;

			// If first tile scrolled right of the screen, move it back by one tile width
			if (a.x > x) {
				a.x -= tileW;
				b.x -= tileW;
			}

			// Emitter bounds: spawn in a horizontal band near the bottom,
			// layer-dependent thickness so farther layers are thinner and lower density.
			Emitter e = fireflyEmitters[i];
			if (e != null) {
				if (i == 0) {
					// Layer 0: night sky stars over TITLE_0
					float skyH = Math.max(32f, h * 0.7f);
					e.pos(x, y, w, skyH);
					e.clear();
					float interval = 0.06f;
					try {
						e.pour(new NightSkyStarParticle.RectFactory(w, skyH, true), interval);
					} catch (Throwable ignore) {
						e.pour(NightSkyStarParticle.FACTORY, interval);
					}
				} else {
					float bandHeight = Math.max(8f, 70f - i * 4f); // 70px at front, slimmer in distance
					float bandY = y + ch - 70f + i * 2f;           // start around bottom-70, push slightly up for far layers
					e.pos(x, bandY, w, bandHeight);
					// Reconfigure pour each layout to ensure correct density & scale.
					e.clear();
					float interval = 0.08f + (i * 0.02f); // fewer particles for far layers
					try {
						// If LayerFactory exists, use it to scale particle size per layer (smaller in the distance).
						float sizeMul = 1.0f - (i * 0.05f); // L0:1.0 -> L9:~0.55
						if (sizeMul < 0.35f) sizeMul = 0.35f;
						e.pour(new ManaBuffFireflyParticle.LayerFactory(1.0f, sizeMul), interval);
					} catch (Throwable ignore) {
						// Fallback to default factory if LayerFactory isn't available.
						e.pour(ManaBuffFireflyParticle.FACTORY, interval);
					}
				}
			}
		}
		// --- Position inverted gradient overlay (darker at top → lighter at bottom) ---
		if (gradTopA != null) {
			float totalH = h * TOP_GRADIENT_FRACTION;
			float hTop  = totalH * 0.40f; // top (dark navy)
			float hMid  = totalH * 0.35f; // middle (water)
			float hBot  = totalH - (hTop + hMid); // bottom (light water)

			// Top (dark navy) — gradTopC
			gradTopC.size(w, hTop);
			gradTopC.x = x;
			gradTopC.y = y;
			// Middle (water) — gradTopB
			gradTopB.size(w, hMid);
			gradTopB.x = x;
			gradTopB.y = y + hTop;
			// Bottom (light water) — gradTopA
			gradTopA.size(w, hBot);
			gradTopA.x = x;
			gradTopA.y = y + hTop + hMid;
		}


	}

	@Override
	public void update() {
		super.update();

		if (!parallaxEnabled) return;

		float dt = Game.elapsed;
		for (int i = 0; i < LAYER_COUNT; i++) {
			float speed = SPEEDS[i] * PARALLAX[i];
			scrollX[i] -= (reversed ? -1f : 1f) * speed * dt;

			// Apply to sprites if we have a size
			Image a = layers[i];
			if (a == null || cw == 0) continue;

			float scale = ch / a.height;
			float tileW = a.width * scale;

			// Wrap efficiently
			float wrapped = wrapOffset(scrollX[i], tileW);

			// Position tiles
			float left = this.x + wrapped;
			layers[i].x = left;
			tilesB[i].x = left + tileW;

			// If the first tile drifted to the right, shift left by one tile to keep gapless
			if (layers[i].x > this.x) {
				layers[i].x -= tileW;
				tilesB[i].x -= tileW;
			} else if (layers[i].x + tileW < this.x) {
				layers[i].x += tileW;
				tilesB[i].x += tileW;
			}
			if (i == 0) {
				Emitter e0 = fireflyEmitters[0];
				if (e0 != null) {
					float skyH = Math.max(32f, ch * 0.7f);
					e0.pos(layers[0].x, this.y, tileW * 2f, skyH);
				}
			}
		}
	}

	private static float wrapOffset(float off, float period) {
		if (period <= 0) return 0;
		float m = off % period;
		if (m < 0) m += period; // normalize to [0, period)
		return m;
	}

	private static String textureFor(int layer) {
		switch (layer) {
			case 0: return Assets.Interfaces.TITLE_0;
			case 1: return Assets.Interfaces.TITLE_1;
			case 2: return Assets.Interfaces.TITLE_2;
			case 3: return Assets.Interfaces.TITLE_3;
			case 4: return Assets.Interfaces.TITLE_4;
			case 5: return Assets.Interfaces.TITLE_5;
			case 6: return Assets.Interfaces.TITLE_6;
			case 7: return Assets.Interfaces.TITLE_7;
			case 8: return Assets.Interfaces.TITLE_8;
			case 9: return Assets.Interfaces.TITLE_9;
		}
		return Assets.Interfaces.TITLE_0;
	}

	private static int withAlpha(int rgb, int a) {
		return ((a & 0xFF) << 24) | (rgb & 0xFFFFFF);
	}

	@Override
	public void destroy() {
		// Stop and erase emitters safely (no onDetach call!)
		for (int i = 0; i < fireflyEmitters.length; i++) {
			Emitter e = fireflyEmitters[i];
			if (e != null) {
				try { e.on = false; } catch (Throwable ignored) {}
				try { e.killAndErase(); } catch (Throwable ignored) {}
				fireflyEmitters[i] = null;
			}
		}
		super.destroy();
	}
}