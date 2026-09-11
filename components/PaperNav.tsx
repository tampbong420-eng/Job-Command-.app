export default function PaperNav({
  paper,
  onPaper,
}: {
  paper: "jobs" | "estimates" | "timecards";
  onPaper: (paper: "jobs" | "estimates" | "timecards") => void;
}) {
  return (
    <div className="paper-nav" role="tablist" aria-label="Job paperwork">
      {(
        [
          ["jobs", "Cards"],
          ["estimates", "Estimates"],
          ["timecards", "Time cards"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={paper === id}
          className={paper === id ? "on" : ""}
          onClick={() => onPaper(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
