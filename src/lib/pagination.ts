// Ojas — pagination helper for safe, bounded list queries.
// Prevents unbounded findMany() that could return huge result sets (audit logs,
// messages, patients, check-ins). Enforces a max page size + cursor offsets.
import type { Prisma } from "@prisma/client";

export interface PageParams {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

/** Parse ?page=&pageSize= query params safely. Clamps to sane bounds. */
export function parsePage(url: URL): PageParams {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const requested = parseInt(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  return { page, pageSize };
}

/** Build a Prisma findMany pagination slice (skip/take). */
export function pageSlice(p: PageParams): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

/** Wrap a findMany + count pair into a PageResult. */
export async function paginate<T>(
  findManyArgs: Prisma.Args<unknown, "findMany">,
  countArgs: Prisma.Args<unknown, "count">,
  p: PageParams,
  findMany: (args: typeof findManyArgs) => Promise<T[]>,
  count: (args: typeof countArgs) => Promise<number>,
): Promise<PageResult<T>> {
  const [data, total] = await Promise.all([
    findMany({ ...findManyArgs, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    count(countArgs),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return {
    data,
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages,
    hasMore: p.page < totalPages,
  };
}
