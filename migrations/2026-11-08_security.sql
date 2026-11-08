-- Trial Armor security migration
-- Project: ojxhqbtozjxurzztqxpb
-- Run once in Supabase Studio > SQL Editor, on the project, before deploying the
-- account-aware app from branch improvements-nov7.
-- What it does: adds per-user ownership, scrubs stored PANs/CVVs to last4 only,
-- marks existing rows as demo data, turns on row level security for every table,
-- adds an insert-only waitlist table, and adds the indexes the policies need.

begin;

-- 1. Ownership columns
alter table public.cards   add column if not exists owner uuid references auth.users(id) on delete cascade;
alter table public.cards   add column if not exists is_demo boolean not null default false;
alter table public.cards   add column if not exists card_last4 text;
alter table public.charges add column if not exists owner uuid references auth.users(id) on delete cascade;
alter table public.charges add column if not exists idempotency_key text;

-- 2. Scrub stored card data on existing rows: keep only the last 4 digits.
-- card_cvv is NOT NULL in the current schema, so relax it before the wipe.
alter table public.cards alter column card_cvv drop not null;
update public.cards
   set card_last4 = right(regexp_replace(coalesce(card_number, ''), '[^0-9]', '', 'g'), 4)
 where card_last4 is null;
update public.cards set card_cvv = null;
update public.cards set card_number = card_last4 where card_last4 is not null;

-- 3. Demo isolation: existing pre-launch rows are demo data, readable but never ownable
update public.cards set is_demo = true where owner is null;

-- 4. Row level security
alter table public.cards   enable row level security;
alter table public.charges enable row level security;

drop policy if exists cards_select   on public.cards;
drop policy if exists cards_insert   on public.cards;
drop policy if exists cards_update   on public.cards;
drop policy if exists cards_delete   on public.cards;
drop policy if exists cards_demo_read on public.cards;
drop policy if exists charges_select on public.charges;
drop policy if exists charges_insert on public.charges;
drop policy if exists charges_delete on public.charges;
drop policy if exists charges_demo_read on public.charges;

-- Signed-in users: their own rows, plus read-only demo rows
create policy cards_select on public.cards for select to authenticated
  using (owner = auth.uid() or is_demo);
create policy cards_insert on public.cards for insert to authenticated
  with check (owner = auth.uid() and is_demo = false);
create policy cards_update on public.cards for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy cards_delete on public.cards for delete to authenticated
  using (owner = auth.uid());

create policy charges_select on public.charges for select to authenticated
  using (owner = auth.uid() or exists (
    select 1 from public.cards c where c.id = card_id and c.is_demo));
create policy charges_insert on public.charges for insert to authenticated
  with check (owner = auth.uid());
create policy charges_delete on public.charges for delete to authenticated
  using (owner = auth.uid());

-- Anonymous visitors: read-only on demo rows only. No writes, ever.
create policy cards_demo_read on public.cards for select to anon
  using (is_demo);
create policy charges_demo_read on public.charges for select to anon
  using (exists (select 1 from public.cards c where c.id = card_id and c.is_demo));

-- 5. Waitlist: public insert-only capture for the landing page
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (position('@' in email) > 1),
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
drop policy if exists waitlist_insert on public.waitlist;
create policy waitlist_insert on public.waitlist for insert to anon with check (true);
-- No one reads the waitlist over the public API; the dashboard and service role still can.
revoke all on public.waitlist from anon;
grant insert on public.waitlist to anon;
revoke all on public.waitlist from authenticated;

-- 6. Indexes the policies lean on
create index if not exists cards_owner_idx  on public.cards(owner);
create index if not exists charges_card_idx on public.charges(card_id);
create index if not exists charges_owner_idx on public.charges(owner);
create unique index if not exists charges_idem_idx on public.charges(idempotency_key)
  where idempotency_key is not null;

commit;
