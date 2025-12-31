'use client';

import { useState, useEffect } from 'react';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import {
  Newspaper,
  Users,
  BookOpen,
  Target,
  ExternalLink,
  Mail,
  MessageCircle,
  Globe,
  TrendingUp,
  Lightbulb,
  Zap,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Share2,
  Megaphone,
  PenLine,
} from 'lucide-react';

// Growth API types
interface SourceExecution {
  executionId: number;
  promptId: number;
  promptText: string;
  platformName?: string;
  completedAt?: string;
}

interface SourceRecommendation {
  id: string;
  source: {
    domain: string;
    url: string;
    type: 'Editorial' | 'UGC' | 'Reference' | 'Corporate';
    title?: string;
    author?: string;
  };
  action: {
    type: 'get_featured' | 'contact_author' | 'create_content' | 'engage_community' | 'update_listing';
    summary: string;
    details: string[];
  };
  contentSuggestion: {
    title: string;
    description: string;
    targetKeywords: string[];
    contentType: string;
  };
  reasoning: {
    summary: string;
    dataPoints: string[];
    competitorPresence?: string[];
  };
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
  sourceExecutions: SourceExecution[];
}

interface GrowthData {
  offPage: {
    editorial: SourceRecommendation[];
    ugc: SourceRecommendation[];
    reference: SourceRecommendation[];
  };
  summary: {
    totalRecommendations: number;
    highPriorityCount: number;
    topKeywords: string[];
    estimatedVisibilityGain: string;
  };
}

// Static tips for off-page/PR optimization
const PR_TIPS = [
  {
    id: 'editorial',
    title: 'Get Editorial Coverage',
    icon: Newspaper,
    iconColor: 'text-purple-500',
    tips: [
      'Pitch to journalists covering your industry with unique data or insights',
      'Create newsworthy announcements (funding, partnerships, milestones)',
      'Offer expert commentary on industry trends and news',
      'Build relationships with reporters before you need coverage',
      'Respond quickly to journalist queries (HARO, Qwoted, etc.)',
    ],
  },
  {
    id: 'community',
    title: 'Build Community Presence',
    icon: MessageCircle,
    iconColor: 'text-green-500',
    tips: [
      'Actively participate in Reddit discussions (add value, don\'t spam)',
      'Answer questions on Quora with detailed, helpful responses',
      'Engage authentically in LinkedIn industry groups',
      'Contribute to Discord/Slack communities in your space',
      'Share insights on X/Twitter to build thought leadership',
    ],
  },
  {
    id: 'authority',
    title: 'Build Authority Signals',
    icon: BookOpen,
    iconColor: 'text-blue-500',
    tips: [
      'Publish original research that others will cite',
      'Create comprehensive guides that become go-to resources',
      'Get listed in industry directories and comparison sites',
      'Contribute guest posts to authoritative publications',
      'Speak at industry events and webinars',
    ],
  },
  {
    id: 'partnerships',
    title: 'Strategic Partnerships',
    icon: Users,
    iconColor: 'text-orange-500',
    tips: [
      'Partner with complementary products for co-marketing',
      'Collaborate on research reports with industry peers',
      'Exchange guest posts with non-competing companies',
      'Get featured on partner websites and resources pages',
      'Create integration partnerships that generate mentions',
    ],
  },
];

const QUICK_WINS = [
  {
    title: 'Respond to a journalist query',
    description: 'Sign up for HARO or Qwoted and respond to 3 relevant queries this week',
  },
  {
    title: 'Answer 5 Quora questions',
    description: 'Find questions in your industry and provide helpful, detailed answers',
  },
  {
    title: 'Update your comparison page',
    description: 'Make sure you\'re listed on popular "best of" and comparison sites',
  },
];

