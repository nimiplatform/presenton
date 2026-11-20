import SettingPage from './SettingPage';
import Link from 'next/link';
export const metadata = { title: 'Settings | Presenton', description: 'Nimi AI and presentation settings' };
export default function Settings() {
  if (process.env.NEXT_PUBLIC_NIMI_WEB_CONFIG) return <main className="mx-auto max-w-2xl space-y-5 p-8"><h1 className="text-3xl font-semibold">Settings on your PC</h1><p>This browser uses the presentation workspace running in Presenton on your PC. Model choices, stock-image and search connections, and Community sign-in belong to that workspace.</p><p>Open <strong>Presenton on your PC → Settings</strong> to change them. Your existing service credentials stay on the PC.</p><Link className="inline-block rounded border px-4 py-2" href="/dashboard">Back to presentations</Link></main>;
  return <SettingPage />;
}
