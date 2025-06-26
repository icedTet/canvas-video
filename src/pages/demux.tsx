import { useEffect, useRef, useState } from "react";
import { Demuxer } from "../utils/demux";
async function download(
  url: string,
  setFileProgress: (progress: number) => void,
  size: number,
  fileName: string,
  contentType: string
) {
  const file = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
  });
  const reader = file.body?.getReader();
  let receivedLength = 0;
  const chunks = [];
  while (reader) {
    // done is true for the last chunk
    // value is Uint8Array of the chunk bytes
    const { done, value } = await reader.read();
    if (done) {
      //   console.log('done', attachment.title))
      break;
    }
    if (!value?.length) continue;
    chunks.push(value);
    receivedLength += value.length;
    setFileProgress(receivedLength);
    // console.log(`Received ${value.length} bytes`)
  }
  // console.log('combining', chunks.length)
  let chunksAll = new Uint8Array(receivedLength); // (4.1)
  let position = 0;
  for (let chunk of chunks) {
    chunksAll.set(chunk, position); // (4.2)
    position += chunk.length;
  }
  //   console.log('combined', chunksAll.length))
  return new File([chunksAll], fileName || "downloaded_file", {
    type: contentType,
  });
}
export const DemuxRender = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [fileBlob, setFileBlob] = useState(null as Blob | null);
  const [fps, setFps] = useState(0);
  const [sourceFPS, setSourceFPS] = useState(0);
  const [urlBlob, setUrlBlob] = useState(null as string | null);
  const [progress, setprogress] = useState(0 as number);
  const [debug, setdebug] = useState("");
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
      const fileURL = "nightmare.mp4"; // Replace with your file URL
      const headerInfos = await fetch(fileURL, {
        method: "HEAD",
        mode: "cors",
        credentials: "omit",
      });
      const fileBlob = await download(
        fileURL,
        (p) => setprogress(p),
        ~~(headerInfos.headers.get("content-length") ?? 0),
        fileURL,
        headerInfos.headers.get("content-type") || "video/webm"
      );
      console.log("File downloaded:", fileBlob);
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
      setdebug((debug) => `${debug}\nFinding video decoder config...`);
      const ogDecoderConfig = await demuxer.getDecoderConfig("video");
      const videoDecoderConfig = {
        codec: ogDecoderConfig.codec,
        width: 1920,
        height: 1080,
        displayWidth: 1920,
        displayHeight: 1080,
        description: ogDecoderConfig.description,
        avc: { format: "annexb" },
      } as VideoDecoderConfig;
      setdebug(
        (debug) =>
          `${debug}\nVideo decoder config: ${JSON.stringify(
            videoDecoderConfig
          )}`
      );
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
      setdebug((debug) => `${debug}\nConfiguring video decoder...`);

      decoder.configure(videoDecoderConfig);

      //   const audioDecoderConfig = await demuxer.getDecoderConfig("audio");
      //   const audioDecoder = new AudioDecoder({
      //     output: (audioFrame) => {
      //       // Handle audio frame output if needed
      //       // For now, we just log the audio frame
      //       console.log("Audio frame received:", audioFrame);
      //       audioFrame.close();
      //     },
      //     error: (e) => {
      //       console.error("audio decoder error:", e);
      //     },
      //   });

      const reader = demuxer.read("video", 0, 0).getReader();
      audio?.play();
      let frameCount = 0;
      let lastTime = performance.now();

      setdebug((debug) => `${debug}\nStarting video stream reading...`);
      while (true) {
        const startTime = performance.now();
        // Read the next chunk of video data
        setdebug((debug) => `${debug}\nReading next video chunk...`);
        // console.log("Reading next
        const { done, value } = await reader.read();
        if (value) {
          setdebug(
            (debug) => `${debug}\nRead ${value.byteLength} bytes of video data`
          );
        } else {
          setdebug((debug) => `${debug}\nNo more video data to read`);
        }
        if (done) {
          console.log("Video stream reading finished");
          break;
        }
        try {
          decoder.decode(value);
        } catch (error) {
          setdebug((debug) => `${debug}\nError decoding video frame: ${error}`);
        }

        setdebug((debug) => `${debug}\nDecoded video frame`);
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
        setdebug(
          (debug) =>
            `${debug}\nWaiting for next frame: ${calculatedWaitTillNextFrame} ms`
        );
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
        setdebug((debug) => `${debug}\nFrame ${frameCount} processed`);
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
      <span className="text-sm text-gray-500">
        FPS: {fps.toFixed(2)} / Source FPS: {sourceFPS.toFixed(2)}
      </span>
      <span className="text-sm text-gray-500">
        Download Progress: {(progress / (1000 * 1000)).toFixed(2)} MB /{" "}
        {12730330.0 / (1000 * 1000)} MB
      </span>

      <div className={`flex w-full grow bg-purple-400 relative`} ref={divRef}>
        <video
          className="w-full rounded-lg shadow-lg opacity-50 absolute "
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
      <p>{debug}</p>
    </div>
  );
};
export default DemuxRender;
