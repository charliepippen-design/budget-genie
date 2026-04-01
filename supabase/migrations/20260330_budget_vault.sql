create extension if not exists pgcrypto;
create table if not exists public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null default 'default-plan',
  payload jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, plan_key)
);
create table if not exists public.plan_share_links (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.budget_plans(id) on delete cascade,
  token text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.budget_plans enable row level security;
alter table public.plan_share_links enable row level security;
create policy if not exists "budget_plans_owner_select" on public.budget_plans for
select using (auth.uid() = user_id);
create policy if not exists "budget_plans_owner_insert" on public.budget_plans for
insert with check (auth.uid() = user_id);
create policy if not exists "budget_plans_owner_update" on public.budget_plans for
update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "budget_plans_owner_delete" on public.budget_plans for delete using (auth.uid() = user_id);
create policy if not exists "share_links_owner_manage" on public.plan_share_links for all using (
  exists (
    select 1
    from public.budget_plans bp
    where bp.id = plan_share_links.plan_id
      and bp.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.budget_plans bp
    where bp.id = plan_share_links.plan_id
      and bp.user_id = auth.uid()
  )
);
create policy if not exists "share_links_public_read" on public.plan_share_links for
select using (
    is_active = true
    and (
      expires_at is null
      or expires_at > now()
    )
  );
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now();
return new;
end;
$$;
drop trigger if exists trg_budget_plans_touch on public.budget_plans;
create trigger trg_budget_plans_touch before
update on public.budget_plans for each row execute function public.touch_updated_at();
create index if not exists idx_budget_plans_user_id on public.budget_plans(user_id);
create index if not exists idx_budget_plans_updated_at on public.budget_plans(updated_at desc);
create index if not exists idx_budget_plans_payload_gin on public.budget_plans using gin(payload);
create index if not exists idx_share_links_plan_id on public.plan_share_links(plan_id);
create index if not exists idx_share_links_token on public.plan_share_links(token);
alter publication supabase_realtime
add table public.budget_plans;
alter publication supabase_realtime
add table public.plan_share_links;