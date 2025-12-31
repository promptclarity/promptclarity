import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { perplexity } from '@ai-sdk/perplexity';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { z } from 'zod';
import { promptConfig } from '@/app/lib/config/prompts';
import { dbHelpers } from '@/app/lib/db/database';
import { PlatformRecord, Strategy } from '@/app/lib/types';
import { getPlatformConfig } from '@/app/lib/config/platforms';

// Schema for topic validation
const TopicSchema = z.object({
    name: z.string(),
});

const TopicsResponseSchema = z.object({
    topics: z.array(TopicSchema).min(5).max(30),
});

// Schema for prompt validation
const PromptSchema = z.object({
    text: z.string(),
    topicName: z.string(),
});

const PromptsResponseSchema = z.object({
    prompts: z.array(PromptSchema),
});

// Schema for competitor validation
const CompetitorSchema = z.object({
    name: z.string(),
    website: z.string().optional(),
    description: z.string().optional(),
});

const CompetitorsResponseSchema = z.object({
    competitors: z.array(CompetitorSchema).min(3).max(10),
});

export type GeneratedTopic = z.infer<typeof TopicSchema>;
export type TopicsResponse = z.infer<typeof TopicsResponseSchema>;
export type GeneratedPrompt = z.infer<typeof PromptSchema>;
export type PromptsResponse = z.infer<typeof PromptsResponseSchema>;
export type GeneratedCompetitor = z.infer<typeof CompetitorSchema>;
export type CompetitorsResponse = z.infer<typeof CompetitorsResponseSchema>;

// Get AI platform based on business's primary platform
function getAIModel(businessId: number) {
    try {
        // Get all platforms for the business
        const platforms = dbHelpers.getPlatformsByBusiness.all(businessId) as PlatformRecord[];
        
        // Find the primary platform (already sorted by is_primary DESC)
        const primaryPlatform = platforms.find(p => p.is_primary) || platforms[0];
        
        if (!primaryPlatform) {
            console.error(`No AI platforms found for business ${businessId}`);
            // Fallback to a default model
            return anthropic('claude-3-5-sonnet-latest');
        }

        // Get platform configuration
        const config = getPlatformConfig(primaryPlatform.platform_id);
        if (!config) {
            console.error(`Platform configuration not found for ${primaryPlatform.platform_id}`);
            return anthropic('claude-3-5-sonnet-latest');
        }
        
        // Set the API key in environment
        switch (config.provider) {
            case 'openai':
                process.env.OPENAI_API_KEY = primaryPlatform.api_key;
                return openai(config.model);
            case 'anthropic':
                process.env.ANTHROPIC_API_KEY = primaryPlatform.api_key;
                return anthropic(config.model);
            case 'google':
                process.env.GOOGLE_GENERATIVE_AI_API_KEY = primaryPlatform.api_key;
                return google(config.model);
            case 'xai':
                process.env.XAI_API_KEY = primaryPlatform.api_key;
                return xai(config.model);
            case 'perplexity':
                process.env.PERPLEXITY_API_KEY = primaryPlatform.api_key;
                return perplexity(config.model);
            default:
                console.error(`Unsupported provider: ${config.provider}`);
                return anthropic('claude-3-5-sonnet-latest');
        }
    } catch (error) {
        console.error('Error getting AI model:', error);
        // Fallback to a default model
        return anthropic('claude-3-5-sonnet-latest');
    }
}

