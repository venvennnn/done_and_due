export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="10" fill="#1258F5" />
      <path
        fill="#fff"
        d="M16 6.2c1.3 2.6 2.3 3.6 4.9 4.9-2.6 1.3-3.6 2.3-4.9 4.9-1.3-2.6-2.3-3.6-4.9-4.9 2.6-1.3 3.6-2.3 4.9-4.9Zm-6.2 8.4c.9 1.7 1.5 2.3 3.2 3.2-1.7.9-2.3 1.5-3.2 3.2-.9-1.7-1.5-2.3-3.2-3.2 1.7-.9 2.3-1.5 3.2-3.2Zm12.4 0c.9 1.7 1.5 2.3 3.2 3.2-1.7.9-2.3 1.5-3.2 3.2-.9-1.7-1.5-2.3-3.2-3.2 1.7-.9 2.3-1.5 3.2-3.2Z"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[#16244D]">
      <Mark />
      <span className="text-[17px] font-extrabold tracking-tight">Done & Due</span>
    </span>
  );
}
