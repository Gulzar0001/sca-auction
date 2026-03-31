import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import PublicScreen from './pages/PublicScreen';
import Admin from './pages/Admin';

export default function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/auction" replace />} />
          <Route path="/auction" element={<PublicScreen />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}
