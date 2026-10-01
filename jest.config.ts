import type { Config } from 'jest';

const moduleNameMapper = {
  '\.(css|less|scss)$': 'identity-obj-proxy',
  '\.(svg|png)$': '<rootDir>/tests/file-stub.ts',
  '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
  '^@nebula/design/react$': '<rootDir>/packages/nebula-design/src/react.ts',
  '^@nebula/design$': '<rootDir>/packages/nebula-design/src/index.ts',
};

const config: Config = {
  preset: 'ts-jest',
  // jsdom for the renderer and the pure modules; main-process tests opt into `node` with a
  // `@jest-environment node` docblock, as in Nebula Finterest.
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/install/', '/release/'],
  moduleNameMapper,
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true, isolatedModules: true } }],
  },
};

export default config;
