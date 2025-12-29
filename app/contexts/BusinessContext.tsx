'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Business {
  id: number;
  businessName: string;
  website: string;
  logo?: string;
  refreshPeriodDays: number;
  nextExecutionTime: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BusinessContextType {
  business: Business | null;
  loading: boolean;
  error: string | null;
  refreshBusiness: () => Promise<void>;
  switchBusiness: (businessId: number) => Promise<void>;
  /** Increments each time business is switched - use to trigger data refresh */
  switchCount: number;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  // Initialize as null to match server-side rendering
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchCount, setSwitchCount] = useState(0);

  // Hydrate from localStorage immediately after mount (but will be validated by fetchBusiness)
  useEffect(() => {
    const cached = localStorage.getItem('cachedBusiness');
    const businessId = localStorage.getItem('onboardingBusinessId');
    if (cached) {
      try {
        const parsedBusiness = JSON.parse(cached);
        // Only use cache if it matches the expected business ID
        // This is just for instant UI - fetchBusiness will validate access
        if (!businessId || parsedBusiness.id.toString() === businessId) {
          setBusiness(parsedBusiness);
        }
      } catch {
        // Invalid cache, clear it
        localStorage.removeItem('cachedBusiness');
      }
    }
  }, []);

  const fetchBusiness = async () => {
    try {
      setLoading(true);
      setError(null);

      let businessId = localStorage.getItem('onboardingBusinessId');

      // Helper function to get first accessible business
      const getFirstAccessibleBusiness = async (): Promise<string | null> => {
        const allBusinessResponse = await fetch('/api/business/all');
        if (allBusinessResponse.ok) {
          const businesses = await allBusinessResponse.json();
          if (businesses.length > 0) {
            return businesses[0].id.toString();
          }
        }
        return null;
      };

      // If no business ID, try to get the first available business
      if (!businessId) {
        const newBusinessId = await getFirstAccessibleBusiness();
        if (newBusinessId) {
          localStorage.setItem('onboardingBusinessId', newBusinessId);
          businessId = newBusinessId;
        } else {
          setError('No business found');
          setLoading(false);
          return;
        }
      }

      const response = await fetch(`/api/business?businessId=${businessId}`);

      if (!response.ok) {
        // Clear invalid cached data
        localStorage.removeItem('cachedBusiness');
        localStorage.removeItem('onboardingBusinessId');

        // Try fallback to first accessible business
        const newBusinessId = await getFirstAccessibleBusiness();
        if (newBusinessId) {
          localStorage.setItem('onboardingBusinessId', newBusinessId);
          const retryResponse = await fetch(`/api/business?businessId=${newBusinessId}`);
          if (retryResponse.ok) {
            const data = await retryResponse.json();
            setBusiness(data);
            localStorage.setItem('cachedBusiness', JSON.stringify(data));
            setLoading(false);
            return;
          }
        }
        throw new Error('Failed to fetch business information');
      }

      const data = await response.json();
      setBusiness(data);
      // Cache the business data for instant load on next page refresh
      localStorage.setItem('cachedBusiness', JSON.stringify(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching business:', err);
    } finally {
      setLoading(false);
    }
  };

  const switchBusiness = async (businessId: number) => {
    try {
      setLoading(true);
      setError(null);

      // Update localStorage with new business ID
      localStorage.setItem('onboardingBusinessId', businessId.toString());

      // Fetch the new business data
      const response = await fetch(`/api/business?businessId=${businessId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch business information');
      }

      const data = await response.json();

      // Cache the business data for instant load on next page refresh
      localStorage.setItem('cachedBusiness', JSON.stringify(data));

      // Update business state and increment switch count together
      setBusiness(data);
      setSwitchCount(prev => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error switching business:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusiness();
  }, []);

  return (
    <BusinessContext.Provider value={{ business, loading, error, refreshBusiness: fetchBusiness, switchBusiness, switchCount }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}