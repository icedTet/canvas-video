import { WebDemuxer, WebMediaInfo } from "web-demuxer";
import { VideoRenderer } from "./VideoRenderer";
import { LazyAudioRenderer } from "./LazyAudioRenderer";
import { sleep } from "../sleep";
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
  destroyed: boolean = false; // Indicates if the renderer has been destroyed
  seeking: boolean = false; // Indicates if a seek operation is in progress
  dontUpdateTime: boolean = false; // Flag to prevent updating time during certain operations
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
   * Stops all rendering and cleans up resources.
   */
  async stop() {
    this.videoRenderer.stop();
    this.lazyAudioRenderer.stop();
    this.destroyed = true; // Mark the renderer as destroyed
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
    this.videoRenderer.tickRender();
    await this.lazyAudioRenderer.tickRender();
  }
  async seek(time: number) {
    this.seeking = true; // Set seeking flag to true
    this.lazyAudioRenderer.pause();
    this.lazyAudioRenderer.audioElement!.currentTime = time;
    await this.videoRenderer.seek(time);

    console.log(`Seeking to ${time.toFixed(4)}s`);
    await this.videoRenderer.preload(40);

    while (this.lazyAudioRenderer.audioElement?.readyState !== 4) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    this.lazyAudioRenderer.play();
    this.seeking = false; // Reset seeking flag after seek is complete
    // wait for audio duration to ramp up
    // let last = this.lazyAudioRenderer.audioElement!.currentTime;
    // while (
    //   last === this.lazyAudioRenderer.audioElement!.currentTime &&
    //   last < 0.08
    // ) {
    //   await new Promise((r) =>
    //     setTimeout(() => {
    //       r(0);
    //     }, 0)
    //   );
    //   last = this.lazyAudioRenderer.audioElement!.currentTime;
    // }
    // this.currentPosition = this.lazyAudioRenderer.audioElement!.currentTime;
    // this.anchorTime = performance.now() - this.currentPosition * 1000;
    // this.log(`Seeked to ${this.currentPosition.toFixed(4)}s`);
    // this.seeking = false; // Reset seeking flag after seek is complete
    // let driftarr = [] as number[]; // Array to store drift values
    // for (let i = 0; i < 300; i++) {
    //   const audioTime = this.lazyAudioRenderer.audioElement!.currentTime;
    //   this.currentPosition = audioTime;
    //   this.anchorTime = performance.now() - audioTime * 1000;
    //   await new Promise((resolve) => requestAnimationFrame(resolve)); // Wait for the next frame
    // }
    // console.log(JSON.stringify(driftarr, null, 2));
  }
  async render() {
    await this.videoRenderer.preload();

    let last = this.lazyAudioRenderer.audioElement!.currentTime;
    this.lazyAudioRenderer.play();
    while (
      last === this.lazyAudioRenderer.audioElement!.currentTime &&
      last < 0.08
    ) {
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
      if (this.seeking) {
        console.log("Seeking in progress, skipping render tick");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        continue;
      }
      if (!this.dontUpdateTime) {
        this.currentPosition =
          this.lazyAudioRenderer.audioElement!.currentTime || 0; // Update current position from audio element
      }
      this.log(`Current position: ${this.currentPosition.toFixed(4)}s`);
      if (this.destroyed) {
        this.log("Renderer destroyed, stopping render loop");
        break;
      }
      await this.renderTick();
      this.renderAsyncTickTasks();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
}
