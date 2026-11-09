import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export default function App() {
  const [activeTab, setActiveTab] = useState('parent');
  const [studentId, setStudentId] = useState(() => localStorage.getItem('studentId') || '');
  const [classes, setClasses] = useState([]);
  const [myHolds, setMyHolds] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [now, setNow] = useState(new Date());

  const [className, setClassName] = useState('');
  const [totalSeats, setTotalSeats] = useState(50);

  useEffect(() => {
    if (studentId) {
      localStorage.setItem('studentId', studentId);
    } else {
      localStorage.removeItem('studentId');
    }
  }, [studentId]);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (studentId) {
      fetchMyHolds();
    }
  }, [studentId]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchClasses();
      if (studentId) fetchMyHolds();
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [studentId]);

  const fetchClasses = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/classes`);
      setClasses(res.data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to sync class status from server.');
    }
  };

  const fetchMyHolds = async () => {
    if (!studentId.trim()) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/me/holds`, {
        headers: { 'X-Student-Id': studentId.trim() }
      });
      setMyHolds(res.data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to fetch student application details.');
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      await axios.post(`${API_BASE_URL}/classes`, {
        name: className,
        totalSeats: parseInt(totalSeats, 10)
      });
      setClassName('');
      fetchClasses();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to create class.');
    }
  };

  const handleApply = async (classId) => {
    setErrorMessage('');
    if (!studentId.trim()) {
      setErrorMessage('Please enter your 17-digit Birth Registration Number first.');
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/classes/${classId}/holds`, {}, {
        headers: { 'X-Student-Id': studentId.trim() }
      });
      fetchClasses();
      fetchMyHolds();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to reserve seat.');
    }
  };

  const handleConfirm = async (holdId) => {
    setErrorMessage('');
    try {
      await axios.post(`${API_BASE_URL}/holds/${holdId}/confirm`, {}, {
        headers: { 'X-Student-Id': studentId.trim() }
      });
      fetchClasses();
      fetchMyHolds();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to confirm admission.');
    }
  };

  const handleCancel = async (holdId) => {
    setErrorMessage('');
    try {
      await axios.delete(`${API_BASE_URL}/holds/${holdId}`, {
        headers: { 'X-Student-Id': studentId.trim() }
      });
      fetchClasses();
      fetchMyHolds();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to cancel reservation.');
    }
  };

  const getRemainingTime = (expiresAt) => {
    const diff = new Date(expiresAt) - now;
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="app-container">
      <header className="header">
        <div>
          <h1 className="brand-title">School Admission Portal</h1>
          <p className="brand-subtitle">First-Come, First-Served Real-Time Seat Allocation</p>
        </div>
        <nav className="nav-tabs">
          <button 
            className={`tab-btn ${activeTab === 'parent' ? 'active' : ''}`}
            onClick={() => setActiveTab('parent')}
          >
            Parent Portal
          </button>
          <button 
            className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            School Admin
          </button>
        </nav>
      </header>

      {errorMessage && (
        <div className="error-banner">
          <span>{errorMessage}</span>
          <button className="error-close-btn" onClick={() => setErrorMessage('')}>✕</button>
        </div>
      )}

      {activeTab === 'parent' && (
        <div>
          <div className="card">
            <h2 className="card-title">Student Identity verification</h2>
            <div className="form-group">
              <label className="form-label">Birth Registration Number (17 Digits)</label>
              <input 
                className="form-input"
                type="text" 
                placeholder="e.g. 20152691234567890" 
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              />
            </div>
          </div>

          <h2 className="section-title">Available Classes & Shifts</h2>
          <div className="grid">
            {classes.map((c) => {
              const confirmedPct = (c.confirmedSeats / c.totalSeats) * 100;
              const heldPct = (c.heldSeats / c.totalSeats) * 100;
              const availablePct = (c.availableSeats / c.totalSeats) * 100;

              return (
                <div key={c.id} className="card">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{c.name}</h3>

                  <div className="seat-meter-container">
                    <div className="seat-meter-confirmed" style={{ width: `${confirmedPct}%` }} />
                    <div className="seat-meter-held" style={{ width: `${heldPct}%` }} />
                    <div className="seat-meter-available" style={{ width: `${availablePct}%` }} />
                  </div>

                  <div className="seat-stats-grid">
                    <div className="seat-stat-item">
                      <span className="seat-stat-label">Available</span>
                      <span className="seat-stat-value" style={{ color: '#2563eb' }}>{c.availableSeats}</span>
                    </div>
                    <div className="seat-stat-item">
                      <span className="seat-stat-label">Held Seats</span>
                      <span className="seat-stat-value" style={{ color: '#d97706' }}>{c.heldSeats}</span>
                    </div>
                    <div className="seat-stat-item">
                      <span className="seat-stat-label">Confirmed</span>
                      <span className="seat-stat-value" style={{ color: '#16a34a' }}>{c.confirmedSeats}</span>
                    </div>
                    <div className="seat-stat-item">
                      <span className="seat-stat-label">Total Seats</span>
                      <span className="seat-stat-value">{c.totalSeats}</span>
                    </div>
                  </div>

                  <button 
                    className={`btn ${c.availableSeats > 0 ? 'btn-primary' : 'btn-disabled'}`}
                    disabled={c.availableSeats <= 0}
                    onClick={() => handleApply(c.id)}
                    style={{ width: '100%' }}
                  >
                    {c.availableSeats > 0 ? 'Apply Now' : 'Class Full'}
                  </button>
                </div>
              );
            })}
          </div>

          {studentId && (
            <div style={{ marginTop: '2.5rem' }}>
              <h2 className="section-title">My Applications</h2>
              {myHolds.length === 0 ? (
                <div className="empty-state">
                  No active or past applications found for Student ID: <strong>{studentId}</strong>
                </div>
              ) : (
                <div className="grid">
                  {myHolds.map((h) => {
                    const isExpired = h.status === 'EXPIRED' || (h.status === 'HELD' && new Date(h.expiresAt) <= now);
                    const currentStatus = isExpired ? 'EXPIRED' : h.status;

                    return (
                      <div key={h.holdId} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>
                            {h.className || `Class: ${h.classId.substring(0, 8)}...`}
                          </h4>
                          <span className={`badge badge-${currentStatus}`}>{currentStatus}</span>
                        </div>

                        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Hold Ref: {h.holdId.substring(0, 13)}...</p>

                        {currentStatus === 'HELD' && (
                          <div className="timer-box">
                            <span>⏱️ Hold Expiration:</span>
                            <strong>{getRemainingTime(h.expiresAt)}</strong>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
                          <button 
                            className={`btn ${currentStatus === 'HELD' ? 'btn-success' : 'btn-disabled'}`}
                            disabled={currentStatus !== 'HELD'}
                            onClick={() => handleConfirm(h.holdId)}
                            style={{ flex: 1 }}
                          >
                            Pay Fee & Confirm
                          </button>
                          <button 
                            className={`btn ${currentStatus !== 'CONFIRMED' ? 'btn-danger' : 'btn-disabled'}`}
                            disabled={currentStatus === 'CONFIRMED'}
                            onClick={() => handleCancel(h.holdId)}
                            style={{ flex: 1 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'admin' && (
        <div>
          <div className="card">
            <h2 className="card-title">Create New Class / Shift</h2>
            <form onSubmit={handleCreateClass}>
              <div className="form-group">
                <label className="form-label">Class & Shift Name</label>
                <input 
                  className="form-input"
                  type="text" 
                  placeholder="e.g. Class 6 - Morning Shift" 
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Total Seat Capacity</label>
                <input 
                  className="form-input"
                  type="number" 
                  min="1"
                  value={totalSeats}
                  onChange={(e) => setTotalSeats(e.target.value)}
                  required 
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                Create Class Shift
              </button>
            </form>
          </div>

          <h2 className="section-title">Active Seat Metrics</h2>
          <div className="grid">
            {classes.map((c) => (
              <div key={c.id} className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>{c.name}</h3>
                <div className="seat-stats-grid">
                  <div className="seat-stat-item">
                    <span className="seat-stat-label">Available</span>
                    <span className="seat-stat-value" style={{ color: '#2563eb' }}>{c.availableSeats}</span>
                  </div>
                  <div className="seat-stat-item">
                    <span className="seat-stat-label">Held</span>
                    <span className="seat-stat-value" style={{ color: '#d97706' }}>{c.heldSeats}</span>
                  </div>
                  <div className="seat-stat-item">
                    <span className="seat-stat-label">Confirmed</span>
                    <span className="seat-stat-value" style={{ color: '#16a34a' }}>{c.confirmedSeats}</span>
                  </div>
                  <div className="seat-stat-item">
                    <span className="seat-stat-label">Total</span>
                    <span className="seat-stat-value">{c.totalSeats}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}