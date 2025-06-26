import { WebDemuxer } from "web-demuxer";

export class Demuxer {
  demux: WebDemuxer;
  decoder: VideoDecoder | null = null;
  canvasContext: CanvasRenderingContext2D | null = null;
  fps: number = 0;
  fpsNumerator: number = 0;
  fpsDenominator: number = 0;
  frameLock: number = 0;
  frameTime: number = 0;
  frameCount: number = 0;
  maxCachedFrames: number = 30;
  cacheFrames: VideoFrame[] = [];
  viddone = false;
  constructor() {
    this.demux = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });
  }
  async load(file: File): Promise<void> {
    await this.demux.load(file);
    await this.getMetaData();
  }
  async getMetaData() {
    const data = await this.demux.getMediaInfo();
    // looking for video track
    const videoTrack = data.streams.find(
      (stream) => stream.codec_type_string === "video"
    );
    if (!videoTrack) {
      throw new Error("No video track found in the media file.");
    }
    const [num, dem] = videoTrack.avg_frame_rate.split("/");
    this.fpsNumerator = Number(num);
    this.fpsDenominator = Number(dem);
    this.fps = this.fpsNumerator / this.fpsDenominator;
  }
  async getVideoConfig() {
    const ogDecoderConfig = await this.demux.getDecoderConfig("video");
    return {
      codec: ogDecoderConfig.codec, //"vp09.02.10.10.01.09.16.09.01",
      width: 1920,
      height: 1080,
      description: ogDecoderConfig.description,
      optimizeForLatency: true,
    } as VideoDecoderConfig;
  }

  async setCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }
    this.canvasContext = ctx;
    if (!this.decoder) {
      this.decoder = new VideoDecoder({
        output: this.recieveVideoFrame.bind(this),
        error: (e) => {
          console.error("video decoder error:", e);
        },
      });
      const videoDecoderConfig = await this.getVideoConfig();
      this.decoder.configure(videoDecoderConfig);
    }
  }
  async recieveVideoFrame(vf: VideoFrame) {
    if (!this.canvasContext) {
      throw new Error("Canvas context not set");
    }
    if (this.cacheFrames.length > this.maxCachedFrames) {
      this.frameLock = 1; // Lock frame processing if cache is full
    } else {
      this.frameLock = 0; // Release frame processing lock
    }
    console.log("Recieved video frame", vf, this.cacheFrames.length);
    this.frameCount++;
    // If the cache is full, we will not add
    this.cacheFrames.push(vf);
  }
  async renderVideoFrame(vf: VideoFrame) {
    this.frameCount = 0; // Reset frame count for each render
    if (!this.canvasContext) {
      throw new Error("Canvas context not set");
    }
    const scale = Math.min(
      this.canvasContext.canvas.width / vf.displayWidth,
      this.canvasContext.canvas.height / vf.displayHeight
    );
    this.canvasContext.drawImage(
      vf,
      0,
      0,
      vf.displayWidth * scale,
      vf.displayHeight * scale
    );
    vf.close();
  }
  async render() {
    if (!this.canvasContext) {
      throw new Error("Canvas context not set");
    }
    if (!this.decoder) {
      throw new Error("Decoder not initialized");
    }
    if (!this.fpsNumerator || !this.fpsDenominator) {
      throw new Error("FPS not set");
    }
    this.decodeIntoFrames();
    const beginTime = performance.now();
    let frameCount = 0;
    let frameTime =
      beginTime + (1000 * this.fpsDenominator) / this.fpsNumerator;
    while (!this.viddone || this.cacheFrames.length > 0) {
      const frame = this.cacheFrames.shift();

      //   wait until designated frame time
      while (performance.now() < frameTime) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      if (this.cacheFrames.length < this.maxCachedFrames) {
        this.frameLock = 0;
      }
    //   console.log(
    //     performance.now(),
    //     frameTime,
    //     (1000 * this.fpsDenominator) / this.fpsNumerator
    //   );
      if (frame) {
        await this.renderVideoFrame(frame);
        frameCount++;
        frameTime =
          beginTime +
          (frameCount * 1000 * this.fpsDenominator) / this.fpsNumerator;
      } else {
        // If no frame is available, wait for the next frame time
        while (this.cacheFrames.length === 0 && !this.viddone) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        //   console.log("Waiting for next frame...");
          this.frameLock = 0; // Release frame lock if waiting for next frame
        }
      }
    }
  }
  async decodeIntoFrames() {
    if (!this.decoder) {
      throw new Error("Decoder not initialized");
    }
    if (!this.demux) {
      throw new Error("Demuxer not initialized");
    }
    if (!this.fpsNumerator || !this.fpsDenominator) {
      throw new Error("FPS not set");
    }
    const reader = this.demux.read("video", 0, 0).getReader();
    this.frameTime = performance.now();
    let lockout = 4;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("No more frames to read");
        this.viddone = true;
        break;
      }
      const frame = value as EncodedVideoChunk;
      this.decoder.decode(value);
      lockout--;
      if (lockout <= 0) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        lockout = 3; // Reset lockout counter
      }
      while (this.frameLock > 0) {
        // console.log("Waiting for frame lock to be released...");
        // Wait until the frame lock is released
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  }
}
