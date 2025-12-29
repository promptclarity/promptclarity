"use client"

import { useState, useEffect } from "react"
import { AlertCircle, Eye, EyeOff, Box, Star, StarOff } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Checkbox } from "@/app/components/ui/checkbox"
import { Badge } from "@/app/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip"
import { PlatformConfig } from "@/app/lib/types"
import Image from "next/image"
import OpenAILogo from "@/app/assets/openai.svg"
import ClaudeLogo from "@/app/assets/claude-color.svg"
import GeminiLogo from "@/app/assets/gemini-color.svg"
import PerplexityLogo from "@/app/assets/perplexity-color.svg"
import GrokLogo from "@/app/assets/grok.svg"

interface AvailablePlatform {
  id: string;
  name: string;
  provider: string;
  model: string;
}

interface PlatformSelection {
  platformId: string;
  apiKey: string;
  isPrimary: boolean;
}

interface ExistingApiKey {
  maskedKey: string;
  fullKey: string;
  fromBusiness: string;
}

interface PlatformsStepProps {
  platforms: PlatformConfig[];
  onUpdate: (platforms: PlatformConfig[]) => void;
  onNext: () => void;
  onBack: () => void;
}

// Cache for available platforms to prevent duplicate fetches
let availablePlatformsCache: AvailablePlatform[] | null = null;

