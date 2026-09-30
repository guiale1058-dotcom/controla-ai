/* sync.js — ponte do Controla Aí com o Firebase (Auth Google + Firestore).
   Só carrega o SDK quando a pessoa usa login. Toda a lógica de "o que mudou" está em sync-core.js. */
(function () {
  const FB_VER = '12.19.0';
  const CFG = {
    apiKey: 'AIzaSyDsmAhr5gG8fZTL2WgaKLs-C2WwV9P-jwM',
    authDomain: 'controla-ai-ae90c.firebaseapp.com',
    projectId: 'controla-ai-ae90c',
    storageBucket: 'controla-ai-ae90c.firebasestorage.app',
    messagingSenderId: '268665561997',
    appId: '1:268665561997:web:066cf234b4c38ec35113c4',
  };
  const UID_KEY = 'controla_sync_uid';
  const baseKey = uid => 'controla_sync_base_' + uid;
  let fb = null, auth = null, db = null, user = null, unsub = null, timer = null, enviando = false;
  let cb = { getS: null, setS: null, onStatus: () => {}, pedirEscolha: async () => null };
  const estado = { logado: false, email: '', status: 'off', pendentes: 0, ultima: 0 };

  function status(s, extra) { Object.assign(estado, { status: s }, extra || {}); cb.onStatus(estado); }
  function lerBase(uid) { try { return JSON.parse(localStorage.getItem(baseKey(uid)) || '{}'); } catch (e) { return {}; } }
  function gravarBase(uid, b) { localStorage.setItem(baseKey(uid), JSON.stringify(b)); }

  // Uma carga só: quem chama durante o download espera a MESMA promessa
  // (antes, um toque em "Entrar" no meio do pré-carregamento inicializava o Firebase 2x e dava erro).
  let carga = null;
  function carregarSDK() {
    if (!carga) carga = (async () => {
      const u = m => 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-' + m + '.js';
      const [app, a, f] = await Promise.all([import(u('app')), import(u('auth')), import(u('firestore'))]);
      const inst = app.initializeApp(CFG);
      auth = a.getAuth(inst);
      await a.setPersistence(auth, a.browserLocalPersistence);
      db = f.getFirestore(inst);
      fb = { a, f };
      return fb;
    })().catch(e => { carga = null; throw e; }); // falhou (offline): permite tentar de novo
    return carga;
  }
  const colRef = uid => fb.f.collection(db, 'users', uid, 'itens');

  async function lerNuvem(uid) {
    const snap = await fb.f.getDocs(colRef(uid));
    return snap.docs.map(d => Object.assign({ chave: d.id }, d.data()));
  }

  async function gravarOps(uid, ups, dels) {
    const { f } = fb;
    const ops = ups.map(u => ['set', u]).concat(dels.map(d => ['del', d]));
    for (let i = 0; i < ops.length; i += 450) {
      const b = f.writeBatch(db);
      ops.slice(i, i + 450).forEach(([t, o]) => {
        const ref = f.doc(db, 'users', uid, 'itens', o.chave);
        if (t === 'set') b.set(ref, { col: o.col, id: o.id, data: o.data, del: false, upd: f.serverTimestamp() });
        else b.set(ref, { col: o.col, id: o.id, data: null, del: true, upd: f.serverTimestamp() });
      });
      await b.commit();
    }
  }

  async function enviar() {
    if (!user || enviando) return;
    const uid = user.uid;
    const base = lerBase(uid);
    const atual = SyncCore.itensDe(cb.getS());
    const d = SyncCore.diff(base, atual);
    const n = d.upserts.length + d.deletes.length;
    if (!n) { status('ok', { pendentes: 0, ultima: Date.now() }); return; }
    if (!navigator.onLine) { status('offline', { pendentes: n }); return; }
    enviando = true; status('enviando', { pendentes: n });
    try {
      await gravarOps(uid, d.upserts, d.deletes);
      const nb = Object.assign({}, lerBase(uid));
      d.upserts.forEach(u => { nb[u.chave] = { col: u.col, id: u.id, data: u.data }; });
      d.deletes.forEach(x => { delete nb[x.chave]; });
      gravarBase(uid, nb);
      status('ok', { pendentes: 0, ultima: Date.now() });
    } catch (e) {
      console.error('[Sync] envio falhou', e);
      status(navigator.onLine ? 'erro' : 'offline', { pendentes: n });
      clearTimeout(timer); timer = setTimeout(enviar, 15000); // tenta de novo
    } finally { enviando = false; }
  }

  function agendar() {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(enviar, 1500);
  }

  function escutar(uid) {
    if (unsub) unsub();
    unsub = fb.f.onSnapshot(colRef(uid), snap => {
      // Eco das nossas gravações NÃO é descartado aqui: enquanto o envio não confirma, a base
      // ainda não mudou, então a chave conta como "pendente" e aplicarRemotos a ignora.
      // (Descartar o snapshot inteiro poderia perder mudança remota que veio junto.)
      const docs = snap.docChanges().map(ch => Object.assign({ chave: ch.doc.id }, ch.doc.data()));
      if (!docs.length) return;
      const r = SyncCore.aplicarRemotos(cb.getS(), lerBase(uid), docs);
      gravarBase(uid, r.base);
      cb.setS(r.S);
      if (!enviando) status('ok', { ultima: Date.now() });
    }, err => { console.error('[Sync] escuta', err); status('erro'); });
  }

  async function ligar(u) {
    user = u;
    localStorage.setItem(UID_KEY, u.uid);
    Object.assign(estado, { logado: true, email: u.email || '' });
    escutar(u.uid);
    await enviar();
  }

  // Monta S com os dados da conta, mantendo o perfil local se a conta ainda não tiver perfil.
  function sDaConta(remotos, S) {
    const r = SyncCore.deRemotos(remotos, S.nid);
    if (!Object.keys(r.S.perfil || {}).length) r.S.perfil = S.perfil;
    return r;
  }

  // Primeiro login NESTE aparelho: decide entre subir, baixar ou perguntar.
  async function primeiroLogin(u) {
    const uid = u.uid;
    const remotos = (await lerNuvem(uid)).filter(d => !d.del);
    const S = cb.getS();
    const temNuvem = remotos.some(d => d.col !== 'perfil');
    if (!temNuvem) { gravarBase(uid, {}); return 'subir'; }            // envia tudo no ligar()
    if (SyncCore.vazio(S)) {                                              // baixa tudo
      const r = sDaConta(remotos, S);
      gravarBase(uid, r.base); cb.setS(r.S); return 'baixar';
    }
    const conta = sDaConta(remotos, S);
    const escolha = await cb.pedirEscolha(SyncCore.resumo(conta.S), SyncCore.resumo(S));
    if (escolha === 'conta') { gravarBase(uid, conta.base); cb.setS(conta.S); return 'conta'; }
    if (escolha === 'aparelho') {
      // base = o que está na nuvem: o diff apaga lá o que não existe aqui e sobe o daqui
      const base = {}; remotos.forEach(d => { base[d.chave] = { col: d.col, id: d.id, data: d.data }; });
      gravarBase(uid, base); return 'aparelho';
    }
    return null; // cancelou
  }

  async function concluirLogin(u) {
    const r = await primeiroLogin(u);
    if (r === null) { await fb.a.signOut(auth); return false; }
    await ligar(u);
    return true;
  }

  // Baixa o SDK ANTES do toque em "Entrar" (chamado ao mostrar a área de Sincronização).
  // Sem isso, o download acontece depois do toque e o navegador bloqueia a janela do Google
  // em silêncio (o popup precisa abrir "colado" no gesto do usuário — principalmente no iPhone).
  function preparar() { return carregarSDK().catch(e => { console.error('[Sync] preparar', e); }); }

  async function entrar() {
    if (user) return true; // já logado: não refaz o "primeiro login" (toque duplo deslogava a pessoa)
    if (!fb) await carregarSDK(); // já preparado: nenhuma espera longa entre o toque e o popup
    const { a } = fb;
    const prov = new a.GoogleAuthProvider();
    let cred;
    try { cred = await a.signInWithPopup(auth, prov); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        sessionStorage.setItem('controla_sync_redirect', '1');
        await a.signInWithRedirect(auth, prov); return false; // volta pelo iniciar()
      }
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return false;
      throw e;
    }
    return await concluirLogin(cred.user);
  }

  async function iniciar() {
    const veioRedirect = sessionStorage.getItem('controla_sync_redirect');
    if (!localStorage.getItem(UID_KEY) && !veioRedirect) return; // sem login: nada a fazer
    try {
      await carregarSDK();
      if (veioRedirect) {
        sessionStorage.removeItem('controla_sync_redirect');
        const res = await fb.a.getRedirectResult(auth);
        if (res && res.user) { await concluirLogin(res.user); return; }
      }
      fb.a.onAuthStateChanged(auth, u => {
        if (u && u.uid === localStorage.getItem(UID_KEY)) { if (!user) ligar(u); }
        else if (!u) { Object.assign(estado, { logado: false }); status('off'); }
      });
    } catch (e) {
      console.error('[Sync] iniciar', e);
      Object.assign(estado, { logado: true }); status('offline'); // sem SDK (offline): tenta na próxima abertura
    }
  }

  function limparLocal(uid) {
    localStorage.removeItem(baseKey(uid));
    localStorage.removeItem(UID_KEY);
    Object.assign(estado, { logado: false, email: '', pendentes: 0, ultima: 0 });
  }
  async function sair() {
    await carregarSDK();
    const uid = user && user.uid;
    if (unsub) unsub(); unsub = null; clearTimeout(timer);
    await fb.a.signOut(auth);
    user = null;
    if (uid) limparLocal(uid);
    status('off');
  }
  async function apagarNuvem(uid) {
    const snap = await fb.f.getDocs(colRef(uid));
    const refs = snap.docs.map(d => d.ref);
    for (let i = 0; i < refs.length; i += 450) {
      const b = fb.f.writeBatch(db); refs.slice(i, i + 450).forEach(r => b.delete(r)); await b.commit();
    }
  }
  // Apagar todos os dados COM login: marca tudo como apagado (os outros aparelhos apagam também).
  async function apagarTudo() {
    if (!user) return;
    const uid = user.uid;
    const base = lerBase(uid);
    const dels = Object.keys(base).filter(k => k !== 'perfil-0').map(k => ({ chave: k, col: base[k].col, id: base[k].id }));
    await gravarOps(uid, [], dels);
    gravarBase(uid, {});
  }
  // O Google exige login recente para excluir. Confirmar ANTES de apagar qualquer dado
  // (senão a nuvem seria apagada e a exclusão da conta poderia falhar no meio).
  function precisaReautenticar() {
    if (!user) return false;
    const t = Date.parse(user.metadata && user.metadata.lastSignInTime);
    return !t || Date.now() - t > 4 * 60 * 1000;
  }
  async function reautenticar() { await fb.a.reauthenticateWithPopup(user, new fb.a.GoogleAuthProvider()); }
  async function excluirConta() {
    if (!user) return false;
    const uid = user.uid;
    if (unsub) unsub(); unsub = null; clearTimeout(timer);
    await apagarNuvem(uid);
    try { await user.delete(); }
    catch (e) {
      if (e.code !== 'auth/requires-recent-login') throw e;
      await fb.a.reauthenticateWithPopup(user, new fb.a.GoogleAuthProvider());
      await user.delete();
    }
    user = null; limparLocal(uid); status('off');
    return true;
  }

  window.addEventListener('online', () => { if (user) enviar(); });
  window.Sync = {
    estado,
    configurar(o) { cb = Object.assign(cb, o); },
    iniciar, preparar, entrar, agendar, enviar, sair, excluirConta, apagarTudo, precisaReautenticar, reautenticar,
    _interno: { lerBase, gravarBase, get user() { return user; }, get fb() { return fb; }, get auth() { return auth; }, get db() { return db; } },
  };
})();
