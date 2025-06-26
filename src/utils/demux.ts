import { WebDemuxer } from "web-demuxer";

export class Demuxer {
  demux: WebDemuxer;
  decoder: VideoDecoder | null = null;
  fps: number = 0;
  fpsNumerator: number = 0;
  fpsDenominator: number = 0;
  constructor() {
    this.demux = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });
  }
  async load(file: File): Promise<void> {
    await this.demux.load(file);
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

  async renderVideo(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }
    if (!this.decoder) {
      this.decoder = new VideoDecoder({
        output: (frame) => {
          const scale = Math.min(
            canvas.width / frame.displayWidth,
            canvas.height / frame.displayHeight
          );
          ctx.drawImage(
            frame,
            0,
            0,
            frame.displayWidth * scale,
            frame.displayHeight * scale
          );
          frame.close();
        },
        error: (e) => {
          console.error("video decoder error:", e);
        },
      });
      const videoDecoderConfig = await this.getVideoConfig();
      this.decoder.configure(videoDecoderConfig);
    }
  }
  async renderVideo() {
    if (!this.decoder) {
      throw new Error("Decoder not initialized");
    }
    if (!this.demux) {
      throw new Error("Demuxer not initialized");
    }
    if (!this.fpsNumerator || !this.fpsDenominator) {
      throw new Error("FPS not set");
    }
    let startTime = performance.now();
    const reader = this.demux.read("video", 0, 0).getReader();
    let frameClock = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("No more frames to read");
        break;
      }
      const frame = value as EncodedVideoChunk;
      this.decoder.decode(value);
      
    }
  }
}
