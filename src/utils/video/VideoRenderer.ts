import { AVSeekFlag, WebDemuxer } from "web-demuxer";
import { MovieRenderer } from "./MovieRenderer";
import { LazyMovieRenderer } from "./LazyMovieRenderer";
const logVideo = false; // Set to true to enable video logging
export class VideoRenderer {
  parent: MovieRenderer | LazyMovieRenderer; // Parent MovieRenderer instance
  videoDemuxer: WebDemuxer; // Video demuxer instance
  videoDecoderConfig: VideoDecoderConfig | null = null; // Video decoder configuration
  videoDecoder: VideoDecoder | null = null; // Video decoder instance
  canvasContext: CanvasRenderingContext2D | null = null; // Canvas context for rendering video frames
  private maxQueuedVideoFrames: number = 30; // Maximum number of video frames to queue. After this, frames decoding will pause until the queue has space.
  private queuedFrames: VideoFrame[] = []; // Queue for video frames

  nextFrameTime: number = 0; // currentPosition time for the next frame to be rendered
  fpsNumerator: number = 60; // Frames per second numerator
  fpsDenominator: number = 1; // Frames per second denominator
  fps: number = 60; // Frames per second. Use only for display purposes, as rounding errors may cause drift in the video playback.
  framesRendered: number = 0; // Number of frames rendered
  streamReader?: ReadableStreamDefaultReader<EncodedVideoChunk>;

