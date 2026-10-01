import { isSafeExternalUrl } from './url';

describe('isSafeExternalUrl (R12)', () => {
  it('accepts plain https URLs', () => {
    expect(isSafeExternalUrl('https://github.com/Memel-SQT/Nebula-Hub/releases')).toBe(true);
  });

  it.each([
    'http://github.com',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'nebula://finterest/calendar',
    'https://user:pass@evil.example',
    'not a url',
    '',
    42,
    null,
    `https://example.com/${'a'.repeat(3000)}`,
  ])('refuses %p', (value) => {
    expect(isSafeExternalUrl(value)).toBe(false);
  });
});
