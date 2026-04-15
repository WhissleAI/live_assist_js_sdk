import React, { useRef, useEffect, useCallback } from "react";
import { getEmotionRgb, lerpRgb } from "../lib/emotion-palettes";
import type { TurnState } from "../hooks/useVoiceAgent";

interface Props {
  analyser: AnalyserNode | null;
  turn: TurnState;
  emotion: string;
  agentName: string;
  isProcessing: boolean;
}

const SIZE = 320;
const CENTER = SIZE / 2;
const BASE_RADIUS = 80;
const NUM_POINTS = 128;
const TWO_PI = Math.PI * 2;

export default function VoiceOrb({ analyser, turn, emotion, agentName, isProcessing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const prevColorRef = useRef<[number, number, number]>(getEmotionRgb("NEUTRAL"));
  const currentColorRef = useRef<[number, number, number]>(getEmotionRgb("NEUTRAL"));
  const colorTransitionRef = useRef(0);
  const targetEmotionRef = useRef(emotion);
  const phaseRef = useRef(0);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const turnRef = useRef(turn);
  const isProcessingRef = useRef(isProcessing);
  turnRef.current = turn;
  isProcessingRef.current = isProcessing;

  useEffect(() => {
    if (emotion !== targetEmotionRef.current) {
      prevColorRef.current = [...currentColorRef.current];
      targetEmotionRef.current = emotion;
      colorTransitionRef.current = 0;
    }
  }, [emotion]);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== SIZE * dpr || canvas.height !== SIZE * dpr) {
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Smooth color transition
    if (colorTransitionRef.current < 1) {
      colorTransitionRef.current = Math.min(1, colorTransitionRef.current + 0.015);
    }
    const targetRgb = getEmotionRgb(targetEmotionRef.current);
    currentColorRef.current = lerpRgb(prevColorRef.current, targetRgb, colorTransitionRef.current);
    const [r, g, b] = currentColorRef.current;

    // Get audio amplitude
    let amplitude = 0;
    let bassEnergy = 0;
    let midEnergy = 0;
    if (analyser) {
      if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) {
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(freqDataRef.current);
      const data = freqDataRef.current;
      let sum = 0;
      const binCount = data.length;
      const bassEnd = Math.floor(binCount * 0.15);
      const midEnd = Math.floor(binCount * 0.5);
      let bassSum = 0;
      let midSum = 0;
      for (let i = 0; i < binCount; i++) {
        sum += data[i];
        if (i < bassEnd) bassSum += data[i];
        else if (i < midEnd) midSum += data[i];
      }
      amplitude = sum / (binCount * 255);
      bassEnergy = bassSum / (bassEnd * 255);
      midEnergy = midSum / ((midEnd - bassEnd) * 255);
    }

    phaseRef.current += 0.02;
    const t = phaseRef.current;

    // Breathing rate depends on state
    let breathSpeed = 0.8;
    let breathAmp = 4;
    let noiseAmp = 0;
    let glowIntensity = 0.15;

    const curTurn = turnRef.current;
    const curProcessing = isProcessingRef.current;

    if (curTurn === "agent" && !curProcessing) {
      // Speaking: orb reacts to audio
      breathSpeed = 1.2;
      breathAmp = 2;
      noiseAmp = amplitude * 35;
      glowIntensity = 0.2 + amplitude * 0.4;
    } else if (curProcessing) {
      // Thinking: gentle shimmer
      breathSpeed = 0.4;
      breathAmp = 6;
      noiseAmp = 2;
      glowIntensity = 0.12;
    } else if (curTurn === "user") {
      // Listening: contracted, subtle
      breathSpeed = 0.6;
      breathAmp = 3;
      noiseAmp = 1;
      glowIntensity = 0.1;
    }

    const breath = Math.sin(t * breathSpeed) * breathAmp;
    const baseR = curTurn === "user" ? BASE_RADIUS - 10 : BASE_RADIUS;
    const radius = baseR + breath;

    // Outer glow
    const glowGrad = ctx.createRadialGradient(CENTER, CENTER, radius * 0.5, CENTER, CENTER, radius * 2.2);
    glowGrad.addColorStop(0, `rgba(${r},${g},${b},${glowIntensity})`);
    glowGrad.addColorStop(0.5, `rgba(${r},${g},${b},${glowIntensity * 0.4})`);
    glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Draw deformed orb
    ctx.beginPath();
    for (let i = 0; i <= NUM_POINTS; i++) {
      const angle = (i / NUM_POINTS) * TWO_PI;

      // Multi-frequency noise for organic shape
      const n1 = Math.sin(angle * 3 + t * 1.5) * noiseAmp * 0.5;
      const n2 = Math.sin(angle * 5 + t * 2.3) * noiseAmp * 0.3;
      const n3 = Math.sin(angle * 7 + t * 0.7) * noiseAmp * 0.2;
      const bassDeform = Math.sin(angle * 2 + t) * bassEnergy * 15;
      const midDeform = Math.cos(angle * 4 + t * 1.8) * midEnergy * 8;

      const r2 = radius + n1 + n2 + n3 + bassDeform + midDeform;
      const x = CENTER + Math.cos(angle) * r2;
      const y = CENTER + Math.sin(angle) * r2;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Fill with gradient
    const orbGrad = ctx.createRadialGradient(
      CENTER - radius * 0.3, CENTER - radius * 0.3, radius * 0.1,
      CENTER, CENTER, radius * 1.2,
    );
    orbGrad.addColorStop(0, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},0.9)`);
    orbGrad.addColorStop(0.5, `rgba(${r},${g},${b},0.75)`);
    orbGrad.addColorStop(1, `rgba(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)},0.5)`);
    ctx.fillStyle = orbGrad;
    ctx.fill();

    // Inner highlight
    const highlightGrad = ctx.createRadialGradient(
      CENTER - radius * 0.25, CENTER - radius * 0.25, 0,
      CENTER - radius * 0.15, CENTER - radius * 0.15, radius * 0.6,
    );
    highlightGrad.addColorStop(0, "rgba(255,255,255,0.35)");
    highlightGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = highlightGrad;
    ctx.fill();

    // Pulsing ring when speaking
    if (curTurn === "agent" && amplitude > 0.05) {
      const ringRadius = radius + 10 + amplitude * 20;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, ringRadius, 0, TWO_PI);
      ctx.strokeStyle = `rgba(${r},${g},${b},${amplitude * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [analyser]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  const statusLabel = isProcessing
    ? "Thinking..."
    : turn === "user"
      ? "Listening..."
      : turn === "agent"
        ? "Speaking"
        : "";

  return (
    <div className="voice-orb-container">
      <canvas
        ref={canvasRef}
        className="voice-orb-canvas"
        style={{ width: SIZE, height: SIZE }}
      />
      <div className="voice-orb-label">{agentName}</div>
      {statusLabel && <div className="voice-orb-status">{statusLabel}</div>}
    </div>
  );
}
