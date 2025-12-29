'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useBusiness } from '@/app/contexts/BusinessContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  SidebarRail,
} from '@/app/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/app/components/ui/breadcrumb';
import {
  MessageSquare,
  Rocket,
  Users,
  Settings,
  LayoutDashboard,
  Link2,
  Plus,
  Building2,
  ChevronsUpDown,
  Zap,
  FileText,
  Share2,
  LogOut,
  Swords,
} from 'lucide-react';
import ExecutionStatusBanner from '@/app/components/ExecutionStatusBanner';
import DateRangeFilter from '@/app/components/DateRangeFilter';
import PlatformFilter from '@/app/components/PlatformFilter';
import ChangePasswordDialog from '@/app/components/ChangePasswordDialog';
import { useDashboardFilters } from '@/app/contexts/DashboardFiltersContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';

interface MenuItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Business {
  id: number;
  businessName: string;
  website: string;
  logo?: string;
  createdAt: string;
  updatedAt: string;
}

export default function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { business, loading, switchBusiness } = useBusiness();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const user = session?.user;
  const {
    dateRange,
    setDateRange,
    customStartDate,
    customEndDate,
    setCustomDates,
    platforms,
    selectedPlatforms,
    setSelectedPlatforms,
    triggerRefresh,
  } = useDashboardFilters();

  const handleCreateNewProject = () => {
    // Clear the onboarding business ID and cached business to start fresh
    localStorage.removeItem('onboardingBusinessId');
    localStorage.removeItem('cachedBusiness');
    router.push('/onboarding?new=true');
  };

  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const response = await fetch('/api/business/all');
        if (response.ok) {
          const data = await response.json();

          // Check if user has any business with completed onboarding
          const completedBusiness = data.find((b: any) => b.onboarding?.completed);

          if (!completedBusiness) {
            // No completed onboarding - redirect to onboarding
            const incompleteBusiness = data.find((b: any) => b.onboarding && !b.onboarding.completed);
            if (incompleteBusiness) {
              localStorage.setItem('onboardingBusinessId', incompleteBusiness.id.toString());
            }
            router.replace('/onboarding');
            return;
          }

          setBusinesses(data);
        }
      } catch (error) {
        console.error('Error fetching businesses:', error);
      }
    };

    fetchBusinesses();
  }, [router]);

  // Check if user needs to change password
  useEffect(() => {
    const checkPasswordStatus = async () => {
      try {
        const response = await fetch('/api/auth/change-password');
        if (response.ok) {
          const data = await response.json();
          setMustChangePassword(data.mustChangePassword);
        }
      } catch (error) {
        console.error('Error checking password status:', error);
      }
    };

    if (session?.user) {
      checkPasswordStatus();
    }
  }, [session]);

  const mainMenuItems: MenuItem[] = [
    { name: 'Overview', href: '/dashboard/overview', icon: LayoutDashboard },
    { name: 'Sources', href: '/dashboard/sources', icon: Link2 },
    { name: 'Prompts', href: '/dashboard/prompts', icon: MessageSquare },
  ];

  const actionsMenuItems: MenuItem[] = [
    { name: 'On-Page', href: '/dashboard/content-roadmap', icon: FileText },
    { name: 'Off-Page', href: '/dashboard/offpage-roadmap', icon: Share2 },
  ];

  const settingsMenuItems: MenuItem[] = [
    { name: 'Models', href: '/dashboard/models', icon: Rocket },
    { name: 'Competitors', href: '/dashboard/competitors', icon: Swords },
    { name: 'Team', href: '/dashboard/team', icon: Users },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  const pageTitles: Record<string, string> = {
    '/dashboard': 'Overview',
    '/dashboard/overview': 'Overview',
    '/dashboard/overview/benchmarking': 'Benchmarking',
    '/dashboard/prompts': 'Prompts',
    '/dashboard/sources': 'Sources',
    '/dashboard/content-roadmap': 'On-Page',
    '/dashboard/offpage-roadmap': 'Off-Page',
    '/dashboard/models': 'Models',
    '/dashboard/competitors': 'Competitors',
    '/dashboard/team': 'Team',
    '/dashboard/sentiment': 'Sentiment',
    '/dashboard/settings': 'Settings',
    '/dashboard/visibility': 'Visibility',
  };

  const getBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: { label: string; href: string; isCurrentPage: boolean }[] = [];

    if (segments.length > 1) {
      const section = segments[1]; // e.g., 'prompts', 'sources', 'benchmarking'
      const sectionPath = `/dashboard/${section}`;
      const sectionTitle = pageTitles[sectionPath] || section.charAt(0).toUpperCase() + section.slice(1);

      // Check if there's a detail page (e.g., /dashboard/prompts/123 or /dashboard/sources/domain.com)
      if (segments.length > 2) {
        breadcrumbs.push({
          label: sectionTitle,
          href: sectionPath,
          isCurrentPage: false,
        });

        // Add the detail page
        const detailSegment = decodeURIComponent(segments[2]);
        let detailLabel = detailSegment;

        // For sources, use domain as label; for prompts, use "Prompt Details"
        if (section === 'sources') {
          detailLabel = detailSegment === 'urls' ? 'URLs' : detailSegment;
        } else if (section === 'prompts') {
          detailLabel = 'Prompt Details';
        }

        breadcrumbs.push({
          label: detailLabel,
          href: pathname,
          isCurrentPage: true,
        });
      } else {
        breadcrumbs.push({
          label: sectionTitle,
          href: sectionPath,
          isCurrentPage: true,
        });
      }
    } else {
      // Root dashboard page
      breadcrumbs.push({
        label: 'Overview',
        href: '/dashboard',
        isCurrentPage: true,
      });
    }

    return breadcrumbs;
  };

  // Show loading screen until business data is ready
  if (!business) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading business data...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      {/* Password Change Dialog - required for users with temp passwords */}
      <ChangePasswordDialog
        open={mustChangePassword}
        onSuccess={() => setMustChangePassword(false)}
        required
      />

      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <Select
                value={business.id.toString()}
                onValueChange={(value) => switchBusiness(parseInt(value))}
              >
                <SelectTrigger className="w-full border-0 shadow-none h-auto p-2 bg-sidebar hover:bg-sidebar-accent rounded-lg transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted">
                      {business.logo ? (
                        <Avatar className="size-8 rounded-lg">
                          <AvatarImage src={business.logo} alt="Logo" />
                          <AvatarFallback className="rounded-lg bg-muted">
                            <Building2 className="size-4 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Building2 className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {business.businessName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {business.website.replace(/^https?:\/\//, '')}
                      </span>
                    </div>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-50" />
                </SelectTrigger>
            <SelectContent className="z-[100]">
              {businesses.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div className="flex aspect-square size-6 items-center justify-center rounded-md bg-muted">
                      {b.logo ? (
                        <Avatar className="size-6 rounded-md">
                          <AvatarImage src={b.logo} alt={b.businessName} />
                          <AvatarFallback className="rounded-md bg-muted">
                            <Building2 className="size-3 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Building2 className="size-3 text-muted-foreground" />
                      )}
                    </div>
                    <span>{b.businessName}</span>
                  </div>
                </SelectItem>
              ))}
              <div className="border-t my-1" />
              <div
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                onClick={handleCreateNewProject}
              >
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>New Project</span>
                </div>
              </div>
              </SelectContent>
              </Select>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Main</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href));

                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Actions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {actionsMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href));

                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full hover:bg-sidebar-accent rounded-md p-2 transition-colors">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user?.image || undefined} alt={user?.name || 'User'} />
                  <AvatarFallback className="rounded-lg bg-black text-white text-xs">
                    {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm truncate">{user?.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/auth/signin' })}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="overflow-x-hidden">
        {/* Top Header */}
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Breadcrumb>
              <BreadcrumbList>
                {getBreadcrumbs().map((crumb, index, arr) => (
                  <BreadcrumbItem key={crumb.href}>
                    {crumb.isCurrentPage ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href} className="hover:text-foreground transition-colors">{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                    {index < arr.length - 1 && <BreadcrumbSeparator />}
                  </BreadcrumbItem>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2 ml-auto pr-4">
            {/* Sources page tabs */}
            {(pathname === '/dashboard/sources' || pathname === '/dashboard/sources/urls') && (
              <div className="flex items-center h-8 border border-gray-200 rounded-lg p-0.5 bg-white">
                <button
                  className={`px-3 h-full text-sm transition-colors rounded-md ${
                    pathname === '/dashboard/sources'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => router.push('/dashboard/sources')}
                >
                  Domains
                </button>
                <button
                  className={`px-3 h-full text-sm transition-colors rounded-md ${
                    pathname === '/dashboard/sources/urls'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => router.push('/dashboard/sources/urls')}
                >
                  URLs
                </button>
              </div>
            )}
            {/* Actions page tabs - handled in page component via query params */}
            <PlatformFilter
              platforms={platforms}
              selectedPlatforms={selectedPlatforms}
              onChange={(selected) => {
                setSelectedPlatforms(selected);
                triggerRefresh();
              }}
            />
            <DateRangeFilter
              value={dateRange}
              onChange={(value, startDate, endDate) => {
                setDateRange(value);
                if (value === 'custom') {
                  setCustomDates(startDate, endDate);
                }
                triggerRefresh();
              }}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onCustomDateChange={setCustomDates}
            />
          </div>
        </header>

        {/* Page Content */}
        <div className="@container/main flex flex-1 flex-col">
          <div className="flex flex-col gap-4 p-4 overflow-x-hidden overflow-y-auto">
            {/* Execution Status Banner */}
            <ExecutionStatusBanner businessId={business.id} />
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}