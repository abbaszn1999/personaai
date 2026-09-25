const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const G = 2600;
const PEBBLE_G = 1500;
const STEP = 1 / 120;
const BULB = [0, 74];
const BULB_R = 16;
const PEBBLE_R = 7;
const MAX_PULL = 140;
const LAUNCH = 12.5;
const LIGHT_SCALE = 0.25;

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const glow = document.createElement("canvas");
const gctx = glow.getContext("2d");
const dark = document.createElement("canvas");
const dctx = dark.getContext("2d");
const stateEl = document.getElementById("state");
const shotsEl = document.getElementById("shots");
const bulbsEl = document.getElementById("bulbs");
const resetBtn = document.getElementById("reset");
const soundBtn = document.getElementById("sound");
const switchEl = document.getElementById("switch");

let W = 0, H = 0, DPR = 1;

const lamp = { ax: 0, ay: -10, len: 260, theta: 0.06, omega: 0 };
const light = { on: true, I: 1, fil: 1, heat: 0, warm: 0, popT: 0, broken: false, flash: 0 };
const sling = { x: 0, y: 0, rest: { x: 0, y: 0 }, pouch: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, loaded: true, reloadT: 0, creakAt: 0, creakCd: 0 };
const mouse = { x: -999, y: -999 };
const stats = { shots: 0, bulbs: 0 };
let grab = null;
let pebbles = [];
let shards = [];
let sparks = [];

function lampOrigin() {
  return { x: lamp.ax + Math.sin(lamp.theta) * lamp.len, y: lamp.ay + Math.cos(lamp.theta) * lamp.len };
}

function toWorld(lx, ly) {
  const o = lampOrigin();
  const c = Math.cos(lamp.theta);
  const s = Math.sin(lamp.theta);
  return { x: o.x + lx * c + ly * s, y: o.y - lx * s + ly * c };
}

