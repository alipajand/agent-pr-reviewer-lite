/**
 * Linear-time glob matching.
 *
 * Patterns come from the config file of the repository under review, so they
 * must not be able to stall a CI run. The regex produced by `globToRegex`
 * backtracks exponentially on patterns such as `*a*a*a*a*b`; this matcher uses
 * dynamic programming instead and runs in O(pattern tokens × path length).
 *
 * Semantics match `globToRegex`:
 *   *    any run of characters except `/`
 *   **   any run of characters, including `/`
 *   ** / zero or more complete `segment/` prefixes (written without the space)
 *   / ** nothing, or `/` followed by anything
 * Everything else is literal. The whole path must match.
 */

type Token =
  | { kind: "literal"; value: string }
  | { kind: "star" }
  | { kind: "globstar" }
  | { kind: "globstarDir" }
  | { kind: "slashGlobstar" };

type Piece = string | Token;

// Mirrors the replacement order in globToRegex: `**/`, then `/**`, then `**`, then `*`.
const SPLITTERS: Array<[string, Token]> = [
  ["**/", { kind: "globstarDir" }],
  ["/**", { kind: "slashGlobstar" }],
  ["**", { kind: "globstar" }],
  ["*", { kind: "star" }],
];

function tokenize(pattern: string): Token[] {
  let pieces: Piece[] = [pattern];

  for (const [separator, token] of SPLITTERS) {
    pieces = pieces.flatMap((piece) => {
      if (typeof piece !== "string") return [piece];
      const parts = piece.split(separator);
      return parts.flatMap((part, i) => (i === 0 ? [part] : [token, part]));
    });
  }

  return pieces
    .filter((piece) => piece !== "")
    .map((piece) =>
      typeof piece === "string" ? { kind: "literal", value: piece } : piece,
    );
}

function matchTokens(tokens: Token[], text: string): boolean {
  const n = text.length;
  // Each row holds two states per text position: index 2*i is "at a token
  // boundary", 2*i+1 is "partway through a multi-step token".
  let next = new Uint8Array((n + 1) * 2);
  next[n * 2] = 1;

  for (let k = tokens.length - 1; k >= 0; k--) {
    const token = tokens[k];
    const cur = new Uint8Array((n + 1) * 2);

    for (let i = n; i >= 0; i--) {
      const hasChar = i < n;
      const isSlash = hasChar && text[i] === "/";
      const done = next[i * 2] === 1;

      switch (token.kind) {
        case "literal":
          cur[i * 2] =
            text.startsWith(token.value, i) &&
            next[(i + token.value.length) * 2] === 1
              ? 1
              : 0;
          break;
        case "star":
          cur[i * 2] =
            done || (hasChar && !isSlash && cur[(i + 1) * 2] === 1) ? 1 : 0;
          break;
        case "globstar":
          cur[i * 2] = done || (hasChar && cur[(i + 1) * 2] === 1) ? 1 : 0;
          break;
        case "globstarDir":
          // Inside a segment: keep consuming non-slash characters, or close it with `/`.
          cur[i * 2 + 1] =
            hasChar &&
            ((!isSlash && cur[(i + 1) * 2 + 1] === 1) ||
              (isSlash && cur[(i + 1) * 2] === 1))
              ? 1
              : 0;
          // At a boundary: stop here, or start a new (non-empty) segment.
          cur[i * 2] =
            done || (hasChar && !isSlash && cur[(i + 1) * 2 + 1] === 1) ? 1 : 0;
          break;
        case "slashGlobstar":
          // After the `/`: consume anything, then continue.
          cur[i * 2 + 1] =
            done || (hasChar && cur[(i + 1) * 2 + 1] === 1) ? 1 : 0;
          cur[i * 2] = done || (isSlash && cur[(i + 1) * 2 + 1] === 1) ? 1 : 0;
          break;
      }
    }

    next = cur;
  }

  return next[0] === 1;
}

/** Compile a glob pattern into a reusable, linear-time predicate. */
export function compileGlob(pattern: string): (path: string) => boolean {
  const tokens = tokenize(pattern);
  return (path) => matchTokens(tokens, path);
}

export function globMatch(pattern: string, path: string): boolean {
  return compileGlob(pattern)(path);
}
