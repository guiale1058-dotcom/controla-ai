const { test } = require('node:test');
const assert = require('node:assert');
const FC = require('../fatura-core.js');

// Cartão típico: fecha dia 26, vence dia 3 (vencimento no mês SEGUINTE ao fechamento)
const nub = { fecha: 26, venc: 3 };
// Cartão com vencimento no mesmo mês: fecha dia 3, vence dia 10
const bb = { fecha: 3, venc: 10 };

test('mesFatura: compra até o fechamento é da fatura do mês; depois vai pra próxima', () => {
  assert.deepStrictEqual(FC.mesFatura('2026-09-26', 26), { y: 2026, m: 8 });
  assert.deepStrictEqual(FC.mesFatura('2026-09-27', 26), { y: 2026, m: 9 });
  assert.deepStrictEqual(FC.mesFatura('2026-12-28', 26), { y: 2027, m: 0 });
});

test('faturaFechada: última fatura que já fechou', () => {
  assert.deepStrictEqual(FC.faturaFechada('2026-09-29', 26), { y: 2026, m: 8 });
  assert.deepStrictEqual(FC.faturaFechada('2026-10-02', 26), { y: 2026, m: 8 });
  assert.deepStrictEqual(FC.faturaFechada('2026-10-27', 26), { y: 2026, m: 9 });
  assert.deepStrictEqual(FC.faturaFechada('2027-01-02', 26), { y: 2026, m: 11 });
});

test('vencimento: cai no mês seguinte quando vence antes (ou no dia) do fechamento', () => {
  assert.strictEqual(FC.vencimento(2026, 8, nub), '2026-10-03');
  assert.strictEqual(FC.vencimento(2026, 11, nub), '2027-01-03');
  assert.strictEqual(FC.vencimento(2026, 8, bb), '2026-09-10');
});

test('vencimento: dia 31 em mês curto usa o último dia', () => {
  assert.strictEqual(FC.vencimento(2027, 0, { fecha: 20, venc: 31 }), '2027-01-31');
  assert.strictEqual(FC.vencimento(2027, 1, { fecha: 20, venc: 31 }), '2027-02-28');
});

test('mesDoPagamento: usa a fatura gravada no pagamento', () => {
  assert.deepStrictEqual(FC.mesDoPagamento({ date: '2026-10-02', fatY: 2026, fatM: 7 }, 26), { y: 2026, m: 7 });
});

test('mesDoPagamento: pagamento antigo (sem fatura gravada) vai pra última fatura fechada', () => {
  // pagou dia 02/10 a fatura que fechou 26/09 -> setembro (antes caía em outubro)
  assert.deepStrictEqual(FC.mesDoPagamento({ date: '2026-10-02' }, 26), { y: 2026, m: 8 });
  // cartão que vence no mesmo mês: pagou 08/10 a fatura que fechou 03/10 -> outubro (igual a antes)
  assert.deepStrictEqual(FC.mesDoPagamento({ date: '2026-10-08' }, 3), { y: 2026, m: 9 });
});

test('faturaAPagar: fatura fechada com saldo em aberto tem prioridade', () => {
  const rest = (y, m) => (m === 8 ? 200 : 89.9);
  assert.deepStrictEqual(FC.faturaAPagar('2026-09-29', 26, rest), { y: 2026, m: 8 });
});

test('faturaAPagar: fechada já quitada -> mostra a fatura aberta', () => {
  const rest = (y, m) => (m === 8 ? 0 : 89.9);
  assert.deepStrictEqual(FC.faturaAPagar('2026-09-29', 26, rest), { y: 2026, m: 9 });
});

test('diasAte: diferença em dias entre datas', () => {
  assert.strictEqual(FC.diasAte('2026-09-29', '2026-10-03'), 4);
  assert.strictEqual(FC.diasAte('2026-10-03', '2026-10-03'), 0);
  assert.strictEqual(FC.diasAte('2026-10-05', '2026-10-03'), -2);
});

test('mesVencimento: mês em que a compra é PAGA (vencimento da fatura dela)', () => {
  // fecha 26, vence 3: compra de 20/set entra na fatura de set, que vence em out
  assert.deepStrictEqual(FC.mesVencimento('2026-09-20', nub), { y: 2026, m: 9 });
  // depois do fechamento vai pra fatura de out, que vence em nov
  assert.deepStrictEqual(FC.mesVencimento('2026-09-27', nub), { y: 2026, m: 10 });
  // fecha 3, vence 10: fatura vence no mesmo mês do fechamento
  assert.deepStrictEqual(FC.mesVencimento('2026-10-01', bb), { y: 2026, m: 9 });
  assert.deepStrictEqual(FC.mesVencimento('2026-10-04', bb), { y: 2026, m: 10 });
  // virada de ano
  assert.deepStrictEqual(FC.mesVencimento('2026-12-10', nub), { y: 2027, m: 0 });
});

test('faturaQueVenceEm: qual fatura vence em um dado mês', () => {
  // fecha 26, vence 3: em outubro vence a fatura de setembro
  assert.deepStrictEqual(FC.faturaQueVenceEm(2026, 9, nub), { y: 2026, m: 8 });
  assert.deepStrictEqual(FC.faturaQueVenceEm(2027, 0, nub), { y: 2026, m: 11 });
  // fecha 3, vence 10: em outubro vence a própria fatura de outubro
  assert.deepStrictEqual(FC.faturaQueVenceEm(2026, 9, bb), { y: 2026, m: 9 });
  // é o inverso de vencimento()
  const f = FC.faturaQueVenceEm(2026, 9, nub);
  assert.strictEqual(FC.vencimento(f.y, f.m, nub), '2026-10-03');
});
