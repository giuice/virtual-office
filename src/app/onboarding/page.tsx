import type { Metadata } from 'next';
import OnboardingPage from './onboarding-client';

export const metadata: Metadata = {
  title: 'Onboarding | Virtual Office',
  description: 'Finish setting up your Virtual Office account.',
};

export default function Page() {
  return <OnboardingPage />;
}
