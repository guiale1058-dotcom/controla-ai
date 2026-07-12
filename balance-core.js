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
      evs.push({ date: date, delta: -mensal, id: p.id });
    }
    return evs;
  }

  // Eventos de caixa. tx/renda e parcelas carregam `id` (ordem de lançamento, do S.nid).
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

  // A âncora é o saldo real do banco NA data `de`, então já reflete tudo que se moveu
  // até `de`. Um evento entra no delta conforme QUANDO o dinheiro se moveu (a data):
  //  - date > de  -> moveu depois da âncora -> conta.
  //  - date < de  -> moveu antes -> já embutido no valor da âncora -> não conta
  //                  (mesmo que tenha sido LANÇADO depois — ex.: gasto retroativo).
  //  - date == de -> mesmo dia da correção: desempata pela ordem de lançamento (id);
  //                  id >= ancora.id = lançado após a correção -> conta (ex.: gasto às 14h
  //                  depois de corrigir às 10h). Sem id, é conservador e não conta.
  function eventoAposAncora(e, de, aid) {
    if (e.date > de) return true;
    if (e.date < de) return false;
    if (e.id !== undefined && e.id !== null && aid !== undefined && aid !== null) {
      return e.id >= aid;
    }
    return false;
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
