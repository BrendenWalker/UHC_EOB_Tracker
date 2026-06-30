import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import EobListPage from './pages/EobListPage';
import EobDetailPage from './pages/EobDetailPage';
import EobNewPage from './pages/EobNewPage';
import ClaimDetailPage from './pages/ClaimDetailPage';
import VersionFooter from './components/VersionFooter';
import './App.css';

function App() {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            UHC EOB Tracker
          </Link>
          <div className="nav-links">
            <Link to="/" className="nav-link">
              Dashboard
            </Link>
            <Link to="/eobs" className="nav-link">
              EOB Statements
            </Link>
            <Link to="/eobs/new" className="nav-link">
              Add EOB
            </Link>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/eobs" element={<EobListPage />} />
          <Route path="/eobs/new" element={<EobNewPage />} />
          <Route path="/eobs/:id" element={<EobDetailPage />} />
          <Route path="/claims/:id" element={<ClaimDetailPage />} />
        </Routes>
      </main>
      <VersionFooter />
    </div>
  );
}

export default App;
