-- Meta Lead Ads -> CRM da Ah Imobiliaria
--
-- Idempotente: pode rodar novamente sem apagar ou duplicar dados.
-- Adiciona atribuicao completa, consentimento separado do telefone e uma fila
-- duravel para detectar/reprocessar notificacoes que falharem.

begin;

alter table public.leads add column if not exists leadgen_id text;
alter table public.leads add column if not exists meta_page_id text;
alter table public.leads add column if not exists meta_form_id text;
alter table public.leads add column if not exists meta_campaign_id text;
alter table public.leads add column if not exists meta_campaign_name text;
alter table public.leads add column if not exists meta_adset_id text;
alter table public.leads add column if not exists meta_adset_name text;
alter table public.leads add column if not exists meta_ad_id text;
alter table public.leads add column if not exists meta_ad_name text;
alter table public.leads add column if not exists meta_platform text;
alter table public.leads add column if not exists meta_is_organic boolean;
alter table public.leads add column if not exists meta_created_time timestamptz;
alter table public.leads add column if not exists campos_meta jsonb not null default '{}'::jsonb;

-- NULL = o formulario nao trouxe uma resposta explicita; false = recusou;
-- true = aceitou. Ter telefone nunca e tratado como consentimento.
alter table public.leads add column if not exists whatsapp_opt_in boolean;
alter table public.leads add column if not exists whatsapp_opt_in_em timestamptz;
alter table public.leads add column if not exists whatsapp_opt_in_fonte text;

alter table public.leads drop constraint if exists leads_origem_check;
alter table public.leads add constraint leads_origem_check
  check (origem in ('site', 'meta_ads', 'whatsapp', 'instagram', 'telefone', 'indicacao', 'portal'));

alter table public.lead_interacoes drop constraint if exists lead_interacoes_canal_check;
alter table public.lead_interacoes add constraint lead_interacoes_canal_check
  check (canal in ('site', 'meta_ads', 'whatsapp', 'instagram', 'telefone', 'indicacao', 'portal', 'painel', 'sistema'));

create unique index if not exists leads_leadgen_id_unico
  on public.leads (leadgen_id)
  where leadgen_id is not null;
create index if not exists leads_meta_atribuicao_idx
  on public.leads (meta_campaign_id, meta_adset_id, meta_ad_id, criado_em desc)
  where origem = 'meta_ads';

create table if not exists public.meta_webhook_eventos (
  id             uuid primary key default gen_random_uuid(),
  leadgen_id     text not null unique,
  page_id        text,
  form_id        text,
  payload        jsonb not null default '{}'::jsonb,
  status         text not null default 'pendente'
                 check (status in ('pendente', 'processado', 'erro', 'ignorado')),
  tentativas     integer not null default 1 check (tentativas > 0),
  ultimo_erro    text,
  lead_id        uuid references public.leads (id) on delete set null,
  recebido_em    timestamptz not null default now(),
  processado_em  timestamptz,
  atualizado_em  timestamptz not null default now()
);

create index if not exists meta_webhook_eventos_falhas_idx
  on public.meta_webhook_eventos (status, atualizado_em)
  where status in ('pendente', 'erro');

drop trigger if exists meta_webhook_eventos_touch on public.meta_webhook_eventos;
create trigger meta_webhook_eventos_touch
  before update on public.meta_webhook_eventos
  for each row execute function public.touch_atualizado_em();

alter table public.meta_webhook_eventos enable row level security;

drop policy if exists "equipe ve eventos meta" on public.meta_webhook_eventos;
create policy "equipe ve eventos meta"
  on public.meta_webhook_eventos for select
  to authenticated
  using (public.e_equipe());

-- O navegador da equipe pode diagnosticar, mas somente o backend com service
-- role recebe e altera os eventos.
grant select on public.meta_webhook_eventos to authenticated;
grant all on public.meta_webhook_eventos to service_role;

commit;
