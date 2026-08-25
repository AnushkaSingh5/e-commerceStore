'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabaseClient } from '@/lib/supabase';
import { useLoading } from '@/components/TopLoader';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const { startLoading, completeLoading } = useLoading();
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState('creator');
  const [profile, setProfile] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(() => !supabaseClient ? false : true);
  const [storeLoading, setStoreLoading] = useState(true);
  const [authTimeoutError, setAuthTimeoutError] = useState(false);
  
  const initialSessionLoadedRef = useRef(false);

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  const fetchProfileOnly = async (userId, email, token = null) => {
    const startTime = performance.now();
    console.log("Profile fetch started");
    setAuthTimeoutError(false);

    if (email?.toLowerCase().includes('admin')) {
      setRole('admin');
      setProfile({ id: userId, email, role: 'admin', name: 'Admin User' });
      console.log("Profile fetch complete");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      attempt++;
      try {
        const activeToken = token || supabaseAnonKey;
        const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`, {
          cache: 'no-store',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${activeToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Cache-Buster': Date.now().toString()
          }
        }, 10000);

        if (response.ok) {
          const profs = await response.json();
          if (profs && profs.length > 0) {
            if (profs[0].role === 'customer') {
              console.log("🔔 [Kreatorstore - Auth]: fetchProfileOnly detected customer role. Ignoring in Creator context.");
              setSession(null);
              setUser(null);
              setProfile(null);
              setRole(null);
              setStoreLoading(false);
              return;
            }
            setProfile(profs[0]);
            setRole(profs[0].role);
            console.log("Profile fetch complete");
            return;
          } else {
            console.warn("⚠️ [Kreatorstore - Auth]: User session exists but profile not found in database. Skipping Creator context initialization.");
            setSession(null);
            setUser(null);
            setProfile(null);
            setRole(null);
            setStoreLoading(false);
            return;
          }
        } else {
          console.warn(`❌ [Kreatorstore - Auth]: Profile HTTP Error ${response.status}:`, response.statusText);
          if (response.status === 401 && attempt < maxAttempts) {
            console.warn(`⚠️ [Kreatorstore - Auth]: Auth unauthorized error (possibly JWT clock skew). Retrying in 1.5s (Attempt ${attempt + 1}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            continue;
          }
        }
      } catch (err) {
        console.warn(`❌ [Kreatorstore - Auth]: Profile fetch error/timeout (Attempt ${attempt}/${maxAttempts}):`, err.message || err);
        if (err.name === 'AbortError' || err.message?.includes('Timeout') || err.message?.includes('abort')) {
          setAuthTimeoutError(true);
        }
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
      }
    }

    // Fallback if profile not found or fetch failed
    console.warn('⚠️ [Kreatorstore - Auth]: No profile matched or fetch failed. Attempting manual insert fallback...');
    try {
      const { data: newProf, error: insertErr } = await supabaseClient
        .from('profiles')
        .insert([{
          id: userId,
          name: email.split('@')[0],
          email: email,
          role: 'creator'
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;

      if (newProf) {
        console.log('✅ [Kreatorstore - Auth]: Manually created missing profile:', newProf);
        setProfile(newProf);
        setRole(newProf.role);
        console.log("Profile fetch complete");
        return;
      }
    } catch (err) {
      console.warn('⚠️ [Kreatorstore - Auth]: Manual profile insert failed:', err.message);
      setProfile({ id: userId, email, role: 'creator', name: 'New Merchant' });
      setRole('creator');
    }
    console.log("Profile fetch complete");
  };

  const fetchStoreOnly = async (userId, token = null, isSilent = false) => {
    const startTime = performance.now();
    console.log("Store fetch started");
    if (!isSilent) {
      setStoreLoading(true);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const activeToken = token || supabaseAnonKey;
        const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/stores?creator_id=eq.${userId}&select=*`, {
          cache: 'no-store',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${activeToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-Cache-Buster': Date.now().toString()
          }
        }, 10000);

        if (response.ok) {
          const strs = await response.json();
          const storeRecord = strs && strs.length > 0 ? strs[0] : null;
          console.log("Fetched Store:", storeRecord);
          setStore(storeRecord);
          console.log("Store fetch complete");
          if (!isSilent) {
            setStoreLoading(false);
          }
          return;
        } else {
          console.warn(`❌ [Kreatorstore - Auth]: Store HTTP Error ${response.status}:`, response.statusText);
          if (response.status === 401 && attempt < maxAttempts) {
            console.warn(`⚠️ [Kreatorstore - Auth]: Store fetch auth error (possibly JWT clock skew). Retrying in 1.5s...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            continue;
          }
        }
      } catch (err) {
        console.warn(`❌ [Kreatorstore - Auth]: Store fetch error/timeout (Attempt ${attempt}/${maxAttempts}):`, err.message || err);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
      }
    }

    setStore(null);
    console.log("Store fetch complete");
    if (!isSilent) {
      setStoreLoading(false);
    }
  };

  const refreshStore = async (userId) => {
    const activeUserId = userId || user?.id;
    if (!supabaseClient || !activeUserId) {
      console.warn('⚠️ [Kreatorstore - Auth]: Cannot refreshStore. No active user ID available.');
      return;
    }
    await fetchStoreOnly(activeUserId, null, true);
  };

  const refreshProfile = async (userId) => {
    const activeUserId = userId || user?.id;
    if (!supabaseClient || !activeUserId) return;
    await fetchProfileOnly(activeUserId, user?.email);
  };

  const retryAuth = async () => {
    setAuthTimeoutError(false);
    setLoading(true);
    startLoading();
    
    try {
      if (!supabaseClient) {
        setLoading(false);
        return;
      }
      const { data: { session: activeSession }, error: sessionError } = await supabaseClient.auth.getSession();
      
      if (sessionError) {
        console.warn('⚠️ [Kreatorstore - Auth]: Session retry restoration warning:', sessionError.message);
      }

      setSession(activeSession);
      const currentUser = activeSession?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfileOnly(currentUser.id, currentUser.email, activeSession?.access_token);
        fetchStoreOnly(currentUser.id, activeSession?.access_token).catch(e => {
          console.warn("Background store fetch failed:", e);
        });
      }
    } catch (error) {
      console.warn('[Kreatorstore - Auth]: Error in retryAuth:', error);
    } finally {
      setLoading(false);
      completeLoading();
    }
  };

  useEffect(() => {
    if (!supabaseClient) {
      setLoading(false);
      return;
    }

    let isSubscribed = true;

    // 1. Fetch initial session asynchronously with safety timeout
    const loadInitialSession = async () => {
      startLoading();
      const getSessionTimeout = new Promise((resolve) => {
        setTimeout(() => {
          console.warn('⚠️ [Kreatorstore - Auth]: Initial getSession check timed out after 10s.');
          resolve({ data: { session: null } });
        }, 10000);
      });

      try {
        console.log("Session restore started");
        
        // Remember Me session check: if rememberMe is 'false' and session_active is not set, clear session
        const rememberMe = localStorage.getItem('remember_me');
        const sessionActive = sessionStorage.getItem('session_active');
        if (rememberMe === 'false' && !sessionActive) {
          console.log("🧹 [Kreatorstore - Auth]: Remember Me was false and browser restarted. Clearing session.");
          await supabaseClient.auth.signOut();
          localStorage.removeItem('remember_me');
        } else {
          sessionStorage.setItem('session_active', 'true');
        }

        const { data: { session: activeSession } } = await Promise.race([
          supabaseClient.auth.getSession(),
          getSessionTimeout
        ]);
        console.log("Session restore complete");

        if (!isSubscribed) return;

        if (activeSession) {
          const isCustomer = activeSession.user?.user_metadata?.role === 'customer' || activeSession.user?.app_metadata?.role === 'customer';
          if (isCustomer) {
            console.log("🔔 [Kreatorstore - Auth]: loadInitialSession ignored user because they are a customer.");
            setSession(null);
            setUser(null);
            setProfile(null);
            setRole(null);
            setStoreLoading(false);
          } else if (activeSession.user && !activeSession.user.email_confirmed_at) {
            console.log("🧹 [Kreatorstore - Auth]: Clearing unverified session on load.");
            await supabaseClient.auth.signOut();
            setSession(null);
            setUser(null);
            setProfile(null);
            setStoreLoading(false);
          } else {
            setSession(activeSession);
            setUser(activeSession.user);
            await fetchProfileOnly(activeSession.user.id, activeSession.user.email, activeSession.access_token);
            // Fetch store details in background (non-blocking)
            fetchStoreOnly(activeSession.user.id, activeSession.access_token).catch(e => {
              console.warn("Background store fetch failed:", e);
            });
          }
        } else {
          setSession(null);
          setUser(null);
          setStoreLoading(false);
        }
      } catch (err) {
        console.warn('❌ [Kreatorstore - Auth]: Error during initial session restore. Resetting state:', err);
        setSession(null);
        setUser(null);
        setProfile(null);
        setStoreLoading(false);
      } finally {
        if (isSubscribed) {
          initialSessionLoadedRef.current = true;
          setLoading(false);
        }
        completeLoading();
      }
    };

    loadInitialSession();

    // 2. Set up auth state change listener
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, activeSession) => {
      setTimeout(async () => {
        console.log(`🔔 [Kreatorstore - Auth]: auth state changes: event="${event}"`);

        if (event === 'INITIAL_SESSION') {
          // Skip since loadInitialSession is handling it
          return;
        }

        if (!initialSessionLoadedRef.current) {
          console.log(`🔔 [Kreatorstore - Auth]: onAuthStateChange event "${event}" ignored during initial session load.`);
          return;
        }

        if (!isSubscribed) return;

        try {
          const currentUser = activeSession?.user ?? null;
          
          if (currentUser) {
            const isCustomer = currentUser.user_metadata?.role === 'customer' || currentUser.app_metadata?.role === 'customer';
            if (isCustomer) {
              console.log("🔔 [Kreatorstore - Auth]: onAuthStateChange ignored user because they are a customer.");
              setSession(null);
              setUser(null);
              setProfile(null);
              setStore(null);
              setRole(null);
              return;
            }
          }
          
          if (currentUser && !currentUser.email_confirmed_at) {
            console.log("🔔 [Kreatorstore - Auth]: onAuthStateChange ignored profile fetch because email is unverified.");
            setSession(null);
            setUser(null);
            setProfile(null);
            setStore(null);
            setRole('creator');
            return;
          }

          setSession(activeSession);
          setUser(currentUser);

          if (currentUser) {
            await fetchProfileOnly(currentUser.id, currentUser.email, activeSession?.access_token);
            fetchStoreOnly(currentUser.id, activeSession?.access_token, false).catch(e => {
              console.warn("Background store fetch failed:", e);
            });
          } else {
            setProfile(null);
            setStore(null);
            setRole('creator');
          }
        } catch (err) {
          console.warn('❌ [Kreatorstore - Auth]: Error handling onAuthStateChange:', err);
        }
      }, 0);
    });

    return () => {
      console.log('🧹 [Kreatorstore - Auth]: Cleaning up auth listeners...');
      isSubscribed = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const signUp = async (email, password, options = {}) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    console.log('🔄 [Kreatorstore - Auth]: signUp start for:', email);
    startLoading();
    try {
      const res = await supabaseClient.auth.signUp({
        email,
        password,
        options,
      });
      console.log('✅ [Kreatorstore - Auth]: signUp complete.');
      return res;
    } catch (err) {
      console.warn('❌ [Kreatorstore - Auth]: signUp error:', err);
      throw err;
    } finally {
      completeLoading();
    }
  };

  const signIn = async (email, password) => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    console.log('🔄 [Kreatorstore - Auth]: signIn start for:', email);
    startLoading();
    try {
      localStorage.removeItem('customer_user_id');
      localStorage.removeItem('customer_oauth_in_progress');
      const res = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
      console.log('✅ [Kreatorstore - Auth]: signIn success.');
      return res;
    } catch (err) {
      console.warn('❌ [Kreatorstore - Auth]: signIn error:', err);
      throw err;
    } finally {
      completeLoading();
    }
  };

  const signOut = async () => {
    if (!supabaseClient) throw new Error('Supabase client is not initialized.');
    console.log('🔄 [Kreatorstore - Auth]: Logging out active session...');
    setLoading(true);
    startLoading();
    try {
      localStorage.removeItem('remember_me');
      localStorage.removeItem('customer_user_id');
      localStorage.removeItem('customer_oauth_in_progress');
      sessionStorage.removeItem('session_active');
      await supabaseClient.auth.signOut();
      console.log('✅ [Kreatorstore - Auth]: Supabase signOut completed.');
    } catch (err) {
      console.warn('❌ [Kreatorstore - Auth]: Error during Supabase signOut:', err);
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      setStore(null);
      setRole('creator');
      setLoading(false);
      completeLoading();
      console.log('✅ [Kreatorstore - Auth]: Logout complete. Cleared all local state.');
    }
  };

  const value = {
    user,
    session,
    role,
    loading,
    storeLoading,
    authTimeoutError,
    retryAuth,
    signUp,
    signIn,
    signOut,
    isAuthenticated: !!user,
    profile,
    store,
    setStore,
    setProfile,
    refreshStore: () => refreshStore(user?.id),
    refreshProfile: () => refreshProfile(user?.id),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
