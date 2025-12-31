import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

interface PromptExecution {
  id: number;
  mention_analysis?: string;
  competitors_mentioned?: string;
  competitor_visibilities?: string;
}

/**
 * Backfill competitor visibility data from existing mention_analysis
 * This updates historical executions to include the new competitor's data
 */
function backfillCompetitorData(businessId: number, competitorName: string) {
  const competitorNameLower = competitorName.toLowerCase();

  // Get all executions for this business
  const executions = dbHelpers.getAllPromptsExecutions.all(businessId) as PromptExecution[];

  let updatedCount = 0;

  executions.forEach(exec => {
    if (!exec.mention_analysis) return;

    try {
      const analysis = JSON.parse(exec.mention_analysis);
      if (!analysis.rankings || !Array.isArray(analysis.rankings)) return;

      // Find if this competitor was mentioned in the rankings
      const ranking = analysis.rankings.find((r: any) =>
        r.company && r.company.toLowerCase() === competitorNameLower
      );

      if (!ranking) return;

      // Update competitors_mentioned
      let competitorsMentioned: string[] = [];
      if (exec.competitors_mentioned) {
        try {
          competitorsMentioned = JSON.parse(exec.competitors_mentioned);
        } catch (e) {}
      }

      if (!competitorsMentioned.includes(competitorName)) {
        competitorsMentioned.push(competitorName);
      }

      // Update competitor_visibilities (1 = mentioned, 0 = not mentioned)
      let competitorVisibilities: Record<string, number> = {};
      if (exec.competitor_visibilities) {
        try {
          competitorVisibilities = JSON.parse(exec.competitor_visibilities);
        } catch (e) {}
      }

      competitorVisibilities[competitorName] = 1;

      // Update the execution record
      db.prepare(`
        UPDATE prompt_executions
        SET competitors_mentioned = ?, competitor_visibilities = ?
        WHERE id = ?
      `).run(
        JSON.stringify(competitorsMentioned),
        JSON.stringify(competitorVisibilities),
        exec.id
      );

      updatedCount++;
    } catch (e) {
      // Skip invalid JSON
    }
  });

  console.log(`[Competitors API] Backfilled ${updatedCount} executions for competitor: ${competitorName}`);
  return updatedCount;
}

/**
 * POST /api/dashboard/competitors
 * Add a new competitor for a business
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, name, website, description, logo } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Competitor name is required' },
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

    const competitorName = name.trim();

    // Check if competitor already exists (active)
    const activeCompetitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum) as any[];
    const existsActive = activeCompetitors.some(
      c => c.name.toLowerCase() === competitorName.toLowerCase()
    );

    if (existsActive) {
      return NextResponse.json(
        { error: 'A competitor with this name already exists' },
        { status: 409 }
      );
    }

    // Check if competitor exists but is inactive - reactivate it instead of creating new
    const inactiveCompetitors = dbHelpers.getInactiveCompetitorsByBusiness.all(businessIdNum) as any[];
    const existingInactive = inactiveCompetitors.find(
      c => c.name.toLowerCase() === competitorName.toLowerCase()
    );

    let competitorId: number;
    let backfilledCount = 0;

    if (existingInactive) {
      // Reactivate existing competitor
      dbHelpers.activateCompetitor.run(existingInactive.id);
      competitorId = existingInactive.id;
    } else {
      // Add new competitor
      const result = dbHelpers.createCompetitor.run({
        businessId: businessIdNum,
        name: competitorName,
        website: website?.trim() || null,
        description: description?.trim() || null,
        isCustom: 1,
        logo: logo || null
      });
      competitorId = result.lastInsertRowid as number;

      // Backfill historical data for this competitor (only for new competitors)
      backfilledCount = backfillCompetitorData(businessIdNum, competitorName);
    }

    return NextResponse.json({
      success: true,
      competitor: {
        id: competitorId,
        name: competitorName,
        website: website?.trim() || null,
        description: description?.trim() || null,
        logo: logo || null,
        isCustom: true
      },
      backfilledExecutions: backfilledCount
    }, { status: 201 });
  } catch (error: any) {
    console.error('[Competitors API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dashboard/competitors
 * Permanently delete a competitor
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const competitorId = searchParams.get('competitorId');

    if (!competitorId) {
      return NextResponse.json(
        { error: 'Competitor ID is required' },
        { status: 400 }
      );
    }

    const competitorIdNum = parseInt(competitorId);

    // Get the competitor to find business ID
    const competitor = db.prepare('SELECT id, business_id FROM competitors WHERE id = ?').get(competitorIdNum) as { id: number; business_id: number } | undefined;
    if (!competitor) {
      return NextResponse.json(
        { error: 'Competitor not found' },
        { status: 404 }
      );
    }

    // Check user has access to this business
    const accessCheck = await checkBusinessAccess(competitor.business_id);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status || 403 }
      );
    }

    // Permanently delete the competitor
    db.prepare('DELETE FROM competitors WHERE id = ?').run(competitorIdNum);

    return NextResponse.json({
      success: true
    });
  } catch (error: any) {
    console.error('[Competitors API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dashboard/competitors
 * Get competitors for a business
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

    // Return active competitors
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum);
    return NextResponse.json({ competitors });
  } catch (error: any) {
    console.error('[Competitors API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
