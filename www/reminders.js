/* TaxKeep reminders: schedules phone notifications for Canadian tax dates over the next 12 months. */
(function(){
  const LN = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  const ID_BASE = 7000, ID_MAX = 7099, TEST_ID = 7100;
  const at = (y, m, d, h) => new Date(y, m - 1, d, h || 10, 0, 0);

  // opts: { deadlines, instalments, monthly, selfEmployed }
  function plan(opts, now){
    now = now || new Date();
    const out = [], y = now.getFullYear();
    const add = (date, title, body) => { if (date > now && date - now < 366 * 864e5) out.push({ date, title, body }); };
    for (const yr of [y, y + 1]){
      const taxYear = yr - 1;
      if (opts.deadlines){
        add(at(yr, 2, 15), 'RRSP deadline is coming', `The deadline to contribute to an RRSP for ${taxYear} is around March 1. Check your room in TaxKeep.`);
        add(at(yr, 3, 25), 'Tax season is here', `Slips for ${taxYear} should be in. Check your TaxKeep checklist and export your package for your preparer.`);
        add(at(yr, 4, 23), 'Tax day is April 30', `Your ${taxYear} return and any balance owing are due April 30.`);
        if (opts.selfEmployed) add(at(yr, 6, 8), 'Self-employed return due June 15', `Your ${taxYear} self-employed return is due June 15. Any balance owing was due April 30.`);
      }
      if (opts.instalments && opts.selfEmployed){
        [[3,15],[6,15],[9,15],[12,15]].forEach(([m, d]) => add(at(yr, m, d - 7), 'Tax instalment due in a week', `If CRA asked you to pay instalments, the next one is due ${new Date(yr, m - 1, d).toLocaleDateString('en-CA',{month:'long',day:'numeric'})}.`));
      }
      if (opts.monthly){
        for (let m = 1; m <= 12; m++) add(at(yr, m, 1, 18), 'Any new receipts?', 'Take a minute to snap last month\'s receipts into TaxKeep.');
      }
    }
    out.sort((a, b) => a.date - b.date);
    return out.slice(0, ID_MAX - ID_BASE + 1).map((n, i) => ({ ...n, id: ID_BASE + i }));
  }

  async function permission(){
    const L = LN(); if (!L) return 'unavailable';
    try {
      let p = await L.checkPermissions();
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await L.requestPermissions();
      return p.display;
    } catch(e){ return 'unavailable'; }
  }
  async function clear(){
    const L = LN(); if (!L) return;
    try {
      const ids = []; for (let i = ID_BASE; i <= ID_MAX; i++) ids.push({ id: i });
      await L.cancel({ notifications: ids });
    } catch(e){}
  }
  async function sync(opts){
    const L = LN(); if (!L) return { ok:false, reason:'unavailable' };
    await clear();
    const list = plan(opts);
    if (!list.length) return { ok:true, count:0 };
    const perm = await permission();
    if (perm !== 'granted') return { ok:false, reason:perm };
    await L.schedule({ notifications: list.map(n => ({ id:n.id, title:n.title, body:n.body, schedule:{ at:n.date, allowWhileIdle:true } })) });
    return { ok:true, count:list.length, next:list[0] };
  }
  async function test(){
    const L = LN(); if (!L) return { ok:false, reason:'unavailable' };
    const perm = await permission();
    if (perm !== 'granted') return { ok:false, reason:perm };
    await L.schedule({ notifications: [{ id:TEST_ID, title:'TaxKeep reminders are on', body:'This is what a reminder looks like.', schedule:{ at:new Date(Date.now() + 5000), allowWhileIdle:true } }] });
    return { ok:true };
  }
  window.TaxKeepReminders = { plan, sync, test, available: () => !!LN() };
})();
