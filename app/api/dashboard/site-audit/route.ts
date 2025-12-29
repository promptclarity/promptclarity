import { NextRequest, NextResponse } from 'next/server';
import { checkBusinessAccess } from '@/app/lib/auth/check-access';
import db, { dbHelpers } from '@/app/lib/db/database';
import {
  startSiteAudit,
  runPageAudit,
  completeSiteAudit,
  getSiteAudit,
  getPageAudits,
  addUrlToAudit,
} from '@/app/lib/services/site-audit.service';

// GET - Get current audit status and results
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const businessId = searchParams.get('businessId');

  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const accessCheck = await checkBusinessAccess(businessId);
  if (!accessCheck.authorized) {
    return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
  }

  try {
    const audit = getSiteAudit(businessId);

    if (!audit) {
      return NextResponse.json({
        status: 'not_started',
        message: 'No site audit has been started yet',
      });
    }

    // Get page audits if audit exists
    const pages = getPageAudits(audit.id);
    const pageResults = pages.map((page: any) => ({
      id: page.id,
      url: page.url,
      status: page.status,
      title: page.title,
      overallScore: page.overall_score,
      structureScore: page.structure_score,
      contentScore: page.content_score,
      technicalScore: page.technical_score,
      issues: page.issues ? JSON.parse(page.issues) : [],
      recommendations: page.recommendations ? JSON.parse(page.recommendations) : [],
      analyzedAt: page.analyzed_at,
      // Additional details
      h1Count: page.h1_count,
      h2Count: page.h2_count,
      h3Count: page.h3_count,
      wordCount: page.word_count,
      hasQaFormat: !!page.has_qa_format,
      hasLists: !!page.has_lists,
      hasFaqSchema: !!page.has_faq_schema,
      hasHowtoSchema: !!page.has_howto_schema,
      schemaTypes: page.schema_types ? JSON.parse(page.schema_types) : [],
      loadTimeMs: page.load_time_ms,
      metaDescription: page.meta_description,
    }));

    return NextResponse.json({
      ...audit,
      pages: pageResults,
    });
  } catch (error) {
    console.error('Error fetching site audit:', error);
    return NextResponse.json({ error: 'Failed to fetch site audit' }, { status: 500 });
  }
}

// POST - Start a new audit or add URLs
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const businessId = searchParams.get('businessId');
  const action = searchParams.get('action') || 'start';

  if (!businessId) {
    return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
  }

  const accessCheck = await checkBusinessAccess(businessId);
  if (!accessCheck.authorized) {
    return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
  }

  try {
    if (action === 'start') {
      // Get business domain
      const business = dbHelpers.getBusiness.get(businessId) as any;
      if (!business?.website) {
        return NextResponse.json({ error: 'Business does not have a website configured' }, { status: 400 });
      }

      // Check if there's already a running audit
      const existingAudit = getSiteAudit(businessId);
      if (existingAudit?.status === 'running') {
        return NextResponse.json({
          error: 'An audit is already running',
          audit: existingAudit,
        }, { status: 409 });
      }

      // Start new audit
      const auditId = await startSiteAudit(businessId, business.website);

      // Run audits asynchronously
      runAuditInBackground(auditId, business.website);

      return NextResponse.json({
        success: true,
        auditId,
        message: 'Site audit started',
      });

    } else if (action === 'add-url') {
      const body = await request.json();
      const { url } = body;

      if (!url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
      }

      // Get current audit
      const audit = getSiteAudit(businessId);
      if (!audit) {
        return NextResponse.json({ error: 'No audit exists. Start an audit first.' }, { status: 400 });
      }

      // Add URL
      const pageId = addUrlToAudit(audit.id, businessId, url);

      // Get business domain
      const business = dbHelpers.getBusiness.get(businessId) as any;

      // Run audit for this page
      await runPageAudit(pageId, business?.website || '');

      return NextResponse.json({
        success: true,
        pageId,
        message: 'URL added and analyzed',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in site audit:', error);
    return NextResponse.json({ error: 'Failed to process site audit' }, { status: 500 });
  }
}

// Run audit in background (non-blocking)
async function runAuditInBackground(auditId: number, businessDomain: string) {
  try {
    // Get all pending pages
    const pendingPages = db.prepare(`
      SELECT id FROM page_audits WHERE site_audit_id = ? AND status = 'pending'
    `).all(auditId) as any[];

    // Process pages with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < pendingPages.length; i += concurrency) {
      const batch = pendingPages.slice(i, i + concurrency);
      await Promise.all(batch.map(page => runPageAudit(page.id, businessDomain)));

      // Small delay between batches to be respectful
      if (i + concurrency < pendingPages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Complete the audit
    await completeSiteAudit(auditId);
  } catch (error) {
    console.error('Error running audit in background:', error);
    // Mark audit as failed
    try {
      db.prepare(`UPDATE site_audits SET status = 'error' WHERE id = ?`).run(auditId);
    } catch (e) {
      console.error('Failed to update audit status:', e);
    }
  }
}
