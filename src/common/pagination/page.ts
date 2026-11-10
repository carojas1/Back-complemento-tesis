// Pagination of all listings (constitution §3). Pure types: used by the domain and the ports.
export interface PageRequest {
  page: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const skipOf = ({ page, limit }: PageRequest) => (page - 1) * limit;

export const toPage = <T>(items: T[], total: number, { page, limit }: PageRequest): Page<T> => ({
  items,
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

// Transforms the items of a page keeping the pagination data (e.g. entity → response).
export async function mapPage<T, U>(page: Page<T>, map: (item: T) => U | Promise<U>): Promise<Page<U>> {
  return { ...page, items: await Promise.all(page.items.map(map)) };
}
