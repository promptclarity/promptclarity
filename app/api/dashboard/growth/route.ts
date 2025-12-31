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
  prompt_text?: string;
  brand_mentions?: number;
  competitors_mentioned?: string;
  business_visibility?: number;
  share_of_voice?: number;
  sources?: string;
}

interface SourceData {
  domain: string;
  url: string;
  type: string;
  title?: string;
}

interface SourceExecution {
  executionId: number;
  promptId: number;
  promptText: string;
  platformName?: string;
  completedAt?: string;
}

interface SourceRecommendation {
  id: string;
  source: {
    domain: string;
    url: string;
    type: 'Editorial' | 'UGC' | 'Reference' | 'Corporate';
    title?: string;
    author?: string;
  };
  action: {
    type: 'get_featured' | 'contact_author' | 'create_content' | 'engage_community' | 'update_listing';
    summary: string;
    details: string[];
  };
  contentSuggestion: {
    title: string;
    description: string;
    targetKeywords: string[];
    contentType: string;
  };
  reasoning: {
    summary: string;
    dataPoints: string[];
    competitorPresence?: string[];
  };
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
  sourceExecutions: SourceExecution[];
}

interface OnPageRecommendation {
  id: string;
  type: 'content_gap' | 'keyword_optimization' | 'structure_improvement' | 'new_page';
  title: string;
  description: string;
  targetKeywords: string[];
  actionSteps: string[];
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
  relatedSources: string[];
}

/**
 * Extract keywords from prompts and responses
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lower = text.toLowerCase();

  // Extract quoted phrases
  const quotedPhrases = text.match(/"([^"]+)"/g);
  if (quotedPhrases) {
    keywords.push(...quotedPhrases.map(p => p.replace(/"/g, '')));
  }

  // Extract common question patterns
  const patterns = [
    /best\s+([a-z\s]+?)(?:\s+for|\s+in|\s+to|\?|$)/gi,
    /how\s+to\s+([a-z\s]+?)(?:\s+with|\s+in|\s+for|\?|$)/gi,
    /what\s+is\s+([a-z\s]+?)(?:\s+and|\s+in|\s+for|\?|$)/gi,
    /([a-z]+)\s+vs\s+([a-z]+)/gi,
    /alternative(?:s)?\s+to\s+([a-z\s]+)/gi,
    /([a-z]+)\s+review(?:s)?/gi,
    /([a-z]+)\s+comparison/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) keywords.push(match[1].trim());
      if (match[2]) keywords.push(match[2].trim());
    }
  });

  // Extract domain-specific terms (financial, tech, etc.)
  const domainTerms = [
    'transaction fees', 'bank transfer', 'currency exchange', 'money management',
    'foreign transaction', 'international payments', 'forex', 'exchange rate',
    'travel money', 'debit card', 'credit card', 'no fee', 'low fee',
    'API', 'integration', 'platform', 'software', 'tool', 'service',
    'pricing', 'cost', 'free', 'premium', 'enterprise',
  ];

  domainTerms.forEach(term => {
    if (lower.includes(term)) {
      keywords.push(term);
    }
  });

  // Deduplicate and clean
  return Array.from(new Set(keywords))
    .filter(k => k.length > 2 && k.length < 50)
    .slice(0, 10);
}

/**
 * Generate action details based on source type
 */
