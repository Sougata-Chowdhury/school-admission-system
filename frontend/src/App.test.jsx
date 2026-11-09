import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import App from './App';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const emptyList = { data: [] };

const oneClass = {
  data: [
    {
      id: 'c_123',
      name: 'Class 6 - Morning Shift',
      totalSeats: 10,
      heldSeats: 0,
      confirmedSeats: 0,
      availableSeats: 10,
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();

  axios.get.mockImplementation((url) => {
    if (url.endsWith('/me/holds')) {
      return Promise.resolve(emptyList);
    }
    return Promise.resolve(emptyList);
  });
  axios.post.mockResolvedValue({ data: {} });
  axios.delete.mockResolvedValue({ data: {} });
});

describe('School Admission Portal UI', () => {
  it('renders the header, identity input, and both portals', () => {
    render(<App />);

    expect(screen.getByText(/School Admission Portal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/birth registration number/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /parent portal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /school admin/i })).toBeInTheDocument();
  });

  it('remembers the student identity and loads their applications', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/birth registration number/i), {
      target: { value: '20152691234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set student id/i }));

    expect(window.localStorage.getItem('studentId')).toBe('20152691234567890');
    expect(await screen.findByText(/active student id/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/me/holds'),
        expect.objectContaining({
          headers: { 'X-Student-Id': '20152691234567890' },
        }),
      );
    });
  });

  it('creates a class from the admin view', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /school admin/i }));
    fireEvent.change(screen.getByLabelText(/class and shift name/i), {
      target: { value: 'Class 6 - Morning Shift' },
    });
    fireEvent.change(screen.getByLabelText(/total seats/i), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create class$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/classes'),
        { name: 'Class 6 - Morning Shift', totalSeats: 120 },
      );
    });
  });

  it('applies for an available class with the student header', async () => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/me/holds')) {
        return Promise.resolve(emptyList);
      }
      return Promise.resolve(oneClass);
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/birth registration number/i), {
      target: { value: '20152691234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /set student id/i }));

    const applyButton = await screen.findByRole('button', { name: /^apply$/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/classes/c_123/holds'),
        {},
        { headers: { 'X-Student-Id': '20152691234567890' } },
      );
    });
  });

  it('shows a human-readable error when the backend cannot be reached', async () => {
    axios.get.mockRejectedValue({
      code: 'ERR_NETWORK',
      message: 'Network Error',
    });

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /cannot reach the server/i,
    );
  });

  it('shows a separate administrator console without the parent identity form', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /school admin/i }));

    expect(
      screen.getByRole('heading', { name: /admissions overview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /create class/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/birth registration number/i),
    ).not.toBeInTheDocument();
  });

  it('renders a held application with countdown and enabled payment actions', async () => {
    window.localStorage.setItem('studentId', '20152691234567890');

    const createdAt = new Date(Date.now() - 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    axios.get.mockImplementation((url) => {
      if (url.endsWith('/me/holds')) {
        return Promise.resolve({
          data: [
            {
              holdId: 'h_held',
              classId: 'c_held',
              className: 'Class 6 - Morning Shift',
              status: 'HELD',
              expiresAt,
              createdAt,
              confirmedAt: null,
            },
          ],
        });
      }
      return Promise.resolve(emptyList);
    });

    render(<App />);

    expect(
      await screen.findByText(/class 6 - morning shift/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/time remaining/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /pay admission fee/i }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeEnabled();
  });

  it('marks a timed-out hold as EXPIRED and disables payment without a reload', async () => {
    window.localStorage.setItem('studentId', '20152691234567890');

    const createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 60 * 1000).toISOString();

    axios.get.mockImplementation((url) => {
      if (url.endsWith('/me/holds')) {
        return Promise.resolve({
          data: [
            {
              holdId: 'h_expired',
              classId: 'c_expired',
              className: 'Class 7 - Day Shift',
              status: 'HELD',
              expiresAt,
              createdAt,
              confirmedAt: null,
            },
          ],
        });
      }
      return Promise.resolve(emptyList);
    });

    render(<App />);

    const payButton = await screen.findByRole('button', {
      name: /pay admission fee/i,
    });

    expect(payButton).toBeDisabled();
    expect(screen.getAllByText('EXPIRED').length).toBeGreaterThan(0);
    expect(screen.queryByText(/time remaining/i)).not.toBeInTheDocument();
  });
});
