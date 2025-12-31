'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import { Switch } from '@/app/components/ui/switch';
import {
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Pie, PieChart, Label, Sector, Cell } from 'recharts';
import { PieSectorDataItem } from 'recharts/types/polar/Pie';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/app/components/ui/chart';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { formatLocalDate } from '@/app/lib/dateUtils';

interface DailyUrlUsage {
  date: string;
  urls: Record<string, number>;
}

interface UrlStat {
  url: string;
  domain: string;
  type: string;
  pageType: string;
  usagePercentage: number;
  totalAppearances: number;
  averageCitationsPerPrompt: number;
  yourBrandPresent: boolean;
  yourBrandAppearances: number;
  competitorPresent: boolean;
  competitorAppearances: number;
}

export default function SourcesUrlsPage() {
  const router = useRouter();
  const { business, switchCount } = useBusiness();
  const { selectedPlatforms, platforms, refreshKey, dateRange, getDateRangeParams } = useDashboardFilters();
  const [isLoading, setIsLoading] = useState(true);

  const [dailyUrlUsage, setDailyUrlUsage] = useState<DailyUrlUsage[]>([]);
  const [urlStats, setUrlStats] = useState<UrlStat[]>([]);
  const [topUrls, setTopUrls] = useState<string[]>([]);
  const [dateRangeInfo, setDateRangeInfo] = useState<any>(null);
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const [usageSortOrder, setUsageSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [activePageTypeIndex, setActivePageTypeIndex] = useState(0);
  const [showContentGapsOnly, setShowContentGapsOnly] = useState(false);

  const fetchUrlsData = async (businessIdOverride?: number) => {
    try {
      setIsLoading(true);

      const businessId = businessIdOverride || business?.id;
      if (!businessId) return;

      const { startDate, endDate } = getDateRangeParams();

      const url = new URL(`/api/dashboard/sources/urls`, window.location.origin);
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
        setDailyUrlUsage(data.dailyUrlUsage || []);
        setUrlStats(data.urlStats || []);
        setTopUrls(data.topUrls || []);
        setDateRangeInfo(data.dateRangeInfo);
      }
    } catch (error) {
      console.error('Error fetching URLs data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data when business changes, switchCount increments, platform filter changes, or date range changes
  useEffect(() => {
    if (business?.id) {
      // Clear all data immediately when fetching for new business
      setDailyUrlUsage([]);
      setUrlStats([]);
      setTopUrls([]);
      setDateRangeInfo(null);
      setIsLoading(true);

      fetchUrlsData(business.id);
    } else {
      setIsLoading(false);
    }
  }, [business?.id, switchCount, refreshKey, dateRange]);

  // Format data for line chart
  const chartData = dailyUrlUsage.map(day => {
    const data: any = {
      date: formatLocalDate(day.date, { month: 'short', day: 'numeric' }),
    };

    // Add URL data
    Object.entries(day.urls).forEach(([url, percentage]) => {
      data[url] = percentage;
    });

    return data;
  });

  // Colors for each source (using HSL like overview page)
  const urlColors = [
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

  // Build chart config dynamically based on URLs
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    topUrls.forEach((url, index) => {
      // Truncate URL for label
      const label = url.length > 40 ? url.substring(0, 40) + '...' : url;
      config[url] = {
        label: label,
        color: urlColors[index % urlColors.length],
      };
    });
    return config;
  }, [topUrls]);

  // Page type distribution for pie chart (by total appearances, not unique URLs)
  const pageTypeDistribution = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    urlStats.forEach(url => {
      const type = url.pageType || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + url.totalAppearances;
    });
    return Object.entries(typeCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [urlStats]);

  // Colors for page types (matching pie chart)
  const pageTypeColors: Record<string, string> = {
    'Article': 'hsl(217, 91%, 60%)',        // blue
    'Alternative': 'hsl(258, 90%, 66%)',    // purple
    'Comparison': 'hsl(38, 92%, 50%)',      // amber
    'How-To Guide': 'hsl(187, 92%, 41%)',   // cyan
    'Listicle': 'hsl(230, 94%, 63%)',       // indigo
    'Product Page': 'hsl(160, 84%, 39%)',   // green
    'Discussion': 'hsl(24, 95%, 53%)',      // orange
    'Homepage': 'hsl(220, 9%, 46%)',        // gray
    'Profile': 'hsl(330, 81%, 60%)',        // pink
    'Unknown': 'hsl(220, 9%, 60%)',         // gray
    'Other': 'hsl(0, 84%, 60%)',            // red
  };

  // Pie chart config with consistent colors (matching overview page)
  const pieChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {
      value: { label: 'URLs' },
      'Article': { label: 'Article', color: pageTypeColors['Article'] },
      'Alternative': { label: 'Alternative', color: pageTypeColors['Alternative'] },
      'Comparison': { label: 'Comparison', color: pageTypeColors['Comparison'] },
      'How-To Guide': { label: 'How-To Guide', color: pageTypeColors['How-To Guide'] },
      'Listicle': { label: 'Listicle', color: pageTypeColors['Listicle'] },
      'Product Page': { label: 'Product Page', color: pageTypeColors['Product Page'] },
      'Discussion': { label: 'Discussion', color: pageTypeColors['Discussion'] },
      'Homepage': { label: 'Homepage', color: pageTypeColors['Homepage'] },
      'Profile': { label: 'Profile', color: pageTypeColors['Profile'] },
      'Unknown': { label: 'Unknown', color: pageTypeColors['Unknown'] },
      'Other': { label: 'Other', color: pageTypeColors['Other'] },
    };
    return config;
  }, []);

  // Transform data for pie chart with fill colors
  const pieChartData = useMemo(() => {
    return pageTypeDistribution.map(({ name, value }) => ({
      type: name,
      value,
      fill: pieChartConfig[name]?.color || 'hsl(0, 0%, 60%)',
    }));
  }, [pageTypeDistribution, pieChartConfig]);

  // Calculate total URLs for center label
  const totalUrls = useMemo(() => {
    return pageTypeDistribution.reduce((acc, curr) => acc + curr.value, 0);
  }, [pageTypeDistribution]);

  // Filter and sort URLs
  const sortedUrlStats = useMemo(() => {
    let filtered = urlStats;

    // Filter to content gaps only if enabled (competitor present but not your brand)
    if (showContentGapsOnly) {
      filtered = urlStats.filter(url => url.competitorPresent && !url.yourBrandPresent);
    }

    return [...filtered].sort((a, b) => {
      return usageSortOrder === 'desc'
        ? b.usagePercentage - a.usagePercentage
        : a.usagePercentage - b.usagePercentage;
    });
  }, [urlStats, usageSortOrder, showContentGapsOnly]);

  // Pagination
  const totalPages = Math.ceil(sortedUrlStats.length / itemsPerPage);
  const paginatedUrlStats = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedUrlStats.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedUrlStats, currentPage, itemsPerPage]);

  // Reset to page 1 when sort or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [usageSortOrder, showContentGapsOnly]);

  const toggleUsageSort = () => {
    setUsageSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  // Truncate URL for display
  const truncateUrl = (url: string, maxLength: number = 60) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading URL data...</span>
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
            <span className="text-sm">URL Usage Over Time</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-gray-400 truncate">Percentage of responses citing each URL (top 5)</span>
          </div>
          <div className="flex-[1_1_50%] min-w-0 flex items-center gap-2">
            <span className="text-sm">URLs by Page Type</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-gray-400 truncate">Distribution of page categories</span>
          </div>
        </div>
        {/* Cards row */}
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* URL Usage Over Time Chart */}
          <div className="flex-[1_1_50%] min-w-0">
            {/* Title visible only on small screens */}
            <div className="flex items-center gap-2 mb-2 lg:hidden">
              <span className="text-sm">URL Usage Over Time</span>
              <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
              <span className="text-sm text-gray-400 hidden sm:inline truncate">Percentage of responses citing each URL (top 5)</span>
            </div>
            <Card className="h-full">
              <CardContent className="pt-3">
              {chartData.length > 0 && topUrls.length > 0 ? (
                (() => {
                  // Calculate max Y value from all visible URLs
                  let maxVal = 0;
                  chartData.forEach(day => {
                    topUrls.slice(0, 5).forEach(url => {
                      const val = day[url] as number;
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
                          {topUrls.slice(0, 5).map((url, index) => (
                            <Line
                              key={url}
                              type="natural"
                              dataKey={url}
                              stroke={urlColors[index % urlColors.length]}
                              strokeWidth={2}
                              dot={false}
                            />
                          ))}
                        </LineChart>
                      </ChartContainer>
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
                        {topUrls.slice(0, 5).map((url, index) => {
                          // Extract domain from URL for compact display
                          const domain = new URL(url).hostname.replace('www.', '');
                          return (
                            <div key={url} className="flex items-center gap-1.5 text-xs">
                              <div
                                className="w-2 h-2 rounded-sm shrink-0"
                                style={{ backgroundColor: urlColors[index % urlColors.length] }}
                              />
                              <span className="text-muted-foreground">{domain}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex items-center justify-center h-[280px]">
                  <span className="text-gray-400 text-sm">No URL data available</span>
                </div>
              )}
              </CardContent>
            </Card>
          </div>

          {/* URLs by Page Type Pie Chart */}
          <div className="flex-[1_1_50%] min-w-0">
            {/* Title visible only on small screens */}
            <div className="flex items-center gap-2 mb-2 lg:hidden">
              <span className="text-sm">URLs by Page Type</span>
              <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
              <span className="text-sm text-gray-400 hidden sm:inline truncate">Distribution of page categories</span>
            </div>
            <Card className="h-full">
              <CardContent className="pt-3">
              {pageTypeDistribution.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <ChartContainer config={pieChartConfig} className="mx-auto aspect-square h-[200px]">
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
                                  {String(value)} ({totalUrls > 0 ? ((Number(value) / totalUrls) * 100).toFixed(1) : 0}%)
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="type"
                        innerRadius={45}
                        outerRadius={75}
                        strokeWidth={5}
                        // @ts-expect-error - recharts types don't include activeIndex but it works
                        activeIndex={activePageTypeIndex}
                        activeShape={({
                          outerRadius = 0,
                          ...props
                        }: PieSectorDataItem) => (
                          <Sector
                            {...props}
                            outerRadius={outerRadius + 8}
                          />
                        )}
                        onMouseEnter={(_, index) => setActivePageTypeIndex(index)}
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
                                    {totalUrls.toLocaleString()}
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

                  {/* Legend */}
                  <div className="max-h-[150px] overflow-y-auto">
                    {pageTypeDistribution.map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center gap-2 py-1 px-2 rounded transition-colors hover:bg-muted"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{
                            backgroundColor: pieChartConfig[entry.name]?.color || 'hsl(0, 0%, 60%)',
                          }}
                        />
                        <span className="text-sm flex-1">{entry.name}</span>
                        <span className="text-sm text-muted-foreground">{entry.value}</span>
                        <Badge variant="secondary" className="text-xs">
                          {totalUrls > 0 ? Math.round((entry.value / totalUrls) * 1000) / 10 : 0}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px]">
                  <span className="text-gray-400 text-sm">No URL data available</span>
                </div>
              )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* URL Statistics Table */}
      <div>
        {/* Header row */}
        <div className="flex justify-between items-center mb-2 h-5">
          <div className="flex items-center gap-2">
            <span className="text-sm">All URLs</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-muted-foreground">
              {showContentGapsOnly
                ? 'URLs citing competitors but not your brand'
                : 'Complete URL statistics and metrics'}
            </span>
          </div>
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
        <Card>
          <CardContent className="pt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">Page Type</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Classification of the page content (Article, Comparison, How-To Guide, Product Page, etc.)
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
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
                          How often this URL is cited per response
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
                      <TooltipContent>
                        Average number of times this URL is cited when it appears in a response
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">You</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Whether your brand appears in LLM responses citing this URL
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">Competitors</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Whether competitors appear in LLM responses citing this URL
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUrlStats.map((urlStat, index) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + index;
                  return (
                    <TableRow
                      key={globalIndex}
                      className={`cursor-pointer transition-colors ${hoveredUrl === urlStat.url ? 'bg-muted/50' : ''}`}
                      onMouseEnter={() => setHoveredUrl(urlStat.url)}
                      onMouseLeave={() => setHoveredUrl(null)}
                    >
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="text-sm text-primary cursor-pointer hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(urlStat.url, '_blank');
                              }}
                            >
                              {truncateUrl(urlStat.url)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{urlStat.url}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                          style={{
                            backgroundColor: (pageTypeColors[urlStat.pageType] || pageTypeColors['Other']).replace(')', ', 0.12)').replace('hsl(', 'hsla('),
                            color: pageTypeColors[urlStat.pageType] || pageTypeColors['Other']
                          }}
                        >
                          {urlStat.pageType}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {urlStat.usagePercentage}%
                          </Badge>
                          <span className="text-xs text-muted-foreground">({urlStat.totalAppearances})</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {urlStat.averageCitationsPerPrompt.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {urlStat.yourBrandPresent ? (
                          <Badge variant="default">Yes ({urlStat.yourBrandAppearances})</Badge>
                        ) : (
                          <Badge variant="destructive">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {urlStat.competitorPresent ? (
                          <Badge variant="outline">Yes ({urlStat.competitorAppearances})</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

          {sortedUrlStats.length === 0 && (
            <div className="flex items-center justify-center h-[200px]">
              <span className="text-gray-400 text-sm">No URL data available</span>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, sortedUrlStats.length)} of {sortedUrlStats.length} URLs
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
