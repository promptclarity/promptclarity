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
  analysis_details?: string;
}

interface Prompt {
  id: number;
  business_id: number;
  prompt_text: string;
  category?: string;
  topic?: string;
}

interface ContentGap {
  promptId: number;
  promptText: string;
  category: string;
  topic: string;
  competitorsWinning: string[];
  winningCompetitorCount: number;
  sourcesUsed: SourceInfo[];
  gapScore: number; // Higher = more important to address
  executionCount: number;
  yourVisibility: number;
  avgCompetitorVisibility: number;
}

interface SourceInfo {
  domain: string;
  url?: string;
  type: string;
  frequency: number; // How often this source appears
}

interface ContentRecommendation {
  type: 'new-content' | 'content-upgrade';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  targetPrompt: string;
  suggestedFormat: string;
  keyTopics: string[];
  competitorSources: string[];
  estimatedImpact: number; // 1-100
}

interface TopicAnalysis {
  topic: string;
  category: string;
  promptCount: number;
  yourWinRate: number;
  competitorWinRate: number;
  topCompetitors: { name: string; wins: number }[];
  topSources: { domain: string; frequency: number }[];
  contentGapScore: number;
}

// Segment analysis types
interface SegmentAnalysis {
  segmentName: string;
  segmentType: 'industry' | 'use-case' | 'product' | 'persona';
  promptCount: number;
  yourVisibility: number;
  overallVisibility: number;
  visibilityGap: number; // positive = underperforming vs overall
  strongPrompts: SegmentPrompt[];
  weakPrompts: SegmentPrompt[];
  topCompetitors: { name: string; wins: number }[];
  topSources: { domain: string; type: string; frequency: number }[];
  contentBriefs: ContentBrief[];
  outreachTargets: OutreachTarget[];
  gapScore: number;
}

interface SegmentPrompt {
  promptId: number;
  promptText: string;
  yourVisibility: number;
  competitorVisibility: number;
}

interface ContentBrief {
  title: string;
  type: 'landing-page' | 'blog-post' | 'guide' | 'comparison';
  description: string;
  targetKeywords: string[];
  priority: 'high' | 'medium' | 'low';
}

interface OutreachTarget {
  domain: string;
  type: string;
  reason: string;
  suggestedApproach: string;
  priority: 'high' | 'medium' | 'low';
}

// Segment detection patterns
const INDUSTRY_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\b(law\s*firm|legal|attorney|lawyer)/i, name: 'Law Firms' },
  { pattern: /\b(healthcare|medical|hospital|clinic|doctor|patient)/i, name: 'Healthcare' },
  { pattern: /\b(e-?commerce|online\s*store|retail|shop)/i, name: 'E-commerce' },
  { pattern: /\b(real\s*estate|property|realtor|housing)/i, name: 'Real Estate' },
  { pattern: /\b(finance|financial|banking|investment|fintech)/i, name: 'Finance' },
  { pattern: /\b(saas|software|tech|startup)/i, name: 'SaaS/Tech' },
  { pattern: /\b(education|school|university|learning|student)/i, name: 'Education' },
  { pattern: /\b(restaurant|food|dining|hospitality)/i, name: 'Hospitality' },
  { pattern: /\b(manufacturing|industrial|factory)/i, name: 'Manufacturing' },
  { pattern: /\b(agency|marketing\s*agency|digital\s*agency)/i, name: 'Agencies' },
];

const USE_CASE_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\b(remote\s*team|work\s*from\s*home|distributed|remote\s*work)/i, name: 'Remote Teams' },
  { pattern: /\b(small\s*business|smb|startup)/i, name: 'Small Business' },
  { pattern: /\b(enterprise|large\s*company|corporation)/i, name: 'Enterprise' },
  { pattern: /\b(freelancer|solo|individual|personal)/i, name: 'Freelancers' },
  { pattern: /\b(team|collaboration|group)/i, name: 'Team Collaboration' },
  { pattern: /\b(automation|automate|automated)/i, name: 'Automation' },
  { pattern: /\b(integration|integrate|connect)/i, name: 'Integrations' },
  { pattern: /\b(mobile|app|ios|android)/i, name: 'Mobile' },
  { pattern: /\b(security|secure|privacy|compliance)/i, name: 'Security & Compliance' },
  { pattern: /\b(analytics|reporting|insights|dashboard)/i, name: 'Analytics & Reporting' },
];

