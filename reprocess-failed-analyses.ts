#!/usr/bin/env tsx
/**
 * One-time script to reprocess failed mention analyses
 * This will fetch all executions where mention analysis failed and retry them
 */

import Database from 'better-sqlite3';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { perplexity } from '@ai-sdk/perplexity';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Initialize database
const db = new Database(path.join(process.cwd(), 'data', 'store.db'));

// Schema for ranking analysis
const RankingSchema = z.object({
  rankings: z.array(z.object({
    position: z.number(),
    company: z.string(),
    reason: z.string().optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  })),
  analysis: z.object({
    brandMentioned: z.boolean(),
    brandPosition: z.number().optional(),
    competitors: z.array(z.string()),
    overallSentiment: z.enum(['positive', 'neutral', 'negative']).optional().default('neutral'),
    confidence: z.number().min(0).max(1),
  }),
});

type RankingAnalysis = z.infer<typeof RankingSchema>;

// Load mention analysis prompt
function loadMentionAnalysisPrompt(): any {
  const yamlPath = path.join(process.cwd(), 'config', 'prompts', 'mention-analysis.yaml');
  const content = fs.readFileSync(yamlPath, 'utf-8');
  return yaml.load(content);
}

// Format prompt with variables
function formatPrompt(template: string, variables: Record<string, any>): string {
  let formatted = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    formatted = formatted.replace(placeholder, String(value));
  }
  return formatted;
}

// Create mention analysis prompt
function createMentionAnalysisPrompt(brandName: string, competitors: string[], response: string): string {
  const config = loadMentionAnalysisPrompt();
  const variables = {
    brandName,
    brandNameNoSpaces: brandName.replace(/\s+/g, ''),
    brandNameLowercase: brandName.toLowerCase(),
    competitors: competitors.join(', '),
    response
  };
  return formatPrompt(config.userPromptTemplate, variables);
}

// Convert ranking analysis to mention data format
function convertRankingToMentionData(analysis: RankingAnalysis, brandName: string) {
  return {
    brandMentions: analysis.analysis.brandMentioned ? 1 : 0,
    competitorsMentioned: analysis.analysis.competitors,
    analysisDetails: {
      rankings: analysis.rankings,
      brandMentioned: analysis.analysis.brandMentioned,
      brandPosition: analysis.analysis.brandPosition,
      overallSentiment: analysis.analysis.overallSentiment,
      confidence: analysis.analysis.confidence
    },
    confidence: analysis.analysis.confidence
  };
}

// Calculate visibility
function calculateVisibility(brandMentions: number, competitorsMentioned: string[], allCompetitors: string[]) {
  const businessVisibility = brandMentions > 0 ? 1 : 0;
  const competitorVisibilities: Record<string, number> = {};

  for (const competitor of allCompetitors) {
    competitorVisibilities[competitor] = competitorsMentioned.includes(competitor) ? 1 : 0;
  }

  return { businessVisibility, competitorVisibilities };
}

// Calculate share of voice
function calculateShareOfVoice(brandMentions: number, competitorsMentioned: string[], allCompetitors: string[]) {
  const businessMentioned = brandMentions > 0 ? 1 : 0;
  const knownCompetitorsMentioned = competitorsMentioned.filter(name => allCompetitors.includes(name));
  const totalMentions = businessMentioned + knownCompetitorsMentioned.length;

  let businessShareOfVoice = 0;
  if (totalMentions > 0) {
    businessShareOfVoice = Math.round((businessMentioned / totalMentions) * 1000) / 10;
  }

  const competitorShareOfVoice: Record<string, number> = {};
  for (const competitor of allCompetitors) {
    if (totalMentions > 0 && knownCompetitorsMentioned.includes(competitor)) {
      competitorShareOfVoice[competitor] = Math.round((1 / totalMentions) * 1000) / 10;
    } else {
      competitorShareOfVoice[competitor] = 0;
    }
  }

  return { businessShareOfVoice, competitorShareOfVoice };
}

