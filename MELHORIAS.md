# Melhorias aplicadas

Resumo do que mudou em relação à branch `main`, para colar na descrição do PR.

## Back-end

- **Bug de segurança corrigido**: o player criado quando o admin marca "quero jogar" tinha `password_hash` = string literal `"ADMIN"` (não um hash). Agora gera uma senha aleatória e a hasheia com bcrypt de verdade.
- **`server.js` modularizado** em `src/` (`routes/`, `auth.js`, `game.js`, `events.js`, `sockets.js`, `db.js`, `middleware/errors.js`), em vez de um arquivo único com tudo em uma linha.
- **Rate limiting** (`express-rate-limit`) nas rotas de login/registro/entrada em sala — 20 tentativas / 15 min por IP.
- **Helmet** para headers de segurança HTTP (HSTS, X-Frame-Options, X-Content-Type-Options etc.).
- **Validação de entrada com Zod** em vez de `if` manuais espalhados pelas rotas.
- **Transação de banco** na criação de sala + player-admin: se uma parte falhar, nada fica salvo pela metade.
- **Tratamento de erro assíncrono centralizado** (`asyncHandler` + middleware de erro) — antes um erro não tratado numa rota `async` podia derrubar o processo sem responder ao cliente.
- **Índices explícitos** nas colunas de foreign key (`room_id` em `players`, `bingo_requests`, `game_events`), que o Postgres não cria automaticamente.
- **Geração de cartela com Fisher-Yates** em vez de `sort(() => Math.random() - .5)`, que tem viés de distribuição conhecido.
- **Socket.IO valida se a sala existe** antes de inscrever o cliente nela (`room:join`).
- **`.env.example`** e `docker-compose.dev.yml` para rodar Postgres localmente sem depender do ambiente de produção.

## Front-end (`public/index.html`)

- Paleta mais vibrante (gradiente laranja/coral nos elementos de destaque) e tipografia Fredoka nos títulos/números, mantendo a base verde-floresta.
- Animação de "queda" na bola sorteada e "pop" na célula ao marcar um número.
- Modal de BINGO com confete em canvas (sem dependência externa).
- Sistema de **toasts** substituindo todos os `alert()` nativos.
- **Avatares** com iniciais e cor derivada do nome, na lista de participantes e nos pedidos de bingo.
- **Skeletons** de carregamento na home e no dashboard, em vez de tela em branco até o fetch responder.

## Removido

- `admin-bingo.html` e `bingo-sala.html` — protótipo antigo (dados fake, tudo em `localStorage`, senha em texto puro) que não era mais servido pelo `server.js`. Ficava como código morto confuso no repositório.

## O que ainda vale considerar depois

- Mover o JWT de `localStorage` para cookie `httpOnly` (reduz superfície de XSS).
- Extrair o `<script>` inline de `public/index.html` para um arquivo `.js` separado, permitindo reativar a Content-Security-Policy padrão do Helmet (hoje desligada por causa do script inline).
- Testes automatizados (Vitest/Jest + Supertest) para as rotas de jogo.
