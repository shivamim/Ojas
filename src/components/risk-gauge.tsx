"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RiskGaugeProps {
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  className?: string;
  size?: number;
}

const LEVEL_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
  CRITICAL: "#dc2626",
};

const LEVEL_LABELS: Record<string, string> = {
  LOW: "Low Risk",
  MEDIUM: "Medium Risk",
  HIGH: "High Risk",
  CRITICAL: "Critical Risk",
};

export function RiskGauge({ score, level, className, size = 160 }: RiskGaugeProps) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, score));
  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = size / 2 - 16;
  const strokeW = 10;
  const startAngle = Math.PI;
  const endAngle = 0;
  const needleLen = radius - 15;
  const bgColor = LEVEL_COLORS[level] || LEVEL_COLORS.LOW;
  const bgStartX = cx + radius * Math.cos(startAngle);
  const bgStartY = cy - radius * Math.sin(startAngle);
  const bgEndX = cx + radius * Math.cos(endAngle);
  const bgEndY = cy - radius * Math.sin(endAngle);

  const activeAngle = startAngle - (clamped / 100) * Math.PI;
  const activeEndX = cx + radius * Math.cos(activeAngle);
  const activeEndY = cy - radius * Math.sin(activeAngle);
  const largeArc = clamped > 50 ? 1 : 0;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Background arc */}
        <path
          d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${bgEndX} ${bgEndY}`}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id={`gauge-grad-${level}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <path
          d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${bgEndX} ${bgEndY}`}
          fill="none"
          stroke={`url(#gauge-grad-${level})`}
          strokeWidth={strokeW}
          strokeLinecap="round"
          opacity={0.25}
        />
        {clamped > 0 && (
          <motion.path
            d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 ${largeArc} 1 ${activeEndX} ${activeEndY}`}
            fill="none"
            stroke={bgColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            initial={reduce ? { opacity: 1 } : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
          />
        )}
        <motion.g
          initial={reduce ? { rotate: 0 } : { rotate: -90 }}
          animate={{ rotate: -(clamped / 100) * 180 }}
          transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <line x1={cx} y1={cy} x2={cx + needleLen} y2={cy} stroke={bgColor} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={cx + needleLen} cy={cy} r={4} fill={bgColor} />
        </motion.g>
        <circle cx={cx} cy={cy} r={5} fill={bgColor} opacity={0.3} />
        <circle cx={cx} cy={cy} r={3} fill={bgColor} />
      </svg>
      <div className="-mt-3 text-center">
        <motion.span
          className={cn(
            "text-3xl font-bold tabular-nums",
            level === "CRITICAL" ? "text-destructive" : level === "HIGH" ? "text-red-500" : level === "MEDIUM" ? "text-amber-500" : "text-emerald-500"
          )}
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {clamped}
        </motion.span>
        <motion.p
          className="text-xs text-muted-foreground font-medium mt-0.5"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.8 }}
        >
          {LEVEL_LABELS[level]}
        </motion.p>
      </div>
    </div>
  );
}