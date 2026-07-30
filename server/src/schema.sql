-- One table for the record, one row for the cursor. Both are idempotent so the
-- server can run this on every boot without a migration tool.

create table if not exists programs (
  program_id      text primary key,
  first_seen_at   timestamptz not null default now(),
  deploy_slot     bigint      not null,
  bytecode_sha256 text        not null,
  size_bytes      integer     not null,
  -- null  = no earlier program shares this bytecode (as far as the record goes)
  -- set   = the program_id that had these bytes first
  copy_of         text        references programs(program_id)
);

create index if not exists programs_first_seen_idx on programs (first_seen_at desc);
create index if not exists programs_hash_idx       on programs (bytecode_sha256);
create index if not exists programs_copy_of_idx    on programs (copy_of);

create table if not exists poll_cursor (
  id         integer primary key default 1,
  last_slot  bigint      not null,
  updated_at timestamptz not null default now(),
  constraint poll_cursor_singleton check (id = 1)
);
