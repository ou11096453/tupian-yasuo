export const imageAccept = 'image/*,.avif,.jxl,.qoi,.wp2';

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg|avif|jxl|qoi|wp2|tiff?)$/i.test(file.name)
  );
}
