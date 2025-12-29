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
  sources?: string;
  brand_mentions?: number;
  competitors_mentioned?: string;
}

interface SourceData {
  domain: string;
  url?: string;
  type: string;
  frequency: number;
  brandPresent: number;
  competitorPresent: number;
  promptsAppearing: Set<number>;
  urls: Set<string>;
  ownerCompetitor?: string; // Name of competitor if this is their domain
}

interface EditorialOpportunity {
  domain: string;
  type: 'Editorial' | 'Reference' | 'Institutional';
  frequency: number;
  brandPresence: number;
  competitorPresence: number;
  priority: 'high' | 'medium' | 'low';
  priorityScore: number;
  recommendedAction: string;
  pitchType: string;
  exampleUrls: string[];
  relatedTopics: string[];
}

interface UGCOpportunity {
  domain: string;
  type: 'UGC';
  platform: string; // Reddit, Facebook, Forum, etc.
  frequency: number;
  brandPresence: number;
  competitorPresence: number;
  priority: 'high' | 'medium' | 'low';
  priorityScore: number;
  recommendedAction: string;
  engagementStrategy: string;
  suggestedAngles: string[];
  exampleUrls: string[];
}

interface CompetitorSourceAnalysis {
  domain: string;
  type: string;
  frequency: number;
  competitorsUsing: string[];
  yourPresence: boolean;
  gap: boolean;
}

interface OutreachTarget {
  domain: string;
  type: string;
  outreachType: 'pr' | 'partnership' | 'guest-post' | 'review' | 'community';
  priority: 'high' | 'medium' | 'low';
  contactStrategy: string;
  pitchIdea: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  estimatedImpact: number;
}

interface CompetitorContentInsight {
  competitorName: string;
  competitorDomain: string;
  citationCount: number;
  exampleUrls: string[];
  topicsAddressed: string[];
  contentRecommendation: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * GET /api/dashboard/offpage-roadmap
 * Generate off-page PR and distribution roadmap
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

