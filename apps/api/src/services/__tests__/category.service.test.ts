import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the service ──────────────────────

// Mock the database module
vi.mock('../../db', () => {
  const mockDb = {
    query: {
      calendarCategories: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };

  return { db: mockDb };
});

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock SSE service
vi.mock('../sse.service', () => ({
  sseService: {
    emit: vi.fn(),
  },
}));

// Mock @calley/shared
vi.mock('@calley/shared', () => ({
  DEFAULT_CATEGORY_COLOR: '#4a90d9',
  MAX_CATEGORIES_PER_USER: 20,
}));

import { db } from '../../db';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { CategoryService } from '../category.service';
import { sseService } from '../sse.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_CATEGORY_ID = 'testcategory1234567890123';
const TEST_DEFAULT_CATEGORY_ID = 'defaultcategory1234567890';

function makeCategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CATEGORY_ID,
    userId: TEST_USER_ID,
    name: 'Work',
    color: '#c8522a',
    isDefault: false,
    visible: true,
    sortOrder: 1,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDefaultCategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_DEFAULT_CATEGORY_ID,
    userId: TEST_USER_ID,
    name: 'Personal',
    color: '#4a90d9',
    isDefault: true,
    visible: true,
    sortOrder: 0,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

// ─── Helpers for mocking chained Drizzle queries ────────────────────

function mockSelectCountChain(countValue: number) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ value: countValue }]),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockInsertChain(result: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockUpdateChain(result: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockTransactionForDelete() {
  const txUpdateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  const txDeleteChain = {
    where: vi.fn().mockResolvedValue([]),
  };
  const tx = {
    update: vi.fn().mockReturnValue(txUpdateChain),
    delete: vi.fn().mockReturnValue(txDeleteChain),
  };
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));
  return tx;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CategoryService();
  });

  // ─── listCategories ─────────────────────────────────────────────

  describe('listCategories', () => {
    it('should return all categories for a user sorted by sortOrder', async () => {
      const rows = [
        makeDefaultCategoryRow(),
        makeCategoryRow({ sortOrder: 1 }),
        makeCategoryRow({ id: 'anothercategory12345678901', name: 'Meetings', sortOrder: 2 }),
      ];
      (db.query.calendarCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.listCategories(TEST_USER_ID);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Personal');
      expect(result[0].isDefault).toBe(true);
      expect(result[1].name).toBe('Work');
      expect(result[2].name).toBe('Meetings');
      expect(db.query.calendarCategories.findMany).toHaveBeenCalled();
    });

    it('should return an empty array when the user has no categories', async () => {
      (db.query.calendarCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.listCategories(TEST_USER_ID);

      expect(result).toEqual([]);
    });

    it('should serialize dates to ISO strings in the response', async () => {
      const row = makeCategoryRow({
        createdAt: new Date('2026-03-01T12:30:00Z'),
        updatedAt: new Date('2026-03-05T08:15:00Z'),
      });
      (db.query.calendarCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

      const result = await service.listCategories(TEST_USER_ID);

      expect(result[0].createdAt).toBe('2026-03-01T12:30:00.000Z');
      expect(result[0].updatedAt).toBe('2026-03-05T08:15:00.000Z');
    });
  });

  // ─── createCategory ─────────────────────────────────────────────

  describe('createCategory', () => {
    it('should create a category successfully', async () => {
      const createdRow = makeCategoryRow();

      // Count returns less than max
      mockSelectCountChain(5);
      // No duplicate name found
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );
      // findFirst for sort order check (last category exists)
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeDefaultCategoryRow(),
      );
      // findMany for computing max sort order
      (db.query.calendarCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeDefaultCategoryRow({ sortOrder: 0 }),
      ]);
      // Insert returns the created row
      mockInsertChain([createdRow]);

      const result = await service.createCategory(TEST_USER_ID, {
        name: 'Work',
        color: '#c8522a',
      });

      expect(result.id).toBe(TEST_CATEGORY_ID);
      expect(result.name).toBe('Work');
      expect(result.color).toBe('#c8522a');
      expect(result.isDefault).toBe(false);
      expect(db.insert).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        { userId: TEST_USER_ID, categoryId: TEST_CATEGORY_ID },
        'Category created',
      );
    });

    it('should throw CONFLICT when a category with the same name already exists', async () => {
      // Count returns less than max
      mockSelectCountChain(3);
      // Duplicate name found
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeCategoryRow({ name: 'Work' }),
      );

      const promise = service.createCategory(TEST_USER_ID, { name: 'Work', color: '#c8522a' });

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'A category with this name already exists',
      });
    });

    it('should throw CONFLICT when max categories limit is reached', async () => {
      // Count returns exactly the max
      mockSelectCountChain(20);

      const promise = service.createCategory(TEST_USER_ID, {
        name: 'New Category',
        color: '#ff0000',
      });

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        statusCode: 422,
        code: 'CONFLICT',
        message: 'Maximum of 20 categories allowed',
      });
    });

    it('should throw when category count exceeds max', async () => {
      // Count returns more than the max
      mockSelectCountChain(25);

      await expect(
        service.createCategory(TEST_USER_ID, { name: 'Extra', color: '#ff0000' }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'CONFLICT',
      });
    });

    it('should set sortOrder to 1 when the user has no existing categories', async () => {
      const createdRow = makeCategoryRow({ sortOrder: 1 });

      mockSelectCountChain(0);
      // No duplicate name
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );
      // No last category (user has none)
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );
      // Insert
      mockInsertChain([createdRow]);

      const result = await service.createCategory(TEST_USER_ID, {
        name: 'Work',
        color: '#c8522a',
      });

      expect(result.sortOrder).toBe(1);
    });

    it('should compute the next sortOrder based on existing categories', async () => {
      const createdRow = makeCategoryRow({ sortOrder: 4 });

      mockSelectCountChain(3);
      // No duplicate name
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );
      // Last category exists
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeCategoryRow({ sortOrder: 3 }),
      );
      // findMany returns rows to compute max sort order
      (db.query.calendarCategories.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeDefaultCategoryRow({ sortOrder: 0 }),
        makeCategoryRow({ sortOrder: 1 }),
        makeCategoryRow({ id: 'cat2_id123456789012345678', sortOrder: 3 }),
      ]);
      // Insert
      mockInsertChain([createdRow]);

      const result = await service.createCategory(TEST_USER_ID, {
        name: 'Work',
        color: '#c8522a',
      });

      // maxSortOrder is 3, so new sortOrder should be 4
      expect(result.sortOrder).toBe(4);
    });
  });

  // ─── updateCategory ─────────────────────────────────────────────

  describe('updateCategory', () => {
    it('should update a category name and color successfully', async () => {
      const existingRow = makeCategoryRow();
      const updatedRow = makeCategoryRow({ name: 'Updated Work', color: '#00ff00' });

      // Ownership check — category found
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingRow,
      );
      // Name uniqueness check — no conflict
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );
      // Update chain
      mockUpdateChain([updatedRow]);

      const result = await service.updateCategory(TEST_USER_ID, TEST_CATEGORY_ID, {
        name: 'Updated Work',
        color: '#00ff00',
      });

      expect(result.name).toBe('Updated Work');
      expect(result.color).toBe('#00ff00');
      expect(db.update).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        { userId: TEST_USER_ID, categoryId: TEST_CATEGORY_ID },
        'Category updated',
      );
    });

    it('should emit an SSE event on successful update', async () => {
      const existingRow = makeCategoryRow();
      const updatedRow = makeCategoryRow({ name: 'SSE Test', color: '#abcdef', visible: true });

      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingRow,
      );
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );
      mockUpdateChain([updatedRow]);

      await service.updateCategory(TEST_USER_ID, TEST_CATEGORY_ID, {
        name: 'SSE Test',
        color: '#abcdef',
      });

      expect(sseService.emit).toHaveBeenCalledWith(TEST_USER_ID, 'category:updated', {
        id: TEST_CATEGORY_ID,
        name: 'SSE Test',
        color: '#abcdef',
        visible: true,
      });
    });

    it('should throw NOT_FOUND when category does not exist', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );

      await expect(
        service.updateCategory(TEST_USER_ID, 'nonexistent123456789012345', {
          name: 'Updated',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    });

    it('should throw NOT_FOUND when category belongs to a different user', async () => {
      // findFirst returns undefined because the userId+categoryId combo doesn't match
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );

      await expect(
        service.updateCategory('otheruserid12345678901234', TEST_CATEGORY_ID, {
          name: 'Hijack',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    });

    it('should throw CONFLICT when updating to a duplicate name', async () => {
      const existingRow = makeCategoryRow({ name: 'Work' });
      const conflictingRow = makeCategoryRow({
        id: 'conflictcat12345678901234',
        name: 'Personal',
      });

      // Ownership check — found
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingRow,
      );
      // Name uniqueness check — conflict found
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        conflictingRow,
      );

      await expect(
        service.updateCategory(TEST_USER_ID, TEST_CATEGORY_ID, { name: 'Personal' }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'A category with this name already exists',
      });
    });

    it('should skip name uniqueness check when name is unchanged', async () => {
      const existingRow = makeCategoryRow({ name: 'Work' });
      const updatedRow = makeCategoryRow({ name: 'Work', color: '#00ff00' });

      // Ownership check
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingRow,
      );
      // Should NOT call findFirst again for name uniqueness
      mockUpdateChain([updatedRow]);

      const result = await service.updateCategory(TEST_USER_ID, TEST_CATEGORY_ID, {
        color: '#00ff00',
      });

      expect(result.color).toBe('#00ff00');
      // findFirst called only once (ownership check), not twice
      expect(db.query.calendarCategories.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should update visibility without name check', async () => {
      const existingRow = makeCategoryRow({ visible: true });
      const updatedRow = makeCategoryRow({ visible: false });

      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingRow,
      );
      mockUpdateChain([updatedRow]);

      const result = await service.updateCategory(TEST_USER_ID, TEST_CATEGORY_ID, {
        visible: false,
      });

      expect(result.visible).toBe(false);
      // Only one findFirst call (ownership), no name uniqueness check
      expect(db.query.calendarCategories.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should update sortOrder', async () => {
      const existingRow = makeCategoryRow({ sortOrder: 1 });
      const updatedRow = makeCategoryRow({ sortOrder: 5 });

      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingRow,
      );
      mockUpdateChain([updatedRow]);

      const result = await service.updateCategory(TEST_USER_ID, TEST_CATEGORY_ID, {
        sortOrder: 5,
      });

      expect(result.sortOrder).toBe(5);
    });
  });

  // ─── deleteCategory ─────────────────────────────────────────────

  describe('deleteCategory', () => {
    it('should delete a non-default category and reassign items to default', async () => {
      const categoryToDelete = makeCategoryRow({ isDefault: false });
      const defaultCategory = makeDefaultCategoryRow();

      // First findFirst: category to delete
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        categoryToDelete,
      );
      // Second findFirst: default category lookup
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        defaultCategory,
      );

      const tx = mockTransactionForDelete();

      await service.deleteCategory(TEST_USER_ID, TEST_CATEGORY_ID);

      // Transaction should update events, update tasks, then delete category
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.update).toHaveBeenCalledTimes(2); // events + tasks reassignment
      expect(tx.delete).toHaveBeenCalledTimes(1); // category deletion
      expect(logger.info).toHaveBeenCalledWith(
        {
          userId: TEST_USER_ID,
          categoryId: TEST_CATEGORY_ID,
          reassignedTo: TEST_DEFAULT_CATEGORY_ID,
        },
        'Category deleted, items reassigned to default',
      );
    });

    it('should emit an SSE event on successful delete', async () => {
      const categoryToDelete = makeCategoryRow({ isDefault: false });
      const defaultCategory = makeDefaultCategoryRow();

      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        categoryToDelete,
      );
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        defaultCategory,
      );
      mockTransactionForDelete();

      await service.deleteCategory(TEST_USER_ID, TEST_CATEGORY_ID);

      expect(sseService.emit).toHaveBeenCalledWith(TEST_USER_ID, 'category:deleted', {
        id: TEST_CATEGORY_ID,
      });
    });

    it('should throw NOT_FOUND when category does not exist', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );

      await expect(
        service.deleteCategory(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    });

    it('should throw NOT_FOUND when category belongs to a different user', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );

      await expect(
        service.deleteCategory('otheruserid12345678901234', TEST_CATEGORY_ID),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should throw FORBIDDEN when trying to delete the default category', async () => {
      const defaultCategory = makeDefaultCategoryRow();

      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        defaultCategory,
      );

      await expect(
        service.deleteCategory(TEST_USER_ID, TEST_DEFAULT_CATEGORY_ID),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'FORBIDDEN',
        message: 'Cannot delete the default category',
      });
    });

    it('should throw INTERNAL_ERROR when default category is missing during reassignment', async () => {
      const categoryToDelete = makeCategoryRow({ isDefault: false });

      // Category to delete found
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        categoryToDelete,
      );
      // Default category NOT found
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined,
      );

      await expect(service.deleteCategory(TEST_USER_ID, TEST_CATEGORY_ID)).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Default category not found',
      });
    });
  });

  // ─── createDefaultCategory ──────────────────────────────────────

  describe('createDefaultCategory', () => {
    it('should create a default "Personal" category with correct properties', async () => {
      const createdRow = makeDefaultCategoryRow();
      mockInsertChain([createdRow]);

      const result = await service.createDefaultCategory(TEST_USER_ID);

      expect(result.name).toBe('Personal');
      expect(result.color).toBe('#4a90d9');
      expect(result.isDefault).toBe(true);
      expect(result.sortOrder).toBe(0);
      expect(result.userId).toBe(TEST_USER_ID);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should serialize dates to ISO strings', async () => {
      const createdRow = makeDefaultCategoryRow({
        createdAt: new Date('2026-02-16T10:00:00Z'),
        updatedAt: new Date('2026-02-16T10:00:00Z'),
      });
      mockInsertChain([createdRow]);

      const result = await service.createDefaultCategory(TEST_USER_ID);

      expect(result.createdAt).toBe('2026-02-16T10:00:00.000Z');
      expect(result.updatedAt).toBe('2026-02-16T10:00:00.000Z');
    });

    it('should return a CategoryResponse object with all expected fields', async () => {
      const createdRow = makeDefaultCategoryRow();
      mockInsertChain([createdRow]);

      const result = await service.createDefaultCategory(TEST_USER_ID);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('isDefault');
      expect(result).toHaveProperty('visible');
      expect(result).toHaveProperty('sortOrder');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });
  });
});
