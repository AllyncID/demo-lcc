import type { Creator } from './types';

export function getPollingCreators(creators: Creator[], category: number, query: string) {
  const search = query.trim().toLowerCase();
  return creators.filter(c => (!category || c.categoryId === category) && `${c.name} ${c.handle}`.toLowerCase().includes(search));
}
