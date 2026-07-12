# "Disponível na conta" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar na home um número "Disponível na conta" que representa o dinheiro real do usuário agora, ajustável com 1 toque e independente do mês navegado.

**Architecture:** Nova lógica pura em `balance-core.js` (padrão dos `*-core.js` já existentes, testada com `node:test`) calcula o disponível como **âncora + soma dos eventos de caixa datados após a âncora**. Cada evento de caixa (receita, renda extra líquida, despesa paga pela conta, pagamento de fatura, parcela do mês) é datado; despesa no cartão não conta. O `index.html` passa a guardar `S.perfil.saldoConta = {valor, data}` e consome a lógica nova na home, na config, no onboarding e num modal "Corrigir".

**Tech Stack:** HTML/CSS/JS vanilla num único `index.html`; módulos de lógica pura em scripts clássicos UMD (`window.X` no browser / `module.exports` no Node); testes com `node:test` + `node:assert`; PWA com service worker (`sw.js`).

## Global Constraints

- Idioma da interface e dos textos: **português brasileiro**.
- Datas em formato `'YYYY-MM-DD'` (comparáveis como string lexicograficamente).
- Formatação de dinheiro sempre via `fmt(v)` já existente (`R$ 1.234,56`).
- Parcela mensal = `p.total / p.nparc`; nunca somar o total remanescente de uma vez.
- Despesa com `cartaoId` preenchido **não** afeta o disponível (só a fatura, quando paga).
- Não quebrar o gráfico "sparkline" da home, que usa `S.perfil.saldoInicial` como base — manter `saldoInicial` sincronizado com `saldoConta.valor` sempre que o saldo for salvo.
- Fonte de verdade do saldo passa a ser `S.perfil.saldoConta`; `saldoInicial` vira legado espelhado.

---

### Task 1: `balance-core.js` — lógica pura do disponível

**Files:**
- Create: `balance-core.js`
- Test: `test/balance-core.test.js`

**Interfaces:**
- Consumes: nada (módulo raiz).
- Produces:
  - `parcelaEventos(p) -> [{date:'YYYY-MM-DD', delta:number}]` — um evento negativo por mês ativo da parcela, datado no dia 01.
  - `cashEvents(tx, renda, parcs) -> [{date:'YYYY-MM-DD', delta:number}]` — todos os eventos de caixa.
  - `saldoDisponivel(ancora, tx, renda, parcs, hoje) -> number` — `ancora.valor + Σ eventos com ancora.data < date <= hoje`. `ancora = {valor:number, data:'YYYY-MM-DD'}`.
- No browser vira `window.BalanceCore`; no Node vira `module.exports`.

- [ ] **Step 1: Write the failing test**

