import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth/auth-options';
import { dbHelpers } from '@/app/lib/db/database';
import type { OnboardingSession } from '@/app/lib/types';

// GET /api/business/all
// Fetch all businesses accessible by the current user (with onboarding status)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const businesses = dbHelpers.getAccessibleBusinesses.all(userId) as any[];

    // Get onboarding status for each business
    const businessesWithStatus = businesses.map(business => {
      const onboardingSession = dbHelpers.getSession.get(business.id) as OnboardingSession | undefined;
      return {
        id: business.id,
        businessName: business.business_name,
        website: business.website,
        logo: business.logo,
        accessRole: business.access_role,
        createdAt: business.created_at,
        updatedAt: business.updated_at,
        onboarding: onboardingSession ? {
          stepCompleted: onboardingSession.step_completed,
          completed: Boolean(onboardingSession.completed),
          completedAt: onboardingSession.completed_at
        } : null
      };
    });

    return NextResponse.json(businessesWithStatus);
  } catch (error) {
    console.error('Error fetching all businesses:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
