import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockLoginMutateAsync = vi.fn();
const mockSignupMutateAsync = vi.fn();
const mockForgotPasswordMutateAsync = vi.fn();

let mockLoginIsPending = false;
let mockSignupIsPending = false;
let mockForgotPasswordIsPending = false;

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/use-auth', () => ({
  useLogin: () => ({
    mutateAsync: mockLoginMutateAsync,
    isPending: mockLoginIsPending,
  }),
  useSignup: () => ({
    mutateAsync: mockSignupMutateAsync,
    isPending: mockSignupIsPending,
  }),
  useForgotPassword: () => ({
    mutateAsync: mockForgotPasswordMutateAsync,
    isPending: mockForgotPasswordIsPending,
  }),
}));

vi.mock('zxcvbn', () => ({
  default: vi.fn((password: string) => ({
    score:
      password.length >= 14
        ? 4
        : password.length >= 10
          ? 3
          : password.length >= 5
            ? 2
            : password.length >= 2
              ? 1
              : 0,
  })),
}));

// Mock OAuthButtons to avoid external dependencies
vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: () => <div data-testid="oauth-buttons">OAuth Buttons</div>,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

// ─── PasswordStrengthMeter ──────────────────────────────────────────────────

import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';

describe('PasswordStrengthMeter', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when password is empty', () => {
    const { container } = render(<PasswordStrengthMeter password="" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "Very weak" label for a single-character password', () => {
    // Mock returns score=0 for length < 2
    render(<PasswordStrengthMeter password="a" />);
    expect(screen.getByText('Very weak')).toBeDefined();
  });

  it('shows "Weak" label for a short password', () => {
    // Mock returns score=1 for length >= 2 and < 5
    render(<PasswordStrengthMeter password="abc" />);
    expect(screen.getByText('Weak')).toBeDefined();
  });

  it('shows "Fair" label for a medium-length password', () => {
    // Mock returns score=2 for length >= 5 and < 10
    render(<PasswordStrengthMeter password="abcdefgh" />);
    expect(screen.getByText('Fair')).toBeDefined();
  });

  it('shows "Strong" label for a longer password', () => {
    // Mock returns score=3 for length >= 10 and < 14
    render(<PasswordStrengthMeter password="abcdefghijk" />);
    expect(screen.getByText('Strong')).toBeDefined();
  });

  it('shows "Very strong" label for a complex password', () => {
    render(<PasswordStrengthMeter password="Tr0ub4dor&3!xY" />);
    expect(screen.getByText('Very strong')).toBeDefined();
  });

  it('renders exactly 4 strength bars', () => {
    const { container } = render(<PasswordStrengthMeter password="test" />);
    // The bars are inside a flex container with gap-1
    const barsContainer = container.querySelector('.flex.gap-1');
    expect(barsContainer).not.toBeNull();
    const bars = barsContainer!.children;
    expect(bars.length).toBe(4);
  });

  it('colors the correct number of bars based on score', () => {
    // Score 2 => bars at index 0, 1, 2 should be colored (i <= score)
    // The mock returns score=2 for "abcde" (length=5, >= 5 and < 10)
    const { container } = render(<PasswordStrengthMeter password="abcde" />);
    const barsContainer = container.querySelector('.flex.gap-1');
    const bars = Array.from(barsContainer!.children);

    // Score is 2, so bars 0, 1, 2 should have the warning color class (index <= 2)
    // Bar 3 should have the muted background
    const coloredBars = bars.filter((bar) => bar.className.includes('bg-[var(--color-warning)]'));
    const mutedBars = bars.filter((bar) => bar.className.includes('bg-[var(--muted)]'));
    expect(coloredBars.length).toBe(3);
    expect(mutedBars.length).toBe(1);
  });

  it('colors all 4 bars for a very strong password (score 4)', () => {
    const { container } = render(<PasswordStrengthMeter password="Tr0ub4dor&3!xY" />);
    const barsContainer = container.querySelector('.flex.gap-1');
    const bars = Array.from(barsContainer!.children);

    // Score 4 => all 4 bars colored (i <= 4), using success color
    const coloredBars = bars.filter((bar) => bar.className.includes('bg-[var(--color-success)]'));
    expect(coloredBars.length).toBe(4);
  });
});

// ─── LoginForm ──────────────────────────────────────────────────────────────

import { LoginForm } from '@/components/auth/LoginForm';

