import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { Lobby, Table, GameRoom } from './components';
import './styles.css';
import './table-room.css';
import './table-polish.css';
import { lazy, Suspense } from 'react';
const TablePreview = lazy(() => import('./components/game/table3d/TablePreview'));
const SpectatePage = lazy(() => import('./components/spectate/SpectatePage'));

export default function App(){
  return (
    <Router>
      <Routes>
        <Route path="/preview" element={<Suspense fallback={<div>Opening the table…</div>}><TablePreview /></Suspense>} />
        <Route path="/spectate" element={<Suspense fallback={null}><SpectatePage /></Suspense>} />
        <Route path="/spectate/:roomId" element={<Suspense fallback={null}><SpectatePage /></Suspense>} />
        <Route path="/" element={<Lobby />} />
        <Route path="/room/:roomId/:playerId" element={<GameRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
