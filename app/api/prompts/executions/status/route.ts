import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers } from '@/app/lib/db/database';

/**
 * GET /api/prompts/executions/status
 * Check if there are any pending or in-progress executions for a business
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    const businessIdNum = parseInt(businessId);

    // Check for any currently running executions (status = 'running' or 'pending')
    // Only count as "running" if started within the last 10 minutes (to exclude stale/abandoned executions)
    const runningExecutions = db.prepare(`
      SELECT COUNT(*) as count
      FROM prompt_executions
      WHERE business_id = ?
        AND status IN ('running', 'pending')
        AND started_at > datetime('now', '-10 minutes')
    `).get(businessIdNum) as { count: number };

    const runningCount = runningExecutions?.count || 0;

    // Get unique prompts in the last 10 minutes (not executions - a prompt can run against multiple models)
    const recentBatchStart = db.prepare(`
      SELECT MIN(created_at) as batch_start, COUNT(DISTINCT prompt_id) as total_prompts
      FROM prompt_executions
      WHERE business_id = ?
        AND created_at > datetime('now', '-10 minutes')
    `).get(businessIdNum) as { batch_start: string | null; total_prompts: number };

    // Get completed prompt count - a prompt is complete when ALL its executions are done
    // Count prompts where no executions are still running/pending
    const completedPrompts = db.prepare(`
      SELECT COUNT(DISTINCT prompt_id) as count
      FROM prompt_executions pe1
      WHERE business_id = ?
        AND created_at > datetime('now', '-10 minutes')
        AND NOT EXISTS (
          SELECT 1 FROM prompt_executions pe2
          WHERE pe2.business_id = pe1.business_id
            AND pe2.prompt_id = pe1.prompt_id
            AND pe2.created_at > datetime('now', '-10 minutes')
            AND pe2.status IN ('running', 'pending')
        )
    `).get(businessIdNum) as { count: number };

    const completedCount = completedPrompts?.count || 0;
    const totalInBatch = recentBatchStart?.total_prompts || 0;

    // Also check for running status in case batch detection misses some
    const isInProgress = runningCount > 0 || (totalInBatch > 0 && completedCount < totalInBatch);

    // Get total executions ever for this business
    const allExecutions = dbHelpers.getAllPromptsExecutions.all(businessIdNum) as any[];
    const hasExecutions = allExecutions.length > 0;

    return NextResponse.json({
      success: true,
      status: {
        runningCount,
        totalInBatch,
        completedInBatch: completedCount,
        isInProgress,
        hasExecutions,
        percentComplete: totalInBatch > 0
          ? Math.round((completedCount / totalInBatch) * 100)
          : 0
      }
    });

  } catch (error: any) {
    console.error('[Execution Status API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
