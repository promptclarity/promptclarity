import db, { dbHelpers } from '@/app/lib/db/database';
import { parse, HTMLElement } from 'node-html-parser';

export interface PageAuditResult {
  url: string;
  status: 'success' | 'error';
  error?: string;

  // Structure
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  hasProperHeadingHierarchy: boolean;

  // Schema
  schemaTypes: string[];
  hasFaqSchema: boolean;
  hasHowtoSchema: boolean;
  hasProductSchema: boolean;
  hasArticleSchema: boolean;
  hasOrganizationSchema: boolean;

  // Content
  wordCount: number;
  hasQaFormat: boolean;
  hasLists: boolean;
  hasTables: boolean;
  internalLinksCount: number;
  externalLinksCount: number;
  imagesCount: number;
  imagesWithAlt: number;

  // Technical
  loadTimeMs: number;
  hasCanonical: string | null;
  robotsMeta: string | null;

  // Scores (0-100)
  structureScore: number;
  contentScore: number;
  technicalScore: number;
  overallScore: number;

  // Recommendations
  issues: AuditIssue[];
  recommendations: AuditRecommendation[];
}

export interface AuditIssue {
  type: 'error' | 'warning' | 'info';
  category: 'structure' | 'schema' | 'content' | 'technical';
  message: string;
  impact: 'high' | 'medium' | 'low';
}

export interface AuditRecommendation {
  category: 'structure' | 'schema' | 'content' | 'technical';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionSteps: string[];
}

export interface SiteAuditSummary {
  id: number;
  businessId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startedAt: string | null;
  completedAt: string | null;
  totalPages: number;
  pagesAnalyzed: number;
  overallScore: number | null;
  summary: {
    avgStructureScore: number;
    avgContentScore: number;
    avgTechnicalScore: number;
    commonIssues: { issue: string; count: number }[];
    topRecommendations: string[];
  } | null;
}

