import { WebDemuxer, WebMediaInfo } from "web-demuxer";
import { VideoRenderer } from "./VideoRenderer";
import { AudioRenderer } from "./AudioRenderer";
const LOG_STUFF = true; // Set to true to enable logging
export class MovieRenderer {
  // Stateful properties
  private mediaInfo: WebMediaInfo | null = null; // Media information for the source file
  private videoRenderer: VideoRenderer; // Video renderer instance
  private audioRenderer: AudioRenderer; // Audio renderer instance
  file: File | string; // Source file or URL
  log(message: any) {
    if (LOG_STUFF) {
      console.log(`[MovieRenderer] ${message}`);
    }
  }
  videoDuration: number = 0; // Duration of the video in seconds
  currentPosition: number = 0; // Current playback position in seconds
  anchorTime: number = 0; // Anchor time, used to ensure consistent playback timing
  constructor(file: File | string, doNotInitialize = false) {
    this.videoRenderer = new VideoRenderer(this);
    this.audioRenderer = new AudioRenderer(this);
    this.file = file;
    this.log(`MovieRenderer created with file: ${file}`);
    if (!doNotInitialize) {
      this.init();
    }
  }
  async init() {
    this.log("Initializing MovieRenderer");
    await Promise.all([this.videoRenderer.init(), this.audioRenderer.init()]);
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
  async play() {
    if (!this.videoRenderer.loaded || !this.audioRenderer.loaded) {
      throw new Error("Video or audio renderer not loaded yet, waiting...");
    }
    this.anchorTime = performance.now();
    await this.render();
  }
  async playWhenReady() {
    while (!this.videoRenderer.loaded || !this.audioRenderer.loaded) {
      if (!this.videoRenderer.loaded) {
        this.log("Waiting for video renderer to load");
      }
      if (!this.audioRenderer.loaded) {
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
    await this.audioRenderer.tickRender();
  }
  async render() {
    this.anchorTime = performance.now(); // Set the anchor time to the current time in seconds
    this.audioRenderer.play();
    while (true) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      this.currentPosition = performance.now() / 1000 - this.anchorTime / 1000;
      // this.log(`Current position: ${this.currentPosition.toFixed(2)}s`);
      this.renderAsyncTickTasks();
      await this.renderTick();
    }
  }
}
