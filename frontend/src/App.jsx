import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL, getErrorMessage } from './api';
import './App.css';

const MAX_STUDENT_ID_LENGTH = 100;

export default function App() {
  const [activeView, setActiveView] = useState('parent');
  const [studentId, setStudentId] = useState(
    () => window.localStorage.getItem('studentId') || '',
  );
  const [tempStudentId, setTempStudentId] = useState(studentId);
  const [classes, setClasses] = useState([]);
  const [myHolds, setMyHolds] = useState([]);
  const [newClassName, setNewClassName] = useState('');
  const [newTotalSeats, setNewTotalSeats] = useState(50);
  const [actionError, setActionError] = useState('');
  const [classesError, setClassesError] = useState('');
  const [holdsError, setHoldsError] = useState('');
  const [now, setNow] = useState(Date.now());

  const errorMessage = actionError || classesError || holdsError;

  // Drives the countdown and turns a HELD application into EXPIRED in the UI
  // as soon as its deadline passes, without waiting for a page reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchClasses = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/classes`);
      setClasses(Array.isArray(response.data) ? response.data : []);
      setClassesError('');
    } catch (error) {
      setClassesError(
        getErrorMessage(error, 'Could not load classes. Please try again.'),
      );
    }
  };

  const fetchMyHolds = async () => {
    if (!studentId) {
      setMyHolds([]);
      setHoldsError('');
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/me/holds`, {
        headers: { 'X-Student-Id': studentId },
      });
      setMyHolds(Array.isArray(response.data) ? response.data : []);
      setHoldsError('');
    } catch (error) {
      setHoldsError(
        getErrorMessage(error, 'Could not load your applications. Please try again.'),
      );
    }
  };

  // Seat counts must refresh periodically without a page reload.
  useEffect(() => {
    fetchClasses();
    const interval = setInterval(fetchClasses, 2000);
    return () => clearInterval(interval);
  }, []);

  // Applications are refreshed too, and reload automatically when the student
  // identity changes or the page is reopened (studentId comes from localStorage).
  useEffect(() => {
    fetchMyHolds();
    const interval = setInterval(fetchMyHolds, 3000);
    return () => clearInterval(interval);
  }, [studentId]);

  const dismissError = () => {
    setActionError('');
    setClassesError('');
    setHoldsError('');
  };

  const handleSaveStudentId = (event) => {
    event.preventDefault();
    setActionError('');

    const value = tempStudentId.trim();
    if (!value) {
      setActionError('Please enter your birth registration number.');
      return;
    }

    if (value.length > MAX_STUDENT_ID_LENGTH) {
      setActionError(
        `The birth registration number must be at most ${MAX_STUDENT_ID_LENGTH} characters.`,
      );
      return;
    }

    setStudentId(value);
    setTempStudentId(value);
    window.localStorage.setItem('studentId', value);
  };

  const handleClearStudentId = () => {
    setStudentId('');
    setTempStudentId('');
    setMyHolds([]);
    setHoldsError('');
    setActionError('');
    window.localStorage.removeItem('studentId');
  };

  const handleCreateClass = async (event) => {
    event.preventDefault();
    setActionError('');

    const name = newClassName.trim();
    const seats = Number(newTotalSeats);

    if (!name) {
      setActionError('Please enter a class name.');
      return;
    }

    if (!Number.isInteger(seats) || seats < 1) {
      setActionError('Total seats must be a whole number of at least 1.');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/classes`, { name, totalSeats: seats });
      setNewClassName('');
      setNewTotalSeats(50);
      await fetchClasses();
    } catch (error) {
      setActionError(
        getErrorMessage(error, 'Could not create the class. Please try again.'),
      );
    }
  };

  const handleApply = async (classId) => {
    setActionError('');

    if (!studentId) {
      setActionError(
        'Enter and save your birth registration number before applying.',
      );
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/classes/${classId}/holds`,
        {},
        { headers: { 'X-Student-Id': studentId } },
      );
      await Promise.all([fetchClasses(), fetchMyHolds()]);
    } catch (error) {
      setActionError(
        getErrorMessage(error, 'Could not apply for a seat. Please try again.'),
      );
    }
  };

  const handleConfirm = async (holdId) => {
    setActionError('');

    try {
      await axios.post(
        `${API_BASE_URL}/holds/${holdId}/confirm`,
        {},
        { headers: { 'X-Student-Id': studentId } },
      );
      await Promise.all([fetchClasses(), fetchMyHolds()]);
    } catch (error) {
      setActionError(
        getErrorMessage(error, 'Could not confirm the admission. Please try again.'),
      );
    }
  };

  const handleCancel = async (holdId) => {
    setActionError('');

    try {
      await axios.delete(`${API_BASE_URL}/holds/${holdId}`, {
        headers: { 'X-Student-Id': studentId },
      });
      await Promise.all([fetchClasses(), fetchMyHolds()]);
    } catch (error) {
      setActionError(
        getErrorMessage(error, 'Could not cancel the application. Please try again.'),
      );
    }
  };

  const getRemainingSeconds = (expiresAt) => {
    const expiresAtMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresAtMs)) {
      return 0;
    }

    return Math.max(0, Math.floor((expiresAtMs - now) / 1000));
  };

  const formatRemaining = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  };

  const formatDateTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'â€”' : date.toLocaleString();
  };

  const getDisplayStatus = (hold) => {
    const status = hold.status || 'UNKNOWN';
    if (status === 'HELD' && getRemainingSeconds(hold.expiresAt) <= 0) {
      return 'EXPIRED';
    }
    return status;
  };

  const hasActiveApplication = (classId) =>
    myHolds.some((hold) => {
      if (hold.classId !== classId) {
        return false;
      }

      const status = getDisplayStatus(hold);
      return status === 'HELD' || status === 'CONFIRMED';
    });

  return (
    <div className="app-container">
      <header className="top-header">
        <div className="header-brand">
          <h1>School Admission Portal</h1>
          <p className="brand-subtitle">
            First-come, first-served admission
          </p>
        </div>
        <nav className="view-nav" aria-label="Portal views">
          <button
            type="button"
            className={`nav-btn ${activeView === 'parent' ? 'active' : ''}`}
            onClick={() => setActiveView('parent')}
          >
            Parent Portal
          </button>
          <button
            type="button"
            className={`nav-btn ${activeView === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveView('admin')}
          >
            School Admin
          </button>
        </nav>
      </header>

      {errorMessage && (
        <div className="alert alert-error" role="alert" aria-live="polite">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="close-btn"
            onClick={dismissError}
            aria-label="Dismiss error"
          >
            Ã—
          </button>
        </div>
      )}

      {activeView === 'parent' && (
        <main className="portal-content">
          <section className="card identity-card">
            <h2>Student Identity</h2>
            <p className="text-muted">
              No login is required. Enter the student&apos;s birth registration
              number; it is remembered in this browser.
            </p>
            <form onSubmit={handleSaveStudentId} className="identity-form">
              <label className="sr-only" htmlFor="student-id">
                Birth registration number
              </label>
              <input
                id="student-id"
                type="text"
                placeholder="e.g. 20152691234567890"
                value={tempStudentId}
                onChange={(event) => setTempStudentId(event.target.value)}
                maxLength={MAX_STUDENT_ID_LENGTH}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary">
                Set Student ID
              </button>
              {studentId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleClearStudentId}
                >
                  Clear
                </button>
              )}
            </form>
            {studentId && (
              <p className="identity-status">
                Active student ID: <strong>{studentId}</strong>
              </p>
            )}
          </section>

          <section className="card">
            <h2>My Applications</h2>
            {!studentId ? (
              <p className="empty-state">
                Enter your birth registration number above to see your
                applications.
              </p>
            ) : myHolds.length === 0 ? (
              <p className="empty-state">
                You have not applied for any class yet.
              </p>
            ) : (
              <div className="holds-grid">
                {myHolds.map((hold) => {
                  const displayStatus = getDisplayStatus(hold);
                  const remainingSeconds = getRemainingSeconds(hold.expiresAt);
                  const isHeld = displayStatus === 'HELD';
                  const statusClass = displayStatus.toLowerCase();

                  return (
                    <article
                      key={hold.holdId}
                      className={`hold-item status-${statusClass}`}
                    >
                      <div className="hold-header">
                        <h3>{hold.className || 'Class application'}</h3>
                        <span className={`status-pill ${statusClass}`}>
                          {displayStatus}
                        </span>
                      </div>

                      <p className="meta-line">
                        Application: <code>{hold.holdId}</code>
                      </p>
                      <p className="meta-line">
                        Expires: {formatDateTime(hold.expiresAt)}
                      </p>

                      {isHeld && (
                        <p className="timer">
                          Time remaining: <strong>{formatRemaining(remainingSeconds)}</strong>
                        </p>
                      )}

                      <div className="hold-actions">
                        <button
                          type="button"
                          className="btn-success"
                          disabled={!isHeld || remainingSeconds <= 0}
                          onClick={() => handleConfirm(hold.holdId)}
                        >
                          Pay Admission Fee
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          disabled={!isHeld}
                          onClick={() => handleCancel(hold.holdId)}
                        >
                          Cancel
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Available Classes</h2>
            {classes.length === 0 ? (
              <p className="empty-state">
                No classes have been created yet. Ask the school admin to create
                one.
              </p>
            ) : (
              <div className="classes-grid">
                {classes.map((schoolClass) => {
                  const alreadyApplied = hasActiveApplication(schoolClass.id);
                  const isFull = schoolClass.availableSeats <= 0;
                  const cannotApply = !studentId || isFull || alreadyApplied;

                  let buttonLabel = 'Apply';
                  if (alreadyApplied) {
                    buttonLabel = 'Already Applied';
                  } else if (isFull) {
                    buttonLabel = 'Seat Full';
                  } else if (!studentId) {
                    buttonLabel = 'Save ID to Apply';
                  }

                  return (
                    <article key={schoolClass.id} className="class-card">
                      <h3>{schoolClass.name}</h3>
                      <div className="metrics">
                        <div>
                          <span>Available</span>
                          <strong>{schoolClass.availableSeats}</strong>
                        </div>
                        <div>
                          <span>Held</span>
                          <strong>{schoolClass.heldSeats}</strong>
                        </div>
                        <div>
                          <span>Confirmed</span>
                          <strong>{schoolClass.confirmedSeats}</strong>
                        </div>
                        <div>
                          <span>Total</span>
                          <strong>{schoolClass.totalSeats}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary full-width"
                        disabled={cannotApply}
                        onClick={() => handleApply(schoolClass.id)}
                      >
                        {buttonLabel}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      )}

      {activeView === 'admin' && (
        <main className="portal-content">
          <section className="card">
            <h2>Create Class</h2>
            <form onSubmit={handleCreateClass} className="admin-form">
              <div className="form-group">
                <label htmlFor="class-name">Class and shift name</label>
                <input
                  id="class-name"
                  type="text"
                  placeholder="e.g. Class 6 - Morning Shift"
                  value={newClassName}
                  onChange={(event) => setNewClassName(event.target.value)}
                  maxLength={255}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="total-seats">Total seats</label>
                <input
                  id="total-seats"
                  type="number"
                  min="1"
                  step="1"
                  value={newTotalSeats}
                  onChange={(event) => setNewTotalSeats(event.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary">
                Create Class
              </button>
            </form>
          </section>

          <section className="card">
            <h2>Class List</h2>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Class Name</th>
                    <th>Total Seats</th>
                    <th>Held Seats</th>
                    <th>Confirmed Seats</th>
                    <th>Available Seats</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-state">
                        No classes created yet.
                      </td>
                    </tr>
                  ) : (
                    classes.map((schoolClass) => (
                      <tr key={schoolClass.id}>
                        <td>
                          <strong>{schoolClass.name}</strong>
                        </td>
                        <td>{schoolClass.totalSeats}</td>
                        <td>{schoolClass.heldSeats}</td>
                        <td>{schoolClass.confirmedSeats}</td>
                        <td>
                          <span className="badge-avail">
                            {schoolClass.availableSeats}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
