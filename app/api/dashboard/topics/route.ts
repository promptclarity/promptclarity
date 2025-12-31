import { NextRequest, NextResponse } from 'next/server';
import db, { dbHelpers, runTransaction } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

// POST /api/dashboard/topics
// Create a new topic
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, name } = body;

    if (!businessId || !name) {
      return NextResponse.json(
        { error: 'Business ID and topic name are required' },
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

    // Create the topic
    const result = dbHelpers.createTopic.run({
      businessId,
      name: name.trim(),
      isCustom: 1
    });

    return NextResponse.json({
      success: true,
      topicId: result.lastInsertRowid,
      name: name.trim()
    });
  } catch (error) {
    console.error('Error creating topic:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/dashboard/topics?topicId=123
// Delete a topic and all its prompts
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const topicId = searchParams.get('topicId');

    if (!topicId) {
      return NextResponse.json(
        { error: 'Topic ID is required' },
        { status: 400 }
      );
    }

    const topicIdNum = parseInt(topicId);

    // Get the topic to find business ID
    const topic = db.prepare('SELECT id, business_id FROM topics WHERE id = ?').get(topicIdNum) as { id: number; business_id: number } | undefined;
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found' },
        { status: 404 }
      );
    }

    // Check user has access to this business
    const accessCheck = await checkBusinessAccess(topic.business_id);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status || 403 }
      );
    }

    runTransaction(() => {
      // Delete all prompts for this topic first
      dbHelpers.deletePromptsByTopic.run(topicIdNum);
      // Then delete the topic
      dbHelpers.deleteTopic.run(topicIdNum);
    });

    return NextResponse.json({
      success: true,
      message: 'Topic deleted'
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
