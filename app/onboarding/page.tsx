'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import OnboardingWizard from '@/app/components/onboarding/OnboardingWizard';
import { Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const isNewProject = searchParams.get('new') === 'true';
  const [isChecking, setIsChecking] = useState(true);
  const [canShowOnboarding, setCanShowOnboarding] = useState(false);

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') {
      return;
    }

    // Redirect to signin if not authenticated
    if (status === 'unauthenticated') {
      router.replace('/auth/signin');
      return;
    }

    // If creating a new project, clear any existing onboarding state and allow access
    if (isNewProject) {
      localStorage.removeItem('onboardingBusinessId');
      setCanShowOnboarding(true);
      setIsChecking(false);
      return;
    }

    // Check for incomplete onboarding - only redirect to dashboard if onboarding is complete
    const checkOnboardingStatus = async () => {
      try {
        const response = await fetch('/api/business/all');
        if (response.status === 401) {
          router.replace('/auth/signin');
          return;
        }
        if (response.ok) {
          const businesses = await response.json();

          if (businesses && businesses.length > 0) {
            // Check if any business has COMPLETED onboarding
            const completedBusiness = businesses.find((b: any) => b.onboarding?.completed);

            if (completedBusiness) {
              // Has a fully onboarded business - redirect to dashboard
              router.replace('/dashboard');
              return;
            }

            // Check for incomplete onboarding - allow to continue
            const incompleteBusiness = businesses.find((b: any) => b.onboarding && !b.onboarding.completed);
            if (incompleteBusiness) {
              // Store the business ID so wizard can resume
              localStorage.setItem('onboardingBusinessId', incompleteBusiness.id.toString());
            }
          }
        }
        // No completed businesses - allow onboarding
        setCanShowOnboarding(true);
      } catch (error) {
        console.error('Error checking businesses:', error);
        // On error, allow onboarding (first-time setup might not have API ready)
        setCanShowOnboarding(true);
      } finally {
        setIsChecking(false);
      }
    };

    checkOnboardingStatus();
  }, [isNewProject, router, status]);

  // Show loading state while checking
  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render anything if redirecting
  if (!canShowOnboarding) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <OnboardingWizard isNewProject={isNewProject} />
    </div>
  );
}