    // Get business info
    const business = dbHelpers.getBusiness.get(businessIdNum) as any;
    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Get competitors
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessIdNum) as any[];
    const competitorNames = competitors.map(c => c.name.toLowerCase());

    // Build a map of competitor domains to competitor names
    const competitorDomainMap = new Map<string, string>(); // domain pattern -> competitor name
    competitors.forEach(c => {
      // Add competitor name as potential domain match
      const nameLower = c.name.toLowerCase().replace(/\s+/g, '');
      competitorDomainMap.set(nameLower, c.name);

      // Add competitor website domain if available
      if (c.website) {
        const websiteDomain = c.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
        competitorDomainMap.set(websiteDomain, c.name);
        // Also add without TLD for matching (e.g., "competitor" from "competitor.com")
        const domainWithoutTld = websiteDomain.split('.')[0];
        if (domainWithoutTld.length > 2) {
          competitorDomainMap.set(domainWithoutTld, c.name);
        }
      }
    });

    // Helper function to check if a domain belongs to a competitor and return competitor name
    const getCompetitorOwner = (domain: string): string | null => {
      const domainLower = domain.toLowerCase();
      // Check if domain contains any competitor name/domain
      for (const [compDomain, compName] of competitorDomainMap) {
        if (domainLower.includes(compDomain) || compDomain.includes(domainLower.split('.')[0])) {
          return compName;
        }
      }
      return null;
    };

    // Helper function to check if a domain belongs to a competitor
    const isCompetitorDomain = (domain: string): boolean => {
      return getCompetitorOwner(domain) !== null;
    };

    // Get all executions
    const executions = dbHelpers.getAllPromptsExecutions.all(businessIdNum) as PromptExecution[];

    // Build set of suggested competitor names (brands mentioned in LLM responses but not tracked)
    const suggestedCompetitorNames = new Set<string>();
    const businessName = business.business_name?.toLowerCase() || '';

    executions.forEach(exec => {
      if (!(exec as any).mention_analysis) return;
      try {
        const analysis = JSON.parse((exec as any).mention_analysis);
        if (analysis.rankings && Array.isArray(analysis.rankings)) {
          analysis.rankings.forEach((ranking: any) => {
            if (!ranking.company) return;
            const companyName = ranking.company.trim();
            const companyLower = companyName.toLowerCase();
            // Skip if it's the business itself or already a tracked competitor
            if (companyLower === businessName) return;
            if (competitorDomainMap.has(companyLower)) return;
            // Add to suggested competitors
            suggestedCompetitorNames.add(companyLower);
          });
        }
      } catch (e) {}
    });

    // Helper function to check if a domain belongs to a suggested competitor
    const isSuggestedCompetitorDomain = (domain: string): boolean => {
      const domainLower = domain.toLowerCase();
      for (const suggestedName of suggestedCompetitorNames) {
        // Check if domain contains the suggested competitor name
        const nameNoSpaces = suggestedName.replace(/\s+/g, '');
        if (domainLower.includes(nameNoSpaces) || nameNoSpaces.includes(domainLower.split('.')[0])) {
          return true;
        }
      }
      return false;
    };

    // Get prompts for topic mapping
    const prompts = dbHelpers.getPromptsByBusiness.all(businessIdNum) as any[];
    const promptTopicMap = new Map<number, string>();
    prompts.forEach(p => {
      promptTopicMap.set(p.id, p.topic || p.category || 'General');
    });

    // Analyze sources
    const sourceDataMap = new Map<string, SourceData>();

    executions.forEach(exec => {
      if (!exec.sources) return;

      const brandMentioned = (exec.brand_mentions || 0) > 0;
      let competitorsMentioned: string[] = [];
      if (exec.competitors_mentioned) {
        try {
          competitorsMentioned = JSON.parse(exec.competitors_mentioned);
        } catch (e) {}
      }
      const hasCompetitor = competitorsMentioned.length > 0;

      try {
        const sources = JSON.parse(exec.sources);
        sources.forEach((source: any) => {
          if (!source.domain) return;

          const existing = sourceDataMap.get(source.domain) || {
            domain: source.domain,
            url: source.url,
            type: source.type || 'Other',
            frequency: 0,
            brandPresent: 0,
            competitorPresent: 0,
            promptsAppearing: new Set<number>(),
            urls: new Set<string>(),
          };

          existing.frequency++;
          if (brandMentioned) existing.brandPresent++;
          if (hasCompetitor) existing.competitorPresent++;
          existing.promptsAppearing.add(exec.prompt_id);
          if (source.url) existing.urls.add(source.url);

          sourceDataMap.set(source.domain, existing);
        });
      } catch (e) {}
    });

    // Categorize sources by type
    const editorialSources: SourceData[] = [];
    const ugcSources: SourceData[] = [];
    const referenceSources: SourceData[] = [];
    const competitorSources: SourceData[] = [];

    sourceDataMap.forEach((data) => {
      // Skip your own domain
      if (business.website && data.domain.includes(business.website.replace(/^https?:\/\//, '').split('/')[0])) {
        return;
      }

      // Skip competitor domains - they won't support our brand
      const competitorOwner = getCompetitorOwner(data.domain);
      if (competitorOwner) {
        data.ownerCompetitor = competitorOwner;
        competitorSources.push(data);
        return;
      }

      // Skip suggested competitor domains (brands mentioned in LLM responses but not tracked)
      if (isSuggestedCompetitorDomain(data.domain)) {
        competitorSources.push(data);
        return;
      }

      switch (data.type) {
        case 'Editorial':
          editorialSources.push(data);
          break;
        case 'UGC':
          ugcSources.push(data);
          break;
        case 'Reference':
        case 'Institutional':
          referenceSources.push(data);
          break;
        case 'Competitor':
          competitorSources.push(data);
          break;
        default:
          // Classify based on domain patterns
          if (isUGCDomain(data.domain)) {
            data.type = 'UGC';
            ugcSources.push(data);
          } else if (isReferenceDomain(data.domain)) {
            data.type = 'Reference';
            referenceSources.push(data);
          } else {
            data.type = 'Editorial';
            editorialSources.push(data);
          }
      }
    });

    // Generate Editorial Opportunities
    const editorialOpportunities: EditorialOpportunity[] = editorialSources
      .filter(s => s.frequency >= 2) // At least 2 appearances
      .map(source => {
        const brandPresenceRate = source.frequency > 0 ? Math.round((source.brandPresent / source.frequency) * 100) : 0;
        const competitorPresenceRate = source.frequency > 0 ? Math.round((source.competitorPresent / source.frequency) * 100) : 0;

        // Priority: high frequency + low brand presence + high competitor presence
        const priorityScore = Math.round(
          source.frequency * 5 +
          (100 - brandPresenceRate) * 0.3 +
          competitorPresenceRate * 0.5
        );

        const priority = (priorityScore > 50 ? 'high' : priorityScore > 25 ? 'medium' : 'low') as 'high' | 'medium' | 'low';

        // Get related topics
        const relatedTopics = Array.from(source.promptsAppearing)
          .map(pid => promptTopicMap.get(pid))
          .filter((t): t is string => !!t)
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 5);

        return {
          domain: source.domain,
          type: source.type as 'Editorial' | 'Reference' | 'Institutional',
          frequency: source.frequency,
          brandPresence: brandPresenceRate,
          competitorPresence: competitorPresenceRate,
          priority,
          priorityScore,
          recommendedAction: getEditorialAction(source, brandPresenceRate, competitorPresenceRate),
          pitchType: getPitchType(source.domain, relatedTopics),
          exampleUrls: Array.from(source.urls).slice(0, 3),
          relatedTopics,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    // Generate UGC Opportunities
    const ugcOpportunities: UGCOpportunity[] = ugcSources
      .filter(s => s.frequency >= 1)
      .map(source => {
        const brandPresenceRate = source.frequency > 0 ? Math.round((source.brandPresent / source.frequency) * 100) : 0;
        const competitorPresenceRate = source.frequency > 0 ? Math.round((source.competitorPresent / source.frequency) * 100) : 0;

        const priorityScore = Math.round(
          source.frequency * 4 +
          (100 - brandPresenceRate) * 0.4 +
          competitorPresenceRate * 0.6
        );

        const priority = (priorityScore > 40 ? 'high' : priorityScore > 20 ? 'medium' : 'low') as 'high' | 'medium' | 'low';
        const platform = getUGCPlatform(source.domain);

        return {
          domain: source.domain,
          type: 'UGC' as const,
          platform,
          frequency: source.frequency,
          brandPresence: brandPresenceRate,
          competitorPresence: competitorPresenceRate,
          priority,
          priorityScore,
          recommendedAction: getUGCAction(source, platform, brandPresenceRate),
          engagementStrategy: getEngagementStrategy(platform),
          suggestedAngles: getSuggestedAngles(platform, Array.from(source.promptsAppearing).map(pid => promptTopicMap.get(pid)).filter(Boolean) as string[]),
          exampleUrls: Array.from(source.urls).slice(0, 3),
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    // Generate Reference/Authority Opportunities
    const referenceOpportunities = referenceSources
      .filter(s => s.frequency >= 2)
      .map(source => {
        const brandPresenceRate = source.frequency > 0 ? Math.round((source.brandPresent / source.frequency) * 100) : 0;
        const competitorPresenceRate = source.frequency > 0 ? Math.round((source.competitorPresent / source.frequency) * 100) : 0;

        const priorityScore = Math.round(
          source.frequency * 6 +
          (100 - brandPresenceRate) * 0.2 +
          competitorPresenceRate * 0.3
        );

        return {
          domain: source.domain,
          type: source.type,
          frequency: source.frequency,
          brandPresence: brandPresenceRate,
          competitorPresence: competitorPresenceRate,
          priority: (priorityScore > 40 ? 'high' : priorityScore > 20 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
          priorityScore,
          recommendedAction: getReferenceAction(source, brandPresenceRate),
          contentType: getReferenceContentType(source.domain),
          exampleUrls: Array.from(source.urls).slice(0, 3),
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    // Generate Outreach Targets (combined prioritized list)
    const outreachTargets: OutreachTarget[] = [];

    // Add editorial targets
    editorialOpportunities.slice(0, 10).forEach(opp => {
      outreachTargets.push({
        domain: opp.domain,
        type: 'Editorial',
        outreachType: opp.brandPresence < 20 ? 'pr' : 'guest-post',
        priority: opp.priority,
        contactStrategy: getContactStrategy(opp.domain, 'editorial'),
        pitchIdea: opp.pitchType,
        estimatedEffort: opp.brandPresence < 10 ? 'high' : 'medium',
        estimatedImpact: Math.min(100, opp.priorityScore * 1.5),
      });
    });

    // Add UGC targets
    ugcOpportunities.slice(0, 10).forEach(opp => {
      outreachTargets.push({
        domain: opp.domain,
        type: 'UGC',
        outreachType: 'community',
        priority: opp.priority,
        contactStrategy: getContactStrategy(opp.domain, 'ugc'),
        pitchIdea: opp.engagementStrategy,
        estimatedEffort: 'low',
        estimatedImpact: Math.min(100, opp.priorityScore * 1.2),
      });
    });

    // Add reference targets
    referenceOpportunities.slice(0, 5).forEach(opp => {
      outreachTargets.push({
        domain: opp.domain,
        type: 'Reference',
        outreachType: 'partnership',
        priority: opp.priority as 'high' | 'medium' | 'low',
        contactStrategy: getContactStrategy(opp.domain, 'reference'),
        pitchIdea: opp.contentType,
        estimatedEffort: 'high',
        estimatedImpact: Math.min(100, opp.priorityScore * 2),
      });
    });

    // Sort by impact
    outreachTargets.sort((a, b) => b.estimatedImpact - a.estimatedImpact);

    // Calculate summary stats
    const totalSources = sourceDataMap.size;
    const sourcesWithYou = Array.from(sourceDataMap.values()).filter(s => s.brandPresent > 0).length;
    const sourcesWithCompetitors = Array.from(sourceDataMap.values()).filter(s => s.competitorPresent > 0).length;
    const gapSources = Array.from(sourceDataMap.values()).filter(s => s.brandPresent === 0 && s.competitorPresent > 0).length;

    const summary = {
      totalThirdPartySources: totalSources,
      sourcesWithYourBrand: sourcesWithYou,
      sourcesWithCompetitors: sourcesWithCompetitors,
      gapSources: gapSources,
      editorialOpportunities: editorialOpportunities.length,
      ugcOpportunities: ugcOpportunities.length,
      referenceOpportunities: referenceOpportunities.length,
      highPriorityTargets: outreachTargets.filter(t => t.priority === 'high').length,
    };

    // Source type breakdown
    const sourceTypeBreakdown = {
      editorial: editorialSources.length,
      ugc: ugcSources.length,
      reference: referenceSources.length,
      competitor: competitorSources.length,
    };

    // Generate Competitor Content Insights - analyze what competitor content is being cited
    // and recommend similar content you should create
    const competitorContentInsights: CompetitorContentInsight[] = [];

    // Group competitor sources by competitor name
    const competitorSourcesByName = new Map<string, SourceData[]>();
    competitorSources.forEach(source => {
      if (source.ownerCompetitor) {
        const existing = competitorSourcesByName.get(source.ownerCompetitor) || [];
        existing.push(source);
        competitorSourcesByName.set(source.ownerCompetitor, existing);
      }
    });

    // Generate insights for each competitor
    competitorSourcesByName.forEach((sources, competitorName) => {
      // Calculate total citations across all their content
      const totalCitations = sources.reduce((sum, s) => sum + s.frequency, 0);

      if (totalCitations < 2) return; // Skip if barely cited

      // Collect all URLs and topics
      const allUrls: string[] = [];
      const allTopics = new Set<string>();
      sources.forEach(s => {
        s.urls.forEach(url => allUrls.push(url));
        s.promptsAppearing.forEach(pid => {
          const topic = promptTopicMap.get(pid);
          if (topic) allTopics.add(topic);
        });
      });

      // Find the main domain for this competitor
      const mainDomain = sources.sort((a, b) => b.frequency - a.frequency)[0].domain;

      // Determine priority based on citation frequency
      const priority: 'high' | 'medium' | 'low' = totalCitations >= 10 ? 'high' : totalCitations >= 5 ? 'medium' : 'low';

      // Generate content recommendation based on topics and frequency
      const topicsArray = Array.from(allTopics);
      const contentRecommendation = generateContentRecommendation(competitorName, totalCitations, topicsArray, allUrls);

      competitorContentInsights.push({
        competitorName,
        competitorDomain: mainDomain,
        citationCount: totalCitations,
        exampleUrls: allUrls.slice(0, 5),
        topicsAddressed: topicsArray.slice(0, 5),
        contentRecommendation,
        priority,
      });
    });

    // Sort by citation count (highest first)
    competitorContentInsights.sort((a, b) => b.citationCount - a.citationCount);

    return NextResponse.json({
      success: true,
      editorialOpportunities: editorialOpportunities.slice(0, 20),
      ugcOpportunities: ugcOpportunities.slice(0, 20),
      referenceOpportunities: referenceOpportunities.slice(0, 15),
      outreachTargets: outreachTargets.slice(0, 25),
      competitorContentInsights: competitorContentInsights.slice(0, 10),
      summary,
      sourceTypeBreakdown,
    });

  } catch (error: any) {
    console.error('[Offpage Roadmap API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions
function isUGCDomain(domain: string): boolean {
  const ugcPatterns = [
    'reddit.com', 'quora.com', 'facebook.com', 'twitter.com', 'x.com',
    'linkedin.com', 'medium.com', 'dev.to', 'stackoverflow.com',
    'discourse', 'forum', 'community', 'groups', 'discuss'
  ];
  return ugcPatterns.some(p => domain.toLowerCase().includes(p));
}

function isReferenceDomain(domain: string): boolean {
  const refPatterns = [
    'wikipedia.org', 'britannica.com', '.gov', '.edu', '.org',
    'statista.com', 'pew', 'research', 'institute', 'foundation'
  ];
  return refPatterns.some(p => domain.toLowerCase().includes(p));
}

function getUGCPlatform(domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes('reddit')) return 'Reddit';
  if (d.includes('facebook') || d.includes('fb.com')) return 'Facebook';
  if (d.includes('twitter') || d.includes('x.com')) return 'Twitter/X';
  if (d.includes('linkedin')) return 'LinkedIn';
  if (d.includes('quora')) return 'Quora';
  if (d.includes('medium')) return 'Medium';
  if (d.includes('stackoverflow') || d.includes('stackexchange')) return 'Stack Exchange';
  if (d.includes('discord')) return 'Discord';
  if (d.includes('slack')) return 'Slack Community';
  if (d.includes('forum') || d.includes('community') || d.includes('discuss')) return 'Forum';
  return 'Community Platform';
}

function getEditorialAction(source: SourceData, brandPresence: number, competitorPresence: number): string {
  if (brandPresence === 0 && competitorPresence > 50) {
    return 'High-priority PR outreach - competitors dominate this publication';
  }
  if (brandPresence === 0) {
    return 'Pitch for inclusion in relevant articles or round-ups';
  }
  if (brandPresence < competitorPresence) {
    return 'Increase presence through guest posts or expert commentary';
  }
  return 'Maintain relationship and look for new feature opportunities';
}

function getPitchType(domain: string, topics: string[]): string {
  const topicStr = topics.slice(0, 2).join(' and ');

  if (domain.includes('techcrunch') || domain.includes('venturebeat') || domain.includes('wired')) {
    return `Tech industry story on ${topicStr || 'your solution'}`;
  }
  if (domain.includes('forbes') || domain.includes('inc.com') || domain.includes('entrepreneur')) {
    return `Business/leadership angle on ${topicStr || 'industry trends'}`;
  }
  if (domain.includes('review') || domain.includes('pcmag') || domain.includes('cnet')) {
    return `Product review or comparison piece`;
  }
  return `Expert commentary or feature on ${topicStr || 'your expertise'}`;
}

function getUGCAction(source: SourceData, platform: string, brandPresence: number): string {
  if (brandPresence === 0) {
    return `Establish presence on ${platform} through helpful, non-promotional engagement`;
  }
  if (brandPresence < 30) {
    return `Increase activity with valuable contributions and community participation`;
  }
  return `Maintain active presence and build community relationships`;
}

function getEngagementStrategy(platform: string): string {
  switch (platform) {
    case 'Reddit':
      return 'Answer questions authentically, share expertise in relevant subreddits, avoid self-promotion';
    case 'Facebook':
      return 'Join relevant groups, provide value-first responses, build relationships before mentioning your solution';
    case 'LinkedIn':
      return 'Share thought leadership content, engage with industry discussions, connect with decision-makers';
    case 'Quora':
      return 'Answer questions thoroughly with data and examples, link to resources only when genuinely helpful';
    case 'Twitter/X':
      return 'Engage in industry conversations, share insights, build relationships with influencers';
    case 'Stack Exchange':
      return 'Provide detailed technical answers, build reputation through quality contributions';
    default:
      return 'Participate authentically, provide value, build credibility before any promotional content';
  }
}

function getSuggestedAngles(platform: string, topics: string[]): string[] {
  const angles: string[] = [];

  if (topics.length > 0) {
    angles.push(`Share expertise on ${topics[0]}`);
    if (topics.length > 1) {
      angles.push(`Answer questions about ${topics[1]}`);
    }
  }

  angles.push('Share case studies or success stories');
  angles.push('Provide helpful tips without direct promotion');
  angles.push('Engage with questions about your industry');

  return angles.slice(0, 4);
}

function getReferenceAction(source: SourceData, brandPresence: number): string {
  if (brandPresence === 0) {
    return 'Create authoritative content to earn citations from this source';
  }
  return 'Maintain and update existing content to stay referenced';
}

function getReferenceContentType(domain: string): string {
  if (domain.includes('wikipedia')) {
    return 'Ensure Wikipedia-notable presence with reliable third-party sources';
  }
  if (domain.includes('statista') || domain.includes('research')) {
    return 'Publish original research or data studies';
  }
  if (domain.includes('.gov') || domain.includes('.edu')) {
    return 'Create educational or compliance-focused content';
  }
  return 'Develop evergreen authority content on your expertise';
}

function getContactStrategy(domain: string, type: string): string {
  switch (type) {
    case 'editorial':
      return 'Find editors/journalists on LinkedIn or Twitter, personalize pitch based on their recent coverage';
    case 'ugc':
      return 'Join community, observe norms, contribute value before any promotion';
    case 'reference':
      return 'Create cite-worthy content, reach out to content managers for inclusion opportunities';
    default:
      return 'Research the right contact and personalize your outreach';
  }
}

function generateContentRecommendation(competitorName: string, citationCount: number, topics: string[], urls: string[]): string {
  // Analyze URLs to determine content type patterns
  const urlPatterns = urls.join(' ').toLowerCase();
  const hasDocumentation = urlPatterns.includes('docs') || urlPatterns.includes('documentation') || urlPatterns.includes('guide');
  const hasBlog = urlPatterns.includes('blog') || urlPatterns.includes('post') || urlPatterns.includes('article');
  const hasComparison = urlPatterns.includes('vs') || urlPatterns.includes('compare') || urlPatterns.includes('alternative');
  const hasPricing = urlPatterns.includes('pricing') || urlPatterns.includes('plans') || urlPatterns.includes('cost');
  const hasFeatures = urlPatterns.includes('feature') || urlPatterns.includes('product') || urlPatterns.includes('solution');

  const topicStr = topics.length > 0 ? topics.slice(0, 2).join(' and ') : 'your industry';

  // High citation count = competitor's content is very authoritative
  if (citationCount >= 10) {
    if (hasDocumentation) {
      return `${competitorName}'s documentation is heavily cited (${citationCount}x). Create comprehensive, well-organized technical documentation and guides that can become the go-to reference for ${topicStr}.`;
    }
    if (hasBlog) {
      return `${competitorName}'s blog content is frequently sourced (${citationCount}x). Publish authoritative thought leadership content with original research and data on ${topicStr}.`;
    }
    if (hasComparison) {
      return `${competitorName} dominates comparison queries (${citationCount}x). Create objective, comprehensive comparison content that highlights your unique strengths in ${topicStr}.`;
    }
    return `${competitorName}'s content is highly cited by LLMs (${citationCount}x). Create superior, more comprehensive content on ${topicStr} with better structure, more examples, and fresher data.`;
  }

  // Medium citation count
  if (citationCount >= 5) {
    if (hasDocumentation) {
      return `${competitorName}'s docs appear in AI responses (${citationCount}x). Improve your documentation with clear examples, FAQs, and getting-started guides for ${topicStr}.`;
    }
    if (hasPricing) {
      return `${competitorName}'s pricing/plans pages are being cited (${citationCount}x). Create transparent, detailed pricing content and ROI calculators.`;
    }
    if (hasFeatures) {
      return `${competitorName}'s feature pages are sourced (${citationCount}x). Build comprehensive feature descriptions with use cases and comparisons.`;
    }
    return `${competitorName} is getting cited for ${topicStr} (${citationCount}x). Create in-depth content addressing the same topics with your unique perspective.`;
  }

  // Lower citation count
  if (hasComparison) {
    return `Create comparison content positioning yourself against ${competitorName} for queries about ${topicStr}.`;
  }
  return `${competitorName} is being cited for ${topicStr}. Create authoritative content on these topics to compete for AI citations.`;
}
