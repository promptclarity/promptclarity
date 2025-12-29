'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { X, ChevronDown, ChevronUp, TrendingUp, DollarSign, Eye, Scale, CheckCircle, Plus, Loader2, AlertCircle } from 'lucide-react';
import { Strategy } from '@/app/lib/types';

interface PersonaSuggestion {
  title: string;
  description: string;
}

interface StrategyStepProps {
  strategy: Strategy;
  onUpdate: (strategy: Strategy) => void;
  onNext: () => void;
  onBack: () => void;
}

const goalOptions = [
  {
    value: 'visibility',
    label: 'Get Discovered',
    description: 'Show up more often when people ask AI about your industry',
    icon: Eye,
  },
  {
    value: 'sentiment',
    label: 'Shape Your Story',
    description: 'Control how AI describes your brand to potential customers',
    icon: TrendingUp,
  },
  {
    value: 'leads',
    label: 'Drive Sales',
    description: 'Focus on high-intent queries that lead to conversions',
    icon: DollarSign,
  },
] as const;

const funnelOptions = [
  {
    value: 'awareness',
    label: 'Learning',
    description: 'People researching the problem',
    example: '"What is project management software?"',
    icon: Eye,
  },
  {
    value: 'consideration',
    label: 'Comparing',
    description: 'People evaluating options',
    example: '"Best CRM for small business"',
    icon: Scale,
  },
  {
    value: 'decision',
    label: 'Deciding',
    description: 'People ready to buy',
    example: '"Is Salesforce worth it?"',
    icon: CheckCircle,
  },
] as const;


