// src/types/common.ts

/**
 * Options for paginating query results.
 */
export interface PaginationOptions {
  /**
   * The maximum number of items to return.
   */
  limit?: number;
  /**
   * A cursor or offset indicating where to start fetching the next page.
   * The exact type (string, number) might depend on the database implementation.
   */
  cursor?: string | number;
  // Add other common options like sorting if needed
  // sortBy?: string;
  // sortDirection?: 'asc' | 'desc';
}

/**
 * Represents a paginated list of results.
 */
export interface PaginatedResult<T> {
  /**
   * The items for the current page.
   */
  items: T[];
  /**
   * A cursor indicating the start of the next page, if available.
   */
  nextCursor?: string | number | null;
  /**
   * Indicates if there are more pages available after this one.
   */
  hasMore: boolean;
  /**
   * The total number of items across all pages (optional, may not always be available).
   */
  totalCount?: number;
}