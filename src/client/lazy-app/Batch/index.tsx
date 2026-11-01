import { h, Component } from 'preact';
import * as style from './style.css';
import 'add-css:./style.css';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import { imageAccept, isImageFile } from 'shared/image-files';
import { AddIcon, Arrow, DownloadIcon, ExpandIcon, RemoveIcon } from '../icons';
import { encoderMap, EncoderType } from '../feature-meta';
import { assertSignal } from '../util';
import { decodeImage, processSvg } from '../util/image';
import {
  builtinResize,
  drawableToImageData,
  flattenAlpha,
} from '../util/canvas';
import WorkerBridge from '../worker-bridge';
import prettyBytes from '../Compress/Results/pretty-bytes';
import { createZip } from './zip';

interface Props {
  files: File[];
  showSnack: SnackBarElement['showSnackbar'];
  onBack: () => void;
}

interface BatchItem {
  id: number;
  file: File;
  previewUrl: string;
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
  packaging: boolean;
  archiveProgress: number;
  archiveUrl?: string;
  showSettings: boolean;
  cancelled: boolean;
}

const encoders: Record<OutputFormat, EncoderType> = {
  'image/jpeg': 'mozJPEG',
  'image/webp': 'webP',
  'image/png': 'oxiPNG',
};
const formatExts: Record<OutputFormat, string> = {
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/png': '.png',
};

function sizeLabel(size: number) {
  const pretty = prettyBytes(size);
  return `${pretty.value} ${pretty.unit}`;
}

export default class Batch extends Component<Props, State> {
  private nextId = 0;
  private controller = new AbortController();
  private mounted = true;
  private fileInput?: HTMLInputElement;
  private workerBridge = new WorkerBridge();

  componentDidMount() {
    import('../sw-bridge')
      .then(({ mainAppLoaded }) => mainAppLoaded())
      .catch(() => {});
  }

  state: State = {
    format: 'image/webp',
    quality: encoderMap.webP.meta.defaultOptions.quality,
    maxWidth: 1920,
    useResize: false,
    items: this.createItems(this.props.files),
    processing: false,
    packaging: false,
    archiveProgress: 0,
    showSettings: false,
    cancelled: false,
  };

  private createItems(files: File[]): BatchItem[] {
    return files.map((file) => ({
      id: this.nextId++,
      file,
      previewUrl: URL.createObjectURL(file),
      processing: false,
    }));
  }

