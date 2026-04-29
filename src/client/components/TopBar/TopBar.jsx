import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import LiveTicker from '../Navbar/LiveTicker';
import styles from './TopBar.module.css';

/**
 * Compact top strip: live events ticker + (mobile only) menu trigger.
 * Sits sticky at the top of the viewport. The Sidebar handles real navigation
 * — this bar exists purely to keep the live agenda always visible and to
 * expose the drawer toggle on small screens.
 */
export default function TopBar({ onOpenMobileMenu }) {
  return (
    <header className={styles.root}>
      <button
        type="button"
        className={styles.menuBtn}
        onClick={onOpenMobileMenu}
        aria-label="Abrir menú"
      >
        <Menu size={16} strokeWidth={2.4} />
      </button>

      <Link to="/" className={styles.brand} aria-label="CHTV — Inicio">
        <span className={styles.brandCh}>CH</span>
        <span className={styles.brandSlash}>/</span>
        <span className={styles.brandTv}>TV</span>
      </Link>

      <div className={styles.tickerWrap}>
        <LiveTicker />
      </div>
    </header>
  );
}
