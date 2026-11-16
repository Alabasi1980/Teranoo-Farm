import * as THREE from 'three';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  isColor: boolean,
  repeat = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    draw(ctx, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export interface SharedFarmTextures {
  grassColor: THREE.CanvasTexture;
  soilDryColor: THREE.CanvasTexture;
  soilWetColor: THREE.CanvasTexture;
  woodColor: THREE.CanvasTexture;
  stoneColor: THREE.CanvasTexture;
  bumpNoise: THREE.CanvasTexture;
}

export function createSharedFarmTextures(): SharedFarmTextures {
  const grassColor = createCanvasTexture(
    256,
    (ctx, s) => {
      const rand = mulberry32(101);
      ctx.fillStyle = '#6da938';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i += 1) {
        const x = rand() * s;
        const y = rand() * s;
        const w = 2 + rand() * 5;
        const h = 2 + rand() * 4;
        const pick = rand();
        ctx.fillStyle =
          pick < 0.35 ? '#7cb844' : pick < 0.7 ? '#5e962d' : '#89c452';
        ctx.fillRect(x, y, w, h);
      }
    },
    true,
    10,
  );

  const soilDryColor = createCanvasTexture(
    256,
    (ctx, s) => {
      const rand = mulberry32(202);
      ctx.fillStyle = '#6b4425';
      ctx.fillRect(0, 0, s, s);
      // Tilled furrow rows
      for (let y = 0; y < s; y += 32) {
        ctx.fillStyle = '#57351b';
        ctx.fillRect(0, y, s, 9);
        ctx.fillStyle = '#7b502d';
        ctx.fillRect(0, y + 9, s, 10);
      }
      for (let i = 0; i < 650; i += 1) {
        ctx.fillStyle =
          rand() < 0.5 ? 'rgba(46, 25, 10, 0.35)' : 'rgba(148, 103, 62, 0.25)';
        ctx.fillRect(rand() * s, rand() * s, 3 + rand() * 4, 2 + rand() * 3);
      }
    },
    true,
    1,
  );

  const soilWetColor = createCanvasTexture(
    256,
    (ctx, s) => {
      const rand = mulberry32(303);
      ctx.fillStyle = '#38200f';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 32) {
        ctx.fillStyle = '#291609';
        ctx.fillRect(0, y, s, 10);
        ctx.fillStyle = '#472a16';
        ctx.fillRect(0, y + 10, s, 10);
      }
      for (let i = 0; i < 600; i += 1) {
        ctx.fillStyle =
          rand() < 0.5 ? 'rgba(18, 9, 3, 0.4)' : 'rgba(92, 58, 32, 0.25)';
        ctx.fillRect(rand() * s, rand() * s, 3 + rand() * 4, 2 + rand() * 3);
      }
    },
    true,
    1,
  );

  const woodColor = createCanvasTexture(
    256,
    (ctx, s) => {
      const rand = mulberry32(404);
      ctx.fillStyle = '#9c663b';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 24) {
        ctx.fillStyle = y % 48 === 0 ? '#8c5932' : '#ab7245';
        ctx.fillRect(0, y, s, 20);
        ctx.fillStyle = '#6c4120';
        ctx.fillRect(0, y + 20, s, 4);
      }
      for (let i = 0; i < 200; i += 1) {
        ctx.fillStyle = 'rgba(72, 42, 18, 0.16)';
        ctx.fillRect(rand() * s, rand() * s, 14 + rand() * 18, 2);
      }
    },
    true,
    2,
  );

  const stoneColor = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#8b95a3';
      ctx.fillRect(0, 0, s, s);
      for (let row = 0; row < 4; row += 1) {
        const y = row * 64;
        const offset = (row % 2) * 32;
        for (let col = -1; col < 5; col += 1) {
          const x = col * 64 + offset;
          ctx.fillStyle = (row + col) % 2 === 0 ? '#a1aab7' : '#7f8997';
          ctx.fillRect(x + 3, y + 3, 58, 58);
        }
      }
    },
    true,
    2,
  );

  const bumpNoise = createCanvasTexture(
    128,
    (ctx, s) => {
      const rand = mulberry32(505);
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i += 1) {
        const shade = Math.floor(85 + rand() * 85);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(rand() * s, rand() * s, 3, 3);
      }
    },
    false,
    4,
  );

  return {
    grassColor,
    soilDryColor,
    soilWetColor,
    woodColor,
    stoneColor,
    bumpNoise,
  };
}

export function disposeSharedFarmTextures(textures: SharedFarmTextures): void {
  Object.values(textures).forEach((tex) => tex.dispose());
}

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function checkWebGLSupport(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ok = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
