const { test } = require('node:test');
const assert = require('node:assert');
const PC = require('../parcels-core.js');

test('parcelaMensal divide e arredonda a 2 casas', () => {
  assert.strictEqual(PC.parcelaMensal(1000, 4), 250);
  assert.strictEqual(PC.parcelaMensal(100, 3), 33.33);
  assert.strictEqual(PC.parcelaMensal(300000, 300), 1000);
});

test('parcelaMensal com nparc invalido devolve 0', () => {
  assert.strictEqual(PC.parcelaMensal(1000, 0), 0);
  assert.strictEqual(PC.parcelaMensal(1000, -2), 0);
});

test('validarParcelamento aceita entrada valida', () => {
  const r = PC.validarParcelamento({ total: 5000, nparc: 10, pagas: 2 });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.erros, {});
});

test('validarParcelamento rejeita nparc < 2', () => {
  const r = PC.validarParcelamento({ total: 5000, nparc: 1, pagas: 0 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.nparc);
});

test('validarParcelamento rejeita total <= 0', () => {
  const r = PC.validarParcelamento({ total: 0, nparc: 4, pagas: 0 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.total);
});

test('validarParcelamento rejeita pagas >= nparc', () => {
  const r = PC.validarParcelamento({ total: 5000, nparc: 4, pagas: 4 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.erros.pagas);
});

test('parcelaRows devolve todos quando nparc <= max', () => {
  const rows = PC.parcelaRows(12, 3, 5, 24);
  assert.strictEqual(rows.length, 12);
  assert.deepStrictEqual(rows[0], { i: 0 });
});

test('parcelaRows resume quando nparc > max (com marcadores de gap)', () => {
  const rows = PC.parcelaRows(300, 10, 12, 24);
  assert.ok(rows.length < 300);
  assert.ok(rows.some(r => 'gap' in r));
  // inclui a parcela atual (index 12)
  assert.ok(rows.some(r => r.i === 12));
});
