import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth/auth-options';
import { dbHelpers } from '@/app/lib/db/database';
import { suggestPersonas } from '@/app/lib/services/ai.service';
import type { BusinessRecord } from '@/app/lib/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

    // Generate AI-powered persona suggestions
    const personas = await suggestPersonas(
      business.id,
      business.business_name,
      business.website
    );

    return NextResponse.json({
      success: true,
      personas: personas.map(p => ({
        title: p.title,
        description: p.description
      }))
    });
  } catch (error) {
    console.error('Error suggesting personas:', error);
    return NextResponse.json(
      { error: 'Failed to generate persona suggestions' },
      { status: 500 }
    );
  }
}
