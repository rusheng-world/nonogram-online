interface IconProps {
  size?: number
  className?: string
}

const base = (size: number, className: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
})

export const IconUndo = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 9h11a5 5 0 0 1 0 10H9" />
    <path d="M8 5 4 9l4 4" />
  </svg>
)

export const IconRedo = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 9H9a5 5 0 0 0 0 10h6" />
    <path d="m16 5 4 4-4 4" />
  </svg>
)

export const IconBulb = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .9 1.6l.1.6h5.2l.1-.6c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z" />
  </svg>
)

export const IconCheck = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m5 13 4 4L19 7" />
  </svg>
)

export const IconPause = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M9 5v14M15 5v14" />
  </svg>
)

export const IconPlay = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
)

export const IconRefresh = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5" />
    <path d="M4 4v5h5" />
    <path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5" />
    <path d="M20 20v-5h-5" />
  </svg>
)

export const IconSettings = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 14H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 2.6V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21.4 10H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)

export const IconBack = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const IconPencil = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 20h4l10-10-4-4L4 16z" />
    <path d="m14 6 4 4" />
  </svg>
)

export const IconEraser = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m6 14 6-6 6 6-4 4H10z" />
    <path d="M4 20h16" />
  </svg>
)

export const IconSquare = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
  </svg>
)

export const IconLine = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M5 19 19 5" />
  </svg>
)

export const IconBucket = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 10 12 4l7 7-6 6a2 2 0 0 1-2.8 0L6 12.8A2 2 0 0 1 6 10z" />
    <path d="M20 16c0 1.7-.9 3-2 3s-2-1.3-2-3 2-4 2-4 2 2.3 2 4z" />
  </svg>
)

export const IconTrash = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7l1 13h10l1-13" />
  </svg>
)

export const IconFlipH = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3v18" />
    <path d="M9 7 4 12l5 5z" />
    <path d="m15 7 5 5-5 5z" />
  </svg>
)

export const IconFlipV = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 12h18" />
    <path d="M7 9 12 4l5 5z" />
    <path d="m7 15 5 5 5-5z" />
  </svg>
)

export const IconRotate = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </svg>
)

export const IconX = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconGrid = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

export const IconHome = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9h12v-9" />
  </svg>
)

export const IconShare = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 4v11" />
    <path d="m8 8 4-4 4 4" />
    <path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" />
  </svg>
)

export const IconDownload = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 4v11" />
    <path d="m8 11 4 4 4-4" />
    <path d="M6 19h12" />
  </svg>
)

export const IconUpload = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 15V4" />
    <path d="m8 8 4-4 4 4" />
    <path d="M6 19h12" />
  </svg>
)

export const IconZoomIn = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5M11 9v4M9 11h4" />
  </svg>
)

export const IconZoomOut = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5M9 11h4" />
  </svg>
)

export const IconTrophy = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" />
    <path d="M12 13v4M9 20h6" />
  </svg>
)

export const IconCalendar = ({ size = 18, className = '' }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
)
