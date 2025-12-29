import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth/auth-options';
import { dbHelpers, runTransaction } from '@/app/lib/db/database';
import type { BusinessRecord, OnboardingSession } from '@/app/lib/types';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { businessName, website, logo, businessId } = body;

    // Validate input
    if (!businessName || !website) {
      return NextResponse.json(
          { error: 'Business name and website are required' },
          { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(website);
    } catch {
      return NextResponse.json(
          { error: 'Invalid website URL format' },
          { status: 400 }
      );
    }

    // Save to database with transaction
    const result = runTransaction(() => {
      let business: BusinessRecord;
      let session: OnboardingSession;

      // If businessId is provided, update that specific business
      if (businessId) {
        const existingBusiness = dbHelpers.getBusiness.get(businessId) as BusinessRecord | undefined;

        if (existingBusiness) {
          // Update existing business
          dbHelpers.updateBusiness.run({
            id: businessId,
            businessName,
            website,
            logo
          });
          business = dbHelpers.getBusiness.get(businessId) as BusinessRecord;
        } else {
          // Business ID provided but not found - create new
          const insertResult = dbHelpers.createBusiness.run({
            businessName,
            website,
            logo
          });
          const newBusinessId = insertResult.lastInsertRowid as number;
          business = dbHelpers.getBusiness.get(newBusinessId) as BusinessRecord;

          // Add creator as owner in business_members
          const existingMember = dbHelpers.getBusinessMember.get(newBusinessId, userId);
          if (!existingMember) {
            dbHelpers.addBusinessMember.run({
              businessId: newBusinessId,
              userId,
              role: 'owner',
              invitedBy: userId
            });
          }
        }

        // Ensure user is a member of the business
        const existingMember = dbHelpers.getBusinessMember.get(business.id, userId);
        if (!existingMember) {
          dbHelpers.addBusinessMember.run({
            businessId: business.id,
            userId,
            role: 'owner',
            invitedBy: userId
          });
        }

        // Get or create session
        let existingSession = dbHelpers.getSession.get(business.id) as OnboardingSession | undefined;
        if (!existingSession) {
          dbHelpers.createSession.run({
            businessId: business.id,
            stepCompleted: 1
          });
          existingSession = dbHelpers.getSession.get(business.id) as OnboardingSession;
        } else {
          // Update session step
          dbHelpers.updateSession.run({
            businessId: business.id,
            stepCompleted: Math.max(existingSession.step_completed, 1)
          });
        }
        session = existingSession;
      } else {
        // Create new business (no ID provided)
        const insertResult = dbHelpers.createBusiness.run({
          businessName,
          website,
          logo
        });

        const newBusinessId = insertResult.lastInsertRowid as number;
        business = dbHelpers.getBusiness.get(newBusinessId) as BusinessRecord;

        // Add creator as owner in business_members
        dbHelpers.addBusinessMember.run({
          businessId: newBusinessId,
          userId,
          role: 'owner',
          invitedBy: userId
        });

        // Create new session
        dbHelpers.createSession.run({
          businessId: newBusinessId,
          stepCompleted: 1
        });
        session = dbHelpers.getSession.get(newBusinessId) as OnboardingSession;
      }

      return { business, session };
    });

    return NextResponse.json({
      success: true,
      data: {
        businessId: result.business.id,
        businessName: result.business.business_name,
        website: result.business.website,
        sessionId: result.session.id,
        stepCompleted: result.session.step_completed
      }
    });
  } catch (error) {
    console.error('Error saving business info:', error);
    return NextResponse.json(
        { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    const businessIdNum = parseInt(businessId);

    // Verify user owns this business
    const member = dbHelpers.getBusinessMember.get(businessIdNum, userId) as { role: string } | undefined;
    if (!member || member.role !== 'owner') {
      return NextResponse.json(
        { error: 'Not authorized to delete this business' },
        { status: 403 }
      );
    }

    // Delete the business (cascades will handle related data)
    runTransaction(() => {
      dbHelpers.deleteBusiness.run(businessIdNum);
    });

    return NextResponse.json({
      success: true,
      message: 'Business deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting business:', error);
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

    const business = dbHelpers.getBusiness.get(parseInt(businessId)) as BusinessRecord | undefined;

    if (!business) {
      return NextResponse.json(
          { error: 'Business not found' },
          { status: 404 }
      );
    }

    const session = dbHelpers.getSession.get(parseInt(businessId)) as OnboardingSession | undefined;

    return NextResponse.json({
      success: true,
      data: {
        business: {
          id: business.id,
          businessName: business.business_name,
          website: business.website,
          logo: business.logo,
          createdAt: business.created_at,
          updatedAt: business.updated_at
        },
        session: session ? {
          id: session.id,
          stepCompleted: session.step_completed,
          completed: session.completed,
          completedAt: session.completed_at
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching business info:', error);
    return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
    );
  }
}