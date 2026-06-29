# Editar e Excluir Banco e Cartão — Design Spec

**Data:** 2026-06-29
**Arquivo alvo:** `index.html` (único arquivo do PWA)
**Objetivo:** Permitir ao usuário corrigir ou remover cadastros de bancos e cartões após criação.

---

## Contexto

Hoje o app permite criar bancos e cartões mas não oferece nenhuma forma de editá-los ou excluí-los. Um cadastro errado (nome, bandeira, limite, vencimento ou fechamento) é permanente até um reset total do app.

---

## Decisões de Design

| Decisão | Escolha | Racional |
|---------|---------|----------|
| Trigger de edição | Pressão longa (500ms) | Mobile-first, não polui o visual, coerente com padrão do app |
| Feedback háptico | `navigator.vibrate(30)` ao disparar | Já usado em `toggleBanco()`; confirma ação ao usuário |
| Excluir banco com cartões | Bloquear com `showAlert()` | Evita cascata acidental de dados financeiros |
| Excluir cartão com despesas | Cascata suave — desvincula, não apaga | Mantém histórico financeiro íntegro |
| Campo banco em `ov-edit-cartao` | Não incluído | Mover cartão de banco não é caso de uso real |

---

## Novos Modais HTML

### `ov-edit-banco`

Campos: Nome (input text), Cor (select de cores predefinidas do app).
Botões: Salvar, Excluir banco, Cancelar.

### `ov-edit-cartao`

Campos: Nome, Bandeira (select), Limite (money input), Vencimento (dia), Fechamento (dia).
Botões: Salvar alterações, Excluir cartão, Cancelar.

Ambos adicionados ao array `[...].forEach(id => {...})` que fecha modais ao clicar fora.

---

## Comportamento da Pressão Longa

**Função utilitária:** `addLongPress(el, callback)` — encapsula a lógica de timer para não duplicar código.

```
touchstart  → inicia timer 500ms
touchmove   → cancela timer (usuário está scrollando)
touchend    → cancela timer (toque normal)
mousedown   → inicia timer 500ms (suporte desktop)
mouseup     → cancela timer
```

Ao disparar (500ms sem cancelamento):
1. `navigator.vibrate(30)`
2. Chama `callback(id)` com o ID do banco ou cartão

**Alvos:**
- Pressão longa em `.banco-trigger` → `openEditBanco(banco.id)`
- Pressão longa em `.cartao-card` → `openEditCartao(c.id)`

O toque normal nas `.banco-trigger` continua chamando `toggleBanco()` normalmente. O botão "Pagar fatura" usa `event.stopPropagation()` já existente — não interfere.

---

## Funções JavaScript

### Banco

**`openEditBanco(id)`**
- Popula `_editId`, preenche campos de `ov-edit-banco`, abre o modal.

**`saveEditBanco()`**
- Busca `S.bancos.find(x => x.id === _editId)`
- Atualiza `nome` e `cor`
- `saveState()` + `renderCartoes()` + `closeOv('ov-edit-banco')`

**`deleteEditBanco()`**
- Se `S.cartoes.some(c => c.bancoId === _editId)` → `showAlert('Remova os cartões deste banco antes de excluí-lo.')` e retorna
- Caso contrário: `showConfirm(...)` → remove de `S.bancos` → `saveState()` + `renderCartoes()`

### Cartão

**`openEditCartao(id)`**
- Popula `_editId`, preenche todos os campos de `ov-edit-cartao`, abre o modal.

**`saveEditCartao()`**
- Busca `S.cartoes.find(x => x.id === _editId)`
- Atualiza nome, bandeira, limite, vencimento e fechamento
- `saveState()` + `renderCartoes()` + `closeOv('ov-edit-cartao')`

**`deleteEditCartao()`**
- `showConfirm(...)` →
  - `S.tx.filter(t => t.cartaoId === _editId).forEach(t => delete t.cartaoId)` — desvincula despesas
  - `S.cartoes = S.cartoes.filter(x => x.id !== _editId)` — remove cartão
  - `saveState()` + `renderCartoes()` + `updateHome()` + `closeOv('ov-edit-cartao')`

---

## Cores disponíveis para banco

Usar as mesmas cores do preset de bancos existente:
`#820ad1` (Nubank), `#cc092f` (Bradesco), `#f8c300` (BB), `#ec0000` (Santander), `#003d7b` (Itaú), `#005ca9` (Caixa), `#ff7a00` (Inter), `#242424` (C6), `#11c76f` (PicPay), `#6eb52b` (Neon), `#006937` (Sicoob), `#00b1ea` (Mercado Pago), `#063970` (BTG), `#7b2d8b` (Will Bank), `#555555` (Outro).

---

## Cobertura de casos de borda

| Caso | Comportamento |
|------|---------------|
| Excluir banco com cartões | Bloqueado com `showAlert()` |
| Excluir cartão com despesas | Despesas desvinculadas (`cartaoId` removido), histórico mantido |
| Excluir cartão com pagamentos de fatura | Pagamentos de fatura (`type='pagamento_fatura'`) também desvinculados |
| Salvar sem preencher nome | `showFieldError()` já existente bloqueia |
| Pressão longa durante scroll | `touchmove` cancela o timer — não dispara |

---

## Arquivos Modificados

| Arquivo | O que muda |
|---------|-----------|
| `index.html` — `<style>` | Nenhuma adição necessária (estilos de modal já existem) |
| `index.html` — HTML | Adicionar `ov-edit-banco` e `ov-edit-cartao` antes de `</body>` |
| `index.html` — JS | Adicionar `addLongPress`, `openEditBanco`, `saveEditBanco`, `deleteEditBanco`, `openEditCartao`, `saveEditCartao`, `deleteEditCartao`; atualizar `renderCartoes` para aplicar `addLongPress` nos elementos renderizados; adicionar IDs ao array de fechamento de modais |
| `sw.js` | Bump de versão do cache |
