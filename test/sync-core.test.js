const { test } = require('node:test');
const assert = require('node:assert');
const SC = require('../sync-core.js');

const base0 = () => ({
  perfil: { nome: 'Gui', salario: 3000, saldoConta: { valor: 100, data: '2026-09-29', id: 5 } },
  bancos: [{ id: 1, nome: 'Nubank', cor: '#8a05be' }, { id: 2, nome: 'Inter', cor: '#f60' }],
  cartoes: [{ id: 3, bancoId: 1, nome: 'Roxinho', limite: 2000, venc: 3, fecha: 26 }],
  tx: [{ id: 10, type: 'expense', desc: 'Mercado', val: 50, cat: 'alimentacao', date: '2026-09-10' }],
  renda: [], parcs: [], nid: 10,
});

test('itensDe: um item por registro + perfil com a ordem dos bancos', () => {
  const m = SC.itensDe(base0());
  assert.deepStrictEqual(Object.keys(m).sort(), ['bancos-1', 'bancos-2', 'cartoes-3', 'perfil-0', 'tx-10']);
  assert.deepStrictEqual(m['perfil-0'].data.ordemBancos, [1, 2]);
  assert.strictEqual(m['tx-10'].col, 'tx');
});

test('itensDe: remove undefined (Firestore não aceita)', () => {
  const S = base0(); S.tx.push({ id: 11, type: 'pagamento_fatura', val: 9, date: '2026-09-11', fatY: undefined, fatM: undefined });
  const m = SC.itensDe(S);
  assert.ok(!('fatY' in m['tx-11'].data));
});

test('diff: detecta criado, alterado e apagado', () => {
  const S = base0(); const base = SC.itensDe(S);
  S.tx.push({ id: 11, type: 'income', desc: 'Pix', val: 20, date: '2026-09-12' });
  S.bancos[1].nome = 'Inter PJ';
  S.cartoes = [];
  const d = SC.diff(base, SC.itensDe(S));
  assert.deepStrictEqual(d.upserts.map(u => u.chave).sort(), ['bancos-2', 'tx-11']);
  assert.deepStrictEqual(d.deletes.map(x => x.chave), ['cartoes-3']);
});

test('diff: ordem diferente das chaves do objeto não conta como mudança', () => {
  const S = base0(); const base = SC.itensDe(S);
  S.tx[0] = { date: '2026-09-10', cat: 'alimentacao', val: 50, desc: 'Mercado', type: 'expense', id: 10 };
  assert.deepStrictEqual(SC.diff(base, SC.itensDe(S)), { upserts: [], deletes: [] });
});

test('diff: reordenar bancos muda só o perfil', () => {
  const S = base0(); const base = SC.itensDe(S);
  S.bancos.reverse();
  assert.deepStrictEqual(SC.diff(base, SC.itensDe(S)).upserts.map(u => u.chave), ['perfil-0']);
});

test('aplicarRemotos: cria, altera e apaga localmente e atualiza a base', () => {
  const S = base0(); const base = SC.itensDe(S);
  const docs = [
    { chave: 'tx-20', col: 'tx', id: 20, data: { id: 20, type: 'expense', desc: 'Luz', val: 90, date: '2026-09-15' }, del: false },
    { chave: 'bancos-2', col: 'bancos', id: 2, data: { id: 2, nome: 'Inter', cor: '#000' }, del: false },
    { chave: 'tx-10', col: 'tx', id: 10, data: null, del: true },
  ];
  const r = SC.aplicarRemotos(S, base, docs);
  assert.deepStrictEqual(r.S.tx.map(t => t.id), [20]);
  assert.strictEqual(r.S.bancos.find(b => b.id === 2).cor, '#000');
  assert.ok(!r.base['tx-10'] && r.base['tx-20']);
  assert.strictEqual(S.tx.length, 1, 'não muta a entrada');
});

test('aplicarRemotos: NÃO sobrescreve item com edição local pendente', () => {
  const S = base0(); const base = SC.itensDe(S);
  S.tx[0].val = 999; // editado aqui, ainda não enviado
  const docs = [{ chave: 'tx-10', col: 'tx', id: 10, data: { id: 10, type: 'expense', desc: 'Mercado', val: 1, date: '2026-09-10' }, del: false }];
  const r = SC.aplicarRemotos(S, base, docs);
  assert.strictEqual(r.S.tx[0].val, 999);
});

