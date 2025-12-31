import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';
import { suggestAdditionalTopics } from '@/app/lib/services/ai.service';

interface BusinessRecord {
  id: number;
  business_name: string;
  website: string;
}

interface TopicRecord {
  id: number;
  name: string;
}

interface StrategyRecord {
  primary_goal: string;
  goals: string;
  product_segments: string;
  target_markets: string;
  target_personas: string;
  funnel_stages: string;
}

// POST /api/dashboard/topics/suggest
// Get AI-suggested topics for a business
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId } = body;

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

    // Get existing topics to avoid duplicates
    const existingTopics = dbHelpers.getTopicsByBusiness.all(businessId) as TopicRecord[];
    const existingTopicNames = existingTopics.map(t => t.name);

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
    const suggestions = await suggestAdditionalTopics(
      businessId,
      business.business_name,
      business.website,
      existingTopicNames,
      strategy
    );

    return NextResponse.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error suggesting topics:', error);
    return NextResponse.json(
      { error: 'Failed to generate topic suggestions' },
      { status: 500 }
    );
  }
}
