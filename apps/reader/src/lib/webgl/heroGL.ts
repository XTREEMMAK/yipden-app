/**
 * Discover's WebGL hero: a displacement wipe between two member photos in the direction the
 * reader is moving, a slight liquid bend while dragging, and a slow ambient drift at rest.
 * Ported from the reference prototype's own GL code (docs/reference/yipden-prototype.html) as
 * a self-contained control object HeroArt.svelte owns, rather than a page-global singleton.
 *
 * Optional by the brief's own words, and treated that way throughout: any failure here, no
 * WebGL context, a shader that will not compile, an image a WebGL engine refuses to texture
 * from without CORS headers its host never sent, a lost context mid-session, disables this
 * quietly and leaves HeroArt.svelte's plain CSS crossfade, which never stopped running
 * underneath, as what the reader actually sees. Nothing about Discover depends on this
 * succeeding.
 *
 * Whether a cross-origin image with no CORS headers actually fails at all turns out to be
 * engine dependent: the WebGL spec's cross-origin taint restriction is about blocking pixel
 * readback (`readPixels`, `toDataURL`), and some engines only enforce it there, letting a
 * `texImage2D` upload of an untainted-for-reading-purposes image succeed for rendering alone,
 * which is all this ever does. Handled defensively either way, since nothing here depends on
 * knowing which behavior a given browser chose.
 */

import { duration } from '../motion.js';

const VERTEX_SHADER = `
attribute vec2 a;
varying vec2 vUv;
void main() {
	vUv = a * 0.5 + 0.5;
	gl_Position = vec4(a, 0.0, 1.0);
}
`;

/*
 * `img0`/`img1` are each texture's own real width and height, not the prototype's one shared
 * guess: the prototype's demo set was drawn to one fixed size, but a ring member's real photo
 * can be almost any aspect ratio, and `cover()` needs the true one to avoid stretching it.
 */
const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D t0;
uniform sampler2D t1;
uniform float p;
uniform float dir;
uniform float drag;
uniform float time;
uniform float fx;
uniform vec2 res;
uniform vec2 img0;
uniform vec2 img1;

vec2 cover(vec2 uv, vec2 img) {
	float rs = res.x / res.y;
	float ri = img.x / img.y;
	vec2 s = rs > ri ? vec2(1.0, ri / rs) : vec2(rs / ri, 1.0);
	return (uv - 0.5) * s + 0.5;
}

float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 q) {
	vec2 i = floor(q);
	vec2 f = fract(q);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
		f.y
	);
}

float fbm(vec2 q) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * noise(q);
		q = q * 2.03 + 7.1;
		a *= 0.5;
	}
	return v;
}