Create `test/balance-core.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/balance-core.test.js`
Expected: FAIL — `Cannot find module '../balance-core.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `balance-core.js`:

```javascript
/* balance-core.js — cálculo do "Disponível na conta" (testável em Node e no browser).
   Script clássico: no browser vira window.BalanceCore; no Node vira module.exports. */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.BalanceCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Um evento negativo (dia 01) por mês em que a parcela ainda está ativa.
  function parcelaEventos(p) {
    const evs = [];
    const [sy, sm] = p.inicio.split('-').map(Number); // sm: 1-12
    const start = sy * 12 + (sm - 1) + p.pagas;       // 1º mês ainda não pago
    const end = sy * 12 + (sm - 1) + p.nparc - 1;     // último mês
    const mensal = p.total / p.nparc;
    for (let idx = start; idx <= end; idx++) {
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1; // 1-12
      const date = y + '-' + String(m).padStart(2, '0') + '-01';
      evs.push({ date: date, delta: -mensal });
    }
    return evs;
  }

  function cashEvents(tx, renda, parcs) {
    const evs = [];
    (tx || []).forEach(function (t) {
      if (t.type === 'income') evs.push({ date: t.date, delta: t.val });
      else if (t.type === 'expense' && !t.cartaoId) evs.push({ date: t.date, delta: -t.val });
      else if (t.type === 'pagamento_fatura') evs.push({ date: t.date, delta: -t.val });
      // despesa no cartão: ignorada (afeta só a fatura)
    });
    (renda || []).forEach(function (r) {
      evs.push({ date: r.date, delta: (r.val || 0) - (r.custo || 0) });
    });
    (parcs || []).forEach(function (p) {
      parcelaEventos(p).forEach(function (e) { evs.push(e); });
    });
    return evs;
  }

  // Disponível = ancora.valor + soma dos eventos com ancora.data < date <= hoje.
  function saldoDisponivel(ancora, tx, renda, parcs, hoje) {
    const base = (ancora && ancora.valor) || 0;
    const de = (ancora && ancora.data) || '0000-00-00';
    const evs = cashEvents(tx, renda, parcs);
    return evs.reduce(function (s, e) {
      return (e.date > de && e.date <= hoje) ? s + e.delta : s;
    }, base);
  }

  return { parcelaEventos: parcelaEventos, cashEvents: cashEvents, saldoDisponivel: saldoDisponivel };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/balance-core.test.js`
Expected: PASS — 5 tests passam.

- [ ] **Step 5: Commit**

```bash
git add balance-core.js test/balance-core.test.js
git commit -m "feat: balance-core.js calcula Disponivel na conta (ancora + eventos datados)"
```

---

### Task 2: Estado `saldoConta` + migração + carregar script

**Files:**
- Modify: `index.html:1086` (adicionar `<script>` do balance-core)
- Modify: `index.html:1144` (`EMPTY_STATE`)
- Modify: `index.html:1146-1172` (`loadState` — migração)
- Modify: `index.html` (~1230, adicionar helper `hojeStr()`)

**Interfaces:**
- Consumes: `BalanceCore` (Task 1).
- Produces: `S.perfil.saldoConta = {valor:number, data:'YYYY-MM-DD'}` presente em todo estado carregado; helper global `hojeStr() -> 'YYYY-MM-DD'`.

- [ ] **Step 1: Carregar o script do balance-core**

Em `index.html:1086` (logo após a linha do `parcels-core.js`), adicionar:

```html
<script src="parcels-core.js"></script>
<script src="balance-core.js"></script>
```

- [ ] **Step 2: Helper `hojeStr()`**

Logo após a definição de `const fmt=...` (perto da linha 1230), adicionar:

```javascript
function hojeStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
```

- [ ] **Step 3: `EMPTY_STATE` com `saldoConta`**

Em `index.html:1144`, no `perfil`, acrescentar `saldoConta`:

```javascript
const EMPTY_STATE={perfil:{nome:'',salario:0,saldoInicial:0,beneficio:0,saldoConta:{valor:0,data:hojeStr()}},bancos:[],cartoes:[],tx:[],renda:[],parcs:[],nid:1};
```

- [ ] **Step 4: Migração no `loadState`**

Em `index.html:1146-1172`, adicionar uma função de normalização do perfil e usá-la nos dois retornos (`KEY` e `financeiro_v2`). Substituir o corpo de `loadState` por:

```javascript
function migraPerfil(p){
  p=p||{nome:'',salario:0,saldoInicial:0,beneficio:0};
  if(!p.saldoConta){
    // usuário antigo: usa o saldo inicial legado como ponto de partida de hoje
    p.saldoConta={valor:p.saldoInicial||0,data:hojeStr()};
  }
  return p;
}
function loadState(){
  try{
    const r=localStorage.getItem(KEY);
    if(r){
      const s=JSON.parse(r);
      return{
        perfil:migraPerfil(s.perfil),
        bancos:s.bancos||[],cartoes:s.cartoes||[],
        tx:s.tx||[],
        renda:s.renda||s.uber||[],
        parcs:s.parcs||[],
        nid:s.nid||1
      };
    }
    const old=localStorage.getItem('financeiro_v2');
    if(old){
      const s=JSON.parse(old);
      return{
        perfil:migraPerfil(s.perfil),
        bancos:s.bancos||[],cartoes:s.cartoes||[],
        tx:s.tx||[],renda:s.renda||s.uber||[],parcs:s.parcs||[],nid:s.nid||1
      };
    }
  }catch(e){console.error(e)}
  return JSON.parse(JSON.stringify(EMPTY_STATE));
}
```

- [ ] **Step 5: Verificação manual no browser**

Suba um servidor local e abra o app:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080` no Chrome, DevTools → Console, e rode:

```javascript
// simula usuário antigo sem saldoConta
localStorage.setItem('controla_financeiro', JSON.stringify({perfil:{nome:'Teste',saldoInicial:134.67}, tx:[], renda:[], parcs:[]}));
location.reload();
```

