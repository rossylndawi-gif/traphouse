type P = { className?: string; size?: number };

export const MenuIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const CloseIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const BagIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 8h14l-1.2 12H6.2L5 8Z M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const SearchIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const ChevronIcon = ({ dir = "left", size = 12 }: P & { dir?: "left" | "right" }) => (
  <svg width={size * 0.67} height={size} viewBox="0 0 8 12" aria-hidden="true">
    <path d={dir === "left" ? "M7 1L2 6l5 5" : "M1 1l5 5-5 5"} fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const PinIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="10" r="2.5" fill="currentColor" />
  </svg>
);

export const WhatsAppIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5 0 1.5-.6 1.7-1.2s.2-1.1.1-1.2l-.4-.2Z"
    />
  </svg>
);
