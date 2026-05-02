const defaultItems = [
  'capture',
  'clarity',
  'focus',
  'schedule',
  'balance',
  'review',
  'progress',
  'momentum',
  'planning',
  'rhythm',
]

export function MarqueeTicker({ items = defaultItems }: { items?: string[] }) {
  const track = [...items, ...items]

  return (
    <div className="hero-marquee" aria-label="Workspace rhythm ticker">
      <div className="hero-marquee-track">
        {track.map((item, index) => (
          <span key={`${item}-${index}`} className="hero-marquee-chip" aria-hidden={index >= items.length}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
