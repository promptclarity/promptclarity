import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth/auth-options';
import db, { dbHelpers, runTransaction } from '@/app/lib/db/database';
import { sendInvitationEmail } from '@/app/lib/email/resend';
import { isSelfHosted } from '@/app/lib/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

// Generate a readable temporary password
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// POST /api/team/invite - Send an invitation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { businessId, email, name, role = 'member' } = await request.json();

    if (!businessId || !email) {
      return NextResponse.json({ error: 'Business ID and email required' }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Check if business exists
    const business = dbHelpers.getBusiness.get(businessId) as any;
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Check if current user is the owner (via business_members table)
    const membership = dbHelpers.getBusinessMember.get(businessId, session.user.id) as any;
    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can invite members' }, { status: 403 });
    }

    // Check if user is already a member
    const existingUser = dbHelpers.getUserByEmail.get(email) as any;
    if (existingUser) {
      // Check if already a member (including owner)
      const existingMember = dbHelpers.getBusinessMember.get(businessId, existingUser.id) as any;
      if (existingMember) {
        if (existingMember.role === 'owner') {
          return NextResponse.json({ error: 'This user is already the owner' }, { status: 400 });
        }
        return NextResponse.json({ error: 'This user is already a member' }, { status: 400 });
      }
    }

    // Check for existing pending invitation
    const existingInvitation = dbHelpers.getPendingInvitationByEmail.get(businessId, email);
    if (existingInvitation) {
      return NextResponse.json({ error: 'An invitation has already been sent to this email' }, { status: 400 });
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedTempPassword = await bcrypt.hash(tempPassword, 10);

    // Check if this is an existing user
    const isExistingUser = !!existingUser;

    // In self-hosted mode, create user immediately and add to team
    if (isSelfHosted()) {
      let userId: string;

      if (existingUser) {
        // Existing user - just add them to the team
        userId = existingUser.id;

        runTransaction(() => {
          dbHelpers.addBusinessMember.run({
            businessId,
            userId: userId,
            role,
            invitedBy: session.user.id,
          });
        });
      } else {
        // New user - create account and add to team
        userId = randomUUID();

        runTransaction(() => {
          // Create user with temp password
          db.prepare(`
            INSERT INTO users (id, name, email, password, must_change_password)
            VALUES (?, ?, ?, ?, 1)
          `).run(userId, name.trim(), email.toLowerCase(), hashedTempPassword);

          // Add to team
          dbHelpers.addBusinessMember.run({
            businessId,
            userId: userId,
            role,
            invitedBy: session.user.id,
          });
        });
      }

      return NextResponse.json({
        success: true,
        message: `User added: ${email}`,
        inviteLink: null, // No invite link needed in self-hosted mode
        tempPassword: isExistingUser ? null : tempPassword,
        isExistingUser,
      });
    }

    // Cloud mode: Create invitation and send email
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation
    dbHelpers.createInvitation.run({
      businessId,
      email,
      name: name.trim(),
      role,
      token,
      invitedBy: session.user.id,
      expiresAt: expiresAt.toISOString(),
      tempPassword: hashedTempPassword,
    });

    // Send invitation email
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const inviteLink = `${baseUrl}/invite/${token}`;

    try {
      await sendInvitationEmail({
        to: email,
        inviterName: session.user.name || session.user.email || 'A team member',
        businessName: business.business_name,
        inviteLink,
        tempPassword,
      });
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Don't fail the request, the invitation is created
      // They can still access via direct link or resend
    }

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}`,
      inviteLink,
      tempPassword: isExistingUser ? null : tempPassword,
      isExistingUser,
    });
  } catch (error: any) {
    console.error('Error sending invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/team/invite - Cancel/delete an invitation
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invitationId, businessId } = await request.json();

    if (!invitationId || !businessId) {
      return NextResponse.json({ error: 'Invitation ID and Business ID required' }, { status: 400 });
    }

    // Check if business exists
    const business = dbHelpers.getBusiness.get(businessId) as any;
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Check if current user is the owner (via business_members table)
    const membership = dbHelpers.getBusinessMember.get(businessId, session.user.id) as any;
    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can cancel invitations' }, { status: 403 });
    }

    // Delete the invitation
    dbHelpers.deleteInvitation.run(invitationId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error canceling invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
