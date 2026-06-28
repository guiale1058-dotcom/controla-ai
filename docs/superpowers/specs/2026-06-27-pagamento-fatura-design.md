# Pagamento de Fatura de Cartão — Design

**Data:** 2026-06-27
**Arquivo alvo:** `controla-ai-pwa/index.html`
**Abordagem:** Pagamentos integrados ao extrato (`type: 'pagamento_fatura'` em `S.tx`)
**Escopo:** Ciclo completo de fatura — lançamento, pagamento parcial/total, aviso de saldo em aberto

---

## Contexto

Hoje o app desconta despesas de cartão do saldo geral imediatamente, como se fossem pagamentos em dinheiro. Isso distorce o saldo real: o dinheiro ainda está na conta até o dia do pagamento da fatura. Além disso, não existe nenhum mecanismo para registrar o pagamento da fatura.

Esta feature corrige o modelo financeiro e adiciona o fluxo completo de pagamento.

---

## Decisões de Design

| Decisão | Escolha |
|---|---|
| Pagamento marca fatura E debita saldo? | Sim — ambos |
| Pagamento parcial? | Sim — múltiplos pagamentos no mesmo mês |
| Carry-over automático de dívida? | Não — app avisa, usuário decide |
| Modelo de cartão | Card expenses NÃO reduzem saldo; só pagamentos reduzem |
| Onde acionar pagamento | Botão no card do cartão (tela Cartões) |
| Onde aparece o pagamento | No extrato (tela Transações) como linha distinta |

---

## 1. Modelo de Dados

### Nova transação: `type: 'pagamento_fatura'`

Salva em `S.tx` com a estrutura:

```js
{
  id: Number,           // S.nid++
  type: 'pagamento_fatura',
  cartaoId: Number,     // id do cartão que está sendo pago
  val: Number,          // valor pago (positivo)
  date: 'YYYY-MM-DD',  // data do pagamento
  desc: String          // ex: 'Pagamento Fatura Nubank Gold'
}
```

### Nova função: `faturaRestante(cid, y, m)`

```js
function faturaRestante(cid, y, m) {
  const total = faturaCartao(cid, y, m);
  const pago = S.tx
    .filter(t => t.type === 'pagamento_fatura' && t.cartaoId === cid
      && new Date(t.date + 'T12:00').getFullYear() === y
      && new Date(t.date + 'T12:00').getMonth() === m)
    .reduce((s, t) => s + t.val, 0);
  return Math.max(0, total - pago);
}
```

### Nova função: `totalPagoFatura(cid, y, m)`

```js
function totalPagoFatura(cid, y, m) {
  return S.tx
    .filter(t => t.type === 'pagamento_fatura' && t.cartaoId === cid
      && new Date(t.date + 'T12:00').getFullYear() === y
      && new Date(t.date + 'T12:00').getMonth() === m)
    .reduce((s, t) => s + t.val, 0);
}
```

### Migração de dados existentes

Nenhuma alteração nos dados gravados. As transações existentes com `cartaoId` permanecem intactas. Apenas o cálculo do saldo muda. No primeiro acesso após a atualização, exibir um toast informativo único:

> "💡 Modelo de cartão atualizado: despesas de cartão não reduzem mais o saldo imediatamente."

Controlado por flag em `S.perfil.faturaModeloV2 = true` (setado no primeiro boot pós-update).

---

## 2. Cálculo do Saldo

### Regra atual

```
saldo = saldoInicial + receitas + rendas − TODAS_as_despesas − parcelas
```

### Regra nova

```
saldo = saldoInicial + receitas + rendas − despesas_sem_cartão − parcelas − pagamentos_fatura_do_mês
```

### Mudanças no código

**`getMonthData()` / cálculo do saldo:**

```js
// ANTES
const desp = S.tx.filter(t => t.type === 'expense' && mesAtual(t)).reduce((s,t) => s+t.val, 0);

// DEPOIS
const desp = S.tx.filter(t => t.type === 'expense' && !t.cartaoId && mesAtual(t)).reduce((s,t) => s+t.val, 0);
const fatPago = S.tx.filter(t => t.type === 'pagamento_fatura' && mesAtual(t)).reduce((s,t) => s+t.val, 0);
// saldoAtual = saldoInicial + rec + uLiq - desp - parcTot - fatPago
```

**"Fatura do mês"** no resumo de Cartões continua exibindo `faturaCartao(cid, y, m)` — o total comprado, não o pago. Assim o usuário vê o compromisso total, independente de ter pago.

---

## 3. UI — Card do Cartão

### Área da fatura (`.cc-fatura`) — nova estrutura

```
Fatura de Junho             R$ 850,00   ← faturaCartao (total gasto)
Pago                        R$ 500,00   ← totalPagoFatura (se > 0)
A pagar                     R$ 350,00   ← faturaRestante (vermelho)
[💳 Pagar fatura]                       ← botão; some quando restante = 0
✅ Fatura quitada                       ← aparece quando restante = 0
```

