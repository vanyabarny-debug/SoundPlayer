import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AuthPage } from './pages/AuthPage';
import { ProfilePage } from './pages/ProfilePage';
import { ArtistPage } from './pages/ArtistPage';
import { AlbumPage } from './pages/AlbumPage';
import { BrowsePage } from './pages/BrowsePage';
import { RadoogaPage } from './pages/RadoogaPage';
import { Layout } from './components/Layout';

function AppContent() {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const location = useLocation();

  if (!currentUserId) {
    return <AuthPage />;
  }

  return (
    <Layout>
      <div className="w-full h-full">
        <Routes location={location}>
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/radooga" element={<RadoogaPage />} />
          <Route path="/library" element={<Navigate to="/radooga" replace />} />
          <Route path="/artist/:id" element={<ArtistPage />} />
          <Route path="/playlist/:id" element={<AlbumPage />} />
          <Route path="/album/:id" element={<AlbumPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/browse" replace />} />
        </Routes>
      </div>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
