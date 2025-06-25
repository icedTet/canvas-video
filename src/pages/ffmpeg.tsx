"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { FFmpeg } from "@ffmpeg/ffmpeg";

// Types
interface FFmpegInstance {
  load(): Promise<void>;
  run(...args: string[]): Promise<void>;
  FS(method: string, ...args: any[]): any;
}

interface FFmpegStatic {
  createFFmpeg(options: any): FFmpegInstance;
}

// Dynamic import for FFmpeg (client-side only)
const FFmpegComponent: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationIdRef = useRef<number | null>(null);

  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null);
  const [frames, setFrames] = useState<HTMLImageElement[]>([]);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fps] = useState<number>(30);
  const [duration, setDuration] = useState<number>(0);
  const [progress, setProgress] = useState<string>("Loading FFmpeg...");
  const [controlsEnabled, setControlsEnabled] = useState<boolean>(false);
  const [seekValue, setSeekValue] = useState<number>(0);

  // Initialize FFmpeg
  useEffect(() => {
    const initializeFFmpeg = async () => {
      try {
        // Dynamic import of FFmpeg
        const FFmpegModule = await import("@ffmpeg/ffmpeg");

        const ffmpegInstance = new FFmpeg();

        await ffmpegInstance.load({});
        setFFmpeg(ffmpegInstance);
        setProgress(
          "FFmpeg loaded successfully. Select a video file to start."
        );
        ffmpegInstance.on("log", ({ message }) => {
          console.log(message);
        });
      } catch (error) {
        console.error("Failed to load FFmpeg:", error);
        setProgress("Failed to load FFmpeg. Please refresh the page.");
      }
    };

    initializeFFmpeg();
  }, []);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, []);

  const updateProgress = useCallback((message: string) => {
    setProgress(message);
  }, []);

  const drawFrame = useCallback(
    (frameIndex: number) => {
      const canvas = canvasRef.current;
      if (!canvas || frameIndex < 0 || frameIndex >= frames.length) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frames[frameIndex], 0, 0);
      setCurrentFrame(frameIndex);

      // Update seek bar
      const progress = (frameIndex / (frames.length - 1)) * 100;
      setSeekValue(progress);
    },
    [frames]
  );

  const loadVideo = useCallback(
    async (file: File) => {
      if (!ffmpeg) {
        updateProgress("FFmpeg not loaded yet");
        return;
      }

      updateProgress("Loading video...");
      setControlsEnabled(false);

      try {
        // Convert file to array buffer
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        ffmpeg.writeFile("input.mp4", uint8Array);
        // Extract frames as PNG images
        updateProgress("Extracting frames...");
        console.log("Running FFmpeg to extract frames...");
        await ffmpeg.exec([
          "-i",
          "input.mp4",
          "-vf",
          "fps=30",
          "-f",
          "image2",
          "frame_%04d.png",
        ]);
        console.log("FFmpeg command executed successfully");

        // Get frame files
        const files = await ffmpeg.listDir("/");
        const frameFiles = files
          .filter(
            (file) =>
              file.name.startsWith("frame_") && file.name.endsWith(".png")
          )
          .sort();

        updateProgress(`Loading ${frameFiles.length} frames...`);

        // Load frames as images
        const loadedFrames: HTMLImageElement[] = [];
        for (let i = 0; i < frameFiles.length; i++) {
          console.log(`Loading frame ${i + 1}/${frameFiles.length}`);
          const frameData = (await ffmpeg.readFile(frameFiles[i].name)) as any;
          console.log(`Frame data type: ${typeof frameData}`, frameData);
          // Ensure frameData is a Uint8Array backed by a real ArrayBuffer
          const uint8 = new Uint8Array(frameData.buffer);
          const blob = new Blob([uint8], { type: "image/png" });
          const url = URL.createObjectURL(blob);

          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.src = url;
          });

          loadedFrames.push(img);

          if (i % 10 === 0) {
            updateProgress(`Loading frames: ${i + 1}/${frameFiles.length}`);
          }

          URL.revokeObjectURL(url);
        }

        // Cleanup FFmpeg filesystem
        frameFiles.forEach((file) => {
          try {
            ffmpeg.deleteFile(file.name);
          } catch (e) {
            // Ignore cleanup errors
          }
        });

        try {
          ffmpeg.deleteFile("input.mp4");
        } catch (e) {
          // Ignore cleanup errors
        }

        // Set up canvas and state
        setFrames(loadedFrames);
        if (loadedFrames.length > 0 && canvasRef.current) {
          canvasRef.current.width = loadedFrames[0].width;
          canvasRef.current.height = loadedFrames[0].height;
        }

        const videoDuration = loadedFrames.length / fps;
        setDuration(videoDuration);
        setCurrentFrame(0);
        setControlsEnabled(true);
        updateProgress(
          `Video loaded: ${loadedFrames.length} frames, ${videoDuration.toFixed(
            1
          )}s`
        );

        // Draw first frame
        if (loadedFrames.length > 0) {
          drawFrame(0);
        }
      } catch (error) {
        console.error("Error processing video:", error);
        updateProgress(`Error processing video: ${(error as Error).message}`);
      }
    },
    [ffmpeg, fps, updateProgress, drawFrame]
  );

  const animate = useCallback(() => {
    if (!isPlaying) return;

    const frameInterval = 1000 / fps;
    let lastFrameTime = performance.now();

    const frame = () => {
      if (!isPlaying) return;

      const now = performance.now();
      if (now - lastFrameTime >= frameInterval) {
        setCurrentFrame((prev) => {
          const nextFrame = prev + 1;
          if (nextFrame >= frames.length) {
            return 0; // Loop
          }
          return nextFrame;
        });
        lastFrameTime = now;
      }

      animationIdRef.current = requestAnimationFrame(frame);
    };

    animationIdRef.current = requestAnimationFrame(frame);
  }, [isPlaying, fps, frames.length]);

  // Draw frame when currentFrame changes
  useEffect(() => {
    drawFrame(currentFrame);
  }, [currentFrame, drawFrame]);

  // Start/stop animation based on isPlaying
  useEffect(() => {
    if (isPlaying) {
      animate();
    } else if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
  }, [isPlaying, animate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadVideo(file);
    }
  };

  const handlePlay = () => {
    if (frames.length > 0) {
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentFrame(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const frameIndex = Math.floor((value / 100) * (frames.length - 1));
    setCurrentFrame(frameIndex);
    setSeekValue(value);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const currentTime = currentFrame / fps;

  return (
    <div className="max-w-4xl mx-auto p-5 bg-gray-50 min-h-screen">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">
          FFmpeg WASM Canvas Video Renderer
        </h1>
        <p className="text-gray-600 mb-6">
          Load a video file and render it directly to canvas without using the
          &lt;video&gt; element.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />

        <div className="text-sm text-gray-600 mb-4">{progress}</div>

        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="border-2 border-gray-300 rounded max-w-full bg-black mb-6"
        />

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handlePlay}
            disabled={!controlsEnabled}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Play
          </button>

          <button
            onClick={handlePause}
            disabled={!controlsEnabled}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Pause
          </button>

          <button
            onClick={handleStop}
            disabled={!controlsEnabled}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Stop
          </button>

          <input
            type="range"
            min="0"
            max="100"
            value={seekValue}
            onChange={handleSeek}
            disabled={!controlsEnabled}
            className="flex-1 min-w-48"
          />

          <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};

// Main page component
export const VideoRendererPage: React.FC = () => {
  return <FFmpegComponent />;
};

export default VideoRendererPage;
