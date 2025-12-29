import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers, runTransaction } from '@/app/lib/db/database';
import { generateCompetitorsForBusiness } from '@/app/lib/services/ai.service';
import type { BusinessRecord, TopicRecord, CompetitorRecord } from '@/app/lib/types';

/**
 * Fetch logo for a given website domain
 */
async function fetchLogo(website: string | undefined): Promise<string | null> {
  if (!website) return null;

  try {
    // Extract domain from website
    let domain = website;
    domain = domain.replace(/^https?:\/\//i, '');
    domain = domain.replace(/^www\./i, '');
    domain = domain.split('/')[0];

    if (!domain) return null;

    // Try multiple logo sources
    const sources = [
      `https://logo.clearbit.com/${domain}`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    ];

    for (const url of sources) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.startsWith('image/')) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString('base64');
            return `data:${contentType};base64,${base64}`;
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, competitors, generateSuggestions } = body;

    if (!businessId) {
      return NextResponse.json(
          { error: 'Business ID is required' },
          { status: 400 }
      );
    }

    // Get business details
    const business = dbHelpers.getBusiness.get(businessId) as BusinessRecord;
    if (!business) {
      return NextResponse.json(
          { error: 'Business not found' },
          { status: 404 }
      );
    }

    // Generate AI-powered suggestions
    if (generateSuggestions) {
      try {
        // Get topics for context
        const topics = dbHelpers.getTopicsByBusiness.all(businessId) as TopicRecord[];
        const topicNames = topics.map(t => t.name);

        // Call AI service to generate competitors
        const generatedCompetitors = await generateCompetitorsForBusiness(
            businessId,
            business.business_name,
            business.website,
            topicNames
        );

        // Fetch logos for all competitors in parallel
        const competitorsWithLogos = await Promise.all(
          generatedCompetitors.map(async (competitor, index) => {
            const website = competitor.website ?
              (competitor.website.startsWith('http') ? competitor.website : `https://${competitor.website}`) :
              undefined;
            const logo = await fetchLogo(website);
            return {
              id: `generated-${index}`,
              ...competitor,
              website,
              logo
            };
          })
        );

        return NextResponse.json({
          success: true,
          competitors: competitorsWithLogos,
          generated: true
        });
      } catch (error) {
        console.error('Error generating competitors:', error);
        return NextResponse.json(
            { error: 'Failed to generate competitors', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
      }
    }

    // Save user-modified competitors
    if (competitors && Array.isArray(competitors)) {
      // Fetch logos for any competitors that don't have one yet
      const competitorsWithLogos = await Promise.all(
        competitors.map(async (competitor) => {
          // If logo is already provided (from generation), use it
          if (competitor.logo) {
            return competitor;
          }
          // Otherwise fetch it
          const logo = await fetchLogo(competitor.website);
          return { ...competitor, logo };
        })
      );

      const savedCompetitors = runTransaction(() => {
        dbHelpers.deleteCompetitorsByBusiness.run(businessId);

        const insertedCompetitors: any[] = [];
        for (const competitor of competitorsWithLogos) {
          const result = dbHelpers.createCompetitor.run({
            businessId,
            name: competitor.name,
            website: competitor.website || null,
            description: competitor.description || null,
            isCustom: competitor.isCustom ? 1 : 0,
            logo: competitor.logo || null
          });

          insertedCompetitors.push({
            id: result.lastInsertRowid,
            ...competitor
          });
        }

        dbHelpers.updateSession.run({
          businessId,
          stepCompleted: 6  // Competitors is step 6
        });

        return insertedCompetitors;
      });

      return NextResponse.json({
        success: true,
        competitors: savedCompetitors
      });
    }

    return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
    );
  } catch (error) {
    console.error('Error handling competitors:', error);
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

    const competitors = dbHelpers.getCompetitorsByBusiness.all(parseInt(businessId)) as CompetitorRecord[];

    return NextResponse.json({
      success: true,
      competitors: competitors.map(competitor => ({
        id: competitor.id.toString(),
        name: competitor.name,
        website: competitor.website,
        description: competitor.description,
        isCustom: competitor.is_custom,
        logo: (competitor as any).logo
      }))
    });
  } catch (error) {
    console.error('Error fetching competitors:', error);
    return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
    );
  }
}