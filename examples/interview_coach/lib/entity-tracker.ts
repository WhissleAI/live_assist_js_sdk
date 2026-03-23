import type { GapAnalysis } from "./prep";

export interface EntityMatch {
  skill: string;
  mentioned: boolean;
  mentionCount: number;
  firstMentionSec: number | null;
}

export interface AlignmentState {
  matches: EntityMatch[];
  coveragePercent: number;
  totalMentions: number;
}

const SKILL_SYNONYMS: Record<string, string[]> = {
  react: ["react", "reactjs", "react.js", "jsx", "tsx"],
  typescript: ["typescript", "ts", "type script"],
  javascript: ["javascript", "js", "ecmascript", "es6"],
  python: ["python", "py", "django", "flask", "fastapi"],
  kubernetes: ["kubernetes", "k8s", "kubectl", "helm"],
  docker: ["docker", "container", "containerize", "dockerfile"],
  aws: ["aws", "amazon web services", "ec2", "s3", "lambda", "cloudformation"],
  gcp: ["gcp", "google cloud", "bigquery", "cloud run"],
  sql: ["sql", "mysql", "postgres", "postgresql", "database", "rds"],
  nosql: ["nosql", "mongodb", "dynamodb", "redis", "cassandra"],
  ci_cd: ["ci/cd", "ci cd", "jenkins", "github actions", "gitlab", "pipeline"],
  microservices: ["microservice", "micro service", "service mesh", "api gateway"],
  graphql: ["graphql", "graph ql", "apollo"],
  rest: ["rest", "restful", "rest api", "api"],
  agile: ["agile", "scrum", "sprint", "kanban", "jira"],
  machine_learning: ["machine learning", "ml", "deep learning", "neural network", "ai model"],
  testing: ["testing", "unit test", "integration test", "e2e", "jest", "pytest", "tdd"],
  leadership: ["led", "managed", "mentored", "coached", "ownership", "team lead"],
};

export function createAlignmentTracker(gapAnalysis: GapAnalysis | null): {
  state: AlignmentState;
  processText: (text: string, elapsedSec: number) => AlignmentState;
  processEntities: (entities: Array<{ entity: string; text: string }>, elapsedSec: number) => AlignmentState;
  reset: () => void;
} {
  const skills = gapAnalysis?.skillsMatch?.map((s) => s.skill) ?? [];

  const matches: EntityMatch[] = skills.map((skill) => ({
    skill,
    mentioned: false,
    mentionCount: 0,
    firstMentionSec: null,
  }));

  function computeCoverage(): AlignmentState {
    const mentioned = matches.filter((m) => m.mentioned).length;
    const total = matches.reduce((s, m) => s + m.mentionCount, 0);
    return {
      matches: [...matches],
      coveragePercent: matches.length > 0 ? Math.round((mentioned / matches.length) * 100) : 0,
      totalMentions: total,
    };
  }

  function checkMatch(text: string, elapsedSec: number) {
    const lower = text.toLowerCase();

    for (const match of matches) {
      const skillLower = match.skill.toLowerCase();
      const synonyms = Object.entries(SKILL_SYNONYMS).find(
        ([, syns]) => syns.some((s) => skillLower.includes(s))
      );

      const termsToCheck = synonyms ? synonyms[1] : [skillLower];
      const words = skillLower.split(/\s+/);
      if (words.length <= 2) termsToCheck.push(...words.filter((w) => w.length > 3));

      for (const term of termsToCheck) {
        if (lower.includes(term)) {
          if (!match.mentioned) match.firstMentionSec = elapsedSec;
          match.mentioned = true;
          match.mentionCount++;
          break;
        }
      }
    }
  }

  return {
    get state() { return computeCoverage(); },

    processText(text: string, elapsedSec: number): AlignmentState {
      checkMatch(text, elapsedSec);
      return computeCoverage();
    },

    processEntities(entities: Array<{ entity: string; text: string }>, elapsedSec: number): AlignmentState {
      for (const ent of entities) {
        checkMatch(ent.text, elapsedSec);
      }
      return computeCoverage();
    },

    reset() {
      for (const m of matches) {
        m.mentioned = false;
        m.mentionCount = 0;
        m.firstMentionSec = null;
      }
    },
  };
}
