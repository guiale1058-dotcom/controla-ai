# Editar e Excluir Banco e Cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ao usuário editar e excluir bancos e cartões já cadastrados via pressão longa (500ms) sobre o item na aba Cartões.

**Architecture:** Tudo em `index.html` (único arquivo do PWA). Novos modais `ov-edit-banco` e `ov-edit-cartao` seguem o padrão dos existentes (`ov-edit-parc`, etc.). A pressão longa é capturada por `addLongPress(el, cb)` e aplicada sobre `.banco-trigger` e `.cartao-card` ao final de cada `renderCartoes()`. As funções de edição/exclusão usam `_editId` compartilhado, `confirm()` nativo para ações destrutivas e `showToast()` para erros.

**Tech Stack:** Vanilla HTML/CSS/JS, sem frameworks, sem build system. `localStorage` chave `financeiro_v3`.

## Global Constraints

- Todas as mudanças em `C:\Users\Guilherme\Downloads\controla-ai-v5_4\controla-ai-pwa\index.html`
- Sem dependências externas
- Tema escuro: `--bg:#0f0f0f`, `--text:#e8e8e8`, `--purple:#a78bfa`, `--red:#f87171`, `--green:#4ade80`
- Largura máxima 430px (mobile-first)
- Usar `confirm()` nativo para ações destrutivas (padrão atual do app)
- Usar `showToast()` para erros não-destrutivos
- `_editId` (linha 1007) é a variável compartilhada para o ID em edição
- `saveState()` + `renderCartoes()` após qualquer mutação em `S.bancos` ou `S.cartoes`

---

### Task 1: Modais HTML de edição de banco e cartão

**Files:**
- Modify: `index.html` — inserir após linha 909 (`</div>` de `ov-config`, antes de `<script>`)
- Modify: `index.html` — linha do array de fechamento de modais (buscar por `'ov-config'].forEach`)

**Interfaces:**
- Produces: `#ov-edit-banco` com campos `#eb-nome`, `#eb-cor`; `#ov-edit-cartao` com campos `#ec-nome`, `#ec-band`, `#ec-limite` (money input), `#ec-venc`, `#ec-fecha`

- [ ] **Step 1: Inserir os dois modais HTML entre `</div>` (ov-config) e `<script>`**

Localizar no arquivo:
```html
</div>

<script>
```
(a linha `</div>` na posição 909 é o fechamento de `ov-config`). Substituir por:

```html
</div>

<div class="ov" id="ov-edit-banco">
  <div class="mdl"><div class="mdl-handle"></div>
    <h2>Editar banco</h2>
    <div class="fg"><label>Nome</label><input id="eb-nome" placeholder="Nome do banco"/></div>
    <div class="fg"><label>Cor</label><input type="color" id="eb-cor" style="width:100%;height:44px;border:none;border-radius:var(--rs);cursor:pointer;background:none"/></div>
    <button class="bpri" onclick="saveEditBanco()">Salvar alterações</button>
    <button class="bdanger" onclick="deleteEditBanco()">Excluir banco</button>
    <button class="bcan" onclick="closeOv('ov-edit-banco')">Cancelar</button>
  </div>
</div>

<div class="ov" id="ov-edit-cartao">
  <div class="mdl"><div class="mdl-handle"></div>
    <h2>Editar cartão</h2>
    <div class="fg"><label>Nome do cartão</label><input id="ec-nome" placeholder="Ex: Euro Card, Gold…"/></div>
    <div class="fg"><label>Bandeira</label>
      <select id="ec-band"><option>Visa</option><option>Mastercard</option><option>Elo</option><option>Amex</option><option>Hipercard</option></select>
    </div>
    <div class="fg"><label>Limite (R$)</label><div class="money-input-wrap"><input id="ec-limite" type="text" inputmode="numeric" placeholder="0,00"/></div></div>
    <div class="row2">
      <div class="fg"><label>Vencimento (dia)</label><input id="ec-venc" type="number" inputmode="numeric" min="1" max="31"/></div>
      <div class="fg"><label>Fechamento (dia)</label><input id="ec-fecha" type="number" inputmode="numeric" min="1" max="31"/></div>
    </div>
    <button class="bpri" onclick="saveEditCartao()">Salvar alterações</button>
    <button class="bdanger" onclick="deleteEditCartao()">Excluir cartão</button>
    <button class="bcan" onclick="closeOv('ov-edit-cartao')">Cancelar</button>
  </div>
</div>

<script>
```

- [ ] **Step 2: Adicionar os dois IDs ao array de fechamento de modais**

Localizar:
```js
['ov-main','ov-tx','ov-edit-tx','ov-renda','ov-edit-renda','ov-parc','ov-edit-parc','ov-banco','ov-cartao','ov-pagar-fatura','ov-config'].forEach(id=>{
```
Substituir por:
```js
['ov-main','ov-tx','ov-edit-tx','ov-renda','ov-edit-renda','ov-parc','ov-edit-parc','ov-banco','ov-cartao','ov-pagar-fatura','ov-config','ov-edit-banco','ov-edit-cartao'].forEach(id=>{
```