Após recarregar, no Console:

```javascript
S.perfil.saldoConta
```

Expected: `{valor: 134.67, data: '<hoje YYYY-MM-DD>'}`. Também `typeof hojeStr()==='string'` e `BalanceCore` existe (`typeof BalanceCore.saldoDisponivel === 'function'`).

> Nota: o nome exato da chave do localStorage é o valor de `KEY` no arquivo; se `controla_financeiro` não for, confirme com `KEY` no Console e use o valor certo.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: estado saldoConta {valor,data} + migracao do saldoInicial legado"
```

---

### Task 3: Home — "Disponível na conta" + "Movimento do mês"

**Files:**
- Modify: `index.html:667-678` (bloco `.bal-card`)
- Modify: `index.html:1505-1522` (cálculo e render em `updateHome`)

**Interfaces:**
- Consumes: `BalanceCore.saldoDisponivel`, `S.perfil.saldoConta`, `hojeStr()`.
- Produces: número `#saldo` = disponível real (independente do mês); rótulo "Disponível na conta"; título "Movimento do mês"; linha `#resultado-mes`.

- [ ] **Step 1: Ajustar o HTML do card**

Substituir o bloco `index.html:667-678` por:

```html
    <div class="bal-card">
      <div id="ai-badge-wrap"></div>
      <div class="bal-lbl" style="display:flex;justify-content:space-between;align-items:center">
        <span>Disponível na conta</span>
        <span onclick="openSaldoModal()" style="font-size:12px;color:var(--purple);cursor:pointer">✏️ Corrigir</span>
      </div>
      <div class="bal-val text-gradient" id="saldo">R$ 0,00</div>
      <div id="bal-sparkline"></div>
      <div class="sec-t" id="mov-titulo" style="margin-top:14px">Movimento do mês</div>
      <div class="bal-row">
        <div class="mc" style="--chip-c:var(--green)" onclick="navTo('tx')"><div class="l">Receitas do mês <span class="arr">›</span></div><div class="v" id="t-rec" style="color:var(--green)">R$ 0,00</div></div>
        <div class="mc" style="--chip-c:var(--teal)" onclick="navTo('renda')"><div class="l">Renda extra <span class="arr">›</span></div><div class="v" id="t-uber" style="color:var(--teal)">R$ 0,00</div></div>
        <div class="mc" style="--chip-c:var(--red)" onclick="navTo('tx')"><div class="l">Despesas <span class="arr">›</span></div><div class="v" id="t-desp" style="color:var(--red)">R$ 0,00</div></div>
        <div class="mc" style="--chip-c:var(--coral)" onclick="navTo('parc')"><div class="l">Parcelas <span class="arr">›</span></div><div class="v" id="t-parc" style="color:var(--coral)">R$ 0,00</div></div>
      </div>
      <div id="resultado-mes" style="margin-top:10px;font-size:13px;color:var(--text3);text-align:right"></div>
    </div>
```

- [ ] **Step 2: Trocar o cálculo do saldo em `updateHome`**

Em `index.html:1505-1522`, substituir o bloco do "SALDO UNIFICADO" e a atribuição de `#saldo` por:

```javascript
  // DISPONÍVEL NA CONTA: dinheiro real agora (independente do mês navegado)
  const saldoAtual=BalanceCore.saldoDisponivel(S.perfil.saldoConta, S.tx, S.renda, S.parcs, hojeStr());

  // Movimento do mês selecionado (entradas e saídas)
  const entradas=rec+uLiq;
  const saidas=desp+despCard+parcTot+fatPago;

  document.getElementById('t-rec').textContent=fmt(rec);
  document.getElementById('t-uber').textContent=fmt(uLiq);
  document.getElementById('t-desp').textContent=fmt(desp+despCard);
  document.getElementById('t-parc').textContent=fmt(parcTot);

  const sel=document.getElementById('saldo');
  sel.textContent=fmt(saldoAtual);
  sel.style.color=saldoAtual>=0?'#e8e8e8':'#f87171';
  sel.classList.toggle('text-gradient',saldoAtual>=0);

  const resM=entradas-saidas;
  const resEl=document.getElementById('resultado-mes');
  if(resEl)resEl.innerHTML='Resultado do mês: <b style="color:'+(resM>=0?'var(--green)':'var(--red)')+'">'+(resM>=0?'+':'−')+fmt(Math.abs(resM)).replace('R$ ','R$ ')+'</b>';
```

