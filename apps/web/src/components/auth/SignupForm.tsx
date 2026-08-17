import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';

import { signupSchema } from '@calley/shared';

import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useSignup } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

import type { SignupInput } from '@calley/shared';

// Lazy-loaded so the heavy `zxcvbn` dictionaries stay out of the main bundle
// and only load when the user starts typing a password.
const PasswordStrengthMeter = lazy(() =>
  import('@/components/auth/PasswordStrengthMeter').then((m) => ({
    default: m.PasswordStrengthMeter,
  })),
);

export function SignupForm() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [passwordValue, setPasswordValue] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupInput) => {
    try {
      await signup.mutateAsync(data);
      navigate({ to: '/calendar' });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('email', { message: 'An account with this email already exists.' });
        } else {
          setError('root', { message: 'Failed to create account. Please try again.' });
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          placeholder="Your name"
          autoComplete="name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="name-error" className="field-error text-sm" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="field-error text-sm" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Create a password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password', {
            onChange: (e) => setPasswordValue(e.target.value),
          })}
        />
        {passwordValue && (
          <Suspense fallback={null}>
            <PasswordStrengthMeter password={passwordValue} />
          </Suspense>
        )}
        {errors.password && (
          <p id="password-error" className="field-error text-sm" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p id="root-error" className="field-error text-sm" role="alert">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account...' : 'Create account'}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[var(--card)] px-2 text-[var(--muted-foreground)]">
            Or continue with
          </span>
        </div>
      </div>

      <OAuthButtons />

      <p className="text-center text-sm text-[var(--muted-foreground)]">
        Already have an account?{' '}
        <Link to="/login" className="text-[var(--color-accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
