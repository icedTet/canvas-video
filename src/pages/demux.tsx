import { useEffect, useRef, useState } from "react";
import { Demuxer } from "../utils/demux";

export const DemuxRender = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [fileBlob, setFileBlob] = useState(null as Blob | null);
  const [fps, setFps] = useState(0);
  const [sourceFPS, setSourceFPS] = useState(0);
  const [urlBlob, setUrlBlob] = useState(null as string | null);
  useEffect(() => {
    if (!fileBlob) return;
    const url = URL.createObjectURL(fileBlob);
    setUrlBlob(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileBlob]);
  useEffect(() => {
    // Initialize the canvas and set its dimensions
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = divRef.current?.clientWidth || 800; // Default width if divRef is not set
    canvas.height = divRef.current?.clientHeight || 600; // Default height if divRef is not setz
    (async () => {
      const fileBlob = await fetch("nightmare.mp4").then((res) => res.blob());
      setFileBlob(fileBlob);
      const demuxer = Demuxer.getInstance().getDemuxer();
      await demuxer.load(new File([fileBlob], "nightmare.mp4"));
      const mp4Info = await demuxer.getMediaInfo();
      console.log("MP4 Info:", mp4Info);
      let framesPerSecond = 0;
      mp4Info.streams
        .filter((s) => s.codec_type_string === "video")
        .forEach((s) => {
          console.log(
            `Stream ${s.index}: ${s.codec_type_string} - ${s.codec_name} (${s.width}x${s.height})`
          );
          framesPerSecond =
            Number(s.avg_frame_rate.split("/")[0]) /
            Number(s.avg_frame_rate.split("/")[1]);
        });
        setSourceFPS(framesPerSecond);
      const audio = videoRef.current;
      console.log(
        `Video FPS: ${framesPerSecond}, Audio: ${
          audio ? "present" : "not present"
        }`
      );
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

      const audioDecoderConfig = await demuxer.getDecoderConfig("audio");
      const audioDecoder = new AudioDecoder({
        output: (audioFrame) => {
          // Handle audio frame output if needed
          // For now, we just log the audio frame
          console.log("Audio frame received:", audioFrame);
          audioFrame.close();
        },
        error: (e) => {
          console.error("audio decoder error:", e);
        },
      });

      const reader = demuxer.read("video", 0, 0).getReader();
      audio?.play();
      let frameCount = 0;
      let lastTime = performance.now();

      while (true) {
        const startTime = performance.now();
        const { done, value } = await reader.read();
        if (done) {
          console.log("Video stream reading finished");
          break;
        }
        decoder.decode(value);
        // figure out the correct wait time to maintain the FPS
        // if the current time is less than the start time, we need to wait
        const whereWeAreSupposedToBe =
          (frameCount + 1) * (1000 / framesPerSecond) + lastTime;
        const whereWeAreRightNow = performance.now();
        const calculatedWaitTillNextFrame =
          whereWeAreSupposedToBe - whereWeAreRightNow;

        // console.log(
        //   "Waiting for next frame:",
        //   calculatedWaitTillNextFrame,
        //   "ms"
        // );
        if (calculatedWaitTillNextFrame > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, calculatedWaitTillNextFrame)
          );
        }

        // if (currentTime - lastTime >= 1000) {
        //   setFps(frameCount / ((currentTime - lastTime) / 1000));
        //   lastTime = currentTime;
        //   frameCount = 0;
        // }

        frameCount++;
        if (frameCount % 60 === 0) {
          console.log(
            `Decoded 60 frames, within ${performance.now() - lastTime} ms`
          );
          console.log(
            "Our FPS:",
            frameCount / ((performance.now() - lastTime) / 1000)
          );
          setFps(frameCount / ((performance.now() - lastTime) / 1000));
          lastTime = performance.now();
          frameCount = 0;
        }
      }
    })();
  }, []);

  return (
    <div className={`flex flex-col w-full h-full `}>
      <h1>Demux Page</h1>
      <p>This is the demux page content.</p>
      <span className="text-sm text-gray-500">FPS: {fps.toFixed(2)} / Source FPS: {sourceFPS.toFixed(2)}</span>
      <div className={`flex w-full grow bg-purple-400 relative`} ref={divRef}>
        <video
          className="w-full rounded-lg shadow-lg opacity-50 absolute hue-rotate-90"
          controls
          content="true"
          playsInline
          ref={videoRef}
          src={urlBlob || ""}
        >
          Your browser does not support the video tag.
        </video>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};
export default DemuxRender;
