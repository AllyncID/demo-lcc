import type { Bootstrap, Creator } from './types';

export function getVotingUnavailable(data: Pick<Bootstrap, 'settings' | 'votingOpen'>, now = Date.now()) {
  if (data.votingOpen) return null;
  const { votingActive, votingStartsAt, votingEndsAt } = data.settings;
  if (votingActive && votingEndsAt && now >= Date.parse(votingEndsAt)) return {
    title: 'Voting telah berakhir.',
    description: 'Terima kasih untuk setiap dukungan yang sudah diberikan. Nantikan informasi selanjutnya dari panitia LCC Awards.',
    opensAt: null
  };
  if (votingActive && votingStartsAt && now < Date.parse(votingStartsAt)) return {
    title: 'Voting belum dibuka.',
    description: 'Panggung sedang disiapkan. Kamu bisa memberikan dukungan kepada creator pilihanmu saat periode voting dimulai.',
    opensAt: votingStartsAt
  };
  return {
    title: 'Voting belum tersedia.',
    description: 'Voting belum dapat dilakukan saat ini. Nantikan informasi pembukaan dari panitia LCC Awards.',
    opensAt: null
  };
}

export function getPollingCreators(creators: Creator[], category: number, query: string) {
  const search = query.trim().toLowerCase();
  return creators.filter(c => (!category || c.categoryId === category) && `${c.name} ${c.handle}`.toLowerCase().includes(search));
}