function generateActionDetails(
  sourceType: string,
  domain: string,
  businessName: string,
  keywords: string[]
): { type: string; summary: string; details: string[] } {
  const keywordStr = keywords.slice(0, 3).join(', ');

  switch (sourceType) {
    case 'Editorial':
      return {
        type: 'get_featured',
        summary: `Get ${businessName} featured in ${domain}'s content about ${keywordStr}`,
        details: [
          `Research ${domain}'s editorial team and find the right contact`,
          `Prepare a pitch highlighting ${businessName}'s expertise in ${keywords[0] || 'this area'}`,
          'Offer unique data, insights, or expert commentary',
          'Follow up with a well-crafted email pitch',
          'Consider offering an exclusive story or angle'
        ]
      };
    case 'UGC':
      return {
        type: 'engage_community',
        summary: `Engage with discussions about ${keywordStr} on ${domain}`,
        details: [
          `Create or optimize your ${businessName} profile on ${domain}`,
          `Search for discussions about ${keywords[0] || 'relevant topics'}`,
          'Provide genuinely helpful answers that naturally mention your expertise',
          'Build reputation by consistently contributing valuable content',
          'Avoid overly promotional content - focus on helping'
        ]
      };
    case 'Reference':
      return {
        type: 'update_listing',
        summary: `Get ${businessName} listed or updated on ${domain}`,
        details: [
          `Check if ${businessName} already has a presence on ${domain}`,
          'If not listed, find the submission or contribution process',
          'Prepare accurate, factual information about your offering',
          'Include relevant citations and references',
          'Keep information updated and monitor for accuracy'
        ]
      };
    default:
      return {
        type: 'get_featured',
        summary: `Build presence on ${domain} for topics related to ${keywordStr}`,
        details: [
          `Research how ${domain} covers topics in your industry`,
          'Identify opportunities for inclusion or mention',
          `Create content that ${domain} might reference`,
          'Build relationships with content creators on the platform'
        ]
      };
  }
}

/**
 * Generate content suggestion based on source and keywords
 */
function generateContentSuggestion(
  sourceType: string,
  domain: string,
  businessName: string,
  keywords: string[],
  promptText: string
): { title: string; description: string; targetKeywords: string[]; contentType: string } {
  const primaryKeyword = keywords[0] || 'your industry';

  // Determine content type based on source type
  let contentType = 'Article';
  let titlePrefix = '';
  let descriptionTemplate = '';

  if (sourceType === 'Editorial') {
    contentType = 'How-to Guide';
    titlePrefix = `How to ${primaryKeyword}`;
    descriptionTemplate = `Develop a comprehensive guide on ${primaryKeyword} targeting users searching for solutions. Include practical steps, examples, and position ${businessName} as an expert resource.`;
  } else if (sourceType === 'UGC') {
    contentType = 'Community Post';
    titlePrefix = `Discussion: ${primaryKeyword}`;
    descriptionTemplate = `Create an engaging discussion post about ${primaryKeyword}. Share insights, ask questions, and provide helpful information that naturally showcases ${businessName}'s expertise.`;
  } else if (sourceType === 'Reference') {
    contentType = 'Reference Content';
    titlePrefix = `${businessName}: ${primaryKeyword}`;
    descriptionTemplate = `Create authoritative, factual content about ${primaryKeyword} that could be referenced by ${domain}. Focus on accuracy, comprehensiveness, and citing reliable sources.`;
  } else {
    contentType = 'Article';
    titlePrefix = `Complete Guide: ${primaryKeyword}`;
    descriptionTemplate = `Produce comprehensive content about ${primaryKeyword} that positions ${businessName} as a thought leader in this space.`;
  }

  return {
    title: titlePrefix,
    description: descriptionTemplate,
    targetKeywords: keywords.slice(0, 6),
    contentType
  };
}

