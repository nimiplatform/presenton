"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function Home() {
  const router = useRouter(); useEffect(() => { router.replace('/dashboard'); }, [router]);
  return <main className="p-8" role="status">Opening your presentations…</main>;
}
