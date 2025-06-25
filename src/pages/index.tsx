import { Geist, Geist_Mono } from "next/font/google";
import React, { useEffect } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let rerun = true;
    const drawCallback = ()=>{
      if (!rerun) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawCallback);
    };
    drawCallback();

    return
    

  }, []);
  return (
    <div
      className={`${geistSans.className} ${geistMono.className} grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]`}
    >
      <h1 className="text-4xl sm:text-6xl font-bold text-center">
        Canvas Video Rendering Test!
      </h1>
      <main className="flex flex-col items-center justify-center gap-8">
        <div className="w-full max-w-2xl">
          <video
            className="w-full rounded-lg shadow-lg"
            loop
            controls
            content="true"
            playsInline
            ref={videoRef}
          >
            <source src="/lyd.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
        <p className="text-center text-lg sm:text-xl">
          This is a test of rendering a video using the Canvas API in Next.js.
        </p>
        <canvas
          id="canvas"
          className="w-full max-w-2xl rounded-lg shadow-lg"
          width="1280"
          height="720"
          ref={canvasRef}
        ></canvas>
      </main>
    </div>
  );
}
