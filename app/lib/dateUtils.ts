/**
 * Utility functions for consistent date formatting across the application
 */

/**
 * Format a date string to display in the user's local timezone
 * @param dateStr - ISO 8601 date string (typically in UTC)
 * @param options - Intl.DateTimeFormatOptions for customizing the output
 * @returns Formatted date string in user's local timezone
 */
export function formatLocalDate(
  dateStr: string | undefined | null,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }
): string {
  if (!dateStr) return '-';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    console.error('Error formatting date:', error);
    return '-';
  }
}

/**
 * Format a date string to display date and time in the user's local timezone
 * @param dateStr - ISO 8601 date string (typically in UTC)
 * @param options - Intl.DateTimeFormatOptions for customizing the output
 * @returns Formatted date and time string in user's local timezone
 */
export function formatLocalDateTime(
  dateStr: string | undefined | null,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }
): string {
  if (!dateStr) return '-';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleString('en-US', options);
  } catch (error) {
    console.error('Error formatting date time:', error);
    return '-';
  }
}

/**
 * Format a date to show time ago (e.g., "5m ago", "2h ago", "3d ago")
 * @param dateStr - ISO 8601 date string (typically in UTC)
 * @returns Formatted time ago string
 */
export function formatTimeAgo(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  } catch (error) {
    console.error('Error formatting time ago:', error);
    return '-';
  }
}

/**
 * Get timezone abbreviation for display
 * @returns The user's timezone abbreviation (e.g., "PST", "EST")
 */
export function getUserTimezone(): string {
  try {
    const date = new Date();
    const timeZoneName = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short'
    }).formatToParts(date).find(part => part.type === 'timeZoneName');
    
    return timeZoneName?.value || 'Local';
  } catch (error) {
    console.error('Error getting timezone:', error);
    return 'Local';
  }
}

/**
 * Convert a UTC date to the start of day in the user's local timezone
 * @param date - Date object
 * @returns Date object set to start of day in local timezone
 */
export function toLocalStartOfDay(date: Date): Date {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);
  return localDate;
}

/**
 * Convert a UTC date to the end of day in the user's local timezone
 * @param date - Date object
 * @returns Date object set to end of day in local timezone
 */
export function toLocalEndOfDay(date: Date): Date {
  const localDate = new Date(date);
  localDate.setHours(23, 59, 59, 999);
  return localDate;
}