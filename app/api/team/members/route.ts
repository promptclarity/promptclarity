import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth/auth-options';
import db, { dbHelpers } from '@/app/lib/db/database';

// GET /api/team/members - Get all members for a business
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json({ error: 'Business ID required' }, { status: 400 });
    }

    const businessIdNum = parseInt(businessId);

    // Check if user has access to this business (is a member)
    const hasAccess = dbHelpers.userHasBusinessAccess.get(
      businessIdNum,
      session.user.id
    );

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get business
    const business = dbHelpers.getBusiness.get(businessIdNum) as any;
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Get all members (including owner)
    const allMembers = dbHelpers.getBusinessMembers.all(businessIdNum) as any[];

    // Find the owner from members
    const ownerMember = allMembers.find((m: any) => m.role === 'owner');
    let owner = null;
    if (ownerMember) {
      owner = {
        id: ownerMember.user_id,
        name: ownerMember.user_name,
        email: ownerMember.user_email,
        image: ownerMember.user_image,
        role: 'owner',
      };
    }

    // Filter out owner from members list (owner is shown separately)
    const members = allMembers.filter((m: any) => m.role !== 'owner');

    // Check if current user is the owner
    const currentUserMembership = allMembers.find((m: any) => m.user_id === session.user.id);
    const isOwner = currentUserMembership?.role === 'owner';

    // Get pending invitations
    const pendingInvitations = dbHelpers.getPendingInvitations.all(businessIdNum) as any[];

    return NextResponse.json({
      owner,
      members: members.map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        name: m.user_name,
        email: m.user_email,
        image: m.user_image,
        role: m.role,
        joinedAt: m.joined_at,
        invitedByName: m.invited_by_name,
      })),
      pendingInvitations: pendingInvitations.map((i: any) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        invitedByName: i.invited_by_name,
        createdAt: i.created_at,
        expiresAt: i.expires_at,
      })),
      isOwner,
    });
  } catch (error: any) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/team/members - Remove a member from a business
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { businessId, userId } = await request.json();

    if (!businessId || !userId) {
      return NextResponse.json({ error: 'Business ID and User ID required' }, { status: 400 });
    }

    // Check if business exists
    const business = dbHelpers.getBusiness.get(businessId) as any;
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Check if current user is the owner (via business_members table)
    const currentUserMembership = dbHelpers.getBusinessMember.get(businessId, session.user.id) as any;
    if (!currentUserMembership || currentUserMembership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can remove members' }, { status: 403 });
    }

    // Check the target user's role - cannot remove the owner
    const targetMembership = dbHelpers.getBusinessMember.get(businessId, userId) as any;
    if (targetMembership && targetMembership.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 });
    }

    // Remove the member
    dbHelpers.removeBusinessMember.run(businessId, userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
