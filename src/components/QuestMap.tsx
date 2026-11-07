"use client";

// Retro RPG "world map" shown when a student opens a sprint (design ported from the Lovable project).
// Adapted: progress is shown as stars earned (first-try + comebacks) instead of hearts lost on wrong
// answers, so nothing is taken away for mistakes.

interface Props {
  nickname: string;
  title: string;
  subject: "reading" | "math";
  initialPoints: number;
  comebackPoints: number;
  answered: number;
  total: number;
  done: boolean;
  onStart: () => void;
}

const STAGE_NAMES = {
  math: ["Fraction Forest", "Denominator Dragon", "Forgotten Shards", "Golem of Unequal Parts"],
  reading: ["Story Grove", "Inference Imp", "Lost Library", "Theme Titan"],
};

function Star({ tone }: { tone: "gold" | "pink" }) {
  const c = tone === "gold" ? "#F3B60B" : "#FF36BE";
  return (
    <svg viewBox="0 0 7 7" className="h-4 w-4" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M3 0h1v2h3v1H6v1H5v1h1v2H5V6H2v1H1V5h1V4H1V3H0V2h3z" fill={c} />
    </svg>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 8 9" className="h-8 w-7" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 0h4v1h1v3H6V1H2v3H1V1h1z" fill="#1C1D63" />
      <rect x="0" y="4" width="8" height="5" fill="#1C1D63" />
      <rect x="1" y="5" width="6" height="3" fill="#FEF6DE" />
      <rect x="3" y="6" width="2" height="1" fill="#1C1D63" />
    </svg>
  );
}

function Hero() {
  return (
    <svg viewBox="0 0 12 12" className="h-14 w-14 quest-bob" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="1" width="6" height="1" fill="#1C1D63" />
      <rect x="2" y="2" width="8" height="5" fill="#1C1D63" />
      <rect x="3" y="2" width="6" height="4" fill="#F18AB8" />
      <rect x="4" y="3" width="1" height="1" fill="#1C1D63" />
      <rect x="7" y="3" width="1" height="1" fill="#1C1D63" />
      <rect x="3" y="7" width="6" height="3" fill="#595AAF" />
      <rect x="1" y="7" width="2" height="2" fill="#FEF6DE" />
      <rect x="9" y="6" width="1" height="4" fill="#F3B60B" />
      <rect x="3" y="10" width="2" height="2" fill="#1C1D63" />
      <rect x="7" y="10" width="2" height="2" fill="#1C1D63" />
    </svg>
  );
}

function Tree() {
  return (
    <svg viewBox="0 0 10 10" className="h-12 w-12" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="0" width="6" height="2" fill="#D6F27A" />
      <rect x="1" y="2" width="8" height="3" fill="#9BD84A" />
      <rect x="0" y="5" width="10" height="2" fill="#5FB043" />
      <rect x="4" y="7" width="2" height="3" fill="#7A4A1A" />
    </svg>
  );
}

function Platform({ tone }: { tone: "gold" | "blue" | "red" }) {
  const c = { gold: ["#F3B60B", "#FF36BE"], blue: ["#595AAF", "#2527B9"], red: ["#D93A4A", "#8A1E2E"] }[tone];
  return (
    <svg viewBox="0 0 24 5" className="h-5 w-24 sm:w-28" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="0" width="20" height="3" fill={c[0]} />
      <rect x="0" y="1" width="24" height="2" fill={c[0]} />
      <rect x="2" y="3" width="20" height="2" fill={c[1]} />
    </svg>
  );
}

