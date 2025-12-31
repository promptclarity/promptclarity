import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

interface PromptExecution {
  id: number;
  sources?: string;
  completed_at: string;
  refresh_date?: string;
  brand_mentions?: number;
  competitors_mentioned?: string;
}

interface Source {
  domain: string;
  url: string;
  type: string;
  pageType?: string;
  citations?: number;
  associatedBrands?: string[]; // Brands mentioned in same context as this source
}

type PageType = 'Comparison' | 'Product Page' | 'Article' | 'Category Page' | 'Alternative' | 'Other';

/**
 * Classify a URL into a page type based on URL patterns
 */
function classifyUrlPageType(url: string): PageType {
  const lowerUrl = url.toLowerCase();
  const path = lowerUrl.replace(/^https?:\/\/[^\/]+/, '');

  // Comparison pages
  if (
    path.includes('/compare') ||
    path.includes('/comparison') ||
    path.includes('/vs') ||
    path.includes('-vs-') ||
    path.includes('_vs_') ||
    path.includes('/versus')
  ) {
    return 'Comparison';
  }

  // Alternative pages
  if (
    path.includes('/alternative') ||
    path.includes('/competitors') ||
    path.includes('/similar-to') ||
    path.includes('/like-') ||
    path.includes('/instead-of')
  ) {
    return 'Alternative';
  }

  // Product pages
  if (
    path.includes('/product') ||
    path.includes('/pricing') ||
    path.includes('/features') ||
    path.includes('/solutions') ||
    path.includes('/services') ||
    path.includes('/software/') ||
    path.includes('/tool/') ||
    path.includes('/app/') ||
    path.match(/\/p\/[^\/]+$/) || // Common product URL pattern
    path.match(/\/products\/[^\/]+$/)
  ) {
    return 'Product Page';
  }

  // Category pages
  if (
    path.includes('/category') ||
    path.includes('/categories') ||
    path.includes('/best-') ||
    path.includes('/top-') ||
    path.includes('/list-of') ||
    path.includes('/directory') ||
    path.match(/^\/[a-z-]+\/?$/) // Single segment paths often categories
  ) {
    return 'Category Page';
  }

  // Article pages
  if (
    path.includes('/blog') ||
    path.includes('/article') ||
    path.includes('/post') ||
    path.includes('/news') ||
    path.includes('/guide') ||
    path.includes('/how-to') ||
    path.includes('/what-is') ||
    path.includes('/learn') ||
    path.includes('/resources') ||
    path.includes('/wiki') ||
    path.match(/\/\d{4}\/\d{2}\//) || // Date-based URLs (blog posts)
    path.match(/\.(html|htm)$/)
  ) {
    return 'Article';
  }

  return 'Other';
}

/**
 * GET /api/dashboard/sources/[domain]
 * Get URL-level usage data for a specific domain
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { domain: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const platformIdsParam = searchParams.get('platformIds');
    const domain = decodeURIComponent(params.domain);

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

    // Get executions in date range
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
      executions = executions.filter((e: any) => selectedPlatformIds!.includes(e.platform_id));
    }

    // Track URL usage
    const urlUsage = new Map<string, {
      url: string;
      count: number;
      responseCount: number;   // Number of responses that cited this URL
      type: string;
      pageType: string;
      brandMentioned: number;  // Times brand was mentioned when this URL was cited
      lastUpdated: string;     // Most recent citation date
    }>();

    // Track page type counts
    const pageTypeCounts: Record<PageType, number> = {
      'Comparison': 0,
      'Product Page': 0,
      'Article': 0,
      'Category Page': 0,
      'Alternative': 0,
      'Other': 0
    };

    // Track daily usage for the domain
    const dailyUsage = new Map<string, number>();

    let totalDomainMentions = 0;
    let executionsWithDomain = 0;
    let brandMentionedCount = 0;  // How many times brand was mentioned when this domain was cited
    let lastUpdated: string | null = null;  // Most recent citation
    let domainType: string = 'Other';  // Track the domain type
    const competitorsCited = new Map<string, number>();  // Track competitors mentioned when domain is cited

    executions.forEach(exec => {
      if (!exec.sources) return;

      try {
        const sources: Source[] = JSON.parse(exec.sources);
        const dateToUse = exec.refresh_date?.split('T')[0] || exec.completed_at?.split('T')[0];
        const brandWasMentioned = (exec.brand_mentions || 0) > 0;

        let domainFoundInExec = false;

        sources.forEach(source => {
          if (source.domain === domain) {
            domainFoundInExec = true;
            const citations = source.citations || 1;
            totalDomainMentions += citations;

            // Track domain type (use the first one found)
            if (source.type && domainType === 'Other') {
              domainType = source.type;
            }

            // Track associated brands (competitors/brand mentioned in context of this source)
            if (source.associatedBrands && source.associatedBrands.length > 0) {
              source.associatedBrands.forEach(brand => {
                competitorsCited.set(brand, (competitorsCited.get(brand) || 0) + 1);
              });
            }

            // Track URL usage
            if (source.url) {
              // Use stored pageType from source if available, otherwise classify
              const pageType = source.pageType || classifyUrlPageType(source.url);
              const existing = urlUsage.get(source.url);
              if (existing) {
                existing.count += citations;
                existing.responseCount++;
                if (brandWasMentioned) {
                  existing.brandMentioned++;
                }
                // Update lastUpdated if this is more recent
                if (dateToUse && dateToUse > existing.lastUpdated) {
                  existing.lastUpdated = dateToUse;
                }
              } else {
                urlUsage.set(source.url, {
                  url: source.url,
                  count: citations,
                  responseCount: 1,
                  type: source.type || 'Other',
                  pageType,
                  brandMentioned: brandWasMentioned ? 1 : 0,
                  lastUpdated: dateToUse || ''
                });
                // Count page types (only count unique URLs once)
                const classifiedType = classifyUrlPageType(source.url);
                pageTypeCounts[classifiedType]++;
              }
            }
          }
        });

        // Track daily usage and brand mentions (count executions where domain appears)
        if (domainFoundInExec) {
          executionsWithDomain++;
          if (brandWasMentioned) {
            brandMentionedCount++;
          }
          if (dateToUse) {
            dailyUsage.set(dateToUse, (dailyUsage.get(dateToUse) || 0) + 1);
            // Track last updated
            if (!lastUpdated || dateToUse > lastUpdated) {
              lastUpdated = dateToUse;
            }
          }
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Convert to sorted arrays - return ALL URLs
    const allUrls = Array.from(urlUsage.values())
      .sort((a, b) => b.count - a.count);

    const dailyData = Array.from(dailyUsage.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate usage percentage (responses with this source / total responses)
    const usagePercentage = executions.length > 0
      ? Math.round((executionsWithDomain / executions.length) * 1000) / 10  // 1 decimal place
      : 0;

    // Calculate average citations per prompt
    const avgCitationsPerPrompt = executionsWithDomain > 0
      ? Math.round((totalDomainMentions / executionsWithDomain) * 10) / 10
      : 0;

    // Convert competitors map to sorted array (by count, descending)
    const competitorsMentioned = Array.from(competitorsCited.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      success: true,
      domain,
      type: domainType,
      totalMentions: totalDomainMentions,
      totalExecutions: executionsWithDomain,
      brandMentioned: brandMentionedCount,  // How many times brand was mentioned when this domain was cited
      competitorsMentioned,                  // Competitors mentioned when this domain is cited
      lastUpdated,                           // Most recent citation date
      avgCitationsPerPrompt,                // Average citations per prompt
      usagePercentage,
      urls: allUrls,                        // All URLs (renamed from topUrls)
      dailyUsage: dailyData,
      pageTypeBreakdown: pageTypeCounts
    });

  } catch (error: any) {
    console.error('[Sources Domain API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
