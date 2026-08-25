'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase';
import PageLoader from '@/components/PageLoader';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let isSubscribed = true;
    const rawNext = searchParams.get('next') || '/store/customer';
    
    // Validate internal path to prevent open redirect vulnerability
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/store/customer';

    const handleSessionResolution = (session) => {
      if (session && isSubscribed) {
        console.log('✅ [Kreatorstore - AuthCallback]: Active session confirmed. Redirecting to:', next);
        isSubscribed = false;
        router.push(next);
      }
    };

    // 1. Initial check (if session is already loaded/restored synchronously)
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleSessionResolution(session);
      }
    });

    // 2. Listen for SIGNED_IN event (for async token exchange/hash parsing)
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      console.log(`ℹ️ [Kreatorstore - AuthCallback]: Auth state change event "${event}"`);
      if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        handleSessionResolution(session);
      }
    });

    // 3. Fallback timeout in case no session resolves within 5 seconds
    const timeoutId = setTimeout(() => {
      if (isSubscribed) {
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
          if (!session && isSubscribed) {
            console.warn('⚠️ [Kreatorstore - AuthCallback]: No active session resolved. Redirecting to login.');
            isSubscribed = false;
            router.push('/customer/login');
          }
        });
      }
    }, 5000);

    return () => {
      isSubscribed = false;
      subscription?.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [searchParams, router]);

  if (errorMsg) {
    return (
      <div className="error-container">
        <div className="error-card">
          <h2>Authentication Error ❌</h2>
          <p>{errorMsg}</p>
          <p className="redirecting-text">Returning to login page...</p>
        </div>
        <style jsx>{`
          .error-container {
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8f9fb;
            font-family: 'Outfit', sans-serif;
          }
          .error-card {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            text-align: center;
            max-width: 400px;
          }
          h2 { color: #dc2626; margin-bottom: 12px; }
          p { color: #4b5563; font-size: 14px; line-height: 1.5; }
          .redirecting-text { color: #9ca3af; margin-top: 15px; font-size: 12px; }
        `}</style>
      </div>
    );
  }

  return <PageLoader />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <CallbackContent />
    </Suspense>
  );
}
