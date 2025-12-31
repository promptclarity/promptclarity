'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAndRedirect = async () => {
      // First, check if instance is initialized (for self-hosted mode)
      try {
        const instanceResponse = await fetch('/api/instance/status');
        const instanceData = await instanceResponse.json();

        // If instance is not initialized, redirect to setup
        if (!instanceData.initialized) {
          router.push('/setup');
          return;
        }
      } catch (error) {
        console.error('Error checking instance status:', error);
        // Continue with normal flow if check fails
      }

      // If session is still loading, wait
      if (status === 'loading') {
        return;
      }

      // If not logged in, redirect to signin
      if (status === 'unauthenticated') {
        router.push('/auth/signin');
        return;
      }

      // User is logged in - check for businesses and onboarding status
      try {
        const response = await fetch('/api/business/all');

        // If unauthorized or any error, redirect to signin
        if (!response.ok) {
          router.push('/auth/signin');
          return;
        }

        const businesses = await response.json();

        if (businesses.length === 0) {
          // No businesses at all - start fresh onboarding
          localStorage.removeItem('onboardingBusinessId');
          router.push('/onboarding');
          return;
        }

        // Check for a business with completed onboarding
        const completedBusiness = businesses.find((b: any) => b.onboarding?.completed);

        if (completedBusiness) {
          // Has a fully onboarded business - go to dashboard
          localStorage.setItem('onboardingBusinessId', completedBusiness.id.toString());
          localStorage.setItem('cachedBusiness', JSON.stringify({
            id: completedBusiness.id,
            businessName: completedBusiness.businessName,
            website: completedBusiness.website,
            logo: completedBusiness.logo,
            createdAt: completedBusiness.createdAt,
            updatedAt: completedBusiness.updatedAt,
          }));
          router.push('/dashboard');
          return;
        }

        // Check for a business with incomplete onboarding
        const incompleteBusiness = businesses.find((b: any) => b.onboarding && !b.onboarding.completed);

        if (incompleteBusiness) {
          // Resume onboarding for this business
          localStorage.setItem('onboardingBusinessId', incompleteBusiness.id.toString());
          router.push('/onboarding');
          return;
        }

        // Business exists but no onboarding session - start onboarding for first business
        localStorage.setItem('onboardingBusinessId', businesses[0].id.toString());
        router.push('/onboarding');
      } catch (error) {
        console.error('Error checking for existing businesses:', error);
        // On error, redirect to signin as a safe default
        router.push('/auth/signin');
      }
    };

    checkAndRedirect();
  }, [router, status]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">PromptClarity</h1>
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Redirecting...</span>
        </div>
      </div>
    </div>
  );
}
