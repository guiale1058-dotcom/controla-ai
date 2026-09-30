const { test } = require('node:test');
const assert = require('node:assert');
const OC = require('../ordem-core.js');

test('mover: leva o item de uma posição para outra sem perder ninguém', () => {
  assert.deepStrictEqual(OC.mover(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepStrictEqual(OC.mover(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepStrictEqual(OC.mover(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
});

test('mover: não altera a lista original', () => {
  const orig = ['a', 'b', 'c'];
  OC.mover(orig, 0, 2);
  assert.deepStrictEqual(orig, ['a', 'b', 'c']);
});

// meios (centro vertical) de 4 cards de 60px com 10px de espaço: 30, 100, 170, 240
const mids = [30, 100, 170, 240];

test('novoIndice: sem passar do meio do vizinho, fica no lugar', () => {
  assert.strictEqual(OC.novoIndice(mids, 0, 30), 0);
  assert.strictEqual(OC.novoIndice(mids, 0, 95), 0);
});

test('novoIndice: arrastando pra baixo passa os vizinhos cujo meio foi ultrapassado', () => {
  assert.strictEqual(OC.novoIndice(mids, 0, 105), 1);
  assert.strictEqual(OC.novoIndice(mids, 0, 500), 3);
});

test('novoIndice: arrastando pra cima', () => {
  assert.strictEqual(OC.novoIndice(mids, 3, 165), 2);
  assert.strictEqual(OC.novoIndice(mids, 3, -50), 0);
});

test('deslocamento: quem abre espaço sobe ou desce a altura do card arrastado', () => {
  // arrastou o 0 para a posição 2: itens 1 e 2 sobem 70px
  assert.deepStrictEqual([0, 1, 2, 3].map(i => OC.deslocamento(i, 0, 2, 70)), [0, -70, -70, 0]);
  // arrastou o 3 para a posição 1: itens 1 e 2 descem 70px
  assert.deepStrictEqual([0, 1, 2, 3].map(i => OC.deslocamento(i, 3, 1, 70)), [0, 70, 70, 0]);
});
