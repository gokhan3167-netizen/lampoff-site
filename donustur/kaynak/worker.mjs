// LampOff dönüştürücü işçisi: SKP / OBJ → hafif renkli GLB (tarayıcıda, dosya hiçbir yere gönderilmez)
import { buildInstancedScene } from './lib/openskp.mjs';
import { skpToLiteGLB } from './skplite.mjs';
import { ObjReader, objToLiteGLB } from './objlite.mjs';
globalThis.__skpNoTex = true;
let last = 0;
const prog = (s, f) => { const n = Date.now(); if (n - last > 250) { last = n; self.postMessage({ t: 'p', s, f }) } };
self.onmessage = async e => {
  const d = e.data;
  try {
    let r;
    if (d.kind === 'skp') {
      prog('read', 0);
      const scene = buildInstancedScene(d.buf, { onProgress: p => p.total && prog('read', Math.min(1, p.current / p.total)) });
      self.postMessage({ t: 'p', s: 'lite', f: 0 });
      r = skpToLiteGLB(scene, { budget: d.budget, name: d.name });
    } else {
      const R = new ObjReader, rd = d.file.stream().getReader(), dec = new TextDecoder(); let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; R.push(dec.decode(value, { stream: true })); prog('read', got / d.file.size) }
      R.push(dec.decode()); R.end();
      self.postMessage({ t: 'p', s: 'lite', f: 0 });
      r = objToLiteGLB(R, { budget: d.budget, name: d.name, mtl: d.mtl, unit: d.unit || null, up: d.up });
    }
    self.postMessage({ t: 'ok', glb: r.glb.buffer, stats: r.stats }, [r.glb.buffer]);
  } catch (err) {
    self.postMessage({ t: 'err', m: String(err && err.message || err) });
  }
};
