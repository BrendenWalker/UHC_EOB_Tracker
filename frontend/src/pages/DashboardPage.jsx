import React, { useEffect, useState } from 'react';
import { deleteEob, getDashboard } from '../api/api';
import DashboardSummaryCards from '../components/DashboardSummaryCards';
import ClaimTable from '../components/ClaimTable';
import DuplicateEobPanel from '../components/DuplicateEobPanel';
import './DashboardPage.css';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await getDashboard();
      setData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDuplicates = async (ids) => {
    try {
      for (const id of ids) {
        setDeletingId(id);
        await deleteEob(id);
      }
      await loadDashboard();
    } catch (err) {
      setError('Failed to delete duplicate EOB');
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="page-message">Loading dashboard...</div>;
  if (error && !data) return <div className="page-message error">{error}</div>;

  return (
    <div className="dashboard-page page-scroll">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Track unbilled and unpaid claims from your UHC EOB statements.</p>
      </header>

      {error && <p className="error-inline">{error}</p>}

      <DuplicateEobPanel
        groups={data.duplicates}
        onDelete={handleDeleteDuplicates}
        deletingId={deletingId}
      />

      <DashboardSummaryCards summary={data.summary} />

      <section className="dashboard-section">
        <h2>Unbilled</h2>
        <p className="section-hint">Amount owed per EOB but no provider bill received yet.</p>
        <ClaimTable claims={data.claims.unbilled} />
      </section>

      <section className="dashboard-section">
        <h2>Unpaid</h2>
        <p className="section-hint">Provider bill received — payment not yet recorded.</p>
        <ClaimTable claims={data.claims.unpaid} />
      </section>

      <section className="dashboard-section">
        <h2>Recently Paid</h2>
        <ClaimTable claims={data.claims.paid} />
      </section>
    </div>
  );
}
