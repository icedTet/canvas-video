import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DemuxVideo2 } from "../components/DemuxVideo2";
const LazyDemux = dynamic(() => import("../components/LazyDemux"), {
  ssr: false,
});
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
  const [currentFrameCount, setCurrentFrameCount] = useState(0);
  const [expectedFrameCount, setExpectedFrameCount] = useState(0);
  useEffect(() => {
    if (!fileBlob) return;
    const url = URL.createObjectURL(fileBlob);
    setUrlBlob(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileBlob]);
  // useEffect(() => {
  //   const logDebug = (message: string) => {
  //     setdebug((prev) => `${prev}\n${message}`);
  //   };
  //   // Initialize the canvas and set its dimensions
  //   const canvas = canvasRef.current;
  //   if (!canvas) return;
  //   const ctx = canvas.getContext("2d");
  //   if (!ctx) return;
  //   canvas.width = divRef.current?.clientWidth || 800; // Default width if divRef is not set
  //   canvas.height = divRef.current?.clientHeight || 600; // Default height if divRef is not setz
  //   (async () => {
  //     const fileURL = "lyd.mp4";
  //     const headerInfos = await fetch(fileURL, {
  //       method: "HEAD",
  //       mode: "cors",
  //       credentials: "omit",
  //     });
  //     const fileBlob = await download(
  //       fileURL,
  //       (p) => setprogress(p),
  //       ~~(headerInfos.headers.get("content-length") ?? 0),
  //       fileURL,
  //       headerInfos.headers.get("content-type") || "video/webm"
  //     );
  //     console.log("File downloaded:", fileBlob);
  //     setFileBlob(fileBlob);
  //     const demuxer = new Demuxer();
  //     await demuxer.load(new File([fileBlob], "file"));
  //     const mp4Info = await demuxer.demux.getMediaInfo();
  //     console.log("MP4 Info:", mp4Info);
  //     logDebug(`\nMP4 Info: ${JSON.stringify(mp4Info, null, 2)}`);
  //     let framesPerSecond = 0;
  //     mp4Info.streams
  //       .filter((s) => s.codec_type_string === "video")
  //       .forEach((s) => {
  //         console.log(
  //           `Stream ${s.index}: ${s.codec_type_string} - ${s.codec_name} (${s.width}x${s.height})`
  //         );
  //         console.log(s.codec_string);
  //         framesPerSecond =
  //           Number(s.avg_frame_rate.split("/")[0]) /
  //           Number(s.avg_frame_rate.split("/")[1]);
  //       });
  //     setSourceFPS(framesPerSecond);
  //     const audio = videoRef.current;
  //     console.log(
  //       `Video FPS: ${framesPerSecond}, Audio: ${
  //         audio ? "present" : "not present"
  //       }`
  //     );
  //     await demuxer.setCanvas(canvas);
  //     demuxer.render();
  //     audio?.play();
  //   })();
  // }, []);

  return (
    <div className={`flex flex-col w-full h-full `}>
      <h1>Overkill Demux Page</h1>
      <p>This is the demux page content. v.1.1</p>
      <span className="text-sm text-gray-500">
        FPS: {fps.toFixed(2)} / Source FPS: {sourceFPS.toFixed(2)}; Frame Count:{" "}
        {currentFrameCount} / Expected: {expectedFrameCount}
      </span>
      <span className="text-sm text-gray-500">
        Download Progress: {(progress / (1000 * 1000)).toFixed(2)} MB /{" "}
        {12730330.0 / (1000 * 1000)} MB
      </span>

      {/* <div
        className={`flex w-full grow bg-purple-400 relative`}
        ref={divRef}
        suppressHydrationWarning={true}
      >
        <video
          suppressHydrationWarning={true}
          className="w-full rounded-lg shadow-lg opacity-0 absolute invert-100 hidden"
          controls
          content="true"
          playsInline
          ref={videoRef}
          src={urlBlob || ""}
        >
          Your browser does not support the video tag.
        </video>
        <canvas ref={canvasRef} suppressHydrationWarning={true} />
      </div> */}
      <DemuxVideo2 src={`${globalThis?.location?.origin}/lyd.mp4`} />
      <div className={`flex flex-col`}>
        {debug.split("\n").map((msg) => (
          <span>{msg}</span>
        ))}
      </div>
    </div>
  );
};
export default DemuxRender;
