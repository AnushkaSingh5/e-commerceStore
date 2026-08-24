'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabaseClient } from '@/lib/supabase';
import { customerService } from '@/services/customerService';
import { useLoading } from '@/components/TopLoader';

const CustomerAuthContext = createContext();

export function CustomerAuthProvider({ children }) {
  const { startLoading, completeLoading } = useLoading();
  const [customer, setCustomer] = useState(null);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const initialSessionLoadedRef = useRef(false);

  // Fetch customer profile from public.customers using auth UID
  const fetchCustomerProfile = async (authId, userObject = null) => {
    if (!supabaseClient) return null;

    try {
      // Check user role from profiles to prevent admins from being treated as customers
      const { data: userProfile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', authId)
        .maybeSingle();

      if (userProfile && userProfile.role === 'admin') {
        console.log(`[Kreatorstore - CustomerAuth] User role is: ${userProfile.role}. Skipping customer profile loading.`);
        setCustomerProfile(null);
        return { success: true, profile: null };
      }
    } catch (e) {
      console.warn('[Kreatorstore - CustomerAuth] Failed to pre-check user profile role:', e);
      if (e.message?.includes('fetch') || e.message?.includes('Network') || e.status === 0 || e.message === 'TypeError: fetch failed') {
        throw e;
      }
    }

    let userObj = userObject;
    if (!userObj) {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        userObj = user;
      } catch (err) {
        console.warn('[Kreatorstore - CustomerAuth] Failed to fetch current authenticated user:', err);
      }
    }

    console.log("Profile fetch started");
    let attempt = 0;
    const maxAttempts = 3;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TimeoutError')), 10000)
        );
        let profileData = await Promise.race([
          customerService.getCustomerProfileByAuthId(authId),
          timeoutPromise
        ]);
        
        if (!profileData && userObj) {
          console.log("ℹ️ [Kreatorstore - CustomerAuth]: Customer profile not found. Auto-creating customer record for user:", userObj.email);
          const { data: newProfile, error: insertErr } = await supabaseClient
            .from('customers')
            .insert([{
              auth_id: authId,
              full_name: userObj.user_metadata?.name || userObj.email?.split('@')[0] || 'Customer',
              email: userObj.email,
              phone: userObj.user_metadata?.phone || null,
            }])
            .select()
            .single();
          
          if (!insertErr && newProfile) {
            profileData = newProfile;
          } else if (insertErr) {
            console.error("❌ [Kreatorstore - CustomerAuth]: Failed to auto-create customer profile:", insertErr);
          }
        }
        
        setCustomerProfile(profileData || null);
        console.log("Profile fetch complete");
        return { success: true, profile: profileData };
      } catch (err) {
        console.warn(`❌ [Kreatorstore - CustomerAuth]: Error fetching customer profile (Attempt ${attempt}/${maxAttempts}):`, err.message || err);
        
        const isJwtFuture = err.message?.includes('JWT issued at future') || 
                             err.message?.includes('issued at future') ||
                             err.status === 401 ||
                             String(err.code) === 'PGRST301';

        const isTimeout = err.message === 'TimeoutError';

        if (isTimeout) {
          console.log("Profile fetch complete");
          throw err;
        }

        if (isJwtFuture && attempt < maxAttempts) {
          console.log(`[Kreatorstore - CustomerAuth] Retrying profile fetch in 1.5s due to authorization error...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
        console.log("Profile fetch complete");
        throw err;
      }
    }
    return { success: false, error: 'Max attempts reached' };
  };

  useEffect(() => {
    if (!supabaseClient) {
      setLoading(false);
      return;
    }

    let isSubscribed = true;

    const loadSession = async () => {
      startLoading();
      try {
        console.log("Session restore started");
        const getSessionTimeout = new Promise((resolve) => {
          setTimeout(() => {
            console.warn('⚠️ [Kreatorstore - CustomerAuth]: Initial getSession check timed out after 10s.');
            resolve({ data: { session: null } });
          }, 10000);
        });
        const { data: { session } } = await Promise.race([
          supabaseClient.auth.getSession(),
          getSessionTimeout
        ]);
        console.log("Session restore complete");

        if (session && session.user && isSubscribed) {
          try {
            const result = await fetchCustomerProfile(session.user.id, session.user);
            if (result && result.success) {
              if (result.profile) {
                setCustomer(session.user);
              } else {
                setCustomer(null);
                setCustomerProfile(null);
              }
            }
          } catch (err) {
            console.warn('⚠️ [Kreatorstore - CustomerAuth] Failed to load session profile due to network/timeout error:', err);
            // Retain active auth session instead of logging out
            setCustomer(session.user);
          }
        } else {
          setCustomer(null);
          setCustomerProfile(null);
        }
      } catch (err) {
        console.warn('❌ [Kreatorstore - CustomerAuth]: Session load failed:', err);
      } finally {
        if (isSubscribed) {
          initialSessionLoadedRef.current = true;
          setLoading(false);
        }
        completeLoading();
      }
    };

    loadSession();

    // Listen to Supabase Auth State Changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      setTimeout(async () => {
        if (!isSubscribed) return;

        console.log(`🔑 [Kreatorstore - CustomerAuth]: auth state changes: event="${event}"`);

        if (event === 'INITIAL_SESSION') {
          return; // Handled by loadSession
        }

        if (!initialSessionLoadedRef.current) {
          console.log(`🔔 [Kreatorstore - CustomerAuth]: onAuthStateChange event "${event}" ignored during initial session load.`);
          return;
        }

        try {
          if (session && session.user) {
            const result = await fetchCustomerProfile(session.user.id, session.user);
            if (result && result.success) {
              if (result.profile) {
                setCustomer(session.user);
              } else {
                setCustomer(null);
                setCustomerProfile(null);
              }
            }
          } else {
            setCustomer(null);
            setCustomerProfile(null);
          }
        } catch (err) {
          console.warn('❌ [Kreatorstore - CustomerAuth]: Auth state change error:', err);
          if (session && session.user) {
            setCustomer(session.user);
          }
        }
      }, 0);
    });

    return () => {
      isSubscribed = false;
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    setLoading(true);
    startLoading();
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Verify the user is a registered customer
      const result = await fetchCustomerProfile(data.user.id, data.user);
      if (result && result.success && !result.profile) {
        // If not a customer, log out immediately and throw error
        await supabaseClient.auth.signOut();
        setCustomer(null);
        setCustomerProfile(null);
        throw new Error('This account is not registered as a Customer. Please sign up or use a customer account.');
      } else if (result && !result.success) {
        throw new Error(result.error || 'Failed to authenticate customer. Please try again.');
      }

      setCustomer(data.user);
      return { success: true };
    } catch (err) {
      console.error('❌ [Kreatorstore - CustomerAuth]: Login failed:', err);
      throw err;
    } finally {
      setLoading(false);
      completeLoading();
    }
  };

  const signup = async (email, password, fullName, phone) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    setLoading(true);
    startLoading();
    try {
      // 1. Create Supabase Auth User with metadata
      let signUpData;
      let signUpError;
      try {
        const res = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: fullName,
              role: 'customer',
              phone: phone,
            },
          },
        });
        signUpData = res.data;
        signUpError = res.error;
      } catch (e) {
        signUpError = e;
      }

      let user;
      let session;

      if (signUpError) {
        // If signup failed (e.g. account already exists), attempt to authenticate with the password provided.
        // This validates their credentials before linking a new customer profile.
        try {
          const loginRes = await supabaseClient.auth.signInWithPassword({ email, password });
          if (loginRes.error) {
            // Throw original signup error if password validation fails
            throw signUpError;
          }
          user = loginRes.data.user;
          session = loginRes.data.session;
        } catch (signInErr) {
          throw signUpError;
        }
      } else {
        user = signUpData.user;
        session = signUpData.session;

        if (!session) {
          const loginRes = await supabaseClient.auth.signInWithPassword({ email, password });
          if (loginRes.error) throw loginRes.error;
          user = loginRes.data.user;
          session = loginRes.data.session;
        }
      }

      // 2. Fetch customer profile or wait for handle_new_user trigger
      let profileData = null;
      let retries = 5;
      while (retries > 0) {
        const profile = await customerService.getCustomerProfileByAuthId(user.id);
        if (profile) {
          profileData = profile;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        retries--;
      }

      // 3. Fallback: manual insert of customer record if trigger is slow or not set up
      if (!profileData) {
        const { data: newProfile, error: insertErr } = await supabaseClient
          .from('customers')
          .insert([{
            auth_id: user.id,
            full_name: fullName,
            email: email,
            phone: phone,
          }])
          .select()
          .single();
        if (insertErr) throw insertErr;
        profileData = newProfile;
      }

      setCustomer(user);
      setCustomerProfile(profileData);
      return { success: true };
    } catch (err) {
      console.warn('❌ [Kreatorstore - CustomerAuth]: Signup failed:', err);
      throw err;
    } finally {
      setLoading(false);
      completeLoading();
    }
  };

  const logout = async () => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    setLoading(true);
    startLoading();
    try {
      localStorage.removeItem('remember_me');
      sessionStorage.removeItem('session_active');
      await supabaseClient.auth.signOut();
      console.log('✅ [Kreatorstore - CustomerAuth]: Supabase signOut completed.');
    } catch (err) {
      console.warn('❌ [Kreatorstore - CustomerAuth]: Logout failed:', err);
    } finally {
      setCustomer(null);
      setCustomerProfile(null);
      setLoading(false);
      completeLoading();
      console.log('✅ [Kreatorstore - CustomerAuth]: Local customer states cleared.');
    }
  };

  const loginWithProvider = async (provider, redirectUrl = '/customer/profile') => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    setLoading(true);
    startLoading();
    try {
      console.log(`🔄 [Kreatorstore - CustomerAuth]: Logging in with provider: ${provider}`);
      const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          data: {
            role: 'customer',
          }
        }
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error(`❌ [Kreatorstore - CustomerAuth]: Provider ${provider} login failed:`, err);
      throw err;
    } finally {
      setLoading(false);
      completeLoading();
    }
  };

  const loginWithPhone = async (phone) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    setLoading(true);
    startLoading();
    try {
      console.log(`🔄 [Kreatorstore - CustomerAuth]: Sending OTP to phone: ${phone}`);
      const { data, error } = await supabaseClient.auth.signInWithOtp({
        phone,
        options: {
          channel: 'sms',
          data: {
            role: 'customer',
          }
        }
      });
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error('❌ [Kreatorstore - CustomerAuth]: Phone OTP send failed:', err);
      throw err;
    } finally {
      setLoading(false);
      completeLoading();
    }
  };

  const verifyPhoneOtp = async (phone, token) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    setLoading(true);
    startLoading();
    try {
      console.log(`🔄 [Kreatorstore - CustomerAuth]: Verifying OTP for phone: ${phone}`);
      const { data, error } = await supabaseClient.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });
      if (error) throw error;

      // Verify customer record
      const profileData = await fetchCustomerProfile(data.user.id, data.user);
      setCustomer(data.user);
      return { success: true, user: data.user, profile: profileData };
    } catch (err) {
      console.error('❌ [Kreatorstore - CustomerAuth]: Phone OTP verification failed:', err);
      throw err;
    } finally {
      setLoading(false);
      completeLoading();
    }
  };

  const refreshProfile = async () => {
    if (!customer) return;
    await fetchCustomerProfile(customer.id);
  };

  const value = {
    customer,
    customerProfile,
    loading,
    isAuthenticated: !!customer && !!customerProfile,
    login,
    signup,
    loginWithProvider,
    loginWithPhone,
    verifyPhoneOtp,
    logout,
    refreshProfile,
  };

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
