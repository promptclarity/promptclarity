'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Progress } from '@/app/components/ui/progress';
import BusinessStep from './BusinessStep';
import StrategyStep from './StrategyStep';
import PlatformsStep from './PlatformsStep';
import TopicsStep from './TopicsStep';
import PromptsStep from './PromptsStep';
import CompetitorsStep from './CompetitorsStep';
import { OnboardingData, OnboardingStep, Strategy } from '@/app/lib/types';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/app/components/ui/tooltip';

const stepTitles = {
  [OnboardingStep.BUSINESS]: 'Business Information',
  [OnboardingStep.PLATFORMS]: 'AI Platforms',
  [OnboardingStep.STRATEGY]: 'AI Search Strategy',
  [OnboardingStep.TOPICS]: 'Topics',
  [OnboardingStep.PROMPTS]: 'Prompts',
  [OnboardingStep.COMPETITORS]: 'Competitors',
};

const stepDescriptions = {
  [OnboardingStep.BUSINESS]: 'Basic information about your business',
  [OnboardingStep.PLATFORMS]: 'Connect AI platforms to monitor',
  [OnboardingStep.STRATEGY]: 'Define your goals and target audiences',
  [OnboardingStep.TOPICS]: 'Brand topics to monitor',
  [OnboardingStep.PROMPTS]: 'Prompts to track brand visibility',
  [OnboardingStep.COMPETITORS]: 'Competitors to benchmark',
};

interface OnboardingWizardProps {
  isNewProject?: boolean;
}

