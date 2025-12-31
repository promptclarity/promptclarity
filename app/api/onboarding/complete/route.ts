import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers } from '@/app/lib/db/database';
import { promptExecutionService } from '@/app/lib/services/prompt-execution.service';

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

    // Mark the onboarding session as completed
    const updateSessionStmt = db.prepare(`
      UPDATE onboarding_sessions
      SET completed = 1,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE business_id = ?
    `);

    const result = updateSessionStmt.run(businessId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Onboarding session not found' },
        { status: 404 }
      );
    }

    console.log(`Onboarding completed for business ID: ${businessId}`);

    // Set the next execution time to 24 hours from now
    // This establishes the business's execution schedule
    const nextExecutionTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    dbHelpers.setBusinessNextExecution.run({
      businessId,
      nextExecutionTime
    });
    console.log(`[Schedule] Set next execution for business ${businessId} to ${nextExecutionTime}`);

    // Execute all prompts for the business asynchronously (immediate first execution)
    promptExecutionService.executeAllPrompts(businessId)
      .then(() => {
        console.log(`Started executing all prompts for business ${businessId}`);
      })
      .catch(error => {
        console.error(`Failed to execute prompts for business ${businessId}:`, error);
        // Don't fail the onboarding completion if execution fails
      });

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      redirectUrl: '/dashboard'
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}