/* TaxKeep tax forms: slip definitions (box → T1 line) and preparer worksheets laid out like CRA forms.
   Box and line numbers checked against CRA slip specifications and the T1 / T2125 forms. Organizes records; not a tax return. */
(function(){
  // Each box: [code, label, line or note, kind]. kind 'info' = shown on the slip but not added to a line.
  const SLIP_TYPES = {
    T4:      { name:'T4 – Employment income', boxes:[
      ['14','Employment income','10100'], ['16','Employee CPP contributions','30800'], ['16A','Second CPP contributions (CPP2)','Schedule 8'],
      ['18','Employee EI premiums','31200'], ['20','RPP contributions','20700'], ['22','Income tax deducted','43700'],
      ['44','Union dues','21200'], ['46','Charitable donations','34900'], ['52','Pension adjustment','20600','info'] ] },
    T4A:     { name:'T4A – Pension, retirement, annuity and other income', boxes:[
      ['016','Pension or superannuation','11500'], ['018','Lump-sum payments','13000'], ['020','Self-employed commissions','T2125'],
      ['022','Income tax deducted','43700'], ['024','Annuities','11500 or 13000'], ['028','Other income','13000'],
      ['048','Fees for services','T2125'], ['105','Scholarships, bursaries','13010'] ] },
    T4E:     { name:'T4E – Employment Insurance benefits', boxes:[ ['14','Total benefits paid','11900'], ['22','Income tax deducted','43700'] ] },
    T4AP:    { name:'T4A(P) – CPP benefits', boxes:[ ['20','Taxable CPP benefits','11400'], ['22','Income tax deducted','43700'] ] },
    T4AOAS:  { name:'T4A(OAS) – Old Age Security', boxes:[ ['18','Taxable pension paid','11300'], ['21','Net supplements paid','14600'], ['22','Income tax deducted','43700'] ] },
    T5:      { name:'T5 – Investment income', boxes:[
      ['13','Interest from Canadian sources','12100'], ['24','Actual amount of eligible dividends','','info'], ['25','Taxable amount of eligible dividends','12000'],
      ['10','Actual amount of other dividends','','info'], ['11','Taxable amount of other dividends','12000'], ['18','Capital gains dividends','Schedule 3'] ] },
    T3:      { name:'T3 – Trust income (mutual funds, ETFs)', boxes:[
      ['21','Capital gains','Schedule 3'], ['26','Other income','13000'], ['49','Actual amount of eligible dividends','','info'],
      ['50','Taxable amount of eligible dividends','12000'], ['23','Actual amount of other dividends','','info'], ['32','Taxable amount of other dividends','12000'] ] },
    T2202:   { name:'T2202 – Tuition and enrolment', boxes:[
      ['26','Total eligible tuition fees','Schedule 11'], ['24','Total months part-time','','count'], ['25','Total months full-time','','count'] ] },
    T4RSP:   { name:'T4RSP – RRSP income', boxes:[ ['16','Annuity payments','12900'], ['22','Withdrawal and commutation payments','12900'], ['30','Income tax deducted','43700'] ] },
    T5007:   { name:'T5007 – Benefits (workers\' comp, social assistance)', boxes:[ ['10','Workers\' compensation benefits','14400'], ['11','Social assistance payments','14500'] ] },
    RRSP:    { name:'RRSP contribution receipt', boxes:[ ['amt','Contribution amount','20800'] ], hasPeriod:true },
    T4FHSA:  { name:'T4FHSA – First Home Savings Account', boxes:[ ['amt','Amount shown on the slip','','info'] ] },
    OTHER:   { name:'Other slip or statement', boxes:[ ['amt','Amount','','info'], ['tax','Income tax deducted','43700'] ], hasLabel:true },
  };
  const SLIP_ORDER = ['T4','T4A','T4E','T5','T3','T2202','RRSP','T4RSP','T4AP','T4AOAS','T5007','T4FHSA','OTHER'];
  const short = t => ({ T4AP:'T4A(P)', T4AOAS:'T4A(OAS)', RRSP:'RRSP receipt', OTHER:'Other' }[t] || t);
  // Which checklist documents each slip type satisfies (question id : doc index).
  const DOC_SLIPS = { 'employed:0':['T4'], 'invest:0':['T5','T3'], 'rrsp:0':['RRSP'], 'fhsa:0':['T4FHSA'], 'student:0':['T2202'],
    'benefits:0':['T4E'], 'benefits:1':['T4A','T4AP','T4AOAS'], 'benefits:2':['T4RSP'] };

  const LINE_NAMES = {
    '10100':'Employment income', '11300':'Old Age Security pension', '11400':'CPP or QPP benefits', '11500':'Other pensions and superannuation',
    '11900':'Employment Insurance benefits', '12000':'Taxable amount of dividends', '12100':'Interest and other investment income',
    '12900':'RRSP income', '13000':'Other income', '13010':'Scholarships, bursaries, fellowships', '14400':'Workers\' compensation benefits',
    '14500':'Social assistance payments', '14600':'Net federal supplements' };

  const T2125_LINES = {
    b_adv:['8521','Advertising'], b_meals:['8523','Meals and entertainment (50% allowable)'], b_ins:['8690','Insurance'],
    b_office:['8810','Office expenses'], b_supplies:['8811','Office stationery and supplies'], b_fees:['8860','Professional fees (legal, accounting)'],
    b_rent:['8910','Rent'], b_repairs:['8960','Repairs and maintenance'], b_travel:['9200','Travel expenses'], b_phone:['9220','Telephone and utilities'],
    b_vehicle:['9281','Motor vehicle expenses (business-use share)'], b_other:['9270','Other expenses'], b_home:['9945','Business-use-of-home expenses (Part 7)'] };

  const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
  const sum = a => a.reduce((s, v) => s + n(v), 0);

  function build(ctx){
    const { year, slips, receipts, income, contribs, selfEmployed, province, totalKm, mileage, catLabel } = ctx;
    const ys = slips.filter(s => Number(s.year) === year);
    const yr = receipts.filter(r => (r.date || '').startsWith(String(year)));
    const yi = income.filter(x => x.year === year);
    const sections = [];
    const slipName = s => `${short(s.type)}${s.issuer ? ' – ' + s.issuer : ''}`;
    // Collect slip boxes by line
    const byLine = {}; const add = (line, amt, src) => { if (!amt) return; (byLine[line] = byLine[line] || []).push({ amt, src }); };
    ys.forEach(s => { const def = SLIP_TYPES[s.type]; if (!def) return;
      def.boxes.forEach(([code, label, line, kind]) => { const v = n((s.boxes || {})[code]); if (!v || kind === 'info' || kind === 'count' || !line) return; add(line, v, `${slipName(s)}, box ${code}`); }); });
    const lineRow = (line, label) => { const L = byLine[line] || []; return L.length ? { line, label, amount: sum(L.map(x => x.amt)), src: L.map(x => x.src).join('; ') } : null; };

    // 1. Income (T1 Step 2)
    const incRows = ['10100','11300','11400','11500','11900','12000','12100','12900','13000','13010','14400','14500','14600'].map(l => lineRow(l, LINE_NAMES[l])).filter(Boolean);
    ['11500 or 13000','Schedule 3'].forEach(l => { const r = lineRow(l, l === 'Schedule 3' ? 'Capital gains (and capital gains dividends) – Schedule 3' : 'Annuities – line depends on age/source'); if (r) incRows.push(r); });
    const t4aBiz = lineRow('T2125', 'T4A self-employed commissions / fees for services – report on T2125');
    if (t4aBiz) incRows.push(t4aBiz);
    const logged = {}; yi.forEach(x => { (logged[x.type] = logged[x.type] || []).push(x); });
    const LOG_LINE = { employment:['10100 / 10400','Job income logged'], benefits:['11300–11900','EI, pension & benefits logged'], invest:['12100','Interest & investments logged'],
      rental:['12599','Rental income logged (gross, Form T776)'], other:['13000','Other income logged'], self:['13500','Self-employed / gig income logged (see T2125)'] };
    const logRows = Object.keys(LOG_LINE).filter(k => logged[k]).map(k => ({ line: LOG_LINE[k][0], label: LOG_LINE[k][1], amount: sum(logged[k].map(x => x.amount)), src: `${logged[k].length} entr${logged[k].length === 1 ? 'y' : 'ies'}` }));
    sections.push({ id:'income', title:'Income summary', form:'T1 – Step 2, total income',
      rows: incRows, rows2: logRows, rows2Title:'Income logged in TaxKeep without a slip',
      notes: [ incRows.length || logRows.length ? 'If an amount you logged is also on a slip, count it only once.' : '' , 'Taxable dividends (line 12000) use the taxable amounts from the slips, not the actual amounts.' ].filter(Boolean),
      empty: !incRows.length && !logRows.length });

    // Receipts by category
    const rc = cat => yr.filter(r => r.category === cat);
    const rTotal = cat => sum(rc(cat).map(r => r.amount));
    const list = cat => rc(cat).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(r => [r.date, r.vendor || 'Receipt', r.note || '', r.amount]);
    const contr = (acct) => contribs.filter(c => c.year === year && c.acct === acct && c.type === 'contrib');

    // 2. Deductions (T1 Step 3)
    const rrspSlips = sum(ys.filter(s => s.type === 'RRSP').map(s => (s.boxes || {}).amt));
    const rrspLogged = sum(contr('rrsp').map(c => c.amount));
    const dedRows = [
      lineRow('20600','Pension adjustment (affects RRSP room)') || (() => { const pa = sum(ys.filter(s => s.type === 'T4').map(s => (s.boxes || {})['52'])); return pa ? { line:'20600', label:'Pension adjustment (affects RRSP room)', amount:pa, src:'T4 box 52' } : null; })(),
      lineRow('20700','Registered pension plan deduction'),
      (rrspSlips || rrspLogged) ? { line:'20800', label:'RRSP contributions (Schedule 7)', amount: rrspSlips || rrspLogged, src: rrspSlips ? 'RRSP receipts on file' : 'Contributions logged in TaxKeep (attach receipts)' } : null,
      contr('fhsa').length ? { line:'20805', label:'FHSA contributions', amount: sum(contr('fhsa').map(c => c.amount)), src:'Contributions logged (check T4FHSA)' } : null,
      (byLine['21200'] || rc('dues').length) ? { line:'21200', label:'Union, professional or like dues', amount: sum((byLine['21200'] || []).map(x => x.amt)) + rTotal('dues'), src:[byLine['21200'] ? 'T4 box 44' : '', rc('dues').length ? rc('dues').length + ' receipt(s)' : ''].filter(Boolean).join(' + ') } : null,
      rc('childcare').length ? { line:'21400', label:'Child care expenses (Form T778)', amount: rTotal('childcare'), src: rc('childcare').length + ' receipt(s)' } : null,
      rc('moving').length ? { line:'21900', label:'Moving expenses (Form T1-M)', amount: rTotal('moving'), src: rc('moving').length + ' receipt(s)' } : null,
      rc('employment').length ? { line:'22900', label:'Other employment expenses (Form T777)', amount: rTotal('employment'), src: rc('employment').length + ' receipt(s)' } : null,
    ].filter(Boolean);
    sections.push({ id:'deductions', title:'Deductions', form:'T1 – Step 3, net income', rows: dedRows,
      notes:['RRSP contributions made in the first 60 days of next year can count for this year or next.', dedRows.some(r => r.line === '20600') ? 'The pension adjustment is shown for reference; it reduces next year\'s RRSP room.' : ''].filter(Boolean), empty: !dedRows.length });

    // 3. Credits
    const t2202 = ys.filter(s => s.type === 'T2202');
    const donT4 = sum((byLine['34900'] || []).map(x => x.amt));
    const credRows = [
      lineRow('30800','CPP contributions on employment income'),
      lineRow('Schedule 8','Second CPP contributions (CPP2) – Schedule 8'),
      lineRow('31200','EI premiums on employment income'),
      t2202.length ? { line:'32300', label:'Tuition (Schedule 11)', amount: sum(t2202.map(s => (s.boxes || {})['26'])), src: t2202.map(s => `T2202 ${s.issuer || ''} box 26`).join('; ') } : null,
      rc('medical').length ? { line:'33099', label:'Medical expenses for you, spouse, dependent children under 18', amount: rTotal('medical'), src: rc('medical').length + ' receipt(s)' } : null,
      (rc('donations').length || donT4) ? { line:'34900', label:'Donations and gifts (Schedule 9)', amount: rTotal('donations') + donT4, src:[rc('donations').length ? rc('donations').length + ' receipt(s)' : '', donT4 ? 'T4 box 46' : ''].filter(Boolean).join(' + ') } : null,
      rc('accessibility').length ? { line:'31285', label:'Home accessibility expenses', amount: rTotal('accessibility'), src: rc('accessibility').length + ' receipt(s)' } : null,
      rc('disability').length ? { line:'21500 / 33099', label:'Disability-related costs (preparer decides which applies)', amount: rTotal('disability'), src: rc('disability').length + ' receipt(s)' } : null,
    ].filter(Boolean);
    sections.push({ id:'credits', title:'Credits', form:'Schedule 1 and related schedules', rows: credRows,
      notes:['Medical expenses can be for any 12-month period ending in this year. Check who each receipt is for.'], empty: !credRows.length });

    // 4. Tax already paid
    const taxRows = (byLine['43700'] || []).map(x => ({ line:'43700', label:x.src, amount:x.amt, src:'' }));
    const taxLogged = sum(yi.map(x => x.tax));
    if (taxLogged) taxRows.push({ line:'43700', label:'Tax deducted on income logged without a slip', amount: taxLogged, src:'' });
    sections.push({ id:'tax', title:'Income tax already deducted', form:'T1 – line 43700', rows: taxRows,
      total: taxRows.length ? sum(taxRows.map(r => r.amount)) : null, notes:[], empty: !taxRows.length });

    // 5. T2125
    const selfInc = yi.filter(x => x.type === 'self');
    const bizR = yr.filter(r => String(r.category).startsWith('b_'));
    if (selfEmployed || selfInc.length || bizR.length || t4aBiz){
      const kmBiz = sum(mileage.filter(m => m.year === year).map(m => m.km)), kmTot = n(totalKm[year]);
      const usePct = kmTot > 0 ? Math.min(1, kmBiz / kmTot) : null;
      const gross = sum(selfInc.map(x => x.amount)), gst = sum(selfInc.map(x => x.gst));
      const exp = Object.keys(T2125_LINES).map(cat => {
        const raw = sum(bizR.filter(r => r.category === cat).map(r => r.amount)); if (!raw) return null;
        let amt = raw, note = '';
        if (cat === 'b_meals'){ amt = raw * 0.5; note = `50% of ${raw.toFixed(2)}`; }
        if (cat === 'b_vehicle'){ if (usePct !== null){ amt = raw * usePct; note = `${Math.round(usePct * 100)}% business use of ${raw.toFixed(2)}`; } else note = 'Business-use % not set (enter total km)'; }
        if (cat === 'b_home') note = 'Your preparer applies the business-use share';
        return { line: T2125_LINES[cat][0], label: T2125_LINES[cat][1], amount: amt, src: note || `${bizR.filter(r => r.category === cat).length} receipt(s)` };
      }).filter(Boolean);
      const totalExp = sum(exp.filter(e => e.line !== '9945').map(e => e.amount)), home = sum(exp.filter(e => e.line === '9945').map(e => e.amount));
      const rows = [ { line:'Part 3C', label:'Gross business income (logged)', amount: gross, src: `${selfInc.length} payment(s)` } ];
      if (gst) rows.push({ line:'Part 3C', label:'GST/HST collected (not income if registered – check)', amount: gst, src:'' });
      if (t4aBiz) rows.push({ line:'Part 3C', label:'T4A boxes 020 / 048 (may already be in the logged income)', amount: t4aBiz.amount, src: t4aBiz.src });
      rows.push(...exp);
      rows.push({ line:'9368', label:'Total business expenses (before business-use-of-home)', amount: totalExp, src:'', strong:true });
      rows.push({ line:'9946', label:'Estimated net income → T1 line 13500', amount: gross - totalExp - home, src:'Before CCA and other adjustments', strong:true });
      sections.push({ id:'t2125', title:'Business income and expenses', form:'T2125 – Statement of Business or Professional Activities', rows,
        notes:[ `Mileage: ${kmBiz.toLocaleString('en-CA')} business km of ${kmTot ? kmTot.toLocaleString('en-CA') : '?'} total km (Part 5).`, 'Capital cost allowance (CCA) for equipment or vehicles is not included here.' ], empty:false });
    }

    // 6. Detail lists for the preparer
    const details = [
      ['medical','Medical expenses – line 33099'], ['donations','Donations – Schedule 9'], ['childcare','Child care – Form T778 (provider name and SIN/BN needed)'],
      ['moving','Moving expenses – Form T1-M'], ['employment','Employment expenses – Form T777 (needs T2200 or T2200S)'], ['dues','Union and professional dues – line 21200'],
      ['tuition','Tuition receipts (T2202 is the official slip)'], ['accessibility','Home accessibility – line 31285'], ['disability','Disability-related'],
      ['rent', province === 'MB' ? 'Rent / property tax – Manitoba credits (MB479)' : 'Rent / property tax – provincial credit form'], ['otherp','Other personal receipts'] ];
    details.forEach(([cat, title]) => { const L = list(cat); if (L.length) sections.push({ id:'d_' + cat, title, form:'Receipt list', detail:{ cols:['Date','Payee','Note','Amount'], rows:L }, total: sum(L.map(r => r[3])), empty:false }); });
    if (t2202.length) sections.push({ id:'d_t2202', title:'Tuition – Schedule 11', form:'T2202 slips', detail:{ cols:['Institution','Part-time months','Full-time months','Eligible fees'], rows: t2202.map(s => [s.issuer || 'T2202', String(n((s.boxes || {})['24'])), String(n((s.boxes || {})['25'])), n((s.boxes || {})['26'])]) }, total: sum(t2202.map(s => (s.boxes || {})['26'])), empty:false });
    const rr = contr('rrsp'); if (rr.length) sections.push({ id:'d_rrsp', title:'RRSP contributions – Schedule 7', form:'Contributions logged', detail:{ cols:['Date','Account','','Amount'], rows: rr.map(c => [c.date, 'RRSP', '', n(c.amount)]) }, total: sum(rr.map(c => c.amount)), empty:false });
    // Slip register
    if (ys.length) sections.push({ id:'slips', title:'Slips on file', form:'Slip register', detail:{ cols:['Slip','Issuer','Key amount','Tax deducted'],
      rows: ys.map(s => { const d = SLIP_TYPES[s.type] || SLIP_TYPES.OTHER; const first = d.boxes.find(b => b[3] !== 'count'); return [short(s.type), s.issuer || s.label || '', n((s.boxes || {})[first[0]]), n((s.boxes || {})['22'] || (s.boxes || {})['30'] || (s.boxes || {})['022'] || (s.boxes || {}).tax)]; }) }, empty:false });
    return sections;
  }

  // PDF for the preparer (jsPDF + autotable)
  function pdf(sections, meta){
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit:'pt', format:'letter' });
    const money = v => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(v || 0);
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(15,107,82); doc.rect(0, 0, W, 64, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(`Tax worksheets ${meta.year}`, 40, 40);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text(`${meta.name || 'Client'} · ${meta.province} · prepared ${meta.date} with TaxKeep`, 40, 56);
    doc.setTextColor(90,90,90); doc.setFontSize(9);
    doc.text('Organized from the client\'s own records and slips. Not a tax return and not tax advice. Check every amount against the original slips and receipts.', 40, 82, { maxWidth: W - 80 });
    let y = 102;
    sections.filter(s => !s.empty).forEach(s => {
      if (y > 680){ doc.addPage(); y = 50; }
      doc.setTextColor(15,107,82); doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text(s.title, 40, y);
      doc.setTextColor(110,110,110); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(s.form || '', 40, y + 13);
      y += 20;
      const opts = (head, body, amountCol) => ({ startY:y, head:[head], body, theme:'grid', margin:{ left:40, right:40 },
        styles:{ fontSize:8.5, cellPadding:4, overflow:'linebreak' }, headStyles:{ fillColor:[230,242,238], textColor:[20,40,30], fontStyle:'bold' },
        columnStyles:{ [amountCol]:{ halign:'right', cellWidth:80 } } });
      if (s.rows && s.rows.length){
        doc.autoTable({ ...opts(['Line','Description','Source','Amount'], s.rows.map(r => [r.line, r.label, r.src || '', money(r.amount)]), 3),
          columnStyles:{ 0:{ cellWidth:62 }, 3:{ halign:'right', cellWidth:80 } },
          didParseCell: d => { const r = s.rows[d.row.index]; if (d.section === 'body' && r && r.strong) d.cell.styles.fontStyle = 'bold'; } });
        y = doc.lastAutoTable.finalY + 8;
      }
      if (s.rows2 && s.rows2.length){
        doc.setFontSize(9); doc.setTextColor(60,60,60); doc.text(s.rows2Title, 40, y + 8); y += 12;
        doc.autoTable({ ...opts(['Line','Description','Source','Amount'], s.rows2.map(r => [r.line, r.label, r.src || '', money(r.amount)]), 3), columnStyles:{ 0:{ cellWidth:62 }, 3:{ halign:'right', cellWidth:80 } } });
        y = doc.lastAutoTable.finalY + 8;
      }
      if (s.detail){
        doc.autoTable({ ...opts(s.detail.cols, s.detail.rows.map(r => r.map((c, i) => i === s.detail.cols.length - 1 && typeof c === 'number' ? money(c) : (typeof c === 'number' ? money(c) : c))), s.detail.cols.length - 1),
          foot: s.total != null ? [[{ content:'Total', colSpan: s.detail.cols.length - 1 }, money(s.total)]] : undefined, footStyles:{ fillColor:[244,246,245], textColor:[20,20,20], fontStyle:'bold', halign:'right' } });
        y = doc.lastAutoTable.finalY + 8;
      } else if (s.total != null){ doc.setFontSize(10); doc.setTextColor(20,20,20); doc.setFont('helvetica','bold'); doc.text(`Total: ${money(s.total)}`, W - 40, y + 6, { align:'right' }); doc.setFont('helvetica','normal'); y += 14; }
      (s.notes || []).forEach(t => { if (y > 740){ doc.addPage(); y = 50; } doc.setFontSize(8); doc.setTextColor(110,110,110); const lines = doc.splitTextToSize('• ' + t, W - 80); doc.text(lines, 40, y + 6); y += 10 * lines.length; });
      y += 16;
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150,150,150); doc.text(`TaxKeep worksheets ${meta.year} · page ${i} of ${pages}`, W / 2, doc.internal.pageSize.getHeight() - 20, { align:'center' }); }
    return doc.output('blob');
  }

  // Best-effort reading of a photographed slip. Every value must be checked by the person.
  function guessType(text){
    const t = text.toUpperCase().replace(/\s+/g, ' ');
    if (/T4A\s*\(?\s*OAS|OLD AGE SECURITY/.test(t)) return 'T4AOAS';
    if (/T4A\s*\(?\s*P\b|CANADA PENSION PLAN BENEFITS/.test(t)) return 'T4AP';
    if (/T4RSP|RRSP INCOME/.test(t)) return 'T4RSP';
    if (/T4FHSA|FIRST HOME SAVINGS/.test(t)) return 'T4FHSA';
    if (/T2202|TUITION AND ENROLMENT/.test(t)) return 'T2202';
    if (/T5007/.test(t)) return 'T5007';
    if (/T4E\b|EMPLOYMENT INSURANCE (AND OTHER )?BENEFITS/.test(t)) return 'T4E';
    if (/T4A\b|PENSION, RETIREMENT, ANNUITY/.test(t)) return 'T4A';
    if (/STATEMENT OF REMUNERATION|\bT4\b/.test(t)) return 'T4';
    if (/\bT3\b|TRUST INCOME/.test(t)) return 'T3';
    if (/\bT5\b|INVESTMENT INCOME/.test(t)) return 'T5';
    if (/RRSP|RETIREMENT SAVINGS PLAN|CONTRIBUTION RECEIPT/.test(t)) return 'RRSP';
    return null;
  }
  const AMT = '(\\d{1,3}(?:[ ,]\\d{3})*[.,]\\d{2}|\\d+[.,]\\d{2})';
  const toNum = s => parseFloat(String(s).replace(/[ ,](?=\d{3}\b)/g, '').replace(',', '.'));
  function parseSlip(text, type){
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const def = SLIP_TYPES[type]; const out = {};
    if (!def) return out;
    const codes = def.boxes.map(b => b[0]).filter(c => c !== 'amt' && c !== 'tax');
    const norm = c => c.replace(/^0+/, '');
    const amtRe = new RegExp(AMT), countRe = /^(\d{1,2})$/;
    // A line that is only a box number (optionally "Box 14" / "Case 014").
    const codeOf = l => { const m = l.match(/^(?:box|case)?\s*0{0,2}(\d{1,3}A?)\s*[:.]?$/i); return m ? m[1].toUpperCase() : null; };
    const want = Object.fromEntries(def.boxes.map(b => [norm(b[0]), b]));
    const take = (b, v) => { const [code, , , kind] = b; if (out[code] != null) return; if (kind === 'count'){ if (v >= 0 && v <= 12) out[code] = v; } else if (v > 0) out[code] = v; };
    lines.forEach((l, i) => {
      // 1) Box number alone on a line: the amount is on one of the next few lines (before the next box number).
      const c = codeOf(l);
      if (c && want[c]){
        const b = want[c];
        for (let k = i + 1; k < Math.min(lines.length, i + 5); k++){
          if (b[3] === 'count'){ const m = lines[k].match(countRe); if (m){ take(b, +m[1]); break; } }
          if (want[codeOf(lines[k])]) break;
          if (b[3] !== 'count'){ const m = lines[k].match(amtRe); if (m){ take(b, toNum(m[1])); break; } }
        }
        return;
      }
      // 2) Box number and amount on the same line: "14 Employment income 46,215.80".
      codes.forEach(code => {
        const b = want[norm(code)];
        const re = new RegExp(`(?:^|[^\\d.,])(?:(?:box|case)\\s*0{0,2}${norm(code)}(?![\\d.,A-Z])[^\\d\\n]{0,45}?|0{0,2}${norm(code)}(?![\\d.,A-Z])\\s*[A-Za-z'][^\\d\\n]{0,45}?)${b[3] === 'count' ? '(\\d{1,2})(?![\\d.,])' : AMT}`, 'i');
        const m = l.match(re); if (m) take(b, b[3] === 'count' ? parseInt(m[1], 10) : toNum(m[1]));
      });
    });
    if (def.boxes.some(b => b[0] === 'amt')){
      const all = [...text.matchAll(new RegExp(AMT, 'g'))].map(m => toNum(m[1])).filter(v => v > 0);
      if (all.length) out.amt = Math.max(...all);
    }
    const yr = text.match(/\b(20[2-3]\d)\b/); if (yr) out.__year = Number(yr[1]);
    return out;
  }

  window.TaxKeepForms = { SLIP_TYPES, SLIP_ORDER, DOC_SLIPS, short, build, pdf, guessType, parseSlip };
})();
