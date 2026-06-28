# Pagamento de Fatura de Cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o ciclo completo de pagamento de fatura de cartão de crédito: despesas no cartão não reduzem o saldo imediatamente; apenas o pagamento da fatura debita a conta, com suporte a pagamentos parciais e aviso de saldo em aberto.

**Architecture:** Single-file PWA (`index.html`, ~1870 linhas). Toda a lógica é JavaScript vanilla no DOM, com estado persistido em `localStorage` via objeto `S`. A feature é implementada via: (1) duas funções de cálculo novas, (2) correção cirúrgica no cálculo do saldo, (3) novo modal de pagamento, (4) atualização do card de cartão e do extrato.

**Tech Stack:** HTML + CSS + JavaScript vanilla, localStorage, sem build system, sem framework. Servidor de desenvolvimento: `python -m http.server 8765` a partir de `controla-ai-pwa/`.

## Global Constraints

- **Arquivo único:** toda alteração acontece em `controla-ai-pwa/index.html`. Nenhum outro arquivo é modificado.
- **Zero dependências externas novas:** sem bibliotecas adicionais.
- **Padrão de estado:** state vive em `S` (objeto global). Sempre chamar `saveState()` após mutar `S`. Usar `S.nid++` para gerar IDs.
- **Padrão de modal:** abrir com `document.getElementById(id).classList.add('open')`, fechar com `closeOv(id)`.
- **Padrão de refresh:** após salvar, chamar `refreshAll()` que atualiza Home + página ativa.
- **Nova transação `pagamento_fatura`:** `{id, type:'pagamento_fatura', cartaoId, val, date, desc}` — salva em `S.tx[]`.
- **Convenção de cores:** valores a pagar usam `var(--red)`, pagamentos confirmados usam `var(--teal)` (ciano), badges positivos usam `var(--green)`.
- **Verificação no browser:** não há framework de testes. Verificação é feita abrindo `http://127.0.0.1:8765/index.html` e executando snippets no console do Chrome DevTools (F12 → Console).

---

### Task 1: Funções de domínio — `totalPagoFatura` e `faturaRestante`

**Files:**
- Modify: `controla-ai-pwa/index.html:1055` (após `getTxCartao`, antes de `// ── RENDER HOME`)

**Interfaces:**
- Consumes: `S.tx[]`, `faturaCartao(cid, y, m)` (existente, linha 1053)
- Produces:
  - `totalPagoFatura(cid, y, m) → Number` — soma dos pagamentos registrados para o cartão no mês
  - `faturaRestante(cid, y, m) → Number` — quanto ainda falta pagar da fatura

---

- [ ] **Step 1: Verificar que as funções ainda não existem**

Abra `http://127.0.0.1:8765/index.html` no Chrome. Abra DevTools (F12 → Console) e execute:

```js
typeof faturaRestante === 'function'   // deve retornar false
typeof totalPagoFatura === 'function'  // deve retornar false
```

Expected: ambos retornam `false`.

- [ ] **Step 2: Adicionar as duas funções após a linha 1055**

Localize no `index.html` (linha ~1055):
```js
function getTxCartao(cid){return S.tx.filter(t=>{if(t.cartaoId!==cid||t.type!=='expense')return false;const d=new Date(t.date+'T12:00');return d.getFullYear()===curY&&d.getMonth()===curM}).length}
```

Adicione **imediatamente após** essa linha:

```js
function totalPagoFatura(cid,y,m){return S.tx.filter(t=>t.type==='pagamento_fatura'&&t.cartaoId===cid&&(()=>{const d=new Date(t.date+'T12:00');return d.getFullYear()===y&&d.getMonth()===m})()).reduce((s,t)=>s+t.val,0)}
function faturaRestante(cid,y,m){return Math.max(0,faturaCartao(cid,y,m)-totalPagoFatura(cid,y,m))}
```

- [ ] **Step 3: Recarregar e verificar no console**

Recarregue a página (`Ctrl+R`). No console execute:

```js
typeof faturaRestante === 'function'   // deve retornar true
typeof totalPagoFatura === 'function'  // deve retornar true

// Teste com dados reais (se houver cartão id=1 com gastos no mês)
faturaCartao(1, new Date().getFullYear(), new Date().getMonth())  // retorna o total de compras
totalPagoFatura(1, new Date().getFullYear(), new Date().getMonth())  // retorna 0 (nenhum pagamento ainda)
faturaRestante(1, new Date().getFullYear(), new Date().getMonth())  // retorna mesmo valor que faturaCartao
```

