/* ids-core.js — ids numéricos que não se repetem entre aparelhos (testável em Node e no browser).
   Script clássico: no browser vira window.IdsCore; no Node vira module.exports. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.IdsCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Relógio em microssegundos: dois aparelhos só colidiriam criando no mesmo microssegundo.
  // Nunca menor ou igual ao último emitido (relógio atrasado / muitas chamadas no mesmo ms).
  function novoId(ultimo) {
    return Math.max(Date.now() * 1000, (ultimo || 0) + 1);
  }
  return { novoId };
});
