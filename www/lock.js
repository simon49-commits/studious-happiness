/* TaxKeep app lock: 4-digit PIN (stored only as a salted SHA-256 hash) plus optional fingerprint. */
(function(){
  const KEY = 'taxkeep_lock';
  const AWAY_MS = 60 * 1000; // lock again after the app has been in the background for 1 minute
  const plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){ return null; } };
  const write = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch(e){} };
  async function hash(salt, pin){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const newSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

  let locked = false, awaySince = 0, pauseLock = false;

  async function biometryAvailable(){
    const B = plugins().BiometricAuthNative;
    if (!B) return false;
    try { const r = await B.checkBiometry(); return !!(r && r.isAvailable); } catch(e){ return false; }
  }
  async function tryBiometric(){
    const B = plugins().BiometricAuthNative;
    if (!B) return false;
    pauseLock = true;
    try {
      await B.internalAuthenticate({ reason:'Unlock TaxKeep', androidTitle:'Unlock TaxKeep', androidSubtitle:'Use your fingerprint', cancelTitle:'Use PIN', allowDeviceCredential:false, androidConfirmationRequired:false });
      return true;
    } catch(e){ return false; }
    finally { setTimeout(() => { pauseLock = false; }, 1500); }
  }

  function keypad(title, sub, onDigits, extraBtn){
    const el = document.createElement('div');
    el.id = 'lockScreen';
    el.innerHTML = `<div class="lk-in">
      <div class="lk-logo"><svg width="56" height="56" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="var(--brand)"/><path d="M8 9h12M8 14h12M8 19h7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="20" cy="19" r="2.4" fill="#fff"/></svg></div>
      <h2 class="lk-title">${title}</h2><p class="lk-sub muted">${sub}</p>
      <div class="lk-dots">${'<i></i>'.repeat(4)}</div>
      <div class="lk-pad">${[1,2,3,4,5,6,7,8,9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="x" class="lk-alt">${extraBtn ? extraBtn.label : ''}</button><button data-k="0">0</button><button data-k="del" aria-label="Delete">⌫</button></div>
    </div>`;
    let digits = '';
    const dots = () => el.querySelectorAll('.lk-dots i').forEach((d, i) => d.classList.toggle('on', i < digits.length));
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'del') digits = digits.slice(0, -1);
      else if (k === 'x'){ if (extraBtn) extraBtn.onClick(); return; }
      else if (digits.length < 4) digits += k;
      dots();
      if (digits.length === 4){ const d = digits; digits = ''; setTimeout(dots, 160); await onDigits(d, el); }
    });
    el.shake = msg => { el.querySelector('.lk-sub').textContent = msg; const p = el.querySelector('.lk-dots'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); };
    document.body.appendChild(el);
    return el;
  }

  async function lockNow(){
    const cfg = read(); if (!cfg || locked) return;
    locked = true;
    const useBio = cfg.bio && await biometryAvailable();
    let tries = 0;
    const el = keypad('Enter your PIN', 'TaxKeep is locked', async (pin, scr) => {
      if (await hash(cfg.salt, pin) === cfg.hash){ unlock(scr); }
      else { tries++; scr.shake(tries >= 5 ? 'Wrong PIN. Forgot it? Reinstalling the app resets it, but deletes records kept on this phone.' : 'Wrong PIN, try again'); }
    }, useBio ? { label:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-label="Use fingerprint"><path d="M12 11v3a8 8 0 0 0 1.2 4.2M8.5 8.7A4 4 0 0 1 16 11v1.5M8 12.5V11a4 4 0 0 1 .5-2.3M5 10a7 7 0 0 1 13.6-2.3M19 11v1a12 12 0 0 1-.4 3M5.2 14A11 11 0 0 1 5 12M8.3 16.5c.3 1.3.8 2.5 1.5 3.5M15.6 16c-.2 1.4-.5 2.6-1 3.6"/></svg>', onClick: async () => { if (await tryBiometric()) unlock(el); } } : null);
    if (useBio) setTimeout(async () => { if (await tryBiometric()) unlock(el); }, 300);
  }
  function unlock(scr){ locked = false; scr.remove(); }

  // Setup flow: enter PIN twice. Resolves true if a PIN was saved.
  function setupPin(){
    return new Promise(resolve => {
      let first = null;
      const el = keypad('Choose a 4-digit PIN', 'You\'ll enter it to open TaxKeep', async (pin, scr) => {
        if (!first){ first = pin; scr.querySelector('.lk-title').textContent = 'Enter it again'; scr.querySelector('.lk-sub').textContent = 'To make sure it\'s right'; return; }
        if (pin !== first){ first = null; scr.querySelector('.lk-title').textContent = 'Choose a 4-digit PIN'; scr.shake('The PINs didn\'t match. Start again.'); return; }
        const salt = newSalt();
        const bio = await biometryAvailable();
        write({ salt, hash: await hash(salt, pin), bio });
        scr.remove(); resolve(true);
      }, { label:'Cancel', onClick: () => { el.remove(); resolve(false); } });
    });
  }

  // Ask for the current PIN before a sensitive change (like turning the lock off).
  function verify(){
    return new Promise(resolve => {
      const cfg = read(); if (!cfg){ resolve(true); return; }
      const el = keypad('Enter your current PIN', 'To change lock settings', async (pin, scr) => {
        if (await hash(cfg.salt, pin) === cfg.hash){ scr.remove(); resolve(true); } else scr.shake('Wrong PIN, try again');
      }, { label:'Cancel', onClick: () => { el.remove(); resolve(false); } });
    });
  }

  function onAppState(active){
    if (!read() || pauseLock || window.__tkPauseLock) return;
    if (!active) awaySince = Date.now();
    else if (awaySince && Date.now() - awaySince > AWAY_MS){ awaySince = 0; lockNow(); }
    else awaySince = 0;
  }
  function init(){
    const App = plugins().App;
    if (App && App.addListener) App.addListener('appStateChange', s => onAppState(s.isActive));
    else document.addEventListener('visibilitychange', () => onAppState(!document.hidden));
    if (read()) lockNow();
  }

  window.TaxKeepLock = {
    init, setupPin, lockNow, verify,
    isOn: () => !!read(),
    bioOn: () => !!(read() || {}).bio,
    biometryAvailable,
    setBio: async on => { const c = read(); if (!c) return false; if (on && !(await biometryAvailable())) return false; c.bio = !!on; write(c); return true; },
    turnOff: () => write(null),
  };
})();