export default function OffpageRoadmapPage() {
  const { business } = useBusiness();
  const { getDateRangeParams, refreshKey } = useDashboardFilters();
  const [loading, setLoading] = useState(true);
  const [growthData, setGrowthData] = useState<GrowthData | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      if (!business?.id) return;

      setLoading(true);
      const { startDate, endDate } = getDateRangeParams();

      try {
        const response = await fetch(
          `/api/dashboard/growth?businessId=${business.id}&startDate=${startDate}&endDate=${endDate}`
        );

        if (response.ok) {
          const result = await response.json();
          setGrowthData(result);
        }
      } catch (error) {
        console.error('Error fetching off-page roadmap:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [business?.id, refreshKey, getDateRangeParams]);

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSourceTypeColor = (type: string) => {
    switch (type) {
      case 'Editorial': return 'bg-purple-100 text-purple-800';
      case 'UGC': return 'bg-green-100 text-green-800';
      case 'Reference': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'get_featured': return 'Get Featured';
      case 'contact_author': return 'Contact Author';
      case 'create_content': return 'Create Content';
      case 'engage_community': return 'Engage Community';
      case 'update_listing': return 'Update Listing';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Editorial': return <Newspaper className="h-4 w-4" />;
      case 'UGC': return <MessageCircle className="h-4 w-4" />;
      case 'Reference': return <BookOpen className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Analyzing off-page opportunities...</p>
        </div>
      </div>
    );
  }

  // Combine all growth off-page recommendations
  const allOffPageActions = growthData?.offPage
    ? [...(growthData.offPage.editorial || []), ...(growthData.offPage.ugc || []), ...(growthData.offPage.reference || [])]
        .sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        })
    : [];

  const totalRecs = allOffPageActions.length;
  const highPriorityCount = allOffPageActions.filter(r => r.priority === 'high').length;

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Distribution opportunities</span>
        <span className="text-muted-foreground text-sm">·</span>
        <span className="text-sm text-gray-400">Recommendations for getting featured on third-party sources that LLMs cite</span>
      </div>

      {/* Quick Wins Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">Quick Wins</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-gray-400">Actions you can take today</span>
        </div>
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {QUICK_WINS.map((win, i) => (
                <div key={i} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">{win.title}</p>
                      <p className="text-xs text-blue-700 mt-1">{win.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best Practices Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">Best Practices</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-gray-400">How to get mentioned by third-party sources</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PR_TIPS.map((tip) => {
            const IconComponent = tip.icon;
            return (
              <Card key={tip.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <IconComponent className={`h-4 w-4 ${tip.iconColor}`} />
                    <span className="text-sm">{tip.title}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {tip.tips.map((t, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-gray-400 mt-1">•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
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
                <Share2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No personalized recommendations yet.</p>
                <p className="text-sm text-muted-foreground mt-1">Run more prompts to generate specific off-page recommendations based on your data.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {allOffPageActions.map((rec) => {
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
                            {getTypeIcon(rec.source.type)}
                          </div>
                          <span className="text-sm">{rec.source.domain}</span>
                          <Badge className={getPriorityColor(rec.priority)}>
                            {rec.priority}
                          </Badge>
                          <Badge className={getSourceTypeColor(rec.source.type)}>
                            {rec.source.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {rec.action.summary}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {rec.estimatedImpact && (
                          <span className="text-sm text-green-600">
                            {rec.estimatedImpact}
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
                        {/* Reasoning */}
                        {rec.reasoning?.summary && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Why This Matters</p>
                            <p className="text-sm">{rec.reasoning.summary}</p>
                            {rec.reasoning.dataPoints && rec.reasoning.dataPoints.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {rec.reasoning.dataPoints.map((point, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                    <span className="text-primary">•</span>
                                    <span>{point}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* Competitor Presence */}
                        {rec.reasoning?.competitorPresence && rec.reasoning.competitorPresence.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Competitors Present Here</p>
                            <div className="flex flex-wrap gap-1">
                              {rec.reasoning.competitorPresence.map((comp, i) => (
                                <Badge key={i} variant="destructive" className="text-xs">{comp}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Steps */}
                        {rec.action?.details && rec.action.details.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">Action Steps</p>
                            <ol className="space-y-2">
                              {rec.action.details.map((step, i) => (
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

                        {/* Content Suggestion */}
                        {rec.contentSuggestion?.title && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs text-yellow-800 mb-1">Content Suggestion</p>
                                <p className="text-sm text-yellow-900">{rec.contentSuggestion.title}</p>
                                <p className="text-xs text-yellow-700 mt-1">{rec.contentSuggestion.description}</p>
                                {rec.contentSuggestion.targetKeywords && rec.contentSuggestion.targetKeywords.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {rec.contentSuggestion.targetKeywords.map((kw, i) => (
                                      <Badge key={i} variant="outline" className="text-xs bg-yellow-100">{kw}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Source URL */}
                        {rec.source?.url && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Source</p>
                            <a
                              href={rec.source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 flex items-center gap-1 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {rec.source.url}
                            </a>
                          </div>
                        )}

                        {/* Source Executions */}
                        {rec.sourceExecutions && rec.sourceExecutions.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">Prompts Where This Source Was Cited</p>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {rec.sourceExecutions.slice(0, 5).map((exec, i) => (
                                <div key={i} className="text-xs p-2 bg-muted/50 rounded">
                                  <p className="text-muted-foreground truncate">{exec.promptText}</p>
                                  {exec.platformName && (
                                    <span className="text-xs text-muted-foreground">via {exec.platformName}</span>
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
        )}
      </div>
    </div>
  );
}
