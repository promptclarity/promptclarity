'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Separator } from '@/app/components/ui/separator';
import {
  Loader2,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
} from 'lucide-react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Pie, PieChart, Sector, Cell, Label } from 'recharts';
import { PieSectorDataItem } from 'recharts/types/polar/Pie';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/app/components/ui/chart';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { formatLocalDate, formatLocalDateTime } from '@/app/lib/dateUtils';
import { PlatformIcon } from '@/app/components/ui/platform-icon';

interface BrandRanking {
  id?: number;
  name: string;
  visibility: number;
  visibilityChange?: number; // Change from previous period (undefined if no previous data)
  sentiment: string;
  sentimentScore: number; // 0-100 scale
  sentimentScoreChange?: number; // Change from previous period
  averagePosition: number;
  positionChange?: number; // Change from previous period (negative = improved)
  mentions: number;
  isBusiness?: boolean;
}

interface DailyVisibility {
  date: string;
  business: number;
  competitors: Record<string, number>;
}

interface RecentExecution {
  id: number;
  promptId: number;
  platformId: number;
  promptText: string;
  result: string;
  completedAt: string;
  mentionedBrands: string[];
  sources?: Array<{ domain: string; type: string; url?: string }>;
}

interface TopSource {
  domain: string;
  percentage: number;
  count: number;
  avgCitations: number;
  type: string;
}

interface Platform {
  id: number;
  platformId: string;
  name: string;
}

interface SuggestedCompetitor {
  name: string;
  mentionCount: number;
  avgPosition: number;
}

