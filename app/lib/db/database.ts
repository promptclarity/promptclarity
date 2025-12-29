import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { MigrationRunner, allMigrations } from './migrations';

// Lazy database initialization to avoid build-time errors
let _db: ReturnType<typeof Database> | null = null;
let _initialized = false;
let _dbHelpers: ReturnType<typeof createDbHelpers> | null = null;

function getDb(): ReturnType<typeof Database> {
  if (!_db) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    _db = new Database(path.join(dataDir, 'store.db'));
    _db.pragma('foreign_keys = ON');
  }

  // Run migrations on first access (runtime only)
  if (!_initialized) {
    _initialized = true;
    const migrationRunner = new MigrationRunner(_db);
    try {
      migrationRunner.runMigrations(allMigrations);
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  return _db;
}

function createDbHelpers(db: ReturnType<typeof Database>) {
  return {
    createBusiness: db.prepare(`
    INSERT INTO businesses (business_name, website, logo)
    VALUES (@businessName, @website, @logo)
  `),

    updateBusiness: db.prepare(`
    UPDATE businesses
    SET business_name = @businessName,
        website = @website,
        logo = @logo,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),

    getBusiness: db.prepare(`
    SELECT * FROM businesses WHERE id = ?
  `),

    getBusinessByName: db.prepare(`
    SELECT * FROM businesses WHERE business_name = ?
  `),

  getAllBusinesses: db.prepare(`
    SELECT * FROM businesses ORDER BY created_at DESC
  `),

    createSession: db.prepare(`
    INSERT INTO onboarding_sessions (business_id, step_completed)
    VALUES (@businessId, @stepCompleted)
  `),

    updateSession: db.prepare(`
    UPDATE onboarding_sessions
    SET step_completed = @stepCompleted,
        updated_at = CURRENT_TIMESTAMP
    WHERE business_id = @businessId
  `),

    getSession: db.prepare(`
    SELECT * FROM onboarding_sessions WHERE business_id = ?
  `),

    createTopic: db.prepare(`
    INSERT INTO topics (business_id, name, is_custom)
    VALUES (@businessId, @name, @isCustom)
  `),

    getTopicsByBusiness: db.prepare(`
    SELECT * FROM topics WHERE business_id = ? ORDER BY created_at
  `),

    deleteTopicsByBusiness: db.prepare(`
    DELETE FROM topics WHERE business_id = ?
  `),

    createPrompt: db.prepare(`
    INSERT INTO prompts (business_id, topic_id, text, is_custom, funnel_stage, persona, tags, topic_cluster)
    VALUES (@businessId, @topicId, @text, @isCustom, @funnelStage, @persona, @tags, @topicCluster)
  `),

    getPromptsByBusiness: db.prepare(`
    SELECT p.*, t.name as topic_name
    FROM prompts p
    LEFT JOIN topics t ON p.topic_id = t.id
    WHERE p.business_id = ?
    ORDER BY p.created_at
  `),

    deletePromptsByBusiness: db.prepare(`
    DELETE FROM prompts WHERE business_id = ?
  `),

    deletePrompt: db.prepare(`
    DELETE FROM prompts WHERE id = ?
  `),

    deleteTopic: db.prepare(`
    DELETE FROM topics WHERE id = ?
  `),

    deletePromptsByTopic: db.prepare(`
    DELETE FROM prompts WHERE topic_id = ?
  `),

    countPromptsByTopic: db.prepare(`
    SELECT COUNT(*) as count FROM prompts WHERE topic_id = ?
  `),

    getOrphanedTopics: db.prepare(`
    SELECT t.id FROM topics t
    LEFT JOIN prompts p ON t.id = p.topic_id
    WHERE t.business_id = ?
    GROUP BY t.id
    HAVING COUNT(p.id) = 0
  `),

    deleteOrphanedTopics: db.prepare(`
    DELETE FROM topics WHERE id IN (
      SELECT t.id FROM topics t
      LEFT JOIN prompts p ON t.id = p.topic_id
      WHERE t.business_id = ?
      GROUP BY t.id
      HAVING COUNT(p.id) = 0
    )
  `),

    togglePromptPriority: db.prepare(`
    UPDATE prompts SET is_priority = NOT is_priority WHERE id = ?
  `),

    setPromptPriority: db.prepare(`
    UPDATE prompts SET is_priority = ? WHERE id = ?
  `),

    createCompetitor: db.prepare(`
    INSERT INTO competitors (business_id, name, website, description, is_custom, is_active, logo)
    VALUES (@businessId, @name, @website, @description, @isCustom, 1, @logo)
  `),

    getCompetitorsByBusiness: db.prepare(`
    SELECT * FROM competitors WHERE business_id = ? AND (is_active = 1 OR is_active IS NULL) ORDER BY created_at
  `),

    getAllCompetitorsByBusiness: db.prepare(`
    SELECT * FROM competitors WHERE business_id = ? ORDER BY created_at
  `),

    getInactiveCompetitorsByBusiness: db.prepare(`
    SELECT * FROM competitors WHERE business_id = ? AND is_active = 0 ORDER BY created_at
  `),

    deleteCompetitorsByBusiness: db.prepare(`
    DELETE FROM competitors WHERE business_id = ?
  `),

    deleteCompetitor: db.prepare(`
    DELETE FROM competitors WHERE id = ?
  `),

    deactivateCompetitor: db.prepare(`
    UPDATE competitors SET is_active = 0 WHERE id = ?
  `),

    activateCompetitor: db.prepare(`
    UPDATE competitors SET is_active = 1 WHERE id = ?
  `),

    createPlatform: db.prepare(`
    INSERT OR REPLACE INTO business_platforms (business_id, platform_id, api_key, is_primary)
    VALUES (@businessId, @platformId, @apiKey, @isPrimary)
  `),

    updatePlatform: db.prepare(`
    UPDATE business_platforms
    SET api_key = @apiKey,
        is_primary = @isPrimary,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),

    setPrimaryPlatform: db.prepare(`
    UPDATE business_platforms
    SET is_primary = CASE WHEN id = @platformId THEN 1 ELSE 0 END
    WHERE business_id = @businessId
  `),

    getPlatformsByBusiness: db.prepare(`
    SELECT * FROM business_platforms WHERE business_id = ? AND is_active = 1 ORDER BY is_primary DESC, created_at ASC
  `),

    getPlatformById: db.prepare(`
    SELECT * FROM business_platforms WHERE id = ?
  `),

    deletePlatform: db.prepare(`
    DELETE FROM business_platforms WHERE id = ?
  `),

    deletePlatformsByBusiness: db.prepare(`
    DELETE FROM business_platforms WHERE business_id = ?
  `),

  getAllExistingApiKeys: db.prepare(`
    SELECT DISTINCT bp.platform_id, bp.api_key, b.business_name
    FROM business_platforms bp
    JOIN businesses b ON bp.business_id = b.id
    WHERE bp.is_active = 1
    ORDER BY bp.platform_id, b.created_at DESC
  `),

  updatePlatformAdminKey: db.prepare(`
    UPDATE business_platforms
    SET admin_api_key = @adminApiKey,
        updated_at = CURRENT_TIMESTAMP
    WHERE business_id = @businessId AND platform_id = @platformId
  `),

  getPlatformWithAdminKey: db.prepare(`
    SELECT * FROM business_platforms
    WHERE business_id = ? AND platform_id = ? AND is_active = 1
  `),

  createPromptExecution: db.prepare(`
    INSERT INTO prompt_executions (business_id, prompt_id, platform_id)
    VALUES (@businessId, @promptId, @platformId)
  `),

  updatePromptExecutionStatus: db.prepare(`
    UPDATE prompt_executions
    SET status = @status,
        result = @result,
        error_message = @errorMessage,
        started_at = @startedAt,
        completed_at = @completedAt
    WHERE id = @id
  `),

  getPromptExecution: db.prepare(`
    SELECT * FROM prompt_executions WHERE id = ?
  `),

  getLatestPromptExecutions: db.prepare(`
    SELECT
      pe.*,
      p.text as prompt_text,
      p.topic_id,
      t.name as topic_name,
      pl.platform_id,
      pl.api_key
    FROM prompt_executions pe
    INNER JOIN prompts p ON pe.prompt_id = p.id
    LEFT JOIN topics t ON p.topic_id = t.id
    INNER JOIN business_platforms pl ON pe.platform_id = pl.id
    WHERE pe.business_id = ?
      AND pe.status = 'completed'
      AND pe.id IN (
        SELECT MAX(id)
        FROM prompt_executions
        WHERE business_id = ? AND status = 'completed'
        GROUP BY prompt_id, platform_id
      )
    ORDER BY pe.completed_at DESC
  `),

  getPromptsWithExecutions: db.prepare(`
    SELECT
      pe.prompt_id,
      pe.platform_id,
      pe.result,
      pe.completed_at,
      COUNT(pe2.id) as execution_count
    FROM prompt_executions pe
    INNER JOIN (
      SELECT prompt_id, platform_id, MAX(completed_at) as max_completed_at
      FROM prompt_executions
      WHERE business_id = ? AND status = 'completed'
      GROUP BY prompt_id, platform_id
    ) latest ON pe.prompt_id = latest.prompt_id
             AND pe.platform_id = latest.platform_id
             AND pe.completed_at = latest.max_completed_at
    LEFT JOIN prompt_executions pe2 ON pe2.prompt_id = pe.prompt_id
                                    AND pe2.platform_id = pe.platform_id
                                    AND pe2.status = 'completed'
    WHERE pe.business_id = ? AND pe.status = 'completed'
    GROUP BY pe.prompt_id, pe.platform_id, pe.result, pe.completed_at
  `),

  getAllPromptsExecutions: db.prepare(`
    SELECT
      pe.id,
      pe.prompt_id,
      pe.platform_id,
      pe.result,
      pe.completed_at,
      pe.refresh_date,
      pe.brand_mentions,
      pe.competitors_mentioned,
      pe.mention_analysis,
      pe.analysis_confidence,
      pe.business_visibility,
      pe.share_of_voice,
      pe.competitor_share_of_voice,
      pe.competitor_visibilities,
      pe.sources,
      p.text as prompt_text
    FROM prompt_executions pe
    LEFT JOIN prompts p ON pe.prompt_id = p.id
    WHERE pe.business_id = ? AND pe.status = 'completed'
    ORDER BY pe.completed_at DESC
  `),

  getPromptsExecutionsByDateRange: db.prepare(`
    SELECT
      pe.id,
      pe.prompt_id,
      pe.platform_id,
      pe.result,
      pe.completed_at,
      pe.refresh_date,
      pe.brand_mentions,
      pe.competitors_mentioned,
      pe.mention_analysis,
      pe.analysis_confidence,
      pe.business_visibility,
      pe.share_of_voice,
      pe.competitor_share_of_voice,
      pe.competitor_visibilities,
      pe.sources,
      p.text as prompt_text
    FROM prompt_executions pe
    LEFT JOIN prompts p ON pe.prompt_id = p.id
    WHERE pe.business_id = ?
      AND pe.status = 'completed'
      AND date(pe.refresh_date) >= ?
      AND date(pe.refresh_date) <= ?
    ORDER BY pe.completed_at DESC
  `),

  promptExists: db.prepare(`
    SELECT COUNT(*) as count FROM prompts WHERE id = ? AND business_id = ?
  `),

  deletePromptExecution: db.prepare(`
    DELETE FROM prompt_executions WHERE id = ?
  `),

  upsertPlatformUsage: db.prepare(`
    INSERT INTO platform_usage (business_id, platform_id, date, prompt_tokens, completion_tokens, total_tokens, request_count, estimated_cost_usd)
    VALUES (@businessId, @platformId, @date, @promptTokens, @completionTokens, @totalTokens, 1, @estimatedCost)
    ON CONFLICT(business_id, platform_id, date) DO UPDATE SET
      prompt_tokens = prompt_tokens + @promptTokens,
      completion_tokens = completion_tokens + @completionTokens,
      total_tokens = total_tokens + @totalTokens,
      request_count = request_count + 1,
      estimated_cost_usd = estimated_cost_usd + @estimatedCost,
      updated_at = CURRENT_TIMESTAMP
  `),

  getPlatformUsage: db.prepare(`
    SELECT
      pu.*,
      bp.platform_id as platform_name
    FROM platform_usage pu
    JOIN business_platforms bp ON pu.platform_id = bp.id
    WHERE pu.business_id = ?
      AND pu.date >= ?
      AND pu.date <= ?
    ORDER BY pu.date DESC
  `),

  getPlatformUsageTotals: db.prepare(`
    SELECT
      pu.platform_id,
      bp.platform_id as platform_name,
      SUM(pu.prompt_tokens) as total_prompt_tokens,
      SUM(pu.completion_tokens) as total_completion_tokens,
      SUM(pu.total_tokens) as total_tokens,
      SUM(pu.request_count) as total_requests,
      SUM(pu.estimated_cost_usd) as total_cost
    FROM platform_usage pu
    JOIN business_platforms bp ON pu.platform_id = bp.id
    WHERE pu.business_id = ?
    GROUP BY pu.platform_id, bp.platform_id
  `),

  getPlatformUsageLast30Days: db.prepare(`
    SELECT
      pu.platform_id,
      bp.platform_id as platform_name,
      SUM(pu.prompt_tokens) as total_prompt_tokens,
      SUM(pu.completion_tokens) as total_completion_tokens,
      SUM(pu.total_tokens) as total_tokens,
      SUM(pu.request_count) as total_requests,
      SUM(pu.estimated_cost_usd) as total_cost
    FROM platform_usage pu
    JOIN business_platforms bp ON pu.platform_id = bp.id
    WHERE pu.business_id = ?
      AND pu.date >= date('now', '-30 days')
    GROUP BY pu.platform_id, bp.platform_id
  `),

  updateExecutionTokens: db.prepare(`
    UPDATE prompt_executions
    SET prompt_tokens = @promptTokens,
        completion_tokens = @completionTokens,
        total_tokens = @totalTokens
    WHERE id = @id
  `),

  updatePlatformBudget: db.prepare(`
    UPDATE business_platforms
    SET budget_limit_usd = @budgetLimit,
        warning_threshold_percent = @warningThreshold,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),

  getPlatformWithBudget: db.prepare(`
    SELECT
      bp.*,
      COALESCE(
        (SELECT SUM(estimated_cost_usd)
         FROM platform_usage
         WHERE platform_id = bp.id
           AND date >= date('now', 'start of month')),
        0
      ) as current_month_cost
    FROM business_platforms bp
    WHERE bp.id = ?
  `),

  getPlatformsWithUsage: db.prepare(`
    SELECT
      bp.*,
      COALESCE(pu.total_cost, 0) as current_month_cost,
      COALESCE(pu.total_tokens, 0) as current_month_tokens,
      COALESCE(pu.total_requests, 0) as current_month_requests
    FROM business_platforms bp
    LEFT JOIN (
      SELECT
        platform_id,
        SUM(estimated_cost_usd) as total_cost,
        SUM(total_tokens) as total_tokens,
        SUM(request_count) as total_requests
      FROM platform_usage
      WHERE date >= date('now', 'start of month')
      GROUP BY platform_id
    ) pu ON bp.id = pu.platform_id
    WHERE bp.business_id = ? AND bp.is_active = 1
    ORDER BY bp.is_primary DESC, bp.created_at ASC
  `),

  insertApiCallLog: db.prepare(`
    INSERT INTO api_call_logs (
      business_id, platform_id, execution_id, call_type,
      prompt_tokens, completion_tokens, total_tokens,
      estimated_cost_usd, duration_ms, success, error_message
    )
    VALUES (
      @businessId, @platformId, @executionId, @callType,
      @promptTokens, @completionTokens, @totalTokens,
      @estimatedCost, @durationMs, @success, @errorMessage
    )
  `),

  getApiCallLogsByCallType: db.prepare(`
    SELECT
      call_type,
      COUNT(*) as call_count,
      SUM(prompt_tokens) as total_prompt_tokens,
      SUM(completion_tokens) as total_completion_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as total_cost,
      AVG(duration_ms) as avg_duration_ms
    FROM api_call_logs
    WHERE business_id = ?
      AND created_at >= ?
      AND created_at <= ?
    GROUP BY call_type
    ORDER BY total_cost DESC
  `),

  getApiCallLogsByPlatformAndType: db.prepare(`
    SELECT
      acl.platform_id,
      bp.platform_id as platform_name,
      acl.call_type,
      COUNT(*) as call_count,
      SUM(acl.prompt_tokens) as total_prompt_tokens,
      SUM(acl.completion_tokens) as total_completion_tokens,
      SUM(acl.total_tokens) as total_tokens,
      SUM(acl.estimated_cost_usd) as total_cost,
      AVG(acl.duration_ms) as avg_duration_ms
    FROM api_call_logs acl
    JOIN business_platforms bp ON acl.platform_id = bp.id
    WHERE acl.business_id = ?
      AND acl.created_at >= ?
      AND acl.created_at <= ?
    GROUP BY acl.platform_id, bp.platform_id, acl.call_type
    ORDER BY total_cost DESC
  `),

  getRecentApiCallLogs: db.prepare(`
    SELECT
      acl.*,
      bp.platform_id as platform_name
    FROM api_call_logs acl
    JOIN business_platforms bp ON acl.platform_id = bp.id
    WHERE acl.business_id = ?
    ORDER BY acl.created_at DESC
    LIMIT ?
  `),

  getDailyTokenUsageByCallType: db.prepare(`
    SELECT
      date(created_at) as date,
      call_type,
      SUM(prompt_tokens) as prompt_tokens,
      SUM(completion_tokens) as completion_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as cost,
      COUNT(*) as call_count
    FROM api_call_logs
    WHERE business_id = ?
      AND created_at >= ?
      AND created_at <= ?
    GROUP BY date(created_at), call_type
    ORDER BY date(created_at) DESC, call_type
  `),

  upsertBusinessStrategy: db.prepare(`
    INSERT INTO business_strategies (business_id, primary_goal, goals, product_segments, target_markets, target_personas, funnel_stages)
    VALUES (@businessId, @primaryGoal, @goals, @productSegments, @targetMarkets, @targetPersonas, @funnelStages)
    ON CONFLICT(business_id) DO UPDATE SET
      primary_goal = @primaryGoal,
      goals = @goals,
      product_segments = @productSegments,
      target_markets = @targetMarkets,
      target_personas = @targetPersonas,
      funnel_stages = @funnelStages,
      updated_at = CURRENT_TIMESTAMP
  `),

  getBusinessStrategy: db.prepare(`
    SELECT * FROM business_strategies WHERE business_id = ?
  `),

  deleteBusinessStrategy: db.prepare(`
    DELETE FROM business_strategies WHERE business_id = ?
  `),

  deleteBusiness: db.prepare(`
    DELETE FROM businesses WHERE id = ?
  `),

  deleteOnboardingSession: db.prepare(`
    DELETE FROM onboarding_sessions WHERE business_id = ?
  `),

  deletePromptExecutionsByBusiness: db.prepare(`
    DELETE FROM prompt_executions WHERE business_id = ?
  `),

  deletePlatformUsageByBusiness: db.prepare(`
    DELETE FROM platform_usage WHERE business_id = ?
  `),

  deleteApiCallLogsByBusiness: db.prepare(`
    DELETE FROM api_call_logs WHERE business_id = ?
  `),

  addBusinessMember: db.prepare(`
    INSERT INTO business_members (business_id, user_id, role, invited_by)
    VALUES (@businessId, @userId, @role, @invitedBy)
  `),

  getBusinessMembers: db.prepare(`
    SELECT
      bm.*,
      u.name as user_name,
      u.email as user_email,
      u.image as user_image,
      ib.name as invited_by_name
    FROM business_members bm
    JOIN users u ON bm.user_id = u.id
    LEFT JOIN users ib ON bm.invited_by = ib.id
    WHERE bm.business_id = ?
    ORDER BY bm.joined_at ASC
  `),

  getBusinessMember: db.prepare(`
    SELECT * FROM business_members
    WHERE business_id = ? AND user_id = ?
  `),

  removeBusinessMember: db.prepare(`
    DELETE FROM business_members
    WHERE business_id = ? AND user_id = ?
  `),

  updateMemberRole: db.prepare(`
    UPDATE business_members
    SET role = @role
    WHERE business_id = @businessId AND user_id = @userId
  `),

  userHasBusinessAccess: db.prepare(`
    SELECT 1 FROM business_members WHERE business_id = ? AND user_id = ?
  `),

  getAccessibleBusinesses: db.prepare(`
    SELECT b.*, bm.role as access_role
    FROM businesses b
    JOIN business_members bm ON b.id = bm.business_id
    WHERE bm.user_id = ?
    ORDER BY b.created_at DESC
  `),

  createInvitation: db.prepare(`
    INSERT INTO business_invitations (business_id, email, role, token, invited_by, expires_at, temp_password, name)
    VALUES (@businessId, @email, @role, @token, @invitedBy, @expiresAt, @tempPassword, @name)
  `),

  getInvitationByToken: db.prepare(`
    SELECT
      bi.*,
      b.business_name,
      u.name as invited_by_name,
      u.email as invited_by_email
    FROM business_invitations bi
    JOIN businesses b ON bi.business_id = b.id
    JOIN users u ON bi.invited_by = u.id
    WHERE bi.token = ? AND bi.accepted_at IS NULL
  `),

  getPendingInvitations: db.prepare(`
    SELECT
      bi.*,
      u.name as invited_by_name
    FROM business_invitations bi
    JOIN users u ON bi.invited_by = u.id
    WHERE bi.business_id = ? AND bi.accepted_at IS NULL AND bi.expires_at > datetime('now')
    ORDER BY bi.created_at DESC
  `),

  getPendingInvitationByEmail: db.prepare(`
    SELECT * FROM business_invitations
    WHERE business_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > datetime('now')
  `),

  acceptInvitation: db.prepare(`
    UPDATE business_invitations
    SET accepted_at = datetime('now')
    WHERE id = ?
  `),

  deleteInvitation: db.prepare(`
    DELETE FROM business_invitations WHERE id = ?
  `),

  getUserByEmail: db.prepare(`
    SELECT * FROM users WHERE email = ?
  `),

  getUserById: db.prepare(`
    SELECT * FROM users WHERE id = ?
  `),

  setBusinessNextExecution: db.prepare(`
    UPDATE businesses
    SET next_execution_time = @nextExecutionTime,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @businessId
  `),

  getBusinessNextExecution: db.prepare(`
    SELECT id, business_name, next_execution_time
    FROM businesses
    WHERE id = ?
  `),

  getBusinessesDueForExecution: db.prepare(`
    SELECT id, business_name, next_execution_time, refresh_period_days
    FROM businesses
    WHERE next_execution_time IS NOT NULL
      AND next_execution_time <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    ORDER BY next_execution_time ASC
  `),

  setBusinessRefreshPeriod: db.prepare(`
    UPDATE businesses
    SET refresh_period_days = @refreshPeriodDays,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @businessId
  `),

  // Instance settings helpers
  getInstanceSettings: db.prepare(`
    SELECT * FROM instance_settings WHERE id = 1
  `),

  initializeInstance: db.prepare(`
    UPDATE instance_settings
    SET initialized = 1,
        initialized_at = datetime('now'),
        owner_user_id = @ownerUserId,
        instance_name = @instanceName,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `),

  updateInstanceSettings: db.prepare(`
    UPDATE instance_settings
    SET instance_name = @instanceName,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `),

  isInstanceInitialized: db.prepare(`
    SELECT initialized FROM instance_settings WHERE id = 1
  `),

  getInstanceOwner: db.prepare(`
    SELECT u.* FROM users u
    JOIN instance_settings i ON u.id = i.owner_user_id
    WHERE i.id = 1
  `),
  };
}

// Export a getter for dbHelpers that lazily initializes
export const dbHelpers = new Proxy({} as ReturnType<typeof createDbHelpers>, {
  get(target, prop) {
    if (!_dbHelpers) {
      _dbHelpers = createDbHelpers(getDb());
    }
    return _dbHelpers[prop as keyof typeof _dbHelpers];
  }
});

export function runTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

export default new Proxy({} as ReturnType<typeof Database>, {
  get(target, prop) {
    return (getDb() as any)[prop];
  }
});