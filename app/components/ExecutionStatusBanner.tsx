'use client';

import { useState, useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Progress } from '@/app/components/ui/progress';
import { InfoIcon, CheckCircle2 } from 'lucide-react';

interface ExecutionStatusBannerProps {
  businessId: number;
}

export default function ExecutionStatusBanner({ businessId }: ExecutionStatusBannerProps) {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const wasInProgress = useRef(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/prompts/executions/status?businessId=${businessId}`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);

        // Track completion to show success message briefly
        if (wasInProgress.current && !data.status.isInProgress && data.status.hasExecutions) {
          setJustCompleted(true);
          setShowBanner(true);
          // Hide banner after 5 seconds on completion
          setTimeout(() => {
            setShowBanner(false);
            setJustCompleted(false);
          }, 5000);
        } else {
          // Show banner if executions are in progress
          setShowBanner(data.status.isInProgress);
        }

        wasInProgress.current = data.status.isInProgress;
      }
    } catch (error) {
      console.error('Error fetching execution status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll every 3 seconds to catch execution updates quickly
    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [businessId]);

  if (isLoading || !showBanner || !status) {
    return null;
  }

  const completedCount = status.completedInBatch || 0;
  const totalCount = status.totalInBatch || 0;

  return (
    <div className="mb-4">
      <Alert className={justCompleted ? "border-green-500 bg-green-50" : "border-blue-500 bg-blue-50"}>
        {justCompleted ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <InfoIcon className="h-4 w-4 text-blue-600" />
        )}
        <AlertDescription>
          <div className="flex flex-col gap-2">
            <div className={justCompleted ? "text-green-800" : "text-blue-800"}>
              {justCompleted ? (
                <>
                  <strong>Analysis complete!</strong> Your brand visibility data has been updated.
                </>
              ) : (
                <>
                  <strong>Analyzing your brand visibility...</strong> Querying AI platforms to see how they respond to your prompts.
                </>
              )}
            </div>
            {status.isInProgress && totalCount > 0 && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-muted-foreground">
                    {completedCount} of {totalCount} prompts analyzed
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {status.percentComplete}%
                  </span>
                </div>
                <Progress value={status.percentComplete} className="h-1" />
              </div>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
