import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';

/**
 * DELETE /api/prompts/executions/[executionId]
 * Delete a specific prompt execution
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    const executionId = parseInt(params.executionId);

    if (isNaN(executionId)) {
      return NextResponse.json(
        { error: 'Invalid execution ID' },
        { status: 400 }
      );
    }

    // Verify the execution exists
    const execution = dbHelpers.getPromptExecution.get(executionId);

    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // Delete the execution
    dbHelpers.deletePromptExecution.run(executionId);

    console.log(`[API] Deleted prompt execution ${executionId}`);

    return NextResponse.json({
      success: true,
      message: 'Execution deleted successfully',
      executionId
    });

  } catch (error: any) {
    console.error('[API] Error deleting prompt execution:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete execution' },
      { status: 500 }
    );
  }
}
