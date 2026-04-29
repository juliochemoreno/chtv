import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ChannelProvider } from './context/ChannelContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import TopBar from './components/TopBar/TopBar';
import Sidebar from './components/Sidebar/Sidebar';
import LoadingSpinner from './components/LoadingSpinner/LoadingSpinner';
import styles from './App.module.css';

// Each route ships its own chunk. The shell (TopBar + Sidebar +
// LiveTicker + ThemeProvider + the data contexts) stays in the entry
// bundle so chrome paints immediately on navigation. Pages that have
// already been visited reuse the cached chunk on the next visit, so a
// Home → Channels → Home round-trip pays the chunk cost only once.
const Home = lazy(() => import('./pages/Home'));
const Channels = lazy(() => import('./pages/Channels'));
const Events = lazy(() => import('./pages/Events'));
const ChannelPage = lazy(() => import('./pages/ChannelPage'));
const AdminLogin = lazy(() => import('./pages/Admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'));
const AdminPlaylists = lazy(() => import('./pages/Admin/AdminPlaylists'));

function RouteFallback() {
  return (
    <div className={styles.routeFallback}>
      <LoadingSpinner label="Cargando" />
    </div>
  );
}

function Shell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer whenever the route changes (defense in depth — items
  // also call onCloseMobile, but pasting/Back can land here without that).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className={styles.shell}>
      <TopBar onOpenMobileMenu={() => setDrawerOpen(true)} />
      <div className={styles.body}>
        <Sidebar
          mobileOpen={drawerOpen}
          onCloseMobile={() => setDrawerOpen(false)}
        />
        <main className={styles.main}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/channels" element={<Channels />} />
              <Route path="/events" element={<Events />} />
              <Route path="/channel/:channelId" element={<ChannelPage />} />
              <Route path="/admin" element={<AdminLogin />} />
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/playlists"
                element={
                  <ProtectedRoute>
                    <AdminPlaylists />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <FavoritesProvider>
          <ChannelProvider>
            <Shell />
          </ChannelProvider>
        </FavoritesProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
