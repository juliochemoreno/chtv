import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Radio,
  LayoutGrid,
  Calendar,
  LayoutDashboard,
  List,
  LogIn,
  LogOut,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import useAdminSession from '../../hooks/useAdminSession';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';
import styles from './Sidebar.module.css';

// Single source of truth for nav items. Each item is rendered as an icon-only
// button on the rail, with a tooltip showing the label on hover. The mobile
// drawer expands every item to icon + label.
//
// `match` is a predicate so each item decides its own active rule (lets us
// support query-param-aware shortcuts later without conflicts).
const PUBLIC_ITEMS = [
  {
    to: '/',
    icon: Radio,
    label: 'En vivo',
    match: (loc) => loc.pathname === '/',
  },
  {
    to: '/channels',
    icon: LayoutGrid,
    label: 'Canales',
    match: (loc) => loc.pathname.startsWith('/channels'),
  },
  {
    to: '/events',
    icon: Calendar,
    label: 'Eventos',
    match: (loc) => loc.pathname.startsWith('/events'),
  },
];

const ADMIN_ITEMS = [
  {
    to: '/admin/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    match: (loc) => loc.pathname === '/admin/dashboard',
  },
  {
    to: '/admin/playlists',
    icon: List,
    label: 'Listas',
    match: (loc) => loc.pathname.startsWith('/admin/playlists'),
  },
];

const EXPANDED_KEY = 'chtv:sidebar-expanded';

function readStoredExpanded() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

function SidebarItem({ item, expanded, onNavigate }) {
  const Icon = item.icon;
  const location = useLocation();
  const isActive = item.match(location);
  return (
    <li>
      <Link
        to={item.to}
        onClick={onNavigate}
        className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        title={item.label}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className={styles.navIcon}>
          <Icon size={16} strokeWidth={2.4} />
        </span>
        <span
          className={`${styles.navLabel} ${
            expanded ? styles.navLabelOn : styles.navLabelTooltip
          }`}
        >
          {item.label}
        </span>
      </Link>
    </li>
  );
}

/**
 * Control Deck sidebar — desktop: 64px icon rail, expandable to 220px and
 * persisted in localStorage. Mobile: hidden by default; `mobileOpen` opens
 * an overlay drawer with full labels regardless of the expand state.
 */
