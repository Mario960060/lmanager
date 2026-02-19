import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { HardHat, Loader2 } from 'lucide-react';

const Login = () => {
  const { t } = useTranslation(['common', 'form']);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const setProfile = useAuthStore((state) => state.setProfile);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        console.log('🔐 Starting sign in attempt...');
        // Sign in with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            console.log(`🔐 Sign in attempt ${retryCount + 1}/${maxRetries}`);
            const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            console.log('🔐 Sign in response:', { user: user?.id, error: signInError });

            if (signInError) throw signInError;

            if (user) {
              console.log('✅ User signed in:', user.id);
              setUser(user);
              
              // Get profile data
              console.log('📊 Fetching profile...');
              const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('role, full_name, email, company_id')
                .eq('id', user.id)
                .single();

              console.log('📊 Profile response:', { profileData, error: profileError });

              if (profileError) {
                console.error('❌ Profile fetch error:', profileError);
                throw new Error('Failed to fetch user profile');
              }

              if (profileData) {
                console.log('✅ Profile loaded:', profileData);
                setProfile(profileData);
                console.log('🔀 Navigating to /');
                navigate('/');
                return; // Success - exit the retry loop
              }
            }
          } catch (err) {
            console.error(`❌ Attempt ${retryCount + 1} failed:`, err);
            retryCount++;
            if (retryCount === maxRetries) {
              throw err; // Rethrow on final retry
            }
            // Wait before retrying (exponential backoff)
            const waitTime = Math.pow(2, retryCount) * 1000;
            console.log(`⏳ Retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      } else {
        // Sign up
        const { data: { user }, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (user) {
          setUser(user);
          
          // Create profile
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .insert([
              {
                id: user.id,
                email,
                full_name: fullName,
                role: 'user',
              }
            ])
            .select('role, full_name, email')
            .single();

          if (profileError) {
            console.error('Profile creation error:', profileError);
            throw new Error('Failed to create user profile');
          }

          if (profileData) {
            setProfile(profileData);
            navigate('/');
          }
        }
      }
    } catch (err) {
      console.error('❌ Auth error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-800 p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <div className="flex justify-center">
            <HardHat className="h-12 w-12 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-white text-center">
            {t('common:welcome_title')}
          </h1>
          <p className="text-sm text-gray-400">
            {t('common:powered_by')}
          </p>
        </div>
        
        {/* Email input - SEPARATE from form for autofill dropdown freedom */}
        <div>
          <label htmlFor="email-address" className="sr-only">
            {t('common:email')}
          </label>
          <input
            id="email-address"
            type="email"
            autoComplete="email"
            required
            className="appearance-none rounded-md block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder={t('common:email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <form className="mt-4 space-y-6" onSubmit={handleAuth}>
          {/* Hidden input to keep email in form context for submission */}
          <input type="hidden" name="email" value={email} />
          
          {/* All inputs grouped together */}
          <div className="rounded-md shadow-sm -space-y-px">

            {/* Full Name - only for sign up - NOW FIRST */}
            {!isLogin && (
              <div>
                <label htmlFor="full-name" className="sr-only">
                  {t('common:full_name')}
                </label>
                <input
                  id="full-name"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required={!isLogin}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm rounded-t-md"
                  placeholder={t('common:full_name')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

            {/* Password input - LAST */}
            <div>
              <label htmlFor="password" className="sr-only">
                {t('common:password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                className={`appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm rounded-b-md ${isLogin ? 'rounded-t-md' : ''}`}
                placeholder={t('common:password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                isLogin ? t('common:sign_in') : t('common:sign_up')
              )}
            </button>
          </div>
        </form>
        <p className="mt-2 text-center text-sm text-gray-600">
          {isLogin ? t('common:dont_have_account') : t('common:already_have_account')}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            {isLogin ? t('common:sign_up') : t('common:sign_in')}
          </button>
        </p>
        <div className="pt-6">
          <button 
            onClick={() => {
              alert(t('common:subscription_thanks'));
            }}
            className="text-sm px-4 py-2 border border-gray-600 rounded-md text-gray-300 hover:bg-gray-700 transition-colors"
          >
            {t('common:buy_subscription')}
          </button>
        </div>
        <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <h3 className="text-white mb-2">{t('common:contact_us')}</h3>
            <a 
              href="https://www.Altomatic-Future.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400"
            >
              Altomatic-Future
            </a>
          </div>
          
          <div>
            <a 
              href="https://www.instagram.com/aitomatic_future" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400 flex items-center justify-center"
            >
              <svg className="h-5 w-5 mr-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              {t('common:instagram')}
            </a>
          </div>
          
          <div>
            <div className="mb-2 text-white">{t('common:see_how_works')}</div>
            <a 
              href="https://www.youtube.com/film" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400"
            >
              {t('common:youtube_tutorial')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
