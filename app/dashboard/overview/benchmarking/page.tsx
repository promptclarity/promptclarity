'use client';

import { useState, useEffect } from 'react';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { TrendingUp, TrendingDown, Minus, Crown, Target, Eye, EyeOff, AlertTriangle, Globe, BarChart3, CheckCircle2, XCircle, Expand } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';

interface ModelVisibility {
  platformId: number;
  platformName: string;
  businessVisibility: number;
  competitorVisibilities: Record<string, number>;
  executionCount: number;
}

interface CompetitivePosition {
  brand: string;
  isBusiness: boolean;
  visibility: number;
  avgRank: number;
  mentionCount: number;
  status: 'dominate' | 'competitive' | 'weak' | 'invisible';
  trend: 'up' | 'down' | 'stable';
}

interface Platform {
  id: number;
  platformId: string;
  name: string;
}

interface QueryInsight {
  promptId: number;
  promptText: string;
  yourVisibility: number;
  topCompetitor: string;
  topCompetitorVisibility: number;
  outcome: 'win' | 'loss' | 'tie' | 'solo';
  gap: number;
}

interface HeadToHead {
  competitor: string;
  wins: number;
  losses: number;
  ties: number;
  total: number;
  winRate: number;
}

interface CoOccurrence {
  competitor: string;
  coAppearances: number;
  totalYourAppearances: number;
  coOccurrenceRate: number;
}

interface SourceBenchmark {
  domain: string;
  type: string;
  totalAppearances: number;
  yourAppearances: number;
  competitorAppearances: number;
  yourPresenceRate: number;
  competitorPresenceRate: number;
  gap: number;
  isGapOpportunity: boolean;
}

interface SourceMixByBrand {
  brand: string;
  editorial: number;
  ugc: number;
  corporate: number;
  competitor: number;
  reference: number;
  you: number;
  other: number;
  totalSources: number;
}

interface Scorecard {
  yourVisibility: number;
  avgCompetitorVisibility: number;
  visibilityGap: number;
  yourRank: number;
  totalBrands: number;
  promptsWhereYouAppear: number;
  promptsWhereYouAppearPct: number;
  totalPrompts: number;
  sourcesWithYourPresence: number;
  sourcesWithCompetitorOnly: number;
  topSourcesUsed: string[];
  headToHeadWinRate: number;
}

interface BenchmarkData {
  modelVisibility: Record<string, ModelVisibility>;
  competitivePositioning: CompetitivePosition[];
  timeSeriesData: {
    date: string;
    [key: string]: string | number;
  }[];
  categoryBreakdown: {
    category: string;
    yourVisibility: number;
    avgCompetitorVisibility: number;
    topCompetitor: string;
    topCompetitorVisibility: number;
  }[];
  platforms: Platform[];
  queryInsights?: {
    strongest: QueryInsight[];
    weakest: QueryInsight[];
    opportunities: QueryInsight[];
  };
  headToHead?: HeadToHead[];
  coOccurrence?: CoOccurrence[];
  // New source benchmarking
  sourceBenchmark?: SourceBenchmark[];
  sourceGapOpportunities?: SourceBenchmark[];
  sourcesWhereYouLead?: SourceBenchmark[];
  sourceMixByBrand?: SourceMixByBrand[];
  scorecard?: Scorecard;
}

