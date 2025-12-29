import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';

interface OpenAIUsageResponse {
  object: string;
  data: Array<{
    aggregation_timestamp: number;
    n_requests: number;
    operation: string;
    snapshot_id: string;
    n_context_tokens_total: number;
    n_generated_tokens_total: number;
    project_id?: string;
  }>;
}

interface AnthropicUsageResponse {
  data: Array<{
    date: string;
    input_tokens: number;
    output_tokens: number;
    total_cost_usd: number;
  }>;
}

/**
 * Fetch real billing data from OpenAI
 */
async function fetchOpenAIBilling(adminApiKey: string): Promise<{
  credits_remaining?: number;
  total_usage_usd?: number;
  tokens_used?: number;
  error?: string;
}> {
  try {
    // Get usage for the current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);

    const response = await fetch(
      `https://api.openai.com/v1/organization/usage/completions?start_time=${startTimestamp}`,
      {
        headers: {
          'Authorization': `Bearer ${adminApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        return { error: 'Invalid API key or missing admin permissions' };
      }
      if (response.status === 403) {
        return { error: 'API key does not have organization admin access' };
      }
      return { error: `OpenAI API error: ${response.status}` };
    }

    const data: OpenAIUsageResponse = await response.json();

    // Calculate totals
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    data.data?.forEach(item => {
      totalInputTokens += item.n_context_tokens_total || 0;
      totalOutputTokens += item.n_generated_tokens_total || 0;
    });

    // Estimate cost (GPT-4o pricing)
    const inputCost = (totalInputTokens / 1_000_000) * 2.50;
    const outputCost = (totalOutputTokens / 1_000_000) * 10.00;

    return {
      tokens_used: totalInputTokens + totalOutputTokens,
      total_usage_usd: Math.round((inputCost + outputCost) * 100) / 100,
    };
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch OpenAI billing' };
  }
}

/**
 * Fetch real billing data from Anthropic
 */
async function fetchAnthropicBilling(adminApiKey: string): Promise<{
  credits_remaining?: number;
  total_usage_usd?: number;
  tokens_used?: number;
  error?: string;
}> {
  try {
    // Anthropic Admin API for usage
    const response = await fetch(
      'https://api.anthropic.com/v1/organizations/usage',
      {
        headers: {
          'x-api-key': adminApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return { error: 'Invalid API key or missing admin permissions' };
      }
      if (response.status === 403) {
        return { error: 'API key does not have admin access. You need an Admin API key from console.anthropic.com' };
      }
      return { error: `Anthropic API error: ${response.status}` };
    }

    const data = await response.json();

    return {
      credits_remaining: data.credits_remaining,
      total_usage_usd: data.total_usage_usd,
      tokens_used: data.total_tokens,
    };
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch Anthropic billing' };
  }
}

/**
 * GET /api/billing - Fetch real billing data for platforms with admin keys
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const platformId = searchParams.get('platformId');

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 });
    }

    const businessIdNum = parseInt(businessId, 10);

    // Get platforms with admin API keys
    const platforms = dbHelpers.getPlatformsByBusiness.all(businessIdNum) as any[];

    const billingData: Record<string, any> = {};

    for (const platform of platforms) {
      if (platformId && platform.platform_id !== platformId) continue;
      if (!platform.admin_api_key) continue;

      const provider = platform.platform_id;

      if (provider === 'chatgpt') {
        billingData[provider] = await fetchOpenAIBilling(platform.admin_api_key);
        billingData[provider].source = 'api';
      } else if (provider === 'claude') {
        billingData[provider] = await fetchAnthropicBilling(platform.admin_api_key);
        billingData[provider].source = 'api';
      }
      // Other providers don't have billing APIs yet
    }

    return NextResponse.json({
      businessId: businessIdNum,
      billing: billingData,
    });
  } catch (error: any) {
    console.error('Error fetching billing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch billing data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/billing - Save admin API key for a platform
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, platformId, adminApiKey } = body;

    if (!businessId || !platformId) {
      return NextResponse.json(
        { error: 'businessId and platformId are required' },
        { status: 400 }
      );
    }

    // Update the platform with admin API key
    const result = dbHelpers.updatePlatformAdminKey.run({
      businessId,
      platformId,
      adminApiKey: adminApiKey || null,
    });

    return NextResponse.json({
      success: true,
      message: adminApiKey ? 'Admin API key saved' : 'Admin API key removed',
    });
  } catch (error: any) {
    console.error('Error saving admin API key:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save admin API key' },
      { status: 500 }
    );
  }
}
