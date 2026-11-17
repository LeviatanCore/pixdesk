import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseCallbackHash } from '../lib/leviatanAuth';

function AuthCallback() {
  const navigate = useNavigate();
  const { acceptToken } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { token } = parseCallbackHash(window.location.hash);
      if (!token) {
        setError('No session token received. Try signing in again.');
        return;
      }
      try {
        await acceptToken(token);
        if (!cancelled) {
          window.history.replaceState({}, '', '/auth/callback');
          navigate('/', { replace: true });
        }
      } catch {
        if (!cancelled) setError('Could not finish sign-in.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acceptToken, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-md w-full text-center space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Leviatan Core</p>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          {error ? 'Sign-in failed' : 'Signing you in…'}
        </h1>
        {error ? (
          <>
            <p className="text-sm text-rose-500">{error}</p>
            <Link className="text-sm text-cyan-600 hover:underline" to="/">
              Back to Pixdesk
            </Link>
          </>
        ) : (
          <p className="text-sm text-gray-500">Preferences sync. Media stays on this computer.</p>
        )}
      </div>
    </div>
  );
}

export default AuthCallback;
