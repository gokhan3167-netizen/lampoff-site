// LampOff — büyük OBJ'yi (isteğe bağlı .mtl ile) akış hâlinde okuyup telefona uygun hafif, renkli GLB'ye çevirir.
import { writeGLB } from './glbw.mjs';

export class ObjReader {
  constructor() { this.V = new Float32Array(3 << 16); this.nv = 0; this.F = new Uint32Array(3 << 16); this.TM = new Uint16Array(1 << 16); this.nt = 0; this.mats = []; this.mi = new Map; this.cm = 0; this.carry = ''; this.mats.push(''); this.mi.set('', 0); this.mtllib = [] }
  _gv(n) { if (n > this.V.length) { const a = new Float32Array(Math.max(n, this.V.length * 2)); a.set(this.V); this.V = a } }
  _gf(n) { if (n * 3 > this.F.length) { const a = new Uint32Array(Math.max(n * 3, this.F.length * 2)); a.set(this.F); this.F = a; const b = new Uint16Array(this.F.length / 3); b.set(this.TM); this.TM = b } }
  push(text) {
    const s = this.carry + text, L = s.split('\n'); this.carry = L.pop();
    for (const ln of L) this.line(ln);
  }
  end() { if (this.carry) this.line(this.carry); this.carry = '' }
  line(ln) {
    const c0 = ln.charCodeAt(0), c1 = ln.charCodeAt(1);
    if (c0 === 118 && (c1 === 32 || c1 === 9)) { // v
      const a = ln.trim().split(/\s+/); this._gv(this.nv * 3 + 3);
      this.V[this.nv * 3] = +a[1]; this.V[this.nv * 3 + 1] = +a[2]; this.V[this.nv * 3 + 2] = +a[3]; this.nv++;
    } else if (c0 === 102 && (c1 === 32 || c1 === 9)) { // f
      const a = ln.trim().split(/\s+/), n = a.length - 1, ix = new Array(n);
      for (let k = 0; k < n; k++) { let v = parseInt(a[k + 1], 10); v = v < 0 ? this.nv + v : v - 1; ix[k] = v }
      for (let k = 1; k + 1 < n; k++) {
        if (ix[0] < 0 || ix[k] < 0 || ix[k + 1] < 0 || ix[0] >= this.nv || ix[k] >= this.nv || ix[k + 1] >= this.nv) continue;
        this._gf(this.nt + 1); this.F[this.nt * 3] = ix[0]; this.F[this.nt * 3 + 1] = ix[k]; this.F[this.nt * 3 + 2] = ix[k + 1]; this.TM[this.nt] = this.cm; this.nt++;
      }
    } else if (c0 === 117 && ln.startsWith('usemtl')) {
      const n = ln.slice(6).trim(); let m = this.mi.get(n); if (m === undefined) { m = this.mats.length; this.mats.push(n); this.mi.set(n, m) } this.cm = Math.min(m, 65535);
    } else if (c0 === 109 && ln.startsWith('mtllib')) this.mtllib.push(ln.slice(6).trim());
  }
}

export function mtlColors(txt) { const o = {}; let cur = null; for (const ln of String(txt || '').split(/\r?\n/)) { const a = ln.trim().split(/\s+/); if (a[0] === 'newmtl') cur = a.slice(1).join(' '); else if (a[0] === 'Kd' && cur != null) { const c = [+a[1], +a[2], +a[3]]; if (c.every(v => isFinite(v))) o[cur] = c } } return o }
function nameCol(n) { const s = String(n || '').toLowerCase(); const K = [[/grass|moss|leaf|leaves|plant|planta|tree|green|yaprak|bitki|agac|ağaç|çim|buxus|cypress|topiary|pinus|bamb|fern|ivy|epiprem|hedera|vegetat|foliage|palm/, [72, 108, 60]], [/pink|rose|hydrang|coral|pembe/, [214, 150, 165]], [/wood|ahşap|ahsap|oak|pine|walnut|teak|mdf|parke|ceviz/, [140, 100, 66]], [/metal|steel|chrome|alumin|bronze|brass|gold|silver/, [160, 160, 166]], [/glass|cam|transparent/, [185, 205, 215]], [/black|siyah/, [40, 40, 44]], [/white|beyaz|cream/, [228, 225, 218]], [/red|kırmızı|bordo/, [160, 45, 42]], [/blue|mavi|navy/, [60, 88, 150]], [/yellow|sarı|mustard/, [214, 184, 72]], [/brick|tuğla|terracotta/, [160, 92, 72]], [/fabric|velvet|leather|deri|kumaş|sofa|chesterfield/, [112, 62, 56]], [/concrete|beton|stone|marble|mermer|grey|gray|gri/, [150, 150, 148]]]; for (const [r, c] of K) if (r.test(s)) return c.map(v => v / 255); let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const g = 150 + h % 60; return [g / 255, (g - (h >> 8) % 18) / 255, (g - (h >> 16) % 28) / 255] }

// Ortadan dışa: büyük boşlukla ayrılmış uzak parçaları atmak için eksen başına aralık
function coreRange(a, minGap) { a.sort((x, y) => x - y); const n = a.length, q = f => a[Math.min(n - 1, Math.max(0, Math.floor(n * f)))], G = Math.max((q(.95) - q(.05)) * .5, minGap); let i = n >> 1, j = i; while (j < n - 1 && a[j + 1] - a[j] <= G) j++; while (i > 0 && a[i] - a[i - 1] <= G) i--; const m = Math.max((a[j] - a[i]) * .02, minGap / 100); return [a[i] - m, a[j] + m] }

