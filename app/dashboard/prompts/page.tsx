'use client';

import { useState, useEffect, useRef } from 'react';

import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Progress } from '@/app/components/ui/progress';
import { Separator } from '@/app/components/ui/separator';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/app/components/ui/hover-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Zap,
  Rocket,
  Wand2,
  Box,
  Search,
  Check,
  X,
  Plus,
  Loader2,
  Info,
  Trash2,
  Sparkles,
  FolderPlus,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/app/components/ui/collapsible';
import VisibilityChart from '@/app/components/VisibilityChart';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import { formatLocalDate, formatLocalDateTime, formatTimeAgo } from '@/app/lib/dateUtils';

interface Metric {
  visibility: number;
  rank: number | null;
}

interface ModelResponse {
  executionId: number;
  platformId: number;
  result: string;
  completedAt: string;
  refreshDate?: string;
  brandMentions?: number;
  competitorsMentioned?: string[];
  analysisConfidence?: number;
  businessVisibility?: number;
}

interface VisibilityHistoryEntry {
  date: string;
  visibility: number;
}

interface Prompt {
  id: number;
  text: string;
  topicId: number;
  isCustom: boolean;
  metrics: Metric;
  responses: ModelResponse[];
  visibility_history?: VisibilityHistoryEntry[];
}

interface Topic {
  id: number;
  name: string;
  isCustom: boolean;
  metrics: Metric;
  prompts: Prompt[];
}

interface Platform {
  id: number;
  name?: string;
  provider: string;
  model_name: string;
  is_primary: boolean;
}

