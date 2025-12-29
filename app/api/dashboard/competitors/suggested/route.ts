import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';
import { normalizeBrandName, isSameBrand } from '@/app/lib/brand-normalization';

interface PromptExecution {
  id: number;
  mention_analysis?: string;
}

interface Competitor {
  id: number;
  name: string;
}

interface Business {
  id: number;
  business_name: string;
}

interface RankingEntry {
  position: number;
  company: string;
  reason?: string;
  sentiment?: string;
}

/**
 * GET /api/dashboard/competitors/suggested
 * Get suggested competitors based on brands mentioned in LLM responses that aren't being tracked
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');

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

    // Get business name
    const business = dbHelpers.getBusiness.get(businessIdNum) as Business | undefined;
    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Get existing competitors
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum) as Competitor[];
    const trackedCompetitorNames = competitors.map(c => c.name);

    // Helper to check if a brand is already tracked (using normalization)
    const isAlreadyTracked = (brandName: string): boolean => {
      // Check against business name
      if (isSameBrand(brandName, business.business_name)) return true;

      // Check against tracked competitors
      for (const tracked of trackedCompetitorNames) {
        if (isSameBrand(brandName, tracked)) return true;
      }
      return false;
    };

    // Get all executions with mention_analysis
    const executions = dbHelpers.getAllPromptsExecutions.all(businessIdNum) as PromptExecution[];

    // Extract all companies mentioned in rankings, normalized to canonical names
    // Key is the canonical name, value includes all original variations seen
    const companyMentions = new Map<string, {
      count: number;
      avgPosition: number;
      positions: number[];
      originalNames: Set<string>;
    }>();

    executions.forEach(exec => {
      if (!exec.mention_analysis) return;

      try {
        const analysis = JSON.parse(exec.mention_analysis);
        if (analysis.rankings && Array.isArray(analysis.rankings)) {
          analysis.rankings.forEach((ranking: RankingEntry) => {
            if (!ranking.company) return;

            const companyName = ranking.company.trim();

            // Normalize to canonical name
            const canonicalName = normalizeBrandName(companyName);

            // Skip if it's already tracked (checks canonical name against tracked brands)
            if (isAlreadyTracked(canonicalName)) return;

            // Track mentions under canonical name
            const existing = companyMentions.get(canonicalName) || {
              count: 0,
              avgPosition: 0,
              positions: [],
              originalNames: new Set<string>(),
            };
            existing.count++;
            existing.positions.push(ranking.position);
            existing.originalNames.add(companyName);
            companyMentions.set(canonicalName, existing);
          });
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Convert to array and calculate average positions
    const suggestedCompetitors = Array.from(companyMentions.entries())
      .map(([canonicalName, data]) => ({
        name: canonicalName,
        mentionCount: data.count,
        avgPosition: Math.round(data.positions.reduce((a, b) => a + b, 0) / data.positions.length * 10) / 10,
        // Include variations if different from canonical (for debugging/transparency)
        variations: Array.from(data.originalNames).filter(n => n !== canonicalName),
      }))
      .filter(c => c.mentionCount >= 2) // Only suggest if mentioned at least twice
      .sort((a, b) => b.mentionCount - a.mentionCount) // Sort by mention count
      .slice(0, 10); // Limit to top 10 suggestions

    return NextResponse.json({
      success: true,
      suggestedCompetitors,
      totalMentionedBrands: companyMentions.size,
      trackedCompetitorsCount: competitors.length,
    });
  } catch (error: any) {
    console.error('[Suggested Competitors API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
