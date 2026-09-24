process.env.RECAP_GIF_ONLY='1';
process.env.RECAP_COMPILED='1';
await import('./session-recap-browser-regression.mjs');
