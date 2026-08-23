interface IconProps { size?: number; }
const S = (size = 18) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const IconOverview = ({ size }: IconProps) => (
  <svg {...S(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconDisputes = ({ size }: IconProps) => (
  <svg {...S(size)}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
);
export const IconEvidence = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M9 13l2 2 4-4" /></svg>
);
export const IconActivity = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
);
export const IconSettings = ({ size }: IconProps) => (
  <svg {...S(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14.1 1.7 1.7 0 0 0 1.9 13V11a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 7 12.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 12 17.9h.1A1.7 1.7 0 0 0 13 19.4V21" /></svg>
);
export const IconHelp = ({ size }: IconProps) => (
  <svg {...S(size)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></svg>
);
export const IconBell = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const IconSearch = ({ size }: IconProps) => (
  <svg {...S(size)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
export const IconFilter = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>
);
export const IconSort = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M8 4v16M8 4l-3 3M8 4l3 3M16 20V4M16 20l3-3M16 20l-3-3" /></svg>
);
export const IconWarn = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M12 3l9 16H3z" /><path d="M12 9v5M12 17h.01" /></svg>
);
export const IconCheck = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M20 6L9 17l-5-5" /></svg>
);
export const IconChevron = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconArrowRight = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconShield = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>
);
export const IconInbox = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M3 12h5l2 3h4l2-3h5" /><path d="M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></svg>
);
export const IconUpload = ({ size }: IconProps) => (
  <svg {...S(size)}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></svg>
);
