import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { devLoginUrl, googleLoginUrl } from '../lib/leviatanAuth';
import Transition from '../utils/Transition';

function AccountMenu() {
  const { loading, user, entitlements, authConfig, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    const onClick = ({ target }) => {
      if (!panel.current) return;
      if (!open || panel.current.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  });

  useEffect(() => {
    const onKey = ({ keyCode }) => {
      if (open && keyCode === 27) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (loading) {
    return <span className="text-xs text-gray-400">…</span>;
  }

  if (!user) {
    return (
      <div className="relative inline-flex">
        <button
          ref={trigger}
          type="button"
          className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          Sign in
        </button>
        <Transition
          className="origin-top-right z-20 absolute top-full right-0 min-w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-2 rounded-lg shadow-lg mt-1"
          show={open}
          enter="transition ease-out duration-200 transform"
          enterStart="opacity-0 -translate-y-2"
          enterEnd="opacity-100 translate-y-0"
          leave="transition ease-out duration-150"
          leaveStart="opacity-100"
          leaveEnd="opacity-0"
        >
          <div ref={panel} className="px-3 space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
              Leviatan account — optional. Media never leaves this PC.
            </p>
            {authConfig.google ? (
              <a
                className="block w-full text-center text-sm font-medium rounded-lg py-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                href={googleLoginUrl('pixdesk')}
              >
                Continue with Google
              </a>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Google OAuth not configured on leviatan-auth yet.
              </p>
            )}
            {authConfig.devLogin && (
              <a
                className="block w-full text-center text-sm font-medium rounded-lg py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                href={devLoginUrl('pixdesk')}
              >
                Dev sign-in
              </a>
            )}
            {authConfig.offline && (
              <p className="text-xs text-rose-500 pb-1">Auth service offline (:8790).</p>
            )}
          </div>
        </Transition>
      </div>
    );
  }

  const plan = entitlements?.plan || user.plan || 'free';
  const picture = user.picture;

  return (
    <div className="relative inline-flex">
      <button
        ref={trigger}
        type="button"
        className="inline-flex items-center gap-2 group"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {picture ? (
          <img className="w-8 h-8 rounded-full object-cover" src={picture} alt="" width="32" height="32" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-xs font-semibold inline-flex items-center justify-center">
            {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-100 truncate max-w-[9rem]">
            {user.name || user.email}
          </span>
          <span className={`text-[10px] uppercase tracking-wide ${plan === 'pro' ? 'text-amber-500' : 'text-gray-400'}`}>
            {plan}
          </span>
        </span>
      </button>
      <Transition
        className="origin-top-right z-20 absolute top-full right-0 min-w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-2 rounded-lg shadow-lg mt-1"
        show={open}
        enter="transition ease-out duration-200 transform"
        enterStart="opacity-0 -translate-y-2"
        enterEnd="opacity-100 translate-y-0"
        leave="transition ease-out duration-150"
        leaveStart="opacity-100"
        leaveEnd="opacity-0"
      >
        <div ref={panel}>
          <div className="px-3 pb-2 mb-1 border-b border-gray-200 dark:border-gray-700/60">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{user.email}</div>
            <div className="text-xs text-gray-500">
              Plan {plan}
              {entitlements?.features?.proBadge ? ' · Pro ready' : ''}
            </div>
          </div>
          <p className="px-3 py-1 text-[11px] text-gray-400">
            Cloud stores prefs & plan only — not your videos or music.
          </p>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm text-rose-500 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            onClick={() => {
              signOut();
              setOpen(false);
            }}
          >
            Sign out
          </button>
        </div>
      </Transition>
    </div>
  );
}

export default AccountMenu;
