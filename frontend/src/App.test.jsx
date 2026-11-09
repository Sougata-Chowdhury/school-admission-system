import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('School Admission Portal UI', () => {
  it('renders the header title correctly', () => {
    render(<App />);
    expect(screen.getByText(/School Admission Portal/i)).toBeInTheDocument();
  });

  it('renders Parent and Admin portal tabs', () => {
    render(<App />);
    expect(screen.getByText(/Parent Portal/i)).toBeInTheDocument();
    expect(screen.getByText(/School Admin/i)).toBeInTheDocument();
  });

  it('renders student identity input field', () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/20152691234567890/i)).toBeInTheDocument();
  });
});