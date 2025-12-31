'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Plus, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { BusinessInfo, Topic, Prompt } from '@/app/lib/types';

interface PromptsStepProps {
  businessData: BusinessInfo;
  topics: Topic[];
  prompts: Prompt[];
  onUpdate: (prompts: Prompt[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function PromptsStep({
  businessData,
  topics,
  prompts,
  onUpdate,
  onNext,
  onBack,
}: PromptsStepProps) {
  const [selectedPrompts, setSelectedPrompts] = useState<Prompt[]>(prompts);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const hasStartedGeneration = useRef(false);

  useEffect(() => {
    // Automatically generate prompts when component mounts if no prompts exist
    if (prompts.length === 0 && !hasGenerated && !hasStartedGeneration.current) {
      hasStartedGeneration.current = true;
      generatePrompts();
    }
  }, []);

  const generatePrompts = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const businessId = localStorage.getItem('onboardingBusinessId');
      if (!businessId) {
        throw new Error('Business ID not found');
      }

      const response = await fetch('/api/onboarding/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId),
          generateSuggestions: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate prompts');
      }

      const data = await response.json();
      setSelectedPrompts(data.prompts);
      setHasGenerated(true);
    } catch (error) {
      console.error('Error generating prompts:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate prompts. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddCustomPrompt = () => {
    if (customPrompt.trim() && selectedTopic) {
      const newPrompt: Prompt = {
        id: `custom-${Date.now()}`,
        text: customPrompt.trim(),
        topicId: selectedTopic,
        topicName: topics.find(t => t.id === selectedTopic)?.name,
        isCustom: true,
      };
      setSelectedPrompts([...selectedPrompts, newPrompt]);
      setCustomPrompt('');
      setSelectedTopic('');
    }
  };

  const handleRemovePrompt = (promptId: string) => {
    setSelectedPrompts(prev => prev.filter(prompt => prompt.id !== promptId));
  };

  const handleSubmit = async () => {
    if (selectedPrompts.length === 0) {
      setError('Please add at least one prompt');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const businessId = localStorage.getItem('onboardingBusinessId');
      const response = await fetch('/api/onboarding/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId!),
          prompts: selectedPrompts,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save prompts');
      }

      onUpdate(selectedPrompts);
      onNext();
    } catch (error) {
      console.error('Error saving prompts:', error);
      setError('Failed to save prompts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-base font-medium">Generating search prompts...</p>
        <p className="text-sm text-muted-foreground">
          AI is creating prompts based on your topics
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        AI has generated search prompts for your topics. These will be used to track your brand mentions.
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
            onClick={generatePrompts}
            disabled={isGenerating}
          >
            Regenerate Prompts
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto grid gap-2 pr-1">
          {selectedPrompts.map((prompt) => (
            <div
              key={prompt.id}
              className="flex items-start justify-between p-3 rounded-lg border border-border bg-background gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{prompt.text}</p>
                {prompt.topicName && (
                  <p className="text-xs text-muted-foreground mt-1">Topic: {prompt.topicName}</p>
                )}
              </div>
              <button
                onClick={() => handleRemovePrompt(prompt.id)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                aria-label="Remove prompt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Add Custom Prompt</Label>
        <div className="flex gap-2">
          <Select value={selectedTopic} onValueChange={setSelectedTopic}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select topic..." />
            </SelectTrigger>
            <SelectContent>
              {topics.map(topic => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Enter custom prompt..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustomPrompt()}
            className="flex-1"
          />
          <Button
            onClick={handleAddCustomPrompt}
            variant="outline"
            size="icon"
            aria-label="Add Prompt"
            disabled={!customPrompt.trim() || !selectedTopic}
            className="h-9 w-9"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-muted border border-border">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{selectedPrompts.length}</span> prompts will be tracked. You can add more later.
        </p>
      </div>

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || selectedPrompts.length === 0}
        >
          {isLoading ? 'Saving...' : 'Next: Add Competitors'}
        </Button>
      </div>
    </div>
  );
}
