import { useEffect, useRef } from "react";
import { Demuxer } from "../utils/demux";

export const DemuxRender = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Initialize the canvas and set its dimensions
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = divRef.current?.clientWidth || 800; // Default width if divRef is not set
    canvas.height = divRef.current?.clientHeight || 600; // Default height if divRef is not setz
    (async () => {
      const fileBlob = await fetch("mcad.webm").then((res) => res.blob());
      const demuxer = Demuxer.getInstance().getDemuxer();
      await demuxer.load(new File([fileBlob], "mcad.webm"));
      const audio = videoRef.current;
      const videoDecoderConfig = await demuxer.getDecoderConfig("video");
      const decoder = new VideoDecoder({
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

      decoder.configure(videoDecoderConfig);
      const reader = demuxer.read("video", 0, 0).getReader();
      audio?.play();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("Video stream reading finished");
          break;
        }
        await new Promise((r) => setTimeout(r, 1000 / 30)); // Yield to the event loop
        decoder.decode(value);
      }
    })();
  }, []);

  return (
    <div className={`flex flex-col w-full h-full `}>
      <h1>Demux Page</h1>
      <p>This is the demux page content.</p>
      <div className={`flex w-full grow bg-purple-400`} ref={divRef}>
        <video
          className="w-full rounded-lg shadow-lg"
          loop
          controls
          content="true"
          playsInline
          ref={videoRef}
        >
          <source src="/mcad.webm" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};
export default DemuxRender;
