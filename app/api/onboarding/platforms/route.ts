import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth/auth-options';
import db, { dbHelpers, runTransaction } from '@/app/lib/db/database';
import { availablePlatforms } from '@/app/lib/config/platforms';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, platforms } = body;

    // Validate required fields
    if (!businessId || !platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { error: 'Business ID and at least one platform configuration are required' },
        { status: 400 }
      );
    }

    // Validate each platform and check for duplicates
    const platformIds = new Set();
    for (const platform of platforms) {
      if (!platform.platformId || !platform.apiKey) {
        return NextResponse.json(
          { error: 'Each platform must have platform ID and API key' },
          { status: 400 }
        );
      }
      if (platformIds.has(platform.platformId)) {
        return NextResponse.json(
          { error: `Only one configuration per platform is allowed. Duplicate found: ${platform.platformId}` },
          { status: 400 }
        );
      }
      // Validate platform ID exists in config
      const validPlatform = availablePlatforms.find(p => p.id === platform.platformId);
      if (!validPlatform) {
        return NextResponse.json(
          { error: `Invalid platform ID: ${platform.platformId}` },
          { status: 400 }
        );
      }
      platformIds.add(platform.platformId);
    }

    // Require ChatGPT/OpenAI as a mandatory platform
    if (!platformIds.has('chatgpt')) {
      return NextResponse.json(
        { error: 'ChatGPT (OpenAI) is required' },
        { status: 400 }
      );
    }

    // Ensure exactly one primary platform
    const primaryPlatforms = platforms.filter((p: any) => p.isPrimary);
    if (primaryPlatforms.length === 0) {
      // Make the first one primary if none selected
      platforms[0].isPrimary = true;
    } else if (primaryPlatforms.length > 1) {
      return NextResponse.json(
        { error: 'Only one platform can be marked as primary' },
        { status: 400 }
      );
    }

    // Save platform configurations in a transaction
    runTransaction(() => {
      // Delete existing platforms for this business
      dbHelpers.deletePlatformsByBusiness.run(businessId);

      // todo encrypt keys with an encryption key provided on startup
      // Insert new platforms (INSERT OR REPLACE handles uniqueness)
      for (const platform of platforms) {
        dbHelpers.createPlatform.run({
          businessId,
          platformId: platform.platformId,
          apiKey: platform.apiKey,
          isPrimary: platform.isPrimary ? 1 : 0,
        });
      }

      // Update the onboarding session step
      dbHelpers.updateSession.run({
        businessId,
        stepCompleted: 2, // Platforms step completed
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Platform configurations saved successfully',
    });
  } catch (error) {
    console.error('Error saving platform configurations:', error);
    return NextResponse.json(
      { error: 'Failed to save platform configurations' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    // Return user's saved platforms for this business (if businessId provided)
    let userPlatforms: any[] = [];
    if (businessId) {
      const savedPlatforms = dbHelpers.getPlatformsByBusiness.all(parseInt(businessId));
      userPlatforms = savedPlatforms.map((p: any) => ({
        id: p.id.toString(),
        platformId: p.platform_id,
        apiKey: p.api_key,
        isPrimary: Boolean(p.is_primary),
      }));
    }

    // Get existing API keys ONLY from businesses the current user has access to
    const existingKeys = db.prepare(`
      SELECT DISTINCT bp.platform_id, bp.api_key, b.business_name
      FROM business_platforms bp
      JOIN businesses b ON bp.business_id = b.id
      JOIN business_members bm ON b.id = bm.business_id
      WHERE bm.user_id = ? AND bp.is_active = 1
      ORDER BY bp.platform_id, b.created_at DESC
    `).all(userId) as Array<{
      platform_id: string;
      api_key: string;
      business_name: string;
    }>;

    // Group by platform_id and mask the API keys for display
    const existingApiKeys: Record<string, { maskedKey: string; fullKey: string; fromBusiness: string }[]> = {};
    existingKeys.forEach((key) => {
      if (!existingApiKeys[key.platform_id]) {
        existingApiKeys[key.platform_id] = [];
      }
      // Mask the key for display (show first 8 and last 4 chars)
      const masked = key.api_key.length > 12
        ? `${key.api_key.slice(0, 8)}...${key.api_key.slice(-4)}`
        : '••••••••';

      // Only add if not already present (avoid duplicates)
      const alreadyExists = existingApiKeys[key.platform_id].some(k => k.fullKey === key.api_key);
      if (!alreadyExists) {
        existingApiKeys[key.platform_id].push({
          maskedKey: masked,
          fullKey: key.api_key,
          fromBusiness: key.business_name
        });
      }
    });

    return NextResponse.json({
      userPlatforms,
      existingApiKeys
    });
  } catch (error) {
    console.error('Error fetching platform configurations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch platform configurations' },
      { status: 500 }
    );
  }
}