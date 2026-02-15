import { describe, it, expect } from 'vitest';
import {
  createInterviewState,
  startInterview,
  answerQuestion,
  cancelInterview,
  resumeInterview,
  getProgress,
  getAnsweredKeys,
} from '@sop/engine';
import { INTERVIEW_QUESTIONS } from '@sop/shared';

describe('InterviewFSM', () => {
  const SESSION_ID = 'test-session-1';
  const SOP_ID = 'test-sop-1';

  describe('createInterviewState', () => {
    it('creates a NOT_STARTED state', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      expect(state.sessionId).toBe(SESSION_ID);
      expect(state.sopId).toBe(SOP_ID);
      expect(state.state).toBe('NOT_STARTED');
      expect(state.currentQuestionIndex).toBe(0);
      expect(state.transcript).toEqual([]);
    });
  });

  describe('startInterview', () => {
    it('transitions to IN_PROGRESS and returns first question', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const result = startInterview(state);
      expect(result.newState.state).toBe('IN_PROGRESS');
      expect(result.nextQuestion).toBeDefined();
      expect(result.nextQuestion?.key).toBe(INTERVIEW_QUESTIONS[0].key);
    });

    it('throws if already in progress', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      expect(() => startInterview(newState)).toThrow();
    });
  });

  describe('answerQuestion', () => {
    it('records an answer and advances to next question', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      const firstKey = INTERVIEW_QUESTIONS[0].key;

      const result = answerQuestion(newState, firstKey, 'Test answer');
      expect(result.newState.transcript.length).toBe(1);
      expect(result.newState.transcript[0].answer).toBe('Test answer');
      expect(result.newState.currentQuestionIndex).toBe(1);
      expect(result.isComplete).toBe(false);
    });

    it('allows skipping optional questions', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;

      // Answer required questions until we find an optional one
      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        const q = INTERVIEW_QUESTIONS[i];
        if (!q.required) {
          const result = answerQuestion(current, q.key, '');
          expect(result.newState.currentQuestionIndex).toBe(i + 1);
          break;
        }
        const result = answerQuestion(current, q.key, `Answer ${i}`);
        current = result.newState;
      }
    });

    it('completes interview when all questions answered', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;

      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        const q = INTERVIEW_QUESTIONS[i];
        const result = answerQuestion(current, q.key, `Answer for ${q.key}`);
        current = result.newState;

        if (i === INTERVIEW_QUESTIONS.length - 1) {
          expect(result.isComplete).toBe(true);
          expect(current.state).toBe('COMPLETED');
        }
      }
    });

    it('throws if wrong question key provided', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      expect(() => answerQuestion(newState, 'wrong_key', 'answer')).toThrow();
    });
  });

  describe('cancelInterview', () => {
    it('transitions to CANCELLED', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      const cancelled = cancelInterview(newState);
      expect(cancelled.state).toBe('CANCELLED');
    });
  });

  describe('resumeInterview', () => {
    it('resumes from last answered question', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;

      // Answer first 3 questions
      for (let i = 0; i < 3; i++) {
        const q = INTERVIEW_QUESTIONS[i];
        const result = answerQuestion(current, q.key, `Answer ${i}`);
        current = result.newState;
      }

      const resumed = resumeInterview(current);
      expect(resumed.nextQuestion?.key).toBe(INTERVIEW_QUESTIONS[3].key);
    });
  });

  describe('getProgress', () => {
    it('returns progress percentage', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      expect(getProgress(state).percentage).toBe(0);

      let current = startInterview(state).newState;
      const result = answerQuestion(current, INTERVIEW_QUESTIONS[0].key, 'answer');
      expect(getProgress(result.newState).percentage).toBeCloseTo(1 / INTERVIEW_QUESTIONS.length * 100, 0);
    });
  });

  describe('getAnsweredKeys', () => {
    it('returns list of answered question keys', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;

      const result = answerQuestion(current, INTERVIEW_QUESTIONS[0].key, 'answer');
      const keys = getAnsweredKeys(result.newState);
      expect(keys).toContain(INTERVIEW_QUESTIONS[0].key);
    });
  });
});
