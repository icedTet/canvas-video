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
    this.demux = new WebDemuxer({
      wasmFilePath: `${globalThis.document.location.origin}/dmux/web-demuxer.wasm`,
    });
  }
  getDemuxer() {
    return this.demux;
  }
}
