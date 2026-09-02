// Web Worker: generates a procedural texture set off the main thread.
import { generateSet } from './textures.js';

self.onmessage = (e) => {
  const { id, name, n } = e.data;
  try {
    const r = generateSet(name, n);
    self.postMessage({ id, name, r }, [r.rgba.buffer, r.normal.buffer, r.orm.buffer]);
  } catch (err) {
    self.postMessage({ id, name, error: String(err && err.message || err) });
  }
};
