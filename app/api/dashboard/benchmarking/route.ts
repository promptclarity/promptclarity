import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { getPlatformConfig } from '@/app/lib/config/platforms';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

interface PromptExecution {
  id: number;
  prompt_id: number;
  platform_id: number;
  result: string;
  completed_at: string;
  refresh_date?: string;
  brand_mentions?: number;
  competitors_mentioned?: string;
  business_visibility?: number;
  share_of_voice?: number;
  competitor_visibilities?: string;
  competitor_share_of_voice?: string;
  prompt_text?: string;
  analysis?: string;
  sources?: string;
}

interface SourceBenchmark {
  domain: string;
  type: string;
  totalAppearances: number;
  yourAppearances: number;
  competitorAppearances: number;
  yourPresenceRate: number;
  competitorPresenceRate: number;
  gap: number; // positive = you're ahead, negative = competitor advantage
  isGapOpportunity: boolean; // competitor appears but you don't
}

interface SourceMixByBrand {
  brand: string;
  editorial: number;
  ugc: number;
  corporate: number;
  competitor: number;
  reference: number;
  you: number;
  other: number;
  totalSources: number;
}

interface SegmentBenchmark {
  segment: string;
  promptCount: number;
  yourVisibility: number;
  avgCompetitorVisibility: number;
  topCompetitor: string;
  topCompetitorVisibility: number;
  yourSourceCount: number;
  topSourcesUsed: string[];
  status: 'dominate' | 'competitive' | 'weak' | 'invisible';
}

interface QueryInsight {
  promptId: number;
  promptText: string;
  yourVisibility: number;
  topCompetitor: string;
  topCompetitorVisibility: number;
  outcome: 'win' | 'loss' | 'tie' | 'solo';
  gap: number;
}

interface HeadToHead {
  competitor: string;
  wins: number;
  losses: number;
  ties: number;
  total: number;
  winRate: number;
}

interface CoOccurrence {
  competitor: string;
  coAppearances: number;
  totalYourAppearances: number;
  coOccurrenceRate: number;
}

interface Competitor {
  id: number;
  name: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const days = parseInt(searchParams.get('days') || '30');
    const platformIdParam = searchParams.get('platformId'); // Single platform filter

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

