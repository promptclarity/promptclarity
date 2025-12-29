"use client"

import { useState, useEffect } from "react"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { AlertCircle, Loader2 } from "lucide-react"
import { BusinessInfo } from "@/app/lib/types"

interface BusinessStepProps {
  data: BusinessInfo;
  onUpdate: (data: BusinessInfo) => void;
  onNext: () => void;
}

export default function BusinessStep({ data, onUpdate, onNext }: BusinessStepProps) {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(data);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isLoadingLogo, setIsLoadingLogo] = useState(false);

  useEffect(() => {
    // Load existing business ID if available
    const existingId = localStorage.getItem('onboardingBusinessId');
    if (existingId) {
      setBusinessId(existingId);
    }
  }, []);

  // Auto-detect logo when website changes
  useEffect(() => {
    const detectLogo = async () => {
      if (!businessInfo.website.trim()) return;

      // Extract domain from website
      let domain = businessInfo.website.trim();
      try {
        // Remove protocol if present
        domain = domain.replace(/^https?:\/\//i, '');
        // Remove www. if present
        domain = domain.replace(/^www\./i, '');
        // Remove trailing slash and path
        domain = domain.split('/')[0];

        setIsLoadingLogo(true);

        // Use server-side favicon API for more reliable fetching
        // This handles CORS issues and tries multiple sources including favicon.ico
        const response = await fetch(`/api/favicon?domain=${encodeURIComponent(domain)}`);

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.logo) {
            // Logo is now returned as base64 data URI
            setBusinessInfo(prev => ({ ...prev, logo: data.logo }));
            console.log(`Logo downloaded from ${data.source} (quality: ${data.quality}, size: ${data.size} bytes)`);
          } else {
            console.error('Logo fetch failed:', data.error);
          }
        } else {
          console.error('Logo API request failed');
        }

      } catch (error) {
        console.error('Error detecting logo:', error);
      } finally {
        setIsLoadingLogo(false);
      }
    };

    // Debounce the logo detection to avoid excessive API calls
    const timer = setTimeout(() => {
      detectLogo();
    }, 1000);

    return () => clearTimeout(timer);
  }, [businessInfo.website]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!businessInfo.businessName.trim()) {
      newErrors.businessName = 'Business name is required';
    }

    if (!businessInfo.website.trim()) {
      newErrors.website = 'Website is required';
    } else {
      // Check if it's a valid domain format (with or without protocol)
      const websitePattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
      if (!websitePattern.test(businessInfo.website)) {
        newErrors.website = 'Please enter a valid website (e.g., example.com)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Prepare website URL - add https:// if no protocol is present
    let websiteUrl = businessInfo.website.trim();
    if (!websiteUrl.match(/^https?:\/\//i)) {
      websiteUrl = 'https://' + websiteUrl;
    }

    const businessData = {
      ...businessInfo,
      website: websiteUrl
    };

    setIsLoading(true);
    try {
      const requestBody = {
        ...businessData,
        businessId: businessId ? parseInt(businessId) : undefined
      };

      const response = await fetch('/api/onboarding/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();

        // Critical: businessId MUST be present in the response
        if (!result.data?.businessId) {
          throw new Error('Server error: Business ID was not returned. Please try again or contact support.');
        }

        localStorage.setItem('onboardingBusinessId', result.data.businessId.toString());
        setBusinessId(result.data.businessId.toString());
        onUpdate(businessInfo);
        onNext();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save business information');
      }
    } catch (error) {
      console.error('Error saving business info:', error);
      setErrors({
        submit: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6">
        <p className="text-sm text-muted-foreground">
          We need this information to track, analyze, and generate associated topics for your brand.
        </p>

        {errors.submit && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {errors.submit}
          </div>
        )}

        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="businessName">Brand *</Label>
            <Input
              id="businessName"
              type="text"
              placeholder="Enter your business name"
              value={businessInfo.businessName}
              onChange={(e) => setBusinessInfo({ ...businessInfo, businessName: e.target.value })}
              aria-invalid={errors.businessName ? true : undefined}
              required
              disabled={isLoading}
            />
            {errors.businessName && (
              <p className="text-sm text-destructive">{errors.businessName}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="website">Website *</Label>
            <Input
              id="website"
              type="text"
              placeholder="example.com"
              value={businessInfo.website}
              onChange={(e) => setBusinessInfo({ ...businessInfo, website: e.target.value })}
              aria-invalid={errors.website ? true : undefined}
              required
              disabled={isLoading}
            />
            {errors.website && (
              <p className="text-sm text-destructive">{errors.website}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="logo">
              Logo {isLoadingLogo ? "(detecting...)" : "(auto-detected)"}
            </Label>
            <div className="flex items-center gap-3">
              {businessInfo.logo && (
                <div className="w-10 h-10 overflow-hidden flex items-center justify-center bg-muted rounded-lg flex-shrink-0">
                  <img
                    src={businessInfo.logo}
                    alt="Logo preview"
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                    }}
                  />
                </div>
              )}
              <Input
                id="logo"
                type="text"
                placeholder="Auto-detected from website"
                value={businessInfo.logo || ""}
                onChange={(e) => setBusinessInfo({ ...businessInfo, logo: e.target.value })}
                disabled={isLoadingLogo || isLoading}
                className="flex-1"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Logo is automatically detected from your website.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Next: Select Platforms"
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
