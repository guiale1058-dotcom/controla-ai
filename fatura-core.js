/* fatura-core.js — regras de fatura de cartão (testável em Node e no browser).
   Script clássico: no browser vira window.FaturaCore; no Node vira module.exports.
   Meses são 0-11 (igual ao Date do JS). Datas no formato 'AAAA-MM-DD'. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.FaturaCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  function iso(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function soma(y, m, n) {
    const idx = y * 12 + m + n;
    return { y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 };
  }
  // Fatura a que uma data pertence: até o dia do fechamento é a do mês; depois, a do mês seguinte.
  function mesFatura(dataISO, fecha) {
    const [y, m, d] = dataISO.split('-').map(Number);
    return d > (fecha || 1) ? soma(y, m - 1, 1) : { y: y, m: m - 1 };
  }
  // Última fatura que já fechou na data (a que está esperando pagamento).
  function faturaFechada(dataISO, fecha) {
    const f = mesFatura(dataISO, fecha);
    return soma(f.y, f.m, -1);
  }
  // Vencimento da fatura do mês (y,m). Se o cartão vence antes ou no dia do fechamento,
  // o vencimento é no mês seguinte (ex.: fecha 26, vence 3 -> fatura de set vence 03/out).
  function vencimento(y, m, c) {
    const fecha = c.fecha || 1, venc = c.venc || 10;
    const alvo = venc > fecha ? { y: y, m: m } : soma(y, m, 1);
    const ultimo = new Date(alvo.y, alvo.m + 1, 0).getDate();
    return iso(alvo.y, alvo.m, Math.min(venc, ultimo));
  }
  // Mês em que uma compra é PAGA: o do vencimento da fatura em que ela caiu.
  function mesVencimento(dataISO, c) {
    const f = mesFatura(dataISO, c.fecha || 1);
    const v = vencimento(f.y, f.m, c).split('-').map(Number);
    return { y: v[0], m: v[1] - 1 };
  }
  // Fatura que vence no mês (y,m) — o inverso de vencimento().
  function faturaQueVenceEm(y, m, c) {
    return (c.venc || 10) > (c.fecha || 1) ? { y: y, m: m } : soma(y, m, -1);
  }
  // Fatura que um pagamento quita: a gravada nele; se for antigo (sem fatura gravada),
  // a última fatura fechada na data do pagamento.
  function mesDoPagamento(t, fecha) {
    if (typeof t.fatY === 'number' && typeof t.fatM === 'number') return { y: t.fatY, m: t.fatM };
    return faturaFechada(t.date, fecha);
  }
  // Fatura que o usuário deve pagar agora: a fechada, se ainda tem saldo; senão a aberta.
  function faturaAPagar(hojeISO, fecha, restante) {
    const fech = faturaFechada(hojeISO, fecha);
    if (restante(fech.y, fech.m) > 0) return fech;
    return mesFatura(hojeISO, fecha);
  }
  function diasAte(deISO, ateISO) {
    const a = deISO.split('-').map(Number), b = ateISO.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }
  return { mesFatura, faturaFechada, vencimento, mesVencimento, faturaQueVenceEm, mesDoPagamento, faturaAPagar, diasAte };
});