void main() {
	vec2 uv = vUv;
	float n = fbm(uv * vec2(3.0, 5.0) + vec2(time * 0.04, -time * 0.03));
	vec2 amb = vec2(n - 0.5, fbm(uv * 2.5 + vec2(4.2, 1.7) + time * 0.035) - 0.5) * 0.016 * fx;
	vec2 dg = vec2(-drag * 0.14, (n - 0.5) * abs(drag) * 0.12) * fx;
	float w = 0.38;
	float s = (dir > 0.0 ? 1.0 - uv.x : uv.x) + (n - 0.5) * w * 0.9 + w * 0.45;
	float e = p * (1.0 + 2.0 * w);
	float wipe = 1.0 - smoothstep(e - w, e, s);
	float m = mix(p, wipe, fx);
	float band = 1.0 - abs(wipe * 2.0 - 1.0);
	vec2 push = vec2(dir, 0.0);
	vec2 warp = vec2((n - 0.5) * 0.06, (n - 0.5) * 0.14) * band * fx;
	vec3 a = texture2D(t0, cover(uv + push * p * 0.22 * fx + warp + amb + dg, img0)).rgb;
	vec3 b = texture2D(t1, cover(uv - push * (1.0 - p) * 0.22 * fx - warp + amb, img1)).rgb;
	vec3 col = mix(a, b, m);
	col += vec3(1.0, 0.62, 0.38) * pow(band, 4.0) * 0.22 * fx * step(0.001, p);
	gl_FragColor = vec4(col, 1.0);
}
`;

/** Ambient drift is throttled to this; an active transition or drag draws every frame instead. */
const AMBIENT_FRAME_MS = 32;
/** Ambient drift rests after this long without a touch; any interaction wakes it again. */
const IDLE_MS = 10_000;

function easeInOutCubic(k: number): number {
	return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('createShader failed');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(info ?? 'shader compile failed');
	}
	return shader;
}

interface Texture {
	texture: WebGLTexture;
	width: number;
	height: number;
}

export interface HeroGLHandle {
	/** Jump straight to an image with no transition: the first paint, or a filter change. */
	set(url: string): void;
	/** Animate to an image in a direction: a committed swipe, the next/prev buttons, shuffle. */
	go(url: string, direction: -1 | 1, fromDragFraction: number): void;
	/** A drag in progress, as a fraction of the viewport width. */
	drag(fraction: number): void;
	/** The drag ended without committing: spring the live preview back to rest. */
	release(): void;
	/** Whether the ambient loop may run at all right now (Discover visible, tab foregrounded). */
	setLive(live: boolean): void;
	/** Wakes the loop; call on the gesture that would start a drag. */
	kick(): void;
	destroy(): void;
}

/**
 * Builds the WebGL hero against a canvas already in the document, or returns `null` if this
 * browser, this GPU, or this specific driver cannot give it a working context. The canvas is
 * left exactly as the caller found it either way; only a returned handle means anything drew.
 *
 * `onFatalError` fires once if the canvas later becomes unusable after having worked, a lost
 * context or a photo host with no CORS headers tainting a texture upload. The caller owns
 * hiding the canvas and letting the CSS crossfade underneath show through; this stops drawing
 * on its own but was never going to un-render itself.
 */
export function createHeroGL(
	canvas: HTMLCanvasElement,
	effectStrength: () => number,
	onFatalError: () => void
): HeroGLHandle | null {
	let gl: WebGLRenderingContext | null;
	try {
		gl = canvas.getContext('webgl', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			powerPreference: 'low-power'
		});
	} catch {
		gl = null;
	}
	if (!gl) return null;
	const context = gl;

	let program: WebGLProgram;
	try {
		program = context.createProgram()!;
		context.attachShader(program, compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER));
		context.attachShader(program, compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SHADER));
		context.linkProgram(program);
		if (!context.getProgramParameter(program, context.LINK_STATUS)) {
			throw new Error(context.getProgramInfoLog(program) ?? 'program link failed');
		}
	} catch {
		return null;
	}

	context.useProgram(program);
	const buffer = context.createBuffer();
	context.bindBuffer(context.ARRAY_BUFFER, buffer);
	context.bufferData(
		context.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
		context.STATIC_DRAW
	);
	const positionLoc = context.getAttribLocation(program, 'a');
	context.enableVertexAttribArray(positionLoc);
	context.vertexAttribPointer(positionLoc, 2, context.FLOAT, false, 0, 0);

	const uniformNames = [
		't0',
		't1',
		'p',
		'dir',
		'drag',
		'time',
		'fx',
		'res',
		'img0',
		'img1'
	] as const;
	const u = Object.fromEntries(
		uniformNames.map((name) => [name, context.getUniformLocation(program, name)])
	) as Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;
	context.uniform1i(u.t0, 0);
	context.uniform1i(u.t1, 1);
	context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);

	const textures = new Map<string, Texture>();
	/** A 1x1 placeholder, the same deep brand tone as `--deep`, until the real image lands. */
	function placeholderTexture(): WebGLTexture {
		const texture = context.createTexture()!;
		context.bindTexture(context.TEXTURE_2D, texture);
		context.texImage2D(
			context.TEXTURE_2D,
			0,
			context.RGBA,
			1,
			1,
			0,
			context.RGBA,
			context.UNSIGNED_BYTE,
			new Uint8Array([42, 15, 6, 255])
		);
		context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
		context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
		context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
		context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
		return texture;
	}

	let taintedByCors = false;

	function loadTexture(url: string): Texture {
		const existing = textures.get(url);
		if (existing) return existing;

		const entry: Texture = { texture: placeholderTexture(), width: 1, height: 1 };
		textures.set(url, entry);

		const image = new Image();
		image.crossOrigin = 'anonymous';
		image.onload = () => {
			try {
				context.bindTexture(context.TEXTURE_2D, entry.texture);
				context.texImage2D(
					context.TEXTURE_2D,
					0,
					context.RGBA,
					context.RGBA,
					context.UNSIGNED_BYTE,
					image
				);
				entry.width = image.naturalWidth || 1;
				entry.height = image.naturalHeight || 1;
				dirty = true;
				kick();
			} catch {
				// This engine refuses to texture from a cross-origin image with no CORS
				// headers. The same whole-hero shutdown as a lost context covers it: the CSS
				// crossfade underneath was never not running.
				taintedByCors = true;
				onFatalError();
			}
		};
		image.onerror = () => {
			// `crossOrigin = 'anonymous'` requests the image in CORS mode, and on some engines
			// a host with no Access-Control-Allow-Origin header fails that request outright
			// rather than serving an image `onload` above would then have to refuse.
			taintedByCors = true;
			onFatalError();
		};
		image.src = url;
		return entry;
	}

	let current = '';
	let next = '';
	let direction: -1 | 1 = 1;
	let dragAmount = 0;
	let transition: { start: number; duration: number; dragFrom: number } | null = null;
	let release: { start: number; duration: number; from: number } | null = null;
	let dirty = true;
	let lastDrawAt = 0;
	let live = true;
	let contextLost = false;
	let touchedAt = performance.now();
	let raf = 0;
	const startedAt = performance.now();

	function isLive(): boolean {
		return live && !contextLost && !taintedByCors;
	}

	function draw(progress: number, dragForDraw: number, now: number): void {
		const dpr = Math.min(1.5, window.devicePixelRatio || 1);
		const width = Math.round(canvas.clientWidth * dpr);
		const height = Math.round(canvas.clientHeight * dpr);
		if (!width || !height) return;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		const currentTex = loadTexture(current);
		const nextTex = transition ? loadTexture(next) : currentTex;

		context.viewport(0, 0, width, height);
		context.activeTexture(context.TEXTURE0);
		context.bindTexture(context.TEXTURE_2D, currentTex.texture);
		context.activeTexture(context.TEXTURE1);
		context.bindTexture(context.TEXTURE_2D, nextTex.texture);
		context.uniform1f(u.p, progress);
		context.uniform1f(u.dir, direction);
		context.uniform1f(u.drag, dragForDraw);
		context.uniform1f(u.time, (now - startedAt) / 1000);
		context.uniform1f(u.fx, effectStrength());
		context.uniform2f(u.res, width, height);
		context.uniform2f(u.img0, currentTex.width, currentTex.height);
		context.uniform2f(u.img1, nextTex.width, nextTex.height);
		context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
		dirty = false;
		lastDrawAt = now;
	}

	function frame(now: number): void {
		raf = 0;
		if (!isLive()) return;

		let progress = 0;
		let dragForDraw = dragAmount;
		if (transition) {
			const k = Math.min(1, (now - transition.start) / transition.duration);
			const eased = easeInOutCubic(k);
			progress = eased;
			dragForDraw = transition.dragFrom * (1 - eased);
			if (k >= 1) {
				current = next;
				transition = null;
				progress = 0;
				dragForDraw = 0;
			}
		} else if (release) {
			const k = Math.min(1, (now - release.start) / release.duration);
			dragAmount = release.from * (1 - easeInOutCubic(k));
			dragForDraw = dragAmount;
			if (k >= 1) {
				release = null;
				dragAmount = 0;
				dragForDraw = 0;
			}
		}

		const busy = transition !== null || release !== null;
		const reduced = effectStrength() === 0;
		if (busy || dirty || (!reduced && now - lastDrawAt >= AMBIENT_FRAME_MS)) {
			draw(progress, dragForDraw, now);
		}
		if (busy || (!reduced && now - touchedAt < IDLE_MS)) {
			raf = requestAnimationFrame(frame);
		}
	}

	function kick(): void {
		touchedAt = performance.now();
		if (!raf && isLive()) raf = requestAnimationFrame(frame);
	}

	function onContextLost(event: Event): void {
		event.preventDefault();
		contextLost = true;
		onFatalError();
	}
	canvas.addEventListener('webglcontextlost', onContextLost);

	return {
		set(url) {
			current = url;
			next = url;
			transition = null;
			release = null;
			dragAmount = 0;
			loadTexture(url);
			dirty = true;
			kick();
		},
		go(url, dir, fromDragFraction) {
			if (transition) current = next;
			next = url;
			direction = dir;
			release = null;
			dragAmount = 0;
			loadTexture(url);
			transition = {
				start: performance.now(),
				// The brief's own token for this: "Discover's image transition" gets --dur-xl
				// rather than the screen-transition --dur-l, since the wipe reads as a photo
				// actually displacing, not a screen changing.
				duration: duration.xl,
				dragFrom: fromDragFraction
			};
			kick();
		},
		drag(fraction) {
			if (transition) return;
			dragAmount = fraction;
			release = null;
			dirty = true;
			kick();
		},
		release() {
			if (!dragAmount) return;
			release = { start: performance.now(), duration: duration.m, from: dragAmount };
			kick();
		},
		setLive(nextLive) {
			live = nextLive;
			if (live) {
				dirty = true;
				kick();
			}
		},
		kick,
		destroy() {
			canvas.removeEventListener('webglcontextlost', onContextLost);
			if (raf) cancelAnimationFrame(raf);
			for (const { texture } of textures.values()) context.deleteTexture(texture);
			context.deleteProgram(program);
			context.deleteBuffer(buffer);
		}
	};
}
