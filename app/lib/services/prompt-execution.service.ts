import db, { dbHelpers } from '@/app/lib/db/database';
import { PlatformRecord, PromptRecord, BusinessRecord, CompetitorRecord } from '@/app/lib/types';
import { generateText, generateObject } from 'ai';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { perplexity } from '@ai-sdk/perplexity';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { promptConfig } from '@/app/lib/config/prompts';
import { getPlatformConfig } from '@/app/lib/config/platforms';
import { getModelPricing } from '@/app/lib/config/pricing';
import { textContainsBrand, getBrandVariations } from '@/app/lib/brand-normalization';
import { z } from 'zod';

// Timeout for fetching page metadata (in ms)
const PAGE_FETCH_TIMEOUT = 5000;

/**
 * Fetch page metadata (title, description, h1) for better classification
 * Returns null if fetch fails - classification will fall back to URL-only
 */
async function fetchPageMetadata(url: string): Promise<{ title?: string; description?: string; h1?: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PromptClarity/1.0; +https://promptclarity.io)',
        'Accept': 'text/html',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : undefined;

    // Extract first h1
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].trim() : undefined;

    return { title, description, h1 };
  } catch (error) {
    // Silently fail - we'll use URL-only classification
    return null;
  }
}

/**
 * Fetch metadata for multiple URLs in parallel with concurrency limit
 */
async function fetchMultiplePageMetadata(
  urls: Array<{ url: string; domain: string; name?: string }>,
  maxConcurrent: number = 5
): Promise<Map<string, { title?: string; description?: string; h1?: string }>> {
  const results = new Map<string, { title?: string; description?: string; h1?: string }>();

  // Process in batches to avoid overwhelming servers
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async ({ url }) => {
        const metadata = await fetchPageMetadata(url);
        return { url, metadata };
      })
    );

    for (const { url, metadata } of batchResults) {
      if (metadata) {
        results.set(url, metadata);
      }
    }
  }

  return results;
}

// Cost-optimized model for analysis tasks (parsing, categorization)
// GPT-4o-mini is 15-20x cheaper than flagship models but excellent for structured tasks
const ANALYSIS_MODEL = 'gpt-4o-mini';

// Combined schema for mention analysis AND source categorization (single API call)
// Flat structure - LLMs handle flat schemas more reliably than nested ones
const CombinedAnalysisSchema = z.object({
  // Rankings/mentions analysis
  rankings: z.array(z.object({
    position: z.number(),
    company: z.string(),
    reason: z.string().optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    sentimentScore: z.number().min(0).max(100).optional(), // 0=very negative, 50=neutral, 100=very positive
  })).default([]),
  // Brand analysis fields (flattened - no wrapper)
  brandMentioned: z.boolean(),
  brandPosition: z.union([z.number(), z.null()]).optional(), // Allow null when brand not mentioned
  brandSentiment: z.union([z.enum(['positive', 'neutral', 'negative']), z.null()]).optional(), // Sentiment toward the brand (null when brand not mentioned)
  brandSentimentScore: z.union([z.number().min(0).max(100), z.null()]).optional(), // 0-100 score for brand sentiment (null when not mentioned)
  brandContext: z.union([z.string(), z.null()]).optional(), // Brief context like "recommended as top choice", "mentioned as alternative"
  competitors: z.array(z.string()).default([]),
  // Per-competitor sentiment tracking
  competitorSentiments: z.array(z.object({
    name: z.string(),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    sentimentScore: z.number().min(0).max(100).optional(), // 0-100 score
    context: z.string().optional(), // Brief context like "recommended", "being phased out", "mentioned as alternative"
  })).default([]),
  overallSentiment: z.enum(['positive', 'neutral', 'negative']).default('neutral'),
  sentimentScore: z.number().min(0).max(100).default(50), // 0=very negative, 50=neutral, 100=very positive
  confidence: z.number().min(0).max(100).default(80), // 0-100 percentage scale
  // Source categorization
  sources: z.array(z.object({
    domain: z.string(),
    url: z.string().optional(),
    type: z.enum(['You', 'Competitor', 'Corporate', 'Reference', 'Editorial', 'UGC', 'Institutional', 'Other']),
    pageType: z.enum(['Article', 'Alternative', 'Comparison', 'How-To Guide', 'Listicle', 'Product Page', 'Discussion', 'Homepage', 'Profile', 'Category Page', 'Other']).default('Other'),
    associatedBrands: z.array(z.string()).optional(), // Brands mentioned alongside this source citation
  })).default([]),
});

type CombinedAnalysis = z.infer<typeof CombinedAnalysisSchema>;

// Store WebSocket connections for real-time updates
export const promptExecutionConnections = new Map<number, (data: any) => void>();

interface ExecutionJob {
  businessId: number;
  prompt: PromptRecord;
  platform: PlatformRecord;
}

interface ExecutionResult {
  promptId: number;
  modelId: number;
  success: boolean;
  result?: string;
  error?: string;
}

export class PromptExecutionService {

  /**
   * Execute a single prompt against models for a business
   * @param businessId - The business ID
   * @param promptId - The prompt ID to execute
   * @param platformId - Optional: specific platform ID to execute against (if not provided, executes against all)
   */
  async executeSinglePrompt(businessId: 
    number, promptId: number, platformId?: 
    number): Promise<ExecutionResult[]> {
    try {
      console.log(`[PromptExecution] 
         Starting execution for prompt ${promptId}
          in business ${businessId}${platformId ? 
         ` on platform ${platformId}` : ''}`);

      // Validate business exists
      const business = this.validateBusiness(businessId);
      if (!business) {
        throw new Error(`Business ${businessId} not found`);
      }

      // Fetch and validate prompt
      const prompt = this.getPromptById(businessId, promptId);
      if (!prompt) {
        throw new Error(`Prompt ${promptId} not found in business ${businessId}`);
      }

      // Fetch models - either specific platform or all active
      let models = this.getActivePlatforms(businessId);
      if (platformId) {
        models = models.filter(m => m.id === platformId);
        if (models.length === 0) {
          throw new Error(`Platform ${platformId} not found or not active for business ${businessId}`);
        }
      }

      if (models.length === 0) {
        console.warn(`[PromptExecution] No active models found for business ${businessId}`);
        return [];
      }

      // Create execution jobs for this prompt with selected models
      const jobs = this.createExecutionJobs(businessId, [prompt], models);

      // Execute all jobs
      const results = await this.executeJobs(jobs);

      console.log(`[PromptExecution] Completed execution for prompt ${promptId}: ${results.length} results`);
      ;
      return results;
    } catch (error) {
      console.error(`[PromptExecution] Error in executeSinglePrompt:`, error);
      ;
      throw error;
    }
  }

  /**
   * Execute all prompts for a business against all models
   * Used after onboarding completion
   */
  async executeAllPrompts(businessId: number): Promise<ExecutionResult[]> {
    try {
      console.log(`[PromptExecution] Starting execution for all prompts in business ${businessId}`);
      
      // Validate business exists
      const business = this.validateBusiness(businessId);
      if (!business) {
        throw new Error(`Business ${businessId} not found`);
      }

      // Fetch all prompts
      const prompts = this.getAllPrompts(businessId);
      if (prompts.length === 0) {
        console.warn(`[PromptExecution] No prompts found for business ${businessId}`);
        return [];
      }

      // Fetch and validate models
      const models = this.getActivePlatforms(businessId);
      if (models.length === 0) {
        console.warn(`[PromptExecution] No active models found for business ${businessId}`);
        return [];
      }

      console.log(`[PromptExecution] Executing ${prompts.length} prompts against ${models.length} models`);

      // Create execution jobs for all combinations
      const jobs = this.createExecutionJobs(businessId, prompts, models);
      
      // Execute all jobs
      const results = await this.executeJobs(jobs);
      
      console.log(`[PromptExecution] Completed all executions for business ${businessId}: ${results.length} results`);
      return results;
    } catch (error) {
      console.error(`[PromptExecution] Error in executeAllPrompts:`, error);
      throw error;
    }
  }

