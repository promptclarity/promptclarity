import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers } from '@/app/lib/db/database';
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
  mention_analysis?: string;
  analysis_confidence?: number;
  business_visibility?: number;
  share_of_voice?: number;
  competitor_visibilities?: string;
  competitor_share_of_voice?: string;
  prompt_text?: string;
}

interface Competitor {
  id: number;
  name: string;
  website?: string;
}

interface DailyVisibility {
  date: string;
  business: number;
  competitors: Record<string, number>;
}

interface BrandRanking {
  id?: number;
  name: string;
  visibility: number;
  visibilityChange?: number; // Change from previous period (undefined if no previous data)
  sentiment: string;
  sentimentScore: number; // 0-100 scale (0=very negative, 50=neutral, 100=very positive)
  sentimentScoreChange?: number; // Change from previous period
  averagePosition: number;
  positionChange?: number; // Change from previous period (negative = improved)
  mentions: number;
  isBusiness?: boolean;
}

/**
 * GET /api/dashboard/overview
 * Aggregate data across all prompts and topics for overview dashboard
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

    // Get business info
    const business = dbHelpers.getBusiness.get(businessIdNum) as any;
    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Get all competitors
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

    // Parse selected platform IDs (if provided)
    let selectedPlatformIds: number[] | null = null;
    if (platformIdsParam) {
      selectedPlatformIds = platformIdsParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
    }

    // Get all executions in date range
    let executions: PromptExecution[];
    let previousPeriodExecutions: PromptExecution[] | null = null;
    let hasPreviousPeriod = false;

    if (startDate && endDate) {
      // Extract just the date portion for SQL comparison (YYYY-MM-DD format)
      const startDateOnly = startDate.split('T')[0];
      const endDateOnly = endDate.split('T')[0];

      executions = dbHelpers.getPromptsExecutionsByDateRange.all(
        businessIdNum,
        startDateOnly,
        endDateOnly
      ) as PromptExecution[];

      // Calculate previous period dates (same duration, immediately before)
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - periodDays + 1);

      const prevStartStr = prevStart.toISOString().split('T')[0];
      const prevEndStr = prevEnd.toISOString().split('T')[0];

      // Fetch previous period executions
      previousPeriodExecutions = dbHelpers.getPromptsExecutionsByDateRange.all(
        businessIdNum,
        prevStartStr,
        prevEndStr
      ) as PromptExecution[];

      hasPreviousPeriod = previousPeriodExecutions.length > 0;
    } else {
      // No date filter = all data, no previous period comparison
      executions = dbHelpers.getAllPromptsExecutions.all(businessIdNum) as PromptExecution[];
      hasPreviousPeriod = false;
    }

    // Filter by selected platforms if specified
    if (selectedPlatformIds && selectedPlatformIds.length > 0) {
      executions = executions.filter(e => selectedPlatformIds!.includes(e.platform_id));
      if (previousPeriodExecutions) {
        previousPeriodExecutions = previousPeriodExecutions.filter(e => selectedPlatformIds!.includes(e.platform_id));
        hasPreviousPeriod = previousPeriodExecutions.length > 0;
      }
    }

    // Calculate daily visibility for all brands
    const dailyVisibilityMap = new Map<string, {
      businessTotal: number;
      businessCount: number;
      totalExecutions: number;
      competitorMentions: Map<string, number>;
    }>();

    executions.forEach(exec => {
      const dateToUse = exec.refresh_date || (exec.completed_at ? exec.completed_at.split('T')[0] : null);
      if (!dateToUse) return;

      let dayData = dailyVisibilityMap.get(dateToUse);
      if (!dayData) {
        dayData = {
          businessTotal: 0,
          businessCount: 0,
          totalExecutions: 0,
          competitorMentions: new Map()
        };
        dailyVisibilityMap.set(dateToUse, dayData);
      }

      // Count total executions for this day
      dayData.totalExecutions += 1;

      // Process business visibility
      if (exec.business_visibility !== undefined) {
        dayData.businessTotal += exec.business_visibility;
        dayData.businessCount += 1;
      }

      // Process competitor visibilities - count mentions (visibility = 1)
      if (exec.competitor_visibilities) {
        try {
          const competitorVis = JSON.parse(exec.competitor_visibilities);
          Object.entries(competitorVis).forEach(([compName, visibility]) => {
            if (visibility === 1) {
              const currentMentions = dayData.competitorMentions.get(compName) || 0;
              dayData.competitorMentions.set(compName, currentMentions + 1);
            }
          });
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });

    // Get set of active competitor names for filtering
    const activeCompetitorNames = new Set(competitors.map(c => c.name));

    // Format daily visibility - include all active competitors (0% if not mentioned)
    const dailyVisibility: DailyVisibility[] = [];
    dailyVisibilityMap.forEach((data, date) => {
      const competitorsData: Record<string, number> = {};

      // Initialize all active competitors with 0%
      activeCompetitorNames.forEach(compName => {
        competitorsData[compName] = 0;
      });

      // Calculate visibility as mentions / total executions for the day
      data.competitorMentions.forEach((mentions, compName) => {
        // Only include competitors that are currently active
        if (activeCompetitorNames.has(compName)) {
          competitorsData[compName] = data.totalExecutions > 0
            ? Math.round((mentions / data.totalExecutions) * 1000) / 10
            : 0;
        }
      });

      dailyVisibility.push({
        date,
        business: data.businessCount > 0 ? (data.businessTotal / data.businessCount) * 100 : 0,
        competitors: competitorsData
      });
    });

    // Sort by date
    dailyVisibility.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate overall brand rankings
    const brandRankings: BrandRanking[] = [];

    // Calculate previous period metrics for comparison
    let prevBusinessVisibility: number | null = null;
    let prevBusinessSentimentScore: number | null = null;
    let prevBusinessPosition: number | null = null;
    const prevCompetitorVisibilities: Map<string, number> = new Map();
    const prevCompetitorSentimentScores: Map<string, number> = new Map();
    const prevCompetitorPositions: Map<string, number> = new Map();

    if (hasPreviousPeriod && previousPeriodExecutions && previousPeriodExecutions.length > 0) {
      // Previous business visibility
      prevBusinessVisibility = (previousPeriodExecutions.filter(e => e.business_visibility === 1).length / previousPeriodExecutions.length) * 100;

      // Previous business sentiment and position
      const prevBusinessPositions: number[] = [];
      const prevBusinessSentimentScores: number[] = [];
      previousPeriodExecutions.forEach(exec => {
        if (exec.mention_analysis) {
          try {
            const analysis = JSON.parse(exec.mention_analysis);
            if (analysis.brandMentioned && analysis.brandPosition) {
              prevBusinessPositions.push(analysis.brandPosition);
            }
            if (analysis.sentimentScore !== undefined) {
              prevBusinessSentimentScores.push(analysis.sentimentScore);
            }
          } catch (e) {
            // Skip
          }
        }
      });
      if (prevBusinessSentimentScores.length > 0) {
        prevBusinessSentimentScore = Math.round(prevBusinessSentimentScores.reduce((a, b) => a + b, 0) / prevBusinessSentimentScores.length);
      }
      if (prevBusinessPositions.length > 0) {
        prevBusinessPosition = Math.round(prevBusinessPositions.reduce((a, b) => a + b, 0) / prevBusinessPositions.length);
      }

      // Previous competitor metrics
      competitors.forEach(competitor => {
        let prevMentions = 0;
        const prevPositions: number[] = [];
        const prevSentimentScores: number[] = [];

        previousPeriodExecutions!.forEach(exec => {
          if (exec.competitor_visibilities) {
            try {
              const compVis = JSON.parse(exec.competitor_visibilities);
              if (compVis[competitor.name] === 1) {
                prevMentions++;
              }
            } catch (e) {
              // Skip
            }
          }

          // Extract positions and sentiment from analysis
          if (exec.mention_analysis) {
            try {
              const analysis = JSON.parse(exec.mention_analysis);
              if (analysis.rankings && Array.isArray(analysis.rankings)) {
                const ranking = analysis.rankings.find((r: any) =>
                  r.company && r.company.toLowerCase() === competitor.name.toLowerCase()
                );
                if (ranking) {
                  if (ranking.position) prevPositions.push(ranking.position);
                  if (ranking.sentimentScore !== undefined) prevSentimentScores.push(ranking.sentimentScore);
                }
              }
            } catch (e) {
              // Skip
            }
          }
        });

        const prevVisibility = (prevMentions / previousPeriodExecutions!.length) * 100;
        prevCompetitorVisibilities.set(competitor.name, prevVisibility);

        if (prevSentimentScores.length > 0) {
          prevCompetitorSentimentScores.set(
            competitor.name,
            Math.round(prevSentimentScores.reduce((a, b) => a + b, 0) / prevSentimentScores.length)
          );
        }
        if (prevPositions.length > 0) {
          prevCompetitorPositions.set(
            competitor.name,
            Math.round(prevPositions.reduce((a, b) => a + b, 0) / prevPositions.length)
          );
        }
      });
    }

    // Calculate business ranking
    const businessMentions = executions.filter(e => (e.brand_mentions || 0) > 0).length;
    const businessVisibility = executions.length > 0
      ? (executions.filter(e => e.business_visibility === 1).length / executions.length) * 100
      : 0;

    // Extract positions and sentiment for business
    const businessPositions: number[] = [];
    const businessSentiments: string[] = [];
    const businessSentimentScores: number[] = [];

    executions.forEach(exec => {
      if (exec.mention_analysis) {
        try {
          const analysis = JSON.parse(exec.mention_analysis);
          if (analysis.brandMentioned && analysis.brandPosition) {
            businessPositions.push(analysis.brandPosition);
          }
          // Use brand-specific sentiment if available, otherwise fall back to overall sentiment
          if (analysis.brandSentiment) {
            businessSentiments.push(analysis.brandSentiment);
            // Use actual brandSentimentScore if available, otherwise convert sentiment word to score
            if (analysis.brandSentimentScore !== undefined && analysis.brandSentimentScore !== null) {
              businessSentimentScores.push(analysis.brandSentimentScore);
            } else {
              // Fall back to converting sentiment word to score: positive=80, neutral=50, negative=20
              const sentimentToScore = { positive: 80, neutral: 50, negative: 20 };
              businessSentimentScores.push(sentimentToScore[analysis.brandSentiment as keyof typeof sentimentToScore] || 50);
            }
          } else if (analysis.overallSentiment) {
            // Fall back to overall sentiment for older executions
            businessSentiments.push(analysis.overallSentiment);
            if (analysis.sentimentScore !== undefined) {
              businessSentimentScores.push(analysis.sentimentScore);
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });

    const avgBusinessPosition = businessPositions.length > 0
      ? Math.round(businessPositions.reduce((a, b) => a + b, 0) / businessPositions.length)
      : 0;

    // Determine overall sentiment (most common across all responses in date range)
    const businessSentiment = getMostCommonSentiment(businessSentiments);

    // Calculate average sentiment score across all responses (default to 50 if no scores)
    const avgBusinessSentimentScore = businessSentimentScores.length > 0
      ? Math.round(businessSentimentScores.reduce((a, b) => a + b, 0) / businessSentimentScores.length)
      : 50;

    // Calculate business changes from previous period
    const businessVisibilityChange = prevBusinessVisibility !== null
      ? Math.round((businessVisibility - prevBusinessVisibility) * 10) / 10
      : undefined;

    const businessSentimentScoreChange = prevBusinessSentimentScore !== null
      ? avgBusinessSentimentScore - prevBusinessSentimentScore
      : undefined;

    const businessPositionChange = prevBusinessPosition !== null && avgBusinessPosition > 0
      ? avgBusinessPosition - prevBusinessPosition
      : undefined;

    brandRankings.push({
      name: business.business_name,
      visibility: Math.round(businessVisibility * 10) / 10,
      visibilityChange: businessVisibilityChange,
      sentiment: businessSentiment,
      sentimentScore: avgBusinessSentimentScore,
      sentimentScoreChange: businessSentimentScoreChange,
      averagePosition: avgBusinessPosition,
      positionChange: businessPositionChange,
      mentions: businessMentions,
      isBusiness: true
    });

    // Calculate competitor rankings
    const totalExecutions = executions.length;

    competitors.forEach(competitor => {
      let mentions = 0;
      const positions: number[] = [];
      const sentiments: string[] = [];
      const sentimentScores: number[] = [];

      executions.forEach(exec => {
        // Check mentions (visibility = 1 means mentioned)
        if (exec.competitor_visibilities) {
          try {
            const compVis = JSON.parse(exec.competitor_visibilities);
            if (compVis[competitor.name] === 1) {
              mentions++;
            }
          } catch (e) {
            // Skip
          }
        }

        // Extract positions and sentiment from analysis
        if (exec.mention_analysis) {
          try {
            const analysis = JSON.parse(exec.mention_analysis);

            // First try to get sentiment from competitorSentiments (new field)
            if (analysis.competitorSentiments && Array.isArray(analysis.competitorSentiments)) {
              const compSentiment = analysis.competitorSentiments.find((cs: any) =>
                cs.name && cs.name.toLowerCase() === competitor.name.toLowerCase()
              );
              if (compSentiment && compSentiment.sentiment) {
                sentiments.push(compSentiment.sentiment);
                // Use actual sentimentScore if available, otherwise convert sentiment word to score
                if (compSentiment.sentimentScore !== undefined && compSentiment.sentimentScore !== null) {
                  sentimentScores.push(compSentiment.sentimentScore);
                } else {
                  // Fall back to converting sentiment word to score: positive=80, neutral=50, negative=20
                  const sentimentToScore = { positive: 80, neutral: 50, negative: 20 };
                  sentimentScores.push(sentimentToScore[compSentiment.sentiment as keyof typeof sentimentToScore] || 50);
                }
              }
            }

            // Get position from rankings and fall back to rankings sentiment if no competitorSentiments
            if (analysis.rankings && Array.isArray(analysis.rankings)) {
              const ranking = analysis.rankings.find((r: any) =>
                r.company && r.company.toLowerCase() === competitor.name.toLowerCase()
              );
              if (ranking) {
                if (ranking.position) positions.push(ranking.position);
                // Fall back to ranking sentiment if we didn't get one from competitorSentiments
                if (sentiments.length === 0 || !analysis.competitorSentiments) {
                  if (ranking.sentiment) sentiments.push(ranking.sentiment);
                  if (ranking.sentimentScore !== undefined) {
                    sentimentScores.push(ranking.sentimentScore);
                  }
                }
              }
            }
          } catch (e) {
            // Skip
          }
        }
      });

      // Visibility = mentions / total executions (percentage of responses mentioning this competitor)
      const visibility = totalExecutions > 0
        ? Math.round((mentions / totalExecutions) * 1000) / 10
        : 0;

      const avgPosition = positions.length > 0
        ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length)
        : 0;

      // Get most common sentiment across all responses in date range
      const sentiment = getMostCommonSentiment(sentiments);

      // Calculate average sentiment score across all responses (default to 50 if no scores)
      const avgSentimentScore = sentimentScores.length > 0
        ? Math.round(sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length)
        : 50;

      // Calculate changes from previous period
      const prevVisibility = prevCompetitorVisibilities.get(competitor.name);
      const visibilityChange = prevVisibility !== undefined
        ? Math.round((visibility - prevVisibility) * 10) / 10
        : undefined;

      const prevSentimentScore = prevCompetitorSentimentScores.get(competitor.name);
      const sentimentScoreChange = prevSentimentScore !== undefined
        ? avgSentimentScore - prevSentimentScore
        : undefined;

      const prevPosition = prevCompetitorPositions.get(competitor.name);
      const positionChange = prevPosition !== undefined && avgPosition > 0
        ? avgPosition - prevPosition
        : undefined;

      brandRankings.push({
        id: competitor.id,
        name: competitor.name,
        visibility,
        visibilityChange,
        sentiment,
        sentimentScore: avgSentimentScore,
        sentimentScoreChange,
        averagePosition: avgPosition,
        positionChange,
        mentions,
        isBusiness: false
      });
    });

    // Sort by visibility (descending)
    brandRankings.sort((a, b) => b.visibility - a.visibility);

    // Get recent executions (last 20)
    const recentExecutions = executions
      .filter(e => e.result)
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 20)
      .map(exec => {
        const mentionedBrands: string[] = [];

        // Add business if mentioned
        if (exec.brand_mentions && exec.brand_mentions > 0) {
          mentionedBrands.push(business.business_name);
        }

        // Add competitors
        if (exec.competitors_mentioned) {
          try {
            const mentioned = JSON.parse(exec.competitors_mentioned);
            mentionedBrands.push(...mentioned);
          } catch (e) {
            // Skip
          }
        }

        // Extract sources
        const sources: Array<{ domain: string; type: string; url?: string }> = [];
        const sourcesRaw = (exec as any).sources;
        if (sourcesRaw) {
          try {
            const parsedSources = JSON.parse(sourcesRaw);
            if (Array.isArray(parsedSources)) {
              sources.push(...parsedSources.slice(0, 5)); // Top 5 sources per response
            }
          } catch (e) {
            // Skip
          }
        }

        // Truncate prompt text to 45 characters
        const promptText = exec.prompt_text || '';
        const truncatedPrompt = promptText.length > 45
          ? promptText.substring(0, 45) + '...'
          : promptText;

        return {
          id: exec.id,
          promptId: exec.prompt_id,
          platformId: exec.platform_id,
          promptText: truncatedPrompt,
          result: exec.result.substring(0, 200) + (exec.result.length > 200 ? '...' : ''),
          completedAt: exec.completed_at,
          mentionedBrands,
          sources
        };
      });

    // Get available date range
    const availableDates = dailyVisibility.map(d => d.date);
    const dateRangeInfo = {
      earliest: availableDates.length > 0 ? availableDates[0] : null,
      latest: availableDates.length > 0 ? availableDates[availableDates.length - 1] : null,
      totalDays: availableDates.length
    };

    // Calculate top sources
    const sourceMap = new Map<string, {
      domain: string;
      totalCitations: number;
      responsesAppearedIn: Set<number>;
      type: string;
      urls: string[];
    }>();

    executions.forEach(exec => {
      // Get sources field from execution (stored as JSON)
      const sourcesRaw = (exec as any).sources;
      if (sourcesRaw) {
        try {
          const sources = JSON.parse(sourcesRaw);
          if (Array.isArray(sources)) {
            sources.forEach((source: any) => {
              if (source.domain) {
                // Count each source entry as 1 citation (consistent with other pages)
                const existing = sourceMap.get(source.domain);
                if (existing) {
                  existing.totalCitations += 1;
                  existing.responsesAppearedIn.add(exec.id);
                  if (source.url && !existing.urls.includes(source.url)) {
                    existing.urls.push(source.url);
                  }
                } else {
                  sourceMap.set(source.domain, {
                    domain: source.domain,
                    totalCitations: 1,
                    responsesAppearedIn: new Set([exec.id]),
                    type: source.type || 'Other',
                    urls: source.url ? [source.url] : []
                  });
                }
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });

    // Calculate usage as citations per response (can exceed 100% if cited multiple times)
    const totalResponses = executions.length;
    const allSources = Array.from(sourceMap.values())
      .map(source => {
        const responsesUsed = source.responsesAppearedIn.size;
        const avgCitationsPerChat = responsesUsed > 0
          ? Math.round((source.totalCitations / responsesUsed) * 10) / 10
          : 0;
        return {
          domain: source.domain,
          percentage: totalResponses > 0
            ? Math.round((source.totalCitations / totalResponses) * 1000) / 10
            : 0,
          count: source.totalCitations,
          avgCitations: avgCitationsPerChat,
          type: source.type
        };
      })
      .sort((a, b) => b.count - a.count);

    const totalSourcesCount = allSources.length;
    const topSources = allSources.slice(0, 20); // Top 20 sources for display

    // Aggregate source type breakdown for pie chart (from ALL sources, not just top 20)
    const sourceTypeBreakdown: Record<string, number> = {};
    allSources.forEach(source => {
      const type = source.type || 'Other';
      sourceTypeBreakdown[type] = (sourceTypeBreakdown[type] || 0) + source.count;
    });

    // Calculate model-by-model visibility breakdown
    const modelVisibility: Record<string, {
      platformId: number;
      platformName: string;
      businessVisibility: number;
      competitorVisibilities: Record<string, number>;
      executionCount: number;
    }> = {};

    platformsWithNames.forEach(platform => {
      const platformExecutions = executions.filter(e => e.platform_id === platform.id);
      if (platformExecutions.length === 0) return;

      const businessVis = platformExecutions.filter(e => e.business_visibility === 1).length / platformExecutions.length * 100;

      const competitorVis: Record<string, { total: number; count: number }> = {};
      platformExecutions.forEach(exec => {
        if (exec.competitor_visibilities) {
          try {
            const cv = JSON.parse(exec.competitor_visibilities);
            Object.entries(cv).forEach(([name, vis]) => {
              // Only include active competitors
              if (!activeCompetitorNames.has(name)) return;
              if (!competitorVis[name]) {
                competitorVis[name] = { total: 0, count: 0 };
              }
              competitorVis[name].total += vis as number;
              competitorVis[name].count += 1;
            });
          } catch (e) {}
        }
      });

      const competitorVisibilities: Record<string, number> = {};
      Object.entries(competitorVis).forEach(([name, data]) => {
        competitorVisibilities[name] = data.count > 0 ? Math.round(data.total / data.count * 1000) / 10 : 0;
      });

      modelVisibility[platform.platformId] = {
        platformId: platform.id,
        platformName: platform.name,
        businessVisibility: Math.round(businessVis * 10) / 10,
        competitorVisibilities,
        executionCount: platformExecutions.length
      };
    });

    // Calculate competitive positioning (dominate/competitive/invisible)
    const competitivePositioning = brandRankings.map(brand => {
      const isBusiness = brand.name === business.business_name;
      const businessRanking = brandRankings.find(b => b.name === business.business_name);
      const businessVis = businessRanking?.visibility || 0;

      let status: 'dominate' | 'competitive' | 'weak' | 'invisible';
      let gap: number;

      if (isBusiness) {
        // For business, compare against top competitor
        const topCompetitor = brandRankings.find(b => b.name !== business.business_name);
        gap = topCompetitor ? businessVis - topCompetitor.visibility : businessVis;

        if (businessVis >= 50 && gap > 10) {
          status = 'dominate';
        } else if (businessVis >= 25) {
          status = 'competitive';
        } else if (businessVis > 0) {
          status = 'weak';
        } else {
          status = 'invisible';
        }
      } else {
        // For competitors, compare against business
        gap = brand.visibility - businessVis;

        if (brand.visibility >= 50 && gap > 10) {
          status = 'dominate';
        } else if (brand.visibility >= 25) {
          status = 'competitive';
        } else if (brand.visibility > 0) {
          status = 'weak';
        } else {
          status = 'invisible';
        }
      }

      return {
        name: brand.name,
        visibility: brand.visibility,
        sentiment: brand.sentiment,
        position: brand.averagePosition,
        status,
        gap: Math.round(gap * 10) / 10,
        isBusiness
      };
    });

    return NextResponse.json({
      success: true,
      business: {
        id: business.id,
        name: business.business_name
      },
      platforms: platformsWithNames,
      dailyVisibility,
      brandRankings,
      recentExecutions,
      topSources,
      totalSourcesCount,
      sourceTypeBreakdown,
      dateRangeInfo,
      totalExecutions: executions.length,
      modelVisibility,
      competitivePositioning
    });

  } catch (error: any) {
    console.error('[Overview API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper: Get most common sentiment from array
 */
function getMostCommonSentiment(sentiments: string[]): string {
  if (sentiments.length === 0) return 'neutral';

  const counts: Record<string, number> = {};
  sentiments.forEach(s => {
    const sentiment = s.toLowerCase();
    counts[sentiment] = (counts[sentiment] || 0) + 1;
  });

  let maxCount = 0;
  let mostCommon = 'neutral';
  Object.entries(counts).forEach(([sentiment, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = sentiment;
    }
  });

  return mostCommon;
}
