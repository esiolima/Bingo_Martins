-- Schema do Bingo Online.
-- Executado automaticamente no boot do servidor (ver src/db.js), então também
-- serve como referência única do schema (nada de ALTER TABLE espalhado no código).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  admin_id uuid NOT NULL REFERENCES admins(id),
  max_players int NOT NULL CHECK (max_players BETWEEN 1 AND 200),
  cards_per_player int NOT NULL CHECK (cards_per_player BETWEEN 1 AND 4),
  win_condition text NOT NULL CHECK (win_condition IN ('one_line', 'two_lines', 'full_card')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'reviewing', 'finished')),
  admin_plays boolean NOT NULL DEFAULT false,
  drawn jsonb NOT NULL DEFAULT '[]',
  winner_player_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_admin_id ON rooms(admin_id);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  cards jsonb NOT NULL,
  marked jsonb NOT NULL DEFAULT '[]',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, name),
  UNIQUE (room_id, email)
);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);

CREATE TABLE IF NOT EXISTS bingo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  valid boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bingo_requests_room_id ON bingo_requests(room_id);
CREATE INDEX IF NOT EXISTS idx_bingo_requests_room_status ON bingo_requests(room_id, status);

CREATE TABLE IF NOT EXISTS game_events (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_events_room_id ON game_events(room_id);