export async function generateTopicsForBusiness(
    businessId: number,
    businessName: string,
    website: string,
    strategy?: Strategy
): Promise<GeneratedTopic[]> {
    try {
        const model = getAIModel(businessId);

        // Load prompt configuration
        const config = promptConfig.getConfig('topics');
        if (!config) {
            throw new Error('Topics prompt configuration not found');
        }

        // Build strategy context for better topic generation
        // Focus on mid/bottom funnel topics that elicit brand mentions
        let strategyContext = '';
        if (strategy) {
            const parts: string[] = [];

            // Goals influence what types of topics to focus on (mid/bottom funnel only)
            if (strategy.goals && strategy.goals.length > 0) {
                const goalGuidance: Record<string, string> = {
                    'visibility': 'Focus on competitive positioning topics - "[competitor] alternatives", category comparison topics',
                    'sentiment': 'Focus on reputation and positioning topics - comparison categories, review topics, "[brand] vs [brand]" categories',
                    'leads': 'Focus on conversion-oriented topics - "best X for Y" categories, specific product categories, decision-stage topics',
                };
                const goalHints = strategy.goals
                    .map(goal => goalGuidance[goal])
                    .filter(Boolean)
                    .join('. ');
                if (goalHints) {
                    parts.push(`GOALS: ${goalHints}`);
                }
            } else if (strategy.primaryGoal) {
                const goalGuidance: Record<string, string> = {
                    'visibility': 'Focus on competitive positioning topics - "[competitor] alternatives", category comparison topics',
                    'sentiment': 'Focus on reputation and positioning topics - comparison categories, review topics, "[brand] vs [brand]" categories',
                    'leads': 'Focus on conversion-oriented topics - "best X for Y" categories, specific product categories, decision-stage topics',
                };
                if (goalGuidance[strategy.primaryGoal]) {
                    parts.push(`PRIMARY GOAL: ${goalGuidance[strategy.primaryGoal]}`);
                }
            }

            // Funnel stages - skip awareness, focus on consideration/decision
            if (strategy.funnelStages && strategy.funnelStages.length > 0) {
                const stageGuidance: Record<string, string> = {
                    'awareness': '', // Skip - doesn't drive brand mentions
                    'consideration': 'solution comparison topics, "best X for Y" categories, "[competitor] alternatives" topics',
                    'decision': 'purchase-decision topics, pricing/review categories, specific product categories',
                };
                const stageHints = strategy.funnelStages
                    .map(stage => stageGuidance[stage.toLowerCase()])
                    .filter(Boolean)
                    .join(', ');
                if (stageHints) {
                    parts.push(`FUNNEL FOCUS: Include ${stageHints}`);
                }
            }

            // Target personas should influence topic relevance
            if (strategy.targetPersonas && strategy.targetPersonas.length > 0) {
                const personaList = strategy.targetPersonas.join(', ');
                parts.push(`TARGET PERSONAS: Generate topics relevant to: ${personaList}. Consider what product categories and use cases these personas would search for.`);
            }

            // Product segments can create segment-specific topics
            if (strategy.productSegments && strategy.productSegments.length > 0) {
                const segmentList = strategy.productSegments.join(', ');
                parts.push(`PRODUCT SEGMENTS: Generate specific product category topics for: ${segmentList}`);
            }

            // Target markets for industry/regional relevance
            if (strategy.targetMarkets && strategy.targetMarkets.length > 0) {
                const marketList = strategy.targetMarkets.join(', ');
                parts.push(`TARGET MARKETS: Consider these markets/industries: ${marketList}`);
            }

            if (parts.length > 0) {
                strategyContext = '\n\nSTRATEGY CONTEXT:\n' + parts.join('\n');
            }
        }

        // Format the prompt with actual values
        const prompt = promptConfig.formatPrompt(config.userPromptTemplate, {
            businessName,
            website,
            strategyContext: strategyContext,
        });

        const { object } = await generateObject({
            model,
            schema: TopicsResponseSchema,
            prompt,
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.maxOutputTokens || 15000,
        } as any) as { object: TopicsResponse | null };

        if (!object?.topics || object.topics.length === 0) {
            throw new Error('No topics generated');
        }

        return object.topics;
    } catch (error) {
        console.error('Error generating topics:', error);
        throw error;
    }
}

