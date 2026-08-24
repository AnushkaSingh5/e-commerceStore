'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { storeService } from '@/services/storeService';
import StoreUnderReview from '@/components/StoreUnderReview';
import PageLoader from '@/components/PageLoader';
import { demoStores } from '@/lib/demoData';

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/customer/profile';
  const { signup, loginWithProvider, isAuthenticated } = useCustomerAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [storeDetails, setStoreDetails] = useState(null);
  const [checkingStore, setCheckingStore] = useState(false);

  const redirectingRef = useRef(false);

  // Prefetch the redirect target URL in the background
  useEffect(() => {
    if (redirect && router) {
      console.log('⚡ [Kreatorstore - CustomerSignup]: Prefetching redirect target:', redirect);
      router.prefetch(redirect);
    }
  }, [redirect, router]);

  useEffect(() => {
    const checkTargetStore = async () => {
      const redirectPath = redirect || '';
      if (redirectPath.startsWith('/store/') || redirectPath.startsWith('/demo-store/')) {
        const slug = redirectPath.split('/')[2];
        if (slug) {
          setCheckingStore(true);
          try {
            if (redirectPath.startsWith('/demo-store/')) {
              setStoreDetails(demoStores[slug] || null);
            } else {
              const store = await storeService.getStoreBySlug(slug);
              setStoreDetails(store);
            }
          } catch (e) {
            console.error('Failed to pre-check store status on customer signup:', e);
          } finally {
            setCheckingStore(false);
          }
        }
      }
    };
    checkTargetStore();
  }, [redirect]);

  // Calculate back URL to return to the active store instead of the root landing page
  const backUrl = redirect && (redirect.startsWith('/store/') || redirect.startsWith('/demo-store/')) ? redirect : '/';

  // Auto-redirect if already logged in (essential for OAuth callback landing)
  useEffect(() => {
    if (isAuthenticated && !redirectingRef.current) {
      redirectingRef.current = true;
      setIsRedirecting(true);
      console.log('✅ [Kreatorstore - CustomerSignup]: Customer is already authenticated. Redirecting to:', redirect);
      router.push(redirect);
    }
  }, [isAuthenticated, redirect, router]);

  if (isRedirecting) {
    return <PageLoader />;
  }

  if (checkingStore) {
    return <div className="loading-text">Verifying store details...</div>;
  }

  const isStoreUnderReview = storeDetails && storeDetails.status !== 'approved';
  const displayError = isStoreUnderReview 
    ? 'This store is currently under admin review. Customer access will be available once the store has been approved.' 
    : errorMsg;

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 [Kreatorstore - CustomerSignup]: Creating account:', email);
      const res = await signup(email, password, fullName, phone);
      if (res && res.success) {
        setSuccessMsg('Account created successfully! Redirecting...');
        console.log('✅ [Kreatorstore - CustomerSignup]: Signup success. Redirecting to:', redirect);
        redirectingRef.current = true;
        setIsRedirecting(true);
        setTimeout(() => {
          router.push(redirect);
        }, 1500);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('❌ [Kreatorstore - CustomerSignup]: Signup error:', err);
      setErrorMsg(err.message || 'Failed to create account. Please try again.');
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setErrorMsg('');
    try {
      const origin = window.location.hostname === 'localhost'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_BASE_URL || 'https://kreatorstore.in');
      const callbackUrl = `${origin}/customer/login?redirect=${encodeURIComponent(redirect)}`;
      console.log(`🔄 [Kreatorstore - CustomerSignup]: Triggering OAuth signup for ${provider} with callback ${callbackUrl}`);
      setIsRedirecting(true);
      await loginWithProvider(provider, callbackUrl);
    } catch (err) {
      console.error(`❌ [Kreatorstore - CustomerSignup]: ${provider} OAuth error:`, err);
      setErrorMsg(err.message || `Failed to sign up with ${provider}.`);
      setIsRedirecting(false);
    }
  };

  return (
    <div className="signup-card dashboard-card fade-in">
      <Link href={backUrl} className="back-link">
        {redirect && (redirect.startsWith('/store/') || redirect.startsWith('/demo-store/')) ? '← Back to store' : '← Back to homepage'}
      </Link>

      <div className="brand-header">
        <div className="logo-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2>Create Account</h2>
        <p className="subtitle">Sign up to buy premium home essentials, track order history, and save shipping addresses.</p>
      </div>

      {displayError && (
        <div className="banner error-banner">
          {displayError}
        </div>
      )}

      {successMsg && (
        <div className="banner success-banner">
          {successMsg}
        </div>
      )}

      {/* Social Signups - Google Only */}
      <div className="social-login-grid">
        <button 
          type="button" 
          onClick={() => handleSocialLogin('google')} 
          className="google-btn-full"
          disabled={loading || isStoreUnderReview}
        >
          <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Continue with Google</span>
        </button>
      </div>

      <div className="divider">
        <span>or continue with email</span>
      </div>

      {/* Traditional Signup Form */}
      <form onSubmit={handleSignup} className="signup-form">
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input
            type="text"
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe"
            required
            autoComplete="off"
            disabled={isStoreUnderReview}
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="off"
            disabled={isStoreUnderReview}
          />
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone Number</label>
          <input
            type="tel"
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 019-2834"
            required
            autoComplete="off"
            disabled={isStoreUnderReview}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            minLength={6}
            required
            autoComplete="off"
            disabled={isStoreUnderReview}
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-type password"
            required
            autoComplete="off"
            disabled={isStoreUnderReview}
          />
        </div>

        <button type="submit" className="submit-btn" disabled={loading || isStoreUnderReview}>
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>

      <div className="signup-footer">
        Already have an account?{' '}
        {isStoreUnderReview ? (
          <span className="register-link-disabled" style={{ color: '#94a3b8', cursor: 'not-allowed', textDecoration: 'underline' }}>
            Log in
          </span>
        ) : (
          <Link href={`/customer/login?redirect=${encodeURIComponent(redirect)}`} className="register-link">
            Log in
          </Link>
        )}
      </div>

      <style jsx>{`
        .back-link {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          text-decoration: none;
          margin-bottom: 24px;
          transition: all 0.2s ease;
        }

        .back-link:hover {
          color: #2563eb;
        }

        .brand-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }

        .logo-icon {
          width: 48px;
          height: 48px;
          background: rgba(37, 99, 235, 0.08);
          color: #2563eb;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(37, 99, 235, 0.1);
        }

        .brand-header h2 {
          font-family: 'Outfit', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: #1a1a1a;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .subtitle {
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
          max-width: 340px;
          margin: 0;
        }

        .banner {
          padding: 12px 16px;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
          text-align: center;
        }

        .error-banner {
          background: #fdf2f2;
          color: #dc2626;
          border: 1px solid rgba(220, 38, 38, 0.08);
        }

        .success-banner {
          background: #f0fdf4;
          color: #16a34a;
          border: 1px solid rgba(22, 163, 74, 0.08);
        }

        .social-login-grid {
          display: flex;
          margin-bottom: 20px;
        }

        .google-btn-full {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #ffffff;
          color: #121212;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .google-btn-full:hover {
          border-color: #121212;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          transform: translateY(-1px);
        }

        .social-icon {
          flex-shrink: 0;
        }

        .divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: #8c8985;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 12px 0 20px;
        }

        .divider::before, .divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .divider:not(:empty)::before {
          margin-right: 1em;
        }

        .divider:not(:empty)::after {
          margin-left: 1em;
        }

        .signup-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: #555350;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .form-group input {
          width: 100%;
          padding: 12px 15px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          font-size: 14px;
          color: #121212;
          outline: none;
          background: #ffffff;
          transition: all 0.25s ease;
        }

        .form-group input:focus {
          border-color: #121212;
          box-shadow: 0 0 0 4px rgba(18, 18, 18, 0.05);
        }

        .submit-btn {
          width: 100%;
          padding: 15px;
          background: #121212;
          color: #FAF8F5;
          font-weight: 600;
          font-size: 14px;
          border-radius: 14px;
          letter-spacing: 0.5px;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer;
          border: none;
          margin-top: 8px;
        }

        .submit-btn:hover {
          background: #3e3d3a;
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .signup-footer {
          text-align: center;
          font-size: 13px;
          color: #706f6c;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          padding-top: 24px;
        }

        :global(.register-link) {
          font-weight: 600;
          color: #2563eb !important;
          text-decoration: underline;
        }

        :global(.register-link:hover) {
          color: #1d4ed8 !important;
        }

        /* Autofill Overrides */
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px #ffffff inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}

export default function CustomerSignupPage() {
  return (
    <div className="signup-container">
      <div className="glow-bg"></div>
      <Suspense fallback={<div className="loading-text">Loading...</div>}>
        <SignupContent />
      </Suspense>

      <style jsx>{`
        .signup-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8f9fb;
          padding: 20px;
          position: relative;
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
        }

        .glow-bg {
          position: absolute;
          width: 800px;
          height: 800px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, rgba(255, 255, 255, 0) 70%);
          top: -300px;
          right: -300px;
          z-index: 1;
          pointer-events: none;
        }

        :global(.signup-card) {
          width: 100%;
          max-width: 465px;
          background: #ffffff;
          padding: 44px;
          border-radius: 24px;
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.05);
          position: relative;
          z-index: 2;
        }

        .loading-text {
          font-size: 16px;
          color: #706f6c;
        }
      `}</style>
    </div>
  );
}
