import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  const [progress, setprogress] = useState(0 as number);
  const [debug, setdebug] = useState("");
  const [currentFrameCount, setCurrentFrameCount] = useState(0);
  const [expectedFrameCount, setExpectedFrameCount] = useState(0);
  const [url, setUrl] = useState(`${globalThis.location?.origin}/mcad.webm`);
  const [enterURL, setEnterURL] = useState("");

  return (
    <div className={`flex flex-col w-full h-full `}>
      <h1>Demux Page</h1>
      <p>This is the demux page content. v.1.1</p>
      <span className="text-sm text-gray-500">
        {/* FPS: {fps.toFixed(2)} / Source FPS: {sourceFPS.toFixed(2)}; Frame Count:{" "}
        {currentFrameCount} / Expected: {expectedFrameCount} */}
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
      <LazyDemux src={enterURL} />
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter video URL"
      />
      <button
        onClick={async () => {
          setEnterURL(url);
          // videoRef.current!.src = URL.createObjectURL(file);
          // videoRef.current!.play();
        }}
      >
        Load Video
      </button>

      <div className={`flex flex-col`}>
        {debug.split("\n").map((msg) => (
          <span>{msg}</span>
        ))}
      </div>
    </div>
  );
};
export default DemuxRender;
