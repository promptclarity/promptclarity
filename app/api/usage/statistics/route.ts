import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers } from '@/app/lib/db/database';
import { getAllPricing, estimatePromptCost, getModelPricing } from '@/app/lib/config/pricing';

interface DailyUsage {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  cost: number;
}

interface PlatformUsage {
  platform_id: number;
  platform_name: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_requests: number;
  total_cost: number;
}

interface CallTypeBreakdown {
  call_type: string;
  call_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  avg_duration_ms: number;
}

/**
 * GET /api/usage/statistics - Comprehensive usage statistics with time-based breakdowns
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 });
    }

    const businessIdNum = parseInt(businessId, 10);

    // Get current date info
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get daily usage for current month
    const currentMonthDaily = db.prepare(`
      SELECT
        date,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(request_count) as request_count,
        SUM(estimated_cost_usd) as cost
      FROM platform_usage
      WHERE business_id = ? AND date >= ?
      GROUP BY date
      ORDER BY date DESC
    `).all(businessIdNum, firstOfMonth) as DailyUsage[];

    // Get last month totals
    const lastMonthTotals = db.prepare(`
      SELECT
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(request_count) as request_count,
        SUM(estimated_cost_usd) as cost
      FROM platform_usage
      WHERE business_id = ? AND date >= ? AND date <= ?
    `).get(businessIdNum, firstOfLastMonth, lastOfLastMonth) as DailyUsage | undefined;

    // Get current month totals
    const currentMonthTotals = db.prepare(`
      SELECT
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(request_count) as request_count,
        SUM(estimated_cost_usd) as cost
      FROM platform_usage
      WHERE business_id = ? AND date >= ?
    `).get(businessIdNum, firstOfMonth) as DailyUsage | undefined;

    // Get all-time totals
    const allTimeTotals = db.prepare(`
      SELECT
        MIN(date) as first_date,
        MAX(date) as last_date,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(request_count) as request_count,
        SUM(estimated_cost_usd) as cost
      FROM platform_usage
      WHERE business_id = ?
    `).get(businessIdNum) as (DailyUsage & { first_date: string; last_date: string }) | undefined;

    // Get usage by platform (current month)
    const byPlatform = db.prepare(`
      SELECT
        pu.platform_id,
        bp.platform_id as platform_name,
        SUM(pu.prompt_tokens) as total_prompt_tokens,
        SUM(pu.completion_tokens) as total_completion_tokens,
        SUM(pu.total_tokens) as total_tokens,
        SUM(pu.request_count) as total_requests,
        SUM(pu.estimated_cost_usd) as total_cost
      FROM platform_usage pu
      JOIN business_platforms bp ON bp.id = pu.platform_id
      WHERE pu.business_id = ? AND pu.date >= ?
      GROUP BY pu.platform_id
      ORDER BY total_cost DESC
    `).all(businessIdNum, firstOfMonth) as PlatformUsage[];

    // Get usage by call type (from api_call_logs for current month)
    const byCallType = db.prepare(`
      SELECT
        call_type,
        COUNT(*) as call_count,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(estimated_cost_usd) as total_cost,
        AVG(duration_ms) as avg_duration_ms
      FROM api_call_logs
      WHERE business_id = ? AND created_at >= ?
      GROUP BY call_type
      ORDER BY total_cost DESC
    `).all(businessIdNum, firstOfMonth) as CallTypeBreakdown[];

    // Calculate days in period for daily average
    const daysInMonth = currentMonthDaily.length || 1;
    const daysActive = allTimeTotals?.first_date
      ? Math.max(1, Math.ceil((new Date().getTime() - new Date(allTimeTotals.first_date).getTime()) / (1000 * 60 * 60 * 24)))
      : 1;

    // Calculate averages
    const avgDailyCost = (currentMonthTotals?.cost || 0) / daysInMonth;
    const avgDailyTokens = (currentMonthTotals?.total_tokens || 0) / daysInMonth;
    const avgDailyRequests = (currentMonthTotals?.request_count || 0) / daysInMonth;

    // Project monthly cost based on current daily average
    const projectedMonthlyCost = avgDailyCost * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Calculate input/output cost breakdown
    const totalInputCost = byPlatform.reduce((sum, p) => {
      const pricing = getModelPricing(p.platform_name);
      return sum + (p.total_prompt_tokens / 1_000_000) * pricing.input;
    }, 0);

    const totalOutputCost = byPlatform.reduce((sum, p) => {
      const pricing = getModelPricing(p.platform_name);
      return sum + (p.total_completion_tokens / 1_000_000) * pricing.output;
    }, 0);

    // Get pricing for all platforms (for calculator)
    const platformPricing = getAllPricing();

    // Format response
    return NextResponse.json({
      businessId: businessIdNum,
      generatedAt: new Date().toISOString(),

      // Time-based totals
      currentMonth: {
        period: `${firstOfMonth} to ${today}`,
        daysActive: daysInMonth,
        tokens: currentMonthTotals?.total_tokens || 0,
        promptTokens: currentMonthTotals?.prompt_tokens || 0,
        completionTokens: currentMonthTotals?.completion_tokens || 0,
        requests: currentMonthTotals?.request_count || 0,
        cost: Math.round((currentMonthTotals?.cost || 0) * 100) / 100,
      },

      lastMonth: {
        period: `${firstOfLastMonth} to ${lastOfLastMonth}`,
        tokens: lastMonthTotals?.total_tokens || 0,
        promptTokens: lastMonthTotals?.prompt_tokens || 0,
        completionTokens: lastMonthTotals?.completion_tokens || 0,
        requests: lastMonthTotals?.request_count || 0,
        cost: Math.round((lastMonthTotals?.cost || 0) * 100) / 100,
      },

      allTime: {
        firstDate: allTimeTotals?.first_date || null,
        lastDate: allTimeTotals?.last_date || null,
        daysActive,
        tokens: allTimeTotals?.total_tokens || 0,
        promptTokens: allTimeTotals?.prompt_tokens || 0,
        completionTokens: allTimeTotals?.completion_tokens || 0,
        requests: allTimeTotals?.request_count || 0,
        cost: Math.round((allTimeTotals?.cost || 0) * 100) / 100,
      },

      // Averages and projections
      averages: {
        dailyCost: Math.round(avgDailyCost * 100) / 100,
        dailyTokens: Math.round(avgDailyTokens),
        dailyRequests: Math.round(avgDailyRequests * 10) / 10,
        costPerRequest: currentMonthTotals?.request_count
          ? Math.round(((currentMonthTotals?.cost || 0) / currentMonthTotals.request_count) * 10000) / 10000
          : 0,
        tokensPerRequest: currentMonthTotals?.request_count
          ? Math.round((currentMonthTotals?.total_tokens || 0) / currentMonthTotals.request_count)
          : 0,
      },

      projections: {
        monthlyCost: Math.round(projectedMonthlyCost * 100) / 100,
        monthlyTokens: Math.round(avgDailyTokens * 30),
      },

      // Cost breakdown
      costBreakdown: {
        inputCost: Math.round(totalInputCost * 100) / 100,
        outputCost: Math.round(totalOutputCost * 100) / 100,
        inputPercent: (currentMonthTotals?.cost || 0) > 0
          ? Math.round((totalInputCost / (currentMonthTotals?.cost || 1)) * 100)
          : 0,
        outputPercent: (currentMonthTotals?.cost || 0) > 0
          ? Math.round((totalOutputCost / (currentMonthTotals?.cost || 1)) * 100)
          : 0,
      },

      // By platform breakdown (current month)
      byPlatform: byPlatform.map(p => ({
        platformId: p.platform_id,
        platformName: p.platform_name,
        promptTokens: p.total_prompt_tokens || 0,
        completionTokens: p.total_completion_tokens || 0,
        totalTokens: p.total_tokens || 0,
        requests: p.total_requests || 0,
        cost: Math.round((p.total_cost || 0) * 100) / 100,
        costPercent: (currentMonthTotals?.cost || 0) > 0
          ? Math.round(((p.total_cost || 0) / (currentMonthTotals?.cost || 1)) * 100)
          : 0,
      })),

      // By call type breakdown (current month)
      byCallType: byCallType.map(c => ({
        callType: c.call_type,
        callCount: c.call_count || 0,
        promptTokens: c.total_prompt_tokens || 0,
        completionTokens: c.total_completion_tokens || 0,
        totalTokens: c.total_tokens || 0,
        cost: Math.round((c.total_cost || 0) * 100) / 100,
        avgDurationMs: Math.round(c.avg_duration_ms || 0),
        costPercent: (currentMonthTotals?.cost || 0) > 0
          ? Math.round(((c.total_cost || 0) / (currentMonthTotals?.cost || 1)) * 100)
          : 0,
      })),

      // Daily breakdown (current month, for charts)
      daily: currentMonthDaily.map(d => ({
        date: d.date,
        tokens: d.total_tokens || 0,
        promptTokens: d.prompt_tokens || 0,
        completionTokens: d.completion_tokens || 0,
        requests: d.request_count || 0,
        cost: Math.round((d.cost || 0) * 100) / 100,
      })),

      // Pricing info for calculator
      pricing: platformPricing,
    });

  } catch (error: any) {
    console.error('Error fetching usage statistics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch usage statistics' },
      { status: 500 }
    );
  }
}
