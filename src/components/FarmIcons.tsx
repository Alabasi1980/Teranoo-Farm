export function FarmCrestSvg({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="#fef3c7" stroke="#b45309" strokeWidth="3" />
      <circle cx="32" cy="32" r="24" fill="#fde68a" />
      {/* Sun rays */}
      <circle cx="32" cy="24" r="9" fill="#f59e0b" />
      {/* Rolling hills */}
      <path d="M8 40 Q24 28 38 38 T56 38 L56 50 Q32 58 8 50 Z" fill="#65a30d" />
      <path d="M12 44 Q32 34 52 44 L52 50 Q32 58 12 50 Z" fill="#4d7c0f" />
      {/* Wheat stalk */}
      <path d="M32 48 L32 18" stroke="#fef08a" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="28" cy="26" rx="3.2" ry="5" transform="rotate(-25 28 26)" fill="#facc15" stroke="#92400e" strokeWidth="1" />
      <ellipse cx="36" cy="26" rx="3.2" ry="5" transform="rotate(25 36 26)" fill="#facc15" stroke="#92400e" strokeWidth="1" />
      <ellipse cx="28" cy="34" rx="3.2" ry="5" transform="rotate(-25 28 34)" fill="#facc15" stroke="#92400e" strokeWidth="1" />
      <ellipse cx="36" cy="34" rx="3.2" ry="5" transform="rotate(25 36 34)" fill="#facc15" stroke="#92400e" strokeWidth="1" />
      <ellipse cx="32" cy="19" rx="3" ry="4.8" fill="#fef08a" stroke="#92400e" strokeWidth="1" />
    </svg>
  );
}

export function CoinSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#f59e0b" stroke="#78350f" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="7" fill="#fde047" />
      <rect x="10.8" y="7.5" width="2.4" height="9" rx="1" fill="#b45309" />
    </svg>
  );
}

export function WheatIconSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 21V6" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="8.5" cy="11" rx="2.4" ry="3.8" transform="rotate(-28 8.5 11)" fill="#facc15" stroke="#78350f" strokeWidth="1.2" />
      <ellipse cx="15.5" cy="11" rx="2.4" ry="3.8" transform="rotate(28 15.5 11)" fill="#facc15" stroke="#78350f" strokeWidth="1.2" />
      <ellipse cx="8.5" cy="16" rx="2.4" ry="3.8" transform="rotate(-28 8.5 16)" fill="#eab308" stroke="#78350f" strokeWidth="1.2" />
      <ellipse cx="15.5" cy="16" rx="2.4" ry="3.8" transform="rotate(28 15.5 16)" fill="#eab308" stroke="#78350f" strokeWidth="1.2" />
      <ellipse cx="12" cy="5.5" rx="2.3" ry="3.5" fill="#fef08a" stroke="#78350f" strokeWidth="1.2" />
    </svg>
  );
}

export function CarrotIconSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 7 C10 3, 7 3, 8 7 M12 7 C12 2, 12 2, 12 7 M12 7 C14 3, 17 3, 16 7" stroke="#15803d" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M8 8 Q12 6.5 16 8 L12.8 20.5 Q12 22 11.2 20.5 Z" fill="#f97316" stroke="#7c2d12" strokeWidth="1.5" />
      <path d="M10 12 L13.2 12 M10.6 15.5 L13 15.5" stroke="#fed7aa" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function WateringIconSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.5 C12 3.5 6 10.5 6 14.5 A6 6 0 0 0 18 14.5 C18 10.5 12 3.5 12 3.5 Z"
        fill="#38bdf8"
        stroke="#0c4a6e"
        strokeWidth="1.6"
      />
      <path d="M9.5 14.5 A2.5 2.5 0 0 0 12 17" stroke="#e0f2fe" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function HarvestIconSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M5 19 L11 13"
        stroke="#78350f"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M10 14 C11 7, 17 4, 20 6 C18 9, 14 11, 11.5 13.5 Z"
        fill="#fbbf24"
        stroke="#78350f"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