export default function PromptsPage() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
    const [executingPrompts, setExecutingPrompts] = useState<Set<number>>(new Set());
    const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showNewPromptDialog, setShowNewPromptDialog] = useState(false);
    const [newPromptText, setNewPromptText] = useState('');
    const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
    const [selectedPrompts, setSelectedPrompts] = useState<Set<number>>(new Set());
    const [deletingExecutionId, setDeletingExecutionId] = useState<number | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingPromptId, setDeletingPromptId] = useState<number | null>(null);
    const [showDeletePromptConfirm, setShowDeletePromptConfirm] = useState(false);
    const [deletingTopicId, setDeletingTopicId] = useState<number | null>(null);
    const [showDeleteTopicConfirm, setShowDeleteTopicConfirm] = useState(false);
    const [pendingExecutionId, setPendingExecutionId] = useState<number | null>(null);
    // New topic dialog state
    const [showNewTopicDialog, setShowNewTopicDialog] = useState(false);
    const [newTopicName, setNewTopicName] = useState('');
    const [topicSuggestions, setTopicSuggestions] = useState<Array<{ name: string; reason: string }>>([]);
    const [isLoadingTopicSuggestions, setIsLoadingTopicSuggestions] = useState(false);
    const [isCreatingTopic, setIsCreatingTopic] = useState(false);
    // Enhanced prompt dialog state
    const [promptSuggestions, setPromptSuggestions] = useState<Array<{ text: string; topicId: number; topicName: string; reason: string }>>([]);
    const [isLoadingPromptSuggestions, setIsLoadingPromptSuggestions] = useState(false);
    const { business, switchCount } = useBusiness();
    const { selectedPlatforms, platforms: contextPlatforms, refreshKey, dateRange, getDateRangeParams } = useDashboardFilters();
    const searchParams = useSearchParams();
    const router = useRouter();
    const eventSourceRef = useRef<EventSource | null>(null);

    const fetchModels = async (businessIdOverride?: number) => {
        try {
            const businessId = businessIdOverride || business?.id;
            if (!businessId) return;

            const response = await fetch(`/api/platforms?businessId=${businessId}`);

            if (response.ok) {
                const data = await response.json();
                setPlatforms(data.platforms || []);
            }
        } catch (error) {
            console.error('Error fetching platforms:', error);
        }
    };

    const fetchTopicsAndPrompts = async (isRefresh = false, businessIdOverride?: number) => {
        try {
            if (isRefresh) {
                setIsRefreshing(true);
            } else {
                setIsLoading(true);
            }
            const businessId = businessIdOverride || business?.id;
            if (!businessId) return;

            const { startDate, endDate } = getDateRangeParams();

            const url = new URL(`/api/dashboard/prompts`, window.location.origin);
            url.searchParams.append('businessId', String(businessId));
            url.searchParams.append('startDate', startDate);
            url.searchParams.append('endDate', endDate);

            // Add platform filter if specified and not all platforms selected
            if (selectedPlatforms.size > 0 && contextPlatforms.length > 0 && selectedPlatforms.size < contextPlatforms.length) {
                url.searchParams.append('platformIds', Array.from(selectedPlatforms).join(','));
            }

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                setTopics(data.topics || []);
            }
        } catch (error) {
            console.error('Error fetching topics and prompts:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    // Fetch data when business changes, switchCount increments, or date range changes
    useEffect(() => {
        if (business?.id) {
            // Clear all data immediately when fetching for new business
            setTopics([]);
            setPlatforms([]);
            setSelectedPrompt(null);
            setSelectedPrompts(new Set());
            setIsLoading(true);

            // Fetch with the current business.id
            fetchTopicsAndPrompts(false, business.id);
            fetchModels(business.id);
            setupEventStream(business.id);
        } else {
            setIsLoading(false);
        }

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, [business?.id, switchCount, refreshKey, dateRange]);

    // Handle promptId or executionId from query params - redirect to detail page
    useEffect(() => {
        const promptIdParam = searchParams.get('promptId');
        const executionIdParam = searchParams.get('executionId');

        if (promptIdParam) {
            const promptId = parseInt(promptIdParam);
            if (executionIdParam) {
                router.replace(`/dashboard/prompts/${promptId}?executionId=${executionIdParam}`);
            } else {
                router.replace(`/dashboard/prompts/${promptId}`);
            }
        }
    }, [searchParams, router]);

    // Handle action query param (for Quick Create navigation)
    useEffect(() => {
        const action = searchParams.get('action');
        if (action === 'add-prompt' && topics.length > 0) {
            setShowNewPromptDialog(true);
            // Clear the action param from URL
            window.history.replaceState({}, '', '/dashboard/prompts');
        }
    }, [searchParams, topics]);

    const setupEventStream = (businessId: number) => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(`/api/prompts/executions/stream?businessId=${businessId}`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'execution_update') {
                if (data.status === 'running') {
                    setExecutingPrompts(prev => new Set(prev).add(data.promptId));
                } else if (data.status === 'completed') {
                    updateSinglePromptResponse(data);

                    const prompt = topics
                        .flatMap(t => t.prompts)
                        .find(p => p.id === data.promptId);

                    if (prompt && prompt.responses.length >= platforms.length) {
                        setExecutingPrompts(prev => {
                            const next = new Set(prev);
                            next.delete(data.promptId);
                            return next;
                        });
                    }
                }
            }
        };

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            eventSource.close();
            setTimeout(() => setupEventStream(businessId), 5000);
        };
    };

    const updateSinglePromptResponse = (data: any) => {
        setTopics((prevTopics) => {
            return prevTopics.map((topic) => ({
                ...topic,
                prompts: topic.prompts.map((prompt) => {
                    if (prompt.id === data.promptId) {
                        const existingResponses = prompt.responses.filter(
                            (r) => r.platformId !== data.platformId || r.refreshDate !== data.refreshDate
                        );

                        return {
                            ...prompt,
                            responses: [
                                ...existingResponses,
                                {
                                    executionId: data.executionId,
                                    platformId: data.platformId,
                                    result: data.result,
                                    completedAt: data.completedAt,
                                    refreshDate: data.refreshDate,
                                    brandMentions: data.brandMentions,
                                    competitorsMentioned: data.competitorsMentioned,
                                    analysisConfidence: data.analysisConfidence,
                                    businessVisibility: data.businessVisibility,
                                }
                            ]
                        };
                    }
                    return prompt;
                })
            }));
        });

        if (selectedPrompt && selectedPrompt.id === data.promptId) {
            setSelectedPrompt((prev) => {
                if (!prev) return null;
                const existingResponses = prev.responses.filter(
                    (r) => r.platformId !== data.platformId || r.refreshDate !== data.refreshDate
                );
                return {
                    ...prev,
                    responses: [
                        ...existingResponses,
                        {
                            executionId: data.executionId,
                            platformId: data.platformId,
                            result: data.result,
                            completedAt: data.completedAt,
                            refreshDate: data.refreshDate,
                            brandMentions: data.brandMentions,
                            competitorsMentioned: data.competitorsMentioned,
                            analysisConfidence: data.analysisConfidence,
                            businessVisibility: data.businessVisibility,
                        }
                    ]
                };
            });

        }
    };

    const handleAddPrompt = async () => {
        if (!newPromptText.trim() || !selectedTopicId) return;

        try {
            const businessId = localStorage.getItem('onboardingBusinessId');
            if (!businessId) return;

            const response = await fetch('/api/dashboard/prompts', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    businessId: parseInt(businessId),
                    topicId: selectedTopicId,
                    promptText: newPromptText,
                    isCustom: true,
                }),
            });

            if (response.ok) {
                const data = await response.json();

                const newPrompt: Prompt = {
                    id: data.promptId,
                    text: newPromptText,
                    topicId: selectedTopicId,
                    isCustom: true,
                    metrics: {
                        visibility: 0,
                        rank: null,
                    },
                    responses: [],
                };

                setTopics((prevTopics) =>
                    prevTopics.map((topic) =>
                        topic.id === selectedTopicId
                            ? {...topic, prompts: [...topic.prompts, newPrompt]}
                            : topic
                    )
                );

                setNewPromptText('');
                setShowNewPromptDialog(false);
                setSelectedTopicId(null);

                setTimeout(() => {
                    executePrompt(data.promptId);
                }, 500);
            }
        } catch (error) {
            console.error('Error adding prompt:', error);
        }
    };

    const executePrompt = async (promptId: number) => {
            try {
                const businessId = localStorage.getItem('onboardingBusinessId');
                if (!businessId) return;

                await fetch('/api/prompts/executions', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        businessId: parseInt(businessId),
                        promptId,
                    }),
                });
            } catch (error) {
                console.error('Error executing prompt:', error);
            }
        };

    const executeSelectedPrompts = async () => {
        const promptIds = Array.from(selectedPrompts);
        for (const promptId of promptIds) {
            await executePrompt(promptId);
        }
        setSelectedPrompts(new Set());
    };

    const executeAllPrompts = async () => {
        try {
            const businessId = localStorage.getItem('onboardingBusinessId');
            if (!businessId) return;

            // Call API without promptId to execute all prompts
            await fetch('/api/prompts/executions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    businessId: parseInt(businessId),
                }),
            });
        } catch (error) {
            console.error('Error executing all prompts:', error);
        }
    };

    const togglePromptSelection = (promptId: number) => {
        setSelectedPrompts(prev => {
            const next = new Set(prev);
            if (next.has(promptId)) {
                next.delete(promptId);
            } else {
                next.add(promptId);
            }
            return next;
        });
    };

    const selectAllPrompts = () => {
        const allPromptIds = topics.flatMap(topic => topic.prompts.map(p => p.id));
        setSelectedPrompts(new Set(allPromptIds));
    };

    const deselectAllPrompts = () => {
        setSelectedPrompts(new Set());
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

            // Close dialog
            setShowDeleteConfirm(false);
            setDeletingExecutionId(null);

            // Refresh the main list to update averages
            await fetchTopicsAndPrompts();
        } catch (error: any) {
            console.error('Error deleting execution:', error);
            alert('Failed to delete execution: ' + error.message);
        }
    };

    const confirmDeleteExecution = (executionId: number) => {
        setDeletingExecutionId(executionId);
        setShowDeleteConfirm(true);
    };

    const handleDeletePrompt = async () => {
        if (!deletingPromptId || !business?.id) return;

        try {
            const response = await fetch(`/api/dashboard/prompts?promptId=${deletingPromptId}&businessId=${business.id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete prompt');
            }

            setShowDeletePromptConfirm(false);
            setDeletingPromptId(null);

            // Refresh the data
            await fetchTopicsAndPrompts();
        } catch (error: any) {
            console.error('Error deleting prompt:', error);
            alert('Failed to delete prompt: ' + error.message);
        }
    };

    const confirmDeletePrompt = (promptId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setDeletingPromptId(promptId);
        setShowDeletePromptConfirm(true);
    };

    const handleDeleteTopic = async () => {
        if (!deletingTopicId) return;

        try {
            const response = await fetch(`/api/dashboard/topics?topicId=${deletingTopicId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete topic');
            }

            setShowDeleteTopicConfirm(false);
            setDeletingTopicId(null);

            // Refresh the data
            await fetchTopicsAndPrompts();
        } catch (error: any) {
            console.error('Error deleting topic:', error);
            alert('Failed to delete topic: ' + error.message);
        }
    };

    const confirmDeleteTopic = (topicId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setDeletingTopicId(topicId);
        setShowDeleteTopicConfirm(true);
    };

    // Fetch topic suggestions
    const fetchTopicSuggestions = async () => {
        if (!business?.id) return;
        setIsLoadingTopicSuggestions(true);
        try {
            const response = await fetch('/api/dashboard/topics/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businessId: business.id }),
            });
            if (response.ok) {
                const data = await response.json();
                setTopicSuggestions(data.suggestions || []);
            }
        } catch (error) {
            console.error('Error fetching topic suggestions:', error);
        } finally {
            setIsLoadingTopicSuggestions(false);
        }
    };

    // Create a new topic
    const handleCreateTopic = async (name?: string) => {
        const topicName = name || newTopicName;
        if (!topicName.trim() || !business?.id) return;

        setIsCreatingTopic(true);
        try {
            const response = await fetch('/api/dashboard/topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessId: business.id,
                    name: topicName.trim(),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                // Add the new topic to local state
                const newTopic: Topic = {
                    id: Number(data.topicId),
                    name: data.name,
                    isCustom: true,
                    metrics: { visibility: 0, rank: null },
                    prompts: [],
                };
                setTopics(prev => [...prev, newTopic]);
                setNewTopicName('');
                setShowNewTopicDialog(false);
                setTopicSuggestions([]);
                // Expand the new topic
                setExpandedTopics(prev => new Set(prev).add(Number(data.topicId)));
            }
        } catch (error) {
            console.error('Error creating topic:', error);
        } finally {
            setIsCreatingTopic(false);
        }
    };

    // Fetch prompt suggestions
    const fetchPromptSuggestions = async (topicId?: number) => {
        if (!business?.id) return;
        setIsLoadingPromptSuggestions(true);
        try {
            const response = await fetch('/api/dashboard/prompts/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessId: business.id,
                    topicId: topicId || undefined,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                setPromptSuggestions(data.suggestions || []);
            }
        } catch (error) {
            console.error('Error fetching prompt suggestions:', error);
        } finally {
            setIsLoadingPromptSuggestions(false);
        }
    };

    // Add a suggested prompt
    const handleAddSuggestedPrompt = async (suggestion: { text: string; topicId: number }) => {
        if (!business?.id) return;

        try {
            const response = await fetch('/api/dashboard/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessId: business.id,
                    topicId: suggestion.topicId,
                    promptText: suggestion.text,
                    isCustom: true,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const newPrompt: Prompt = {
                    id: data.promptId,
                    text: suggestion.text,
                    topicId: suggestion.topicId,
                    isCustom: true,
                    metrics: { visibility: 0, rank: null },
                    responses: [],
                };

                setTopics(prevTopics =>
                    prevTopics.map(topic =>
                        topic.id === suggestion.topicId
                            ? { ...topic, prompts: [...topic.prompts, newPrompt] }
                            : topic
                    )
                );

                // Remove from suggestions
                setPromptSuggestions(prev => prev.filter(s => s.text !== suggestion.text));

                // Execute the prompt
                setTimeout(() => executePrompt(data.promptId), 500);
            }
        } catch (error) {
            console.error('Error adding suggested prompt:', error);
        }
    };

    // formatTimeAgo is now imported from dateUtils

    const getModelLogo = (provider: string) => {
            const iconProps = {className: "h-4 w-4 shrink-0"};
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

    const toggleTopic = (topicId: number) => {
            setExpandedTopics(prev => {
                const next = new Set(prev);
                if (next.has(topicId)) {
                    next.delete(topicId);
                } else {
                    next.add(topicId);
                }
                return next;
            });
        };

    const filteredTopics = topics
        .map(topic => {
            // Filter prompts based on search
            let filteredPrompts = topic.prompts;

            if (searchQuery) {
                filteredPrompts = filteredPrompts.filter(prompt =>
                    prompt.text.toLowerCase().includes(searchQuery.toLowerCase())
                );
            }

            return { ...topic, prompts: filteredPrompts };
        })
        .filter(topic =>
            // Include topic if it matches search OR has matching prompts
            topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            topic.prompts.length > 0
        );

    if (isLoading) {
            return (
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading prompts...</span>
                    </div>
                </div>
            );
        }

        const hasExecutingPrompts = executingPrompts.size > 0;
        const totalPrompts = topics.reduce((total, topic) => total + topic.prompts.length, 0);

        return (
            <div>
                {/* Executing Prompts Banner */}
                {hasExecutingPrompts && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            <div>
                                <span className="text-sm text-blue-800">
                                    Executing {executingPrompts.size} {executingPrompts.size === 1 ? 'prompt' : 'prompts'} across AI platforms
                                </span>
                                <span className="text-xs text-blue-700 block mt-0.5">
                                    Results will appear automatically as they complete. This may take a few minutes.
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Page Header */}
                <div className="flex justify-between items-center mb-2 h-5">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">Topics</span>
                        <span className="text-muted-foreground text-sm">·</span>
                        <span className="text-sm text-gray-400">
                            {topics.reduce((total, topic) => total + topic.prompts.length, 0)} prompts across {topics.length} topics
                        </span>
                    </div>
                    <div className="flex gap-2 items-center">
                        {selectedPrompts.size > 0 ? (
                            <>
                                <button
                                    onClick={executeSelectedPrompts}
                                    className="flex items-center gap-1 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded"
                                >
                                    <Rocket className="h-3 w-3" />
                                    Execute {selectedPrompts.size} Selected
                                </button>
                                <button
                                    onClick={deselectAllPrompts}
                                    className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Clear Selection
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        setShowNewTopicDialog(true);
                                        fetchTopicSuggestions();
                                    }}
                                    className="flex items-center gap-1 px-2 py-0.5 text-xs border rounded hover:bg-muted"
                                >
                                    <FolderPlus className="h-3 w-3" />
                                    Add Topic
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedTopicId(topics[0]?.id || null);
                                        setShowNewPromptDialog(true);
                                        fetchPromptSuggestions();
                                    }}
                                    disabled={topics.length === 0}
                                    className="flex items-center gap-1 px-2 py-0.5 text-xs border rounded hover:bg-muted disabled:opacity-50"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add Prompt
                                </button>
                                <button
                                    onClick={executeAllPrompts}
                                    disabled={totalPrompts === 0}
                                    className="flex items-center gap-1 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                                >
                                    <Rocket className="h-3 w-3" />
                                    Execute All
                                </button>
                                <button
                                    onClick={selectAllPrompts}
                                    disabled={totalPrompts === 0}
                                    className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                                >
                                    Select All
                                </button>
                            </>
                        )}
                        <div className="relative">
                            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search topics or prompts..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-[180px] pl-7 h-6 text-xs"
                            />
                        </div>
                    </div>
                </div>

                {/* Collapsible Topics List */}
                <div className="flex flex-col gap-2">
                    {filteredTopics.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-12">
                            {searchQuery ? (
                                <>
                                    <Search className="h-8 w-8 text-muted-foreground/50" />
                                    <div className="text-center">
                                        <p className="text-sm mb-2">
                                            No results found
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Try adjusting your search query
                                        </p>
                                    </div>
                                </>
                            ) : totalPrompts === 0 ? (
                                <>
                                    <Info className="h-8 w-8 text-muted-foreground/50" />
                                    <div className="text-center">
                                        <p className="text-sm mb-2">
                                            No prompts created yet
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Complete the onboarding process to create prompts
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Info className="h-8 w-8 text-gray-300" />
                                    <div className="text-center">
                                        <p className="text-gray-400 text-sm mb-2">
                                            No data for selected date range
                                        </p>
                                        <p className="text-gray-400 text-sm">
                                            Try selecting a different date range or refresh to see latest results
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        filteredTopics.map((topic) => (
                            <Collapsible
                                key={`topic-${topic.id}`}
                                open={expandedTopics.has(topic.id)}
                                onOpenChange={() => toggleTopic(topic.id)}
                                className="flex flex-col gap-2"
                            >
                                {/* Topic Header */}
                                <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                                    <CollapsibleTrigger asChild>
                                        <div className="flex items-center gap-3 flex-1 cursor-pointer">
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <ChevronsUpDown className="h-4 w-4" />
                                                <span className="sr-only">Toggle</span>
                                            </Button>
                                            <div>
                                                <span className="text-sm">{topic.name}</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    ({topic.prompts.length})
                                                </span>
                                            </div>
                                        </div>
                                    </CollapsibleTrigger>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <Progress value={topic.metrics.visibility} className="w-[60px]" />
                                            <span className="text-xs">{topic.metrics.visibility}%</span>
                                        </div>
                                        {topic.metrics.rank !== null && (
                                            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                                #{topic.metrics.rank}
                                            </Badge>
                                        )}
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTopicId(topic.id);
                                                    setShowNewPromptDialog(true);
                                                }}
                                                title="Add new prompt to this topic"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    confirmDeleteTopic(topic.id, e);
                                                }}
                                                title="Delete this topic and all its prompts"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Prompts */}
                                <CollapsibleContent className="flex flex-col gap-2">
                                    {topic.prompts.map((prompt) => (
                                        <div
                                            key={`prompt-${prompt.id}`}
                                            className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 ml-6 cursor-pointer hover:bg-muted/50"
                                            onClick={() => router.push(`/dashboard/prompts/${prompt.id}`)}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        checked={selectedPrompts.has(prompt.id)}
                                                        onCheckedChange={() => togglePromptSelection(prompt.id)}
                                                    />
                                                </div>
                                                <span className="text-sm truncate">{prompt.text}</span>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <Progress value={prompt.metrics.visibility} className="w-[60px]" />
                                                    <span className="text-xs">{prompt.metrics.visibility}%</span>
                                                </div>
                                                {prompt.metrics.rank !== null && (
                                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                                        #{prompt.metrics.rank}
                                                    </Badge>
                                                )}
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-blue-600"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            executePrompt(prompt.id);
                                                        }}
                                                        title="Execute this prompt"
                                                    >
                                                        <Rocket className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                                        onClick={(e) => confirmDeletePrompt(prompt.id, e)}
                                                        title="Delete this prompt"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </CollapsibleContent>
                            </Collapsible>
                        ))
                    )}
                </div>

                {/* Add Topic Dialog */}
                <Dialog open={showNewTopicDialog} onOpenChange={(open) => {
                    setShowNewTopicDialog(open);
                    if (!open) {
                        setNewTopicName('');
                        setTopicSuggestions([]);
                    }
                }}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Add New Topic</DialogTitle>
                            <DialogDescription>
                                Create a new topic to organize your prompts.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="text-sm block mb-1">Topic Name</label>
                                <Input
                                    placeholder="Enter topic name..."
                                    value={newTopicName}
                                    onChange={(e) => setNewTopicName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newTopicName.trim()) {
                                            handleCreateTopic();
                                        }
                                    }}
                                />
                            </div>

                            {/* AI Suggestions */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm flex items-center gap-1">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        AI Suggested Topics
                                    </label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs"
                                        onClick={fetchTopicSuggestions}
                                        disabled={isLoadingTopicSuggestions}
                                    >
                                        {isLoadingTopicSuggestions ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            'Refresh'
                                        )}
                                    </Button>
                                </div>
                                {isLoadingTopicSuggestions ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : topicSuggestions.length > 0 ? (
                                    <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                                        {topicSuggestions.map((suggestion, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-start justify-between gap-2 p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                                                onClick={() => handleCreateTopic(suggestion.name)}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium">{suggestion.name}</p>
                                                    <p className="text-xs text-muted-foreground line-clamp-2">{suggestion.reason}</p>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground text-center py-4">
                                        No suggestions available. Try refreshing.
                                    </p>
                                )}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowNewTopicDialog(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => handleCreateTopic()}
                                disabled={!newTopicName.trim() || isCreatingTopic}
                            >
                                {isCreatingTopic ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Topic'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Add Prompt Dialog */}
                <Dialog open={showNewPromptDialog} onOpenChange={(open) => {
                    setShowNewPromptDialog(open);
                    if (!open) {
                        setNewPromptText('');
                        setSelectedTopicId(null);
                        setPromptSuggestions([]);
                    }
                }}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Add New Prompt</DialogTitle>
                            <DialogDescription>
                                Create a custom prompt or choose from AI suggestions.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-4 overflow-y-auto flex-1">
                            {/* Topic Selection */}
                            <div>
                                <label className="text-sm block mb-1">Topic</label>
                                <select
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    value={selectedTopicId || ''}
                                    onChange={(e) => {
                                        const topicId = parseInt(e.target.value);
                                        setSelectedTopicId(topicId);
                                        fetchPromptSuggestions(topicId);
                                    }}
                                >
                                    <option value="">Select a topic...</option>
                                    {topics.map(topic => (
                                        <option key={topic.id} value={topic.id}>{topic.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Manual Input */}
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <label className="text-sm cursor-help">Custom Prompt</label>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-[280px] text-left">
                                            <p className="mb-2">Prompt Framework Tips:</p>
                                            <p className="text-xs mb-1"><strong>Comparison:</strong> "Best X for Y", "X vs Y"</p>
                                            <p className="text-xs mb-1"><strong>Decision:</strong> "[brand] reviews", "Is [brand] worth it?"</p>
                                            <p className="text-xs"><strong>Personas:</strong> "I am a [role] looking for..."</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Enter your prompt..."
                                        value={newPromptText}
                                        onChange={(e) => setNewPromptText(e.target.value)}
                                        className="flex-1"
                                    />
                                    <Button
                                        onClick={handleAddPrompt}
                                        disabled={!newPromptText.trim() || !selectedTopicId}
                                    >
                                        Add
                                    </Button>
                                </div>
                            </div>

                            {/* AI Suggestions */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm flex items-center gap-1">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        AI Suggested Prompts
                                    </label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs"
                                        onClick={() => fetchPromptSuggestions(selectedTopicId || undefined)}
                                        disabled={isLoadingPromptSuggestions}
                                    >
                                        {isLoadingPromptSuggestions ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            'Refresh'
                                        )}
                                    </Button>
                                </div>
                                {isLoadingPromptSuggestions ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : promptSuggestions.length > 0 ? (
                                    <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto">
                                        {promptSuggestions.map((suggestion, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-start justify-between gap-2 p-2 rounded-md border hover:bg-muted/50"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm">{suggestion.text}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant="secondary" className="text-xs">
                                                            {suggestion.topicName}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground line-clamp-1">
                                                            {suggestion.reason}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0"
                                                    onClick={() => handleAddSuggestedPrompt(suggestion)}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground text-center py-6">
                                        {topics.length === 0
                                            ? 'Create a topic first to get prompt suggestions.'
                                            : 'No suggestions available. Try selecting a topic or refreshing.'}
                                    </p>
                                )}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowNewPromptDialog(false)}>
                                Done
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Execution Confirmation Dialog */}
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

                {/* Delete Prompt Confirmation Dialog */}
                <AlertDialog open={showDeletePromptConfirm} onOpenChange={setShowDeletePromptConfirm}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete this prompt? All execution history for this prompt will also be deleted. If this is the last prompt in the topic, the topic will be removed.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeletePrompt} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete Prompt
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Delete Topic Confirmation Dialog */}
                <AlertDialog open={showDeleteTopicConfirm} onOpenChange={setShowDeleteTopicConfirm}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Topic</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete this topic? All prompts and their execution history in this topic will also be deleted.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteTopic} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete Topic
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Prompt Details Slide Panel */}
                {isDetailsPanelOpen && (
                    <div
                        className="fixed top-0 right-0 bottom-0 w-[80%] max-w-[1600px] bg-background border-l shadow-2xl z-[1000] flex flex-col animate-in slide-in-from-right"
                    >
                        {selectedPrompt && (
                            <>
                                {/* Header */}
                                <div className="p-4 border-b bg-muted/50">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 mr-4">
                                            <span className="text-xs text-muted-foreground">Prompt</span>
                                            <h2 className="text-lg mt-1">
                                                {selectedPrompt.text}
                                            </h2>
                                            <span className="text-sm text-muted-foreground mt-2">
                                                {selectedPrompt.responses.length} executions during this time period
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setIsDetailsPanelOpen(false)}
                                        >
                                            <X className="h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>

                                <ScrollArea className="flex-1">
                                    <div className="p-4">

                                        {/* Visibility Chart */}
                                        {selectedPrompt.visibility_history && selectedPrompt.visibility_history.length > 0 && (
                                            <div className="mb-4">
                                                <VisibilityChart
                                                    data={selectedPrompt.visibility_history}
                                                    businessName={business?.businessName || 'Your Brand'}
                                                    responses={selectedPrompt.responses}
                                                />
                                            </div>
                                        )}

                                        {/* LLM Platform Responses - Show History */}
                                        {selectedPrompt.responses.length === 0 ? (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle>LLM Response History</CardTitle>
                                                    <CardDescription>Platform responses over time</CardDescription>
                                                </CardHeader>
                                                <CardContent className="flex flex-col items-center justify-center py-4">
                                                    <Wand2 className="h-6 w-6 text-muted-foreground/50" />
                                                    <span className="text-xs text-muted-foreground mt-2">No responses yet</span>
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <Card className="p-0">
                                                <div className="p-4 pb-3 space-y-1.5">
                                                    <CardTitle>LLM Response History</CardTitle>
                                                    <CardDescription>Platform responses over time</CardDescription>
                                                </div>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-muted/50">
                                                            <TableHead className="w-[40px]"></TableHead>
                                                            <TableHead className="w-[100px]">Date</TableHead>
                                                            <TableHead className="w-[80px]">Mentioned</TableHead>
                                                            <TableHead className="w-[180px]">Mentions</TableHead>
                                                            <TableHead className="w-[300px]">Response</TableHead>
                                                            <TableHead className="w-[120px]">Platform</TableHead>
                                                            <TableHead className="w-[50px]"></TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {selectedPrompt.responses
                                                            .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                                                            .map((response, index) => {
                                                                const platform = platforms.find(p => p.id === response.platformId);
                                                                const responseKey = `execution-${response.executionId}`;
                                                                const isExpanded = expandedResponses.has(responseKey);

                                                                // Use actual mention data from the response
                                                                const isMentioned = (response.brandMentions || 0) > 0;
                                                                const competitorLogos = response.competitorsMentioned || [];

                                                                return (
                                                                    <>
                                                                        <TableRow
                                                                            key={responseKey}
                                                                            id={responseKey}
                                                                            className={`cursor-pointer ${isExpanded ? 'bg-muted/50' : ''}`}
                                                                            onClick={() => {
                                                                                setExpandedResponses(prev => {
                                                                                    const next = new Set(prev);
                                                                                    if (next.has(responseKey)) {
                                                                                        next.delete(responseKey);
                                                                                    } else {
                                                                                        next.add(responseKey);
                                                                                    }
                                                                                    return next;
                                                                                });
                                                                            }}
                                                                        >
                                                                            <TableCell>
                                                                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                                                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> :
                                                                                        <ChevronRight className="h-4 w-4" />}
                                                                                </Button>
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <span className="text-sm">
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
                                                                            <TableCell>
                                                                                {competitorLogos.length > 0 ? (
                                                                                    <HoverCard>
                                                                                        <HoverCardTrigger>
                                                                                            <div className="flex gap-1 items-center flex-nowrap">
                                                                                                {competitorLogos.slice(0, 2).map((competitor, idx) => (
                                                                                                    <Badge key={idx} variant="secondary" className="bg-blue-100 text-blue-800">
                                                                                                        {competitor}
                                                                                                    </Badge>
                                                                                                ))}
                                                                                                {competitorLogos.length > 2 && (
                                                                                                    <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                                                                                                        +{competitorLogos.length - 2}
                                                                                                    </Badge>
                                                                                                )}
                                                                                            </div>
                                                                                        </HoverCardTrigger>
                                                                                        <HoverCardContent className="w-auto max-w-[300px]">
                                                                                            <div className="flex gap-1 flex-wrap">
                                                                                                {competitorLogos.map((competitor, idx) => (
                                                                                                    <Badge key={idx} variant="secondary" className="bg-blue-100 text-blue-800">
                                                                                                        {competitor}
                                                                                                    </Badge>
                                                                                                ))}
                                                                                            </div>
                                                                                        </HoverCardContent>
                                                                                    </HoverCard>
                                                                                ) : (
                                                                                    <span className="text-xs text-muted-foreground">-</span>
                                                                                )}
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <span className="text-sm line-clamp-1">
                                                                                    {response.result}
                                                                                </span>
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <div className="flex items-center gap-2">
                                                                                    {getModelLogo(platform?.provider || '')}
                                                                                    <span className="text-sm">{platform?.name || platform?.provider || 'Unknown'}</span>
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                                                                    onClick={() => confirmDeleteExecution(response.executionId)}
                                                                                    title="Delete this response"
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            </TableCell>
                                                                        </TableRow>

                                                                        {isExpanded && (
                                                                            <TableRow>
                                                                                <TableCell></TableCell>
                                                                                <TableCell colSpan={6} className="bg-muted/30 p-3">
                                                                                    <div className="bg-background rounded-md p-4 border">
                                                                                        <div className="flex flex-col gap-3">
                                                                                            <div>
                                                                                                <span className="text-xs text-muted-foreground">Full Response</span>
                                                                                                <Separator className="my-2" />
                                                                                                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                                                                                    {response.result}
                                                                                                </p>
                                                                                            </div>

                                                                                            <div className="flex gap-4 mt-2">
                                                                                                <div>
                                                                                                    <span className="text-xs text-muted-foreground">Model</span>
                                                                                                    <span className="text-sm block">{platform?.model_name || platform?.name || 'Unknown'}</span>
                                                                                                </div>
                                                                                                <div>
                                                                                                    <span className="text-xs text-muted-foreground">Completed At</span>
                                                                                                    <span className="text-sm block">{formatLocalDateTime(response.completedAt)}</span>
                                                                                                </div>
                                                                                                <div>
                                                                                                    <span className="text-xs text-muted-foreground">Brand Mentions</span>
                                                                                                    <span className="text-sm block">{response.brandMentions || 0}</span>
                                                                                                </div>
                                                                                                {response.analysisConfidence !== undefined && (
                                                                                                    <div>
                                                                                                        <span className="text-xs text-muted-foreground">Confidence</span>
                                                                                                        <span className="text-sm block">{(response.analysisConfidence * 100).toFixed(0)}%</span>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>

                                                                                            {competitorLogos.length > 0 && (
                                                                                                <div className="mt-3">
                                                                                                    <span className="text-xs text-muted-foreground">Competitors Mentioned</span>
                                                                                                    <div className="flex gap-2 mt-2 flex-wrap">
                                                                                                        {competitorLogos.map((competitor, idx) => (
                                                                                                            <Badge
                                                                                                                key={idx}
                                                                                                                variant="outline"
                                                                                                                className="text-blue-800"
                                                                                                            >
                                                                                                                {competitor}
                                                                                                            </Badge>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        )}
                                                                    </>
                                                                );
                                                            })}
                                                    </TableBody>
                                                </Table>
                                            </Card>
                                        )}
                                    </div>
                                </ScrollArea>
                            </>
                        )}
                    </div>
                )}

                {/* Overlay */}
                {isDetailsPanelOpen && (
                    <div
                        onClick={() => setIsDetailsPanelOpen(false)}
                        className="fixed inset-0 bg-black/30 z-[999] animate-in fade-in"
                    />
                )}
            </div>
        );
    }
