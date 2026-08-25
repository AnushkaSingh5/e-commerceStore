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
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const rawNext = searchParams.get('next') || '/store/customer';
        
        // Validate internal path to prevent open redirect vulnerability
        const next = rawNext.startsWith('/') && !rawNext.startsWith('//')
          ? rawNext
          : '/store/customer';

        if (code) {
          console.log('🔄 [Kreatorstore - AuthCallback]: Exchanging code for session...');
          const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
          console.log('✅ [Kreatorstore - AuthCallback]: Session exchange successful. Redirecting to:', next);
          router.push(next);
        } else {
          // If no code, check if we already have a session
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session) {
            console.log('✅ [Kreatorstore - AuthCallback]: Active session found. Redirecting to:', next);
            router.push(next);
          } else {
            console.warn('⚠️ [Kreatorstore - AuthCallback]: No code or session found. Redirecting to login.');
            router.push('/customer/login');
          }
        }
      } catch (err) {
        console.error('❌ [Kreatorstore - AuthCallback]: Error handling callback:', err);
        setErrorMsg(err.message || 'Authentication failed. Please try again.');
        // Fall back to login page after a brief moment
        setTimeout(() => {
          router.push('/customer/login');
        }, 3000);
      }
    };

    handleCallback();
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
