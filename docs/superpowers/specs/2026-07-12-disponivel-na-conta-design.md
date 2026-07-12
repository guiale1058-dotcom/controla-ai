# Design: "Disponível na conta" (saldo real ajustável)

Data: 2026-07-12
Status: aprovado pelo usuário

## Problema

O usuário não consegue ver "quanto dinheiro eu tenho agora". A home mostra um número
grande chamado **"Saldo atual"** que, na prática, é calculado como:

```
saldoInicial + (movimento SÓ do mês selecionado)
= saldoInicial + rec + rendaLíquida − desp − parcelasDoMês − faturaPaga
```

Todos os componentes (`rec`, `desp`, etc.) são filtrados pelo mês navegado
(`getMonthTx`, `getMonthRenda`, `getMthParcTot`). Consequências:

1. **Não acumula entre meses** e muda ao navegar — não representa o saldo real.
2. **Parcela do carro do mês** (R$1.556,72) derruba o número, deixando-o negativo
   (visto no print: "SALDO ATUAL: R$ −1.099,54") mesmo com dinheiro em conta.
3. **`saldoInicial` está velho** (R$134,67 na config) — foi digitado uma vez e nunca
   mais atualizado. O valor real hoje é ~R$662.

Resultado: o rótulo diz "Saldo atual", mas a conta responde outra pergunta. O usuário
fica perdido e sem confiança no número.

## Objetivo

Mostrar, em destaque na home, **quanto o usuário tem de dinheiro real agora**, num
número em que ele confie, fácil de manter batendo com a realidade.

## Decisões do usuário (brainstorming)

- Abordagem: **saldo em conta ajustável** (não cálculo 100% automático).
- Auto-ajuste: **sim** — lançamentos de caixa ajustam o valor sozinhos, com botão de
  correção manual sempre disponível.
- Parcela do carro: **sai da mesma conta todo mês** → deve descontar do disponível no
  mês em que é paga (só a parcela do mês, nunca o total remanescente).

## Solução

Separar dois conceitos que hoje estão fundidos num número só:

### 1) "Disponível na conta" — estoque (dinheiro real, agora)

- Número grande no topo da home, substituindo o "Saldo atual" atual.
- **Independente do seletor de mês** — é "agora", não muda ao navegar meses.
- Botão **"Corrigir"** (lápis) ao lado. O usuário confere no app do banco e digita o
  valor real (ex.: 662); isso re-ancora o cálculo.
- Cor: verde quando ≥ 0 (a expectativa é ficar positivo na maioria dos casos).

**Modelo de dados (âncora + delta, derivado):**

Guardar em `S.perfil.saldoConta = { valor: number, data: 'YYYY-MM-DD' }`.

```
Disponível agora = saldoConta.valor
                 + Σ (eventos de caixa com data > saldoConta.data e ≤ hoje)
```

Por ser **derivado** (recalculado a partir da âncora + eventos datados), editar ou
excluir um lançamento reflui automaticamente — não há mutação de saldo a manter
sincronizada.

**O que conta como "evento de caixa" (afeta o disponível):**

| Evento                                   | Sinal | Observação |
|------------------------------------------|-------|------------|
| Receita (`type='income'`)                | +     | entrou na conta |
| Renda extra (líquido)                    | +     | `val − custo` |
| Despesa paga pela conta (sem `cartaoId`) | −     | saiu da conta |
| Pagamento de fatura (`pagamento_fatura`) | −     | saiu da conta |
| Parcela do mês (financiamento/boleto)    | −     | só a parcela daquele mês |
| **Despesa no cartão (`cartaoId` set)**   | 0     | NÃO afeta; só entra via fatura paga |

**"Corrigir" = re-ancorar:** ao salvar um novo valor, gravar
`saldoConta = { valor: <novo>, data: <hoje> }`. Isso zera a acumulação anterior e passa
a acumular só dali pra frente. Simples e sempre reconciliável com o banco.

**Parcelas (detalhe de implementação a resolver no plano):** parcelas vivem em
`S.parcs` como cronograma, não como `tx`. Para somá-las no delta, é preciso derivar, pra
cada mês entre a âncora e hoje, a parcela devida cujo vencimento já passou. Confirmar que
uma parcela paga NÃO é duplicada como `tx` (senão contaria duas vezes).

### 2) "Movimento de Julho" — fluxo (como foi o mês)

- Os 4 chips atuais (Receitas, Renda extra, Despesas, Parcelas) permanecem, mas **abaixo**
  do disponível, sob um título que deixa claro serem o **movimento do mês selecionado**,
  não o saldo.
- Adicionar linha **"Resultado do mês"** = entradas − saídas do mês (pode ser negativo,
  e tudo bem — é honesto e não é mais confundido com "saldo").
- Gráfico "Despesas por categoria" e "Últimos lançamentos" seguem iguais.

### Layout da home

```
┌─────────────────────────────────┐
│  DISPONÍVEL NA CONTA      ✏️      │
│  R$ 662,00                       │   ← real, ajustável, verde
│  confira no seu banco e ajuste   │
├─────────────────────────────────┤
│  Movimento de Julho              │   ← título novo
│  [Receitas] [Renda extra]        │
│  [Despesas] [Parcelas]           │
│  Resultado do mês: −R$ 3.297,66  │
├─────────────────────────────────┤
│  Despesas por categoria (gráfico)│   ← igual
│  Últimos lançamentos             │   ← igual
└─────────────────────────────────┘
```

## Config / perfil

- O campo "Saldo inicial (conta)" na config passa a editar `saldoConta.valor` (e grava
  `data = hoje` ao salvar). Rótulo sugerido: **"Saldo em conta (hoje)"**.
- Botão "Corrigir" da home abre o mesmo fluxo de edição desse valor.

## Migração

Usuários existentes têm `S.perfil.saldoInicial` (número solto, ex.: 134,67) e sem âncora.

- Na primeira carga da nova versão, **perguntar uma vez**: *"Quanto você tem na conta
  hoje?"*, pré-preenchido com o `saldoInicial` antigo. O valor confirmado vira
  `saldoConta = { valor, data: hoje }`.
- Isso evita replay do histórico e o susto do número negativo.
- Manter `saldoInicial` legado como fallback de leitura, mas a fonte de verdade passa a
  ser `saldoConta`.

## Fora de escopo (YAGNI)

- Saldo projetado ("quanto sobra depois de pagar as contas do mês").
- Saldo por banco/conta individual (o disponível é um número único e global).
- Sincronização automática com o banco (Open Finance).

## Critérios de sucesso

1. Na home, o usuário vê um número de "Disponível na conta" que bate com o saldo real do
   banco após corrigir uma vez.
2. O número **não muda** ao navegar entre meses.
3. Adicionar receita/renda extra aumenta o disponível; adicionar gasto pela conta,
   pagamento de fatura ou parcela do mês diminui; gasto no cartão não altera.
4. O botão "Corrigir" reconcilia o valor com 1 toque.
5. Nenhum número negativo assustador aparece como "saldo" na primeira abertura.
