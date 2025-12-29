'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Star, StarOff, Trash2, Plus, Check, X, AlertTriangle, Activity, DollarSign, Settings2, Key, RefreshCw, BarChart3, ChevronDown, ChevronUp, Calculator, TrendingUp, Calendar, Zap } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Badge } from '@/app/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { PlatformIcon } from '@/app/components/ui/platform-icon';

interface AvailablePlatform {
  id: string;
  name: string;
  provider: string;
  model: string;
}

interface UserPlatform {
  id: string;
  platformId: string;
  apiKey: string;
  isPrimary: boolean;
}

interface PlatformUsage {
  platformId: number;
  platformName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  estimatedCostUsd: number;
}

interface BudgetWarning {
  platformId: number;
  platformName: string;
  budgetLimit: number;
  warningThreshold: number;
  currentMonthCost: number;
  usagePercent: number;
  isWarning: boolean;
  isExceeded: boolean;
}

interface UsageData {
  aggregate: {
    totalTokens: number;
    totalRequests: number;
    estimatedCostUsd: number;
  };
  byPlatform: PlatformUsage[];
  budgetWarnings: BudgetWarning[];
}

interface RealBillingData {
  [provider: string]: {
    credits_remaining?: number;
    total_usage_usd?: number;
    tokens_used?: number;
    error?: string;
    source?: 'api' | 'estimated';
  };
}

interface ApiCallBreakdown {
  callType: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgDurationMs: number;
  percentOfCost: number;
  percentOfTokens: number;
}

interface UsageBreakdownData {
  breakdown: ApiCallBreakdown[];
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
}

interface PlatformCallType {
  callType: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgDurationMs: number;
}

interface PlatformBreakdownItem {
  platformId: number;
  platformName: string;
  callTypes: PlatformCallType[];
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
}

interface PlatformBreakdownData {
  platforms: PlatformBreakdownItem[];
}

interface UsageStatistics {
  currentMonth: {
    period: string;
    daysActive: number;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    requests: number;
    cost: number;
  };
  lastMonth: {
    period: string;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    requests: number;
    cost: number;
  };
  allTime: {
    firstDate: string | null;
    lastDate: string | null;
    daysActive: number;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    requests: number;
    cost: number;
  };
  averages: {
    dailyCost: number;
    dailyTokens: number;
    dailyRequests: number;
    costPerRequest: number;
    tokensPerRequest: number;
  };
  projections: {
    monthlyCost: number;
    monthlyTokens: number;
  };
  costBreakdown: {
    inputCost: number;
    outputCost: number;
    inputPercent: number;
    outputPercent: number;
  };
  byPlatform: Array<{
    platformId: number;
    platformName: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
    cost: number;
    costPercent: number;
  }>;
  byCallType: Array<{
    callType: string;
    callCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    avgDurationMs: number;
    costPercent: number;
  }>;
  daily: Array<{
    date: string;
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    requests: number;
    cost: number;
  }>;
  pricing: Record<string, { displayName: string; pricing: { input: number; output: number } }>;
}

interface CalculatorEstimate {
  platformId: string;
  perPrompt: number;
  total: number;
  inputCost: number;
  outputCost: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  executionCount: number;
  hasActualData: boolean;
  isConfigured: boolean;
  pricing: {
    inputPer1M: number;
    outputPer1M: number;
  };
}

interface CalculatorInput {
  promptCount: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  dataSource: 'actual' | 'estimated';
  totalExecutions: number;
}

// Cost warning threshold in USD
const COST_WARNING_THRESHOLD = 5.00;