// Fallback topics in case AI generation fails
function getFallbackTopics(businessName: string): GeneratedTopic[] {
    return [
        {
            name: `${businessName} reviews`,
        },
        {
            name: `${businessName} vs competitors`,
        },
        {
            name: `${businessName} pricing`,
        },
        {
            name: `${businessName} features`,
        },
        {
            name: `${businessName} alternatives`,
        },
        {
            name: `${businessName} integration`,
        },
        {
            name: `Industry trends`,
        },
        {
            name: `Customer support`,
        },
        {
            name: `Use cases`,
        },
        {
            name: `Best practices`,
        },
    ];
}

export async function generatePromptsForTopics(
    businessId: number,
    businessName: string,
    website: string,
    topics: string[],
    strategy?: Strategy
): Promise<GeneratedPrompt[]> {
    try {
        const model = getAIModel(businessId);

        // Load prompt configuration
        const config = promptConfig.getConfig('prompts');
        if (!config) {
            throw new Error('Prompts prompt configuration not found');
        }

        // Build strategy context for better prompt generation
        let strategyContext = '';
        if (strategy) {
            const parts: string[] = [];

            // Goals influence the type of prompts we generate
            if (strategy.goals && strategy.goals.length > 0) {
                const goalGuidance: Record<string, string> = {
                    'visibility': 'Prioritize educational "what is" and "how does X work" queries that introduce the category. Focus on top-of-funnel discovery questions.',
                    'sentiment': 'Prioritize "X vs Y", "[competitor] alternatives", and comparison queries. Include reputation and brand perception prompts.',
                    'leads': 'Prioritize bottom-of-funnel queries like "best X for [use case]", "X pricing", "X reviews", and decision-stage comparison queries.',
                };
                const goalHints = strategy.goals
                    .map(goal => goalGuidance[goal])
                    .filter(Boolean)
                    .join('. ');
                if (goalHints) {
                    parts.push(`GOALS: ${goalHints}`);
                }
            } else if (strategy.primaryGoal) {
                // Fallback for backwards compatibility
                const goalGuidance: Record<string, string> = {
                    'visibility': 'Prioritize educational "what is" and "how does X work" queries that introduce the category. Focus on top-of-funnel discovery questions.',
                    'sentiment': 'Prioritize "X vs Y", "[competitor] alternatives", and comparison queries. Include reputation and brand perception prompts.',
                    'leads': 'Prioritize bottom-of-funnel queries like "best X for [use case]", "X pricing", "X reviews", and decision-stage comparison queries.',
                };
                if (goalGuidance[strategy.primaryGoal]) {
                    parts.push(`PRIMARY GOAL: ${goalGuidance[strategy.primaryGoal]}`);
                }
            }

            // Funnel stages determine query intent distribution
            if (strategy.funnelStages.length > 0) {
                const stageExamples: Record<string, string> = {
                    'awareness': '"what is X", "how does X work", "X explained"',
                    'consideration': '"best X for Y", "X vs Y", "top X tools"',
                    'decision': '"X reviews", "X pricing", "is X worth it", "X alternatives"',
                };
                const stageHints = strategy.funnelStages
                    .map(stage => stageExamples[stage.toLowerCase()])
                    .filter(Boolean)
                    .join('; ');
                if (stageHints) {
                    parts.push(`FUNNEL FOCUS: Generate queries matching these stages - ${stageHints}.`);
                }
            }

            // Target personas should generate persona-specific prompts
            if (strategy.targetPersonas.length > 0) {
                const personaList = strategy.targetPersonas.join(', ');
                parts.push(`TARGET PERSONAS: Generate prompts from the perspective of: ${personaList}. Include "I am a [persona] looking for..." and "[persona] tools" style queries for each persona.`);
            }

            // Product segments help tailor specificity
            if (strategy.productSegments.length > 0) {
                const segmentList = strategy.productSegments.join(', ');
                parts.push(`PRODUCT SEGMENTS: Tailor prompts to these segments: ${segmentList}. Include segment-specific queries like "X for [segment]" or "[segment] X solutions".`);
            }

            // Target markets can influence regional/industry context
            if (strategy.targetMarkets.length > 0) {
                const marketList = strategy.targetMarkets.join(', ');
                parts.push(`TARGET MARKETS: Consider these markets when relevant: ${marketList}. Include market-specific queries where appropriate.`);
            }

            if (parts.length > 0) {
                strategyContext = '\n\nSTRATEGY CONTEXT:\n' + parts.join('\n');
            }
        }

        // Format the prompt with actual values
        const prompt = promptConfig.formatPrompt(config.userPromptTemplate, {
            businessName,
            website,
            topics: topics.join(', '),
            minPrompts: topics.length * 3,
            maxPrompts: topics.length * 5,
            strategyContext: strategyContext,
            currentYear: new Date().getFullYear().toString(),
        });

        const { object } = await generateObject({
            model,
            schema: PromptsResponseSchema,
            prompt,
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.maxOutputTokens || 15000,
        } as any) as { object: PromptsResponse | null };

        if (!object?.prompts || object.prompts.length === 0) {
            throw new Error('No prompts generated');
        }

        return object.prompts;
    } catch (error) {
        console.error('Error generating prompts:', error);
        throw error;
    }
}

