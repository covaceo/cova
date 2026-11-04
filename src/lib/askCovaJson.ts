// JSON.parse alone silently accepts duplicate properties (including escaped keys).
export function uniqueJson(text: string): any {
  const parsed = JSON.parse(text);
  const tokens = text.match(/"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || [];
  let cursor = 0;
  const value = (depth: number) => {
    if (depth > 32) throw Error('JSON depth');
    const token = tokens[cursor++];
    if (token === '{') {
      const seen = new Set<string>();
      while (tokens[cursor] !== '}') {
        const key = JSON.parse(tokens[cursor++]);
        if (seen.has(key)) throw Error('Duplicate JSON property');
        seen.add(key); cursor++; value(depth + 1);
        if (tokens[cursor] === ',') cursor++; else break;
      }
      cursor++;
    } else if (token === '[') {
      while (tokens[cursor] !== ']') { value(depth + 1); if (tokens[cursor] === ',') cursor++; else break; }
      cursor++;
    }
  };
  value(0);
  return parsed;
}
