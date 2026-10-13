'use client';

import { useRouter } from 'next/navigation';
import { DesktopContactView } from '@/components/desktop/DesktopSupport';
import { ContactBody, SupportMobileFrame } from '@/components/support/SupportDoc';

export default function ContactPage() {
  const router = useRouter();

  return (
    <>
      <DesktopContactView onBack={() => router.back()} />
      <SupportMobileFrame title="お問い合わせ" eyebrow="CONTACT" onBack={() => router.back()}>
        <ContactBody />
      </SupportMobileFrame>
    </>
  );
}
