const { test } = require('node:test');
const assert = require('node:assert');
const IC = require('../ids-core.js');

test('novoId: baseado no relógio (microssegundos) e maior que ids antigos pequenos', () => {
  const id = IC.novoId(57);
  assert.ok(id > 1e15, 'deve ser timestamp*1000');
  assert.ok(id > 57);
});

test('novoId: sempre cresce, mesmo chamado várias vezes no mesmo milissegundo', () => {
  let ult = 0; const vistos = new Set();
  for (let i = 0; i < 1000; i++) { ult = IC.novoId(ult); assert.ok(!vistos.has(ult)); vistos.add(ult); }
});

test('novoId: nunca volta para trás se o último for maior que o relógio', () => {
  const futuro = Date.now() * 1000 + 5e9;
  assert.strictEqual(IC.novoId(futuro), futuro + 1);
});

test('novoId: continua inteiro seguro', () => {
  assert.ok(Number.isSafeInteger(IC.novoId(0)));
});
