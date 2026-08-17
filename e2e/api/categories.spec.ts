import { errorBody } from '../support/api';
import { ANCHOR, isoPlusHours } from '../support/dates';
import { expect, test } from '../support/fixtures';

/**
 * Calendar category contract, including the reassignment rules that keep
 * events and tasks attached to a valid category when one is deleted.
 */

test.describe('API — list categories', () => {
  test('returns the auto-provisioned default category', async ({ api }) => {
    const res = await api.get('/categories');
    expect(res.status()).toBe(200);

    const categories = (await res.json()) as { name: string; isDefault: boolean }[];
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ name: 'Personal', isDefault: true });
  });

  test('the default category is visible and carries a colour', async ({ category }) => {
    expect(category.visible).toBe(true);
    expect(category.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('lists newly created categories', async ({ api }) => {
    const created = await api.createCategory('Fitness ' + Date.now(), '#10B981');

    const categories = await api.categories();
    expect(categories.map((c) => c.id)).toContain(created.id);
  });

  test("never lists another user's categories", async ({ api, otherApi }) => {
    const foreign = await otherApi.createCategory('Foreign ' + Date.now(), '#EF4444');

    const categories = await api.categories();
    expect(categories.map((c) => c.id)).not.toContain(foreign.id);
  });

  test('listing requires authentication', async ({ anonApi }) => {
    expect((await anonApi.get('/categories')).status()).toBe(401);
  });
});

test.describe('API — create category', () => {
  test('creates a category with a name and colour', async ({ api }) => {
    const res = await api.post('/categories', { name: 'Work ' + Date.now(), color: '#3B82F6' });
    expect(res.status()).toBe(201);

    const created = (await res.json()) as { color: string; isDefault: boolean };
    expect(created.color).toBe('#3B82F6');
    expect(created.isDefault).toBe(false);
  });

  test('trims surrounding whitespace from the name', async ({ api }) => {
    const name = 'Padded ' + Date.now();
    const res = await api.post('/categories', { name: `  ${name}  `, color: '#3B82F6' });

    expect(((await res.json()) as { name: string }).name).toBe(name);
  });

  test('assigns an increasing sort order', async ({ api }) => {
    const first = await api.createCategory('One ' + Date.now(), '#3B82F6');
    const second = await api.createCategory('Two ' + Date.now(), '#10B981');

    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
  });

  test('rejects a duplicate name for the same user', async ({ api }) => {
    const name = 'Duplicate ' + Date.now();
    await api.createCategory(name, '#3B82F6');

    const res = await api.post('/categories', { name, color: '#10B981' });
    expect(res.status()).toBe(409);
    expect((await errorBody(res)).code).toBe('CONFLICT');
  });

  test('allows two users to use the same category name', async ({ api, otherApi }) => {
    const name = 'Shared name ' + Date.now();
    await api.createCategory(name, '#3B82F6');

    const res = await otherApi.post('/categories', { name, color: '#10B981' });
    expect(res.status()).toBe(201);
  });

  test('rejects an empty name', async ({ api }) => {
    expect((await api.post('/categories', { name: '  ', color: '#3B82F6' })).status()).toBe(400);
  });

  test('rejects a name longer than 50 characters', async ({ api }) => {
    const res = await api.post('/categories', { name: 'x'.repeat(51), color: '#3B82F6' });
    expect(res.status()).toBe(400);
  });

  test('rejects a missing colour', async ({ api }) => {
    expect((await api.post('/categories', { name: 'No colour' })).status()).toBe(400);
  });

  test('rejects a malformed colour', async ({ api }) => {
    const res = await api.post('/categories', { name: 'Bad colour', color: '#GGGGGG' });
    expect(res.status()).toBe(400);
  });

  test('rejects a 3-digit shorthand colour', async ({ api }) => {
    const res = await api.post('/categories', { name: 'Short colour', color: '#FFF' });
    expect(res.status()).toBe(400);
  });

  test('enforces the 20-category cap', async ({ api }) => {
    // One default category already exists, so 19 more reach the cap.
    for (let i = 0; i < 19; i += 1) {
      const res = await api.post('/categories', {
        name: `Cat ${i} ${Date.now()}`,
        color: '#3B82F6',
      });
      expect(res.status()).toBe(201);
    }

    const overflow = await api.post('/categories', {
      name: `Overflow ${Date.now()}`,
      color: '#3B82F6',
    });
    expect(overflow.status()).toBe(422);
    expect((await errorBody(overflow)).message).toMatch(/maximum of 20/i);
  });

  test('creating requires authentication', async ({ anonApi }) => {
    const res = await anonApi.post('/categories', { name: 'Nope', color: '#3B82F6' });
    expect(res.status()).toBe(401);
  });
});

test.describe('API — update category', () => {
  test('renames a category', async ({ api }) => {
    const created = await api.createCategory('Before ' + Date.now(), '#3B82F6');

    const res = await api.patch(`/categories/${created.id}`, { name: 'After ' + Date.now() });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { name: string }).name).toMatch(/^After /);
  });

  test('changes the colour', async ({ api }) => {
    const created = await api.createCategory('Colour ' + Date.now(), '#3B82F6');

    const res = await api.patch(`/categories/${created.id}`, { color: '#EC4899' });
    expect(((await res.json()) as { color: string }).color).toBe('#EC4899');
  });

  test('toggles visibility', async ({ api }) => {
    const created = await api.createCategory('Hidden ' + Date.now(), '#3B82F6');

    const res = await api.patch(`/categories/${created.id}`, { visible: false });
    expect(((await res.json()) as { visible: boolean }).visible).toBe(false);
  });

  test('updates the sort order', async ({ api }) => {
    const created = await api.createCategory('Sorted ' + Date.now(), '#3B82F6');

    const res = await api.patch(`/categories/${created.id}`, { sortOrder: 7 });
    expect(((await res.json()) as { sortOrder: number }).sortOrder).toBe(7);
  });

  test('renames the default category', async ({ api, category }) => {
    const res = await api.patch(`/categories/${category.id}`, { name: 'My calendar' });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { isDefault: boolean }).isDefault).toBe(true);
  });

  test('rejects renaming onto an existing name', async ({ api }) => {
    const taken = 'Taken ' + Date.now();
    await api.createCategory(taken, '#3B82F6');
    const other = await api.createCategory('Other ' + Date.now(), '#10B981');

    const res = await api.patch(`/categories/${other.id}`, { name: taken });
    expect(res.status()).toBe(409);
  });

  test('rejects a malformed colour', async ({ api }) => {
    const created = await api.createCategory('Colour ' + Date.now(), '#3B82F6');

    expect((await api.patch(`/categories/${created.id}`, { color: 'blue' })).status()).toBe(400);
  });

  test('rejects a negative sort order', async ({ api }) => {
    const created = await api.createCategory('Sorted ' + Date.now(), '#3B82F6');

    expect((await api.patch(`/categories/${created.id}`, { sortOrder: -1 })).status()).toBe(400);
  });

  test('returns 404 for an unknown category', async ({ api }) => {
    expect((await api.patch(`/categories/${'a'.repeat(24)}`, { name: 'Ghost' })).status()).toBe(
      404,
    );
  });

  test("cannot update another user's category", async ({ api, otherApi }) => {
    const foreign = await otherApi.createCategory('Foreign ' + Date.now(), '#EF4444');

    expect((await api.patch(`/categories/${foreign.id}`, { name: 'Hijack' })).status()).toBe(404);
  });
});

