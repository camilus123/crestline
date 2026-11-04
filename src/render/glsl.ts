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
  bool wall = side < 0.0 ? flag(p.flags, 8) : flag(p.flags, 16);
  bool cliff = side < 0.0 ? flag(p.flags, 32) : flag(p.flags, 64);
  if (wall && ty == 4) { // mountain rock wall
    float r = smoothstep(0.4, 1.4, off);
    h = r * (2.0 + (off - 0.4) * 2.6) + r * (n2 * 4.0 + n * 10.0) + smoothstep(10.0, 60.0, off) * uTerr2.x;
  }
  if (cliff && ty == 4) {
    float r = smoothstep(1.4, 3.2, off);
    h = -0.1 - r * (off - 1.4) * 3.5 + r * n * 8.0 - smoothstep(12.0, 120.0, off) * uTerr2.y;
  }
  if (ty == 6) { // motorway: embankment then flat land
    h = -0.1 - smoothstep(3.8, 9.0, off) * 2.2 + n * uTerr.x * far;
  }
  return h;
}
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

vec3 fogApply(vec3 col, vec3 wpos){
  vec3 v = wpos - uCamPos;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float hgt = max(0.0, wpos.y - uFog.z);
  float dens = uFog.x * exp(-hgt * uFog.y);
  float f = 1.0 - exp(-dist * dens);
  f = min(f, uFog.w);
  float sunA = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  vec3 fc = uFogCol + uFogSun * sunA;
  fc += vec3(0.6,0.65,0.8) * uFlash * 0.6;
  return mix(col, fc, f);
}

vec3 lightSurf(vec3 albedo, vec3 N, vec3 wpos, float rough, float specK, float ao, float shadow){
  vec3 V = normalize(uCamPos - wpos);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 H = normalize(V + uSunDir);
  float shin = mix(600.0, 6.0, rough);
  float sp = pow(max(dot(N, H), 0.0), shin) * (shin + 8.0) / 25.0 * specK;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5) * ao;
  amb += vec3(0.55, 0.6, 0.85) * uFlash * 1.5;
  vec3 c = albedo * (amb + uSunCol * ndl * shadow) + uSunCol * sp * ndl * shadow;
  c += mix(uAmbBot, uAmbTop, 0.8) * fres * specK * 0.25 * ao;
  for (int i = 0; i < 4; i++) {
    if (i >= uHeadN) break;
    vec3 L = uHead[i].xyz - wpos;
    float d2 = dot(L, L);
    vec3 l = L * inversesqrt(d2);
    float cd = dot(-l, uHeadDir[i].xyz);
    float cone = smoothstep(uHeadDir[i].w, uHeadDir[i].w + 0.12, cd);
    float att = uHead[i].w * cone / (1.0 + d2 * 0.012);
    float nl = max(dot(N, l), 0.0);
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
