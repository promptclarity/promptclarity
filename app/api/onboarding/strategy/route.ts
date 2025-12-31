import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';

interface StrategyRecord {
  id: number;
  business_id: number;
  primary_goal: string;
  goals: string;
  product_segments: string;
  target_markets: string;
  target_personas: string;
  funnel_stages: string;
  created_at: string;
  updated_at: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, strategy } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    // Validate: either goals array or primaryGoal must be set
    const hasGoals = strategy?.goals?.length > 0 || strategy?.primaryGoal;
    if (!strategy || !hasGoals || !strategy.funnelStages?.length) {
      return NextResponse.json(
        { error: 'Strategy with goals and funnelStages is required' },
        { status: 400 }
      );
    }

    // Save strategy to database
    dbHelpers.upsertBusinessStrategy.run({
      businessId: parseInt(businessId),
      primaryGoal: strategy.primaryGoal || (strategy.goals?.[0] ?? 'visibility'),
      goals: JSON.stringify(strategy.goals || [strategy.primaryGoal]),
      productSegments: JSON.stringify(strategy.productSegments || []),
      targetMarkets: JSON.stringify(strategy.targetMarkets || []),
      targetPersonas: JSON.stringify(strategy.targetPersonas || []),
      funnelStages: JSON.stringify(strategy.funnelStages || []),
    });

    // Update onboarding session
    dbHelpers.updateSession.run({
      businessId: parseInt(businessId),
      stepCompleted: 3, // Strategy is step 3
    });

    return NextResponse.json({
      success: true,
      message: 'Strategy saved successfully',
    });
  } catch (error) {
    console.error('Error saving strategy:', error);
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

    const strategy = dbHelpers.getBusinessStrategy.get(parseInt(businessId)) as StrategyRecord | undefined;

    if (!strategy) {
      // Return default strategy if none exists
      return NextResponse.json({
        success: true,
        strategy: {
          primaryGoal: 'visibility',
          goals: ['visibility'],
          productSegments: [],
          targetMarkets: [],
          targetPersonas: [],
          funnelStages: ['awareness', 'consideration', 'decision'],
        },
      });
    }

    // Parse goals, falling back to primaryGoal for backwards compatibility
    const goals = strategy.goals ? JSON.parse(strategy.goals) : [strategy.primary_goal];

    return NextResponse.json({
      success: true,
      strategy: {
        primaryGoal: strategy.primary_goal,
        goals: goals,
        productSegments: JSON.parse(strategy.product_segments || '[]'),
        targetMarkets: JSON.parse(strategy.target_markets || '[]'),
        targetPersonas: JSON.parse(strategy.target_personas || '[]'),
        funnelStages: JSON.parse(strategy.funnel_stages || '[]'),
      },
    });
  } catch (error) {
    console.error('Error fetching strategy:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
