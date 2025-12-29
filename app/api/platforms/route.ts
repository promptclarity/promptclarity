import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/app/lib/db/database';
import { getPlatformConfig } from '@/app/lib/config/platforms';

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

    const platforms = dbHelpers.getPlatformsByBusiness.all(parseInt(businessId));
    
    return NextResponse.json({
      platforms: platforms.map((p: any) => {
        const config = getPlatformConfig(p.platform_id);
        return {
          id: p.id,
          platform_id: p.platform_id,
          name: config?.name || p.platform_id,
          provider: config?.provider || '',
          model_name: config?.model || '',
          api_key: p.api_key,
          is_primary: Boolean(p.is_primary),
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching platforms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch platforms' },
      { status: 500 }
    );
  }
}