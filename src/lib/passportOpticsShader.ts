/** Live material optics. No identity, text, metrics or account data enter this shader. */
export const opticsVertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Registered to all seven approved 1672x941 plates and the shared SVG layout.
// Conservative C bounds also protect its engraved reflections. The full lower
// text band covers every privacy mode, long fitted fields and sample disclosure.
export const finishProtectedAreas = [
  { name: 'engraved C', box: [860, 150, 1440, 715] },
  { name: 'title', box: [245, 130, 780, 285] },
  { name: 'sample and mode', box: [1160, 125, 1435, 220] },
  { name: 'identity rank metrics and provenance', box: [240, 555, 1440, 825] },
] as const;

export const engravedProtectedBox = [240, 420, 845, 825] as const;

export const opticsFragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_material;
uniform vec2 u_tilt;
uniform float u_motion;
uniform float u_engraved;
uniform vec2 u_texel;
uniform vec4 u_finish;
uniform vec4 u_tone;
uniform vec4 u_light;
vec3 plate(vec2 uv) { return texture2D(u_material, clamp(uv, 0.0, 1.0)).rgb; }
float heightAt(vec2 uv) { return dot(plate(uv), vec3(0.2126, 0.7152, 0.0722)); }
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
float outsideProtectedBox(vec2 p, vec4 bounds) {
  vec2 outside = max(max(bounds.xy - p, p - bounds.zw), 0.0);
  return smoothstep(0.0, 28.0, length(outside));
}
float finishSurface(vec2 uv) {
  vec2 p = uv * vec2(1672.0, 941.0);
  float allowed = 1.0;
  ${finishProtectedAreas.map(({ box }) => `allowed *= outsideProtectedBox(p, vec4(${box.map(n => n.toFixed(1)).join(', ')}));`).join('\n  ')}
  if (u_engraved > 0.5) allowed *= outsideProtectedBox(p, vec4(${engravedProtectedBox.map(n => n.toFixed(1)).join(", ")}));
  return allowed;
}
void main() {
  vec2 uv = v_uv;
  vec3 base = plate(uv);
  // Material coordinates match the approved photographed card, not its studio surround.
  vec2 card = (uv - vec2(0.5, 0.493)) * vec2(1.777, 1.0);
  float mask = 1.0 - smoothstep(-0.006, 0.0, roundedBox(card, vec2(0.673, 0.39), 0.047));
  float activity = smoothstep(0.0, 0.55, length(u_tilt));
  vec2 grad = vec2(
    heightAt(uv + vec2(u_texel.x, 0.0)) - heightAt(uv - vec2(u_texel.x, 0.0)),
    heightAt(uv + vec2(0.0, u_texel.y)) - heightAt(uv - vec2(0.0, u_texel.y))
  );
  // A shallow normal field makes the etched lines catch a moving environment light.
  vec3 normal = normalize(vec3(-grad * 5.0, 1.0));
  vec3 view = normalize(vec3(u_tilt * vec2(0.7, -0.7), 1.4));
  vec3 transmitted = refract(-view, normal, 1.0 / 1.46);
  vec2 refraction = transmitted.xy * 0.012 * activity * u_finish.y;
  // Wavelength-separated texture samples, rather than a CSS rainbow overlay.
  vec3 refracted = vec3(
    plate(uv + refraction * 1.06).r,
    plate(uv + refraction).g,
    plate(uv + refraction * 0.94).b
  );
  float phase = uv.x * 13.0 + uv.y * 7.0 + u_tilt.x * 5.2 - u_tilt.y * 3.8;
  vec3 spectrum = vec3(0.72 + 0.23 * cos(phase), 0.70 + 0.16 * cos(phase + 1.65), 0.92 + 0.08 * cos(phase + 0.7));
  // Non-spectral materials retain their identity under moving light.
  // A zero mix preserves the original pearl / ice spectral response exactly.
  vec3 film = mix(spectrum, u_tone.rgb * (0.86 + 0.14 * cos(phase)), u_tone.a);
  vec3 light = normalize(vec3(-0.55 + u_tilt.x * 1.7, -0.6 + u_tilt.y * 1.5, 1.0));
  vec3 halfVector = normalize(view + light);
  float specular = pow(max(dot(normal, halfVector), 0.0), u_finish.z);
  float sweep = exp(-pow((uv.x * 0.75 + uv.y * 0.32 - 0.54 - u_tilt.x * 0.26 + u_tilt.y * 0.14) * u_light.x, 2.0));
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
  vec3 lit = refracted * mix(vec3(1.0), film, (0.34 + sweep * 0.16) * u_finish.x);
  lit += film * (sweep * u_light.y + specular * u_light.z + fresnel * u_light.w);
  lit *= 0.96 + 0.065 * dot(normal, light);
  if (u_finish.w > 0.5 && u_motion > 0.0) {
    vec2 q = (uv - vec2(0.70, 0.45)) * vec2(1.777, 1.0);
    float etch = sin(uv.x * 190.0 + sin(uv.y * 70.0) * 2.0);
    if (u_finish.w > 1.5) etch = sin((uv.x + uv.y) * 100.0) * sin((uv.x - uv.y) * 100.0);
    if (u_finish.w > 2.5) etch = sin(length(q) * 300.0 + atan(q.y, q.x) * 10.0);
    float engraving = pow(max(etch, 0.0), 8.0);
    float zone = finishSurface(uv);
    lit += film * engraving * zone * u_motion * (0.07 + sweep * 0.18);
  }
  gl_FragColor = vec4(mix(base, clamp(lit, 0.0, 1.0), mask * activity), 1.0);
}`;
