import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';

import { DEFAULT_CATEGORY_COLOR, MAX_CATEGORIES_PER_USER } from '@calley/shared';

import { db } from '../db';
import { calendarCategories, events, tasks } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { sseService } from './sse.service';

import type { CreateCategoryInput, UpdateCategoryInput } from '@calley/shared';

// ─── Types ──────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  userId: string;
  name: string;
  color: string;
  isDefault: boolean;
  visible: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CategoryResponse {
  id: string;
  userId: string;
  name: string;
  color: string;
  isDefault: boolean;
  visible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toCategoryResponse(row: CategoryRow): CategoryResponse {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color,
    isDefault: row.isDefault,
    visible: row.visible,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Service ────────────────────────────────────────────────────────

export class CategoryService {
  /**
   * List all categories for a user, sorted by sortOrder.
   */
  async listCategories(userId: string): Promise<CategoryResponse[]> {
    const rows = await db.query.calendarCategories.findMany({
      where: eq(calendarCategories.userId, userId),
      orderBy: [asc(calendarCategories.sortOrder), asc(calendarCategories.createdAt)],
    });

    return rows.map((r) => toCategoryResponse(r as CategoryRow));
  }

  /**
   * Create a new category for a user.
   * Validates name uniqueness per user and enforces max 20 categories.
   */
  async createCategory(userId: string, data: CreateCategoryInput): Promise<CategoryResponse> {
    // Check max categories limit
    const [countResult] = await db
      .select({ value: count() })
      .from(calendarCategories)
      .where(eq(calendarCategories.userId, userId));

    if (countResult.value >= MAX_CATEGORIES_PER_USER) {
      throw new AppError(
        422,
        'CONFLICT',
        `Maximum of ${MAX_CATEGORIES_PER_USER} categories allowed`,
      );
    }

    // Check name uniqueness for this user
    const existing = await db.query.calendarCategories.findFirst({
      where: and(eq(calendarCategories.userId, userId), eq(calendarCategories.name, data.name)),
    });

    if (existing) {
      throw new AppError(409, 'CONFLICT', 'A category with this name already exists');
    }

    // Determine next sort order
    const lastCategory = await db.query.calendarCategories.findFirst({
      where: eq(calendarCategories.userId, userId),
      orderBy: [asc(calendarCategories.sortOrder)],
    });

    const maxSortOrder = lastCategory
      ? await db.query.calendarCategories
          .findMany({
            where: eq(calendarCategories.userId, userId),
          })
          .then((rows) => Math.max(...rows.map((r) => r.sortOrder), 0))
      : 0;

    const [created] = await db
      .insert(calendarCategories)
      .values({
        userId,
        name: data.name,
        color: data.color,
        isDefault: false,
        sortOrder: maxSortOrder + 1,
      })
      .returning();

    logger.info({ userId, categoryId: created.id }, 'Category created');

    return toCategoryResponse(created as CategoryRow);
  }

  /**
   * Update an existing category. Validates ownership.
   */
  async updateCategory(
    userId: string,
    categoryId: string,
    data: UpdateCategoryInput,
  ): Promise<CategoryResponse> {
    const category = await db.query.calendarCategories.findFirst({
      where: and(eq(calendarCategories.id, categoryId), eq(calendarCategories.userId, userId)),
    });

    if (!category) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }

    // Check name uniqueness if name is being changed
    if (data.name !== undefined && data.name !== category.name) {
      const existing = await db.query.calendarCategories.findFirst({
        where: and(
          eq(calendarCategories.userId, userId),
          eq(calendarCategories.name, data.name),
          ne(calendarCategories.id, categoryId),
        ),
      });

      if (existing) {
        throw new AppError(409, 'CONFLICT', 'A category with this name already exists');
      }
    }

    const [updated] = await db
      .update(calendarCategories)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.visible !== undefined && { visible: data.visible }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        updatedAt: new Date(),
      })
      .where(and(eq(calendarCategories.id, categoryId), eq(calendarCategories.userId, userId)))
      .returning();

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }

    logger.info({ userId, categoryId }, 'Category updated');

    const response = toCategoryResponse(updated as CategoryRow);

    sseService.emit(userId, 'category:updated', {
      id: response.id,
      name: response.name,
      color: response.color,
      visible: response.visible,
    });

    return response;
  }

  /**
   * Delete a category. Cannot delete the default category.
   * Reassigns all events and tasks from the deleted category
   * to the user's default category.
   */
  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    const category = await db.query.calendarCategories.findFirst({
      where: and(eq(calendarCategories.id, categoryId), eq(calendarCategories.userId, userId)),
    });

    if (!category) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }

    if (category.isDefault) {
      throw new AppError(422, 'FORBIDDEN', 'Cannot delete the default category');
    }

    // Find the user's default category for reassignment
    const defaultCategory = await db.query.calendarCategories.findFirst({
      where: and(eq(calendarCategories.userId, userId), eq(calendarCategories.isDefault, true)),
    });

    if (!defaultCategory) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Default category not found');
    }

    await db.transaction(async (tx) => {
      // Reassign events to default category
      await tx
        .update(events)
        .set({ categoryId: defaultCategory.id, updatedAt: new Date() })
        .where(
          and(
            eq(events.userId, userId),
            eq(events.categoryId, categoryId),
            isNull(events.deletedAt),
          ),
        );

      // Reassign tasks to default category
      await tx
        .update(tasks)
        .set({ categoryId: defaultCategory.id, updatedAt: new Date() })
        .where(
          and(eq(tasks.userId, userId), eq(tasks.categoryId, categoryId), isNull(tasks.deletedAt)),
        );

      // Delete the category
      await tx
        .delete(calendarCategories)
        .where(and(eq(calendarCategories.id, categoryId), eq(calendarCategories.userId, userId)));
    });

    logger.info(
      { userId, categoryId, reassignedTo: defaultCategory.id },
      'Category deleted, items reassigned to default',
    );

    sseService.emit(userId, 'category:deleted', { id: categoryId });
  }

  /**
   * Create the default "Personal" category for a new user.
   * Called during signup.
   */
  async createDefaultCategory(userId: string): Promise<CategoryResponse> {
    const [created] = await db
      .insert(calendarCategories)
      .values({
        userId,
        name: 'Personal',
        color: DEFAULT_CATEGORY_COLOR,
        isDefault: true,
        sortOrder: 0,
      })
      .returning();

    return toCategoryResponse(created as CategoryRow);
  }
}

export const categoryService = new CategoryService();
