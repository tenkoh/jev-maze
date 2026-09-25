export type RobotPose = "idle" | "moving" | "thinking" | "confused" | "happy" | "stopped" | "bump";

const INK = "#1f2a37";
const SHELL = "#9fd0f7";
/** Outlined light-blue body part (arms, legs). */
const part = { fill: SHELL, stroke: INK, strokeWidth: 2 } as const;

/** The player character, drawn in a 100x100 cell box. */
export function Robot({ pose }: { pose: RobotPose }) {
  const happy = pose === "happy";
  return (
    <g className={`robot robot--${pose}`}>
      <ellipse cx="50" cy="90" rx="17" ry="4" fill="rgba(31,42,55,0.14)" />
      <g className="robot__body">
        {/* antenna */}
        <line x1="50" y1="15" x2="50" y2="24" stroke={INK} strokeWidth="2.5" />
        <circle cx="50" cy="13" r="3.5" fill="#5aa9ec" stroke={INK} strokeWidth="2" />
        {/* arms */}
        {happy ? (
          <>
            {["M38 68 L28 56", "M62 68 L72 56"].map((d) => (
              <g key={d} strokeLinecap="round">
                <path d={d} stroke={INK} strokeWidth="5" />
                <path d={d} stroke={SHELL} strokeWidth="2.6" />
              </g>
            ))}
          </>
        ) : (
          <>
            <rect x="32" y="64" width="6" height="12" rx="3" {...part} />
            <rect x="62" y="64" width="6" height="12" rx="3" {...part} />
          </>
        )}
        {/* legs + torso */}
        <rect x="42" y="78" width="6" height="8" rx="2" {...part} />
        <rect x="52" y="78" width="6" height="8" rx="2" {...part} />
        <rect
          x="38"
          y="60"
          width="24"
          height="21"
          rx="7"
          fill={SHELL}
          stroke={INK}
          strokeWidth="2.5"
        />
        <rect x="46" y="66" width="8" height="5" rx="2" fill="#e8f5ff" />
        {/* head */}
        <rect
          x="26"
          y="23"
          width="48"
          height="40"
          rx="19"
          fill="#fff"
          stroke={INK}
          strokeWidth="2.5"
        />
        <rect
          x="22"
          y="38"
          width="5"
          height="10"
          rx="2"
          fill="#d6e2ec"
          stroke={INK}
          strokeWidth="1.8"
        />
        <rect
          x="73"
          y="38"
          width="5"
          height="10"
          rx="2"
          fill="#d6e2ec"
          stroke={INK}
          strokeWidth="1.8"
        />
        <rect x="33" y="32" width="34" height="21" rx="10" fill={INK} />
        {happy ? (
          <>
            <path
              d="M39 45 q4 -6 8 0"
              stroke="#8fd0ff"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M53 45 q4 -6 8 0"
              stroke="#8fd0ff"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <rect x="40" y="38" width="6" height="9" rx="3" fill="#8fd0ff" />
            <rect x="54" y="38" width="6" height="9" rx="3" fill="#8fd0ff" />
          </>
        )}
      </g>
      {pose === "thinking" && (
        <g className="robot__bubble">
          <circle cx="76" cy="16" r="3" fill="#fff" stroke={INK} strokeWidth="1.8" />
          <rect
            x="78"
            y="-14"
            width="42"
            height="26"
            rx="13"
            fill="#fff"
            stroke={INK}
            strokeWidth="2.2"
          />
          <circle className="dot dot--1" cx="90" cy="-1" r="2.6" fill={INK} />
          <circle className="dot dot--2" cx="99" cy="-1" r="2.6" fill={INK} />
          <circle className="dot dot--3" cx="108" cy="-1" r="2.6" fill={INK} />
        </g>
      )}
      {pose === "confused" && (
        <text className="robot__question" x="78" y="20" fontSize="34" fontWeight="800" fill={INK}>
          ?
        </text>
      )}
      {happy && (
        <g className="robot__sparkles" fill="#f6c945">
          <rect x="8" y="36" width="10" height="4" rx="2" transform="rotate(-35 13 38)" />
          <rect x="14" y="20" width="4" height="10" rx="2" transform="rotate(-25 16 25)" />
          <rect x="82" y="36" width="10" height="4" rx="2" transform="rotate(35 87 38)" />
          <rect x="82" y="20" width="4" height="10" rx="2" transform="rotate(25 84 25)" />
        </g>
      )}
    </g>
  );
}
