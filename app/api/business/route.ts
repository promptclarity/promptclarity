import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';

// GET /api/business?businessId=123
// Fetch basic business information
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    
    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    const businessIdNum = parseInt(businessId);

    // Check user has access to this business
    const accessCheck = await checkBusinessAccess(businessIdNum);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status || 403 }
      );
    }

    // Get business info
    const business = dbHelpers.getBusiness.get(businessIdNum) as any;
    
    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: business.id,
      businessName: business.business_name,
      website: business.website,
      logo: business.logo,
      refreshPeriodDays: business.refresh_period_days || 1,
      nextExecutionTime: business.next_execution_time,
      createdAt: business.created_at,
      updatedAt: business.updated_at
    });
  } catch (error) {
    console.error('Error fetching business:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/business?businessId=123
// Update business settings (refresh period)
export async function PATCH(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    const businessIdNum = parseInt(businessId);

    // Check user has access to this business
    const accessCheck = await checkBusinessAccess(businessIdNum);
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status || 403 }
      );
    }

    const body = await request.json();
    const { refreshPeriodDays } = body;

    // Validate refresh period (1-7 days)
    if (refreshPeriodDays !== undefined) {
      const period = parseInt(refreshPeriodDays);
      if (isNaN(period) || period < 1 || period > 7) {
        return NextResponse.json(
          { error: 'Refresh period must be between 1 and 7 days' },
          { status: 400 }
        );
      }

      // Verify business exists
      const business = dbHelpers.getBusiness.get(businessIdNum) as any;
      if (!business) {
        return NextResponse.json(
          { error: 'Business not found' },
          { status: 404 }
        );
      }

      // Update refresh period
      dbHelpers.setBusinessRefreshPeriod.run({
        businessId: businessIdNum,
        refreshPeriodDays: period
      });

      // Get updated business
      const updatedBusiness = dbHelpers.getBusiness.get(businessIdNum) as any;

      return NextResponse.json({
        id: updatedBusiness.id,
        businessName: updatedBusiness.business_name,
        website: updatedBusiness.website,
        logo: updatedBusiness.logo,
        refreshPeriodDays: updatedBusiness.refresh_period_days || 1,
        nextExecutionTime: updatedBusiness.next_execution_time,
        createdAt: updatedBusiness.created_at,
        updatedAt: updatedBusiness.updated_at
      });
    }

    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating business:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}