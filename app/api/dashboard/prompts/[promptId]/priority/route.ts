import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

/**
 * PATCH /api/dashboard/prompts/[promptId]/priority
 * Toggle or set the priority status of a prompt
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  try {
    const { promptId } = await params;
    const promptIdNum = parseInt(promptId);

    if (isNaN(promptIdNum)) {
      return NextResponse.json(
        { error: 'Invalid prompt ID' },
        { status: 400 }
      );
    }

    // Get the prompt to find business ID
    const prompt = db.prepare('SELECT id, business_id FROM prompts WHERE id = ?').get(promptIdNum) as { id: number; business_id: number } | undefined;
    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }

    // Check user has access to this business
    const accessCheck = await checkBusinessAccess(prompt.business_id);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status || 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // If priority value is explicitly provided, set it
    // Otherwise, toggle the current value
    if (typeof body.isPriority === 'boolean') {
      dbHelpers.setPromptPriority.run(body.isPriority ? 1 : 0, promptIdNum);
    } else {
      dbHelpers.togglePromptPriority.run(promptIdNum);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Priority API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