export function QuestMap({ nickname, title, subject, initialPoints, comebackPoints, answered, total, done, onStart }: Props) {
  const names = STAGE_NAMES[subject];
  const stages = 4;
  const current = Math.min(Math.floor((answered / Math.max(total, 1)) * stages), stages - 1);
  const points = initialPoints + comebackPoints;
  const xpMax = Math.max(total, 1) * 100;
  const level = Math.floor(points / 100) + 1;
  const firstTryStars = Math.round(initialPoints / 100);
  const comebackStars = Math.round(comebackPoints / 50);
  const pos = [
    { x: 12, y: 72 },
    { x: 37, y: 45 },
    { x: 62, y: 66 },
    { x: 87, y: 28 },
  ];

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* HUD */}
      <div className="pixel-hud flex flex-wrap items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center border-4 border-[#F1E4BC] bg-white" aria-hidden="true">
            <span className="block h-6 w-6 bg-[#F18AB8] outline outline-4 outline-[#1C1D63]" />
          </div>
          <div>
            <p className="pixel-font text-xs">{nickname}</p>
            <p className="pixel-font text-[10px] text-[#F3B60B] mt-1">LV {level}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1" title="First-try stars">
            <Star tone="gold" /> <span className="pixel-font text-[10px]">×{firstTryStars}</span>
            <span className="sr-only">first-try correct answers</span>
          </span>
          <span className="inline-flex items-center gap-1" title="Comeback stars">
            <Star tone="pink" /> <span className="pixel-font text-[10px]">×{comebackStars}</span>
            <span className="sr-only">comebacks</span>
          </span>
        </div>
        <div className="flex flex-1 min-w-48 items-center gap-3">
          <span className="pixel-font text-[10px]" aria-hidden="true">
            XP
          </span>
          <div
            className="h-4 flex-1 border-2 border-[#FEF6DE] bg-[#1A1C2C]"
            role="progressbar"
            aria-label="Points earned"
            aria-valuemin={0}
            aria-valuemax={xpMax}
            aria-valuenow={points}
          >
            <div className="h-full bg-[#FF36BE]" style={{ width: `${Math.min(100, (100 * points) / xpMax)}%` }} />
          </div>
          <span className="pixel-font text-[10px] whitespace-nowrap">
            {points} / {xpMax}
          </span>
        </div>
        <span className="pixel-font text-[10px] text-[#F3B60B]">
          {answered}/{total} done
        </span>
      </div>

      {/* Map (decorative; the summary below is read by screen readers) */}
      <p className="sr-only">
        Quest map: {answered} of {total} questions answered{done ? ", quest complete" : ""}.
      </p>
      <div className="relative h-80 sm:h-96" aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {pos.slice(0, stages - 1).map((p, i) => {
            const n = pos[i + 1];
            return (
              <line
                key={i}
                x1={p.x}
                y1={p.y}
                x2={n.x}
                y2={n.y}
                stroke={i < current || done ? "#F3B60B" : "#1C1D63"}
                strokeDasharray="0.1 3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ strokeWidth: 10 }}
              />
            );
          })}
        </svg>
        {pos.map((p, i) => {
          const isCurrent = i === current && !done;
          const cleared = i < current || done;
          return (
            <div key={i} className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              {i === 0 && !isCurrent && <Tree />}
              {isCurrent && <Hero />}
              {!cleared && !isCurrent && <Lock />}
              {cleared && i !== 0 && <span className="pixel-font text-[#F3B60B] text-lg">★</span>}
              <Platform tone={cleared || isCurrent ? "gold" : i === stages - 1 ? "red" : "blue"} />
              <p className="pixel-font mt-2 max-w-24 sm:max-w-28 text-center text-[8px] leading-relaxed text-[#FEF6DE] [text-shadow:2px_2px_0_#1A1C2C]">{names[i]}</p>
            </div>
          );
        })}
      </div>

      {/* Quest card */}
      <div className="pixel-box flex flex-wrap items-center gap-4 px-6 py-5">
        <div className="flex-1 min-w-60">
          <p className="pixel-font text-xs text-[#1C1D63]">{done ? "Quest complete" : "Today's quest"}</p>
          <h1 className="mt-2 text-[#B0137C]" style={{ fontSize: "clamp(1rem,2.4vw,1.5rem)" }}>
            {title}
          </h1>
          <p className="mt-2 text-sm">
            {subject === "math" ? "Math" : "Reading"} · {total} questions · no timer — go at your own pace
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="pixel-font border-4 border-[#1C1D63] bg-[#FF36BE] px-6 py-4 text-sm leading-relaxed text-[#1A1C2C] shadow-[0_6px_0_#2527B9] hover:translate-y-0.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#F3B60B]"
        >
          {done ? "View results ▸" : answered > 0 ? "Continue quest ▸" : "Start quest ▸"}
        </button>
      </div>
    </div>
  );
}
