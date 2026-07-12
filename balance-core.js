/* balance-core.js — cálculo do "Disponível na conta" (testável em Node e no browser).
   Script clássico: no browser vira window.BalanceCore; no Node vira module.exports. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.BalanceCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Um evento negativo (dia 01) por mês em que a parcela ainda está ativa.
  function parcelaEventos(p) {
    const evs = [];
    const [sy, sm] = p.inicio.split('-').map(Number); // sm: 1-12
    const start = sy * 12 + (sm - 1) + p.pagas;       // 1º mês ainda não pago
    const end = sy * 12 + (sm - 1) + p.nparc - 1;     // último mês
    const mensal = Math.round((p.total / p.nparc) * 100) / 100;
    for (let idx = start; idx <= end; idx++) {
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1; // 1-12
      const date = y + '-' + String(m).padStart(2, '0') + '-01';
      evs.push({ date: date, delta: -mensal });
    }
    return evs;
  }

  // Eventos de caixa. tx/renda carregam `id` (ordem de lançamento, do S.nid);
  // parcelas não têm id (são um cronograma) e são separadas só pela data.
  function cashEvents(tx, renda, parcs) {
    const evs = [];
    (tx || []).forEach(function (t) {
      if (t.type === 'income') evs.push({ date: t.date, delta: (t.val || 0), id: t.id });
      else if (t.type === 'expense' && !t.cartaoId) evs.push({ date: t.date, delta: -(t.val || 0), id: t.id });
      else if (t.type === 'pagamento_fatura') evs.push({ date: t.date, delta: -(t.val || 0), id: t.id });
      // despesa no cartão: ignorada (afeta só a fatura)
    });
    (renda || []).forEach(function (r) {
      evs.push({ date: r.date, delta: (r.val || 0) - (r.custo || 0), id: r.id });
    });
    (parcs || []).forEach(function (p) {
      parcelaEventos(p).forEach(function (e) { evs.push(e); });
    });
    return evs;
  }

  // Um evento é "depois da correção" (entra no delta) se foi LANÇADO após a âncora.
  // Para tx/renda usamos a ordem de lançamento (id >= ancora.id) — resolve o caso de
  // um lançamento feito no MESMO dia da correção. Para parcelas (sem id) e dados
  // legados, caímos para a comparação por data (date > ancora.data).
  function eventoAposAncora(e, de, aid) {
    if (e.id !== undefined && e.id !== null && aid !== undefined && aid !== null) {
      return e.id >= aid;
    }
    return e.date > de;
  }

  // Disponível = ancora.valor + soma dos eventos lançados após a âncora, até hoje.
  function saldoDisponivel(ancora, tx, renda, parcs, hoje) {
    const base = (ancora && ancora.valor) || 0;
    const de = (ancora && ancora.data) || '0000-00-00';
    const aid = ancora ? ancora.id : undefined;
    const evs = cashEvents(tx, renda, parcs);
    return evs.reduce(function (s, e) {
      if (e.date > hoje) return s;                 // evento futuro ainda não conta
      return eventoAposAncora(e, de, aid) ? s + e.delta : s;
    }, base);
  }

  return { parcelaEventos: parcelaEventos, cashEvents: cashEvents, eventoAposAncora: eventoAposAncora, saldoDisponivel: saldoDisponivel };
});
