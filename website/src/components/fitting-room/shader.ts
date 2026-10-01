export const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragment = /* glsl */ `
  precision highp float;

  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uT;
  uniform float uTime;
  uniform float uIdle;
  uniform vec2 uRes;
  uniform vec2 uImage;
  uniform vec2 uPointer;
  uniform float uLight;
  varying vec2 vUv;

  const vec3 ORANGE = vec3(0.969, 0.427, 0.004);
  const vec3 RED = vec3(0.769, 0.0, 0.0);

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  vec2 cover(vec2 uv) {
    float rs = uRes.x / uRes.y;
    float ri = uImage.x / uImage.y;
    vec2 scale = rs < ri ? vec2(rs / ri, 1.0) : vec2(1.0, ri / rs);
    return (uv - 0.5) * scale + 0.5;
  }

  vec3 split(sampler2D tex, vec2 st, float amount) {
    vec2 o = vec2(amount, 0.0);
    return vec3(texture2D(tex, st + o).r, texture2D(tex, st).g, texture2D(tex, st - o).b);
  }

  void main() {
    vec2 uv = vUv;
    vec2 lean = (uPointer - 0.5) * vec2(0.012, -0.008);
    vec2 st = (cover(uv) - 0.5) * 0.985 + 0.5 + lean;

    // The seam travels head to toe. Above it the new outfit is already on.
    float edge = mix(1.16, -0.16, uT);
    float wave = (noise(vec2(uv.x * 7.0, uTime * 0.7)) - 0.5) * 0.035;
    float d = uv.y - (edge + wave);
    float band = smoothstep(0.11, 0.0, abs(d));
    float seam = smoothstep(0.0045, 0.0, abs(d));

    vec3 a = split(uA, st, 0.007 * band);
    vec3 b = split(uB, st, 0.007 * band);
    vec3 col = mix(a, b, smoothstep(-0.003, 0.003, d));

    // Inside the band the body reads as a scanned dot field.
    vec2 cell = fract(uv * uRes / 6.0) - 0.5;
    float dots = smoothstep(0.32, 0.0, length(cell));
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 scanned = mix(RED, ORANGE, luma) * dots * (0.4 + luma * 1.6);
    col = mix(col, col * 0.25 + scanned, band * 0.9);
    col += ORANGE * seam * 1.8 + vec3(1.0, 0.85, 0.7) * seam * 0.8;

    // At rest, a faint measuring sweep keeps the mirror alive.
    float sweepY = 1.0 - fract(uTime * 0.11);
    float sweep = smoothstep(0.035, 0.0, abs(uv.y - sweepY)) * uIdle;
    float ticks = step(0.5, fract(uv.x * 40.0)) * smoothstep(0.012, 0.0, abs(uv.y - sweepY));
    col += ORANGE * (sweep * 0.28 + ticks * 0.35 * uIdle);

    float vig = smoothstep(1.15, 0.3, length((uv - 0.5) * vec2(1.0, 1.25)));
    col *= mix(mix(0.62, 0.9, uLight), 1.0, vig);

    // On the paper theme, open up the shadows so the mirror doesn't read as a black slab.
    vec3 lifted = pow(max(col, 0.0), vec3(0.72)) * 1.04 + 0.025;
    col = mix(col, lifted, uLight);
    col += (hash(uv * uRes + fract(uTime)) - 0.5) * 0.035;

    gl_FragColor = vec4(col, 1.0);
  }
`;
