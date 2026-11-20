/**
 * Turns any photo from the phone into a small square picture (the middle of the photo),
 * so it uploads in a moment and fits in the database. Returns a data address ("data:image/jpeg;base64,…").
 */
export async function squarePhoto(file: File, size = 320): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('not an image'))
      img.src = url
    })
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    if (side === 0) throw new Error('empty image')
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    // A white background, in case the picture has see-through parts.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size, size)
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
