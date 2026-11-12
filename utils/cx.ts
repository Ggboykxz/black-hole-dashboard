/**
 * Class-name helpers used by the vendored BoardUI primitives.
 *
 * `cx` is a small `classnames`-style joiner: strings, numbers, arrays and
 * condition maps, with falsy entries dropped. It deliberately does not pull
 * `clsx`/`tailwind-merge` into the bundle — the primitives only need the
 * joining half, and the project's own components already write literal
 * class strings.
 *
 * `sortCx` is the registry helper BoardUI uses to keep a component's class
 * map in one place. Its public contract here is identity: the object shape
 * (including nested size/tone maps) is what callers index at runtime, so it
 * must survive untouched.
 */
type ClassDictionary = Record<string, boolean | null | undefined>;
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[]
  | ClassDictionary;

export function cx(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const visit = (value: ClassValue) => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === "object") {
      for (const [key, on] of Object.entries(value)) {
        if (on) out.push(key);
      }
    }
  };
  for (const input of inputs) visit(input);
  return out.join(" ");
}

/** Identity at runtime — the type carries the literal shape for indexing. */
export function sortCx<T extends Record<string, unknown>>(styles: T): T {
  return styles;
}
