/* sync-core.js — lógica pura da sincronização (testável em Node e no browser).
   Script clássico: no browser vira window.SyncCore; no Node vira module.exports.
   "Item" = {col, id, data}. "Base" = mapa chave->item da última sincronização confirmada. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.SyncCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = ['tx', 'renda', 'parcs', 'bancos', 'cartoes'];
  function chave(col, id) { return col + '-' + id; }
  function limpo(o) { return JSON.parse(JSON.stringify(o)); } // tira undefined e clona
  function estavel(v) { // JSON com chaves ordenadas: igualdade independe da ordem dos campos
    if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  function igual(a, b) { return estavel(a) === estavel(b); }

  function itensDe(S) {
    const m = {};
    COLS.forEach(function (c) {
      (S[c] || []).forEach(function (it) { m[chave(c, it.id)] = { col: c, id: it.id, data: limpo(it) }; });
    });
    const perfil = limpo(Object.assign({}, S.perfil || {}, { ordemBancos: (S.bancos || []).map(b => b.id) }));
    m['perfil-0'] = { col: 'perfil', id: 0, data: perfil };
    return m;
  }

  function diff(base, atual) {
    const upserts = [], deletes = [];
    Object.keys(atual).forEach(function (k) {
      if (!base[k] || !igual(base[k].data, atual[k].data)) upserts.push(Object.assign({ chave: k }, atual[k]));
    });
    Object.keys(base).forEach(function (k) {
      if (!atual[k]) deletes.push({ chave: k, col: base[k].col, id: base[k].id });
    });
    return { upserts: upserts, deletes: deletes };
  }

  function pendentes(base, S) {
    const d = diff(base, itensDe(S));
    return new Set(d.upserts.map(u => u.chave).concat(d.deletes.map(x => x.chave)));
  }

  function aplicarRemotos(S, base, docs) {
    const pend = pendentes(base, S);
    const novo = limpo(S);
    const nb = Object.assign({}, base);
    let ordem = null;
    let maxId = novo.nid || 0;
    docs.forEach(function (d) {
      if (pend.has(d.chave)) return; // edição local ainda não enviada vence (sobe depois)
      if (d.col === 'perfil') {
        if (d.del || !d.data) return;
        const p = limpo(d.data);
        ordem = p.ordemBancos || null;
        delete p.ordemBancos;
        novo.perfil = p;
        nb[d.chave] = { col: 'perfil', id: 0, data: limpo(d.data) };
        return;
      }
      if (COLS.indexOf(d.col) < 0) return;
      const lista = novo[d.col] || (novo[d.col] = []);
      const i = lista.findIndex(x => x.id === d.id);
      if (d.del) {
        if (i >= 0) lista.splice(i, 1);
        delete nb[d.chave];
      } else {
        const data = limpo(d.data);
        if (i >= 0) lista[i] = data; else lista.push(data);
        nb[d.chave] = { col: d.col, id: d.id, data: limpo(d.data) };
        if (typeof d.id === 'number' && d.id > maxId) maxId = d.id;
      }
    });
    if (ordem) {
      const pos = {}; ordem.forEach((id, i) => { pos[id] = i; });
      novo.bancos = (novo.bancos || []).slice().sort(function (a, b) {
        const pa = a.id in pos ? pos[a.id] : 1e9, pb = b.id in pos ? pos[b.id] : 1e9;
        return pa - pb;
      });
    }
    novo.nid = maxId;
    return { S: novo, base: nb };
  }

  // S e base montados SÓ com o que veio da nuvem (baixar tudo / "usar os da conta").
  // A base parte de itensDe(vazio) para nada contar como pendente — senão o perfil remoto seria ignorado.
  function deRemotos(docs, nid) {
    const vazioS = { perfil: {}, bancos: [], cartoes: [], tx: [], renda: [], parcs: [], nid: nid || 0 };
    return aplicarRemotos(vazioS, itensDe(vazioS), docs);
  }

  function resumo(S) {
    return {
      lancamentos: (S.tx || []).length + (S.renda || []).length,
      bancos: (S.bancos || []).length, cartoes: (S.cartoes || []).length, parcs: (S.parcs || []).length,
    };
  }
  function vazio(S) { return COLS.every(c => !(S[c] || []).length); }

  return { COLS, chave, itensDe, diff, pendentes, aplicarRemotos, deRemotos, resumo, vazio };
});
