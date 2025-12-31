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

interface DailySourceUsage {
  date: string;
  sources: Record<string, number>;
}

interface SourceStat {
  domain: string;
  type: string;
  usagePercentage: number;
  totalAppearances: number;
  averageCitationsPerPrompt: number;
  contentGapOpportunity: boolean;
  competitorOnlyAppearances: number;
  gapUsagePercentage: number;
  gapAverageCitationsPerPrompt: number;
  // New presence tracking
  yourBrandPresent: boolean;
  yourBrandAppearances: number;
  competitorPresent: boolean;
  competitorAppearances: number;
  whiteSpace: boolean; // Neither you nor competitors appear
  priorityScore: number; // Higher = more important to target
}

interface GapAnalysisSummary {
  totalSources: number;
  sourcesWithYou: number;
  sourcesWithCompetitors: number;
  sourcesWithBoth: number;
  whiteSpaceSources: number;
  highPriorityGaps: number;
}

/**
 * GET /api/dashboard/sources
 * Get source analytics data including daily usage and statistics
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

    // Calculate daily source usage for graph
    const dailySourceUsageMap = new Map<string, Map<string, { count: number; totalResponses: number }>>();

    // Track total content gap responses
    let totalContentGapResponses = 0;

    // Track source statistics
    const sourceStatsMap = new Map<string, {
      domain: string;
      type: string;
      totalAppearances: number;
      totalCitations: number;
      responsesWithSource: number;
      uniquePrompts: Set<number>;
      competitorOnlyAppearances: number;
      gapCitations: number;
      gapUniquePrompts: Set<number>;
      // New presence tracking
      brandPresentAppearances: number;
      competitorPresentAppearances: number;
      bothPresentAppearances: number;
      neitherPresentAppearances: number;
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

        // Check if this is a content gap opportunity (competitors mentioned but not brand)
        const brandMentioned = (exec.brand_mentions || 0) > 0;
        let competitorsMentioned: string[] = [];
        if (exec.competitors_mentioned) {
          try {
            competitorsMentioned = JSON.parse(exec.competitors_mentioned);
          } catch (e) {
            // Failed to parse competitors
          }
        }
        const isContentGap = !brandMentioned && competitorsMentioned.length > 0;

        // Count total content gap responses
        if (isContentGap) {
          totalContentGapResponses++;
        }

        // Get or create daily usage map for this date
        let dayData = dailySourceUsageMap.get(dateToUse);
        if (!dayData) {
          dayData = new Map();
          dailySourceUsageMap.set(dateToUse, dayData);
        }

        // Track unique domains in this response
        const domainsInThisResponse = new Set<string>();

        // Process each source in this execution
        sources.forEach((source: any) => {
          if (!source.domain) return;

          // Track domain appeared in this response (for usage percentage)
          domainsInThisResponse.add(source.domain);

          // Track for overall statistics
          const stats = sourceStatsMap.get(source.domain) || {
            domain: source.domain,
            type: source.type || 'Other',
            totalAppearances: 0,
            totalCitations: 0,
            responsesWithSource: 0,
            uniquePrompts: new Set<number>(),
            competitorOnlyAppearances: 0,
            gapCitations: 0,
            gapUniquePrompts: new Set<number>(),
            brandPresentAppearances: 0,
            competitorPresentAppearances: 0,
            bothPresentAppearances: 0,
            neitherPresentAppearances: 0,
          };

          stats.totalCitations++; // Every occurrence is a citation
          stats.uniquePrompts.add(exec.prompt_id); // Track unique prompt

          // Track gap-specific metrics
          if (isContentGap) {
            stats.gapCitations++;
            stats.gapUniquePrompts.add(exec.prompt_id);
          }

          sourceStatsMap.set(source.domain, stats);
        });

        // For each unique domain in this response
        domainsInThisResponse.forEach(domain => {
          // Count this response for daily usage
          const daySourceData = dayData.get(domain) || { count: 0, totalResponses: 0 };
          daySourceData.count++; // This domain appeared in this response
          dayData.set(domain, daySourceData);

          // Count response for this source's statistics
          const stats = sourceStatsMap.get(domain)!;
          stats.responsesWithSource++;

          // Track if this source appeared in a content gap opportunity
          if (isContentGap) {
            stats.competitorOnlyAppearances++;
          }

          // Track presence combinations
          if (brandMentioned && competitorsMentioned.length > 0) {
            stats.bothPresentAppearances++;
          } else if (brandMentioned) {
            stats.brandPresentAppearances++;
          } else if (competitorsMentioned.length > 0) {
            stats.competitorPresentAppearances++;
          } else {
            stats.neitherPresentAppearances++;
          }
        });

        // Track total responses for this day (for all sources)
        dayData.forEach((data, domain) => {
          data.totalResponses = executions.filter(e => {
            const d = e.refresh_date || (e.completed_at ? e.completed_at.split('T')[0] : null);
            return d === dateToUse;
          }).length;
          dayData.set(domain, data);
        });
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Format daily source usage for graph
    const dailySourceUsage: DailySourceUsage[] = [];
    dailySourceUsageMap.forEach((sourcesData, date) => {
      const sources: Record<string, number> = {};

      sourcesData.forEach((data, domain) => {
        if (data.totalResponses > 0) {
          sources[domain] = Math.round((data.count / data.totalResponses) * 1000) / 10;
        }
      });

      dailySourceUsage.push({ date, sources });
    });

    // Sort by date
    dailySourceUsage.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate source statistics
    const totalResponses = executions.length;
    const sourceStats: SourceStat[] = [];

    sourceStatsMap.forEach((stats, domain) => {
      const usagePercentage = totalResponses > 0
        ? Math.round((stats.responsesWithSource / totalResponses) * 1000) / 10
        : 0;

      const averageCitationsPerPrompt = stats.uniquePrompts.size > 0
        ? stats.totalCitations / stats.uniquePrompts.size
        : 0;

      // Calculate gap-specific metrics
      const gapUsagePercentage = totalContentGapResponses > 0
        ? Math.round((stats.competitorOnlyAppearances / totalContentGapResponses) * 1000) / 10
        : 0;

      const gapAverageCitationsPerPrompt = stats.gapUniquePrompts.size > 0
        ? stats.gapCitations / stats.gapUniquePrompts.size
        : 0;

      // Calculate presence flags
      const yourBrandPresent = (stats.brandPresentAppearances + stats.bothPresentAppearances) > 0;
      const competitorPresent = (stats.competitorPresentAppearances + stats.bothPresentAppearances) > 0;
      const whiteSpace = !yourBrandPresent && !competitorPresent && stats.responsesWithSource > 0;

      // Calculate priority score:
      // High usage + competitor present + you absent = highest priority
      // Formula: (usage% * 2) + (competitor appearances * 3) - (your brand appearances * 2)
      const priorityScore = Math.round(
        (usagePercentage * 2) +
        (stats.competitorPresentAppearances * 3) +
        (stats.bothPresentAppearances * 1) -
        (stats.brandPresentAppearances * 2)
      );

      sourceStats.push({
        domain: stats.domain,
        type: stats.type,
        usagePercentage,
        totalAppearances: stats.totalCitations,
        averageCitationsPerPrompt: Math.round(averageCitationsPerPrompt * 10) / 10,
        contentGapOpportunity: competitorPresent && !yourBrandPresent,
        competitorOnlyAppearances: stats.competitorOnlyAppearances,
        gapUsagePercentage,
        gapAverageCitationsPerPrompt: Math.round(gapAverageCitationsPerPrompt * 10) / 10,
        yourBrandPresent,
        yourBrandAppearances: stats.brandPresentAppearances + stats.bothPresentAppearances,
        competitorPresent,
        competitorAppearances: stats.competitorPresentAppearances + stats.bothPresentAppearances,
        whiteSpace,
        priorityScore: Math.max(0, priorityScore),
      });
    });

    // Sort by usage percentage (descending)
    sourceStats.sort((a, b) => b.usagePercentage - a.usagePercentage);

    // Calculate gap analysis summary
    const gapAnalysisSummary: GapAnalysisSummary = {
      totalSources: sourceStats.length,
      sourcesWithYou: sourceStats.filter(s => s.yourBrandPresent).length,
      sourcesWithCompetitors: sourceStats.filter(s => s.competitorPresent).length,
      sourcesWithBoth: sourceStats.filter(s => s.yourBrandPresent && s.competitorPresent).length,
      whiteSpaceSources: sourceStats.filter(s => s.whiteSpace).length,
      highPriorityGaps: sourceStats.filter(s => s.contentGapOpportunity && s.priorityScore > 20).length,
    };

    // Create priority list (top gaps sorted by priority score)
    const priorityGapList = sourceStats
      .filter(s => s.contentGapOpportunity)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 20);

    // Get available date range
    const availableDates = dailySourceUsage.map(d => d.date);
    const dateRangeInfo = {
      earliest: availableDates.length > 0 ? availableDates[0] : null,
      latest: availableDates.length > 0 ? availableDates[availableDates.length - 1] : null,
      totalDays: availableDates.length
    };

    return NextResponse.json({
      success: true,
      dailySourceUsage,
      sourceStats,
      dateRangeInfo,
      totalResponses,
      gapAnalysisSummary,
      priorityGapList,
    });

  } catch (error: any) {
    console.error('[Sources API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
