import { useContext, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ChannelContext } from '../context/ChannelContext';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import styles from './Home.module.css';

/**
 * Legacy deep-link route. Redirects /channel/:id to the canonical /?ch=<slug>.
 * The Home page handles the actual rendering using the URL search param.
 */
export default function ChannelPage() {
  const { channelId } = useParams();
  const { channels, loading } = useContext(ChannelContext);

  // Wait for channels to load before resolving redirect
  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <LoadingSpinner label="Cargando canal" />
      </div>
    );
  }

  const channel = channels.find((ch) => ch.id === parseInt(channelId, 10));

  if (!channel) {
    // Unknown id → fall back to home (which picks last/first channel)
    return <Navigate to="/" replace />;
  }

  return <Navigate to={`/?ch=${encodeURIComponent(channel.slug)}`} replace />;
}