> Observação: `rec`, `uLiq`, `desp`, `despCard`, `fatPago`, `parcTot` continuam calculados como já estão nas linhas 1496-1503 (não mexer neles). A linha antiga `if(!localStorage.getItem('controla_fatura_v2')){...}` (toast do modelo de cartão) pode ser removida junto com o bloco antigo.

- [ ] **Step 3: Verificação manual no browser**

Servidor rodando (`python -m http.server 8080`), no Console:

```javascript
S.perfil.saldoConta={valor:662,data:'2026-07-01'};
S.tx=[{type:'income',val:100,date:'2026-07-15'},{type:'expense',val:40,date:'2026-07-16'}];
S.renda=[];S.parcs=[];
updateHome();
document.getElementById('saldo').textContent;      // esperado: "R$ 722,00" (662+100-40)
```

Navegue entre os meses (setas ‹ ›) e confirme que **o número #saldo NÃO muda** (só os chips de movimento mudam). O rótulo mostra "Disponível na conta" e aparece "✏️ Corrigir".

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: home mostra Disponivel na conta (independente do mes) + Movimento do mes"
```

---

### Task 4: Modal "Corrigir" (re-ancorar o saldo)

**Files:**
- Modify: `index.html:1033` (adicionar overlay `ov-saldo` antes de `ov-config`)
- Modify: `index.html` (adicionar `openSaldoModal()` e `saveSaldo()` perto de `saveConfig`, ~2613)

**Interfaces:**
- Consumes: `getMoneyVal`, `setMoneyVal`, `initMasks`, `closeOv`, `saveState`, `updateHome`, `renderConfig`, `hojeStr`.
- Produces: `openSaldoModal()`, `saveSaldo()`. Ambos gravam `S.perfil.saldoConta={valor,data:hojeStr()}` e espelham `S.perfil.saldoInicial=valor`.

- [ ] **Step 1: Adicionar o overlay HTML**

Imediatamente antes de `index.html:1034` (`<div class="ov" id="ov-config">`), inserir:

```html
<div class="ov" id="ov-saldo">
  <div class="mdl"><div class="mdl-handle"></div>
    <h2>Quanto você tem na conta?</h2>
    <p style="color:var(--text3);font-size:13px;margin:4px 0 12px">Confira o saldo no app do seu banco e informe o valor real. Ele vira seu novo ponto de partida.</p>
    <div class="fg"><label>Disponível na conta (R$)</label><div class="money-input-wrap"><input id="sd-val" type="text" inputmode="numeric" placeholder="0,00"/></div></div>
    <button class="bpri" onclick="saveSaldo()">Salvar</button>
    <button class="bcan" onclick="closeOv('ov-saldo')">Cancelar</button>
  </div>
</div>
```

- [ ] **Step 2: Adicionar as funções JS**

Logo após `saveConfig` (após `index.html:2613`), inserir:

```javascript
function openSaldoModal(){
  setMoneyVal('sd-val',(S.perfil.saldoConta&&S.perfil.saldoConta.valor)||0);
  document.getElementById('ov-saldo').classList.add('open');
  setTimeout(initMasks,50);
}
function saveSaldo(){
  const v=getMoneyVal('sd-val');
  S.perfil.saldoConta={valor:v,data:hojeStr()};
  S.perfil.saldoInicial=v; // espelho legado (sparkline)
  saveState();closeOv('ov-saldo');updateHome();renderConfig();
}
```

- [ ] **Step 3: Verificação manual no browser**

Servidor rodando. Na home, toque em "✏️ Corrigir". O modal abre. Digite `700`, toque em Salvar. Confirme:
- O número "Disponível na conta" atualiza refletindo 700 + movimentos futuros à data de hoje.
- No Console: `S.perfil.saldoConta` → `{valor:700, data:'<hoje>'}` e `S.perfil.saldoInicial===700`.
- Recarregue a página: o valor persiste.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: modal Corrigir re-ancora o Disponivel na conta"
```

---

### Task 5: Config e onboarding editam `saldoConta`

