import { matchCheckrCandidates, type MatchableMember } from './checkr-candidate-matcher';

const member = (overrides: Partial<MatchableMember> & { memberId: string }): MatchableMember => ({
  email: `${overrides.memberId}@windborne.test`,
  name: null,
  record: null,
  ...overrides,
});

describe('matchCheckrCandidates', () => {
  it('links by stored candidate id, Drata case id, personal email, custom_id and unique name, in that order', () => {
    const members = [
      member({ memberId: 'linked', record: { employeeEmail: 'x@y.test', externalCandidateId: 'c_linked', requesterNotes: null } }),
      member({ memberId: 'drata', record: { employeeEmail: 'd@y.test', externalCandidateId: null, requesterNotes: 'Imported from Drata. Checkr case c_drata completed' } }),
      member({ memberId: 'personal', record: { employeeEmail: 'ada@gmail.test', externalCandidateId: null, requesterNotes: null } }),
      member({ memberId: 'work' }),
      member({ memberId: 'named', name: 'Grace Hopper' }),
    ];
    const { matches, unmatched } = matchCheckrCandidates({
      members,
      candidates: [
        { id: 'c_linked', email: 'other@gmail.test' },
        { id: 'c_drata' },
        { id: 'c_personal', email: 'ADA@gmail.test' },
        { id: 'c_custom', email: 'nobody@gmail.test', custom_id: 'work@windborne.test' },
        { id: 'c_named', first_name: 'grace', last_name: 'hopper' },
        { id: 'c_unknown', email: 'stranger@gmail.test', first_name: 'Nobody' },
      ],
    });

    expect(matches.map((m) => [m.candidate.id, m.member.memberId, m.method])).toEqual([
      ['c_linked', 'linked', 'linked'],
      ['c_drata', 'drata', 'drata'],
      ['c_personal', 'personal', 'email'],
      ['c_custom', 'work', 'email'],
      ['c_named', 'named', 'name'],
    ]);
    expect(unmatched.map((c) => c.id)).toEqual(['c_unknown']);
  });

  it('does not match on a name shared by two members', () => {
    const { matches } = matchCheckrCandidates({
      members: [member({ memberId: 'a', name: 'Sam Lee' }), member({ memberId: 'b', name: 'Sam Lee' })],
      candidates: [{ id: 'c1', first_name: 'Sam', last_name: 'Lee' }],
    });
    expect(matches).toEqual([]);
  });
});
