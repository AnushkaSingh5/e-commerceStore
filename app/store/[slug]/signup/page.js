'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/services/authService';
import { storeService } from '@/services/storeService';
import { supabaseClient } from '@/lib/supabase';
import { useLoading } from '@/components/TopLoader';
import StoreUnderReview from '@/components/StoreUnderReview';
import PageLoader from '@/components/PageLoader';
import { useCustomerAuth } from '@/context/CustomerAuthContext';

export default function StoreSignupPage({ params }) {
  const { slug } = use(params);
  const { startLoading, completeLoading } = useLoading();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || `/store/${slug}`;
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [storeDetails, setStoreDetails] = useState(null);
  const { customer, signup, loginWithProvider, loading: authLoading } = useCustomerAuth();

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const data = await storeService.getStoreBySlug(slug);
        setStoreDetails(data);
        if (slug) {
          localStorage.setItem('last_visited_store', slug);
        }
      } catch (e) {
        console.error('Failed to fetch store details:', e);
      }
    };
    fetchStore();
  }, [slug]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    startLoading();
    try {
      console.log('🔄 [Kreatorstore - StoreSignupPage]: Triggering signUp for customer:', email);
      await signup(email, password, name, phone);
      
      console.log('✅ [Kreatorstore - StoreSignupPage]: Customer signup and auto-login successful.');
      setSuccessMsg('Account created successfully! Redirecting...');
      setTimeout(() => {
        router.push(redirect);
      }, 1000);
    } catch (err) {
      console.error('❌ [Kreatorstore - StoreSignupPage]: Signup error:', err);
      setErrorMsg(err.message || 'Failed to register account. Please try again.');
      setLoading(false);
      completeLoading();
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
      console.log(`🔄 [Kreatorstore - StoreSignupPage]: Triggering OAuth signup for ${provider} with callback ${callbackUrl}`);
      await loginWithProvider(provider, callbackUrl);
    } catch (err) {
      console.error(`❌ [Kreatorstore - StoreSignupPage]: ${provider} OAuth error:`, err);
      setErrorMsg(err.message || `Failed to sign up with ${provider}.`);
    }
  };

  const currentUserId = customer?.id;
  const isCreator = currentUserId && currentUserId === storeDetails?.creator_id;

  if (storeDetails && storeDetails.status !== 'approved' && authLoading) {
    return <PageLoader />;
  }

  const isStoreUnderReview = storeDetails && storeDetails.status !== 'approved' && !isCreator;
  const displayError = isStoreUnderReview 
    ? "This store is currently under admin review. Customer access will be available once the store has been approved."
    : errorMsg;

  return (
    <div className="signup-container">
      <div className="glow-bg"></div>

      <div className="signup-card dashboard-card fade-in">
        <Link href={`/store/${slug}`} className="back-link">
          ← Back to store
        </Link>

        <div className="brand-header">
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2>Create Customer Account</h2>
          <p>Register to start shopping at <strong>{storeDetails?.name || 'Store'}</strong></p>
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

        {/* Social Authentication */}
        <div className="social-auth">
          <button 
            type="button" 
            onClick={() => handleSocialLogin('google')} 
            className="social-btn"
            disabled={loading || isStoreUnderReview}
          >
            <svg className="social-icon" viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '10px' }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div className="divider">
          <span>or register with email</span>
        </div>

        <form onSubmit={handleSignup} className="signup-form">
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              required
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
              placeholder="john@example.com"
              required
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
              placeholder="e.g. +1 (555) 019-2834"
              required
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
              placeholder="Choose a password (min. 6 characters)"
              minLength={6}
              required
              disabled={isStoreUnderReview}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading || isStoreUnderReview}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="signup-footer">
          Already have an account?{' '}
          {isStoreUnderReview ? (
            <span className="register-link-disabled" style={{ color: '#94a3b8', cursor: 'not-allowed', textDecoration: 'underline' }}>
              Log in
            </span>
          ) : (
            <Link href={`/store/${slug}/login?redirect=${encodeURIComponent(redirect)}`} className="register-link">
              Log in
            </Link>
          )}
        </div>
      </div>

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
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.05) 0%, rgba(255, 255, 255, 0) 70%);
          top: -200px;
          right: -200px;
          z-index: 1;
          pointer-events: none;
        }

        .signup-card {
          width: 100%;
          max-width: 460px;
          background: var(--white, #ffffff);
          padding: 40px;
          border-radius: var(--radius-lg, 24px);
          box-shadow: var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.05));
          border: 1px solid rgba(0, 0, 0, 0.04);
          position: relative;
          z-index: 2;
        }

        .back-link {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-sub, #64748b);
          text-decoration: none;
          margin-bottom: 24px;
          transition: var(--transition-fast, all 0.2s);
        }

        .back-link:hover {
          color: var(--primary, #121212);
        }

        .brand-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .logo-icon {
          width: 48px;
          height: 48px;
          background: rgba(37, 99, 235, 0.1);
          color: var(--accent, #2563eb);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
        }

        .brand-header h2 {
          font-size: 24px;
          font-weight: 800;
          color: var(--primary, #121212);
          letter-spacing: -0.5px;
        }

        .brand-header p {
          font-size: 13px;
          color: var(--text-sub, #64748b);
          line-height: 1.5;
        }

        .error-banner {
          padding: 12px 16px;
          background: #fef2f2;
          color: #ef4444;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
          border: 1px solid rgba(239, 68, 68, 0.1);
          text-align: center;
        }

        .success-banner {
          padding: 12px 16px;
          background: #ecfdf5;
          color: #10b981;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
          border: 1px solid rgba(16, 185, 129, 0.1);
          text-align: center;
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
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main, #1d1d1f);
        }

        .form-group input {
          width: 100%;
          padding: 11px 15px;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          font-size: 14px;
          color: var(--text-main, #1d1d1f);
          outline: none;
          background: var(--white, #ffffff);
          transition: var(--transition-fast, all 0.2s);
        }

        .form-group input:focus {
          border-color: var(--accent, #2563eb);
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          background: var(--primary, #121212);
          color: var(--white, #ffffff);
          font-weight: 700;
          font-size: 14px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(18, 18, 18, 0.15);
          transition: var(--transition-smooth, all 0.3s);
          margin-top: 8px;
        }

        .submit-btn:hover {
          background: var(--accent, #2563eb);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.25);
          transform: translateY(-1px);
        }

        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .signup-footer {
          text-align: center;
          font-size: 13px;
          color: var(--text-sub, #64748b);
          border-top: 1px solid rgba(0, 0, 0, 0.04);
          padding-top: 20px;
        }

        .register-link {
          font-weight: 700;
          color: var(--accent, #2563eb);
          text-decoration: none;
        }

        .register-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .signup-card {
            padding: 32px 20px;
          }
        }

        .divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: var(--text-sub, #64748b);
          font-size: 12px;
          font-weight: 600;
          margin: 24px 0;
          gap: 12px;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .social-btn {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #ffffff;
          color: var(--text-main, #1f2937);
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .social-btn:hover {
          background: #f9fafb;
          border-color: rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </div>
  );
}
