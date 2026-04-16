-- valk_telemetry : métriques anonymes pour agrégation, jamais d'identifiant personnel
create table if not exists public.valk_telemetry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default date_trunc('hour', now()),
  ua_family text,
  os_family text,
  viewport_bucket text,
  phase_durations_ms jsonb,
  capture_fps numeric,
  camera_resolution text,
  voice_speech_ratio numeric,
  voice_speech_rate_wpm integer,
  voice_snr_db numeric,
  pursuit_gain numeric,
  blink_rate_per_min numeric,
  perclos numeric,
  scleral_redness numeric,
  alcohol_score integer,
  fatigue_score integer,
  substances_score integer,
  verdict_level text,
  data_quality text,
  claude_latency_ms integer,
  total_session_ms integer
);

create index if not exists idx_valk_telemetry_created on public.valk_telemetry(created_at desc);
create index if not exists idx_valk_telemetry_verdict on public.valk_telemetry(verdict_level);

alter table public.valk_telemetry enable row level security;

create policy "service_role_insert" on public.valk_telemetry
  for insert to service_role with check (true);

-- Bucket Storage pour debug sessions (privé)
insert into storage.buckets (id, name, public, file_size_limit)
values ('valk-debug', 'valk-debug', false, 104857600)
on conflict do nothing;

create policy "service_role_debug_all" on storage.objects
  for all to service_role using (bucket_id = 'valk-debug');

-- Après application de ce SQL, activer pg_cron via Dashboard puis :
-- select cron.schedule(
--   'valk-debug-cleanup',
--   '0 3 * * *',
--   $$delete from storage.objects where bucket_id='valk-debug' and created_at < now() - interval '7 days';$$
-- );
