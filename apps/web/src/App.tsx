import { greetingSchema } from '@calley/shared';

export function App() {
  const result = greetingSchema.safeParse({ message: 'Hello from Calley!' });

  return (
    <div>
      <h1>Calley</h1>
      {result.success && <p>{result.data.message}</p>}
    </div>
  );
}
