import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';
import { suggestAdditionalPrompts } from '@/app/lib/services/ai.service';

interface BusinessRecord {
  id: number;
  business_name: string;
  website: string;
}

interface TopicRecord {
  id: number;
  name: string;
}

interface PromptRecord {
  id: number;
  text: string;
  topic_id: number;
}

interface StrategyRecord {
  primary_goal: string;
  goals: string;
  product_segments: string;
  target_markets: string;
  target_personas: string;
  funnel_stages: string;
}

// POST /api/dashboard/prompts/suggest
// Get AI-suggested prompts for a business
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, topicId } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    // Check user has access to this business
    const accessCheck = await checkBusinessAccess(businessId);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status || 403 }
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

    // Get topics
    const topics = dbHelpers.getTopicsByBusiness.all(businessId) as TopicRecord[];

    // If topicId is specified, filter to just that topic
    const targetTopics = topicId
      ? topics.filter(t => t.id === topicId)
      : topics;

    if (targetTopics.length === 0) {
      return NextResponse.json(
        { error: 'No topics found' },
        { status: 400 }
      );
    }

    // Get existing prompts to avoid duplicates
    const existingPrompts = dbHelpers.getPromptsByBusiness.all(businessId) as PromptRecord[];
    const existingPromptTexts = existingPrompts.map(p => p.text.toLowerCase());

    // Get strategy for context
    const strategyRecord = dbHelpers.getBusinessStrategy.get(businessId) as StrategyRecord | undefined;
    const strategy = strategyRecord ? {
      primaryGoal: strategyRecord.primary_goal as any,
      goals: strategyRecord.goals ? JSON.parse(strategyRecord.goals) : [strategyRecord.primary_goal],
      productSegments: JSON.parse(strategyRecord.product_segments || '[]'),
      targetMarkets: JSON.parse(strategyRecord.target_markets || '[]'),
      targetPersonas: JSON.parse(strategyRecord.target_personas || '[]'),
      funnelStages: JSON.parse(strategyRecord.funnel_stages || '[]'),
    } : undefined;

    // Generate suggestions
    const suggestions = await suggestAdditionalPrompts(
      businessId,
      business.business_name,
      business.website,
      targetTopics.map(t => ({ id: t.id, name: t.name })),
      existingPromptTexts,
      strategy
    );

    return NextResponse.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error suggesting prompts:', error);
    return NextResponse.json(
      { error: 'Failed to generate prompt suggestions' },
      { status: 500 }
    );
  }
}
