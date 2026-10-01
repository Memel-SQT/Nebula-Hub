import '@testing-library/jest-dom';

// jsdom has no canvas: the animated backgrounds simply draw nothing in tests. (Absent in the
// `node` environment of the main-process tests.)
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