// Fallback prompts in case AI generation fails
function getFallbackPrompts(businessName: string, topics: string[]): GeneratedPrompt[] {
    const prompts: GeneratedPrompt[] = [];
    const currentYear = new Date().getFullYear();

    for (const topic of topics) {
        prompts.push({
            text: `What are the best ${topic.toLowerCase()} solutions in ${currentYear}?`,
            topicName: topic,
        });
        
        prompts.push({
            text: `Compare top ${topic.toLowerCase()} providers`,
            topicName: topic,
        });
        
        if (prompts.length < topics.length * 3) {
            prompts.push({
                text: `${businessName} vs alternatives for ${topic.toLowerCase()}`,
                topicName: topic,
            });
        }
    }
    
    return prompts;
}

export async function generateCompetitorsForBusiness(
    businessId: number,
    businessName: string,
    website: string,
    topics: string[]
): Promise<GeneratedCompetitor[]> {
    try {
        const model = getAIModel(businessId);
        
        // Load prompt configuration
        const config = promptConfig.getConfig('competitors');
        if (!config) {
            throw new Error('Competitors prompt configuration not found');
        }

        // Format the prompt with actual values
        const prompt = promptConfig.formatPrompt(config.userPromptTemplate, {
            businessName,
            website,
            topics: topics.join(', ')
        });

        const { object } = await generateObject({
            model,
            schema: CompetitorsResponseSchema,
            prompt,
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.maxOutputTokens || 15000,
        } as any) as { object: CompetitorsResponse | null };

        if (!object?.competitors || object.competitors.length === 0) {
            throw new Error('No competitors generated');
        }

        return object.competitors;
    } catch (error) {
        console.error('Error generating competitors:', error);
        throw error;
    }
}

// Fallback competitors in case AI generation fails
function getFallbackCompetitors(businessName: string): GeneratedCompetitor[] {
    return [
        {
            name: 'Competitor A',
            description: 'Leading solution in this space',
        },
        {
            name: 'Competitor B',
            description: 'Popular alternative platform',
        },
        {
            name: 'Competitor C',
            description: 'Enterprise-focused solution',
        },
        {
            name: 'Competitor D',
            description: 'Emerging player in the market',
        },
        {
            name: 'Competitor E',
            description: 'Budget-friendly option',
        },
    ];
}

// Schema for topic suggestions
const TopicSuggestionSchema = z.object({
    name: z.string(),
    reason: z.string(),
});

const TopicSuggestionsResponseSchema = z.object({
    suggestions: z.array(TopicSuggestionSchema).min(3).max(8),
});

// Schema for prompt suggestions with intent classification
// Focus on mid-funnel and bottom-funnel intents that actually elicit brand mentions
const PromptSuggestionSchema = z.object({
    text: z.string(),
    topicId: z.number(),
    topicName: z.string(),
    intent: z.enum(['evaluation', 'advice']), // Removed 'awareness' - top of funnel rarely mentions brands
    reason: z.string(),
});

