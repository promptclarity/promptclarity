import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';

interface ApiCallLog {
  call_type: string;
  call_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  avg_duration_ms: number;
}

interface PlatformApiCallLog extends ApiCallLog {
  platform_id: number;
  platform_name: string;
}

interface DailyUsage {
  date: string;
  call_type: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  call_count: number;
}

/**
 * GET /api/usage/breakdown - Get detailed token usage breakdown by call type
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const view = searchParams.get('view') || 'summary'; // 'summary', 'by_platform', 'daily', 'recent'

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 });
    }

    const businessIdNum = parseInt(businessId, 10);

    // Default date range: last 30 days
    const defaultEndDate = new Date().toISOString();
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const start = startDate || defaultStartDate;
    const end = endDate || defaultEndDate;

    if (view === 'summary') {
      // Get breakdown by call type (aggregated)
      const breakdown = dbHelpers.getApiCallLogsByCallType.all(
        businessIdNum,
        start,
        end
      ) as ApiCallLog[];

      // Calculate totals
      const totals = breakdown.reduce(
        (acc, row) => ({
          totalCalls: acc.totalCalls + (row.call_count || 0),
          totalPromptTokens: acc.totalPromptTokens + (row.total_prompt_tokens || 0),
          totalCompletionTokens: acc.totalCompletionTokens + (row.total_completion_tokens || 0),
          totalTokens: acc.totalTokens + (row.total_tokens || 0),
          totalCost: acc.totalCost + (row.total_cost || 0),
        }),
        { totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCost: 0 }
      );

      return NextResponse.json({
        businessId: businessIdNum,
        dateRange: { start, end },
        breakdown: breakdown.map(row => ({
          callType: row.call_type,
          callCount: row.call_count,
          promptTokens: row.total_prompt_tokens,
          completionTokens: row.total_completion_tokens,
          totalTokens: row.total_tokens,
          cost: Math.round(row.total_cost * 10000) / 10000,
          avgDurationMs: Math.round(row.avg_duration_ms || 0),
          percentOfCost: totals.totalCost > 0
            ? Math.round((row.total_cost / totals.totalCost) * 1000) / 10
            : 0,
          percentOfTokens: totals.totalTokens > 0
            ? Math.round((row.total_tokens / totals.totalTokens) * 1000) / 10
            : 0,
        })),
        totals: {
          calls: totals.totalCalls,
          promptTokens: totals.totalPromptTokens,
          completionTokens: totals.totalCompletionTokens,
          totalTokens: totals.totalTokens,
          cost: Math.round(totals.totalCost * 10000) / 10000,
        },
      });
    }

    if (view === 'by_platform') {
      // Get breakdown by platform and call type
      const breakdown = dbHelpers.getApiCallLogsByPlatformAndType.all(
        businessIdNum,
        start,
        end
      ) as PlatformApiCallLog[];

      // Group by platform
      const byPlatform: Record<string, any> = {};
      for (const row of breakdown) {
        const platformName = row.platform_name || `Platform ${row.platform_id}`;
        if (!byPlatform[platformName]) {
          byPlatform[platformName] = {
            platformId: row.platform_id,
            platformName,
            callTypes: [],
            totals: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
          };
        }

        byPlatform[platformName].callTypes.push({
          callType: row.call_type,
          callCount: row.call_count,
          promptTokens: row.total_prompt_tokens,
          completionTokens: row.total_completion_tokens,
          totalTokens: row.total_tokens,
          cost: Math.round(row.total_cost * 10000) / 10000,
          avgDurationMs: Math.round(row.avg_duration_ms || 0),
        });

        byPlatform[platformName].totals.calls += row.call_count || 0;
        byPlatform[platformName].totals.promptTokens += row.total_prompt_tokens || 0;
        byPlatform[platformName].totals.completionTokens += row.total_completion_tokens || 0;
        byPlatform[platformName].totals.totalTokens += row.total_tokens || 0;
        byPlatform[platformName].totals.cost += row.total_cost || 0;
      }

      // Round costs
      for (const platform of Object.values(byPlatform)) {
        platform.totals.cost = Math.round(platform.totals.cost * 10000) / 10000;
      }

      return NextResponse.json({
        businessId: businessIdNum,
        dateRange: { start, end },
        platforms: Object.values(byPlatform),
      });
    }

    if (view === 'daily') {
      // Get daily breakdown
      const dailyUsage = dbHelpers.getDailyTokenUsageByCallType.all(
        businessIdNum,
        start,
        end
      ) as DailyUsage[];

      // Group by date
      const byDate: Record<string, any> = {};
      for (const row of dailyUsage) {
        if (!byDate[row.date]) {
          byDate[row.date] = {
            date: row.date,
            callTypes: [],
            totals: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
          };
        }

        byDate[row.date].callTypes.push({
          callType: row.call_type,
          callCount: row.call_count,
          promptTokens: row.prompt_tokens,
          completionTokens: row.completion_tokens,
          totalTokens: row.total_tokens,
          cost: Math.round(row.cost * 10000) / 10000,
        });

        byDate[row.date].totals.calls += row.call_count || 0;
        byDate[row.date].totals.promptTokens += row.prompt_tokens || 0;
        byDate[row.date].totals.completionTokens += row.completion_tokens || 0;
        byDate[row.date].totals.totalTokens += row.total_tokens || 0;
        byDate[row.date].totals.cost += row.cost || 0;
      }

      // Round costs and sort by date descending
      const days = Object.values(byDate)
        .map((day: any) => ({
          ...day,
          totals: {
            ...day.totals,
            cost: Math.round(day.totals.cost * 10000) / 10000,
          },
        }))
        .sort((a: any, b: any) => b.date.localeCompare(a.date));

      return NextResponse.json({
        businessId: businessIdNum,
        dateRange: { start, end },
        days,
      });
    }

    if (view === 'recent') {
      // Get recent API calls (for debugging)
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const recentCalls = dbHelpers.getRecentApiCallLogs.all(businessIdNum, limit) as any[];

      return NextResponse.json({
        businessId: businessIdNum,
        calls: recentCalls.map(call => ({
          id: call.id,
          platformName: call.platform_name,
          callType: call.call_type,
          promptTokens: call.prompt_tokens,
          completionTokens: call.completion_tokens,
          totalTokens: call.total_tokens,
          cost: Math.round(call.estimated_cost_usd * 10000) / 10000,
          durationMs: call.duration_ms,
          success: call.success === 1,
          error: call.error_message,
          createdAt: call.created_at,
          executionId: call.execution_id,
        })),
      });
    }

    return NextResponse.json({ error: 'Invalid view parameter' }, { status: 400 });
  } catch (error: any) {
    console.error('Error fetching usage breakdown:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch usage breakdown' },
      { status: 500 }
    );
  }
}
