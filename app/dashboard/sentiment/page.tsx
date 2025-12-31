'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function SentimentPage() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Analyze sentiment of AI-generated content about your brand</p>

      <Card>
        <CardHeader>
          <CardTitle>Sentiment Analysis</CardTitle>
          <CardDescription>Track how AI platforms describe your brand</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Sentiment analysis coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
