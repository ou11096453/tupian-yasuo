import { h, Component } from 'preact';

import { linkRef } from 'shared/prerendered-app/util';
import '../../custom-els/loading-spinner';
import logoWithText from 'data-url-text:./imgs/logo-with-text.svg';
import * as style from './style.css';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import 'shared/custom-els/snack-bar';
import { startBlobs } from './blob-anim/meta';

const blobAnimImport =
  !__PRERENDER__ && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? undefined
    : import('./blob-anim');
const installButtonSource = 'introInstallButton-Purple';
const supportsClipboardAPI =
  !__PRERENDER__ && navigator.clipboard && navigator.clipboard.read;

async function getImageClipboardItem(
  items: ClipboardItem[],
): Promise<undefined | Blob> {
  for (const item of items) {
    const type = item.types.find((type) => type.startsWith('image/'));
    if (type) return item.getType(type);
  }
}

interface Props {
  onFile?: (files: File[]) => void;
  showSnack?: SnackBarElement['showSnackbar'];
}
interface State {
  beforeInstallEvent?: BeforeInstallPromptEvent;
  showBlobSVG: boolean;
}

export default class Intro extends Component<Props, State> {
  state: State = {
    showBlobSVG: true,
  };
  private fileInput?: HTMLInputElement;
  private blobCanvas?: HTMLCanvasElement;
  private installingViaButton = false;

  componentDidMount() {
    window.addEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPromptEvent,
    );
    window.addEventListener('appinstalled', this.onAppInstalled);

    if (blobAnimImport) {
      blobAnimImport.then((module) => {
        this.setState(
          {
            showBlobSVG: false,
          },
          () => module.startBlobAnim(this.blobCanvas!),
        );
      });
    }
  }

  componentWillUnmount() {
    window.removeEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPromptEvent,
    );
    window.removeEventListener('appinstalled', this.onAppInstalled);
  }

  private onFileChange = (event: Event): void => {
    const fileInput = event.target as HTMLInputElement;
    const files = fileInput.files;
    if (!files || files.length === 0) return;
    const fileList: File[] = [];
    for (let j = 0; j < files.length; j++) {
      fileList.push(files[j]);
    }
    this.fileInput!.value = '';
    this.props.onFile!(fileList);
  };

  private onOpenClick = () => {
    this.fileInput!.click();
  };

  private onBeforeInstallPromptEvent = (event: BeforeInstallPromptEvent) => {
    event.preventDefault();
    this.setState({ beforeInstallEvent: event });
  };

  private onInstallClick = async () => {
    const beforeInstallEvent = this.state.beforeInstallEvent;
    if (!beforeInstallEvent) return;
    this.installingViaButton = true;
    beforeInstallEvent.prompt();
    const { outcome } = await beforeInstallEvent.userChoice;
    if (outcome === 'dismissed') {
      this.installingViaButton = false;
    }
  };

  private onAppInstalled = () => {
    this.setState({ beforeInstallEvent: undefined });
  };

  private onPasteClick = async () => {
    let clipboardItems: ClipboardItem[];
    try {
      clipboardItems = await navigator.clipboard.read();
    } catch (err) {
      this.props.showSnack!('没有权限访问剪贴板');
      return;
    }
    const blob = await getImageClipboardItem(clipboardItems);
    if (!blob) {
      this.props.showSnack!('剪贴板中没有图片');
      return;
    }
    this.props.onFile!([new File([blob], 'image.unknown')]);
  };

  render(
    {},
    { beforeInstallEvent, showBlobSVG }: State,
  ) {
    return (
      <div class={style.intro}>
        <input
          class={style.hide}
          ref={linkRef(this, 'fileInput')}
          type="file"
          multiple
          onChange={this.onFileChange}
        />
        <div class={style.main}>
          {!__PRERENDER__ && (
            <canvas
              ref={linkRef(this, 'blobCanvas')}
              class={style.blobCanvas}
            />
          )}
          <h1 class={style.logoContainer}>
            <img
              class={style.logo}
              src={logoWithText}
              alt="图片压缩"
              width="539"
              height="162"
            />
          </h1>
          <div class={style.loadImg}>
            {showBlobSVG && (
              <svg
                class={style.blobSvg}
                viewBox="-1.25 -1.25 2.5 2.5"
                preserveAspectRatio="xMidYMid slice"
              >
                {startBlobs.map((points) => (
                  <path
                    d={points
                      .map((point, i) => {
                        const nextI = i === points.length - 1 ? 0 : i + 1;
                        let d = '';
                        if (i === 0) {
                          d += `M${point[2]} ${point[3]}`;
                        }
                        return (
                          d +
                          `C${point[4]} ${point[5]} ${points[nextI][0]} ${points[nextI][1]} ${points[nextI][2]} ${points[nextI][3]}`
                        );
                      })
                      .join('')}
                  />
                ))}
              </svg>
            )}
            <div
              class={style.loadImgContent}
              style={{ visibility: __PRERENDER__ ? 'hidden' : '' }}
            >
              <button class={style.loadBtn} onClick={this.onOpenClick}>
                <svg viewBox="0 0 24 24" class={style.loadIcon}>
                  <path d="M19 7v3h-2V7h-3V5h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5a2 2 0 00-2 2v12c0 1.1.9 2 2 2h12a2 2 0 002-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z" />
                </svg>
              </button>
              <div>
                <span class={style.dropText}>拖放</span> 或{' '}
                {supportsClipboardAPI ? (
                  <button class={style.pasteBtn} onClick={this.onPasteClick}>
                    粘贴
                  </button>
                ) : (
                  '粘贴'
                )}
              </div>
            </div>
          </div>
        </div>
        {beforeInstallEvent && (
          <button class={style.installBtn} onClick={this.onInstallClick}>
            安装
          </button>
        )}
      </div>
    );
  }
}
