// Generates the app icons in public/ from the Chai mascot drawing.
// Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const cup = `
  <path d="M150 96h10a22 22 0 0 1 0 44h-14" fill="none" stroke="#E2512F" stroke-width="12" stroke-linecap="round"/>
  <path d="M40 72h120v44a60 60 0 0 1-120 0z" fill="#FF6B4A"/>
  <rect x="34" y="64" width="132" height="16" rx="8" fill="#E2512F"/>
  <circle cx="80" cy="112" r="7" fill="#1F1B3A"/>
  <circle cx="120" cy="112" r="7" fill="#1F1B3A"/>
  <circle cx="82.5" cy="109.5" r="2.2" fill="#fff"/>
  <circle cx="122.5" cy="109.5" r="2.2" fill="#fff"/>
  <path d="M86 130q14 13 28 0" fill="none" stroke="#1F1B3A" stroke-width="5" stroke-linecap="round"/>
  <circle cx="66" cy="126" r="7" fill="#FFC53D" opacity="0.75"/>
  <circle cx="134" cy="126" r="7" fill="#FFC53D" opacity="0.75"/>
  <g fill="none" stroke="#FFC53D" stroke-width="7" stroke-linecap="round">
    <path d="M72 52c-8-10 8-16 0-28"/>
    <path d="M100 48c-8-10 8-16 0-28"/>
    <path d="M128 52c-8-10 8-16 0-28"/>
  </g>`

/** scale < 1 shrinks the mascot toward the centre (maskable icons need a safe margin). */
function icon({ scale, radius }) {
  const offset = (200 - 200 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="${radius}" fill="#FFF8F0"/>
  <g transform="translate(${offset} ${offset + 4}) scale(${scale})">${cup}</g>
</svg>`
}

await mkdir('public', { recursive: true })

const rounded = icon({ scale: 0.8, radius: 44 })
const square = icon({ scale: 0.8, radius: 0 })
const maskable = icon({ scale: 0.62, radius: 0 })

const png = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(`public/${file}`)

await writeFile('public/favicon.svg', rounded)
await png(rounded, 192, 'icon-192.png')
await png(rounded, 512, 'icon-512.png')
await png(maskable, 512, 'icon-maskable-512.png')
await png(square, 180, 'apple-touch-icon.png') // iOS rounds the corners itself

console.log('Icons written to public/')
