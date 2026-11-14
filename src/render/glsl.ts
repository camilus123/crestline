// Shared GLSL chunks.

export const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const NOISE = `
uint hashU(uvec2 v){ v = v*1664525u + 1013904223u; v.x += v.y*1664525u; v.y += v.x*1664525u; v ^= v>>16u; v.x += v.y*1664525u; v.y += v.x*1664525u; v ^= v>>16u; return v.x ^ v.y; }
float hash2(vec2 p){ return float(hashU(uvec2(ivec2(floor(p)) + 32768))) * (1.0/4294967296.0); }
float hash1(float p){ return hash2(vec2(p, p*0.37+11.0)); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  float a=hash2(i), b=hash2(i+vec2(1,0)), c=hash2(i+vec2(0,1)), d=hash2(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=0.5; } return s; }
float fbm2(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<2;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=0.5; } return s/0.75; }
`;

/** Path texture access and bent-space placement. */
export const PATH = `
uniform sampler2D uPath;
uniform vec4 uPathInfo; // dFirst, step, count, maxD
uniform float uLoopLen; // circuit lap length (0 for stages)
uniform vec4 uTerr;     // amplitude, frequency, nearRise, type
uniform vec4 uTerr2;    // wallHeight, cliffDepth, dunes, waterLevel
struct PathS { vec2 xz; float phi; float y; float hwL; float hwR; float extL; float extR; float s; float flags; float sand; float curv; };
PathS pathAt(float d){
  float f = clamp((d - uPathInfo.x) / uPathInfo.y, 0.0, uPathInfo.z - 1.001);
  int i = int(floor(f)); float t = fract(f);
  vec4 a0 = texelFetch(uPath, ivec2(i,0),0), a1 = texelFetch(uPath, ivec2(i+1,0),0);
  vec4 b0 = texelFetch(uPath, ivec2(i,1),0), b1 = texelFetch(uPath, ivec2(i+1,1),0);
  vec4 c0 = texelFetch(uPath, ivec2(i,2),0), c1 = texelFetch(uPath, ivec2(i+1,2),0);
  vec4 A = mix(a0,a1,t), B = mix(b0,b1,t), C = mix(c0,c1,t);
  PathS p; p.xz = A.xy; p.phi = A.z; p.y = A.w; p.hwL = B.x; p.hwR = B.y; p.extL = B.z; p.extR = B.w;
  p.s = C.x; p.flags = (t < 0.5 ? c0.y : c1.y); p.sand = C.z; p.curv = C.w;
  return p;
}
bool flag(float flags, int bit){ return (int(flags + 0.5) & bit) != 0; }
// periodic s for noise so circuits have no seam
float noiseS(float s){
  if (uLoopLen <= 0.0) return s;
  float L = uLoopLen; float sm = mod(s, L);
  return sm;
}
float terrNoise(float s, float u, float fr){
  if (uLoopLen > 0.0) {
    float L = uLoopLen; float sm = mod(s, L);
    float w = smoothstep(L - 300.0, L, sm);
    float a = fbm(vec2(sm*fr, u*fr));
    if (w <= 0.0) return a;
    float b = fbm(vec2((sm - L)*fr, u*fr));
    return mix(a, b, w);
  }
  return fbm(vec2(s*fr, u*fr));
}
// terrain height relative to the road centre at lateral position u (signed), side = sign(u), off = metres beyond edge
// (mirrored on the CPU in terrain.ts, which places scenery: keep the two in step)
float terrainH(PathS p, float u, float off){
  float side = u < 0.0 ? -1.0 : 1.0;
  float fr = uTerr.y;
  float n = terrNoise(p.s, u, fr) - 0.45;
  float n2 = terrNoise(p.s + 913.0, u * 1.7, fr * 4.0) - 0.5;
  float far = smoothstep(3.0, 45.0, off);
  float h = -0.12 * smoothstep(0.3, 1.5, off) * (1.0 - smoothstep(2.5, 6.0, off));
  h += (n * uTerr.x * far + n2 * uTerr.x * 0.12 * smoothstep(1.0, 8.0, off)) ;
  h += uTerr.z * smoothstep(8.0, 160.0, off) * off * 0.08;
  int ty = int(uTerr.w + 0.5);
  if (ty == 2) { // dunes
    float dn = sin((p.s * 0.021 + u * 0.034) + n * 3.0) * 0.5 + 0.5;
    h += dn * dn * uTerr2.z * smoothstep(4.0, 40.0, off);
  }
  if (ty == 4) {
    // Mountains. p.sand carries the tilt here: +1 mountainside on the right and valley on the left, -1 the other
    // way round, changing over smoothly along the road. Everything is a function of the place on the ground only.
    float w = p.sand * side;
    float big = terrNoise(p.s + 311.0, u * 0.7, 0.0022);      // 0..1, features several hundred metres across
    float up = smoothstep(0.0, 0.7, w), dn = smoothstep(0.0, 0.7, -w);
    // mountainside: a cut rock face at the road, then a concave slope easing off towards a ridge
    float cutH = 6.0 + 9.0 * clamp(n + 0.45, 0.0, 1.0);
    float face = cutH * smoothstep(0.4, 0.4 + cutH * 0.55, off);
    float x = max(off - 3.0, 0.0);
    float M = uTerr2.x * (0.55 + 0.9 * big);
    float mount = face + M * (1.0 - exp(-x / (M * 1.15)))
      + (big - 0.47) * 150.0 * smoothstep(40.0, 320.0, x) + n * 22.0 * smoothstep(6.0, 90.0, x) + n2 * 3.0 * smoothstep(2.0, 12.0, x);
    // valley side: a steep drop below the guard rail easing into the valley floor, and the far side rising again
    float xv = max(off - 1.4, 0.0);
    float Dv = uTerr2.y * (0.65 + 0.7 * big);
    float valley = -0.1 * smoothstep(1.0, 1.4, off) - Dv * (1.0 - exp(-xv / (Dv * 0.5))) * smoothstep(0.0, 2.5, xv)
      + n * 14.0 * smoothstep(4.0, 60.0, xv) + n2 * 2.0 * smoothstep(3.0, 12.0, xv)
      + smoothstep(280.0, 700.0, off) * (Dv + uTerr2.x * 0.55);
    h = mix(h, mount, up);
    h = mix(h, valley, dn);
  }
  if (ty == 6) { // motorway: embankment then flat land
    h = -0.1 - smoothstep(3.8, 9.0, off) * 2.2 + n * uTerr.x * far;
  }
  return h;
}
// Inside a bend the bent space folds at the fold limit (ext), so ground cannot exist beyond it. Heights are
// tapered back to road level over the outer half of the way there: the inside of a bend becomes a rounded spur
// (or hollow) shared by the stretches of road around it, instead of a hillside cut off by a vertical curtain.
// Only where the space really folds; with the limit far away (straights, outsides of bends) nothing changes.
float foldTaper(float uu, float edge, float ext){
  float tk = 1.0 - smoothstep(350.0, 650.0, ext);
  return 1.0 - tk * smoothstep(edge + (ext - edge) * 0.45, ext, uu);
}
// The land ends where the draw distance ends. Hills and mountainsides there used to stop dead, and from a bend
// their cut end showed in cross-section against the sky (a 'hole' with the backdrop visible behind it). Heights
// now ease down to road level over the last third of the distance, so the land sinks into the haze instead.
float farTaper(float d){ return 1.0 - smoothstep(uPathInfo.w * 0.62, uPathInfo.w * 0.985, d); }
vec3 bentPos(PathS p, float u, float h){
  vec2 rt = vec2(cos(p.phi), -sin(p.phi));
  vec2 xz = p.xz + rt * u;
  return vec3(xz.x, p.y + h, xz.y);
}
`;

