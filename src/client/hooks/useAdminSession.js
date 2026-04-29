import { useEffect, useState } from 'react';

// Tracks whether the current browser has an admin API key in localStorage.
// Listens to the `chtv:auth-change` custom event so login/logout in any
// component (Navbar, AdminLogin, useAuthGuard) updates every consumer.
export default function useAdminSession() {
  const [hasKey, setHasKey] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!window.localStorage.getItem('apiKey');
  });

  useEffect(() => {
    const sync = () => setHasKey(!!window.localStorage.getItem('apiKey'));
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('chtv:auth-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('chtv:auth-change', sync);
    };
  }, []);

  return hasKey;
}
