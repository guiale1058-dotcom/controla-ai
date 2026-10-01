const { test } = require('node:test');
const assert = require('node:assert');
const LC = require('../limite-core.js');

// Caso real: Banco do Brasil libera R$ 2.605 para os dois cartões juntos.
const bb = { id: 2, nome: 'Banco do Brasil', limiteCompartilhado: 2605 };
const nu = { id: 1, nome: 'Nubank' };
const ouro = { id: 10, bancoId: 2, limite: 2605 };
const smiles = { id: 11, bancoId: 2, limite: 2605 };
const roxo = { id: 12, bancoId: 1, limite: 400 };
const usado = { 10: 2604.07, 11: 35.65, 12: 315 };
const usadoDe = id => usado[id] || 0;
const r2 = x => Math.round(x * 100) / 100;

test('compartilha: só quando o banco tem limite compartilhado maior que zero', () => {
  assert.strictEqual(LC.compartilha(bb), true);
  assert.strictEqual(LC.compartilha(nu), false);
  assert.strictEqual(LC.compartilha({ id: 3, limiteCompartilhado: 0 }), false);
  assert.strictEqual(LC.compartilha(undefined), false);
});

test('visaoCartao: sem limite compartilhado, cada cartão usa o próprio limite', () => {
  const v = LC.visaoCartao(roxo, nu, [roxo], usadoDe);
  assert.deepStrictEqual(v, { compartilhado: false, limite: 400, usado: 315, usadoCartao: 315, disponivel: 85 });
});

test('visaoCartao: com limite compartilhado, o disponível desconta o uso de TODOS os cartões do banco', () => {
  const v = LC.visaoCartao(smiles, bb, [ouro, smiles], usadoDe);
  assert.strictEqual(v.compartilhado, true);
  assert.strictEqual(v.limite, 2605);
  assert.strictEqual(v.usadoCartao, 35.65);
  assert.strictEqual(r2(v.usado), 2639.72);
  assert.strictEqual(r2(v.disponivel), -34.72); // estourou: fica negativo, igual ao banco
});

test('visaoBanco: limite do banco é o compartilhado, ou a soma dos cartões', () => {
  const a = LC.visaoBanco(bb, [ouro, smiles], usadoDe);
  assert.strictEqual(a.limite, 2605);
  assert.strictEqual(r2(a.usado), 2639.72);
  assert.strictEqual(a.compartilhado, true);
  const b = LC.visaoBanco(nu, [roxo], usadoDe);
  assert.deepStrictEqual(b, { compartilhado: false, limite: 400, usado: 315 });
});

test('totais: limite compartilhado conta uma vez só (não dobra)', () => {
  const t = LC.totais([nu, bb], [ouro, smiles, roxo], usadoDe);
  assert.strictEqual(t.limite, 3005); // 2605 + 400, e não 5610
  assert.strictEqual(r2(t.usado), 2954.72);
});

test('totais: cartão cujo banco sumiu ainda conta com o próprio limite', () => {
  const orfao = { id: 13, bancoId: 99, limite: 1000 };
  const t = LC.totais([nu], [roxo, orfao], id => (id === 13 ? 100 : usadoDe(id)));
  assert.strictEqual(t.limite, 1400);
  assert.strictEqual(t.usado, 415);
});