export default function OverviewPage() {
  const { business, switchCount } = useBusiness();
  const router = useRouter();
  const {
    dateRange,
    customStartDate,
    customEndDate,
    platforms,
    selectedPlatforms,
    isRefreshing,
    refreshKey,
    getDateRangeParams,
  } = useDashboardFilters();

  const [isLoading, setIsLoading] = useState(true);
  const [dailyVisibility, setDailyVisibility] = useState<DailyVisibility[]>([]);
  const [brandRankings, setBrandRankings] = useState<BrandRanking[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<RecentExecution[]>([]);
  const [topSources, setTopSources] = useState<TopSource[]>([]);
  const [totalSourcesCount, setTotalSourcesCount] = useState(0);
  const [sourceTypeBreakdown, setSourceTypeBreakdown] = useState<Record<string, number>>({});
  const [totalExecutions, setTotalExecutions] = useState(0);
  const [dateRangeInfo, setDateRangeInfo] = useState<any>(null);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [platformsMap, setPlatformsMap] = useState<Map<number, string>>(new Map());

  // Add Competitor Dialog state
  const [showAddCompetitorDialog, setShowAddCompetitorDialog] = useState(false);
  const [suggestedCompetitors, setSuggestedCompetitors] = useState<SuggestedCompetitor[]>([]);
  const [inactiveCompetitors, setInactiveCompetitors] = useState<Array<{ id: number; name: string }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [newCompetitorDomain, setNewCompetitorDomain] = useState('');
  const [addingCompetitor, setAddingCompetitor] = useState(false);

  // Dialog for adding suggested competitor with domain
  const [showSuggestedDialog, setShowSuggestedDialog] = useState(false);
  const [selectedSuggested, setSelectedSuggested] = useState<SuggestedCompetitor | null>(null);
  const [suggestedDomain, setSuggestedDomain] = useState('');
  const [suggestedLogo, setSuggestedLogo] = useState<string | null>(null);
  const [fetchingLogo, setFetchingLogo] = useState(false);
  const [activeSourceTypeIndex, setActiveSourceTypeIndex] = useState(0);
  const [recentChatsFilter, setRecentChatsFilter] = useState<'all' | 'brand'>('all');
  const [isPollingForExecutions, setIsPollingForExecutions] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{ total: number; completed: number } | null>(null);
  const [shouldRefreshAfterPolling, setShouldRefreshAfterPolling] = useState(false);

  const fetchOverviewData = useCallback(async () => {
    try {
      setIsLoading(true);

      const businessId = business?.id;
      if (!businessId) return;

      const { startDate, endDate } = getDateRangeParams();

      const url = new URL(`/api/dashboard/overview`, window.location.origin);
      url.searchParams.append('businessId', String(businessId));
      url.searchParams.append('startDate', startDate);
      url.searchParams.append('endDate', endDate);

      // Add platform filter if specified and not all platforms selected
      if (selectedPlatforms.size > 0 && platforms.length > 0 && selectedPlatforms.size < platforms.length) {
        url.searchParams.append('platformIds', Array.from(selectedPlatforms).join(','));
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setDailyVisibility(data.dailyVisibility || []);
        setBrandRankings(data.brandRankings || []);
        setRecentExecutions(data.recentExecutions || []);
        setTopSources(data.topSources || []);
        setTotalSourcesCount(data.totalSourcesCount || 0);
        setSourceTypeBreakdown(data.sourceTypeBreakdown || {});
        setTotalExecutions(data.totalExecutions || 0);
        setDateRangeInfo(data.dateRangeInfo);

        // Build platforms map (id -> platformId string)
        if (data.platforms) {
          const map = new Map<number, string>();
          data.platforms.forEach((p: Platform) => {
            map.set(p.id, p.platformId);
          });
          setPlatformsMap(map);
        }
      }
    } catch (error) {
      console.error('Error fetching overview data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [business?.id, getDateRangeParams, selectedPlatforms, platforms.length]);

  // Track the last known completed count to detect new completions
  const lastCompletedCount = useRef<number>(0);

  // Check if there are pending executions and poll until complete
  const checkExecutionStatus = useCallback(async () => {
    if (!business?.id) return false;

    try {
      const response = await fetch(`/api/executions/status?businessId=${business.id}`);
      if (response.ok) {
        const data = await response.json();

        // Check if new executions completed since last check
        if (data.completedToday > lastCompletedCount.current) {
          lastCompletedCount.current = data.completedToday;
          // Refresh data when new executions complete
          setShouldRefreshAfterPolling(true);
        }

        // Only show progress bar when executions are actively running
        if (data.running > 0) {
          // Update progress indicator only when running
          setExecutionProgress({ total: data.total, completed: data.completedToday });
          setIsPollingForExecutions(true);
          return true;
        } else {
          // Nothing actively running
          if (isPollingForExecutions) {
            setIsPollingForExecutions(false);
            setExecutionProgress(null);
          }
          return false;
        }
      }
    } catch (error) {
      console.error('Error checking execution status:', error);
    }
    return false;
  }, [business?.id, isPollingForExecutions]);

  // Refresh data after polling completes
  useEffect(() => {
    if (shouldRefreshAfterPolling) {
      setShouldRefreshAfterPolling(false);
      fetchOverviewData();
    }
  }, [shouldRefreshAfterPolling, fetchOverviewData]);

  // Poll for execution completion
  useEffect(() => {
    if (!business?.id) return;

    // Initial check
    checkExecutionStatus();

    // Set up polling interval
    const pollInterval = setInterval(() => {
      checkExecutionStatus();
    }, 5000); // Check every 5 seconds

    return () => clearInterval(pollInterval);
  }, [business?.id, checkExecutionStatus]);

  // Fetch data when business changes, switchCount increments, or refreshKey changes
  useEffect(() => {
    if (business?.id) {
      // Clear all data immediately when fetching for new business
      setDailyVisibility([]);
      setBrandRankings([]);
      setRecentExecutions([]);
      setTopSources([]);
      setTotalSourcesCount(0);
      setSourceTypeBreakdown({});
      setTotalExecutions(0);
      setSelectedBrands(new Set());

      fetchOverviewData();
    }
  }, [business?.id, switchCount, refreshKey, fetchOverviewData]);

  // Initialize selected brands when data loads
  useEffect(() => {
    if (dailyVisibility.length > 0) {
      const allBrandsList = [
        business?.businessName || 'Business',
        ...Object.keys(dailyVisibility[0]?.competitors || {})
      ];
      setSelectedBrands(new Set(allBrandsList));
    }
  }, [dailyVisibility, business?.businessName]);

  // Fetch suggested and inactive competitors when dialog opens
  const fetchSuggestedCompetitors = async () => {
    if (!business?.id) return;

    setLoadingSuggestions(true);
    try {
      // Fetch suggested competitors
      const suggestedResponse = await fetch(`/api/dashboard/competitors/suggested?businessId=${business.id}`);
      if (suggestedResponse.ok) {
        const data = await suggestedResponse.json();
        setSuggestedCompetitors(data.suggestedCompetitors || []);
      }

      // Fetch inactive competitors (previously removed)
      const inactiveResponse = await fetch(`/api/dashboard/competitors?businessId=${business.id}&inactive=true`);
      if (inactiveResponse.ok) {
        const data = await inactiveResponse.json();
        setInactiveCompetitors(data.competitors || []);
      }
    } catch (error) {
      console.error('Error fetching competitors:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Auto-fetch logo when suggested domain changes
  useEffect(() => {
    if (!suggestedDomain.trim()) {
      setSuggestedLogo(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setFetchingLogo(true);
      try {
        const response = await fetch(`/api/favicon?domain=${encodeURIComponent(suggestedDomain.trim())}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.logo) {
            setSuggestedLogo(data.logo);
          } else {
            setSuggestedLogo(null);
          }
        } else {
          setSuggestedLogo(null);
        }
      } catch (error) {
        console.error('Error fetching logo:', error);
        setSuggestedLogo(null);
      } finally {
        setFetchingLogo(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [suggestedDomain]);

  // Open dialog to add a suggested competitor
  const openAddSuggestedDialog = (suggested: SuggestedCompetitor) => {
    setSelectedSuggested(suggested);
    setSuggestedDomain('');
    setSuggestedLogo(null);
    setShowSuggestedDialog(true);
  };

  // Confirm adding the suggested competitor
  const confirmAddSuggested = async () => {
    if (!selectedSuggested) return;
    await addCompetitor(selectedSuggested.name, suggestedDomain || undefined, suggestedLogo);
    setShowSuggestedDialog(false);
    setSelectedSuggested(null);
    setSuggestedDomain('');
    setSuggestedLogo(null);
  };

  // Add a new competitor
  const addCompetitor = async (name: string, domain?: string, prefetchedLogo?: string | null) => {
    if (!business?.id || !name.trim()) return;

    setAddingCompetitor(true);
    try {
      // Use prefetched logo or fetch if domain is provided
      let logo: string | undefined = prefetchedLogo || undefined;
      if (!logo && domain?.trim()) {
        try {
          const logoResponse = await fetch(`/api/favicon?domain=${encodeURIComponent(domain.trim())}`);
          if (logoResponse.ok) {
            const logoData = await logoResponse.json();
            if (logoData.success && logoData.logo) {
              logo = logoData.logo;
            }
          }
        } catch (logoError) {
          console.error('Error fetching logo:', logoError);
        }
      }

      const response = await fetch('/api/dashboard/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          name: name.trim(),
          website: domain?.trim() || null,
          logo: logo || null,
        }),
      });

      if (response.ok) {
        // Refresh the overview data to include the new competitor
        fetchOverviewData();
        // Remove from suggestions
        setSuggestedCompetitors(prev => prev.filter(c => c.name !== name));
        setNewCompetitorName('');
        setNewCompetitorDomain('');
        // Close dialog
        setShowAddCompetitorDialog(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add competitor');
      }
    } catch (error) {
      console.error('Error adding competitor:', error);
      alert('Failed to add competitor');
    } finally {
      setAddingCompetitor(false);
    }
  };

  // Remove a competitor from tracking (soft delete)
  const removeCompetitor = async (competitorId: number, competitorName: string) => {
    if (!business?.id) return;

    try {
      const response = await fetch(`/api/dashboard/competitors?competitorId=${competitorId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh the overview data
        fetchOverviewData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to remove competitor');
      }
    } catch (error) {
      console.error('Error removing competitor:', error);
      alert('Failed to remove competitor');
    }
  };

  // Reactivate an inactive competitor
  const reactivateCompetitor = async (competitorId: number) => {
    if (!business?.id) return;

    setAddingCompetitor(true);
    try {
      const response = await fetch('/api/dashboard/competitors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId }),
      });

      if (response.ok) {
        // Refresh the overview data
        fetchOverviewData();
        // Remove from inactive list
        setInactiveCompetitors(prev => prev.filter(c => c.id !== competitorId));
        // Close dialog
        setShowAddCompetitorDialog(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to reactivate competitor');
      }
    } catch (error) {
      console.error('Error reactivating competitor:', error);
      alert('Failed to reactivate competitor');
    } finally {
      setAddingCompetitor(false);
    }
  };

  const toggleBrandSelection = useCallback((brand: string) => {
    setSelectedBrands(prev => {
      const newSet = new Set(prev);
      if (newSet.has(brand)) {
        newSet.delete(brand);
      } else {
        newSet.add(brand);
      }
      return newSet;
    });
  }, []);

  // Format data for line chart - memoized for performance
  const chartData = useMemo(() => {
    return dailyVisibility.map(day => {
      const data: any = {
        date: formatLocalDate(day.date, { month: 'short', day: 'numeric' }),
        [business?.businessName || 'Business']: day.business
      };

      // Add competitor data
      Object.entries(day.competitors).forEach(([compName, visibility]) => {
        data[compName] = visibility;
      });

      return data;
    });
  }, [dailyVisibility, business?.businessName]);

  // Get all brand names for chart legend - memoized for performance
  const allBrands = useMemo(() => {
    return [
      business?.businessName || 'Business',
      ...Object.keys(dailyVisibility[0]?.competitors || {})
    ];
  }, [dailyVisibility, business?.businessName]);

  // Memoize the filtered brands list for better performance
  const visibleBrands = useMemo(() => {
    return allBrands.filter(brand => selectedBrands.has(brand));
  }, [allBrands, selectedBrands]);

  // Colors for each brand
  const brandColors = [
    'hsl(217, 91%, 60%)', // blue
    'hsl(160, 84%, 39%)', // green
    'hsl(38, 92%, 50%)',  // amber
    'hsl(0, 84%, 60%)',   // red
    'hsl(258, 90%, 66%)', // purple
    'hsl(187, 92%, 41%)', // cyan
    'hsl(330, 81%, 60%)', // pink
  ];

  // Build chart config dynamically based on visible brands
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    visibleBrands.forEach((brand) => {
      const originalIndex = allBrands.indexOf(brand);
      config[brand] = {
        label: brand,
        color: brandColors[originalIndex % brandColors.length],
      };
    });
    return config;
  }, [visibleBrands, allBrands]);

  // Calculate max Y value for chart (10% higher than highest point)
  const chartYMax = useMemo(() => {
    if (chartData.length === 0) return 100;
    let maxVal = 0;
    chartData.forEach(day => {
      visibleBrands.forEach(brand => {
        const val = day[brand] as number;
        if (val > maxVal) maxVal = val;
      });
    });
    // Add 10% headroom, cap at 100
    return Math.min(100, Math.ceil(maxVal * 1.1));
  }, [chartData, visibleBrands]);

  // Colors for source type pie chart
  const sourceTypeColors: Record<string, string> = {
    'You': 'hsl(217, 91%, 60%)',        // blue
    'Competitor': 'hsl(0, 84%, 60%)',    // red
    'Editorial': 'hsl(160, 84%, 39%)',   // green
    'Reference': 'hsl(38, 92%, 50%)',    // amber
    'UGC': 'hsl(258, 90%, 66%)',         // purple
    'Corporate': 'hsl(187, 92%, 41%)',   // cyan
    'Institutional': 'hsl(330, 81%, 60%)', // pink
    'Other': 'hsl(220, 9%, 46%)',        // gray
  };

  // Source data by type for pie chart (from API - aggregated from ALL sources)
  const sourceTypeData = useMemo(() => {
    return Object.entries(sourceTypeBreakdown)
      .map(([type, count]) => ({
        type,
        count,
        fill: sourceTypeColors[type] || sourceTypeColors['Other'],
      }))
      .sort((a, b) => b.count - a.count);
  }, [sourceTypeBreakdown]);

  // Chart config for source type pie chart
  const sourceTypeChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    sourceTypeData.forEach(item => {
      config[item.type] = {
        label: item.type,
        color: item.fill,
      };
    });
    return config;
  }, [sourceTypeData]);

  // Total for source type pie chart
  const totalSourceTypeCounts = useMemo(() => {
    return sourceTypeData.reduce((acc, curr) => acc + curr.count, 0);
  }, [sourceTypeData]);

  // Filter recent executions based on selected filter
  const filteredRecentExecutions = useMemo(() => {
    if (recentChatsFilter === 'all') {
      return recentExecutions;
    }
    // Filter to only show chats that mention the business
    return recentExecutions.filter(execution =>
      execution.mentionedBrands.includes(business?.businessName || '')
    );
  }, [recentExecutions, recentChatsFilter, business?.businessName]);

  // Get the rank for a brand based on selected brands only
  const getBrandRank = useCallback((brandName: string): number => {
    if (!selectedBrands.has(brandName)) return -1;

    const selectedBrandsList = brandRankings
      .filter(brand => selectedBrands.has(brand.name))
      .sort((a, b) => b.visibility - a.visibility);

    return selectedBrandsList.findIndex(b => b.name === brandName) + 1;
  }, [brandRankings, selectedBrands]);


  const getOrdinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const getSourceTypeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (type) {
      case 'You': return 'default';
      case 'Competitor': return 'destructive';
      default: return 'secondary';
    }
  };

  const getVisibilityVariant = (visibility: number): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (visibility > 50) return 'default';
    return 'secondary';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading overview...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
        {/* Execution Progress Banner */}
        {isPollingForExecutions && executionProgress && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <div className="flex-1">
              <span className="text-sm text-blue-800">
                Running AI queries... {executionProgress.completed} of {executionProgress.total} complete
              </span>
              <div className="mt-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${(executionProgress.completed / executionProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <div className={`mb-4 ${isRefreshing ? 'opacity-50' : ''}`}>
          {/* Headers row - visible on lg screens */}
          <div className="hidden lg:flex gap-4 mb-2">
            <div className="flex-[1_1_50%] min-w-0 flex items-center gap-2">
              <span className="text-sm">Visibility</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400 truncate">Percentage of chats mentioning each brand</span>
            </div>
            <div className="flex-[1_1_50%] min-w-0 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm">Brands</span>
                <span className="text-muted-foreground text-sm">·</span>
                <span className="text-sm text-gray-400 truncate">
                  {selectedBrands.size === allBrands.length
                    ? 'Brands with highest visibility'
                    : `Showing ${selectedBrands.size} of ${allBrands.length} brands`}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowAddCompetitorDialog(true);
                  fetchSuggestedCompetitors();
                }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>
          {/* Cards row */}
          <div className="flex gap-4 flex-col lg:flex-row">
            {/* Visibility Line Chart - Left Side (50%) */}
            <div className="flex-[1_1_50%] min-w-0">
              {/* Title visible only on small screens */}
              <div className="flex items-center gap-2 mb-2 lg:hidden">
                <span className="text-sm">Visibility</span>
                <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
                <span className="text-sm text-gray-400 hidden sm:inline truncate">Percentage of chats mentioning each brand</span>
              </div>
              <Card className="h-full">
                <CardContent className="pt-3">
                {chartData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[280px] w-full">
                    <LineChart
                      accessibilityLayer
                      data={chartData}
                      margin={{ left: 0, right: 20, top: 20, bottom: 5 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        domain={[0, chartYMax]}
                        ticks={[25, 50, chartYMax]}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}%`}
                        width={45}
                        tick={{ fontSize: 12 }}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                      />
                      {visibleBrands.map((brand) => {
                        const originalIndex = allBrands.indexOf(brand);
                        const isHovered = hoveredBrand === brand;
                        return (
                          <Line
                            key={brand}
                            type="natural"
                            dataKey={brand}
                            stroke={brandColors[originalIndex % brandColors.length]}
                            strokeWidth={isHovered ? 3 : 2}
                            strokeOpacity={hoveredBrand === null || isHovered ? 1 : 0.2}
                            dot={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px]">
                    <span className="text-gray-400 text-sm">No visibility data available</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

            {/* Brand Rankings Table - Right Side (50%) */}
            <div className="flex-[1_1_50%] min-w-0">
              {/* Title visible only on small screens */}
              <div className="flex justify-between items-center mb-2 lg:hidden">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Brands</span>
                  <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
                  <span className="text-sm text-gray-400 hidden sm:inline truncate">
                    {selectedBrands.size === allBrands.length
                      ? 'Brands with highest visibility'
                      : `Showing ${selectedBrands.size} of ${allBrands.length} brands`}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setShowAddCompetitorDialog(true);
                    fetchSuggestedCompetitors();
                  }}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
              <Card className="h-full">
                <CardContent className="pt-3">
                <div className="max-h-[280px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>#</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">Visibility</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Percentage of chats mentioning the brand. Arrow shows change vs previous {dateRangeInfo?.totalDays || 7} days.
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">Sentiment</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Score 0-100 (0=negative, 50=neutral, 100=positive). Arrow shows change vs previous period.
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">Place</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Average ranking position (lower is better). Arrow up = improved vs previous period.
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brandRankings.map((brand) => {
                        const isSelected = selectedBrands.has(brand.name);
                        const brandIndex = allBrands.indexOf(brand.name);
                        const brandColor = brandColors[brandIndex % brandColors.length];
                        const dynamicRank = getBrandRank(brand.name);

                        return (
                          <TableRow
                            key={brand.name}
                            className={`cursor-pointer transition-all hover:bg-gray-100 ${isSelected ? 'opacity-100' : 'opacity-40'} ${hoveredBrand === brand.name ? 'bg-gray-100' : ''}`}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                                toggleBrandSelection(brand.name);
                              }
                            }}
                            onMouseEnter={() => setHoveredBrand(brand.name)}
                            onMouseLeave={() => setHoveredBrand(null)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleBrandSelection(brand.name)}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2.5 h-2.5 rounded-sm"
                                  style={{ backgroundColor: brandColor }}
                                />
                                <span>
                                  {dynamicRank > 0 ? dynamicRank : '-'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span>{brand.name}</span>
                                {brand.name === business?.businessName && (
                                  <Badge variant="secondary">You</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">
                                  {brand.visibility}%
                                </Badge>
                                {brand.visibilityChange !== undefined && Math.abs(brand.visibilityChange) >= 0.1 && (
                                  <div className="flex items-center">
                                    {brand.visibilityChange > 0 ? (
                                      <ArrowUp className="h-3 w-3 text-green-600" />
                                    ) : brand.visibilityChange < 0 ? (
                                      <ArrowDown className="h-3 w-3 text-red-600" />
                                    ) : null}
                                    <span className={`text-xs ${brand.visibilityChange > 0 ? 'text-green-600' : brand.visibilityChange < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                      {brand.visibilityChange > 0 ? '+' : ''}{brand.visibilityChange.toFixed(1)}%
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded cursor-help ${
                                      brand.sentimentScore >= 75
                                        ? 'bg-green-100 text-green-800'
                                        : brand.sentimentScore >= 40
                                          ? 'bg-gray-100 text-gray-600'
                                          : 'bg-red-100 text-red-700'
                                    }`}>
                                      {brand.sentimentScore}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{brand.sentimentScore >= 75 ? 'Positive' : brand.sentimentScore >= 40 ? 'Neutral' : 'Negative'} sentiment ({brand.sentimentScore}/100)</p>
                                  </TooltipContent>
                                </Tooltip>
                                {brand.sentimentScoreChange !== undefined && brand.sentimentScoreChange !== 0 && (
                                  <div className="flex items-center">
                                    {brand.sentimentScoreChange > 0 ? (
                                      <ArrowUp className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <ArrowDown className="h-3 w-3 text-red-600" />
                                    )}
                                    <span className={`text-xs ${brand.sentimentScoreChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {brand.sentimentScoreChange > 0 ? '+' : ''}{brand.sentimentScoreChange}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">
                                  {brand.averagePosition > 0 ? getOrdinal(brand.averagePosition) : '-'}
                                </span>
                                {brand.positionChange !== undefined && brand.positionChange !== 0 && (
                                  <div className="flex items-center">
                                    {brand.positionChange < 0 ? (
                                      <ArrowUp className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <ArrowDown className="h-3 w-3 text-red-600" />
                                    )}
                                    <span className={`text-xs ${brand.positionChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {Math.abs(brand.positionChange)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {brandRankings.length === 0 && (
                    <div className="flex items-center justify-center h-[280px]">
                      <span className="text-gray-400 text-sm">No brand data available</span>
                    </div>
                  )}
                </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Top Sources Section - Split Layout */}
        <div className={`mb-4 ${isRefreshing ? 'opacity-50' : ''}`}>
          {/* Headers row - visible on lg screens */}
          <div className="hidden lg:flex gap-4 mb-2">
            <div className="flex-[1_1_60%] min-w-0 flex items-center gap-2">
              <span className="text-sm">Top Sources</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400 truncate">Sources across active models</span>
            </div>
            <div className="flex-[1_1_40%] min-w-0 flex items-center gap-2">
              <span className="text-sm">Domain type</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400 truncate">Breakdown by source category</span>
            </div>
          </div>
          {/* Cards row */}
          <div className="flex gap-4 flex-col lg:flex-row">
            {/* Top Sources Table - Left Side */}
            <div className="flex-[1_1_60%] min-w-0">
              {/* Title visible only on small screens */}
              <div className="flex items-center gap-2 mb-2 lg:hidden">
                <span className="text-sm">Top Sources</span>
                <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
                <span className="text-sm text-gray-400 hidden sm:inline truncate">Sources across active models</span>
              </div>
              <Card className="h-full">
                <CardContent className="pt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Usage</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            How often this domain is cited per response. Can exceed 100% if cited multiple times in a single answer.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Avg Citations</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Average number of citations per chat for this domain when used as a source in the selected time period
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Type</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Category of the source based on the domain's content and purpose
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSources.slice(0, 10).map((source, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <span
                            className="text-sm text-primary cursor-pointer hover:underline"
                            onClick={() => router.push(`/dashboard/sources/${encodeURIComponent(source.domain)}?dateRange=${dateRange}`)}
                          >
                            {source.domain}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {source.percentage}%
                            </Badge>
                            <span className="text-xs text-muted-foreground">({source.count})</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{source.avgCitations}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                            style={{
                              backgroundColor: (sourceTypeColors[source.type] || sourceTypeColors['Other']).replace(')', ', 0.12)').replace('hsl(', 'hsla('),
                              color: sourceTypeColors[source.type] || sourceTypeColors['Other']
                            }}
                          >
                            {source.type}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {topSources.length === 0 && (
                  <div className="flex items-center justify-center h-[200px]">
                    <span className="text-gray-400 text-sm">No source data available</span>
                  </div>
                )}

                {totalSourcesCount > 6 && (
                  <>
                    <Separator className="my-4" />
                    <Link href="/dashboard/sources">
                      <Button variant="secondary" className="w-full">
                        View All Sources ({totalSourcesCount})
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

            {/* Source Types Pie Chart - Right Side */}
            <div className="flex-[1_1_40%] min-w-0">
              {/* Title visible only on small screens */}
              <div className="flex items-center gap-2 mb-2 lg:hidden">
                <span className="text-sm">Domain type</span>
                <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
                <span className="text-sm text-gray-400 hidden sm:inline truncate">Breakdown by source category</span>
              </div>
              <Card className="h-full">
                <CardContent className="pt-3">
                {sourceTypeData.length > 0 ? (
                  <ChartContainer config={sourceTypeChartConfig} className="mx-auto aspect-square h-[200px]">
                    <PieChart>
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            hideLabel
                            formatter={(value, name) => (
                              <div className="flex flex-1 justify-between items-center leading-none">
                                <span className="text-muted-foreground">{name}</span>
                                <span className="font-mono tabular-nums text-foreground ml-2">
                                  {String(value)} ({totalSourceTypeCounts > 0 ? ((Number(value) / totalSourceTypeCounts) * 100).toFixed(1) : 0}%)
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={sourceTypeData}
                        dataKey="count"
                        nameKey="type"
                        innerRadius={45}
                        outerRadius={75}
                        strokeWidth={5}
                        // @ts-expect-error - recharts types don't include activeIndex but it works
                        activeIndex={activeSourceTypeIndex}
                        activeShape={({
                          outerRadius = 0,
                          ...props
                        }: PieSectorDataItem) => (
                          <Sector
                            {...props}
                            outerRadius={outerRadius + 8}
                          />
                        )}
                        onMouseEnter={(_, index) => setActiveSourceTypeIndex(index)}
                      >
                        {sourceTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                        <Label
                          content={({ viewBox }) => {
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                              return (
                                <text
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                >
                                  <tspan
                                    x={viewBox.cx}
                                    y={viewBox.cy}
                                    className="fill-foreground text-2xl"
                                  >
                                    {totalSourceTypeCounts.toLocaleString()}
                                  </tspan>
                                  <tspan
                                    x={viewBox.cx}
                                    y={(viewBox.cy || 0) + 20}
                                    className="fill-muted-foreground text-xs"
                                  >
                                    Citations
                                  </tspan>
                                </text>
                              )
                            }
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px]">
                    <span className="text-gray-400 text-sm">No source type data available</span>
                  </div>
                )}

                {/* Legend */}
                {sourceTypeData.length > 0 && (
                  <div className="max-h-[150px] overflow-y-auto mt-4">
                    {sourceTypeData.map((entry, index) => (
                      <div
                        key={entry.type}
                        className={`flex items-center gap-2 py-1 px-2 cursor-pointer rounded transition-colors ${activeSourceTypeIndex === index ? 'bg-muted' : ''}`}
                        onMouseEnter={() => setActiveSourceTypeIndex(index)}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span className="text-sm flex-1">{entry.type}</span>
                        <span className="text-sm text-muted-foreground">{entry.count}</span>
                        <Badge variant="secondary" className="text-xs">
                          {totalSourceTypeCounts > 0 ? ((entry.count / totalSourceTypeCounts) * 100).toFixed(1) : 0}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Recent Chats Section */}
        <div className={isRefreshing ? 'opacity-50' : ''}>
          {/* Header row */}
          <div className="flex justify-between items-center mb-2 h-5">
            <div className="flex items-center gap-2">
              <span className="text-sm">Recent Responses</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400">
                {recentChatsFilter === 'brand'
                  ? `Mentioning ${business?.businessName || 'your brand'}`
                  : 'Latest responses from models'}
              </span>
            </div>
            <div className="flex gap-0.5 border rounded p-0.5">
              <button
                onClick={() => setRecentChatsFilter('all')}
                className={`px-2 py-0.5 text-sm rounded ${recentChatsFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All
              </button>
              <button
                onClick={() => setRecentChatsFilter('brand')}
                className={`px-2 py-0.5 text-sm rounded ${recentChatsFilter === 'brand' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Mentions You
              </button>
            </div>
          </div>
          <Card>
            <CardContent className="pt-3">
            <div className="max-h-[320px] overflow-y-auto">
              <div className="flex flex-col gap-3">
                {filteredRecentExecutions.map((execution) => (
                  <Card
                    key={execution.id}
                    className="cursor-pointer transition-all hover:bg-muted/50 hover:-translate-y-0.5 hover:shadow-md"
                    onClick={() => router.push(`/dashboard/prompts/${execution.promptId}?executionId=${execution.id}`)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <PlatformIcon platformId={platformsMap.get(execution.platformId) || ''} size="sm" />
                          <span className="text-xs text-muted-foreground">
                            {formatLocalDateTime(execution.completedAt)}
                          </span>
                          {execution.mentionedBrands.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {execution.mentionedBrands.map((brand, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                                  style={{
                                    backgroundColor: brand === business?.businessName
                                      ? 'hsl(217, 91%, 60%, 0.15)'
                                      : 'hsl(0, 84%, 60%, 0.15)',
                                    color: brand === business?.businessName
                                      ? 'hsl(217, 91%, 60%)'
                                      : 'hsl(0, 84%, 60%)'
                                  }}
                                >
                                  {brand}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {execution.promptText && (
                          <span className="text-sm">
                            {execution.promptText}
                          </span>
                        )}

                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {execution.result}
                        </p>

                        {execution.sources && execution.sources.length > 0 && (
                          <div className="flex gap-1 flex-wrap items-center">
                            <span className="text-xs text-muted-foreground">Sources:</span>
                            {execution.sources.slice(0, 3).map((source, idx) => (
                              <Badge
                                key={idx}
                                variant={getSourceTypeVariant(source.type)}
                              >
                                {source.domain}
                              </Badge>
                            ))}
                            {execution.sources.length > 3 && (
                              <span className="text-xs text-muted-foreground">+{execution.sources.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filteredRecentExecutions.length === 0 && (
                <div className="flex items-center justify-center py-6">
                  <span className="text-muted-foreground text-sm">
                    {recentChatsFilter === 'brand'
                      ? `No responses mentioning ${business?.businessName || 'your brand'} yet`
                      : 'No recent responses available'}
                  </span>
                </div>
              )}
            </div>

            {recentExecutions.length > 0 && (
              <>
                <Separator className="my-4" />
                <Button variant="secondary" className="w-full">
                  View All Responses
                </Button>
              </>
            )}
            </CardContent>
          </Card>
        </div>

        {/* Add Competitor Dialog */}
        <Dialog open={showAddCompetitorDialog} onOpenChange={setShowAddCompetitorDialog}>
          <DialogContent className="max-w-[450px]">
            <DialogHeader>
              <DialogTitle>Add Competitor</DialogTitle>
              <DialogDescription>
                Add a brand to track in your competitive analysis.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              {/* Manual entry */}
              <div>
                <p className="text-sm mb-2">Enter brand details</p>
                <div className="flex gap-2 flex-col sm:flex-row">
                  <Input
                    placeholder="Brand name..."
                    value={newCompetitorName}
                    onChange={(e) => setNewCompetitorName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCompetitorName.trim()) {
                        addCompetitor(newCompetitorName, newCompetitorDomain);
                      }
                    }}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Domain (e.g. competitor.com)..."
                    value={newCompetitorDomain}
                    onChange={(e) => setNewCompetitorDomain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCompetitorName.trim()) {
                        addCompetitor(newCompetitorName, newCompetitorDomain);
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => addCompetitor(newCompetitorName, newCompetitorDomain)}
                    disabled={!newCompetitorName.trim() || addingCompetitor}
                  >
                    {addingCompetitor ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a domain to automatically fetch the competitor&apos;s logo
                </p>
              </div>

              {/* Suggested competitors */}
              {(loadingSuggestions || suggestedCompetitors.length > 0) && (
                <div>
                  <p className="text-sm mb-2">Suggested</p>
                  {loadingSuggestions ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground ml-2">Finding suggestions...</span>
                    </div>
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto pr-1">
                      <div className="flex flex-col gap-2">
                        {suggestedCompetitors.map((competitor) => (
                          <Card key={competitor.name} className="p-3">
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col gap-1">
                                <span className="text-sm">{competitor.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  Mentioned {competitor.mentionCount} times · Avg position #{competitor.avgPosition}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openAddSuggestedDialog(competitor)}
                                disabled={addingCompetitor}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!loadingSuggestions && suggestedCompetitors.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No suggested competitors found. Brands that appear frequently in LLM responses but aren&apos;t being tracked will show up here.
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="secondary" onClick={() => setShowAddCompetitorDialog(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Suggested Competitor Dialog */}
        <Dialog open={showSuggestedDialog} onOpenChange={setShowSuggestedDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add {selectedSuggested?.name}</DialogTitle>
              <DialogDescription>
                Enter domain
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-3">
                {suggestedLogo ? (
                  <img
                    src={suggestedLogo}
                    alt={`${selectedSuggested?.name} logo`}
                    className="h-12 w-12 rounded object-contain border bg-white"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted flex items-center justify-center border">
                    {fetchingLogo ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-lg text-muted-foreground">
                        {selectedSuggested?.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    placeholder="e.g. competitor.com"
                    value={suggestedDomain}
                    onChange={(e) => setSuggestedDomain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmAddSuggested();
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowSuggestedDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmAddSuggested}
                disabled={addingCompetitor}
              >
                {addingCompetitor ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}
