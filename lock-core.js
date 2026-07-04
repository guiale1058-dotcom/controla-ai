/* lock-core.js — lógica pura da trava de acesso (testável em Node e no browser).
   Script clássico: no browser vira window.LockCore; no Node vira module.exports. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.LockCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  const enc = new TextEncoder();

  function bytesToB64(bytes) {
    let s = '';
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  function b64uEncode(buf) {
    return bytesToB64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return b64ToBytes(b64);
  }
  function randomSaltB64() {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return bytesToB64(salt);
  }
  async function pbkdf2Hash(pin, saltB64, iters) {
    const keyMat = await crypto.subtle.importKey(
      'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: iters, hash: 'SHA-256' },
      keyMat, 256);
    return bytesToB64(new Uint8Array(bits));
  }
  async function pbkdf2Verify(pin, hashB64, saltB64, iters) {
    const got = await pbkdf2Hash(pin, saltB64, iters);
    if (got.length !== hashB64.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hashB64.charCodeAt(i);
    return diff === 0;
  }
  function delayForAttempt(failCount) {
    if (failCount < 3) return 0;
    const table = [5000, 15000, 30000];
    return table[Math.min(failCount - 3, table.length - 1)];
  }
  return { randomSaltB64, pbkdf2Hash, pbkdf2Verify, b64uEncode, b64uDecode, delayForAttempt };
});
