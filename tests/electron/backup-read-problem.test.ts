import { saveReadProblem } from '../../src/shared/backup';

describe('saveReadProblem (ADR-040)', () => {
  it('tells a save sealed on another computer from a missing or unreadable file', () => {
    expect(saveReadProblem(new Error('ERR_SAVE_KEY_UNKNOWN'))).toBe('key-unknown');
    expect(saveReadProblem(Object.assign(new Error('nope'), { code: 'ENOENT' }))).toBe('missing');
    expect(saveReadProblem(new Error('ERR_SAVE_DAMAGED'))).toBe('invalid');
    expect(saveReadProblem(null)).toBe('invalid');
  });
});
