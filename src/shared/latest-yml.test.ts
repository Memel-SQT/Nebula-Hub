import { FeedError, isSafeFileName, parseUpdateFeed, selectInstaller } from './latest-yml';

// Real feeds, as published on 2026-10-01.
const FINTEREST = `version: 0.1.36
files:
  - url: Nebula-Finterest-Setup-0.1.36.exe
    sha512: jzBH9x46iPivw2fHCVcLrIcdIC5GXDSjK//0GMf5+UhOq8btiUUfT+Vs8P+OKzJF0K9AOmPv2hmmMVymaKI2EQ==
    size: 88626634
path: Nebula-Finterest-Setup-0.1.36.exe
sha512: jzBH9x46iPivw2fHCVcLrIcdIC5GXDSjK//0GMf5+UhOq8btiUUfT+Vs8P+OKzJF0K9AOmPv2hmmMVymaKI2EQ==
releaseDate: '2026-10-01T09:10:44.092Z'
`;

const CLOCK = `version: 1.1.3
files:
  - url: NebulaClock-Setup-1.1.3-x64.exe
    sha512: akIC9FX9j4wfN1+MjkdBg/dSlJPKLrXVFzvADRVmSPZ2uf3whMM8uaQy4Rs+SP4O0pm5b/4lqTe3m2m0GinaQw==
    size: 85801027
path: NebulaClock-Setup-1.1.3-x64.exe
sha512: akIC9FX9j4wfN1+MjkdBg/dSlJPKLrXVFzvADRVmSPZ2uf3whMM8uaQy4Rs+SP4O0pm5b/4lqTe3m2m0GinaQw==
releaseDate: '2026-09-03T05:25:34.941Z'
`;

function code(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof FeedError ? error.message : `unexpected: ${String(error)}`;
  }
  return 'no error';
}

describe('parseUpdateFeed', () => {
  it('reads the real Finterest and Clock feeds', () => {
    expect(parseUpdateFeed(FINTEREST)).toEqual({
      version: '0.1.36',
      files: [{ url: 'Nebula-Finterest-Setup-0.1.36.exe', sha512: 'jzBH9x46iPivw2fHCVcLrIcdIC5GXDSjK//0GMf5+UhOq8btiUUfT+Vs8P+OKzJF0K9AOmPv2hmmMVymaKI2EQ==', size: 88626634 }],
      path: 'Nebula-Finterest-Setup-0.1.36.exe',
      sha512: 'jzBH9x46iPivw2fHCVcLrIcdIC5GXDSjK//0GMf5+UhOq8btiUUfT+Vs8P+OKzJF0K9AOmPv2hmmMVymaKI2EQ==',
      releaseDate: '2026-10-01T09:10:44.092Z',
    });
    expect(parseUpdateFeed(CLOCK.replace(/\n/g, '\r\n')).files[0].size).toBe(85801027);
  });

  it('refuses a broken or hostile feed', () => {
    expect(code(() => parseUpdateFeed(FINTEREST.replace('version: 0.1.36', 'version: latest')))).toBe('ERR_FEED_VERSION');
    expect(code(() => parseUpdateFeed(FINTEREST.replace('size: 88626634', 'size: -1')))).toBe('ERR_FEED_FILE');
    expect(code(() => parseUpdateFeed(FINTEREST.replace('url: Nebula-Finterest-Setup-0.1.36.exe', 'url: ../../evil.exe')))).toBe('ERR_FEED_FILE');
    expect(code(() => parseUpdateFeed(FINTEREST.replace('url: Nebula-Finterest-Setup-0.1.36.exe', 'url: https://evil.example/x.exe')))).toBe('ERR_FEED_FILE');
    expect(code(() => parseUpdateFeed(FINTEREST.replace(/sha512: jz[^\n]+\n    size/, 'sha512: abc\n    size')))).toBe('ERR_FEED_FILE');
    expect(code(() => parseUpdateFeed('version: 1.0.0\nfiles:\n'))).toBe('ERR_FEED_NO_FILES');
    expect(code(() => parseUpdateFeed('version: 1.0.0\n{ "json": true }'))).toBe('ERR_FEED_SYNTAX');
    expect(code(() => parseUpdateFeed('x'.repeat(70_000)))).toBe('ERR_FEED_TOO_LARGE');
  });
});

describe('selectInstaller', () => {
  const feed = parseUpdateFeed(FINTEREST);

  it('picks the feed file that is a release asset', () => {
    expect(selectInstaller(feed, ['latest.yml', 'Nebula-Finterest-Setup-0.1.36.exe', 'Nebula-Finterest-Setup-0.1.36.exe.blockmap']).size).toBe(88626634);
  });

  it('refuses when the asset name and the feed disagree', () => {
    expect(code(() => selectInstaller(feed, ['latest.yml', 'Nebula Finterest Setup 0.1.36.exe']))).toBe('ERR_FEED_ASSET_MISSING');
  });

  it('refuses inconsistent top-level and file hashes', () => {
    const tampered = { ...feed, sha512: parseUpdateFeed(CLOCK).sha512 };
    expect(code(() => selectInstaller(tampered, ['Nebula-Finterest-Setup-0.1.36.exe']))).toBe('ERR_FEED_INCONSISTENT');
  });
});

describe('isSafeFileName', () => {
  it.each(['Nebula Finterest Setup 0.1.0.exe', 'NebulaClock-Setup-1.1.3-x64.exe', 'latest.yml'])('accepts %s', (name) => {
    expect(isSafeFileName(name)).toBe(true);
  });
  it.each(['..', '../x.exe', 'a/b.exe', 'a\\b.exe', 'C:x.exe', '.hidden', '', 'x'.repeat(201)])('refuses %p', (name) => {
    expect(isSafeFileName(name)).toBe(false);
  });
});
