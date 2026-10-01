import * as THREE from "three";
import { fragment, vertex } from "@/components/fitting-room/shader";

export type MirrorStage = {
  /** 0 shows the first look, `looks - 1` the last. Fractions are mid-transition. */
  setProgress(value: number): void;
  setPointer(x: number, y: number): void;
  setIdle(value: number): void;
  destroy(): void;
};

function hold(t: number) {
  const x = Math.min(1, Math.max(0, (t - 0.12) / 0.76));
  return x * x * (3 - 2 * x);
}

export function createMirrorStage(canvas: HTMLCanvasElement, sources: readonly string[]): MirrorStage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const loader = new THREE.TextureLoader();
  const textures = sources.map((src) => {
    const texture = loader.load(src);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  });

  const uniforms = {
    uA: { value: textures[0] },
    uB: { value: textures[1] ?? textures[0] },
    uT: { value: 0 },
    uTime: { value: 0 },
    uIdle: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uImage: { value: new THREE.Vector2(720, 1280) },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uLight: { value: 0 },
  };

  const isLight = () => (document.documentElement.dataset.theme === "light" ? 1 : 0);
  let light = isLight();
  uniforms.uLight.value = light;
  const onTheme = () => {
    light = isLight();
  };
  window.addEventListener("persona-theme-change", onTheme);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment });
  const geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));

  const target = { progress: 0, pointer: new THREE.Vector2(0.5, 0.5), idle: 1 };
  const current = { progress: 0, idle: 1 };

  const resize = () => {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    uniforms.uRes.value.set(clientWidth, clientHeight);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let visible = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  io.observe(canvas);

  const clock = new THREE.Timer();
  let frame = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    clock.update(now);
    if (!visible) return;

    current.progress += (target.progress - current.progress) * 0.12;
    current.idle += (target.idle - current.idle) * 0.08;
    const last = textures.length - 1;
    const p = Math.min(last, Math.max(0, current.progress));
    const index = Math.min(last - 1, Math.floor(p));
    uniforms.uA.value = textures[index];
    uniforms.uB.value = textures[index + 1] ?? textures[index];
    uniforms.uT.value = hold(p - index);
    uniforms.uIdle.value = current.idle;
    uniforms.uPointer.value.lerp(target.pointer, 0.08);
    uniforms.uTime.value = clock.getElapsed();
    uniforms.uLight.value += (light - uniforms.uLight.value) * 0.08;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(tick);

  return {
    setProgress(value) {
      target.progress = value;
    },
    setPointer(x, y) {
      target.pointer.set(x, y);
    },
    setIdle(value) {
      target.idle = value;
    },
    destroy() {
      cancelAnimationFrame(frame);
      window.removeEventListener("persona-theme-change", onTheme);
      observer.disconnect();
      io.disconnect();
      textures.forEach((texture) => texture.dispose());
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
