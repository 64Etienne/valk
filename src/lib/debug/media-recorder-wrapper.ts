export interface DebugRecording {
  videoBlob: Blob;
  mimeType: string;
  durationMs: number;
}

export class DebugVideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  start(stream: MediaStream): void {
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
    this.recorder = new MediaRecorder(stream, {
      mimeType: mime,
      bitsPerSecond: 2_000_000,
    });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.startedAt = performance.now();
  }

  async stop(): Promise<DebugRecording | null> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return null;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType });
        resolve({
          videoBlob: blob,
          mimeType: rec.mimeType,
          durationMs: performance.now() - this.startedAt,
        });
      };
      rec.stop();
    });
  }
}
