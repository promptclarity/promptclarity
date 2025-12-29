import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { platformId, budgetLimit, warningThreshold } = body;

    if (!platformId) {
      return NextResponse.json({ error: 'platformId is required' }, { status: 400 });
    }

    // Validate budget limit (can be null to remove limit)
    const budgetLimitValue = budgetLimit === null || budgetLimit === '' ? null : parseFloat(budgetLimit);
    if (budgetLimitValue !== null && (isNaN(budgetLimitValue) || budgetLimitValue < 0)) {
      return NextResponse.json({ error: 'Invalid budget limit' }, { status: 400 });
    }

    // Validate warning threshold (default 80%)
    const warningThresholdValue = warningThreshold ? parseInt(warningThreshold, 10) : 80;
    if (isNaN(warningThresholdValue) || warningThresholdValue < 0 || warningThresholdValue > 100) {
      return NextResponse.json({ error: 'Warning threshold must be between 0 and 100' }, { status: 400 });
    }

    // Update the platform budget
    dbHelpers.updatePlatformBudget.run({
      id: platformId,
      budgetLimit: budgetLimitValue,
      warningThreshold: warningThresholdValue,
    });

    return NextResponse.json({
      success: true,
      message: 'Budget updated successfully',
    });
  } catch (error) {
    console.error('Error updating platform budget:', error);
    return NextResponse.json(
      { error: 'Failed to update budget' },
      { status: 500 }
    );
  }
}
