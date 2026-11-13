// Ortak GLB yazıcı: malzeme başına bir primitive. srgb renk 0–1, glTF kuralıyla doğrusala çevrilir.
const s2l = v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
export function writeGLB(prims, name) {
  const views = [], accs = [], out = [], gm = [], chunks = []; let off = 0;
  const add = (arr, target) => { const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); chunks.push(u8); const pad = (4 - u8.length % 4) % 4; if (pad) chunks.push(new Uint8Array(pad)); views.push({ buffer: 0, byteOffset: off, byteLength: u8.length, target }); off += u8.length + pad; return views.length - 1 };
  for (const pr of prims) {
    if (!pr.idx.length) continue;
    const P = pr.pos, nv = P.length / 3, I = nv > 65535 ? Uint32Array.from(pr.idx) : Uint16Array.from(pr.idx);
    const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
    for (let j = 0; j < P.length; j += 3) for (let a = 0; a < 3; a++) { const v = P[j + a]; v < mn[a] && (mn[a] = v); v > mx[a] && (mx[a] = v) }
    const pv = add(P, 34962), iv = add(I, 34963);
    accs.push({ bufferView: pv, componentType: 5126, count: nv, type: "VEC3", min: mn, max: mx });
    accs.push({ bufferView: iv, componentType: I instanceof Uint32Array ? 5125 : 5123, count: I.length, type: "SCALAR" });
    const c = pr.srgb;
    gm.push({ pbrMetallicRoughness: { baseColorFactor: [s2l(c[0]), s2l(c[1]), s2l(c[2]), c[3] ?? 1], metallicFactor: 0, roughnessFactor: .8 }, doubleSided: true });
    out.push({ attributes: { POSITION: accs.length - 2 }, indices: accs.length - 1, material: gm.length - 1 });
  }
  const json = { asset: { version: "2.0", generator: "LampOff dönüştürücü" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: name || "model" }], meshes: [{ primitives: out }], materials: gm, accessors: accs, bufferViews: views, buffers: [{ byteLength: off }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - js.length % 4) % 4;
  if (jp) { const t = new Uint8Array(js.length + jp); t.set(js); t.fill(32, js.length); js = t }
  const glb = new Uint8Array(12 + 8 + js.length + 8 + off), dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546C67, !0); dv.setUint32(4, 2, !0); dv.setUint32(8, glb.length, !0);
  dv.setUint32(12, js.length, !0); dv.setUint32(16, 0x4E4F534A, !0); glb.set(js, 20);
  let o = 20 + js.length; dv.setUint32(o, off, !0); dv.setUint32(o + 4, 0x004E4942, !0); o += 8;
  for (const c of chunks) { glb.set(c, o); o += c.length }
  return glb;
}
