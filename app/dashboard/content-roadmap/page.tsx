'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  FileText,
  Target,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  PenLine,
  Zap,
  Globe,
  BookOpen,
  LayoutList,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Clock,
  BarChart3,
  Code,
  ListChecks,
} from 'lucide-react';

interface OnPageRecommendation {
  id: string;
  type: 'content_gap' | 'keyword_optimization' | 'structure_improvement' | 'new_page';
  title: string;
  description: string;
  targetKeywords: string[];
  actionSteps: string[];
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
  relatedSources: string[];
}

interface GrowthData {
  onPage: OnPageRecommendation[];
  summary: {
    totalRecommendations: number;
    highPriorityCount: number;
    topKeywords: string[];
    estimatedVisibilityGain: string;
  };
}

interface ContentRecommendation {
  type: 'new-content' | 'content-upgrade';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  targetPrompt: string;
  suggestedFormat: string;
  keyTopics: string[];
  competitorSources: string[];
  estimatedImpact: number;
}

interface RoadmapData {
  contentGaps: any[];
  topicAnalysis: any[];
  segmentAnalysis: any[];
  recommendations: ContentRecommendation[];
  summary: {
    totalContentGaps: number;
    highPriorityGaps: number;
    topicsNeedingContent: number;
    averageYourVisibility: number;
    averageCompetitorVisibility: number;
    totalRecommendations: number;
    newContentNeeded: number;
    upgradesNeeded: number;
    segmentsAnalyzed: number;
    segmentsUnderperforming: number;
    overallVisibility: number;
  };
}

interface PageAuditResult {
  id: number;
  url: string;
  status: string;
  title: string | null;
  overallScore: number;
  structureScore: number;
  contentScore: number;
  technicalScore: number;
  issues: AuditIssue[];
  recommendations: AuditRecommendation[];
  analyzedAt: string | null;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  wordCount: number;
  hasQaFormat: boolean;
  hasLists: boolean;
  hasFaqSchema: boolean;
  hasHowtoSchema: boolean;
  schemaTypes: string[];
  loadTimeMs: number;
  metaDescription: string | null;
}

interface AuditIssue {
  type: 'error' | 'warning' | 'info';
  category: 'structure' | 'schema' | 'content' | 'technical';
  message: string;
  impact: 'high' | 'medium' | 'low';
}

interface AuditRecommendation {
  category: 'structure' | 'schema' | 'content' | 'technical';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionSteps: string[];
}

interface SiteAudit {
  id: number;
  businessId: string;
  status: 'not_started' | 'running' | 'completed' | 'error';
  startedAt: string | null;
  completedAt: string | null;
  totalPages: number;
  pagesAnalyzed: number;
  overallScore: number | null;
  summary: {
    avgStructureScore: number;
    avgContentScore: number;
    avgTechnicalScore: number;
    commonIssues: { issue: string; count: number }[];
    topRecommendations: string[];
  } | null;
  pages: PageAuditResult[];
}

