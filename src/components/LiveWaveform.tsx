import { useEffect, useRef } from "react";

interface LiveWaveformProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

export function LiveWaveform({ stream, isRecording }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!stream || !isRecording) return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const audioContext = new AudioCtx();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.78;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let rafId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      analyser.getByteFrequencyData(dataArray);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const barCount = 28;
      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.min(bufferLength - 1, Math.floor((i / barCount) * (bufferLength * 0.75)));
        const value = dataArray[dataIndex] / 255;
        const barHeight = Math.max(4, value * (height - 4));
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = value > 0.12 ? "#DC2626" : "rgba(220, 38, 38, 0.35)";
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-7 w-36 sm:w-48 shrink-0"
    />
  );
}
