import { AVSeekFlag, WebDemuxer } from "web-demuxer";
import { MovieRenderer } from "./MovieRenderer";
import { RingBuffer } from "ringbuf.js";
const DATA_BUFFER_DECODE_TARGET_DURATION = 0.3;
const DATA_BUFFER_DURATION = 0.6;
const DECODER_QUEUE_SIZE_MAX = 5;
const logAudio = true; // Set to true to enable audio logging
export class AudioRenderer {
  parent: MovieRenderer; // Parent MovieRenderer instance
  audioDemuxer: WebDemuxer; // Audio demuxer instance
  audioDecoderConfig: AudioDecoderConfig | null = null; // Audio decoder configuration
  audioDecoder!: AudioDecoder; // Audio decoder instance
  audioContext: AudioContext | null = null; // Audio context for rendering audio frames
  private maxQueuedAudioChunks: number = 3; // Maximum number of audio chunks to queue. After this, audio decoding will pause until the queue has space.
  private queuedChunks: EncodedAudioChunk[] = []; // Queue for audio chunks

  audioReader!: ReadableStreamDefaultReader<EncodedAudioChunk>; // Reader for the audio stream
  sampleRate?: number; // Sample rate for the audio context, initialized to 44100 Hz
  channelCount?: number; // Number of audio channels, initialized to 2 (stereo)
  ringbuffer!: RingBuffer; // Ring buffer for audio data
  interleavingBuffers: Float32Array[] = []; // Buffers for interleaving audio data
  init_resolver!: ((value: void) => void) | null; // Resolver for initialization promise
  ready!: Promise<void>; // Promise that resolves when the audio renderer is ready
  fillInProgress: boolean = false; // Flag indicating if filling the buffer is in progress
  playing: boolean = false; // Flag indicating if audio is currently playing
  audioWorkletNode!: AudioWorkletNode | null; // Audio worklet node for processing audio data
  volumeGainNode!: GainNode;
  loaded: boolean = false; // Whether the audio demuxer has been loaded
  constructor(parent: MovieRenderer) {
    this.parent = parent;
    this.audioDemuxer = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });
  }
  aLog(message: any) {
    if (!logAudio) return; // If logging is disabled, do not log
    this.parent.log(`[AudioRenderer] ${message}`);
  }
  async init() {
    await this.audioDemuxer
      .load(this.parent.file)
      .catch((e) => {
        this.aLog(`Error loading audio demuxer: ${e}`);
      })
      .then((e) => {
        this.aLog("**Audio demuxer loaded successfully**");
      });

    this.aLog("Audio demuxer initialized");
    await this.initAudioContext();
    await this.initAudioDecoder();
    this.aLog("AudioRenderer is ready");
    this.loaded = true;
  }
  async getAudioDecoderConfig(): Promise<AudioDecoderConfig> {
    if (this.audioDecoderConfig) {
      return this.audioDecoderConfig;
    }
    const mediaInfo = await this.parent.getMediaInfo();
    const audioStream = mediaInfo.streams.find(
      (s) => s.codec_type_string === "audio"
    );
    if (!audioStream) {
      throw new Error("No audio stream found in media info");
    }
    this.audioDecoderConfig = {
      codec: audioStream.codec_string,
      sampleRate: audioStream.sample_rate,
      numberOfChannels: audioStream.channels,
      description: audioStream.extradata,
    };
    this.channelCount = audioStream.channels;
    this.sampleRate = audioStream.sample_rate;

    return this.audioDecoderConfig;
  }
  async initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        sampleRate: (await this.getAudioDecoderConfig()).sampleRate,
      });
      this.aLog("Audio context initialized");
    }
    return this.audioContext;
  }
  async initAudioDecoder() {
    const config = await this.getAudioDecoderConfig();
    if (!config) {
      throw new Error("Audio decoder config is not set");
    }
    this.aLog(
      `Initializing audio decoder with config: ${JSON.stringify(config)}`
    );
    this.audioDecoder = new AudioDecoder({
      output: this.bufferAudioData.bind(this),
      error: (e) => console.error(e),
    });
    this.audioDecoder.configure(config);
    this.audioReader = this.audioDemuxer
      .read("audio", 0, 0, AVSeekFlag.AVSEEK_FLAG_ANY)
      .getReader();
    let sampleCountIn500ms =
      DATA_BUFFER_DURATION * config.sampleRate * config.numberOfChannels;
    let sab = RingBuffer.getStorageForCapacity(
      sampleCountIn500ms,
      Float32Array
    );
    this.ringbuffer = new RingBuffer(sab, Float32Array);

    this.interleavingBuffers = [];

    this.init_resolver = null;
    let promise = new Promise((resolver) => (this.init_resolver = resolver));

    this.fillDataBuffer();
    this.ready = promise as Promise<void>;
    await this.setupAudioOutput();
    return ;
  }
  async play() {
    // resolves when audio has effectively started: this can take some time if using
    // bluetooth, for example.
    this.aLog("playback start");
    this.playing = true;
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }
  async pause() {
    this.playing = false;
    if (this.audioContext?.state === "running") {
      await this.audioContext.suspend();
    }
    this.aLog("playback stop");
  }
  async fillDataBuffer() {
    // This method is called from multiple places to ensure the buffer stays
    // healthy. Sometimes these calls may overlap, but at any given point only
    // one call is desired.
    if (this.fillInProgress) return;

    this.fillInProgress = true;
    // This should be this file's ONLY call to the *Internal() variant of this method.
    await this.fillDataBufferInternal();
    this.fillInProgress = false;
  }
  async fillDataBufferInternal() {
    this.aLog(`fillDataBufferInternal()`);

    if (this.audioDecoder.decodeQueueSize >= DECODER_QUEUE_SIZE_MAX) {
      this.aLog("\tdecoder saturated");
      // Some audio decoders are known to delay output until the next input.
      // Make sure the DECODER_QUEUE_SIZE is big enough to avoid stalling on the
      // return below. We're relying on decoder output callback to trigger
      // another call to fillDataBuffer().
      console.assert(DECODER_QUEUE_SIZE_MAX >= 2);
      return;
    }

    let usedBufferElements =
      this.ringbuffer.capacity() - this.ringbuffer.available_write();
    let usedBufferSecs =
      usedBufferElements / (this.channelCount! * this.sampleRate!);
    let pcntOfTarget =
      (100 * usedBufferSecs) / DATA_BUFFER_DECODE_TARGET_DURATION;
    if (usedBufferSecs >= DATA_BUFFER_DECODE_TARGET_DURATION) {
      this.aLog(
        `\taudio buffer full usedBufferSecs: ${usedBufferSecs} pcntOfTarget: ${pcntOfTarget}`
      );

      // When playing, schedule timeout to periodically refill buffer. Don't
      // bother scheduling timeout if decoder already saturated. The output
      // callback will call us back to keep filling.
      if (this.playing)
        // Timeout to arrive when buffer is half empty.
        setTimeout(this.fillDataBuffer.bind(this), (1000 * usedBufferSecs) / 2);

      // Initialize() is done when the buffer fills for the first time.
      if (this.init_resolver) {
        this.init_resolver();
        this.init_resolver = null;
      }

      // Buffer full, so no further work to do now.
      return;
    }

    // Decode up to the buffering target or until decoder is saturated.
    while (
      usedBufferSecs < DATA_BUFFER_DECODE_TARGET_DURATION &&
      this.audioDecoder.decodeQueueSize < DECODER_QUEUE_SIZE_MAX
    ) {
      this.aLog(
        `\tMore samples. usedBufferSecs:${usedBufferSecs} < target:${DATA_BUFFER_DECODE_TARGET_DURATION}.`
      );
      let chunk = await this.consumeAudioFrame();
      if (!chunk) {
        this.aLog("\tNo more audio frames to decode, stopping fillDataBuffer.");
        break;
      }
      this.audioDecoder.decode(chunk);

      // NOTE: awaiting the demuxer.readSample() above will also give the
      // decoder output callbacks a chance to run, so we may see usedBufferSecs
      // increase.
      usedBufferElements =
        this.ringbuffer.capacity() - this.ringbuffer.available_write();
      usedBufferSecs =
        usedBufferElements / (this.channelCount! * this.sampleRate!);
    }

    // if (ENABLE_DEBUG_LOGGING) {
    //   let logPrefix =
    //     usedBufferSecs >= DATA_BUFFER_DECODE_TARGET_DURATION
    //       ? "\tbuffered enough"
    //       : "\tdecoder saturated";
    //   pcntOfTarget =
    //     (100 * usedBufferSecs) / DATA_BUFFER_DECODE_TARGET_DURATION;
    //   this.aLog(
    //     logPrefix +
    //       `; bufferedSecs:${usedBufferSecs} pcntOfTarget: ${pcntOfTarget}`
    //   );
    // }
  }
  bufferHealth() {
    return (
      (1 - this.ringbuffer.availableWrite() / this.ringbuffer.capacity()) * 100
    );
  }

  // From a array of Float32Array containing planar audio data `input`, writes
  // interleaved audio data to `output`. Start the copy at sample
  // `inputOffset`: index of the sample to start the copy from
  // `inputSamplesToCopy`: number of input samples to copy
  // `output`: a Float32Array to write the samples to
  // `outputSampleOffset`: an offset in `output` to start writing
  interleave(
    inputs: Float32Array[],
    inputOffset: number,
    inputSamplesToCopy: number,
    output: Float32Array,
    outputSampleOffset: number
  ) {
    if (inputs.length * inputs[0].length < output.length) {
      throw `not enough space in destination (${
        inputs.length * inputs[0].length
      } < ${output.length}})`;
    }
    let channelCount = inputs.length;
    let outIdx = outputSampleOffset;
    let inputIdx = Math.floor(inputOffset / channelCount);
    var channel = inputOffset % channelCount;
    for (var i = 0; i < inputSamplesToCopy; i++) {
      output[outIdx++] = inputs[channel][inputIdx];
      if (++channel == inputs.length) {
        channel = 0;
        inputIdx++;
      }
    }
  }

  bufferAudioData(data: AudioData) {
    console.log("bufferAudioData() called", {
      numberOfChannels: data.numberOfChannels,
      numberOfFrames: data.numberOfFrames,
      sampleRate: data.sampleRate,
      format: data.format,
    });
    if (this.interleavingBuffers.length != data.numberOfChannels) {
      this.interleavingBuffers = new Array(data.numberOfChannels);
      for (var i = 0; i < this.interleavingBuffers.length; i++) {
        this.interleavingBuffers[i] = new Float32Array(data.numberOfFrames * 2);
      }
    }
    // Simple approach: always copy to f32-planar regardless of original format
    for (var i = 0; i < this.channelCount!; i++) {
      data.copyTo(this.interleavingBuffers[i], {
        planeIndex: i,
        format: "f32-planar",
      });
      console.log(
        `Copied channel ${i} to interleaving buffer, length: ${this.interleavingBuffers[i].length}`
      );
    }

    // Write the data to the ring buffer. Because it wraps around, there is
    // potentially two copyTo to do.
    console.log(
      `Writing ${data.numberOfFrames} frames, ${data.numberOfChannels} channels to ringbuffer`
    );
    let wrote = this.ringbuffer.writeCallback(
      data.numberOfFrames * data.numberOfChannels,
      //@ts-ignore
      (first_part, second_part) => {
        this.interleave(
          this.interleavingBuffers,
          0,
          first_part.length,
          first_part as Float32Array,
          0
        );
        this.interleave(
          this.interleavingBuffers,
          first_part.length,
          second_part.length,
          second_part as Float32Array,
          0
        );
      }
    );
    // FIXME - this could theoretically happen since we're pretty agressive
    // about saturating the decoder without knowing the size of the
    // AudioData.duration vs ring buffer capacity.
    console.assert(
      wrote == data.numberOfChannels * data.numberOfFrames,
      "Buffer full, dropping data!"
    );

    // Logging maxBufferHealth below shows we currently max around 73%, so we're
    // safe from the assert above *for now*. We should add an overflow buffer
    // just to be safe.
    // let bufferHealth = this.bufferHealth();
    // if (!('maxBufferHealth' in this))
    //   this.maxBufferHealth = 0;
    // if (bufferHealth > this.maxBufferHealth) {
    //   this.maxBufferHealth = bufferHealth;
    //   console.log(`new maxBufferHealth:${this.maxBufferHealth}`);
    // }

    // fillDataBuffer() gives up if too much decode work is queued. Keep trying
    // now that we've finished some.
    this.fillDataBuffer();
  }

  async setupAudioOutput(audioContext?: AudioContext) {
    try {
      console.log("Setting up audio output...", this.sampleRate);
      this.audioContext =
        audioContext ||
        new AudioContext({
          sampleRate: this.sampleRate,
          latencyHint: "playback",
        });
      //   this.audioContext.createMediaElementSource(this.demuxer.audioElement!);
      this.audioContext.suspend(); // Start suspended, resume when play() is called.
      //   await this.audioContext.audioWorklet.addModule(
      //     new URL(
      //       "../../../public/dmux/ringbuf.js",
      //       import.meta.url
      //     )
      //   );
      await this.audioContext.audioWorklet.addModule(
        new URL(
          "../../../public/dmux/audio-worklet-processor.worklet.js",
          import.meta.url
        )
      );

      console.log("AudioWorklet module loaded", {
        sampleRate: this.sampleRate,
        channelCount: this.channelCount,
        //@ts-ignore
        sab: this.ringbuffer.buf,
      });
      this.audioWorkletNode = new AudioWorkletNode(
        this.audioContext,
        "AudioSink",
        {
          processorOptions: {
            //@ts-ignore
            sab: this.ringbuffer.buf,
            sampleRate: this.sampleRate,
            mediaChannelCount: this.channelCount,
          },
          outputChannelCount: [this.channelCount!],
        }
      );
      this.volumeGainNode = new GainNode(this.audioContext);
      this.audioWorkletNode
        .connect(this.volumeGainNode)
        .connect(this.audioContext.destination);

      console.log("Audio output setup complete");
    } catch (error) {
      console.error("Failed to setup audio output:", error);
    }
  }
  setVolume(volume: number) {
    if (volume < 0.0 && volume > 1.0) return;

    // Smooth exponential volume ramps on change
    this.volumeGainNode.gain.setTargetAtTime(
      volume,
      this.audioContext?.currentTime || 0,
      0.3
    );
  }
  destroy() {
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async receiveAudioChunk(chunk: EncodedAudioChunk) {
    this.queuedChunks.push(chunk);
    if (this.queuedChunks.length > this.maxQueuedAudioChunks) {
      this.aLog("Max queued audio chunks reached, pausing decoding");
    }
    this.aLog(
      `Received audio chunk, total queued: ${this.queuedChunks.length}`
    );
  }
  async consumeAudioFrame() {
    if (this.queuedChunks.length === 0) {
      console.log("Waiting for audio frames to be available");
      while (this.queuedChunks.length === 0 && true) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    const audioFrame = this.queuedChunks.shift();
    if (!audioFrame) {
      console.error("No audio frame available to consume");
      return null;
    }
    return audioFrame;
  }
  async tickRender() {
    if (this.queuedChunks.length < this.maxQueuedAudioChunks) {
      const { done: audioDone, value: audioValue } =
        await this.audioReader.read();
      if (audioDone) {
        console.log("No more audio frames to read");
        return;
      }
      await this.receiveAudioChunk(audioValue);
    }
  }
}
