'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { storeService } from '@/services/storeService';
import StoreUnderReview from '@/components/StoreUnderReview';
import PageLoader from '@/components/PageLoader';
import { demoStores } from '@/lib/demoData';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/customer/profile';
  const method = searchParams.get('method') || 'email';
  
  const { login, loginWithProvider, loginWithPhone, verifyPhoneOtp, isAuthenticated } = useCustomerAuth();

  const [activeTab, setActiveTab] = useState(method);
  
  // Email states (initialized empty so browser pre-fills only happen via native user consent)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Phone/OTP states
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  
  // General states
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
      console.log('⚡ [Kreatorstore - CustomerLogin]: Prefetching redirect target:', redirect);
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
            console.error('Failed to pre-check store status on customer login:', e);
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
      console.log('✅ [Kreatorstore - CustomerLogin]: Customer is already authenticated. Redirecting to:', redirect);
      router.push(redirect);
    }
  }, [isAuthenticated, redirect, router]);

  // If method parameter changes, update active tab
  useEffect(() => {
    if (method === 'phone' || method === 'email') {
      setActiveTab(method);
    }
  }, [method]);

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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      console.log('🔄 [Kreatorstore - CustomerLogin]: Logging in:', email);
      const res = await login(email, password);
      if (res && res.success) {
        redirectingRef.current = true;
        setIsRedirecting(true);
        console.log('✅ [Kreatorstore - CustomerLogin]: Login success. Redirecting to:', redirect);
        router.push(redirect);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('❌ [Kreatorstore - CustomerLogin]: Login error:', err);
      setErrorMsg(err.message || 'Invalid email or password.');
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!phone || phone.trim() === '') {
      setErrorMsg('Please enter a valid mobile number.');
      return;
    }
    
    setOtpLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const cleanPhone = phone.trim();
      console.log('🔄 [Kreatorstore - CustomerLogin]: Sending OTP to:', cleanPhone);
      await loginWithPhone(cleanPhone);
      setOtpSent(true);
      setSuccessMsg('OTP code sent successfully to your mobile number!');
    } catch (err) {
      console.error('❌ [Kreatorstore - CustomerLogin]: Send OTP error:', err);
      setErrorMsg(err.message || 'Failed to send OTP. Please confirm format e.g. +1234567890.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim() === '') {
      setErrorMsg('Please enter the 6-digit OTP code.');
      return;
    }
    
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const cleanPhone = phone.trim();
      const cleanOtp = otp.trim();
      console.log('🔄 [Kreatorstore - CustomerLogin]: Verifying OTP:', cleanOtp, 'for phone:', cleanPhone);
      const res = await verifyPhoneOtp(cleanPhone, cleanOtp);
      if (res && res.success) {
        setSuccessMsg('Verification successful! Logging in...');
        console.log('✅ [Kreatorstore - CustomerLogin]: OTP Login success. Redirecting to:', redirect);
        redirectingRef.current = true;
        setIsRedirecting(true);
        router.push(redirect);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('❌ [Kreatorstore - CustomerLogin]: Verify OTP error:', err);
      setErrorMsg(err.message || 'Verification failed. Invalid or expired code.');
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const origin = window.location.hostname === 'localhost'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_BASE_URL || 'https://kreatorstore.in');
      const callbackUrl = `${origin}/customer/login?redirect=${encodeURIComponent(redirect)}`;
      console.log(`🔄 [Kreatorstore - CustomerLogin]: Triggering OAuth login for ${provider} with callback ${callbackUrl}`);
      setIsRedirecting(true);
      await loginWithProvider(provider, callbackUrl);
    } catch (err) {
      console.error(`❌ [Kreatorstore - CustomerLogin]: ${provider} OAuth error:`, err);
      setErrorMsg(err.message || `Failed to sign in with ${provider}.`);
      setIsRedirecting(false);
    }
  };

  return (
    <div className="login-card dashboard-card fade-in">
      <Link href={backUrl} className="back-link">
        {redirect && (redirect.startsWith('/store/') || redirect.startsWith('/demo-store/')) ? '← Back to store' : '← Back to homepage'}
      </Link>

      <div className="brand-header">
        <div className="logo-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2>Welcome Back</h2>
        <p className="subtitle">Sign in to track orders, manage addresses, and shop securely.</p>
      </div>

      {displayError && (
        <div className="error-banner">
          {displayError}
        </div>
      )}

      {successMsg && (
        <div className="success-banner">
          {successMsg}
        </div>
      )}

      {/* Social Login - Google Only */}
      <div className="social-login-grid">
        <button 
          type="button" 
          onClick={() => handleSocialLogin('google')} 
          className="social-btn google-btn-full"
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
        <span>or continue with</span>
      </div>

      {/* Tabs */}
      <div className="tab-container">
        <button 
          type="button" 
          onClick={() => {
            if (isStoreUnderReview) return;
            setActiveTab('email');
            setErrorMsg('');
            setSuccessMsg('');
          }} 
          className={`tab-btn ${activeTab === 'email' ? 'active' : ''}`}
          disabled={isStoreUnderReview}
        >
          Email
        </button>
        <button 
          type="button" 
          onClick={() => {
            if (isStoreUnderReview) return;
            setActiveTab('phone');
            setErrorMsg('');
            setSuccessMsg('');
          }} 
          className={`tab-btn ${activeTab === 'phone' ? 'active' : ''}`}
          disabled={isStoreUnderReview}
        >
          Mobile Number
        </button>
      </div>

      {/* Traditional Email Form */}
      {activeTab === 'email' && (
        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="text"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="new-password"
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
              placeholder="••••••••"
              required
              autoComplete="new-password"
              disabled={isStoreUnderReview}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading || isStoreUnderReview}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}

      {/* Phone/OTP Login Form */}
      {activeTab === 'phone' && (
        <div className="otp-flow-container">
          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="login-form">
              <div className="form-group">
                <label htmlFor="phone">Mobile Number</label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+15551234567"
                  required
                  autoComplete="off"
                  disabled={isStoreUnderReview}
                />
                <p className="form-tip">Include country code (e.g., +1 for USA, +91 for India).</p>
              </div>

              <button type="submit" className="submit-btn" disabled={otpLoading || isStoreUnderReview}>
                {otpLoading ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="login-form">
              <div className="phone-summary-card">
                <span>Sending OTP code to: <strong>{phone}</strong></span>
                <button 
                  type="button" 
                  onClick={() => {
                    if (isStoreUnderReview) return;
                    setOtpSent(false);
                    setOtp('');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }} 
                  className="change-phone-btn"
                  disabled={isStoreUnderReview}
                >
                  Change
                </button>
              </div>

              <div className="form-group">
                <label htmlFor="otp">Verification Code</label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit OTP code"
                  maxLength={6}
                  required
                  autoComplete="off"
                  disabled={isStoreUnderReview}
                />
              </div>

              <button type="submit" className="submit-btn" disabled={loading || isStoreUnderReview}>
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>

              <button 
                type="button" 
                onClick={handleSendOtp} 
                className="resend-otp-link"
                disabled={otpLoading || isStoreUnderReview}
              >
                {otpLoading ? 'Resending code...' : 'Resend verification code'}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="login-footer">
        New customer?{' '}
        {isStoreUnderReview ? (
          <span className="register-link-disabled" style={{ color: '#94a3b8', cursor: 'not-allowed', textDecoration: 'underline' }}>
            Create account
          </span>
        ) : (
          <Link href={`/customer/signup?redirect=${encodeURIComponent(redirect)}`} className="register-link">
            Create account
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
          max-width: 320px;
          margin: 0;
        }

        .error-banner {
          padding: 12px 16px;
          background: #fdf2f2;
          color: #dc2626;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
          border: 1px solid rgba(220, 38, 38, 0.08);
          text-align: center;
        }

        .success-banner {
          padding: 12px 16px;
          background: #f0fdf4;
          color: #16a34a;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
          border: 1px solid rgba(22, 163, 74, 0.08);
          text-align: center;
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

        .tab-container {
          display: flex;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          margin-bottom: 24px;
          gap: 16px;
        }

        .tab-btn {
          flex: 1;
          padding: 12px 0;
          background: transparent;
          border: none;
          font-size: 13px;
          font-weight: 600;
          color: #8c8985;
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
          text-align: center;
        }

        .tab-btn:hover {
          color: #121212;
        }

        .tab-btn.active {
          color: #121212;
        }

        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 100%;
          height: 2px;
          background: #121212;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 28px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
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
          padding: 13px 16px;
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

        .form-tip {
          font-size: 11px;
          color: #8c8985;
          margin: 0;
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

        .phone-summary-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(18, 18, 18, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.04);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 13px;
          color: #555350;
        }

        .change-phone-btn {
          font-size: 12px;
          font-weight: 600;
          color: #121212;
          background: transparent;
          border: none;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
        }

        .resend-otp-link {
          background: transparent;
          border: none;
          color: #8c8985;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: underline;
          align-self: center;
          margin-top: 4px;
          padding: 0;
        }

        .resend-otp-link:hover {
          color: #121212;
        }

        .login-footer {
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

export default function CustomerLoginPage() {
  return (
    <div className="login-container">
      <div className="glow-bg"></div>
      <Suspense fallback={<div className="loading-text">Loading...</div>}>
        <LoginContent />
      </Suspense>

      <style jsx>{`
        .login-container {
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

        :global(.login-card) {
          width: 100%;
          max-width: 450px;
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