export function objToLiteGLB(R, opt = {}) {
  const budget = opt.budget || 250000, log = opt.log || (() => {}), up = opt.up || 'y';
  const { V, F, TM, nt, nv } = R; if (!nt) throw new Error('Modelde yüzey bulunamadı');
  // 1) uzak parçalar (ağırlık merkezi örneğiyle)
  const st = Math.max(1, Math.floor(nt / 200000)), cs = [[], [], []];
  for (let t = 0; t < nt; t += st) for (let k = 0; k < 3; k++) cs[k].push((V[F[t * 3] * 3 + k] + V[F[t * 3 + 1] * 3 + k] + V[F[t * 3 + 2] * 3 + k]) / 3);
  // birim: kaba ölçüyle tahmin (uygulamayla aynı kural)
  const raw = cs.map(a => coreRange(a.slice(), 0)), D0 = Math.max(raw[0][1] - raw[0][0], raw[1][1] - raw[1][0], raw[2][1] - raw[2][0]);
  const u = opt.unit || (D0 > 3000 ? .001 : D0 > 300 ? .01 : 1);
  const RG = cs.map(a => coreRange(a, 5 / u));
  const keep = new Uint8Array(nt); let drop = 0;
  for (let t = 0; t < nt; t++) { let ok = true; for (let k = 0; k < 3 && ok; k++) { const c = (V[F[t * 3] * 3 + k] + V[F[t * 3 + 1] * 3 + k] + V[F[t * 3 + 2] * 3 + k]) / 3; ok = c >= RG[k][0] && c <= RG[k][1] } ok ? keep[t] = 1 : drop++ }
  const lo = RG.map(r => r[0]);
  log(`${nt} üçgen, ${drop} uzak üçgen atıldı, birim ${u}`);
  // 2) bütçeye inene kadar kümele (köşe + malzeme)
  const nm = R.mats.length; let res = null, cell = 0;
  for (const c of (nt - drop > budget ? [] : [0]).concat([.005, .01, .02, .03, .04, .05, .06, .08, .12, .2, .35])) {
    const cu = c / u, map = new Map, idx = new Uint32Array(nt * 3); let n = 0, cnt = 0; const vk = [];
    const N = c ? RG.map(r => Math.ceil((r[1] - r[0]) / cu) + 2) : null;
    if (c && N[0] * N[1] * N[2] * nm > 9e15) continue;
    for (let t = 0; t < nt; t++) {
      if (!keep[t]) continue; const m = TM[t], tri = [0, 0, 0];
      for (let j = 0; j < 3; j++) {
        const v = F[t * 3 + j];
        const key = c ? ((Math.floor((V[v * 3] - lo[0]) / cu) * N[1] + Math.floor((V[v * 3 + 1] - lo[1]) / cu)) * N[2] + Math.floor((V[v * 3 + 2] - lo[2]) / cu)) * nm + m : v * nm + m;
        let q = map.get(key); if (q === undefined) { q = cnt++; map.set(key, q); vk.push(v, m, 0, 0, 0, 0) } // v, m, sx, sy, sz, n
        vk[q * 6 + 2] += V[v * 3]; vk[q * 6 + 3] += V[v * 3 + 1]; vk[q * 6 + 4] += V[v * 3 + 2]; vk[q * 6 + 5]++;
        tri[j] = q;
      }
      if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) { idx[n * 3] = tri[0]; idx[n * 3 + 1] = tri[1]; idx[n * 3 + 2] = tri[2]; n++ }
    }
    res = { n, idx, vk, cnt }; cell = c; log(`hücre ${c * 100} cm → ${n} üçgen`);
    if (n <= budget) break;
  }
  // 3) metreye çevir, yukarı ekseni glTF'e (Y yukarı) getir, malzemeye göre topla
  const kd = opt.mtl ? mtlColors(opt.mtl) : {}; let hit = 0;
  const cols = R.mats.map(n => kd[n] ? (hit++, kd[n]) : nameCol(n));
  const { n, idx, vk, cnt } = res, P = new Float32Array(cnt * 3);
  for (let q = 0; q < cnt; q++) {
    let x = vk[q * 6 + 2] / vk[q * 6 + 5] * u, y = vk[q * 6 + 3] / vk[q * 6 + 5] * u, z = vk[q * 6 + 4] / vk[q * 6 + 5] * u;
    if (up === 'z') { const t = y; y = z; z = -t } // Z yukarı → Y yukarı
    P[q * 3] = x; P[q * 3 + 1] = y; P[q * 3 + 2] = z;
  }
  const groups = new Map;
  for (let t = 0; t < n; t++) { const m = vk[idx[t * 3] * 6 + 1]; let g = groups.get(m); if (!g) { g = []; groups.set(m, g) } g.push(t) }
  const prims = [];
  for (const [m, L] of groups) {
    const rm = new Map, p = [], ix = [];
    for (const t of L) for (let j = 0; j < 3; j++) { const v = idx[t * 3 + j]; let o = rm.get(v); if (o === undefined) { o = rm.size; rm.set(v, o); p.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) } ix.push(o) }
    prims.push({ pos: Float32Array.from(p), idx: ix, srgb: cols[m] || [.67, .67, .67] });
  }
  const glb = writeGLB(prims, opt.name);
  const B = [[1e30, -1e30], [1e30, -1e30], [1e30, -1e30]]; for (let q = 0; q < cnt * 3; q++) { const k = q % 3, v = P[q]; v < B[k][0] && (B[k][0] = v); v > B[k][1] && (B[k][1] = v) }
  return { glb, stats: { rawTri: nt, tri: n, cell, drop, unit: u, mats: prims.length, mtlHit: hit, mtlTot: R.mats.length - 1, size: B.map(b => b[1] - b[0]), bytes: glb.length } };
}