Expected: funções existem, `totalPagoFatura` retorna `0`, `faturaRestante` retorna o mesmo valor que `faturaCartao`.

- [ ] **Step 4: Commit**

```bash
git add controla-ai-pwa/index.html
git commit -m "feat: adicionar funções totalPagoFatura e faturaRestante"
```

---

### Task 2: Cálculo do saldo — excluir despesas de cartão, incluir pagamentos de fatura

**Files:**
- Modify: `controla-ai-pwa/index.html:1065-1074` (dentro de `updateHome`)

**Interfaces:**
- Consumes: `getMonthTx()` (existente), `getMthParcTot()` (existente)
- Produces: `saldoAtual` corrigido (card expenses excluídos, fatPago incluído)

**Contexto:** A função `updateHome` (linha 1057) calcula o saldo. Hoje a linha 1065 soma TODAS as despesas — inclusive as de cartão. A linha 1070 calcula o saldo final. Ambas precisam mudar.

---

- [ ] **Step 1: Verificar o comportamento atual**

No console do Chrome (com algum cartão e despesa de cartão cadastrados):

```js
// Anote o saldo atual mostrado no app
// Depois execute:
const txs = getMonthTx();
const despTotal = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.val,0);
const despSemCartao = txs.filter(t=>t.type==='expense'&&!t.cartaoId).reduce((s,t)=>s+t.val,0);
console.log('desp total:', despTotal, '| sem cartão:', despSemCartao);
```

Expected: `despTotal` é maior que `despSemCartao` se houver despesas de cartão.

- [ ] **Step 2: Modificar linha 1065 — excluir despesas de cartão do `desp`**

Localize (linha ~1065):
```js
  const desp=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.val,0);
```

Substitua por:
```js
  const desp=txs.filter(t=>t.type==='expense'&&!t.cartaoId).reduce((s,t)=>s+t.val,0);
  const fatPago=txs.filter(t=>t.type==='pagamento_fatura').reduce((s,t)=>s+t.val,0);
```

- [ ] **Step 3: Modificar linha 1070 — incluir `fatPago` no cálculo do saldo**

Localize (linha ~1070):
```js
  const saldoAtual=saldoInicial + rec + uLiq - desp - parcTot;
```

Substitua por:
```js
  const saldoAtual=saldoInicial + rec + uLiq - desp - parcTot - fatPago;
```

- [ ] **Step 4: Modificar linha 1074 — incluir `fatPago` nas saídas do resumo**

Localize (linha ~1074):
```js
  const saidas=desp+parcTot;
```

Substitua por:
```js
  const saidas=desp+parcTot+fatPago;
```

- [ ] **Step 5: Adicionar toast de migração única**

Localize a linha do `updateHome` que mostra o saldo (linha ~1082):
```js
  sel.textContent=fmt(saldoAtual);
```

Adicione **imediatamente após** essa linha:
```js
  if(!localStorage.getItem('controla_fatura_v2')){localStorage.setItem('controla_fatura_v2','1');showToast('💡 Modelo de cartão atualizado: fatura paga separadamente do saldo');}
```

- [ ] **Step 6: Recarregar e verificar**

Recarregue a página. Deve aparecer o toast de migração uma única vez. No console:

```js
// Com despesa de cartão existente, o saldo deve ser MAIOR que antes
// (card expenses não descontam mais imediatamente)
// Com pagamento de fatura, o saldo deve descontar
const txs = getMonthTx();
const desp = txs.filter(t=>t.type==='expense'&&!t.cartaoId).reduce((s,t)=>s+t.val,0);
const fatPago = txs.filter(t=>t.type==='pagamento_fatura').reduce((s,t)=>s+t.val,0);
console.log('desp (sem cartão):', desp, '| fatPago:', fatPago);
// fatPago deve ser 0 por enquanto (nenhum pagamento registrado ainda)
```

Expected: toast aparece uma vez, saldo no app é calculado corretamente.

- [ ] **Step 7: Commit**

```bash
git add controla-ai-pwa/index.html
git commit -m "feat: excluir despesas de cartão do saldo; incluir pagamentos de fatura"
```

---