- [ ] **Step 3: Verificar no browser**

Abra `index.html`. No console do DevTools execute:
```js
document.getElementById('ov-edit-banco').classList.add('open');
```
O modal de banco deve aparecer com campos Nome e Cor. Feche clicando fora. Depois:
```js
document.getElementById('ov-edit-cartao').classList.add('open');
```
O modal de cartão deve aparecer com 5 campos. Feche clicando fora.

- [ ] **Step 4: Commit**
```
git add index.html
git commit -m "feat: adicionar modais HTML de edicao de banco e cartao"
```

---

### Task 2: Funções JS de banco (openEditBanco, saveEditBanco, deleteEditBanco)

**Files:**
- Modify: `index.html` — inserir após o fechamento de `saveBanco()` (buscar por `saveState();closeOv('ov-banco');renderCartoes();`)

**Interfaces:**
- Consumes: `_editId`, `S.bancos`, `S.cartoes`, `closeOv()`, `saveState()`, `renderCartoes()`, `showToast()`, `confirm()`
- Produces: `openEditBanco(id)`, `saveEditBanco()`, `deleteEditBanco()`

- [ ] **Step 1: Adicionar as três funções após `saveBanco()`**

Localizar:
```js
  saveState();closeOv('ov-banco');renderCartoes();
}
function saveCartao(){
```
Substituir por:
```js
  saveState();closeOv('ov-banco');renderCartoes();
}
function openEditBanco(id){
  _editId=id;
  const b=S.bancos.find(x=>x.id===id);if(!b)return;
  document.getElementById('eb-nome').value=b.nome;
  document.getElementById('eb-cor').value=b.cor||'#8b5cf6';
  document.getElementById('ov-edit-banco').classList.add('open');
}
function saveEditBanco(){
  const b=S.bancos.find(x=>x.id===_editId);if(!b)return;
  const nome=document.getElementById('eb-nome').value.trim();
  if(!nome){showToast('Informe o nome do banco.');return;}
  b.nome=nome;
  b.cor=document.getElementById('eb-cor').value;
  saveState();closeOv('ov-edit-banco');renderCartoes();
}
function deleteEditBanco(){
  if(S.cartoes.some(c=>c.bancoId===_editId)){
    showToast('Remova os cartões deste banco antes de excluí-lo.');return;
  }
  if(!confirm('Excluir este banco?'))return;
  S.bancos=S.bancos.filter(x=>x.id!==_editId);
  saveState();closeOv('ov-edit-banco');renderCartoes();
}
function saveCartao(){
```

- [ ] **Step 2: Verificar no browser**

No console execute (substitua pelo id real do primeiro banco):
```js
openEditBanco(S.bancos[0].id);
```
O modal `ov-edit-banco` deve abrir com nome e cor do banco preenchidos. Mude o nome, salve — o banco deve aparecer com novo nome na lista. Tente excluir um banco que tenha cartões — deve aparecer o toast "Remova os cartões…". Exclua um banco sem cartões — deve sumir da lista.

- [ ] **Step 3: Commit**
```
git add index.html
git commit -m "feat: funcoes JS de editar e excluir banco"
```

---

### Task 3: Funções JS de cartão (openEditCartao, saveEditCartao, deleteEditCartao)

**Files:**
- Modify: `index.html` — inserir após o fechamento de `saveCartao()` (buscar por `saveState();closeOv('ov-cartao');renderCartoes();`)

**Interfaces:**
- Consumes: `_editId`, `S.cartoes`, `S.tx`, `setMoneyVal()`, `getMoneyVal()`, `closeOv()`, `saveState()`, `renderCartoes()`, `updateHome()`, `initMasks`, `confirm()`
- Produces: `openEditCartao(id)`, `saveEditCartao()`, `deleteEditCartao()`

- [ ] **Step 1: Adicionar as três funções após `saveCartao()`**

Localizar:
```js
  saveState();closeOv('ov-cartao');renderCartoes();
}
```
(fechamento de `saveCartao()`). Inserir logo após:
```js
function openEditCartao(id){
  _editId=id;
  const c=S.cartoes.find(x=>x.id===id);if(!c)return;
  document.getElementById('ec-nome').value=c.nome;
  document.getElementById('ec-band').value=c.bandeira||'Visa';
  setMoneyVal('ec-limite',c.limite);
  document.getElementById('ec-venc').value=c.venc;
  document.getElementById('ec-fecha').value=c.fecha;
  document.getElementById('ov-edit-cartao').classList.add('open');
  setTimeout(initMasks,50);
}
function saveEditCartao(){
  const c=S.cartoes.find(x=>x.id===_editId);if(!c)return;
  const nome=document.getElementById('ec-nome').value.trim();
  if(!nome){showToast('Informe o nome do cartão.');return;}
  c.nome=nome;
  c.bandeira=document.getElementById('ec-band').value;
  const limite=getMoneyVal('ec-limite');
  if(limite>0)c.limite=limite;
  c.venc=parseInt(document.getElementById('ec-venc').value)||c.venc;
  c.fecha=parseInt(document.getElementById('ec-fecha').value)||c.fecha;
  saveState();closeOv('ov-edit-cartao');renderCartoes();
}
function deleteEditCartao(){
  if(!confirm('Excluir este cartão? As despesas vinculadas serão mantidas no histórico.'))return;
  S.tx.filter(t=>t.cartaoId===_editId).forEach(t=>delete t.cartaoId);
  S.cartoes=S.cartoes.filter(x=>x.id!==_editId);
  saveState();closeOv('ov-edit-cartao');renderCartoes();updateHome();
}
```

