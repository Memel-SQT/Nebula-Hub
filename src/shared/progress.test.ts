import { progressRatio, SpeedMeter } from './progress';

describe('speed meter', () => {
  it('waits for half a second of data', () => {
    const meter = new SpeedMeter();
    meter.sample(0, 0);
    meter.sample(1000, 200);
    expect(meter.bytesPerSecond()).toBeNull();
    expect(meter.etaSeconds(10_000)).toBeNull();
  });

  it('computes speed and time left', () => {
    const meter = new SpeedMeter();
    meter.sample(0, 0);
    meter.sample(1_000_000, 1000);
    expect(meter.bytesPerSecond()).toBe(1_000_000);
    expect(meter.etaSeconds(5_000_000)).toBe(4);
  });

  it('only looks at the recent window', () => {
    const meter = new SpeedMeter(2000);
    meter.sample(0, 0);
    meter.sample(10_000_000, 1000); // fast start
    meter.sample(10_100_000, 4000);
    meter.sample(10_200_000, 5000); // then slow
    // Reference = the last sample before the window (t = 1 s): the fast start is gone.
    expect(meter.bytesPerSecond()).toBe(50_000);
  });

  it('starts over after a reset (resumed download)', () => {
    const meter = new SpeedMeter();
    meter.sample(0, 0);
    meter.sample(1000, 1000);
    meter.reset();
    expect(meter.bytesPerSecond()).toBeNull();
  });
});

describe('progress ratio', () => {
  it('is clamped', () => {
    expect(progressRatio(50, 100)).toBe(0.5);
    expect(progressRatio(150, 100)).toBe(1);
    expect(progressRatio(10, 0)).toBe(0);
  });
});
