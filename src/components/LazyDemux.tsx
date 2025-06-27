"use client";
import { useEffect, useRef, useState } from "react";
import { Demuxer } from "../utils/demux/demux";
import { MovieRenderer } from "../utils/video/MovieRenderer";
import { LazyMovieRenderer } from "../utils/video/LazyMovieRenderer";

export const LazyDemux = (props: { src: string }) => {
  const { src } = props;
  const [vidSRC, setVidSRC] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const muxRef = useRef<LazyMovieRenderer | null>(null);
  useEffect(() => {
    if (!src) {
      console.error("No source provided for LazyDemux");
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const demuxer = new LazyMovieRenderer(src);
    muxRef.current = demuxer;
    demuxer.setCanvas(canvas);
    demuxer.setAudioElement(video);

    demuxer.playWhenReady();
    return ()=>{
      demuxer.stop()
    }
  }, [src]);
  return (
    <div className="flex flex-col w-full grow bg-purple-400/0 relative">
      <div className={`w-auto aspect-video relative`}>
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className={`absolute top-0 left-0 w-full h-full opacity-100`}
        />
        <video
          ref={videoRef}
          className={`absolute top-0 left-0 w-full h-full opacity-0 z-10`}
        ></video>
      </div>
      <div className={`grow bg-blue-300`}></div>
    </div>
  );
};

export default LazyDemux;