export default function ModelsPage() {
  const { business, switchCount } = useBusiness();
  const [availablePlatforms, setAvailablePlatforms] = useState<AvailablePlatform[]>([]);
  const [userPlatforms, setUserPlatforms] = useState<UserPlatform[]>([]);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Track platforms being added with their API keys
  const [addingPlatform, setAddingPlatform] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [showNewApiKey, setShowNewApiKey] = useState(false);

  // Budget editing state
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetValue, setBudgetValue] = useState('');

  // Admin API key state
  const [editingAdminKey, setEditingAdminKey] = useState<string | null>(null);
  const [adminKeyValue, setAdminKeyValue] = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [realBilling, setRealBilling] = useState<RealBillingData>({});
  const [fetchingBilling, setFetchingBilling] = useState(false);

  // Token breakdown state
  const [usageBreakdown, setUsageBreakdown] = useState<UsageBreakdownData | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [fetchingBreakdown, setFetchingBreakdown] = useState(false);
  const [breakdownView, setBreakdownView] = useState<'summary' | 'by_platform'>('summary');
  const [platformBreakdown, setPlatformBreakdown] = useState<PlatformBreakdownData | null>(null);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());

  // Usage statistics state
  const [usageStats, setUsageStats] = useState<UsageStatistics | null>(null);
  const [showStatistics, setShowStatistics] = useState(false);
  const [fetchingStats, setFetchingStats] = useState(false);

  // Cost calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcPromptCount, setCalcPromptCount] = useState(10);
  const [calcEstimates, setCalcEstimates] = useState<CalculatorEstimate[]>([]);
  const [calcInput, setCalcInput] = useState<CalculatorInput | null>(null);
  const [fetchingCalc, setFetchingCalc] = useState(false);

  // Fetch data when business changes or switchCount increments
  useEffect(() => {
    if (business?.id) {
      // Clear all data immediately when fetching for new business
      setUserPlatforms([]);
      setUsageData(null);
      setLoading(true);

      // Fetch with the current business.id
      fetchData(business.id);
    } else {
      setLoading(false);
    }
  }, [business?.id, switchCount]);

  const fetchData = async (businessIdOverride?: number) => {
    try {
      setLoading(true);
      const businessId = businessIdOverride || business?.id;
      if (!businessId) {
        setError('No business found. Please complete onboarding first.');
        setLoading(false);
        return;
      }

      // Fetch available platforms, user's configured platforms, and usage in parallel
      const [availableRes, userRes, usageRes] = await Promise.all([
        fetch('/api/available-platforms'),
        fetch(`/api/onboarding/platforms?businessId=${businessId}`),
        fetch(`/api/platform-usage?businessId=${businessId}`)
      ]);

      if (availableRes.ok) {
        const availableData = await availableRes.json();
        setAvailablePlatforms(availableData.platforms || []);
      }

      if (userRes.ok) {
        const userData = await userRes.json();
        setUserPlatforms(userData.userPlatforms || []);
      }

      if (usageRes.ok) {
        const usageDataRes = await usageRes.json();
        setUsageData(usageDataRes);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load platform data');
    } finally {
      setLoading(false);
    }
  };


  const getApiKeyPlaceholder = (platformId: string) => {
    switch (platformId) {
      case 'chatgpt':
        return 'sk-...';
      case 'claude':
        return 'sk-ant-...';
      case 'gemini':
        return 'AI...';
      case 'perplexity':
        return 'pplx-...';
      case 'grok':
        return 'xai-...';
      default:
        return 'Enter your API key';
    }
  };

  const getApiKeyHelpText = (platformId: string) => {
    switch (platformId) {
      case 'chatgpt':
        return 'Get your API key from platform.openai.com';
      case 'claude':
        return 'Get your API key from console.anthropic.com';
      case 'gemini':
        return 'Get your API key from makersuite.google.com';
      case 'perplexity':
        return 'Get your API key from perplexity.ai/settings/api';
      case 'grok':
        return 'Get your API key from x.ai';
      default:
        return 'Enter your API key for this platform';
    }
  };

  const maskApiKey = (apiKey: string) => {
    if (apiKey.length <= 8) return '••••••••';
    return apiKey.substring(0, 4) + '••••••••' + apiKey.substring(apiKey.length - 4);
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(2)}`;
  };

  const getPlatformUsage = (platformName: string): PlatformUsage | undefined => {
    return usageData?.byPlatform.find(p => p.platformName === platformName);
  };

  const fetchRealBilling = async () => {
    if (!business?.id) return;
    setFetchingBilling(true);
    try {
      const response = await fetch(`/api/billing?businessId=${business.id}`);
      if (response.ok) {
        const data = await response.json();
        setRealBilling(data.billing || {});
      }
    } catch (err) {
      console.error('Error fetching billing:', err);
    } finally {
      setFetchingBilling(false);
    }
  };

  const fetchUsageBreakdown = async (view: 'summary' | 'by_platform' = 'summary') => {
    if (!business?.id) return;
    setFetchingBreakdown(true);
    try {
      const response = await fetch(`/api/usage/breakdown?businessId=${business.id}&view=${view}`);
      if (response.ok) {
        const data = await response.json();
        if (view === 'summary') {
          setUsageBreakdown(data);
        } else {
          setPlatformBreakdown(data);
        }
      }
    } catch (err) {
      console.error('Error fetching usage breakdown:', err);
    } finally {
      setFetchingBreakdown(false);
    }
  };

  const fetchUsageStatistics = async () => {
    if (!business?.id) return;
    setFetchingStats(true);
    try {
      const response = await fetch(`/api/usage/statistics?businessId=${business.id}`);
      if (response.ok) {
        const data = await response.json();
        setUsageStats(data);
      }
    } catch (err) {
      console.error('Error fetching usage statistics:', err);
    } finally {
      setFetchingStats(false);
    }
  };

  const fetchCalculatorEstimates = async (promptCount: number) => {
    if (!business?.id) return;
    setFetchingCalc(true);
    try {
      const response = await fetch('/api/usage/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          promptCount,
          configuredPlatforms: userPlatforms.map(p => p.platformId),
          includeAllPlatforms: true, // Include unconfigured platforms too
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setCalcEstimates(data.estimates || []);
        setCalcInput(data.input || null);
      }
    } catch (err) {
      console.error('Error fetching calculator estimates:', err);
    } finally {
      setFetchingCalc(false);
    }
  };

  const getCallTypeLabel = (callType: string): string => {
    switch (callType) {
      case 'main_query':
        return 'Main Query';
      case 'combined_analysis':
        return 'Analysis';
      case 'structured_analysis':
        return 'Structured Analysis';
      default:
        return callType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  const getCallTypeDescription = (callType: string): string => {
    switch (callType) {
      case 'main_query':
        return 'Initial prompt execution to get AI response';
      case 'combined_analysis':
        return 'Analysis of mentions, competitors, and sources';
      case 'structured_analysis':
        return 'Structured data extraction';
      default:
        return '';
    }
  };

  const saveAdminApiKey = async (platformId: string, adminKey: string | null) => {
    if (!business?.id) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          platformId,
          adminApiKey: adminKey || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save admin key');
      }

      setSuccess(adminKey ? 'Admin API key saved - click refresh to fetch real billing' : 'Admin API key removed');
      setTimeout(() => setSuccess(''), 3000);

      // Fetch real billing data if key was added
      if (adminKey) {
        await fetchRealBilling();
      } else {
        // Remove from realBilling
        const newBilling = { ...realBilling };
        delete newBilling[platformId];
        setRealBilling(newBilling);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save admin API key');
    } finally {
      setSaving(false);
      setEditingAdminKey(null);
      setAdminKeyValue('');
      setShowAdminKey(false);
    }
  };

  const supportsRealBilling = (platformId: string) => {
    return ['chatgpt', 'claude'].includes(platformId);
  };

  const getAdminKeyHelpText = (platformId: string) => {
    switch (platformId) {
      case 'chatgpt':
        return 'Get admin key from platform.openai.com/organization/api-keys (requires org admin)';
      case 'claude':
        return 'Get admin key from console.anthropic.com/settings/admin-keys';
      default:
        return '';
    }
  };

  const saveBudget = async (platformId: string, budget: string | null) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/platforms/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformId,
          budgetLimit: budget === '' ? null : budget,
          warningThreshold: 80,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update budget');
      }

      setSuccess('Budget updated successfully');
      setTimeout(() => setSuccess(''), 3000);
      // Refresh data to get updated budget warnings
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update budget');
    } finally {
      setSaving(false);
      setEditingBudget(null);
      setBudgetValue('');
    }
  };

  const savePlatforms = async (platforms: UserPlatform[]) => {
    const businessId = localStorage.getItem('onboardingBusinessId');
    if (!businessId) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/onboarding/platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId),
          platforms: platforms.map(p => ({
            platformId: p.platformId,
            apiKey: p.apiKey,
            isPrimary: p.isPrimary
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save');
      }

      setUserPlatforms(platforms);
      setSuccess('Changes saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = async (platformId: string) => {
    const updated = userPlatforms.map(p => ({
      ...p,
      isPrimary: p.platformId === platformId
    }));
    await savePlatforms(updated);
  };

  const removePlatform = async (platformId: string) => {
    // ChatGPT is required and cannot be removed
    if (platformId === 'chatgpt') {
      setError('ChatGPT (OpenAI) is required');
      return;
    }

    if (userPlatforms.length <= 1) {
      setError('You must have at least one LLM platform configured');
      return;
    }

    const platformToRemove = userPlatforms.find(p => p.platformId === platformId);
    const remaining = userPlatforms.filter(p => p.platformId !== platformId);

    // If removing primary, make another one primary
    if (platformToRemove?.isPrimary && remaining.length > 0) {
      remaining[0].isPrimary = true;
    }

    await savePlatforms(remaining);
  };

  const startAddingPlatform = (platformId: string) => {
    setAddingPlatform(platformId);
    setNewApiKey('');
    setShowNewApiKey(false);
    setError('');
  };

  const cancelAddingPlatform = () => {
    setAddingPlatform(null);
    setNewApiKey('');
    setShowNewApiKey(false);
  };

  const confirmAddPlatform = async () => {
    if (!addingPlatform || !newApiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    const isFirst = userPlatforms.length === 0;
    const newPlatform: UserPlatform = {
      id: Date.now().toString(),
      platformId: addingPlatform,
      apiKey: newApiKey.trim(),
      isPrimary: isFirst
    };

    await savePlatforms([...userPlatforms, newPlatform]);
    cancelAddingPlatform();
  };

  const updateApiKey = async (platformId: string, newKey: string) => {
    const updated = userPlatforms.map(p =>
      p.platformId === platformId ? { ...p, apiKey: newKey } : p
    );
    await savePlatforms(updated);
  };

  // Get platforms that are not yet configured
  const unconfiguredPlatforms = availablePlatforms.filter(
    ap => !userPlatforms.some(up => up.platformId === ap.id)
  );

  // Get full platform info for configured platforms
  const configuredPlatformsWithInfo = userPlatforms.map(up => ({
    ...up,
    info: availablePlatforms.find(ap => ap.id === up.platformId)
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading LLM platforms...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Status Messages */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200 mb-4">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Budget Warning Alerts */}
      {usageData?.budgetWarnings && usageData.budgetWarnings.length > 0 && (
        <div className="space-y-2 mb-4">
          {usageData.budgetWarnings.map((warning) => (
            <Alert
              key={warning.platformId}
              className={warning.isExceeded ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}
            >
              <AlertTriangle className={`h-4 w-4 ${warning.isExceeded ? 'text-red-600' : 'text-amber-600'}`} />
              <AlertDescription className={warning.isExceeded ? 'text-red-800' : 'text-amber-800'}>
                <span className="">
                  {warning.isExceeded ? 'Budget Exceeded' : 'Budget Warning'}:
                </span>{' '}
                {warning.platformName} has used {formatCost(warning.currentMonthCost)} of {formatCost(warning.budgetLimit)} budget ({warning.usagePercent.toFixed(0)}%).
                {warning.isExceeded
                  ? ' Top up your credits on the platform to continue using this model.'
                  : ' Consider topping up your credits soon.'}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Cost Warning Alert (fallback for users without budget set) */}
      {usageData && usageData.aggregate.estimatedCostUsd >= COST_WARNING_THRESHOLD && (!usageData.budgetWarnings || usageData.budgetWarnings.length === 0) && (
        <Alert className="bg-amber-50 border-amber-200 mb-4">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <span className="">Usage Alert:</span> Your estimated API costs have reached {formatCost(usageData.aggregate.estimatedCostUsd)} this month.
            Set a budget limit per model to get notified when credits are running low.
          </AlertDescription>
        </Alert>
      )}

      {/* Active Models Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2 h-5">
          <span className="text-sm">Active Platforms</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-gray-400">LLM platforms configured for tracking</span>
        </div>
        <Card>
          <CardContent className="pt-3 space-y-2">
          {configuredPlatformsWithInfo.length === 0 ? (
            <p className="text-muted-foreground text-center py-4 text-sm">
              No LLM platforms configured yet. Add one below to get started.
            </p>
          ) : (
            configuredPlatformsWithInfo.map((platform) => {
              const usage = getPlatformUsage(platform.platformId);
              const budgetWarning = usageData?.budgetWarnings?.find(w => w.platformName === platform.platformId);
              return (
                <div
                  key={platform.platformId}
                  className="flex items-center gap-3 px-3 py-2 border rounded-md bg-card"
                >
                  <div className="shrink-0">
                    <PlatformIcon platformId={platform.platformId} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className=" text-sm">
                        {platform.info?.name || platform.platformId}
                      </span>
                      {platform.platformId === 'chatgpt' && (
                        <Badge variant="secondary" className="bg-green-100 text-green-900 text-xs px-1.5 py-0">
                          Required
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {platform.info?.model}
                      </span>
                    </div>
                    {usage && usage.totalTokens > 0 && (
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{usage.requestCount} requests</span>
                        <span>{formatTokens(usage.totalTokens)} tokens</span>
                        <span className={usage.estimatedCostUsd >= 1 ? 'text-amber-600 ' : ''}>
                          {formatCost(usage.estimatedCostUsd)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Admin API Key (for real billing) */}
                  {supportsRealBilling(platform.platformId) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {editingAdminKey === platform.platformId ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type={showAdminKey ? 'text' : 'password'}
                            placeholder="Admin API key..."
                            value={adminKeyValue}
                            onChange={(e) => setAdminKeyValue(e.target.value)}
                            className="h-6 w-32 text-xs"
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setShowAdminKey(!showAdminKey)}
                          >
                            {showAdminKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => saveAdminApiKey(platform.platformId, adminKeyValue || null)}
                            disabled={saving}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingAdminKey(null);
                              setAdminKeyValue('');
                              setShowAdminKey(false);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-6 px-2 text-xs ${realBilling[platform.platformId] ? 'text-green-600' : ''}`}
                              onClick={() => {
                                setEditingAdminKey(platform.platformId);
                                setAdminKeyValue('');
                              }}
                            >
                              <Key className="h-3 w-3 mr-0.5" />
                              {realBilling[platform.platformId] ? (
                                <span>Connected</span>
                              ) : (
                                <span className="text-muted-foreground">Billing</span>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px]">
                            <p className="text-xs">
                              {realBilling[platform.platformId]
                                ? 'Admin key connected for real billing'
                                : getAdminKeyHelpText(platform.platformId)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  {/* Budget Limit */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {editingBudget === platform.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={budgetValue}
                          onChange={(e) => setBudgetValue(e.target.value)}
                          className="h-6 w-16 text-xs"
                          autoFocus
                          min="0"
                          step="0.01"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => saveBudget(platform.id, budgetValue)}
                          disabled={saving}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => {
                            setEditingBudget(null);
                            setBudgetValue('');
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-6 px-2 text-xs ${budgetWarning?.isExceeded ? 'text-red-600' : budgetWarning?.isWarning ? 'text-amber-600' : ''}`}
                            onClick={() => {
                              setEditingBudget(platform.id);
                              setBudgetValue(budgetWarning?.budgetLimit?.toString() || '');
                            }}
                          >
                            <DollarSign className="h-3 w-3 mr-0.5" />
                            {budgetWarning ? (
                              <span>{budgetWarning.usagePercent.toFixed(0)}%</span>
                            ) : (
                              <span className="text-muted-foreground">Set limit</span>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            {budgetWarning
                              ? `Budget: ${formatCost(budgetWarning.currentMonthCost)} / ${formatCost(budgetWarning.budgetLimit)}`
                              : 'Click to set budget limit'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* API Key Display */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <span className="px-1.5 py-0.5 bg-muted rounded text-xs cursor-help font-mono">
                          {maskApiKey(platform.apiKey)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[400px] bg-popover text-popover-foreground border shadow-md">
                        <p className="text-xs font-mono break-all select-all">{platform.apiKey}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Primary Selection */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => !platform.isPrimary && setPrimary(platform.platformId)}
                          disabled={saving || platform.isPrimary}
                          className="p-1 rounded transition-colors hover:bg-muted disabled:cursor-default"
                        >
                          <Star className={`h-4 w-4 ${
                            platform.isPrimary
                              ? 'fill-yellow-500 text-yellow-500'
                              : 'text-muted-foreground/40 hover:text-yellow-500/50'
                          }`} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px]">
                        <p className="text-xs">
                          {platform.isPrimary
                            ? 'Primary model for generating prompts and analyses'
                            : 'Click to make this the primary model'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Remove Action */}
                  <div className="flex items-center shrink-0">
                    {platform.platformId !== 'chatgpt' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removePlatform(platform.platformId)}
                        disabled={saving}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          </CardContent>
        </Card>
      </div>

      {/* Available Platforms Section */}
      {unconfiguredPlatforms.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 h-5">
            <span className="text-sm">Available Platforms</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-gray-400">Add more LLM platforms to track your brand visibility</span>
          </div>
          <Card>
            <CardContent className="pt-3 space-y-2">
            {unconfiguredPlatforms.map((platform) => (
              <div
                key={platform.id}
                className="flex items-center gap-3 px-3 py-2 border rounded-md border-dashed bg-muted/30"
              >
                <div className="shrink-0 opacity-60">
                  <PlatformIcon platformId={platform.id} />
                </div>
                <div className="flex-1 min-w-0">
                  {addingPlatform === platform.id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className=" text-sm">{platform.name}</span>
                        <span className="text-xs text-muted-foreground">{platform.model}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input
                          type={showNewApiKey ? 'text' : 'password'}
                          placeholder={getApiKeyPlaceholder(platform.id)}
                          value={newApiKey}
                          onChange={(e) => setNewApiKey(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0"
                          onClick={() => setShowNewApiKey(!showNewApiKey)}
                        >
                          {showNewApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={confirmAddPlatform}
                          disabled={saving || !newApiKey.trim()}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {saving ? 'Adding...' : 'Add'}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={cancelAddingPlatform}
                          disabled={saving}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {getApiKeyHelpText(platform.id)}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className=" text-sm">{platform.name}</span>
                      <span className="text-xs text-muted-foreground">{platform.model}</span>
                    </div>
                  )}
                </div>
                {addingPlatform !== platform.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => startAddingPlatform(platform.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>
            ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Usage Summary */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 h-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Usage (Last 30 Days)</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-gray-400">API requests and estimated costs</span>
          </div>
          {Object.keys(realBilling).length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={fetchRealBilling}
              disabled={fetchingBilling}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${fetchingBilling ? 'animate-spin' : ''}`} />
              Refresh Billing
            </Button>
          )}
        </div>
        <Card>
          <CardContent className="pt-3">
          {usageData && usageData.aggregate.totalRequests > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl tabular-nums">{usageData.aggregate.totalRequests}</div>
                <div className="text-sm text-muted-foreground">Requests</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl tabular-nums">{formatTokens(usageData.aggregate.totalTokens)}</div>
                <div className="text-sm text-muted-foreground">Tokens</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className={`text-2xl tabular-nums ${usageData.aggregate.estimatedCostUsd >= COST_WARNING_THRESHOLD ? 'text-amber-600' : ''}`}>
                  {formatCost(usageData.aggregate.estimatedCostUsd)}
                </div>
                <div className="text-sm text-muted-foreground">Est. Cost</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[100px]">
              <span className="text-gray-400 text-sm">No usage data available</span>
            </div>
          )}

          {/* Real billing data from APIs */}
          {Object.keys(realBilling).length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs  mb-2 text-muted-foreground">Real Billing (from provider APIs)</p>
              <div className="space-y-2">
                {Object.entries(realBilling).map(([provider, data]) => (
                  <div key={provider} className="flex items-center justify-between text-sm bg-green-50 dark:bg-green-950/30 rounded px-3 py-2">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platformId={provider} size="md" />
                      <span className=" capitalize">{provider === 'chatgpt' ? 'OpenAI' : provider}</span>
                    </div>
                    {data.error ? (
                      <span className="text-xs text-red-600">{data.error}</span>
                    ) : (
                      <div className="flex items-center gap-4 text-xs">
                        {data.total_usage_usd !== undefined && (
                          <span>Usage: <span className="">{formatCost(data.total_usage_usd)}</span></span>
                        )}
                        {data.credits_remaining !== undefined && (
                          <span>Credits: <span className=" text-green-600">{formatCost(data.credits_remaining)}</span></span>
                        )}
                        {data.tokens_used !== undefined && (
                          <span>{formatTokens(data.tokens_used)} tokens</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Token Usage Breakdown by Call Type */}
          {usageData && usageData.aggregate.totalRequests > 0 && (
            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => {
                  if (!showBreakdown) {
                    if (breakdownView === 'summary' && !usageBreakdown) {
                      fetchUsageBreakdown('summary');
                    } else if (breakdownView === 'by_platform' && !platformBreakdown) {
                      fetchUsageBreakdown('by_platform');
                    }
                  }
                  setShowBreakdown(!showBreakdown);
                }}
                className="flex items-center gap-2 w-full text-left"
              >
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs  text-muted-foreground">Token Usage Breakdown</span>
                {fetchingBreakdown ? (
                  <RefreshCw className="h-3 w-3 animate-spin ml-auto" />
                ) : showBreakdown ? (
                  <ChevronUp className="h-3 w-3 ml-auto" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-auto" />
                )}
              </button>

              {showBreakdown && (
                <div className="mt-3 space-y-3">
                  {/* View Toggle */}
                  <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                    <button
                      onClick={() => {
                        setBreakdownView('summary');
                        if (!usageBreakdown) fetchUsageBreakdown('summary');
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs  rounded-md transition-colors ${
                        breakdownView === 'summary'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      By Call Type
                    </button>
                    <button
                      onClick={() => {
                        setBreakdownView('by_platform');
                        if (!platformBreakdown) fetchUsageBreakdown('by_platform');
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs  rounded-md transition-colors ${
                        breakdownView === 'by_platform'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      By Platform
                    </button>
                  </div>

                  {/* Summary View (By Call Type) */}
                  {breakdownView === 'summary' && usageBreakdown && usageBreakdown.breakdown.length > 0 && (
                    <div className="space-y-2">
                      {usageBreakdown.breakdown.map((item) => (
                        <div
                          key={item.callType}
                          className="bg-muted/30 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-sm ">{getCallTypeLabel(item.callType)}</span>
                              {getCallTypeDescription(item.callType) && (
                                <p className="text-xs text-muted-foreground">{getCallTypeDescription(item.callType)}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-sm ">{formatCost(item.cost)}</span>
                              <p className="text-xs text-muted-foreground">{item.percentOfCost}% of cost</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div className="bg-background rounded p-2 text-center">
                              <div className="">{item.callCount}</div>
                              <div className="text-muted-foreground">Calls</div>
                            </div>
                            <div className="bg-background rounded p-2 text-center">
                              <div className="">{formatTokens(item.promptTokens)}</div>
                              <div className="text-muted-foreground">Input</div>
                            </div>
                            <div className="bg-background rounded p-2 text-center">
                              <div className="">{formatTokens(item.completionTokens)}</div>
                              <div className="text-muted-foreground">Output</div>
                            </div>
                            <div className="bg-background rounded p-2 text-center">
                              <div className="">{item.avgDurationMs}ms</div>
                              <div className="text-muted-foreground">Avg Time</div>
                            </div>
                          </div>
                          {/* Cost breakdown bar */}
                          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full"
                              style={{ width: `${item.percentOfCost}%` }}
                            />
                          </div>
                        </div>
                      ))}

                      {/* Totals summary */}
                      <div className="bg-primary/5 rounded-lg p-3 mt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm ">Total</span>
                          <span className="text-sm ">{formatCost(usageBreakdown.totals.cost)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                          <div className="text-center">
                            <div className="">{usageBreakdown.totals.calls}</div>
                            <div className="text-muted-foreground">API Calls</div>
                          </div>
                          <div className="text-center">
                            <div className="">{formatTokens(usageBreakdown.totals.promptTokens)}</div>
                            <div className="text-muted-foreground">Input Tokens</div>
                          </div>
                          <div className="text-center">
                            <div className="">{formatTokens(usageBreakdown.totals.completionTokens)}</div>
                            <div className="text-muted-foreground">Output Tokens</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Platform View (By Platform > Call Type) */}
                  {breakdownView === 'by_platform' && platformBreakdown && platformBreakdown.platforms.length > 0 && (
                    <div className="space-y-2">
                      {platformBreakdown.platforms.map((platform) => {
                        const isExpanded = expandedPlatforms.has(platform.platformName);
                        const platformInfo = availablePlatforms.find(ap => ap.id === platform.platformName);
                        const totalCost = platformBreakdown.platforms.reduce((sum, p) => sum + p.totals.cost, 0);
                        const costPercent = totalCost > 0 ? Math.round((platform.totals.cost / totalCost) * 100) : 0;

                        return (
                          <div
                            key={platform.platformName}
                            className="bg-muted/30 rounded-lg overflow-hidden"
                          >
                            {/* Platform Header */}
                            <button
                              onClick={() => {
                                const newExpanded = new Set(expandedPlatforms);
                                if (isExpanded) {
                                  newExpanded.delete(platform.platformName);
                                } else {
                                  newExpanded.add(platform.platformName);
                                }
                                setExpandedPlatforms(newExpanded);
                              }}
                              className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                            >
                              <div className="shrink-0">
                                <PlatformIcon platformId={platform.platformName} size="md" />
                              </div>
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm ">
                                    {platformInfo?.name || platform.platformName}
                                  </span>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {platformInfo?.model || 'Model'}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {platform.totals.calls} calls · {formatTokens(platform.totals.totalTokens)} tokens
                                </p>
                              </div>
                              <div className="text-right mr-2">
                                <span className="text-sm ">{formatCost(platform.totals.cost)}</span>
                                <p className="text-xs text-muted-foreground">{costPercent}% of cost</p>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>

                            {/* Expanded Call Types */}
                            {isExpanded && (
                              <div className="border-t px-3 pb-3 pt-2 space-y-2">
                                {platform.callTypes.map((callType) => (
                                  <div
                                    key={callType.callType}
                                    className="bg-background rounded-lg p-2"
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-xs ">{getCallTypeLabel(callType.callType)}</span>
                                      <span className="text-xs ">{formatCost(callType.cost)}</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                                      <div className="bg-muted/50 rounded p-1.5 text-center">
                                        <div className="">{callType.callCount}</div>
                                        <div className="text-muted-foreground">Calls</div>
                                      </div>
                                      <div className="bg-muted/50 rounded p-1.5 text-center">
                                        <div className="">{formatTokens(callType.promptTokens)}</div>
                                        <div className="text-muted-foreground">Input</div>
                                      </div>
                                      <div className="bg-muted/50 rounded p-1.5 text-center">
                                        <div className="">{formatTokens(callType.completionTokens)}</div>
                                        <div className="text-muted-foreground">Output</div>
                                      </div>
                                      <div className="bg-muted/50 rounded p-1.5 text-center">
                                        <div className="">{callType.avgDurationMs}ms</div>
                                        <div className="text-muted-foreground">Avg</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {/* Platform Totals */}
                                <div className="bg-primary/5 rounded-lg p-2 mt-2">
                                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    <div className="text-center">
                                      <div className="">{platform.totals.calls}</div>
                                      <div className="text-muted-foreground">Total Calls</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="">{formatTokens(platform.totals.promptTokens)}</div>
                                      <div className="text-muted-foreground">Input Tokens</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="">{formatTokens(platform.totals.completionTokens)}</div>
                                      <div className="text-muted-foreground">Output Tokens</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Grand Total */}
                      <div className="bg-primary/5 rounded-lg p-3 mt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm ">All Platforms Total</span>
                          <span className="text-sm ">
                            {formatCost(platformBreakdown.platforms.reduce((sum, p) => sum + p.totals.cost, 0))}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                          <div className="text-center">
                            <div className="">
                              {platformBreakdown.platforms.reduce((sum, p) => sum + p.totals.calls, 0)}
                            </div>
                            <div className="text-muted-foreground">API Calls</div>
                          </div>
                          <div className="text-center">
                            <div className="">
                              {formatTokens(platformBreakdown.platforms.reduce((sum, p) => sum + p.totals.promptTokens, 0))}
                            </div>
                            <div className="text-muted-foreground">Input Tokens</div>
                          </div>
                          <div className="text-center">
                            <div className="">
                              {formatTokens(platformBreakdown.platforms.reduce((sum, p) => sum + p.totals.completionTokens, 0))}
                            </div>
                            <div className="text-muted-foreground">Output Tokens</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Empty states */}
                  {breakdownView === 'summary' && usageBreakdown && usageBreakdown.breakdown.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No detailed breakdown available yet. Run some prompts to see where tokens are used.
                    </p>
                  )}

                  {breakdownView === 'by_platform' && platformBreakdown && platformBreakdown.platforms.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No platform breakdown available yet. Run some prompts to see usage by platform.
                    </p>
                  )}

                  {fetchingBreakdown && (
                    <div className="flex items-center justify-center py-4">
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Usage Statistics Section */}
          {usageData && usageData.aggregate.totalRequests > 0 && (
            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => {
                  if (!showStatistics && !usageStats) {
                    fetchUsageStatistics();
                  }
                  setShowStatistics(!showStatistics);
                }}
                className="flex items-center gap-2 w-full text-left"
              >
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs  text-muted-foreground">Detailed Statistics & Averages</span>
                {fetchingStats ? (
                  <RefreshCw className="h-3 w-3 animate-spin ml-auto" />
                ) : showStatistics ? (
                  <ChevronUp className="h-3 w-3 ml-auto" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-auto" />
                )}
              </button>

              {showStatistics && usageStats && (
                <div className="mt-3 space-y-4">
                  {/* Time-based comparison */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-1 mb-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs ">This Month</span>
                      </div>
                      <div className="">{formatCost(usageStats.currentMonth.cost)}</div>
                      <div className="text-xs text-muted-foreground">
                        {usageStats.currentMonth.requests} requests in {usageStats.currentMonth.daysActive} days
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-1 mb-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs ">Last Month</span>
                      </div>
                      <div className="">{formatCost(usageStats.lastMonth.cost)}</div>
                      <div className="text-xs text-muted-foreground">
                        {usageStats.lastMonth.requests} requests
                      </div>
                    </div>
                  </div>

                  {/* Averages */}
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                    <div className="flex items-center gap-1 mb-2">
                      <Zap className="h-3 w-3 text-blue-600" />
                      <span className="text-xs  text-blue-900 dark:text-blue-100">Daily Averages</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-sm  text-blue-900 dark:text-blue-100">{formatCost(usageStats.averages.dailyCost)}</div>
                        <div className="text-xs text-blue-700 dark:text-blue-300">Daily Cost</div>
                      </div>
                      <div>
                        <div className="text-sm  text-blue-900 dark:text-blue-100">{usageStats.averages.dailyRequests.toFixed(1)}</div>
                        <div className="text-xs text-blue-700 dark:text-blue-300">Daily Requests</div>
                      </div>
                      <div>
                        <div className="text-sm  text-blue-900 dark:text-blue-100">{formatTokens(usageStats.averages.dailyTokens)}</div>
                        <div className="text-xs text-blue-700 dark:text-blue-300">Daily Tokens</div>
                      </div>
                    </div>
                  </div>

                  {/* Projections */}
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                    <div className="flex items-center gap-1 mb-2">
                      <TrendingUp className="h-3 w-3 text-green-600" />
                      <span className="text-xs  text-green-900 dark:text-green-100">Monthly Projection</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-green-700 dark:text-green-300">Projected monthly cost at current rate</span>
                      <span className=" text-green-900 dark:text-green-100">{formatCost(usageStats.projections.monthlyCost)}</span>
                    </div>
                  </div>

                  {/* Input/Output Cost Breakdown */}
                  <div className="bg-muted/30 rounded-lg p-3">
                    <span className="text-xs  mb-2 block">Cost by Token Type</span>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Input Tokens</span>
                          <span className="">{formatCost(usageStats.costBreakdown.inputCost)} ({usageStats.costBreakdown.inputPercent}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${usageStats.costBreakdown.inputPercent}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Output Tokens</span>
                          <span className="">{formatCost(usageStats.costBreakdown.outputCost)} ({usageStats.costBreakdown.outputPercent}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${usageStats.costBreakdown.outputPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Per-request metrics */}
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-muted/30 rounded-lg p-2">
                      <div className="text-sm ">{formatCost(usageStats.averages.costPerRequest)}</div>
                      <div className="text-xs text-muted-foreground">Cost per Request</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2">
                      <div className="text-sm ">{formatTokens(usageStats.averages.tokensPerRequest)}</div>
                      <div className="text-xs text-muted-foreground">Tokens per Request</div>
                    </div>
                  </div>

                  {/* All-time stats */}
                  {usageStats.allTime.cost > 0 && (
                    <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                      All-time: {formatCost(usageStats.allTime.cost)} spent on {usageStats.allTime.requests} requests over {usageStats.allTime.daysActive} days
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cost Calculator Section */}
          {usageData && usageData.aggregate.totalRequests > 0 && userPlatforms.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => {
                  if (!showCalculator) {
                    fetchCalculatorEstimates(calcPromptCount);
                  }
                  setShowCalculator(!showCalculator);
                }}
                className="flex items-center gap-2 w-full text-left"
              >
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs  text-muted-foreground">Cost Calculator</span>
                {fetchingCalc ? (
                  <RefreshCw className="h-3 w-3 animate-spin ml-auto" />
                ) : showCalculator ? (
                  <ChevronUp className="h-3 w-3 ml-auto" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-auto" />
                )}
              </button>

              {showCalculator && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Prompts to run:</span>
                    <Input
                      type="number"
                      value={calcPromptCount}
                      onChange={(e) => setCalcPromptCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-7 w-20 text-xs"
                      min="1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => fetchCalculatorEstimates(calcPromptCount)}
                      disabled={fetchingCalc}
                    >
                      Calculate
                    </Button>
                  </div>

                  {calcEstimates.length > 0 && (
                    <div className="space-y-3">
                      {/* Data source indicator */}
                      {calcInput && (
                        <div className="bg-muted/50 rounded-lg p-2 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="">Based on:</span>
                            <Badge variant={calcInput.dataSource === 'actual' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                              {calcInput.dataSource === 'actual' ? 'Your Actual Usage' : 'Estimated'}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground">
                            {calcInput.dataSource === 'actual' ? (
                              <span>Avg {formatTokens(calcInput.avgInputTokens)} input + {formatTokens(calcInput.avgOutputTokens)} output tokens per prompt ({calcInput.totalExecutions} executions)</span>
                            ) : (
                              <span>Estimated ~{formatTokens(calcInput.avgInputTokens)} input + {formatTokens(calcInput.avgOutputTokens)} output tokens per prompt</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Configured Platforms */}
                      {calcEstimates.filter(e => e.isConfigured).length > 0 && (
                        <div>
                          <p className="text-xs  text-muted-foreground mb-2">
                            Your Platforms ({calcPromptCount} prompt{calcPromptCount !== 1 ? 's' : ''}):
                          </p>
                          <div className="space-y-1.5">
                            {calcEstimates.filter(e => e.isConfigured).map((estimate) => (
                              <div
                                key={estimate.platformId}
                                className="bg-muted/30 rounded-lg px-3 py-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <PlatformIcon platformId={estimate.platformId} size="md" />
                                    <div>
                                      <span className="text-sm  capitalize">
                                        {estimate.platformId === 'chatgpt' ? 'OpenAI' : estimate.platformId}
                                      </span>
                                      {estimate.hasActualData && (
                                        <span className="text-[10px] text-muted-foreground ml-1">
                                          ({estimate.executionCount} runs)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm ">{formatCost(estimate.total)}</span>
                                    <p className="text-xs text-muted-foreground">
                                      {formatCost(estimate.perPrompt)}/prompt
                                    </p>
                                  </div>
                                </div>
                                {estimate.hasActualData && (
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    Avg: {formatTokens(estimate.avgInputTokens)} in / {formatTokens(estimate.avgOutputTokens)} out
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Unconfigured Platforms - What it would cost */}
                      {calcEstimates.filter(e => !e.isConfigured).length > 0 && (
                        <div className="pt-2 border-t">
                          <p className="text-xs  text-muted-foreground mb-2">
                            If you add these platforms:
                          </p>
                          <div className="space-y-1.5">
                            {calcEstimates.filter(e => !e.isConfigured).map((estimate) => (
                              <div
                                key={estimate.platformId}
                                className="bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2 border border-dashed border-blue-200 dark:border-blue-800"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="opacity-70">
                                      <PlatformIcon platformId={estimate.platformId} size="md" />
                                    </div>
                                    <div>
                                      <span className="text-sm  capitalize text-blue-900 dark:text-blue-100">
                                        {estimate.platformId === 'chatgpt' ? 'OpenAI' : estimate.platformId}
                                      </span>
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1.5 border-blue-300 text-blue-700 dark:text-blue-300">
                                        Not configured
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm  text-blue-900 dark:text-blue-100">{formatCost(estimate.total)}</span>
                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                      {formatCost(estimate.perPrompt)}/prompt
                                    </p>
                                  </div>
                                </div>
                                <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                                  ${estimate.pricing.inputPer1M}/1M input · ${estimate.pricing.outputPer1M}/1M output
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Monthly projection */}
                      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 mt-2">
                        <p className="text-xs  text-amber-900 dark:text-amber-100 mb-2">
                          If you run {calcPromptCount} prompts daily:
                        </p>
                        <div className="space-y-2 text-xs">
                          {/* Your platforms */}
                          {calcEstimates.filter(e => e.isConfigured).length > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-amber-700 dark:text-amber-300">Your platforms (monthly):</span>
                              <span className=" text-amber-900 dark:text-amber-100">
                                {formatCost(calcEstimates.filter(e => e.isConfigured).reduce((sum, e) => sum + e.total, 0) * 30)}
                              </span>
                            </div>
                          )}
                          {/* All platforms */}
                          <div className="flex items-center justify-between">
                            <span className="text-amber-700 dark:text-amber-300">All platforms (monthly):</span>
                            <span className=" text-amber-900 dark:text-amber-100">
                              {formatCost(calcEstimates.reduce((sum, e) => sum + e.total, 0) * 30)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-3 space-y-2">
          <div className="flex gap-2 items-start">
            <Star className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className=" text-foreground">Primary model</span> is used for generating prompts and analyses. All configured models track brand visibility.
            </p>
          </div>
          <div className="flex gap-2 items-start">
            <DollarSign className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className=" text-foreground">Set budget limits</span> to get notified when your API credits are running low. You&apos;ll see warnings at 80% usage.
            </p>
          </div>
          <div className="flex gap-2 items-start">
            <Key className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className=" text-foreground">Connect admin API keys</span> (OpenAI, Anthropic) to see real billing data instead of estimates. Click the &quot;Billing&quot; button on supported models.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
