import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AuthPage } from './pages/AuthPage';
import { LibraryPage } from './pages/LibraryPage';
import { ProfilePage } from './pages/ProfilePage';
import { ArtistPage } from './pages/ArtistPage';
import { AlbumPage } from './pages/AlbumPage';
import { BrowsePage } from './pages/BrowsePage';
import { Layout } from './components/Layout';
import { AnimatePresence, motion } from 'motion/react';

function AppContent() {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const location = useLocation();

  if (!currentUserId) {
    return <AuthPage />;
  }

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="w-full h-full"
        >
          <Routes location={location}>
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="/playlist/:id" element={<AlbumPage />} />
            <Route path="/album/:id" element={<AlbumPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/browse" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
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
