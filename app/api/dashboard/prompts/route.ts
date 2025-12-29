import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { promptExecutionService } from '@/app/lib/services/prompt-execution.service';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

interface Topic {
  id: number;
  business_id: number;
  name: string;
  is_custom: number;
  created_at: string;
}

interface Prompt {
  id: number;
  business_id: number;
  topic_id: number;
  text: string;
  is_custom: number;
  is_priority: number;
  created_at: string;
  topic_name?: string;
}

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
  competitor_share_of_voice?: string;
  competitor_visibilities?: string;
}

/**
 * Calculate the average rank (brand position) from executions
 * Returns null if no rank data available
 */
function calculateAverageRank(executions: PromptExecution[]): number | null {
  const ranks: number[] = [];

  executions.forEach(exec => {
    // Only consider rank if the brand was actually mentioned
    if (exec.mention_analysis && (exec.brand_mentions || 0) > 0) {
      try {
        const analysis = JSON.parse(exec.mention_analysis);
        // brandPosition comes from the analysis
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

  // Return the average rank rounded to nearest integer
  return Math.round(ranks.reduce((sum, r) => sum + r, 0) / ranks.length);
}

/**
 * Calculate visibility as percentage of responses where brand was mentioned
 * Visibility = (responses with brand mention / total responses) * 100
 */
function calculateVisibilityPercentage(executions: PromptExecution[]): number {
  if (executions.length === 0) return 0;

  const mentionedCount = executions.filter(exec => (exec.brand_mentions || 0) > 0).length;
  return Math.round((mentionedCount / executions.length) * 100);
}

interface VisibilityHistoryEntry {
  date: string;
  visibility: number;
  competitors?: Array<{
    id: number;
    name: string;
    visibility: number;
  }>;
}

interface Competitor {
  id: number;
  name: string;
}

/**
 * Calculate daily visibility history for a prompt including competitors
 * Groups executions by refresh_date and calculates average visibility
 */
function calculateVisibilityHistory(executions: PromptExecution[], competitors: Competitor[]): VisibilityHistoryEntry[] {
  // Group executions by refresh_date
  const dailyVisibility = new Map<string, {
    businessTotal: number;
    businessCount: number;
    competitorData: Map<string, { total: number; count: number }>;
  }>();

  executions.forEach(exec => {
    // Use refresh_date if available, fallback to completed_at date
    const dateToUse = exec.refresh_date || (exec.completed_at ? exec.completed_at.split('T')[0] : null);

    if (!dateToUse) return;

    let dayData = dailyVisibility.get(dateToUse);
    if (!dayData) {
      dayData = {
        businessTotal: 0,
        businessCount: 0,
        competitorData: new Map()
      };
      dailyVisibility.set(dateToUse, dayData);
    }

    // Process business visibility
    if (exec.business_visibility !== undefined) {
      dayData.businessTotal += exec.business_visibility;
      dayData.businessCount += 1;
    }

    // Process competitor visibilities
    if (exec.competitor_visibilities) {
      try {
        const competitorVis = JSON.parse(exec.competitor_visibilities);
        Object.entries(competitorVis).forEach(([compName, visibility]) => {
          const compData = dayData.competitorData.get(compName) || { total: 0, count: 0 };
          compData.total += visibility as number;
          compData.count += 1;
          dayData.competitorData.set(compName, compData);
        });
      } catch (e) {
        // Skip invalid JSON
      }
    }
  });

  // Calculate average visibility per day
  const visibilityHistory: VisibilityHistoryEntry[] = [];
  dailyVisibility.forEach((data, date) => {
    // Calculate competitor averages
    const competitorAverages: Array<{ id: number; name: string; visibility: number }> = [];

    competitors.forEach(comp => {
      const compData = data.competitorData.get(comp.name);
      if (compData && compData.count > 0) {
        competitorAverages.push({
          id: comp.id,
          name: comp.name,
          visibility: compData.total / compData.count
        });
      } else {
        // Include competitor with 0 visibility if no data
        competitorAverages.push({
          id: comp.id,
          name: comp.name,
          visibility: 0
        });
      }
    });

    visibilityHistory.push({
      date,
      visibility: data.businessCount > 0 ? data.businessTotal / data.businessCount : 0,
      competitors: competitorAverages
    });
  });

  // Sort by date (oldest first)
  visibilityHistory.sort((a, b) => a.date.localeCompare(b.date));

  return visibilityHistory;
}


// GET /api/dashboard/prompts?businessId=123&startDate=2024-01-01&endDate=2024-01-31
// Fetch all topics and prompts for a business within a date range
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

    // Get all topics for the business
    const topics = dbHelpers.getTopicsByBusiness.all(businessIdNum) as Topic[];

    // Get all prompts for the business
    const prompts = dbHelpers.getPromptsByBusiness.all(businessIdNum) as Prompt[];

    // Get all competitors for the business
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum) as Competitor[];

    // Get execution results based on date range
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
      // Fallback to all executions if no date range provided
      executions = dbHelpers.getAllPromptsExecutions.all(
        businessIdNum
      ) as PromptExecution[];
    }

    // Filter by selected platforms if specified
    if (selectedPlatformIds && selectedPlatformIds.length > 0) {
      executions = executions.filter(e => selectedPlatformIds!.includes(e.platform_id));
    }

    // Create a map for quick lookup - group executions by prompt
    const executionsByPrompt = new Map<number, PromptExecution[]>();
    executions.forEach(exec => {
      const promptExecs = executionsByPrompt.get(exec.prompt_id) || [];
      promptExecs.push(exec);
      executionsByPrompt.set(exec.prompt_id, promptExecs);
    });
    
    // Group prompts by topic and add metrics and execution data
    const topicsWithPrompts = topics.map((topic: Topic) => {
      const topicPrompts = prompts.filter((prompt: Prompt) => prompt.topic_id === topic.id);
      
      // Calculate prompts with their metrics
      const promptsWithMetrics = topicPrompts.map((prompt: Prompt) => {
        const promptExecutions = executionsByPrompt.get(prompt.id) || [];

        // Calculate visibility history for this prompt
        const visibilityHistory = calculateVisibilityHistory(promptExecutions, competitors);

        // Calculate visibility as % of responses where brand was mentioned
        const visibility = calculateVisibilityPercentage(promptExecutions);

        // Calculate average rank from brandPosition in analysis
        const rank = calculateAverageRank(promptExecutions);

        return {
          id: prompt.id,
          text: prompt.text,
          topicId: prompt.topic_id,
          isCustom: Boolean(prompt.is_custom),
          isPriority: Boolean(prompt.is_priority),
          metrics: {
            visibility,
            rank, // null if no rank data, otherwise average position
          },
          visibility_history: visibilityHistory,
          responses: promptExecutions.map(exec => ({
            executionId: exec.id,
            platformId: exec.platform_id,
            result: exec.result,
            completedAt: exec.completed_at,
            refreshDate: exec.refresh_date,
            brandMentions: exec.brand_mentions || 0,
            competitorsMentioned: exec.competitors_mentioned ? JSON.parse(exec.competitors_mentioned) : [],
            analysisConfidence: exec.analysis_confidence || 0,
            businessVisibility: exec.business_visibility,
          }))
        };
      });

      // Calculate topic-level metrics as average of all prompts
      const topicVisibility = promptsWithMetrics.length > 0
        ? Math.round(promptsWithMetrics.reduce((sum, p) => sum + p.metrics.visibility, 0) / promptsWithMetrics.length)
        : 0;

      // Calculate average rank for topic (only from prompts that have rank data)
      const promptsWithRank = promptsWithMetrics.filter(p => p.metrics.rank !== null);
      const topicRank = promptsWithRank.length > 0
        ? Math.round(promptsWithRank.reduce((sum, p) => sum + (p.metrics.rank || 0), 0) / promptsWithRank.length)
        : null;

      return {
        id: topic.id,
        name: topic.name,
        isCustom: Boolean(topic.is_custom),
        metrics: {
          visibility: topicVisibility,
          rank: topicRank,
        },
        prompts: promptsWithMetrics
      };
    });

    return NextResponse.json({ 
      topics: topicsWithPrompts
    });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/dashboard/prompts
// Create a new prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, topicId, promptText } = body;
    
    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }
    
    if (!topicId || !promptText) {
      return NextResponse.json(
        { error: 'Topic ID and prompt text are required' },
        { status: 400 }
      );
    }

    // Add the new prompt to the database
    const result = dbHelpers.createPrompt.run({
      businessId: parseInt(businessId),
      topicId: parseInt(topicId),
      text: promptText.trim(),
      isCustom: 1,
      funnelStage: null,
      persona: null,
      tags: null,
      topicCluster: null
    });

    const promptId = result.lastInsertRowid as number;

    // Execute the new prompt against all models asynchronously
    promptExecutionService.executeSinglePrompt(parseInt(businessId), promptId)
      .then(() => {
        console.log(`[Prompts API] Successfully started execution for prompt ${promptId}`);
      })
      .catch((error) => {
        console.error(`[Prompts API] Failed to execute prompt ${promptId}:`, error);
      });

    return NextResponse.json({ 
      success: true,
      promptId,
      message: 'Prompt added successfully'
    }, { status: 201 }); // 201 Created
  } catch (error) {
    console.error('Error creating prompt:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/dashboard/prompts?promptId=123&businessId=456
// Delete a prompt and clean up orphaned topics
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const promptId = searchParams.get('promptId');
    const businessId = searchParams.get('businessId');

    if (!promptId || !businessId) {
      return NextResponse.json(
        { error: 'Prompt ID and Business ID are required' },
        { status: 400 }
      );
    }

    // Delete the prompt
    dbHelpers.deletePrompt.run(parseInt(promptId));

    // Clean up any topics that no longer have prompts
    dbHelpers.deleteOrphanedTopics.run(parseInt(businessId));

    return NextResponse.json({
      success: true,
      message: 'Prompt deleted'
    });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}