/**
 * GET /api/dashboard/growth
 * Generate growth recommendations based on source analysis
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!businessId || !startDate || !endDate) {
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

    // Get business info
    const business = dbHelpers.getBusiness.get(businessIdNum) as any;
    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    const businessName = business.business_name;

    // Extract just the date portion for SQL comparison (YYYY-MM-DD format)
    const startDateOnly = startDate.split('T')[0];
    const endDateOnly = endDate.split('T')[0];

    // Get executions in date range
    const executions = dbHelpers.getPromptsExecutionsByDateRange.all(
      businessIdNum,
      startDateOnly,
      endDateOnly
    ) as PromptExecution[];

    // Get competitors
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum) as any[];
    const competitorNames = competitors.map(c => c.name);

    // ============================================
    // ANALYZE SOURCES AND EXTRACT KEYWORDS
    // ============================================
    // Get platforms for execution info
    const platforms = dbHelpers.getPlatformsByBusiness.all(businessIdNum) as any[];
    const platformMap = new Map(platforms.map(p => [p.id, p.platform_name]));

    const sourcesByType = {
      Editorial: new Map<string, { source: SourceData; count: number; keywords: string[]; competitorsMentioned: string[]; isGap: boolean; promptTexts: string[]; executions: SourceExecution[] }>(),
      UGC: new Map<string, { source: SourceData; count: number; keywords: string[]; competitorsMentioned: string[]; isGap: boolean; promptTexts: string[]; executions: SourceExecution[] }>(),
      Reference: new Map<string, { source: SourceData; count: number; keywords: string[]; competitorsMentioned: string[]; isGap: boolean; promptTexts: string[]; executions: SourceExecution[] }>(),
      Corporate: new Map<string, { source: SourceData; count: number; keywords: string[]; competitorsMentioned: string[]; isGap: boolean; promptTexts: string[]; executions: SourceExecution[] }>(),
    };

    // All keywords from all prompts
    const allKeywords: string[] = [];

    // Process executions
    executions.forEach(exec => {
      if (!exec.sources) return;

      try {
        const sources = JSON.parse(exec.sources) as SourceData[];
        const hasBrandMention = (exec.brand_mentions || 0) > 0;

        // Parse competitors mentioned
        let competitorsMentioned: string[] = [];
        if (exec.competitors_mentioned) {
          try {
            competitorsMentioned = JSON.parse(exec.competitors_mentioned);
          } catch {}
        }

        // Is this a content gap? (competitors mentioned but not brand)
        const isGap = !hasBrandMention && competitorsMentioned.length > 0;

        // Extract keywords from prompt
        const promptKeywords = exec.prompt_text ? extractKeywords(exec.prompt_text) : [];
        allKeywords.push(...promptKeywords);

        // Process each source
        sources.forEach(source => {
          if (!source.domain || !source.type) return;

          // Skip competitor websites
          if (source.type === 'Competitor') return;
          if (competitorNames.some(c => source.domain.toLowerCase().includes(c.toLowerCase()))) return;

          const typeKey = source.type as keyof typeof sourcesByType;
          if (!sourcesByType[typeKey]) return;

          const executionInfo: SourceExecution = {
            executionId: exec.id,
            promptId: exec.prompt_id,
            promptText: exec.prompt_text || '',
            platformName: platformMap.get(exec.platform_id) || undefined,
            completedAt: exec.completed_at
          };

          const existing = sourcesByType[typeKey].get(source.domain);
          if (existing) {
            existing.count++;
            existing.keywords.push(...promptKeywords);
            existing.competitorsMentioned.push(...competitorsMentioned);
            if (isGap) existing.isGap = true;
            if (exec.prompt_text) existing.promptTexts.push(exec.prompt_text);
            // Add execution if not already tracked
            if (!existing.executions.some(e => e.executionId === exec.id)) {
              existing.executions.push(executionInfo);
            }
          } else {
            sourcesByType[typeKey].set(source.domain, {
              source: {
                domain: source.domain,
                url: source.url || `https://${source.domain}`,
                type: source.type,
                title: source.title
              },
              count: 1,
              keywords: [...promptKeywords],
              competitorsMentioned: [...competitorsMentioned],
              isGap,
              promptTexts: exec.prompt_text ? [exec.prompt_text] : [],
              executions: [executionInfo]
            });
          }
        });
      } catch {}
    });

    // Get top keywords
    const keywordCounts = new Map<string, number>();
    allKeywords.forEach(k => {
      keywordCounts.set(k, (keywordCounts.get(k) || 0) + 1);
    });
    const topKeywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => k);

    // ============================================
    // GENERATE OFF-PAGE RECOMMENDATIONS
    // ============================================
    const offPage: {
      editorial: SourceRecommendation[];
      ugc: SourceRecommendation[];
      reference: SourceRecommendation[];
    } = {
      editorial: [],
      ugc: [],
      reference: []
    };

    // Helper to create recommendation
    const createRecommendation = (
      sourceData: { source: SourceData; count: number; keywords: string[]; competitorsMentioned: string[]; isGap: boolean; promptTexts: string[]; executions: SourceExecution[] },
      index: number
    ): SourceRecommendation => {
      // Dedupe and get top keywords for this source
      const sourceKeywords = Array.from(new Set(sourceData.keywords)).slice(0, 8);
      const sourceCompetitors = Array.from(new Set(sourceData.competitorsMentioned));

      // Determine priority
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (sourceData.isGap && sourceData.count >= 3) priority = 'high';
      else if (sourceData.count >= 5) priority = 'high';
      else if (sourceData.count === 1) priority = 'low';

      // Calculate impact
      const impactPercent = Math.min(sourceData.count * 5, 30);
      const estimatedImpact = `+${impactPercent}% visibility potential for ${sourceKeywords[0] || 'related'} queries`;

      // Generate action
      const action = generateActionDetails(
        sourceData.source.type,
        sourceData.source.domain,
        businessName,
        sourceKeywords
      );

      // Generate content suggestion
      const contentSuggestion = generateContentSuggestion(
        sourceData.source.type,
        sourceData.source.domain,
        businessName,
        sourceKeywords,
        sourceData.promptTexts[0] || ''
      );

      // Build reasoning
      const dataPoints: string[] = [];
      dataPoints.push(`Cited ${sourceData.count} time${sourceData.count > 1 ? 's' : ''} in AI responses`);
      if (sourceData.isGap) {
        dataPoints.push('Appears in responses where competitors are mentioned but not your brand');
      }
      if (sourceCompetitors.length > 0) {
        dataPoints.push(`Competitors present: ${sourceCompetitors.slice(0, 3).join(', ')}`);
      }
      if (sourceKeywords.length > 0) {
        dataPoints.push(`Related to queries about: ${sourceKeywords.slice(0, 3).join(', ')}`);
      }

      const reasoningSummary = sourceData.isGap
        ? `This source is frequently cited in responses where competitors appear but ${businessName} doesn't. Getting featured here could close a visibility gap.`
        : `AI models cite this source for queries related to ${sourceKeywords[0] || 'your industry'}. Building presence here could increase your visibility.`;

      return {
        id: `${sourceData.source.type.toLowerCase()}-${index}`,
        source: {
          domain: sourceData.source.domain,
          url: sourceData.source.url,
          type: sourceData.source.type as 'Editorial' | 'UGC' | 'Reference' | 'Corporate',
          title: sourceData.source.title
        },
        action: {
          type: action.type as any,
          summary: action.summary,
          details: action.details
        },
        contentSuggestion,
        reasoning: {
          summary: reasoningSummary,
          dataPoints,
          competitorPresence: sourceCompetitors.length > 0 ? sourceCompetitors : undefined
        },
        priority,
        estimatedImpact,
        sourceExecutions: sourceData.executions.slice(0, 10) // Limit to 10 most recent
      };
    };

    // Generate Editorial recommendations
    const editorialSources = Array.from(sourcesByType.Editorial.values())
      .sort((a, b) => {
        // Prioritize gaps, then by count
        if (a.isGap && !b.isGap) return -1;
        if (!a.isGap && b.isGap) return 1;
        return b.count - a.count;
      })
      .slice(0, 10);

    offPage.editorial = editorialSources.map((s, i) => createRecommendation(s, i));

    // Generate UGC recommendations
    const ugcSources = Array.from(sourcesByType.UGC.values())
      .sort((a, b) => {
        if (a.isGap && !b.isGap) return -1;
        if (!a.isGap && b.isGap) return 1;
        return b.count - a.count;
      })
      .slice(0, 10);

    offPage.ugc = ugcSources.map((s, i) => createRecommendation(s, i));

    // Generate Reference recommendations
    const referenceSources = Array.from(sourcesByType.Reference.values())
      .sort((a, b) => {
        if (a.isGap && !b.isGap) return -1;
        if (!a.isGap && b.isGap) return 1;
        return b.count - a.count;
      })
      .slice(0, 10);

    offPage.reference = referenceSources.map((s, i) => createRecommendation(s, i));

    // ============================================
    // GENERATE ON-PAGE RECOMMENDATIONS
    // ============================================
    const onPage: OnPageRecommendation[] = [];

    // Find content gaps (low visibility prompts)
    const promptVisibility = new Map<number, {
      promptText: string;
      avgVisibility: number;
      count: number;
      keywords: string[];
      sources: string[];
    }>();

    executions.forEach(exec => {
      if (exec.business_visibility !== undefined && exec.prompt_text) {
        const existing = promptVisibility.get(exec.prompt_id);
        const keywords = extractKeywords(exec.prompt_text);
        const sources = exec.sources ? JSON.parse(exec.sources).map((s: any) => s.domain).filter(Boolean) : [];

        if (existing) {
          existing.avgVisibility = ((existing.avgVisibility * existing.count) + exec.business_visibility) / (existing.count + 1);
          existing.count++;
          existing.keywords.push(...keywords);
          existing.sources.push(...sources);
        } else {
          promptVisibility.set(exec.prompt_id, {
            promptText: exec.prompt_text,
            avgVisibility: exec.business_visibility,
            count: 1,
            keywords,
            sources
          });
        }
      }
    });

    // Create on-page recommendations for low visibility queries
    const lowVisibilityPrompts = Array.from(promptVisibility.entries())
      .filter(([_, data]) => data.avgVisibility < 0.5)
      .sort((a, b) => a[1].avgVisibility - b[1].avgVisibility)
      .slice(0, 5);

    lowVisibilityPrompts.forEach(([promptId, data], index) => {
      const keywords = Array.from(new Set(data.keywords)).slice(0, 6);
      const relatedSources = Array.from(new Set(data.sources)).slice(0, 5);

      onPage.push({
        id: `onpage-${index}`,
        type: 'content_gap',
        title: `Create Content for: "${data.promptText.substring(0, 50)}..."`,
        description: `Your brand has ${Math.round(data.avgVisibility * 100)}% visibility for this query. Create dedicated content to directly answer this question and improve your chances of being cited.`,
        targetKeywords: keywords,
        actionSteps: [
          `Create a dedicated page or blog post that directly answers: "${data.promptText}"`,
          `Include these target keywords naturally: ${keywords.join(', ')}`,
          'Structure content with clear headings (H1, H2, H3) matching the question format',
          'Add factual, specific information (numbers, dates, specifications)',
          'Include FAQ section with related questions',
          'Publish and promote the content to build authority signals'
        ],
        reasoning: `Based on ${data.count} AI response${data.count > 1 ? 's' : ''}, ${businessName} is only mentioned ${Math.round(data.avgVisibility * 100)}% of the time for this type of query. Sources like ${relatedSources.slice(0, 2).join(', ')} are being cited instead.`,
        priority: data.avgVisibility < 0.2 ? 'high' : 'medium',
        estimatedImpact: `+${Math.round((1 - data.avgVisibility) * 50)}% visibility improvement potential`,
        relatedSources
      });
    });

    // Add keyword optimization recommendation if we have data
    if (topKeywords.length > 0) {
      onPage.push({
        id: 'onpage-keywords',
        type: 'keyword_optimization',
        title: 'Optimize for Top Searched Keywords',
        description: `Based on analysis of AI queries, these keywords appear most frequently. Ensure your website content includes these terms naturally.`,
        targetKeywords: topKeywords,
        actionSteps: [
          'Audit your website for these keyword terms',
          'Update page titles and meta descriptions to include top keywords',
          'Add these terms to relevant H1 and H2 headings',
          'Create or update FAQ pages with questions containing these keywords',
          'Ensure product/service pages mention these terms in context'
        ],
        reasoning: `These keywords were extracted from ${executions.length} AI queries in your tracking period. Optimizing for these terms will help AI models associate your content with relevant queries.`,
        priority: 'medium',
        estimatedImpact: '+15-25% relevance for tracked queries',
        relatedSources: []
      });
    }

    // ============================================
    // CALCULATE SUMMARY
    // ============================================
    const allRecommendations = [
      ...offPage.editorial,
      ...offPage.ugc,
      ...offPage.reference,
      ...onPage
    ];

    const highPriorityCount = allRecommendations.filter(r => r.priority === 'high').length;

    // Estimate visibility gain
    let estimatedGain = '+0%';
    if (allRecommendations.length > 10) estimatedGain = '+30-50%';
    else if (allRecommendations.length > 5) estimatedGain = '+20-30%';
    else if (allRecommendations.length > 0) estimatedGain = '+10-20%';

    return NextResponse.json({
      onPage,
      offPage,
      summary: {
        totalRecommendations: allRecommendations.length,
        highPriorityCount,
        topKeywords: topKeywords.slice(0, 5),
        estimatedVisibilityGain: estimatedGain
      }
    });

  } catch (error: any) {
    console.error('[Growth API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