const PromptSuggestionsResponseSchema = z.object({
    suggestions: z.array(PromptSuggestionSchema).min(3).max(15),
});

export type TopicSuggestion = z.infer<typeof TopicSuggestionSchema>;
export type PromptSuggestion = z.infer<typeof PromptSuggestionSchema>;

/**
 * Suggest additional topics for a business based on existing topics and strategy
 *
 * Identifies topic gaps by:
 * 1. Analyze existing topic coverage
 * 2. Consider persona-specific topic needs
 * 3. Fill gaps in funnel coverage
 * 4. Add competitive comparison topics
 * 5. Include market/segment-specific topics
 */
export async function suggestAdditionalTopics(
    businessId: number,
    businessName: string,
    website: string,
    existingTopics: string[],
    strategy?: Strategy
): Promise<TopicSuggestion[]> {
    try {
        const model = getAIModel(businessId);

        // Build comprehensive strategy context
        let personaContext = '';
        if (strategy?.targetPersonas?.length) {
            personaContext = `\n\nTARGET PERSONAS:\n${strategy.targetPersonas.map(p => `- ${p}`).join('\n')}\nConsider what topics each persona would search for and care about.`;
        }

        let funnelContext = '';
        if (strategy?.funnelStages?.length) {
            const stageTopicGuidance: Record<string, string> = {
                'awareness': 'Awareness topics: Problem-awareness categories, educational topic clusters (e.g., "what is [category]")',
                'consideration': 'Consideration topics: Solution comparison categories, "best X for Y" topics, feature-comparison topics',
                'decision': 'Decision topics: Pricing/review categories, "X vs Y" comparison topics, purchase-decision clusters',
            };
            const stages = strategy.funnelStages.map(s => stageTopicGuidance[s.toLowerCase()]).filter(Boolean);
            funnelContext = `\n\nFUNNEL STAGE TOPIC NEEDS:\n${stages.join('\n')}`;
        }

        let marketContext = '';
        if (strategy?.targetMarkets?.length) {
            marketContext = `\n\nTARGET MARKETS: ${strategy.targetMarkets.join(', ')}\nConsider market-specific or industry-specific topic clusters.`;
        }

        let segmentContext = '';
        if (strategy?.productSegments?.length) {
            segmentContext = `\n\nPRODUCT SEGMENTS: ${strategy.productSegments.join(', ')}\nConsider segment-specific topics that buyers in each segment would search for.`;
        }

        let goalsContext = '';
        if (strategy?.goals?.length) {
            const goalTopicGuidance: Record<string, string> = {
                'visibility': 'For visibility: Add broad awareness topics where the brand should appear in discovery',
                'sentiment': 'For sentiment: Add comparison and alternative topics where brand positioning matters',
                'leads': 'For leads: Add decision-stage topics that capture buying intent',
            };
            const goals = strategy.goals.map(g => goalTopicGuidance[g]).filter(Boolean);
            goalsContext = `\n\nGOALS-BASED TOPIC NEEDS:\n${goals.join('\n')}`;
        }

        const prompt = `You are an AI visibility analyst identifying topic gaps.

BUSINESS CONTEXT:
Business: ${businessName} (${website})

EXISTING TOPICS BEING TRACKED:
${existingTopics.map(t => `- ${t}`).join('\n')}
${personaContext}${funnelContext}${marketContext}${segmentContext}${goalsContext}

TOPIC GAP ANALYSIS METHODOLOGY:

1. PERSONA-BASED GAP ANALYSIS
   - What topics would each persona search for that aren't covered?
   - Technical users need feature-specific topics
   - Business users need outcome/ROI-focused topics
   - Different roles have different terminology

2. FUNNEL COVERAGE GAPS
   - Are awareness-stage topics covered? (problem-focused)
   - Are consideration-stage topics covered? (comparison-focused)
   - Are decision-stage topics covered? (purchase-focused)

3. COMPETITIVE LANDSCAPE GAPS
   - "X alternatives" topics
   - "X vs Y" category topics
   - Alternative approach topics

4. USE CASE GAPS
   - Specific job-to-be-done topics
   - Industry-specific application topics
   - Company-size-specific topics (SMB vs enterprise)

5. FEATURE/CAPABILITY GAPS
   - Key differentiator topics
   - Technical capability topics
   - Integration/ecosystem topics

TOPIC CATEGORIES TO FILL:

1. CORE PRODUCT CATEGORY - What the product fundamentally is or replaces
2. TECHNICAL FEATURES - Key capabilities buyers search for
3. USE CASES - Jobs-to-be-done the product solves
4. DEPLOYMENT/MODEL - How product is deployed/consumed
5. ADJACENT CATEGORIES - Related products in buyer journey
6. COMPETITIVE POSITIONING - Alternative/comparison topics

Suggest 5-8 NEW TOPICS that fill gaps in the existing coverage.

REQUIREMENTS:
- Each topic should be 2-5 words
- Topics must represent BUYING CONTEXTS where brands get recommended
- Focus on gaps: What's missing from the existing topic list?
- Think about what each persona would search for
- Consider all funnel stages

BAD TOPICS (avoid):
- Too generic: "technology", "solutions", "tools"
- Overlaps existing: ${existingTopics.slice(0, 5).join(', ')}
- Educational-only: Topics that don't lead to product recommendations

GOOD TOPICS (specific buying contexts):
- "endpoint security solutions" (category)
- "remote team collaboration tools" (use case + category)
- "zero trust alternatives" (competitive)
- "enterprise network management" (segment-specific)

For each topic, explain:
- What gap it fills (persona, funnel stage, competitive, etc.)
- Why it would capture valuable buying intent`;

        const { object } = await generateObject({
            model,
            schema: TopicSuggestionsResponseSchema,
            prompt,
            temperature: 0.7,
            maxOutputTokens: 5000,
        } as any) as { object: { suggestions: TopicSuggestion[] } | null };

        if (!object?.suggestions) {
            return [];
        }

        // Filter out any that are too similar to existing topics
        return object.suggestions.filter(s =>
            !existingTopics.some(existing =>
                existing.toLowerCase().includes(s.name.toLowerCase()) ||
                s.name.toLowerCase().includes(existing.toLowerCase())
            )
        );
    } catch (error) {
        console.error('Error suggesting topics:', error);
        return [];
    }
}

