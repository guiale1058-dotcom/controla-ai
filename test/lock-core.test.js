const { test } = require('node:test');
const assert = require('node:assert');
// Node 18/19 não expõem crypto global; garanta antes de carregar o módulo.
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
const LC = require('../lock-core.js');

test('randomSaltB64 gera valores diferentes e não vazios', () => {
  const a = LC.randomSaltB64(), b = LC.randomSaltB64();
  assert.ok(a.length > 0);
  assert.notStrictEqual(a, b);
});

test('pbkdf2Hash é determinístico para mesmo pin+sal+iters', async () => {
  const salt = LC.randomSaltB64();
  const h1 = await LC.pbkdf2Hash('1234', salt, 100000);
  const h2 = await LC.pbkdf2Hash('1234', salt, 100000);
  assert.strictEqual(h1, h2);
});

test('pbkdf2Hash muda com sal diferente', async () => {
  const h1 = await LC.pbkdf2Hash('1234', LC.randomSaltB64(), 100000);
  const h2 = await LC.pbkdf2Hash('1234', LC.randomSaltB64(), 100000);
  assert.notStrictEqual(h1, h2);
});

test('pbkdf2Verify aceita o PIN correto e rejeita o errado', async () => {
  const salt = LC.randomSaltB64();
  const hash = await LC.pbkdf2Hash('4321', salt, 100000);
  assert.strictEqual(await LC.pbkdf2Verify('4321', hash, salt, 100000), true);
  assert.strictEqual(await LC.pbkdf2Verify('0000', hash, salt, 100000), false);
});

test('b64u round-trip preserva os bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
  const dec = LC.b64uDecode(LC.b64uEncode(bytes));
  assert.deepStrictEqual(Array.from(dec), Array.from(bytes));
});

test('delayForAttempt segue a agenda 0/0/0/5s/15s/30s', () => {
  assert.strictEqual(LC.delayForAttempt(0), 0);
  assert.strictEqual(LC.delayForAttempt(2), 0);
  assert.strictEqual(LC.delayForAttempt(3), 5000);
  assert.strictEqual(LC.delayForAttempt(4), 15000);
  assert.strictEqual(LC.delayForAttempt(5), 30000);
  assert.strictEqual(LC.delayForAttempt(9), 30000);
});