// Fetch and parse sitemap
export async function discoverUrls(domain: string): Promise<string[]> {
  const urls: string[] = [];
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

  // Try common sitemap locations
  const sitemapUrls = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap/sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'PromptClarity Site Auditor/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const xml = await response.text();
        const root = parse(xml);

        // Check if it's a sitemap index
        const sitemapLocs = root.querySelectorAll('sitemap loc');
        if (sitemapLocs.length > 0) {
          // It's a sitemap index, fetch each sub-sitemap
          for (const loc of sitemapLocs.slice(0, 5)) { // Limit to 5 sub-sitemaps
            const subSitemapUrl = loc.textContent.trim();
            try {
              const subResponse = await fetch(subSitemapUrl, {
                headers: { 'User-Agent': 'PromptClarity Site Auditor/1.0' },
                signal: AbortSignal.timeout(10000),
              });
              if (subResponse.ok) {
                const subXml = await subResponse.text();
                const subRoot = parse(subXml);
                subRoot.querySelectorAll('url loc').forEach(el => {
                  urls.push(el.textContent.trim());
                });
              }
            } catch (e) {
              console.error(`Error fetching sub-sitemap ${subSitemapUrl}:`, e);
            }
          }
        } else {
          // Regular sitemap
          root.querySelectorAll('url loc').forEach(el => {
            urls.push(el.textContent.trim());
          });
        }

        if (urls.length > 0) break;
      }
    } catch (e) {
      console.error(`Error fetching sitemap ${sitemapUrl}:`, e);
    }
  }

  // If no sitemap found, try to crawl the homepage for links
  if (urls.length === 0) {
    try {
      const response = await fetch(baseUrl, {
        headers: { 'User-Agent': 'PromptClarity Site Auditor/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const html = await response.text();
        const root = parse(html);
        const baseDomain = new URL(baseUrl).hostname;

        urls.push(baseUrl);

        root.querySelectorAll('a[href]').forEach(el => {
          const href = el.getAttribute('href');
          if (href) {
            try {
              const absoluteUrl = new URL(href, baseUrl);
              if (absoluteUrl.hostname === baseDomain && !urls.includes(absoluteUrl.href)) {
                urls.push(absoluteUrl.href);
              }
            } catch (e) {
              // Invalid URL, skip
            }
          }
        });
      }
    } catch (e) {
      console.error('Error crawling homepage:', e);
    }
  }

  // Limit and deduplicate
  return [...new Set(urls)].slice(0, 50); // Limit to 50 pages
}

// Analyze a single page
export async function analyzePage(url: string, businessDomain: string): Promise<PageAuditResult> {
  const startTime = Date.now();
  const issues: AuditIssue[] = [];
  const recommendations: AuditRecommendation[] = [];

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PromptClarity Site Auditor/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return createErrorResult(url, `HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const loadTimeMs = Date.now() - startTime;
    const root = parse(html);

    // Extract basic metadata
    const titleEl = root.querySelector('title');
    const title = titleEl?.textContent.trim() || null;
    const metaDescEl = root.querySelector('meta[name="description"]');
    const metaDescription = metaDescEl?.getAttribute('content')?.trim() || null;

    // Count headings
    const h1Count = root.querySelectorAll('h1').length;
    const h2Count = root.querySelectorAll('h2').length;
    const h3Count = root.querySelectorAll('h3').length;

    // Check heading hierarchy
    const hasProperHeadingHierarchy = checkHeadingHierarchy(root);

    // Extract schema markup
    const schemaTypes: string[] = [];
    let hasFaqSchema = false;
    let hasHowtoSchema = false;
    let hasProductSchema = false;
    let hasArticleSchema = false;
    let hasOrganizationSchema = false;

    root.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      try {
        const json = JSON.parse(el.textContent || '{}');
        const types = extractSchemaTypes(json);
        schemaTypes.push(...types);

        if (types.includes('FAQPage') || types.includes('Question')) hasFaqSchema = true;
        if (types.includes('HowTo')) hasHowtoSchema = true;
        if (types.includes('Product')) hasProductSchema = true;
        if (types.includes('Article') || types.includes('NewsArticle') || types.includes('BlogPosting')) hasArticleSchema = true;
        if (types.includes('Organization') || types.includes('LocalBusiness')) hasOrganizationSchema = true;
      } catch (e) {
        // Invalid JSON-LD
      }
    });

    // Content analysis
    const bodyEl = root.querySelector('body');
    const bodyText = bodyEl?.textContent.replace(/\s+/g, ' ').trim() || '';
    const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length;

    // Check for Q&A format (questions in content)
    const hasQaFormat = checkQaFormat(root, bodyText);

    // Check for lists and tables
    const hasLists = root.querySelectorAll('ul, ol').length > 0;
    const hasTables = root.querySelectorAll('table').length > 0;

    // Links analysis
    const baseDomain = new URL(url).hostname;
    let internalLinksCount = 0;
    let externalLinksCount = 0;

    root.querySelectorAll('a[href]').forEach(el => {
      const href = el.getAttribute('href');
      if (href) {
        try {
          const linkUrl = new URL(href, url);
          if (linkUrl.hostname === baseDomain) {
            internalLinksCount++;
          } else if (linkUrl.protocol.startsWith('http')) {
            externalLinksCount++;
          }
        } catch (e) {
          // Invalid URL
        }
      }
    });

    // Images analysis
    const images = root.querySelectorAll('img');
    const imagesCount = images.length;
    let imagesWithAlt = 0;
    images.forEach(img => {
      const alt = img.getAttribute('alt');
      if (alt && alt.trim().length > 0) {
        imagesWithAlt++;
      }
    });

    // Technical checks
    const canonicalEl = root.querySelector('link[rel="canonical"]');
    const hasCanonical = canonicalEl?.getAttribute('href') || null;
    const robotsEl = root.querySelector('meta[name="robots"]');
    const robotsMeta = robotsEl?.getAttribute('content') || null;

    // Generate issues and scores
    generateIssues(root, title, metaDescription, h1Count, h2Count, hasProperHeadingHierarchy,
      schemaTypes, wordCount, hasQaFormat, hasLists, imagesCount, imagesWithAlt,
      loadTimeMs, hasCanonical, issues);

    // Generate recommendations
    generateRecommendations(title, metaDescription, h1Count, hasProperHeadingHierarchy,
      schemaTypes, hasFaqSchema, hasHowtoSchema, wordCount, hasQaFormat, hasLists,
      imagesCount, imagesWithAlt, hasCanonical, recommendations);

    // Calculate scores
    const structureScore = calculateStructureScore(title, metaDescription, h1Count, h2Count, h3Count, hasProperHeadingHierarchy);
    const contentScore = calculateContentScore(wordCount, hasQaFormat, hasLists, hasTables, internalLinksCount, imagesWithAlt, imagesCount);
    const technicalScore = calculateTechnicalScore(loadTimeMs, hasCanonical, robotsMeta, schemaTypes.length);
    const overallScore = Math.round((structureScore + contentScore + technicalScore) / 3);

    return {
      url,
      status: 'success',
      title,
      metaDescription,
      h1Count,
      h2Count,
      h3Count,
      hasProperHeadingHierarchy,
      schemaTypes,
      hasFaqSchema,
      hasHowtoSchema,
      hasProductSchema,
      hasArticleSchema,
      hasOrganizationSchema,
      wordCount,
      hasQaFormat,
      hasLists,
      hasTables,
      internalLinksCount,
      externalLinksCount,
      imagesCount,
      imagesWithAlt,
      loadTimeMs,
      hasCanonical,
      robotsMeta,
      structureScore,
      contentScore,
      technicalScore,
      overallScore,
      issues,
      recommendations,
    };

  } catch (error) {
    return createErrorResult(url, error instanceof Error ? error.message : 'Unknown error');
  }
}

function createErrorResult(url: string, error: string): PageAuditResult {
  return {
    url,
    status: 'error',
    error,
    title: null,
    metaDescription: null,
    h1Count: 0,
    h2Count: 0,
    h3Count: 0,
    hasProperHeadingHierarchy: false,
    schemaTypes: [],
    hasFaqSchema: false,
    hasHowtoSchema: false,
    hasProductSchema: false,
    hasArticleSchema: false,
    hasOrganizationSchema: false,
    wordCount: 0,
    hasQaFormat: false,
    hasLists: false,
    hasTables: false,
    internalLinksCount: 0,
    externalLinksCount: 0,
    imagesCount: 0,
    imagesWithAlt: 0,
    loadTimeMs: 0,
    hasCanonical: null,
    robotsMeta: null,
    structureScore: 0,
    contentScore: 0,
    technicalScore: 0,
    overallScore: 0,
    issues: [{ type: 'error', category: 'technical', message: error, impact: 'high' }],
    recommendations: [],
  };
}

function checkHeadingHierarchy(root: HTMLElement): boolean {
  const headings: { level: number; text: string }[] = [];
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    const tag = el.tagName?.toLowerCase();
    if (tag) {
      const level = parseInt(tag.charAt(1));
      headings.push({ level, text: el.textContent.trim() });
    }
  });

  if (headings.length === 0) return false;

  // Check if starts with H1 and doesn't skip levels
  let lastLevel = 0;
  for (const h of headings) {
    if (h.level > lastLevel + 1 && lastLevel > 0) {
      return false; // Skipped a level
    }
    lastLevel = h.level;
  }

  return headings[0]?.level === 1;
}

function extractSchemaTypes(json: any): string[] {
  const types: string[] = [];

  if (Array.isArray(json)) {
    for (const item of json) {
      types.push(...extractSchemaTypes(item));
    }
  } else if (json && typeof json === 'object') {
    if (json['@type']) {
      if (Array.isArray(json['@type'])) {
        types.push(...json['@type']);
      } else {
        types.push(json['@type']);
      }
    }
    if (json['@graph'] && Array.isArray(json['@graph'])) {
      for (const item of json['@graph']) {
        types.push(...extractSchemaTypes(item));
      }
    }
  }

  return types;
}

function checkQaFormat(root: HTMLElement, bodyText: string): boolean {
  // Check for common Q&A patterns
  const questionPatterns = [
    /what is/i,
    /how to/i,
    /why do/i,
    /when should/i,
    /where can/i,
    /who is/i,
    /\?/,
  ];

  // Check headings for questions
  let questionHeadings = 0;
  root.querySelectorAll('h2, h3, h4').forEach(el => {
    const text = el.textContent;
    if (questionPatterns.some(p => p.test(text))) {
      questionHeadings++;
    }
  });

  // Check for FAQ-style elements
  const hasFaqSection = root.querySelectorAll('[class*="faq"], [id*="faq"], details, .accordion').length > 0;

  return questionHeadings >= 2 || hasFaqSection;
}

function generateIssues(
  root: HTMLElement,
  title: string | null,
  metaDescription: string | null,
  h1Count: number,
  h2Count: number,
  hasProperHeadingHierarchy: boolean,
  schemaTypes: string[],
  wordCount: number,
  hasQaFormat: boolean,
  hasLists: boolean,
  imagesCount: number,
  imagesWithAlt: number,
  loadTimeMs: number,
  hasCanonical: string | null,
  issues: AuditIssue[]
): void {
  // Title issues
  if (!title) {
    issues.push({ type: 'error', category: 'structure', message: 'Missing page title', impact: 'high' });
  } else if (title.length < 30) {
    issues.push({ type: 'warning', category: 'structure', message: 'Page title is too short (less than 30 characters)', impact: 'medium' });
  } else if (title.length > 60) {
    issues.push({ type: 'warning', category: 'structure', message: 'Page title is too long (more than 60 characters)', impact: 'low' });
  }

  // Meta description issues
  if (!metaDescription) {
    issues.push({ type: 'error', category: 'structure', message: 'Missing meta description', impact: 'high' });
  } else if (metaDescription.length < 70) {
    issues.push({ type: 'warning', category: 'structure', message: 'Meta description is too short (less than 70 characters)', impact: 'medium' });
  } else if (metaDescription.length > 160) {
    issues.push({ type: 'warning', category: 'structure', message: 'Meta description is too long (more than 160 characters)', impact: 'low' });
  }

  // Heading issues
  if (h1Count === 0) {
    issues.push({ type: 'error', category: 'structure', message: 'Missing H1 heading', impact: 'high' });
  } else if (h1Count > 1) {
    issues.push({ type: 'warning', category: 'structure', message: 'Multiple H1 headings found (should have exactly one)', impact: 'medium' });
  }

  if (h2Count === 0) {
    issues.push({ type: 'warning', category: 'structure', message: 'No H2 headings found - content may lack structure', impact: 'medium' });
  }

  if (!hasProperHeadingHierarchy) {
    issues.push({ type: 'warning', category: 'structure', message: 'Heading hierarchy is not properly structured', impact: 'medium' });
  }

  // Schema issues
  if (schemaTypes.length === 0) {
    issues.push({ type: 'warning', category: 'schema', message: 'No structured data (schema markup) found', impact: 'high' });
  }

  // Content issues
  if (wordCount < 300) {
    issues.push({ type: 'warning', category: 'content', message: 'Content is thin (less than 300 words)', impact: 'high' });
  }

  if (!hasQaFormat) {
    issues.push({ type: 'info', category: 'content', message: 'Content does not use Q&A format that LLMs prefer', impact: 'medium' });
  }

  if (!hasLists) {
    issues.push({ type: 'info', category: 'content', message: 'No bullet points or numbered lists found', impact: 'low' });
  }

  // Image issues
  if (imagesCount > 0 && imagesWithAlt < imagesCount) {
    const missing = imagesCount - imagesWithAlt;
    issues.push({ type: 'warning', category: 'content', message: `${missing} image(s) missing alt text`, impact: 'medium' });
  }

  // Technical issues
  if (loadTimeMs > 3000) {
    issues.push({ type: 'warning', category: 'technical', message: `Page load time is slow (${(loadTimeMs / 1000).toFixed(1)}s)`, impact: 'high' });
  }

  if (!hasCanonical) {
    issues.push({ type: 'info', category: 'technical', message: 'No canonical URL specified', impact: 'low' });
  }
}

function generateRecommendations(
  title: string | null,
  metaDescription: string | null,
  h1Count: number,
  hasProperHeadingHierarchy: boolean,
  schemaTypes: string[],
  hasFaqSchema: boolean,
  hasHowtoSchema: boolean,
  wordCount: number,
  hasQaFormat: boolean,
  hasLists: boolean,
  imagesCount: number,
  imagesWithAlt: number,
  hasCanonical: string | null,
  recommendations: AuditRecommendation[]
): void {
  // Schema recommendations
  if (!hasFaqSchema) {
    recommendations.push({
      category: 'schema',
      title: 'Add FAQ Schema Markup',
      description: 'FAQ schema helps LLMs understand Q&A content and can lead to rich results in search.',
      priority: 'high',
      actionSteps: [
        'Identify common questions your page answers',
        'Structure content in clear question-answer format',
        'Add FAQPage schema markup with @type, mainEntity, and acceptedAnswer',
        'Test with Google Rich Results Test tool',
      ],
    });
  }

  if (!hasHowtoSchema && wordCount > 500) {
    recommendations.push({
      category: 'schema',
      title: 'Add HowTo Schema for Instructional Content',
      description: 'If your page contains step-by-step instructions, HowTo schema can improve visibility.',
      priority: 'medium',
      actionSteps: [
        'Identify instructional/tutorial sections',
        'Break content into numbered steps',
        'Add HowTo schema with step names and descriptions',
        'Include images for each step if applicable',
      ],
    });
  }

  // Content recommendations
  if (!hasQaFormat) {
    recommendations.push({
      category: 'content',
      title: 'Structure Content as Q&A',
      description: 'LLMs prefer content that directly answers questions. Use headings that phrase questions users might ask.',
      priority: 'high',
      actionSteps: [
        'Research questions your audience asks about this topic',
        'Convert section headings to question format (e.g., "What is...?", "How do I...?")',
        'Provide clear, concise answers immediately after each question',
        'Add a summary or TL;DR at the top of the page',
      ],
    });
  }

  if (wordCount < 1000) {
    recommendations.push({
      category: 'content',
      title: 'Expand Content Depth',
      description: 'Comprehensive content performs better with LLMs. Aim for thorough coverage of the topic.',
      priority: 'medium',
      actionSteps: [
        'Research related subtopics to cover',
        'Add examples, case studies, or data points',
        'Include comparisons with alternatives',
        'Address common objections or misconceptions',
      ],
    });
  }

  if (!hasLists) {
    recommendations.push({
      category: 'content',
      title: 'Add Structured Lists',
      description: 'Bullet points and numbered lists make content easier for LLMs to parse and cite.',
      priority: 'medium',
      actionSteps: [
        'Identify key points that can be listed',
        'Convert paragraphs with multiple items into bullet lists',
        'Use numbered lists for sequential steps',
        'Keep list items concise and parallel in structure',
      ],
    });
  }

  // Structure recommendations
  if (!hasProperHeadingHierarchy) {
    recommendations.push({
      category: 'structure',
      title: 'Fix Heading Hierarchy',
      description: 'Proper heading structure (H1 > H2 > H3) helps LLMs understand content organization.',
      priority: 'high',
      actionSteps: [
        'Ensure exactly one H1 for the main page title',
        'Use H2 for main sections',
        'Use H3 for subsections within H2 sections',
        'Don\'t skip heading levels (e.g., H1 directly to H3)',
      ],
    });
  }

  if (!metaDescription || metaDescription.length < 100) {
    recommendations.push({
      category: 'structure',
      title: 'Improve Meta Description',
      description: 'A well-crafted meta description summarizes your page for both search engines and LLMs.',
      priority: 'medium',
      actionSteps: [
        'Write a 120-160 character description',
        'Include the primary topic/keyword naturally',
        'Summarize what the page offers',
        'Include a value proposition or call to action',
      ],
    });
  }

  // Technical recommendations
  if (schemaTypes.length === 0) {
    recommendations.push({
      category: 'technical',
      title: 'Implement Schema Markup',
      description: 'Structured data helps LLMs understand your content\'s context and relationships.',
      priority: 'high',
      actionSteps: [
        'Identify the primary content type (Article, Product, FAQ, etc.)',
        'Add JSON-LD script in the page head',
        'Include relevant properties (author, datePublished, etc.)',
        'Validate with Schema.org validator',
      ],
    });
  }
}

function calculateStructureScore(
  title: string | null,
  metaDescription: string | null,
  h1Count: number,
  h2Count: number,
  h3Count: number,
  hasProperHeadingHierarchy: boolean
): number {
  let score = 0;

  // Title (25 points)
  if (title) {
    score += 15;
    if (title.length >= 30 && title.length <= 60) score += 10;
    else if (title.length > 0) score += 5;
  }

  // Meta description (25 points)
  if (metaDescription) {
    score += 15;
    if (metaDescription.length >= 70 && metaDescription.length <= 160) score += 10;
    else if (metaDescription.length > 0) score += 5;
  }

  // H1 (20 points)
  if (h1Count === 1) score += 20;
  else if (h1Count > 1) score += 10;

  // H2/H3 structure (15 points)
  if (h2Count > 0) score += 10;
  if (h3Count > 0) score += 5;

  // Hierarchy (15 points)
  if (hasProperHeadingHierarchy) score += 15;

  return Math.min(100, score);
}

function calculateContentScore(
  wordCount: number,
  hasQaFormat: boolean,
  hasLists: boolean,
  hasTables: boolean,
  internalLinksCount: number,
  imagesWithAlt: number,
  imagesCount: number
): number {
  let score = 0;

  // Word count (30 points)
  if (wordCount >= 1500) score += 30;
  else if (wordCount >= 1000) score += 25;
  else if (wordCount >= 500) score += 20;
  else if (wordCount >= 300) score += 10;

  // Q&A format (25 points)
  if (hasQaFormat) score += 25;

  // Lists and tables (15 points)
  if (hasLists) score += 10;
  if (hasTables) score += 5;

  // Internal links (15 points)
  if (internalLinksCount >= 5) score += 15;
  else if (internalLinksCount >= 2) score += 10;
  else if (internalLinksCount >= 1) score += 5;

  // Images with alt (15 points)
  if (imagesCount > 0) {
    const altRatio = imagesWithAlt / imagesCount;
    score += Math.round(altRatio * 15);
  } else {
    score += 10; // No images isn't necessarily bad
  }

  return Math.min(100, score);
}

function calculateTechnicalScore(
  loadTimeMs: number,
  hasCanonical: string | null,
  robotsMeta: string | null,
  schemaCount: number
): number {
  let score = 0;

  // Load time (35 points)
  if (loadTimeMs < 1000) score += 35;
  else if (loadTimeMs < 2000) score += 30;
  else if (loadTimeMs < 3000) score += 20;
  else if (loadTimeMs < 5000) score += 10;

  // Schema markup (35 points)
  if (schemaCount >= 3) score += 35;
  else if (schemaCount >= 2) score += 30;
  else if (schemaCount >= 1) score += 20;

  // Canonical (15 points)
  if (hasCanonical) score += 15;

  // Robots meta (15 points) - give points if not blocking
  if (!robotsMeta || !robotsMeta.includes('noindex')) {
    score += 15;
  }

  return Math.min(100, score);
}

// Database operations
export async function startSiteAudit(businessId: string, domain: string): Promise<number> {

  // Create site audit record
  const result = db.prepare(`
    INSERT INTO site_audits (business_id, status, started_at)
    VALUES (?, 'running', datetime('now'))
  `).run(businessId);

  const siteAuditId = result.lastInsertRowid as number;

  // Discover URLs
  const urls = await discoverUrls(domain);

  // Update total pages
  db.prepare(`
    UPDATE site_audits SET total_pages = ? WHERE id = ?
  `).run(urls.length, siteAuditId);

  // Create pending page audit records
  const insertPage = db.prepare(`
    INSERT INTO page_audits (site_audit_id, business_id, url, status)
    VALUES (?, ?, ?, 'pending')
  `);

  for (const url of urls) {
    insertPage.run(siteAuditId, businessId, url);
  }

  return siteAuditId;
}

export async function runPageAudit(pageAuditId: number, businessDomain: string): Promise<void> {

  // Get page info
  const page = db.prepare(`SELECT * FROM page_audits WHERE id = ?`).get(pageAuditId) as any;
  if (!page) return;

  // Analyze the page
  const result = await analyzePage(page.url, businessDomain);

  // Update page audit record
  db.prepare(`
    UPDATE page_audits SET
      status = ?,
      title = ?,
      meta_description = ?,
      h1_count = ?,
      h2_count = ?,
      h3_count = ?,
      has_proper_heading_hierarchy = ?,
      schema_types = ?,
      has_faq_schema = ?,
      has_howto_schema = ?,
      has_product_schema = ?,
      has_article_schema = ?,
      has_organization_schema = ?,
      word_count = ?,
      has_qa_format = ?,
      has_lists = ?,
      has_tables = ?,
      internal_links_count = ?,
      external_links_count = ?,
      images_count = ?,
      images_with_alt = ?,
      load_time_ms = ?,
      has_canonical = ?,
      robots_meta = ?,
      structure_score = ?,
      content_score = ?,
      technical_score = ?,
      overall_score = ?,
      issues = ?,
      recommendations = ?,
      analyzed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    result.status,
    result.title,
    result.metaDescription,
    result.h1Count,
    result.h2Count,
    result.h3Count,
    result.hasProperHeadingHierarchy ? 1 : 0,
    JSON.stringify(result.schemaTypes),
    result.hasFaqSchema ? 1 : 0,
    result.hasHowtoSchema ? 1 : 0,
    result.hasProductSchema ? 1 : 0,
    result.hasArticleSchema ? 1 : 0,
    result.hasOrganizationSchema ? 1 : 0,
    result.wordCount,
    result.hasQaFormat ? 1 : 0,
    result.hasLists ? 1 : 0,
    result.hasTables ? 1 : 0,
    result.internalLinksCount,
    result.externalLinksCount,
    result.imagesCount,
    result.imagesWithAlt,
    result.loadTimeMs,
    result.hasCanonical,
    result.robotsMeta,
    result.structureScore,
    result.contentScore,
    result.technicalScore,
    result.overallScore,
    JSON.stringify(result.issues),
    JSON.stringify(result.recommendations),
    pageAuditId
  );

  // Update site audit progress
  db.prepare(`
    UPDATE site_audits SET
      pages_analyzed = (SELECT COUNT(*) FROM page_audits WHERE site_audit_id = ? AND status != 'pending'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(page.site_audit_id, page.site_audit_id);
}

export async function completeSiteAudit(siteAuditId: number): Promise<void> {

  // Calculate overall stats
  const stats = db.prepare(`
    SELECT
      AVG(structure_score) as avgStructure,
      AVG(content_score) as avgContent,
      AVG(technical_score) as avgTechnical,
      AVG(overall_score) as avgOverall
    FROM page_audits
    WHERE site_audit_id = ? AND status = 'success'
  `).get(siteAuditId) as any;

  // Get common issues
  const pages = db.prepare(`
    SELECT issues FROM page_audits WHERE site_audit_id = ? AND status = 'success'
  `).all(siteAuditId) as any[];

  const issueCounts: Record<string, number> = {};
  for (const page of pages) {
    try {
      const issues = JSON.parse(page.issues || '[]');
      for (const issue of issues) {
        issueCounts[issue.message] = (issueCounts[issue.message] || 0) + 1;
      }
    } catch (e) {}
  }

  const commonIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue, count]) => ({ issue, count }));

  // Get top recommendations
  const topRecs: string[] = [];
  for (const page of pages.slice(0, 5)) {
    try {
      const recs = JSON.parse(page.recommendations || '[]');
      for (const rec of recs) {
        if (!topRecs.includes(rec.title)) {
          topRecs.push(rec.title);
        }
      }
    } catch (e) {}
  }

  const summary = {
    avgStructureScore: Math.round(stats?.avgStructure || 0),
    avgContentScore: Math.round(stats?.avgContent || 0),
    avgTechnicalScore: Math.round(stats?.avgTechnical || 0),
    commonIssues,
    topRecommendations: topRecs.slice(0, 5),
  };

  db.prepare(`
    UPDATE site_audits SET
      status = 'completed',
      completed_at = datetime('now'),
      overall_score = ?,
      summary = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(Math.round(stats?.avgOverall || 0), JSON.stringify(summary), siteAuditId);
}

export function getSiteAudit(businessId: string): SiteAuditSummary | null {
  const audit = db.prepare(`
    SELECT * FROM site_audits
    WHERE business_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(businessId) as any;

  if (!audit) return null;

  return {
    id: audit.id,
    businessId: audit.business_id,
    status: audit.status,
    startedAt: audit.started_at,
    completedAt: audit.completed_at,
    totalPages: audit.total_pages,
    pagesAnalyzed: audit.pages_analyzed,
    overallScore: audit.overall_score,
    summary: audit.summary ? JSON.parse(audit.summary) : null,
  };
}

export function getPageAudits(siteAuditId: number): any[] {
  return db.prepare(`
    SELECT * FROM page_audits
    WHERE site_audit_id = ?
    ORDER BY overall_score ASC
  `).all(siteAuditId) as any[];
}

export function addUrlToAudit(siteAuditId: number, businessId: string, url: string): number {

  const result = db.prepare(`
    INSERT INTO page_audits (site_audit_id, business_id, url, status)
    VALUES (?, ?, ?, 'pending')
  `).run(siteAuditId, businessId, url);

  db.prepare(`
    UPDATE site_audits SET total_pages = total_pages + 1 WHERE id = ?
  `).run(siteAuditId);

  return result.lastInsertRowid as number;
}
