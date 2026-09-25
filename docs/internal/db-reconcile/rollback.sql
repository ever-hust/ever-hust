-- =====================================================================================
-- rollback.sql - PREPARED, NOT RUN. Undoes reconcile.sql on ONE Hust DB, returning it to the
-- pre-reconcile state captured 2026-09-25 (0 FKs, 8 of the 62 declared indexes present).
-- Owner approval required before running: this DROPs objects (schema only - no table data
-- is touched, but it removes FK enforcement / ON DELETE behaviour and the new indexes).
-- Run per DB, outside a transaction:  psql -X -v ON_ERROR_STOP=1 -d <db> -f rollback.sql
-- Deliberately NOT dropped (they existed before reconcile): credit_tx_user_idx, credit_tx_user_created_idx, email_accounts_user_idx, email_messages_user_idx, email_messages_account_idx, email_messages_thread_idx, email_messages_job_idx, jobs_lat_lng_idx
-- UNIQUE constraints: reconcile added none on live (all 18 already existed) - nothing to undo.
-- =====================================================================================
\set ON_ERROR_STOP 1
SET lock_timeout = '5s';
-- 1. foreign keys (35) - brief ACCESS EXCLUSIVE lock on child + parent each
ALTER TABLE "public"."accounts" DROP CONSTRAINT IF EXISTS "accounts_user_id_users_id_fk";
ALTER TABLE "public"."agent_instances" DROP CONSTRAINT IF EXISTS "agent_instances_user_id_users_id_fk";
ALTER TABLE "public"."agent_instances" DROP CONSTRAINT IF EXISTS "agent_instances_job_id_jobs_id_fk";
ALTER TABLE "public"."agent_instances" DROP CONSTRAINT IF EXISTS "agent_instances_session_id_chat_sessions_id_fk";
ALTER TABLE "public"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_user_id_users_id_fk";
ALTER TABLE "public"."applications" DROP CONSTRAINT IF EXISTS "applications_user_id_users_id_fk";
ALTER TABLE "public"."applications" DROP CONSTRAINT IF EXISTS "applications_job_id_jobs_id_fk";
ALTER TABLE "public"."applications" DROP CONSTRAINT IF EXISTS "applications_agent_instance_id_agent_instances_id_fk";
ALTER TABLE "public"."approval_gates" DROP CONSTRAINT IF EXISTS "approval_gates_user_id_users_id_fk";
ALTER TABLE "public"."branding_configs" DROP CONSTRAINT IF EXISTS "branding_configs_organization_id_organizations_id_fk";
ALTER TABLE "public"."chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_session_id_chat_sessions_id_fk";
ALTER TABLE "public"."chat_sessions" DROP CONSTRAINT IF EXISTS "chat_sessions_user_id_users_id_fk";
ALTER TABLE "public"."credit_transactions" DROP CONSTRAINT IF EXISTS "credit_transactions_user_id_users_id_fk";
ALTER TABLE "public"."email_accounts" DROP CONSTRAINT IF EXISTS "email_accounts_user_id_users_id_fk";
ALTER TABLE "public"."email_messages" DROP CONSTRAINT IF EXISTS "email_messages_user_id_users_id_fk";
ALTER TABLE "public"."email_messages" DROP CONSTRAINT IF EXISTS "email_messages_account_id_email_accounts_id_fk";
ALTER TABLE "public"."email_messages" DROP CONSTRAINT IF EXISTS "email_messages_job_id_jobs_id_fk";
ALTER TABLE "public"."evaluations" DROP CONSTRAINT IF EXISTS "evaluations_user_id_users_id_fk";
ALTER TABLE "public"."evaluations" DROP CONSTRAINT IF EXISTS "evaluations_job_id_jobs_id_fk";
ALTER TABLE "public"."funnel_snapshots" DROP CONSTRAINT IF EXISTS "funnel_snapshots_user_id_users_id_fk";
ALTER TABLE "public"."organization_ai_configs" DROP CONSTRAINT IF EXISTS "organization_ai_configs_organization_id_organizations_id_fk";
ALTER TABLE "public"."organization_invitations" DROP CONSTRAINT IF EXISTS "organization_invitations_organization_id_organizations_id_fk";
ALTER TABLE "public"."organization_invitations" DROP CONSTRAINT IF EXISTS "organization_invitations_invited_by_id_users_id_fk";
ALTER TABLE "public"."organization_members" DROP CONSTRAINT IF EXISTS "organization_members_organization_id_organizations_id_fk";
ALTER TABLE "public"."organization_members" DROP CONSTRAINT IF EXISTS "organization_members_user_id_users_id_fk";
ALTER TABLE "public"."organizations" DROP CONSTRAINT IF EXISTS "organizations_created_by_id_users_id_fk";
ALTER TABLE "public"."push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_user_id_users_id_fk";
ALTER TABLE "public"."referral_credits" DROP CONSTRAINT IF EXISTS "referral_credits_user_id_users_id_fk";
ALTER TABLE "public"."referrals" DROP CONSTRAINT IF EXISTS "referrals_referrer_id_users_id_fk";
ALTER TABLE "public"."referrals" DROP CONSTRAINT IF EXISTS "referrals_referred_user_id_users_id_fk";
ALTER TABLE "public"."sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_users_id_fk";
ALTER TABLE "public"."subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_user_id_users_id_fk";
ALTER TABLE "public"."user_alerts" DROP CONSTRAINT IF EXISTS "user_alerts_user_id_users_id_fk";
ALTER TABLE "public"."user_jobs" DROP CONSTRAINT IF EXISTS "user_jobs_user_id_users_id_fk";
ALTER TABLE "public"."user_jobs" DROP CONSTRAINT IF EXISTS "user_jobs_job_id_jobs_id_fk";
-- 2. indexes that reconcile created (54) - CONCURRENTLY, one per statement, no transaction
SET lock_timeout = '5min';
DROP INDEX CONCURRENTLY IF EXISTS "public"."accounts_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."agent_instances_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."api_keys_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."api_keys_key_hash_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."api_keys_key_prefix_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."applications_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."applications_user_job_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."applications_user_status_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."applications_user_stage_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."applications_job_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."approval_gates_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."approval_gates_user_status_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."approval_gates_action_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."branding_configs_org_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."branding_configs_custom_domain_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."chat_messages_session_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."chat_messages_session_created_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."chat_sessions_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."evaluations_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."evaluations_user_band_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."evaluations_user_score_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."evaluations_job_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."funnel_snapshots_user_captured_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_location_country_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_is_remote_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_date_posted_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_site_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_title_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_company_name_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_job_level_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_salary_min_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_skills_gin_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."jobs_title_search_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."org_ai_configs_org_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."org_invitations_org_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."org_invitations_token_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."org_invitations_email_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."org_members_org_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."org_members_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."organizations_slug_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."organizations_created_by_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."push_subscriptions_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."push_subscriptions_endpoint_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."referral_credits_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."referrals_referrer_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."referrals_referral_code_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."referrals_referred_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."subscriptions_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."subscriptions_period_end_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."user_alerts_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."user_alerts_active_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."user_alerts_frequency_active_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."user_jobs_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "public"."user_jobs_status_idx";