const PERSONA_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\b(developer|engineer|programmer|coder)/i, name: 'Developers' },
  { pattern: /\b(marketer|marketing\s*team|growth)/i, name: 'Marketers' },
  { pattern: /\b(sales|salesperson|sales\s*team)/i, name: 'Sales Teams' },
  { pattern: /\b(designer|design\s*team|creative)/i, name: 'Designers' },
  { pattern: /\b(hr|human\s*resources|recruiting|hiring)/i, name: 'HR Teams' },
  { pattern: /\b(ceo|founder|executive|leadership)/i, name: 'Executives' },
  { pattern: /\b(customer\s*support|support\s*team|helpdesk)/i, name: 'Support Teams' },
  { pattern: /\b(product\s*manager|pm|product\s*team)/i, name: 'Product Managers' },
];

/**
 * GET /api/dashboard/content-roadmap
 * Generate content roadmap based on competitive analysis
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

    // Get all prompts for this business
    const prompts = dbHelpers.getPromptsByBusiness.all(businessIdNum) as Prompt[];

    // Get all executions
    const executions = dbHelpers.getAllPromptsExecutions.all(businessIdNum) as PromptExecution[];

    // Analyze content gaps by prompt
    const contentGaps: ContentGap[] = [];
    const topicAnalysisMap = new Map<string, {
      topic: string;
      category: string;
      promptCount: number;
      brandWins: number;
      competitorWins: number;
      totalExecutions: number;
      competitorWinMap: Map<string, number>;
      sourceFrequencyMap: Map<string, number>;
    }>();

    // Process each prompt
    prompts.forEach(prompt => {
      const promptExecutions = executions.filter(e => e.prompt_id === prompt.id);
      if (promptExecutions.length === 0) return;

      let brandWins = 0;
      let competitorWins = 0;
      const competitorWinMap = new Map<string, number>();
      const sourcesMap = new Map<string, SourceInfo>();

      promptExecutions.forEach(exec => {
        const brandMentioned = (exec.brand_mentions || 0) > 0;
        let competitorsMentioned: string[] = [];

        if (exec.competitors_mentioned) {
          try {
            competitorsMentioned = JSON.parse(exec.competitors_mentioned);
          } catch (e) {
            // Failed to parse
          }
        }

        if (brandMentioned) {
          brandWins++;
        }

        if (competitorsMentioned.length > 0 && !brandMentioned) {
          competitorWins++;
          competitorsMentioned.forEach(comp => {
            competitorWinMap.set(comp, (competitorWinMap.get(comp) || 0) + 1);
          });
        }

        // Track sources
        if (exec.sources) {
          try {
            const sources = JSON.parse(exec.sources);
            sources.forEach((source: any) => {
              if (!source.domain) return;
              const existing = sourcesMap.get(source.domain);
              if (existing) {
                existing.frequency++;
              } else {
                sourcesMap.set(source.domain, {
                  domain: source.domain,
                  url: source.url,
                  type: source.type || 'Other',
                  frequency: 1,
                });
              }
            });
          } catch (e) {
            // Failed to parse
          }
        }
      });

      // Calculate visibility percentages
      const totalExecs = promptExecutions.length;
      const yourVisibility = totalExecs > 0 ? Math.round((brandWins / totalExecs) * 100) : 0;
      const avgCompetitorVisibility = totalExecs > 0 ? Math.round((competitorWins / totalExecs) * 100) : 0;

      // Only include if competitors are winning more than you
      if (competitorWins > brandWins) {
        const competitorsWinning = Array.from(competitorWinMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name);

        const sourcesUsed = Array.from(sourcesMap.values())
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 10);

        // Calculate gap score: higher when competitors dominate and high volume
        const gapScore = Math.round(
          (avgCompetitorVisibility - yourVisibility) * 0.5 +
          competitorsWinning.length * 10 +
          totalExecs * 2
        );

        contentGaps.push({
          promptId: prompt.id,
          promptText: prompt.prompt_text,
          category: prompt.category || 'General',
          topic: prompt.topic || 'Uncategorized',
          competitorsWinning,
          winningCompetitorCount: competitorsWinning.length,
          sourcesUsed,
          gapScore,
          executionCount: totalExecs,
          yourVisibility,
          avgCompetitorVisibility,
        });
      }

      // Track topic-level analysis
      const topicKey = `${prompt.category || 'General'}|${prompt.topic || 'Uncategorized'}`;
      const topicData = topicAnalysisMap.get(topicKey) || {
        topic: prompt.topic || 'Uncategorized',
        category: prompt.category || 'General',
        promptCount: 0,
        brandWins: 0,
        competitorWins: 0,
        totalExecutions: 0,
        competitorWinMap: new Map<string, number>(),
        sourceFrequencyMap: new Map<string, number>(),
      };

      topicData.promptCount++;
      topicData.brandWins += brandWins;
      topicData.competitorWins += competitorWins;
      topicData.totalExecutions += totalExecs;

      // Merge competitor wins
      competitorWinMap.forEach((count, comp) => {
        if (comp) {
          topicData.competitorWinMap.set(comp, (topicData.competitorWinMap.get(comp) || 0) + count);
        }
      });

      // Merge source frequencies
      sourcesMap.forEach((source, domain) => {
        topicData.sourceFrequencyMap.set(domain, (topicData.sourceFrequencyMap.get(domain) || 0) + source.frequency);
      });

      topicAnalysisMap.set(topicKey, topicData);
    });

    // Sort content gaps by score
    contentGaps.sort((a, b) => b.gapScore - a.gapScore);

    // Generate topic analysis
    const topicAnalysis: TopicAnalysis[] = [];
    topicAnalysisMap.forEach((data) => {
      const yourWinRate = data.totalExecutions > 0
        ? Math.round((data.brandWins / data.totalExecutions) * 100)
        : 0;
      const competitorWinRate = data.totalExecutions > 0
        ? Math.round((data.competitorWins / data.totalExecutions) * 100)
        : 0;

      const topCompetitors = Array.from(data.competitorWinMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, wins]) => ({ name, wins }));

      const topSources = Array.from(data.sourceFrequencyMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, frequency]) => ({ domain, frequency }));

      const contentGapScore = Math.round(
        (competitorWinRate - yourWinRate) * 0.5 +
        topCompetitors.length * 5 +
        data.promptCount * 3
      );

      topicAnalysis.push({
        topic: data.topic,
        category: data.category,
        promptCount: data.promptCount,
        yourWinRate,
        competitorWinRate,
        topCompetitors,
        topSources,
        contentGapScore: Math.max(0, contentGapScore),
      });
    });

    // Sort topic analysis by gap score
    topicAnalysis.sort((a, b) => b.contentGapScore - a.contentGapScore);

    // Generate content recommendations
    const recommendations: ContentRecommendation[] = [];

    // Generate "net-new content" recommendations from top gaps
    contentGaps.slice(0, 10).forEach((gap, index) => {
      const isHighPriority = gap.gapScore > 50;
      const isMediumPriority = gap.gapScore > 25;

      // Determine suggested format based on prompt text
      let suggestedFormat = 'Comprehensive guide';
      const promptLower = gap.promptText.toLowerCase();
      if (promptLower.includes('best') || promptLower.includes('top')) {
        suggestedFormat = 'Comparison/listicle';
      } else if (promptLower.includes('how to') || promptLower.includes('guide')) {
        suggestedFormat = 'Step-by-step tutorial';
      } else if (promptLower.includes('vs') || promptLower.includes('versus')) {
        suggestedFormat = 'Head-to-head comparison';
      } else if (promptLower.includes('review')) {
        suggestedFormat = 'In-depth review';
      } else if (promptLower.includes('price') || promptLower.includes('cost')) {
        suggestedFormat = 'Pricing guide';
      }

      // Extract key topics from prompt
      const keyTopics = extractKeyTopics(gap.promptText, gap.category);

      recommendations.push({
        type: gap.yourVisibility === 0 ? 'new-content' : 'content-upgrade',
        priority: isHighPriority ? 'high' : isMediumPriority ? 'medium' : 'low',
        title: generateContentTitle(gap.promptText, gap.category),
        description: `${gap.competitorsWinning.slice(0, 3).join(', ')} ${gap.competitorsWinning.length > 3 ? `and ${gap.competitorsWinning.length - 3} others` : ''} are appearing in ${gap.avgCompetitorVisibility}% of responses for this query while you appear in ${gap.yourVisibility}%.`,
        targetPrompt: gap.promptText,
        suggestedFormat,
        keyTopics,
        competitorSources: gap.sourcesUsed.slice(0, 5).map(s => s.domain),
        estimatedImpact: Math.min(100, gap.gapScore),
      });
    });

    // Add topic-level recommendations
    topicAnalysis
      .filter(t => t.competitorWinRate > t.yourWinRate && t.contentGapScore > 20)
      .slice(0, 5)
      .forEach(topic => {
        recommendations.push({
          type: 'new-content',
          priority: topic.contentGapScore > 40 ? 'high' : 'medium',
          title: `Create ${topic.topic} hub page`,
          description: `You're underperforming in the "${topic.topic}" topic area (${topic.yourWinRate}% vs ${topic.competitorWinRate}% competitor visibility). Create comprehensive content covering this topic.`,
          targetPrompt: `All prompts in ${topic.topic}`,
          suggestedFormat: 'Topic hub/pillar page',
          keyTopics: [topic.topic, topic.category],
          competitorSources: topic.topSources.slice(0, 5).map(s => s.domain),
          estimatedImpact: Math.min(100, topic.contentGapScore * 2),
        });
      });

    // Sort recommendations by impact
    recommendations.sort((a, b) => b.estimatedImpact - a.estimatedImpact);

    // ============================================
    // SEGMENT ANALYSIS
    // ============================================

    // Calculate overall visibility for comparison
    let totalBrandWins = 0;
    let totalExecutions = 0;
    prompts.forEach(prompt => {
      const promptExecutions = executions.filter(e => e.prompt_id === prompt.id);
      promptExecutions.forEach(exec => {
        totalExecutions++;
        if ((exec.brand_mentions || 0) > 0) {
          totalBrandWins++;
        }
      });
    });
    const overallVisibility = totalExecutions > 0 ? Math.round((totalBrandWins / totalExecutions) * 100) : 0;

    // Detect segments from prompts
    const segmentMap = new Map<string, {
      segmentName: string;
      segmentType: 'industry' | 'use-case' | 'product' | 'persona';
      prompts: Array<{
        prompt: Prompt;
        executions: PromptExecution[];
        brandWins: number;
        competitorWins: number;
        competitorMap: Map<string, number>;
        sourceMap: Map<string, { domain: string; type: string; frequency: number }>;
      }>;
    }>();

    // Process each prompt for segment detection
    prompts.forEach(prompt => {
      const promptText = prompt.prompt_text;
      const promptExecutions = executions.filter(e => e.prompt_id === prompt.id);
      if (promptExecutions.length === 0) return;

      // Calculate stats for this prompt
      let brandWins = 0;
      let competitorWins = 0;
      const competitorMap = new Map<string, number>();
      const sourceMap = new Map<string, { domain: string; type: string; frequency: number }>();

      promptExecutions.forEach(exec => {
        const brandMentioned = (exec.brand_mentions || 0) > 0;
        if (brandMentioned) brandWins++;

        let competitorsMentioned: string[] = [];
        if (exec.competitors_mentioned) {
          try {
            competitorsMentioned = JSON.parse(exec.competitors_mentioned);
          } catch (e) {}
        }

        if (competitorsMentioned.length > 0 && !brandMentioned) {
          competitorWins++;
          competitorsMentioned.forEach(comp => {
            competitorMap.set(comp, (competitorMap.get(comp) || 0) + 1);
          });
        }

        if (exec.sources) {
          try {
            const sources = JSON.parse(exec.sources);
            sources.forEach((source: any) => {
              if (!source.domain) return;
              const existing = sourceMap.get(source.domain);
              if (existing) {
                existing.frequency++;
              } else {
                sourceMap.set(source.domain, {
                  domain: source.domain,
                  type: source.type || 'Other',
                  frequency: 1,
                });
              }
            });
          } catch (e) {}
        }
      });

      const promptData = { prompt, executions: promptExecutions, brandWins, competitorWins, competitorMap, sourceMap };

      // Detect industries
      INDUSTRY_PATTERNS.forEach(({ pattern, name }) => {
        if (pattern.test(promptText)) {
          const key = `industry:${name}`;
          if (!segmentMap.has(key)) {
            segmentMap.set(key, { segmentName: name, segmentType: 'industry', prompts: [] });
          }
          segmentMap.get(key)!.prompts.push(promptData);
        }
      });

      // Detect use cases
      USE_CASE_PATTERNS.forEach(({ pattern, name }) => {
        if (pattern.test(promptText)) {
          const key = `use-case:${name}`;
          if (!segmentMap.has(key)) {
            segmentMap.set(key, { segmentName: name, segmentType: 'use-case', prompts: [] });
          }
          segmentMap.get(key)!.prompts.push(promptData);
        }
      });

      // Detect personas
      PERSONA_PATTERNS.forEach(({ pattern, name }) => {
        if (pattern.test(promptText)) {
          const key = `persona:${name}`;
          if (!segmentMap.has(key)) {
            segmentMap.set(key, { segmentName: name, segmentType: 'persona', prompts: [] });
          }
          segmentMap.get(key)!.prompts.push(promptData);
        }
      });
    });

    // Build segment analysis
    const segmentAnalysis: SegmentAnalysis[] = [];

    segmentMap.forEach((segmentData) => {
      if (segmentData.prompts.length < 2) return; // Need at least 2 prompts for meaningful analysis

      // Aggregate stats
      let segmentBrandWins = 0;
      let segmentCompetitorWins = 0;
      let segmentTotalExecs = 0;
      const aggregatedCompetitors = new Map<string, number>();
      const aggregatedSources = new Map<string, { domain: string; type: string; frequency: number }>();

      const promptStats: Array<{
        promptId: number;
        promptText: string;
        yourVisibility: number;
        competitorVisibility: number;
        totalExecs: number;
      }> = [];

      segmentData.prompts.forEach(({ prompt, executions, brandWins, competitorWins, competitorMap, sourceMap }) => {
        const totalExecs = executions.length;
        segmentBrandWins += brandWins;
        segmentCompetitorWins += competitorWins;
        segmentTotalExecs += totalExecs;

        const yourVis = totalExecs > 0 ? Math.round((brandWins / totalExecs) * 100) : 0;
        const compVis = totalExecs > 0 ? Math.round((competitorWins / totalExecs) * 100) : 0;

        promptStats.push({
          promptId: prompt.id,
          promptText: prompt.prompt_text,
          yourVisibility: yourVis,
          competitorVisibility: compVis,
          totalExecs,
        });

        competitorMap.forEach((count, comp) => {
          aggregatedCompetitors.set(comp, (aggregatedCompetitors.get(comp) || 0) + count);
        });

        sourceMap.forEach((source, domain) => {
          const existing = aggregatedSources.get(domain);
          if (existing) {
            existing.frequency += source.frequency;
          } else {
            aggregatedSources.set(domain, { ...source });
          }
        });
      });

      const segmentVisibility = segmentTotalExecs > 0 ? Math.round((segmentBrandWins / segmentTotalExecs) * 100) : 0;
      const visibilityGap = overallVisibility - segmentVisibility;

      // Sort prompts by performance
      const sortedPrompts = [...promptStats].sort((a, b) => b.yourVisibility - a.yourVisibility);
      const strongPrompts = sortedPrompts
        .filter(p => p.yourVisibility >= overallVisibility)
        .slice(0, 5)
        .map(p => ({
          promptId: p.promptId,
          promptText: p.promptText,
          yourVisibility: p.yourVisibility,
          competitorVisibility: p.competitorVisibility,
        }));

      const weakPrompts = sortedPrompts
        .filter(p => p.yourVisibility < overallVisibility && p.competitorVisibility > p.yourVisibility)
        .slice(-5)
        .reverse()
        .map(p => ({
          promptId: p.promptId,
          promptText: p.promptText,
          yourVisibility: p.yourVisibility,
          competitorVisibility: p.competitorVisibility,
        }));

      const topCompetitors = Array.from(aggregatedCompetitors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, wins]) => ({ name, wins }));

      const topSources = Array.from(aggregatedSources.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10);

      // Generate content briefs for weak areas
      const contentBriefs: ContentBrief[] = [];
      weakPrompts.slice(0, 3).forEach(wp => {
        const promptLower = wp.promptText.toLowerCase();
        let briefType: ContentBrief['type'] = 'blog-post';
        let title = '';

        if (promptLower.includes('best') || promptLower.includes('top')) {
          briefType = 'comparison';
          title = `Best ${segmentData.segmentName} Solutions Comparison`;
        } else if (promptLower.includes('how to')) {
          briefType = 'guide';
          title = `${segmentData.segmentName} Implementation Guide`;
        } else {
          briefType = 'landing-page';
          title = `${segmentData.segmentName} Solutions`;
        }

        contentBriefs.push({
          title,
          type: briefType,
          description: `Create content targeting "${wp.promptText}" where competitors have ${wp.competitorVisibility}% visibility vs your ${wp.yourVisibility}%`,
          targetKeywords: [segmentData.segmentName.toLowerCase(), ...extractKeyTopics(wp.promptText, '')],
          priority: wp.competitorVisibility - wp.yourVisibility > 50 ? 'high' : wp.competitorVisibility - wp.yourVisibility > 25 ? 'medium' : 'low',
        });
      });

      // Add segment-level content brief if gap is significant
      if (visibilityGap > 10 && contentBriefs.length < 5) {
        contentBriefs.push({
          title: `${segmentData.segmentName} Industry Page`,
          type: 'landing-page',
          description: `Create a dedicated ${segmentData.segmentName.toLowerCase()} landing page. Your visibility in this segment (${segmentVisibility}%) is ${visibilityGap}% below your overall average.`,
          targetKeywords: [segmentData.segmentName.toLowerCase(), `${segmentData.segmentName.toLowerCase()} solutions`, `best for ${segmentData.segmentName.toLowerCase()}`],
          priority: visibilityGap > 20 ? 'high' : 'medium',
        });
      }

      // Generate outreach targets from top sources
      const outreachTargets: OutreachTarget[] = topSources
        .filter(s => s.type !== 'Competitor' && s.frequency >= 2)
        .slice(0, 5)
        .map(source => {
          let suggestedApproach = 'Pitch guest content or get featured';
          if (source.type === 'UGC') {
            suggestedApproach = 'Engage in discussions, answer questions, share expertise';
          } else if (source.type === 'Reference') {
            suggestedApproach = 'Submit for listing, contribute to documentation';
          } else if (source.type === 'Editorial') {
            suggestedApproach = 'Pitch story angle, offer expert quotes, submit guest post';
          }

          return {
            domain: source.domain,
            type: source.type,
            reason: `Cited ${source.frequency}x in ${segmentData.segmentName} queries`,
            suggestedApproach,
            priority: source.frequency >= 5 ? 'high' : source.frequency >= 3 ? 'medium' : 'low',
          };
        });

      const gapScore = Math.round(
        visibilityGap * 2 +
        weakPrompts.length * 10 +
        topCompetitors.length * 5
      );

      segmentAnalysis.push({
        segmentName: segmentData.segmentName,
        segmentType: segmentData.segmentType,
        promptCount: segmentData.prompts.length,
        yourVisibility: segmentVisibility,
        overallVisibility,
        visibilityGap,
        strongPrompts,
        weakPrompts,
        topCompetitors,
        topSources,
        contentBriefs,
        outreachTargets,
        gapScore: Math.max(0, gapScore),
      });
    });

    // Sort segments by gap score
    segmentAnalysis.sort((a, b) => b.gapScore - a.gapScore);

    // Calculate summary stats
    const summary = {
      totalContentGaps: contentGaps.length,
      highPriorityGaps: contentGaps.filter(g => g.gapScore > 50).length,
      topicsNeedingContent: topicAnalysis.filter(t => t.competitorWinRate > t.yourWinRate).length,
      averageYourVisibility: prompts.length > 0
        ? Math.round(contentGaps.reduce((sum, g) => sum + g.yourVisibility, 0) / Math.max(contentGaps.length, 1))
        : 0,
      averageCompetitorVisibility: prompts.length > 0
        ? Math.round(contentGaps.reduce((sum, g) => sum + g.avgCompetitorVisibility, 0) / Math.max(contentGaps.length, 1))
        : 0,
      totalRecommendations: recommendations.length,
      newContentNeeded: recommendations.filter(r => r.type === 'new-content').length,
      upgradesNeeded: recommendations.filter(r => r.type === 'content-upgrade').length,
    };

    return NextResponse.json({
      success: true,
      contentGaps: contentGaps.slice(0, 20),
      topicAnalysis: topicAnalysis.slice(0, 15),
      segmentAnalysis: segmentAnalysis.slice(0, 20),
      recommendations,
      summary: {
        ...summary,
        segmentsAnalyzed: segmentAnalysis.length,
        segmentsUnderperforming: segmentAnalysis.filter(s => s.visibilityGap > 0).length,
        overallVisibility,
      },
    });

  } catch (error: any) {
    console.error('[Content Roadmap API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function extractKeyTopics(promptText: string, category: string): string[] {
  const topics: string[] = [];

  // Add category
  if (category && category !== 'General') {
    topics.push(category);
  }

  // Extract potential topics from prompt
  const words = promptText.toLowerCase().split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'what', 'which', 'how', 'best', 'top', 'for', 'to', 'in', 'of', 'and', 'or']);

  words.forEach(word => {
    if (word.length > 3 && !stopWords.has(word)) {
      // Capitalize first letter
      const capitalized = word.charAt(0).toUpperCase() + word.slice(1);
      if (!topics.includes(capitalized) && topics.length < 5) {
        topics.push(capitalized);
      }
    }
  });

  return topics.slice(0, 5);
}

function generateContentTitle(promptText: string, category: string): string {
  const promptLower = promptText.toLowerCase();

  // Try to generate a meaningful title
  if (promptLower.includes('best')) {
    const match = promptText.match(/best\s+(.+?)(?:\s+for|\s+in|\?|$)/i);
    if (match) {
      return `Best ${match[1].trim()} Guide`;
    }
  }

  if (promptLower.includes('how to')) {
    const match = promptText.match(/how\s+to\s+(.+?)(?:\?|$)/i);
    if (match) {
      return `How to ${match[1].trim()}`;
    }
  }

  if (promptLower.includes('vs') || promptLower.includes('versus')) {
    return `${category} Comparison Guide`;
  }

  // Fallback: use first part of prompt
  const cleanPrompt = promptText.replace(/[?.,!]/g, '').trim();
  const words = cleanPrompt.split(' ').slice(0, 6);
  return words.join(' ') + (words.length < cleanPrompt.split(' ').length ? '...' : '');
}