**Files:**
- Modify: `index.html:768` (linha de resumo na config)
- Modify: `index.html:1040` (input do modal Editar perfil)
- Modify: `index.html:1979` (`renderConfig`)
- Modify: `index.html:2423` (`openConfigModal` — preencher input)
- Modify: `index.html:2611` (`saveConfig`)
- Modify: `index.html:612` (label do onboarding)
- Modify: `index.html:2630` (`goStep` passo 4)

**Interfaces:**
- Consumes: `hojeStr`, `getMoneyVal`, `setMoneyVal`, `S.perfil.saldoConta`.
- Produces: config e onboarding gravam `saldoConta={valor,data:hojeStr()}` e espelham `saldoInicial`.

- [ ] **Step 1: Rótulo do resumo na config**

`index.html:768` — trocar o texto do rótulo (mantendo os ids):

```html
        <div class="config-row"><span class="config-lbl">Saldo em conta</span><span class="config-val" id="cfg-saldo-val">—</span></div>
```

- [ ] **Step 2: `renderConfig` mostra o valor do saldoConta**

`index.html:1979` — substituir por:

```javascript
  const sc=(p.saldoConta&&p.saldoConta.valor)||0;
  document.getElementById('cfg-saldo-val').textContent=sc>0?fmt(sc):'—';
```

- [ ] **Step 3: Label do input no modal Editar perfil**

`index.html:1040` — trocar o texto do `<label>` (mantendo o input `cfg-saldo`):

```html
    <div class="fg"><label>Saldo em conta hoje (R$)</label><div class="money-input-wrap"><input id="cfg-saldo" type="text" inputmode="numeric" placeholder="0,00"/></div></div>
```

- [ ] **Step 4: `openConfigModal` preenche do saldoConta**

`index.html:2423` — trocar:

```javascript
  setMoneyVal('cfg-saldo',(p.saldoConta&&p.saldoConta.valor)||p.saldoInicial||0);
```

- [ ] **Step 5: `saveConfig` grava saldoConta**

`index.html:2611` — substituir a linha `S.perfil.saldoInicial=getMoneyVal('cfg-saldo');` por:

```javascript
  const _sc=getMoneyVal('cfg-saldo');
  S.perfil.saldoConta={valor:_sc,data:hojeStr()};
  S.perfil.saldoInicial=_sc; // espelho legado (sparkline)
```

- [ ] **Step 6: Onboarding — label e save**

`index.html:612` — trocar o texto do label do campo de saldo do onboarding para "Quanto você tem na conta hoje (R$)" (manter o input `onb-saldo`).

`index.html:2630` — substituir `S.perfil.saldoInicial=getMoneyVal('onb-saldo');` por:

```javascript
    const _sco=getMoneyVal('onb-saldo');
    S.perfil.saldoConta={valor:_sco,data:hojeStr()};
    S.perfil.saldoInicial=_sco;
```

- [ ] **Step 7: Verificação manual no browser**

Servidor rodando. Config → "Editar perfil": o campo mostra "Saldo em conta hoje" preenchido com o valor atual. Altere para `500`, Salvar. Confirme:
- A linha de resumo mostra "Saldo em conta: R$ 500,00".
- `S.perfil.saldoConta.valor===500` e a `data` é hoje.
- Home atualiza o "Disponível na conta".

Onboarding (para testar: `localStorage.clear(); location.reload();`): preencha o passo do saldo e confirme que `S.perfil.saldoConta` fica com o valor digitado.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: config e onboarding editam saldoConta (Saldo em conta hoje)"
```

---

### Task 6: Aviso de migração (1x) + bump de versão

**Files:**
- Modify: `index.html:2701-2705` (`initApp` — chamar `checkSaldoConfirm`)
- Modify: `index.html` (adicionar `checkSaldoConfirm` perto de `checkNovidades`, ~2442)
- Modify: `index.html:1226` (`APP_VERSION`) e `index.html:1227-1233` (`NOVIDADES`)
- Modify: `sw.js:1-2` (bump de cache + adicionar `balance-core.js`)

**Interfaces:**
- Consumes: `openSaldoModal`, `S.tx`.
- Produces: usuário antigo é convidado 1x a confirmar o saldo real; versão do app e cache sobem para 22.

- [ ] **Step 1: Função `checkSaldoConfirm`**

Após `closeNovidades` (perto de `index.html:2442`), adicionar:

```javascript
// Pede ao usuário ANTIGO (que já tem lançamentos) para confirmar o saldo real, 1 vez.
const SALDO_CONFIRM_KEY='controla_saldo_confirmado_v1';
function checkSaldoConfirm(){
  if(localStorage.getItem(SALDO_CONFIRM_KEY))return;
  localStorage.setItem(SALDO_CONFIRM_KEY,'1');
  if((S.tx&&S.tx.length>0)||(S.renda&&S.renda.length>0)){
    openSaldoModal();
  }
}
```

- [ ] **Step 2: Chamar no `initApp`**

`index.html:2704` — logo após `setTimeout(checkNovidades,450);`, adicionar:

```javascript
  setTimeout(checkSaldoConfirm,700);
