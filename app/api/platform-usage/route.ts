import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';

interface PlatformUsageRecord {
  id: number;
  business_id: number;
  platform_id: number;
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  estimated_cost_usd: number;
  platform_name: string;
}

interface UsageTotals {
  platform_id: number;
  platform_name: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_requests: number;
  total_cost: number;
}

interface PlatformWithUsage {
  id: number;
  platform_id: string;
  budget_limit_usd: number | null;
  warning_threshold_percent: number;
  current_month_cost: number;
  current_month_tokens: number;
  current_month_requests: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const period = searchParams.get('period') || '30days';

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 });
    }

    const businessIdNum = parseInt(businessId, 10);
    if (isNaN(businessIdNum)) {
      return NextResponse.json({ error: 'Invalid businessId' }, { status: 400 });
    }

    // Get usage totals per platform
    let usageTotals: UsageTotals[];
    if (period === 'all') {
      usageTotals = dbHelpers.getPlatformUsageTotals.all(businessIdNum) as UsageTotals[];
    } else {
      usageTotals = dbHelpers.getPlatformUsageLast30Days.all(businessIdNum) as UsageTotals[];
    }

    // Get daily breakdown for the last 30 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dailyUsage = dbHelpers.getPlatformUsage.all(businessIdNum, startDate, endDate) as PlatformUsageRecord[];

    // Calculate aggregate totals
    const aggregateTotals = {
      totalTokens: usageTotals.reduce((sum, p) => sum + (p.total_tokens || 0), 0),
      totalRequests: usageTotals.reduce((sum, p) => sum + (p.total_requests || 0), 0),
      totalCost: usageTotals.reduce((sum, p) => sum + (p.total_cost || 0), 0),
    };

    // Get platforms with budget info for warnings
    const platformsWithUsage = dbHelpers.getPlatformsWithUsage.all(businessIdNum) as PlatformWithUsage[];

    // Calculate budget warnings
    const budgetWarnings = platformsWithUsage
      .filter(p => p.budget_limit_usd !== null)
      .map(p => {
        const usagePercent = p.budget_limit_usd! > 0
          ? (p.current_month_cost / p.budget_limit_usd!) * 100
          : 0;
        const isWarning = usagePercent >= p.warning_threshold_percent;
        const isExceeded = usagePercent >= 100;

        return {
          platformId: p.id,
          platformName: p.platform_id,
          budgetLimit: p.budget_limit_usd,
          warningThreshold: p.warning_threshold_percent,
          currentMonthCost: Math.round(p.current_month_cost * 100) / 100,
          usagePercent: Math.round(usagePercent * 10) / 10,
          isWarning,
          isExceeded,
        };
      })
      .filter(p => p.isWarning || p.isExceeded);

    // Format response
    const response = {
      businessId: businessIdNum,
      period,
      aggregate: {
        totalTokens: aggregateTotals.totalTokens,
        totalRequests: aggregateTotals.totalRequests,
        estimatedCostUsd: Math.round(aggregateTotals.totalCost * 100) / 100,
      },
      byPlatform: usageTotals.map(p => ({
        platformId: p.platform_id,
        platformName: p.platform_name,
        promptTokens: p.total_prompt_tokens || 0,
        completionTokens: p.total_completion_tokens || 0,
        totalTokens: p.total_tokens || 0,
        requestCount: p.total_requests || 0,
        estimatedCostUsd: Math.round((p.total_cost || 0) * 100) / 100,
      })),
      daily: dailyUsage.map(d => ({
        date: d.date,
        platformId: d.platform_id,
        platformName: d.platform_name,
        promptTokens: d.prompt_tokens,
        completionTokens: d.completion_tokens,
        totalTokens: d.total_tokens,
        requestCount: d.request_count,
        estimatedCostUsd: Math.round(d.estimated_cost_usd * 100) / 100,
      })),
      budgetWarnings,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching platform usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch platform usage' },
      { status: 500 }
    );
  }
}
