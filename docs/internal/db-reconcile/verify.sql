-- =====================================================================================
-- verify.sql - READ-ONLY check of a Hust app DB against the drizzle-declared schema
-- (ever-hust origin/main packages/db/src/schema). Safe on a replica (no writes, no temp tables).
-- Prints, for the current DB:
--   1. summary: every *_missing / *_mismatch / *_invalid / fks_not_valid = 0 means DONE
--   2. a row for every declared index / UNIQUE / FK that is missing or has a different definition
--   3. the convalidated state of each declared FK
-- Expected definitions = pg_get_indexdef / pg_get_constraintdef captured from a drizzle-kit
-- push into an empty db (search_path = public).
-- FKs are matched by name AND by column: a live FK on the same table + child columns under
-- another name counts as present when its whole definition is identical (reconcile.sql skips
-- it), and as fks_mismatch when it differs, e.g. ON DELETE CASCADE where SET NULL is declared
-- (reconcile.sql refuses to add the declared FK next to it).
-- Usage: psql -X -d <db> -f verify.sql
-- =====================================================================================
\pset pager off
SET search_path = public, pg_catalog;
SET default_transaction_read_only = on;

\echo '== 1. summary (all zeros = schema matches drizzle; fks_not_valid > 0 = orphans still to resolve)'
WITH exp_idx(name, tbl, def) AS (VALUES
  ('accounts_user_id_idx','accounts','CREATE INDEX ON public.accounts USING btree (user_id)'),
  ('agent_instances_user_id_idx','agent_instances','CREATE INDEX ON public.agent_instances USING btree (user_id)'),
  ('api_keys_user_id_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (user_id)'),
  ('api_keys_key_hash_idx','api_keys','CREATE UNIQUE INDEX ON public.api_keys USING btree (key_hash)'),
  ('api_keys_key_prefix_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (key_prefix)'),
  ('applications_user_id_idx','applications','CREATE INDEX ON public.applications USING btree (user_id)'),
  ('applications_user_job_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, job_id)'),
  ('applications_user_status_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, status)'),
  ('applications_user_stage_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, pipeline_stage)'),
  ('applications_job_id_idx','applications','CREATE INDEX ON public.applications USING btree (job_id)'),
  ('approval_gates_user_id_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id)'),
  ('approval_gates_user_status_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id, status)'),
  ('approval_gates_action_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (action_id)'),
  ('branding_configs_org_id_idx','branding_configs','CREATE INDEX ON public.branding_configs USING btree (organization_id)'),
  ('branding_configs_custom_domain_idx','branding_configs','CREATE UNIQUE INDEX ON public.branding_configs USING btree (custom_domain)'),
  ('chat_messages_session_id_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id)'),
  ('chat_messages_session_created_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id, created_at)'),
  ('chat_sessions_user_id_idx','chat_sessions','CREATE INDEX ON public.chat_sessions USING btree (user_id)'),
  ('credit_tx_user_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id)'),
  ('credit_tx_user_created_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id, created_at)'),
  ('email_accounts_user_idx','email_accounts','CREATE INDEX ON public.email_accounts USING btree (user_id)'),
  ('email_messages_user_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id)'),
  ('email_messages_account_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (account_id)'),
  ('email_messages_thread_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id, thread_key)'),
  ('email_messages_job_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (job_id)'),
  ('evaluations_user_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id)'),
  ('evaluations_user_band_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, band)'),
  ('evaluations_user_score_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, score)'),
  ('evaluations_job_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (job_id)'),
  ('funnel_snapshots_user_captured_idx','funnel_snapshots','CREATE INDEX ON public.funnel_snapshots USING btree (user_id, captured_at DESC NULLS LAST)'),
  ('jobs_location_country_idx','jobs','CREATE INDEX ON public.jobs USING btree (location_country)'),
  ('jobs_is_remote_idx','jobs','CREATE INDEX ON public.jobs USING btree (is_remote)'),
  ('jobs_date_posted_idx','jobs','CREATE INDEX ON public.jobs USING btree (date_posted DESC NULLS LAST)'),
  ('jobs_site_idx','jobs','CREATE INDEX ON public.jobs USING btree (site)'),
  ('jobs_title_idx','jobs','CREATE INDEX ON public.jobs USING btree (title)'),
  ('jobs_company_name_idx','jobs','CREATE INDEX ON public.jobs USING btree (company_name)'),
  ('jobs_job_level_idx','jobs','CREATE INDEX ON public.jobs USING btree (job_level)'),
  ('jobs_salary_min_idx','jobs','CREATE INDEX ON public.jobs USING btree (salary_min)'),
  ('jobs_lat_lng_idx','jobs','CREATE INDEX ON public.jobs USING btree (latitude, longitude)'),
  ('jobs_skills_gin_idx','jobs','CREATE INDEX ON public.jobs USING gin (skills)'),
  ('jobs_title_search_idx','jobs','CREATE INDEX ON public.jobs USING gin (to_tsvector(''english''::regconfig, title))'),
  ('org_ai_configs_org_id_idx','organization_ai_configs','CREATE UNIQUE INDEX ON public.organization_ai_configs USING btree (organization_id)'),
  ('org_invitations_org_id_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (organization_id)'),
  ('org_invitations_token_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (token)'),
  ('org_invitations_email_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (email)'),
  ('org_members_org_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (organization_id)'),
  ('org_members_user_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (user_id)'),
  ('organizations_slug_idx','organizations','CREATE INDEX ON public.organizations USING btree (slug)'),
  ('organizations_created_by_idx','organizations','CREATE INDEX ON public.organizations USING btree (created_by_id)'),
  ('push_subscriptions_user_id_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (user_id)'),
  ('push_subscriptions_endpoint_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (endpoint)'),
  ('referral_credits_user_id_idx','referral_credits','CREATE INDEX ON public.referral_credits USING btree (user_id)'),
  ('referrals_referrer_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referrer_id)'),
  ('referrals_referral_code_idx','referrals','CREATE INDEX ON public.referrals USING btree (referral_code)'),
  ('referrals_referred_user_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referred_user_id)'),
  ('subscriptions_user_id_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (user_id)'),
  ('subscriptions_period_end_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (current_period_end)'),
  ('user_alerts_user_id_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id)'),
  ('user_alerts_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id, is_active)'),
  ('user_alerts_frequency_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (frequency, is_active)'),
  ('user_jobs_user_id_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id)'),
  ('user_jobs_status_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id, status)')
), exp_con(name, tbl, contype, def) AS (VALUES
  ('accounts_provider_account_unique','accounts','u','UNIQUE (provider_id, account_id)'),
  ('credit_tx_grant_unique','credit_transactions','u','UNIQUE (user_id, reason, period_key)'),
  ('email_accounts_user_id_unique','email_accounts','u','UNIQUE (user_id)'),
  ('email_messages_msgid_unique','email_messages','u','UNIQUE (account_id, message_id)'),
  ('evaluations_user_job_unique','evaluations','u','UNIQUE (user_id, job_id)'),
  ('jobs_external_id_unique','jobs','u','UNIQUE (external_id)'),
  ('organization_invitations_token_unique','organization_invitations','u','UNIQUE (token)'),
  ('org_members_unique','organization_members','u','UNIQUE (organization_id, user_id)'),
  ('organizations_slug_unique','organizations','u','UNIQUE (slug)'),
  ('push_subscriptions_endpoint_unique','push_subscriptions','u','UNIQUE (endpoint)'),
  ('referral_credits_user_id_unique','referral_credits','u','UNIQUE (user_id)'),
  ('referrals_referral_code_unique','referrals','u','UNIQUE (referral_code)'),
  ('sessions_token_unique','sessions','u','UNIQUE (token)'),
  ('subscriptions_stripe_subscription_id_unique','subscriptions','u','UNIQUE (stripe_subscription_id)'),
  ('user_jobs_unique','user_jobs','u','UNIQUE (user_id, job_id)'),
  ('users_email_unique','users','u','UNIQUE (email)'),
  ('users_linkedin_id_unique','users','u','UNIQUE (linkedin_id)'),
  ('users_stripe_customer_id_unique','users','u','UNIQUE (stripe_customer_id)'),
  ('accounts_user_id_users_id_fk','accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_user_id_users_id_fk','agent_instances','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_job_id_jobs_id_fk','agent_instances','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('agent_instances_session_id_chat_sessions_id_fk','agent_instances','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL'),
  ('api_keys_user_id_users_id_fk','api_keys','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_user_id_users_id_fk','applications','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_job_id_jobs_id_fk','applications','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('applications_agent_instance_id_agent_instances_id_fk','applications','f','FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE SET NULL'),
  ('approval_gates_user_id_users_id_fk','approval_gates','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('branding_configs_organization_id_organizations_id_fk','branding_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('chat_messages_session_id_chat_sessions_id_fk','chat_messages','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE'),
  ('chat_sessions_user_id_users_id_fk','chat_sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('credit_transactions_user_id_users_id_fk','credit_transactions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_accounts_user_id_users_id_fk','email_accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_user_id_users_id_fk','email_messages','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_account_id_email_accounts_id_fk','email_messages','f','FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE'),
  ('email_messages_job_id_jobs_id_fk','email_messages','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('evaluations_user_id_users_id_fk','evaluations','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('evaluations_job_id_jobs_id_fk','evaluations','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('funnel_snapshots_user_id_users_id_fk','funnel_snapshots','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_ai_configs_organization_id_organizations_id_fk','organization_ai_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_organization_id_organizations_id_fk','organization_invitations','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_invited_by_id_users_id_fk','organization_invitations','f','FOREIGN KEY (invited_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_members_organization_id_organizations_id_fk','organization_members','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_members_user_id_users_id_fk','organization_members','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organizations_created_by_id_users_id_fk','organizations','f','FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('push_subscriptions_user_id_users_id_fk','push_subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referral_credits_user_id_users_id_fk','referral_credits','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referrer_id_users_id_fk','referrals','f','FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referred_user_id_users_id_fk','referrals','f','FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('sessions_user_id_users_id_fk','sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('subscriptions_user_id_users_id_fk','subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_alerts_user_id_users_id_fk','user_alerts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_user_id_users_id_fk','user_jobs','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_job_id_jobs_id_fk','user_jobs','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE')
), live_idx AS (
  SELECT c.relname AS name, t.relname AS tbl, i.indisvalid AS valid,
         regexp_replace(pg_get_indexdef(c.oid), '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE \1INDEX ON ') AS def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
   WHERE c.relnamespace = 'public'::regnamespace
), live_con AS (
  SELECT k.conname AS name, t.relname AS tbl, k.contype::text AS contype, regexp_replace(pg_get_constraintdef(k.oid), ' NOT VALID$', '') AS def, k.convalidated AS valid
    FROM pg_constraint k JOIN pg_class t ON t.oid = k.conrelid
   WHERE k.connamespace = 'public'::regnamespace AND k.contype IN ('u','f')
), live_fk AS (
  SELECT l.name, l.tbl, l.def, l.valid, substring(l.def from '^FOREIGN KEY \(([^)]*)\)') AS cols
    FROM live_con l
   WHERE l.contype = 'f'
), fk_eval AS (
  -- One row per declared FK, matched against every live FK that carries its name or sits on
  -- the same table + child column list (in order) under ANY name. The comparison is the whole
  -- rendered definition: child columns, parent table + columns, ON DELETE, ON UPDATE, MATCH,
  -- DEFERRABLE. n_same = identical matches, n_diff = matches with a different definition
  -- (e.g. ON DELETE CASCADE under another name where SET NULL is declared = a mismatch).
  SELECT e.name, e.tbl, e.def,
         count(l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def) AS n_same,
         count(l.name) FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS n_diff,
         coalesce(bool_or(l.valid) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def), false) AS valid,
         string_agg(l.name, ', ' ORDER BY l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def AND l.name <> e.name) AS same_as,
         string_agg(CASE WHEN l.name = e.name THEN l.def ELSE l.name || ': ' || l.def END, '; ' ORDER BY l.name)
           FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS live_diff
    FROM exp_con e
    LEFT JOIN live_fk l ON l.name = e.name OR (l.tbl = e.tbl AND l.cols = substring(e.def from '^FOREIGN KEY \(([^)]*)\)'))
   WHERE e.contype = 'f'
   GROUP BY e.name, e.tbl, e.def
)
SELECT current_database() AS db,
  (SELECT count(*) FROM exp_idx e WHERE NOT EXISTS (SELECT 1 FROM live_idx l WHERE l.name = e.name)) AS indexes_missing,
  (SELECT count(*) FROM exp_idx e JOIN live_idx l USING (name) WHERE l.tbl <> e.tbl OR l.def <> e.def) AS indexes_mismatch,
  (SELECT count(*) FROM exp_idx e JOIN live_idx l USING (name) WHERE NOT l.valid) AS indexes_invalid,
  (SELECT count(*) FROM exp_con e WHERE e.contype = 'u' AND NOT EXISTS (SELECT 1 FROM live_con l WHERE l.name = e.name AND l.contype = 'u')) AS uniques_missing,
  (SELECT count(*) FROM exp_con e JOIN live_con l USING (name) WHERE e.contype = 'u' AND (l.tbl <> e.tbl OR l.def <> e.def)) AS uniques_mismatch,
  (SELECT count(*) FROM fk_eval WHERE n_same = 0 AND n_diff = 0) AS fks_missing,
  (SELECT count(*) FROM fk_eval WHERE n_diff > 0) AS fks_mismatch,
  (SELECT count(*) FROM fk_eval WHERE n_diff = 0 AND n_same > 0 AND NOT valid) AS fks_not_valid,
  (SELECT count(*) FROM exp_idx) AS indexes_expected,
  (SELECT count(*) FROM exp_con WHERE contype = 'u') AS uniques_expected,
  (SELECT count(*) FROM exp_con WHERE contype = 'f') AS fks_expected,
  (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT i.indisvalid) AS invalid_indexes_any;

\echo '== 2. declared objects that are missing, invalid or defined differently (no rows = none)'
WITH exp_idx(name, tbl, def) AS (VALUES
  ('accounts_user_id_idx','accounts','CREATE INDEX ON public.accounts USING btree (user_id)'),
  ('agent_instances_user_id_idx','agent_instances','CREATE INDEX ON public.agent_instances USING btree (user_id)'),
  ('api_keys_user_id_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (user_id)'),
  ('api_keys_key_hash_idx','api_keys','CREATE UNIQUE INDEX ON public.api_keys USING btree (key_hash)'),
  ('api_keys_key_prefix_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (key_prefix)'),
  ('applications_user_id_idx','applications','CREATE INDEX ON public.applications USING btree (user_id)'),
  ('applications_user_job_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, job_id)'),
  ('applications_user_status_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, status)'),
  ('applications_user_stage_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, pipeline_stage)'),
  ('applications_job_id_idx','applications','CREATE INDEX ON public.applications USING btree (job_id)'),
  ('approval_gates_user_id_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id)'),
  ('approval_gates_user_status_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id, status)'),
  ('approval_gates_action_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (action_id)'),
  ('branding_configs_org_id_idx','branding_configs','CREATE INDEX ON public.branding_configs USING btree (organization_id)'),
  ('branding_configs_custom_domain_idx','branding_configs','CREATE UNIQUE INDEX ON public.branding_configs USING btree (custom_domain)'),
  ('chat_messages_session_id_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id)'),
  ('chat_messages_session_created_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id, created_at)'),
  ('chat_sessions_user_id_idx','chat_sessions','CREATE INDEX ON public.chat_sessions USING btree (user_id)'),
  ('credit_tx_user_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id)'),
  ('credit_tx_user_created_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id, created_at)'),
  ('email_accounts_user_idx','email_accounts','CREATE INDEX ON public.email_accounts USING btree (user_id)'),
  ('email_messages_user_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id)'),
  ('email_messages_account_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (account_id)'),
  ('email_messages_thread_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id, thread_key)'),
  ('email_messages_job_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (job_id)'),
  ('evaluations_user_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id)'),
  ('evaluations_user_band_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, band)'),
  ('evaluations_user_score_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, score)'),
  ('evaluations_job_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (job_id)'),
  ('funnel_snapshots_user_captured_idx','funnel_snapshots','CREATE INDEX ON public.funnel_snapshots USING btree (user_id, captured_at DESC NULLS LAST)'),
  ('jobs_location_country_idx','jobs','CREATE INDEX ON public.jobs USING btree (location_country)'),
  ('jobs_is_remote_idx','jobs','CREATE INDEX ON public.jobs USING btree (is_remote)'),
  ('jobs_date_posted_idx','jobs','CREATE INDEX ON public.jobs USING btree (date_posted DESC NULLS LAST)'),
  ('jobs_site_idx','jobs','CREATE INDEX ON public.jobs USING btree (site)'),
  ('jobs_title_idx','jobs','CREATE INDEX ON public.jobs USING btree (title)'),
  ('jobs_company_name_idx','jobs','CREATE INDEX ON public.jobs USING btree (company_name)'),
  ('jobs_job_level_idx','jobs','CREATE INDEX ON public.jobs USING btree (job_level)'),
  ('jobs_salary_min_idx','jobs','CREATE INDEX ON public.jobs USING btree (salary_min)'),
  ('jobs_lat_lng_idx','jobs','CREATE INDEX ON public.jobs USING btree (latitude, longitude)'),
  ('jobs_skills_gin_idx','jobs','CREATE INDEX ON public.jobs USING gin (skills)'),
  ('jobs_title_search_idx','jobs','CREATE INDEX ON public.jobs USING gin (to_tsvector(''english''::regconfig, title))'),
  ('org_ai_configs_org_id_idx','organization_ai_configs','CREATE UNIQUE INDEX ON public.organization_ai_configs USING btree (organization_id)'),
  ('org_invitations_org_id_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (organization_id)'),
  ('org_invitations_token_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (token)'),
  ('org_invitations_email_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (email)'),
  ('org_members_org_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (organization_id)'),
  ('org_members_user_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (user_id)'),
  ('organizations_slug_idx','organizations','CREATE INDEX ON public.organizations USING btree (slug)'),
  ('organizations_created_by_idx','organizations','CREATE INDEX ON public.organizations USING btree (created_by_id)'),
  ('push_subscriptions_user_id_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (user_id)'),
  ('push_subscriptions_endpoint_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (endpoint)'),
  ('referral_credits_user_id_idx','referral_credits','CREATE INDEX ON public.referral_credits USING btree (user_id)'),
  ('referrals_referrer_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referrer_id)'),
  ('referrals_referral_code_idx','referrals','CREATE INDEX ON public.referrals USING btree (referral_code)'),
  ('referrals_referred_user_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referred_user_id)'),
  ('subscriptions_user_id_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (user_id)'),
  ('subscriptions_period_end_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (current_period_end)'),
  ('user_alerts_user_id_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id)'),
  ('user_alerts_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id, is_active)'),
  ('user_alerts_frequency_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (frequency, is_active)'),
  ('user_jobs_user_id_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id)'),
  ('user_jobs_status_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id, status)')
), exp_con(name, tbl, contype, def) AS (VALUES
  ('accounts_provider_account_unique','accounts','u','UNIQUE (provider_id, account_id)'),
  ('credit_tx_grant_unique','credit_transactions','u','UNIQUE (user_id, reason, period_key)'),
  ('email_accounts_user_id_unique','email_accounts','u','UNIQUE (user_id)'),
  ('email_messages_msgid_unique','email_messages','u','UNIQUE (account_id, message_id)'),
  ('evaluations_user_job_unique','evaluations','u','UNIQUE (user_id, job_id)'),
  ('jobs_external_id_unique','jobs','u','UNIQUE (external_id)'),
  ('organization_invitations_token_unique','organization_invitations','u','UNIQUE (token)'),
  ('org_members_unique','organization_members','u','UNIQUE (organization_id, user_id)'),
  ('organizations_slug_unique','organizations','u','UNIQUE (slug)'),
  ('push_subscriptions_endpoint_unique','push_subscriptions','u','UNIQUE (endpoint)'),
  ('referral_credits_user_id_unique','referral_credits','u','UNIQUE (user_id)'),
  ('referrals_referral_code_unique','referrals','u','UNIQUE (referral_code)'),
  ('sessions_token_unique','sessions','u','UNIQUE (token)'),
  ('subscriptions_stripe_subscription_id_unique','subscriptions','u','UNIQUE (stripe_subscription_id)'),
  ('user_jobs_unique','user_jobs','u','UNIQUE (user_id, job_id)'),
  ('users_email_unique','users','u','UNIQUE (email)'),
  ('users_linkedin_id_unique','users','u','UNIQUE (linkedin_id)'),
  ('users_stripe_customer_id_unique','users','u','UNIQUE (stripe_customer_id)'),
  ('accounts_user_id_users_id_fk','accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_user_id_users_id_fk','agent_instances','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_job_id_jobs_id_fk','agent_instances','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('agent_instances_session_id_chat_sessions_id_fk','agent_instances','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL'),
  ('api_keys_user_id_users_id_fk','api_keys','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_user_id_users_id_fk','applications','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_job_id_jobs_id_fk','applications','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('applications_agent_instance_id_agent_instances_id_fk','applications','f','FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE SET NULL'),
  ('approval_gates_user_id_users_id_fk','approval_gates','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('branding_configs_organization_id_organizations_id_fk','branding_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('chat_messages_session_id_chat_sessions_id_fk','chat_messages','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE'),
  ('chat_sessions_user_id_users_id_fk','chat_sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('credit_transactions_user_id_users_id_fk','credit_transactions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_accounts_user_id_users_id_fk','email_accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_user_id_users_id_fk','email_messages','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_account_id_email_accounts_id_fk','email_messages','f','FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE'),
  ('email_messages_job_id_jobs_id_fk','email_messages','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('evaluations_user_id_users_id_fk','evaluations','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('evaluations_job_id_jobs_id_fk','evaluations','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('funnel_snapshots_user_id_users_id_fk','funnel_snapshots','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_ai_configs_organization_id_organizations_id_fk','organization_ai_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_organization_id_organizations_id_fk','organization_invitations','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_invited_by_id_users_id_fk','organization_invitations','f','FOREIGN KEY (invited_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_members_organization_id_organizations_id_fk','organization_members','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_members_user_id_users_id_fk','organization_members','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organizations_created_by_id_users_id_fk','organizations','f','FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('push_subscriptions_user_id_users_id_fk','push_subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referral_credits_user_id_users_id_fk','referral_credits','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referrer_id_users_id_fk','referrals','f','FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referred_user_id_users_id_fk','referrals','f','FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('sessions_user_id_users_id_fk','sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('subscriptions_user_id_users_id_fk','subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_alerts_user_id_users_id_fk','user_alerts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_user_id_users_id_fk','user_jobs','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_job_id_jobs_id_fk','user_jobs','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE')
), live_idx AS (
  SELECT c.relname AS name, t.relname AS tbl, i.indisvalid AS valid,
         regexp_replace(pg_get_indexdef(c.oid), '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE \1INDEX ON ') AS def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
   WHERE c.relnamespace = 'public'::regnamespace
), live_con AS (
  SELECT k.conname AS name, t.relname AS tbl, k.contype::text AS contype, regexp_replace(pg_get_constraintdef(k.oid), ' NOT VALID$', '') AS def, k.convalidated AS valid
    FROM pg_constraint k JOIN pg_class t ON t.oid = k.conrelid
   WHERE k.connamespace = 'public'::regnamespace AND k.contype IN ('u','f')
), live_fk AS (
  SELECT l.name, l.tbl, l.def, l.valid, substring(l.def from '^FOREIGN KEY \(([^)]*)\)') AS cols
    FROM live_con l
   WHERE l.contype = 'f'
), fk_eval AS (
  -- One row per declared FK, matched against every live FK that carries its name or sits on
  -- the same table + child column list (in order) under ANY name. The comparison is the whole
  -- rendered definition: child columns, parent table + columns, ON DELETE, ON UPDATE, MATCH,
  -- DEFERRABLE. n_same = identical matches, n_diff = matches with a different definition
  -- (e.g. ON DELETE CASCADE under another name where SET NULL is declared = a mismatch).
  SELECT e.name, e.tbl, e.def,
         count(l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def) AS n_same,
         count(l.name) FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS n_diff,
         coalesce(bool_or(l.valid) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def), false) AS valid,
         string_agg(l.name, ', ' ORDER BY l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def AND l.name <> e.name) AS same_as,
         string_agg(CASE WHEN l.name = e.name THEN l.def ELSE l.name || ': ' || l.def END, '; ' ORDER BY l.name)
           FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS live_diff
    FROM exp_con e
    LEFT JOIN live_fk l ON l.name = e.name OR (l.tbl = e.tbl AND l.cols = substring(e.def from '^FOREIGN KEY \(([^)]*)\)'))
   WHERE e.contype = 'f'
   GROUP BY e.name, e.tbl, e.def
)
SELECT 'index' AS kind, e.tbl, e.name,
       CASE WHEN l.name IS NULL THEN 'MISSING' WHEN NOT l.valid THEN 'INVALID' ELSE 'DIFFERENT' END AS problem,
       e.def AS expected, l.def AS live
  FROM exp_idx e LEFT JOIN live_idx l USING (name)
 WHERE l.name IS NULL OR NOT l.valid OR l.def <> e.def OR l.tbl <> e.tbl
UNION ALL
SELECT 'unique', e.tbl, e.name,
       CASE WHEN l.name IS NULL THEN 'MISSING' ELSE 'DIFFERENT' END, e.def, l.def
  FROM exp_con e LEFT JOIN live_con l ON l.name = e.name AND l.contype = 'u'
 WHERE e.contype = 'u' AND (l.name IS NULL OR l.def <> e.def OR l.tbl <> e.tbl)
UNION ALL
SELECT 'fk', f.tbl, f.name,
       CASE WHEN f.n_diff > 0 THEN 'DIFFERENT' ELSE 'MISSING' END, f.def, f.live_diff
  FROM fk_eval f
 WHERE f.n_diff > 0 OR f.n_same = 0
 ORDER BY 1, 2, 3;

\echo '== 3. convalidated state of every declared FK'
WITH exp_idx(name, tbl, def) AS (VALUES
  ('accounts_user_id_idx','accounts','CREATE INDEX ON public.accounts USING btree (user_id)'),
  ('agent_instances_user_id_idx','agent_instances','CREATE INDEX ON public.agent_instances USING btree (user_id)'),
  ('api_keys_user_id_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (user_id)'),
  ('api_keys_key_hash_idx','api_keys','CREATE UNIQUE INDEX ON public.api_keys USING btree (key_hash)'),
  ('api_keys_key_prefix_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (key_prefix)'),
  ('applications_user_id_idx','applications','CREATE INDEX ON public.applications USING btree (user_id)'),
  ('applications_user_job_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, job_id)'),
  ('applications_user_status_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, status)'),
  ('applications_user_stage_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, pipeline_stage)'),
  ('applications_job_id_idx','applications','CREATE INDEX ON public.applications USING btree (job_id)'),
  ('approval_gates_user_id_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id)'),
  ('approval_gates_user_status_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id, status)'),
  ('approval_gates_action_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (action_id)'),
  ('branding_configs_org_id_idx','branding_configs','CREATE INDEX ON public.branding_configs USING btree (organization_id)'),
  ('branding_configs_custom_domain_idx','branding_configs','CREATE UNIQUE INDEX ON public.branding_configs USING btree (custom_domain)'),
  ('chat_messages_session_id_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id)'),
  ('chat_messages_session_created_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id, created_at)'),
  ('chat_sessions_user_id_idx','chat_sessions','CREATE INDEX ON public.chat_sessions USING btree (user_id)'),
  ('credit_tx_user_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id)'),
  ('credit_tx_user_created_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id, created_at)'),
  ('email_accounts_user_idx','email_accounts','CREATE INDEX ON public.email_accounts USING btree (user_id)'),
  ('email_messages_user_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id)'),
  ('email_messages_account_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (account_id)'),
  ('email_messages_thread_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id, thread_key)'),
  ('email_messages_job_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (job_id)'),
  ('evaluations_user_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id)'),
  ('evaluations_user_band_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, band)'),
  ('evaluations_user_score_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, score)'),
  ('evaluations_job_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (job_id)'),
  ('funnel_snapshots_user_captured_idx','funnel_snapshots','CREATE INDEX ON public.funnel_snapshots USING btree (user_id, captured_at DESC NULLS LAST)'),
  ('jobs_location_country_idx','jobs','CREATE INDEX ON public.jobs USING btree (location_country)'),
  ('jobs_is_remote_idx','jobs','CREATE INDEX ON public.jobs USING btree (is_remote)'),
  ('jobs_date_posted_idx','jobs','CREATE INDEX ON public.jobs USING btree (date_posted DESC NULLS LAST)'),
  ('jobs_site_idx','jobs','CREATE INDEX ON public.jobs USING btree (site)'),
  ('jobs_title_idx','jobs','CREATE INDEX ON public.jobs USING btree (title)'),
  ('jobs_company_name_idx','jobs','CREATE INDEX ON public.jobs USING btree (company_name)'),
  ('jobs_job_level_idx','jobs','CREATE INDEX ON public.jobs USING btree (job_level)'),
  ('jobs_salary_min_idx','jobs','CREATE INDEX ON public.jobs USING btree (salary_min)'),
  ('jobs_lat_lng_idx','jobs','CREATE INDEX ON public.jobs USING btree (latitude, longitude)'),
  ('jobs_skills_gin_idx','jobs','CREATE INDEX ON public.jobs USING gin (skills)'),
  ('jobs_title_search_idx','jobs','CREATE INDEX ON public.jobs USING gin (to_tsvector(''english''::regconfig, title))'),
  ('org_ai_configs_org_id_idx','organization_ai_configs','CREATE UNIQUE INDEX ON public.organization_ai_configs USING btree (organization_id)'),
  ('org_invitations_org_id_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (organization_id)'),
  ('org_invitations_token_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (token)'),
  ('org_invitations_email_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (email)'),
  ('org_members_org_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (organization_id)'),
  ('org_members_user_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (user_id)'),
  ('organizations_slug_idx','organizations','CREATE INDEX ON public.organizations USING btree (slug)'),
  ('organizations_created_by_idx','organizations','CREATE INDEX ON public.organizations USING btree (created_by_id)'),
  ('push_subscriptions_user_id_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (user_id)'),
  ('push_subscriptions_endpoint_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (endpoint)'),
  ('referral_credits_user_id_idx','referral_credits','CREATE INDEX ON public.referral_credits USING btree (user_id)'),
  ('referrals_referrer_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referrer_id)'),
  ('referrals_referral_code_idx','referrals','CREATE INDEX ON public.referrals USING btree (referral_code)'),
  ('referrals_referred_user_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referred_user_id)'),
  ('subscriptions_user_id_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (user_id)'),
  ('subscriptions_period_end_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (current_period_end)'),
  ('user_alerts_user_id_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id)'),
  ('user_alerts_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id, is_active)'),
  ('user_alerts_frequency_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (frequency, is_active)'),
  ('user_jobs_user_id_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id)'),
  ('user_jobs_status_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id, status)')
), exp_con(name, tbl, contype, def) AS (VALUES
  ('accounts_provider_account_unique','accounts','u','UNIQUE (provider_id, account_id)'),
  ('credit_tx_grant_unique','credit_transactions','u','UNIQUE (user_id, reason, period_key)'),
  ('email_accounts_user_id_unique','email_accounts','u','UNIQUE (user_id)'),
  ('email_messages_msgid_unique','email_messages','u','UNIQUE (account_id, message_id)'),
  ('evaluations_user_job_unique','evaluations','u','UNIQUE (user_id, job_id)'),
  ('jobs_external_id_unique','jobs','u','UNIQUE (external_id)'),
  ('organization_invitations_token_unique','organization_invitations','u','UNIQUE (token)'),
  ('org_members_unique','organization_members','u','UNIQUE (organization_id, user_id)'),
  ('organizations_slug_unique','organizations','u','UNIQUE (slug)'),
  ('push_subscriptions_endpoint_unique','push_subscriptions','u','UNIQUE (endpoint)'),
  ('referral_credits_user_id_unique','referral_credits','u','UNIQUE (user_id)'),
  ('referrals_referral_code_unique','referrals','u','UNIQUE (referral_code)'),
  ('sessions_token_unique','sessions','u','UNIQUE (token)'),
  ('subscriptions_stripe_subscription_id_unique','subscriptions','u','UNIQUE (stripe_subscription_id)'),
  ('user_jobs_unique','user_jobs','u','UNIQUE (user_id, job_id)'),
  ('users_email_unique','users','u','UNIQUE (email)'),
  ('users_linkedin_id_unique','users','u','UNIQUE (linkedin_id)'),
  ('users_stripe_customer_id_unique','users','u','UNIQUE (stripe_customer_id)'),
  ('accounts_user_id_users_id_fk','accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_user_id_users_id_fk','agent_instances','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_job_id_jobs_id_fk','agent_instances','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('agent_instances_session_id_chat_sessions_id_fk','agent_instances','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL'),
  ('api_keys_user_id_users_id_fk','api_keys','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_user_id_users_id_fk','applications','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_job_id_jobs_id_fk','applications','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('applications_agent_instance_id_agent_instances_id_fk','applications','f','FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE SET NULL'),
  ('approval_gates_user_id_users_id_fk','approval_gates','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('branding_configs_organization_id_organizations_id_fk','branding_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('chat_messages_session_id_chat_sessions_id_fk','chat_messages','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE'),
  ('chat_sessions_user_id_users_id_fk','chat_sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('credit_transactions_user_id_users_id_fk','credit_transactions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_accounts_user_id_users_id_fk','email_accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_user_id_users_id_fk','email_messages','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_account_id_email_accounts_id_fk','email_messages','f','FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE'),
  ('email_messages_job_id_jobs_id_fk','email_messages','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('evaluations_user_id_users_id_fk','evaluations','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('evaluations_job_id_jobs_id_fk','evaluations','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('funnel_snapshots_user_id_users_id_fk','funnel_snapshots','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_ai_configs_organization_id_organizations_id_fk','organization_ai_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_organization_id_organizations_id_fk','organization_invitations','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_invited_by_id_users_id_fk','organization_invitations','f','FOREIGN KEY (invited_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_members_organization_id_organizations_id_fk','organization_members','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_members_user_id_users_id_fk','organization_members','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organizations_created_by_id_users_id_fk','organizations','f','FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('push_subscriptions_user_id_users_id_fk','push_subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referral_credits_user_id_users_id_fk','referral_credits','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referrer_id_users_id_fk','referrals','f','FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referred_user_id_users_id_fk','referrals','f','FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('sessions_user_id_users_id_fk','sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('subscriptions_user_id_users_id_fk','subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_alerts_user_id_users_id_fk','user_alerts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_user_id_users_id_fk','user_jobs','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_job_id_jobs_id_fk','user_jobs','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE')
), live_idx AS (
  SELECT c.relname AS name, t.relname AS tbl, i.indisvalid AS valid,
         regexp_replace(pg_get_indexdef(c.oid), '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE \1INDEX ON ') AS def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
   WHERE c.relnamespace = 'public'::regnamespace
), live_con AS (
  SELECT k.conname AS name, t.relname AS tbl, k.contype::text AS contype, regexp_replace(pg_get_constraintdef(k.oid), ' NOT VALID$', '') AS def, k.convalidated AS valid
    FROM pg_constraint k JOIN pg_class t ON t.oid = k.conrelid
   WHERE k.connamespace = 'public'::regnamespace AND k.contype IN ('u','f')
), live_fk AS (
  SELECT l.name, l.tbl, l.def, l.valid, substring(l.def from '^FOREIGN KEY \(([^)]*)\)') AS cols
    FROM live_con l
   WHERE l.contype = 'f'
), fk_eval AS (
  -- One row per declared FK, matched against every live FK that carries its name or sits on
  -- the same table + child column list (in order) under ANY name. The comparison is the whole
  -- rendered definition: child columns, parent table + columns, ON DELETE, ON UPDATE, MATCH,
  -- DEFERRABLE. n_same = identical matches, n_diff = matches with a different definition
  -- (e.g. ON DELETE CASCADE under another name where SET NULL is declared = a mismatch).
  SELECT e.name, e.tbl, e.def,
         count(l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def) AS n_same,
         count(l.name) FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS n_diff,
         coalesce(bool_or(l.valid) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def), false) AS valid,
         string_agg(l.name, ', ' ORDER BY l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def AND l.name <> e.name) AS same_as,
         string_agg(CASE WHEN l.name = e.name THEN l.def ELSE l.name || ': ' || l.def END, '; ' ORDER BY l.name)
           FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS live_diff
    FROM exp_con e
    LEFT JOIN live_fk l ON l.name = e.name OR (l.tbl = e.tbl AND l.cols = substring(e.def from '^FOREIGN KEY \(([^)]*)\)'))
   WHERE e.contype = 'f'
   GROUP BY e.name, e.tbl, e.def
)
SELECT f.tbl, f.name, f.def,
       CASE WHEN f.n_diff > 0 THEN 'DIFFERENT' WHEN f.n_same = 0 THEN 'MISSING'
            WHEN f.valid THEN 'valid' ELSE 'NOT VALID' END
       || CASE WHEN f.n_diff = 0 AND f.same_as IS NOT NULL THEN ' (identical FK under another name: ' || f.same_as || ')' ELSE '' END AS state
  FROM fk_eval f
 ORDER BY 1, 2;

\echo '== 4. live-only FKs / unique constraints / indexes in public that drizzle does not declare (report only)'
WITH exp_idx(name, tbl, def) AS (VALUES
  ('accounts_user_id_idx','accounts','CREATE INDEX ON public.accounts USING btree (user_id)'),
  ('agent_instances_user_id_idx','agent_instances','CREATE INDEX ON public.agent_instances USING btree (user_id)'),
  ('api_keys_user_id_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (user_id)'),
  ('api_keys_key_hash_idx','api_keys','CREATE UNIQUE INDEX ON public.api_keys USING btree (key_hash)'),
  ('api_keys_key_prefix_idx','api_keys','CREATE INDEX ON public.api_keys USING btree (key_prefix)'),
  ('applications_user_id_idx','applications','CREATE INDEX ON public.applications USING btree (user_id)'),
  ('applications_user_job_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, job_id)'),
  ('applications_user_status_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, status)'),
  ('applications_user_stage_idx','applications','CREATE INDEX ON public.applications USING btree (user_id, pipeline_stage)'),
  ('applications_job_id_idx','applications','CREATE INDEX ON public.applications USING btree (job_id)'),
  ('approval_gates_user_id_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id)'),
  ('approval_gates_user_status_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (user_id, status)'),
  ('approval_gates_action_idx','approval_gates','CREATE INDEX ON public.approval_gates USING btree (action_id)'),
  ('branding_configs_org_id_idx','branding_configs','CREATE INDEX ON public.branding_configs USING btree (organization_id)'),
  ('branding_configs_custom_domain_idx','branding_configs','CREATE UNIQUE INDEX ON public.branding_configs USING btree (custom_domain)'),
  ('chat_messages_session_id_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id)'),
  ('chat_messages_session_created_idx','chat_messages','CREATE INDEX ON public.chat_messages USING btree (session_id, created_at)'),
  ('chat_sessions_user_id_idx','chat_sessions','CREATE INDEX ON public.chat_sessions USING btree (user_id)'),
  ('credit_tx_user_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id)'),
  ('credit_tx_user_created_idx','credit_transactions','CREATE INDEX ON public.credit_transactions USING btree (user_id, created_at)'),
  ('email_accounts_user_idx','email_accounts','CREATE INDEX ON public.email_accounts USING btree (user_id)'),
  ('email_messages_user_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id)'),
  ('email_messages_account_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (account_id)'),
  ('email_messages_thread_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (user_id, thread_key)'),
  ('email_messages_job_idx','email_messages','CREATE INDEX ON public.email_messages USING btree (job_id)'),
  ('evaluations_user_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id)'),
  ('evaluations_user_band_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, band)'),
  ('evaluations_user_score_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (user_id, score)'),
  ('evaluations_job_id_idx','evaluations','CREATE INDEX ON public.evaluations USING btree (job_id)'),
  ('funnel_snapshots_user_captured_idx','funnel_snapshots','CREATE INDEX ON public.funnel_snapshots USING btree (user_id, captured_at DESC NULLS LAST)'),
  ('jobs_location_country_idx','jobs','CREATE INDEX ON public.jobs USING btree (location_country)'),
  ('jobs_is_remote_idx','jobs','CREATE INDEX ON public.jobs USING btree (is_remote)'),
  ('jobs_date_posted_idx','jobs','CREATE INDEX ON public.jobs USING btree (date_posted DESC NULLS LAST)'),
  ('jobs_site_idx','jobs','CREATE INDEX ON public.jobs USING btree (site)'),
  ('jobs_title_idx','jobs','CREATE INDEX ON public.jobs USING btree (title)'),
  ('jobs_company_name_idx','jobs','CREATE INDEX ON public.jobs USING btree (company_name)'),
  ('jobs_job_level_idx','jobs','CREATE INDEX ON public.jobs USING btree (job_level)'),
  ('jobs_salary_min_idx','jobs','CREATE INDEX ON public.jobs USING btree (salary_min)'),
  ('jobs_lat_lng_idx','jobs','CREATE INDEX ON public.jobs USING btree (latitude, longitude)'),
  ('jobs_skills_gin_idx','jobs','CREATE INDEX ON public.jobs USING gin (skills)'),
  ('jobs_title_search_idx','jobs','CREATE INDEX ON public.jobs USING gin (to_tsvector(''english''::regconfig, title))'),
  ('org_ai_configs_org_id_idx','organization_ai_configs','CREATE UNIQUE INDEX ON public.organization_ai_configs USING btree (organization_id)'),
  ('org_invitations_org_id_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (organization_id)'),
  ('org_invitations_token_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (token)'),
  ('org_invitations_email_idx','organization_invitations','CREATE INDEX ON public.organization_invitations USING btree (email)'),
  ('org_members_org_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (organization_id)'),
  ('org_members_user_id_idx','organization_members','CREATE INDEX ON public.organization_members USING btree (user_id)'),
  ('organizations_slug_idx','organizations','CREATE INDEX ON public.organizations USING btree (slug)'),
  ('organizations_created_by_idx','organizations','CREATE INDEX ON public.organizations USING btree (created_by_id)'),
  ('push_subscriptions_user_id_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (user_id)'),
  ('push_subscriptions_endpoint_idx','push_subscriptions','CREATE INDEX ON public.push_subscriptions USING btree (endpoint)'),
  ('referral_credits_user_id_idx','referral_credits','CREATE INDEX ON public.referral_credits USING btree (user_id)'),
  ('referrals_referrer_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referrer_id)'),
  ('referrals_referral_code_idx','referrals','CREATE INDEX ON public.referrals USING btree (referral_code)'),
  ('referrals_referred_user_id_idx','referrals','CREATE INDEX ON public.referrals USING btree (referred_user_id)'),
  ('subscriptions_user_id_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (user_id)'),
  ('subscriptions_period_end_idx','subscriptions','CREATE INDEX ON public.subscriptions USING btree (current_period_end)'),
  ('user_alerts_user_id_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id)'),
  ('user_alerts_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (user_id, is_active)'),
  ('user_alerts_frequency_active_idx','user_alerts','CREATE INDEX ON public.user_alerts USING btree (frequency, is_active)'),
  ('user_jobs_user_id_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id)'),
  ('user_jobs_status_idx','user_jobs','CREATE INDEX ON public.user_jobs USING btree (user_id, status)')
), exp_con(name, tbl, contype, def) AS (VALUES
  ('accounts_provider_account_unique','accounts','u','UNIQUE (provider_id, account_id)'),
  ('credit_tx_grant_unique','credit_transactions','u','UNIQUE (user_id, reason, period_key)'),
  ('email_accounts_user_id_unique','email_accounts','u','UNIQUE (user_id)'),
  ('email_messages_msgid_unique','email_messages','u','UNIQUE (account_id, message_id)'),
  ('evaluations_user_job_unique','evaluations','u','UNIQUE (user_id, job_id)'),
  ('jobs_external_id_unique','jobs','u','UNIQUE (external_id)'),
  ('organization_invitations_token_unique','organization_invitations','u','UNIQUE (token)'),
  ('org_members_unique','organization_members','u','UNIQUE (organization_id, user_id)'),
  ('organizations_slug_unique','organizations','u','UNIQUE (slug)'),
  ('push_subscriptions_endpoint_unique','push_subscriptions','u','UNIQUE (endpoint)'),
  ('referral_credits_user_id_unique','referral_credits','u','UNIQUE (user_id)'),
  ('referrals_referral_code_unique','referrals','u','UNIQUE (referral_code)'),
  ('sessions_token_unique','sessions','u','UNIQUE (token)'),
  ('subscriptions_stripe_subscription_id_unique','subscriptions','u','UNIQUE (stripe_subscription_id)'),
  ('user_jobs_unique','user_jobs','u','UNIQUE (user_id, job_id)'),
  ('users_email_unique','users','u','UNIQUE (email)'),
  ('users_linkedin_id_unique','users','u','UNIQUE (linkedin_id)'),
  ('users_stripe_customer_id_unique','users','u','UNIQUE (stripe_customer_id)'),
  ('accounts_user_id_users_id_fk','accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_user_id_users_id_fk','agent_instances','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('agent_instances_job_id_jobs_id_fk','agent_instances','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('agent_instances_session_id_chat_sessions_id_fk','agent_instances','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL'),
  ('api_keys_user_id_users_id_fk','api_keys','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_user_id_users_id_fk','applications','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('applications_job_id_jobs_id_fk','applications','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('applications_agent_instance_id_agent_instances_id_fk','applications','f','FOREIGN KEY (agent_instance_id) REFERENCES agent_instances(id) ON DELETE SET NULL'),
  ('approval_gates_user_id_users_id_fk','approval_gates','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('branding_configs_organization_id_organizations_id_fk','branding_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('chat_messages_session_id_chat_sessions_id_fk','chat_messages','f','FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE'),
  ('chat_sessions_user_id_users_id_fk','chat_sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('credit_transactions_user_id_users_id_fk','credit_transactions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_accounts_user_id_users_id_fk','email_accounts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_user_id_users_id_fk','email_messages','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('email_messages_account_id_email_accounts_id_fk','email_messages','f','FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE'),
  ('email_messages_job_id_jobs_id_fk','email_messages','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL'),
  ('evaluations_user_id_users_id_fk','evaluations','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('evaluations_job_id_jobs_id_fk','evaluations','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE'),
  ('funnel_snapshots_user_id_users_id_fk','funnel_snapshots','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_ai_configs_organization_id_organizations_id_fk','organization_ai_configs','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_organization_id_organizations_id_fk','organization_invitations','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_invitations_invited_by_id_users_id_fk','organization_invitations','f','FOREIGN KEY (invited_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organization_members_organization_id_organizations_id_fk','organization_members','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_members_user_id_users_id_fk','organization_members','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('organizations_created_by_id_users_id_fk','organizations','f','FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('push_subscriptions_user_id_users_id_fk','push_subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referral_credits_user_id_users_id_fk','referral_credits','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referrer_id_users_id_fk','referrals','f','FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('referrals_referred_user_id_users_id_fk','referrals','f','FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE SET NULL'),
  ('sessions_user_id_users_id_fk','sessions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('subscriptions_user_id_users_id_fk','subscriptions','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_alerts_user_id_users_id_fk','user_alerts','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_user_id_users_id_fk','user_jobs','f','FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
  ('user_jobs_job_id_jobs_id_fk','user_jobs','f','FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE')
), live_idx AS (
  SELECT c.relname AS name, t.relname AS tbl, i.indisvalid AS valid,
         regexp_replace(pg_get_indexdef(c.oid), '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE \1INDEX ON ') AS def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
   WHERE c.relnamespace = 'public'::regnamespace
), live_con AS (
  SELECT k.conname AS name, t.relname AS tbl, k.contype::text AS contype, regexp_replace(pg_get_constraintdef(k.oid), ' NOT VALID$', '') AS def, k.convalidated AS valid
    FROM pg_constraint k JOIN pg_class t ON t.oid = k.conrelid
   WHERE k.connamespace = 'public'::regnamespace AND k.contype IN ('u','f')
), live_fk AS (
  SELECT l.name, l.tbl, l.def, l.valid, substring(l.def from '^FOREIGN KEY \(([^)]*)\)') AS cols
    FROM live_con l
   WHERE l.contype = 'f'
), fk_eval AS (
  -- One row per declared FK, matched against every live FK that carries its name or sits on
  -- the same table + child column list (in order) under ANY name. The comparison is the whole
  -- rendered definition: child columns, parent table + columns, ON DELETE, ON UPDATE, MATCH,
  -- DEFERRABLE. n_same = identical matches, n_diff = matches with a different definition
  -- (e.g. ON DELETE CASCADE under another name where SET NULL is declared = a mismatch).
  SELECT e.name, e.tbl, e.def,
         count(l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def) AS n_same,
         count(l.name) FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS n_diff,
         coalesce(bool_or(l.valid) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def), false) AS valid,
         string_agg(l.name, ', ' ORDER BY l.name) FILTER (WHERE l.tbl = e.tbl AND l.def = e.def AND l.name <> e.name) AS same_as,
         string_agg(CASE WHEN l.name = e.name THEN l.def ELSE l.name || ': ' || l.def END, '; ' ORDER BY l.name)
           FILTER (WHERE l.tbl <> e.tbl OR l.def <> e.def) AS live_diff
    FROM exp_con e
    LEFT JOIN live_fk l ON l.name = e.name OR (l.tbl = e.tbl AND l.cols = substring(e.def from '^FOREIGN KEY \(([^)]*)\)'))
   WHERE e.contype = 'f'
   GROUP BY e.name, e.tbl, e.def
)
SELECT 'constraint' AS kind, l.tbl, l.name, l.def,
       (SELECT string_agg(CASE WHEN f.def = l.def THEN 'identical to declared ' ELSE 'CONFLICTS with declared ' END || f.name, '; ' ORDER BY f.name)
          FROM live_fk f2 JOIN fk_eval f ON f.tbl = f2.tbl AND substring(f.def from '^FOREIGN KEY \(([^)]*)\)') = f2.cols
         WHERE f2.name = l.name AND f2.tbl = l.tbl) AS note
  FROM live_con l
 WHERE NOT EXISTS (SELECT 1 FROM exp_con e WHERE e.name = l.name)
UNION ALL
SELECT 'index', l.tbl, l.name, l.def, NULL FROM live_idx l
 WHERE NOT EXISTS (SELECT 1 FROM exp_idx e WHERE e.name = l.name)
   AND NOT EXISTS (SELECT 1 FROM exp_con e WHERE e.name = l.name)
   AND l.name NOT LIKE '%\_pkey'
 ORDER BY 1, 2, 3;
