# Design: Avisos da home clicáveis + "fatura vence em breve"

Data: 2026-07-12
Status: aprovado pelo usuário
Branch: feat/disponivel-na-conta (batelada antes do deploy)

## Problema

Os avisos da tela inicial (`#home-alerts`, montados em `updateHome`) não levam de forma
consistente ao item relacionado:
- Renda extra: **não é clicável**.
- Parcelas: já leva à aba Parcelas (OK).
- Cartão (limite alto) e Fatura vencida: levam à aba Cartões **geral**, não ao cartão.
- Não existe aviso de fatura **antes** de vencer (o atual só aparece depois de vencida —
  tarde demais para evitar juros).

## Objetivo

Tornar cada aviso clicável e levá-lo diretamente ao item relevante; e avisar a fatura
**antes** de vencer.

## Decisões (brainstorming)

- Cartão/fatura → abre **o cartão específico** (expande + rola).
- Renda extra → aba **Extra** (registros do mês).
- Adicionar aviso **"vence em breve"** com janela de **≤ 5 dias**.
- Sem tocar em cálculo de fatura/saldo — só navegação + 1 aviso novo.

## Solução

### Novo helper `navToCartao(bancoId)`
Vai para a aba Cartões, expande o accordion daquele banco e rola até ele.
```js
function navToCartao(bancoId){
  navTo('cartoes');
  setTimeout(function(){
    const item=document.getElementById('banco-item-'+bancoId);
    if(!item)return;
    document.querySelectorAll('.banco-item.open').forEach(el=>el.classList.remove('open'));
    item.classList.add('open');
    item.scrollIntoView({behavior:'smooth',block:'center'});
  },60);
}
```
Usa a estrutura existente: `#banco-item-${id}` + classe `.open` (mesma de `toggleBanco`).

### Avisos em `updateHome` (~linhas 1583-1596)
1. **Renda extra**: adicionar `onclick="navTo('renda')"`, `cursor:pointer` e seta ` ›`.
2. **Cartão – limite alto**: trocar `navTo('cartoes')` por `navToCartao(c.bancoId)`.
3. **Fatura vencida**: trocar `navTo('cartoes')` por `navToCartao(c.bancoId)`.
4. **Parcelas**: mantém `navTo('parc')` (o aviso é a soma de todas; aba geral é o destino
   correto).

### Novo aviso "fatura vence em breve"
Para cada cartão com `faturaRestante(c.id,curY,curM) > 0`, no **mês atual**
(`curY/curM === now`), quando faltam **0 a 5 dias** para `c.venc` e **ainda não venceu**:
- Texto: `💳 Fatura {banco} {cartão} vence {quando} — {R$ restante} ›`, onde `{quando}` é
  "hoje" (dias=0), "amanhã" (dias=1) ou "em N dias".
- Estilo `alert-amber` (suave). `onclick="navToCartao(c.bancoId)"`.
- Mutuamente exclusivo com "venceu" (vencida exige `hoje>venc`; esta exige `venc>=hoje`).
- `dias = c.venc - hoje` (dia do mês). Só mês corrente, como o aviso de vencida.

## Fora de escopo
- Deep-link do aviso de parcelas para uma parcela específica (é uma soma).
- Qualquer mudança em cálculo de fatura/limite/saldo.

## Critérios de sucesso
1. Clicar em cada aviso leva ao destino certo (renda→Extra; parcela→Parcelas;
   cartão/fatura→aquele cartão expandido).
2. Aviso "vence em breve" aparece com ≤5 dias, some ao vencer, texto adapta hoje/amanhã/N.
3. Nenhum cartão mostra "vence em breve" e "venceu" ao mesmo tempo.
4. Nenhuma regressão em cálculo (só navegação + aviso novo).
