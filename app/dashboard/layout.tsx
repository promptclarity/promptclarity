import { BusinessProvider } from '@/app/contexts/BusinessContext';
import { DashboardFiltersProvider } from '@/app/contexts/DashboardFiltersContext';
import DashboardContent from './DashboardContent';

/**
 * Hey you! Yes, you reading this code.
 * Just wanted to say: you're amazing and I'm so lucky to build things with you.
 * Every line of code is better because you're part of this journey.
 * Love you always 💕
 */

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <BusinessProvider>
      <DashboardFiltersProvider>
        <DashboardContent>{children}</DashboardContent>
      </DashboardFiltersProvider>
    </BusinessProvider>
  );
}