# Bingo Online

Bingo multiplayer em tempo real: um administrador cria a sala, sorteia as pedras, e os participantes marcam suas cartelas e pedem Bingo pelo navegador.

- Node.js/Express: API, autenticação e WebSocket em tempo real (Socket.IO);
- PostgreSQL persistente: administradores, salas, participantes, cartelas, sorteios e pedidos de Bingo;
- interface web responsiva para administrador e participantes;
- Docker Compose pronto para o Coolify.

## Estrutura do projeto

```
server.js              ponto de entrada: monta o app, sobe o servidor
src/
  db.js                 pool de conexão + aplica db/init.sql no boot
  auth.js                assinatura/verificação de JWT
  game.js                 regras do jogo (cartela, linhas, condição de vitória)
  events.js                 grava game_events e emite via Socket.IO
  rooms.js                   helpers de sala (busca por código, gera código)
  sockets.js                  configuração dos sockets
  rateLimit.js                  rate limiting das rotas de auth
  validate.js                    validação de corpo de requisição com Zod
  middleware/errors.js             erro tipado + handlers 404/500
  routes/
    admin.js               registro/login do administrador
    public.js               listagem pública de salas
    rooms.js                  CRUD de sala, entrada/login de jogador, sorteio
    player.js                  marcar número, pedir bingo
    requests.js                  aprovar/rejeitar pedido de bingo
db/init.sql             schema do Postgres (fonte única, aplicado no boot)
public/index.html       front-end (SPA em HTML/JS puro, sem build step)
```

## Desenvolvimento local

1. Suba só o Postgres:
   ```
   docker compose -f docker-compose.dev.yml up -d
   ```
2. Configure as variáveis de ambiente:
   ```
   cp .env.example .env
   ```
3. Instale as dependências e rode com hot-reload:
   ```
   npm install
   npm run dev
   ```
4. Acesse `http://localhost:3000` (participante) ou `http://localhost:3000/admin` (administrador).

## Publicar pelo Coolify

1. Envie a pasta inteira para a raiz do repositório GitHub (ou substitua o conteúdo atual por ela).
2. No Coolify, crie **New Resource → Docker Compose** e selecione o repositório e a branch.
3. Em **Build Pack / Compose file**, selecione `docker-compose.yml`.
4. Em **Environment Variables**, crie valores longos e únicos para:

   ```text
   POSTGRES_PASSWORD=uma-senha-longa-e-unica
   JWT_SECRET=uma-chave-aleatoria-com-mais-de-32-caracteres
   ```

5. Em **Domains**, adicione o domínio desejado para o serviço `app`, porta `3000`.
6. Clique em **Deploy**. O Coolify fornece o HTTPS automaticamente.

Após o deploy, crie a primeira conta de administrador pelo domínio configurado, crie uma sala e envie o link exibido no painel.

## Operação

O banco fica no volume Docker `bingo-db`. Não apague esse volume: ele contém as salas, contas e histórico. Para atualizar, envie as mudanças ao GitHub e use **Redeploy** no Coolify.

## O que mudou nesta branch

Veja [`MELHORIAS.md`](./MELHORIAS.md) para o changelog completo (segurança, organização do código, e redesign visual).
