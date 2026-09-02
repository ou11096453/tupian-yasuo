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

interface State {
  quality: number;
  items: BatchItem[];
  processing: boolean;
  done: boolean;
}

export default class Batch extends Component<Props, State> {
  state: State = {
    quality: 75,
    items: this.props.files.map((file) => ({
      file,
      processing: false,
    })),
    processing: false,
    done: false,
  };

  private async compressFile(
    file: File,
    quality: number,
  ): Promise<File | undefined> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布上下文');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    return new Promise<File>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('压缩失败'));
            return;
          }
          const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality / 100,
      );
    });
  }

  private onQualityChange = (event: Event) => {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.setState({ quality: value });
  };

  private onCompressAll = async () => {
    this.setState({ processing: true });
    const { quality, items } = this.state;
    const newItems = [...items];

    for (let i = 0; i < newItems.length; i++) {
      newItems[i] = { ...newItems[i], processing: true };
      this.setState({ items: [...newItems] });
      try {
        const compressed = await this.compressFile(newItems[i].file, quality);
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
      setTimeout(() => link.click(), i * 200);
    });
  };

  render(
    {}: Props,
    { quality, items, processing, done }: State,
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

    return (
      <div class={style.batch}>
        <div class={style.header}>
          <button class={style.backBtn} onClick={this.props.onBack}>
            ← 返回
          </button>
          <h2>批量压缩</h2>
          <span class={style.count}>{items.length} 张图片</span>
        </div>

        <div class={style.controls}>
          <label class={style.qualityLabel}>
            压缩质量: {quality}%
            <input
              type="range"
              min="1"
              max="100"
              value={quality}
              onInput={this.onQualityChange}
              disabled={processing}
            />
          </label>
          <div class={style.buttonGroup}>
            <button
              class={style.compressBtn}
              onClick={this.onCompressAll}
              disabled={processing || items.length === 0}
            >
              {processing ? '压缩中...' : '开始压缩'}
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
        </div>

        {totalCompressed > 0 && (
          <div class={style.summary}>
            总大小: {prettyBytes(totalOriginal).value}
            {prettyBytes(totalOriginal).unit} → {prettyBytes(totalCompressed).value}
            {prettyBytes(totalCompressed).unit} ({percent}%)
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

