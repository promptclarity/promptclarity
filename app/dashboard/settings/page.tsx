'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useBusiness } from '@/app/contexts/BusinessContext';

const REFRESH_PERIOD_OPTIONS = [
  { value: '1', label: 'Every day' },
  { value: '2', label: 'Every other day' },
  { value: '3', label: 'Every 3 days' },
  { value: '7', label: 'Once a week' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { business, refreshBusiness } = useBusiness();

  // Refresh period state
  const [refreshPeriod, setRefreshPeriod] = useState<string>('1');
  const [isSavingRefreshPeriod, setIsSavingRefreshPeriod] = useState(false);
  const [refreshPeriodSuccess, setRefreshPeriodSuccess] = useState(false);

  // Delete project state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Initialize refresh period from business
  useEffect(() => {
    if (business?.refreshPeriodDays) {
      setRefreshPeriod(business.refreshPeriodDays.toString());
    }
  }, [business?.refreshPeriodDays]);

  const handleRefreshPeriodChange = async (value: string) => {
    if (!business?.id) return;

    setRefreshPeriod(value);
    setIsSavingRefreshPeriod(true);
    setRefreshPeriodSuccess(false);

    try {
      const response = await fetch(`/api/business?businessId=${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshPeriodDays: parseInt(value) }),
      });

      if (!response.ok) {
        throw new Error('Failed to update refresh period');
      }

      await refreshBusiness();
      setRefreshPeriodSuccess(true);
      setTimeout(() => setRefreshPeriodSuccess(false), 3000);
    } catch (err) {
      console.error('Error updating refresh period:', err);
      if (business?.refreshPeriodDays) {
        setRefreshPeriod(business.refreshPeriodDays.toString());
      }
    } finally {
      setIsSavingRefreshPeriod(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteError(null);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteProject = async () => {
    if (!business?.id) {
      setDeleteError('No project selected');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/business/${business.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete project');
      }

      // Clear local storage
      localStorage.removeItem('onboardingBusinessId');
      localStorage.removeItem('cachedBusiness');

      // Close dialog
      setIsDeleteDialogOpen(false);

      // Check if there are other projects to switch to
      const allBusinessesResponse = await fetch('/api/business/all');
      if (allBusinessesResponse.ok) {
        const businesses = await allBusinessesResponse.json();
        if (businesses.length > 0) {
          // Switch to the first available project
          localStorage.setItem('onboardingBusinessId', businesses[0].id.toString());
          // Force a full page reload to refresh the business context
          window.location.href = '/dashboard';
          return;
        }
      }

      // No other projects - go to onboarding
      router.push('/onboarding');
    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Settings</span>
        <span className="text-muted-foreground text-sm">·</span>
        <span className="text-sm text-gray-400">Configure your project settings</span>
      </div>

      {/* Refresh Schedule Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">Prompt Refresh Schedule</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-gray-400">Configure how often prompts are automatically executed</span>
        </div>
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Refresh Frequency</span>
                <Select
                  value={refreshPeriod}
                  onValueChange={handleRefreshPeriodChange}
                  disabled={isSavingRefreshPeriod}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {REFRESH_PERIOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSavingRefreshPeriod && (
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {refreshPeriodSuccess && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Saved
                  </span>
                )}
              </div>

              {business?.nextExecutionTime && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Next Scheduled Execution</p>
                  <p className="text-sm">
                    {new Date(business.nextExecutionTime).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Project Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">Danger Zone</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm text-gray-400">Irreversible actions</span>
        </div>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Delete Project</p>
                <p className="text-xs text-gray-400 mt-1">
                  Permanently delete this project and all of its data including prompts, executions, and analytics.
                </p>
              </div>
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" onClick={handleDeleteClick}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Project
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete <strong>{business?.businessName || 'this project'}</strong>? All data will be permanently lost and this action cannot be undone.
                      {deleteError && (
                        <span className="block mt-3 text-red-600">{deleteError}</span>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <Button variant="destructive" onClick={handleDeleteProject} disabled={isDeleting}>
                      {isDeleting ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Yes, Delete Project'
                      )}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
