import { writeGLB } from './glbw.mjs';
// LampOff — SketchUp sahnesini (OpenSKP buildInstancedScene çıktısı) telefona uygun hafif, renkli GLB'ye çevirir.
// Tarayıcıda ve Node'da çalışır; dış bağımlılık yok.
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o };
const det3 = m => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);

// Bir parçanın (mesh kaynağı) yerel uzayda, verilen hücre boyuyla kümelenmiş hâli
function clusterRes(R, cell) {
  const map = new Map, sx = [], sy = [], sz = [], sn = [], vm = [], out = [];
  let pi = 0;
  for (const p of R.primitives) {
    pi++; const P = p.positions, I = p.indices, mi = p.materialIndex ?? 0, nv = P.length / 3;
    const id = new Int32Array(nv);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const k = cell > 0 ? `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)},${mi}` : `${pi}:${v}`;
      let q = map.get(k); if (q === undefined) { q = sn.length; map.set(k, q); sx.push(0); sy.push(0); sz.push(0); sn.push(0); vm.push(mi) }
      sx[q] += x; sy[q] += y; sz[q] += z; sn[q]++; id[v] = q;
    }
    const n = I ? I.length : nv;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = id[I ? I[t] : t], b = id[I ? I[t + 1] : t + 1], c = id[I ? I[t + 2] : t + 2];
      if (a !== b && b !== c && a !== c) out.push(a, b, c);
    }
  }
  const nv = sn.length, pos = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) { pos[v * 3] = sx[v] / sn[v]; pos[v * 3 + 1] = sy[v] / sn[v]; pos[v * 3 + 2] = sz[v] / sn[v] }
  return { pos, idx: Uint32Array.from(out), vm: Int32Array.from(vm), nt: out.length / 3 };
}

export function skpToLiteGLB(scene, opt = {}) {
  const budget = opt.budget || 250000, log = opt.log || (() => {});
  const res = new Map(scene.meshResources.map(r => [r.id, r]));
  // 1) yerleşimler: her parça için dünya matrisleri
  const inst = new Map;
  const hid = scene.layerHidden || {};
  const walk = (node, parent) => {
    if (node !== scene.sceneHierarchy && hid[node.ownLayer || node.layer]) return; // gizli katmandaki grup / bileşen alınmaz
    const w = mul(parent, node.matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    if (node.meshResourceId != null && res.has(node.meshResourceId)) { if (!inst.has(node.meshResourceId)) inst.set(node.meshResourceId, []); inst.get(node.meshResourceId).push(w) }
    for (const c of node.children || []) walk(c, w);
  };
  walk(scene.sceneHierarchy, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let rawTri = 0; const items = [];
  for (const [id, L] of inst) {
    const R = res.get(id); let t = 0; for (const p of R.primitives) t += (p.indices ? p.indices.length : p.positions.length / 3) / 3;
    const sc = Math.cbrt(Math.abs(det3(L[0]))) || 1;
    items.push({ R, L, t, sc }); rawTri += t * L.length;
  }
  log(`ham: ${rawTri} üçgen, ${items.length} benzersiz parça, ${[...inst.values()].reduce((a, l) => a + l.length, 0)} yerleşim`);
  // 2) bütçeye inene kadar hücreyi büyüt (dünya ölçüsünde aynı hücre, parçanın kendi ölçeğine göre)
  let cell = 0, sim = null, total = 0;
  for (const c of [0, .005, .01, .02, .03, .04, .05, .06, .08, .12, .2, .35]) {
    sim = items.map(it => clusterRes(it.R, c / it.sc));
    total = sim.reduce((a, s, i) => a + s.nt * items[i].L.length, 0); cell = c;
    log(`hücre ${c * 100} cm → ${total} üçgen`);
    if (total <= budget) break;
  }
  // 3) yerleşimleri uygula, malzemeye göre topla
  const mats = scene.gltfMaterials || [], buckets = new Map;
  const bucket = mi => { let b = buckets.get(mi); if (!b) { b = { p: [], i: [], n: 0 }; buckets.set(mi, b) } return b };
  sim.forEach((S, k) => {
    for (const w of items[k].L) {
      const flip = det3(w) < 0, base = new Map;
      for (let t = 0; t < S.nt; t++) {
        const tri = [S.idx[t * 3], S.idx[t * 3 + 1], S.idx[t * 3 + 2]], mi = S.vm[tri[0]], B = bucket(mi);
        if (flip) { const q = tri[1]; tri[1] = tri[2]; tri[2] = q }
        for (const v of tri) {
          const key = mi * 1e9 + v; let o = base.get(key);
          if (o === undefined) {
            const x = S.pos[v * 3], y = S.pos[v * 3 + 1], z = S.pos[v * 3 + 2];
            B.p.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]);
            o = B.n++; base.set(key, o);
          }
          B.i.push(o);
        }
      }
    }
  });
  // 4) GLB yaz
  const prims = [];
  for (const [mi, B] of buckets) { const src = mats[mi] && mats[mi].pbrMetallicRoughness && mats[mi].pbrMetallicRoughness.baseColorFactor || [.67, .67, .67, 1]; prims.push({ pos: Float32Array.from(B.p), idx: B.i, srgb: src }) }
  const glb = writeGLB(prims, opt.name);
  return { glb, stats: { rawTri, tri: total, cell, parts: items.length, mats: prims.length, bytes: glb.length } };
}