### Task 3: Modal HTML + CSS — `ov-pagar-fatura`

**Files:**
- Modify: `controla-ai-pwa/index.html:878` (após `</div>` que fecha `ov-cartao`)
- Modify: `controla-ai-pwa/index.html:1816` (array de modais para fechar ao clicar fora)

**Interfaces:**
- Consumes: IDs dos inputs definidos aqui: `pf-nome`, `pf-total`, `pf-pago`, `pf-rest`, `pf-val`, `pf-data`
- Produces: HTML do modal pronto para ser populado por `openPagarFatura()` (Task 4)

---

- [ ] **Step 1: Verificar que o modal não existe**

No console:
```js
document.getElementById('ov-pagar-fatura')  // deve retornar null
```

Expected: `null`.

- [ ] **Step 2: Adicionar CSS para `.pf-resumo`**

Localize no bloco `<style>` a linha que contém `.cc-fatura{` (linha ~195). Adicione **antes** dela:

```css
.pf-resumo{background:var(--bg3);border-radius:var(--rs);padding:12px 14px;margin-bottom:16px;display:flex;flex-direction:column;gap:6px}
.pf-resumo-row{display:flex;justify-content:space-between;align-items:center;font-size:13px}
.pf-resumo-lbl{color:var(--text2)}
.pf-resumo-val{font-weight:600}
```

- [ ] **Step 3: Adicionar HTML do modal após `ov-cartao`**

Localize (linha ~878):
```html
</div>
</div>

<div class="ov" id="ov-config">
```

Adicione o novo modal entre `ov-cartao` e `ov-config`:

```html
<div class="ov" id="ov-pagar-fatura">
  <div class="mdl"><div class="mdl-handle"></div>
    <h2>Pagar Fatura — <span id="pf-nome"></span></h2>
    <div class="pf-resumo">
      <div class="pf-resumo-row"><span class="pf-resumo-lbl">Fatura total</span><span class="pf-resumo-val" id="pf-total"></span></div>
      <div class="pf-resumo-row" id="pf-pago-row"><span class="pf-resumo-lbl">Já pago</span><span class="pf-resumo-val" style="color:var(--teal)" id="pf-pago"></span></div>
      <div class="pf-resumo-row"><span class="pf-resumo-lbl">Restante</span><span class="pf-resumo-val" style="color:var(--red)" id="pf-rest"></span></div>
    </div>
    <div class="fg"><label>Valor do pagamento (R$)</label><div class="money-input-wrap"><input id="pf-val" type="text" inputmode="numeric" placeholder="0,00"/></div></div>
    <div class="fg"><label>Data</label><input id="pf-data" type="date"/></div>
    <button class="bpri" onclick="salvarPagamentoFatura()">Confirmar pagamento</button>
    <button class="bcan" onclick="closeOv('ov-pagar-fatura')">Cancelar</button>
  </div>
</div>
```

- [ ] **Step 4: Registrar modal no array de fechar-ao-clicar-fora**

Localize (linha ~1816):
```js
['ov-main','ov-tx','ov-edit-tx','ov-renda','ov-edit-renda','ov-parc','ov-edit-parc','ov-banco','ov-cartao','ov-config'].forEach(id=>{
```

Substitua por:
```js
['ov-main','ov-tx','ov-edit-tx','ov-renda','ov-edit-renda','ov-parc','ov-edit-parc','ov-banco','ov-cartao','ov-pagar-fatura','ov-config'].forEach(id=>{
```

- [ ] **Step 5: Recarregar e verificar**

No console:
```js
document.getElementById('ov-pagar-fatura') !== null  // deve retornar true

// Abrir o modal manualmente para ver o layout
document.getElementById('ov-pagar-fatura').classList.add('open')
// Verifica: modal abre, tem título, resumo e dois inputs (valor e data)
// Fechar:
document.getElementById('ov-pagar-fatura').classList.remove('open')
```

Expected: modal aparece visualmente correto, fecha ao clicar fora.

- [ ] **Step 6: Commit**

```bash
git add controla-ai-pwa/index.html
git commit -m "feat: adicionar modal ov-pagar-fatura com HTML e CSS"
```

---

### Task 4: JS do modal — `openPagarFatura` e `salvarPagamentoFatura`

**Files:**
- Modify: `controla-ai-pwa/index.html` (seção `// ── MODAIS`, após `openCartaoModal`, linha ~1663)

