import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL, getErrorMessage } from './api';
import './App.css';

const MAX_STUDENT_ID_LENGTH = 100;
const CLASS_REFRESH_MS = 2000;
const HOLDS_REFRESH_MS = 3000;
const NOTICE_TIMEOUT_MS = 5000;

const STATUS_MESSAGES = {
  HELD: 'Pay the admission fee before the timer ends to confirm this seat.',
  CONFIRMED: 'Admission confirmed. This seat is no longer available to others.',
  EXPIRED: 'The hold expired and the seat was released automatically.',
  CANCELLED: 'This application was cancelled and the seat was released.',
};

function getRemainingSeconds(expiresAt, now) {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((expiresAtMs - now) / 1000));
}

function getHoldWindowSeconds(hold) {
  const createdAtMs = new Date(hold.createdAt).getTime();
  const expiresAtMs = new Date(hold.expiresAt).getTime();

  if (Number.isNaN(createdAtMs) || Number.isNaN(expiresAtMs) || expiresAtMs <= createdAtMs) {
    return 0;
  }

  return Math.round((expiresAtMs - createdAtMs) / 1000);
}

function formatCountdown(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function getDisplayStatus(hold, now) {
  const status = hold.status || 'UNKNOWN';
  if (status === 'HELD' && getRemainingSeconds(hold.expiresAt, now) <= 0) {
    return 'EXPIRED';
  }
  return status;
}

function BrandMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
    </svg>
  );
}

function ParentIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.5v.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function SiteHeader({ activeView, onChangeView }) {
  const isAdmin = activeView === 'admin';

  return (
    <header className={`site-header ${isAdmin ? 'admin-header' : 'parent-header'}`}>
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <BrandMark />
          </span>
          <div className="brand-copy">
            <p className="brand-eyebrow">
              {isAdmin ? 'Administrator console' : 'Parent portal'}
            </p>
            <h1>School Admission Portal</h1>
          </div>
        </div>

        <nav className="role-switch" aria-label="Portal views">
          <button
            type="button"
            aria-pressed={!isAdmin}
            onClick={() => onChangeView('parent')}
          >
            <ParentIcon />
            Parent Portal
          </button>
          <button
            type="button"
            aria-pressed={isAdmin}
            onClick={() => onChangeView('admin')}
          >
            <AdminIcon />
            School Admin
          </button>
        </nav>
      </div>
    </header>
  );
}

function StatusPill({ status }) {
  const statusKey = status.toLowerCase();

  return (
    <span className={`status-pill status-pill-${statusKey}`}>{status}</span>
  );
}

function SeatMeter({ total = 0, held = 0, confirmed = 0, compact = false }) {
  const safeTotal = Math.max(Number(total) || 0, 0);
  const safeHeld = Math.max(Number(held) || 0, 0);
  const safeConfirmed = Math.max(Number(confirmed) || 0, 0);

  const confirmedPct =
    safeTotal > 0 ? Math.min(100, (safeConfirmed / safeTotal) * 100) : 0;
  const usedPct =
    safeTotal > 0
      ? Math.min(100, confirmedPct + (safeHeld / safeTotal) * 100)
      : 0;

  const barStyle = {
    background: `linear-gradient(to right, #16a34a 0 ${confirmedPct}%, #f59e0b ${confirmedPct}% ${usedPct}%, #e2e8f0 ${usedPct}% 100%)`,
  };

  return (
    <div className="seat-meter">
      <div
        className="seat-meter-bar"
        style={barStyle}
        role="img"
        aria-label={`${safeConfirmed} confirmed and ${safeHeld} held out of ${safeTotal} seats`}
      />
      {!compact && (
        <div className="seat-meter-legend">
          <span>
            <i className="legend-dot confirmed" aria-hidden="true" />
            Confirmed {safeConfirmed}
          </span>
          <span>
            <i className="legend-dot held" aria-hidden="true" />
            Held {safeHeld}
          </span>
          <span>
            <i className="legend-dot available" aria-hidden="true" />
            Available {Math.max(0, safeTotal - safeConfirmed - safeHeld)}
          </span>
        </div>
      )}
    </div>
  );
}