function toLocal(x, y) {
  const o = lampOrigin();
  const c = Math.cos(lamp.theta);
  const s = Math.sin(lamp.theta);
  const dx = x - o.x;
  const dy = y - o.y;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function dirToWorld(nx, ny) {
  const c = Math.cos(lamp.theta);
  const s = Math.sin(lamp.theta);
  return { x: nx * c + ny * s, y: -nx * s + ny * c };
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  glow.width = dark.width = Math.ceil(W * LIGHT_SCALE);
  glow.height = dark.height = Math.ceil(H * LIGHT_SCALE);
  lamp.ax = W / 2;
  lamp.len = clamp(H * (W < 640 ? 0.27 : 0.3), H < 500 ? 90 : 130, 320);
  sling.x = clamp(W * 0.2, 70, 320);
  sling.y = H;
  sling.rest = { x: sling.x, y: H - 128 };
  if (!grab || grab.type !== "pouch") {
    sling.pouch = { ...sling.rest };
  }
}

let ac = null;
let noise = null;
let muted = false;

function audio() {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return null;
  }
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

function burst(t, dur, type, freq, gain, q = 1) {
  const s = ac.createBufferSource();
  s.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(ac.destination);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

function tone(t, f0, f1, dur, gain, type = "sine") {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function sfx(name, amt = 1) {
  const ambient = name === "squeak";
  if (muted || (ambient && (!ac || ac.state !== "running")) || !audio()) return;
  const t = ac.currentTime + 0.005;
  if (name === "squeak") {
    const g = clamp(amt, 0, 1);
    const dur = 0.14 + g * 0.16;
    const base = 1400 + Math.random() * 350;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(base * 0.8, t);
    o.frequency.linearRampToValueAtTime(base * 1.15, t + dur * 0.4);
    o.frequency.linearRampToValueAtTime(base * 0.9, t + dur);
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 26 + Math.random() * 12;
    depth.gain.value = base * 0.07;
    lfo.connect(depth).connect(o.frequency);
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = base * 1.2;
    f.Q.value = 4;
    const v = ac.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(0.04 + 0.09 * g, t + 0.03);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(v).connect(ac.destination);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
    return;
  }
  if (name === "stretch") {
    const f0 = 80 + amt * 240;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.1, t + 0.05);
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = f0 * 4;
    f.Q.value = 3;
    const v = ac.createGain();
    v.gain.setValueAtTime(0.05 + amt * 0.05, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(f).connect(v).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.07);
    burst(t, 0.02, "bandpass", 1200 + amt * 1600, 0.05, 2);
    return;
  }
  if (name === "on" || name === "off") {
    burst(t, 0.012, "highpass", 2600, 0.5);
    burst(t + 0.025, 0.014, "bandpass", name === "on" ? 1900 : 1300, 0.4, 2);
    tone(t, 150, 60, 0.06, 0.22);
    return;
  }
  if (name === "twang") {
    burst(t, 0.03, "bandpass", 900, 0.35, 3);
    tone(t, 190, 110, 0.16, 0.18, "triangle");
    return;
  }
  if (name === "clank") {
    const g = clamp(amt, 0.15, 1);
    [1320, 2210, 3470].forEach((f, i) => tone(t, f, f * 0.98, 0.35 - i * 0.08, 0.09 * g, "triangle"));
    burst(t, 0.02, "highpass", 3000, 0.4 * g);
    return;
  }
  if (name === "tap") {
    burst(t, 0.03, "lowpass", 500, clamp(amt, 0.05, 0.5));
    return;
  }
  if (name === "pop") {
    burst(t, 0.14, "lowpass", 900, 0.9);
    tone(t, 220, 40, 0.12, 0.3);
    for (let i = 0; i < 16; i++) {
      burst(t + 0.02 + Math.random() * 0.7, 0.02 + Math.random() * 0.06, "bandpass", 3000 + Math.random() * 5000, 0.12 + Math.random() * 0.2, 9);
    }
  }
}

function setSwitch(on) {
  if (light.on === on) return;
  light.on = on;
  switchEl.setAttribute("aria-checked", String(on));
  sfx(on ? "on" : "off");
  if (light.broken || light.popT > 0) {
    syncUI();
    return;
  }
  if (!on) {
    light.heat += 0.4;
    syncUI();
    return;
  }
  light.heat += 1;
  light.warm = 0.16;
  if (light.heat > 4.4) light.popT = 0.14;
  syncUI();
}

function pop(vx = 0, vy = 0) {
  const b = toWorld(BULB[0], BULB[1]);
  light.broken = true;
  light.popT = 0;
  light.flash = 1;
  stats.bulbs++;
  for (let i = 0; i < 38; i++) {
    const ang = Math.random() * TAU;
    const sp = 120 + Math.random() * 480;
    const n = 3 + Math.floor(Math.random() * 2);
    const r = 2 + Math.random() * 6;
    const poly = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.random() * 0.8;
      poly.push([Math.cos(a) * r * (0.5 + Math.random()), Math.sin(a) * r * (0.5 + Math.random())]);
    }
    shards.push({
      x: b.x + Math.cos(ang) * 8, y: b.y + Math.sin(ang) * 8,
      vx: Math.cos(ang) * sp + vx * 0.35, vy: Math.sin(ang) * sp * 0.7 + 80 + vy * 0.35,
      a: Math.random() * TAU, va: (Math.random() - 0.5) * 24, poly,
    });
  }
  for (let i = 0; i < 40; i++) {
    const ang = Math.random() * TAU;
    const sp = 200 + Math.random() * 700;
    sparks.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.3 + Math.random() * 0.6, max: 0.9 });
  }
  sfx("pop");
  syncUI();
}

function replaceBulb() {
  light.broken = false;
  light.heat = 0;
  light.popT = 0;
  if (light.on) {
    light.warm = 0.2;
    sfx("on");
  }
  syncUI();
}

function syncUI() {
  resetBtn.hidden = !light.broken;
  shotsEl.textContent = stats.shots;
  bulbsEl.textContent = stats.bulbs;
  stateEl.textContent = light.broken ? (light.on ? "blown (switch on)" : "blown") : (light.on ? "on" : "off");
}

function shoot() {
  const vx = (sling.rest.x - sling.pouch.x) * LAUNCH;
  const vy = (sling.rest.y - sling.pouch.y) * LAUNCH;
  const pull = Math.hypot(vx, vy) / LAUNCH;
  if (pull < 18) return;
  pebbles.push({ x: sling.pouch.x, y: sling.pouch.y, vx, vy, a: 0, hitT: 0, rest: 0, life: 1 });
  sling.loaded = false;
  sling.reloadT = 0.45;
  sling.vel = { x: vx * 0.4, y: vy * 0.4 };
  stats.shots++;
  sfx("twang");
  syncUI();
}

