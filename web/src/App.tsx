import React, { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Providers } from '@/app/providers';
import MixpanelInitializer from '@/app/MixpanelInitializer';
import { ConfigurationInitializer } from '@/app/ConfigurationInitializer';
import DashboardSidebar from '@/app/(presentation-generator)/(dashboard)/Components/DashboardSidebar';
import DashboardPage from '@/app/(presentation-generator)/(dashboard)/dashboard/components/DashboardPage';
import TemplatePanel from '@/app/(presentation-generator)/(dashboard)/templates/components/TemplatePanel';
import CommunityPage from '@/app/(presentation-generator)/(dashboard)/community/components/CommunityPage';
import GenerateHeader from '@/app/(presentation-generator)/upload/components/GenerateHeader';
import UploadPage from '@/app/(presentation-generator)/upload/components/UploadPage';
import OutlinePage from '@/app/(presentation-generator)/outline/components/OutlinePage';
import PresentationPage from '@/app/(presentation-generator)/presentation/components/PresentationPage';
import '@/app/(presentation-generator)/utils/prism-languages';
import DocumentPreviewPage from '@/app/(presentation-generator)/documents-preview/components/DocumentPreviewPage';
import CustomTemplatePage from '@/app/(presentation-generator)/custom-template/CustomTemplatePage';
import TemplatePreviewClient from '@/app/(presentation-generator)/template-preview/components/TemplatePreviewClient';
import TailwindBrowserRuntime from '@/components/runtime/TailwindBrowserRuntime';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { isCommunityEnabled } from '@/utils/community';
import { normalizePresentationGenerationMode } from '@/utils/presentationGenerationMode';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const presentationGenerationMode = normalizePresentationGenerationMode(
    process.env.PRESENTATION_GENERATION_MODE,
  );
  return (
    <div className="flex min-w-0 flex-col bg-white md:flex-row md:pr-4">
      <DashboardSidebar
        showCommunity={isCommunityEnabled(process.env.PRESENTON_COMMUNITY_ENABLED)}
        showTemplates={presentationGenerationMode !== 'smart'}
      />
      <div className="min-w-0 w-full flex-1">{children}</div>
    </div>
  );
}

function WebSettingsView() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-8">
      <h1 className="text-3xl font-semibold">Settings on your PC</h1>
      <p>
        This browser uses the presentation workspace running in Presenton on your PC.
        Model choices, stock-image and search connections, and Community sign-in belong to that workspace.
      </p>
      <p>
        Open <strong>Presenton on your PC → Settings</strong> to change them.
        Your existing service credentials stay on the PC.
      </p>
      <Link className="inline-block rounded border px-4 py-2" href="/dashboard">
        Back to presentations
      </Link>
    </main>
  );
}

function UploadRoute() {
  const presentationGenerationMode = normalizePresentationGenerationMode(
    process.env.PRESENTATION_GENERATION_MODE,
  );
  return (
    <div className="relative flex min-h-dvh flex-col">
      <GenerateHeader />
      <main className="flex flex-1 flex-col pb-10 pt-[46px]">
        <div className="motion-enter mb-7 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
          <h1 className="font-syne text-[36px] font-medium leading-normal tracking-[-0.58px] text-[#101323] sm:text-[48px] lg:text-[58px] lg:leading-[70px]">
            Turn Ideas into Slides
          </h1>
          <p className="max-w-[609px] font-syne text-base leading-[1.4] tracking-[0.2px] text-[#101323CC] sm:text-xl">
            Turn prompts or documents into presentations with AI
          </p>
        </div>
        <UploadPage
          communityEnabled={isCommunityEnabled(process.env.PRESENTON_COMMUNITY_ENABLED)}
          presentationGenerationMode={presentationGenerationMode}
        />
      </main>
    </div>
  );
}

function PresentationRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const queryId = params.get('id');
  if (!queryId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen font-syne">
        <h1 className="text-2xl font-bold">No presentation id found</h1>
        <p className="text-gray-500 pb-4">Please try again</p>
        <Button onClick={() => router.push('/dashboard')}>Go to home</Button>
      </div>
    );
  }
  return <PresentationPage presentation_id={queryId} />;
}

function RouteSwitch() {
  const rawPathname = usePathname();
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, '') : rawPathname;
  const router = useRouter();
  const mode = normalizePresentationGenerationMode(process.env.PRESENTATION_GENERATION_MODE);
  const communityEnabled = isCommunityEnabled(process.env.PRESENTON_COMMUNITY_ENABLED);

  const shouldRedirectToDashboard =
    pathname === '/' ||
    (mode === 'smart' && (pathname === '/templates' || pathname === '/custom-template' || pathname === '/template-preview'));

  useEffect(() => {
    if (shouldRedirectToDashboard) {
      router.replace('/dashboard');
    }
  }, [router, shouldRedirectToDashboard]);

  if (shouldRedirectToDashboard) {
    return (
      <main className="p-8" role="status">
        Opening your presentations…
      </main>
    );
  }

  switch (pathname) {
    case '/dashboard':
      return (
        <DashboardShell>
          <DashboardPage />
        </DashboardShell>
      );
    case '/templates':
      return (
        <DashboardShell>
          <TemplatePanel />
        </DashboardShell>
      );
    case '/community':
      if (!communityEnabled) {
        return (
          <main className="mx-auto max-w-xl space-y-4 p-8">
            <h1 className="text-2xl font-semibold">Community is disabled</h1>
            <Link className="inline-block rounded border px-4 py-2" href="/dashboard">
              Back to presentations
            </Link>
          </main>
        );
      }
      return (
        <DashboardShell>
          <CommunityPage />
        </DashboardShell>
      );
    case '/settings':
      return (
        <DashboardShell>
          <WebSettingsView />
        </DashboardShell>
      );
    case '/upload':
      return <UploadRoute />;
    case '/outline':
      return (
        <div className="relative min-h-screen" translate="no">
          <OutlinePage />
        </div>
      );
    case '/presentation':
      return <PresentationRoute />;
    case '/documents-preview':
      return <DocumentPreviewPage />;
    case '/custom-template':
      return <CustomTemplatePage />;
    case '/template-preview':
      return (
        <Suspense
          fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          }
        >
          <TemplatePreviewClient />
        </Suspense>
      );
    default:
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 font-syne">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <Link className="rounded border px-4 py-2" href="/dashboard">
            Go to dashboard
          </Link>
        </main>
      );
  }
}

export default function App() {
  return (
    <Providers>
      <MixpanelInitializer>
        <ConfigurationInitializer>
          <RouteSwitch />
        </ConfigurationInitializer>
      </MixpanelInitializer>
      <TailwindBrowserRuntime />
      <Toaster position="top-center" />
    </Providers>
  );
}
