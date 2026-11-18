/* TaxKeep refund estimate: federal + Manitoba tax for 2025 and 2026.
   Figures checked against CRA payroll guides (T4032MB), Manitoba Finance and published 2026 rate tables.
   An estimate for planning only: ignores refundable credits (CWB, MB credits), AMT, OAS clawback, carryforwards other than tuition. */
(function(){
  const P = {
    2026: { fed:{ br:[[58523,.14],[117045,.205],[181440,.26],[258482,.29],[Infinity,.33]], low:.14, bpaMax:16452, bpaMin:14829, bpaFrom:181440, bpaTo:258482, cea:1501, medMax:2890 },
            cpp:{ ympe:74600, yampe:85000, exempt:3500, rate:.0595 }, ei:{ rate:.0163, mie:68900 } },
    2025: { fed:{ br:[[57375,.145],[114750,.205],[177882,.26],[253414,.29],[Infinity,.33]], low:.145, bpaMax:16129, bpaMin:14538, bpaFrom:177882, bpaTo:253414, cea:1471, medMax:2834 },
            cpp:{ ympe:71300, yampe:81200, exempt:3500, rate:.0595 }, ei:{ rate:.0164, mie:65700 } } };
  // Manitoba: brackets and BPA frozen at 2024 levels for 2025 and later (Manitoba Budget 2025, 2026).
  const MB = { br:[[47000,.108],[100000,.1275],[Infinity,.174]], low:.108, bpa:15780, medMax:1728, donHigh:.174, dtcElig:.08, dtcOther:.007835 };
  const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const bracketTax = (inc, br) => { let t = 0, lo = 0; for (const [hi, rate] of br){ if (inc > lo) t += (Math.min(inc, hi) - lo) * rate; lo = hi; } return t; };

  function estimate(x){
    const yr = P[x.year] ? x.year : (x.year > 2026 ? 2026 : 2025), p = P[yr], F = p.fed;
    const e = x.emp, o = x.other, d = x.deductions, c = x.credits;
    const steps = [];
    // CPP on self-employment (Schedule 8, simplified): 11.9% base+first enhancement, 8% CPP2.
    const empPens = e.cpp > 0 ? e.cpp / p.cpp.rate + p.cpp.exempt : 0;
    const se = Math.max(0, x.selfNet);
    const sePens = Math.max(0, Math.min(empPens + se, p.cpp.ympe) - Math.max(empPens, p.cpp.exempt));
    const seCpp = sePens * p.cpp.rate * 2;
    const seCpp2 = Math.max(0, Math.min(empPens + se, p.cpp.yampe) - Math.max(empPens, p.cpp.ympe)) * .08;
    const seBaseHalf = seCpp * (4.95 / 11.9);

    // Total income
    const div = n(o.eligDivTaxable) + n(o.otherDivTaxable);
    const income = n(e.income) + n(o.pension) + n(o.oas) + n(o.cppBen) + n(o.ei) + n(o.interest) + div + n(o.capGains) * .5
      + n(o.rrspIncome) + n(o.other) + n(o.scholarship) + n(o.rental) + n(o.wcb) + n(o.social) + x.selfNet;
    steps.push(['Total income (line 15000)', income]);
    // Deductions → net income
    const cppEnh = n(e.cpp) * (1 / 5.95) + n(e.cpp2) + seCpp * (2 / 11.9) + seCpp2;
    const ded = n(d.rpp) + n(d.rrsp) + n(d.fhsa) + n(d.dues) + n(d.childcare) + n(d.moving) + n(d.employmentExp) + seBaseHalf + cppEnh;
    const net = Math.max(0, income - ded);
    steps.push(['Deductions', -ded]);
    steps.push(['Net income (line 23600)', net]);
    const taxable = Math.max(0, net - n(o.wcb) - n(o.social));
    steps.push(['Taxable income (line 26000)', taxable]);

    // Federal
    const bpa = net <= F.bpaFrom ? F.bpaMax : net >= F.bpaTo ? F.bpaMin : F.bpaMax - (F.bpaMax - F.bpaMin) * (net - F.bpaFrom) / (F.bpaTo - F.bpaFrom);
    const cppBaseCredit = n(e.cpp) * (4.95 / 5.95) + seBaseHalf;
    const eiCredit = Math.min(n(e.ei), p.ei.rate * p.ei.mie);
    const cea = Math.min(F.cea, n(e.income));
    const medFed = Math.max(0, n(c.medical) - Math.min(F.medMax, net * .03));
    const tuition = n(c.tuition) + n(c.tuitionCarry);
    const access = Math.min(20000, n(c.accessibility));
    const fedAmounts = bpa + cppBaseCredit + eiCredit + cea + medFed + tuition + access;
    const don = n(c.donations);
    const fedDon = Math.min(200, don) * F.low + Math.max(0, don - 200) * .29;
    const fedDtc = n(o.eligDivTaxable) * .150198 + n(o.otherDivTaxable) * .090301;
    const fedGross = bracketTax(taxable, F.br);
    const fedTax = Math.max(0, fedGross - fedAmounts * F.low - fedDon - fedDtc);
    steps.push(['Federal tax', fedTax]);

    // Provincial
    let provTax = null;
    if (x.province === 'MB'){
      const mbBpa = net <= 200000 ? MB.bpa : net >= 400000 ? 0 : MB.bpa * (400000 - net) / 200000;
      const medMb = Math.max(0, n(c.medical) - Math.min(MB.medMax, net * .03));
      const mbAmounts = mbBpa + cppBaseCredit + eiCredit + medMb;
      const mbDon = Math.min(200, don) * MB.low + Math.max(0, don - 200) * MB.donHigh;
      const mbDtc = n(o.eligDivTaxable) * MB.dtcElig + n(o.otherDivTaxable) * MB.dtcOther;
      provTax = Math.max(0, bracketTax(taxable, MB.br) - mbAmounts * MB.low - mbDon - mbDtc);
      steps.push(['Manitoba tax', provTax]);
    }
    if (seCpp + seCpp2 > 0) steps.push(['CPP on self-employment (Schedule 8)', seCpp + seCpp2]);
    const total = fedTax + (provTax || 0) + seCpp + seCpp2;
    const paid = n(x.taxPaid);
    steps.push(['Income tax already deducted (line 43700)', paid ? -paid : 0]);
    const result = paid - total; // positive = refund
    return { year: yr, yearNote: yr !== x.year ? `Uses ${yr} rates` : '', steps: steps.map(([l, v]) => [l, r2(v)]),
      income: r2(income), net: r2(net), taxable: r2(taxable), fedTax: r2(fedTax), provTax: provTax == null ? null : r2(provTax), seCpp: r2(seCpp + seCpp2),
      total: r2(total), paid: r2(paid), result: r2(result), provIncluded: provTax != null,
      marginal: (() => { const f = F.br.find(b => taxable < b[0])[1]; const m = x.province === 'MB' ? MB.br.find(b => taxable < b[0])[1] : 0; return f + m; })(),
      medThreshold: { fed: r2(Math.min(F.medMax, net * .03)), mb: r2(Math.min(MB.medMax, net * .03)) } };
  }
  // Medical claim comparison between spouses: claim goes on the return with the lower threshold.
  function medicalThreshold(year, net, province){
    const F = (P[year] || P[2026]).fed;
    return { fed: Math.min(F.medMax, n(net) * .03), mb: province === 'MB' ? Math.min(MB.medMax, n(net) * .03) : null, low: F.low };
  }
  window.TaxKeepEstimate = { estimate, medicalThreshold, MB, P };
})();