    // Get business info
    const business = dbHelpers.getBusiness.get(businessIdNum) as { id: number; business_name: string } | undefined;
    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Get competitors
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum) as Competitor[];

    // Get all platforms for this business
    const platforms = dbHelpers.getPlatformsByBusiness.all(businessIdNum) as any[];
    const platformsWithNames = platforms.map(p => {
      const config = getPlatformConfig(p.platform_id);
      return {
        id: p.id,
        platformId: p.platform_id,
        name: config?.name || p.platform_id
      };
    });

    // Calculate date range
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));

    // Extract just the date portion for SQL comparison (YYYY-MM-DD format)
    const startDateOnly = startDate.toISOString().split('T')[0];
    const endDateOnly = endDate.toISOString().split('T')[0];

    // Get executions in date range
    let executions = dbHelpers.getPromptsExecutionsByDateRange.all(
      businessIdNum,
      startDateOnly,
      endDateOnly
    ) as PromptExecution[];

    // Filter by specific platform if requested
    if (platformIdParam && platformIdParam !== 'all') {
      const platformIdNum = parseInt(platformIdParam);
      executions = executions.filter(e => e.platform_id === platformIdNum);
    }

    if (executions.length === 0) {
      return NextResponse.json({
        modelVisibility: {},
        competitivePositioning: [],
        timeSeriesData: [],
        categoryBreakdown: [],
        platforms: platformsWithNames,
      });
    }

    // Calculate model-by-model visibility
    const modelVisibility: Record<string, {
      platformId: number;
      platformName: string;
      businessVisibility: number;
      competitorVisibilities: Record<string, number>;
      executionCount: number;
    }> = {};

    // Group executions by platform
    const executionsByPlatform = new Map<number, PromptExecution[]>();
    executions.forEach(exec => {
      const existing = executionsByPlatform.get(exec.platform_id) || [];
      existing.push(exec);
      executionsByPlatform.set(exec.platform_id, existing);
    });

    // Process each platform
    executionsByPlatform.forEach((platformExecs, platformId) => {
      const platformConfig = platformsWithNames.find(p => p.id === platformId);
      const platformName = platformConfig?.name || `Platform ${platformId}`;

      // Calculate average business visibility for this platform
      let businessVisTotal = 0;
      let businessVisCount = 0;
      const competitorVisTotals: Record<string, { total: number; count: number }> = {};

      platformExecs.forEach(exec => {
        // Business visibility
        if (exec.business_visibility !== undefined && exec.business_visibility !== null) {
          businessVisTotal += exec.business_visibility;
          businessVisCount++;
        }

        // Competitor visibilities
        if (exec.competitor_visibilities) {
          try {
            const compVis = JSON.parse(exec.competitor_visibilities);
            Object.entries(compVis).forEach(([compName, vis]) => {
              if (!competitorVisTotals[compName]) {
                competitorVisTotals[compName] = { total: 0, count: 0 };
              }
              competitorVisTotals[compName].total += vis as number;
              competitorVisTotals[compName].count++;
            });
          } catch (e) {}
        }
      });

      const businessVisibility = businessVisCount > 0
        ? Math.round((businessVisTotal / businessVisCount) * 100)
        : 0;

      // Calculate average competitor visibilities
      const competitorVisibilities: Record<string, number> = {};
      Object.entries(competitorVisTotals)
        .sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count))
        .slice(0, 5)
        .forEach(([name, data]) => {
          competitorVisibilities[name] = Math.round((data.total / data.count) * 100);
        });

      modelVisibility[platformName] = {
        platformId,
        platformName,
        businessVisibility,
        competitorVisibilities,
        executionCount: platformExecs.length,
      };
    });

    // Calculate competitive positioning (across all selected platforms)
    const brandStats: Record<string, {
      visibilityTotal: number;
      visibilityCount: number;
      ranks: number[];
      mentionCount: number;
    }> = {};

    // Initialize with business
    const businessName = business.business_name;
    brandStats[businessName] = { visibilityTotal: 0, visibilityCount: 0, ranks: [], mentionCount: 0 };

    // Initialize competitors
    competitors.forEach(c => {
      brandStats[c.name] = { visibilityTotal: 0, visibilityCount: 0, ranks: [], mentionCount: 0 };
    });

    executions.forEach(exec => {
      // Track business visibility
      if (exec.business_visibility !== undefined && exec.business_visibility !== null) {
        brandStats[businessName].visibilityTotal += exec.business_visibility;
        brandStats[businessName].visibilityCount++;
        if (exec.brand_mentions && exec.brand_mentions > 0) {
          brandStats[businessName].mentionCount++;
        }
      }

      // Track competitor visibilities
      if (exec.competitor_visibilities) {
        try {
          const compVis = JSON.parse(exec.competitor_visibilities);
          Object.entries(compVis).forEach(([compName, vis]) => {
            if (!brandStats[compName]) {
              brandStats[compName] = { visibilityTotal: 0, visibilityCount: 0, ranks: [], mentionCount: 0 };
            }
            brandStats[compName].visibilityTotal += vis as number;
            brandStats[compName].visibilityCount++;
            if ((vis as number) > 0) {
              brandStats[compName].mentionCount++;
            }
          });
        } catch (e) {}
      }
    });

    // Build competitive positioning array
    const competitivePositioning = Object.entries(brandStats)
      .filter(([, stats]) => stats.visibilityCount > 0)
      .map(([brand, stats]) => {
        const visibility = stats.visibilityCount > 0
          ? Math.round((stats.visibilityTotal / stats.visibilityCount) * 100)
          : 0;

        // Determine status
        let status: 'dominate' | 'competitive' | 'weak' | 'invisible';
        if (visibility === 0) {
          status = 'invisible';
        } else if (visibility > 50) {
          status = 'dominate';
        } else if (visibility > 25) {
          status = 'competitive';
        } else {
          status = 'weak';
        }

        // Calculate average rank (position in responses)
        const avgRank = stats.ranks.length > 0
          ? stats.ranks.reduce((a, b) => a + b, 0) / stats.ranks.length
          : 0;

        return {
          brand,
          isBusiness: brand === businessName,
          visibility,
          avgRank: Math.round(avgRank * 10) / 10,
          mentionCount: stats.mentionCount,
          status,
          trend: 'stable' as const, // Would need historical comparison for real trends
        };
      })
      .sort((a, b) => b.visibility - a.visibility)
      .slice(0, 10);

    // Calculate time series data (group by day)
    const timeSeriesMap = new Map<string, {
      business: { total: number; count: number };
      competitors: Record<string, { total: number; count: number }>;
    }>();

    executions.forEach(exec => {
      const dateToUse = exec.refresh_date || (exec.completed_at ? exec.completed_at.split('T')[0] : null);
      if (!dateToUse) return;

      let dayData = timeSeriesMap.get(dateToUse);
      if (!dayData) {
        dayData = {
          business: { total: 0, count: 0 },
          competitors: {}
        };
        timeSeriesMap.set(dateToUse, dayData);
      }

      // Business visibility
      if (exec.business_visibility !== undefined && exec.business_visibility !== null) {
        dayData.business.total += exec.business_visibility;
        dayData.business.count++;
      }

      // Competitor visibilities
      if (exec.competitor_visibilities) {
        try {
          const compVis = JSON.parse(exec.competitor_visibilities);
          Object.entries(compVis).forEach(([compName, vis]) => {
            if (!dayData!.competitors[compName]) {
              dayData!.competitors[compName] = { total: 0, count: 0 };
            }
            dayData!.competitors[compName].total += vis as number;
            dayData!.competitors[compName].count++;
          });
        } catch (e) {}
      }
    });

    // Convert to array and calculate averages
    const timeSeriesData = Array.from(timeSeriesMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => {
        const point: Record<string, string | number> = {
          date,
          [businessName]: data.business.count > 0
            ? Math.round((data.business.total / data.business.count) * 100)
            : 0
        };

        // Add top competitors
        Object.entries(data.competitors)
          .slice(0, 4)
          .forEach(([compName, stats]) => {
            point[compName] = stats.count > 0
              ? Math.round((stats.total / stats.count) * 100)
              : 0;
          });

        return point;
      });

    // Category breakdown (simplified - would need prompt categories for real breakdown)
    const businessAvgVis = brandStats[businessName].visibilityCount > 0
      ? Math.round((brandStats[businessName].visibilityTotal / brandStats[businessName].visibilityCount) * 100)
      : 0;

    const topCompetitor = competitivePositioning.find(p => !p.isBusiness);

    const categoryBreakdown = [
      {
        category: 'General',
        yourVisibility: businessAvgVis,
        avgCompetitorVisibility: topCompetitor ? topCompetitor.visibility : 0,
        topCompetitor: topCompetitor?.brand || 'Unknown',
        topCompetitorVisibility: topCompetitor?.visibility || 0,
      },
    ];

    // Calculate query-level insights
    const queryInsights: QueryInsight[] = [];
    const headToHeadMap = new Map<string, { wins: number; losses: number; ties: number }>();
    const coOccurrenceMap = new Map<string, number>();
    let totalYourAppearances = 0;

    // Group executions by prompt to aggregate across platforms
    const executionsByPrompt = new Map<number, PromptExecution[]>();
    executions.forEach(exec => {
      const existing = executionsByPrompt.get(exec.prompt_id) || [];
      existing.push(exec);
      executionsByPrompt.set(exec.prompt_id, existing);
    });

    executionsByPrompt.forEach((promptExecs, promptId) => {
      // Calculate average visibility for this prompt across all executions
      let yourVisTotal = 0;
      let yourVisCount = 0;
      const competitorTotals = new Map<string, { total: number; count: number }>();
      let promptText = '';

      promptExecs.forEach(exec => {
        if (!promptText && exec.prompt_text) {
          promptText = exec.prompt_text;
        }

        // Your visibility
        if (exec.business_visibility !== undefined && exec.business_visibility !== null) {
          yourVisTotal += exec.business_visibility;
          yourVisCount++;
        }

        // Competitor visibilities
        if (exec.competitor_visibilities) {
          try {
            const compVis = JSON.parse(exec.competitor_visibilities);
            Object.entries(compVis).forEach(([compName, vis]) => {
              const existing = competitorTotals.get(compName) || { total: 0, count: 0 };
              existing.total += vis as number;
              existing.count++;
              competitorTotals.set(compName, existing);
            });
          } catch (e) {}
        }
      });

      const yourVisibility = yourVisCount > 0 ? yourVisTotal / yourVisCount : 0;
      const yourVisibilityPct = Math.round(yourVisibility * 100);

      // Find top competitor for this prompt
      let topCompName = '';
      let topCompVis = 0;
      competitorTotals.forEach((data, name) => {
        const avgVis = data.count > 0 ? data.total / data.count : 0;
        if (avgVis > topCompVis) {
          topCompVis = avgVis;
          topCompName = name;
        }
      });
      const topCompVisPct = Math.round(topCompVis * 100);

      // Determine outcome
      let outcome: 'win' | 'loss' | 'tie' | 'solo';
      if (competitorTotals.size === 0 || topCompVis === 0) {
        outcome = yourVisibility > 0 ? 'solo' : 'loss';
      } else if (yourVisibility > topCompVis + 0.05) {
        outcome = 'win';
      } else if (yourVisibility < topCompVis - 0.05) {
        outcome = 'loss';
      } else {
        outcome = 'tie';
      }

      // Track head-to-head for each competitor
      competitorTotals.forEach((data, compName) => {
        const compVis = data.count > 0 ? data.total / data.count : 0;
        const h2h = headToHeadMap.get(compName) || { wins: 0, losses: 0, ties: 0 };

        if (yourVisibility > compVis + 0.05) {
          h2h.wins++;
        } else if (yourVisibility < compVis - 0.05) {
          h2h.losses++;
        } else {
          h2h.ties++;
        }
        headToHeadMap.set(compName, h2h);

        // Track co-occurrence (both you and competitor mentioned)
        if (yourVisibility > 0 && compVis > 0) {
          coOccurrenceMap.set(compName, (coOccurrenceMap.get(compName) || 0) + 1);
        }
      });

      // Count your appearances
      if (yourVisibility > 0) {
        totalYourAppearances++;
      }

      queryInsights.push({
        promptId,
        promptText: promptText || `Prompt #${promptId}`,
        yourVisibility: yourVisibilityPct,
        topCompetitor: topCompName || 'None',
        topCompetitorVisibility: topCompVisPct,
        outcome,
        gap: yourVisibilityPct - topCompVisPct,
      });
    });

    // Sort and categorize query insights
    const strongestQueries = queryInsights
      .filter(q => q.outcome === 'win' || q.outcome === 'solo')
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 5);

    const weakestQueries = queryInsights
      .filter(q => q.outcome === 'loss')
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 5);

    const opportunityQueries = queryInsights
      .filter(q => q.yourVisibility === 0 && q.topCompetitorVisibility > 0)
      .sort((a, b) => b.topCompetitorVisibility - a.topCompetitorVisibility)
      .slice(0, 5);

    // Build head-to-head array
    const headToHead: HeadToHead[] = Array.from(headToHeadMap.entries())
      .map(([competitor, stats]) => ({
        competitor,
        wins: stats.wins,
        losses: stats.losses,
        ties: stats.ties,
        total: stats.wins + stats.losses + stats.ties,
        winRate: stats.wins + stats.losses + stats.ties > 0
          ? Math.round((stats.wins / (stats.wins + stats.losses + stats.ties)) * 100)
          : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Build co-occurrence array
    const coOccurrence: CoOccurrence[] = Array.from(coOccurrenceMap.entries())
      .map(([competitor, coAppearances]) => ({
        competitor,
        coAppearances,
        totalYourAppearances,
        coOccurrenceRate: totalYourAppearances > 0
          ? Math.round((coAppearances / totalYourAppearances) * 100)
          : 0,
      }))
      .sort((a, b) => b.coAppearances - a.coAppearances)
      .slice(0, 10);

    // ============================================
    // SOURCE BENCHMARKING
    // ============================================

    // Track sources by brand presence
    const sourceByBrandMap = new Map<string, {
      domain: string;
      type: string;
      totalAppearances: number;
      yourAppearances: number; // when you're mentioned
      competitorAppearances: number; // when competitor is mentioned
      competitorOnlyAppearances: number; // competitor mentioned but not you
    }>();

    // Track source type mix by brand
    const sourceMixByBrandMap = new Map<string, {
      editorial: number;
      ugc: number;
      corporate: number;
      competitor: number;
      reference: number;
      you: number;
      other: number;
      total: number;
    }>();

    // Initialize source mix for business
    sourceMixByBrandMap.set(businessName, {
      editorial: 0, ugc: 0, corporate: 0, competitor: 0, reference: 0, you: 0, other: 0, total: 0
    });

    // Initialize source mix for competitors
    competitors.forEach(c => {
      sourceMixByBrandMap.set(c.name, {
        editorial: 0, ugc: 0, corporate: 0, competitor: 0, reference: 0, you: 0, other: 0, total: 0
      });
    });

    // Process sources from executions
    executions.forEach(exec => {
      if (!exec.sources) return;

      try {
        const sources = JSON.parse(exec.sources);
        if (!Array.isArray(sources)) return;

        const brandMentioned = (exec.brand_mentions || 0) > 0;
        let competitorsMentioned: string[] = [];
        if (exec.competitors_mentioned) {
          try {
            competitorsMentioned = JSON.parse(exec.competitors_mentioned);
          } catch (e) {}
        }

        sources.forEach((source: any) => {
          if (!source.domain) return;

          const domain = source.domain;
          const type = (source.type || 'Other').toLowerCase();

          // Track source by brand presence
          let sourceData = sourceByBrandMap.get(domain);
          if (!sourceData) {
            sourceData = {
              domain,
              type: source.type || 'Other',
              totalAppearances: 0,
              yourAppearances: 0,
              competitorAppearances: 0,
              competitorOnlyAppearances: 0,
            };
            sourceByBrandMap.set(domain, sourceData);
          }

          sourceData.totalAppearances++;
          if (brandMentioned) {
            sourceData.yourAppearances++;
          }
          if (competitorsMentioned.length > 0) {
            sourceData.competitorAppearances++;
            if (!brandMentioned) {
              sourceData.competitorOnlyAppearances++;
            }
          }

          // Track source type mix when brand is mentioned
          if (brandMentioned) {
            const mix = sourceMixByBrandMap.get(businessName)!;
            mix.total++;
            if (type.includes('editorial')) mix.editorial++;
            else if (type.includes('ugc')) mix.ugc++;
            else if (type.includes('corporate')) mix.corporate++;
            else if (type.includes('competitor')) mix.competitor++;
            else if (type.includes('reference')) mix.reference++;
            else if (type.includes('you')) mix.you++;
            else mix.other++;
          }

          // Track source type mix for each competitor mentioned
          competitorsMentioned.forEach(compName => {
            const mix = sourceMixByBrandMap.get(compName);
            if (mix) {
              mix.total++;
              if (type.includes('editorial')) mix.editorial++;
              else if (type.includes('ugc')) mix.ugc++;
              else if (type.includes('corporate')) mix.corporate++;
              else if (type.includes('competitor')) mix.competitor++;
              else if (type.includes('reference')) mix.reference++;
              else if (type.includes('you')) mix.you++;
              else mix.other++;
            }
          });
        });
      } catch (e) {}
    });

    // Build source benchmark array
    const totalExecutions = executions.length;
    const sourceBenchmark: SourceBenchmark[] = Array.from(sourceByBrandMap.values())
      .map(s => ({
        domain: s.domain,
        type: s.type,
        totalAppearances: s.totalAppearances,
        yourAppearances: s.yourAppearances,
        competitorAppearances: s.competitorAppearances,
        yourPresenceRate: totalExecutions > 0 ? Math.round((s.yourAppearances / totalExecutions) * 100) : 0,
        competitorPresenceRate: totalExecutions > 0 ? Math.round((s.competitorAppearances / totalExecutions) * 100) : 0,
        gap: s.yourAppearances - s.competitorAppearances,
        isGapOpportunity: s.competitorOnlyAppearances > 0 && s.yourAppearances === 0,
      }))
      .sort((a, b) => b.totalAppearances - a.totalAppearances);

    // Gap opportunities: sources where competitors appear but you don't
    const sourceGapOpportunities = sourceBenchmark
      .filter(s => s.isGapOpportunity)
      .sort((a, b) => b.competitorAppearances - a.competitorAppearances)
      .slice(0, 20);

    // Sources where you lead
    const sourcesWhereYouLead = sourceBenchmark
      .filter(s => s.gap > 0 && s.yourAppearances > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 10);

    // Build source mix by brand array
    const sourceMixByBrand: SourceMixByBrand[] = Array.from(sourceMixByBrandMap.entries())
      .map(([brand, mix]) => ({
        brand,
        editorial: mix.total > 0 ? Math.round((mix.editorial / mix.total) * 100) : 0,
        ugc: mix.total > 0 ? Math.round((mix.ugc / mix.total) * 100) : 0,
        corporate: mix.total > 0 ? Math.round((mix.corporate / mix.total) * 100) : 0,
        competitor: mix.total > 0 ? Math.round((mix.competitor / mix.total) * 100) : 0,
        reference: mix.total > 0 ? Math.round((mix.reference / mix.total) * 100) : 0,
        you: mix.total > 0 ? Math.round((mix.you / mix.total) * 100) : 0,
        other: mix.total > 0 ? Math.round((mix.other / mix.total) * 100) : 0,
        totalSources: mix.total,
      }))
      .filter(m => m.totalSources > 0)
      .sort((a, b) => b.totalSources - a.totalSources);

    // ============================================
    // SCORECARD METRICS
    // ============================================

    const yourBrandData = competitivePositioning.find(p => p.isBusiness);
    const competitorData = competitivePositioning.filter(p => !p.isBusiness);
    const avgCompetitorVisibility = competitorData.length > 0
      ? Math.round(competitorData.reduce((sum, c) => sum + c.visibility, 0) / competitorData.length)
      : 0;

    const scorecard = {
      yourVisibility: yourBrandData?.visibility || 0,
      avgCompetitorVisibility,
      visibilityGap: (yourBrandData?.visibility || 0) - avgCompetitorVisibility,
      yourRank: competitivePositioning.findIndex(p => p.isBusiness) + 1,
      totalBrands: competitivePositioning.length,
      promptsWhereYouAppear: brandStats[businessName]?.mentionCount || 0,
      promptsWhereYouAppearPct: totalExecutions > 0
        ? Math.round(((brandStats[businessName]?.mentionCount || 0) / totalExecutions) * 100)
        : 0,
      totalPrompts: totalExecutions,
      sourcesWithYourPresence: sourceBenchmark.filter(s => s.yourAppearances > 0).length,
      sourcesWithCompetitorOnly: sourceGapOpportunities.length,
      topSourcesUsed: sourceBenchmark.slice(0, 5).map(s => s.domain),
      headToHeadWinRate: headToHead.length > 0
        ? Math.round(headToHead.reduce((sum, h) => sum + h.winRate, 0) / headToHead.length)
        : 0,
    };

    return NextResponse.json({
      modelVisibility,
      competitivePositioning,
      timeSeriesData,
      categoryBreakdown,
      platforms: platformsWithNames,
      // Query-level insights
      queryInsights: {
        strongest: strongestQueries,
        weakest: weakestQueries,
        opportunities: opportunityQueries,
      },
      headToHead,
      coOccurrence,
      // Source benchmarking
      sourceBenchmark: sourceBenchmark.slice(0, 30),
      sourceGapOpportunities,
      sourcesWhereYouLead,
      sourceMixByBrand,
      // Scorecard
      scorecard,
    });
  } catch (error) {
    console.error('Error fetching benchmark data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
