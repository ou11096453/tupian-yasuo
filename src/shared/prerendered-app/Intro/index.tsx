import { h, Component } from 'preact';

import { linkRef } from 'shared/prerendered-app/util';
import '../../custom-els/loading-spinner';
import logoWithText from 'data-url-text:./imgs/logo.svg';
import * as style from './style.css';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import 'shared/custom-els/snack-bar';
import { imageAccept, isImageFile } from 'shared/image-files';

const installButtonSource = 'introInstallButton-Purple';
interface Props {
  onFile?: (files: File[]) => void;
  showSnack?: SnackBarElement['showSnackbar'];
}
interface State {
  beforeInstallEvent?: BeforeInstallPromptEvent;
}

export default class Intro extends Component<Props, State> {
  state: State = {};
  private fileInput?: HTMLInputElement;
  private installingViaButton = false;

  componentDidMount() {
    window.addEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPromptEvent,
    );
    window.addEventListener('appinstalled', this.onAppInstalled);
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
      if (isImageFile(files[j])) fileList.push(files[j]);
    }
    this.fileInput!.value = '';
    if (fileList.length !== files.length)
      this.props.showSnack!('已跳过非图片文件');
    if (!fileList.length) return;
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

  render({}, { beforeInstallEvent }: State) {
    return (
      <div class={style.intro}>
        <input
          class={style.hide}
          ref={linkRef(this, 'fileInput')}
          type="file"
          multiple
          accept={imageAccept}
          onChange={this.onFileChange}
        />
        <div class={style.main}>
          <h1 class={style.logoContainer}>
            <img
              class={style.logo}
              src={logoWithText}
              alt=""
              width="81"
              height="81"
            />
            <span>在线图片压缩</span>
          </h1>
          <div class={style.loadImg}>
            <div class={style.loadImgContent}>
              <button
                class={style.loadBtn}
                onClick={this.onOpenClick}
                aria-label="选择图片"
                title="选择图片"
              >
                <svg viewBox="0 0 24 24" class={style.loadIcon}>
                  <path d="M19 7v3h-2V7h-3V5h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5a2 2 0 00-2 2v12c0 1.1.9 2 2 2h12a2 2 0 002-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z" />
                </svg>
                <span>选择图片</span>
              </button>
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
