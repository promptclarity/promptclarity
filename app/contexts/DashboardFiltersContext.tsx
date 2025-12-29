'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useBusiness } from './BusinessContext';

interface Platform {
  id: number;
  platformId: string;
  name: string;
}

interface DashboardFiltersContextType {
  dateRange: string;
  setDateRange: (value: string) => void;
  customStartDate: string;
  customEndDate: string;
  setCustomDates: (start: string, end: string) => void;
  platforms: Platform[];
  selectedPlatforms: Set<number>;
  setSelectedPlatforms: (platforms: Set<number>) => void;
  isRefreshing: boolean;
  refreshKey: number;
  triggerRefresh: () => void;
  getDateRangeParams: () => { startDate: string; endDate: string };
}

const DashboardFiltersContext = createContext<DashboardFiltersContextType | null>(null);

export function DashboardFiltersProvider({ children }: { children: React.ReactNode }) {
  const { business } = useBusiness();
  const [dateRange, setDateRange] = useState('7d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<number>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch platforms when business changes
  useEffect(() => {
    const fetchPlatforms = async () => {
      if (!business?.id) return;

      try {
        const response = await fetch(`/api/platforms?businessId=${business.id}`);
        if (response.ok) {
          const data = await response.json();
          const platformsList = data.platforms || [];
          setPlatforms(platformsList);
          // Select all platforms by default
          setSelectedPlatforms(new Set(platformsList.map((p: Platform) => p.id)));
        }
      } catch (error) {
        console.error('Error fetching platforms:', error);
      }
    };

    fetchPlatforms();
  }, [business?.id]);

  const setCustomDates = useCallback((start: string, end: string) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
  }, []);

  const getDateRangeParams = useCallback((): { startDate: string; endDate: string } => {
    const now = new Date();
    const endDateTime = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
    const endDate = endDateTime.toISOString();

    let startDate = '';

    switch (dateRange) {
      case '7d':
        const start7 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0));
        startDate = start7.toISOString();
        break;
      case '14d':
        const start14 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 13, 0, 0, 0, 0));
        startDate = start14.toISOString();
        break;
      case '30d':
        const start30 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0));
        startDate = start30.toISOString();
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          const [startYear, startMonth, startDay] = customStartDate.split('-').map(Number);
          const [endYear, endMonth, endDay] = customEndDate.split('-').map(Number);

          const customStart = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
          const customEnd = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));

          return {
            startDate: customStart.toISOString(),
            endDate: customEnd.toISOString()
          };
        }
        // Fall through to default if custom dates not set
      default:
        const defaultStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0));
        startDate = defaultStart.toISOString();
    }

    return { startDate, endDate };
  }, [dateRange, customStartDate, customEndDate]);

  const triggerRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    // Reset refreshing state after a short delay (pages will handle the actual loading)
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  return (
    <DashboardFiltersContext.Provider
      value={{
        dateRange,
        setDateRange,
        customStartDate,
        customEndDate,
        setCustomDates,
        platforms,
        selectedPlatforms,
        setSelectedPlatforms,
        isRefreshing,
        refreshKey,
        triggerRefresh,
        getDateRangeParams,
      }}
    >
      {children}
    </DashboardFiltersContext.Provider>
  );
}

export function useDashboardFilters() {
  const context = useContext(DashboardFiltersContext);
  if (!context) {
    throw new Error('useDashboardFilters must be used within a DashboardFiltersProvider');
  }
  return context;
}