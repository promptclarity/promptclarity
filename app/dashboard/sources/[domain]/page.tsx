'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/app/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { ArrowLeft, ExternalLink, Loader2, MessageSquare } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import { Bar, BarChart, Line, LineChart, Pie, PieChart, Label, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/app/components/ui/chart';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { formatLocalDate, formatLocalDateTime } from '@/app/lib/dateUtils';
import { PlatformIcon } from '@/app/components/ui/platform-icon';

interface SourceUrlData {
  url: string;
  count: number;
  responseCount: number;
  type: string;
  pageType?: string;
  brandMentioned: number;
  lastUpdated: string;
}

interface SourceDailyData {
  date: string;
  count: number;
}

interface PageTypeBreakdown {
  'Comparison': number;
  'Product Page': number;
  'Article': number;
  'Category Page': number;
  'Alternative': number;
  'Other': number;
}

interface CompetitorMention {
  name: string;
  count: number;
}

interface SourceDetailData {
  domain: string;
  type: string;
  totalMentions: number;
  totalExecutions: number;
  brandMentioned: number;
  competitorsMentioned: CompetitorMention[];
  lastUpdated: string | null;
  avgCitationsPerPrompt: number;
  usagePercentage: number;
  urls: SourceUrlData[];
  dailyUsage: SourceDailyData[];
  pageTypeBreakdown?: PageTypeBreakdown;
}

interface UrlExecution {
  id: number;
  promptId: number;
  platformId: number;
  platformName: string;
  promptText: string;
  result: string;
  brandMentioned: boolean;
  completedAt: string;
}

