import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

interface PromptExecution {
  id: number;
  prompt_id: number;
  platform_id: number;
  result: string;
  completed_at: string;
  refresh_date?: string;
  sources?: string;
  brand_mentions?: number;
  competitors_mentioned?: string;
}

interface DailyUrlUsage {
  date: string;
  urls: Record<string, number>;
}

interface UrlStat {
  url: string;
  domain: string;
  type: string;
  pageType: string;
  usagePercentage: number;
  totalAppearances: number;
  averageCitationsPerPrompt: number;
  yourBrandPresent: boolean;
  yourBrandAppearances: number;
  competitorPresent: boolean;
  competitorAppearances: number;
}

/**
 * GET /api/dashboard/sources/urls
 * Get URL-level source analytics data including daily usage and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const platformIdsParam = searchParams.get('platformIds');

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    const businessIdNum = parseInt(businessId);

    // Check user has access to this business
    const accessCheck = await checkBusinessAccess(businessIdNum);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status || 403 }
      );
    }

    // Parse selected platform IDs (if provided)
    let selectedPlatformIds: number[] | null = null;
    if (platformIdsParam) {
      selectedPlatformIds = platformIdsParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
    }

    // Get all executions in date range
    let executions: PromptExecution[];
    if (startDate && endDate) {
      // Extract just the date portion for SQL comparison (YYYY-MM-DD format)
      const startDateOnly = startDate.split('T')[0];
      const endDateOnly = endDate.split('T')[0];

      executions = dbHelpers.getPromptsExecutionsByDateRange.all(
        businessIdNum,
        startDateOnly,
        endDateOnly
      ) as PromptExecution[];
    } else {
      executions = dbHelpers.getAllPromptsExecutions.all(businessIdNum) as PromptExecution[];
    }

    // Filter by selected platforms if specified
    if (selectedPlatformIds && selectedPlatformIds.length > 0) {
      executions = executions.filter(e => selectedPlatformIds!.includes(e.platform_id));
    }

    // Calculate daily URL usage for graph
    const dailyUrlUsageMap = new Map<string, Map<string, { count: number; totalResponses: number }>>();

    // Track URL statistics
    const urlStatsMap = new Map<string, {
      url: string;
      domain: string;
      type: string;
      pageType: string;
      totalAppearances: number;
      totalCitations: number;
      responsesWithUrl: number;
      uniquePrompts: Set<number>;
      brandPresentAppearances: number;
      competitorPresentAppearances: number;
      bothPresentAppearances: number;
    }>();

    // Process each execution
    executions.forEach(exec => {
      const dateToUse = exec.refresh_date || (exec.completed_at ? exec.completed_at.split('T')[0] : null);
      if (!dateToUse) return;

      // Skip if no sources data
      if (!exec.sources) return;

      try {
        const sources = JSON.parse(exec.sources);
        if (!Array.isArray(sources) || sources.length === 0) return;

        // Check brand/competitor mentions
        const brandMentioned = (exec.brand_mentions || 0) > 0;
        let competitorsMentioned: string[] = [];
        if (exec.competitors_mentioned) {
          try {
            competitorsMentioned = JSON.parse(exec.competitors_mentioned);
          } catch (e) {
            // Failed to parse competitors
          }
        }

        // Get or create daily usage map for this date
        let dayData = dailyUrlUsageMap.get(dateToUse);
        if (!dayData) {
          dayData = new Map();
          dailyUrlUsageMap.set(dateToUse, dayData);
        }

        // Track unique URLs in this response
        const urlsInThisResponse = new Set<string>();

        // Process each source in this execution
        sources.forEach((source: any) => {
          if (!source.url) return;

          // Track URL appeared in this response (for usage percentage)
          urlsInThisResponse.add(source.url);

          // Track for overall statistics
          const stats = urlStatsMap.get(source.url) || {
            url: source.url,
            domain: source.domain || '',
            type: source.type || 'Other',
            pageType: source.pageType || 'Other',
            totalAppearances: 0,
            totalCitations: 0,
            responsesWithUrl: 0,
            uniquePrompts: new Set<number>(),
            brandPresentAppearances: 0,
            competitorPresentAppearances: 0,
            bothPresentAppearances: 0,
          };

          stats.totalCitations++; // Every occurrence is a citation
          stats.uniquePrompts.add(exec.prompt_id); // Track unique prompt

          urlStatsMap.set(source.url, stats);
        });

        // For each unique URL in this response
        urlsInThisResponse.forEach(url => {
          // Count this response for daily usage
          const dayUrlData = dayData.get(url) || { count: 0, totalResponses: 0 };
          dayUrlData.count++; // This URL appeared in this response
          dayData.set(url, dayUrlData);

          // Count response for this URL's statistics
          const stats = urlStatsMap.get(url)!;
          stats.responsesWithUrl++;

          // Track presence combinations
          if (brandMentioned && competitorsMentioned.length > 0) {
            stats.bothPresentAppearances++;
          } else if (brandMentioned) {
            stats.brandPresentAppearances++;
          } else if (competitorsMentioned.length > 0) {
            stats.competitorPresentAppearances++;
          }
        });

        // Track total responses for this day (for all URLs)
        dayData.forEach((data, url) => {
          data.totalResponses = executions.filter(e => {
            const d = e.refresh_date || (e.completed_at ? e.completed_at.split('T')[0] : null);
            return d === dateToUse;
          }).length;
          dayData.set(url, data);
        });
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Format daily URL usage for graph (top 10 by total usage)
    const dailyUrlUsage: DailyUrlUsage[] = [];

    // First, get top 10 URLs by total appearances
    const sortedUrls = Array.from(urlStatsMap.entries())
      .sort((a, b) => b[1].responsesWithUrl - a[1].responsesWithUrl)
      .slice(0, 10)
      .map(([url]) => url);

    dailyUrlUsageMap.forEach((urlsData, date) => {
      const urls: Record<string, number> = {};

      urlsData.forEach((data, url) => {
        // Only include top 10 URLs in the chart data
        if (sortedUrls.includes(url) && data.totalResponses > 0) {
          urls[url] = Math.round((data.count / data.totalResponses) * 1000) / 10;
        }
      });

      dailyUrlUsage.push({ date, urls });
    });

    // Sort by date
    dailyUrlUsage.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate URL statistics
    const totalResponses = executions.length;
    const urlStats: UrlStat[] = [];

    urlStatsMap.forEach((stats, url) => {
      const usagePercentage = totalResponses > 0
        ? Math.round((stats.responsesWithUrl / totalResponses) * 1000) / 10
        : 0;

      const averageCitationsPerPrompt = stats.uniquePrompts.size > 0
        ? stats.totalCitations / stats.uniquePrompts.size
        : 0;

      // Calculate presence flags
      const yourBrandPresent = (stats.brandPresentAppearances + stats.bothPresentAppearances) > 0;
      const competitorPresent = (stats.competitorPresentAppearances + stats.bothPresentAppearances) > 0;

      urlStats.push({
        url: stats.url,
        domain: stats.domain,
        type: stats.type,
        pageType: stats.pageType,
        usagePercentage,
        totalAppearances: stats.totalCitations,
        averageCitationsPerPrompt: Math.round(averageCitationsPerPrompt * 10) / 10,
        yourBrandPresent,
        yourBrandAppearances: stats.brandPresentAppearances + stats.bothPresentAppearances,
        competitorPresent,
        competitorAppearances: stats.competitorPresentAppearances + stats.bothPresentAppearances,
      });
    });

    // Sort by usage percentage (descending)
    urlStats.sort((a, b) => b.usagePercentage - a.usagePercentage);

    // Get available date range
    const availableDates = dailyUrlUsage.map(d => d.date);
    const dateRangeInfo = {
      earliest: availableDates.length > 0 ? availableDates[0] : null,
      latest: availableDates.length > 0 ? availableDates[availableDates.length - 1] : null,
      totalDays: availableDates.length
    };

    return NextResponse.json({
      success: true,
      dailyUrlUsage,
      urlStats,
      dateRangeInfo,
      totalResponses,
      topUrls: sortedUrls,
    });

  } catch (error: any) {
    console.error('[Sources URLs API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
