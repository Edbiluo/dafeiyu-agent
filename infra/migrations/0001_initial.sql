CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY,
  tenant_key text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_installations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_installation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform, external_installation_id)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES platform_installations(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, external_user_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES platform_installations(id) ON DELETE CASCADE,
  external_conversation_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dm', 'group', 'livestream')),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, external_conversation_id)
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS inbound_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES platform_installations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_event_id text NOT NULL,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, external_event_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  inbound_event_id uuid REFERENCES inbound_events(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  external_message_id text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_time_idx
  ON messages (conversation_id, occurred_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  attempt integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  failure_message text,
  result_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_message_id)
);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs (status, created_at);

CREATE TABLE IF NOT EXISTS run_events (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox_events (available_at, created_at)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS memory_nodes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('user', 'conversation', 'tenant')),
  owner_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('identity', 'preference', 'project', 'decision', 'event', 'goal')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived', 'deleted')),
  summary text NOT NULL,
  importance smallint NOT NULL CHECK (importance BETWEEN 1 AND 3),
  confidence real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  tags text[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz,
  expires_at timestamptz,
  embedding vector(1536),
  embedding_model text,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(summary, ''))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memory_nodes_owner_idx
  ON memory_nodes (tenant_id, owner_type, owner_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS memory_nodes_active_summary_idx
  ON memory_nodes (tenant_id, owner_type, owner_id, summary)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS memory_nodes_search_idx
  ON memory_nodes USING gin (search_vector);

CREATE TABLE IF NOT EXISTS memory_sources (
  memory_node_id uuid NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation IN ('derived_from', 'confirms', 'supersedes')),
  PRIMARY KEY (memory_node_id, message_id)
);

CREATE TABLE IF NOT EXISTS memory_extractions (
  run_id uuid PRIMARY KEY REFERENCES agent_runs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
