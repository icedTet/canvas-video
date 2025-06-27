import { useEffect, useRef, useState } from "react";
import { Demuxer } from "../utils/demux/demux";
import { MovieRenderer } from "../utils/video/MovieRenderer";

export const DemuxVideo2 = (props: { src: string }) => {
  const { src } = props;
  const [vidSRC, setVidSRC] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const muxRef = useRef<MovieRenderer | null>(null);
  useEffect(() => {
    if (!src) {
      console.error("No source provided for DemuxVideo");
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const demuxer = new MovieRenderer(src);
    demuxer.setCanvas(canvas);
    muxRef.current = demuxer;
    demuxer.playWhenReady();
  }, [src]);
  return (
    <div className="flex flex-col w-full grow bg-purple-400/0 relative">
      <video
        ref={videoRef}
        src={vidSRC}
        controls
        className={`opacity-50 absolute top-0 left-0`}
      />
      <div className={`w-auto aspect-video relative`}>
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className={`absolute top-0 left-0 w-full h-full`}
        />
      </div>
      <div className={`grow bg-blue-300`}></div>
      <audio ref={audioRef} className=" w-64 h-8" />
    </div>
  );
};