function hitTest(x, y) {
  if (sling.loaded && Math.hypot(x - sling.pouch.x, y - sling.pouch.y) < 28) return { type: "pouch" };
  const l = toLocal(x, y);
  const halfW = 14 + 50 * clamp((l.y - 12) / 50, 0, 1) + 6;
  if (l.y > -6 && l.y < 92 && Math.abs(l.x) < halfW) {
    const tgt = Math.atan2(x - lamp.ax, y - lamp.ay);
    return { type: "lamp", offset: tgt - lamp.theta };
  }
  return null;
}

canvas.addEventListener("pointerdown", (e) => {
  const a = audio();
  if (a && a.state === "suspended") a.resume();
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  grab = hitTest(mouse.x, mouse.y);
  if (!grab) return;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  if (grab) return;
  canvas.style.cursor = hitTest(mouse.x, mouse.y) ? "grab" : "default";
});

function release() {
  if (grab && grab.type === "pouch") {
    shoot();
    sling.creakAt = 0;
  }
  grab = null;
  canvas.style.cursor = "default";
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

switchEl.addEventListener("click", () => {
  const a = audio();
  if (a && a.state === "suspended") a.resume();
  setSwitch(!light.on);
});
switchEl.addEventListener("keydown", (e) => {
  if (e.key !== " " && e.key !== "Enter") return;
  e.preventDefault();
  setSwitch(!light.on);
});
resetBtn.addEventListener("click", replaceBulb);
soundBtn.addEventListener("click", () => {
  muted = !muted;
  soundBtn.textContent = muted ? "sound: off" : "sound: on";
});
window.addEventListener("keydown", (e) => {
  if (e.key !== "r" || !light.broken) return;
  replaceBulb();
});
window.addEventListener("resize", resize);

function kickLamp(px, py, fx, fy) {
  const rx = px - lamp.ax;
  const ry = py - lamp.ay;
  lamp.omega += (ry * fx - rx * fy) / (lamp.len * lamp.len);
}

let switchRect = null;

function knockSwitch(nx, ny) {
  switchEl.style.setProperty("--kx", `${-nx * 6}px`);
  switchEl.style.setProperty("--ky", `${-ny * 6}px`);
  switchEl.style.setProperty("--kr", `${(Math.random() - 0.5) * 6}deg`);
  switchEl.classList.remove("knock");
  void switchEl.offsetWidth;
  switchEl.classList.add("knock");
}

function collideSwitch(p) {
  if (p.hitT > 0 || !switchRect) return;
  const r = PEBBLE_R;
  const cx = clamp(p.x, switchRect.left, switchRect.right);
  const cy = clamp(p.y, switchRect.top, switchRect.bottom);
  let nx = p.x - cx;
  let ny = p.y - cy;
  const d = Math.hypot(nx, ny);
  if (d > r) return;
  if (d === 0) {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    nx = -p.vx / sp;
    ny = -p.vy / sp;
  } else {
    nx /= d;
    ny /= d;
  }
  const vn = p.vx * nx + p.vy * ny;
  if (vn >= 0) return;
  p.vx -= 1.4 * vn * nx;
  p.vy -= 1.4 * vn * ny;
  p.x = cx + nx * (r + 1);
  p.y = cy + ny * (r + 1);
  p.hitT = 0.1;
  sfx("tap", -vn / 2000);
  knockSwitch(nx, ny);
  setSwitch(!light.on);
}

function collidePebble(p) {
  collideSwitch(p);
  if (p.hitT > 0) return;
  const l = toLocal(p.x, p.y);
  const r = PEBBLE_R;

  if (!light.broken && Math.hypot(l.x - BULB[0], l.y - BULB[1]) < BULB_R + r) {
    pop(p.vx, p.vy);
    kickLamp(p.x, p.y, p.vx * 0.08, p.vy * 0.08);
    p.vx *= 0.75;
    p.vy *= 0.75;
    p.hitT = 0.08;
    return;
  }

  if (l.y < 10 - r || l.y > 62 + r) return;
  const halfW = 14 + 48 * Math.pow(clamp((l.y - 13) / 49, 0, 1), 0.7);
  if (Math.abs(l.x) > halfW + r) return;
  let nx = l.x;
  let ny = l.y - 30;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  const n = dirToWorld(nx, ny);
  const vn = p.vx * n.x + p.vy * n.y;
  if (vn >= 0) return;
  const e = 0.45;
  p.vx -= (1 + e) * vn * n.x;
  p.vy -= (1 + e) * vn * n.y;
  p.x += n.x * 6;
  p.y += n.y * 6;
  const J = -(1 + e) * vn * 0.22;
  kickLamp(p.x, p.y, -n.x * J, -n.y * J);
  p.hitT = 0.06;
  sfx("clank", -vn / 1200);
}

function step(dt) {
  let acc = -(G / lamp.len) * Math.sin(lamp.theta) - lamp.omega * 0.3;
  if (grab && grab.type === "lamp") {
    const tgt = clamp(Math.atan2(mouse.x - lamp.ax, mouse.y - lamp.ay) - grab.offset, -1.25, 1.25);
    acc += (tgt - lamp.theta) * 170 - lamp.omega * 16;
  }
  lamp.omega += acc * dt;
  const prevTheta = lamp.theta;
  lamp.theta = clamp(lamp.theta + lamp.omega * dt, -1.45, 1.45);
  if (Math.sign(prevTheta) !== Math.sign(lamp.theta) && Math.abs(lamp.omega) > 0.35) {
    sfx("squeak", (Math.abs(lamp.omega) - 0.35) / 2);
  }

  if (grab && grab.type === "pouch") {
    let dx = mouse.x - sling.rest.x;
    let dy = Math.min(mouse.y, H - 10) - sling.rest.y;
    const d = Math.hypot(dx, dy);
    if (d > MAX_PULL) {
      dx *= MAX_PULL / d;
      dy *= MAX_PULL / d;
    }
    sling.pouch = { x: sling.rest.x + dx, y: sling.rest.y + dy };
    sling.vel = { x: 0, y: 0 };
    const pull = Math.hypot(dx, dy);
    sling.creakCd -= dt;
    if (Math.abs(pull - sling.creakAt) > 7 && sling.creakCd <= 0) {
      sfx("stretch", pull / MAX_PULL);
      sling.creakAt = pull;
      sling.creakCd = 0.03;
    }
  } else {
    sling.vel.x += ((sling.rest.x - sling.pouch.x) * 900 - sling.vel.x * 12) * dt;
    sling.vel.y += ((sling.rest.y - sling.pouch.y) * 900 - sling.vel.y * 12) * dt;
    sling.pouch.x += sling.vel.x * dt;
    sling.pouch.y += sling.vel.y * dt;
  }

  for (const p of pebbles) {
    p.hitT = Math.max(0, p.hitT - dt);
    if (p.rest > 0) continue;
    p.vy += PEBBLE_G * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a += p.vx * dt * 0.05;
    collidePebble(p);
    if (p.y > H - PEBBLE_R) {
      p.y = H - PEBBLE_R;
      if (p.vy > 120) sfx("tap", p.vy / 3000);
      p.vy *= -0.35;
      p.vx *= 0.75;
      if (Math.abs(p.vy) < 40 && Math.abs(p.vx) < 20) p.rest = 0.0001;
    }
    if (p.x < PEBBLE_R || p.x > W - PEBBLE_R) {
      p.x = clamp(p.x, PEBBLE_R, W - PEBBLE_R);
      p.vx *= -0.5;
    }
  }
}

function updateWorld(dt) {
  if (!sling.loaded) {
    sling.reloadT -= dt;
    if (sling.reloadT <= 0) sling.loaded = true;
  }
  for (const p of pebbles) {
    if (p.rest > 0) {
      p.rest += dt;
      if (p.rest > 4) p.life -= dt * 1.5;
    }
  }
  pebbles = pebbles.filter((p) => p.life > 0 && p.y < H + 200).slice(-10);

  for (const s of shards) {
    s.vy += G * 0.75 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.a += s.va * dt;
    if (s.y > H - 3) {
      s.y = H - 3;
      s.vy *= -0.28;
      s.vx *= 0.6;
      s.va *= 0.5;
      if (Math.abs(s.vy) < 30) s.vy = 0;
    }
    if (s.x < 0 || s.x > W) {
      s.vx *= -0.5;
      s.x = clamp(s.x, 0, W);
    }
  }
  shards = shards.slice(-240);
  for (const p of sparks) {
    p.vy += G * 0.4 * dt;
    p.vx *= 0.985;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  sparks = sparks.filter((p) => p.life > 0);
}

function updateLight(dt) {
  light.heat = Math.max(0, light.heat - dt * 0.35);
  let target = light.on && !light.broken ? 1 : 0;
  if (light.warm > 0) {
    light.warm -= dt;
    target *= Math.random() < 0.45 ? 0.12 : 1;
  }
  if (light.on && light.heat > 2.6 && Math.random() < (light.heat - 2.6) * 0.06) target *= 0.3;
  if (light.popT > 0) {
    light.popT -= dt;
    target = 1.6;
    if (light.popT <= 0) {
      pop();
      target = 0;
    }
  }
  const upI = target > light.I ? 34 : 16;
  light.I = lerp(light.I, target, 1 - Math.exp(-upI * dt));
  const upF = target > light.fil ? 14 : 3.2;
  light.fil = lerp(light.fil, clamp(target, 0, 1), 1 - Math.exp(-upF * dt));
  if (light.broken) light.fil = 0;
  light.flash = Math.max(0, light.flash - dt * 3.5);
}

function renderLight() {
  const I = clamp(light.I, 0, 1);
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.clearRect(0, 0, glow.width, glow.height);
  if (I > 0.002) {
    gctx.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0);
    gctx.filter = "blur(5px)";
    const apex = toWorld(0, 2);
    const rl = toWorld(-60, 62);
    const rr = toWorld(60, 62);
    const far = Math.max(W, H) * 2.5;
    const nl = Math.hypot(rl.x - apex.x, rl.y - apex.y);
    const nr = Math.hypot(rr.x - apex.x, rr.y - apex.y);
    const dl = { x: (rl.x - apex.x) / nl, y: (rl.y - apex.y) / nl };
    const dr = { x: (rr.x - apex.x) / nr, y: (rr.y - apex.y) / nr };
    const b = toWorld(BULB[0], BULB[1]);
    const reach = Math.max(W, H) * 1.05;
    const grd = gctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, reach);
    grd.addColorStop(0, `rgba(255,168,90,${I})`);
    grd.addColorStop(0.35, `rgba(247,109,1,${I * 0.82})`);
    grd.addColorStop(0.7, `rgba(196,0,0,${I * 0.28})`);
    grd.addColorStop(1, "rgba(196,0,0,0)");
    gctx.fillStyle = grd;
    gctx.beginPath();
    gctx.moveTo(rl.x, rl.y);
    gctx.lineTo(rr.x, rr.y);
    gctx.lineTo(rr.x + dr.x * far, rr.y + dr.y * far);
    gctx.lineTo(rl.x + dl.x * far, rl.y + dl.y * far);
    gctx.closePath();
    gctx.fill();
    const halo = gctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 130);
    halo.addColorStop(0, `rgba(247,109,1,${I * 0.55})`);
    halo.addColorStop(1, "rgba(247,109,1,0)");
    gctx.fillStyle = halo;
    gctx.fillRect(b.x - 130, b.y - 130, 260, 260);
    gctx.filter = "none";
  }

  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalCompositeOperation = "source-over";
  dctx.clearRect(0, 0, dark.width, dark.height);
  dctx.fillStyle = `rgba(3,4,5,${0.975 - I * 0.1})`;
  dctx.fillRect(0, 0, dark.width, dark.height);
  if (I > 0.002) {
    dctx.globalCompositeOperation = "destination-out";
    dctx.drawImage(glow, 0, 0);
    dctx.globalCompositeOperation = "source-over";
  }
  ctx.drawImage(dark, 0, 0, W, H);
  if (I > 0.002) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.13;
    ctx.drawImage(glow, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

function drawBulb(I) {
  if (light.broken) {
    ctx.fillStyle = "rgba(200,215,230,0.08)";
    ctx.strokeStyle = "rgba(220,230,240,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const jag = [[-10, 60], [-11, 67], [-8, 64], [-6, 71], [-3, 65], [0, 69], [3, 64], [6, 72], [8, 65], [11, 68], [10, 60]];
    jag.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,105,85,0.8)";
    ctx.beginPath();
    ctx.moveTo(-3, 60); ctx.lineTo(-5, 70); ctx.lineTo(-9, 73);
    ctx.moveTo(3, 60); ctx.lineTo(6, 69); ctx.lineTo(4, 76);
    ctx.stroke();
    return;
  }
  const [bx, by] = BULB;
  const heatTint = clamp((light.heat - 2) / 2.5, 0, 1);
  const gg = ctx.createRadialGradient(bx, by + 2, 0, bx, by, 17);
  gg.addColorStop(0, rgba(mix([255, 186, 120], [255, 230, 210], heatTint), 0.06 + 0.92 * I));
  gg.addColorStop(0.55, rgba([247, 109, 1], 0.04 + 0.62 * I));
  gg.addColorStop(1, rgba([196, 0, 0], 0.07 + 0.3 * I));
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(bx, by, BULB_R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.25 * I})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "rgba(170,158,140,0.55)";
  ctx.beginPath();
  ctx.moveTo(-3, 60); ctx.lineTo(-6, 76);
  ctx.moveTo(3, 60); ctx.lineTo(6, 76);
  ctx.stroke();

  const f = light.fil;
  ctx.save();
  ctx.strokeStyle = rgba(mix([90, 28, 8], [255, 186, 110], f), 1);
  ctx.lineWidth = 1.2;
  if (f > 0.03) {
    ctx.shadowColor = `rgba(247,109,1,${f})`;
    ctx.shadowBlur = 14 * f;
  }
  ctx.beginPath();
  ctx.moveTo(-6, 76);
  for (let k = 1; k <= 10; k++) {
    const x = -6 + (12 * k) / 10;
    const sag = Math.sin((k / 10) * Math.PI) * 2.5;
    ctx.lineTo(x, 76 + sag + (k % 2 ? -1.4 : 1.4));
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(-7, 69, 2.2, 5, -0.5, 0, TAU);
  ctx.fill();
}

