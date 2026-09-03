import { h, Component } from 'preact';
import * as style from './style.css';
import 'add-css:./style.css';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import prettyBytes from '../Compress/Results/pretty-bytes';

interface Props {
  files: File[];
  showSnack: SnackBarElement['showSnackbar'];
  onBack: () => void;
}

interface BatchItem {
  file: File;
  compressed?: File;
  processing: boolean;
  error?: string;
  downloadUrl?: string;
}

type OutputFormat = 'image/jpeg' | 'image/webp' | 'image/png';

interface State {
  format: OutputFormat;
  quality: number;
  maxWidth: number;
  useResize: boolean;
  items: BatchItem[];
  processing: boolean;
  done: boolean;
  showSettings: boolean;
}

const formatNames: Record<OutputFormat, string> = {
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/png': 'PNG',
};

const formatExts: Record<OutputFormat, string> = {
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/png': '.png',
};

export default class Batch extends Component<Props, State> {
  state: State = {
    format: 'image/jpeg',
    quality: 75,
    maxWidth: 1920,
    useResize: false,
    items: this.props.files.map((file) => ({
      file,
      processing: false,
    })),
    processing: false,
    done: false,
    showSettings: false,
  };

  private async compressFile(
    file: File,
    format: OutputFormat,
    quality: number,
    maxWidth: number,
    useResize: boolean,
  ): Promise<File | undefined> {
    const bitmap = await createImageBitmap(file);
    let drawW = bitmap.width;
    let drawH = bitmap.height;

    if (useResize && drawW > maxWidth) {
      const ratio = maxWidth / drawW;
      drawW = maxWidth;
      drawH = Math.round(bitmap.height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布上下文');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, drawW, drawH);
    bitmap.close();

    return new Promise<File>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('压缩失败'));
            return;
          }
          const ext = formatExts[format];
          const name = file.name.replace(/\.[^.]+$/, '') + ext;
          resolve(new File([blob], name, { type: format }));
        },
        format,
        format === 'image/png' ? undefined : quality / 100,
      );
    });
  }

  private onFormatChange = (event: Event) => {
    this.setState({ format: (event.target as HTMLSelectElement).value as OutputFormat });
  };

  private onQualityChange = (event: Event) => {
    this.setState({ quality: (event.target as HTMLInputElement).valueAsNumber });
  };

  private onMaxWidthChange = (event: Event) => {
    this.setState({ maxWidth: (event.target as HTMLInputElement).valueAsNumber || 1920 });
  };

  private onResizeToggle = () => {
    this.setState({ useResize: !this.state.useResize });
  };

  private toggleSettings = () => {
    this.setState({ showSettings: !this.state.showSettings });
  };

  private onCompressAll = async () => {
    this.setState({ processing: true });
    const { format, quality, maxWidth, useResize, items } = this.state;
    const newItems = [...items];

    for (let i = 0; i < newItems.length; i++) {
      newItems[i] = { ...newItems[i], processing: true };
      this.setState({ items: [...newItems] });
      try {
        const compressed = await this.compressFile(
          newItems[i].file, format, quality, maxWidth, useResize,
        );
        if (newItems[i].downloadUrl) URL.revokeObjectURL(newItems[i].downloadUrl!);
        newItems[i] = {
          ...newItems[i],
          compressed,
          processing: false,
          downloadUrl: URL.createObjectURL(compressed),
        };
      } catch (err) {
        newItems[i] = {
          ...newItems[i],
          processing: false,
          error: err instanceof Error ? err.message : '处理失败',
        };
      }
      this.setState({ items: [...newItems] });
    }

    const successCount = newItems.filter((i) => i.compressed).length;
    this.props.showSnack(`批量压缩完成：成功 ${successCount}/${newItems.length} 张`);
    this.setState({ processing: false, done: true });
  };

  private onDownloadAll = () => {
    const { items } = this.state;
    items.forEach((item, i) => {
      if (!item.compressed || !item.downloadUrl) return;
      const link = document.createElement('a');
      link.href = item.downloadUrl;
      link.download = item.compressed.name;
      setTimeout(() => link.click(), i * 300);
    });
  };

  render(
    {}: Props,
    { format, quality, maxWidth, useResize, items, processing, done, showSettings }: State,
  ) {
    const totalOriginal = items.reduce((sum, i) => sum + i.file.size, 0);
    const totalCompressed = items.reduce(
      (sum, i) => sum + (i.compressed?.size ?? 0),
      0,
    );
    const percent =
      totalOriginal > 0 && totalCompressed > 0
        ? Math.round((totalCompressed / totalOriginal) * 100)
        : 0;
    const qualityDisabled = format === 'image/png';

    return (
      <div class={style.batch}>
        <div class={style.header}>
          <button class={style.backBtn} onClick={this.props.onBack}>
            ← 返回
          </button>
          <h2>批量压缩</h2>
          <span class={style.count}>{items.length} 张图片</span>
          <button class={style.settingsToggle} onClick={this.toggleSettings}>
            {showSettings ? '收起设置 ▲' : '压缩设置 ▼'}
          </button>
        </div>

        {showSettings && (
          <div class={style.controls}>
            <div class={style.settingsGrid}>
              <label class={style.settingItem}>
                <span class={style.settingLabel}>输出格式</span>
                <select
                  class={style.select}
                  value={format}
                  onChange={this.onFormatChange}
                  disabled={processing}
                >
                  <option value="image/jpeg">JPEG（体积小）</option>
                  <option value="image/webp">WebP（更小）</option>
                  <option value="image/png">PNG（无损）</option>
                </select>
              </label>

              <label class={`${style.settingItem} ${qualityDisabled ? style.disabled : ''}`}>
                <span class={style.settingLabel}>
                  压缩质量: <strong>{quality}%</strong>
                </span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={quality}
                  onInput={this.onQualityChange}
                  disabled={processing || qualityDisabled}
                />
              </label>

              <div class={style.settingItem}>
                <label class={style.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={useResize}
                    onChange={this.onResizeToggle}
                    disabled={processing}
                  />
                  <span class={style.settingLabel}>限制最大宽度</span>
                </label>
                {useResize && (
                  <div class={style.resizeInput}>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      step="10"
                      value={maxWidth}
                      onInput={this.onMaxWidthChange}
                      disabled={processing}
                      class={style.numberInput}
                    />
                    <span class={style.unit}>px</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div class={style.actionBar}>
          <button
            class={style.compressBtn}
            onClick={this.onCompressAll}
            disabled={processing || items.length === 0}
          >
            {processing ? '压缩中...' : done ? '重新压缩' : '开始压缩'}
          </button>
          {done && (
            <button
              class={style.downloadAllBtn}
              onClick={this.onDownloadAll}
              disabled={processing}
            >
              全部下载
            </button>
          )}
        </div>

        {totalCompressed > 0 && (
          <div class={style.summary}>
            {prettyBytes(totalOriginal).value}{prettyBytes(totalOriginal).unit}
            → {prettyBytes(totalCompressed).value}{prettyBytes(totalCompressed).unit}
            <span class={style.summaryPct}>（节省 {100 - percent}%）</span>
          </div>
        )}

        <ul class={style.itemList}>
          {items.map((item, i) => {
            const orig = prettyBytes(item.file.size);
            const comp = item.compressed && prettyBytes(item.compressed.size);
            const ratio =
              item.compressed && item.file.size > 0
                ? Math.round((item.compressed.size / item.file.size) * 100)
                : null;
            return (
              <li key={i} class={style.item}>
                <img
                  class={style.thumb}
                  src={URL.createObjectURL(item.file)}
                  alt=""
                />
                <div class={style.info}>
                  <div class={style.name}>{item.file.name}</div>
                  <div class={style.sizes}>
                    {comp ? (
                      <span>
                        {orig.value}{orig.unit} → {comp.value}{comp.unit}
                        {ratio !== null && ratio < 100 && (
                          <span class={style.saved}> ({ratio}%)</span>
                        )}
                      </span>
                    ) : (
                      <span>
                        {orig.value}{orig.unit}
                      </span>
                    )}
                  </div>
                </div>
                <div class={style.action}>
                  {item.processing && <span class={style.spinner}>⏳</span>}
                  {item.error && <span class={style.error}>{item.error}</span>}
                  {item.compressed && (
                    <a
                      class={style.downloadLink}
                      href={item.downloadUrl}
                      download={item.compressed.name}
                    >
                      下载
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}

