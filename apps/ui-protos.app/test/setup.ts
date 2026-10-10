// jsdom has no ResizeObserver; dockview needs one to exist, not to fire.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no scrollTo; assistant-ui's thread viewport auto-scroll calls it.
Element.prototype.scrollTo ??= () => {};
