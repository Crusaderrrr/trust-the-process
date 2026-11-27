import { api } from '../api/client';
import type { CatalogEntry } from '../domain/catalog';

/** Instructions and pictures of a catalog exercise; undefined when offline and not seen before. */
export const getCatalogEntry = (id: string) => api<CatalogEntry>('GET', `/catalog/${id}`).catch(() => undefined);
