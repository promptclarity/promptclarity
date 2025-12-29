import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers, runTransaction } from '@/app/lib/db/database';
import { generateTopicsForBusiness } from '@/app/lib/services/ai.service';
import type { TopicRecord, BusinessRecord, Strategy } from '@/app/lib/types';

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
    const { businessId, topics, generateSuggestions } = body;

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
        // Get strategy for better topic generation
        const strategyRecord = dbHelpers.getBusinessStrategy.get(businessId) as StrategyRecord | undefined;
        const strategy: Strategy | undefined = strategyRecord ? {
          primaryGoal: strategyRecord.primary_goal as Strategy['primaryGoal'],
          goals: strategyRecord.goals ? JSON.parse(strategyRecord.goals) : [],
          productSegments: JSON.parse(strategyRecord.product_segments || '[]'),
          targetMarkets: JSON.parse(strategyRecord.target_markets || '[]'),
          targetPersonas: JSON.parse(strategyRecord.target_personas || '[]'),
          funnelStages: JSON.parse(strategyRecord.funnel_stages || '[]'),
        } : undefined;

        // Call AI service to generate topics with strategy context
        const generatedTopics = await generateTopicsForBusiness(
            businessId,
            business.business_name,
            business.website,
            strategy
        );

        // Return generated topics without saving to database
        // Topics will be saved when user clicks Next
        const topicsWithIds = generatedTopics.map((topic, index) => ({
          id: `generated-${index}`,
          ...topic
        }));

        return NextResponse.json({
          success: true,
          topics: topicsWithIds,
          generated: true
        });
      } catch (error) {
        console.error('Error generating topics:', error);
        return NextResponse.json(
            { error: 'Failed to generate topics', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
      }
    }

    // Save user-modified topics
    if (topics && Array.isArray(topics)) {
      const savedTopics = runTransaction(() => {
        dbHelpers.deleteTopicsByBusiness.run(businessId);

        const insertedTopics: any[] = [];
        for (const topic of topics) {
          const result = dbHelpers.createTopic.run({
            businessId,
            name: topic.name,
            isCustom: topic.isCustom ? 1 : 0
          });

          insertedTopics.push({
            ...topic,
            id: result.lastInsertRowid.toString()
          });
        }

        dbHelpers.updateSession.run({
          businessId,
          stepCompleted: 4  // Topics is step 4
        });

        return insertedTopics;
      });

      return NextResponse.json({
        success: true,
        topics: savedTopics
      });
    }

    return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
    );
  } catch (error) {
    console.error('Error handling topics:', error);
    return NextResponse.json(
        { error: 'Internal server error' },
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

    const topics = dbHelpers.getTopicsByBusiness.all(parseInt(businessId)) as TopicRecord[];

    return NextResponse.json({
      success: true,
      topics: topics.map(topic => ({
        id: topic.id.toString(),
        name: topic.name,
        isCustom: topic.is_custom
      }))
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
    );
  }
}