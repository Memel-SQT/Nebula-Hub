import { checkUrl } from './net-policy';

describe('checkUrl (R05)', () => {
  it.each([
    'https://api.github.com/repos/Memel-SQT/Nebula-Finterest/releases',
    'https://github.com/Memel-SQT/Nebula-Finterest/releases/download/v0.1.36/latest.yml',
    'https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r',
    'https://objects.githubusercontent.com/x',
    'https://raw.githubusercontent.com/Memel-SQT/Nebula-Hub/main/catalog/nebula-catalog.json',
    'https://git.rodriguesnoa.fr/noa/Nebula-Hub/raw/branch/main/catalog/nebula-catalog.json',
    'https://GITHUB.com/x',
  ])('allows %s', (url) => {
    expect(checkUrl(url).ok).toBe(true);
  });

  it.each([
    ['http://github.com/x', 'protocol'],
    ['ftp://github.com/x', 'protocol'],
    ['file:///C:/x', 'protocol'],
    ['https://evil.example/x', 'host'],
    ['https://github.com.evil.example/x', 'host'],
    ['https://gist.github.com/x', 'host'],
    ['https://githubusercontent.com/x', 'host'],
    ['https://user:pass@github.com/x', 'credentials'],
    // The classic disguise: "github.com" is only the user name, the host is evil.example.
    ['https://github.com@evil.example/x', 'credentials'],
    ['https://github.com:8443/x', 'port'],
    ['not a url', 'invalid'],
  ])('refuses %s (%s)', (url, reason) => {
    expect(checkUrl(url)).toEqual({ ok: false, reason });
  });

  it('accepts a custom policy for local tests only', () => {
    const policy = { protocols: ['http:'], hosts: ['127.0.0.1'], ports: ['4000'] };
    expect(checkUrl('http://127.0.0.1:4000/x', policy).ok).toBe(true);
    expect(checkUrl('http://127.0.0.1:4001/x', policy)).toEqual({ ok: false, reason: 'port' });
  });
});
