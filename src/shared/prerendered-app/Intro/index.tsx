import { h, Component } from 'preact';

import { linkRef } from 'shared/prerendered-app/util';
import logo from 'data-url-text:./imgs/logo.svg';
import artworkURL from 'url:./imgs/demos/demo-artwork.jpg';
import screenURL from 'url:./imgs/demos/demo-device-screen.png';
import photoURL from 'url:./imgs/demos/demo-large-photo.jpg';
import artworkPreview from 'data-url:./imgs/demos/icon-demo-artwork.jpg';
import screenPreview from 'data-url:./imgs/demos/icon-demo-device-screen.jpg';
import photoPreview from 'data-url:./imgs/demos/icon-demo-large-photo.jpg';
import * as style from './style.css';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import 'shared/custom-els/snack-bar';
import { imageAccept, isImageFile } from 'shared/image-files';

const examples = [
  {
    label: '插画',
    url: artworkURL,
    preview: artworkPreview,
    name: 'artwork.jpg',
    type: 'image/jpeg',
  },
  {
    label: '屏幕截图',
    url: screenURL,
    preview: screenPreview,
    name: 'screen.png',
    type: 'image/png',
  },
  {
    label: '摄影',
    url: photoURL,
    preview: photoPreview,
    name: 'photo.jpg',
    type: 'image/jpeg',
  },
];
interface Props {
  onFile?: (files: File[]) => void;
  showSnack?: SnackBarElement['showSnackbar'];
}
interface State {
  beforeInstallEvent?: BeforeInstallPromptEvent;
  loadingExample?: string;
}

export default class Intro extends Component<Props, State> {
  state: State = {};
  private fileInput?: HTMLInputElement;
  private exampleRequest?: AbortController;

  componentDidMount() {
    window.addEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPromptEvent,
    );
    window.addEventListener('appinstalled', this.onAppInstalled);
  }

  componentWillUnmount() {
    this.exampleRequest?.abort();
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
      if (isImageFile(files[j])) fileList.push(files[j]);
    }
    this.fileInput!.value = '';
    if (fileList.length !== files.length)
      this.props.showSnack!('已跳过非图片文件');
    if (!fileList.length) return;
    this.props.onFile!(fileList);
  };

  private onOpenClick = () => {
    this.exampleRequest?.abort();
    this.setState({ loadingExample: undefined });
    this.fileInput!.click();
  };

  private onExampleClick = async (example: typeof examples[number]) => {
    this.exampleRequest?.abort();
    const request = new AbortController();
    this.exampleRequest = request;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 30000);
    this.setState({ loadingExample: example.name });
    try {
      const response = await fetch(example.url, { signal: request.signal });
      if (!response.ok) throw new Error('Example unavailable');
      const data = await response.blob();
      if (request.signal.aborted) return;
      this.props.onFile?.([
        new File([data], example.name, { type: example.type }),
      ]);
    } catch {
      if (!request.signal.aborted || timedOut)
        this.props.showSnack?.('示例图片加载失败，请重试或选择自己的图片');
    } finally {
      clearTimeout(timeout);
      if (!request.signal.aborted || timedOut)
        this.setState({ loadingExample: undefined });
    }
  };

  private onBeforeInstallPromptEvent = (event: BeforeInstallPromptEvent) => {
    event.preventDefault();
    this.setState({ beforeInstallEvent: event });
  };

  private onInstallClick = async () => {
    const beforeInstallEvent = this.state.beforeInstallEvent;
    if (!beforeInstallEvent) return;
    beforeInstallEvent.prompt();
    await beforeInstallEvent.userChoice;
  };

  private onAppInstalled = () => {
    this.setState({ beforeInstallEvent: undefined });
  };

  render({}, { beforeInstallEvent, loadingExample }: State) {
    return (
      <div class={style.intro}>
        <input
          class={style.hide}
          ref={linkRef(this, 'fileInput')}
          type="file"
          multiple
          accept={imageAccept}
          aria-label="图片文件"
          onChange={this.onFileChange}
        />
        <header class={style.header}>
          <h1 class={style.logoContainer}>
            <img class={style.logo} src={logo} alt="" width="40" height="40" />
            <span>在线图片压缩</span>
          </h1>
          {beforeInstallEvent && (
            <button class={style.installBtn} onClick={this.onInstallClick}>
              安装
            </button>
          )}
        </header>
        <main class={style.main}>
          <div class={style.workspace}>
            <div class={style.loadImg}>
              <button
                class={style.loadImgContent}
                onClick={this.onOpenClick}
                aria-label="选择图片"
                title="选择图片"
                type="button"
                aria-describedby="image-formats"
              >
                <span class={style.loadBtn}>
                  <svg
                    viewBox="0 0 24 24"
                    class={style.loadIcon}
                    aria-hidden="true"
                  >
                    <path d="M19 7v3h-2V7h-3V5h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5a2 2 0 00-2 2v12c0 1.1.9 2 2 2h12a2 2 0 002-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z" />
                  </svg>
                  <span>选择图片</span>
                </span>
                <span id="image-formats" class={style.formats}>
                  PNG / JPEG / WebP / AVIF / SVG
                </span>
              </button>
            </div>
            <section class={style.examples} aria-labelledby="example-title">
              <h2 id="example-title">示例图片</h2>
              <div class={style.exampleList}>
                {examples.map((example) => (
                  <button
                    key={example.name}
                    class={style.exampleBtn}
                    type="button"
                    onClick={() => this.onExampleClick(example)}
                    disabled={!!loadingExample}
                    aria-label={`压缩${example.label}示例`}
                    aria-busy={loadingExample === example.name}
                  >
                    <img
                      src={example.preview}
                      alt=""
                      width="200"
                      height="200"
                    />
                    <span>
                      {loadingExample === example.name
                        ? '加载中'
                        : example.label}
                    </span>
                  </button>
                ))}
              </div>
              <span class={style.srOnly} role="status">
                {loadingExample ? '正在加载示例图片' : ''}
              </span>
            </section>
          </div>
        </main>
      </div>
    );
  }
}
