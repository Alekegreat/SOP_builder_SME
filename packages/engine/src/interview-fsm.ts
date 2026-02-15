import {
  INTERVIEW_QUESTIONS,
  type InterviewState,
  type InterviewQuestionKey,
} from '@sop/shared';
import type { InterviewTranscriptEntry } from '@sop/shared';

export interface InterviewFSMState {
  sessionId: string;
  sopId: string;
  state: InterviewState;
  currentQuestionIndex: number;
  transcript: InterviewTranscriptEntry[];
}

export interface InterviewFSMResult {
  newState: InterviewFSMState;
  nextQuestion: {
    key: string;
    question: string;
    required: boolean;
  } | null;
  isComplete: boolean;
}

/**
 * Creates a fresh interview FSM state
 */
export function createInterviewState(sessionId: string, sopId: string): InterviewFSMState {
  return {
    sessionId,
    sopId,
    state: 'NOT_STARTED',
    currentQuestionIndex: 0,
    transcript: [],
  };
}

/**
 * Start the interview: transitions from NOT_STARTED → IN_PROGRESS
 */
export function startInterview(state: InterviewFSMState): InterviewFSMResult {
  if (state.state !== 'NOT_STARTED') {
    throw new Error(`Cannot start interview in state: ${state.state}`);
  }

  const newState: InterviewFSMState = {
    ...state,
    state: 'IN_PROGRESS',
    currentQuestionIndex: 0,
  };

  return {
    newState,
    nextQuestion: getQuestionAt(0),
    isComplete: false,
  };
}

/**
 * Process an answer and advance to the next question
 */
export function answerQuestion(
  state: InterviewFSMState,
  questionKey: string,
  answer: string,
): InterviewFSMResult {
  if (state.state !== 'IN_PROGRESS') {
    throw new Error(`Cannot answer in state: ${state.state}`);
  }

  const currentQ = INTERVIEW_QUESTIONS[state.currentQuestionIndex];
  if (!currentQ) {
    throw new Error('No current question available');
  }

  if (currentQ.key !== questionKey) {
    throw new Error(`Expected answer for "${currentQ.key}", got "${questionKey}"`);
  }

  // For 'additional_steps', "done" means skip
  const isSkip =
    !currentQ.required && (answer.toLowerCase().trim() === 'skip' || answer.trim() === '');
  const isDone =
    currentQ.key === 'additional_steps' && answer.toLowerCase().trim() === 'done';

  const newTranscript: InterviewTranscriptEntry[] = [
    ...state.transcript,
    ...(isSkip || isDone
      ? []
      : [
          {
            questionKey: currentQ.key,
            question: currentQ.question,
            answer,
            answeredAt: new Date().toISOString(),
          },
        ]),
  ];

  const nextIndex = state.currentQuestionIndex + 1;
  const isComplete = nextIndex >= INTERVIEW_QUESTIONS.length;

  const newState: InterviewFSMState = {
    ...state,
    currentQuestionIndex: isComplete ? state.currentQuestionIndex : nextIndex,
    transcript: newTranscript,
    state: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
  };

  return {
    newState,
    nextQuestion: isComplete ? null : getQuestionAt(nextIndex),
    isComplete,
  };
}

/**
 * Cancel the interview
 */
export function cancelInterview(state: InterviewFSMState): InterviewFSMState {
  if (state.state === 'COMPLETED' || state.state === 'CANCELLED') {
    throw new Error(`Cannot cancel interview in state: ${state.state}`);
  }
  return { ...state, state: 'CANCELLED' };
}

/**
 * Resume an in-progress interview (re-derive next question)
 */
export function resumeInterview(state: InterviewFSMState): InterviewFSMResult {
  if (state.state !== 'IN_PROGRESS') {
    throw new Error(`Cannot resume interview in state: ${state.state}`);
  }

  return {
    newState: state,
    nextQuestion: getQuestionAt(state.currentQuestionIndex),
    isComplete: false,
  };
}

/**
 * Get the current progress (answered / total)
 */
export function getProgress(state: InterviewFSMState): {
  answered: number;
  total: number;
  percentage: number;
} {
  const total = INTERVIEW_QUESTIONS.length;
  const answered = state.currentQuestionIndex;
  return {
    answered,
    total,
    percentage: Math.round((answered / total) * 100),
  };
}

function getQuestionAt(index: number): { key: string; question: string; required: boolean } | null {
  const q = INTERVIEW_QUESTIONS[index];
  if (!q) return null;
  return { key: q.key, question: q.question, required: q.required };
}

/**
 * Get all answered question keys
 */
export function getAnsweredKeys(state: InterviewFSMState): InterviewQuestionKey[] {
  return state.transcript.map((t) => t.questionKey as InterviewQuestionKey);
}
