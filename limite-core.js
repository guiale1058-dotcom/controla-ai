/* limite-core.js — limite dos cartões, inclusive quando o banco libera UM limite
   para vários cartões (testável em Node e no browser).
   Script clássico: no browser vira window.LimiteCore; no Node vira module.exports.
   usadoDe(cartaoId) devolve quanto do limite aquele cartão está usando. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.LimiteCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  function compartilha(banco) {
    return !!(banco && banco.limiteCompartilhado > 0);
  }
  function soma(cartoes, f) {
    return cartoes.reduce(function (s, c) { return s + f(c); }, 0);
  }
  // Limite e uso do banco inteiro: o compartilhado, ou a soma dos limites dos cartões.
  function visaoBanco(banco, cartoesDoBanco, usadoDe) {
    const comp = compartilha(banco);
    return {
      compartilhado: comp,
      limite: comp ? banco.limiteCompartilhado : soma(cartoesDoBanco, c => c.limite || 0),
      usado: soma(cartoesDoBanco, c => usadoDe(c.id)),
    };
  }
  // O que mostrar em um cartão. Com limite compartilhado, o disponível desconta o uso
  // de todos os cartões do banco; usadoCartao continua sendo só o dele.
  function visaoCartao(cartao, banco, cartoesDoBanco, usadoDe) {
    const usadoCartao = usadoDe(cartao.id);
    if (!compartilha(banco)) {
      const limite = cartao.limite || 0;
      return { compartilhado: false, limite: limite, usado: usadoCartao, usadoCartao: usadoCartao, disponivel: limite - usadoCartao };
    }
    const b = visaoBanco(banco, cartoesDoBanco, usadoDe);
    return { compartilhado: true, limite: b.limite, usado: b.usado, usadoCartao: usadoCartao, disponivel: b.limite - b.usado };
  }
  // Soma de todos os bancos: limite compartilhado conta uma vez só.
  function totais(bancos, cartoes, usadoDe) {
    let limite = 0, usado = 0;
    const vistos = {};
    bancos.forEach(function (b) {
      const cs = cartoes.filter(c => c.bancoId === b.id);
      cs.forEach(c => { vistos[c.id] = true; });
      const v = visaoBanco(b, cs, usadoDe);
      limite += v.limite; usado += v.usado;
    });
    cartoes.forEach(function (c) { // cartão sem banco (não deveria existir) conta sozinho
      if (vistos[c.id]) return;
      limite += c.limite || 0; usado += usadoDe(c.id);
    });
    return { limite: limite, usado: usado };
  }
  return { compartilha, visaoBanco, visaoCartao, totais };
});
