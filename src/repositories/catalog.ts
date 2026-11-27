import { api } from '../api/client';
import type { CatalogEntry } from '../domain/catalog';

/** Instructions and pictures of a catalog exercise; null when offline and not seen before. */
export const getCatalogEntry = (id: string) => api<CatalogEntry>('GET', `/catalog/${id}`).catch(() => null);