  /**
   * Validate that a business exists
   */
  private validateBusiness(businessId: number): BusinessRecord | null {
    try {
      const business = dbHelpers.getBusiness.get(businessId) as BusinessRecord;
      return business || null;
    } catch (error) {
      console.error(`[PromptExecution] Error validating business ${businessId}:`, error);
      return null;
    }
  }

  /**
   * Get a specific prompt by ID
   */
  private getPromptById(businessId: number, promptId: number): PromptRecord | null {
    try {
      const prompts = dbHelpers.getPromptsByBusiness.all(businessId) as PromptRecord[];
      return prompts.find(p => p.id === promptId) || null;
    } catch (error) {
      console.error(`[PromptExecution] Error fetching prompt ${promptId}:`, error);
      return null;
    }
  }

  /**
   * Get all prompts for a business
   */
  private getAllPrompts(businessId: number): PromptRecord[] {
    try {
      return dbHelpers.getPromptsByBusiness.all(businessId) as PromptRecord[];
    } catch (error) {
      console.error(`[PromptExecution] Error fetching prompts for business ${businessId}:`, error);
      return [];
    }
  }

  /**
   * Get all active platforms for a business
   */
  private getActivePlatforms(businessId: number): PlatformRecord[] {
    try {
      return dbHelpers.getPlatformsByBusiness.all(businessId) as PlatformRecord[];
    } catch (error) {
      console.error(`[PromptExecution] Error fetching platforms for business ${businessId}:`, error);
      return [];
    }
  }

  /**
   * Create execution jobs for all prompt-model combinations
   */
  private createExecutionJobs(
    businessId: number, 
    prompts: PromptRecord[], 
    platforms: PlatformRecord[]
  ): ExecutionJob[] {
    const jobs: ExecutionJob[] = [];
    
    for (const prompt of prompts) {
      for (const platform of platforms) {
        jobs.push({
          businessId,
          prompt,
          platform
        });
      }
    }
    
    console.log(`[PromptExecution] Created ${jobs.length} execution jobs`);
    return jobs;
  }

  /**
   * Execute all jobs in parallel with rolling window rate limiting
   */
  private async executeJobs(jobs: ExecutionJob[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const MAX_CONCURRENT = 5; // Maximum concurrent jobs
    
    // If we have fewer jobs than the limit, just run them all
    if (jobs.length <= MAX_CONCURRENT) {
      const promises = jobs.map(job => this.executeJob(job));
      const allResults = await Promise.allSettled(promises);
      
      for (const result of allResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('[PromptExecution] Job failed:', result.reason);
        }
      }
      return results;
    }
    
    // Rolling window implementation for many jobs
    let jobIndex = 0;
    const runningJobs = new Map<number, Promise<ExecutionResult>>();
    
    // Start initial jobs up to MAX_CONCURRENT
    while (jobIndex < Math.min(MAX_CONCURRENT, jobs.length)) {
      const job = jobs[jobIndex];
      const promise = this.executeJob(job);
      runningJobs.set(jobIndex, promise);
      jobIndex++;
    }
    
    // Process jobs with rolling window
    while (runningJobs.size > 0 || jobIndex < jobs.length) {
      // Wait for any job to complete
      const runningPromises = Array.from(runningJobs.entries()).map(([index, promise]) => 
        promise.then(result => ({ index, result, status: 'fulfilled' as const }))
          .catch(error => ({ index, result: null, error, status: 'rejected' as const }))
      );
      
      const completed = await Promise.race(runningPromises);
      
      // Process the completed job
      if (completed.status === 'fulfilled') {
        results.push(completed.result);
      } else {
        console.error('[PromptExecution] Job failed:', completed.error);
      }
      
      // Remove the completed job from running jobs
      runningJobs.delete(completed.index);
      
      // Start a new job if available
      if (jobIndex < jobs.length) {
        const job = jobs[jobIndex];
        const promise = this.executeJob(job);
        runningJobs.set(jobIndex, promise);
        jobIndex++;
      }
      
      // Log progress
      const completedCount = results.length + (jobIndex - results.length - runningJobs.size);
      if (jobs.length > 10 && completedCount % 5 === 0) {
        console.log(`[PromptExecution] Progress: ${completedCount}/${jobs.length} jobs completed (${runningJobs.size} running)`);
      }
    }
    
    return results;
  }

