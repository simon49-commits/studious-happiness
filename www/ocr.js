/* TaxKeep receipt reader: runs Tesseract OCR on the phone (offline) and pulls out store, date and total. */
(function(){
  let workerPromise = null;
  function getWorker(onProgress){
    if (!workerPromise){
      workerPromise = Tesseract.createWorker('eng', 1, {
        workerPath: 'ocr/worker.min.js',
        corePath: 'ocr/',
        langPath: 'ocr/',
        gzip: false,
        workerBlobURL: false,
        logger: m => { if (window.__ocrProgress && m.status === 'recognizing text') window.__ocrProgress(m.progress); }
      }).catch(e => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  // Shrink big photos and boost contrast so OCR is faster and more accurate.
  async function prepare(dataUrl){
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const max = 1800, s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4){
      let v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      v = Math.max(0, Math.min(255, (v - 128) * 1.5 + 128));
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function validDate(y, m, d){
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (dt > tomorrow) return null;
    return { s: iso(y, m, d), t: dt.getTime() };
  }
  function findDate(text){
    const cands = [];
    let m;
    const reYMD = /\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g;
    while ((m = reYMD.exec(text))){ const v = validDate(+m[1], +m[2], +m[3]); if (v) cands.push(v); }
    const reNum = /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/g;
    while ((m = reNum.exec(text))){
      const a = +m[1], b = +m[2], y = +m[3];
      // Canadian receipts use both MM/DD and DD/MM; keep whichever is a real, non-future date (closest to today wins).
      [validDate(y, a, b), validDate(y, b, a)].forEach(v => v && cands.push(v));
    }
    const reMon = /\b(\d{1,2})?\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?,?\s*(20\d{2}|\d{2})\b/gi;
    while ((m = reMon.exec(text))){
      const mon = MONTHS[m[2].toLowerCase()], day = +(m[1] || m[3]); const v = validDate(+m[4], mon, day); if (v) cands.push(v);
    }
    if (!cands.length) return null;
    cands.sort((x, y) => y.t - x.t);
    return cands[0].s;
  }
  const MONEY = /(?:\$\s?)?(\d{1,5}(?:[,\s]\d{3})*[.,]\d{2})(?!\d)/g;
  const toNum = s => parseFloat(s.replace(/[\s,](?=\d{3}\b)/g, '').replace(',', '.'));
  function findTotal(lines){
    const amountsIn = l => { const out = []; let m; MONEY.lastIndex = 0; while ((m = MONEY.exec(l))) out.push(toNum(m[1])); return out; };
    let best = null;
    lines.forEach((l, i) => {
      if (/sub\s*-?\s*total|savings|you saved|change|tip|points|cash back|tendered/i.test(l)) return;
      if (/\b(grand\s*total|total|amount\s*due|balance\s*due|to\s*pay|montant)\b/i.test(l)){
        let a = amountsIn(l); if (!a.length && lines[i + 1]) a = amountsIn(lines[i + 1]);
        if (a.length){ const v = a[a.length - 1]; if (!best || /grand|due|pay/i.test(l) || v >= best) best = v; }
      }
    });
    if (best !== null) return best;
    const all = lines.flatMap(amountsIn).filter(v => v < 100000);
    return all.length ? Math.max(...all) : null;
  }
  function findVendor(lines){
    for (const l of lines.slice(0, 6)){
      const t = l.replace(/[^A-Za-z0-9&'.\- ]/g, ' ').replace(/\s+/g, ' ').trim();
      const letters = (t.match(/[A-Za-z]/g) || []).length;
      if (letters < 3 || letters < t.length * 0.6) continue;
      if (/receipt|welcome|invoice|tel|phone|www|http|store\s*#/i.test(t)) continue;
      return t.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).slice(0, 40);
    }
    return '';
  }
  const CAT_RULES = [
    [/pharm|drug ?mart|rexall|london drugs|jean coutu|dental|dentist|clinic|optical|optometr|specsavers|physio|chiro|massage|medical|hospital|lab\b|vision/i, 'medical'],
    [/daycare|day care|child ?care|montessori|camp\b|preschool/i, 'childcare'],
    [/donation|charit|foundation|church|mosque|temple|harvest|united way|red cross/i, 'donations'],
    [/universit|college|tuition|school of/i, 'tuition'],
    [/union|association dues|professional dues/i, 'dues'],
    [/movers|moving|u-?haul/i, 'moving'],
    [/petro|esso|shell|husky|co-?op gas|chevron|ultramar|fuel|gas bar|car wash|tire|auto/i, 'b_vehicle'],
    [/staples|office depot|grand & toy|printing/i, 'b_office'],
    [/restaurant|cafe|coffee|tim horton|starbucks|pizza|grill|bistro|diner|mcdonald|subway|a&w/i, 'b_meals'],
    [/bell\b|rogers|telus|fido|koodo|virgin|freedom mobile|shaw|internet/i, 'b_phone'],
    [/home depot|rona|lowe'?s|canadian tire|princess auto/i, 'b_supplies'],
    [/parking|impark|easypark|toll\b|407 etr/i, 'b_vehicle'],
    [/adobe|google \*?workspace|microsoft ?365|zoom\.us|canva|quickbooks|intuit/i, 'b_other'],
    [/insurance|intact|wawanesa|desjardins ins|mpi\b|autopac/i, 'b_ins'],
  ];
  function guessCategory(text, selfEmployed){
    for (const [re, cat] of CAT_RULES){
      if (re.test(text)){ if (cat.startsWith('b_') && !selfEmployed) return null; return cat; }
    }
    return null;
  }
  function parseReceipt(text, selfEmployed){
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const vendor = findVendor(lines);
    return { vendor, date: findDate(text), total: findTotal(lines), category: guessCategory(vendor + '\n' + text, selfEmployed), text };
  }
  async function readReceipt(dataUrl, selfEmployed){
    if (!window.Tesseract) throw new Error('Reader not loaded');
    const [w, canvas] = await Promise.all([getWorker(), prepare(dataUrl)]);
    const { data } = await w.recognize(canvas);
    return parseReceipt(data.text || '', selfEmployed);
  }
  async function readText(dataUrl){
    if (!window.Tesseract) throw new Error('Reader not loaded');
    const [w, canvas] = await Promise.all([getWorker(), prepare(dataUrl)]);
    // Slips are grids of boxes: sparse-text mode finds the numbers inside them.
    await w.setParameters({ tessedit_pageseg_mode: '11' });
    try { const { data } = await w.recognize(canvas); return data.text || ''; }
    finally { await w.setParameters({ tessedit_pageseg_mode: '3' }).catch(() => {}); }
  }
  window.TaxKeepOCR = { readReceipt, parseReceipt, readText, guessCategory, warmUp: () => getWorker().catch(() => null) };
})();
