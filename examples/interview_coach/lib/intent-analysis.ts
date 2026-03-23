export type IntentPattern = "assertive" | "passive" | "hedging" | "balanced";

export interface IntentAnalysis {
  pattern: IntentPattern;
  informRatio: number;
  questionRatio: number;
  acknowledgeRatio: number;
  dominantShift: string | null;
}

interface IntentSnapshot {
  timestamp: number;
  probs: Record<string, number>;
  topIntent: string;
}

export class IntentFlowTracker {
  private snapshots: IntentSnapshot[] = [];
  private intentCounts: Record<string, number> = {};
  private total = 0;

  update(probs: Array<{ token: string; probability: number }>): void {
    const probMap: Record<string, number> = {};
    let topIntent = "";
    let topProb = 0;

    for (const { token, probability } of probs) {
      const key = token.toUpperCase().trim();
      probMap[key] = probability;
      if (probability > topProb) {
        topProb = probability;
        topIntent = key;
      }
    }

    this.snapshots.push({ timestamp: Date.now(), probs: probMap, topIntent });
    this.intentCounts[topIntent] = (this.intentCounts[topIntent] ?? 0) + 1;
    this.total++;
  }

  analyze(): IntentAnalysis {
    if (this.total === 0) {
      return { pattern: "balanced", informRatio: 0, questionRatio: 0, acknowledgeRatio: 0, dominantShift: null };
    }

    const informCount = (this.intentCounts["INFORM"] ?? 0) + (this.intentCounts["STATEMENT"] ?? 0) + (this.intentCounts["COMMAND"] ?? 0);
    const questionCount = this.intentCounts["QUESTION"] ?? 0;
    const ackCount = this.intentCounts["ACKNOWLEDGE"] ?? 0;

    const informRatio = informCount / this.total;
    const questionRatio = questionCount / this.total;
    const acknowledgeRatio = ackCount / this.total;

    let pattern: IntentPattern = "balanced";
    if (informRatio > 0.6) pattern = "assertive";
    else if (acknowledgeRatio > 0.4) pattern = "passive";
    else if (questionRatio > 0.3) pattern = "hedging";

    const dominantShift = this.detectShift();

    return { pattern, informRatio, questionRatio, acknowledgeRatio, dominantShift };
  }

  private detectShift(): string | null {
    if (this.snapshots.length < 6) return null;

    const mid = Math.floor(this.snapshots.length / 2);
    const firstHalf = this.snapshots.slice(0, mid);
    const secondHalf = this.snapshots.slice(mid);

    const firstPattern = this.halfPattern(firstHalf);
    const secondPattern = this.halfPattern(secondHalf);

    if (firstPattern !== secondPattern) {
      return `${firstPattern} → ${secondPattern}`;
    }
    return null;
  }

  private halfPattern(snapshots: IntentSnapshot[]): string {
    const counts: Record<string, number> = {};
    for (const s of snapshots) {
      counts[s.topIntent] = (counts[s.topIntent] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const top = sorted[0]?.[0] ?? "NEUTRAL";
    if (top === "INFORM" || top === "STATEMENT" || top === "COMMAND") return "assertive";
    if (top === "ACKNOWLEDGE") return "passive";
    if (top === "QUESTION") return "questioning";
    return "mixed";
  }

  get isHedging(): boolean {
    if (this.total < 3) return false;
    const questionCount = this.intentCounts["QUESTION"] ?? 0;
    return questionCount / this.total > 0.25;
  }

  get isPassive(): boolean {
    if (this.total < 3) return false;
    const ackCount = this.intentCounts["ACKNOWLEDGE"] ?? 0;
    return ackCount / this.total > 0.35;
  }

  reset(): void {
    this.snapshots = [];
    this.intentCounts = {};
    this.total = 0;
  }
}