export default function ContentRoadmapPage() {
  const { business } = useBusiness();
  const { getDateRangeParams, refreshKey } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RoadmapData | null>(null);
  const [growthData, setGrowthData] = useState<GrowthData | null>(null);
  const [siteAudit, setSiteAudit] = useState<SiteAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [newUrl, setNewUrl] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);

  const fetchSiteAudit = useCallback(async () => {
    if (!business?.id) return;

    try {
      const response = await fetch(`/api/dashboard/site-audit?businessId=${business.id}`);
      if (response.ok) {
        const result = await response.json();
        setSiteAudit(result);
      }
    } catch (error) {
      console.error('Error fetching site audit:', error);
    }
  }, [business?.id]);

  useEffect(() => {
    const fetchData = async () => {
      if (!business?.id) return;

      setLoading(true);
      const { startDate, endDate } = getDateRangeParams();

      try {
        const [roadmapResponse, growthResponse] = await Promise.all([
          fetch(`/api/dashboard/content-roadmap?businessId=${business.id}`),
          fetch(`/api/dashboard/growth?businessId=${business.id}&startDate=${startDate}&endDate=${endDate}`)
        ]);

        if (roadmapResponse.ok) {
          const result = await roadmapResponse.json();
          setData(result);
        }

        if (growthResponse.ok) {
          const growthResult = await growthResponse.json();
          setGrowthData(growthResult);
        }

        // Also fetch site audit
        await fetchSiteAudit();
      } catch (error) {
        console.error('Error fetching content roadmap:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [business?.id, refreshKey, getDateRangeParams, fetchSiteAudit]);

  // Poll for audit status while running
  useEffect(() => {
    if (siteAudit?.status === 'running') {
      const interval = setInterval(fetchSiteAudit, 5000);
      return () => clearInterval(interval);
    }
  }, [siteAudit?.status, fetchSiteAudit]);

  const startAudit = async () => {
    if (!business?.id) return;

    setAuditLoading(true);
    try {
      const response = await fetch(`/api/dashboard/site-audit?businessId=${business.id}&action=start`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchSiteAudit();
      } else {
        const error = await response.json();
        console.error('Error starting audit:', error);
      }
    } catch (error) {
      console.error('Error starting audit:', error);
    } finally {
      setAuditLoading(false);
    }
  };

  const addUrl = async () => {
    if (!business?.id || !newUrl.trim()) return;

    setAddingUrl(true);
    try {
      const response = await fetch(`/api/dashboard/site-audit?businessId=${business.id}&action=add-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim() }),
      });

      if (response.ok) {
        setNewUrl('');
        await fetchSiteAudit();
      }
    } catch (error) {
      console.error('Error adding URL:', error);
    } finally {
      setAddingUrl(false);
    }
  };

  const toggleCardExpanded = (cardId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const togglePageExpanded = (pageId: number) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'content_gap': return <Globe className="h-4 w-4" />;
      case 'keyword_optimization': return <Target className="h-4 w-4" />;
      case 'structure_improvement': return <LayoutList className="h-4 w-4" />;
      case 'new_page': return <FileText className="h-4 w-4" />;
      case 'new-content': return <PenLine className="h-4 w-4" />;
      case 'content-upgrade': return <Sparkles className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Lightbulb className="h-4 w-4 text-blue-500" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Analyzing content opportunities...</p>
        </div>
      </div>
    );
  }

  const allRecommendations = [
    ...(data?.recommendations || []).map((r, i) => ({ ...r, id: `rec-${i}`, source: 'roadmap' })),
    ...(growthData?.onPage || []).map(r => ({ ...r, source: 'growth' })),
  ];

  const totalRecs = allRecommendations.length;
  const highPriorityCount = allRecommendations.filter(r => r.priority === 'high').length;

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Content opportunities</span>
        <span className="text-muted-foreground text-sm">·</span>
        <span className="text-sm text-gray-400">Analyze and optimize your pages for LLM visibility</span>
      </div>

      {/* Site Audit Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Site Audit</span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-sm text-gray-400">
              {siteAudit?.status === 'completed'
                ? `${siteAudit.pagesAnalyzed} pages analyzed`
                : siteAudit?.status === 'running'
                ? `Analyzing... ${siteAudit.pagesAnalyzed}/${siteAudit.totalPages} pages`
                : 'Analyze your website for LLM optimization'}
            </span>
          </div>
          {siteAudit?.status !== 'running' && (
            <Button
              onClick={startAudit}
              disabled={auditLoading}
              size="sm"
              variant="outline"
            >
              {auditLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : siteAudit?.status === 'completed' ? (
                <RefreshCw className="h-4 w-4 mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {siteAudit?.status === 'completed' ? 'Re-run Audit' : 'Start Audit'}
            </Button>
          )}
        </div>

        {/* Audit Status/Results */}
        {siteAudit?.status === 'running' && (
          <Card>
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <div className="text-center">
                  <p className="text-sm">Analyzing your website...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {siteAudit.pagesAnalyzed} of {siteAudit.totalPages} pages analyzed
                  </p>
                </div>
                <div className="w-full max-w-xs bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${(siteAudit.pagesAnalyzed / siteAudit.totalPages) * 100}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {siteAudit?.status === 'completed' && siteAudit.summary && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Overall Score</p>
                      <p className={`text-2xl tabular-nums ${getScoreColor(siteAudit.overallScore || 0)}`}>
                        {siteAudit.overallScore || 0}
                      </p>
                    </div>
                    <div className={`p-2 rounded-full ${getScoreBgColor(siteAudit.overallScore || 0)}`}>
                      <BarChart3 className={`h-5 w-5 ${getScoreColor(siteAudit.overallScore || 0)}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Structure</p>
                      <p className={`text-2xl tabular-nums ${getScoreColor(siteAudit.summary.avgStructureScore)}`}>
                        {siteAudit.summary.avgStructureScore}
                      </p>
                    </div>
                    <LayoutList className="h-5 w-5 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Content</p>
                      <p className={`text-2xl tabular-nums ${getScoreColor(siteAudit.summary.avgContentScore)}`}>
                        {siteAudit.summary.avgContentScore}
                      </p>
                    </div>
                    <FileText className="h-5 w-5 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Technical</p>
                      <p className={`text-2xl tabular-nums ${getScoreColor(siteAudit.summary.avgTechnicalScore)}`}>
                        {siteAudit.summary.avgTechnicalScore}
                      </p>
                    </div>
                    <Code className="h-5 w-5 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Common Issues */}
            {siteAudit.summary.commonIssues.length > 0 && (
              <Card className="mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">Common Issues Across Your Site</span>
                  </div>
                  <div className="space-y-2">
                    {siteAudit.summary.commonIssues.map((issue, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm">{issue.issue}</span>
                        <Badge variant="secondary">{issue.count} pages</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Recommendations */}
            {siteAudit.summary.topRecommendations.length > 0 && (
              <Card className="mb-4">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Top Recommendations</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {siteAudit.summary.topRecommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded">
                        <Sparkles className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-amber-800">{rec}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add URL */}
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Add Specific URL</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://yoursite.com/page"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={addUrl} disabled={addingUrl || !newUrl.trim()}>
                    {addingUrl ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Analyze'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Page Results */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-muted-foreground">Page Analysis</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-gray-400">{siteAudit.pages.length} pages</span>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {siteAudit.pages.map((page) => {
                const isExpanded = expandedPages.has(page.id);

                return (
                  <Card
                    key={page.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => togglePageExpanded(page.id)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-lg tabular-nums ${getScoreColor(page.overallScore)}`}>
                              {page.overallScore}
                            </span>
                            <span className="text-sm truncate">{page.title || page.url}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{page.url}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-2 text-xs">
                            <span title="Structure">S: {page.structureScore}</span>
                            <span title="Content">C: {page.contentScore}</span>
                            <span title="Technical">T: {page.technicalScore}</span>
                          </div>
                          {page.issues.length > 0 && (
                            <Badge variant="secondary">{page.issues.length} issues</Badge>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t space-y-4">
                          {/* Quick Stats */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground">Words</p>
                              <p className="text-sm">{page.wordCount.toLocaleString()}</p>
                            </div>
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground">Headings</p>
                              <p className="text-sm">H1:{page.h1Count} H2:{page.h2Count} H3:{page.h3Count}</p>
                            </div>
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground">Q&A Format</p>
                              <p className="text-sm">{page.hasQaFormat ? '✓ Yes' : '✗ No'}</p>
                            </div>
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground">Schema</p>
                              <p className="text-sm">{page.schemaTypes.length > 0 ? page.schemaTypes.join(', ') : 'None'}</p>
                            </div>
                          </div>

                          {/* Issues */}
                          {page.issues.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Issues Found</p>
                              <div className="space-y-1">
                                {page.issues.map((issue, i) => (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    {getIssueIcon(issue.type)}
                                    <span>{issue.message}</span>
                                    <Badge className={getPriorityColor(issue.impact)} variant="outline">
                                      {issue.impact}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recommendations */}
                          {page.recommendations.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Recommendations</p>
                              <div className="space-y-3">
                                {page.recommendations.map((rec, i) => (
                                  <div key={i} className="p-3 bg-blue-50 border border-blue-200 rounded">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm text-blue-800">{rec.title}</span>
                                      <Badge className={getPriorityColor(rec.priority)}>{rec.priority}</Badge>
                                    </div>
                                    <p className="text-xs text-blue-700 mb-2">{rec.description}</p>
                                    {rec.actionSteps.length > 0 && (
                                      <ol className="space-y-1">
                                        {rec.actionSteps.map((step, j) => (
                                          <li key={j} className="text-xs text-blue-600 flex items-start gap-2">
                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-200 text-blue-800 text-xs flex items-center justify-center">
                                              {j + 1}
                                            </span>
                                            <span>{step}</span>
                                          </li>
                                        ))}
                                      </ol>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {siteAudit?.status === 'not_started' && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No site audit yet</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Run an audit to analyze your pages for LLM optimization opportunities
                </p>
                <Button onClick={startAudit} disabled={auditLoading}>
                  {auditLoading && <RefreshCw className="h-4 w-4 animate-spin mr-2" />}
                  Start Site Audit
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Personalized Recommendations Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">Personalized Recommendations</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-gray-400">
            {totalRecs > 0
              ? `${totalRecs} recommendations, ${highPriorityCount} high priority`
              : 'Run more prompts to generate recommendations'
            }
          </span>
        </div>

        {totalRecs === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <Lightbulb className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No personalized recommendations yet.</p>
                <p className="text-sm text-muted-foreground mt-1">Run more prompts to generate specific recommendations based on your data.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {allRecommendations.map((rec: any) => {
              const isExpanded = expandedCards.has(rec.id);

              return (
                <Card
                  key={rec.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleCardExpanded(rec.id)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-muted-foreground">
                            {getTypeIcon(rec.type)}
                          </div>
                          <span className="text-sm">{rec.title}</span>
                          <Badge className={getPriorityColor(rec.priority)}>
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {rec.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(rec.estimatedImpact || rec.estimatedImpact === 0) && (
                          <span className="text-sm text-green-600">
                            {typeof rec.estimatedImpact === 'number' ? `${rec.estimatedImpact} impact` : rec.estimatedImpact}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-4">
                        {/* Reasoning / Target Prompt */}
                        {(rec.reasoning || rec.targetPrompt) && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {rec.reasoning ? 'Why This Matters' : 'Target Query'}
                            </p>
                            <p className="text-sm">{rec.reasoning || rec.targetPrompt}</p>
                          </div>
                        )}

                        {/* Action Steps */}
                        {rec.actionSteps && rec.actionSteps.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">Action Steps</p>
                            <ol className="space-y-2">
                              {rec.actionSteps.map((step: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
                                    {i + 1}
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {/* Keywords / Topics */}
                        {((rec.targetKeywords && rec.targetKeywords.length > 0) || (rec.keyTopics && rec.keyTopics.length > 0)) && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Target Keywords</p>
                            <div className="flex flex-wrap gap-1">
                              {(rec.targetKeywords || rec.keyTopics || []).map((kw: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Related Sources */}
                        {((rec.relatedSources && rec.relatedSources.length > 0) || (rec.competitorSources && rec.competitorSources.length > 0)) && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Related Sources Being Cited</p>
                            <div className="flex flex-wrap gap-2">
                              {(rec.relatedSources || rec.competitorSources || []).map((source: string, i: number) => (
                                <span key={i} className="text-xs text-blue-600 flex items-center gap-1">
                                  <ExternalLink className="h-3 w-3" />
                                  {source}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Suggested Format */}
                        {rec.suggestedFormat && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Suggested Format</p>
                            <Badge variant="secondary">{rec.suggestedFormat}</Badge>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
