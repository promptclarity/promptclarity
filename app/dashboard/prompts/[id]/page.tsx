'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Separator } from '@/app/components/ui/separator';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  ChevronLeft,
  Rocket,
  Wand2,
  Box,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/app/components/ui/tooltip';
import VisibilityChart from '@/app/components/VisibilityChart';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { formatLocalDate, formatLocalDateTime } from '@/app/lib/dateUtils';
import { useSidebar } from '@/app/components/ui/sidebar';

interface Source {
  domain: string;
  url: string;
  type: string;
}

interface CompetitorSentiment {
  name: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore?: number; // 0-100 score
  context?: string;
}

interface ModelResponse {
  executionId: number;
  platformId: number;
  result: string;
  completedAt: string;
  refreshDate?: string;
  brandMentions?: number;
  brandSentiment?: 'positive' | 'neutral' | 'negative' | null;
  brandSentimentScore?: number | null; // 0-100 score
  brandContext?: string | null; // Brief description of how brand was mentioned
  competitorsMentioned?: string[];
  competitorSentiments?: CompetitorSentiment[];
  analysisConfidence?: number;
  businessVisibility?: number;
  sources?: Source[];
}

interface VisibilityHistoryEntry {
  date: string;
  visibility: number;
}

interface CompetitorRanking {
  name: string;
  visibility: number;
  isBrand: boolean;
}

interface Prompt {
  id: number;
  text: string;
  topicId: number;
  topicName?: string;
  isCustom: boolean;
  isPriority: boolean;
  metrics: {
    visibility: number;
    rank: number | null;
  };
  responses: ModelResponse[];
  visibility_history?: VisibilityHistoryEntry[];
  competitor_rankings?: CompetitorRanking[];
}

interface Platform {
  id: number;
  name?: string;
  provider: string;
  model_name: string;
  is_primary: boolean;
}

// Helper function to highlight brands and sources in text
function highlightText(
  children: React.ReactNode,
  businessName: string,
  competitors: string[],
  sources: Source[]
): React.ReactNode {
  // If children is not a string, return as-is (could be nested elements)
  if (typeof children !== 'string') {
    // If it's an array, process each element
    if (Array.isArray(children)) {
      return children.map((child, idx) => {
        if (typeof child === 'string') {
          return <span key={idx}>{highlightTextString(child, businessName, competitors, sources)}</span>;
        }
        return child;
      });
    }
    return children;
  }

  return highlightTextString(children, businessName, competitors, sources);
}

