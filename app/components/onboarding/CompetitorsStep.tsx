'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Plus, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Competitor } from '@/app/lib/types';

interface CompetitorsStepProps {
  competitors: Competitor[];
  onUpdate: (competitors: Competitor[]) => void;
  onComplete: () => void;
  onBack: () => void;
  isLoading: boolean;
}

export default function CompetitorsStep({
  competitors,
  onUpdate,
  onComplete,
  onBack,
  isLoading,
}: CompetitorsStepProps) {
  const [localCompetitors, setLocalCompetitors] = useState<Competitor[]>(competitors);
  const [newCompetitor, setNewCompetitor] = useState({ name: '', website: '', description: '' });
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasStartedFetch = useRef(false);

  useEffect(() => {
    if (competitors.length === 0 && !hasStartedFetch.current) {
      hasStartedFetch.current = true;
      fetchGeneratedCompetitors();
    }
  }, []);

  const fetchGeneratedCompetitors = async () => {
    setIsFetching(true);
    setError(null);

    try {
      const businessId = localStorage.getItem('onboardingBusinessId');

      if (!businessId) {
        throw new Error('Business ID not found. Please go back and complete the business step.');
      }

      const response = await fetch('/api/onboarding/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId),
          generateSuggestions: true
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate competitors');
      }

      if (data.competitors && Array.isArray(data.competitors)) {
        setLocalCompetitors(data.competitors);
      }
    } catch (error) {
      console.error('Error fetching competitors:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate competitors');
    } finally {
      setIsFetching(false);
    }
  };

  const handleAddCompetitor = async () => {
    if (newCompetitor.name.trim()) {
      const website = newCompetitor.website.trim() || undefined;
      const competitor: Competitor = {
        id: `custom-${Date.now()}`,
        name: newCompetitor.name.trim(),
        website,
        description: newCompetitor.description.trim() || undefined,
        isCustom: true,
      };

      // Add competitor immediately (without logo)
      setLocalCompetitors(prev => [...prev, competitor]);
      setNewCompetitor({ name: '', website: '', description: '' });

      // Fetch logo in background if website is provided
      if (website) {
        try {
          const response = await fetch(`/api/favicon?domain=${encodeURIComponent(website)}`);
          if (response.ok) {
            const data = await response.json();
            if (data.logo) {
              // Update the competitor with the logo
              setLocalCompetitors(prev =>
                prev.map(c => c.id === competitor.id ? { ...c, logo: data.logo } : c)
              );
            }
          }
        } catch (error) {
          console.error('Error fetching logo:', error);
        }
      }
    }
  };

  const handleRemoveCompetitor = (competitorId: string) => {
    setLocalCompetitors(prev => prev.filter(comp => comp.id !== competitorId));
  };

  const handleRegenerate = () => {
    setLocalCompetitors([]);
    fetchGeneratedCompetitors();
  };

  const handleSubmit = async () => {
    try {
      const businessId = localStorage.getItem('onboardingBusinessId');

      if (!businessId) {
        setError('Business ID not found. Please go back and complete the business step.');
        return;
      }

      // Save competitors to database
      const response = await fetch('/api/onboarding/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: parseInt(businessId),
          competitors: localCompetitors.map(comp => ({
            name: comp.name,
            website: comp.website,
            description: comp.description,
            isCustom: comp.isCustom || false
          }))
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save competitors');
      }

      // Update parent component and proceed
      onUpdate(localCompetitors);
      onComplete();
    } catch (error) {
      console.error('Error saving competitors:', error);
      setError(error instanceof Error ? error.message : 'Failed to save competitors');
    }
  };

  if (isFetching) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Analyzing your business to identify key competitors...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        We've identified key competitors for your business. Review and modify the list to match your tracking needs.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium">
            Competitors ({localCompetitors.length})
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isFetching}
          >
            Regenerate
          </Button>
        </div>

        <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
          {localCompetitors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No competitors added yet. Add some competitors to track.
            </p>
          ) : (
            localCompetitors.map((competitor) => (
              <div
                key={competitor.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg bg-background"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {competitor.logo ? (
                      <img
                        src={competitor.logo}
                        alt={`${competitor.name} logo`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        {competitor.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{competitor.name}</p>
                    {competitor.website && (
                      <p className="text-xs text-muted-foreground truncate">{competitor.website}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveCompetitor(competitor.id)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Add Custom Competitor</Label>
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input
              placeholder="Competitor name (required)"
              value={newCompetitor.name}
              onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCompetitor()}
              className="flex-1"
            />
            <Button
              onClick={handleAddCompetitor}
              variant="outline"
              size="icon"
              disabled={!newCompetitor.name.trim()}
              className="h-9 w-9"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Input
            placeholder="Website (optional, e.g., example.com)"
            value={newCompetitor.website}
            onChange={(e) => setNewCompetitor({ ...newCompetitor, website: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCompetitor()}
          />
        </div>
      </div>

      <div className="p-3 rounded-lg bg-muted border border-border">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{localCompetitors.length}</span> competitors will be tracked. You can add more later.
        </p>
      </div>

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || localCompetitors.length === 0}
        >
          {isLoading ? 'Completing Setup...' : 'Complete Setup'}
        </Button>
      </div>
    </div>
  );
}