**Regras visuais:**
- Linha "Pago" só aparece se `totalPagoFatura > 0`
- Linha "A pagar" só aparece se `faturaRestante > 0`
- Botão "Pagar fatura" visível quando `faturaRestante > 0`
- Badge "✅ Fatura quitada" (cor `--green`) quando `faturaRestante === 0 && faturaCartao > 0`
- Badge "⚠️ Em aberto" (cor `--amber`) quando `faturaRestante > 0` e a data atual é após o `c.venc` do mês corrente

---

## 4. Modal de Pagamento (`ov-pagar-fatura`)

### Estrutura do modal

```html
<div class="ov" id="ov-pagar-fatura">
  <div class="ov-box">
    <h2>Pagar Fatura — <span id="pf-nome"></span></h2>

    <!-- Resumo readonly -->
    <div class="pf-resumo">
      <div>Fatura total <span id="pf-total"></span></div>
      <div>Já pago      <span id="pf-pago"></span></div>
      <div>Restante     <span id="pf-rest"></span></div>
    </div>

    <!-- Inputs -->
    <div class="fg">
      <label>Valor do pagamento</label>
      <input id="pf-val" type="number" inputmode="decimal" placeholder="0,00"/>
    </div>
    <div class="fg">
      <label>Data</label>
      <input id="pf-data" type="date"/>
    </div>

    <button class="bpri" onclick="salvarPagamentoFatura()">Confirmar pagamento</button>
    <button class="bcan" onclick="closeOv('ov-pagar-fatura')">Cancelar</button>
  </div>
</div>
```

### Estado interno do modal

```js
let _pfCartaoId = null; // cartaoId ativo no modal

function openPagarFatura(cid) {
  _pfCartaoId = cid;
  const c = S.cartoes.find(x => x.id === cid);
  const b = S.bancos.find(x => x.id === c.bancoId);
  const fat = faturaCartao(cid, curY, curM);
  const pago = totalPagoFatura(cid, curY, curM);
  const rest = faturaRestante(cid, curY, curM);

  document.getElementById('pf-nome').textContent = `${b.nome} ${c.nome}`;
  document.getElementById('pf-total').textContent = fmt(fat);
  document.getElementById('pf-pago').textContent = fmt(pago);
  document.getElementById('pf-rest').textContent = fmt(rest);
  document.getElementById('pf-val').value = rest.toFixed(2);
  document.getElementById('pf-data').value = toDateInput(now); // YYYY-MM-DD de hoje
  openOv('ov-pagar-fatura');
}
```

### Salvar pagamento

```js
function salvarPagamentoFatura() {
  const val = parseFloat(document.getElementById('pf-val').value);
  const date = document.getElementById('pf-data').value;
  if (!val || val <= 0 || !date) { showToast('Preencha o valor e a data'); return; }

  const c = S.cartoes.find(x => x.id === _pfCartaoId);
  const b = S.bancos.find(x => x.id === c.bancoId);

  S.tx.push({
    id: S.nid++,
    type: 'pagamento_fatura',
    cartaoId: _pfCartaoId,
    val,
    date,
    desc: `Pagamento Fatura ${b.nome} ${c.nome}`
  });

  save();
  closeOv('ov-pagar-fatura');
  renderAll();
  showToast(`💳 Pagamento de ${fmt(val)} registrado`);
}
```

---

## 5. Extrato (Tela Transações)

Pagamentos de fatura aparecem no extrato como linha distinta:

```
💳  Pagamento Fatura Nubank Gold     [27/06]
    Fatura · pagamento               -R$ 500,00   ← cor: var(--teal)
```

No `renderTx()`, filtrar e renderizar `type === 'pagamento_fatura'` com:
- Ícone: `💳`
- Cor de fundo do ícone: `rgba(6,182,212,.15)` (ciano translúcido)
- Valor: `−R$ X,XX` na cor `var(--teal)`
- Subtítulo: `Fatura · pagamento`
- Filtro "Cartões" na tela de Transações deve incluir esses registros

---

## 6. Alerta no Home

Se qualquer cartão tiver `faturaRestante > 0` e a data atual for após o `c.venc` do mês corrente, adicionar alerta no painel de alertas da Home:

```
💳 Fatura Nubank Gold venceu com R$ 350,00 em aberto ›  (âmbar)
```

Clicando no alerta, navega para a tela de Cartões.

---

## 7. O que NÃO muda

- Estrutura de `S.cartoes`, `S.bancos`, `S.parcs` — sem alterações
- `faturaCartao(cid, y, m)` — sem alterações
- Modal de cartão existente (`ov-cartao`) — sem alterações
- Modal de banco existente (`ov-banco`) — sem alterações
- Layout geral da tela de Cartões — só a área `.cc-fatura` é expandida

---

## 8. Critério de Sucesso

- Despesa lançada no cartão NÃO reduz o saldo da home
- Pagamento de fatura (total ou parcial) reduz o saldo corretamente
- Card do cartão mostra: total gasto, total pago, restante a pagar
- Botão "Pagar fatura" abre modal com valor pré-preenchido
- Pagamento aparece no extrato como linha distinta em ciano
- Alerta na Home quando fatura vencida com saldo em aberto
- Toast informativo exibido uma única vez após a atualização do modelo
