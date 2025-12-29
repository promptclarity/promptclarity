'use client';

import { Avatar, AvatarImage, AvatarFallback } from '@/app/components/ui/avatar';
import { cn } from '@/app/lib/utils';

import OpenAILogo from '@/app/assets/openai.svg';
import ClaudeLogo from '@/app/assets/claude-color.svg';
import GeminiLogo from '@/app/assets/gemini-color.svg';
import PerplexityLogo from '@/app/assets/perplexity-color.svg';
import GrokLogo from '@/app/assets/grok.svg';

type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok' | string;

interface PlatformIconProps {
  platformId: PlatformId;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const platformConfig: Record<string, { logo: string | { src: string }; alt: string; fallback: string }> = {
  chatgpt: { logo: OpenAILogo, alt: 'OpenAI', fallback: 'OA' },
  claude: { logo: ClaudeLogo, alt: 'Claude', fallback: 'CL' },
  gemini: { logo: GeminiLogo, alt: 'Gemini', fallback: 'GE' },
  perplexity: { logo: PerplexityLogo, alt: 'Perplexity', fallback: 'PX' },
  grok: { logo: GrokLogo, alt: 'Grok', fallback: 'GR' },
};

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export function PlatformIcon({ platformId, size = 'md', className }: PlatformIconProps) {
  const config = platformConfig[platformId];

  if (!config) {
    return (
      <Avatar className={cn(sizeClasses[size], 'rounded', className)}>
        <AvatarFallback className="rounded bg-muted text-[8px]">
          {platformId.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className={cn(sizeClasses[size], 'rounded-none', className)}>
      <AvatarImage src={typeof config.logo === 'string' ? config.logo : config.logo.src} alt={config.alt} />
      <AvatarFallback className="rounded bg-muted text-[8px]">
        {config.fallback}
      </AvatarFallback>
    </Avatar>
  );
}
