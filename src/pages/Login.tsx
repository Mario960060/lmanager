import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { HardHat } from 'lucide-react';
import {
  GlobalStyles,
  Spinner,
  Button,
  Card,
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
  gradients,
  shadows,
} from '../themes';

const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

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
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (signInError) throw signInError;

            if (user) {
              setUser(user);

              const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('role, full_name, email, company_id')
                .eq('id', user.id)
                .single();

              if (profileError) throw new Error('Failed to fetch user profile');

              if (profileData) {
                setProfile(profileData);
                navigate('/');
                return;
              }
            }
          } catch (err) {
            retryCount++;
            if (retryCount === maxRetries) throw err;
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          }
        }
      } else {
        const { data: { user }, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });

        if (signUpError) throw signUpError;

        if (user) {
          setUser(user);

          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: user.id, email, full_name: fullName, role: 'user' }])
            .select('role, full_name, email')
            .single();

          if (profileError) throw new Error('Failed to create user profile');

          if (profileData) {
            setProfile(profileData);
            navigate('/');
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const inputBaseStyle: React.CSSProperties = {
    width: '100%',
    padding: `${spacing.xl}px ${spacing['2xl']}px`,
    background: colors.bgInput,
    border: `1px solid ${colors.borderInput}`,
    borderRadius: radii.xl,
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontFamily: fonts.body,
    outline: 'none',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bgApp,
        fontFamily: fonts.body,
        padding: spacing['6xl'],
      }}
    >
      <GlobalStyles />
      <style>{`input::placeholder { color: ${colors.textFaint}; }`}</style>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        {/* Header */}
        <div style={{ marginBottom: spacing['7xl'] }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto',
              borderRadius: radii.xl,
              background: gradients.blueLogo,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: shadows.blue,
            }}
          >
            <HardHat size={28} color="#fff" strokeWidth={2.5} />
          </div>
          <h1
            style={{
              marginTop: spacing['4xl'],
              fontSize: fontSizes['3xl'],
              fontWeight: fontWeights.bold,
              color: colors.textPrimary,
              fontFamily: fonts.display,
              letterSpacing: '0.5px',
            }}
          >
            {t('common:welcome_title')}
          </h1>
          <p style={{ marginTop: spacing.sm, fontSize: fontSizes.sm, color: colors.textFaint }}>
            {t('common:powered_by')}
          </p>
        </div>

        {/* Form card */}
        <Card padding={`${spacing['7xl']}px`} style={{ marginBottom: spacing['5xl'] }}>
          {/* Email input - outside form for autofill */}
          <div style={{ marginBottom: spacing['4xl'] }}>
            <label htmlFor="email-address" style={srOnly}>
              {t('common:email')}
            </label>
            <input
              id="email-address"
              type="email"
              autoComplete="email"
              required
              placeholder={t('common:email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                ...inputBaseStyle,
                borderColor: colors.borderInput,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderInputFocus)}
              onBlur={(e) => (e.currentTarget.style.borderColor = colors.borderInput)}
            />
          </div>

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: spacing['4xl'] }}>
            <input type="hidden" name="email" value={email} />

            {!isLogin && (
              <div>
                <Label>
                  <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                    {t('common:full_name')}
                  </span>
                </Label>
                <input
                  id="full-name"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required={!isLogin}
                  placeholder={t('common:full_name')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={inputBaseStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderInputFocus)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = colors.borderInput)}
                />
              </div>
            )}

            <div>
              <label htmlFor="password" style={srOnly}>
                {t('common:password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                placeholder={t('common:password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputBaseStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = colors.borderInputFocus)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.borderInput)}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: spacing.xl,
                  background: 'rgba(239,68,68,0.15)',
                  border: `1px solid rgba(239,68,68,0.3)`,
                  borderRadius: radii.lg,
                  color: colors.redLight,
                  fontSize: fontSizes.sm,
                  fontFamily: fonts.body,
                }}
              >
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" fullWidth disabled={loading}>
              {loading ? <Spinner size={20} /> : isLogin ? t('common:sign_in') : t('common:sign_up')}
            </Button>
          </form>

          <p
            style={{
              marginTop: spacing['4xl'],
              fontSize: fontSizes.sm,
              color: colors.textSubtle,
              fontFamily: fonts.body,
            }}
          >
            {isLogin ? t('common:dont_have_account') : t('common:already_have_account')}{' '}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.accentBlue,
                fontFamily: fonts.body,
                fontWeight: fontWeights.semibold,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              {isLogin ? t('common:sign_up') : t('common:sign_in')}
            </button>
          </p>

          <div style={{ marginTop: spacing['5xl'] }}>
            <Button
              variant="secondary"
              onClick={() => alert(t('common:subscription_thanks'))}
            >
              {t('common:buy_subscription')}
            </Button>
          </div>
        </Card>

        {/* Footer */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: spacing['4xl'],
            fontSize: fontSizes.sm,
            color: colors.textSubtle,
          }}
        >
          <div>
            <div style={{ color: colors.textSecondary, marginBottom: spacing.sm, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
              {t('common:contact_us')}
            </div>
            <a
              href="https://www.Altomatic-Future.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.accentBlue, textDecoration: 'none' }}
            >
              Altomatic-Future
            </a>
          </div>
          <div>
            <a
              href="https://www.instagram.com/aitomatic_future"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: colors.accentBlue,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
              }}
            >
              <svg width={18} height={18} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              {t('common:instagram')}
            </a>
          </div>
          <div>
            <div style={{ color: colors.textSecondary, marginBottom: spacing.sm, fontFamily: fonts.display, fontWeight: fontWeights.semibold }}>
              {t('common:see_how_works')}
            </div>
            <a
              href="https://www.youtube.com/film"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.accentBlue, textDecoration: 'none' }}
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