  debugFPSLastTick: number = 0; // Last tick time for FPS debugging
  debugFrameCount: number = 0; // Frame count for FPS debugging
  loaded: boolean = false; // Whether the video demuxer has been loaded
  vLog(message: any) {
    if (!logVideo) return; // If logging is disabled, do not log
    this.parent.log(`[VideoRenderer] ${message}`);
  }
  constructor(parent: MovieRenderer | LazyMovieRenderer) {
    this.parent = parent;
    this.videoDemuxer = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });
  }
  async loadCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }
    this.canvasContext = ctx;
    this.vLog("Canvas context set");
    while (!this.loaded) {
      this.vLog("Waiting for video demuxer to load");
      await new Promise((resolve) => requestAnimationFrame(resolve)); // Wait until the demuxer is loaded
    }
  }

  async init() {
    await this.videoDemuxer.load(this.parent.file);
    this.vLog("VideoRenderer is ready");
    this.loaded = true;
    this.vLog("Video demuxer initialized");
  }
  async getVideoDecoderConfig(): Promise<VideoDecoderConfig> {
    if (this.videoDecoderConfig) {
      return this.videoDecoderConfig;
    }
    const mediaInfo = await this.parent.getMediaInfo();
    const videoStream = mediaInfo.streams.find(
      (s) => s.codec_type_string === "video"
    );
    if (!videoStream) {
      throw new Error("No video stream found in media info");
    }
    const [num, dem] = videoStream.avg_frame_rate.split("/");
    this.fpsNumerator = Number(num);
    this.fpsDenominator = Number(dem);
    this.fps = this.fpsNumerator / this.fpsDenominator;

    this.videoDecoderConfig = {
      codec: videoStream.codec_string,
      codedWidth: videoStream.width,
      codedHeight: videoStream.height,
      description: videoStream.extradata,
    };
    return this.videoDecoderConfig;
  }
  async initVideoDecoder() {
    const config = await this.getVideoDecoderConfig();
    if (!config) {
      throw new Error("Video decoder config is not set");
    }
    this.vLog(
      `Initializing video decoder with config: ${JSON.stringify(config)}`
    );
    const decoder = new VideoDecoder({
      output: this.receiveVideoFrame.bind(this),
      error: (e) => {
        this.vLog(`Video decoder error: ${e}`);
      },
    });

    await decoder.configure(config);
    this.vLog("Video decoder configured successfully");
    const readableStream = this.videoDemuxer.read(
      "video",
      0,
      0,
      AVSeekFlag.AVSEEK_FLAG_ANY
    );
    this.streamReader = readableStream.getReader();
    this.videoDecoder = decoder;
    return decoder;
  }
  async receiveVideoFrame(frame: VideoFrame) {
    this.queuedFrames.push(frame);
    if (this.queuedFrames.length > this.maxQueuedVideoFrames) {
      this.vLog("Max queued video frames reached, pausing decoding");
      return; // Pause decoding until space is available
    }
    this.vLog(
      `Received video frame, total queued: ${this.queuedFrames.length}`
    );
  }
  async renderNextFrame() {
    if (this.queuedFrames.length === 0) {
      this.vLog("No frames to render");
      return;
    }
    const frame = this.queuedFrames.shift();
    if (!frame || !this.canvasContext) {
      this.vLog("No frame or canvas context available for rendering");
      return;
    }
    const scale = Math.min(
      this.canvasContext.canvas.width / frame.displayWidth,
      this.canvasContext.canvas.height / frame.displayHeight
    );
    this.canvasContext.drawImage(
      frame,
      0,
      0,
      frame.displayWidth * scale,
      frame.displayHeight * scale
    );
    frame.close(); // Release the frame after rendering
    this.vLog("Rendered a video frame");
  }
  async asyncTickDecode() {
    // check if decode needs to be done
    if (
      this.streamReader &&
      this.queuedFrames.length < this.maxQueuedVideoFrames
    ) {
      try {
        const { done, value } = await this.streamReader.read();
        if (done) {
          this.vLog("No more video frames to decode");
          return;
        }
        await this.videoDecoder?.decode(value);
        this.vLog(
          `Decoded video chunk, total queued: ${this.queuedFrames.length}`
        );
      } catch (error) {
        this.vLog(`Error reading video stream: ${error}`);
      }
    } else {
      this.vLog(
        `Skipping decode, queued frames: ${
          this.queuedFrames.length
        }. Next frame in ${this.nextFrameTime - this.parent.currentPosition}`
      );
    }
  }
  async preload(frames?: number) {
    while (!this.streamReader) {
      console.log("Waiting for stream reader to be initialized");
      await new Promise((r) => requestAnimationFrame(r));
    }
    while (this.queuedFrames.length < (frames || this.maxQueuedVideoFrames)) {
      console.log(
        `Preloading video frames, current queue length: ${this.queuedFrames.length}`
      );
      try {
        const { done, value } = await this.streamReader.read();
        console.log({ done, value });
        if (done) {
          this.vLog("No more video frames to preload");
          break;
        }
        console.log({ value });
        await this.videoDecoder?.decode(value);
        this.vLog(
          `Preloaded video chunk, total queued: ${
            frames || this.maxQueuedVideoFrames
          }`
        );
      } catch (error) {
        console.error("Error preloading video stream:", error);
        this.vLog(`Error preloading video stream: ${error}`);
      }
    }
    this.vLog("Preloading complete");
  }
  async tickRender() {
    const perf = performance.now();
    if (this.debugFPSLastTick === 0) {
      this.debugFPSLastTick = perf;
    }

    // Debugging FPS
    if (perf - this.debugFPSLastTick > 1000) {
      console.log(
        `Achieved ${this.debugFrameCount} frames in ${
          (perf - this.debugFPSLastTick) / 1000
        }s`,
        this.framesRendered
      );
      this.debugFrameCount = 0;
      this.debugFPSLastTick = perf;
    }

    if (
      this.nextFrameTime <= this.parent.currentPosition &&
      this.queuedFrames.length > 0
    ) {
      console.log(
        `Rendering frame at position: ${this.parent.currentPosition}, next frame time: ${this.nextFrameTime}`,
        this.framesRendered
      );
      // check if we have a frame to render, and if the time is right
      if (this.queuedFrames.length > 0) {
        this.renderNextFrame();

        // Our next render is starttime (this.parent.anchorTime) + frames * timePerFrame
        // Update the next frame time based on the current position and the expected frame rate
        this.nextFrameTime =
          ((this.framesRendered + 6) * this.fpsDenominator) /
          this.fpsNumerator;
        this.framesRendered++;
        this.debugFrameCount++;
      } else {
        this.vLog("No frames to render");
      }
    } else {
      console.log(
        "render skipped",
        this.nextFrameTime,
        this.parent.currentPosition,
        this.queuedFrames.length
      );
    }

    // If we have no frames to render, we finish our tick for video.
  }
  async seek(time: number) {
    this.vLog(`Seeking to time: ${time}`);
    // this.videoDemuxer.seek("video", time, AVSeekFlag.AVSEEK_FLAG_ANY);
    this.streamReader?.cancel(); // Cancel the current stream reader
    // reinit this.videoDemuxer
    this.videoDemuxer.destroy();
    this.videoDemuxer = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });

    await this.videoDemuxer.load(this.parent.file);
    this.videoDecoder?.close();
    const decoder = new VideoDecoder({
      output: this.receiveVideoFrame.bind(this),
      error: (e) => {
        this.vLog(`Video decoder error: ${e}`);
      },
    });
    const config = await this.getVideoDecoderConfig();
    await decoder.configure(config);
    this.videoDecoder = decoder;
    this.streamReader = this.videoDemuxer
      .read("video", time, 0, AVSeekFlag.AVSEEK_FLAG_FRAME)
      .getReader();
    this.queuedFrames.forEach((frame) => frame.close());
    this.queuedFrames = [];
    this.framesRendered = (time * this.fpsNumerator) / this.fpsDenominator;
    this.nextFrameTime = time;
    console.log(
      "Seek completed and video frames reset",
      this.videoDecoder?.state,
      this.videoDemuxer
    );
  }
  stop() {
    this.videoDecoder?.close();
    this.videoDemuxer.destroy();
    this.streamReader?.cancel();
    this.streamReader?.releaseLock();
    this.queuedFrames.forEach((frame) => frame.close());
    this.queuedFrames = [];
    this.vLog("VideoRenderer stopped and resources cleaned up");
  }
}
