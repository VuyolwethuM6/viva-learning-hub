-- COMPLETED PLATFORM PERMISSION CHECK. Retained for drift checks; SELECT only.
-- Returns only a registered setting flag and role/table-name delegation metadata.
with config as (
 select current_setting('supautils.policy_grants',true) as policy_grants
)
select current_user as sql_role,
 exists(select 1 from pg_settings where name='supautils.policy_grants') as delegation_setting_registered,
 case when nullif(policy_grants,'') is null then null
      else (policy_grants::jsonb)->current_user
 end as current_role_policy_tables
from config;
