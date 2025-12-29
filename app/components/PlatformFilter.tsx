'use client';

import React, { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/popover';
import { Settings2, Plus } from 'lucide-react';
import Link from 'next/link';

interface Platform {
  id: number;
  platformId: string;
  name: string;
}

interface PlatformFilterProps {
  platforms: Platform[];
  selectedPlatforms: Set<number>;
  onChange: (selected: Set<number>) => void;
}

export default function PlatformFilter({
  platforms,
  selectedPlatforms,
  onChange
}: PlatformFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (platformId: number) => {
    const newSelected = new Set(selectedPlatforms);
    if (newSelected.has(platformId)) {
      // Don't allow deselecting if it's the last one
      if (newSelected.size > 1) {
        newSelected.delete(platformId);
      }
    } else {
      newSelected.add(platformId);
    }
    onChange(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = new Set((platforms || []).map(p => p.id));
    onChange(allIds);
  };

  const getDisplayText = () => {
    if (selectedPlatforms.size === 0) {
      return 'No models';
    }
    if (selectedPlatforms.size === (platforms?.length || 0)) {
      return 'All models';
    }
    return `${selectedPlatforms.size} model${selectedPlatforms.size > 1 ? 's' : ''}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="h-8 px-3 flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-100 transition-colors">
          <Settings2 className="h-3.5 w-3.5" />
          {getDisplayText()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Models</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-auto py-1 px-2 text-xs"
            >
              Select all
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {(platforms || []).map((platform) => (
              <div
                key={platform.id}
                className="flex items-center gap-2"
              >
                <Checkbox
                  id={`platform-${platform.id}`}
                  checked={selectedPlatforms.has(platform.id)}
                  onCheckedChange={() => handleToggle(platform.id)}
                />
                <label
                  htmlFor={`platform-${platform.id}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {platform.name}
                </label>
              </div>
            ))}
          </div>
          {(!platforms || platforms.length === 0) && (
            <p className="text-sm text-muted-foreground">No models configured</p>
          )}
          <div className="border-t pt-3 mt-1">
            <Link
              href="/dashboard/models"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add models
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}