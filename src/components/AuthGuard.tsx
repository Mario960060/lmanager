import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { supabase } from '../lib/supabase';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { user, setUser, setProfile } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔐 AuthGuard: Checking auth...');
      const { data: { session }, error } = await supabase.auth.getSession();
      
      console.log('🔐 AuthGuard: Session check result:', { hasSession: !!session, error });
      
      if (error) {
        console.error('🔐 AuthGuard: Auth check error:', error);
        navigate('/login');
        return;
      }

      if (session?.user) {
        console.log('🔐 AuthGuard: User found:', session.user.id);
        setUser(session.user);
        
        // Fetch profile data
        console.log('🔐 AuthGuard: Fetching profile...');
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role, full_name, email, company_id')
          .eq('id', session.user.id)
          .single();

        console.log('🔐 AuthGuard: Profile response:', { profileData, error: profileError });

        if (profileError) {
          console.error('🔐 AuthGuard: Profile fetch error:', profileError);
          return;
        }

        if (profileData) {
          console.log('🔐 AuthGuard: Profile loaded:', profileData);
          setProfile(profileData);
          
          // Check if user has company_id
          if (!(profileData as any).company_id) {
            console.log('🔐 AuthGuard: No company_id, redirecting to /no-team');
            navigate('/no-team', { replace: true });
          }
        }
      } else {
        console.log('🔐 AuthGuard: No session, redirecting to login');
        navigate('/login');
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 AuthGuard: Auth state changed:', { event, hasSession: !!session });
      
      if (event === 'SIGNED_OUT') {
        console.log('🔐 AuthGuard: User signed out');
        setUser(null);
        setProfile(null);
        navigate('/login');
      } else if (session?.user) {
        console.log('🔐 AuthGuard: User session detected:', session.user.id);
        setUser(session.user);
      }
    });

    return () => {
      console.log('🔐 AuthGuard: Cleaning up subscription');
      subscription.unsubscribe();
    };
  }, []);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