function drawLamp() {
  const o = lampOrigin();
  const I = clamp(light.I, 0, 1);

  ctx.strokeStyle = "#2f3236";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lamp.ax, lamp.ay);
  ctx.lineTo(o.x, o.y);
  ctx.stroke();

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(-lamp.theta);

  const cg = ctx.createLinearGradient(-8, 0, 8, 0);
  cg.addColorStop(0, "#16181a");
  cg.addColorStop(0.45, "#4a4e54");
  cg.addColorStop(1, "#121315");
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.roundRect(-8, -2, 16, 17, 3);
  ctx.fill();

  const sg = ctx.createLinearGradient(-62, 0, 62, 0);
  sg.addColorStop(0, "#0c0d0f");
  sg.addColorStop(0.3, "#26292d");
  sg.addColorStop(0.42, "#4d5157");
  sg.addColorStop(0.58, "#23262a");
  sg.addColorStop(1, "#0a0b0c");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(-13, 13);
  ctx.bezierCurveTo(-28, 15, -56, 34, -62, 62);
  ctx.lineTo(62, 62);
  ctx.bezierCurveTo(56, 34, 28, 15, 13, 13);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const ug = ctx.createRadialGradient(0, 64, 0, 0, 62, 62);
  ug.addColorStop(0, rgba(mix([22, 23, 25], [255, 150, 70], I), 1));
  ug.addColorStop(1, rgba(mix([10, 11, 12], [196, 0, 0], I), 1));
  ctx.fillStyle = ug;
  ctx.beginPath();
  ctx.ellipse(0, 62, 62, 7, 0, 0, TAU);
  ctx.fill();

  drawBulb(I);

  ctx.strokeStyle = `rgba(255,255,255,${0.12 + I * 0.2})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 62, 62, 7, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();

  if (I > 0.01) {
    const b = toWorld(BULB[0], BULB[1]);
    const h = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 80);
    h.addColorStop(0, `rgba(247,109,1,${0.5 * I})`);
    h.addColorStop(1, "rgba(247,109,1,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = h;
    ctx.fillRect(b.x - 80, b.y - 80, 160, 160);
    ctx.globalCompositeOperation = "source-over";
  }
}

function drawPebble(x, y, a, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(a);
  const g = ctx.createRadialGradient(-2.5, -2.5, 0, 0, 0, PEBBLE_R + 1);
  g.addColorStop(0, "#a9a49b");
  g.addColorStop(0.6, "#6b665f");
  g.addColorStop(1, "#34312d");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, PEBBLE_R + 0.8, PEBBLE_R - 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSlingshot() {
  const { x, y } = sling;
  const tipL = { x: x - 28, y: y - 140 };
  const tipR = { x: x + 28, y: y - 140 };
  const p = sling.pouch;
  const aiming = grab && grab.type === "pouch";
  const stretch = clamp(Math.hypot(p.x - sling.rest.x, p.y - sling.rest.y) / MAX_PULL, 0, 1);
  const bandW = 4 - stretch * 2;

  ctx.lineCap = "round";
  ctx.strokeStyle = "#7a2e22";
  ctx.lineWidth = bandW;
  ctx.beginPath();
  ctx.moveTo(tipL.x, tipL.y);
  ctx.lineTo(p.x - 6, p.y);
  ctx.stroke();

  const wood = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
  wood.addColorStop(0, "#3b2616");
  wood.addColorStop(0.45, "#8a5a34");
  wood.addColorStop(1, "#3a2515");
  ctx.strokeStyle = wood;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(x, y + 4);
  ctx.lineTo(x, y - 72);
  ctx.quadraticCurveTo(x - 4, y - 96, tipL.x, tipL.y);
  ctx.moveTo(x, y - 72);
  ctx.quadraticCurveTo(x + 4, y - 96, tipR.x, tipR.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,220,180,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 2, y);
  ctx.lineTo(x - 2, y - 70);
  ctx.stroke();
  ctx.fillStyle = "#2a1a0f";
  for (const t of [tipL, tipR]) {
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, 6, 3, 0, 0, TAU);
    ctx.fill();
  }

  if (aiming) {
    const vx = (sling.rest.x - p.x) * LAUNCH;
    const vy = (sling.rest.y - p.y) * LAUNCH;
    ctx.fillStyle = "#f76d01";
    for (let i = 1; i <= 9; i++) {
      const t = i * 0.035;
      ctx.globalAlpha = 0.5 * (1 - i / 10);
      ctx.beginPath();
      ctx.arc(p.x + vx * t, p.y + vy * t + 0.5 * PEBBLE_G * t * t, 2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#4a2c1c";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 11, 7, Math.atan2(p.y - sling.rest.y, p.x - sling.rest.x), 0, TAU);
  ctx.fill();
  if (sling.loaded) drawPebble(p.x, p.y, 0);

  ctx.strokeStyle = "#8e3627";
  ctx.lineWidth = bandW;
  ctx.beginPath();
  ctx.moveTo(tipR.x, tipR.y);
  ctx.lineTo(p.x + 6, p.y);
  ctx.stroke();
}

function drawParticles() {
  for (const p of pebbles) drawPebble(p.x, p.y, p.a, clamp(p.life, 0, 1));
  for (const s of shards) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    ctx.fillStyle = "rgba(210,225,240,0.16)";
    ctx.strokeStyle = "rgba(230,238,248,0.55)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    s.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (!sparks.length) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const p of sparks) {
    const t = clamp(p.life / p.max, 0, 1);
    ctx.strokeStyle = `rgba(${Math.round(247 - 40 * (1 - t))},${Math.round(109 * t)},${Math.round(8 * t)},${t})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.012, p.y - p.vy * 0.012);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  renderLight();
  drawLamp();
  drawSlingshot();
  drawParticles();
  if (light.flash > 0) {
    ctx.fillStyle = `rgba(247,109,1,${light.flash * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
}

let last = performance.now();
let accT = 0;

function frame(now) {
  const sr = switchEl.getBoundingClientRect();
  switchRect = { left: sr.left, right: sr.right, top: sr.top, bottom: sr.bottom };
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  accT += dt;
  while (accT >= STEP) {
    step(STEP);
    accT -= STEP;
  }
  updateWorld(dt);
  updateLight(dt);
  render();
  requestAnimationFrame(frame);
}

resize();
syncUI();
requestAnimationFrame(frame);