function highlightTextString(
  text: string,
  businessName: string,
  competitors: string[],
  sources: Source[]
): React.ReactNode {
  if (!text) return text;

  // Build patterns for highlighting
  const patterns: Array<{ regex: RegExp; type: 'brand' | 'competitor' | 'source' }> = [];

  // Add business name pattern (case-insensitive)
  if (businessName) {
    patterns.push({
      regex: new RegExp(`\\b(${escapeRegex(businessName)})\\b`, 'gi'),
      type: 'brand'
    });
  }

  // Add competitor patterns
  competitors.forEach(competitor => {
    if (competitor) {
      patterns.push({
        regex: new RegExp(`\\b(${escapeRegex(competitor)})\\b`, 'gi'),
        type: 'competitor'
      });
    }
  });

  // Add source domain patterns
  sources.forEach(source => {
    if (source.domain) {
      patterns.push({
        regex: new RegExp(`\\b(${escapeRegex(source.domain)})\\b`, 'gi'),
        type: 'source'
      });
    }
  });

  if (patterns.length === 0) return text;

  // Combine all patterns into one regex with named groups
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Find all matches
  const matches: Array<{ start: number; end: number; text: string; type: 'brand' | 'competitor' | 'source' }> = [];

  patterns.forEach(({ regex, type }) => {
    let match;
    const r = new RegExp(regex.source, regex.flags);
    while ((match = r.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type
      });
    }
  });

  // Sort by start position and remove overlaps (prefer earlier matches)
  matches.sort((a, b) => a.start - b.start);
  const filteredMatches: typeof matches = [];
  let lastEnd = 0;
  matches.forEach(match => {
    if (match.start >= lastEnd) {
      filteredMatches.push(match);
      lastEnd = match.end;
    }
  });

  // Build result
  filteredMatches.forEach(match => {
    // Add text before match
    if (match.start > lastIndex) {
      parts.push(text.slice(lastIndex, match.start));
    }

    // Add highlighted match
    const className = match.type === 'brand'
      ? 'highlight-brand'
      : match.type === 'competitor'
        ? 'highlight-competitor'
        : 'highlight-source';

    parts.push(
      <mark key={key++} className={className}>
        {match.text}
      </mark>
    );

    lastIndex = match.end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function PromptDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { business } = useBusiness();
  const { state: sidebarState } = useSidebar();
  const { selectedPlatforms, platforms: contextPlatforms, refreshKey, dateRange, getDateRangeParams } = useDashboardFilters();

  const promptId = params.id ? parseInt(params.id as string) : null;
  const executionIdParam = searchParams.get('executionId');

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedResponse, setSelectedResponse] = useState<ModelResponse | null>(null);
  const [showResponseDialog, setShowResponseDialog] = useState(false);
  const [deletingExecutionId, setDeletingExecutionId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchPromptDetails = async () => {
    if (!promptId || !business?.id) return;

    try {
      setIsLoading(true);

      const { startDate, endDate } = getDateRangeParams();

      const url = new URL(`/api/dashboard/prompts/${promptId}`, window.location.origin);
      url.searchParams.append('businessId', String(business.id));
      url.searchParams.append('startDate', startDate);
      url.searchParams.append('endDate', endDate);

      // Add platform filter if not all platforms are selected
      if (selectedPlatforms.size > 0 && contextPlatforms.length > 0 && selectedPlatforms.size < contextPlatforms.length) {
        url.searchParams.append('platformIds', Array.from(selectedPlatforms).join(','));
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setPrompt(data.prompt);
      }
    } catch (error) {
      console.error('Error fetching prompt details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlatforms = async () => {
    if (!business?.id) return;

    try {
      const response = await fetch(`/api/platforms?businessId=${business.id}`);
      if (response.ok) {
        const data = await response.json();
        setPlatforms(data.platforms || []);
      }
    } catch (error) {
      console.error('Error fetching platforms:', error);
    }
  };

  useEffect(() => {
    if (business?.id && promptId) {
      // Fetch platforms first, then prompt details to ensure platform names are available
      const loadData = async () => {
        await fetchPlatforms();
        await fetchPromptDetails();
      };
      loadData();
    }
  }, [business?.id, promptId, refreshKey, dateRange]);

  // Auto-open the dialog for the specific execution if executionId is in URL
  useEffect(() => {
    if (executionIdParam && prompt?.responses) {
      const executionId = parseInt(executionIdParam);
      const response = prompt.responses.find(r => r.executionId === executionId);
      if (response) {
        setSelectedResponse(response);
        setShowResponseDialog(true);
        // Clear the param from URL
        window.history.replaceState({}, '', `/dashboard/prompts/${promptId}`);
      }
    }
  }, [executionIdParam, prompt]);

  const executePrompt = async () => {
    if (!promptId || !business?.id) return;

    try {
      await fetch('/api/prompts/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          promptId,
        }),
      });
    } catch (error) {
      console.error('Error executing prompt:', error);
    }
  };

  const handleDeleteExecution = async () => {
    if (!deletingExecutionId) return;

    try {
      const response = await fetch(`/api/prompts/executions/${deletingExecutionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete execution');
      }

      setShowDeleteConfirm(false);
      setDeletingExecutionId(null);

      // Refresh the prompt details
      await fetchPromptDetails();
    } catch (error: any) {
      console.error('Error deleting execution:', error);
      alert('Failed to delete execution: ' + error.message);
    }
  };

  const getModelLogo = (provider: string) => {
    const iconProps = { className: "h-4 w-4 shrink-0" };
    switch (provider?.toLowerCase()) {
      case 'openai':
        return (
          <svg className="h-4 w-4 shrink-0" fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"></path>
          </svg>
        );
      case 'anthropic':
        return (
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero"/>
          </svg>
        );
      case 'google':
        return (
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-fill-0" x1="7" x2="11" y1="15.5" y2="12">
                <stop stopColor="#08B962"/>
                <stop offset="1" stopColor="#08B962" stopOpacity="0"/>
              </linearGradient>
              <linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-fill-1" x1="8" x2="11.5" y1="5.5" y2="11">
                <stop stopColor="#F94543"/>
                <stop offset="1" stopColor="#F94543" stopOpacity="0"/>
              </linearGradient>
              <linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-fill-2" x1="3.5" x2="17.5" y1="13.5" y2="12">
                <stop stopColor="#FABC12"/>
                <stop offset=".46" stopColor="#FABC12" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/>
            <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-fill-0)"/>
            <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-fill-1)"/>
            <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-fill-2)"/>
          </svg>
        );
      case 'perplexity':
        return (
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="#22B8CD" fillRule="nonzero"/>
          </svg>
        );
      case 'xai':
        return (
          <svg className="h-4 w-4 shrink-0" fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/>
          </svg>
        );
      default:
        return <Box {...iconProps} />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading prompt details...</span>
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-muted-foreground">Prompt not found</span>
          <Button variant="secondary" onClick={() => router.push('/dashboard/prompts')}>
            <ChevronLeft className="h-4 w-4 mr-1.5" />
            Back to Prompts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="pb-4 mb-6 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-start flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard/prompts')}
                className="-ml-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              {prompt.topicName && (
                <>
                  <span className="text-sm text-muted-foreground">/</span>
                  <span className="text-sm text-muted-foreground">{prompt.topicName}</span>
                </>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={executePrompt}>
              <Rocket className="h-4 w-4 mr-1" />
              Execute
            </Button>
          </div>
          <h1 className="text-lg break-words">
            {prompt.text}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Visibility:</span>
              <Badge
                variant="secondary"
                className={
                  prompt.metrics.visibility > 50 ? 'bg-green-100 text-green-800' :
                  prompt.metrics.visibility > 25 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }
              >
                {prompt.metrics.visibility}%
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Rank:</span>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {prompt.metrics.rank !== null ? `#${prompt.metrics.rank}` : '-'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {/* Visibility Chart */}
        {prompt.visibility_history && prompt.visibility_history.length > 0 && (
          <div className="mb-6 w-full max-w-full overflow-hidden">
            <VisibilityChart
              data={prompt.visibility_history}
              businessName={business?.businessName || 'Your Brand'}
              responses={prompt.responses}
              competitorRankings={prompt.competitor_rankings}
            />
          </div>
        )}

        {/* LLM Response History */}
        <div>
          {/* Header row */}
          <div className="flex justify-between items-center mb-2 h-5">
            <div className="flex items-center gap-2">
              <span className="text-sm">LLM Response History</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-muted-foreground">
                {prompt.responses.length} executions
              </span>
            </div>
          </div>
        {prompt.responses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Wand2 className="h-6 w-6 text-muted-foreground/30" />
              <span className="text-xs text-muted-foreground mt-2">No responses yet</span>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden max-w-full">
            <CardContent className="pt-3">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[70px]">Date</TableHead>
                    <TableHead className="w-[45px]">Brand</TableHead>
                    <TableHead className="w-[90px]">Competitors</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead className="w-[75px]">Platform</TableHead>
                    <TableHead className="w-[32px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prompt.responses
                    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                    .map((response) => {
                      const platform = platforms.find(p => p.id === response.platformId);
                      const responseKey = `execution-${response.executionId}`;
                      const isMentioned = (response.brandMentions || 0) > 0;
                      const competitorLogos = response.competitorsMentioned || [];

                      return (
                        <TableRow
                          key={responseKey}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedResponse(response);
                            setShowResponseDialog(true);
                          }}
                        >
                          <TableCell className="overflow-hidden">
                            <span className="text-sm whitespace-nowrap">
                              {formatLocalDate(response.refreshDate || response.completedAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={isMentioned ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                            >
                              {isMentioned ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="overflow-hidden">
                            {competitorLogos.length > 0 ? (
                              <div className="flex gap-1 items-center flex-nowrap overflow-hidden">
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800 shrink-0">
                                  {competitorLogos[0]}
                                </Badge>
                                {competitorLogos.length > 1 && (
                                  <Badge variant="secondary" className="bg-gray-100 text-gray-800 shrink-0">
                                    +{competitorLogos.length - 1}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="overflow-hidden">
                            <span className="text-sm block overflow-hidden text-ellipsis whitespace-nowrap">
                              {response.result.length > 115 ? response.result.slice(0, 115) + '...' : response.result}
                            </span>
                          </TableCell>
                          <TableCell className="overflow-hidden">
                            <div className="flex items-center gap-1 overflow-hidden">
                              {getModelLogo(platform?.provider || '')}
                              <span className="text-sm overflow-hidden text-ellipsis whitespace-nowrap">{platform?.name || platform?.provider || '?'}</span>
                            </div>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                setDeletingExecutionId(response.executionId);
                                setShowDeleteConfirm(true);
                              }}
                              title="Delete this response"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Response</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this LLM response? This will recalculate visibility averages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExecution} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Response
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Response Detail Dialog */}
      <Dialog open={showResponseDialog} onOpenChange={setShowResponseDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0">
          <TooltipProvider delayDuration={0}>
          {selectedResponse && (() => {
            const platform = platforms.find(p => p.id === selectedResponse.platformId);
            const competitorLogos = selectedResponse.competitorsMentioned || [];
            const competitorSentiments = selectedResponse.competitorSentiments || [];
            const isMentioned = (selectedResponse.brandMentions || 0) > 0;
            const brandSentiment = selectedResponse.brandSentiment;
            // Filter out fake sources - only show sources with actual URLs
            const sources = (selectedResponse.sources || []).filter(s => s.url && s.url.trim() !== '');

            // Helper to get sentiment for a competitor
            const getCompetitorSentiment = (name: string) => {
              return competitorSentiments.find(cs => cs.name.toLowerCase() === name.toLowerCase());
            };

            // Helper to render sentiment score badge with tooltip
            const SentimentScore = ({ score, sentiment }: { score?: number | null; sentiment?: string }) => {
              // If we have a score, show it; otherwise fall back to sentiment word
              if (score != null) {
                const colorClass = score >= 75
                  ? 'bg-green-100 text-green-800'
                  : score >= 40
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-red-100 text-red-700';
                const tooltipText = score >= 75
                  ? 'Positive sentiment'
                  : score >= 40
                    ? 'Neutral sentiment'
                    : 'Negative sentiment';
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colorClass} cursor-help`}>
                        {score}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{tooltipText} ({score}/100)</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }
              // Fallback to sentiment word if no score
              if (!sentiment) return null;
              const colorClass = sentiment === 'positive'
                ? 'bg-green-100 text-green-800'
                : sentiment === 'negative'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600';
              const displayText = sentiment === 'positive' ? '75+' : sentiment === 'negative' ? '<40' : '~50';
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colorClass} cursor-help`}>
                      {displayText}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{sentiment.charAt(0).toUpperCase() + sentiment.slice(1)} sentiment</p>
                  </TooltipContent>
                </Tooltip>
              );
            };


            return (
              <div className="flex h-[80vh]">
                {/* Left: Chat Area */}
                <div className="flex-1 flex flex-col border-r">
                  {/* Header */}
                  <div className="flex justify-between items-center p-3 border-b">
                    <div className="flex items-center gap-2">
                      {getModelLogo(platform?.provider || '')}
                      <span className="text-sm">
                        {platform?.name || platform?.provider || 'Unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatLocalDateTime(selectedResponse.completedAt)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowResponseDialog(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Chat Content */}
                  <ScrollArea className="flex-1 p-4">
                    {/* User Input / Prompt */}
                    <div
                      className="rounded-md p-3 mb-3 bg-primary/10 ml-auto max-w-[90%]"
                    >
                      <span className="text-sm leading-relaxed">
                        {prompt?.text}
                      </span>
                    </div>

                    {/* LLM Response */}
                    <div
                      className={`markdown-response markdown-${platform?.provider?.toLowerCase() || 'default'} rounded-md p-4`}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="markdown-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {children}
                            </a>
                          ),
                          // Highlight brands and sources in text content
                          p: ({ children }) => <p>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</p>,
                          li: ({ children }) => <li>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</li>,
                          td: ({ children }) => <td>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</td>,
                          th: ({ children }) => <th>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</th>,
                          strong: ({ children }) => <strong>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</strong>,
                          em: ({ children }) => <em>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</em>,
                          h1: ({ children }) => <h1>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</h1>,
                          h2: ({ children }) => <h2>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</h2>,
                          h3: ({ children }) => <h3>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</h3>,
                          h4: ({ children }) => <h4>{highlightText(children, isMentioned ? (business?.businessName || '') : '', competitorLogos, sources)}</h4>,
                        }}
                      >
                        {selectedResponse.result}
                      </ReactMarkdown>
                    </div>
                  </ScrollArea>
                </div>

                {/* Right: Details Sidebar */}
                <div className="w-[280px] flex flex-col bg-muted/50">
                  <ScrollArea className="flex-1">
                    <div className="p-3">
                      {/* Brands Mentioned */}
                      <div className="mb-4">
                        <span className="text-xs text-muted-foreground  block mb-1.5">
                          Brands Mentioned
                        </span>
                        {isMentioned || competitorLogos.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            {isMentioned && (
                              <div className="flex items-center gap-2">
                                {selectedResponse.brandContext ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="bg-green-100 text-green-800 cursor-help">
                                        {business?.businessName || 'Your Brand'}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[250px]">
                                      <p>{selectedResponse.brandContext}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                                    {business?.businessName || 'Your Brand'}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">({selectedResponse.brandMentions}x)</span>
                                <SentimentScore score={selectedResponse.brandSentimentScore} sentiment={brandSentiment || undefined} />
                              </div>
                            )}
                            {competitorLogos.map((competitor, idx) => {
                              const sentimentData = getCompetitorSentiment(competitor);
                              return (
                                <div key={idx} className="flex items-center gap-2">
                                  {sentimentData?.context ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 cursor-help">
                                          {competitor}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-[250px]">
                                        <p>{sentimentData.context}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                      {competitor}
                                    </Badge>
                                  )}
                                  <SentimentScore score={sentimentData?.sentimentScore} sentiment={sentimentData?.sentiment} />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </div>

                      {/* Model */}
                      <div className="mb-4">
                        <span className="text-xs text-muted-foreground  block mb-1.5">
                          Model
                        </span>
                        <div className="flex items-center gap-2">
                          {getModelLogo(platform?.provider || '')}
                          <span className="text-sm">{platform?.model_name || platform?.name || 'Unknown'}</span>
                        </div>
                      </div>


                      {/* Sources */}
                      <div className="mb-4">
                        <span className="text-xs text-muted-foreground  block mb-1.5">
                          Sources {sources.length > 0 && `(${sources.length})`}
                        </span>
                        {sources.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {sources.slice(0, 10).map((source, idx) => {
                              // Extract a title from the URL path
                              let title = source.domain;
                              try {
                                const urlObj = new URL(source.url);
                                const path = urlObj.pathname;
                                if (path && path !== '/') {
                                  // Get last segment of path, remove extension, convert dashes/underscores to spaces
                                  const segments = path.split('/').filter(s => s);
                                  if (segments.length > 0) {
                                    title = segments[segments.length - 1]
                                      .replace(/\.[^.]+$/, '') // remove file extension
                                      .replace(/[-_]/g, ' ') // dashes/underscores to spaces
                                      .replace(/\b\w/g, c => c.toUpperCase()); // capitalize words
                                  }
                                }
                              } catch (e) {
                                // Use domain as fallback
                              }

                              // Truncate URL for display
                              const displayUrl = source.url.length > 35
                                ? source.url.substring(0, 35) + '...'
                                : source.url;

                              return (
                                <a
                                  key={idx}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={source.url}
                                  className="flex items-start gap-2 p-1.5 -mx-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                                >
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=32`}
                                    alt=""
                                    className="w-4 h-4 mt-0.5 rounded-sm flex-shrink-0"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs text-primary group-hover:underline block truncate">
                                      {title}
                                    </span>
                                    <span className="text-xs text-muted-foreground block mt-0.5 truncate">
                                      {displayUrl}
                                    </span>
                                  </div>
                                </a>
                              );
                            })}
                            {sources.length > 10 && (
                              <span className="text-xs text-muted-foreground">+{sources.length - 10} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </div>

                                      </div>
                  </ScrollArea>
                </div>
              </div>
            );
          })()}
          </TooltipProvider>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .response-row:hover {
          background-color: var(--gray-a3) !important;
        }

        /* Base markdown styles */
        .markdown-response {
          font-size: 13px;
          line-height: 1.6;
        }

        .markdown-response p {
          margin: 0 0 1em 0;
        }

        .markdown-response p:last-child {
          margin-bottom: 0;
        }

        .markdown-response h1,
        .markdown-response h2,
        .markdown-response h3,
        .markdown-response h4,
        .markdown-response h5,
        .markdown-response h6 {
          margin: 1.5em 0 0.5em 0;
          font-weight: 600;
          line-height: 1.3;
        }

        .markdown-response h1:first-child,
        .markdown-response h2:first-child,
        .markdown-response h3:first-child {
          margin-top: 0;
        }

        .markdown-response h1 { font-size: 1.5em; }
        .markdown-response h2 { font-size: 1.3em; }
        .markdown-response h3 { font-size: 1.1em; }

        .markdown-response ul,
        .markdown-response ol {
          margin: 0 0 1em 0;
          padding-left: 1.5em;
        }

        .markdown-response li {
          margin: 0.25em 0;
        }

        .markdown-response li > ul,
        .markdown-response li > ol {
          margin: 0.25em 0;
        }

        .markdown-response strong { font-weight: 600; }
        .markdown-response em { font-style: italic; }

        .markdown-response code {
          padding: 0.2em 0.4em;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.9em;
        }

        .markdown-response pre {
          padding: 1em;
          border-radius: 8px;
          overflow-x: auto;
          margin: 1em 0;
        }

        .markdown-response pre code {
          background: none;
          padding: 0;
          font-size: 0.85em;
        }

        .markdown-response blockquote {
          margin: 1em 0;
          padding-left: 1em;
        }

        .markdown-response table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }

        .markdown-response th,
        .markdown-response td {
          padding: 0.5em 0.75em;
          text-align: left;
        }

        .markdown-response hr {
          border: none;
          margin: 1.5em 0;
        }

        /* ===== Highlight Styles ===== */
        .highlight-brand {
          background-color: rgba(34, 197, 94, 0.2);
          color: inherit;
          padding: 0.1em 0.3em;
          border-radius: 3px;
          font-weight: 500;
        }

        .highlight-competitor {
          background-color: rgba(59, 130, 246, 0.15);
          color: inherit;
          padding: 0.1em 0.3em;
          border-radius: 3px;
        }

        .highlight-source {
          background-color: rgba(168, 85, 247, 0.12);
          color: inherit;
          padding: 0.1em 0.3em;
          border-radius: 3px;
          border-bottom: 1px dashed rgba(168, 85, 247, 0.5);
        }

        /* ===== Unified Light Theme for All Providers ===== */
        .markdown-openai,
        .markdown-anthropic,
        .markdown-google,
        .markdown-perplexity,
        .markdown-xai,
        .markdown-default {
          background-color: transparent;
          color: hsl(var(--foreground));
          font-family: inherit;
        }

        .markdown-openai .markdown-link,
        .markdown-anthropic .markdown-link,
        .markdown-google .markdown-link,
        .markdown-perplexity .markdown-link,
        .markdown-xai .markdown-link,
        .markdown-default .markdown-link {
          color: hsl(var(--primary));
          text-decoration: underline;
          background-color: rgba(59, 130, 246, 0.1);
          padding: 0.1em 0.3em;
          border-radius: 3px;
          transition: background-color 0.15s ease;
        }

        .markdown-openai .markdown-link:hover,
        .markdown-anthropic .markdown-link:hover,
        .markdown-google .markdown-link:hover,
        .markdown-perplexity .markdown-link:hover,
        .markdown-xai .markdown-link:hover,
        .markdown-default .markdown-link:hover {
          background-color: rgba(59, 130, 246, 0.2);
        }

        .markdown-openai code,
        .markdown-anthropic code,
        .markdown-google code,
        .markdown-perplexity code,
        .markdown-xai code,
        .markdown-default code {
          background-color: hsl(var(--muted));
          color: hsl(var(--foreground));
        }

        .markdown-openai pre,
        .markdown-anthropic pre,
        .markdown-google pre,
        .markdown-perplexity pre,
        .markdown-xai pre,
        .markdown-default pre {
          background-color: hsl(var(--muted));
          color: hsl(var(--foreground));
          border-radius: 8px;
          border: 1px solid hsl(var(--border));
        }

        .markdown-openai pre code,
        .markdown-anthropic pre code,
        .markdown-google pre code,
        .markdown-perplexity pre code,
        .markdown-xai pre code,
        .markdown-default pre code {
          background-color: transparent;
          color: inherit;
        }

        .markdown-openai blockquote,
        .markdown-anthropic blockquote,
        .markdown-google blockquote,
        .markdown-perplexity blockquote,
        .markdown-xai blockquote,
        .markdown-default blockquote {
          border-left: 3px solid hsl(var(--border));
          color: hsl(var(--muted-foreground));
        }

        .markdown-openai th,
        .markdown-anthropic th,
        .markdown-google th,
        .markdown-perplexity th,
        .markdown-xai th,
        .markdown-default th {
          background-color: hsl(var(--muted));
          font-weight: 600;
        }

        .markdown-openai th,
        .markdown-openai td,
        .markdown-anthropic th,
        .markdown-anthropic td,
        .markdown-google th,
        .markdown-google td,
        .markdown-perplexity th,
        .markdown-perplexity td,
        .markdown-xai th,
        .markdown-xai td,
        .markdown-default th,
        .markdown-default td {
          border: 1px solid hsl(var(--border));
        }

        .markdown-openai hr,
        .markdown-anthropic hr,
        .markdown-google hr,
        .markdown-perplexity hr,
        .markdown-xai hr,
        .markdown-default hr {
          border-top: 1px solid hsl(var(--border));
        }
      `}</style>
    </div>
  );
}
