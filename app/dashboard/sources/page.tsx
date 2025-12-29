'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import { Switch } from '@/app/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Loader2,
  Info,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, PieChart, Pie, Label, Sector, Cell } from 'recharts';
import { PieSectorDataItem } from 'recharts/types/polar/Pie';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/app/components/ui/chart';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { formatLocalDate } from '@/app/lib/dateUtils';

interface DailySourceUsage {
  date: string;
  sources: Record<string, number>;
}

interface SourceStat {
  domain: string;
  type: string;
  usagePercentage: number;
  totalAppearances: number;
  averageCitationsPerPrompt: number;
  contentGapOpportunity: boolean;
  competitorOnlyAppearances: number;
  gapUsagePercentage: number;
  gapAverageCitationsPerPrompt: number;
  yourBrandPresent: boolean;
  yourBrandAppearances: number;
  competitorPresent: boolean;
  competitorAppearances: number;
  whiteSpace: boolean;
  priorityScore: number;
}

export default function SourcesPage() {
  const router = useRouter();
  const { business, switchCount } = useBusiness();
  const { selectedPlatforms, platforms, refreshKey, dateRange, getDateRangeParams } = useDashboardFilters();
  const [isLoading, setIsLoading] = useState(true);

  const [dailySourceUsage, setDailySourceUsage] = useState<DailySourceUsage[]>([]);
  const [sourceStats, setSourceStats] = useState<SourceStat[]>([]);
  const [dateRangeInfo, setDateRangeInfo] = useState<any>(null);
  const [showContentGapsOnly, setShowContentGapsOnly] = useState(false);
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);
  const [usageSortOrder, setUsageSortOrder] = useState<'desc' | 'asc'>('desc');
  const [gapSortBy, setGapSortBy] = useState<'usage' | 'priority'>('priority');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const [activeTypeIndex, setActiveTypeIndex] = useState(0);

  const fetchSourcesData = async (businessIdOverride?: number) => {
    try {
      setIsLoading(true);

      const businessId = businessIdOverride || business?.id;
      if (!businessId) return;

      const { startDate, endDate } = getDateRangeParams();

      const url = new URL(`/api/dashboard/sources`, window.location.origin);
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
        setDailySourceUsage(data.dailySourceUsage || []);
        setSourceStats(data.sourceStats || []);
        setDateRangeInfo(data.dateRangeInfo);
      }
    } catch (error) {
      console.error('Error fetching sources data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data when business changes, switchCount increments, platform filter changes, or date range changes
  useEffect(() => {
    if (business?.id) {
      // Clear all data immediately when fetching for new business
      setDailySourceUsage([]);
      setSourceStats([]);
      setDateRangeInfo(null);
      setIsLoading(true);

      fetchSourcesData(business.id);
    } else {
      setIsLoading(false);
    }
  }, [business?.id, switchCount, refreshKey, dateRange]);

  // Navigate to source detail page
  const navigateToSource = (domain: string) => {
    router.push(`/dashboard/sources/${encodeURIComponent(domain)}?dateRange=${dateRange}`);
  };

  // Format data for line chart
  const chartData = dailySourceUsage.map(day => {
    const data: any = {
      date: formatLocalDate(day.date, { month: 'short', day: 'numeric' }),
    };

    // Add source data
    Object.entries(day.sources).forEach(([domain, percentage]) => {
      data[domain] = percentage;
    });

    return data;
  });

  // Get top 5 domains by usage percentage for chart
  const allDomains = sourceStats
    .slice(0, 5)
    .map(s => s.domain);

  // Colors for each source (using HSL like overview page)
  const sourceColors = [
    'hsl(217, 91%, 60%)', // blue
    'hsl(160, 84%, 39%)', // green
    'hsl(38, 92%, 50%)',  // amber
    'hsl(0, 84%, 60%)',   // red
    'hsl(258, 90%, 66%)', // purple
    'hsl(187, 92%, 41%)', // cyan
    'hsl(330, 81%, 60%)', // pink
    'hsl(24, 95%, 53%)',  // orange
    'hsl(168, 76%, 42%)', // teal
    'hsl(270, 91%, 65%)', // violet
  ];

  // Build chart config dynamically based on domains
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    allDomains.forEach((domain, index) => {
      config[domain] = {
        label: domain,
        color: sourceColors[index % sourceColors.length],
      };
    });
    return config;
  }, [allDomains]);

  const getSourceTypeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (type) {
      case 'You': return 'default';
      case 'Competitor': return 'destructive';
      default: return 'secondary';
    }
  };

  // Filter and sort sources based on content gap toggle and sort order
  const filteredSourceStats = useMemo(() => {
    let filtered = sourceStats;

    if (showContentGapsOnly) {
      // Filter to only content gap sources
      filtered = sourceStats.filter(source => source.contentGapOpportunity);

      // Sort by selected criteria for gaps
      if (gapSortBy === 'priority') {
        return [...filtered].sort((a, b) => {
          return usageSortOrder === 'desc'
            ? b.priorityScore - a.priorityScore
            : a.priorityScore - b.priorityScore;
        });
      } else {
        return [...filtered].sort((a, b) => {
          return usageSortOrder === 'desc'
            ? b.gapUsagePercentage - a.gapUsagePercentage
            : a.gapUsagePercentage - b.gapUsagePercentage;
        });
      }
    }

    // Sort by usage percentage for all sources
    return [...filtered].sort((a, b) => {
      return usageSortOrder === 'desc'
        ? b.usagePercentage - a.usagePercentage
        : a.usagePercentage - b.usagePercentage;
    });
  }, [sourceStats, showContentGapsOnly, usageSortOrder, gapSortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredSourceStats.length / itemsPerPage);
  const paginatedSourceStats = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSourceStats.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSourceStats, currentPage, itemsPerPage]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [showContentGapsOnly, usageSortOrder, gapSortBy]);

  // Compute source type breakdown for pie chart (by total appearances, not unique domains)
  const typeBreakdown = useMemo(() => {
    const typeMap = new Map<string, { count: number; sources: Array<{ domain: string; usagePercentage: number }> }>();

    sourceStats.forEach(source => {
      const existing = typeMap.get(source.type);
      if (existing) {
        existing.count += source.totalAppearances;
        existing.sources.push({ domain: source.domain, usagePercentage: source.usagePercentage });
      } else {
        typeMap.set(source.type, {
          count: source.totalAppearances,
          sources: [{ domain: source.domain, usagePercentage: source.usagePercentage }]
        });
      }
    });

    const totalAppearances = sourceStats.reduce((acc, s) => acc + s.totalAppearances, 0);

    return Array.from(typeMap.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        percentage: totalAppearances > 0 ? Math.round((data.count / totalAppearances) * 1000) / 10 : 0,
        topSources: data.sources
          .sort((a, b) => b.usagePercentage - a.usagePercentage)
          .slice(0, 5)
      }))
      .sort((a, b) => b.count - a.count);
  }, [sourceStats]);

  // Colors for pie chart by type (matching overview page)
  const typeColors: Record<string, string> = {
    'You': 'hsl(217, 91%, 60%)',           // blue
    'Competitor': 'hsl(0, 84%, 60%)',      // red
    'Editorial': 'hsl(160, 84%, 39%)',     // green
    'Reference': 'hsl(38, 92%, 50%)',      // amber
    'UGC': 'hsl(258, 90%, 66%)',           // purple
    'Corporate': 'hsl(187, 92%, 41%)',     // cyan
    'Institutional': 'hsl(330, 81%, 60%)', // pink
    'Other': 'hsl(220, 9%, 46%)',          // gray
  };

  // Chart config for pie chart with consistent colors (matching overview page)
  const typeChartConfig: ChartConfig = useMemo(() => ({
    count: { label: 'Citations' },
    'You': { label: 'You', color: typeColors['You'] },
    'Competitor': { label: 'Competitor', color: typeColors['Competitor'] },
    'Editorial': { label: 'Editorial', color: typeColors['Editorial'] },
    'Reference': { label: 'Reference', color: typeColors['Reference'] },
    'UGC': { label: 'UGC', color: typeColors['UGC'] },
    'Corporate': { label: 'Corporate', color: typeColors['Corporate'] },
    'Institutional': { label: 'Institutional', color: typeColors['Institutional'] },
    'Other': { label: 'Other', color: typeColors['Other'] },
  }), []);

  // Transform data for pie chart with fill colors
  const pieChartData = useMemo(() => {
    return typeBreakdown.map(({ type, count }) => ({
      type,
      count,
      fill: typeColors[type] || '#9ca3af',
    }));
  }, [typeBreakdown]);

  // Calculate total sources for center label
  const totalSources = useMemo(() => {
    return typeBreakdown.reduce((acc, curr) => acc + curr.count, 0);
  }, [typeBreakdown]);

  const toggleUsageSort = () => {
    setUsageSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  const getUsageVariant = (percentage: number): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (percentage > 20) return 'default';
    return 'secondary';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading sources data...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
        {/* Charts Row */}
        <div className="mb-4">
          {/* Headers row - visible on lg screens */}
          <div className="hidden lg:flex gap-4 mb-2">
            <div className="flex-[1_1_50%] min-w-0 flex items-center gap-2">
              <span className="text-sm">Domain Usage Over Time</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400 truncate">Percentage of responses citing each domain (top 5)</span>
            </div>
            <div className="flex-[1_1_50%] min-w-0 flex items-center gap-2">
              <span className="text-sm">Sources by Type</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400 truncate">Breakdown by source category</span>
            </div>
          </div>
          {/* Cards row */}
          <div className="flex gap-4 flex-col lg:flex-row">
            {/* Source Usage Over Time Chart */}
            <div className="flex-[1_1_50%] min-w-0">
              {/* Title visible only on small screens */}
              <div className="flex items-center gap-2 mb-2 lg:hidden">
                <span className="text-sm">Domain Usage Over Time</span>
                <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
                <span className="text-sm text-gray-400 hidden sm:inline truncate">Percentage of responses citing each domain (top 5)</span>
              </div>
              <Card className="h-full">
                <CardContent className="pt-3">
              {chartData.length > 0 ? (
                (() => {
                  // Calculate max Y value from all visible domains
                  let maxVal = 0;
                  chartData.forEach(day => {
                    allDomains.forEach(domain => {
                      const val = day[domain] as number;
                      if (val > maxVal) maxVal = val;
                    });
                  });
                  const chartYMax = Math.min(100, Math.ceil(maxVal * 1.1));
                  // Find a relevant interval tick (10, 15, 20, 25, 30, 35, 40, etc.)
                  const intervals = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90];
                  const midTick = intervals.find(i => i < chartYMax && i > chartYMax * 0.3) || Math.round(chartYMax / 2);
                  return (
                    <div className="flex flex-col">
                      <ChartContainer config={chartConfig} className="h-[250px] w-full">
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
                            ticks={[midTick, chartYMax]}
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
                          {allDomains.map((domain, index) => (
                            <Line
                              key={domain}
                              type="natural"
                              dataKey={domain}
                              stroke={sourceColors[index % sourceColors.length]}
                              strokeWidth={2.5}
                              dot={false}
                            />
                          ))}
                        </LineChart>
                      </ChartContainer>
                      {/* Legend at bottom */}
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
                        {allDomains.map((domain, index) => (
                          <div key={domain} className="flex items-center gap-1.5 text-xs">
                            <div
                              className="w-2.5 h-2.5 rounded-sm"
                              style={{ backgroundColor: sourceColors[index % sourceColors.length] }}
                            />
                            <span className="text-muted-foreground">{domain}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex items-center justify-center h-[280px]">
                  <span className="text-muted-foreground text-sm">No source data available</span>
                </div>
              )}
                </CardContent>
              </Card>
            </div>

            {/* Source Types Breakdown */}
            <div className="flex-[1_1_50%] min-w-0">
              {/* Title visible only on small screens */}
              <div className="flex items-center gap-2 mb-2 lg:hidden">
                <span className="text-sm">Sources by Type</span>
                <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
                <span className="text-sm text-gray-400 hidden sm:inline truncate">Breakdown by source category</span>
              </div>
              <Card className="h-full">
                <CardContent className="pt-3">
              {typeBreakdown.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <ChartContainer config={typeChartConfig} className="mx-auto aspect-square h-[200px]">
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
                                  {String(value)} ({totalSources > 0 ? ((Number(value) / totalSources) * 100).toFixed(1) : 0}%)
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={pieChartData}
                        dataKey="count"
                        nameKey="type"
                        innerRadius={45}
                        outerRadius={75}
                        strokeWidth={5}
                        // @ts-expect-error - recharts types don't include activeIndex but it works
                        activeIndex={activeTypeIndex}
                        activeShape={({
                          outerRadius = 0,
                          ...props
                        }: PieSectorDataItem) => (
                          <Sector
                            {...props}
                            outerRadius={outerRadius + 8}
                          />
                        )}
                        onMouseEnter={(_, index) => setActiveTypeIndex(index)}
                      >
                        {pieChartData.map((entry, index) => (
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
                                    {totalSources.toLocaleString()}
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

                  {/* Type Legend with hover details */}
                  <div className="max-h-[150px] overflow-y-auto">
                    {typeBreakdown.map((item) => (
                      <Tooltip key={item.type}>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex items-center gap-2 py-1 px-2 cursor-pointer rounded transition-colors ${hoveredType === item.type ? 'bg-muted' : ''}`}
                            onMouseEnter={() => setHoveredType(item.type)}
                            onMouseLeave={() => setHoveredType(null)}
                          >
                            <div
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: typeColors[item.type] || '#9ca3af' }}
                            />
                            <span className="text-sm flex-1">{item.type}</span>
                            <span className="text-sm text-muted-foreground">{item.count}</span>
                            <Badge variant="secondary" className="text-xs">{item.percentage}%</Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          <p className="text-sm">{item.type}</p>
                          <p className="text-xs text-muted-foreground mb-1">Top sources:</p>
                          {item.topSources.map((source, idx) => (
                            <p key={idx} className="text-xs">{source.domain} ({source.usagePercentage}%)</p>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px]">
                  <span className="text-muted-foreground text-sm">No source data available</span>
                </div>
              )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Source Statistics Table */}
        <div>
          {/* Header row */}
          <div className="flex justify-between items-center mb-2 h-5">
            <div className="flex items-center gap-2">
              <span className="text-sm">All Sources</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400">
                {showContentGapsOnly
                  ? 'Sources citing competitors but not your brand'
                  : 'Complete source statistics and metrics'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {showContentGapsOnly && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sort by</span>
                  <Select
                    value={gapSortBy}
                    onValueChange={(value: 'usage' | 'priority') => setGapSortBy(value)}
                  >
                    <SelectTrigger className="w-[120px] h-6 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">Priority Score</SelectItem>
                        <SelectItem value="usage">Usage %</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`text-sm ${showContentGapsOnly ? '' : 'text-muted-foreground'}`}>
                  Content gaps only
                </span>
                <Switch
                  checked={showContentGapsOnly}
                  onCheckedChange={setShowContentGapsOnly}
                  className="scale-75"
                />
              </div>
            </div>
          </div>
          <Card>
            <CardContent className="pt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>
                    <div
                      className="flex items-center gap-1 cursor-pointer select-none"
                      onClick={toggleUsageSort}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">Usage</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {showContentGapsOnly
                            ? "Percentage of competitor-only responses that cited this source"
                            : "How often this domain is cited per response"}
                        </TooltipContent>
                      </Tooltip>
                      <div className="flex flex-col ml-0.5">
                        <ChevronUp className={`h-2.5 w-2.5 -mb-0.5 ${usageSortOrder === 'asc' ? 'opacity-100' : 'opacity-30'}`} />
                        <ChevronDown className={`h-2.5 w-2.5 -mt-0.5 ${usageSortOrder === 'desc' ? 'opacity-100' : 'opacity-30'}`} />
                      </div>
                    </div>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">Avg Citations</span>
                      </TooltipTrigger>
                      <TooltipContent>Average number of times this domain is cited when it appears in a response</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">Type</span>
                      </TooltipTrigger>
                      <TooltipContent>Category of the source based on the domain's content and purpose</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  {showContentGapsOnly ? (
                    <>
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Competitor</span>
                          </TooltipTrigger>
                          <TooltipContent>Number of times competitors were cited from this source</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Priority</span>
                          </TooltipTrigger>
                          <TooltipContent>Priority score based on usage, competitor presence, and strategic impact</TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">You</span>
                          </TooltipTrigger>
                          <TooltipContent>Whether your brand appears in LLM responses citing this source</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Competitors</span>
                          </TooltipTrigger>
                          <TooltipContent>Whether competitors appear in LLM responses citing this source</TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSourceStats.map((source, index) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + index;
                  return (
                    <TableRow
                      key={globalIndex}
                      className={`cursor-pointer transition-colors ${hoveredDomain === source.domain ? 'bg-muted/50' : ''}`}
                      onMouseEnter={() => setHoveredDomain(source.domain)}
                      onMouseLeave={() => setHoveredDomain(null)}
                    >
                      <TableCell>
                        <span
                          className="text-sm text-primary cursor-pointer hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToSource(source.domain);
                          }}
                        >
                          {source.domain}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {showContentGapsOnly ? (
                            <>
                              <Badge variant={getUsageVariant(source.gapUsagePercentage)}>
                                {source.gapUsagePercentage}%
                              </Badge>
                              <span className="text-xs text-muted-foreground">({source.competitorOnlyAppearances})</span>
                            </>
                          ) : (
                            <>
                              <Badge variant={getUsageVariant(source.usagePercentage)}>
                                {source.usagePercentage}%
                              </Badge>
                              <span className="text-xs text-muted-foreground">({source.totalAppearances})</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {showContentGapsOnly
                            ? source.gapAverageCitationsPerPrompt.toFixed(1)
                            : source.averageCitationsPerPrompt.toFixed(1)
                          }
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                          style={{
                            backgroundColor: (typeColors[source.type] || typeColors['Other']).replace(')', ', 0.12)').replace('hsl(', 'hsla('),
                            color: typeColors[source.type] || typeColors['Other']
                          }}
                        >
                          {source.type}
                        </span>
                      </TableCell>
                      {showContentGapsOnly ? (
                        <>
                          <TableCell>
                            <Badge variant="destructive">{source.competitorAppearances}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{source.priorityScore}</span>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            {source.yourBrandPresent ? (
                              <Badge variant="default">Yes ({source.yourBrandAppearances})</Badge>
                            ) : (
                              <Badge variant="destructive">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {source.competitorPresent ? (
                              <Badge variant="outline">Yes ({source.competitorAppearances})</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {filteredSourceStats.length === 0 && (
              <div className="flex items-center justify-center h-[200px]">
                <span className="text-muted-foreground text-sm">
                  {showContentGapsOnly ? 'No content gap opportunities found' : 'No source data available'}
                </span>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredSourceStats.length)} of {filteredSourceStats.length} sources
                </span>
                <div className="flex gap-2 items-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm min-w-[80px] text-center">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
