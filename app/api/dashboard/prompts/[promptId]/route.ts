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
  brand_mentions?: number;
  competitors_mentioned?: string;
  mention_analysis?: string;
  analysis_confidence?: number;
  business_visibility?: number;
  competitor_visibilities?: string;
  sources?: string;
}

interface VisibilityHistoryEntry {
  date: string;
  visibility: number;
  competitors?: Array<{ id: number; name: string; visibility: number }>;
}

/**
 * Calculate the average rank (brand position) from executions
 * Only considers executions where brand was actually mentioned
 */
function calculateAverageRank(executions: PromptExecution[]): number | null {
  const ranks: number[] = [];

  executions.forEach(exec => {
    // Only consider rank if the brand was actually mentioned
    if (exec.mention_analysis && (exec.brand_mentions || 0) > 0) {
      try {
        const analysis = JSON.parse(exec.mention_analysis);
        if (analysis.brandPosition !== null && analysis.brandPosition !== undefined && analysis.brandPosition > 0) {
          ranks.push(analysis.brandPosition);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
  });

  if (ranks.length === 0) {
    return null;
  }

  return Math.round(ranks.reduce((sum, r) => sum + r, 0) / ranks.length);
}

/**
 * Calculate visibility as percentage of responses where brand was mentioned
 */
function calculateVisibilityPercentage(executions: PromptExecution[]): number {
  if (executions.length === 0) return 0;
  const mentionedCount = executions.filter(exec => (exec.brand_mentions || 0) > 0).length;
  return Math.round((mentionedCount / executions.length) * 100);
}

function calculateVisibilityHistory(
  executions: PromptExecution[],
  competitors: any[]
): VisibilityHistoryEntry[] {
  // Group executions by date for daily chart values
  const dailyVisibility = new Map<string, {
    businessMentioned: number;
    businessTotal: number;
    competitorData: Map<string, { mentioned: number; total: number }>;
  }>();

  executions.forEach(exec => {
    let dateToUse: string | null = null;
    if (exec.refresh_date) {
      dateToUse = exec.refresh_date.split('T')[0];
    } else if (exec.completed_at) {
      dateToUse = exec.completed_at.split('T')[0];
    }

    if (!dateToUse) return;

    let dayData = dailyVisibility.get(dateToUse);
    if (!dayData) {
      dayData = {
        businessMentioned: 0,
        businessTotal: 0,
        competitorData: new Map()
      };
      // Initialize competitor data for this day
      competitors.forEach(comp => {
        dayData!.competitorData.set(comp.name, { mentioned: 0, total: 0 });
      });
      dailyVisibility.set(dateToUse, dayData);
    }

    // Track brand mention for this response
    dayData.businessTotal += 1;
    if ((exec.brand_mentions || 0) > 0) {
      dayData.businessMentioned += 1;
    }

    // Track competitor mentions for this response
    let competitorsMentioned: string[] = [];
    if (exec.competitors_mentioned) {
      try {
        competitorsMentioned = JSON.parse(exec.competitors_mentioned) as string[];
      } catch (e) {
        // Skip invalid JSON
      }
    }

    competitors.forEach(comp => {
      const compData = dayData!.competitorData.get(comp.name)!;
      compData.total += 1;
      if (competitorsMentioned.includes(comp.name)) {
        compData.mentioned += 1;
      }
    });
  });

  // Build visibility history with daily values
  const visibilityHistory: VisibilityHistoryEntry[] = [];
  dailyVisibility.forEach((data, date) => {
    const competitorAverages: Array<{ id: number; name: string; visibility: number }> = [];

    competitors.forEach(comp => {
      const compData = data.competitorData.get(comp.name);
      if (compData && compData.total > 0) {
        competitorAverages.push({
          id: comp.id,
          name: comp.name,
          visibility: (compData.mentioned / compData.total) * 100
        });
      } else {
        competitorAverages.push({
          id: comp.id,
          name: comp.name,
          visibility: 0
        });
      }
    });

    visibilityHistory.push({
      date,
      visibility: data.businessTotal > 0 ? (data.businessMentioned / data.businessTotal) * 100 : 0,
      competitors: competitorAverages
    });
  });

  // Sort by date (oldest first)
  visibilityHistory.sort((a, b) => a.date.localeCompare(b.date));

  return visibilityHistory;
}

/**
 * Calculate cumulative visibility metrics for the competitor rankings table
 */
function calculateCumulativeMetrics(
  executions: PromptExecution[],
  competitors: any[],
  businessName: string
): Array<{ name: string; visibility: number; isBrand: boolean; sentimentScore: number; averagePosition: number }> {
  const totalResponses = executions.length;
  if (totalResponses === 0) return [];

  // Calculate brand metrics
  const brandMentionedCount = executions.filter(e => (e.brand_mentions || 0) > 0).length;
  const brandVisibility = Math.round((brandMentionedCount / totalResponses) * 100);

  let brandSentimentSum = 0;
  let brandSentimentCount = 0;
  let brandPositionSum = 0;
  let brandPositionCount = 0;

  executions.forEach(exec => {
    if (exec.mention_analysis) {
      try {
        const analysis = JSON.parse(exec.mention_analysis);
        if (analysis.brandSentimentScore !== undefined && analysis.brandSentimentScore !== null) {
          brandSentimentSum += analysis.brandSentimentScore;
          brandSentimentCount++;
        }
        if (analysis.rankings && Array.isArray(analysis.rankings)) {
          const brandRanking = analysis.rankings.find((r: any) =>
            r.company && r.company.toLowerCase() === businessName.toLowerCase()
          );
          if (brandRanking && brandRanking.position) {
            brandPositionSum += brandRanking.position;
            brandPositionCount++;
          }
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
  });

  const metrics: Array<{ name: string; visibility: number; isBrand: boolean; sentimentScore: number; averagePosition: number }> = [
    {
      name: businessName,
      visibility: brandVisibility,
      isBrand: true,
      sentimentScore: brandSentimentCount > 0 ? Math.round(brandSentimentSum / brandSentimentCount) : 50,
      averagePosition: brandPositionCount > 0 ? Math.round((brandPositionSum / brandPositionCount) * 10) / 10 : 0
    }
  ];

  // Calculate competitor cumulative metrics
  competitors.forEach(comp => {
    let mentionedCount = 0;
    let sentimentSum = 0;
    let sentimentCount = 0;
    let positionSum = 0;
    let positionCount = 0;

    executions.forEach(exec => {
      if (exec.competitors_mentioned) {
        try {
          const mentioned = JSON.parse(exec.competitors_mentioned) as string[];
          if (mentioned.includes(comp.name)) {
            mentionedCount++;
          }
        } catch (e) {}
      }

      if (exec.mention_analysis) {
        try {
          const analysis = JSON.parse(exec.mention_analysis);
          if (analysis.competitorSentiments && Array.isArray(analysis.competitorSentiments)) {
            const compSentiment = analysis.competitorSentiments.find((cs: any) =>
              cs.name && cs.name.toLowerCase() === comp.name.toLowerCase()
            );
            if (compSentiment && compSentiment.sentimentScore !== undefined) {
              sentimentSum += compSentiment.sentimentScore;
              sentimentCount++;
            }
          }
          if (analysis.rankings && Array.isArray(analysis.rankings)) {
            const compRanking = analysis.rankings.find((r: any) =>
              r.company && r.company.toLowerCase() === comp.name.toLowerCase()
            );
            if (compRanking && compRanking.position) {
              positionSum += compRanking.position;
              positionCount++;
            }
          }
        } catch (e) {}
      }
    });

    metrics.push({
      name: comp.name,
      visibility: Math.round((mentionedCount / totalResponses) * 100),
      isBrand: false,
      sentimentScore: sentimentCount > 0 ? Math.round(sentimentSum / sentimentCount) : 50,
      averagePosition: positionCount > 0 ? Math.round((positionSum / positionCount) * 10) / 10 : 0
    });
  });

  return metrics;
}

export async function GET(
    request: NextRequest,
    { params }: { params: { promptId: string } }
) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const businessId = searchParams.get('businessId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const platformIdsParam = searchParams.get('platformIds');
        const promptId = parseInt(params.promptId);

        if (!businessId || !startDate || !endDate || isNaN(promptId)) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
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

        // Get business details for business name
        const business = dbHelpers.getBusiness.get(businessIdNum) as any;
        const businessName = business?.business_name || 'Your Brand';

        // Get prompt details
        const prompts = dbHelpers.getPromptsByBusiness.all(businessIdNum) as any[];
        const prompt = prompts.find((p: any) => p.id === promptId);

        if (!prompt) {
            return NextResponse.json(
                { error: 'Prompt not found' },
                { status: 404 }
            );
        }

        // Get competitors
        const competitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum) as any[];

        // Get executions for this prompt in date range
        // Extract just the date portion for SQL comparison (YYYY-MM-DD format)
        const startDateOnly = startDate.split('T')[0];
        const endDateOnly = endDate.split('T')[0];

        let executions = dbHelpers.getPromptsExecutionsByDateRange.all(
            businessIdNum,
            startDateOnly,
            endDateOnly
        ) as any[];

        // Filter by selected platforms if specified
        if (selectedPlatformIds && selectedPlatformIds.length > 0) {
            executions = executions.filter(e => selectedPlatformIds!.includes(e.platform_id));
        }

        // Filter executions for this specific prompt
        const promptExecutions = executions.filter(e => e.prompt_id === promptId);

        // Calculate visibility history (daily values for chart)
        const visibilityHistory = calculateVisibilityHistory(promptExecutions, competitors);

        // Calculate cumulative metrics for competitor rankings table
        const competitorRankings = calculateCumulativeMetrics(promptExecutions, competitors, businessName);

        // Calculate metrics using proper functions
        const visibility = calculateVisibilityPercentage(promptExecutions);
        const rank = calculateAverageRank(promptExecutions);

        // Format responses
        const responses = promptExecutions.map(exec => {
            let sources: Array<{ domain: string; url: string; type: string }> = [];
            if (exec.sources) {
                try {
                    sources = JSON.parse(exec.sources);
                } catch (e) {
                    // Skip invalid JSON
                }
            }

            // Extract sentiment data from mention_analysis
            let brandSentiment: string | null = null;
            let brandSentimentScore: number | null = null;
            let brandContext: string | null = null;
            let competitorSentiments: Array<{ name: string; sentiment: string; sentimentScore?: number; context?: string }> = [];
            if (exec.mention_analysis) {
                try {
                    const analysis = JSON.parse(exec.mention_analysis);
                    brandSentiment = analysis.brandSentiment || null;
                    brandSentimentScore = analysis.brandSentimentScore ?? null;
                    brandContext = analysis.brandContext || null;
                    competitorSentiments = analysis.competitorSentiments || [];
                } catch (e) {
                    // Skip invalid JSON
                }
            }

            return {
                executionId: exec.id,
                platformId: exec.platform_id,
                result: exec.result,
                completedAt: exec.completed_at,
                refreshDate: exec.refresh_date,
                brandMentions: exec.brand_mentions,
                brandSentiment,
                brandSentimentScore,
                brandContext,
                competitorsMentioned: exec.competitors_mentioned ? JSON.parse(exec.competitors_mentioned) : [],
                competitorSentiments,
                analysisConfidence: exec.analysis_confidence,
                businessVisibility: exec.business_visibility,
                sources,
            };
        });

        const promptData = {
            id: prompt.id,
            text: prompt.text,
            topicId: prompt.topic_id,
            isCustom: prompt.is_custom === 1,
            metrics: {
                visibility,
                rank,
            },
            responses,
            visibility_history: visibilityHistory,
            competitor_rankings: competitorRankings
        };

        return NextResponse.json({ prompt: promptData });
    } catch (error) {
        console.error('Error fetching prompt details:', error);
        return NextResponse.json(
            { error: 'Failed to fetch prompt details' },
            { status: 500 }
        );
    }
}