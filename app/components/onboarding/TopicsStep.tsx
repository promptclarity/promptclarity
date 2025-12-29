'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';
import { BusinessInfo } from '@/app/lib/types';

interface Topic {
  id: string;
  name: string;
  isCustom?: boolean;
}

interface TopicsStepProps {
  businessData: BusinessInfo;
  topics: Topic[];
  onUpdate: (topics: Topic[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function TopicsStep({
  businessData,
  topics,
  onUpdate,
  onNext,
  onBack,
}: TopicsStepProps) {
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(topics);
  const [customTopic, setCustomTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const hasStartedGeneration = useRef(false);

  useEffect(() => {
    // Automatically generate topics when component mounts if no topics exist
    if (topics.length === 0 && !hasGenerated && !hasStartedGeneration.current) {
      hasStartedGeneration.current = true;
      generateTopics();
    }
  }, []);

  const generateTopics = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const businessId = localStorage.getItem('onboardingBusinessId');
      if (!businessId) {
        throw new Error('Business ID not found');
      }

      const response = await fetch('/api/onboarding/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId),
          generateSuggestions: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to generate topics');
      }

      const data = await response.json();
      setSelectedTopics(data.topics);
      setHasGenerated(true);
    } catch (error) {
      console.error('Error generating topics:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate topics. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddCustomTopic = () => {
    if (customTopic.trim()) {
      const newTopic: Topic = {
        id: `custom-${Date.now()}`,
        name: customTopic.trim(),
        isCustom: true,
      };
      setSelectedTopics([...selectedTopics, newTopic]);
      setCustomTopic('');
    }
  };

  const handleRemoveTopic = (topicId: string) => {
    setSelectedTopics(prev => prev.filter(topic => topic.id !== topicId));
  };

  const handleSubmit = async () => {
    if (selectedTopics.length === 0) {
      setError('Please add at least one topic');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const businessId = localStorage.getItem('onboardingBusinessId');
      const response = await fetch('/api/onboarding/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId!),
          topics: selectedTopics,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save topics');
      }

      const data = await response.json();
      // Use the saved topics with real database IDs instead of local state with temp IDs
      onUpdate(data.topics);
      onNext();
    } catch (error) {
      console.error('Error saving topics:', error);
      setError('Failed to save topics. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-base font-medium">Analyzing your business...</p>
        <p className="text-sm text-muted-foreground text-center">
          Generating topics for {businessData.businessName} — this may take a few minutes while we gather the latest info from the web.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        AI has generated topics based on your business. You can add or remove topics.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-3">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={generateTopics}
            disabled={isGenerating}
          >
            Regenerate Topics
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto grid gap-2 pr-1">
          {selectedTopics.map((topic) => (
            <div
              key={topic.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-background"
            >
              <span className="text-sm font-medium">{topic.name}</span>
              <button
                onClick={() => handleRemoveTopic(topic.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Remove topic"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add custom topic..."
          value={customTopic}
          onChange={(e) => setCustomTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTopic()}
          className="flex-1"
        />
        <Button
          onClick={handleAddCustomTopic}
          variant="outline"
          size="icon"
          aria-label="Add Topic"
          className="h-9 w-9"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 rounded-lg bg-muted border border-border">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{selectedTopics.length}</span> topics will be tracked. You can add more later.
        </p>
      </div>

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || selectedTopics.length === 0}
        >
          {isLoading ? 'Saving...' : 'Next: Generate Prompts'}
        </Button>
      </div>
    </div>
  );
}
