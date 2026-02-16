// Using sonner for toast notifications as recommended by shadcn/ui
// This re-exports sonner's Toaster with Calley design tokens
//
// Accessibility: Sonner renders toasts in an `<ol>` with role="status"
// and aria-live="polite" for standard toasts, and role="alert" with
// aria-live="assertive" for error toasts. The `richColors` prop applies
// distinct background colors to success/error/warning/info variants.

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-[var(--background)] group-[.toaster]:text-[var(--foreground)] group-[.toaster]:border-[var(--border)] group-[.toaster]:shadow-[var(--shadow-lg)]',
          description: 'group-[.toast]:text-[var(--muted-foreground)]',
          actionButton:
            'group-[.toast]:bg-[var(--primary)] group-[.toast]:text-[var(--primary-foreground)]',
          cancelButton:
            'group-[.toast]:bg-[var(--muted)] group-[.toast]:text-[var(--muted-foreground)]',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
