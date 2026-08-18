-- CRM da Ah Imobiliaria
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Idempotente: pode executar novamente sem apagar leads ou imoveis.

begin;

alter table public.leads add column if not exists canal_id text;
alter table public.leads add column if not exists ia_ativa boolean not null default true;
alter table public.leads add column if not exists prioridade smallint not null default 1;
alter table public.leads add column if not exists valor_potencial numeric(12, 2);
alter table public.leads add column if not exists tags text[] not null default '{}';
alter table public.leads add column if not exists motivo_perda text;
alter table public.leads add column if not exists primeira_resposta_em timestamptz;
alter table public.leads add column if not exists qualificado_em timestamptz;
alter table public.leads add column if not exists fechado_em timestamptz;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('novo', 'em_atendimento', 'qualificado', 'visita_agendada', 'proposta', 'fechado', 'perdido'));

alter table public.leads drop constraint if exists leads_prioridade_check;
alter table public.leads add constraint leads_prioridade_check
  check (prioridade between 0 and 3);

create unique index if not exists leads_canal_idx on public.leads (origem, canal_id)
  where canal_id is not null;

create table if not exists public.lead_interacoes (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  tipo         text not null default 'mensagem'
               check (tipo in ('mensagem', 'nota', 'status', 'ia_resumo', 'erro')),
  direcao      text not null default 'interna'
               check (direcao in ('entrada', 'saida', 'interna')),
  autor        text not null default 'sistema'
               check (autor in ('lead', 'corretor', 'ia', 'sistema')),
  canal        text not null default 'painel'
               check (canal in ('site', 'whatsapp', 'instagram', 'telefone', 'indicacao', 'portal', 'painel', 'sistema')),
  conteudo     text not null,
  automatico   boolean not null default false,
  external_id  text,
  lida_em      timestamptz,
  corretor_id  uuid references public.corretores (id) on delete set null,
  metadados    jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists lead_interacoes_timeline_idx
  on public.lead_interacoes (lead_id, criado_em);
create index if not exists lead_interacoes_nao_lidas_idx
  on public.lead_interacoes (lead_id, criado_em desc)
  where direcao = 'entrada' and lida_em is null;
create unique index if not exists lead_interacoes_externa_idx
  on public.lead_interacoes (canal, external_id)
  where external_id is not null;

create table if not exists public.configuracoes_ia (
  id              text primary key default 'principal',
  modo            text not null default 'automatico'
                  check (modo in ('automatico', 'sugestao', 'desligado')),
  agente          text not null default 'ah_imobiliaria',
  canais          text[] not null default array['whatsapp', 'instagram'],
  mensagem_pausa  text not null default 'Recebi sua mensagem. O corretor vai continuar o atendimento por aqui.',
  atualizado_por  uuid references public.corretores (id) on delete set null,
  atualizado_em   timestamptz not null default now()
);

insert into public.configuracoes_ia (id)
values ('principal')
on conflict (id) do nothing;

drop trigger if exists configuracoes_ia_touch on public.configuracoes_ia;
create trigger configuracoes_ia_touch before update on public.configuracoes_ia
  for each row execute function public.touch_atualizado_em();

alter table public.lead_interacoes enable row level security;
alter table public.configuracoes_ia enable row level security;

drop policy if exists "equipe gerencia interacoes" on public.lead_interacoes;
create policy "equipe gerencia interacoes"
  on public.lead_interacoes for all
  to authenticated
  using (public.e_equipe())
  with check (public.e_equipe());

drop policy if exists "equipe gerencia configuracao ia" on public.configuracoes_ia;
create policy "equipe gerencia configuracao ia"
  on public.configuracoes_ia for all
  to authenticated
  using (public.e_equipe())
  with check (public.e_equipe());

grant select, insert, update, delete on public.lead_interacoes to authenticated;
grant select, insert, update, delete on public.configuracoes_ia to authenticated;
grant all on public.lead_interacoes to service_role;
grant all on public.configuracoes_ia to service_role;

-- Leva a mensagem original dos leads antigos para a nova linha do tempo.
insert into public.lead_interacoes
  (lead_id, tipo, direcao, autor, canal, conteudo, automatico, criado_em)
select
  l.id, 'mensagem', 'entrada', 'lead', l.origem, left(trim(l.mensagem), 4000),
  false, l.criado_em
from public.leads l
where coalesce(trim(l.mensagem), '') <> ''
  and not exists (
    select 1 from public.lead_interacoes i where i.lead_id = l.id
  );

create or replace function public.registrar_lead(
  p_nome       text,
  p_telefone   text,
  p_mensagem   text default null,
  p_email      text default null,
  p_imovel_id  uuid default null,
  p_origem     text default 'site'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome.';
  end if;

  if length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Informe um telefone com DDD.';
  end if;

  if p_origem not in ('site', 'whatsapp', 'instagram', 'telefone', 'indicacao', 'portal') then
    p_origem := 'site';
  end if;

  insert into public.leads (nome, telefone, email, mensagem, imovel_id, origem, proximo_contato)
  values (
    left(trim(p_nome), 120),
    regexp_replace(p_telefone, '\D', '', 'g'),
    nullif(trim(coalesce(p_email, '')), ''),
    left(coalesce(p_mensagem, ''), 2000),
    p_imovel_id,
    p_origem,
    current_date + 1
  )
  returning id into v_id;

  if coalesce(trim(p_mensagem), '') <> '' then
    insert into public.lead_interacoes
      (lead_id, tipo, direcao, autor, canal, conteudo, automatico)
    values
      (v_id, 'mensagem', 'entrada', 'lead', p_origem,
       left(trim(p_mensagem), 4000), false);
  end if;

  return v_id;
end;
$$;

grant execute on function public.registrar_lead(text, text, text, text, uuid, text)
  to anon, authenticated;

commit;