  /**
   * Execute a single job (one prompt with one model)
   */
  private async executeJob(job: ExecutionJob): Promise<ExecutionResult> {
    const { businessId, prompt, platform } = job;

    // Check if execution already exists for today (prevent duplicates)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const refreshDate = today.toISOString().split('T')[0];

    const existingExecution = db.prepare(`
      SELECT id, status FROM prompt_executions
      WHERE business_id = ?
        AND prompt_id = ?
        AND platform_id = ?
        AND date(refresh_date) = ?
      LIMIT 1
    `).get(businessId, prompt.id, platform.id, refreshDate) as { id: number, status: string } | undefined;

    // If execution already exists and is completed or running, skip it
    if (existingExecution && (existingExecution.status === 'completed' || existingExecution.status === 'running')) {
      console.log(`[PromptExecution] Execution already ${existingExecution.status} for prompt ${prompt.id} + platform ${platform.id} on ${refreshDate}, skipping`);
      return {
        promptId: prompt.id,
        modelId: platform.id,
        success: true,
        result: 'Skipped - already executed today'
      };
    }

    // Create or reuse execution record
    const executionId = existingExecution?.id || this.createExecutionRecord(businessId, prompt.id, platform.id);

    try {
      // Double-check prompt still exists (in case it was deleted during processing)
      const promptStillExists = this.validatePromptExists(businessId, prompt.id);
      if (!promptStillExists) {
        console.warn(`[PromptExecution] Prompt ${prompt.id} no longer exists, skipping`);

        // Update the existing record to failed
        this.updateExecutionStatus(executionId, 'failed', null, 'Prompt no longer exists');

        return {
          promptId: prompt.id,
          modelId: platform.id,
          success: false,
          error: 'Prompt no longer exists'
        };
      }

      // Mark as running
      this.updateExecutionStatus(executionId, 'running');

      // Call the AI platform and track usage
      const { text: result, sources: apiSources } = await this.callAIPlatform(prompt.text, platform, businessId, 'main_query', executionId);

      // Get business info and competitors for combined analysis
      const business = this.validateBusiness(businessId);
      const competitors = dbHelpers.getCompetitorsByBusiness.all(businessId) as CompetitorRecord[];

      // Extract URLs from the response text
      const extractedUrls = this.extractURLsFromText(result);

      // Add sources from web search API response (OpenAI, Google, Perplexity)
      if (apiSources && apiSources.length > 0) {
        for (const source of apiSources) {
          try {
            const urlObj = new URL(source.url);
            const domain = urlObj.hostname.replace(/^www\./, '');
            extractedUrls.push({
              url: source.url,
              domain,
              name: source.title,
            });
          } catch (e) {
            // Invalid URL, skip
          }
        }
      }

      // Get unique URLs for categorization
      const uniqueUrls = Array.from(new Map(extractedUrls.map(u => [u.url, u])).values());

      // Fetch page metadata for better classification (title, description, h1)
      // This runs in parallel with a 5-second timeout per page
      const pageMetadata = await fetchMultiplePageMetadata(uniqueUrls.filter(u => u.url), 5);

      // Perform COMBINED mention + source analysis using cost-optimized model (GPT-4o-mini)
      // Even with no URLs, we still need to detect brand/competitor mentions
      const combinedAnalysis = await this.analyzeCombined(
        businessId,
        business?.business_name || '',
        business?.website || '',
        competitors.map(c => ({ name: c.name, website: c.website || undefined })),
        result,
        uniqueUrls,
        pageMetadata,
        2, // maxRetries
        executionId
      );

      // Check if analysis failed
      if (combinedAnalysis.analysisDetails && combinedAnalysis.analysisDetails.error === 'Analysis failed') {
        this.updateExecutionStatus(executionId, 'failed', result, 'Combined analysis failed');
        return {
          promptId: prompt.id,
          modelId: platform.id,
          success: false,
          error: 'Combined analysis failed'
        };
      }

      // Create maps from LLM categorization
      const domainTypeMap = new Map<string, string>();
      const urlPageTypeMap = new Map<string, string>();
      const urlAssociatedBrandsMap = new Map<string, string[]>();
      (combinedAnalysis.sources || []).forEach(source => {
        domainTypeMap.set(source.domain, source.type);
        if (source.url) {
          urlPageTypeMap.set(source.url, source.pageType || 'Other');
          if (source.associatedBrands && source.associatedBrands.length > 0) {
            urlAssociatedBrandsMap.set(source.url, source.associatedBrands);
          }
        }
      });

      // Build sources list with consolidated URLs (count citations per unique URL)
      // Each unique URL gets the type categorization from its domain and pageType from URL
      const urlCitationCounts = new Map<string, number>();
      extractedUrls.forEach(extracted => {
        urlCitationCounts.set(extracted.url, (urlCitationCounts.get(extracted.url) || 0) + 1);
      });

      // Create unique sources with citation counts
      const uniqueUrlStrings = [...new Set(extractedUrls.map(u => u.url))];
      const sourcesWithUrls = uniqueUrlStrings.map(url => {
        const extracted = extractedUrls.find(u => u.url === url)!;
        const associatedBrands = urlAssociatedBrandsMap.get(extracted.url);
        return {
          domain: extracted.domain,
          url: extracted.url,
          type: domainTypeMap.get(extracted.domain) || 'Other',
          pageType: urlPageTypeMap.get(extracted.url) || 'Other',
          citations: urlCitationCounts.get(url) || 1,
          ...(associatedBrands && associatedBrands.length > 0 ? { associatedBrands } : {})
        };
      });

      // Calculate visibility based on mentions
      const visibilityData = this.calculateVisibility(businessId, combinedAnalysis);

      // Calculate share of voice
      const shareOfVoiceData = this.calculateShareOfVoice(businessId, combinedAnalysis);

      // Update with success, mention data, visibility, share of voice, and sources
      this.updateExecutionStatus(executionId, 'completed', result, null, {
        ...combinedAnalysis,
        ...visibilityData,
        shareOfVoice: shareOfVoiceData.businessShareOfVoice,
        competitorShareOfVoice: shareOfVoiceData.competitorShareOfVoice,
        sources: sourcesWithUrls
      });
      
      // Calculate refresh date (beginning of today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const refreshDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Send real-time update with all execution data
      this.sendRealtimeUpdate(businessId, {
        status: 'completed',
        promptId: prompt.id,
        platformId: platform.id,
        result,
        completedAt: new Date().toISOString(),
        refreshDate: refreshDate,
        brandMentions: combinedAnalysis.brandMentions,
        competitorsMentioned: combinedAnalysis.competitorsMentioned,
        analysisConfidence: combinedAnalysis.confidence,
        businessVisibility: visibilityData.businessVisibility,
        shareOfVoice: shareOfVoiceData.businessShareOfVoice,
        competitorShareOfVoice: shareOfVoiceData.competitorShareOfVoice,
        executionCount: this.getExecutionCount(businessId, prompt.id, platform.id)
      });
      
      console.log(`[PromptExecution] Successfully executed prompt ${prompt.id} with model ${platform.id}`);
      
      return {
        promptId: prompt.id,
        modelId: platform.id,
        success: true,
        result
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PromptExecution] Error executing prompt ${prompt.id} with model ${platform.id}:`, errorMessage);
      
      // Update the existing record to failed
      this.updateExecutionStatus(executionId, 'failed', null, errorMessage);
      
      return {
        promptId: prompt.id,
        modelId: platform.id,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Validate that a prompt still exists in the database
   */
  private validatePromptExists(businessId: number, promptId: number): boolean {
    const result = dbHelpers.promptExists.get(promptId, businessId) as { count: number };
    return result && result.count > 0;
  }

  /**
   * Create a new execution record
   */
  private createExecutionRecord(businessId: number, promptId: number, modelId: number): number {
    // Create new execution record
    const result = dbHelpers.createPromptExecution.run({
      businessId,
      promptId,
      platformId: modelId
    });

    const executionId = result.lastInsertRowid as number;

    // Set refresh_date when creating the record (beginning of day in ISO 8601)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const refreshDate = today.toISOString();

    db.prepare(`
      UPDATE prompt_executions
      SET refresh_date = ?
      WHERE id = ?
    `).run(refreshDate, executionId);

    return executionId;
  }

  /**
   * Update execution status
   */
  private updateExecutionStatus(
    executionId: number,
    status: string,
    result: string | null = null,
    errorMessage: string | null = null,
    mentionData?: {
      brandMentions: number;
      competitorsMentioned: string[];
      analysisDetails: any;
      confidence: number;
      businessVisibility?: number;
      competitorVisibilities?: Record<string, number>;
      shareOfVoice?: number;
      competitorShareOfVoice?: Record<string, number>;
      sources?: Array<{ domain: string; url?: string; type: string; pageType?: string; confidence?: number }>;
    }
  ): void {
    const now = new Date().toISOString();
    const updateData: any = {
      id: executionId,
      status,
      result,
      errorMessage,
      startedAt: status === 'running' ? now : null,
      completedAt: status === 'completed' || status === 'failed' ? now : null
    };
    
    if (mentionData) {
      updateData.brandMentions = mentionData.brandMentions;
      updateData.competitorsMentioned = JSON.stringify(mentionData.competitorsMentioned);
      updateData.mentionAnalysis = JSON.stringify(mentionData.analysisDetails);
      updateData.analysisConfidence = mentionData.confidence;
    }
    
    // Update main execution fields
    dbHelpers.updatePromptExecutionStatus.run({
      id: executionId,
      status: updateData.status,
      result: updateData.result,
      errorMessage: updateData.errorMessage,
      startedAt: updateData.startedAt,
      completedAt: updateData.completedAt
    });
    
    // Update mention analysis fields if provided
    if (mentionData) {
      db.prepare(`
        UPDATE prompt_executions
        SET brand_mentions = ?,
            competitors_mentioned = ?,
            mention_analysis = ?,
            analysis_confidence = ?,
            business_visibility = ?,
            competitor_visibilities = ?,
            share_of_voice = ?,
            competitor_share_of_voice = ?,
            sources = ?
        WHERE id = ?
      `).run(
        mentionData.brandMentions,
        JSON.stringify(mentionData.competitorsMentioned),
        JSON.stringify(mentionData.analysisDetails),
        mentionData.confidence,
        mentionData.businessVisibility ?? 0,
        mentionData.competitorVisibilities ? JSON.stringify(mentionData.competitorVisibilities) : null,
        mentionData.shareOfVoice ?? 0,
        mentionData.competitorShareOfVoice ? JSON.stringify(mentionData.competitorShareOfVoice) : null,
        mentionData.sources ? JSON.stringify(mentionData.sources) : null,
        executionId
      );
    }
  }

  /**
   * Get execution count for a specific prompt-model combination
   */
  private getExecutionCount(businessId: number, promptId: number, modelId: number): number {
    const result = db.prepare(`
      SELECT COUNT(*) as count 
      FROM prompt_executions 
      WHERE business_id = ? AND prompt_id = ? AND platform_id = ? AND status = 'completed'
    `).get(businessId, promptId, modelId) as { count: number };
    
    return result?.count || 0;
  }

  /**
   * Call the AI platform with the prompt and track usage
   * @param callType - Type of call for tracking: 'main_query' | 'combined_analysis'
   * @param executionId - Optional execution ID for linking API calls to executions
   */
  private async callAIPlatform(
    promptText: string,
    platform: PlatformRecord,
    businessId?: number,
    callType: string = 'main_query',
    executionId?: number
  ): Promise<{
    text: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    sources?: Array<{ id: string; title?: string; url: string }>;
  }> {
    const startTime = Date.now();
    let success = true;
    let errorMessage: string | null = null;

    try {
      // Get platform configuration
      const config = getPlatformConfig(platform.platform_id);
      if (!config) {
        throw new Error(`Platform configuration not found for ${platform.platform_id}`);
      }

      // Send the prompt exactly as-is to get authentic responses
      // (same as what a user would see on the platform)

      let aiModel: any;

      if (config.provider === 'openai') {
        // Set API key in environment for OpenAI
        process.env.OPENAI_API_KEY = platform.api_key;
        // Use Responses API for web search capability (same as ChatGPT browser)
        aiModel = openai.responses(config.model);
      } else if (config.provider === 'anthropic') {
        // Set API key in environment for Anthropic
        process.env.ANTHROPIC_API_KEY = platform.api_key;
        // Anthropic models can be used directly without mapping
        aiModel = anthropic(config.model);
      } else if (config.provider === 'google') {
        // Set API key in environment for Google
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = platform.api_key;
        aiModel = google(config.model);
      } else if (config.provider === 'xai') {
        // Set API key in environment for xAI
        process.env.XAI_API_KEY = platform.api_key;
        aiModel = xai(config.model);
      } else if (config.provider === 'perplexity') {
        // Set API key in environment for Perplexity
        process.env.PERPLEXITY_API_KEY = platform.api_key;
        aiModel = perplexity(config.model);
      } else {
        throw new Error(`Unsupported provider: ${config.provider}`);
      }

      // Configure tools for providers that support web search
      const tools: Record<string, any> = {};
      if (config.provider === 'openai') {
        // Enable web search tool - same as ChatGPT browser experience
        tools.web_search_preview = openai.tools.webSearchPreview({
          searchContextSize: 'high', // Get comprehensive search results
        });
      } else if (config.provider === 'google') {
        // Enable Google Search for Gemini models
        tools.google_search = google.tools.googleSearch({});
      }

      // Build generateText options
      // Note: No maxTokens limit - let the model respond naturally like a typical user would see
      const generateOptions: any = {
        model: aiModel,
        prompt: promptText,
        maxRetries: 2,
        temperature: 0.7,
      };

      // Add web search tools - model decides when to use them (authentic platform behavior)
      if (Object.keys(tools).length > 0) {
        generateOptions.tools = tools;
      }

      const response = await generateText(generateOptions);

      // Extract usage info from response
      const usage = response.usage ? {
        promptTokens: response.usage.inputTokens || 0,
        completionTokens: response.usage.outputTokens || 0,
        totalTokens: response.usage.totalTokens || (response.usage.inputTokens || 0) + (response.usage.outputTokens || 0),
      } : undefined;

      // Extract sources from web search results
      // Sources can come from:
      // 1. Top-level sources property (Perplexity)
      // 2. Steps content with type: 'source' (OpenAI Responses API)
      let sources: Array<{id: string, title: string, url: string}> = [];

      // Check top-level sources (Perplexity format)
      if ((response as any).sources?.length > 0) {
        sources = (response as any).sources
          .filter((s: any) => s.sourceType === 'url')
          .map((s: any) => ({
            id: s.id,
            title: s.title,
            url: s.url,
          }));
      }

      // Check steps for source content (OpenAI Responses API format)
      if (sources.length === 0 && (response as any).steps?.length > 0) {
        for (const step of (response as any).steps) {
          if (step.content && Array.isArray(step.content)) {
            for (const item of step.content) {
              if (item.type === 'source' && item.sourceType === 'url') {
                sources.push({
                  id: item.id || '',
                  title: item.title || '',
                  url: item.url || '',
                });
              }
              // Also check for annotations within text content
              if (item.type === 'text' && item.annotations && Array.isArray(item.annotations)) {
                for (const annotation of item.annotations) {
                  if (annotation.type === 'url_citation' && annotation.url) {
                    sources.push({
                      id: annotation.id || `${sources.length}`,
                      title: annotation.title || '',
                      url: annotation.url,
                    });
                  }
                }
              }
            }
          }
        }
      }

      // If no sources found in API response, try to extract URLs from the text
      if (sources.length === 0 && response.text) {
        // Placeholder domains that are commonly used as examples in AI responses
        const placeholderDomains = [
          'example.com', 'example.org', 'example.net',
          'yourcompany.com', 'yourdomain.com', 'yoursite.com',
          'company.com', 'domain.com', 'website.com',
          'mycompany.com', 'mydomain.com', 'mysite.com',
          'acme.com', 'test.com', 'demo.com',
          'placeholder.com', 'sample.com', 'foo.com', 'bar.com',
        ];

        const urlRegex = /https?:\/\/[^\s\[\]<>"'`]+/g;
        const foundUrls = response.text.match(urlRegex);
        if (foundUrls) {
          const uniqueUrls = [...new Set(foundUrls)];
          for (const url of uniqueUrls) {
            // Clean URL (remove trailing punctuation and backticks)
            const cleanUrl = url.replace(/[.,;:!?)\]`]+$/, '');
            try {
              const urlObj = new URL(cleanUrl);
              const hostname = urlObj.hostname.replace(/^www\./, '');

              // Skip placeholder/example domains
              const isPlaceholder = placeholderDomains.some(placeholder =>
                hostname === placeholder || hostname.endsWith('.' + placeholder)
              );
              if (isPlaceholder) continue;

              sources.push({
                id: `${sources.length}`,
                title: urlObj.hostname,
                url: cleanUrl,
              });
            } catch (e) {
              // Invalid URL, skip
            }
          }
        }
      }

      const durationMs = Date.now() - startTime;

      // Track usage in database if we have business ID
      if (businessId && usage) {
        this.trackPlatformUsage(businessId, platform, usage, config.provider, config.model);
        // Also log detailed API call
        this.logApiCall(businessId, platform.id, executionId || null, callType, usage, config.provider, durationMs, true, null, config.model);
      }

      return {
        text: response.text,
        usage,
        sources: sources.length > 0 ? sources : undefined,
      };
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      const config = getPlatformConfig(platform.platform_id);
      console.error(`[PromptExecution] Error calling AI model (${config?.provider}/${config?.model}):`, error);

      // Log failed API call
      if (businessId) {
        const durationMs = Date.now() - startTime;
        this.logApiCall(businessId, platform.id, executionId || null, callType, { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, config?.provider || 'unknown', durationMs, false, errorMessage, config?.model);
      }

      throw error;
    }
  }

  /**
   * Track platform usage in the database
   */
  private trackPlatformUsage(
    businessId: number,
    platform: PlatformRecord,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    provider: string,
    model?: string
  ): void {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const estimatedCost = this.estimateCost(provider, usage, model);

      dbHelpers.upsertPlatformUsage.run({
        businessId,
        platformId: platform.id,
        date: today,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCost,
      });
    } catch (error) {
      console.error('[PromptExecution] Error tracking platform usage:', error);
      // Don't throw - usage tracking failure shouldn't break execution
    }
  }

  /**
   * Estimate cost based on provider, model, and token usage
   * Uses centralized pricing from config/pricing/model-pricing.yaml
   */
  private estimateCost(
    provider: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    model?: string
  ): number {
    // Special handling for openai-mini (GPT-4o-mini used for analysis)
    if (provider === 'openai-mini') {
      const rates = getModelPricing('openai', 'gpt-4o-mini');
      const inputCost = (usage.promptTokens / 1_000_000) * rates.input;
      const outputCost = (usage.completionTokens / 1_000_000) * rates.output;
      return Math.round((inputCost + outputCost) * 10000) / 10000;
    }

    // Get pricing from centralized config (supports model-specific pricing)
    const rates = getModelPricing(provider, model);
    const inputCost = (usage.promptTokens / 1_000_000) * rates.input;
    const outputCost = (usage.completionTokens / 1_000_000) * rates.output;

    return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
  }

  /**
   * Log detailed API call for tracking where tokens are used
   */
  private logApiCall(
    businessId: number,
    platformId: number,
    executionId: number | null,
    callType: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    provider: string,
    durationMs: number,
    success: boolean,
    errorMessage: string | null,
    model?: string
  ): void {
    try {
      const estimatedCost = this.estimateCost(provider, usage, model);

      dbHelpers.insertApiCallLog.run({
        businessId,
        platformId,
        executionId,
        callType,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCost,
        durationMs,
        success: success ? 1 : 0,
        errorMessage
      });
    } catch (error) {
      console.error('[PromptExecution] Error logging API call:', error);
      // Don't throw - logging failure shouldn't break execution
    }
  }

  /**
   * Combined analysis of mentions AND sources in a single API call
   * Uses GPT-4o-mini for cost efficiency (15-20x cheaper than flagship models)
   * This task is parsing/categorization - doesn't need advanced reasoning
   */
  private async analyzeCombined(
    businessId: number,
    businessName: string,
    businessWebsite: string,
    competitors: Array<{ name: string; website?: string }>,
    response: string,
    extractedUrls: Array<{ url: string; domain: string; name?: string }>,
    pageMetadata: Map<string, { title?: string; description?: string; h1?: string }>,
    maxRetries: number = 2,
    executionId?: number
  ): Promise<{
    brandMentions: number;
    competitorsMentioned: string[];
    analysisDetails: any;
    confidence: number;
    sources: Array<{ domain: string; url?: string; type: string; pageType?: string; associatedBrands?: string[] }>;
  }> {
    // Truncate response to reduce input tokens (first 6000 chars to capture more mentions)
    const truncatedResponse = response.length > 6000
      ? response.substring(0, 6000) + '...[truncated]'
      : response;

    // Create URL list with metadata for better classification
    const urlList = extractedUrls.length > 0
      ? extractedUrls.map(u => {
          const meta = pageMetadata.get(u.url);
          const parts = [`URL: ${u.url}`];
          // Include page title from API source or fetched metadata
          const title = u.name || meta?.title;
          if (title) parts.push(`Title: ${title}`);
          if (meta?.description) parts.push(`Description: ${meta.description.substring(0, 150)}`);
          if (meta?.h1 && meta.h1 !== meta?.title) parts.push(`H1: ${meta.h1}`);
          return parts.join(' | ');
        }).join('\n')
      : '';

    // Extract business domain for "You" classification
    const businessDomain = businessWebsite ? new URL(businessWebsite.startsWith('http') ? businessWebsite : `https://${businessWebsite}`).hostname.replace(/^www\./, '') : '';

    // Extract competitor domains for "Competitor" classification
    const competitorDomains = competitors
      .filter(c => c.website)
      .map(c => {
        try {
          const url = c.website!.startsWith('http') ? c.website! : `https://${c.website}`;
          return { name: c.name, domain: new URL(url).hostname.replace(/^www\./, '') };
        } catch { return null; }
      })
      .filter(Boolean) as Array<{ name: string; domain: string }>;

    const competitorNames = competitors.map(c => c.name);

    // Optimized prompt - shorter and more direct
    const combinedPrompt = `Analyze this AI response for brand mentions and categorize sources.

Response to analyze:
${truncatedResponse}

Brand to check: ${businessName}
Brand website domain: ${businessDomain || 'unknown'}
Competitors to check: ${competitorNames.join(', ')}
Competitor domains: ${competitorDomains.map(c => `${c.name}: ${c.domain}`).join(', ') || 'none'}
URLs found (with page titles/descriptions when available):
${urlList || 'none'}

INSTRUCTIONS:
1. For rankings: Extract ANY companies/products mentioned as recommendations in the response, with their position if listed
2. For brandMentioned: TRUE if "${businessName}" appears in the response (case-insensitive match)
2b. For brandSentiment and brandSentimentScore: If brand is mentioned, what is the sentiment toward it?
   - "positive" (75-100) - Recommended, praised, listed as a top choice
   - "neutral" (40-74) - Just mentioned without strong opinion
   - "negative" (0-39) - Criticized, not recommended, has problems
   - Provide BOTH brandSentiment (word) AND brandSentimentScore (0-100 number)
2c. For brandContext: If brand is mentioned, provide a brief context explaining how it was mentioned (e.g., "recommended as top choice", "mentioned as alternative option", "listed among competitors", "featured as industry leader")
3. For competitors array: Include ANY competitor from this list that appears in the response: ${competitorNames.join(', ')}
   - Use case-insensitive matching (e.g., "tailscale", "Tailscale", "TAILSCALE" all match "Tailscale")
   - Include partial matches for compound names (e.g., "Cloudflare Access" matches "Cloudflare")
3b. For competitorSentiments: For EACH competitor mentioned, analyze the sentiment:
   - "positive" (75-100) - Recommended, praised, listed as a top choice, good reviews
   - "neutral" (40-74) - Just mentioned without strong opinion, listed as an option
   - "negative" (0-39) - Criticized, being phased out, has problems, not recommended
   - Provide BOTH sentiment (word) AND sentimentScore (0-100 number) for each competitor
   - Include a brief context explaining why (e.g., "recommended as top choice", "being deprecated", "mentioned as legacy option")
4. For sources: Categorize ONLY the URLs explicitly provided above (DO NOT invent or generate new URLs):
   - IMPORTANT: If "URLs found" says "none", return an EMPTY sources array []
   - ONLY include URLs that appear in the "URLs found" list above - DO NOT create URLs from company names
   - type (domain type) - IMPORTANT: Check domain against brand/competitor domains first:
     * "You" - Domain matches or contains "${businessDomain}" (the brand being tracked)
     * "Competitor" - Domain matches any competitor domain: ${competitorDomains.map(c => c.domain).join(', ') || 'none'}
     * "Editorial" - News sites, blogs, review sites, tech publications (techcrunch, wired, cnet, theverge, etc.)
     * "Reference" - Wikipedia, documentation sites, official docs, knowledge bases
     * "UGC" - User-generated content: Reddit, YouTube, forums, Stack Overflow, Quora, community sites
     * "Corporate" - Company websites that aren't the brand or a competitor
     * "Institutional" - Government (.gov), education (.edu), research institutions, NGOs
     * "Other" - If none of the above fit
   - pageType (content type - ANALYZE THE URL PATH AND TITLE CAREFULLY):
     * "Alternative" - Pages about alternatives to a product (path contains /alternatives, /alternative-to, title has "alternatives to", "X alternatives", "best alternatives")
     * "Comparison" - Side-by-side comparisons (path contains /vs, /compare, /versus, title has "vs", "versus", "compared to", "comparison")
     * "Article" - News articles, blog posts, general informational content (path /blog/, /news/, /article/, title is a news headline or informational)
     * "Listicle" - Numbered/ranked lists (title starts with number like "10 Best", "Top 5", "7 Ways", path /best-, /top-)
     * "How-To Guide" - Step-by-step tutorials (title has "How to", "Guide to", "Tutorial", "Step by step", path /how-to/, /guide/, /tutorial/)
     * "Discussion" - Forums, Q&A, user discussions (domain is reddit.com, stackoverflow.com, quora.com, path /r/, /questions/, /discussion/, /forum/, /community/)
     * "Product Page" - Official product/service pages (path /product/, /pricing/, /features/, /solutions/, domain is the product's own site)
     * "Homepage" - Main landing pages (path is exactly "/" or empty, title is just company/brand name)
     * "Profile" - About/team pages (path /about/, /about-us/, /team/, /company/, title has "About")
     * "Category Page" - Category/collection pages (path /category/, /topics/, /tags/, /collections/, lists multiple items in a category)
     * "Other" - ONLY use if none of the above patterns match at all
   - associatedBrands: For EACH source, identify which brands (from "${businessName}" and competitors: ${competitorNames.join(', ')}) are mentioned IN THE SAME CONTEXT as this source citation. This is the brand the source is being used to support/reference. Examples:
     * "Brand X is highly rated [source]" → associatedBrands: ["Brand X"]
     * "Consider Brand A or Brand B [source1] [source2]" → each source gets the brands mentioned with it
     * If source is cited for general info with no brand context, use empty array []
5. For sentiment: Rate 0-100 (0=negative, 50=neutral, 100=positive)

IMPORTANT:
- For type: ALWAYS check if domain is "${businessDomain}" first → "You". Then check competitor domains → "Competitor".
- For pageType: Analyze BOTH the URL path AND page title. Check for keywords like "vs", "alternative", "best", "how to", "top 10" etc.
- pageType "Other" should be RARE - most URLs fit one of the defined categories. Look at the URL structure carefully.
- For associatedBrands: Look at which brands are mentioned in the sentence/paragraph where the source is cited. The brand being "supported" by the source citation.`;

    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[PromptExecution] Retrying combined analysis, attempt ${attempt + 1}/${maxRetries + 1}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }

        // Use GPT-4o-mini for analysis (cost-optimized)
        const analysisResult = await this.callAnalysisModel(
          combinedPrompt,
          businessId,
          executionId
        );

        // Convert to expected format (schema is now flat, no .analysis wrapper)
        // IMPORTANT: Double-check brand mention with actual string search to prevent AI hallucinations
        // Use brand normalization to check all variations of the brand name
        const actuallyMentioned = textContainsBrand(response, businessName);

        // If AI says mentioned but string search disagrees, trust the string search
        const brandMentions = (analysisResult.brandMentioned && actuallyMentioned) ? 1 : 0;
        if (analysisResult.brandMentioned && !actuallyMentioned) {
          console.log(`[PromptExecution] AI hallucination detected: claimed "${businessName}" was mentioned but string search found no match`);
        }

        // Double-check competitor mentions with string search to catch LLM misses
        // The LLM sometimes misses mentions, so we verify with case-insensitive search
        // Use brand normalization to check all variations of each competitor name
        const aiCompetitors = new Set(analysisResult.competitors || []);
        const verifiedCompetitors = new Set<string>();

        for (const competitor of competitors) {
          // Check if mentioned in response using brand normalization (checks all variations)
          if (textContainsBrand(response, competitor.name)) {
            verifiedCompetitors.add(competitor.name);
            if (!aiCompetitors.has(competitor.name)) {
              const variations = getBrandVariations(competitor.name);
              console.log(`[PromptExecution] Competitor "${competitor.name}" found via string search (variations: ${variations.join(', ')}) but missed by AI analysis`);
            }
          }
        }

        // Also verify AI-claimed competitors with word boundary check to prevent hallucinations
        for (const comp of aiCompetitors) {
          // Only trust AI if it matches a known competitor AND passes verification
          const matchedCompetitor = competitors.find(c => c.name.toLowerCase() === comp.toLowerCase());
          if (matchedCompetitor && textContainsBrand(response, matchedCompetitor.name)) {
            verifiedCompetitors.add(matchedCompetitor.name);
          } else if (matchedCompetitor) {
            console.log(`[PromptExecution] AI hallucination detected: claimed "${comp}" was mentioned but string search found no match`);
          }
        }

        const competitorsMentioned = Array.from(verifiedCompetitors);

        const analysisDetails = {
          rankings: analysisResult.rankings,
          brandMentioned: actuallyMentioned, // Use verified value, not AI's potentially hallucinated value
          brandPosition: actuallyMentioned ? analysisResult.brandPosition : null, // Only valid if actually mentioned
          brandSentiment: actuallyMentioned ? analysisResult.brandSentiment : null, // Sentiment toward the brand
          brandSentimentScore: actuallyMentioned ? analysisResult.brandSentimentScore : null, // 0-100 score for brand sentiment
          brandContext: actuallyMentioned ? analysisResult.brandContext : null, // Brief context about how brand was mentioned
          overallSentiment: analysisResult.overallSentiment,
          sentimentScore: analysisResult.sentimentScore,
          confidence: analysisResult.confidence,
          competitorSentiments: analysisResult.competitorSentiments || [] // Per-competitor sentiment with sentimentScore
        };

        // Filter out fake sources - only keep sources that were in our extractedUrls
        // The LLM sometimes generates fake URLs based on company names mentioned
        const extractedUrlSet = new Set(extractedUrls.map(u => u.url.toLowerCase()));
        const extractedDomainSet = new Set(extractedUrls.map(u => u.domain.toLowerCase()));

        const validSources = (analysisResult.sources || []).filter(
          (s: { url?: string; domain: string }) => {
            // Must have a URL and it must be in our extracted list (or domain matches)
            if (!s.url || s.url.trim() === '') return false;
            const urlLower = s.url.toLowerCase();
            const domainLower = s.domain.toLowerCase();
            // Check if URL exactly matches one we extracted, or domain matches
            return extractedUrlSet.has(urlLower) || extractedDomainSet.has(domainLower);
          }
        );

        return {
          brandMentions,
          competitorsMentioned,
          analysisDetails,
          confidence: analysisResult.confidence,
          sources: validSources
        };
      } catch (error) {
        lastError = error;
        console.error(`[PromptExecution] Error in combined analysis (attempt ${attempt + 1}):`, error);

        if (attempt === maxRetries && error instanceof Error) {
          console.error('[PromptExecution] Final combined analysis error:', error.message);
        }
      }
    }

