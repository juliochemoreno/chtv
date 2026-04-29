import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { KeyRound, AlertCircle, ChevronRight, Loader2, Clock } from 'lucide-react';
import { api } from '../../services/api';
import styles from './Admin.module.css';

export default function AdminLogin() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Ingresa una API Key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.validateApiKey(apiKey);
      localStorage.setItem('apiKey', apiKey);
      window.dispatchEvent(new Event('chtv:auth-change'));
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message === 'API Key inválida'
        ? 'API Key inválida'
        : 'Error al conectar con el servidor');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginRoot}>
      <motion.div
        className={styles.loginShell}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className={styles.loginTopbar}>
          <span className={styles.loginTopbarLeft}>
            <span className={styles.loginTopbarDot} />
            ACCESO SALA DE CONTROL
          </span>
          <span className={styles.loginTopbarMid}>RESTRINGIDO · SOLO STAFF</span>
        </div>

        <div className={styles.loginCard}>
          <div>
            <span className={styles.loginKicker}>// AUTORIZACIÓN REQUERIDA</span>
            <h1 className={styles.loginTitle}>Sala de Control</h1>
            <p className={styles.loginSubtitle}>
              Ingresa tu API key para gestionar canales, agenda y operaciones.
            </p>
          </div>

          {sessionExpired && (
            <div className={styles.loginExpired}>
              <Clock size={14} strokeWidth={2.4} />
              <span>
                <strong>Sesión expirada.</strong> Vuelve a iniciar sesión para continuar.
              </span>
            </div>
          )}

          <form onSubmit={handleLogin} className={styles.loginFormGroup}>
            <label htmlFor="adminApiKey" className={styles.loginLabel}>
              API Key
            </label>
            <input
              id="adminApiKey"
              type="password"
              placeholder="••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={styles.loginInput}
              disabled={loading}
              autoComplete="off"
              spellCheck="false"
            />

            {error && (
              <div className={styles.loginError}>
                <AlertCircle size={14} strokeWidth={2.4} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className={styles.loginButton}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={14} strokeWidth={2.4} className={styles.spinIcon} />
                  Validando…
                </>
              ) : (
                <>
                  <KeyRound size={14} strokeWidth={2.4} />
                  Acceder
                  <ChevronRight size={14} strokeWidth={2.6} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className={styles.loginFootnote}>
          ¿No eres admin? Vuelve al{' '}
          <a href="/" className={styles.loginFootnoteLink}>panel público</a>
        </p>
      </motion.div>
    </div>
  );
}