// Main reprocessing function
async function reprocessFailedAnalyses() {
  console.log('Starting reprocessing of failed mention analyses...\n');

  // Fetch all failed executions
  const failedExecutions = db.prepare(`
    SELECT id, business_id, result
    FROM prompt_executions
    WHERE error_message = 'Mention analysis failed'
      AND result IS NOT NULL
      AND status = 'failed'
  `).all() as Array<{ id: number; business_id: number; result: string }>;

  console.log(`Found ${failedExecutions.length} failed executions to reprocess\n`);

  let successCount = 0;
  let failureCount = 0;

  for (const execution of failedExecutions) {
    try {
      console.log(`Processing execution ${execution.id}...`);

      // Get business info
      const business = db.prepare('SELECT business_name FROM businesses WHERE id = ?')
        .get(execution.business_id) as { business_name: string } | undefined;

      if (!business) {
        console.log(`  ❌ Business not found, skipping`);
        failureCount++;
        continue;
      }

      // Get competitors
      const competitors = db.prepare('SELECT name FROM competitors WHERE business_id = ?')
        .all(execution.business_id) as Array<{ name: string }>;
      const competitorNames = competitors.map(c => c.name);

      // Get primary platform for this business
      const platform = db.prepare(`
        SELECT platform_id, api_key
        FROM business_platforms
        WHERE business_id = ?
        LIMIT 1
      `).get(execution.business_id) as { platform_id: string; api_key: string } | undefined;

      if (!platform) {
        console.log(`  ❌ No platform found, skipping`);
        failureCount++;
        continue;
      }

      // Load platform config
      const platformsYaml = yaml.load(
        fs.readFileSync(path.join(process.cwd(), 'config', 'platforms', 'platforms.yaml'), 'utf-8')
      ) as { platforms: Record<string, { provider: string; model: string }> };

      const platformConfig = platformsYaml.platforms[platform.platform_id];
      if (!platformConfig) {
        console.log(`  ❌ Platform config not found for: ${platform.platform_id}`);
        failureCount++;
        continue;
      }

      // Create analysis prompt
      const analysisPrompt = createMentionAnalysisPrompt(
        business.business_name,
        competitorNames,
        execution.result
      );

      // Determine AI model based on provider
      let aiModel: any;
      if (platformConfig.provider === 'openai') {
        process.env.OPENAI_API_KEY = platform.api_key;
        aiModel = openai(platformConfig.model);
      } else if (platformConfig.provider === 'anthropic') {
        process.env.ANTHROPIC_API_KEY = platform.api_key;
        aiModel = anthropic(platformConfig.model);
      } else if (platformConfig.provider === 'google') {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = platform.api_key;
        aiModel = google(platformConfig.model);
      } else if (platformConfig.provider === 'xai') {
        process.env.XAI_API_KEY = platform.api_key;
        aiModel = xai(platformConfig.model);
      } else if (platformConfig.provider === 'perplexity') {
        process.env.PERPLEXITY_API_KEY = platform.api_key;
        aiModel = perplexity(platformConfig.model);
      } else {
        console.log(`  ❌ Unsupported provider: ${platformConfig.provider}`);
        failureCount++;
        continue;
      }

      // Call AI for analysis
      const { object } = await generateObject({
        model: aiModel,
        prompt: analysisPrompt,
        schema: RankingSchema,
        maxRetries: 2,
        temperature: 0.3,
      } as any) as { object: RankingAnalysis | null };

      if (!object) {
        console.log(`  ❌ No analysis object returned`);
        failureCount++;
        continue;
      }

      // Convert to mention data
      const mentionData = convertRankingToMentionData(object, business.business_name);
      const visibilityData = calculateVisibility(
        mentionData.brandMentions,
        mentionData.competitorsMentioned,
        competitorNames
      );
      const shareOfVoiceData = calculateShareOfVoice(
        mentionData.brandMentions,
        mentionData.competitorsMentioned,
        competitorNames
      );

      // Update database
      db.prepare(`
        UPDATE prompt_executions
        SET status = 'completed',
            error_message = NULL,
            brand_mentions = ?,
            competitors_mentioned = ?,
            mention_analysis = ?,
            analysis_confidence = ?,
            business_visibility = ?,
            competitor_visibilities = ?,
            share_of_voice = ?,
            competitor_share_of_voice = ?
        WHERE id = ?
      `).run(
        mentionData.brandMentions,
        JSON.stringify(mentionData.competitorsMentioned),
        JSON.stringify(mentionData.analysisDetails),
        mentionData.confidence,
        visibilityData.businessVisibility,
        JSON.stringify(visibilityData.competitorVisibilities),
        shareOfVoiceData.businessShareOfVoice,
        JSON.stringify(shareOfVoiceData.competitorShareOfVoice),
        execution.id
      );

      console.log(`  ✓ Successfully reprocessed`);
      successCount++;

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      failureCount++;
    }
  }

  console.log(`\n✅ Reprocessing complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failureCount}`);
}

// Run the script
reprocessFailedAnalyses()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    db.close();
    process.exit(1);
  });