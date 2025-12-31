'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { X, Loader2, Plus } from 'lucide-react';
import { useBusiness } from '@/app/contexts/BusinessContext';

interface SuggestedCompetitor {
  name: string;
  mentionCount: number;
  avgPosition: number;
}

interface Competitor {
  id: number;
  name: string;
  website?: string;
  logo?: string;
  isActive?: boolean;
}

export default function CompetitorsPage() {
  const { business } = useBusiness();

  // Competitors state
  const [activeCompetitors, setActiveCompetitors] = useState<Competitor[]>([]);
  const [suggestedCompetitors, setSuggestedCompetitors] = useState<SuggestedCompetitor[]>([]);
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [newCompetitorDomain, setNewCompetitorDomain] = useState('');
  const [addingCompetitor, setAddingCompetitor] = useState(false);

  // Dialog state for adding suggested competitor
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedSuggested, setSelectedSuggested] = useState<SuggestedCompetitor | null>(null);
  const [suggestedDomain, setSuggestedDomain] = useState('');
  const [suggestedLogo, setSuggestedLogo] = useState<string | null>(null);
  const [fetchingLogo, setFetchingLogo] = useState(false);

  // Fetch competitors data
  const fetchCompetitors = async () => {
    if (!business?.id) return;

    setLoadingCompetitors(true);
    try {
      // Fetch active competitors
      const activeResponse = await fetch(`/api/dashboard/competitors?businessId=${business.id}`);
      if (activeResponse.ok) {
        const data = await activeResponse.json();
        setActiveCompetitors(data.competitors || []);
      }

      // Fetch suggested competitors
      const suggestedResponse = await fetch(`/api/dashboard/competitors/suggested?businessId=${business.id}`);
      if (suggestedResponse.ok) {
        const data = await suggestedResponse.json();
        setSuggestedCompetitors(data.suggestedCompetitors || []);
      }
    } catch (error) {
      console.error('Error fetching competitors:', error);
    } finally {
      setLoadingCompetitors(false);
    }
  };

  // Load competitors when business changes
  useEffect(() => {
    if (business?.id) {
      fetchCompetitors();
    }
  }, [business?.id]);

  // Add a new competitor
  const addCompetitor = async (name: string, domain?: string, prefetchedLogo?: string | null) => {
    if (!business?.id || !name.trim()) return;

    setAddingCompetitor(true);
    try {
      // Use prefetched logo or fetch if domain is provided
      let logo: string | undefined = prefetchedLogo || undefined;
      if (!logo && domain?.trim()) {
        try {
          const logoResponse = await fetch(`/api/favicon?domain=${encodeURIComponent(domain.trim())}`);
          if (logoResponse.ok) {
            const logoData = await logoResponse.json();
            if (logoData.success && logoData.logo) {
              logo = logoData.logo;
            }
          }
        } catch (logoError) {
          console.error('Error fetching logo:', logoError);
          // Continue without logo
        }
      }

      const response = await fetch('/api/dashboard/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          name: name.trim(),
          website: domain?.trim() || null,
          logo: logo || null,
        }),
      });

      if (response.ok) {
        // Refresh the competitors data
        fetchCompetitors();
        setNewCompetitorName('');
        setNewCompetitorDomain('');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add competitor');
      }
    } catch (error) {
      console.error('Error adding competitor:', error);
      alert('Failed to add competitor');
    } finally {
      setAddingCompetitor(false);
    }
  };

  // Remove a competitor (soft delete)
  const removeCompetitor = async (competitorId: number) => {
    if (!business?.id) return;

    try {
      const response = await fetch(`/api/dashboard/competitors?competitorId=${competitorId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchCompetitors();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to remove competitor');
      }
    } catch (error) {
      console.error('Error removing competitor:', error);
      alert('Failed to remove competitor');
    }
  };

  // Open dialog to add a suggested competitor
  const openAddSuggestedDialog = (suggested: SuggestedCompetitor) => {
    setSelectedSuggested(suggested);
    setSuggestedDomain('');
    setSuggestedLogo(null);
    setShowAddDialog(true);
  };

  // Auto-fetch logo when domain changes
  useEffect(() => {
    if (!suggestedDomain.trim()) {
      setSuggestedLogo(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setFetchingLogo(true);
      try {
        const response = await fetch(`/api/favicon?domain=${encodeURIComponent(suggestedDomain.trim())}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.logo) {
            setSuggestedLogo(data.logo);
          } else {
            setSuggestedLogo(null);
          }
        } else {
          setSuggestedLogo(null);
        }
      } catch (error) {
        console.error('Error fetching logo:', error);
        setSuggestedLogo(null);
      } finally {
        setFetchingLogo(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [suggestedDomain]);

  // Confirm adding the suggested competitor
  const confirmAddSuggested = async () => {
    if (!selectedSuggested) return;
    await addCompetitor(selectedSuggested.name, suggestedDomain || undefined, suggestedLogo);
    setShowAddDialog(false);
    setSelectedSuggested(null);
    setSuggestedDomain('');
    setSuggestedLogo(null);
  };

  return (
    <div>
      {/* Add Competitor Section */}
      <div className="mb-4">
        <Card>
          <CardContent className="pt-3">
            <div className="flex gap-2 flex-col sm:flex-row">
              <Input
                placeholder="Brand name..."
                value={newCompetitorName}
                onChange={(e) => setNewCompetitorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCompetitorName.trim()) {
                    addCompetitor(newCompetitorName, newCompetitorDomain);
                  }
                }}
                className="flex-1"
              />
              <Input
                placeholder="Domain (e.g. competitor.com)..."
                value={newCompetitorDomain}
                onChange={(e) => setNewCompetitorDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCompetitorName.trim()) {
                    addCompetitor(newCompetitorName, newCompetitorDomain);
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={() => addCompetitor(newCompetitorName, newCompetitorDomain)}
                disabled={!newCompetitorName.trim() || addingCompetitor}
              >
                {addingCompetitor ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Add a domain to automatically fetch the competitor&apos;s logo for tracking
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Active and Suggested */}
      <Tabs defaultValue="active">
        <TabsList className="mb-4">
          <TabsTrigger value="active">
            Active ({activeCompetitors.length})
          </TabsTrigger>
          <TabsTrigger value="suggested">
            Suggested ({suggestedCompetitors.length})
          </TabsTrigger>
        </TabsList>

        {/* Active Competitors */}
        <TabsContent value="active">
          <Card>
            <CardContent className="pt-3">
              {loadingCompetitors ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : activeCompetitors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead className="w-[100px] text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeCompetitors.map((competitor) => (
                      <TableRow key={competitor.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {competitor.logo ? (
                              <img
                                src={competitor.logo}
                                alt={`${competitor.name} logo`}
                                className="h-5 w-5 rounded object-contain"
                              />
                            ) : (
                              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">
                                  {competitor.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <span>{competitor.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {competitor.website ? (
                            <span className="text-sm text-muted-foreground">{competitor.website}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeCompetitor(competitor.id)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No competitors being tracked. Add some above or check the Suggested tab.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suggested Competitors */}
        <TabsContent value="suggested">
          <Card>
            <CardContent className="pt-3">
              {loadingCompetitors ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Finding suggestions...</span>
                </div>
              ) : suggestedCompetitors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Mentions</TableHead>
                      <TableHead className="text-right">Avg Position</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestedCompetitors.map((competitor) => (
                      <TableRow key={competitor.name}>
                        <TableCell>{competitor.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{competitor.mentionCount}</TableCell>
                        <TableCell className="text-right tabular-nums">#{competitor.avgPosition}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openAddSuggestedDialog(competitor)}
                            disabled={addingCompetitor}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground text-center">
                    No suggestions available. Brands that appear frequently in LLM responses but aren&apos;t being tracked will show up here.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Add Suggested Competitor Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {selectedSuggested?.name}</DialogTitle>
            <DialogDescription>
              Enter domain
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3">
              {suggestedLogo ? (
                <img
                  src={suggestedLogo}
                  alt={`${selectedSuggested?.name} logo`}
                  className="h-12 w-12 rounded object-contain border bg-white"
                />
              ) : (
                <div className="h-12 w-12 rounded bg-muted flex items-center justify-center border">
                  {fetchingLogo ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-lg text-muted-foreground">
                      {selectedSuggested?.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              )}
              <div className="flex-1">
                <Input
                  placeholder="e.g. competitor.com"
                  value={suggestedDomain}
                  onChange={(e) => setSuggestedDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmAddSuggested();
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAddSuggested}
              disabled={addingCompetitor}
            >
              {addingCompetitor ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