test('aplicarRemotos: perfil aplica dados e reordena bancos; nid sobe para o maior id visto', () => {
  const S = base0(); const base = SC.itensDe(S);
  const perfil = Object.assign({}, S.perfil, { nome: 'Guilherme', ordemBancos: [2, 1] });
  const docs = [
    { chave: 'perfil-0', col: 'perfil', id: 0, data: perfil, del: false },
    { chave: 'tx-1790000000000000', col: 'tx', id: 1790000000000000, data: { id: 1790000000000000, type: 'income', val: 1, date: '2026-09-20' }, del: false },
  ];
  const r = SC.aplicarRemotos(S, base, docs);
  assert.strictEqual(r.S.perfil.nome, 'Guilherme');
  assert.ok(!('ordemBancos' in r.S.perfil));
  assert.deepStrictEqual(r.S.bancos.map(b => b.id), [2, 1]);
  assert.strictEqual(r.S.nid, 1790000000000000);
});

test('aplicarRemotos: banco novo que não está na ordem vai para o fim', () => {
  const S = base0(); const base = SC.itensDe(S);
  const docs = [
    { chave: 'bancos-7', col: 'bancos', id: 7, data: { id: 7, nome: 'BB', cor: '#ff0' }, del: false },
    { chave: 'perfil-0', col: 'perfil', id: 0, data: Object.assign({}, S.perfil, { ordemBancos: [2, 1] }), del: false },
  ];
  assert.deepStrictEqual(SC.aplicarRemotos(S, base, docs).S.bancos.map(b => b.id), [2, 1, 7]);
});

test('vazio: perfil de onboarding sem lançamentos conta como vazio', () => {
  assert.strictEqual(SC.vazio({ perfil: { nome: 'X', salario: 1 }, bancos: [], cartoes: [], tx: [], renda: [], parcs: [] }), true);
  assert.strictEqual(SC.vazio(base0()), false);
});

test('resumo: conta lançamentos (tx + renda), bancos, cartões e parcelamentos', () => {
  const S = base0(); S.renda.push({ id: 30, date: '2026-09-01', val: 1 });
  assert.deepStrictEqual(SC.resumo(S), { lancamentos: 2, bancos: 2, cartoes: 1, parcs: 0 });
});

test('pendentes: chaves que mudaram localmente desde a base', () => {
  const S = base0(); const base = SC.itensDe(S);
  S.tx[0].val = 7; S.cartoes = [];
  assert.deepStrictEqual([...SC.pendentes(base, S)].sort(), ['cartoes-3', 'tx-10']);
});

// Ruling do pre-flight: montar S só com o que veio da nuvem (baixar / "usar os da conta").
test('deRemotos: monta S e base só com os dados da nuvem, INCLUINDO o perfil da conta', () => {
  const docs = [
    { chave: 'perfil-0', col: 'perfil', id: 0, data: { nome: 'Da Conta', salario: 5000, ordemBancos: [1] }, del: false },
    { chave: 'bancos-1', col: 'bancos', id: 1, data: { id: 1, nome: 'Nubank' }, del: false },
    { chave: 'tx-99', col: 'tx', id: 99, data: { id: 99, type: 'income', val: 5, date: '2026-09-01' }, del: false },
    { chave: 'tx-98', col: 'tx', id: 98, data: null, del: true },
  ];
  const r = SC.deRemotos(docs, 50);
  assert.strictEqual(r.S.perfil.nome, 'Da Conta');
  assert.deepStrictEqual(r.S.bancos.map(b => b.id), [1]);
  assert.deepStrictEqual(r.S.tx.map(t => t.id), [99]);
  assert.deepStrictEqual(r.S.renda, []);
  assert.strictEqual(r.S.nid, 99);
  assert.deepStrictEqual(SC.diff(r.base, SC.itensDe(r.S)), { upserts: [], deletes: [] }, 'base = S: nada pendente');
});

test('deRemotos: nid nunca desce abaixo do nid local', () => {
  assert.strictEqual(SC.deRemotos([], 1790000000000000).S.nid, 1790000000000000);
});
