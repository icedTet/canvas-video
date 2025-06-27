import { WebDemuxer, WebMediaInfo } from "web-demuxer";
import { AudioRenderer } from "./audio";

export class Demuxer {
  demux: WebDemuxer;
  file: File | string = "";
  decoder: VideoDecoder | null = null;
  audioDecoder: AudioDecoder | null = null;
  canvasContext: CanvasRenderingContext2D | null = null;
  fps: number = 0;
  fpsNumerator: number = 0;
  fpsDenominator: number = 0;
  frameLock: number = 0;
  audioFrameLock: number = 0;
  videoElement: HTMLVideoElement | null = null;
  frameTime: number = 0;
  frameCount: number = 0;
  maxCachedFrames: number = 30;
  cacheFrames: VideoFrame[] = [];
  cacheAudioChunks: EncodedAudioChunk[] = [];

  mediaInfo: WebMediaInfo | null = null;
  onerror?: (s: string) => void;
  viddone = false;
  constructor() {
    this.demux = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });
  }
  async load(file: File): Promise<void> {
    await this.demux.load(file);

    this.file = file;
    await this.getMetaData();
  }
  async loadURL(url: string): Promise<void> {
    await this.demux.load(url);
    this.file = url;
    await this.getMetaData();
  }

  async getMetaData() {
    const data = await this.demux.getMediaInfo();
    console.log("Media Info:", data);
    this.mediaInfo = data;
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
  async getAudioConfig(mediaInfo?: WebMediaInfo) {
    if (!this.mediaInfo) {
      throw new Error(
        "Media info not available. Please load the media file first."
      );
    }
    const data = this.mediaInfo;
    const audioTrack = data.streams.find(
      (stream) => stream.codec_type_string === "audio"
    );
    if (!audioTrack) {
      throw new Error("No audio track found in the media file.");
    }

    return {
      codec: audioTrack.codec_string,
      numberOfChannels: audioTrack.channels,
      sampleRate: audioTrack.sample_rate,
      description: audioTrack.extradata,
    } as AudioDecoderConfig;
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
  async setVideoElement(video: HTMLVideoElement) {
    if (!video) {
      throw new Error("Video element not provided");
    }
    this.videoElement = video;
  }
  async setAudioElement(audio: HTMLAudioElement) {
    if (!audio) {
      throw new Error("Audio element not provided");
    }
    this.audioElement = audio;
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
  async recieveAudioFrame(af: EncodedAudioChunk) {
    if (this.cacheAudioChunks.length > this.maxCachedFrames) {
      this.audioFrameLock = 1; // Lock audio frame processing if cache is full
    }
    // console.log("Recieved audio frame", af, this.cacheAudioChunks.length);
    this.cacheAudioChunks.push(af);
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
    // console.log("Recieved video frame", vf, this.cacheFrames.length);
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
  async consumeAudioFrame() {
    if (this.cacheAudioChunks.length === 0) {
      if (this.viddone) {
        console.log("No more audio frames to consume");
        return null;
      } else {
        console.log("Waiting for audio frames to be available");
        while (this.cacheAudioChunks.length === 0 && !this.viddone) {
          this.audioFrameLock = 0;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
    }
    const audioFrame = this.cacheAudioChunks.shift();
    if (!audioFrame) {
      console.error("No audio frame available to consume");
      return null;
    }
    return audioFrame;
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
    // this.videoElement && this.videoElement.play();
    while (!this.viddone || this.cacheFrames.length > 0) {
      const frame = this.cacheFrames.shift();
      // console.log(
      //   "Rendering frame",
      //   frameCount,
      //   frame,
      //   this.cacheFrames.length,
      //   frameTime - performance.now()
      // );
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
        // await this.renderAudioFrame(this.cacheAudioFrames.shift()!);
        frameCount++;
        frameTime =
          beginTime +
          (frameCount * 1000 * this.fpsDenominator) / this.fpsNumerator;
      } else {
        // If no frame is available, wait for the next frame time
        while (this.cacheFrames.length === 0 && !this.viddone) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          console.log("Waiting for next frame...");
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

    console.log("Demuxer2 loaded successfully");

    console.log("Audio reader created successfully");
    // const audioConfig = await demux2.getDecoderConfig("audio").catch((er) => {
    //   console.error("Failed to get audio decoder config:", er);
    //   this.onerror && this.onerror(`Failed to get audio decoder config: ${er}`);
    //   return null;
    // });
    const audioConfig = await this.getAudioConfig().catch((er) => {
      console.error("Failed to get audio decoder config:", er);
      this.onerror && this.onerror(`Failed to get audio decoder config: ${er}`);
      return null;
    });

    console.log("Audio config:", JSON.stringify(audioConfig, null, 2));
    const audioMux = new AudioRenderer(this, audioConfig!);
    if (!reader) {
      throw new Error("Failed to get video reader from demuxer");
    }
    // const audioReader = this.demux.read("audio").getReader();
    this.processAudio();
    this.frameTime = performance.now();
    let lockout = 4;
    await audioMux.waitForReady();
    await audioMux.play();
    while (true) {
      // console.log("DEBUG: Loop entered, lockout:", lockout);
      const { done, value } = await reader.read();
      //   .catch((er) => {
      //     console.error("Audio read error:", er);
      //     this.onerror && this.onerror(`Audio read error: ${er}`);
      //     return { done: true, value: null };
      //   });
      if (done) {
        console.log("No more frames to read");
        this.viddone = true;
        break;
      }

      try {
        this.decoder.decode(value);
      } catch (error) {
        this.onerror && this.onerror(`DC error ${error}`);
        this.onerror && this.onerror(this.decoder.state);
      }
      // try {
      //   this.audioDecoder?.decode(audioValue!);
      // } catch (error) {
      //   this.onerror && this.onerror(`AD error ${error}`);
      //   this.onerror && this.onerror(this.audioDecoder?.state || "unknown");
      // }
      // console.log("Decoded video frame", value, this.decoder.state);
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
  async processAudio() {
    const demux2 = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });
    await demux2.load(this.file!);
    const conf = demux2.getDecoderConfig("audio").catch((er) => {
      console.error("Failed to get audio decoder config:", er);
      this.onerror && this.onerror(`Failed to get audio decoder config: ${er}`);
      return null;
    });
    this.getAudioConfig;
    const audioReader = demux2.read("audio", 0, 0).getReader();
    while (true) {
      const { done: audioDone, value: audioValue } = await audioReader.read();
      if (audioDone) {
        console.log("No more audio frames to read");
        break;
      }
      this.recieveAudioFrame(audioValue!);
      while (this.audioFrameLock > 0) {
        // console.log("Waiting for audio frame lock to be released...");
        // Wait until the audio frame lock is released
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  }
}
