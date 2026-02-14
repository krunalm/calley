import { loginSchema, TASK_PRIORITIES } from '@calley/shared';

export function App() {
  // Verify @calley/shared schemas and constants import correctly
  const schemaFields = Object.keys(loginSchema.shape).length;
  const priorities = TASK_PRIORITIES.length;

  return (
    <div>
      <h1>Calley</h1>
      <p>
        Shared package loaded: {schemaFields} auth fields, {priorities} priority levels
      </p>
    </div>
  );
}
