'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent } from '@/app/components/ui/card';
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
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import { formatLocalDate } from '@/app/lib/dateUtils';

interface CompetitorData {
  id: number;
  name: string;
  visibility: number;
}

interface VisibilityHistoryEntry {
  date: string;
  visibility: number;
  competitors?: CompetitorData[];
}

interface CompetitorRanking {
  name: string;
  visibility: number;
  isBrand: boolean;
  sentimentScore?: number;
  averagePosition?: number;
}

interface VisibilityChartProps {
  data: VisibilityHistoryEntry[];
  businessName?: string;
  height?: number;
  responses?: any[]; // For calculating share of voice
  competitorRankings?: CompetitorRanking[]; // Pre-calculated cumulative rankings
}

export default function VisibilityChart({ data, businessName = "Your Brand", height = 180, responses = [], competitorRankings = [] }: VisibilityChartProps) {
  // Get unique competitor names from all data points
  const allCompetitors = useMemo(() => {
    const competitorSet = new Set<string>();
    data.forEach(entry => {
      if (entry.competitors) {
        entry.competitors.forEach(comp => competitorSet.add(comp.name));
      }
    });
    return Array.from(competitorSet);
  }, [data]);

  // Initialize with brand + top 2 competitors by default
  const [selectedCompetitors, setSelectedCompetitors] = useState<Set<string>>(() => {
    const defaultSelected = new Set<string>();
    // Add brand
    defaultSelected.add(businessName);
    // Add top 2 competitors
    if (data.length > 0) {
      const latestEntry = data[data.length - 1];
      if (latestEntry.competitors) {
        // Sort by visibility and take top 2
        const sortedCompetitors = [...latestEntry.competitors]
          .sort((a, b) => b.visibility - a.visibility)
          .slice(0, 2);
        sortedCompetitors.forEach(comp => defaultSelected.add(comp.name));
      }
    }
    return defaultSelected;
  });

  // Hovered brand for highlighting
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);

  // Toggle competitor selection
  const toggleCompetitor = (competitorName: string) => {
    setSelectedCompetitors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(competitorName)) {
        newSet.delete(competitorName);
      } else {
        newSet.add(competitorName);
      }
      return newSet;
    });
  };

  // Generate consistent color for a company name using HSL
  const getCompanyColor = (name: string, isBrand: boolean) => {
    if (isBrand) return 'hsl(var(--primary))';

    // More sophisticated hash for better distribution
    let hash = 0;
    let hash2 = 0;
    let hash3 = 0;

    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash2 = ((hash2 << 3) + hash2) + char * (i + 1);
      hash3 = ((hash3 << 7) - hash3) + char * char;
      hash = hash & hash;
      hash2 = hash2 & hash2;
      hash3 = hash3 & hash3;
    }

    // Use golden ratio for better hue distribution
    const goldenRatio = 0.618033988749895;
    const hueBase = Math.abs(hash) % 360;
    const hueShift = (Math.abs(hash2) % 100) * goldenRatio;
    const hue = (hueBase + hueShift * 360) % 360;

    // Vary saturation and lightness more dramatically for distinction
    const saturationBase = 65;
    const saturationVar = Math.abs(hash2 >> 8) % 35;
    const saturation = saturationBase + saturationVar; // 65-100%

    const lightnessOptions = [35, 45, 55, 65]; // More distinct lightness levels
    const lightnessIndex = Math.abs(hash3 >> 16) % lightnessOptions.length;
    const lightness = lightnessOptions[lightnessIndex];

    return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
  };

  // Format the data for recharts with competitor data
  const chartData = useMemo(() => {
    return data.map(entry => {
      const dataPoint: any = {
        date: formatLocalDate(entry.date, {
          month: 'short',
          day: 'numeric'
        }),
        fullDate: entry.date
      };

      // Add brand visibility if selected
      // Note: visibility values from API are already percentages (0-100)
      if (selectedCompetitors.has(businessName)) {
        dataPoint[businessName] = Math.round(entry.visibility);
      }

      // Add competitor visibilities
      if (entry.competitors) {
        entry.competitors.forEach(comp => {
          if (selectedCompetitors.has(comp.name)) {
            dataPoint[comp.name] = Math.round(comp.visibility);
          }
        });
      }

      return dataPoint;
    });
  }, [data, selectedCompetitors, businessName]);

  // Calculate max Y value for chart (10% higher than highest point)
  const { chartYMax, midTick } = useMemo(() => {
    if (chartData.length === 0) return { chartYMax: 100, midTick: 50 };
    let maxVal = 0;
    chartData.forEach(day => {
      selectedCompetitors.forEach(name => {
        const val = day[name] as number;
        if (val > maxVal) maxVal = val;
      });
    });
    // Add 10% headroom, cap at 100
    const yMax = Math.min(100, Math.ceil(maxVal * 1.1));
    // Find a relevant interval tick (10, 15, 20, 25, 30, 35, 40, etc.)
    const intervals = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90];
    const mid = intervals.find(i => i < yMax && i > yMax * 0.3) || Math.round(yMax / 2);
    return { chartYMax: yMax, midTick: mid };
  }, [chartData, selectedCompetitors]);

  // Calculate competitor metrics for the rankings table
  // Use pre-calculated cumulative rankings if available, otherwise fall back to latest data
  const competitorMetrics: any[] = useMemo(() => {
    const metrics: any[] = [];

    if (competitorRankings && competitorRankings.length > 0) {
      // Use pre-calculated cumulative rankings from API
      competitorRankings.forEach(ranking => {
        metrics.push({
          name: ranking.name,
          visibility: ranking.visibility,
          isBrand: ranking.isBrand,
          sentimentScore: ranking.sentimentScore ?? 50,
          averagePosition: ranking.averagePosition ?? 0,
          rank: 0
        });
      });
    } else {
      // Fallback to latest data point (for backwards compatibility)
      const latestData = data[data.length - 1];
      if (latestData) {
        metrics.push({
          name: businessName,
          visibility: Math.round(latestData.visibility),
          isBrand: true,
          sentimentScore: 50,
          averagePosition: 0,
          rank: 0
        });

        if (latestData.competitors) {
          latestData.competitors.forEach(comp => {
            metrics.push({
              name: comp.name,
              visibility: Math.round(comp.visibility),
              isBrand: false,
              sentimentScore: 50,
              averagePosition: 0,
              rank: 0
            });
          });
        }
      }
    }

    // Sort by visibility descending and add rank
    metrics.sort((a, b) => b.visibility - a.visibility);
    metrics.forEach((metric, index) => {
      metric.rank = index + 1;
    });

    return metrics;
  }, [competitorRankings, data, businessName]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length > 0) {
      return (
        <div className="bg-background border border-border rounded-md p-2 shadow-md">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground block mt-1">
            {payload[0].payload.fullDate}
          </span>
          <div className="flex flex-col gap-1 mt-2">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm">
                  {entry.name}: <span className="font-bold">{entry.value}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };


  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <span className="text-sm text-muted-foreground">No visibility data available</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden">
      {/* Headers row - visible on lg screens */}
      <div className="hidden lg:flex gap-4 mb-2">
        <div className="flex-[1_1_50%] min-w-0 flex items-center gap-2">
          <span className="text-sm">Visibility Over Time</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-muted-foreground truncate">Daily average visibility across all AI models</span>
        </div>
        <div className="flex-[1_1_50%] min-w-0 flex items-center gap-2">
          <span className="text-sm">Brands</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-muted-foreground truncate">Rankings for this prompt</span>
        </div>
      </div>
      {/* Cards row */}
      <div className="flex gap-4 w-full max-w-full overflow-hidden flex-col lg:flex-row">
        {/* Chart Section */}
        <div className="flex-[1_1_50%] min-w-0 overflow-hidden">
          {/* Title visible only on small screens */}
          <div className="flex items-center gap-2 mb-2 lg:hidden">
            <span className="text-sm">Visibility Over Time</span>
            <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
            <span className="text-sm text-muted-foreground hidden sm:inline truncate">Daily average visibility across all AI models</span>
          </div>
          <Card className="overflow-hidden" style={{ height: `${height + 24}px` }}>
            <CardContent className="pt-3">
              <ResponsiveContainer width="100%" height={height}>
                <LineChart
                  data={chartData}
                  margin={{ left: 0, right: 20, top: 20, bottom: 5 }}
                >
                  <CartesianGrid vertical={false} />

                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
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

                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={false}
                  />

                  {/* Brand line - only show if selected */}
                  {selectedCompetitors.has(businessName) && (
                    <Line
                      type="natural"
                      dataKey={businessName}
                      stroke="hsl(var(--primary))"
                      strokeWidth={hoveredBrand === businessName ? 3 : 2.5}
                      strokeOpacity={hoveredBrand === null || hoveredBrand === businessName ? 1 : 0.2}
                      dot={false}
                    />
                  )}

                  {/* Competitor lines */}
                  {Array.from(selectedCompetitors).filter(name => name !== businessName).map((competitor) => {
                    const lineColor = getCompanyColor(competitor, false);
                    const isHovered = hoveredBrand === competitor;
                    return (
                      <Line
                        key={competitor}
                        type="natural"
                        dataKey={competitor}
                        stroke={lineColor}
                        strokeWidth={isHovered ? 3 : 2}
                        strokeOpacity={hoveredBrand === null || isHovered ? 1 : 0.2}
                        dot={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Brand Rankings Table */}
        <div className="flex-[1_1_50%] min-w-0 overflow-hidden">
          {/* Title visible only on small screens */}
          <div className="flex items-center gap-2 mb-2 lg:hidden">
            <span className="text-sm">Brands</span>
            <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
            <span className="text-sm text-muted-foreground hidden sm:inline truncate">Rankings for this prompt</span>
          </div>
          <Card className="overflow-hidden" style={{ height: `${height + 24}px` }}>
            <CardContent className="pt-3 h-full flex flex-col">
              <div className="overflow-auto flex-1">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="w-8 text-center"></TableHead>
                      <TableHead className="w-8 text-xs font-normal">
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">#</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Rank by visibility percentage
                          </TooltipContent>
                        </UITooltip>
                      </TableHead>
                      <TableHead className="text-xs font-normal">Brand</TableHead>
                      <TableHead className="text-xs font-normal text-center">
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Visibility</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Percentage of responses mentioning this brand
                          </TooltipContent>
                        </UITooltip>
                      </TableHead>
                      <TableHead className="text-xs font-normal text-center">
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Sentiment</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Score 0-100 (0=negative, 50=neutral, 100=positive)
                          </TooltipContent>
                        </UITooltip>
                      </TableHead>
                      <TableHead className="text-xs font-normal text-center">
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Place</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Average ranking position (lower is better)
                          </TooltipContent>
                        </UITooltip>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitorMetrics.map((metric, index) => {
                      const isChecked = selectedCompetitors.has(metric.name);
                      const lineColor = getCompanyColor(metric.name, metric.isBrand);
                      const isHovered = hoveredBrand === metric.name;

                      return (
                        <TableRow
                          key={index}
                          className={`cursor-pointer transition-colors ${isChecked ? 'opacity-100' : 'opacity-40'} ${isHovered ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
                          onMouseEnter={() => isChecked && setHoveredBrand(metric.name)}
                          onMouseLeave={() => setHoveredBrand(null)}
                        >
                          <TableCell className="text-center py-1.5">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleCompetitor(metric.name)}
                              className="h-3.5 w-3.5"
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-2 h-2 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: lineColor }}
                              />
                              <span className="text-xs">{metric.rank}</span>
                            </div>
                          </TableCell>
                          <TableCell className="overflow-hidden py-1.5">
                            <span
                              className={`text-xs overflow-hidden text-ellipsis whitespace-nowrap block ${metric.isBrand ? 'font-bold' : ''}`}
                            >
                              {metric.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-center py-1.5">
                            <span
                              className={`text-xs ${
                                metric.visibility >= 75
                                  ? 'text-green-600'
                                  : metric.visibility >= 40
                                  ? 'text-orange-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {metric.visibility}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center py-1.5">
                            <span
                              className={`text-xs ${
                                metric.sentimentScore >= 65
                                  ? 'text-green-600'
                                  : metric.sentimentScore >= 35
                                  ? 'text-orange-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {metric.sentimentScore}
                            </span>
                          </TableCell>
                          <TableCell className="text-center py-1.5">
                            <span className="text-xs text-muted-foreground">
                              {metric.averagePosition > 0 ? `#${metric.averagePosition}` : '-'}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {competitorMetrics.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">
                          <span className="text-xs text-muted-foreground">No data</span>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
