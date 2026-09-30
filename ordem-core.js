/* ordem-core.js — cálculos de "segurar e arrastar para reordenar" (testável em Node e no browser).
   Script clássico: no browser vira window.OrdemCore; no Node vira module.exports. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.OrdemCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Nova lista com o item da posição `de` levado para a posição `para`.
  function mover(lista, de, para) {
    const out = lista.slice();
    const [item] = out.splice(de, 1);
    out.splice(para, 0, item);
    return out;
  }
  // Posição de destino: quantos OUTROS itens têm o meio acima do centro do item arrastado.
  // `meios` = centro vertical de cada item na posição original.
  function novoIndice(meios, de, centro) {
    let n = 0;
    meios.forEach(function (m, i) { if (i !== de && m < centro) n++; });
    return n;
  }
  // Quanto o item `i` deve se deslocar para abrir espaço (altura = card arrastado + espaço).
  function deslocamento(i, de, para, altura) {
    if (i === de) return 0;
    if (de < para && i > de && i <= para) return -altura;
    if (para < de && i >= para && i < de) return altura;
    return 0;
  }
  return { mover, novoIndice, deslocamento };
});