**Interfaces:**
- Consumes: `faturaCartao(cid,y,m)`, `totalPagoFatura(cid,y,m)`, `faturaRestante(cid,y,m)` (Task 1), IDs do modal (Task 3), `S.cartoes`, `S.bancos`, `S.tx`, `S.nid`, `saveState()`, `closeOv()`, `refreshAll()`, `showToast()`, `fmt()`, `getMoneyVal()`, `setMoneyVal()`
- Produces: `openPagarFatura(cid)` e `salvarPagamentoFatura()` globais

---

- [ ] **Step 1: Verificar que as funções não existem**

No console:
```js
typeof openPagarFatura === 'function'       // deve retornar false
typeof salvarPagamentoFatura === 'function' // deve retornar false
```

- [ ] **Step 2: Adicionar variável de estado e funções do modal**

Localize (linha ~1663), após `function openCartaoModal(bancoId){...}`:

```js
function openCartaoModal(bancoId){
  // ... código existente ...
}
```

Adicione **imediatamente após** o fechamento de `openCartaoModal`:

```js
let _pfCartaoId=null;
function openPagarFatura(cid){
  _pfCartaoId=cid;
  const c=S.cartoes.find(x=>x.id===cid);
  if(!c)return;
  const b=S.bancos.find(x=>x.id===c.bancoId);
  const fat=faturaCartao(cid,curY,curM);
  const pago=totalPagoFatura(cid,curY,curM);
  const rest=faturaRestante(cid,curY,curM);
  document.getElementById('pf-nome').textContent=(b?b.nome+' ':'')+c.nome;
  document.getElementById('pf-total').textContent=fmt(fat);
  document.getElementById('pf-pago').textContent=fmt(pago);
  document.getElementById('pf-rest').textContent=fmt(rest);
  document.getElementById('pf-pago-row').style.display=pago>0?'flex':'none';
  setMoneyVal('pf-val',rest);
  document.getElementById('pf-data').value=new Date().toISOString().split('T')[0];
  document.getElementById('ov-pagar-fatura').classList.add('open');
  setTimeout(initMasks,50);
}
function salvarPagamentoFatura(){
  const val=getMoneyVal('pf-val');
  const date=document.getElementById('pf-data').value;
  if(!val||val<=0||!date){showToast('Preencha o valor e a data');return;}
  const c=S.cartoes.find(x=>x.id===_pfCartaoId);
  if(!c)return;
  const b=S.bancos.find(x=>x.id===c.bancoId);
  S.tx.push({id:S.nid++,type:'pagamento_fatura',cartaoId:_pfCartaoId,val,date,desc:'Pagamento Fatura '+(b?b.nome+' ':'')+c.nome});
  saveState();
  closeOv('ov-pagar-fatura');
  refreshAll();
  showToast('💳 Pagamento de '+fmt(val)+' registrado');
}
```

- [ ] **Step 3: Recarregar e testar o fluxo completo**

Recarregue a página. No console:

```js
typeof openPagarFatura === 'function'       // deve retornar true
typeof salvarPagamentoFatura === 'function' // deve retornar true

// Testar abertura (se houver cartão cadastrado com id=1 e fatura no mês):
openPagarFatura(S.cartoes[0]?.id)
// Verifica: modal abre com nome do cartão, fatura total preenchida, input de valor pré-preenchido com o restante
```

- [ ] **Step 4: Testar salvamento via console**

Com o modal aberto, no console:

```js
// Checar quantas tx do tipo pagamento_fatura existem (deve ser 0 agora)
S.tx.filter(t=>t.type==='pagamento_fatura').length  // retorna 0

// Fechar o modal e testar via JS direto (sem abrir o modal):
_pfCartaoId = S.cartoes[0]?.id;
document.getElementById('pf-val').value = ''; // limpar
setMoneyVal('pf-val', 100);
document.getElementById('pf-data').value = new Date().toISOString().split('T')[0];
salvarPagamentoFatura();

// Verificar que foi salvo:
S.tx.filter(t=>t.type==='pagamento_fatura')  // deve retornar array com 1 item
// O saldo na Home deve ter diminuído R$ 100,00
```

Expected: `S.tx` tem 1 pagamento_fatura, saldo na Home reduziu, toast apareceu.

- [ ] **Step 5: Commit**

