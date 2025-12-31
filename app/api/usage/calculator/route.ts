import { NextRequest, NextResponse } from 'next/server';
import db from '@/app/lib/db/database';
import { estimatePromptCost, getAllPricing, getModelPricing } from '@/app/lib/config/pricing';

interface AvgTokens {
  avg_input: number;
  avg_output: number;
}

interface AvgCostPerExecution {
  avg_cost: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  execution_count: number;
}

interface PlatformAvgCost {
  platform_id: string;
  avg_cost: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  execution_count: number;
}

// Map platform IDs to provider IDs for pricing lookup
const platformToProvider: Record<string, string> = {
  chatgpt: 'openai',
  claude: 'anthropic',
  gemini: 'google',
  perplexity: 'perplexity',
  grok: 'xai',
};

// All available platforms
const ALL_PLATFORMS = ['chatgpt', 'claude', 'gemini', 'perplexity', 'grok'];

/**
 * POST /api/usage/calculator - Calculate estimated costs for prompts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      businessId,
      promptCount = 10,
      platforms = ALL_PLATFORMS,
      configuredPlatforms = [], // User's currently configured platforms
      // Optional: use actual averages from user's data
      useActualAverages = true,
      // Include all platforms (for showing unconfigured ones too)
      includeAllPlatforms = false,
    } = body;

    // Default averages (typical for AI queries)
    let avgInputTokens = 500;
    let avgOutputTokens = 1500;
    let avgCostPerPrompt: number | null = null;
    let executionCount = 0;
    let dataSource: 'actual' | 'estimated' = 'estimated';
    const platformAvgCosts: Record<string, { avgCost: number; avgInput: number; avgOutput: number; count: number }> = {};

    // If businessId provided and useActualAverages, get actual average cost per prompt execution
    if (businessId && useActualAverages) {
      // Get average cost per execution (prompt), grouped by platform
      // This sums all API calls for each execution to get true cost per prompt
      const avgByPlatform = db.prepare(`
        SELECT
          bp.platform_id,
          AVG(exec_cost) as avg_cost,
          AVG(exec_input_tokens) as avg_input_tokens,
          AVG(exec_output_tokens) as avg_output_tokens,
          COUNT(*) as execution_count
        FROM (
          SELECT
            acl.platform_id,
            acl.execution_id,
            SUM(acl.estimated_cost_usd) as exec_cost,
            SUM(acl.prompt_tokens) as exec_input_tokens,
            SUM(acl.completion_tokens) as exec_output_tokens
          FROM api_call_logs acl
          WHERE acl.business_id = ? AND acl.execution_id IS NOT NULL
          GROUP BY acl.platform_id, acl.execution_id
        ) exec_totals
        JOIN business_platforms bp ON exec_totals.platform_id = bp.id
        GROUP BY bp.platform_id
      `).all(businessId) as PlatformAvgCost[];

      if (avgByPlatform && avgByPlatform.length > 0) {
        dataSource = 'actual';

        // Store per-platform averages
        for (const p of avgByPlatform) {
          platformAvgCosts[p.platform_id] = {
            avgCost: p.avg_cost,
            avgInput: Math.round(p.avg_input_tokens),
            avgOutput: Math.round(p.avg_output_tokens),
            count: p.execution_count,
          };
          executionCount += p.execution_count;
        }

        // Calculate overall averages (weighted by execution count)
        const totalInputWeighted = avgByPlatform.reduce((sum, p) => sum + (p.avg_input_tokens * p.execution_count), 0);
        const totalOutputWeighted = avgByPlatform.reduce((sum, p) => sum + (p.avg_output_tokens * p.execution_count), 0);
        const totalCostWeighted = avgByPlatform.reduce((sum, p) => sum + (p.avg_cost * p.execution_count), 0);

        avgInputTokens = Math.round(totalInputWeighted / executionCount);
        avgOutputTokens = Math.round(totalOutputWeighted / executionCount);
        avgCostPerPrompt = totalCostWeighted / executionCount;
      }
    }

    // Determine which platforms to calculate for
    const platformsToCalculate = includeAllPlatforms ? ALL_PLATFORMS : platforms;

    // Calculate estimates for each platform
    const estimates = platformsToCalculate.map((platformId: string) => {
      // Use provider ID for pricing lookup
      const providerId = platformToProvider[platformId] || platformId;
      const pricing = getModelPricing(providerId);

      // Use actual per-platform cost if available
      const actualPlatformData = platformAvgCosts[platformId];

      let perPrompt: number;
      let total: number;
      let inputTokensUsed = avgInputTokens;
      let outputTokensUsed = avgOutputTokens;
      let hasActualData = false;

      if (actualPlatformData && actualPlatformData.count > 0) {
        // Use actual average cost per prompt for this platform
        perPrompt = Math.round(actualPlatformData.avgCost * 10000) / 10000;
        total = Math.round(perPrompt * promptCount * 10000) / 10000;
        inputTokensUsed = actualPlatformData.avgInput;
        outputTokensUsed = actualPlatformData.avgOutput;
        hasActualData = true;
      } else {
        // Fall back to estimate based on token pricing (using provider ID)
        const estimate = estimatePromptCost(
          providerId,
          promptCount,
          avgInputTokens,
          avgOutputTokens
        );
        perPrompt = estimate.perPrompt;
        total = estimate.total;
      }

      // Check if this platform is configured
      const isConfigured = configuredPlatforms.includes(platformId);

      return {
        platformId,
        perPrompt,
        total,
        inputCost: Math.round(((inputTokensUsed / 1_000_000) * pricing.input * promptCount) * 10000) / 10000,
        outputCost: Math.round(((outputTokensUsed / 1_000_000) * pricing.output * promptCount) * 10000) / 10000,
        avgInputTokens: inputTokensUsed,
        avgOutputTokens: outputTokensUsed,
        executionCount: actualPlatformData?.count || 0,
        hasActualData,
        isConfigured,
        pricing: {
          inputPer1M: pricing.input,
          outputPer1M: pricing.output,
        },
      };
    });

    // Sort by total cost
    estimates.sort((a: { total: number }, b: { total: number }) => a.total - b.total);

    // Separate configured and unconfigured platforms
    const configuredEstimates = estimates.filter((e: { isConfigured: boolean }) => e.isConfigured);
    const unconfiguredEstimates = estimates.filter((e: { isConfigured: boolean }) => !e.isConfigured);

    // Calculate monthly estimate (assuming daily runs)
    const cheapest = estimates[0];
    const mostExpensive = estimates[estimates.length - 1];

    return NextResponse.json({
      input: {
        promptCount,
        avgInputTokens,
        avgOutputTokens,
        platforms: platformsToCalculate,
        dataSource,
        totalExecutions: executionCount,
      },
      estimates,
      configuredEstimates,
      unconfiguredEstimates,
      summary: {
        cheapestPlatform: cheapest?.platformId,
        cheapestCost: cheapest?.total,
        mostExpensivePlatform: mostExpensive?.platformId,
        mostExpensiveCost: mostExpensive?.total,
        potentialSavings: mostExpensive && cheapest
          ? Math.round((mostExpensive.total - cheapest.total) * 100) / 100
          : 0,
      },
      monthlyEstimates: {
        daily: estimates.map((e: { platformId: string; total: number }) => ({
          platformId: e.platformId,
          dailyCost: e.total,
          monthlyCost: Math.round(e.total * 30 * 100) / 100,
        })),
      },
    });

  } catch (error: any) {
    console.error('Error calculating costs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate costs' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/usage/calculator - Get pricing info for all platforms
 */
