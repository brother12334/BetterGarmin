/** A small rotation of real photos for the Today hero backdrop — bundled locally, no network fetch, no stock-photo API. */
export interface PhotoBackdrop {
  src: string
  alt: string
}

const PHOTOS: PhotoBackdrop[] = [
  { src: 'backgrounds/aurora.jpg', alt: 'Aurora over a frozen alpine lake' },
  { src: 'backgrounds/misty-forest.jpg', alt: 'Misty pine forest' },
  { src: 'backgrounds/foggy-valley.jpg', alt: 'Fog rolling through a mountain valley' },
  { src: 'backgrounds/matterhorn.jpg', alt: 'A snow-capped alpine peak' },
  { src: 'backgrounds/green-valley.jpg', alt: 'A green forested valley with a lake' },
  { src: 'backgrounds/misty-hilltop.jpg', alt: 'Hikers on a misty hilltop at sunrise' },
  { src: 'backgrounds/mountain-silhouette.jpg', alt: 'Silhouetted mountain ridges in fog' },
  { src: 'backgrounds/dolomites-lake.jpg', alt: 'Jagged peaks reflected in an alpine lake' },
]

/** Days since the Unix epoch, in the viewer's local calendar — stable all day, rolls over at local midnight. */
export function getDayIndex(): number {
  const now = new Date()
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor(localMidnight.getTime() / 86_400_000)
}

export function getTodayPhoto(dayIndex = getDayIndex()): PhotoBackdrop {
  const i = ((dayIndex % PHOTOS.length) + PHOTOS.length) % PHOTOS.length
  return PHOTOS[i]
}