export default function StrategyStep({
  strategy,
  onUpdate,
  onNext,
  onBack,
}: StrategyStepProps) {
  const [newSegment, setNewSegment] = useState('');
  const [newMarket, setNewMarket] = useState('');
  const [newPersona, setNewPersona] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [personaSuggestions, setPersonaSuggestions] = useState<PersonaSuggestion[]>([]);
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false);
  const [personasLoaded, setPersonasLoaded] = useState(false);
  const [error, setError] = useState('');

  // Load AI-generated persona suggestions when advanced options are opened
  useEffect(() => {
    if (showAdvanced && !personasLoaded && !isLoadingPersonas) {
      const businessId = localStorage.getItem('onboardingBusinessId');
      if (businessId) {
        setIsLoadingPersonas(true);
        fetch(`/api/onboarding/personas?businessId=${businessId}`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.personas) {
              setPersonaSuggestions(data.personas);
            }
            setPersonasLoaded(true);
          })
          .catch((err) => {
            console.error('Error loading persona suggestions:', err);
            setPersonasLoaded(true);
          })
          .finally(() => {
            setIsLoadingPersonas(false);
          });
      }
    }
  }, [showAdvanced, personasLoaded, isLoadingPersonas]);

  const handleGoalToggle = (goal: 'visibility' | 'sentiment' | 'leads') => {
    const currentGoals = strategy.goals || [];
    let newGoals: typeof currentGoals;

    if (currentGoals.includes(goal)) {
      newGoals = currentGoals.filter(g => g !== goal);
    } else {
      newGoals = [...currentGoals, goal];
    }

    // Set primaryGoal to the first selected goal (for backwards compatibility)
    const primaryGoal = newGoals.length > 0 ? newGoals[0] : 'visibility';
    onUpdate({ ...strategy, goals: newGoals, primaryGoal });
    setError('');
  };

  const handleFunnelToggle = (stage: 'awareness' | 'consideration' | 'decision') => {
    const current = strategy.funnelStages || [];
    if (current.includes(stage)) {
      onUpdate({ ...strategy, funnelStages: current.filter(s => s !== stage) });
    } else {
      onUpdate({ ...strategy, funnelStages: [...current, stage] });
    }
    setError('');
  };

  const addSegment = () => {
    if (newSegment.trim() && !strategy.productSegments.includes(newSegment.trim())) {
      onUpdate({ ...strategy, productSegments: [...strategy.productSegments, newSegment.trim()] });
      setNewSegment('');
    }
  };

  const removeSegment = (segment: string) => {
    onUpdate({ ...strategy, productSegments: strategy.productSegments.filter(s => s !== segment) });
  };

  const addMarket = () => {
    if (newMarket.trim() && !strategy.targetMarkets.includes(newMarket.trim())) {
      onUpdate({ ...strategy, targetMarkets: [...strategy.targetMarkets, newMarket.trim()] });
      setNewMarket('');
    }
  };

  const removeMarket = (market: string) => {
    onUpdate({ ...strategy, targetMarkets: strategy.targetMarkets.filter(m => m !== market) });
  };

  const addPersona = (persona?: string) => {
    const toAdd = persona || newPersona.trim();
    if (toAdd && !strategy.targetPersonas.includes(toAdd)) {
      onUpdate({ ...strategy, targetPersonas: [...strategy.targetPersonas, toAdd] });
      setNewPersona('');
    }
  };

  const removePersona = (persona: string) => {
    onUpdate({ ...strategy, targetPersonas: strategy.targetPersonas.filter(p => p !== persona) });
  };

  const canProceed = (strategy.goals?.length > 0 || strategy.primaryGoal) && strategy.funnelStages.length > 0;

  // Check if any advanced options have values
  const hasAdvancedValues = strategy.productSegments.length > 0 ||
                           strategy.targetMarkets.length > 0 ||
                           strategy.targetPersonas.length > 0;

  const handleNext = () => {
    if (!canProceed) {
      setError('Please select at least one goal and one buyer journey stage');
      return;
    }
    onNext();
  };

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Define your AI visibility goals and target buyer journey stages. This helps us focus on the queries that matter most.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Goals */}
      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label>What do you want to achieve?</Label>
          <p className="text-sm text-muted-foreground">
            Select all that apply.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {goalOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = strategy.goals?.includes(option.value) ||
                              (!strategy.goals && strategy.primaryGoal === option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleGoalToggle(option.value)}
                className={`relative flex flex-col items-center text-center p-4 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-muted/50 border-border ring-2 ring-ring/20'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle className="h-4 w-4 text-foreground" />
                  </div>
                )}
                <div className={`p-2 rounded-lg mb-3 ${isSelected ? 'bg-muted' : 'bg-muted/50'}`}>
                  <Icon className={`h-5 w-5 ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`} />
                </div>
                <span className={`font-medium text-sm ${isSelected ? 'text-foreground' : 'text-foreground'}`}>{option.label}</span>
                <span className="text-xs text-muted-foreground mt-1 leading-tight">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Funnel Stages */}
      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label>Where in the buyer journey?</Label>
          <p className="text-sm text-muted-foreground">
            Select the stages where you want to track your AI visibility.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {funnelOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = strategy.funnelStages?.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFunnelToggle(option.value)}
                className={`relative flex flex-col items-center text-center p-4 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-muted/50 border-border ring-2 ring-ring/20'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle className="h-4 w-4 text-foreground" />
                  </div>
                )}
                <div className={`p-2 rounded-lg mb-3 ${isSelected ? 'bg-muted' : 'bg-muted/50'}`}>
                  <Icon className={`h-5 w-5 ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`} />
                </div>
                <span className={`font-medium text-sm ${isSelected ? 'text-foreground' : 'text-foreground'}`}>{option.label}</span>
                <span className="text-xs text-muted-foreground mt-1">{option.description}</span>
                <span className="text-xs text-muted-foreground/70 mt-2 italic">{option.example}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Options Dropdown */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors rounded-lg"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Advanced targeting options</span>
            {hasAdvancedValues && (
              <Badge variant="secondary" className="ml-2">
                {strategy.productSegments.length + strategy.targetMarkets.length + strategy.targetPersonas.length} added
              </Badge>
            )}
          </div>
          {showAdvanced ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showAdvanced && (
          <div className="p-4 pt-0 border-t border-border grid gap-6">
            {/* Product Segments */}
            <div className="grid gap-2">
              <Label>Product Segments</Label>
              <p className="text-sm text-muted-foreground">
                Different product lines or tiers you offer (e.g., Enterprise, Starter, API).
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a product segment..."
                  value={newSegment}
                  onChange={(e) => setNewSegment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSegment())}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSegment}
                >
                  Add
                </Button>
              </div>
              {strategy.productSegments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {strategy.productSegments.map((segment) => (
                    <Badge key={segment} variant="secondary" className="gap-1 pr-1">
                      {segment}
                      <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removeSegment(segment)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Target Markets */}
            <div className="grid gap-2">
              <Label>Target Markets</Label>
              <p className="text-sm text-muted-foreground">
                Geographic regions or industries you focus on (e.g., North America, Healthcare).
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a target market..."
                  value={newMarket}
                  onChange={(e) => setNewMarket(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMarket())}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addMarket}
                >
                  Add
                </Button>
              </div>
              {strategy.targetMarkets.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {strategy.targetMarkets.map((market) => (
                    <Badge key={market} variant="secondary" className="gap-1 pr-1">
                      {market}
                      <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removeMarket(market)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Target Personas */}
            <div className="grid gap-2">
              <Label>Target Personas</Label>
              <p className="text-sm text-muted-foreground">
                Who are your ideal customers? This helps generate persona-specific queries.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a persona..."
                  value={newPersona}
                  onChange={(e) => setNewPersona(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPersona())}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addPersona()}
                >
                  Add
                </Button>
              </div>

              {/* Suggested Personas */}
              <div className="mt-2">
                <p className="text-sm text-muted-foreground mb-2">Suggested for your business:</p>
                {isLoadingPersonas ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing your business to suggest relevant personas...</span>
                  </div>
                ) : personaSuggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {personaSuggestions
                      .filter(p => !strategy.targetPersonas.includes(p.title))
                      .map((persona) => (
                        <Badge
                          key={persona.title}
                          variant="outline"
                          className="cursor-pointer hover:bg-muted transition-colors py-1"
                          onClick={() => addPersona(persona.title)}
                          title={persona.description}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {persona.title}
                        </Badge>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No suggestions available. Add personas manually.</p>
                )}
              </div>

              {strategy.targetPersonas.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {strategy.targetPersonas.map((persona) => (
                    <Badge key={persona} variant="secondary" className="gap-1 pr-1">
                      {persona}
                      <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removePersona(persona)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={!canProceed}>
          Next: Select Topics
        </Button>
      </div>
    </div>
  );
}
