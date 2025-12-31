import { NextRequest, NextResponse } from 'next/server';
import { promptExecutionService } from '@/app/lib/services/prompt-execution.service';

// Re-analyze existing executions with updated analysis prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, forceAll } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    // Run re-analysis (forceAll=true re-analyzes all executions, useful when URL extraction changes)
    const result = await promptExecutionService.reanalyzeExecutions(businessId, forceAll === true);

    const { success: successCount, ...restResult } = result;
    return NextResponse.json({
      success: true,
      message: `Re-analyzed ${successCount} executions (${restResult.failed} failed)`,
      successCount,
      ...restResult
    });
  } catch (error: any) {
    console.error('Error re-analyzing executions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to re-analyze executions' },
      { status: 500 }
    );
  }
}
