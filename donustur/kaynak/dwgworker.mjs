// LampOff dönüştürücü: DWG → DXF (GNU LibreDWG, @mlightcad/libredwg-web; GPLv3). Kaynak: kaynak/ klasörü.
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';
import { dwgToDxf } from './dwgdxf.mjs';
let L = null;
self.onmessage = async e => {
  const { buf } = e.data;
  try {
    if (!L) L = await LibreDwg.create('.');
    const d = L.dwg_read_data(buf, Dwg_File_Type.DWG);
    if (!d) throw new Error('DWG okunamadı');
    const db = L.convert(d); try { L.dwg_free(d) } catch {}
    const r = dwgToDxf(db);
    if (!r.stats.ents) throw new Error('Çizimde okunabilir çizgi bulunamadı');
    const u8 = new TextEncoder().encode(r.dxf);
    self.postMessage({ t: 'ok', dxf: u8.buffer, stats: r.stats }, [u8.buffer]);
  } catch (err) {
    self.postMessage({ t: 'err', m: String(err && err.message || err) });
  }
};