/**
 * Suggest additional prompts for a business based on topics and existing prompts
 *
 * Methodology:
 * 1. Customer personas and how they ask questions
 * 2. Key topics defined for the brand
 * 3. Geographic context when relevant
 * 4. Topic variants with different phrasing styles
 * 5. Fill gaps with mid-funnel questions, persona-specific angles, and competitive comparisons
 */
export async function suggestAdditionalPrompts(
    businessId: number,
    businessName: string,
    website: string,
    topics: Array<{ id: number; name: string }>,
    existingPromptTexts: string[],
    strategy?: Strategy
): Promise<PromptSuggestion[]> {
    try {
        const model = getAIModel(businessId);
        const currentYear = new Date().getFullYear();

        // Build persona context
        let personaContext = '';
        if (strategy?.targetPersonas?.length) {
            const personaDetails = strategy.targetPersonas.map(persona => {
                return `- ${persona}: Think about how this persona asks questions, their pain points, technical sophistication, and what they search for when evaluating solutions`;
            }).join('\n');
            personaContext = `\n\nTARGET PERSONAS (generate prompts from each perspective):\n${personaDetails}`;
        }

        // Build funnel stage context - focus on mid/bottom funnel only (these get brand mentions)
        let funnelContext = '';
        if (strategy?.funnelStages?.length) {
            const stageMapping: Record<string, string> = {
                'awareness': '', // Skip - top of funnel rarely mentions brands
                'consideration': 'CONSIDERATION stage (mid-funnel): Comparison questions - "Which is better...", "What are the best...", "How does X compare to...", "[Solution] alternatives"',
                'decision': 'DECISION stage (bottom-funnel): Purchase-ready questions - "Is X worth it?", "X pricing", "X vs Y for [specific use case]", "X reviews"',
            };
            const stages = strategy.funnelStages.map(s => stageMapping[s.toLowerCase()]).filter(Boolean);
            if (stages.length) {
                funnelContext = `\n\nFUNNEL STAGES TO COVER:\n${stages.join('\n')}`;
            }
        }

        // Build market/geographic context
        let marketContext = '';
        if (strategy?.targetMarkets?.length) {
            marketContext = `\n\nTARGET MARKETS/REGIONS: ${strategy.targetMarkets.join(', ')}\nInclude market-specific prompts where relevant (e.g., "best X for [market]", "X solutions in [region]")`;
        }

        // Build product segment context
        let segmentContext = '';
        if (strategy?.productSegments?.length) {
            segmentContext = `\n\nPRODUCT SEGMENTS: ${strategy.productSegments.join(', ')}\nGenerate prompts that address each segment's specific needs`;
        }

        const topicsWithIds = topics.map(t => `${t.name} (ID: ${t.id})`).join('\n- ');

        const prompt = `You are an AI visibility analyst generating MID-FUNNEL and BOTTOM-FUNNEL search prompts that elicit brand/product mentions.

BUSINESS CONTEXT:
Business: ${businessName} (${website})

KEY TOPICS (with IDs):
- ${topicsWithIds}
${personaContext}${funnelContext}${marketContext}${segmentContext}

Current year: ${currentYear}

EXISTING PROMPTS (analyze for gaps):
${existingPromptTexts.slice(0, 30).map(p => `- ${p}`).join('\n')}

CRITICAL: ONLY MID-FUNNEL AND BOTTOM-FUNNEL PROMPTS

DO NOT generate top-of-funnel/awareness prompts like:
- "What is X?" - AI just explains concepts, doesn't mention brands
- "How does X work?" - Educational, no product recommendations
- "Explain the benefits of X" - Informational only

ONLY generate prompts where AI assistants naturally recommend specific products/brands.

PROMPT GENERATION METHODOLOGY:

1. PERSONA-DRIVEN PROMPTS
   Consider how each target persona asks questions:
   - Technical users: specific terminology, feature-focused comparisons
   - Business users: ROI-focused, "best for" style
   - Beginners: simple language, "how do I achieve X" (not "what is X")

2. INTENT CLASSIFICATION (assign one to each prompt):
   - "evaluation": Comparing/evaluating solutions (MID-FUNNEL)
     "What are the best...", "Which is better...", "X alternatives", "X vs Y", "Top X for..."
   - "advice": How-to guidance that leads to recommendations (BOTTOM-FUNNEL)
     "How can I [achieve goal]...", "How do I set up...", "What's the best way to..."

3. GAP FILLING - Generate prompts that fill these gaps:
   - Competitive comparisons (vs alternatives, alternatives to, X vs Y)
   - Use-case specific (best X for [specific scenario])
   - Constraint-based (X without [limitation], X that doesn't require [barrier])
   - Persona-specific angles (each persona's perspective)
   - Feature combinations (X that offers [feature A] and [feature B])

4. PHRASING VARIANTS - Use different question styles:
   - "What are the best..." (seeking recommendations)
   - "Which..." (seeking comparison)
   - "Are there..." (seeking options with constraints)
   - "[Solution] alternatives" (competitive)
   - "How can I..." (guidance-seeking that leads to product recs)
   - "What services/tools offer..." (feature-seeking)

PROMPT TEMPLATES:

EVALUATION prompts (mid-funnel - comparing solutions):
- "What are the best [solutions] for [use case]?"
- "Which [solutions] offer [feature A] and [feature B]?"
- "Are there [solutions] that support [requirement] without [limitation]?"
- "[Competitor/Solution] alternatives"
- "What [solutions] work best for [business size/type]?"
- "Top [solutions] for [specific use case] in ${currentYear}"

ADVICE prompts (bottom-funnel - ready to act):
- "How can I [achieve goal] without [barrier]?"
- "How do I set up [solution type] for [use case]?"
- "What's the best way to [accomplish task] for [audience]?"
- "How can I [achieve goal] with minimal [constraint]?"

Generate 12-15 NEW prompts that:
1. Are MID-FUNNEL or BOTTOM-FUNNEL only (NO top-of-funnel educational prompts)
2. Will elicit specific brand/product recommendations from AI
3. Cover multiple personas' perspectives
4. Include both evaluation and advice intents
5. Fill gaps in existing prompt coverage

AVOID:
- Prompts containing "${businessName}"
- TOP-OF-FUNNEL prompts ("What is...", "How does X work...", "Explain...")
- Generic educational prompts that won't mention brands
- Duplicates or near-duplicates of existing prompts
- Prompts over 15 words

For each prompt, provide:
- text: The prompt text (natural language question)
- topicId: The numeric ID of the most relevant topic
- topicName: The name of that topic
- intent: "evaluation" or "advice" (NO awareness)
- reason: Why this prompt fills a gap (persona angle, competitive comparison, use-case, etc.)`;

        const { object } = await generateObject({
            model,
            schema: PromptSuggestionsResponseSchema,
            prompt,
            temperature: 0.7,
            maxOutputTokens: 8000,
        } as any) as { object: { suggestions: PromptSuggestion[] } | null };

        if (!object?.suggestions) {
            return [];
        }

        // Filter out any that are too similar to existing prompts
        return object.suggestions.filter(s =>
            !existingPromptTexts.some(existing =>
                existing.toLowerCase() === s.text.toLowerCase() ||
                (existing.toLowerCase().includes(s.text.toLowerCase().substring(0, 20)) && s.text.length < 30)
            )
        );
    } catch (error) {
        console.error('Error suggesting prompts:', error);
        return [];
    }
}