test.describe('API — delete category', () => {
  test('deletes a non-default category', async ({ api }) => {
    const created = await api.createCategory('Temporary ' + Date.now(), '#3B82F6');

    expect((await api.delete(`/categories/${created.id}`)).status()).toBe(204);
    expect((await api.categories()).map((c) => c.id)).not.toContain(created.id);
  });

  test('refuses to delete the default category', async ({ api, category }) => {
    const res = await api.delete(`/categories/${category.id}`);

    expect(res.status()).toBe(422);
    expect((await errorBody(res)).message).toMatch(/default category/i);
  });

  test("reassigns the deleted category's events to the default one", async ({ api, category }) => {
    const temp = await api.createCategory('Temp ' + Date.now(), '#3B82F6');
    const event = await api.createEvent({
      title: 'Reassign me',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: temp.id,
    });

    await api.delete(`/categories/${temp.id}`);

    const after = (await (await api.get(`/events/${event.id}`)).json()) as { categoryId: string };
    expect(after.categoryId).toBe(category.id);
  });

  test("reassigns the deleted category's tasks to the default one", async ({ api, category }) => {
    const temp = await api.createCategory('Temp ' + Date.now(), '#3B82F6');
    const task = await api.createTask({ title: 'Reassign me', categoryId: temp.id });

    await api.delete(`/categories/${temp.id}`);

    const after = (await (await api.get(`/tasks/${task.id}`)).json()) as { categoryId: string };
    expect(after.categoryId).toBe(category.id);
  });

  test('does not delete the events themselves', async ({ api }) => {
    const temp = await api.createCategory('Temp ' + Date.now(), '#3B82F6');
    const event = await api.createEvent({
      title: 'Survivor',
      startAt: ANCHOR,
      endAt: isoPlusHours(ANCHOR, 1),
      categoryId: temp.id,
    });

    await api.delete(`/categories/${temp.id}`);

    expect((await api.get(`/events/${event.id}`)).status()).toBe(200);
  });

  test('returns 404 for an unknown category', async ({ api }) => {
    expect((await api.delete(`/categories/${'a'.repeat(24)}`)).status()).toBe(404);
  });

  test('returns 400 for a malformed id', async ({ api }) => {
    expect((await api.delete('/categories/not-a-cuid')).status()).toBe(400);
  });

  test("cannot delete another user's category", async ({ api, otherApi }) => {
    const foreign = await otherApi.createCategory('Foreign ' + Date.now(), '#EF4444');

    expect((await api.delete(`/categories/${foreign.id}`)).status()).toBe(404);
    expect((await otherApi.categories()).map((c) => c.id)).toContain(foreign.id);
  });

  test('deleting requires authentication', async ({ anonApi }) => {
    expect((await anonApi.delete(`/categories/${'a'.repeat(24)}`)).status()).toBe(401);
  });
});