/** Lighting + atmosphere. World positions are in bent space. */
export const LIGHT = `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform vec3 uFogCol;
uniform vec3 uFogSun;
uniform vec4 uFog; // density, height falloff, base height, max
uniform vec3 uCamPos;
uniform vec4 uHead[4];
uniform vec4 uHeadDir[4];
uniform int uHeadN;
uniform vec4 uPL[16];
uniform vec4 uPLc[16];
uniform int uPLn;
uniform float uFlash; // lightning
uniform float uWet;   // road wetness 0..1
uniform float uTime;
// sun shadow map (Psycho preset)
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowVP;
uniform vec4 uShadowP; // on, texel size (uv), unused, depth bias
// far cascade: terrain and landmarks over a couple of kilometres, so distant ground is already in shade
// before it comes inside the detailed map (otherwise shadows pop in as you approach)
uniform highp sampler2DShadow uShadowMap2;
uniform mat4 uShadowVP2;
uniform vec4 uShadowP2; // texel size (uv), depth bias, normal offset (m), unused

const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));

/** 1 = in sunlight, 0 = shadowed; soft (12-tap PCF on top of the hardware 2x2 comparison) */
float sunShadow(vec3 wpos, vec3 N, float ndl){
  if (uShadowP.x < 0.5) return 1.0;
  // normal offset: push the lookup off the surface, more at grazing sun angles (prevents acne)
  float dist = length(wpos - uCamPos);
  vec3 wp = wpos + N * (0.05 + 0.25 * (1.0 - ndl)) * (1.0 + dist * 0.004);
  vec4 c = uShadowVP * vec4(wp, 1.0);
  vec3 sc = c.xyz / c.w * 0.5 + 0.5;
  float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  mat2 rot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
  float s = 1.0, wn = 0.0;
  if (sc.x > 0.0 && sc.y > 0.0 && sc.x < 1.0 && sc.y < 1.0 && sc.z < 1.0) {
    float r = uShadowP.y * (1.4 + dist * 0.01);
    s = 0.0;
    for (int i = 0; i < 12; i++) s += texture(uShadowMap, vec3(sc.xy + rot * POISSON[i] * r, sc.z - uShadowP.w));
    s /= 12.0;
    vec2 e = min(sc.xy, 1.0 - sc.xy);
    wn = smoothstep(0.0, 0.1, min(e.x, e.y));
    if (wn >= 1.0) return s;
  }
  // far cascade (4 taps), blended in towards the edge of the detailed map and faded out at its own edge
  vec4 c2 = uShadowVP2 * vec4(wpos + N * uShadowP2.z, 1.0);
  vec3 s2 = c2.xyz / c2.w * 0.5 + 0.5;
  float f = 1.0;
  if (s2.x > 0.0 && s2.y > 0.0 && s2.x < 1.0 && s2.y < 1.0 && s2.z < 1.0) {
    float r2 = uShadowP2.x * 1.5;
    f = 0.0;
    for (int i = 0; i < 4; i++) f += texture(uShadowMap2, vec3(s2.xy + rot * POISSON[i * 3] * r2, s2.z - uShadowP2.y));
    f *= 0.25;
    vec2 e2 = min(s2.xy, 1.0 - s2.xy);
    f = mix(1.0, f, smoothstep(0.0, 0.08, min(e2.x, e2.y)));
  }
  return mix(f, s, wn);
}

// motion-blur weight written to the scene's alpha: forward motion streaks near things, not far ones
float blurW(vec3 wpos){ return clamp(20.0 / max(length(wpos - uCamPos), 1.0), 0.0, 1.0); }

vec3 fogApply(vec3 col, vec3 wpos){
  vec3 v = wpos - uCamPos;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float hgt = max(0.0, wpos.y - uFog.z);
  float dens = uFog.x * exp(-hgt * uFog.y);
  float f = 1.0 - exp(-dist * dens);
  f = min(f, uFog.w);
  // in-scattered sunlight is concentrated close around the sun; a wide glow would wash out (and seem to light)
  // anything standing between the camera and a low sun
  float sunA = pow(max(dot(dir, uSunDir), 0.0), 24.0);
  vec3 fc = uFogCol + uFogSun * sunA;
  fc += vec3(0.6,0.65,0.8) * uFlash * 0.6;
  // safety net: a NaN or infinite colour (from a degenerate normal, say) would be spread by bloom and motion blur
  // into a glowing column, so show the fog colour there instead
  if (any(isnan(col)) || any(isinf(col))) col = fc;
  return mix(col, fc, f);
}

vec3 lightSurf(vec3 albedo, vec3 N, vec3 wpos, float rough, float specK, float ao, float shadow){
  vec3 V = normalize(uCamPos - wpos);
  float ndl = max(dot(N, uSunDir), 0.0);
  // real shadows let some scattered sunlight through and get a little more sky fill, as real shade does
  if (ndl > 0.0 && uShadowP.x > 0.5) shadow *= mix(0.2, 1.0, sunShadow(wpos, N, ndl));
  vec3 H = normalize(V + uSunDir);
  float shin = mix(600.0, 6.0, rough);
  float sp = pow(max(dot(N, H), 0.0), shin) * (shin + 8.0) / 25.0 * specK;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5) * ao;
  // the sky is bright on the sun's side and dim opposite it, most of all with a low sun: faces turned away
  // from the sun get less fill light (backlit buildings read as shaded), faces towards it a little more
  vec2 sunH = uSunDir.xz / max(length(uSunDir.xz), 1e-3);
  float toSun = dot(N.xz, sunH) * (1.0 - abs(N.y));
  amb *= 1.0 + toSun * 0.45 * (1.0 - clamp(uSunDir.y * 1.6, 0.0, 1.0));
  amb *= 1.0 + 0.3 * step(0.5, uShadowP.x);
  amb += vec3(0.55, 0.6, 0.85) * uFlash * 1.5;
  vec3 c = albedo * (amb + uSunCol * ndl * shadow) + uSunCol * sp * ndl * shadow;
  c += mix(uAmbBot, uAmbTop, 0.8) * fres * specK * 0.25 * ao;
  for (int i = 0; i < 4; i++) {
    if (i >= uHeadN) break;
    vec3 L = uHead[i].xyz - wpos;
    float d2 = dot(L, L);
    vec3 l = L * inversesqrt(d2);
    float cd = dot(-l, uHeadDir[i].xyz);
    float cone = smoothstep(uHeadDir[i].w, uHeadDir[i].w + 0.16, cd);
    // (no dead zone in front of the lamps beyond the first couple of metres: the car just ahead is lit too)
    float att = uHead[i].w * cone / (1.0 + d2 * 0.006) * smoothstep(0.5, 2.5, sqrt(d2));
    // Headlamps are 0.65 m above the road, so the beam meets the tarmac at a grazing angle and plain
    // Lambert shading leaves the road almost black (at 20 m the cosine is 0.03). Real road surfaces are rough
    // and scatter light back along the beam; a softened cosine stands in for that.
    float nl = pow(max(dot(N, l), 0.0), 0.45);
    vec3 hh = normalize(l + V);
    float hs = pow(max(dot(N, hh), 0.0), shin) * specK * 2.0;
    c += (albedo * nl + hs) * att * vec3(1.0, 0.93, 0.8);
  }
  for (int i = 0; i < 16; i++) {
    if (i >= uPLn) break;
    vec3 L = uPL[i].xyz - wpos;
    float d2 = dot(L, L);
    float r = uPL[i].w;
    float att = max(0.0, 1.0 - d2 / (r * r));
    att *= att;
    vec3 l = L * inversesqrt(max(d2, 1e-4));
    c += albedo * max(dot(N, l), 0.0) * att * uPLc[i].rgb * uPLc[i].a;
  }
  return c;
}
`;
