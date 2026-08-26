'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase';
import PageLoader from '@/components/PageLoader';
import Link from 'next/link';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    const code = searchParams.get('code');
    const rawNext = searchParams.get('next') || '/store/customer';
    
    // Validate internal path to prevent open redirect vulnerability
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/store/customer';

    const handleSessionExchange = async () => {
      try {
        if (code) {
          console.log('🔄 [Kreatorstore - AuthCallback]: Exchanging code for session...');
          const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
          console.log('✅ [Kreatorstore - AuthCallback]: Session exchange successful. Redirecting to:', next);
          if (isSubscribed) {
            setLoading(false);
            router.push(next);
          }
        } else {
          // Implicit flow: check if a session exists
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session) {
            console.log('✅ [Kreatorstore - AuthCallback]: Active session found. Redirecting to:', next);
            if (isSubscribed) {
              setLoading(false);
              router.push(next);
            }
          } else {
            // Listen for async token parsing
            const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
              if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
                console.log(`✅ [Kreatorstore - AuthCallback]: Async session resolved via ${event}. Redirecting to:`, next);
                subscription?.unsubscribe();
                if (isSubscribed) {
                  setLoading(false);
                  router.push(next);
                }
              }
            });

            // If still no session after 3 seconds, show error
            setTimeout(() => {
              supabaseClient.auth.getSession().then(({ data: { session } }) => {
                if (!session && isSubscribed) {
                  subscription?.unsubscribe();
                  setLoading(false);
                  setErrorMsg('No active session could be established. Please try logging in again.');
                }
              });
            }, 3000);
          }
        }
      } catch (err) {
        console.error('❌ [Kreatorstore - AuthCallback]: Error handling callback:', err);
        if (isSubscribed) {
          setLoading(false);
          setErrorMsg(err.message || 'Authentication failed. Please try again.');
        }
      }
    };

    handleSessionExchange();

    return () => {
      isSubscribed = false;
    };
  }, [searchParams, router]);

  if (errorMsg) {
    return (
      <div className="error-container">
        <div className="error-card">
          <h2>Authentication Error ❌</h2>
          <p>{errorMsg}</p>
          <div className="action-row">
            <Link href="/customer/login" className="retry-link">
              Return to Login
            </Link>
          </div>
        </div>
        <style jsx>{`
          .error-container {
            height: 100/vh;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8f9fb;
            font-family: 'Outfit', sans-serif;
          }
          .error-card {
            background: white;
            padding: 40px;
            border-radius: 24px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
            text-align: center;
            max-width: 450px;
            border: 1px solid rgba(0, 0, 0, 0.05);
          }
          h2 { color: #dc2626; margin-bottom: 16px; font-weight: 700; }
          p { color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
          .retry-link {
            display: inline-block;
            padding: 12px 24px;
            background: #121212;
            color: white;
            border-radius: 12px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.2s;
          }
          .retry-link:hover {
            background: #232724;
            transform: translateY(-1px);
          }
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
