export type Verdict = "pass" | "fail" | "inconclusive";

export interface Submission {
  id: string;
  queue_id: string;
  labeling_task_id: string;
  created_at: string;
  raw_json: SubmissionJson;
}

export interface SubmissionJson {
  id: string;
  queueId: string;
  labelingTaskId: string;
  createdAt: number;
  questions: SubmissionQuestion[];
  answers: Record<string, SubmissionAnswer>;
}

export interface SubmissionQuestion {
  rev: number;
  data: {
    id: string;
    questionType: string;
    questionText: string;
  };
}

export interface SubmissionAnswer {
  choice?: string;
  reasoning?: string;
  [key: string]: unknown;
}

export interface Judge {
  id: string;
  name: string;
  system_prompt: string;
  model_name: string;
  active: boolean;
  created_at: string;
}

export interface JudgeAssignment {
  id: string;
  question_id: string;
  judge_id: string;
  queue_id: string;
  created_at: string;
}

export interface Evaluation {
  id: string;
  submission_id: string;
  question_id: string;
  judge_id: string;
  verdict: Verdict;
  reasoning: string;
  created_at: string;
}
