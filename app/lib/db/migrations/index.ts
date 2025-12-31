import { Migration } from './migration-runner';
import { migration_001 } from './001_initial_schema';
import { migration_002 } from './002_add_business_logo';
import { migration_003 } from './003_rename_logo_url_to_logo';
import { migration_004 } from './004_add_platform_usage';
import { migration_005 } from './005_add_platform_budget';
import { migration_006 } from './006_add_admin_api_keys';
import { migration_007 } from './007_add_api_call_tracking';
import { migration_008 } from './008_add_business_strategy';
import { migration_009 } from './009_add_strategy_goals';
import { migration_010 } from './010_add_prompt_priority';
import { migration_011 } from './011_add_users';
import { migration_012 } from './012_add_team_members';
import { migration013AddCompetitorActiveFlag } from './013_add_competitor_active_flag';
import { migration_014 } from './014_add_business_schedule';
import { migration_015 } from './015_add_competitor_logo';
import { migration_016 } from './016_add_refresh_period';
import { migration_017 } from './017_remove_business_user_id';
import { migration_018 } from './018_add_invitation_temp_password';
import { migration_019 } from './019_add_user_must_change_password';
import { migration_020 } from './020_add_invitation_name';
import { migration_021 } from './021_add_instance_settings';
import { migration_022 } from './022_add_site_audits';
import { migration_023 } from './023_add_prompt_metadata';

/**
 * All database migrations in order
 * Add new migrations to this array
 */
export const allMigrations: Migration[] = [
  migration_001,
  migration_002,
  migration_003,
  migration_004,
  migration_005,
  migration_006,
  migration_007,
  migration_008,
  migration_009,
  migration_010,
  migration_011,
  migration_012,
  migration013AddCompetitorActiveFlag,
  migration_014,
  migration_015,
  migration_016,
  migration_017,
  migration_018,
  migration_019,
  migration_020,
  migration_021,
  migration_022,
  migration_023,
  // Add new migrations here
];

export { MigrationRunner } from './migration-runner';
export type { Migration };