```bash
git add controla-ai-pwa/index.html
git commit -m "feat: implementar openPagarFatura e salvarPagamentoFatura"
```

---

### Task 5: `renderCartoes` — atualizar área `.cc-fatura` com status e botão de pagamento

**Files:**
- Modify: `controla-ai-pwa/index.html:1187-1196` (dentro do template `cartaoCards` em `renderCartoes`)

**Interfaces:**
- Consumes: `faturaCartao(c.id,curY,curM)`, `totalPagoFatura(c.id,curY,curM)`, `faturaRestante(c.id,curY,curM)` (Task 1), `openPagarFatura(cid)` (Task 4)
- Produces: card de cartão com total/pago/restante/botão/badge visíveis

**Contexto:** O trecho a modificar está dentro da função `renderCartoes()` (linha ~1141), na variável `cartaoCards`. A área `.cc-fatura` atual (linhas ~1187–1196) mostra somente o total da fatura e a quantidade de compras. Precisa mostrar o status completo.

---

- [ ] **Step 1: Localizar o trecho a substituir**

Encontre o bloco (linhas ~1187–1196):
```js
        <div class="cc-fatura">
          <div>
            <div style="font-size:12px;color:var(--text2)">Fatura de ${MN[curM]}</div>
            ${vencBreve?'<div style="font-size:11px;color:var(--amber)">⚠️ Vence em breve (dia '+c.venc+')</div>':''}
          </div>
          <div style="text-align:right">
            <div style="font-size:17px;font-weight:700;color:${pct>=80?'var(--red)':'var(--text)'}">${fmt(fat)}</div>
            <div style="font-size:11px;color:var(--text3)">${getTxCartao(c.id)} compra${getTxCartao(c.id)!==1?'s':''}</div>
          </div>
        </div>
```

- [ ] **Step 2: Adicionar cálculos de `pago` e `rest` antes do template**

Antes da linha com `return\`<div class="cartao-card"`, adicione (logo após a linha `const fat=faturaCartao(c.id,curY,curM);`):

```js
      const pago=totalPagoFatura(c.id,curY,curM);
      const rest=faturaRestante(c.id,curY,curM);
      const fatQuitada=fat>0&&rest===0;
      // hoje já existe neste escopo (linha ~1169 do original): const hoje=now.getDate()
      const fatVencida=rest>0&&curY===now.getFullYear()&&curM===now.getMonth()&&hoje>c.venc;
```

- [ ] **Step 3: Substituir o bloco `.cc-fatura` pelo novo**

Substitua o bloco `.cc-fatura` existente por:

```js
        <div class="cc-fatura">
          <div>
            <div style="font-size:12px;color:var(--text2)">Fatura de ${MN[curM]}</div>
            ${vencBreve&&rest>0?'<div style="font-size:11px;color:var(--amber)">⚠️ Vence em breve (dia '+c.venc+')</div>':''}
            ${fatVencida?'<div style="font-size:11px;color:var(--red)">🔴 Em aberto após vencimento</div>':''}
          </div>
          <div style="text-align:right">
            <div style="font-size:17px;font-weight:700;color:${pct>=80?'var(--red)':'var(--text)'}">${fmt(fat)}</div>
            <div style="font-size:11px;color:var(--text3)">${getTxCartao(c.id)} compra${getTxCartao(c.id)!==1?'s':''}</div>
          </div>
        </div>
        ${pago>0?`<div style="display:flex;justify-content:space-between;font-size:12px;padding:0 2px;margin-top:6px"><span style="color:var(--text2)">Já pago</span><span style="color:var(--teal);font-weight:600">${fmt(pago)}</span></div>`:''}
        ${rest>0?`<div style="display:flex;justify-content:space-between;font-size:12px;padding:0 2px;margin-top:4px"><span style="color:var(--text2)">A pagar</span><span style="color:var(--red);font-weight:700">${fmt(rest)}</span></div>`:''}
        ${fatQuitada?`<div style="text-align:center;font-size:12px;color:var(--green);font-weight:600;margin-top:8px">✅ Fatura quitada</div>`:''}
        ${fat>0&&rest>0?`<button class="add-btn" style="margin:8px 0 0;width:100%;background:linear-gradient(135deg,var(--purple2),var(--teal));border:none;color:#fff" onclick="event.stopPropagation();openPagarFatura(${c.id})">💳 Pagar fatura</button>`:''}
```

