import { NextRequest, NextResponse } from 'next/server';
import db from '@/app/lib/db/database';

interface ExecutionCount {
  count: number;
}

/**
 * GET /api/executions/status
 * Returns the count of pending and running executions for a business
 * Used for polling to detect when all executions are complete
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    // Count pending executions (prompts that haven't been executed yet today)
    const pendingResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM prompts p
      WHERE p.business_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM prompt_executions pe
          WHERE pe.prompt_id = p.id
            AND date(pe.completed_at) = date('now')
        )
    `).get(businessId) as ExecutionCount;

    // Count running executions (started but not completed)
    const runningResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM prompt_executions pe
      JOIN prompts p ON pe.prompt_id = p.id
      WHERE p.business_id = ?
        AND pe.status = 'running'
    `).get(businessId) as ExecutionCount;

    // Also get the total count and completed count for progress
    const totalResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM prompts p
      WHERE p.business_id = ?
    `).get(businessId) as ExecutionCount;

    const completedTodayResult = db.prepare(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM prompts p
      JOIN prompt_executions pe ON pe.prompt_id = p.id
      WHERE p.business_id = ?
        AND date(pe.completed_at) = date('now')
    `).get(businessId) as ExecutionCount;

    return NextResponse.json({
      pending: pendingResult?.count || 0,
      running: runningResult?.count || 0,
      total: totalResult?.count || 0,
      completedToday: completedTodayResult?.count || 0,
    });
  } catch (error) {
    console.error('Error checking execution status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
