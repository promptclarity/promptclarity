import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

interface PromptExecution {
  id: number;
  prompt_id: number;
  platform_id: number;
  result: string;
  sources?: string;
  completed_at: string;
  refresh_date?: string;
  brand_mentions?: number;
  prompt_text?: string;
}

interface Source {
  domain: string;
  url: string;
  type: string;
}

/**
 * GET /api/dashboard/sources/executions
 * Get all executions that cited a specific URL or domain
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    const url = searchParams.get('url');
    const domain = searchParams.get('domain');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    if (!url && !domain) {
      return NextResponse.json(
        { error: 'Either URL or domain is required' },
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

    // Get executions in date range
    let executions: PromptExecution[];
    if (startDate && endDate) {
      executions = db.prepare(`
        SELECT
          pe.id,
          pe.prompt_id,
          pe.platform_id,
          pe.result,
          pe.sources,
          pe.completed_at,
          pe.refresh_date,
          pe.brand_mentions,
          p.text as prompt_text
        FROM prompt_executions pe
        JOIN prompts p ON pe.prompt_id = p.id
        WHERE pe.business_id = ?
          AND pe.status = 'completed'
          AND pe.sources IS NOT NULL
          AND (pe.refresh_date BETWEEN ? AND ? OR pe.completed_at BETWEEN ? AND ?)
        ORDER BY COALESCE(pe.refresh_date, pe.completed_at) DESC
      `).all(businessIdNum, startDate, endDate, startDate, endDate) as PromptExecution[];
    } else {
      executions = db.prepare(`
        SELECT
          pe.id,
          pe.prompt_id,
          pe.platform_id,
          pe.result,
          pe.sources,
          pe.completed_at,
          pe.refresh_date,
          pe.brand_mentions,
          p.text as prompt_text
        FROM prompt_executions pe
        JOIN prompts p ON pe.prompt_id = p.id
        WHERE pe.business_id = ?
          AND pe.status = 'completed'
          AND pe.sources IS NOT NULL
        ORDER BY COALESCE(pe.refresh_date, pe.completed_at) DESC
      `).all(businessIdNum) as PromptExecution[];
    }

    // Filter executions that contain the URL or domain
    const matchingExecutions = executions.filter(exec => {
      if (!exec.sources) return false;

      try {
        const sources: Source[] = JSON.parse(exec.sources);

        if (url) {
          // Match specific URL
          return sources.some(source => source.url === url);
        } else if (domain) {
          // Match domain
          return sources.some(source => source.domain === domain);
        }
        return false;
      } catch (e) {
        return false;
      }
    });

    // Get platforms for mapping
    const platforms = dbHelpers.getPlatformsByBusiness.all(businessIdNum) as Array<{
      id: number;
      platform_id: string;
    }>;
    const platformsMap = new Map(platforms.map(p => [p.id, p.platform_id]));

    // Format response
    const formattedExecutions = matchingExecutions.map(exec => ({
      id: exec.id,
      promptId: exec.prompt_id,
      platformId: exec.platform_id,
      platformName: platformsMap.get(exec.platform_id) || 'Unknown',
      promptText: exec.prompt_text,
      result: exec.result,
      brandMentioned: (exec.brand_mentions || 0) > 0,
      completedAt: exec.refresh_date || exec.completed_at,
      sources: exec.sources ? JSON.parse(exec.sources) : []
    }));

    return NextResponse.json({
      success: true,
      executions: formattedExecutions,
      total: formattedExecutions.length
    });

  } catch (error: any) {
    console.error('[Sources Executions API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