- [ ] **Step 4: Recarregar e verificar visualmente**

Recarregue a página, vá para a tela de **Cartões**, expanda um banco com cartão que tenha fatura:
- Deve mostrar: total da fatura (ex: R$ 850,00), quantidade de compras
- Deve mostrar o botão "💳 Pagar fatura"
- Se já houver pagamento registrado (do teste da Task 4): deve mostrar linha "Já pago R$ 100,00" e "A pagar R$ 750,00"
- Após pagar tudo: badge "✅ Fatura quitada" aparece, botão some

No console, simular pagamento total e verificar badge:
```js
// Se cartão[0] tiver fatura de 100 e já foi pago 100 no teste anterior:
faturaRestante(S.cartoes[0]?.id, curY, curM)  // deve retornar 0
// Cartão deve mostrar "✅ Fatura quitada" sem botão "Pagar fatura"
renderCartoes()
```

- [ ] **Step 5: Commit**

```bash
git add controla-ai-pwa/index.html
git commit -m "feat: atualizar cc-fatura com status de pagamento e botão pagar"
```

---

### Task 6: Extrato — `pagamento_fatura` em `renderTxPage` + filtro "Cartão"

**Files:**
- Modify: `controla-ai-pwa/index.html:657-662` (HTML dos filtros da tela Transações)
- Modify: `controla-ai-pwa/index.html:1356-1382` (lógica de filtros em `renderTxPage`)

**Interfaces:**
- Consumes: `getMonthTx()`, `txRow()`, `fmt()`, `fmtDay()`, filtro `_filtroTx`
- Produces: pagamentos de fatura visíveis no extrato com cor ciano; filtro "Cartão" na barra de filtros

---

- [ ] **Step 1: Adicionar filtro "Cartão" no HTML**

Localize (linha ~662):
```html
        <button class="ftag" onclick="setFiltro('parcela',this)">Parcelas</button>
```

Adicione **imediatamente após**:
```html
        <button class="ftag" onclick="setFiltro('cartao',this)">Cartão</button>
```

- [ ] **Step 2: Adicionar bloco de pagamento_fatura em `renderTxPage`**

Localize (linha ~1381), o bloco do filtro parcela termina com:
```js
  }
  if(_filtroTx==='todos'||_filtroTx==='parcela'){
    parcsM.forEach(p=>{
      // ...
    });
  }
```

Adicione **após** o fechamento do bloco `parcela`:

```js
  if(_filtroTx==='todos'||_filtroTx==='cartao'){
    txs.filter(t=>t.type==='pagamento_fatura').forEach(t=>{
      const ct=getCartao(t.cartaoId);const b=ct?getBanco(ct.bancoId):null;
      const d=new Date(t.date+'T12:00');
      const ds=d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0');
      all.push({date:t.date,html:txRow('💳','rgba(6,182,212,.15)',t.desc,'Fatura · pagamento','-'+fmt(t.val),'var(--teal)',ds,t.id,'tx')});
    });
  }
```

- [ ] **Step 3: Incluir despesas de cartão no filtro "Cartão"**

Localize (linha ~1356):
```js
  if(_filtroTx==='todos'||_filtroTx==='despesa'){
    txs.filter(t=>t.type==='expense').forEach(t=>{
```

Substitua por:
```js
  if(_filtroTx==='todos'||_filtroTx==='despesa'||_filtroTx==='cartao'){
    txs.filter(t=>t.type==='expense'&&(_filtroTx!=='cartao'||t.cartaoId)).forEach(t=>{
```

- [ ] **Step 4: Recarregar e verificar**

Recarregue a página. Vá para **Transações**:
- Clique em "Todos": pagamentos de fatura aparecem como linha ciano com ícone 💳 e texto "Fatura · pagamento"
- Clique em "Cartão": mostra despesas de cartão + pagamentos de fatura (ambos relacionados a cartão)
- Clique em "Despesas": mostra apenas despesas normais (sem pagamentos de fatura)

No console:
```js
// Simular: quantos pagamento_fatura existem no mês?
getMonthTx().filter(t=>t.type==='pagamento_fatura').length  // deve retornar >= 1 se Task 4 foi testada
```

- [ ] **Step 5: Commit**

```bash
git add controla-ai-pwa/index.html
git commit -m "feat: exibir pagamentos de fatura no extrato e adicionar filtro Cartão"
```

