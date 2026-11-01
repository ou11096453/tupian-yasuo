import { defaultProcessorState, encoderMap } from '../feature-meta';
import type { EncoderState, ProcessorState } from '../feature-meta';

export interface SideSettings {
  processorState: ProcessorState;
  encoderState?: EncoderState;
}

export function storedSettings(index: 0 | 1): string | null {
  try {
    return localStorage.getItem(
      index === 0 ? 'leftSideSettings' : 'rightSideSettings',
    );
  } catch {
    return null;
  }
}

function validShape(value: any, defaults: any): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(defaults).every(([key, fallback]) => {
    const item = value[key];
    if (fallback && typeof fallback === 'object')
      return validShape(item, fallback);
    return (
      typeof item === typeof fallback &&
      (typeof item !== 'number' || Number.isFinite(item))
    );
  });
}

export function readSavedSettings(index: 0 | 1): SideSettings | undefined {
  try {
    const raw = storedSettings(index);
    if (!raw) return;
    const settings = JSON.parse(raw).latestSettings;
    if (
      !settings ||
      !validShape(settings.processorState, defaultProcessorState)
    )
      return;
    const encoder = settings.encoderState;
    if (encoder) {
      if (!Object.prototype.hasOwnProperty.call(encoderMap, encoder.type))
        return;
      if (
        !validShape(
          encoder.options,
          encoderMap[encoder.type as keyof typeof encoderMap].meta
            .defaultOptions,
        )
      )
        return;
    }
    return {
      processorState: settings.processorState,
      encoderState: encoder || undefined,
    };
  } catch {
    return;
  }
}

export function saveSettings(index: 0 | 1, settings: SideSettings): boolean {
  try {
    const key = index === 0 ? 'leftSideSettings' : 'rightSideSettings';
    localStorage.setItem(key, JSON.stringify({ latestSettings: settings }));
    window.dispatchEvent(new CustomEvent(key));
    return true;
  } catch {
    return false;
  }
}
