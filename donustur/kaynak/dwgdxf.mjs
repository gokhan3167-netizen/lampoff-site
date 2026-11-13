// LampOff — LibreDWG (libredwg-web) çıktısını sade bir DXF'e yazar: model alanı, bloklar açılmış,
// eğriler çoklu çizgiye çevrilmiş (LINE / LWPOLYLINE / TEXT). LampOff mobil bu DXF'i altlık yapar.
const I = [1, 0, 0, 1, 0, 0];
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const ap = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const segs = sw => Math.max(4, Math.min(256, Math.ceil(Math.abs(sw) / (Math.PI / 36))));

export function dwgToDxf(db) {
  const out = [], layers = new Map, blocks = new Map; let n = 0, skipped = {};
  for (const l of (db.tables.LAYER && db.tables.LAYER.entries) || []) layers.set(l.name, { c: l.colorIndex || 7, off: !!(l.off || l.frozen) });
  let ms = null;
  for (const b of (db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || []) { blocks.set(b.name, b); if (/^\*model_space$/i.test(b.name)) ms = b }
  const P = v => (+v).toFixed(4).replace(/\.?0+$/, '') || '0';
  const pl = (lay, M, pts, closed) => { // pts: düz [x,y,…] yerel → dünya
    if (pts.length < 4) return; const w = []; for (let j = 0; j < pts.length; j += 2) { const q = ap(M, pts[j], pts[j + 1]); w.push(q[0], q[1]) }
    if (w.length === 4) { out.push(`0\nLINE\n8\n${lay}\n10\n${P(w[0])}\n20\n${P(w[1])}\n30\n0\n11\n${P(w[2])}\n21\n${P(w[3])}\n31\n0`); n++; return }
    let s = `0\nLWPOLYLINE\n8\n${lay}\n90\n${w.length / 2}\n70\n${closed ? 1 : 0}`; for (let j = 0; j < w.length; j += 2) s += `\n10\n${P(w[j])}\n20\n${P(w[j + 1])}`; out.push(s); n++;
  };
  const txt = (lay, M, x, y, h, rot, t) => {
    if (!t || !(h > 0)) return; const q = ap(M, x, y), sc = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1, r = rot + Math.atan2(M[1], M[0]);
    const clean = String(t).replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ').replace(/[\r\n]+/g, ' ').trim(); if (!clean) return;
    out.push(`0\nTEXT\n8\n${lay}\n10\n${P(q[0])}\n20\n${P(q[1])}\n30\n0\n40\n${P(h * sc)}\n1\n${clean}\n50\n${P(r * 180 / Math.PI)}`); n++;
  };
  const arcPts = (cx, cy, r, a0, a1) => { while (a1 <= a0) a1 += 2 * Math.PI; const k = segs(a1 - a0), p = []; for (let s = 0; s <= k; s++) { const a = a0 + (a1 - a0) * s / k; p.push(cx + r * Math.cos(a), cy + r * Math.sin(a)) } return p };
  const bulge = (v, closed) => { const p = [v[0].x, v[0].y], N = v.length; for (let j = 1; j < N + (closed ? 1 : 0); j++) { const a = v[j - 1], b = v[j % N], bg = a.bulge || 0; if (!bg) { p.push(b.x, b.y); continue } const th = 4 * Math.atan(bg), dx = b.x - a.x, dy = b.y - a.y, c = Math.hypot(dx, dy); if (c < 1e-12) continue; const r = c / (2 * Math.sin(th / 2)), h = r * Math.cos(th / 2), cx = (a.x + b.x) / 2 - dy / c * h, cy = (a.y + b.y) / 2 + dx / c * h, a0 = Math.atan2(a.y - cy, a.x - cx), k = segs(th); for (let s = 1; s <= k; s++) { const t = a0 + th * s / k; p.push(cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)) } p[p.length - 2] = b.x; p[p.length - 1] = b.y } return p };
  const ocs = (e, M) => e.extrusionDirection && e.extrusionDirection.z < 0 ? mul(M, [-1, 0, 0, 1, 0, 0]) : M;
  const spline = e => {
    const cp = e.controlPoints || [], kn = e.knots || [], deg = e.degree || 3, p = [];
    if (cp.length > deg && kn.length === cp.length + deg + 1) {
      const a = kn[deg], b = kn[cp.length], k = Math.min(400, Math.max(8, cp.length * 8));
      for (let s = 0; s <= k; s++) { let u = a + (b - a) * s / k; if (s === k) u = b - 1e-9 * (b - a || 1); let j = deg; while (j < cp.length - 1 && u >= kn[j + 1]) j++; const d = []; for (let q = 0; q <= deg; q++) d.push([cp[j - deg + q].x, cp[j - deg + q].y]); for (let r = 1; r <= deg; r++) for (let q = deg; q >= r; q--) { const i = j - deg + q, den = kn[i + deg - r + 1] - kn[i], al = den ? (u - kn[i]) / den : 0; d[q][0] = (1 - al) * d[q - 1][0] + al * d[q][0]; d[q][1] = (1 - al) * d[q - 1][1] + al * d[q][1] } p.push(d[deg][0], d[deg][1]) }
      return p;
    }
    const f = e.fitPoints || []; if (f.length < 2) return p; // Catmull-Rom ile uyum noktalarından
    for (let i = 0; i < f.length - 1; i++) { const p0 = f[Math.max(0, i - 1)], p1 = f[i], p2 = f[i + 1], p3 = f[Math.min(f.length - 1, i + 2)]; for (let s = 0; s < 8; s++) { const t = s / 8, t2 = t * t, t3 = t2 * t; p.push(.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3), .5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)) } }
    p.push(f[f.length - 1].x, f[f.length - 1].y); return p;
  };
  function list(E, M, inh, dep) {
    if (dep > 12) return;
    for (const e of E || []) {
      if (n > 1.5e6) return;
      let lay = e.layer || '0'; if (lay === '0' && inh) lay = inh; if (!layers.has(lay)) layers.set(lay, { c: 7, off: false });
      if (e.isVisible === false) continue;
      const t = e.type, Mo = ocs(e, M);
      try {
        if (t === 'LINE') pl(lay, M, [e.startPoint.x, e.startPoint.y, e.endPoint.x, e.endPoint.y]);
        else if (t === 'LWPOLYLINE' || t === 'POLYLINE2D') { const v = e.vertices || []; if (v.length > 1) pl(lay, Mo, bulge(v, (e.flag & 1) === 1), (e.flag & 1) === 1) }
        else if (t === 'POLYLINE3D') { const v = e.vertices || [], p = []; for (const q of v) p.push(q.x, q.y); if ((e.flag & 1) && v.length) p.push(v[0].x, v[0].y); pl(lay, M, p) }
        else if (t === 'CIRCLE') pl(lay, Mo, arcPts(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI), true);
        else if (t === 'ARC') pl(lay, Mo, arcPts(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle));
        else if (t === 'ELLIPSE') { const c = e.center, m = e.majorAxisEndPoint, ra = e.axisRatio; let p0 = e.startAngle || 0, p1 = e.endAngle ?? 2 * Math.PI; while (p1 <= p0) p1 += 2 * Math.PI; const k = segs(p1 - p0), p = []; for (let s = 0; s <= k; s++) { const a = p0 + (p1 - p0) * s / k, co = Math.cos(a), si = Math.sin(a); p.push(c.x + m.x * co - m.y * ra * si, c.y + m.y * co + m.x * ra * si) } pl(lay, Mo, p, Math.abs(p1 - p0 - 2 * Math.PI) < 1e-6) }
        else if (t === 'SPLINE') pl(lay, M, spline(e));
        else if (t === 'SOLID' || t === '3DFACE' || t === 'TRACE') { const c = [e.corner1, e.corner2, t === 'SOLID' || t === 'TRACE' ? e.corner4 : e.corner3, t === 'SOLID' || t === 'TRACE' ? e.corner3 : e.corner4].filter(Boolean), p = []; for (const q of c) p.push(q.x, q.y); pl(lay, t === '3DFACE' ? M : Mo, p, true) }
        else if (t === 'TEXT') txt(lay, Mo, e.startPoint.x, e.startPoint.y, e.textHeight, e.rotation || 0, e.text);
        else if (t === 'MTEXT') txt(lay, M, e.insertionPoint.x, e.insertionPoint.y, e.textHeight, e.rotation || Math.atan2((e.direction || {}).y || 0, (e.direction || {}).x || 1), e.text);
        else if (t === 'INSERT' || t === 'DIMENSION') {
          const b = blocks.get(e.name); if (!b || !b.entities) { skipped[t + ' (blok yok)'] = (skipped[t + ' (blok yok)'] || 0) + 1; continue }
          let L = I;
          if (t === 'INSERT') { const r = e.rotation || 0, sx = e.xScale || 1, sy = e.yScale || 1, bp = b.basePoint || { x: 0, y: 0 }; L = mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), e.insertionPoint.x, e.insertionPoint.y], [sx, 0, 0, sy, -sx * bp.x, -sy * bp.y]) }
          const cols = Math.max(1, e.columnCount || 1), rows = Math.max(1, e.rowCount || 1);
          for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) { const off = (ci || ri) ? [1, 0, 0, 1, ci * (e.columnSpacing || 0), ri * (e.rowSpacing || 0)] : I; list(b.entities, mul(Mo, mul(L, off)), lay, dep + 1) }
          if (t === 'INSERT') for (const a of e.attribs || []) { const tx = a.text || {}; if (tx.text && tx.startPoint) txt(lay, Mo, tx.startPoint.x, tx.startPoint.y, tx.textHeight, tx.rotation || 0, tx.text) }
        }
        else skipped[t] = (skipped[t] || 0) + 1;
      } catch { skipped[t + ' (okunamadı)'] = (skipped[t + ' (okunamadı)'] || 0) + 1 }
    }
  }
  const msEnts = ms && ms.entities ? ms.entities : (db.entities || []).filter(e => !ms || e.ownerBlockRecordSoftId === ms.handle);
  list(msEnts, I, null, 0);
  const units = db.header && db.header.INSUNITS || 0;
  let s = `999\nLampOff dönüştürücü (DWG → DXF)\n0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n${units}\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.size}`;
  for (const [nm, l] of layers) s += `\n0\nLAYER\n2\n${nm}\n70\n0\n62\n${l.off ? -Math.abs(l.c || 7) : Math.abs(l.c || 7)}\n6\nCONTINUOUS`;
  s += `\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n` + out.join('\n') + `\n0\nENDSEC\n0\nEOF\n`;
  return { dxf: s, stats: { ents: n, layers: layers.size, units, skipped } };
}