export default function OnboardingWizard({ isNewProject = false }: OnboardingWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(OnboardingStep.BUSINESS);
  const [isLoading, setIsLoading] = useState(false);
  const [isResumingSession, setIsResumingSession] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<OnboardingStep>>(new Set());

  const defaultStrategy: Strategy = {
    primaryGoal: 'leads',
    goals: ['leads'],
    productSegments: [],
    targetMarkets: [],
    targetPersonas: [],
    funnelStages: ['decision'],
  };

  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    business: { businessName: '', website: '' },
    strategy: defaultStrategy,
    platforms: [],
    topics: [],
    prompts: [],
    competitors: [],
  });

  // Load existing session on mount (resume from where user left off)
  useEffect(() => {
    const loadExistingSession = async () => {
      if (isNewProject) {
        setIsResumingSession(false);
        return;
      }

      const businessId = localStorage.getItem('onboardingBusinessId');
      if (!businessId) {
        setIsResumingSession(false);
        return;
      }

      try {
        // Fetch business data and onboarding session
        const response = await fetch(`/api/onboarding/business?businessId=${businessId}`);
        if (!response.ok) {
          setIsResumingSession(false);
          return;
        }

        const data = await response.json();
        if (!data.success || !data.data) {
          setIsResumingSession(false);
          return;
        }

        const { business, session } = data.data;

        // Load business info
        if (business) {
          setOnboardingData(prev => ({
            ...prev,
            business: {
              businessName: business.businessName || '',
              website: business.website || '',
              logo: business.logo || ''
            }
          }));
        }

        // Resume from saved step
        if (session && session.stepCompleted) {
          const savedStep = session.stepCompleted;
          // Set current step to resume (go to the step AFTER the last completed one)
          const resumeStep = Math.min(savedStep + 1, OnboardingStep.COMPETITORS);
          setCurrentStep(resumeStep);

          // Mark previous steps as completed
          const completed = new Set<OnboardingStep>();
          for (let i = OnboardingStep.BUSINESS; i <= savedStep; i++) {
            completed.add(i);
          }
          setCompletedSteps(completed);

          console.log(`Resuming onboarding at step ${resumeStep} (completed up to step ${savedStep})`);
        }
      } catch (error) {
        console.error('Error loading existing session:', error);
      } finally {
        setIsResumingSession(false);
      }
    };

    loadExistingSession();
  }, [isNewProject]);

  const handleNextStep = () => {
    // Mark current step as completed
    setCompletedSteps(prev => new Set(prev).add(currentStep));

    if (currentStep < OnboardingStep.COMPETITORS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > OnboardingStep.BUSINESS) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const businessId = localStorage.getItem('onboardingBusinessId');
      if (!businessId) {
        console.error('Business ID not found');
        return;
      }

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: parseInt(businessId) }),
      });

      if (response.ok) {
        // Clear cached business data so dashboard loads fresh data for the new business
        localStorage.removeItem('cachedBusiness');
        router.push('/dashboard');
      } else {
        const errorData = await response.json();
        console.error('Error completing onboarding:', errorData);
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateData = (data: Partial<OnboardingData>) => {
    setOnboardingData(prev => ({ ...prev, ...data }));
  };

  const handleStartNew = () => {
    // Clear all stored data and reset
    localStorage.removeItem('onboardingBusinessId');
    setCurrentStep(OnboardingStep.BUSINESS);
    setCompletedSteps(new Set());
    setOnboardingData({
      business: { businessName: '', website: '' },
      strategy: defaultStrategy,
      platforms: [],
      topics: [],
      prompts: [],
      competitors: [],
    });
    // Reload to clear any cached data
    window.location.reload();
  };

  const handleCancelNewProject = async () => {
    const businessId = localStorage.getItem('onboardingBusinessId');

    // Delete the incomplete business if one was created
    if (businessId) {
      try {
        await fetch(`/api/onboarding/business?businessId=${businessId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Error deleting incomplete business:', error);
      }
    }

    // Clear localStorage and redirect
    localStorage.removeItem('onboardingBusinessId');
    router.push('/dashboard');
  };

  // Save strategy when moving to next step
  const handleStrategyNext = async () => {
    const businessId = localStorage.getItem('onboardingBusinessId');
    if (businessId) {
      try {
        await fetch('/api/onboarding/strategy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessId: parseInt(businessId),
            strategy: onboardingData.strategy,
          }),
        });
      } catch (error) {
        console.error('Error saving strategy:', error);
      }
    }
    handleNextStep();
  };

  const progressPercentage = (currentStep / 6) * 100;

  // Show loading state while resuming session
  if (isResumingSession) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <Card className="shadow-sm border-gray-200">
          <CardContent className="py-16 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
            <p className="text-gray-500">Loading your progress...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="w-full max-w-2xl mx-auto">
      {/* Back to Dashboard link for new projects - only on Step 1 */}
      {isNewProject && currentStep === OnboardingStep.BUSINESS && (
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            onClick={handleCancelNewProject}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      )}

      {/* Main Card */}
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="pb-4">
          {isNewProject && (
            <p className="text-sm text-gray-500 mb-2">Creating new project</p>
          )}
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {currentStep === OnboardingStep.PROMPTS ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <h2 className="text-xl font-semibold cursor-help">
                        {stepTitles[currentStep]}
                      </h2>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-sm p-3 text-left">
                      <p className="font-medium mb-2">Prompt Framework Tips</p>
                      <p className="text-xs text-gray-500 mb-2">
                        Cover different funnel stages and query types for comprehensive visibility tracking:
                      </p>
                      <ul className="text-xs space-y-1">
                        <li><strong>Awareness:</strong> "What is...", "How does...work?"</li>
                        <li><strong>Consideration:</strong> "Best X for Y", "X vs Y"</li>
                        <li><strong>Decision:</strong> "[brand] reviews", "Is [brand] worth it?"</li>
                        <li><strong>Branded:</strong> "[Your brand] vs [competitor]"</li>
                        <li><strong>Personas:</strong> "I am a [role] looking for..."</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <h2 className="text-xl font-semibold">
                    {stepTitles[currentStep]}
                  </h2>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {stepDescriptions[currentStep]}
              </p>
            </div>
            <Badge variant="secondary" className="bg-gray-100 text-gray-600">
              Step {currentStep} of 6
            </Badge>
          </div>

          {/* Progress Bar */}
          <Progress value={progressPercentage} className="w-full h-2" />
        </CardHeader>

        {/* Step Content */}
        <CardContent className="min-h-[300px]">
          {currentStep === OnboardingStep.BUSINESS && (
            <BusinessStep
              data={onboardingData.business}
              onUpdate={(data) => updateData({ business: data })}
              onNext={handleNextStep}
            />
          )}
          {currentStep === OnboardingStep.PLATFORMS && (
            <PlatformsStep
              key="platforms-step"
              platforms={onboardingData.platforms}
              onUpdate={(platforms) => updateData({ platforms })}
              onNext={handleNextStep}
              onBack={handlePreviousStep}
            />
          )}
          {currentStep === OnboardingStep.STRATEGY && (
            <StrategyStep
              strategy={onboardingData.strategy}
              onUpdate={(strategy) => updateData({ strategy })}
              onNext={handleStrategyNext}
              onBack={handlePreviousStep}
            />
          )}
          {currentStep === OnboardingStep.TOPICS && (
            <TopicsStep
              businessData={onboardingData.business}
              topics={onboardingData.topics}
              onUpdate={(topics) => updateData({ topics })}
              onNext={handleNextStep}
              onBack={handlePreviousStep}
            />
          )}
          {currentStep === OnboardingStep.PROMPTS && (
            <PromptsStep
              businessData={onboardingData.business}
              topics={onboardingData.topics}
              prompts={onboardingData.prompts}
              onUpdate={(prompts) => updateData({ prompts })}
              onNext={handleNextStep}
              onBack={handlePreviousStep}
            />
          )}
          {currentStep === OnboardingStep.COMPETITORS && (
            <CompetitorsStep
              competitors={onboardingData.competitors}
              onUpdate={(competitors) => updateData({ competitors })}
              onComplete={handleComplete}
              onBack={handlePreviousStep}
              isLoading={isLoading}
            />
          )}
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}