export default function Sidebar({ mobileOpen = false, onCloseMobile }) {
  const isAdmin = useAdminSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(readStoredExpanded);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Persist + sync the body's `--sidebar-w` so the rest of the layout knows
  // how much room the rail takes (used by anything that wants to align to it).
  useEffect(() => {
    try {
      window.localStorage.setItem(EXPANDED_KEY, expanded ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(
        '--sidebar-current-w',
        expanded ? 'var(--sidebar-w-expanded)' : 'var(--sidebar-w)',
      );
    }
  }, [expanded]);

  const requestLogout = () => setLogoutOpen(true);

  const confirmLogout = () => {
    try {
      localStorage.removeItem('apiKey');
      window.dispatchEvent(new Event('chtv:auth-change'));
    } catch {
      /* ignore */
    }
    setLogoutOpen(false);
    onCloseMobile?.();
    navigate('/admin');
  };

  const onLoginScreen = location.pathname === '/admin';

  return (
    <>
      {/* ---------- Desktop rail ---------- */}
      <aside
        className={styles.rail}
        data-expanded={expanded ? 'true' : 'false'}
        aria-label="Navegación principal"
      >
        <SidebarBody
          isAdmin={isAdmin}
          onLoginScreen={onLoginScreen}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((v) => !v)}
          onLogout={requestLogout}
          onNavigate={undefined}
        />
      </aside>

      {/* ---------- Logout confirmation ---------- */}
      <ConfirmDialog
        open={logoutOpen}
        kicker="// CERRAR SESIÓN"
        title="Salir del panel"
        description={
          <>
            Vas a cerrar tu sesión administrativa. Tendrás que volver a
            ingresar la API key para entrar al panel.
          </>
        }
        confirmLabel="Cerrar sesión"
        cancelLabel="Quedarme"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutOpen(false)}
      />

      {/* ---------- Mobile drawer ---------- */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className={styles.drawerScrim}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onCloseMobile}
              aria-hidden="true"
            />
            <motion.aside
              className={styles.drawer}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              aria-label="Navegación principal"
            >
              <div className={styles.drawerHeader}>
                <span className={styles.drawerKicker}>// SALA DE CONTROL</span>
                <button
                  type="button"
                  className={styles.drawerClose}
                  onClick={onCloseMobile}
                  aria-label="Cerrar menú"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              </div>
              <SidebarBody
                isAdmin={isAdmin}
                onLoginScreen={onLoginScreen}
                expanded
                onToggleExpanded={undefined}
                onLogout={requestLogout}
                onNavigate={onCloseMobile}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarBody({
  isAdmin,
  onLoginScreen,
  expanded,
  onToggleExpanded,
  onLogout,
  onNavigate,
}) {
  return (
    <div className={styles.body}>
      {/* Logo */}
      <Link
        to="/"
        className={styles.brand}
        aria-label="CHTV — Inicio"
        onClick={onNavigate}
      >
        <span className={styles.brandMark}>
          <span className={styles.brandCh}>CH</span>
          <span className={styles.brandSlash}>/</span>
          <span className={styles.brandTv}>TV</span>
        </span>
      </Link>

      {/* Public nav */}
      <nav className={styles.section} aria-label="Público">
        {expanded && <span className={styles.sectionLabel}>Público</span>}
        <ul className={styles.navList}>
          {PUBLIC_ITEMS.map((item) => (
            <SidebarItem
              key={item.to}
              item={item}
              expanded={expanded}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>

      {/* Spacer pushes admin + footer to the bottom */}
      <div className={styles.spacer} />

      {/* Admin nav (anchored to the bottom, above the footer) */}
      {isAdmin && (
        <nav
          className={`${styles.section} ${styles.sectionBottom}`}
          aria-label="Administración"
        >
          {expanded && <span className={styles.sectionLabel}>Admin</span>}
          <ul className={styles.navList}>
            {ADMIN_ITEMS.map((item) => (
              <SidebarItem
                key={item.to}
                item={item}
                expanded={expanded}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </nav>
      )}

      {/* Footer: login/logout + expand toggle */}
      <div className={styles.footer}>
        {onLoginScreen ? null : isAdmin ? (
          <button
            type="button"
            className={styles.footerBtn}
            onClick={onLogout}
            title="Cerrar sesión"
          >
            <span className={styles.navIcon}>
              <LogOut size={16} strokeWidth={2.4} />
            </span>
            <span
              className={`${styles.navLabel} ${
                expanded ? styles.navLabelOn : styles.navLabelTooltip
              }`}
            >
              Cerrar sesión
            </span>
          </button>
        ) : (
          <Link
            to="/admin"
            className={styles.footerBtn}
            onClick={onNavigate}
            title="Acceso administrador"
          >
            <span className={styles.navIcon}>
              <LogIn size={16} strokeWidth={2.4} />
            </span>
            <span
              className={`${styles.navLabel} ${
                expanded ? styles.navLabelOn : styles.navLabelTooltip
              }`}
            >
              Login
            </span>
          </Link>
        )}

        {/* Expand/collapse toggle — only on desktop rail (drawer always full) */}
        {onToggleExpanded && (
          <button
            type="button"
            className={`${styles.footerBtn} ${styles.toggleBtn}`}
            onClick={onToggleExpanded}
            title={expanded ? 'Colapsar' : 'Expandir'}
            aria-label={expanded ? 'Colapsar menú' : 'Expandir menú'}
          >
            <span className={styles.navIcon}>
              {expanded ? (
                <PanelLeftClose size={16} strokeWidth={2.4} />
              ) : (
                <PanelLeftOpen size={16} strokeWidth={2.4} />
              )}
            </span>
            <span
              className={`${styles.navLabel} ${
                expanded ? styles.navLabelOn : styles.navLabelTooltip
              }`}
            >
              Colapsar
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