describe('LoginForm', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLoginMutateAsync.mockReset();
    mockLoginIsPending = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders email and password input fields', () => {
    render(<LoginForm />, { wrapper: createWrapper() });
    expect(screen.getByLabelText('Email')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
  });

  it('renders a "Sign in" submit button', () => {
    render(<LoginForm />, { wrapper: createWrapper() });
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeDefined();
    expect(button.getAttribute('type')).toBe('submit');
  });

  it('renders a "Forgot password?" link pointing to /forgot-password', () => {
    render(<LoginForm />, { wrapper: createWrapper() });
    const link = screen.getByText('Forgot password?');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/forgot-password');
  });

  it('renders a "Sign up" link pointing to /signup', () => {
    render(<LoginForm />, { wrapper: createWrapper() });
    const link = screen.getByText('Sign up');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/signup');
  });

  it('shows validation errors when submitting an empty form', async () => {
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not call login mutation for invalid email format', async () => {
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Email'), 'notanemail');
    await user.type(screen.getByLabelText('Password'), 'somepassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Wait a tick for form submission attempt
    await waitFor(() => {
      // Either validation prevents submission or an error is shown
      expect(mockLoginMutateAsync).not.toHaveBeenCalled();
    });
  });

  it('calls login mutation with valid credentials and navigates to /calendar on success', async () => {
    mockLoginMutateAsync.mockResolvedValue({ id: 'user_1', name: 'Test' });
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLoginMutateAsync).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/calendar' });
    });
  });

  it('does not call login mutation when form fields are empty', async () => {
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      // Validation errors should be shown
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    // Mutation should NOT have been called
    expect(mockLoginMutateAsync).not.toHaveBeenCalled();
  });

  it('renders the email field with correct placeholder', () => {
    render(<LoginForm />, { wrapper: createWrapper() });
    const emailInput = screen.getByLabelText('Email');
    expect(emailInput.getAttribute('placeholder')).toBe('you@example.com');
  });

  it('renders OAuth buttons section', () => {
    render(<LoginForm />, { wrapper: createWrapper() });
    expect(screen.getByTestId('oauth-buttons')).toBeDefined();
  });
});

// ─── SignupForm ─────────────────────────────────────────────────────────────

import { SignupForm } from '@/components/auth/SignupForm';

describe('SignupForm', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSignupMutateAsync.mockReset();
    mockSignupIsPending = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders name, email, and password input fields', () => {
    render(<SignupForm />, { wrapper: createWrapper() });
    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(screen.getByLabelText('Email')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
  });

  it('renders a "Create account" submit button', () => {
    render(<SignupForm />, { wrapper: createWrapper() });
    const button = screen.getByRole('button', { name: /create account/i });
    expect(button).toBeDefined();
    expect(button.getAttribute('type')).toBe('submit');
  });

  it('shows validation errors when submitting empty fields', async () => {
    const user = userEvent.setup();
    render(<SignupForm />, { wrapper: createWrapper() });

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      // At minimum, name, email, and password should all show errors
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows password strength meter when typing in password field', async () => {
    const user = userEvent.setup();
    render(<SignupForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Password'), 'testpass');

    // Mock returns score=2 ("Fair") for length 8
    await waitFor(() => {
      expect(screen.getByText('Fair')).toBeDefined();
    });
  });

  it('shows validation error for short password', async () => {
    const user = userEvent.setup();
    render(<SignupForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Name'), 'Test User');
    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      const passwordError = alerts.find((el) => el.textContent?.toLowerCase().includes('password'));
      expect(passwordError).toBeDefined();
    });
  });

  it('calls signup mutation with valid data and navigates to /calendar on success', async () => {
    mockSignupMutateAsync.mockResolvedValue({ id: 'user_1', name: 'Test User' });
    const user = userEvent.setup();
    render(<SignupForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Name'), 'Test User');
    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'securepassword123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockSignupMutateAsync).toHaveBeenCalledWith({
        name: 'Test User',
        email: 'test@example.com',
        password: 'securepassword123',
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/calendar' });
    });
  });

  it('renders a "Sign in" link pointing to /login', () => {
    render(<SignupForm />, { wrapper: createWrapper() });
    const link = screen.getByText('Sign in');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('renders OAuth buttons section', () => {
    render(<SignupForm />, { wrapper: createWrapper() });
    expect(screen.getByTestId('oauth-buttons')).toBeDefined();
  });
});

// ─── ForgotPasswordForm ─────────────────────────────────────────────────────

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    mockForgotPasswordMutateAsync.mockReset();
    mockForgotPasswordIsPending = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders an email input field and submit button', () => {
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });
    expect(screen.getByLabelText('Email')).toBeDefined();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDefined();
  });

  it('renders instructional text about the password reset process', () => {
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });
    expect(
      screen.getByText(
        /enter your email address and we.+ll send you a link to reset your password/i,
      ),
    ).toBeDefined();
  });

  it('shows validation error for empty email submission', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not call mutation for invalid email format', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Email'), 'not-valid-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    // Wait a tick for form submission attempt
    await waitFor(() => {
      expect(mockForgotPasswordMutateAsync).not.toHaveBeenCalled();
    });
  });

  it('shows success message with "Check your email" heading after valid submission', async () => {
    mockForgotPasswordMutateAsync.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeDefined();
    });

    expect(
      screen.getByText(/if an account exists with that email, we.+ve sent a password reset link/i),
    ).toBeDefined();
  });

  it('shows "Back to sign in" link pointing to /login', () => {
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });
    const link = screen.getByText('Back to sign in');
    expect(link).toBeDefined();
    expect(link.closest('a')?.getAttribute('href')).toBe('/login');
  });

  it('calls forgotPassword mutation with valid email', async () => {
    mockForgotPasswordMutateAsync.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockForgotPasswordMutateAsync).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });
  });

  it('shows "Back to sign in" link on the success screen', async () => {
    mockForgotPasswordMutateAsync.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ForgotPasswordForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeDefined();
    });

    const backLink = screen.getByText('Back to sign in');
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/login');
  });
});