function ApplicationCard({ hold, now, pending, onConfirm, onCancel }) {
  const status = getDisplayStatus(hold, now);
  const remainingSeconds = getRemainingSeconds(hold.expiresAt, now);
  const windowSeconds = getHoldWindowSeconds(hold);
  const progressPct =
    windowSeconds > 0
      ? Math.max(0, Math.min(100, (remainingSeconds / windowSeconds) * 100))
      : 0;
  const isHeld = status === 'HELD';
  const isUrgent = isHeld && remainingSeconds <= 60;
  const statusKey = status.toLowerCase();

  return (
    <article className={`application-card status-${statusKey}`}>
      <div className="application-head">
        <h3>{hold.className || 'Class application'}</h3>
        <StatusPill status={status} />
      </div>

      {isHeld ? (
        <div className={`hold-timer ${isUrgent ? 'is-urgent' : ''}`}>
          <div className="hold-timer-row">
            <span>Time remaining</span>
            <strong>{formatCountdown(remainingSeconds)}</strong>
          </div>
          <div className="hold-progress" aria-hidden="true">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      ) : (
        <p className="application-note">
          {STATUS_MESSAGES[status] || 'This application can no longer be changed.'}
        </p>
      )}

      <div className="application-meta">
        <span>
          Expires: <time dateTime={hold.expiresAt}>{formatDateTime(hold.expiresAt)}</time>
        </span>
        <span title={hold.holdId}>
          ID: <code>{hold.holdId}</code>
        </span>
      </div>

      <div className="application-actions">
        <button
          type="button"
          className="btn btn-pay"
          disabled={!isHeld || pending}
          aria-busy={pending}
          onClick={() => onConfirm(hold.holdId)}
        >
          Pay Admission Fee
        </button>
        <button
          type="button"
          className="btn btn-danger-ghost"
          disabled={!isHeld || pending}
          onClick={() => onCancel(hold.holdId)}
        >
          Cancel
        </button>
      </div>
    </article>
  );
}