- [ ] **Step 2: Verificar no browser**

No console execute:
```js
openEditCartao(S.cartoes[0].id);
```
O modal `ov-edit-cartao` deve abrir com os dados do cartão preenchidos. Mude nome e limite, salve — o card deve atualizar. Exclua um cartão com despesas — as despesas continuam aparecendo em Lançamentos (sem cartão vinculado).

- [ ] **Step 3: Commit**
```
git add index.html
git commit -m "feat: funcoes JS de editar e excluir cartao"
```

---

### Task 4: Pressão longa — addLongPress + atualizar renderCartoes

**Files:**
- Modify: `index.html` — inserir `addLongPress` antes de `function renderCartoes()`
- Modify: `index.html` — template do `.cartao-card` (adicionar `data-id`)
- Modify: `index.html` — final de `renderCartoes()` (anexar listeners)

**Interfaces:**
- Consumes: `openEditBanco(id)`, `openEditCartao(id)` (Tasks 2 e 3); `S.bancos`, `S.cartoes`, variável `lista` (em escopo de `renderCartoes`)
- Produces: `addLongPress(el, cb)` — utilitário; `.cartao-card[data-id]` — atributo de query para listeners

- [ ] **Step 1: Adicionar `addLongPress` antes de `renderCartoes`**

Localizar `function renderCartoes(){`. Inserir imediatamente antes:
```js
function addLongPress(el,cb){
  let t=null;
  const start=()=>{t=setTimeout(()=>{if(navigator.vibrate)navigator.vibrate(30);cb();},500);};
  const cancel=()=>{clearTimeout(t);};
  el.addEventListener('touchstart',start,{passive:true});
  el.addEventListener('touchend',cancel);
  el.addEventListener('touchmove',cancel,{passive:true});
  el.addEventListener('mousedown',start);
  el.addEventListener('mouseup',cancel);
  el.addEventListener('mouseleave',cancel);
}
```

- [ ] **Step 2: Adicionar `data-id` ao template do `.cartao-card`**

Dentro de `renderCartoes()`, localizar:
```js
return`<div class="cartao-card" style="margin:0 12px 10px;border-color:${banco.cor}22">
```
Substituir por:
```js
return`<div class="cartao-card" data-id="${c.id}" style="margin:0 12px 10px;border-color:${banco.cor}22">
```

- [ ] **Step 3: Adicionar listeners ao final de `renderCartoes`**

Localizar o final de `renderCartoes()`:
```js
  }).join('');
}

function toggleBanco(id){
```
Substituir por:
```js
  }).join('');
  S.bancos.forEach(banco=>{
    const trigger=lista.querySelector('#banco-item-'+banco.id+' .banco-trigger');
    if(trigger)addLongPress(trigger,()=>openEditBanco(banco.id));
    S.cartoes.filter(c=>c.bancoId===banco.id).forEach(c=>{
      const card=lista.querySelector('.cartao-card[data-id="'+c.id+'"]');
      if(card)addLongPress(card,()=>openEditCartao(c.id));
    });
  });
}

function toggleBanco(id){
```

- [ ] **Step 4: Verificar no browser**

Acesse a aba Cartões. Pressione e segure (~500ms) sobre a linha de um banco — o modal `ov-edit-banco` deve abrir com vibração. Toque rápido no mesmo banco — continua abrindo/fechando o accordion normalmente. Pressione e segure sobre um card de cartão — o modal `ov-edit-cartao` deve abrir.

- [ ] **Step 5: Commit**
```
git add index.html
git commit -m "feat: pressao longa para abrir edicao de banco e cartao"
```

---

### Task 5: Bump do cache do Service Worker

**Files:**
- Modify: `sw.js` linha 1

**Interfaces:**
- Consumes: versão atual `controla-ai-v5`
- Produces: versão `controla-ai-v6`

- [ ] **Step 1: Atualizar a versão do cache**

Em `sw.js`, substituir:
```js
const CACHE = 'controla-ai-v5';
```
por:
```js
const CACHE = 'controla-ai-v6';
```

- [ ] **Step 2: Verificar**

Abra DevTools → Application → Service Workers. Recarregue a página. O SW deve registrar nova versão com `controla-ai-v6`.

- [ ] **Step 3: Commit**
```
git add sw.js
git commit -m "chore: bump service worker cache para controla-ai-v6"
```
