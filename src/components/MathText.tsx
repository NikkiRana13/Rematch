import { Fragment } from "react";

const NAMES: Record<number, string> = { 2: "halves", 3: "thirds", 4: "fourths", 5: "fifths", 6: "sixths", 7: "sevenths", 8: "eighths", 9: "ninths", 10: "tenths" };
const SINGULAR: Record<number, string> = { 2: "half", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth" };

export function fractionLabel(n: number, d: number): string {
  const name = n === 1 ? SINGULAR[d] : NAMES[d];
  return name ? `${n} ${name}` : `${n} over ${d}`;
}

export function Frac({ n, d }: { n: number; d: number }) {
  return (
    <span role="math" aria-label={fractionLabel(n, d)} className="inline-flex flex-col items-center align-middle mx-0.5 leading-none text-[0.9em] font-semibold">
      <span aria-hidden="true" className="px-0.5">{n}</span>
      <span aria-hidden="true" className="w-full border-t-2 border-current" />
      <span aria-hidden="true" className="px-0.5">{d}</span>
    </span>
  );
}

/** Renders "3/4"-style fractions in plain text as stacked fractions with spoken labels. */
export function MathText({ text }: { text: string }) {
  const parts = text.split(/(\b\d+\s*\/\s*\d+\b)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^(\d+)\s*\/\s*(\d+)$/);
        return m ? <Frac key={i} n={Number(m[1])} d={Number(m[2])} /> : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
