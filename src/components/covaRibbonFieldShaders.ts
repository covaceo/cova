// Adapted from ThreeUI Ribbon Field Community source (MIT).
// Source: github.com/MengTo/threeui, ribbonFieldShaders.ts.
export const RIBBON_FIELD_VERTEX_SHADER = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

export const RIBBON_FIELD_FRAGMENT_SHADER = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform vec2 pointer;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float ribbon(vec2 uv, float offset, float width, float phase) {
    float y = 0.55 + 0.20 * sin((uv.x * 2.15) + phase) + 0.045 * sin((uv.x * 7.0) - phase * 0.7);
    float d = abs(uv.y - y - offset);
    return exp(-(d * d) / width);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float t = time * 0.22;
    float drift = (pointer.x - 0.5) * 0.06;

    float rightFade = smoothstep(0.22, 0.72, uv.x);
    float copyProtection = 1.0 - smoothstep(0.0, 0.92, distance(uv, vec2(0.18, 0.48)));

    float r1 = ribbon(vec2(uv.x + drift, uv.y), 0.03, 0.0065, t + 0.9);
    float r2 = ribbon(vec2(uv.x - drift * 0.7, uv.y), -0.23, 0.0085, t + 3.25);
    float r3 = ribbon(vec2(uv.x + drift * 0.4, uv.y), 0.25, 0.014, t + 1.85);
    float glow = r1 * 1.14 + r2 * 1.05 + r3 * 0.48;

    vec3 cobalt = vec3(0.31, 0.49, 1.0);
    vec3 polar = vec3(0.91, 0.93, 1.0);
    vec3 ice = vec3(0.43, 0.59, 1.0);
    vec3 deep = vec3(0.08, 0.16, 0.48);

    vec3 col = vec3(0.0);
    col += polar * r1 * 0.42;
    col += ice * r1 * 0.76;
    col += cobalt * r2 * 0.88;
    col += deep * r3 * 0.58;
    col += ice * (r2 + r3) * 0.22;

    float bloom = exp(-pow(distance(uv, vec2(0.76, 0.40 + 0.035 * sin(t))), 2.0) / 0.050);
    bloom += exp(-pow(distance(uv, vec2(0.71, 0.75 + 0.025 * cos(t))), 2.0) / 0.030);
    col += mix(cobalt, polar, 0.28) * bloom * 0.30;

    vec2 grid = fract(gl_FragCoord.xy / 7.0) - 0.5;
    float dotShape = smoothstep(0.29, 0.11, length(grid));
    float noise = hash(floor(gl_FragCoord.xy / 7.0));
    float scan = 0.72 + 0.28 * sin((uv.x + uv.y) * 38.0 + time * 1.3);
    float dots = dotShape * (0.48 + 0.52 * noise) * scan;
    float micro = hash(gl_FragCoord.xy + time) * 0.025;
    float alpha = clamp((glow * 1.55 + bloom * 0.50) * dots * rightFade, 0.0, 1.0);
    alpha *= 1.0 - copyProtection * 0.64;

    vec3 base = vec3(0.012, 0.020, 0.055);
    vec3 finalColor = mix(base, col, clamp(alpha * 1.48, 0.0, 1.0));
    finalColor += micro * rightFade;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
