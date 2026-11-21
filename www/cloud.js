/* TaxKeep cloud backup (Supabase, Canada Central). Sign in with email + password.
   One row per person in public.backups (records), photos in the private "vault" bucket under <user id>/.
   Row Level Security means each person can only read and write their own data. */
(function(){
  const URL = 'https://lhaeinfxneaiuwdxkdry.supabase.co';
  const KEY = 'sb_publishable_f65ewnWM9dqL0AbQQagUQQ_2y2kTqSj';
  const META = 'taxkeep_cloud';
  let client = null, session = null, listeners = [];

  async function lib(){ if (!window.supabase && window.loadScript) await window.loadScript('supabase.js'); return window.supabase; }
  async function sb(){
    if (client) return client;
    const S = await lib();
    client = S.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'taxkeep_auth' } });
    const { data } = await client.auth.getSession(); session = data.session;
    client.auth.onAuthStateChange((_e, s) => { session = s; listeners.forEach(f => { try { f(s); } catch(e){} }); });
    return client;
  }
  const meta = () => { try { const m = JSON.parse(localStorage.getItem(META) || '{}'); return session && m.uid === session.user.id ? m : { uid: session && session.user.id, files: {} }; } catch(e){ return { files: {} }; } };
  const saveMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch(e){} };
  const friendly = e => {
    const m = String((e && (e.message || e.error_description || e.msg)) || e || 'error');
    if (/invalid login/i.test(m)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link from Supabase.';
    if (/already registered|already been registered/i.test(m)) return 'That email already has an account. Try signing in.';
    if (/password should be/i.test(m)) return 'Use a password with at least 8 characters.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a few minutes and try again.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'No internet connection. Try again when you\'re online.';
    if (/relation .* does not exist|backups/i.test(m) && /exist|schema/i.test(m)) return 'The cloud isn\'t set up yet (database setup step missing).';
    return m;
  };
  function dataUrlToBlob(d){ const [h, b] = d.split(','); const type = (h.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    if (h.includes(';base64')){ const bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type }); }
    return new Blob([decodeURIComponent(b)], { type }); }
  const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

  async function init(){ try { await sb(); } catch(e){} return session; }
  function onChange(f){ listeners.push(f); }
  const user = () => session && session.user ? { id: session.user.id, email: session.user.email } : null;

  async function signUp(email, password){
    const c = await sb(); const { data, error } = await c.auth.signUp({ email, password });
    if (error) throw new Error(friendly(error));
    return { needsConfirm: !data.session };
  }
  async function signIn(email, password){
    const c = await sb(); const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error));
    return user();
  }
  async function resetPassword(email){ const c = await sb(); const { error } = await c.auth.resetPasswordForEmail(email); if (error) throw new Error(friendly(error)); }
  async function signOut(){ const c = await sb(); await c.auth.signOut().catch(() => {}); session = null; }

  // Upload records + any new or changed photos. fileIds: [{ id, size }] of files present on the phone.
  async function backup({ state, receipts, getFile, fileIds, version, onProgress }){
    const c = await sb(); if (!session) throw new Error('Sign in first.');
    const uid = session.user.id, m = meta(); m.uid = uid; m.files = m.files || {};
    const todo = fileIds.filter(f => !m.files[f.id] || m.files[f.id] !== f.size);
    let done = 0;
    for (const f of todo){
      const file = await getFile(f.id).catch(() => null);
      if (file && file.dataUrl){
        const { error } = await c.storage.from('vault').upload(`${uid}/${f.id}`, dataUrlToBlob(file.dataUrl), { upsert: true, contentType: file.type || undefined });
        if (error) throw new Error(friendly(error));
        m.files[f.id] = f.size; saveMeta(m);
      }
      done++; onProgress && onProgress(done, todo.length);
    }
    // Remove photos that were deleted on the phone.
    const keep = new Set(fileIds.map(f => f.id)), gone = Object.keys(m.files).filter(id => !keep.has(id));
    if (gone.length){ await c.storage.from('vault').remove(gone.map(id => `${uid}/${id}`)).catch(() => {}); gone.forEach(id => delete m.files[id]); }
    const files = {}; fileIds.forEach(f => { files[f.id] = f.size; });
    const { error } = await c.from('backups').upsert({ user_id: uid, state, receipts, files, device: navigator.userAgent.slice(0, 120), app_version: version || '', updated_at: new Date().toISOString() });
    if (error) throw new Error(friendly(error));
    m.last = Date.now(); m.lastError = ''; saveMeta(m);
    return { uploaded: todo.length, last: m.last };
  }
  async function info(){
    const c = await sb(); if (!session) return null;
    const { data, error } = await c.from('backups').select('updated_at, files, app_version').eq('user_id', session.user.id).maybeSingle();
    if (error) throw new Error(friendly(error));
    return data ? { at: Date.parse(data.updated_at), photos: Object.keys(data.files || {}).length } : null;
  }
  // Download the backup. putFile(id, file) saves photos on the phone.
  async function restore({ putFile, onProgress }){
    const c = await sb(); if (!session) throw new Error('Sign in first.');
    const uid = session.user.id;
    const { data, error } = await c.from('backups').select('*').eq('user_id', uid).maybeSingle();
    if (error) throw new Error(friendly(error));
    if (!data) throw new Error('No backup found for this account yet.');
    const ids = Object.keys(data.files || {}); let done = 0, failed = 0; const m = { uid, files: {} };
    for (const id of ids){
      const { data: blob, error: e } = await c.storage.from('vault').download(`${uid}/${id}`);
      if (e || !blob) failed++;
      else { const dataUrl = await blobToDataUrl(blob); await putFile(id, { name: id, type: blob.type || 'image/jpeg', dataUrl }); m.files[id] = data.files[id]; }
      done++; onProgress && onProgress(done, ids.length);
    }
    m.last = Date.parse(data.updated_at); saveMeta(m);
    return { state: data.state, receipts: data.receipts || [], failed };
  }
  async function deleteAll(){
    const c = await sb(); if (!session) throw new Error('Sign in first.');
    const uid = session.user.id;
    for (;;){ // remove every photo first (Storage won't let the database delete them)
      const { data } = await c.storage.from('vault').list(uid, { limit: 100 });
      if (!data || !data.length) break;
      const { error } = await c.storage.from('vault').remove(data.map(o => `${uid}/${o.name}`)); if (error) throw new Error(friendly(error));
    }
    await c.from('backups').delete().eq('user_id', uid);
    const { error } = await c.rpc('delete_my_account'); if (error) throw new Error(friendly(error));
    await signOut(); try { localStorage.removeItem(META); } catch(e){}
  }
  const lastBackup = () => meta().last || 0;
  const pending = fileIds => { const m = meta(); return fileIds.filter(f => !m.files || m.files[f.id] !== f.size).length; };

  window.TaxKeepCloud = { init, onChange, user, signUp, signIn, signOut, resetPassword, backup, restore, info, deleteAll, lastBackup, pending, friendly };
})();