function ClassCard({ schoolClass, alreadyApplied, studentId, pending, onApply }) {
  const isFull = schoolClass.availableSeats <= 0;
  const cannotApply = !studentId || isFull || alreadyApplied || pending;

  let buttonLabel = 'Apply';
  if (!studentId) {
    buttonLabel = 'Save ID to Apply';
  } else if (alreadyApplied) {
    buttonLabel = 'Already Applied';
  } else if (isFull) {
    buttonLabel = 'Seat Full';
  }

  return (
    <article className={`class-card ${isFull ? 'is-full' : ''}`}>
      <div className="class-head">
        <h3>{schoolClass.name}</h3>
        <span className={`availability-badge ${isFull ? 'full' : 'open'}`}>
          {isFull ? 'Full' : `${schoolClass.availableSeats} left`}
        </span>
      </div>

      <SeatMeter
        total={schoolClass.totalSeats}
        held={schoolClass.heldSeats}
        confirmed={schoolClass.confirmedSeats}
        compact
      />

      <dl className="seat-stats">
        <div>
          <dt>Total</dt>
          <dd>{schoolClass.totalSeats}</dd>
        </div>
        <div>
          <dt>Held</dt>
          <dd>{schoolClass.heldSeats}</dd>
        </div>
        <div>
          <dt>Confirmed</dt>
          <dd>{schoolClass.confirmedSeats}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd className={isFull ? 'value-full' : 'value-open'}>
            {schoolClass.availableSeats}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={cannotApply}
        aria-busy={pending}
        onClick={() => onApply(schoolClass.id)}
      >
        {buttonLabel}
      </button>
    </article>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <EmptyIcon />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function IdentityPanel({
  studentId,
  tempStudentId,
  onTempStudentIdChange,
  onSave,
  onClear,
}) {
  return (
    <section className="identity-panel" aria-labelledby="identity-heading">
      <div className="identity-intro">
        <p className="eyebrow">Step 1</p>
        <h2 id="identity-heading">Student identity</h2>
        <p>
          No login or password is required. Enter the student&apos;s birth
          registration number to apply for a seat and track applications.
        </p>
      </div>

      <form className="identity-form" onSubmit={onSave}>
        <label htmlFor="student-id">Birth registration number</label>
        <div className="identity-controls">
          <input
            id="student-id"
            type="text"
            placeholder="e.g. 20152691234567890"
            value={tempStudentId}
            onChange={(event) => onTempStudentIdChange(event.target.value)}
            maxLength={MAX_STUDENT_ID_LENGTH}
            autoComplete="off"
            aria-describedby="student-id-help"
          />
          <button type="submit" className="btn btn-primary">
            Set Student ID
          </button>
          {studentId && (
            <button type="button" className="btn btn-quiet" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
        <p id="student-id-help" className="field-help">
          Saved only in this browser. You can change it at any time.
        </p>
        {studentId && (
          <p className="identity-active">
            <span className="active-dot" aria-hidden="true" />
            Active student ID <code>{studentId}</code>
          </p>
        )}
      </form>
    </section>
  );
}

function ParentPortal({
  studentId,
  tempStudentId,
  onTempStudentIdChange,
  onSaveStudentId,
  onClearStudentId,
  classes,
  myHolds,
  now,
  busy,
  onApply,
  onConfirm,
  onCancel,
}) {
  const hasActiveApplication = useCallback(
    (classId) =>
      myHolds.some((hold) => {
        if (hold.classId !== classId) {
          return false;
        }

        const status = getDisplayStatus(hold, now);
        return status === 'HELD' || status === 'CONFIRMED';
      }),
    [myHolds, now],
  );

  return (
    <main className="portal parent-portal">
      <IdentityPanel
        studentId={studentId}
        tempStudentId={tempStudentId}
        onTempStudentIdChange={onTempStudentIdChange}
        onSave={onSaveStudentId}
        onClear={onClearStudentId}
      />

      <section className="panel" aria-labelledby="applications-heading">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2 id="applications-heading">My Applications</h2>
            <p className="panel-subtitle">
              Hold, payment and expiry status for this student.
            </p>
          </div>
          {studentId && (
            <span className="sync-note">
              <span className="live-dot" aria-hidden="true" />
              Updates every 3s
            </span>
          )}
        </div>

        {!studentId ? (
          <EmptyState
            title="No student selected"
            description="Save a birth registration number above to see that student's applications."
          />
        ) : myHolds.length === 0 ? (
          <EmptyState
            title="No applications yet"
            description="Choose a class below and press Apply. The held seat will appear here with a countdown."
          />
        ) : (
          <div className="application-grid">
            {myHolds.map((hold) => (
              <ApplicationCard
                key={hold.holdId}
                hold={hold}
                now={now}
                pending={busy?.id === hold.holdId}
                onConfirm={onConfirm}
                onCancel={onCancel}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="classes-heading">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Step 3</p>
            <h2 id="classes-heading">Available Classes</h2>
            <p className="panel-subtitle">
              Each class and shift has its own seat count. Admissions are
              first-come, first-served.
            </p>
          </div>
          <span className="sync-note">
            <span className="live-dot" aria-hidden="true" />
            Seats refresh every 2s
          </span>
        </div>

        {classes.length === 0 ? (
          <EmptyState
            title="No classes yet"
            description="The school administrator has not created any classes. Check back shortly."
          />
        ) : (
          <div className="class-grid">
            {classes.map((schoolClass) => (
              <ClassCard
                key={schoolClass.id}
                schoolClass={schoolClass}
                alreadyApplied={hasActiveApplication(schoolClass.id)}
                studentId={studentId}
                pending={busy?.id === schoolClass.id}
                onApply={onApply}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function AdminPortal({
  classes,
  newClassName,
  newTotalSeats,
  onNewClassNameChange,
  onNewTotalSeatsChange,
  onCreateClass,
  busy,
}) {
  const totals = useMemo(
    () =>
      classes.reduce(
        (accumulator, schoolClass) => ({
          total: accumulator.total + (Number(schoolClass.totalSeats) || 0),
          held: accumulator.held + (Number(schoolClass.heldSeats) || 0),
          confirmed:
            accumulator.confirmed + (Number(schoolClass.confirmedSeats) || 0),
          available:
            accumulator.available + (Number(schoolClass.availableSeats) || 0),
        }),
        { total: 0, held: 0, confirmed: 0, available: 0 },
      ),
    [classes],
  );

  return (
    <main className="portal admin-portal">
      <section className="admin-hero" aria-labelledby="admin-heading">
        <div className="admin-hero-copy">
          <p className="eyebrow">Administrator console</p>
          <h2 id="admin-heading">Admissions overview</h2>
          <p>
            Create classes and monitor seat allocation. Parents enter their
            birth registration number in the Parent Portal.
          </p>
        </div>

        <dl className="admin-stats">
          <div>
            <dt>Classes</dt>
            <dd>{classes.length}</dd>
          </div>
          <div>
            <dt>Total seats</dt>
            <dd>{totals.total}</dd>
          </div>
          <div>
            <dt>Held</dt>
            <dd>{totals.held}</dd>
          </div>
          <div>
            <dt>Confirmed</dt>
            <dd>{totals.confirmed}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{totals.available}</dd>
          </div>
        </dl>
      </section>

      <div className="admin-grid">
        <section className="panel create-panel" aria-labelledby="create-heading">
          <div className="panel-head">
            <div>
              <h2 id="create-heading">Create Class</h2>
              <p className="panel-subtitle">
                Each shift is a separate class with its own seats.
              </p>
            </div>
          </div>

          <form className="admin-form" onSubmit={onCreateClass}>
            <div className="form-group">
              <label htmlFor="class-name">Class and shift name</label>
              <input
                id="class-name"
                type="text"
                placeholder="e.g. Class 6 - Morning Shift"
                value={newClassName}
                onChange={(event) => onNewClassNameChange(event.target.value)}
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
                onChange={(event) => onNewTotalSeatsChange(event.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy?.kind === 'create'}
              aria-busy={busy?.kind === 'create'}
            >
              Create Class
            </button>
          </form>

          <p className="field-help">
            The class appears in the Parent Portal immediately after creation.
          </p>
        </section>

        <section className="panel class-list-panel" aria-labelledby="class-list-heading">
          <div className="panel-head">
            <div>
              <h2 id="class-list-heading">Class List</h2>
              <p className="panel-subtitle">
                Total, held, confirmed and available seats per class.
              </p>
            </div>
            <span className="sync-note">
              <span className="live-dot" aria-hidden="true" />
              Live
            </span>
          </div>

          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Class Name</th>
                  <th scope="col">Total Seats</th>
                  <th scope="col">Held Seats</th>
                  <th scope="col">Confirmed Seats</th>
                  <th scope="col">Available Seats</th>
                </tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="table-empty">
                        No classes created yet. Use the form to add the first
                        class.
                      </div>
                    </td>
                  </tr>
                ) : (
                  classes.map((schoolClass) => {
                    const isFull = schoolClass.availableSeats <= 0;

                    return (
                      <tr key={schoolClass.id}>
                        <td>
                          <div className="class-cell">
                            <strong>{schoolClass.name}</strong>
                            <SeatMeter
                              total={schoolClass.totalSeats}
                              held={schoolClass.heldSeats}
                              confirmed={schoolClass.confirmedSeats}
                              compact
                            />
                          </div>
                        </td>
                        <td>{schoolClass.totalSeats}</td>
                        <td>{schoolClass.heldSeats}</td>
                        <td>{schoolClass.confirmedSeats}</td>
                        <td>
                          <span
                            className={`available-badge ${isFull ? 'is-full' : ''}`}
                          >
                            {schoolClass.availableSeats}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>First-come, first-served admissions. No lottery.</span>
        <span>Seat counts and application status update automatically.</span>
      </div>
    </footer>
  );
}

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
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);
  const [now, setNow] = useState(Date.now());

  const errorMessage = actionError || classesError || holdsError;

  // Drives the countdown and flips HELD to EXPIRED without a page reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Success messages are informative, not blocking, so they fade out.
  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = setTimeout(() => setNotice(''), NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const fetchClasses = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/classes`);
      setClasses(Array.isArray(response.data) ? response.data : []);
      setClassesError('');
    } catch (error) {
      setClassesError(
        getErrorMessage(error, 'Could not load classes. Please try again.'),
      );
    }
  }, []);

  const fetchMyHolds = useCallback(async () => {
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
        getErrorMessage(
          error,
          'Could not load your applications. Please try again.',
        ),
      );
    }
  }, [studentId]);

  // Class seat counts refresh periodically without a page reload.
  useEffect(() => {
    fetchClasses();
    const interval = setInterval(fetchClasses, CLASS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchClasses]);

  // Applications refresh too, and reload when the identity changes.
  useEffect(() => {
    fetchMyHolds();
    const interval = setInterval(fetchMyHolds, HOLDS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchMyHolds]);

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
    setNotice('');

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

    setBusy({ kind: 'create' });
    try {
      await axios.post(`${API_BASE_URL}/classes`, { name, totalSeats: seats });
      setNewClassName('');
      setNewTotalSeats(50);
      await fetchClasses();
      setNotice(`"${name}" was created with ${seats} seats.`);
    } catch (error) {
      setActionError(
        getErrorMessage(error, 'Could not create the class. Please try again.'),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async (classId) => {
    setActionError('');
    setNotice('');

    if (!studentId) {
      setActionError(
        'Enter and save your birth registration number before applying.',
      );
      return;
    }

    setBusy({ kind: 'apply', id: classId });
    try {
      await axios.post(
        `${API_BASE_URL}/classes/${classId}/holds`,
        {},
        { headers: { 'X-Student-Id': studentId } },
      );
      await Promise.all([fetchClasses(), fetchMyHolds()]);
      setNotice(
        'Seat held. Pay the admission fee before the timer ends to confirm it.',
      );
    } catch (error) {
      setActionError(
        getErrorMessage(error, 'Could not apply for a seat. Please try again.'),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = async (holdId) => {
    setActionError('');
    setNotice('');

    setBusy({ kind: 'confirm', id: holdId });
    try {
      await axios.post(
        `${API_BASE_URL}/holds/${holdId}/confirm`,
        {},
        { headers: { 'X-Student-Id': studentId } },
      );
      await Promise.all([fetchClasses(), fetchMyHolds()]);
      setNotice('Payment recorded. Admission confirmed.');
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          'Could not confirm the admission. Please try again.',
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async (holdId) => {
    setActionError('');
    setNotice('');

    setBusy({ kind: 'cancel', id: holdId });
    try {
      await axios.delete(`${API_BASE_URL}/holds/${holdId}`, {
        headers: { 'X-Student-Id': studentId },
      });
      await Promise.all([fetchClasses(), fetchMyHolds()]);
      setNotice('Application cancelled. The seat is available again.');
    } catch (error) {
      setActionError(
        getErrorMessage(
          error,
          'Could not cancel the application. Please try again.',
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`app ${activeView === 'admin' ? 'app-admin' : 'app-parent'}`}>
      <SiteHeader activeView={activeView} onChangeView={setActiveView} />

      <div className="page">
        {errorMessage && (
          <div className="alert alert-error" role="alert" aria-live="polite">
            <span className="alert-icon">
              <AlertIcon />
            </span>
            <span className="alert-text">{errorMessage}</span>
            <button
              type="button"
              className="alert-close"
              onClick={dismissError}
              aria-label="Dismiss error"
            >
              <CloseIcon />
            </button>
          </div>
        )}

        {notice && (
          <div className="notice" role="status">
            <span className="notice-dot" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        {activeView === 'parent' ? (
          <ParentPortal
            studentId={studentId}
            tempStudentId={tempStudentId}
            onTempStudentIdChange={setTempStudentId}
            onSaveStudentId={handleSaveStudentId}
            onClearStudentId={handleClearStudentId}
            classes={classes}
            myHolds={myHolds}
            now={now}
            busy={busy}
            onApply={handleApply}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        ) : (
          <AdminPortal
            classes={classes}
            newClassName={newClassName}
            newTotalSeats={newTotalSeats}
            onNewClassNameChange={setNewClassName}
            onNewTotalSeatsChange={setNewTotalSeats}
            onCreateClass={handleCreateClass}
            busy={busy}
          />
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
