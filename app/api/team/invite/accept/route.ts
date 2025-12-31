import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth/auth-options';
import db, { dbHelpers, runTransaction } from '@/app/lib/db/database';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

// GET /api/team/invite/accept - Get invitation details by token
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const invitation = dbHelpers.getInvitationByToken.get(token) as any;

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        businessName: invitation.business_name,
        invitedByName: invitation.invited_by_name,
        invitedByEmail: invitation.invited_by_email,
        expiresAt: invitation.expires_at,
      },
    });
  } catch (error: any) {
    console.error('Error fetching invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/team/invite/accept - Accept an invitation (with password verification)
export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const invitation = dbHelpers.getInvitationByToken.get(token) as any;

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    // Check if user already exists
    let user = dbHelpers.getUserByEmail.get(invitation.email) as any;
    let userId: string;

    if (user) {
      // User exists - verify against their existing password
      userId = user.id;

      // Check if already a member
      const existingMember = dbHelpers.getBusinessMember.get(invitation.business_id, userId);
      if (existingMember) {
        return NextResponse.json({ error: 'You are already a member of this team' }, { status: 400 });
      }

      // Verify password against user's existing password
      if (!user.password) {
        return NextResponse.json({ error: 'Please sign in with your existing account first' }, { status: 400 });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
      }
    } else {
      // New user - verify against invitation's temp password
      if (!invitation.temp_password) {
        return NextResponse.json({ error: 'Invalid invitation - no password set' }, { status: 400 });
      }

      const isPasswordValid = await bcrypt.compare(password, invitation.temp_password);
      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
      }

      // Create new user with the temp password and flag to change it
      userId = randomUUID();
      const stmt = db.prepare(`
        INSERT INTO users (id, name, email, password, must_change_password)
        VALUES (?, ?, ?, ?, 1)
      `);
      stmt.run(userId, invitation.name || null, invitation.email, invitation.temp_password);
    }

    // Accept invitation in a transaction
    runTransaction(() => {
      // Add user as member
      dbHelpers.addBusinessMember.run({
        businessId: invitation.business_id,
        userId: userId,
        role: invitation.role,
        invitedBy: invitation.invited_by,
      });

      // Mark invitation as accepted
      dbHelpers.acceptInvitation.run(invitation.id);
    });

    return NextResponse.json({
      success: true,
      message: `You have joined ${invitation.business_name}`,
      businessId: invitation.business_id,
      email: invitation.email,
    });
  } catch (error: any) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
