export function unique<T>(
 values: Array<T | null | undefined | false | "">,
): T[] {
 return [...new Set(values.filter((v): v is T => Boolean(v)))];
}

export function chunk<T>(values: T[], size: number): T[][] {
 if (size < 1) throw new RangeError("chunk size must be >= 1");
 const out: T[][] = [];
 for (let i = 0; i < values.length; i += size) {
  out.push(values.slice(i, i + size));
 }
 return out;
}
