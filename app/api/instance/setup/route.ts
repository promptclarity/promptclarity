import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers, runTransaction } from '@/app/lib/db/database';
import { hashPassword } from '@/app/lib/auth/password';
import { isSelfHosted } from '@/app/lib/config';
import { v4 as uuidv4 } from 'uuid';

interface InstanceSettings {
  initialized: number;
}

/**
 * POST /api/instance/setup
 * Initialize the instance with the owner account
 * Only works in self-hosted mode and when instance is not yet initialized
 */
export async function POST(request: NextRequest) {
  try {
    // Only allow setup in self-hosted mode
    if (!isSelfHosted()) {
      return NextResponse.json(
        { error: 'Instance setup is only available in self-hosted mode' },
        { status: 403 }
      );
    }

    // Check if already initialized
    const settings = dbHelpers.getInstanceSettings.get() as InstanceSettings | undefined;
    if (settings?.initialized) {
      return NextResponse.json(
        { error: 'Instance is already initialized' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, email, password, instanceName } = body;

    // Validate required fields
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = dbHelpers.getUserByEmail.get(email.toLowerCase());
    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password before transaction (async operation)
    const hashedPassword = await hashPassword(password);
    const userId = uuidv4();

    // Create the owner user and initialize instance in a transaction
    runTransaction(() => {
      const db = require('@/app/lib/db/database').default;
      db.prepare(`
        INSERT INTO users (id, name, email, password, email_verified, must_change_password)
        VALUES (?, ?, ?, ?, datetime('now'), 0)
      `).run(userId, name, email.toLowerCase(), hashedPassword);

      // Initialize the instance
      dbHelpers.initializeInstance.run({
        ownerUserId: userId,
        instanceName: instanceName || 'My Instance',
      });
    });

    const result = { userId, email: email.toLowerCase(), name };

    return NextResponse.json({
      success: true,
      user: {
        id: result.userId,
        email: result.email,
        name: result.name,
      },
      message: 'Instance initialized successfully',
    });
  } catch (error) {
    console.error('Error setting up instance:', error);
    return NextResponse.json(
      { error: 'Failed to setup instance' },
      { status: 500 }
    );
  }
}