```

- [ ] **Step 3: Bump de versão e novidades**

`index.html:1226` — `const APP_VERSION=22;`

`index.html:1227` (topo do array `NOVIDADES`) — inserir novo bloco:

```javascript
const NOVIDADES=[
  {v:22,itens:[
    'Novo "Disponível na conta": veja quanto você tem de dinheiro real agora',
    'Toque em "Corrigir" para ajustar o saldo ao valor do seu banco',
    'As parcelas do mês agora descontam do disponível; gasto no cartão não',
  ]},
  {v:21,itens:[
    'Campo de Aposentadoria / Benefício no perfil, somado à sua renda fixa',
    'Deslize (swipe) para os lados para trocar de aba mais rápido',
  ]},
];
```

- [ ] **Step 4: Bump do service worker**

`sw.js:1-2` — subir o cache e incluir o novo arquivo:

```javascript
const CACHE = 'controla-ai-v22';
const FILES = ['./index.html','./lock-core.js','./parcels-core.js','./balance-core.js','./manifest.json','./icon-192.png','./icon-512.png','./bg.jpg'];
```

- [ ] **Step 5: Verificação manual no browser**

Simular usuário antigo que ainda não confirmou:

```javascript
localStorage.removeItem('controla_saldo_confirmado_v1');
// garantir que há lançamentos
S.tx=[{type:'income',val:100,date:'2026-07-15'}];saveState();
location.reload();
```

Expected: cerca de 0,7s após carregar, o modal "Quanto você tem na conta?" abre sozinho. Após salvar, recarregar de novo **não** reabre o modal (flag setada). Verifique também que rodar a suíte segue verde:

```bash
node --test test/*.test.js
```

Expected: todos os testes (lock-core, parcels-core, balance-core) passam. (No Node 24, `node --test test/` falha tentando carregar `test` como módulo — sempre passar o glob dos arquivos.)

- [ ] **Step 6: Commit**

```bash
git add index.html sw.js
git commit -m "feat: aviso 1x para confirmar saldo real + bump v22 (app + SW cache)"
```

---

## Self-Review

**Spec coverage:**
- "Disponível na conta" real, ajustável, independente do mês → Tasks 1, 3, 4. ✅
- Auto-ajuste por eventos de caixa (receita/renda/despesa conta/fatura/parcela; cartão não) → Task 1 (`cashEvents`). ✅
- Parcela do mês desconta, só a do mês → Task 1 (`parcelaEventos`, `total/nparc`). ✅
- Modelo âncora+delta (`saldoConta={valor,data}`) → Tasks 1, 2. ✅
- "Corrigir" = re-ancorar → Task 4. ✅
- "Movimento do mês" secundário + "Resultado do mês" → Task 3. ✅
- Config/onboarding editam saldoConta → Task 5. ✅
- Migração + prompt 1x sem número negativo assustador → Tasks 2, 6. ✅
- Sparkline não quebra (saldoInicial espelhado) → Global Constraints + Tasks 4, 5. ✅

**Placeholder scan:** nenhum TBD/TODO; todo passo com código tem o código. ✅

**Type consistency:** `saldoConta={valor,data}` e assinatura `saldoDisponivel(ancora,tx,renda,parcs,hoje)` usadas de forma idêntica nas Tasks 1-6; `hojeStr()` definido na Task 2 e consumido nas 3-6. ✅

**Nota de simplificação aceita:** a parcela do mês da própria âncora não é recontada (evento datado no dia 01 ≤ data da âncora quando a âncora é no meio do mês). Se o usuário ainda não pagou a parcela daquele mês ao confirmar o saldo, o disponível pode ficar levemente superestimado até a próxima correção — comportamento aceito no design (o botão Corrigir reconcilia).