// Schema for persona suggestion
const PersonaSuggestionSchema = z.object({
    title: z.string().describe('The job title or role (e.g., "CTO", "Marketing Director")'),
    description: z.string().describe('Brief description of why this persona is relevant'),
});

const PersonaSuggestionsResponseSchema = z.object({
    personas: z.array(PersonaSuggestionSchema).min(5).max(10),
});

export type PersonaSuggestion = z.infer<typeof PersonaSuggestionSchema>;

/**
 * Suggest target personas based on the business
 * Uses AI to analyze the business website and generate relevant buyer personas
 */
export async function suggestPersonas(
    businessId: number,
    businessName: string,
    website: string
): Promise<PersonaSuggestion[]> {
    try {
        const model = getAIModel(businessId);

        const prompt = `You are an expert in B2B/B2C buyer personas and sales strategy.

BUSINESS TO ANALYZE:
- Business Name: ${businessName}
- Website: ${website}

Based on this business (and your knowledge of what businesses with similar websites/names typically sell), identify the TARGET BUYER PERSONAS who would:
1. Research and discover this product/service
2. Evaluate and compare solutions
3. Make the purchasing decision
4. Influence the buying process

Consider:
- Who has the BUDGET authority to purchase?
- Who has the AUTHORITY to make the decision?
- Who has the NEED this product solves?
- Who RESEARCHES solutions in this space?

IMPORTANT GUIDELINES:
- Focus on DECISION MAKERS and INFLUENCERS, not end-users
- Include both technical and business roles where relevant
- Be specific to the industry/vertical this business serves
- Include job titles that commonly search for this type of solution
- Think about who would ask AI assistants for recommendations

Return 6-8 personas with their job titles and a brief explanation of why they're relevant.`;

        const { object } = await generateObject({
            model,
            schema: PersonaSuggestionsResponseSchema,
            prompt,
        });

        return object.personas;
    } catch (error) {
        console.error('Error suggesting personas:', error);
        return [];
    }
}