---

### Task 7: Alerta no Home — fatura vencida com saldo em aberto

**Files:**
- Modify: `controla-ai-pwa/index.html:1108` (dentro de `updateHome`, bloco de alertas)

**Interfaces:**
- Consumes: `S.cartoes`, `faturaRestante(cid,curY,curM)` (Task 1), `getBanco(id)`, `fmt()`
- Produces: alertas âmbar na Home para faturas vencidas com saldo em aberto

**Contexto:** A linha 1108 já tem alertas de cartão. O novo alerta de fatura em aberto vem **após** os alertas de limite existentes.

---

- [ ] **Step 1: Localizar bloco de alertas**

Encontre (linha ~1108):
```js
  S.cartoes.forEach(c=>{const u=limiteUsado(c.id);if(c.limite>0&&u/c.limite>=0.8){const b=getBanco(c.bancoId);alerts+=`<div class="alert alert-red" onclick="navTo('cartoes')" style="cursor:pointer">⚠️ ${b?b.nome+' ':''}<strong>${c.nome}</strong> — ${Math.round(u/c.limite*100)}% do limite ›</div>`;}});
```

- [ ] **Step 2: Adicionar alerta de fatura em aberto após o bloco existente**

Adicione **imediatamente após** a linha acima:

```js
  S.cartoes.forEach(c=>{
    const rest=faturaRestante(c.id,curY,curM);
    if(rest<=0)return;
    const hoje=now.getDate();
    const vencido=curY===now.getFullYear()&&curM===now.getMonth()&&hoje>c.venc;
    if(!vencido)return;
    const b=getBanco(c.bancoId);
    alerts+=`<div class="alert alert-amber" onclick="navTo('cartoes')" style="cursor:pointer">💳 Fatura ${b?b.nome+' ':''}<strong>${c.nome}</strong> venceu com <strong>${fmt(rest)}</strong> em aberto ›</div>`;
  });
```

- [ ] **Step 3: Recarregar e verificar**

Para testar, no console simule uma data de hoje após o vencimento (ou use um cartão com vencimento já passado):

```js
// Verificar se há fatura em aberto com vencimento passado
S.cartoes.forEach(c=>{
  const rest=faturaRestante(c.id,curY,curM);
  const vencido=curY===now.getFullYear()&&curM===now.getMonth()&&now.getDate()>c.venc;
  console.log(c.nome, '| rest:', rest, '| vencido:', vencido);
});
```

Se houver um cartão com dia de vencimento já passado (ex: vence dia 5 e hoje é dia 27), e houver fatura em aberto, o alerta deve aparecer no Home. Se não houver cartão nessa situação, o alerta simplesmente não aparece (comportamento correto).

- [ ] **Step 4: Commit**

```bash
git add controla-ai-pwa/index.html
git commit -m "feat: alerta na Home para fatura vencida com saldo em aberto"
```

---

## Verificação Final

Após todas as tasks, execute o checklist completo no browser:

**Critério 1 — Saldo:**
- [ ] Lançar uma despesa em cartão → saldo da Home NÃO muda
- [ ] Registrar pagamento de fatura → saldo da Home diminui pelo valor pago

**Critério 2 — Card do cartão:**
- [ ] Sem pagamentos: mostra total da fatura + botão "💳 Pagar fatura"
- [ ] Com pagamento parcial: mostra "Já pago R$ X", "A pagar R$ Y", botão ainda visível
- [ ] Com pagamento total: badge "✅ Fatura quitada", botão some

**Critério 3 — Modal:**
- [ ] Botão "💳 Pagar fatura" abre modal com nome do cartão correto
- [ ] Valor pré-preenchido com o restante a pagar
- [ ] Pagamento parcial salva e atualiza card em tempo real
- [ ] Toast de confirmação aparece após salvar

**Critério 4 — Extrato:**
- [ ] Pagamento aparece em Transações com ícone 💳, texto "Fatura · pagamento", cor ciano
- [ ] Filtro "Cartão" mostra despesas de cartão + pagamentos de fatura
- [ ] Filtro "Despesas" NÃO mostra pagamentos de fatura

**Critério 5 — Alerta:**
- [ ] Se fatura vencida e em aberto: alerta âmbar aparece na Home
- [ ] Clicando no alerta navega para Cartões
