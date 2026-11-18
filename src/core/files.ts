import { dateFa, fa } from './model';
import type { Report } from './reports';
export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
export async function saveFile(blob: Blob, name: string, picker = false) {
  if (picker && 'showSaveFilePicker' in window) {
    try {
      const h = await (window as any).showSaveFilePicker({ suggestedName: name });
      const out = await h.createWritable();
      await out.write(blob);
      await out.close();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      if ((e as Error).name !== 'SecurityError') throw e;
    }
  }
  download(blob, name);
  return true;
}
export async function shareFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'دانه‌حساب' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e;
    }
  } else download(blob, name);
}
export function csv(r: Report) {
  const esc = (v: string) =>
    '"' + (/^[=+@\-\t\r]/.test(v) ? "'" : '') + String(v).replace(/"/g, '""') + '"';
  download(
    new Blob(
      ['\uFEFF' + [r.columns, ...r.rows].map((row) => row.map(esc).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' },
    ),
    r.title + '.csv',
  );
}
export type PrintData = Report & {
  business?: string;
  logo?: string;
  details?: string[];
  totals?: string[];
  signatures?: { name: string; data: string }[];
};
// Native canvas shapes Persian glyphs with the bundled font. Paginate before rasterizing each A4 sheet.
export async function makePDF(data: PrintData) {
  const { jsPDF } = await import('jspdf');
  await document.fonts.ready;
  await document.fonts.load('24px "Vazirmatn Variable"', 'دانه حساب');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true }),
    W = 1240,
    H = 1754,
    M = 68;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  let y = 0,
    page = 0;
  const font = (size = 22, bold = false) => {
    c.font = `${bold ? '700' : '400'} ${size}px "Vazirmatn Variable",sans-serif`;
    c.direction = 'rtl';
    c.textAlign = 'right';
    c.textBaseline = 'middle';
  };
  const text = (s: string, x: number, yy: number, w: number, color = '#223b40') => {
    c.fillStyle = color;
    c.fillText(s, x, yy, w);
  };
  const image = async (src: string) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    return im;
  };
  const logo = await image(data.logo || '/icons/192.png');
  const start = () => {
    page++;
    c.fillStyle = 'white';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#123e40';
    c.fillRect(0, 0, W, 170);
    c.drawImage(logo, W - M - 72, 53, 65, 65);
    font(34, true);
    text(data.business || 'دانه‌حساب', W - M - 90, 72, W - 300, '#fff');
    font(23);
    text(data.title, W - M - 90, 121, W - 230, '#c6e6df');
    y = 225;
  };
  const finish = () => {
    font(19);
    text('دانه‌حساب   •   صفحه ' + fa(page), W - M, H - 45, 600, '#75868c');
    c.textAlign = 'left';
    text(dateFa(Date.now()), M, H - 45, 360, '#75868c');
    if (page > 1) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.91), 'JPEG', 0, 0, 210, 297);
  };
  const need = (space: number, header = false) => {
    if (y + space > H - 100) {
      finish();
      start();
      if (header) tableHead();
    }
  };
  const wrap = (s: string, w: number) => {
    const parts: string[] = [];
    let line = '';
    for (const word of s.split(/\s+/)) {
      if (line && c.measureText(line + ' ' + word).width > w) {
        parts.push(line);
        line = word;
      } else line += (line ? ' ' : '') + word;
    }
    parts.push(line);
    return parts;
  };
  const notes = (s: string) => {
    font();
    for (const l of wrap(s, W - 2 * M)) {
      need(45);
      font();
      text(l, W - M, y, W - 2 * M);
      y += 42;
    }
  };
  const col = (W - 2 * M) / data.columns.length;
  const tableHead = () => {
    c.fillStyle = '#dceee9';
    c.fillRect(M, y, W - 2 * M, 55);
    font(21, true);
    data.columns.forEach((h, i) => text(h, W - M - i * col - 12, y + 27, col - 24));
    y += 55;
  };
  start();
  for (const s of data.details || []) notes(s);
  y += 16;
  tableHead();
  for (let k = 0; k < data.rows.length; k++) {
    font(21);
    const cells = data.rows[k].map((s) => wrap(s, col - 24)),
      height = Math.max(...cells.map((a) => a.length)) * 33 + 23;
    need(height, true);
    c.fillStyle = k % 2 ? '#f4f7f6' : 'white';
    c.fillRect(M, y, W - 2 * M, height);
    font(21);
    cells.forEach((lines, i) =>
      lines.forEach((s, j) => text(s, W - M - i * col - 12, y + 27 + j * 33, col - 24)),
    );
    y += height;
  }
  y += 30;
  for (const s of data.totals || []) notes(s);
  if (data.signatures?.length) {
    need(210);
    for (const [i, sg] of data.signatures.entries()) {
      const img = await image(sg.data);
      const x = W - M - (i * (W - 2 * M)) / 2;
      font(22, true);
      text(sg.name === 'buyer' ? 'امضای خریدار' : 'امضای فروشنده', x, y + 30, 320);
      c.drawImage(img, x - 230, y + 58, 220, 105);
    }
  }
  finish();
  return pdf.output('blob');
}