export async function GET() {
  try {
    const pricing = getAllPricing();

    // Also calculate example costs for standard prompt sizes
    const examples = {
      small: {
        description: 'Small prompt (100 input, 500 output tokens)',
        costs: Object.entries(pricing).map(([id, p]) => ({
          platformId: id,
          displayName: p.displayName,
          cost: Math.round(((100 / 1_000_000) * p.pricing.input + (500 / 1_000_000) * p.pricing.output) * 10000) / 10000,
        })).sort((a: { cost: number }, b: { cost: number }) => a.cost - b.cost),
      },
      medium: {
        description: 'Medium prompt (500 input, 1500 output tokens)',
        costs: Object.entries(pricing).map(([id, p]) => ({
          platformId: id,
          displayName: p.displayName,
          cost: Math.round(((500 / 1_000_000) * p.pricing.input + (1500 / 1_000_000) * p.pricing.output) * 10000) / 10000,
        })).sort((a: { cost: number }, b: { cost: number }) => a.cost - b.cost),
      },
      large: {
        description: 'Large prompt (2000 input, 4000 output tokens)',
        costs: Object.entries(pricing).map(([id, p]) => ({
          platformId: id,
          displayName: p.displayName,
          cost: Math.round(((2000 / 1_000_000) * p.pricing.input + (4000 / 1_000_000) * p.pricing.output) * 10000) / 10000,
        })).sort((a: { cost: number }, b: { cost: number }) => a.cost - b.cost),
      },
    };

    return NextResponse.json({
      pricing: Object.entries(pricing).map(([id, p]) => ({
        platformId: id,
        displayName: p.displayName,
        inputPer1M: p.pricing.input,
        outputPer1M: p.pricing.output,
        inputPer1K: Math.round((p.pricing.input / 1000) * 10000) / 10000,
        outputPer1K: Math.round((p.pricing.output / 1000) * 10000) / 10000,
      })),
      examples,
    });

  } catch (error: any) {
    console.error('Error getting pricing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get pricing' },
      { status: 500 }
    );
  }
}
