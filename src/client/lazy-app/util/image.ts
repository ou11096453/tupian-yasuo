import {
  abortable,
  assertSignal,
  blobToImg,
  blobToText,
  builtinDecode,
  canDecodeImageType,
  sniffMimeType,
} from './index';
import type WorkerBridge from '../worker-bridge';

export async function decodeImage(
  signal: AbortSignal,
  blob: Blob,
  workerBridge: WorkerBridge,
): Promise<ImageData> {
  assertSignal(signal);
  const mimeType = await abortable(signal, sniffMimeType(blob));
  const canDecode = await abortable(signal, canDecodeImageType(mimeType));
  try {
    if (!canDecode) {
      if (mimeType === 'image/avif')
        return await workerBridge.avifDecode(signal, blob);
      if (mimeType === 'image/webp')
        return await workerBridge.webpDecode(signal, blob);
      if (mimeType === 'image/jxl')
        return await workerBridge.jxlDecode(signal, blob);
      if (mimeType === 'image/webp2')
        return await workerBridge.wp2Decode(signal, blob);
      if (mimeType === 'image/qoi')
        return await workerBridge.qoiDecode(signal, blob);
    }
    return await builtinDecode(signal, blob);
  } catch (err) {
    assertSignal(signal);
    throw new Error('无法解码图片');
  }
}

export async function processSvg(
  signal: AbortSignal,
  blob: Blob,
): Promise<HTMLImageElement> {
  assertSignal(signal);
  const text = await abortable(signal, blobToText(blob));
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.localName !== 'svg' || doc.querySelector('parsererror'))
    throw new Error('SVG 文件无效');
  if (!svg.hasAttribute('width') || !svg.hasAttribute('height')) {
    const parts = (svg.getAttribute('viewBox') || '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      parts.length !== 4 ||
      !parts.every(Number.isFinite) ||
      parts[2] <= 0 ||
      parts[3] <= 0
    ) {
      throw new Error('SVG 缺少有效尺寸');
    }
    svg.setAttribute('width', String(parts[2]));
    svg.setAttribute('height', String(parts[3]));
  }
  return abortable(
    signal,
    blobToImg(
      new Blob([new XMLSerializer().serializeToString(doc)], {
        type: 'image/svg+xml',
      }),
    ),
  );
}
