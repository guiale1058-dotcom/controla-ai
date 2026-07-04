/* parcels-core.js — lógica pura de parcelamento (testável em Node e no browser).
   Script clássico: no browser vira window.ParcelsCore; no Node vira module.exports. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.ParcelsCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  function parcelaMensal(total, nparc) {
    const n = parseInt(nparc, 10);
    if (!n || n < 1) return 0;
    return Math.round((total / n) * 100) / 100;
  }
  function validarParcelamento({ total, nparc, pagas }) {
    const erros = {};
    const n = parseInt(nparc, 10);
    const p = parseInt(pagas, 10) || 0;
    if (!(total > 0)) erros.total = 'Informe o valor total';
    if (!n || n < 2) erros.nparc = 'Mínimo de 2 parcelas (use "À vista" para pagamento único)';
    if (n && p >= n) erros.pagas = 'Parcelas pagas deve ser menor que o total';
    if (p < 0) erros.pagas = 'Valor inválido';
    return { ok: Object.keys(erros).length === 0, erros };
  }
  function parcelaRows(nparc, pagas, curIndex, max) {
    max = max || 24;
    const rows = [];
    if (nparc <= max) {
      for (let i = 0; i < nparc; i++) rows.push({ i });
      return rows;
    }
    // Janela: primeira que falta (pagas), algumas ao redor da atual, e a última.
    const want = new Set();
    want.add(pagas);
    for (let d = -3; d <= 8; d++) { const k = curIndex + d; if (k >= 0 && k < nparc) want.add(k); }
    want.add(nparc - 1);
    const idx = [...want].filter(k => k >= 0 && k < nparc).sort((a, b) => a - b);
    let prev = -1;
    for (const k of idx) {
      if (k > prev + 1) rows.push({ gap: k - prev - 1 });
      rows.push({ i: k });
      prev = k;
    }
    return rows;
  }
  return { parcelaMensal, validarParcelamento, parcelaRows };
});
