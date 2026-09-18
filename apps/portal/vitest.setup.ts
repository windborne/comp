import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount what each test rendered. testing-library only does this on its own
// when vitest globals are enabled, which this config leaves off.
afterEach(cleanup);
