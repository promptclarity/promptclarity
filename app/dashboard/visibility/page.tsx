'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Separator } from '@/app/components/ui/separator';
import { Progress } from '@/app/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import {
  ArrowUp,
  ArrowDown,
  MessageSquare,
  BarChart3,
  Calendar,
  Eye,
  Star,
  ChevronDown,
  Loader2,
  Download,
  Check,
} from 'lucide-react';

interface ChartData {
  date: string;
  visibility: number;
}

interface ActivityItem {
  id: number;
  title: string;
  description: string;
  timestamp: string;
  type: 'increase' | 'decrease' | 'mention' | 'alert';
  value?: string;
}

export default function VisibilityPage() {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Extended mock data for better visualization
    const mockData: ChartData[] = [
      { date: '2024-01-01', visibility: 45 },
      { date: '2024-01-02', visibility: 52 },
      { date: '2024-01-03', visibility: 48 },
      { date: '2024-01-04', visibility: 58 },
      { date: '2024-01-05', visibility: 62 },
      { date: '2024-01-06', visibility: 67 },
      { date: '2024-01-07', visibility: 71 },
      { date: '2024-01-08', visibility: 69 },
      { date: '2024-01-09', visibility: 74 },
      { date: '2024-01-10', visibility: 78 },
      { date: '2024-01-11', visibility: 75 },
      { date: '2024-01-12', visibility: 82 },
      { date: '2024-01-13', visibility: 85 },
      { date: '2024-01-14', visibility: 79 },
    ];

    const mockActivity: ActivityItem[] = [
      {
        id: 1,
        title: 'Visibility Increased',
        description: 'Brand visibility increased in AI search results',
        timestamp: '2 hours ago',
        type: 'increase',
        value: '+12%'
      },
      {
        id: 2,
        title: 'New Mention Detected',
        description: 'Your brand was mentioned in AI response about enterprise solutions',
        timestamp: '4 hours ago',
        type: 'mention'
      },
      {
        id: 3,
        title: 'Ranking Improved',
        description: 'Moved up 3 positions in competitive analysis',
        timestamp: '6 hours ago',
        type: 'increase',
        value: '+3 positions'
      },
      {
        id: 4,
        title: 'Weekly Report Ready',
        description: 'Your weekly visibility report is now available',
        timestamp: '1 day ago',
        type: 'alert'
      }
    ];

    setChartData(mockData);
    setRecentActivity(mockActivity);
  }, []);

  const maxValue = Math.max(...chartData.map(d => d.visibility));
  const currentVisibility = chartData[chartData.length - 1]?.visibility || 0;
  const previousVisibility = chartData[chartData.length - 2]?.visibility || 0;
  const weeklyChange = ((currentVisibility - previousVisibility) / previousVisibility * 100).toFixed(1);

  const handleRefresh = async () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  };

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'increase':
        return <ArrowUp className="h-4 w-4 text-green-600" />;
      case 'decrease':
        return <ArrowDown className="h-4 w-4 text-red-600" />;
      case 'mention':
        return <MessageSquare className="h-4 w-4 text-blue-600" />;
      case 'alert':
        return <Star className="h-4 w-4 text-amber-600" />;
      default:
        return <Check className="h-4 w-4" />;
    }
  };

  const getActivityBadgeClass = (type: ActivityItem['type']) => {
    switch (type) {
      case 'increase':
        return 'bg-green-100 text-green-800';
      case 'decrease':
        return 'bg-red-100 text-red-800';
      case 'mention':
        return 'bg-blue-100 text-blue-800';
      case 'alert':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-start">
        <p className="text-sm text-muted-foreground">
          Track your brand's visibility in AI-powered search results
        </p>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                Last 14 days
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Last 7 days</DropdownMenuItem>
              <DropdownMenuItem>Last 14 days</DropdownMenuItem>
              <DropdownMenuItem>Last 30 days</DropdownMenuItem>
              <DropdownMenuItem>Last 90 days</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <Loader2 className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current Visibility</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {currentVisibility}%
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            <ArrowUp className="h-3 w-3 mr-1 text-green-600" />
            <span className="text-green-600">+{weeklyChange}%</span>
            <span className="ml-1">vs last week</span>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Weekly Change</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-green-600">
              +{weeklyChange}%
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            vs previous week
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mentions Today</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              142
            </CardTitle>
          </CardHeader>
          <CardFooter>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">+18 new</Badge>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Rank</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              #3.2
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            <ArrowUp className="h-3 w-3 mr-1 text-green-600" />
            <span className="text-green-600">Improved by 1.8</span>
          </CardFooter>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visibility Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="space-y-1.5">
                <CardTitle>Visibility Trend</CardTitle>
                <CardDescription>14-day visibility performance</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">Live Data</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] bg-muted/30 rounded-lg p-4 mb-4">
              <div className="flex items-end gap-1 h-full w-full">
                {chartData.map((data, index) => (
                  <div
                    key={index}
                    className="flex flex-col items-center flex-1 h-full"
                  >
                    <div
                      className={`w-full max-w-[32px] rounded-t-sm transition-all duration-300 relative ${
                        index === chartData.length - 1
                          ? 'bg-primary'
                          : 'bg-primary/60'
                      }`}
                      style={{
                        height: `${(data.visibility / maxValue) * 80}%`,
                        minHeight: '8px',
                      }}
                    >
                      {index === chartData.length - 1 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-xs ">
                          {data.visibility}%
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-2">
                      {new Date(data.date).toLocaleDateString('en', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart Legend */}
            <div className="flex justify-between items-center">
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-primary/60 rounded-sm" />
                  <span className="text-sm text-muted-foreground">Visibility %</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-primary rounded-sm" />
                  <span className="text-sm text-muted-foreground">Current</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                Peak: {Math.max(...chartData.map(d => d.visibility))}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity & Insights */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Recent Activity</CardTitle>
              <Badge variant="secondary">{recentActivity.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.slice(0, 4).map((activity, index) => (
                <div key={activity.id}>
                  <div className="flex gap-3">
                    <div className={`p-2 rounded-md ${getActivityBadgeClass(activity.type).replace('text-', 'bg-').split(' ')[0]}/30 mt-0.5`}>
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm ">{activity.title}</span>
                        {activity.value && (
                          <Badge variant="secondary" className={getActivityBadgeClass(activity.type)}>
                            {activity.value}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {activity.description}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {activity.timestamp}
                      </span>
                    </div>
                  </div>
                  {index < recentActivity.slice(0, 4).length - 1 && (
                    <Separator className="my-3" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" className="w-full">
              View all activity
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Detailed Metrics Section */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Metrics</CardTitle>
          <CardDescription>Key performance indicators for your brand visibility</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm ">Share of Voice</span>
                <div className="text-right">
                  <span className="text-sm ">34.2%</span>
                  <Progress value={34} className="w-24 mt-1" />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm ">Top Competitor Gap</span>
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">-12.3%</Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm ">Response Quality</span>
                <div className="text-right">
                  <span className="text-sm ">8.7/10</span>
                  <Progress value={87} className="w-24 mt-1" />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm ">Mention Sentiment</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">Positive</Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm ">Coverage Score</span>
                <div className="text-right">
                  <span className="text-sm ">79.4%</span>
                  <Progress value={79} className="w-24 mt-1" />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm ">Model Coverage</span>
                <span className="text-sm ">12/15</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
