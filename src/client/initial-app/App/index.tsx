import type { FileDropEvent } from 'file-drop-element';
import type SnackBarElement from 'shared/custom-els/snack-bar';
import type { SnackOptions } from 'shared/custom-els/snack-bar';

import { h, Component } from 'preact';

import { linkRef } from 'shared/prerendered-app/util';
import * as style from './style.css';
import 'add-css:./style.css';
import 'file-drop-element';
import 'shared/custom-els/snack-bar';
import Intro from 'shared/prerendered-app/Intro';
import { isImageFile } from 'shared/image-files';
const batchPromise = import('client/lazy-app/Batch');
import 'shared/custom-els/loading-spinner';

const ROUTE_EDITOR = '/editor';

const compressPromise = import('client/lazy-app/Compress');
const swBridgePromise = import('client/lazy-app/sw-bridge');

function back() {
  window.history.back();
}

interface Props {}

interface State {
  awaitingShareTarget: boolean;
  files: File[];
  isEditorOpen: boolean;
  Compress?: typeof import('client/lazy-app/Compress').default;
  Batch?: typeof import('client/lazy-app/Batch').default;
  compressError?: string;
  batchError?: string;
}

export default class App extends Component<Props, State> {
  state: State = {
    awaitingShareTarget: new URL(location.href).searchParams.has(
      'share-target',
    ),
    isEditorOpen: false,
    files: [],
    Compress: undefined,
    Batch: undefined,
  };

  snackbar?: SnackBarElement;

  constructor() {
    super();

    compressPromise
      .then((module) => {
        this.setState({ Compress: module.default });
      })
      .catch(() => {
        this.setState({ compressError: '应用加载失败' });
        this.showSnack('应用加载失败');
      });

    batchPromise
      .then((module) => {
        this.setState({ Batch: module.default });
      })
      .catch(() => {
        this.setState({ batchError: '批量组件加载失败' });
        this.showSnack('批量组件加载失败');
      });

    swBridgePromise
      .then(async ({ offliner, getSharedImage }) => {
        offliner(this.showSnack);
        if (!this.state.awaitingShareTarget) return;
        const file = await getSharedImage();
        // Remove the ?share-target from the URL
        history.replaceState('', '', '/');
        this.openEditor();
        this.setState({ files: [file], awaitingShareTarget: false });
      })
      .catch(() => {
        this.setState({ awaitingShareTarget: false });
        this.showSnack('离线或分享功能暂时不可用');
      });

    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('keydown', this.onKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this.onPopState);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === 'Escape' &&
      this.state.isEditorOpen &&
      !(
        event.target instanceof HTMLElement &&
        event.target.closest('input,select,textarea,[contenteditable]')
      )
    ) {
      back();
    }
  };

  private onFileDrop = ({ files }: FileDropEvent) => {
    if (!files || files.length === 0) return;
    const fileList: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (isImageFile(files[i])) {
        fileList.push(files[i]);
      }
    }
    if (fileList.length !== files.length) this.showSnack('已跳过非图片文件');
    if (fileList.length === 0) return;
    this.openEditor();
    this.setState({ files: fileList });
  };

  private onIntroPickFile = (files: File[]) => {
    if (files.length === 0) return;
    this.openEditor();
    this.setState({ files });
  };

  private showSnack = (
    message: string,
    options: SnackOptions = {},
  ): Promise<string> => {
    if (!this.snackbar) throw Error('Snackbar missing');
    return this.snackbar.showSnackbar(message, options);
  };

  private onPopState = () => {
    this.setState({ isEditorOpen: location.pathname === ROUTE_EDITOR });
  };

  private openEditor = () => {
    if (this.state.isEditorOpen) return;
    // Change path, but preserve query string.
    const editorURL = new URL(location.href);
    editorURL.pathname = ROUTE_EDITOR;
    history.pushState(null, '', editorURL.href);
    this.setState({ isEditorOpen: true });
  };

  render(
    {}: Props,
    { files, isEditorOpen, Compress, Batch, awaitingShareTarget }: State,
  ) {
    const showSpinner =
      awaitingShareTarget ||
      (isEditorOpen && (files.length > 1 ? !Batch : !Compress));
    const loadError =
      files.length > 1 ? this.state.batchError : this.state.compressError;

    return (
      <div class={style.app}>
        <file-drop onfiledrop={this.onFileDrop} class={style.drop}>
          {showSpinner ? (
            loadError ? (
              <div class={style.loadError} role="alert">
                <p>{loadError}</p>
                <button onClick={() => location.reload()}>重新加载</button>
                <button onClick={back}>返回</button>
              </div>
            ) : (
              <loading-spinner class={style.appLoader} />
            )
          ) : isEditorOpen ? (
            files.length > 1 && Batch ? (
              <Batch files={files} showSnack={this.showSnack} onBack={back} />
            ) : Compress && files.length > 0 ? (
              <Compress
                files={[files[0]]}
                showSnack={this.showSnack}
                onBack={back}
              />
            ) : null
          ) : (
            <Intro onFile={this.onIntroPickFile} showSnack={this.showSnack} />
          )}
          <snack-bar ref={linkRef(this, 'snackbar')} />
        </file-drop>
      </div>
    );
  }
}
