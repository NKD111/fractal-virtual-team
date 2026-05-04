'use client';
import dynamic from 'next/dynamic';

const OfficeScene = dynamic(() => import('@/components/office/OfficeScene'), { ssr: false });

export default function OfficePage() {
  return <OfficeScene />;
}
