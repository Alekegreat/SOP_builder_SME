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

    it('allows skipping optional questions with empty string', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;

      // Answer required questions until we find an optional one
      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        const q = INTERVIEW_QUESTIONS[i];
        if (!q.required) {
          const result = answerQuestion(current, q.key, '');
          expect(result.newState.currentQuestionIndex).toBe(i + 1);
          // Skipped question should NOT be in transcript
          expect(result.newState.transcript.find((t) => t.questionKey === q.key)).toBeUndefined();
          break;
        }
        const result = answerQuestion(current, q.key, `Answer ${i}`);
        current = result.newState;
      }
    });

    it('allows skipping optional questions with "skip" keyword', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;

      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        const q = INTERVIEW_QUESTIONS[i];
        if (!q.required) {
          const result = answerQuestion(current, q.key, 'skip');
          expect(result.newState.currentQuestionIndex).toBe(i + 1);
          expect(result.newState.transcript.find((t) => t.questionKey === q.key)).toBeUndefined();
          break;
        }
        current = answerQuestion(current, q.key, `Answer ${i}`).newState;
      }
    });

    it('handles additional_steps question with "done" answer', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;

      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        const q = INTERVIEW_QUESTIONS[i];
        if (q.key === 'additional_steps') {
          const result = answerQuestion(current, q.key, 'done');
          // "done" should skip adding to transcript
          expect(
            result.newState.transcript.find((t) => t.questionKey === 'additional_steps'),
          ).toBeUndefined();
          break;
        }
        current = answerQuestion(current, q.key, `Answer for ${q.key}`).newState;
      }
    });

    it('throws when answering in NOT_STARTED state', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      expect(() => answerQuestion(state, 'purpose', 'answer')).toThrow(
        'Cannot answer in state: NOT_STARTED',
      );
    });

    it('throws when answering in COMPLETED state', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;
      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        current = answerQuestion(current, INTERVIEW_QUESTIONS[i].key, `a ${i}`).newState;
      }
      expect(current.state).toBe('COMPLETED');
      expect(() => answerQuestion(current, 'purpose', 'answer')).toThrow(
        'Cannot answer in state: COMPLETED',
      );
    });

    it('throws when answering in CANCELLED state', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      const cancelled = cancelInterview(newState);
      expect(() => answerQuestion(cancelled, 'purpose', 'answer')).toThrow(
        'Cannot answer in state: CANCELLED',
      );
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
    it('transitions to CANCELLED from IN_PROGRESS', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      const cancelled = cancelInterview(newState);
      expect(cancelled.state).toBe('CANCELLED');
    });

    it('transitions to CANCELLED from NOT_STARTED', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const cancelled = cancelInterview(state);
      expect(cancelled.state).toBe('CANCELLED');
    });

    it('throws if already COMPLETED', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;
      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        const q = INTERVIEW_QUESTIONS[i];
        current = answerQuestion(current, q.key, `Answer ${i}`).newState;
      }
      expect(current.state).toBe('COMPLETED');
      expect(() => cancelInterview(current)).toThrow('Cannot cancel interview in state: COMPLETED');
    });

    it('throws if already CANCELLED', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      const cancelled = cancelInterview(newState);
      expect(() => cancelInterview(cancelled)).toThrow(
        'Cannot cancel interview in state: CANCELLED',
      );
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

    it('throws when resuming from NOT_STARTED', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      expect(() => resumeInterview(state)).toThrow('Cannot resume interview in state: NOT_STARTED');
    });

    it('throws when resuming from COMPLETED', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      let current = startInterview(state).newState;
      for (let i = 0; i < INTERVIEW_QUESTIONS.length; i++) {
        current = answerQuestion(current, INTERVIEW_QUESTIONS[i].key, `a ${i}`).newState;
      }
      expect(() => resumeInterview(current)).toThrow('Cannot resume interview in state: COMPLETED');
    });

    it('throws when resuming from CANCELLED', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      const { newState } = startInterview(state);
      const cancelled = cancelInterview(newState);
      expect(() => resumeInterview(cancelled)).toThrow(
        'Cannot resume interview in state: CANCELLED',
      );
    });
  });

  describe('getProgress', () => {
    it('returns progress percentage', () => {
      const state = createInterviewState(SESSION_ID, SOP_ID);
      expect(getProgress(state).percentage).toBe(0);

      let current = startInterview(state).newState;
      const result = answerQuestion(current, INTERVIEW_QUESTIONS[0].key, 'answer');
      expect(getProgress(result.newState).percentage).toBeCloseTo(
        (1 / INTERVIEW_QUESTIONS.length) * 100,
        0,
      );
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