export default function SourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { business } = useBusiness();
  const { selectedPlatforms, platforms, refreshKey, dateRange, getDateRangeParams } = useDashboardFilters();

  const domain = decodeURIComponent(params.domain as string);

  const [isLoading, setIsLoading] = useState(true);
  const [sourceData, setSourceData] = useState<SourceDetailData | null>(null);

  // Dialog state for showing executions
  const [showExecutionsDialog, setShowExecutionsDialog] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [urlExecutions, setUrlExecutions] = useState<UrlExecution[]>([]);
  const [loadingExecutions, setLoadingExecutions] = useState(false);

  // Dialog state for showing all competitors
  const [showCompetitorsDialog, setShowCompetitorsDialog] = useState(false);

  const fetchSourceData = async () => {
    if (!business?.id || !domain) return;

    setIsLoading(true);

    try {
      const { startDate, endDate } = getDateRangeParams();
      const url = new URL(`/api/dashboard/sources/${encodeURIComponent(domain)}`, window.location.origin);
      url.searchParams.append('businessId', String(business.id));
      if (startDate) url.searchParams.append('startDate', startDate);
      if (endDate) url.searchParams.append('endDate', endDate);

      // Add platform filter if specified and not all platforms selected
      if (selectedPlatforms.size > 0 && platforms.length > 0 && selectedPlatforms.size < platforms.length) {
        url.searchParams.append('platformIds', Array.from(selectedPlatforms).join(','));
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setSourceData(data);
      }
    } catch (error) {
      console.error('Error fetching source detail:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (business?.id && domain) {
      fetchSourceData();
    }
  }, [business?.id, domain, dateRange, refreshKey]);

  const fetchUrlExecutions = async (url: string) => {
    if (!business?.id) return;

    setLoadingExecutions(true);
    setSelectedUrl(url);
    setShowExecutionsDialog(true);

    try {
      const { startDate, endDate } = getDateRangeParams();
      const apiUrl = new URL('/api/dashboard/sources/executions', window.location.origin);
      apiUrl.searchParams.append('businessId', String(business.id));
      apiUrl.searchParams.append('url', url);
      if (startDate) apiUrl.searchParams.append('startDate', startDate);
      if (endDate) apiUrl.searchParams.append('endDate', endDate);

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        setUrlExecutions(data.executions || []);
      }
    } catch (error) {
      console.error('Error fetching URL executions:', error);
    } finally {
      setLoadingExecutions(false);
    }
  };

  const fetchDomainExecutions = async () => {
    if (!business?.id || !domain) return;

    setLoadingExecutions(true);
    setSelectedUrl(null); // null means we're showing domain executions
    setShowExecutionsDialog(true);

    try {
      const { startDate, endDate } = getDateRangeParams();
      const apiUrl = new URL('/api/dashboard/sources/executions', window.location.origin);
      apiUrl.searchParams.append('businessId', String(business.id));
      apiUrl.searchParams.append('domain', domain);
      if (startDate) apiUrl.searchParams.append('startDate', startDate);
      if (endDate) apiUrl.searchParams.append('endDate', endDate);

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        setUrlExecutions(data.executions || []);
      }
    } catch (error) {
      console.error('Error fetching domain executions:', error);
    } finally {
      setLoadingExecutions(false);
    }
  };

  const getSourceTypeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (type) {
      case 'You': return 'default';
      case 'Competitor': return 'destructive';
      default: return 'secondary';
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading source data...</p>
        </div>
      </div>
    );
  }

  if (!sourceData) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50">
          <ArrowLeft className="h-4 w-4" />
          Back to Sources
        </Button>
        <Card>
          <CardContent className="flex items-center justify-center h-[200px]">
            <span className="text-muted-foreground text-sm">No data available for this source</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dailyChartData = sourceData.dailyUsage.map(d => ({
    date: formatLocalDate(d.date, { month: 'short', day: 'numeric' }),
    citations: d.count
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        {/* Headers row - visible on lg screens */}
        <div className="hidden lg:flex gap-4 mb-2">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 -ml-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{domain}</span>
            {sourceData.type && (
              <Badge variant={getSourceTypeVariant(sourceData.type)} className="text-xs">
                {sourceData.type}
              </Badge>
            )}
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-muted-foreground">Source analysis and citation tracking</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Visit Site
            </a>
          </Button>
        </div>
        {/* Mobile header */}
        <div className="flex lg:hidden flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 -ml-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{domain}</span>
            {sourceData.type && (
              <Badge variant={getSourceTypeVariant(sourceData.type)} className="text-xs">
                {sourceData.type}
              </Badge>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Source analysis and citation tracking</span>
            <Button variant="outline" size="sm" asChild>
              <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Visit Site
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        {/* Total Citations */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="cursor-help">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm text-muted-foreground">Total Citations</p>
                <p className="text-[1.75rem] font-semibold tabular-nums mt-2">{sourceData.totalMentions}</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Total times this domain was referenced across all AI responses</p>
          </TooltipContent>
        </Tooltip>

        {/* Responses Citing */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="cursor-help">
              <CardContent className="pt-5 pb-5 relative">
                <p className="text-sm text-muted-foreground">Responses Citing</p>
                <p className="text-[1.75rem] font-semibold tabular-nums mt-2">{sourceData.totalExecutions}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={fetchDomainExecutions}
                      className="absolute bottom-3 right-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>All</span>
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Click to view all responses citing this domain</p>
                  </TooltipContent>
                </Tooltip>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Unique AI responses that cite this domain. Last cited: {sourceData.lastUpdated ? formatLocalDate(sourceData.lastUpdated) : 'N/A'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Usage % */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="cursor-help">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm text-muted-foreground">Usage Rate</p>
                <p className="text-[1.75rem] font-semibold tabular-nums mt-2">{sourceData.usagePercentage}%</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Percentage of all AI responses that cite this domain</p>
          </TooltipContent>
        </Tooltip>

        {/* Avg per Response */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="cursor-help">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm text-muted-foreground">Avg Citations</p>
                <p className="text-[1.75rem] font-semibold tabular-nums mt-2">{sourceData.avgCitationsPerPrompt}</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Average number of citations per response when this domain is cited</p>
          </TooltipContent>
        </Tooltip>

        {/* Brand Mentioned */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="cursor-help">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm text-muted-foreground">Brand Mentioned</p>
                <p className={`text-[1.75rem] font-semibold tabular-nums mt-2 ${sourceData.brandMentioned > 0 ? 'text-green-600' : ''}`}>
                  {sourceData.brandMentioned}
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Times your brand was mentioned in responses citing this domain</p>
          </TooltipContent>
        </Tooltip>

        {/* Brands Referenced */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="cursor-help">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm text-muted-foreground">Brands Referenced</p>
                {sourceData.competitorsMentioned && sourceData.competitorsMentioned.length > 0 ? (
                  <div className="flex flex-col gap-1 mt-2">
                    {sourceData.competitorsMentioned.slice(0, 2).map((comp) => (
                      <div key={comp.name} className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{comp.name}</span>
                        <span className="text-muted-foreground ml-1">({comp.count})</span>
                      </div>
                    ))}
                    {sourceData.competitorsMentioned.length > 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCompetitorsDialog(true);
                        }}
                        className="text-xs text-primary hover:underline text-left"
                      >
                        +{sourceData.competitorsMentioned.length - 2} more
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-[1.75rem] font-semibold tabular-nums mt-2 text-muted-foreground">0</p>
                )}
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Brands mentioned alongside citations from this domain</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Charts Row */}
      <div className="mb-4">
        {/* Headers row - visible on lg screens */}
        <div className="hidden lg:flex gap-4 mb-2">
          <div className="flex-[1_1_33%] min-w-0 flex items-center gap-2">
            <span className="text-sm">Page Type Breakdown</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-muted-foreground truncate">Distribution of cited page types</span>
          </div>
          <div className="flex-[1_1_33%] min-w-0 flex items-center gap-2">
            <span className="text-sm">Citations Over Time</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-muted-foreground truncate">Daily citation count</span>
          </div>
          <div className="flex-[1_1_33%] min-w-0 flex items-center gap-2">
            <span className="text-sm">Top URLs</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-muted-foreground truncate">Most frequently cited pages</span>
          </div>
        </div>
        {/* Cards row */}
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Page Type Breakdown - Pie Chart */}
          <div className="flex-[1_1_33%] min-w-0">
            {/* Title visible only on small screens */}
            <div className="flex items-center gap-2 mb-2 lg:hidden">
              <span className="text-sm">Page Type Breakdown</span>
            </div>
            {sourceData.pageTypeBreakdown && (() => {
              const pieData = Object.entries(sourceData.pageTypeBreakdown)
                .filter(([_, value]) => value > 0)
                .map(([name, value]) => ({ name, value, fill: `var(--color-${name.replace(/\s+/g, '-').toLowerCase()})` }));

              const totalUrls = pieData.reduce((acc, curr) => acc + curr.value, 0);

              const chartConfig: ChartConfig = {
                value: { label: 'URLs' },
                'comparison': { label: 'Comparison', color: 'hsl(221, 83%, 53%)' },
                'product-page': { label: 'Product Page', color: 'hsl(142, 71%, 45%)' },
                'article': { label: 'Article', color: 'hsl(38, 92%, 50%)' },
                'category-page': { label: 'Category Page', color: 'hsl(0, 84%, 60%)' },
                'alternative': { label: 'Alternative', color: 'hsl(262, 83%, 58%)' },
                'other': { label: 'Other', color: 'hsl(220, 9%, 46%)' },
              };

              return (
                <Card className="h-full">
                  <CardContent className="pt-3">
                    {pieData.length > 0 ? (
                      <ChartContainer
                        config={chartConfig}
                        className="mx-auto aspect-square max-h-[200px]"
                      >
                        <PieChart>
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent hideLabel />}
                          />
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={45}
                            outerRadius={75}
                            strokeWidth={5}
                          >
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
                                        className="fill-foreground text-2xl font-semibold"
                                      >
                                        {totalUrls}
                                      </tspan>
                                      <tspan
                                        x={viewBox.cx}
                                        y={(viewBox.cy || 0) + 20}
                                        className="fill-muted-foreground text-xs"
                                      >
                                        URLs
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
                        <span className="text-muted-foreground text-sm">No page type data available</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* Daily Usage Chart */}
          <div className="flex-[1_1_33%] min-w-0">
            {/* Title visible only on small screens */}
            <div className="flex items-center gap-2 mb-2 lg:hidden">
              <span className="text-sm">Citations Over Time</span>
            </div>
            {(() => {
              const lineChartConfig: ChartConfig = {
                citations: { label: 'Citations', color: 'hsl(221, 83%, 53%)' },
              };

              return (
                <Card className="h-full">
                  <CardContent className="pt-3">
                    {dailyChartData.length > 0 ? (
                      (() => {
                        const maxVal = Math.max(...dailyChartData.map(d => d.citations));
                        const chartYMax = Math.ceil(maxVal * 1.1);
                        // Build ticks: 25, 50, and highest (only include if they make sense)
                        const ticks: number[] = [];
                        if (chartYMax > 25) ticks.push(25);
                        if (chartYMax > 50) ticks.push(50);
                        ticks.push(chartYMax);
                        return (
                          <ChartContainer config={lineChartConfig} className="h-[200px] w-full">
                            <LineChart accessibilityLayer data={dailyChartData} margin={{ left: 0, right: 20, top: 20, bottom: 5 }}>
                              <CartesianGrid vertical={false} />
                              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                              <YAxis
                                domain={[0, chartYMax]}
                                ticks={ticks}
                                tickLine={false}
                                axisLine={false}
                                width={35}
                                tick={{ fontSize: 12 }}
                              />
                              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                              <Line
                                type="natural"
                                dataKey="citations"
                                stroke="var(--color-citations)"
                                strokeWidth={2.5}
                                dot={false}
                              />
                            </LineChart>
                          </ChartContainer>
                        );
                      })()
                    ) : (
                      <div className="flex items-center justify-center h-[200px]">
                        <span className="text-muted-foreground text-sm">No daily data available</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* Top URLs Chart */}
          <div className="flex-[1_1_33%] min-w-0">
            {/* Title visible only on small screens */}
            <div className="flex items-center gap-2 mb-2 lg:hidden">
              <span className="text-sm">Top URLs</span>
            </div>
            {(() => {
              const barChartConfig: ChartConfig = {
                count: { label: 'Citations', color: 'hsl(221, 83%, 53%)' },
              };

              const barData = sourceData.urls.slice(0, 4).map(u => ({
                url: u.url.replace(/^https?:\/\/[^/]+/, '').substring(0, 20) + (u.url.length > 30 ? '...' : ''),
                count: u.count,
                fullUrl: u.url
              }));

              return (
                <Card className="h-full">
                  <CardContent className="pt-3">
                    {sourceData.urls.length > 0 ? (
                      <ChartContainer config={barChartConfig} className="h-[200px] w-full">
                        <BarChart
                          data={barData}
                          layout="vertical"
                          margin={{ top: 5, right: 12, left: 12, bottom: 5 }}
                        >
                          <CartesianGrid horizontal={false} />
                          <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
                          <YAxis
                            type="category"
                            dataKey="url"
                            width={100}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fontSize: 10 }}
                          />
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent />}
                          />
                          <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[200px]">
                        <span className="text-muted-foreground text-sm">No URL data available</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>
      </div>

      {/* All URLs List */}
      <div>
        {/* Header row */}
        <div className="flex justify-between items-center mb-2 h-5">
          <div className="flex items-center gap-2">
            <span className="text-sm">All Cited URLs</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-muted-foreground">{sourceData.urls.length} unique pages cited from this domain</span>
          </div>
        </div>
        <Card>
          <CardContent className="pt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">URL</TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">Citations</span>
                      </TooltipTrigger>
                      <TooltipContent>Total number of times this URL was cited</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">Avg</span>
                      </TooltipTrigger>
                      <TooltipContent>Average citations per AI response</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">Brand</span>
                      </TooltipTrigger>
                      <TooltipContent>Times your brand was mentioned when this URL was cited</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceData.urls.map((urlData, idx) => {
                  const avgCitations = urlData.responseCount > 0
                    ? Math.round((urlData.count / urlData.responseCount) * 10) / 10
                    : urlData.count;

                  return (
                    <TableRow
                      key={idx}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => fetchUrlExecutions(urlData.url)}
                    >
                      <TableCell>
                        <span className="text-sm text-primary hover:underline truncate max-w-[400px] block" title={urlData.url}>
                          {urlData.url.replace(/^https?:\/\//, '')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {urlData.count}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {avgCitations}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={urlData.brandMentioned > 0 ? 'default' : 'secondary'}>
                          {urlData.brandMentioned}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {urlData.pageType && (
                          <Badge variant="outline" className="text-xs">
                            {urlData.pageType}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {urlData.lastUpdated ? formatLocalDate(urlData.lastUpdated) : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(urlData.url, '_blank');
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {sourceData.urls.length === 0 && (
              <div className="flex items-center justify-center h-[200px]">
                <span className="text-muted-foreground text-sm">No URL data available</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* URL/Domain Executions Dialog */}
      <Dialog open={showExecutionsDialog} onOpenChange={setShowExecutionsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              {selectedUrl ? 'Responses Citing This URL' : `Responses Citing ${domain}`}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground break-all">
              {selectedUrl || `${urlExecutions.length} response${urlExecutions.length !== 1 ? 's' : ''} cite this domain`}
            </DialogDescription>
          </DialogHeader>

          {loadingExecutions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading responses...</span>
            </div>
          ) : urlExecutions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-muted-foreground">
                {selectedUrl ? 'No responses found for this URL' : 'No responses found for this domain'}
              </span>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="flex flex-col gap-3 pr-4">
                {urlExecutions.map((exec) => (
                  <div
                    key={exec.id}
                    className="cursor-pointer p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setShowExecutionsDialog(false);
                      router.push(`/dashboard/prompts/${exec.promptId}?executionId=${exec.id}`);
                    }}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PlatformIcon platformId={exec.platformName} size="sm" />
                        <span className="text-xs text-muted-foreground">
                          {formatLocalDateTime(exec.completedAt)}
                        </span>
                        {exec.brandMentioned && (
                          <Badge variant="default" className="text-xs">
                            Brand Mentioned
                          </Badge>
                        )}
                      </div>

                      {exec.promptText && (
                        <span className="text-sm font-medium">
                          {exec.promptText}
                        </span>
                      )}

                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {exec.result}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowExecutionsDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Brands Referenced Dialog */}
      <Dialog open={showCompetitorsDialog} onOpenChange={setShowCompetitorsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              Brands Referenced with {domain}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {sourceData?.competitorsMentioned?.length || 0} brands mentioned alongside citations from this domain
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px]">
            <div className="flex flex-col gap-2 pr-4">
              {sourceData?.competitorsMentioned?.map((comp) => (
                <div
                  key={comp.name}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-background"
                >
                  <span className="font-medium">{comp.name}</span>
                  <Badge variant="secondary">{comp.count} mentions</Badge>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowCompetitorsDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
