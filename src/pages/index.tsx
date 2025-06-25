import { Geist, Geist_Mono } from "next/font/google";
import Head from "next/head";
import React, { useEffect, useState } from "react";

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
    const drawCallback = () => {
      if (!rerun) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawCallback);
    };
    drawCallback();

    return () => {
      rerun = false;
    };
  }, []);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => prev + 1);
    }, 100);
    var nVer = navigator.appVersion;
    var nAgt = navigator.userAgent;
    var browserName = navigator.appName;
    var fullVersion = "" + parseFloat(navigator.appVersion);
    var majorVersion = parseInt(navigator.appVersion, 10);
    var nameOffset, verOffset, ix;

    // In Opera, the true version is after "OPR" or after "Version"
    if ((verOffset = nAgt.indexOf("OPR")) != -1) {
      browserName = "Opera";
      fullVersion = nAgt.substring(verOffset + 4);
      if ((verOffset = nAgt.indexOf("Version")) != -1)
        fullVersion = nAgt.substring(verOffset + 8);
    }
    // In MS Edge, the true version is after "Edg" in userAgent
    else if ((verOffset = nAgt.indexOf("Edg")) != -1) {
      browserName = "Microsoft Edge";
      fullVersion = nAgt.substring(verOffset + 4);
    }
    // In MSIE, the true version is after "MSIE" in userAgent
    else if ((verOffset = nAgt.indexOf("MSIE")) != -1) {
      browserName = "Microsoft Internet Explorer";
      fullVersion = nAgt.substring(verOffset + 5);
    }
    // In Chrome, the true version is after "Chrome"
    else if ((verOffset = nAgt.indexOf("Chrome")) != -1) {
      browserName = "Chrome";
      fullVersion = nAgt.substring(verOffset + 7);
    }
    // In Safari, the true version is after "Safari" or after "Version"
    else if ((verOffset = nAgt.indexOf("Safari")) != -1) {
      browserName = "Safari";
      fullVersion = nAgt.substring(verOffset + 7);
      if ((verOffset = nAgt.indexOf("Version")) != -1)
        fullVersion = nAgt.substring(verOffset + 8);
    }
    // In Firefox, the true version is after "Firefox"
    else if ((verOffset = nAgt.indexOf("Firefox")) != -1) {
      browserName = "Firefox";
      fullVersion = nAgt.substring(verOffset + 8);
    }
    // In most other browsers, "name/version" is at the end of userAgent
    else if (
      (nameOffset = nAgt.lastIndexOf(" ") + 1) <
      (verOffset = nAgt.lastIndexOf("/"))
    ) {
      browserName = nAgt.substring(nameOffset, verOffset);
      fullVersion = nAgt.substring(verOffset + 1);
      if (browserName.toLowerCase() == browserName.toUpperCase()) {
        browserName = navigator.appName;
      }
    }
    // trim the fullVersion string at semicolon/space if present
    if ((ix = fullVersion.indexOf(";")) != -1)
      fullVersion = fullVersion.substring(0, ix);
    if ((ix = fullVersion.indexOf(" ")) != -1)
      fullVersion = fullVersion.substring(0, ix);

    majorVersion = parseInt("" + fullVersion, 10);
    if (isNaN(majorVersion)) {
      fullVersion = "" + parseFloat(navigator.appVersion);
      majorVersion = parseInt(navigator.appVersion, 10);
    }

    document.write(
      "" +
        "Browser name  = " +
        browserName +
        "<br>" +
        "Full version  = " +
        fullVersion +
        "<br>" +
        "Major version = " +
        majorVersion +
        "<br>" +
        "navigator.appName = " +
        navigator.appName +
        "<br>" +
        "navigator.userAgent = " +
        navigator.userAgent +
        "<br>"
    );
    return () => clearInterval(interval);
  }, []);
  return (
    <>
      <Head>
        <title> Canvas Video Rendering Test {count}</title>
      </Head>
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
    </>
  );
}