  private releaseItems(items: BatchItem[]) {
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
    }
  }

  private invalidateArchive() {
    if (this.state.archiveUrl) URL.revokeObjectURL(this.state.archiveUrl);
  }

  componentWillReceiveProps(next: Props) {
    if (next.files === this.props.files) return;
    this.controller.abort();
    this.releaseItems(this.state.items);
    this.invalidateArchive();
    this.setState({
      items: this.createItems(next.files),
      processing: false,
      packaging: false,
      archiveUrl: undefined,
      cancelled: false,
    });
  }

  componentWillUnmount() {
    this.mounted = false;
    this.controller.abort();
    this.releaseItems(this.state.items);
    this.invalidateArchive();
  }

  private async compressFile(
    file: File,
    signal: AbortSignal,
    settings: State,
  ): Promise<File> {
    let data =
      file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
        ? drawableToImageData(await processSvg(signal, file))
        : await decodeImage(signal, file, this.workerBridge);
    assertSignal(signal);
    if (settings.useResize && data.width > settings.maxWidth) {
      const height = Math.max(
        1,
        Math.round((data.height * settings.maxWidth) / data.width),
      );
      data = builtinResize(
        data,
        0,
        0,
        data.width,
        data.height,
        settings.maxWidth,
        height,
        'high',
      );
    }
    if (settings.format === 'image/jpeg') data = flattenAlpha(data, '#ffffff');
    assertSignal(signal);
    const encoder = encoderMap[encoders[settings.format]];
    const options =
      settings.format === 'image/png'
        ? encoder.meta.defaultOptions
        : { ...encoder.meta.defaultOptions, quality: settings.quality };
    const output = await encoder.encode(
      signal,
      this.workerBridge,
      data,
      options as any,
    );
    assertSignal(signal);
    const name =
      (file.name.replace(/\.[^.]+$/, '') || 'image') +
      formatExts[settings.format];
    return new File([output], name, { type: encoder.meta.mimeType });
  }

  private onCompressAll = async () => {
    if (
      this.state.processing ||
      this.state.packaging ||
      !this.state.items.length
    )
      return;
    if (
      this.state.useResize &&
      (!Number.isInteger(this.state.maxWidth) ||
        this.state.maxWidth < 1 ||
        this.state.maxWidth > 10000)
    ) {
      this.props.showSnack('最大宽度应为 1 到 10000 的整数');
      return;
    }
    this.controller.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    const settings = this.state;
    this.invalidateArchive();
    let items = settings.items.map((item) => {
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
      return {
        ...item,
        compressed: undefined,
        downloadUrl: undefined,
        error: undefined,
        processing: false,
      } as BatchItem;
    });
    this.setState({
      items,
      processing: true,
      cancelled: false,
      archiveUrl: undefined,
    });
    for (let i = 0; i < items.length; i++) {
      if (signal.aborted || !this.mounted) return;
      items[i] = { ...items[i], processing: true };
      this.setState({ items: [...items] });
      try {
        const compressed = await this.compressFile(
          items[i].file,
          signal,
          settings,
        );
        assertSignal(signal);
        if (!this.mounted) return;
        items[i] = {
          ...items[i],
          compressed,
          processing: false,
          downloadUrl: URL.createObjectURL(compressed),
        };
      } catch (err) {
        if (signal.aborted || !this.mounted) return;
        items[i] = {
          ...items[i],
          processing: false,
          error: err instanceof Error ? err.message : '处理失败',
        };
      }
      this.setState({ items: [...items] });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (signal.aborted || !this.mounted) return;
    const success = items.filter((item) => item.compressed).length;
    this.setState({ processing: false });
    this.props.showSnack(`批量压缩完成：成功 ${success}/${items.length} 张`, {
      timeout: 5000,
    });
  };

  private onCancel = () => {
    this.controller.abort();
    this.setState({
      processing: false,
      packaging: false,
      cancelled: true,
      items: this.state.items.map((item) => ({ ...item, processing: false })),
    });
  };

  private onAddFiles = (event: Event) => {
    if (this.state.processing || this.state.packaging) return;
    const input = event.target as HTMLInputElement;
    const selected = Array.from(input.files || []);
    input.value = '';
    const files = selected.filter(isImageFile);
    if (files.length !== selected.length)
      this.props.showSnack('已跳过非图片文件');
    if (!files.length) return;
    this.invalidateArchive();
    this.setState({
      items: [...this.state.items, ...this.createItems(files)],
      archiveUrl: undefined,
      cancelled: false,
    });
  };

  private removeItem = (id: number) => {
    if (this.state.processing || this.state.packaging) return;
    const item = this.state.items.find((item) => item.id === id);
    if (!item) return;
    this.releaseItems([item]);
    this.invalidateArchive();
    this.setState({
      items: this.state.items.filter((item) => item.id !== id),
      archiveUrl: undefined,
    });
  };

  private prepareDownload = async () => {
    if (this.state.processing || this.state.packaging) return;
    const files = this.state.items.flatMap((item) =>
      item.compressed ? [item.compressed] : [],
    );
    if (!files.length) return;
    this.controller.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    this.setState({ packaging: true, archiveProgress: 0, cancelled: false });
    try {
      const archive = await createZip(files, signal, (archiveProgress) => {
        if (!signal.aborted && this.mounted) this.setState({ archiveProgress });
      });
      assertSignal(signal);
      if (!this.mounted) return;
      this.invalidateArchive();
      this.setState({
        archiveUrl: URL.createObjectURL(archive),
        packaging: false,
      });
    } catch (err) {
      if (signal.aborted || !this.mounted) return;
      this.setState({ packaging: false });
      this.props.showSnack(err instanceof Error ? err.message : '打包失败');
    }
  };

  render({ onBack }: Props, state: State) {
    const {
      items,
      format,
      quality,
      maxWidth,
      useResize,
      processing,
      packaging,
      showSettings,
      archiveUrl,
    } = state;
    const successes = items.filter((item) => item.compressed);
    const failures = items.filter((item) => item.error).length;
    const completed = successes.length + failures;
    const originalSize = successes.reduce(
      (sum, item) => sum + item.file.size,
      0,
    );
    const outputSize = successes.reduce(
      (sum, item) => sum + item.compressed!.size,
      0,
    );
    const saved = originalSize
      ? Math.round((1 - outputSize / originalSize) * 100)
      : 0;
    const busy = processing || packaging;
    return (
      <section class={style.batch}>
        <header class={style.header}>
          <button
            class={style.backBtn}
            onClick={onBack}
            title="返回"
            aria-label="返回"
          >
            <Arrow />
          </button>
          <h1>批量压缩</h1>
          <span class={style.count}>{items.length} 张</span>
          <button
            class={style.settingsToggle}
            onClick={() => this.setState({ showSettings: !showSettings })}
            aria-expanded={showSettings}
            aria-controls="batch-settings"
            title="压缩设置"
          >
            <ExpandIcon />
            <span class={style.buttonLabel}>设置</span>
          </button>
          <button
            class={style.addBtn}
            onClick={() => this.fileInput!.click()}
            disabled={busy}
            title="添加图片"
            aria-label="添加图片"
          >
            <AddIcon />
            <span class={style.buttonLabel}>添加图片</span>
          </button>
          <input
            class={style.hidden}
            type="file"
            multiple
            accept={imageAccept}
            ref={(input) => {
              this.fileInput = input || undefined;
            }}
            onChange={this.onAddFiles}
          />
        </header>
        <div class={style.workspace}>
          <aside
            id="batch-settings"
            class={`${style.controls} ${showSettings ? style.open : ''}`}
          >
            <h2>压缩设置</h2>
            <label class={style.settingItem}>
              <span>输出格式</span>
              <select
                value={format}
                onChange={(event) =>
                  this.setState({
                    format: (event.target as HTMLSelectElement)
                      .value as OutputFormat,
                  })
                }
                disabled={busy}
              >
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
                <option value="image/png">PNG</option>
              </select>
            </label>
            <label class={style.settingItem}>
              <span>
                质量 <strong>{quality}%</strong>
              </span>
              <input
                type="range"
                min="1"
                max="100"
                value={quality}
                disabled={busy || format === 'image/png'}
                onInput={(event) =>
                  this.setState({
                    quality: (event.target as HTMLInputElement).valueAsNumber,
                  })
                }
              />
            </label>
            <label class={style.toggleLabel}>
              <input
                type="checkbox"
                checked={useResize}
                disabled={busy}
                onChange={() => this.setState({ useResize: !useResize })}
              />
              限制最大宽度
            </label>
            {useResize && (
              <label class={style.settingItem}>
                <span>最大宽度 / px</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={maxWidth}
                  disabled={busy}
                  inputMode="numeric"
                  onInput={(event) =>
                    this.setState({
                      maxWidth: (event.target as HTMLInputElement)
                        .valueAsNumber,
                    })
                  }
                />
              </label>
            )}
          </aside>
          <main class={style.content}>
            <div class={style.summary} role="status" aria-live="polite">
              <span>
                {processing
                  ? `正在处理 ${Math.min(completed + 1, items.length)}/${
                      items.length
                    }`
                  : state.cancelled
                  ? '已取消'
                  : `已完成 ${completed}/${items.length}`}
                {failures > 0 ? `，失败 ${failures} 张` : ''}
              </span>
              {successes.length > 0 && (
                <strong>
                  {sizeLabel(originalSize)} → {sizeLabel(outputSize)}
                  <span class={saved >= 0 ? style.saved : style.growth}>
                    {saved >= 0 ? `节省 ${saved}%` : `增大 ${-saved}%`}
                  </span>
                </strong>
              )}
            </div>
            <progress
              class={style.progress}
              value={packaging ? state.archiveProgress : completed}
              max={packaging ? successes.length || 1 : items.length || 1}
              aria-label={packaging ? '打包进度' : '压缩进度'}
            />
            <ul class={style.itemList}>
              {items.map((item) => {
                const difference =
                  item.compressed && item.file.size
                    ? Math.round(
                        (1 - item.compressed.size / item.file.size) * 100,
                      )
                    : 0;
                return (
                  <li key={item.id} class={style.item}>
                    <img
                      class={style.thumb}
                      src={item.previewUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <div class={style.info}>
                      <div class={style.name} title={item.file.name}>
                        {item.file.name}
                      </div>
                      <div class={style.sizes}>
                        {sizeLabel(item.file.size)}
                        {item.compressed &&
                          ` → ${sizeLabel(item.compressed.size)}`}
                      </div>
                      {item.error && (
                        <span class={style.error} role="status">
                          {item.error}
                        </span>
                      )}
                    </div>
                    <span
                      class={`${style.itemStatus} ${
                        difference < 0 ? style.growth : style.saved
                      }`}
                    >
                      {item.processing
                        ? '处理中'
                        : item.compressed
                        ? difference >= 0
                          ? `-${difference}%`
                          : `+${-difference}%`
                        : item.error
                        ? '失败'
                        : '待处理'}
                    </span>
                    <div class={style.itemActions}>
                      {item.compressed && (
                        <a
                          class={style.iconBtn}
                          href={item.downloadUrl}
                          download={item.compressed.name}
                          title={`下载 ${item.compressed.name}`}
                          aria-label={`下载 ${item.file.name}`}
                        >
                          <DownloadIcon />
                        </a>
                      )}
                      <button
                        class={style.iconBtn}
                        disabled={busy}
                        onClick={() => this.removeItem(item.id)}
                        title="移除图片"
                        aria-label={`移除 ${item.file.name}`}
                      >
                        <RemoveIcon />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!items.length && <div class={style.empty}>暂无图片</div>}
          </main>
        </div>
        <footer class={style.actionBar}>
          {busy ? (
            <button class={style.cancelBtn} onClick={this.onCancel}>
              取消{packaging ? '打包' : '压缩'}
            </button>
          ) : (
            <button
              class={style.compressBtn}
              disabled={!items.length}
              onClick={this.onCompressAll}
            >
              {completed ? '重新压缩' : '开始压缩'}
            </button>
          )}
          {archiveUrl ? (
            <a
              class={style.downloadBtn}
              href={archiveUrl}
              download="compressed-images.zip"
            >
              <DownloadIcon />
              下载 ZIP
            </a>
          ) : (
            <button
              class={style.downloadBtn}
              disabled={!successes.length || busy}
              onClick={this.prepareDownload}
            >
              <DownloadIcon />
              {packaging
                ? `打包 ${state.archiveProgress}/${successes.length}`
                : `打包下载${successes.length ? ` (${successes.length})` : ''}`}
            </button>
          )}
        </footer>
      </section>
    );
  }
}
