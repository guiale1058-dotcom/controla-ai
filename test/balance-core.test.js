const { test } = require('node:test');
const assert = require('node:assert');
const BC = require('../balance-core.js');

test('parcelaEventos gera um evento negativo por mes ativo, no dia 01', () => {
  // inicio jan/2026, 2 pagas, 4 parcelas de 250 -> faltam mar e abr
  const evs = BC.parcelaEventos({ inicio: '2026-01', pagas: 2, nparc: 4, total: 1000 });
  assert.deepStrictEqual(evs, [
    { date: '2026-03-01', delta: -250 },
    { date: '2026-04-01', delta: -250 },
  ]);
});

test('parcelaEventos sem parcelas pagas cobre todos os meses', () => {
  const evs = BC.parcelaEventos({ inicio: '2026-11', pagas: 0, nparc: 3, total: 300 });
  assert.deepStrictEqual(evs.map(e => e.date), ['2026-11-01', '2026-12-01', '2027-01-01']);
  assert.ok(evs.every(e => e.delta === -100));
});

test('cashEvents: receita soma, renda soma liquido, despesa conta subtrai, fatura subtrai, cartao ignora', () => {
  const tx = [
    { type: 'income', val: 200, date: '2026-07-15' },
    { type: 'expense', val: 50, date: '2026-07-16' },                 // conta
    { type: 'expense', val: 999, date: '2026-07-17', cartaoId: 'c1' },// cartao -> ignora
    { type: 'pagamento_fatura', val: 80, date: '2026-07-18' },
  ];
  const renda = [{ val: 100, custo: 30, date: '2026-07-19' }];        // liquido 70
  const evs = BC.cashEvents(tx, renda, []);
  const total = evs.reduce((s, e) => s + e.delta, 0);
  assert.strictEqual(total, 200 - 50 - 80 + 70); // 140
  assert.ok(!evs.some(e => e.delta === -999));   // cartao nunca entra
});

test('saldoDisponivel soma apenas eventos apos a ancora e ate hoje', () => {
  const ancora = { valor: 662, data: '2026-07-12' };
  const tx = [
    { type: 'income', val: 100, date: '2026-07-10' }, // antes da ancora -> ignora
    { type: 'income', val: 200, date: '2026-07-20' }, // depois -> soma
    { type: 'expense', val: 50, date: '2026-08-01' }, // depois de hoje -> ignora
  ];
  const r = BC.saldoDisponivel(ancora, tx, [], [], '2026-07-25');
  assert.strictEqual(r, 662 + 200);
});

test('saldoDisponivel desconta parcela do mes que chega depois da ancora', () => {
  const ancora = { valor: 1000, data: '2026-07-12' };
  const parcs = [{ inicio: '2026-07', pagas: 0, nparc: 4, total: 400 }]; // 100/mes
  // jul/01 <= ancora (12) -> nao conta; ago/01 e set/01 contam ate hoje
  const r = BC.saldoDisponivel(ancora, [], [], parcs, '2026-09-30');
  assert.strictEqual(r, 1000 - 100 - 100);
});

test('saldoDisponivel: evento exatamente na data da ancora NAO conta; exatamente em hoje conta', () => {
  const ancora = { valor: 100, data: '2026-07-12' };
  const tx = [
    { type: 'income', val: 10, date: '2026-07-12' }, // == ancora -> exclui
    { type: 'income', val: 5, date: '2026-07-25' },  // == hoje -> inclui
  ];
  const r = BC.saldoDisponivel(ancora, tx, [], [], '2026-07-25');
  assert.strictEqual(r, 105);
});

test('parcelaEventos com parcela quitada (pagas >= nparc) devolve vazio', () => {
  const evs = BC.parcelaEventos({ inicio: '2026-01', pagas: 4, nparc: 4, total: 1000 });
  assert.deepStrictEqual(evs, []);
});

test('parcelaEventos arredonda a parcela mensal a 2 casas (consistente com parcelaMensal)', () => {
  const evs = BC.parcelaEventos({ inicio: '2026-01', pagas: 0, nparc: 3, total: 1000 });
  assert.ok(evs.every(e => e.delta === -333.33));
});

// ── Fix crítico #1: lançamento no MESMO dia da correção usa ordem (id), não só a data
test('saldoDisponivel: lançamento no mesmo dia da correção conta pela ordem (id)', () => {
  const ancora = { valor: 1000, data: '2026-07-12', id: 10 };
  const tx = [
    { type: 'expense', val: 30, date: '2026-07-10', id: 8 },  // lançado antes -> exclui (baked in)
    { type: 'expense', val: 100, date: '2026-07-12', id: 10 },// mesmo dia, lançado depois -> conta
    { type: 'income', val: 50, date: '2026-07-12', id: 11 },  // mesmo dia, depois -> conta
  ];
  const r = BC.saldoDisponivel(ancora, tx, [], [], '2026-07-12');
  assert.strictEqual(r, 1000 - 100 + 50); // 950
});

test('saldoDisponivel: id >= ancora.id conta, id < ancora.id não conta (independe da data)', () => {
  const ancora = { valor: 200, data: '2026-07-12', id: 5 };
  const tx = [
    { type: 'income', val: 40, date: '2026-07-01', id: 4 }, // id antigo, data anterior -> exclui
    { type: 'income', val: 60, date: '2026-07-01', id: 5 }, // id >= ancora mas data anterior... conta? só se <= hoje. data 07-01 <= hoje -> conta
  ];
  // ambos com data <= hoje; separa pelo id: exclui 40 (id 4), inclui 60 (id 5)
  const r = BC.saldoDisponivel(ancora, tx, [], [], '2026-07-25');
  assert.strictEqual(r, 260);
});

test('saldoDisponivel: evento futuro não conta mesmo com id >= ancora.id', () => {
  const ancora = { valor: 500, data: '2026-07-12', id: 3 };
  const tx = [
    { type: 'income', val: 100, date: '2026-08-01', id: 3 }, // id ok, mas futuro -> não conta ainda
    { type: 'income', val: 20, date: '2026-07-15', id: 4 },  // id ok e <= hoje -> conta
  ];
  const r = BC.saldoDisponivel(ancora, tx, [], [], '2026-07-20');
  assert.strictEqual(r, 520);
});

test('saldoDisponivel: sem id na âncora (legado) cai no fallback por data', () => {
  const ancora = { valor: 100, data: '2026-07-12' }; // sem id
  const tx = [
    { type: 'income', val: 10, date: '2026-07-12', id: 9 }, // == data da âncora -> fallback exclui
    { type: 'income', val: 5, date: '2026-07-20', id: 10 }, // depois -> inclui
  ];
  const r = BC.saldoDisponivel(ancora, tx, [], [], '2026-07-25');
  assert.strictEqual(r, 105);
});
