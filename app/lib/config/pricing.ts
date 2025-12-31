import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface ModelPricing {
  input: number;  // Price per 1M tokens
  output: number; // Price per 1M tokens
}

export interface ProviderPricing {
  display_name: string;
  models: Record<string, ModelPricing>;
  default: ModelPricing;
}

export interface PricingConfig {
  providers: Record<string, ProviderPricing>;
}

// Load pricing configuration from YAML file
function loadPricingConfig(): PricingConfig {
  const configPath = path.join(process.cwd(), 'config', 'pricing', 'model-pricing.yaml');
  const fileContents = fs.readFileSync(configPath, 'utf8');
  return yaml.load(fileContents) as PricingConfig;
}

// Load configuration once
let pricingConfig: PricingConfig | null = null;

function getPricingConfig(): PricingConfig {
  if (!pricingConfig) {
    pricingConfig = loadPricingConfig();
  }
  return pricingConfig;
}

/**
 * Get pricing for a specific provider and model
 */
export function getModelPricing(provider: string, model?: string): ModelPricing {
  const config = getPricingConfig();
  const providerConfig = config.providers[provider];

  if (!providerConfig) {
    // Fallback default
    return { input: 2.00, output: 10.00 };
  }

  if (model && providerConfig.models[model]) {
    return providerConfig.models[model];
  }

  return providerConfig.default;
}

/**
 * Calculate cost based on token usage
 */
export function calculateCost(
  provider: string,
  usage: { promptTokens: number; completionTokens: number },
  model?: string
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = getModelPricing(provider, model);

  const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: Math.round(inputCost * 10000) / 10000,
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000,
  };
}

/**
 * Get all available pricing for display/calculator
 */
export function getAllPricing(): Record<string, { displayName: string; pricing: ModelPricing }> {
  const config = getPricingConfig();
  const result: Record<string, { displayName: string; pricing: ModelPricing }> = {};

  for (const [providerId, providerConfig] of Object.entries(config.providers)) {
    result[providerId] = {
      displayName: providerConfig.display_name,
      pricing: providerConfig.default,
    };
  }

  return result;
}

/**
 * Estimate cost for a given number of prompts
 */
export function estimatePromptCost(
  provider: string,
  promptCount: number,
  avgInputTokens: number = 500,   // Average input tokens per prompt
  avgOutputTokens: number = 1500, // Average output tokens per response
  model?: string
): { perPrompt: number; total: number; breakdown: { input: number; output: number } } {
  const pricing = getModelPricing(provider, model);

  const inputCostPerPrompt = (avgInputTokens / 1_000_000) * pricing.input;
  const outputCostPerPrompt = (avgOutputTokens / 1_000_000) * pricing.output;
  const perPrompt = inputCostPerPrompt + outputCostPerPrompt;

  return {
    perPrompt: Math.round(perPrompt * 10000) / 10000,
    total: Math.round(perPrompt * promptCount * 10000) / 10000,
    breakdown: {
      input: Math.round(inputCostPerPrompt * promptCount * 10000) / 10000,
      output: Math.round(outputCostPerPrompt * promptCount * 10000) / 10000,
    },
  };
}
