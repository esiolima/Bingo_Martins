# Bingo Online — implantação no Coolify

## O que este pacote contém

- Node.js/Express: API, autenticação e WebSocket em tempo real;
- PostgreSQL persistente: administradores, salas, participantes, cartelas, sorteios e pedidos de Bingo;
- interface web responsiva para administrador e participantes;
- Docker Compose pronto para o Coolify.

## Publicar pelo Coolify

1. Envie a pasta inteira `bingo-vps` para a raiz do repositório GitHub (ou substitua o conteúdo atual por ela).
2. No Coolify, crie **New Resource → Docker Compose** e selecione o repositório `esiolima/Bingo_Martins` e a branch `main`.
3. Em **Build Pack / Compose file**, selecione `docker-compose.yml` dentro da pasta `bingo-vps` (ou configure essa pasta como base directory).
4. Em **Environment Variables**, crie valores longos e únicos para:

   ```text
   POSTGRES_PASSWORD=uma-senha-longa-e-unica
   JWT_SECRET=uma-chave-aleatoria-com-mais-de-32-caracteres
   ```

5. Em **Domains**, adicione `https://bingo.jornaltrade.cloud` para o serviço `app`, porta `3000`.
6. Clique em **Deploy**. O Coolify fornece o HTTPS automaticamente.

Após o deploy, crie a primeira conta de administrador em `https://bingo.jornaltrade.cloud`, crie uma sala e envie o link exibido no painel.

## Operação

O banco fica no volume Docker `bingo-db`. Não apague esse volume: ele contém as salas, contas e histórico. Para atualizar, envie as mudanças ao GitHub e use **Redeploy** no Coolify.