export default function PlatformsStep({
  platforms,
  onUpdate,
  onNext,
  onBack
}: PlatformsStepProps) {
  const [availablePlatforms, setAvailablePlatforms] = useState<AvailablePlatform[]>(availablePlatformsCache || []);
  const [loading, setLoading] = useState(!availablePlatformsCache);

  // Initialize with empty selection - we'll load from API in useEffect
  const [selectedPlatforms, setSelectedPlatforms] = useState<Map<string, PlatformSelection>>(new Map());

  // Existing API keys from other projects
  const [existingApiKeys, setExistingApiKeys] = useState<Record<string, ExistingApiKey[]>>({});

  const [showApiKeys, setShowApiKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  // Fetch available platforms from API and existing user platforms
  useEffect(() => {
    let isMounted = true;
    const businessId = localStorage.getItem('onboardingBusinessId');

    // Helper to fetch existing API keys and user platforms
    const fetchExistingKeys = async () => {
      try {
        const url = businessId
          ? `/api/onboarding/platforms?businessId=${businessId}`
          : '/api/onboarding/platforms';
        const res = await fetch(url);
        const platformData = await res.json();
        if (!isMounted) return;

        console.log('[PlatformsStep] Existing API keys loaded:', Object.keys(platformData.existingApiKeys || {}).length);
        if (platformData.existingApiKeys) {
          setExistingApiKeys(platformData.existingApiKeys);
        }

        if (platformData.userPlatforms && platformData.userPlatforms.length > 0) {
          console.log('[PlatformsStep] User platforms loaded:', platformData.userPlatforms.length);
          const map = new Map<string, PlatformSelection>();
          platformData.userPlatforms.forEach((p: any) => {
            map.set(p.platformId, {
              platformId: p.platformId,
              apiKey: p.apiKey,
              isPrimary: p.isPrimary
            });
          });
          // Ensure ChatGPT is always selected (required platform)
          if (!map.has('chatgpt')) {
            map.set('chatgpt', {
              platformId: 'chatgpt',
              apiKey: '',
              isPrimary: map.size === 0
            });
          }
          setSelectedPlatforms(map);
        } else {
          // No existing platforms - auto-select ChatGPT as required
          const map = new Map<string, PlatformSelection>();
          map.set('chatgpt', {
            platformId: 'chatgpt',
            apiKey: '',
            isPrimary: true
          });
          setSelectedPlatforms(map);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to load existing keys:', err);
      }
    };

    // Skip if platforms are already loaded
    if (availablePlatforms.length > 0) {
      console.log('[PlatformsStep] Platforms already loaded, fetching existing keys...');
      fetchExistingKeys();
      return;
    }

    // Fetch available platforms from config
    console.log('[PlatformsStep] Fetching available-platforms...');
    fetch('/api/available-platforms')
      .then(res => res.json())
      .then(async data => {
        if (!isMounted) {
          console.log('[PlatformsStep] Component unmounted, skipping setState');
          return;
        }
        console.log('[PlatformsStep] Available platforms loaded:', data.platforms?.length);
        availablePlatformsCache = data.platforms; // Cache the platforms
        setAvailablePlatforms(data.platforms);

        // Also fetch existing platforms/keys
        await fetchExistingKeys();
      })
      .then(() => {
        if (isMounted) setLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        console.error('Failed to load platforms:', err);
        setError('Failed to load platforms');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const getPlatformIcon = (platformId: string) => {
    switch (platformId) {
      case 'chatgpt':
        return <Image src={OpenAILogo} alt="OpenAI" width={24} height={24} />;
      case 'claude':
        return <Image src={ClaudeLogo} alt="Claude" width={24} height={24} />;
      case 'gemini':
        return <Image src={GeminiLogo} alt="Gemini" width={24} height={24} />;
      case 'perplexity':
        return <Image src={PerplexityLogo} alt="Perplexity" width={24} height={24} />;
      case 'grok':
        return <Image src={GrokLogo} alt="Grok" width={24} height={24} />;
      default:
        return <Box className="h-6 w-6" />;
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

  const togglePlatform = (platformId: string) => {
    const newMap = new Map(selectedPlatforms);
    if (newMap.has(platformId)) {
      // ChatGPT is required and cannot be removed
      if (platformId === 'chatgpt') {
        setError('ChatGPT (OpenAI) is required');
        return;
      }
      newMap.delete(platformId);
      // If this was primary, make another one primary
      const remaining = Array.from(newMap.values());
      if (remaining.length > 0 && !remaining.some(p => p.isPrimary)) {
        remaining[0].isPrimary = true;
      }
    } else {
      // Add new platform
      const isFirst = newMap.size === 0;
      newMap.set(platformId, {
        platformId,
        apiKey: '',
        isPrimary: isFirst // First platform is primary by default
      });
    }
    setSelectedPlatforms(newMap);
    setError('');
  };

  const updateApiKey = (platformId: string, apiKey: string) => {
    const newMap = new Map(selectedPlatforms);
    const platform = newMap.get(platformId);
    if (platform) {
      platform.apiKey = apiKey;
      setSelectedPlatforms(newMap);
      setError('');
    }
  };

  const setPrimary = (platformId: string) => {
    const newMap = new Map(selectedPlatforms);
    // Clear all primary flags
    newMap.forEach(p => p.isPrimary = false);
    // Set new primary
    const platform = newMap.get(platformId);
    if (platform) {
      platform.isPrimary = true;
      setSelectedPlatforms(newMap);
    }
  };

  const toggleShowApiKey = (platformId: string) => {
    const newSet = new Set(showApiKeys);
    if (newSet.has(platformId)) {
      newSet.delete(platformId);
    } else {
      newSet.add(platformId);
    }
    setShowApiKeys(newSet);
  };

  const useExistingKey = (platformId: string, fullKey: string) => {
    updateApiKey(platformId, fullKey);
  };

  const handleNext = async () => {
    if (selectedPlatforms.size === 0) {
      setError('Please select at least one platform');
      return;
    }

    // ChatGPT is required
    if (!selectedPlatforms.has('chatgpt')) {
      setError('ChatGPT (OpenAI) is required');
      return;
    }

    // Check if all selected platforms have API keys
    const platformsArray = Array.from(selectedPlatforms.values());
    const missingApiKey = platformsArray.find(p => !p.apiKey || p.apiKey.trim() === '');
    if (missingApiKey) {
      const platformConfig = availablePlatforms.find(p => p.id === missingApiKey.platformId);
      setError(`Please enter API key for ${platformConfig?.name || missingApiKey.platformId}`);
      return;
    }

    // Ensure one platform is primary
    if (!platformsArray.some(p => p.isPrimary)) {
      setError('Please select a primary platform');
      return;
    }

    // Get business ID from localStorage
    const businessId = localStorage.getItem('onboardingBusinessId');
    if (!businessId) {
      setError('Business information not found. Please go back to the first step.');
      return;
    }

    try {
      setLoading(true);

      // Save platforms to database
      const response = await fetch('/api/onboarding/platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId),
          platforms: platformsArray.map(p => ({
            platformId: p.platformId,
            apiKey: p.apiKey.trim(),
            isPrimary: p.isPrimary
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save platform configurations');
        return;
      }

      // Create platform configurations for parent component
      const platformConfigs: PlatformConfig[] = platformsArray.map(selection => {
        const platformConfig = availablePlatforms.find(p => p.id === selection.platformId)!;
        return {
          id: selection.platformId,
          provider: platformConfig.provider,
          modelName: platformConfig.model,
          apiKey: selection.apiKey.trim(),
          isPrimary: selection.isPrimary
        };
      });

      onUpdate(platformConfigs);
      onNext();
    } catch (error) {
      console.error('Error saving platforms:', error);
      setError('Failed to save platform configurations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center min-h-[200px]">
        <p className="text-sm text-gray-500">Loading available platforms...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Select one or more AI platforms. ChatGPT (OpenAI) is required. The primary will be used to generate prompts and run analyses.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {availablePlatforms.map((platform) => {
          const isSelected = selectedPlatforms.has(platform.id)
          const selection = selectedPlatforms.get(platform.id)
          const isPrimary = selection?.isPrimary || false

          return (
            <div
              key={platform.id}
              className={`rounded-lg border p-4 transition-all ${isSelected ? "bg-muted/50 border-border ring-2 ring-ring/20" : "border-border"}`}
            >
              <div className="flex flex-col gap-3">
                {/* Platform Header */}
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => togglePlatform(platform.id)}
                    disabled={platform.id === "chatgpt" && isSelected}
                  />
                  <div className="cursor-pointer" onClick={() => togglePlatform(platform.id)}>
                    {getPlatformIcon(platform.id)}
                  </div>
                  <div className="flex-1 cursor-pointer" onClick={() => togglePlatform(platform.id)}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{platform.name}</p>
                      {isPrimary && (
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-900 cursor-help">
                              <Star className="h-3 w-3 mr-1 fill-yellow-900" />
                              Primary
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[250px]">
                            <p className="text-xs">The primary model is used for generating prompts and running analyses. All configured models track brand visibility.</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {platform.id === "chatgpt" && (
                        <Badge variant="secondary" className="bg-green-100 text-green-900">
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{platform.model}</p>
                  </div>
                  {isSelected && !isPrimary && (
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPrimary(platform.id)
                          }}
                        >
                          <StarOff className="h-4 w-4 mr-1" />
                          Set as Primary
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px]">
                        <p className="text-xs">Make this the primary model for generating prompts and analyses</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* API Key Input (shown when selected) */}
                {isSelected && (
                  <div className="pl-11">
                    <div className="grid gap-2">
                      <Label>API Key</Label>

                      {/* Show existing keys if available */}
                      {existingApiKeys[platform.id] && existingApiKeys[platform.id].length > 0 && !selection?.apiKey && (
                        <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg border border-dashed border-border">
                          <p className="text-xs font-medium text-muted-foreground">Use existing key:</p>
                          <div className="flex flex-wrap gap-2">
                            {existingApiKeys[platform.id].map((key, idx) => (
                              <Button
                                key={idx}
                                size="sm"
                                variant="outline"
                                className="h-auto py-1 px-2 text-xs"
                                onClick={() => useExistingKey(platform.id, key.fullKey)}
                              >
                                <span className="font-mono">{key.maskedKey}</span>
                                <span className="ml-1 text-muted-foreground">({key.fromBusiness})</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          type={showApiKeys.has(platform.id) ? "text" : "password"}
                          placeholder={getApiKeyPlaceholder(platform.id)}
                          value={selection?.apiKey || ""}
                          onChange={(e) => updateApiKey(platform.id, e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => toggleShowApiKey(platform.id)}
                        >
                          {showApiKeys.has(platform.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getApiKeyHelpText(platform.id)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={loading}>
          {loading ? "Saving..." : "Next: AI Search Strategy"}
        </Button>
      </div>
    </div>
  )
}
