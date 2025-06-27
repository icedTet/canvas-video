import { WebDemuxer, WebMediaInfo } from "web-demuxer";
import { VideoRenderer } from "./VideoRenderer";
import { LazyAudioRenderer } from "./LazyAudioRenderer";
const LOG_STUFF = true; // Set to true to enable logging
export class LazyMovieRenderer {
  // Stateful properties
  private mediaInfo: WebMediaInfo | null = null; // Media information for the source file
  lazyAudioRenderer: LazyAudioRenderer; // Audio renderer instance
  videoRenderer: VideoRenderer; // Video renderer instance
  file: File | string; // Source file or URL
  log(message: any) {
    if (LOG_STUFF) {
      console.log(`[LazyMovieRenderer] ${message}`);
    }
  }
  videoDuration: number = 0; // Duration of the video in seconds
  currentPosition: number = 0; // Current playback position in seconds
  anchorTime: number = 0; // Anchor time, used to ensure consistent playback timing
  constructor(file: File | string, doNotInitialize = false) {
    this.videoRenderer = new VideoRenderer(this);
    this.lazyAudioRenderer = new LazyAudioRenderer(this);
    this.file = file;
    this.log(`MovieRenderer created with file: ${file}`);
    if (!doNotInitialize) {
      this.init();
    }
  }
  async init() {
    this.log("Initializing MovieRenderer");
    await Promise.all([
      this.videoRenderer.init(),
      this.lazyAudioRenderer.init(),
    ]);
    this.log("MovieRenderer initialized");
  }
  async getMediaInfo(): Promise<WebMediaInfo> {
    if (this.mediaInfo) {
      return this.mediaInfo;
    }
    while (!this.videoRenderer.loaded) {
      this.log("Waiting for video demuxer to load");
      await new Promise((resolve) => requestAnimationFrame(resolve)); // Wait until the demuxer is loaded
    }
    this.mediaInfo = await this.videoRenderer.videoDemuxer.getMediaInfo();
    return this.mediaInfo;
  }

  async setCanvas(canvas: HTMLCanvasElement) {
    await this.videoRenderer.loadCanvas(canvas);
    await this.videoRenderer.initVideoDecoder();
  }
  async setAudioElement(audioElement: HTMLAudioElement) {
    await this.lazyAudioRenderer.loadAudioElement(audioElement);
  }
  async play() {
    if (!this.videoRenderer.loaded || !this.lazyAudioRenderer.loaded) {
      throw new Error("Video or audio renderer not loaded yet, waiting...");
    }
    this.anchorTime = performance.now();
    await this.render();
  }
  async playWhenReady() {
    while (!this.videoRenderer.loaded || !this.lazyAudioRenderer.loaded) {
      if (!this.videoRenderer.loaded) {
        this.log("Waiting for video renderer to load");
      }
      if (!this.lazyAudioRenderer.loaded) {
        this.log("Waiting for audio renderer to load");
      }
      await new Promise((resolve) => requestAnimationFrame(resolve)); // Wait until both renderers are loaded
    }
    this.play();
  }
  /**
   * ==== Render Loop ====
   *
   */
  async renderAsyncTickTasks() {
    // This method is called on every render tick to perform asynchronous tasks.
    // It can be used to fetch data, update UI, etc.
    await this.videoRenderer.asyncTickDecode();
  }
  async renderTick() {
    await this.videoRenderer.tickRender();
    await this.lazyAudioRenderer.tickRender();
  }
  async render() {
    await this.videoRenderer.preload();

    let last = this.lazyAudioRenderer.audioElement!.currentTime;
    this.lazyAudioRenderer.play();
    while (last === this.lazyAudioRenderer.audioElement!.currentTime && last < 0.08) {
      await new Promise((r) =>
        setTimeout(() => {
          r(0);
        }, 0)
      );
      last = this.lazyAudioRenderer.audioElement!.currentTime;  
    }
    this.currentPosition = this.lazyAudioRenderer.audioElement!.currentTime;
    this.anchorTime = performance.now() - this.currentPosition * 1000;
    while (true) {
      this.currentPosition = performance.now() / 1000 - this.anchorTime / 1000;
      this.log(`Current position: ${this.currentPosition.toFixed(4)}s`);
      await this.renderTick();
      this.renderAsyncTickTasks();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
}
