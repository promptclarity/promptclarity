'use client';

import { OnboardingStep } from '@/app/lib/types';

interface StepIndicatorProps {
  currentStep: OnboardingStep;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = [
    { id: OnboardingStep.BUSINESS, label: 'Business Info' },
    { id: OnboardingStep.PLATFORMS, label: 'AI Platforms' },
    { id: OnboardingStep.TOPICS, label: 'Topics' },
    { id: OnboardingStep.PROMPTS, label: 'Prompts' },
    { id: OnboardingStep.COMPETITORS, label: 'Competitors' },
  ];

  return (
    <div className="flex items-center w-full">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`flex items-center ${index < steps.length - 1 ? 'w-full' : ''}`}
        >
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 text-sm font-medium ${
              currentStep >= step.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {step.id}
          </div>
          <span className="text-sm font-medium ml-2">
            {step.label}
          </span>
          {index < steps.length - 1 && (
            <div
              className={`w-full h-0.5 mx-4 ${
                currentStep > step.id ? 'bg-primary' : 'bg-muted'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
