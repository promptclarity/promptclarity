export interface BusinessInfo {
  businessName: string;
  website: string;
  logo?: string;
}

export interface Topic {
  id: string;
  name: string;
  isCustom?: boolean;
}

export interface Prompt {
  id: string;
  text: string;
  topicId?: number | string;
  topicName?: string;
  isCustom?: boolean;
}

export interface Competitor {
  id: string;
  name: string;
  website?: string;
  description?: string;
  isCustom?: boolean;
  logo?: string | null;
}

export interface Strategy {
  primaryGoal: 'visibility' | 'sentiment' | 'leads'; // kept for backwards compatibility
  goals: ('visibility' | 'sentiment' | 'leads')[];
  productSegments: string[];
  targetMarkets: string[];
  targetPersonas: string[];
  funnelStages: ('awareness' | 'consideration' | 'decision')[];
}

export interface PlatformConfig {
  id?: string;
  provider: string;
  modelName: string;
  apiKey: string;
  isPrimary?: boolean;
}

export interface OnboardingData {
  business: BusinessInfo;
  strategy: Strategy;
  platforms: PlatformConfig[];
  topics: Topic[];
  prompts: Prompt[];
  competitors: Competitor[];
}

export enum OnboardingStep {
  BUSINESS = 1,
  PLATFORMS = 2,  // Moved before Strategy so AI features have API keys available
  STRATEGY = 3,
  TOPICS = 4,
  PROMPTS = 5,
  COMPETITORS = 6,
}

// Database record types
export interface BusinessRecord {
  id: number;
  business_name: string;
  website: string;
  logo?: string;
  created_at: string;
  updated_at: string;
}

export interface OnboardingSession {
  id: number;
  business_id: number;
  step_completed: number;
  completed: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TopicRecord {
  id: number;
  business_id: number;
  name: string;
  is_custom: boolean;
  created_at: string;
}

export interface PromptRecord {
  id: number;
  business_id: number;
  topic_id?: number;
  text: string;
  is_custom: boolean;
  created_at: string;
  topic_name?: string;
}

export interface CompetitorRecord {
  id: number;
  business_id: number;
  name: string;
  website?: string;
  description?: string;
  is_custom: boolean;
  created_at: string;
}

export interface PlatformRecord {
  id: number;
  business_id: number;
  platform_id: string;
  api_key: string;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptExecution {
  id: number;
  business_id: number;
  prompt_id: number;
  platform_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface PromptExecutionWithDetails extends PromptExecution {
  prompt_text: string;
  topic_id?: number;
  topic_name?: string;
  platform_id_str?: string;
}