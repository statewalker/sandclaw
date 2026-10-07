// jsdom has no ResizeObserver; dockview needs one to exist, not to fire.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
