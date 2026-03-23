import { describe, expect, it } from 'vitest';

import { filterSends } from './sendsFiltering';

const sends = [
  {
    id: 'individual-1',
    kind: 'individual',
    recipientEmail: 'alice@example.com',
    audienceProvenance: null,
  },
  {
    id: 'manual-1',
    kind: 'campaign',
    recipientEmail: 'manual@example.com',
    audienceProvenance: {
      manual: true,
      groups: [],
    },
  },
  {
    id: 'group-1',
    kind: 'campaign',
    recipientEmail: 'grouped@example.com',
    audienceProvenance: {
      manual: false,
      groups: [{ id: 'vip', name: 'VIP 고객' }],
    },
  },
  {
    id: 'mixed-1',
    kind: 'campaign',
    recipientEmail: 'mixed@example.com',
    audienceProvenance: {
      manual: true,
      groups: [{ id: 'beta', name: '베타 사용자' }],
    },
  },
];

describe('filterSends', () => {
  it('returns all sends when no filters are active', () => {
    expect(
      filterSends({
        sends,
        recipientQuery: '',
        provenanceFilter: 'all',
      }).map((send) => send.id),
    ).toEqual(['individual-1', 'manual-1', 'group-1', 'mixed-1']);
  });

  it('filters by recipient query', () => {
    expect(
      filterSends({
        sends,
        recipientQuery: 'grouped@example.com',
        provenanceFilter: 'all',
      }).map((send) => send.id),
    ).toEqual(['group-1']);
  });

  it('filters by group-name query and direct-entry label', () => {
    expect(
      filterSends({
        sends,
        recipientQuery: 'VIP',
        provenanceFilter: 'all',
      }).map((send) => send.id),
    ).toEqual(['group-1']);

    expect(
      filterSends({
        sends,
        recipientQuery: '직접 입력',
        provenanceFilter: 'all',
      }).map((send) => send.id),
    ).toEqual(['manual-1', 'mixed-1']);
  });

  it('returns only campaign sends with manual provenance for manual filter', () => {
    expect(
      filterSends({
        sends,
        recipientQuery: '',
        provenanceFilter: 'manual',
      }).map((send) => send.id),
    ).toEqual(['manual-1', 'mixed-1']);
  });

  it('returns only campaign sends with group provenance for group filter', () => {
    expect(
      filterSends({
        sends,
        recipientQuery: '',
        provenanceFilter: 'group',
      }).map((send) => send.id),
    ).toEqual(['group-1', 'mixed-1']);
  });
});
