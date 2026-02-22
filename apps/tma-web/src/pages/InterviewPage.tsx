import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { startInterview, answerInterview, generateSop } from '../lib/api.js';
import { INTERVIEW_QUESTIONS } from '@sop/shared';

type InterviewState = 'idle' | 'in-progress' | 'completed';

interface QuestionData {
  key: string;
  question: string;
  required: boolean;
}

export function InterviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<InterviewState>('idle');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const progressPercent = ((questionIndex + 1) / INTERVIEW_QUESTIONS.length) * 100;
  const progressWidthClass =
    progressPercent >= 90
      ? 'w-full'
      : progressPercent >= 75
        ? 'w-4/5'
        : progressPercent >= 60
          ? 'w-3/5'
          : progressPercent >= 40
            ? 'w-2/5'
            : progressPercent >= 20
              ? 'w-1/5'
              : 'w-0';

  const startMutation = useMutation({
    mutationFn: () => startInterview(id!),
    onSuccess: (data) => {
      setState('in-progress');
      if (data.nextQuestion) {
        const q = data.nextQuestion as QuestionData;
        setCurrentQuestion(q);
        setQuestionIndex(0);
      }
    },
  });

  const answerMutation = useMutation({
    mutationFn: (data: { questionKey: string; answer: string }) => answerInterview(id!, data),
    onSuccess: (data) => {
      setAnswer('');
      if (data.isComplete) {
        setState('completed');
      } else if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion as QuestionData);
        setQuestionIndex((i) => i + 1);
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateSop(id!),
    onSuccess: () => {
      navigate(`/sops/${id}`);
    },
  });

  if (state === 'idle') {
    return (
      <div className="p-4">
        <button onClick={() => navigate(-1)} className="text-tg-link text-sm mb-3">
          ← Back
        </button>

        <div className="text-center py-12">
          <span className="text-5xl mb-4 block">📝</span>
          <h1 className="text-xl font-bold mb-2">SOP Interview</h1>
          <p className="text-tg-hint text-sm mb-6 max-w-xs mx-auto">
            I'll ask you {INTERVIEW_QUESTIONS.length} questions to understand your process. Answer
            in natural language — I'll structure it into a professional SOP.
          </p>
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="bg-tg-button text-tg-button-text px-8 py-3 rounded-xl text-base font-medium disabled:opacity-50"
          >
            {startMutation.isPending ? 'Starting...' : 'Start Interview'}
          </button>

          {startMutation.isError && (
            <p className="text-red-500 text-sm mt-3">{(startMutation.error as Error).message}</p>
          )}
        </div>
      </div>
    );
  }

  if (state === 'completed') {
    return (
      <div className="p-4">
        <div className="text-center py-12">
          <span className="text-5xl mb-4 block">✅</span>
          <h1 className="text-xl font-bold mb-2">Interview Complete!</h1>
          <p className="text-tg-hint text-sm mb-6">Ready to generate your SOP with AI.</p>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="bg-tg-button text-tg-button-text px-8 py-3 rounded-xl text-base font-medium disabled:opacity-50"
          >
            {generateMutation.isPending ? '🤖 Generating...' : '🤖 Generate SOP'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col min-h-screen">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-tg-hint mb-1">
          <span>
            Question {questionIndex + 1} of {INTERVIEW_QUESTIONS.length}
          </span>
          <span>{Math.round(((questionIndex + 1) / INTERVIEW_QUESTIONS.length) * 100)}%</span>
        </div>
        <div className="w-full bg-tg-secondary rounded-full h-2">
          <div
            className={`bg-tg-button h-2 rounded-full transition-all duration-300 ${progressWidthClass}`}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-3">{currentQuestion?.question}</h2>
        {!currentQuestion?.required && (
          <p className="text-xs text-tg-hint mb-3">This question is optional — you can skip it.</p>
        )}

        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer..."
          rows={6}
          className="w-full bg-tg-secondary rounded-xl px-4 py-3 text-sm outline-none resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4 pb-4">
        {!currentQuestion?.required && (
          <button
            onClick={() =>
              answerMutation.mutate({
                questionKey: currentQuestion!.key,
                answer: '',
              })
            }
            className="flex-1 bg-tg-secondary rounded-lg py-3 text-sm font-medium"
          >
            Skip
          </button>
        )}
        <button
          onClick={() =>
            answerMutation.mutate({
              questionKey: currentQuestion!.key,
              answer,
            })
          }
          disabled={answerMutation.isPending || (!answer.trim() && currentQuestion?.required)}
          className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-3 text-sm font-medium disabled:opacity-50"
        >
          {answerMutation.isPending ? 'Saving...' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
