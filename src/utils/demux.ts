import { WebDemuxer } from "web-demuxer";

export class Demuxer {
  static instance: Demuxer | null = null;
  demux: WebDemuxer;
  static getInstance() {
    if (!Demuxer.instance) {
      Demuxer.instance = new Demuxer();
    }
    return Demuxer.instance;
  }

  private constructor() {
    // Private constructor to prevent instantiation
    this.demux = new WebDemuxer({
      wasmFilePath: "http://localhost:3001/dmux/web-demuxer.wasm",
    });
  }
  getDemuxer() {
    return this.demux;
  }
}
