import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers, runTransaction } from '@/app/lib/db/database';
import { generatePromptsForTopics } from '@/app/lib/services/ai.service';
import type { BusinessRecord, TopicRecord, PromptRecord, Strategy } from '@/app/lib/types';

interface StrategyRecord {
  primary_goal: string;
  goals: string;
  product_segments: string;
  target_markets: string;
  target_personas: string;
  funnel_stages: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, prompts, generateSuggestions } = body;

    if (!businessId) {
      return NextResponse.json(
          { error: 'Business ID is required' },
          { status: 400 }
      );
    }

    // Get business details
    const business = dbHelpers.getBusiness.get(businessId) as BusinessRecord;
    if (!business) {
      return NextResponse.json(
          { error: 'Business not found' },
          { status: 404 }
      );
    }

    // Generate AI-powered suggestions
    if (generateSuggestions) {
      try {
        // Get topics for the business
        const topics = dbHelpers.getTopicsByBusiness.all(businessId) as TopicRecord[];
        
        if (topics.length === 0) {
          return NextResponse.json(
              { error: 'No topics found for this business' },
              { status: 400 }
          );
        }

        // Get strategy for better prompt generation
        const strategyRecord = dbHelpers.getBusinessStrategy.get(businessId) as StrategyRecord | undefined;
        const strategy: Strategy | undefined = strategyRecord ? {
          primaryGoal: strategyRecord.primary_goal as Strategy['primaryGoal'],
          goals: (strategyRecord.goals ? JSON.parse(strategyRecord.goals) : [strategyRecord.primary_goal]) as Strategy['goals'],
          productSegments: JSON.parse(strategyRecord.product_segments || '[]'),
          targetMarkets: JSON.parse(strategyRecord.target_markets || '[]'),
          targetPersonas: JSON.parse(strategyRecord.target_personas || '[]'),
          funnelStages: JSON.parse(strategyRecord.funnel_stages || '[]'),
        } : undefined;

        // Call AI service to generate prompts
        const generatedPrompts = await generatePromptsForTopics(
            businessId,
            business.business_name,
            business.website,
            topics.map(t => t.name),
            strategy
        );

        // Map prompts to include topic IDs and new metadata
        const promptsWithIds = generatedPrompts.map((prompt, index) => {
          const topic = topics.find(t => t.name === prompt.topicName);
          return {
            id: `generated-${index}`,
            text: prompt.text,
            topicId: topic?.id || topics[0].id,
            topicName: prompt.topicName,
            funnelStage: null,
            persona: null,
            tags: [],
          };
        });

        return NextResponse.json({
          success: true,
          prompts: promptsWithIds,
          generated: true
        });
      } catch (error) {
        console.error('Error generating prompts:', error);
        return NextResponse.json(
            { error: 'Failed to generate prompts', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
      }
    }

    // Save user-modified prompts
    if (prompts && Array.isArray(prompts)) {
      console.log('[PromptsAPI] Saving prompts for business:', businessId, 'Count:', prompts.length);

      // Get current valid topics for this business to validate/remap topic IDs
      const validTopics = dbHelpers.getTopicsByBusiness.all(businessId) as TopicRecord[];
      const validTopicIds = new Set(validTopics.map(t => t.id));
      const topicNameToId = new Map(validTopics.map(t => [t.name.toLowerCase(), t.id]));

      console.log('[PromptsAPI] Valid topic IDs:', Array.from(validTopicIds));

      const savedPrompts = runTransaction(() => {
        console.log('[PromptsAPI] Deleting existing prompts');
        dbHelpers.deletePromptsByBusiness.run(businessId);

        const insertedPrompts: any[] = [];
        for (const prompt of prompts) {
          // Validate and parse topicId - must be a valid integer AND exist in current topics
          let topicId = null;
          if (prompt.topicId) {
            const parsedTopicId = typeof prompt.topicId === 'string' ? parseInt(prompt.topicId) : prompt.topicId;
            if (!isNaN(parsedTopicId) && validTopicIds.has(parsedTopicId)) {
              topicId = parsedTopicId;
            } else if (prompt.topicName) {
              // Try to find topic by name (case-insensitive) if ID is invalid/stale
              const matchedId = topicNameToId.get(prompt.topicName.toLowerCase());
              if (matchedId) {
                topicId = matchedId;
                console.log('[PromptsAPI] Remapped stale topicId', parsedTopicId, 'to', topicId, 'via name:', prompt.topicName);
              }
            }
          } else if (prompt.topicName) {
            // No topicId provided but topicName exists - find by name
            const matchedId = topicNameToId.get(prompt.topicName.toLowerCase());
            if (matchedId) {
              topicId = matchedId;
            }
          }

          console.log('[PromptsAPI] Processing prompt:', { text: prompt.text?.substring(0, 50), originalTopicId: prompt.topicId, resolvedTopicId: topicId });

          const result = dbHelpers.createPrompt.run({
            businessId,
            topicId,
            text: prompt.text,
            isCustom: prompt.isCustom ? 1 : 0,
            funnelStage: prompt.funnelStage || null,
            persona: prompt.persona || null,
            tags: prompt.tags ? JSON.stringify(prompt.tags) : null,
            topicCluster: prompt.topicCluster || prompt.topicName || null
          });

          insertedPrompts.push({
            ...prompt,
            id: result.lastInsertRowid.toString()
          });
        }

        dbHelpers.updateSession.run({
          businessId,
          stepCompleted: 5  // PROMPTS is step 5
        });

        // Clean up any topics that no longer have prompts
        dbHelpers.deleteOrphanedTopics.run(businessId);

        return insertedPrompts;
      });

      return NextResponse.json({
        success: true,
        prompts: savedPrompts
      });
    }

    return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
    );
  } catch (error) {
    console.error('[PromptsAPI] Error handling prompts:', error);
    console.error('[PromptsAPI] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
        { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
          { error: 'Business ID is required' },
          { status: 400 }
      );
    }

    const prompts = dbHelpers.getPromptsByBusiness.all(parseInt(businessId)) as PromptRecord[];

    return NextResponse.json({
      success: true,
      prompts: prompts.map((prompt: any) => ({
        id: prompt.id.toString(),
        text: prompt.text,
        topicId: prompt.topic_id,
        topicName: prompt.topic_name,
        isCustom: prompt.is_custom,
        funnelStage: prompt.funnel_stage,
        persona: prompt.persona,
        tags: prompt.tags ? JSON.parse(prompt.tags) : [],
        topicCluster: prompt.topic_cluster
      }))
    });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
    );
  }
}