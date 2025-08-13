
create table if not exists members (
  id bigserial primary key,
  party_code text not null,
  name text not null,
  created_at timestamptz default now()
);
create index if not exists members_party_idx on members(party_code);

create table if not exists events (
  id bigserial primary key,
  party_code text not null,
  member_id bigint not null,
  day date not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  messages int not null default 1,
  cost_usd numeric not null default 0,
  created_at timestamptz default now()
);
create index if not exists events_member_day_idx on events(member_id, day);
create index if not exists events_party_idx on events(party_code);