    // All retries failed - use text-based fallback for critical data
    console.log('[PromptExecution] Using text-based fallback for competitor detection');

    // Use brand normalization to detect mentions via text search
    const actuallyMentioned = textContainsBrand(response, businessName);
    const brandMentions = actuallyMentioned ? 1 : 0;

    // Detect competitors via text search
    const competitorsMentioned: string[] = [];
    for (const competitor of competitors) {
      if (textContainsBrand(response, competitor.name)) {
        competitorsMentioned.push(competitor.name);
      }
    }

    return {
      brandMentions,
      competitorsMentioned,
      analysisDetails: {
        error: 'Analysis failed (using text fallback)',
        details: lastError instanceof Error ? lastError.message : String(lastError),
        fallbackUsed: true
      },
      confidence: competitorsMentioned.length > 0 ? 60 : 30, // Lower confidence for fallback
      sources: [] // No source classification in fallback mode
    };
  }

  /**
   * Call the cost-optimized analysis model (GPT-4o-mini)
   * Used for parsing/categorization tasks that don't need flagship model capabilities
   */
  private async callAnalysisModel(
    promptText: string,
    businessId: number,
    executionId?: number
  ): Promise<CombinedAnalysis> {
    const startTime = Date.now();

    try {
      // Get any OpenAI API key from configured platforms
      const platforms = this.getActivePlatforms(businessId);
      const openaiPlatform = platforms.find(p => p.platform_id === 'chatgpt');

      if (!openaiPlatform) {
        // Fall back to primary platform if no OpenAI key
        const primaryPlatform = platforms[0];
        if (!primaryPlatform) {
          throw new Error('No platforms configured for analysis');
        }
        return await this.callAIPlatformWithSchema(
          promptText,
          primaryPlatform,
          CombinedAnalysisSchema as any,
          'combined_analysis',
          businessId,
          executionId
        ) as CombinedAnalysis;
      }

      // Use GPT-4o-mini for cost-efficient analysis
      process.env.OPENAI_API_KEY = openaiPlatform.api_key;
      const miniModel = openai(ANALYSIS_MODEL);

      const result = await generateObject({
        model: miniModel,
        prompt: promptText,
        schema: CombinedAnalysisSchema,
        maxRetries: 4,
        temperature: 0.2, // Lower temperature for more consistent parsing
      }) as { object: CombinedAnalysis; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } };

      const durationMs = Date.now() - startTime;

      // Extract usage and log
      const usage = result.usage ? {
        promptTokens: result.usage.inputTokens || 0,
        completionTokens: result.usage.outputTokens || 0,
        totalTokens: result.usage.totalTokens || 0,
      } : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      // Track usage with special pricing for mini model
      this.trackPlatformUsage(businessId, openaiPlatform, usage, 'openai-mini', 'gpt-4o-mini');
      this.logApiCall(businessId, openaiPlatform.id, executionId || null, 'combined_analysis', usage, 'openai-mini', durationMs, true, null, 'gpt-4o-mini');

      return result.object;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PromptExecution] Error calling analysis model:`, error);

      // Log failed call
      const platforms = this.getActivePlatforms(businessId);
      const openaiPlatform = platforms.find(p => p.platform_id === 'chatgpt');
      if (openaiPlatform) {
        this.logApiCall(businessId, openaiPlatform.id, executionId || null, 'combined_analysis',
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, 'openai-mini', durationMs, false, errorMessage, 'gpt-4o-mini');
      }

      throw error;
    }
  }

  /**
   * Extract URLs and domains from AI response text
   * Prioritizes structured sources section if available
   */
  private extractURLsFromText(text: string): Array<{ url: string; domain: string; name?: string }> {
    const urls: Array<{ url: string; domain: string; name?: string }> = [];

    // Placeholder domains that are commonly used as examples in AI responses
    const placeholderDomains = [
      'example.com', 'example.org', 'example.net',
      'yourcompany.com', 'yourdomain.com', 'yoursite.com',
      'company.com', 'domain.com', 'website.com',
      'mycompany.com', 'mydomain.com', 'mysite.com',
      'acme.com', 'test.com', 'demo.com',
      'placeholder.com', 'sample.com', 'foo.com', 'bar.com',
    ];

    const isPlaceholderDomain = (domain: string): boolean => {
      const cleanDomain = domain.replace(/^www\./, '');
      return placeholderDomains.some(placeholder =>
        cleanDomain === placeholder || cleanDomain.endsWith('.' + placeholder)
      );
    };

    // First, try to extract from structured Sources section
    const sourcesMatch = text.match(/##\s*Sources?\s*\n([\s\S]*?)(?:\n##|\n\n\n|$)/i);
    if (sourcesMatch) {
      const sourcesSection = sourcesMatch[1];

      // Match patterns like:
      // 1. [Name] - URL
      // 1. Name - URL
      // - [Name](URL)
      // - Name: URL
      const structuredPatterns = [
        /\d+\.\s*\[([^\]]+)\]\s*-\s*(https?:\/\/[^\s`]+)/g,
        /\d+\.\s*([^-\n]+?)\s*-\s*(https?:\/\/[^\s`]+)/g,
        /-\s*\[([^\]]+)\]\((https?:\/\/[^\)`]+)\)/g,
        /-\s*([^:\n]+?):\s*(https?:\/\/[^\s`]+)/g,
      ];

      for (const pattern of structuredPatterns) {
        const matches = sourcesSection.matchAll(pattern);
        for (const match of matches) {
          const name = match[1]?.trim();
          const rawUrl = match[2]?.trim();
          // Clean trailing punctuation and backticks
          const url = rawUrl?.replace(/[.,;:!?)\]`]+$/, '');

          if (url) {
            try {
              const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
              const domain = urlObj.hostname.replace(/^www\./, '');
              // Skip placeholder domains
              if (isPlaceholderDomain(domain)) continue;
              urls.push({ url, domain, name });
            } catch (e) {
              // Invalid URL, skip
            }
          }
        }
      }
    }

    // Also extract URLs from the main text body (excluding sources section)
    const mainText = text.replace(/##\s*Sources?\s*\n[\s\S]*$/i, '');

    // More comprehensive URL regex (exclude backticks)
    const urlRegex = /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)(?:\/[^\s)`]*)?/g;
    const matches = mainText.matchAll(urlRegex);

    for (const match of matches) {
      // Clean trailing punctuation and backticks
      const fullUrl = match[0].replace(/[.,;:!?)\]`]+$/, '');

      try {
        const urlObj = new URL(fullUrl);
        const domain = urlObj.hostname.replace(/^www\./, '');
        // Skip placeholder domains
        if (isPlaceholderDomain(domain)) continue;
        urls.push({ url: fullUrl, domain });
      } catch (e) {
        // Invalid URL, skip
      }
    }

    // Also check for common domain patterns without http/https
    // Match domains preceded by whitespace, start of string, or opening parenthesis
    const domainRegex = /(?:^|[\s(])(?:www\.)?([a-zA-Z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|tech|cloud))\b/g;
    const domainMatches = mainText.matchAll(domainRegex);

    for (const match of domainMatches) {
      const domain = match[1].replace(/^www\./, '');
      // Skip placeholder domains
      if (isPlaceholderDomain(domain)) continue;
      urls.push({ url: `https://${domain}`, domain });
    }

    return urls;
  }

  /**
   * Call AI model with structured output schema
   * @param callType - Type of call for tracking: 'combined_analysis' etc.
   * @param businessId - Business ID for tracking
   * @param executionId - Optional execution ID for linking API calls to executions
   */
  private async callAIPlatformWithSchema<T>(
    promptText: string,
    platform: PlatformRecord,
    schema: z.ZodSchema<T>,
    callType: string = 'structured_analysis',
    businessId?: number,
    executionId?: number
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let errorMessage: string | null = null;

    try {
      // Get platform configuration
      const config = getPlatformConfig(platform.platform_id);
      if (!config) {
        throw new Error(`Platform configuration not found for ${platform.platform_id}`);
      }

      let aiModel: any;

      if (config.provider === 'openai') {
        process.env.OPENAI_API_KEY = platform.api_key;
        aiModel = openai(config.model);
      } else if (config.provider === 'anthropic') {
        process.env.ANTHROPIC_API_KEY = platform.api_key;
        aiModel = anthropic(config.model);
      } else if (config.provider === 'google') {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = platform.api_key;
        aiModel = google(config.model);
      } else if (config.provider === 'xai') {
        process.env.XAI_API_KEY = platform.api_key;
        aiModel = xai(config.model);
      } else if (config.provider === 'perplexity') {
        process.env.PERPLEXITY_API_KEY = platform.api_key;
        aiModel = perplexity(config.model);
      } else {
        throw new Error(`Unsupported provider: ${config.provider}`);
      }

      const result = await generateObject({
        model: aiModel,
        prompt: promptText,
        schema,
        maxRetries: 2,
        temperature: 0.3,
      } as any) as { object: T | null; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } };

      const durationMs = Date.now() - startTime;

      // Extract usage info if available (generateObject returns inputTokens/outputTokens)
      const usage = result.usage ? {
        promptTokens: result.usage.inputTokens || 0,
        completionTokens: result.usage.outputTokens || 0,
        totalTokens: result.usage.totalTokens || (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0),
      } : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      // Log API call if we have business ID
      if (businessId) {
        this.trackPlatformUsage(businessId, platform, usage, config.provider, config.model);
        this.logApiCall(businessId, platform.id, executionId || null, callType, usage, config.provider, durationMs, true, null, config.model);
      }

      return result.object as T;
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      const config = getPlatformConfig(platform.platform_id);
      console.error(`[PromptExecution] Error calling AI model with schema (${config?.provider}/${config?.model}):`, error);

      // Log failed API call
      if (businessId) {
        const durationMs = Date.now() - startTime;
        this.logApiCall(businessId, platform.id, executionId || null, callType, { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, config?.provider || 'unknown', durationMs, false, errorMessage, config?.model);
      }

      throw error;
    }
  }

  /**
   * Calculate visibility scores based on mention data
   * Business visibility: 1 if mentioned, 0 if not
   * Competitor visibility: 1 if mentioned, 0 if not
   */
  private calculateVisibility(
    businessId: number,
    mentionData: {
      brandMentions: number;
      competitorsMentioned: string[];
      analysisDetails: any;
      confidence: number;
    }
  ): {
    businessVisibility: number;
    competitorVisibilities: Record<string, number>;
  } {
    // Business visibility is 1 if mentioned (brandMentions > 0), 0 otherwise
    const businessVisibility = mentionData.brandMentions > 0 ? 1 : 0;
    
    // Get all competitors for this business
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessId) as CompetitorRecord[];
    
    // Calculate visibility for each competitor
    const competitorVisibilities: Record<string, number> = {};
    for (const competitor of competitors) {
      // Check if this competitor is mentioned
      const isMentioned = mentionData.competitorsMentioned.includes(competitor.name);
      competitorVisibilities[competitor.name] = isMentioned ? 1 : 0;
    }
    
    return {
      businessVisibility,
      competitorVisibilities
    };
  }

  /**
   * Calculate share of voice based on mentions
   * Share of voice = (entity mentions / total mentions) * 100
   * Only considers known competitors from the database
   */
  private calculateShareOfVoice(
    businessId: number,
    mentionData: {
      brandMentions: number;
      competitorsMentioned: string[];
      analysisDetails: any;
      confidence: number;
    }
  ): {
    businessShareOfVoice: number;
    competitorShareOfVoice: Record<string, number>;
  } {
    // Get all competitors for this business
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessId) as CompetitorRecord[];
    const competitorNames = competitors.map(c => c.name);
    
    // Count business mentions (1 if mentioned, 0 if not)
    const businessMentioned = mentionData.brandMentions > 0 ? 1 : 0;
    
    // Count competitor mentions (only known competitors)
    const knownCompetitorsMentioned = mentionData.competitorsMentioned.filter(
      name => competitorNames.includes(name)
    );
    
    // Calculate total mentions (business + all mentioned competitors)
    const totalMentions = businessMentioned + knownCompetitorsMentioned.length;
    
    // Calculate business share of voice
    let businessShareOfVoice = 0;
    if (totalMentions > 0) {
      businessShareOfVoice = Math.round((businessMentioned / totalMentions) * 1000) / 10; // Round to 1 decimal
    }
    
    // Calculate each competitor's share of voice
    const competitorShareOfVoice: Record<string, number> = {};
    for (const competitor of competitors) {
      if (totalMentions > 0 && knownCompetitorsMentioned.includes(competitor.name)) {
        // Competitor is mentioned, calculate their SOV
        competitorShareOfVoice[competitor.name] = Math.round((1 / totalMentions) * 1000) / 10;
      } else {
        // Competitor not mentioned, SOV is 0
        competitorShareOfVoice[competitor.name] = 0;
      }
    }
    
    return {
      businessShareOfVoice,
      competitorShareOfVoice
    };
  }

  /**
   * Send real-time update to connected frontend
   */
  private sendRealtimeUpdate(businessId: number, data: any): void {
    const connection = promptExecutionConnections.get(businessId);
    if (connection) {
      connection(data);
    }
  }

  /**
   * Get latest execution results for a business
   * Used by the API to fetch execution history
   */
  getLatestExecutions(businessId: number, modelId?: number): any[] {
    const params = modelId ? [businessId, businessId] : [businessId, businessId];
    let query = dbHelpers.getLatestPromptExecutions;
    
    // If modelId is provided, we need a custom query
    if (modelId) {
      query = db.prepare(`
        SELECT 
          pe.*,
          p.text as prompt_text,
          p.topic_id,
          t.name as topic_name,
          pl.platform_id,
          pl.api_key
        FROM prompt_executions pe
        INNER JOIN prompts p ON pe.prompt_id = p.id
        LEFT JOIN topics t ON p.topic_id = t.id
        INNER JOIN business_platforms pl ON pe.platform_id = pl.id
        WHERE pe.business_id = ? 
          AND pe.status = 'completed'
          AND pe.platform_id = ${modelId}
          AND pe.id IN (
            SELECT MAX(id)
            FROM prompt_executions
            WHERE business_id = ? AND status = 'completed' AND platform_id = ${modelId}
            GROUP BY prompt_id
          )
        ORDER BY pe.completed_at DESC
      `);
    }
    
    return query.all(...params);
  }

  /**
   * Re-analyze existing executions without re-querying AI platforms
   * Uses the stored response text and runs it through the updated analysis prompt
   */
  async reanalyzeExecutions(businessId: number, forceAll: boolean = false): Promise<{ success: number; failed: number }> {
    console.log(`[PromptExecution] Starting re-analysis for business ${businessId}, forceAll=${forceAll}`);

    // Get business info
    const business = dbHelpers.getBusiness.get(businessId) as BusinessRecord;
    if (!business) {
      throw new Error('Business not found');
    }

    // Get competitors
    const competitors = dbHelpers.getCompetitorsByBusiness.all(businessId) as CompetitorRecord[];

    // Get all completed executions with results that need re-analysis
    // If forceAll is true, re-analyze all executions (useful when URL extraction logic changes)
    // Otherwise only re-analyze executions with failed analysis or no analysis
    const query = forceAll
      ? `SELECT id, result, sources
         FROM prompt_executions
         WHERE business_id = ?
           AND status = 'completed'
           AND result IS NOT NULL
           AND result != ''`
      : `SELECT id, result, sources
         FROM prompt_executions
         WHERE business_id = ?
           AND status = 'completed'
           AND result IS NOT NULL
           AND result != ''
           AND (mention_analysis IS NULL OR mention_analysis LIKE '%"error":"Analysis failed"%')`;

    const executions = db.prepare(query).all(businessId) as Array<{ id: number; result: string; sources: string | null }>;

    console.log(`[PromptExecution] Found ${executions.length} executions to re-analyze`);

    let success = 0;
    let failed = 0;

    for (const execution of executions) {
      try {
        // Re-extract URLs from result text (don't rely on stored sources which may be outdated)
        const extractedUrls = this.extractURLsFromText(execution.result);

        // Fetch page metadata for URLs (for better classification)
        const pageMetadata = await fetchMultiplePageMetadata(extractedUrls.filter(u => u.url), 5);

        // Re-run the analysis with more retries for re-analysis scenarios
        const analysisResult = await this.analyzeCombined(
          businessId,
          business.business_name,
          business.website || '',
          competitors.map(c => ({ name: c.name, website: c.website || undefined })),
          execution.result,
          extractedUrls,
          pageMetadata,
          4, // More retries for re-analysis
          execution.id
        );

        // Calculate visibility and share of voice
        const visibilityData = this.calculateVisibility(businessId, analysisResult);
        const shareOfVoiceData = this.calculateShareOfVoice(businessId, analysisResult);

        // Update the execution record with all fields
        db.prepare(`
          UPDATE prompt_executions
          SET brand_mentions = ?,
              competitors_mentioned = ?,
              mention_analysis = ?,
              analysis_confidence = ?,
              business_visibility = ?,
              competitor_visibilities = ?,
              share_of_voice = ?,
              competitor_share_of_voice = ?,
              sources = ?
          WHERE id = ?
        `).run(
          analysisResult.brandMentions,
          JSON.stringify(analysisResult.competitorsMentioned),
          JSON.stringify(analysisResult.analysisDetails),
          analysisResult.confidence,
          visibilityData.businessVisibility,
          JSON.stringify(visibilityData.competitorVisibilities),
          shareOfVoiceData.businessShareOfVoice,
          JSON.stringify(shareOfVoiceData.competitorShareOfVoice),
          JSON.stringify(analysisResult.sources),
          execution.id
        );

        success++;
        console.log(`[PromptExecution] Re-analyzed execution ${execution.id}: brand=${analysisResult.brandMentions}, competitors=${analysisResult.competitorsMentioned.length}`);
      } catch (error) {
        failed++;
        console.error(`[PromptExecution] Failed to re-analyze execution ${execution.id}:`, error);
      }
    }

    console.log(`[PromptExecution] Re-analysis complete: ${success} succeeded, ${failed} failed`);
    return { success, failed };
  }
}

export const promptExecutionService = new PromptExecutionService();