export default function BenchmarkingPage() {
  const { business } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30');
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [activeTab, setActiveTab] = useState('scorecard');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [showExpandedRankings, setShowExpandedRankings] = useState(false);

  useEffect(() => {
    const fetchBenchmarkData = async () => {
      if (!business?.id) return;

      setLoading(true);
      try {
        let url = `/api/dashboard/benchmarking?businessId=${business.id}&days=${timeRange}`;
        if (selectedModel !== 'all') {
          // Find the platform ID for the selected model name
          const platform = data?.platforms?.find(p => p.name === selectedModel);
          if (platform) {
            url += `&platformId=${platform.id}`;
          }
        }
        const response = await fetch(url);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error('Error fetching benchmark data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBenchmarkData();
  }, [business?.id, timeRange, selectedModel]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'dominate': return 'bg-green-100 text-green-800 border-green-200';
      case 'competitive': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'weak': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'invisible': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'dominate': return <Crown className="h-4 w-4" />;
      case 'competitive': return <Target className="h-4 w-4" />;
      case 'weak': return <AlertTriangle className="h-4 w-4" />;
      case 'invisible': return <EyeOff className="h-4 w-4" />;
      default: return <Eye className="h-4 w-4" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getBarColor = (visibility: number, isBusiness: boolean) => {
    if (isBusiness) return '#3b82f6'; // Blue for your business
    if (visibility > 50) return '#22c55e'; // Green
    if (visibility > 25) return '#eab308'; // Yellow
    if (visibility > 0) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading benchmark data...</p>
        </div>
      </div>
    );
  }

  // Show empty state if no data
  if (!data || data.competitivePositioning.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground">Compare your AI visibility against competitors</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="mb-2">No benchmark data available</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Run some prompts to start collecting visibility data. The benchmarking dashboard will populate once you have execution results.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const yourPosition = data.competitivePositioning.find(p => p.isBusiness);
  const competitors = data.competitivePositioning.filter(p => !p.isBusiness);

  // Get available models for selector from platforms
  const availableModels = data.platforms?.map(p => p.name) || Object.keys(data.modelVisibility);

  // Use data directly - filtering is done server-side now
  const filteredPositioning = data.competitivePositioning;
  const filteredYourPosition = filteredPositioning.find(p => p.isBusiness);

  // Prepare bar chart data from filtered positioning
  const barChartData = filteredPositioning.map(p => ({
    name: p.brand,
    visibility: p.visibility,
    isBusiness: p.isBusiness,
  })).sort((a, b) => b.visibility - a.visibility);

  return (
    <div className="space-y-4">
      {/* Header with Time Range Selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Track how you compare to competitors across AI platforms
        </p>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs">Your Position</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-green-600">
              {filteredYourPosition?.status || yourPosition?.status || 'competitive'}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            {getTrendIcon(filteredYourPosition?.trend || yourPosition?.trend || 'stable')}
          </CardFooter>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs">
              {selectedModel === 'all' ? 'Overall Visibility' : `${selectedModel} Visibility`}
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums text-blue-600">
              {filteredYourPosition?.visibility || yourPosition?.visibility || 0}
              <span className="text-sm text-muted-foreground ml-1">%</span>
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            Avg competitor: {Math.round(filteredPositioning.filter(p => !p.isBusiness).reduce((sum, c) => sum + c.visibility, 0) / Math.max(filteredPositioning.filter(p => !p.isBusiness).length, 1))}%
          </CardFooter>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs">Your Rank</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-amber-600">
              #{filteredPositioning.findIndex(p => p.isBusiness) + 1}
              <span className="text-sm text-muted-foreground ml-1">of {filteredPositioning.length}</span>
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            {selectedModel === 'all' ? 'Across all models' : `On ${selectedModel}`}
          </CardFooter>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs">Total Mentions</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-purple-600">
              {filteredYourPosition?.mentionCount || yourPosition?.mentionCount || 0}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            {selectedModel === 'all' ? 'Across all AI platforms' : `On ${selectedModel}`}
          </CardFooter>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 mb-4">
          <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
          <TabsTrigger value="overview">Brand Rankings</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="by-model">By Platform</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-0">
          {/* Brand Rankings - Compact */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Brand Rankings</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="All Models" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Models</SelectItem>
                      {availableModels.map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowExpandedRankings(true)}
                  >
                    <Expand className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {barChartData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">#{index + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm ${entry.isBusiness ? 'text-blue-600' : ''}`}>
                          {entry.name} {entry.isBusiness && <span className="text-xs">(You)</span>}
                        </span>
                        <span className={`text-sm ${entry.isBusiness ? 'text-blue-600' : ''}`}>{entry.visibility}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${entry.isBusiness ? 'bg-blue-500' : 'bg-gray-400'}`} style={{ width: `${entry.visibility}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Head-to-Head - Compact */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Head-to-Head</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {data.headToHead && data.headToHead.length > 0 ? (
                <div className="space-y-2">
                  {data.headToHead.slice(0, 5).map((h2h) => (
                    <div key={h2h.competitor} className="flex items-center justify-between py-1 border-b last:border-0">
                      <span className="text-sm">{h2h.competitor}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600">{h2h.wins}W</span>
                        <span className="text-red-600">{h2h.losses}L</span>
                        <Badge variant={h2h.winRate >= 50 ? 'default' : 'secondary'} className="text-xs">{h2h.winRate}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">No data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Query Insights - Compact Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Strongest Queries */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-green-600 flex items-center gap-1">
                  <Crown className="h-4 w-4" /> Winning
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.queryInsights?.strongest && data.queryInsights.strongest.length > 0 ? (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {data.queryInsights.strongest.slice(0, 4).map((q) => (
                      <div key={q.promptId} className="py-2 px-2 rounded bg-green-50/50 text-xs">
                        <p className="line-clamp-1 text-green-800">{q.promptText}</p>
                        <span className="text-green-600">+{q.gap}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">None</p>
                )}
              </CardContent>
            </Card>

            {/* Weakest Queries */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Losing
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.queryInsights?.weakest && data.queryInsights.weakest.length > 0 ? (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {data.queryInsights.weakest.slice(0, 4).map((q) => (
                      <div key={q.promptId} className="py-2 px-2 rounded bg-red-50/50 text-xs">
                        <p className="line-clamp-1 text-red-800">{q.promptText}</p>
                        <span className="text-red-600">{q.gap}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">None</p>
                )}
              </CardContent>
            </Card>

            {/* Opportunity Queries */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-amber-600 flex items-center gap-1">
                  <Target className="h-4 w-4" /> Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.queryInsights?.opportunities && data.queryInsights.opportunities.length > 0 ? (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {data.queryInsights.opportunities.slice(0, 4).map((q) => (
                      <div key={q.promptId} className="py-2 px-2 rounded bg-amber-50/50 text-xs">
                        <p className="line-clamp-1 text-amber-800">{q.promptText}</p>
                        <span className="text-amber-600">{q.topCompetitor}: {q.topCompetitorVisibility}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">None</p>
                )}
              </CardContent>
            </Card>
          </div>

        </TabsContent>

        {/* By Platform Tab - Compact */}
        <TabsContent value="by-model" className="space-y-4 mt-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Platform Comparison</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Platform</TableHead>
                    <TableHead className="text-xs text-center">You</TableHead>
                    <TableHead className="text-xs text-center">Top Comp</TableHead>
                    <TableHead className="text-xs text-center">Gap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.modelVisibility).map(([modelName, modelData]) => {
                    const topCompetitor = Object.entries(modelData.competitorVisibilities)
                      .sort(([, a], [, b]) => b - a)[0];
                    const gap = modelData.businessVisibility - (topCompetitor?.[1] || 0);

                    return (
                      <TableRow key={modelName} className="text-sm">
                        <TableCell className="py-2">{modelName}</TableCell>
                        <TableCell className="py-2 text-center text-blue-600">{modelData.businessVisibility}%</TableCell>
                        <TableCell className="py-2 text-center text-muted-foreground">
                          {topCompetitor ? `${topCompetitor[1]}%` : '-'}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <span className={gap >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {gap >= 0 ? '+' : ''}{gap}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scorecard Tab */}
        <TabsContent value="scorecard" className="space-y-4 mt-0">
          {data.scorecard && (
            <>
              {/* Key Metrics - Compact Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Visibility</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {data.scorecard.yourVisibility}%
                    </CardTitle>
                  </CardHeader>
                  <CardFooter className="text-sm text-muted-foreground">
                    vs {data.scorecard.avgCompetitorVisibility}% avg
                  </CardFooter>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Gap</CardDescription>
                    <CardTitle className={`text-2xl tabular-nums ${data.scorecard.visibilityGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.scorecard.visibilityGap >= 0 ? '+' : ''}{data.scorecard.visibilityGap}%
                    </CardTitle>
                  </CardHeader>
                  <CardFooter className="text-sm text-muted-foreground">
                    {data.scorecard.visibilityGap >= 0 ? 'ahead' : 'behind'}
                  </CardFooter>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Rank</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      #{data.scorecard.yourRank}
                    </CardTitle>
                  </CardHeader>
                  <CardFooter className="text-sm text-muted-foreground">
                    of {data.scorecard.totalBrands}
                  </CardFooter>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Win Rate</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {data.scorecard.headToHeadWinRate}%
                    </CardTitle>
                  </CardHeader>
                  <CardFooter className="text-sm text-muted-foreground">
                    head-to-head
                  </CardFooter>
                </Card>
              </div>

              {/* Coverage & Sources - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardDescription>Prompt Coverage</CardDescription>
                      <span className="text-sm">{data.scorecard.promptsWhereYouAppearPct}%</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${data.scorecard.promptsWhereYouAppearPct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{data.scorecard.promptsWhereYouAppear} of {data.scorecard.totalPrompts} prompts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Source Presence</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Your sources</span>
                      <span>{data.scorecard.sourcesWithYourPresence}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Gap opportunities</span>
                      <span className="text-red-600">{data.scorecard.sourcesWithCompetitorOnly}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Sources - Inline */}
              {data.scorecard.topSourcesUsed.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Top Sources</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {data.scorecard.topSourcesUsed.map((source) => (
                        <Badge key={source} variant="secondary" className="text-xs">{source}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-4 mt-0">
          {/* Gap Opportunities & Where You Lead - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gap Opportunities */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  Gap Opportunities
                </CardTitle>
                <CardDescription className="text-xs">Competitors appear here, you don&apos;t</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {data.sourceGapOpportunities && data.sourceGapOpportunities.length > 0 ? (
                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
                    {data.sourceGapOpportunities.slice(0, 8).map((source) => (
                      <div key={source.domain} className="flex items-center justify-between py-2 px-2 rounded bg-red-50/50 text-sm">
                        <span className="truncate flex-1">{source.domain}</span>
                        <Badge variant="destructive" className="ml-2">{source.competitorAppearances}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No gaps found</p>
                )}
              </CardContent>
            </Card>

            {/* Sources Where You Lead */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <Crown className="h-4 w-4" />
                  Where You Lead
                </CardTitle>
                <CardDescription className="text-xs">You appear more than competitors</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {data.sourcesWhereYouLead && data.sourcesWhereYouLead.length > 0 ? (
                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
                    {data.sourcesWhereYouLead.slice(0, 8).map((source) => (
                      <div key={source.domain} className="flex items-center justify-between py-2 px-2 rounded bg-green-50/50 text-sm">
                        <span className="truncate flex-1">{source.domain}</span>
                        <Badge variant="default" className="ml-2">+{source.gap}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No leading sources</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* All Sources Table - Compact */}
          {data.sourceBenchmark && data.sourceBenchmark.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>All Sources</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs text-center w-16">You</TableHead>
                        <TableHead className="text-xs text-center w-16">Comp</TableHead>
                        <TableHead className="text-xs text-center w-16">Gap</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sourceBenchmark.slice(0, 12).map((source) => (
                        <TableRow key={source.domain} className="text-sm">
                          <TableCell className="py-2 truncate max-w-[200px]">{source.domain}</TableCell>
                          <TableCell className="py-2 text-center">{source.yourAppearances}</TableCell>
                          <TableCell className="py-2 text-center">{source.competitorAppearances}</TableCell>
                          <TableCell className="py-2 text-center">
                            <span className={source.gap >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {source.gap >= 0 ? '+' : ''}{source.gap}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Expanded Brand Rankings Dialog */}
      <Dialog open={showExpandedRankings} onOpenChange={setShowExpandedRankings}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Brand Rankings</span>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-[160px] h-8 text-sm">
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {availableModels.map((model) => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-3">
              {barChartData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground w-8">#{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-base ${entry.isBusiness ? 'text-blue-600' : ''}`}>
                        {entry.name} {entry.isBusiness && <Badge variant="secondary" className="ml-2">You</Badge>}
                      </span>
                      <span className={`text-base ${entry.isBusiness ? 'text-blue-600' : ''}`}>{entry.visibility}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${entry.isBusiness ? 'bg-blue-500' : 'bg-gray-400'}`}
                        style={{ width: `${entry.visibility}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
