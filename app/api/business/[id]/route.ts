import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers, runTransaction } from '@/app/lib/db/database';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessId = parseInt(id);

    if (isNaN(businessId)) {
      return NextResponse.json(
        { error: 'Invalid business ID' },
        { status: 400 }
      );
    }

    // Verify business exists
    const business = dbHelpers.getBusiness.get(businessId);
    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Delete all related data in a transaction
    runTransaction(() => {
      // Delete API call logs
      dbHelpers.deleteApiCallLogsByBusiness.run(businessId);

      // Delete platform usage
      dbHelpers.deletePlatformUsageByBusiness.run(businessId);

      // Delete prompt executions
      dbHelpers.deletePromptExecutionsByBusiness.run(businessId);

      // Delete prompts
      dbHelpers.deletePromptsByBusiness.run(businessId);

      // Delete topics
      dbHelpers.deleteTopicsByBusiness.run(businessId);

      // Delete competitors
      dbHelpers.deleteCompetitorsByBusiness.run(businessId);

      // Delete platforms
      dbHelpers.deletePlatformsByBusiness.run(businessId);

      // Delete business strategy
      dbHelpers.deleteBusinessStrategy.run(businessId);

      // Delete onboarding session
      dbHelpers.deleteOnboardingSession.run(businessId);

      // Finally delete the business itself
      dbHelpers.deleteBusiness.run(businessId);
    });

    return NextResponse.json({
      success: true,
      message: 'Business and all related data deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting business:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
