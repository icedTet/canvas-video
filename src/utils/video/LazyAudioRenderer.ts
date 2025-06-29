import { LazyMovieRenderer } from "./LazyMovieRenderer";

export class LazyAudioRenderer {
  audioElement: HTMLAudioElement | null = null;
  private parent: LazyMovieRenderer;
  loaded: boolean = false; // Indicates if the audio renderer is ready
  blobURL: string | null = null; // Blob URL for the audio source
  jumpSync: boolean = true; // Whether to sync audio with video playback
  constructor(parent: LazyMovieRenderer) {
    this.parent = parent;
  }
  async loadAudioElement(audioElement: HTMLAudioElement) {
    this.audioElement = audioElement;
    this.parent.log("Audio element set");

    await this.initAudio();
  }
  init() {}
  async initAudio() {
    if (!this.audioElement) {
      throw new Error("Audio element is not set");
    }
    // set the audio element's source and load
    if (this.parent.file instanceof Blob) {
      // If the file is a Blob, create a blob URL
      this.blobURL = URL.createObjectURL(this.parent.file);
      this.audioElement.src = this.blobURL; // Set the blob URL as the source
    } else if (typeof this.parent.file === "string") {
      // If the file is a string (URL or path), set it directly
      this.blobURL = null; // Clear blob URL if not using a Blob
      this.audioElement.src = this.parent.file; // Set the string as the source
    } else {
      throw new Error("Unsupported file type for audio source");
    }
    this.parent.log("Audio source set to: " + this.audioElement.src);
    await this.audioElement.load();
    await new Promise((resolve) => {
      this.audioElement!.addEventListener("canplaythrough", resolve, {
        once: true,
      });
    }); // Wait until the audio can play through
    this.parent.log("Audio element loaded and ready to play");
    this.loaded = true; // Mark the audio renderer as loaded
  }
  play() {
    if (!this.audioElement) {
      throw new Error("Audio element is not set");
    }
    this.audioElement.play().catch((e) => {
      this.parent.log(`Error playing audio: ${e}`);
    });
  }
  pause() {
    if (!this.audioElement) {
      throw new Error("Audio element is not set");
    }
    this.audioElement.pause();
  }
  tickRender() {
    // if (this.jumpSync && this.audioElement && this.loaded) {
    //   // check if audioElement is set
    //   this.jumpSync = false; // Disable jump sync after the first tick
    //   // Sync the audio playback position with the current video position
    //   // this.audioElement.currentTime = performance.now() / 1000 - this.parent.anchorTime / 1000;
    //   this.play();
    // }
    console.log(
      `[LazyAudioRenderer] Current audio time: ${this.audioElement?.currentTime.toFixed(
        5
      )}s`,
      "SUPPOSED TO BE AT",
      this.audioElement!.currentTime * 60
    );
    console.log(this.audioElement?.readyState)
    // const currentTime = this.audioElement?.currentTime || 0;
    // this.parent.currentPosition = currentTime;
  }
  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
      return;
    }

    this.audioElement = null;
    if (this.blobURL) {
      URL.revokeObjectURL(this.blobURL); // Clean up the blob URL if it was created
      this.blobURL = null; // Clear the blob URL reference
    }
    // Clean up resources
    this.parent.log("AudioRenderer stopped and resources cleaned up");
  }
}
