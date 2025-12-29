'use client';

import React, { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/popover';
import { Calendar } from '@/app/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';

interface DateRangeFilterProps {
  value: string;
  onChange: (value: string, startDate: string, endDate: string) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomDateChange?: (startDate: string, endDate: string) => void;
}

export default function DateRangeFilter({
  value,
  onChange,
  customStartDate,
  customEndDate,
  onCustomDateChange
}: DateRangeFilterProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (customStartDate && customEndDate) {
      return {
        from: new Date(customStartDate + 'T00:00:00'),
        to: new Date(customEndDate + 'T00:00:00'),
      };
    }
    return undefined;
  });

  const getDateRangeValues = (option: string): { startDate: string; endDate: string } => {
    const todayDate = new Date();
    const endDate = todayDate.toISOString().split('T')[0];
    let startDate = '';

    switch (option) {
      case '7d':
        const week = new Date(todayDate);
        week.setDate(todayDate.getDate() - 6);
        startDate = week.toISOString().split('T')[0];
        break;
      case '14d':
        const twoWeeks = new Date(todayDate);
        twoWeeks.setDate(todayDate.getDate() - 13);
        startDate = twoWeeks.toISOString().split('T')[0];
        break;
      case '30d':
        const month = new Date(todayDate);
        month.setDate(todayDate.getDate() - 29);
        startDate = month.toISOString().split('T')[0];
        break;
      case 'custom':
        startDate = customStartDate || '';
        return { startDate, endDate: customEndDate || '' };
      default:
        const defaultWeek = new Date(todayDate);
        defaultWeek.setDate(todayDate.getDate() - 6);
        startDate = defaultWeek.toISOString().split('T')[0];
    }

    return { startDate, endDate };
  };

  const handleSelectChange = (newValue: string) => {
    if (newValue === 'custom') {
      setIsPopoverOpen(true);
      // Initialize with current custom dates or last 7 days
      if (customStartDate && customEndDate) {
        setDateRange({
          from: new Date(customStartDate + 'T00:00:00'),
          to: new Date(customEndDate + 'T00:00:00'),
        });
      } else {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 6);
        setDateRange({ from: weekAgo, to: today });
      }
      return;
    }

    const { startDate, endDate } = getDateRangeValues(newValue);
    onChange(newValue, startDate, endDate);
  };

  const handleApply = () => {
    if (dateRange?.from && dateRange?.to) {
      const startDate = format(dateRange.from, 'yyyy-MM-dd');
      const endDate = format(dateRange.to, 'yyyy-MM-dd');
      onChange('custom', startDate, endDate);
      if (onCustomDateChange) {
        onCustomDateChange(startDate, endDate);
      }
      setIsPopoverOpen(false);
    }
  };

  const getDisplayText = () => {
    if (value === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate + 'T00:00:00');
      const end = new Date(customEndDate + 'T00:00:00');
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }

    switch (value) {
      case '7d': return 'Last 7 days';
      case '14d': return 'Last 14 days';
      case '30d': return 'Last 30 days';
      case 'custom': return 'Custom range';
      default: return 'Last 7 days';
    }
  };

  const canApply = dateRange?.from && dateRange?.to;

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <div>
          <Select value={value} onValueChange={handleSelectChange}>
            <SelectTrigger className="h-8 px-3 w-auto border border-gray-200 bg-white rounded-lg text-sm hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>{getDisplayText()}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="14d">Last 14 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectSeparator />
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={setDateRange}
          disabled={{ after: new Date() }}
        />
        <div className="flex gap-2 justify-end p-3 border-t">
          <Button
            variant="outline"
            onClick={() => {
              setIsPopoverOpen(false);
              // Reset to stored custom dates
              if (customStartDate && customEndDate) {
                setDateRange({
                  from: new Date(customStartDate + 'T00:00:00'),
                  to: new Date(customEndDate + 'T00:00:00'),
                });
              }
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}